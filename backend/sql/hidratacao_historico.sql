--QUERY: inserir
INSERT INTO hidratacao_historico (quantidade_ml)
VALUES (%s)
RETURNING id, quantidade_ml, registrado_em;

--QUERY: total_periodo
SELECT COALESCE(SUM(quantidade_ml), 0) AS total_ml
FROM hidratacao_historico
WHERE registrado_em >= %s;

--QUERY: historico
SELECT id, quantidade_ml, registrado_em
FROM hidratacao_historico
WHERE registrado_em >= %s
ORDER BY registrado_em ASC;

--QUERY: recentes
SELECT id, quantidade_ml, registrado_em
FROM hidratacao_historico
WHERE registrado_em >= %s
ORDER BY registrado_em DESC, id DESC
LIMIT %s;
