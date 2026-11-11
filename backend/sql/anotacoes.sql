--QUERY: inserir
-- Com tarefa_id (escrito dentro da tarefa) já nasce organizada: nunca passa pelo LLM. Sem, nasce `nova`.
INSERT INTO anotacoes (texto, texto_normalizado, tarefa_id, status, organizada_em)
VALUES (%(texto)s, %(normalizado)s, %(tarefa_id)s,
        CASE WHEN %(tarefa_id)s::int IS NULL THEN 'nova' ELSE 'organizada' END,
        CASE WHEN %(tarefa_id)s::int IS NULL THEN NULL ELSE now() END)
RETURNING id, texto, tarefa_id, status, recebida_em, lida_em, organizada_em;

--QUERY: contar_por_status
-- O "3 esperando" do painel (novas) e os que falharam (só voltam se o chefe pedir).
SELECT count(*) FILTER (WHERE status = 'nova') AS novas,
       count(*) FILTER (WHERE status = 'aguardando_voce') AS aguardando_voce,
       count(*) FILTER (WHERE status = 'falhou') AS falhas
FROM anotacoes;

--QUERY: listar_da_tarefa
SELECT id, texto, status, recebida_em
FROM anotacoes
WHERE tarefa_id = %s
ORDER BY recebida_em DESC, id DESC
LIMIT %s;

--QUERY: existe_nova
-- A checagem do tick: uma consulta no índice parcial, nenhuma chamada de LLM.
SELECT EXISTS (SELECT 1 FROM anotacoes WHERE status = 'nova') AS existe;

--QUERY: recuperar_travadas
-- Leitura que caiu no meio (processo morreu entre pegar e gravar) não pode prender o texto em `lendo` para sempre.
-- Vai para `falhou`, não para `nova`: voltar sozinho para a fila seria retentativa automática (gasto escondido).
UPDATE anotacoes
SET status = 'falhou', erro = 'A leitura foi interrompida antes de terminar. Peça para tentar de novo.'
WHERE status = 'lendo' AND lida_em < now() - make_interval(mins => %s)
RETURNING id;

--QUERY: pegar_lote
-- Pega e marca `lendo` no mesmo comando. SKIP LOCKED: se o tick e o botão rodarem juntos, cada texto vai para um
-- só (nunca é lido nem cobrado duas vezes). O teto de caracteres conta em ordem de chegada; o primeiro sempre
-- entra, mesmo grande (senão um texto enorme travaria a fila para sempre).
WITH candidatos AS (
    SELECT id, recebida_em, length(texto) AS tamanho
    FROM anotacoes
    WHERE status = 'nova'
    ORDER BY recebida_em, id
    LIMIT %(limite)s
    FOR UPDATE SKIP LOCKED
), acumulado AS (
    SELECT id, sum(tamanho) OVER (ORDER BY recebida_em, id) AS total,
           row_number() OVER (ORDER BY recebida_em, id) AS posicao
    FROM candidatos
)
UPDATE anotacoes a
SET status = 'lendo', lida_em = now(), erro = NULL
FROM acumulado c
WHERE a.id = c.id AND (c.posicao = 1 OR c.total <= %(max_caracteres)s)
RETURNING a.id, a.texto, a.texto_normalizado, a.recebida_em;

--QUERY: buscar_original_igual
-- Texto repetido igual (depois de normalizar) a um anterior dos últimos dias: o mais antigo é o original.
-- `id < atual` resolve dois iguais no mesmo lote: o primeiro é o original, o segundo a cópia.
SELECT id, tarefa_id
FROM anotacoes
WHERE texto_normalizado = %s AND id < %s AND status <> 'falhou'
  AND recebida_em > now() - make_interval(days => %s)
ORDER BY id
LIMIT 1;

--QUERY: marcar_duplicada
UPDATE anotacoes
SET status = 'duplicada', duplicada_de = %s, tarefa_id = %s, organizada_em = now()
WHERE id = %s;

--QUERY: marcar_organizada
UPDATE anotacoes SET status = 'organizada', tarefa_id = %s, organizada_em = now(), erro = NULL WHERE id = %s;

--QUERY: marcar_aguardando
UPDATE anotacoes SET status = 'aguardando_voce' WHERE id = %s;

--QUERY: marcar_falhou
UPDATE anotacoes SET status = 'falhou', erro = %s WHERE id = ANY(%s);

