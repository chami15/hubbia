--QUERY: listar
SELECT id, nome, tipo, especialidade, estado, mesa, avatar_config, ativo, extroversao
FROM agentes
ORDER BY mesa NULLS LAST, id;

--QUERY: buscar_por_id
SELECT id, nome, tipo, especialidade, personalidade, avatar_config, estado, mesa, ativo
FROM agentes
WHERE id = %s;

--QUERY: buscar_por_especialidade
SELECT id, nome, tipo, especialidade, personalidade, avatar_config, estado, mesa, ativo
FROM agentes
WHERE especialidade = %s
LIMIT 1;

--QUERY: upsert
INSERT INTO agentes (nome, tipo, especialidade, personalidade, avatar_config, mesa, extroversao)
VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
ON CONFLICT (nome) DO UPDATE SET
    especialidade = EXCLUDED.especialidade,
    personalidade = EXCLUDED.personalidade,
    avatar_config = EXCLUDED.avatar_config,
    mesa          = EXCLUDED.mesa,
    extroversao   = EXCLUDED.extroversao
RETURNING id, nome;

--QUERY: atualizar_estado_ativos
-- Só colaboradores (o chefe não "age" num tick). Etapa 1 do motor de
-- tick: sempre volta pra 'idle' — vira estado de verdade (pensando/
-- falando/executando) quando a camada social/proatividade existir.
UPDATE agentes SET estado = %s WHERE ativo AND tipo = 'colaborador';

--QUERY: atualizar_estado
UPDATE agentes SET estado = %s WHERE id = %s;

--QUERY: listar_colaboradores_ativos
SELECT id, nome, especialidade, personalidade, extroversao, estado
FROM agentes
WHERE ativo AND tipo = 'colaborador'
ORDER BY id;

--QUERY: buscar_chefe
SELECT id, nome, especialidade, personalidade, extroversao, estado
FROM agentes
WHERE tipo = 'chefe' AND ativo
LIMIT 1;
