--QUERY: buscar
SELECT ancora_real, ancora_mundo, fator FROM relogio_mundo WHERE id = 1;

--QUERY: criar_padrao
-- DO NOTHING: duas requisições simultâneas na primeira leitura não podem brigar pela linha.
INSERT INTO relogio_mundo (id, ancora_real, ancora_mundo, fator)
VALUES (1, %s, %s, %s)
ON CONFLICT (id) DO NOTHING;

--QUERY: reancorar
UPDATE relogio_mundo SET ancora_real = %s, ancora_mundo = %s, fator = %s WHERE id = 1;