--QUERY: devolver_para_fila
-- Só para texto que nem chegou ao LLM ou cuja pergunta não coube no lote: volta como se não tivesse sido lido.
UPDATE anotacoes SET status = 'nova', lida_em = NULL WHERE id = ANY(%s);

--QUERY: tentar_de_novo
-- Decisão do chefe, nunca automática.
UPDATE anotacoes SET status = 'nova', lida_em = NULL, erro = NULL
WHERE id = %s AND status = 'falhou'
RETURNING id, texto, status;

--QUERY: buscar_por_id
SELECT id, texto, texto_normalizado, tarefa_id, status, erro, duplicada_de, recebida_em, lida_em, organizada_em
FROM anotacoes WHERE id = %s;

--QUERY: listar_falhas
SELECT id, texto, erro, recebida_em FROM anotacoes WHERE status = 'falhou' ORDER BY recebida_em DESC LIMIT %s;

--QUERY: herdar_tarefa_do_original
-- Cópia de um texto que ainda estava sendo organizado nasce sem tarefa; quando o original ganha uma, a cópia vai junto.
UPDATE anotacoes c
SET tarefa_id = o.tarefa_id
FROM anotacoes o
WHERE c.status = 'duplicada' AND c.duplicada_de = o.id AND c.tarefa_id IS NULL AND o.tarefa_id IS NOT NULL;

--QUERY: dispensar_curtas_de_contexto
-- Lembrete curto que a P2 já transformou em título ou item não vira contexto: seria pagar para repetir a mesma frase.
-- Só vale para o que passou pelo LLM (`lida_em`); o que o chefe escreveu dentro da tarefa sempre vira contexto.
UPDATE anotacoes
SET consolidada_em = now()
WHERE status = 'organizada' AND tarefa_id IS NOT NULL AND consolidada_em IS NULL
  AND lida_em IS NOT NULL AND length(btrim(texto)) < %s;

--QUERY: tarefas_a_consolidar
-- Tarefas com texto pendente de contexto que NÃO falhou (falha não volta sozinha) e sem reserva viva.
SELECT a.tarefa_id, min(a.organizada_em) AS desde
FROM anotacoes a
JOIN tarefas t ON t.id = a.tarefa_id
WHERE a.status = 'organizada' AND a.consolidada_em IS NULL AND a.consolidacao_erro IS NULL
  AND (a.consolidando_desde IS NULL OR a.consolidando_desde < now() - make_interval(mins => %s))
GROUP BY a.tarefa_id
ORDER BY desde
LIMIT %s;

--QUERY: reservar_para_contexto
-- Pega os textos pendentes da tarefa (inclusive os que falharam antes: agora vão junto) e reserva no mesmo comando.
-- Reserva viva de outra rodada: não pega nada (a outra rodada já está cuidando desta tarefa).
UPDATE anotacoes
SET consolidando_desde = now()
WHERE tarefa_id = %(tarefa_id)s AND status = 'organizada' AND consolidada_em IS NULL
  -- trava por tarefa só durante este comando: duas rodadas exatamente ao mesmo tempo não reservam as duas
  AND pg_try_advisory_xact_lock(7316, %(tarefa_id)s)
  AND NOT EXISTS (
      SELECT 1 FROM anotacoes r
      WHERE r.tarefa_id = %(tarefa_id)s AND r.consolidando_desde > now() - make_interval(mins => %(minutos)s)
        AND r.consolidada_em IS NULL
  )
RETURNING id, texto, organizada_em;

--QUERY: marcar_consolidadas
UPDATE anotacoes SET consolidada_em = now(), consolidando_desde = NULL, consolidacao_erro = NULL WHERE id = ANY(%s);

--QUERY: liberar_reserva
UPDATE anotacoes SET consolidando_desde = NULL WHERE id = ANY(%s);

--QUERY: marcar_erro_de_contexto
UPDATE anotacoes SET consolidando_desde = NULL, consolidacao_erro = %s WHERE id = ANY(%s);

--QUERY: existe_a_consolidar
SELECT EXISTS (
    SELECT 1 FROM anotacoes
    WHERE status = 'organizada' AND tarefa_id IS NOT NULL AND consolidada_em IS NULL AND consolidacao_erro IS NULL
) AS existe;
