--QUERY: inserir
INSERT INTO atividades_fisicas (tipo, duracao_min, observacao)
VALUES (%s, %s, %s)
RETURNING id, tipo, duracao_min, observacao, registrado_em;

--QUERY: historico
SELECT id, tipo, duracao_min, observacao, registrado_em
FROM atividades_fisicas
WHERE registrado_em >= %s
ORDER BY registrado_em ASC;

--QUERY: recentes
SELECT id, tipo, duracao_min, observacao, registrado_em
FROM atividades_fisicas
WHERE registrado_em >= %s
ORDER BY registrado_em DESC, id DESC
LIMIT %s;
