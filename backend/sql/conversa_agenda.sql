--QUERY: inserir
INSERT INTO conversa_agenda (de, texto, acao_pendente_id)
VALUES (%s, %s, %s)
RETURNING id, de, texto, acao_pendente_id, criado_em;

--QUERY: ultimas
SELECT id, de, texto, acao_pendente_id, criado_em
FROM (
    SELECT id, de, texto, acao_pendente_id, criado_em
    FROM conversa_agenda
    ORDER BY criado_em DESC, id DESC
    LIMIT %s
) recentes
ORDER BY criado_em ASC, id ASC;
