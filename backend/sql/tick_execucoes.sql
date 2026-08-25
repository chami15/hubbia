--QUERY: inserir
-- Uma linha por chamada de LLM do hub inteiro, seja de qual domínio for.
-- É a tabela do CONTROLE prevista em docs/avaliacao-mvp.md (seção 4):
-- replay, auditoria de custo e diagnóstico quando um agente "surta".
INSERT INTO tick_execucoes (
    tick, agente_id, modelo, contexto_prompt, saida_bruta,
    acao_parseada, tokens_in, tokens_out, custo_usd, dry_run, erro
)
VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
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
