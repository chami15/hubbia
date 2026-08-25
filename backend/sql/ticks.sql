--QUERY: buscar_ultimo
SELECT id, numero, hora_simulada, estado_mundo, processado_em
FROM ticks
ORDER BY numero DESC
LIMIT 1;

--QUERY: inserir
INSERT INTO ticks (numero, hora_simulada, estado_mundo)
VALUES (%s, %s, %s::jsonb)
RETURNING id, numero, hora_simulada, estado_mundo, processado_em;

-- (a antiga `custo_gasto_hoje` vivia aqui: um UNION ALL escrito à mão
-- sobre 5 tabelas de domínio. Foi aposentada — mora agora em
-- `tick_execucoes:custo_gasto_hoje`, sobre uma tabela só. O motivo está
-- no comentário daquela query e em agents/_shared/execucoes.py.)
