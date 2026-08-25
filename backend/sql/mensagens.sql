--QUERY: listar_todas
SELECT m.id, m.tipo, m.conteudo, m.tick, m.criado_em, m.lida_pelo_chefe,
       m.remetente_id, r.nome AS remetente_nome,
       m.destinatario_id, d.nome AS destinatario_nome,
       m.respondendo_a_id,
       original.conteudo AS respondendo_a_conteudo,
       original_remetente.nome AS respondendo_a_remetente_nome
FROM mensagens m
JOIN agentes r ON r.id = m.remetente_id
LEFT JOIN agentes d ON d.id = m.destinatario_id
LEFT JOIN mensagens original ON original.id = m.respondendo_a_id
LEFT JOIN agentes original_remetente ON original_remetente.id = original.remetente_id
ORDER BY m.id DESC
LIMIT %s;

--QUERY: inserir
INSERT INTO mensagens (remetente_id, destinatario_id, tipo, conteudo, tick, respondendo_a_id)
VALUES (%s, %s, %s, %s, %s, %s)
RETURNING id, remetente_id, destinatario_id, tipo, conteudo, tick, respondendo_a_id, criado_em;

--QUERY: ultimo_tick_social_do_agente
SELECT tick FROM mensagens
WHERE remetente_id = %s AND tipo = 'social' AND tick IS NOT NULL
ORDER BY tick DESC
LIMIT 1;

--QUERY: ultimas_do_par
SELECT conteudo, tick, criado_em, remetente_id, destinatario_id
FROM mensagens
WHERE tipo = 'social'
  AND ((remetente_id = %s AND destinatario_id = %s) OR (remetente_id = %s AND destinatario_id = %s))
ORDER BY criado_em DESC
LIMIT %s;

--QUERY: contar_sociais_do_par_hoje
SELECT COUNT(*) AS total FROM mensagens
WHERE tipo = 'social'
  AND ((remetente_id = %s AND destinatario_id = %s) OR (remetente_id = %s AND destinatario_id = %s))
  AND criado_em >= %s;

--QUERY: contar_trabalho_do_agente_hoje
SELECT COUNT(*) AS total FROM mensagens
WHERE remetente_id = %s AND tipo = 'trabalho' AND criado_em >= %s;

--QUERY: ultimo_trabalho_do_agente
-- O último aviso de trabalho que este agente mandou, de qualquer dia.
-- Usada pelo Motriz pra só falar em MUDANÇA de estado: como o texto do
-- aviso é derivado de forma determinística da lista de problemas, texto
-- igual significa situação igual, e situação igual não merece um aviso
-- novo. Aviso que se repete todo tick ensina a ignorar aviso.
SELECT conteudo, criado_em FROM mensagens
WHERE remetente_id = %s AND tipo = 'trabalho'
ORDER BY criado_em DESC
LIMIT 1;

--QUERY: buscar_pendente_mais_antiga_para
-- Mensagem social mais antiga direcionada a esse agente que ainda não
-- recebeu resposta (nenhuma outra mensagem aponta respondendo_a_id pra
-- ela). Usada ANTES da roleta normal: responder pendência tem
-- prioridade sobre sortear um destinatário novo.
SELECT id, remetente_id, destinatario_id, conteudo, tick, criado_em
FROM mensagens m
WHERE destinatario_id = %s
  AND tipo = 'social'
  AND NOT EXISTS (SELECT 1 FROM mensagens r WHERE r.respondendo_a_id = m.id)
ORDER BY criado_em ASC
LIMIT 1;

--QUERY: listar_por_tipo
SELECT m.id, m.tipo, m.conteudo, m.tick, m.criado_em, m.lida_pelo_chefe,
       m.remetente_id, r.nome AS remetente_nome,
       m.destinatario_id, d.nome AS destinatario_nome,
       m.respondendo_a_id,
       original.conteudo AS respondendo_a_conteudo,
       original_remetente.nome AS respondendo_a_remetente_nome
FROM mensagens m
JOIN agentes r ON r.id = m.remetente_id
LEFT JOIN agentes d ON d.id = m.destinatario_id
LEFT JOIN mensagens original ON original.id = m.respondendo_a_id
LEFT JOIN agentes original_remetente ON original_remetente.id = original.remetente_id
WHERE m.tipo = %s
ORDER BY m.id DESC
LIMIT %s;

--QUERY: buscar_por_id
SELECT id, tipo, conteudo, tick, criado_em, remetente_id, destinatario_id, respondendo_a_id
FROM mensagens
WHERE id = %s;

--QUERY: marcar_lida
-- "Lida" é por CLIQUE na mensagem específica, nunca por abrir a thread
-- inteira (decisão do chefe) — por isso é um UPDATE de uma linha só, não
-- um "marcar tudo desta conversa". Idempotente: marcar de novo uma já
-- lida não faz mal nenhum.
UPDATE mensagens SET lida_pelo_chefe = TRUE
WHERE id = %s
RETURNING id, lida_pelo_chefe;

--QUERY: caixa_de_entrada
-- "Caixa de mensagens do chefe": tudo que foi direcionado a ele,
-- filtrado no servidor (o frontend não precisa saber o id do chefe).
SELECT m.id, m.tipo, m.conteudo, m.tick, m.criado_em,
       m.remetente_id, r.nome AS remetente_nome,
       m.destinatario_id, d.nome AS destinatario_nome,
       m.respondendo_a_id,
       original.conteudo AS respondendo_a_conteudo,
       original_remetente.nome AS respondendo_a_remetente_nome
FROM mensagens m
JOIN agentes r ON r.id = m.remetente_id
LEFT JOIN agentes d ON d.id = m.destinatario_id
LEFT JOIN mensagens original ON original.id = m.respondendo_a_id
LEFT JOIN agentes original_remetente ON original_remetente.id = original.remetente_id
WHERE m.destinatario_id = %s
ORDER BY m.id DESC
LIMIT %s;
