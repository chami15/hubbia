--QUERY: ativa_da_tarefa
SELECT id, tarefa_id, status, base_hash, proximo_passo, como, por_que, criada_em
FROM sugestoes WHERE tarefa_id = %s AND status = 'ativa';

--QUERY: descartadas_recentes
-- O "não repetir": as últimas que o chefe descartou nesta tarefa.
SELECT proximo_passo FROM sugestoes
WHERE tarefa_id = %s AND status = 'descartada'
ORDER BY resolvida_em DESC
LIMIT %s;

--QUERY: expirar_gerando
-- Reserva de uma geração que caiu no meio não pode travar o botão para sempre.
UPDATE sugestoes SET status = 'falhou', erro = 'A geração foi interrompida.', resolvida_em = now()
WHERE tarefa_id = %s AND status = 'gerando' AND criada_em < now() - make_interval(mins => %s);

--QUERY: reservar
INSERT INTO sugestoes (tarefa_id, base_hash) VALUES (%s, %s) RETURNING id;

--QUERY: falhar
UPDATE sugestoes SET status = 'falhou', erro = %s, resolvida_em = now() WHERE id = %s AND status = 'gerando';

--QUERY: substituir_ativa
UPDATE sugestoes SET status = 'substituida', resolvida_em = now() WHERE tarefa_id = %s AND status = 'ativa';

--QUERY: ativar
UPDATE sugestoes SET status = 'ativa', proximo_passo = %s, como = %s, por_que = %s
WHERE id = %s AND status = 'gerando'
RETURNING id, tarefa_id, status, base_hash, proximo_passo, como, por_que, criada_em;

--QUERY: buscar_para_resolver
SELECT id, tarefa_id, status, proximo_passo FROM sugestoes WHERE id = %s FOR UPDATE;

--QUERY: resolver
UPDATE sugestoes SET status = %s, resolvida_em = now() WHERE id = %s;
