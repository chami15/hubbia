--QUERY: inserir
INSERT INTO sono_historico (horas, qualidade, data_referencia)
VALUES (%s, %s, %s)
RETURNING id, horas, qualidade, data_referencia, registrado_em;

--QUERY: historico
SELECT id, horas, qualidade, data_referencia, registrado_em
FROM sono_historico
WHERE data_referencia >= %s
ORDER BY data_referencia ASC;

--QUERY: recentes
SELECT id, horas, qualidade, data_referencia, registrado_em
FROM sono_historico
WHERE data_referencia >= %s
ORDER BY data_referencia DESC, id DESC
LIMIT %s;
