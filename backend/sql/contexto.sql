--QUERY: listar_da_tarefa
SELECT id, texto, fontes, ordem FROM contexto_topicos WHERE tarefa_id = %s ORDER BY ordem, id;

--QUERY: apagar_da_tarefa
DELETE FROM contexto_topicos WHERE tarefa_id = %s;

--QUERY: inserir
INSERT INTO contexto_topicos (tarefa_id, texto, fontes, ordem) VALUES (%s, %s, %s, %s);
