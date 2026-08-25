--QUERY: inserir
-- Uma linha por chamada de LLM do hub inteiro, seja de qual domínio for.
-- É a tabela do CONTROLE prevista em docs/avaliacao-mvp.md (seção 4):
-- replay, auditoria de custo e diagnóstico quando um agente "surta".
INSERT INTO tick_execucoes (
    tick, agente_id, modelo, contexto_prompt, saida_bruta,
    acao_parseada, tokens_in, tokens_out, custo_usd, dry_run, erro, duracao_ms
)
VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s)
RETURNING id;

--QUERY: custo_gasto_hoje
-- O orçamento diário sai DAQUI, e de mais lugar nenhum. Antes era um
-- UNION escrito à mão sobre 5 tabelas de domínio — o que significava
-- que todo domínio novo gastava invisível ao guardrail até alguém
-- lembrar de editar a query (e a Agenda, que nunca gravou custo em
-- tabela nenhuma, era invisível desde sempre).
--
-- dry_run não conta: por definição não gastou nada de verdade.
SELECT COALESCE(SUM(custo_usd), 0) AS total
FROM tick_execucoes
WHERE criado_em >= %s
  AND dry_run = FALSE;

--QUERY: custo_por_agente_desde
-- Alimenta a sala de máquinas: quanto cada agente gastou e quantas
-- chamadas fez desde um instante. `erros` é o que separa "caro" de
-- "caro E quebrando".
SELECT a.id           AS agente_id,
       a.nome         AS agente_nome,
       a.especialidade,
       COUNT(*)                                        AS chamadas,
       COALESCE(SUM(e.custo_usd), 0)                    AS custo_usd,
       COALESCE(SUM(e.tokens_in), 0)                    AS tokens_in,
       COALESCE(SUM(e.tokens_out), 0)                   AS tokens_out,
       COUNT(*) FILTER (WHERE e.erro IS NOT NULL)       AS erros
FROM tick_execucoes e
JOIN agentes a ON a.id = e.agente_id
WHERE e.criado_em >= %s
  AND e.dry_run = FALSE
GROUP BY a.id, a.nome, a.especialidade
ORDER BY custo_usd DESC;

--QUERY: resumo_desde
-- Números agregados do escritório inteiro no período — o cabeçalho da
-- sala de máquinas.
SELECT COUNT(*)                                   AS chamadas,
       COUNT(DISTINCT tick)                        AS ticks_com_gasto,
       COALESCE(SUM(custo_usd), 0)                 AS custo_usd,
       COUNT(*) FILTER (WHERE erro IS NOT NULL)    AS erros
FROM tick_execucoes
WHERE criado_em >= %s
  AND dry_run = FALSE;

--QUERY: ultimos_erros
-- Últimas falhas registradas, pra sala de máquinas mostrar O QUE quebrou
-- em vez de só dizer que quebrou.
SELECT e.id, e.tick, e.modelo, e.erro, e.criado_em, a.nome AS agente_nome
FROM tick_execucoes e
JOIN agentes a ON a.id = e.agente_id
WHERE e.erro IS NOT NULL
ORDER BY e.criado_em DESC
LIMIT %s;

--QUERY: serie_por_hora
-- Série temporal das últimas N horas, um balde por hora. `generate_series`
-- garante que hora SEM chamada nenhuma apareça como zero em vez de sumir
-- do gráfico — buraco no eixo do tempo mente sobre o formato da curva.
SELECT
    balde.hora,
    COALESCE(COUNT(e.id), 0)                                   AS chamadas,
    COALESCE(COUNT(e.id) FILTER (WHERE e.erro IS NOT NULL), 0)  AS erros,
    COALESCE(SUM(e.custo_usd), 0)                               AS custo_usd,
    ROUND(AVG(e.duracao_ms))                                    AS duracao_media_ms
FROM generate_series(
        date_trunc('hour', now()) - make_interval(hours => %s - 1),
        date_trunc('hour', now()),
        interval '1 hour'
     ) AS balde(hora)
LEFT JOIN tick_execucoes e
       ON date_trunc('hour', e.criado_em) = balde.hora
      AND e.dry_run = FALSE
GROUP BY balde.hora
ORDER BY balde.hora;

--QUERY: latencia_por_agente
-- p50 e p95 por agente. Percentil e não média porque média esconde a
-- cauda: dez chamadas de 1s e uma de 30s dão média de 3,6s, e é a de 30s
-- que trava a tela. `duracao_ms IS NOT NULL` exclui linhas antigas
-- (anteriores à migration 011) e falhas que nem chegaram ao modelo.
SELECT a.id                                                                        AS agente_id,
       a.nome                                                                      AS agente_nome,
       a.especialidade,
       COUNT(*)                                                                    AS amostras,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.duracao_ms))::int       AS p50_ms,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e.duracao_ms))::int      AS p95_ms,
       MAX(e.duracao_ms)                                                           AS max_ms
FROM tick_execucoes e
JOIN agentes a ON a.id = e.agente_id
WHERE e.criado_em >= %s
  AND e.dry_run = FALSE
  AND e.duracao_ms IS NOT NULL
GROUP BY a.id, a.nome, a.especialidade
ORDER BY p95_ms DESC;

--QUERY: latencia_geral
-- Os mesmos percentis, do escritório inteiro — o número de topo do painel.
SELECT COUNT(*)                                                              AS amostras,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duracao_ms))::int   AS p50_ms,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duracao_ms))::int  AS p95_ms,
       ROUND(AVG(duracao_ms))::int                                           AS media_ms
FROM tick_execucoes
WHERE criado_em >= %s AND dry_run = FALSE AND duracao_ms IS NOT NULL;

--QUERY: execucoes_recentes
-- O "log": últimas chamadas, com ou sem erro. É o replay que a tabela
-- foi criada pra permitir (docs/avaliacao-mvp.md, seção 4) e que nunca
-- tinha sido usado.
SELECT e.id, e.tick, e.modelo, e.tokens_in, e.tokens_out, e.custo_usd,
       e.duracao_ms, e.erro, e.criado_em, e.contexto_prompt, e.saida_bruta,
       a.nome AS agente_nome, a.especialidade
FROM tick_execucoes e
JOIN agentes a ON a.id = e.agente_id
WHERE e.dry_run = FALSE
ORDER BY e.criado_em DESC
LIMIT %s;

--QUERY: ultima_chamada_por_especialidade
-- "Uptime" honesto: em vez de pingar Google/GitHub/OpenAI a cada tick
-- (o que faria do monitor a maior fonte de rate limit do sistema), olha
-- quando cada dependência foi usada COM SUCESSO pela última vez. Se a
-- Agenda respondeu bem há 20 minutos, o Google está de pé — sem gastar
-- uma requisição pra descobrir isso.
SELECT a.especialidade,
       a.nome                                                        AS agente_nome,
       MAX(e.criado_em) FILTER (WHERE e.erro IS NULL)                 AS ultimo_ok,
       MAX(e.criado_em) FILTER (WHERE e.erro IS NOT NULL)             AS ultimo_erro
FROM tick_execucoes e
JOIN agentes a ON a.id = e.agente_id
WHERE e.dry_run = FALSE
GROUP BY a.especialidade, a.nome;
