--QUERY: upsert_neutro
INSERT INTO relacionamentos (agente_id, alvo_agente_id)
VALUES (%s, %s)
ON CONFLICT (agente_id, alvo_agente_id) DO NOTHING;

--QUERY: buscar_por_par
SELECT agente_id, alvo_agente_id, afinidade, opiniao
FROM relacionamentos
WHERE agente_id = %s AND alvo_agente_id = %s;

--QUERY: listar_afinidades_de
SELECT alvo_agente_id, afinidade
FROM relacionamentos
WHERE agente_id = %s;

--QUERY: atualizar_afinidade
UPDATE relacionamentos SET afinidade = %s, atualizado_em = now()
WHERE agente_id = %s AND alvo_agente_id = %s
RETURNING agente_id, alvo_agente_id, afinidade;

--QUERY: listar_entre_colegas
-- Afinidade entre colaboradores ativos, nas duas direções (é direcional: A gostar de B não é B gostar de A).
-- Chefe fora (ele não é simulado) e sem `opiniao` (nunca escrita). Leitura pura, sem LLM.
SELECT r.agente_id, r.alvo_agente_id, r.afinidade
FROM relacionamentos r
JOIN agentes a ON a.id = r.agente_id AND a.ativo AND a.tipo = 'colaborador'
JOIN agentes b ON b.id = r.alvo_agente_id AND b.ativo AND b.tipo = 'colaborador'
ORDER BY r.agente_id, r.alvo_agente_id;
