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
