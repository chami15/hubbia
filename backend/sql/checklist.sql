--QUERY: inserir
-- Item novo vai para o fim da lista.
INSERT INTO checklist_itens (tarefa_id, texto, origem, ordem)
VALUES (%s, %s, %s, (SELECT COALESCE(max(ordem), 0) + 1 FROM checklist_itens WHERE tarefa_id = %s))
RETURNING id, tarefa_id, texto, ordem, feito, feito_em, origem;

--QUERY: buscar_por_id
SELECT id, tarefa_id, texto, ordem, feito, feito_em, origem FROM checklist_itens WHERE id = %s;

--QUERY: listar_da_tarefa
SELECT id, tarefa_id, texto, ordem, feito, feito_em, origem
FROM checklist_itens
WHERE tarefa_id = %s
ORDER BY ordem, id;

--QUERY: atualizar
-- Campo NULL = não mexe. `feito_em` acompanha o `feito` (desmarcar apaga a data).
UPDATE checklist_itens
SET texto = COALESCE(%(texto)s, texto),
    ordem = COALESCE(%(ordem)s, ordem),
    feito = COALESCE(%(feito)s, feito),
    feito_em = CASE
        WHEN %(feito)s::bool IS NULL THEN feito_em
        WHEN %(feito)s::bool AND NOT feito THEN now()
        WHEN %(feito)s::bool THEN feito_em
        ELSE NULL
    END
WHERE id = %(id)s
RETURNING id, tarefa_id, texto, ordem, feito, feito_em, origem;

--QUERY: remover
DELETE FROM checklist_itens WHERE id = %s RETURNING tarefa_id;

--QUERY: inserir_no_topo
-- A sugestão aceita é o próximo passo: entra antes de tudo.
INSERT INTO checklist_itens (tarefa_id, texto, origem, ordem)
VALUES (%s, %s, 'agente', (SELECT COALESCE(min(ordem), 1) - 1 FROM checklist_itens WHERE tarefa_id = %s))
RETURNING id;

--QUERY: mover_para_o_topo
UPDATE checklist_itens
SET ordem = (SELECT COALESCE(min(ordem), 1) - 1 FROM checklist_itens WHERE tarefa_id = %s)
WHERE id = %s;

--QUERY: mover_para_tarefa
-- Juntar tarefas (P5): o item vai para o fim da lista da que fica.
UPDATE checklist_itens
SET tarefa_id = %s, ordem = (SELECT COALESCE(max(ordem), 0) + 1 FROM checklist_itens WHERE tarefa_id = %s)
WHERE id = %s;
