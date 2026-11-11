--QUERY: inserir
INSERT INTO perguntas (tipo, anotacao_id, texto, opcoes, proposta)
VALUES (%s, %s, %s, %s, %s)
RETURNING id;

--QUERY: promover_proxima
-- Uma visível por vez: só promove se não houver nenhuma aberta (o índice único é a rede de segurança).
UPDATE perguntas
SET status = 'aberta'
WHERE id = (SELECT id FROM perguntas WHERE status = 'na_fila' ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM perguntas WHERE status = 'aberta')
RETURNING id;

--QUERY: atual
SELECT p.id, p.tipo, p.texto, p.opcoes, p.anotacao_id, a.texto AS texto_original, p.criada_em,
       (SELECT count(*) FROM perguntas WHERE status = 'na_fila') AS na_fila
FROM perguntas p
JOIN anotacoes a ON a.id = p.anotacao_id
WHERE p.status = 'aberta';

--QUERY: buscar_para_responder
-- FOR UPDATE: dois cliques rápidos na mesma resposta não aplicam duas vezes.
SELECT id, tipo, anotacao_id, opcoes, proposta, status FROM perguntas WHERE id = %s FOR UPDATE;

--QUERY: marcar_respondida
UPDATE perguntas SET status = 'respondida', resposta = %s, respondida_em = now() WHERE id = %s;
