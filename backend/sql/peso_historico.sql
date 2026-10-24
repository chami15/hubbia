--QUERY: inserir
INSERT INTO peso_historico (peso_kg)
VALUES (%s)
RETURNING id, peso_kg, registrado_em;

--QUERY: mais_recente
SELECT id, peso_kg, registrado_em
FROM peso_historico
ORDER BY registrado_em DESC
LIMIT 1;

--QUERY: historico
SELECT id, peso_kg, registrado_em
FROM peso_historico
WHERE registrado_em >= %s
ORDER BY registrado_em ASC;

--QUERY: recentes
SELECT id, peso_kg, registrado_em
FROM peso_historico
WHERE registrado_em >= %s
ORDER BY registrado_em DESC, id DESC
LIMIT %s;
