--QUERY: tarefas_abertas_resumo
-- O que a revisão olha de cada tarefa aberta: só o necessário (sem textos, sem contexto). O próximo item pendente
-- ajuda a dizer se ela é pequena ou grande.
SELECT t.id, f.nome AS frente, t.titulo, t.prazo, t.ultimo_movimento_em,
       count(c.id) AS itens_total,
       count(c.id) FILTER (WHERE c.feito) AS itens_feitos,
       (SELECT texto FROM checklist_itens p WHERE p.tarefa_id = t.id AND NOT p.feito ORDER BY ordem, id LIMIT 1) AS proximo_item
FROM tarefas t
JOIN frentes f ON f.id = t.frente_id
LEFT JOIN checklist_itens c ON c.tarefa_id = t.id
WHERE t.status = 'aberta'
GROUP BY t.id, f.nome;

--QUERY: pronta
SELECT id, base_hash, criada_em FROM revisoes WHERE status = 'pronta';

--QUERY: expirar_gerando
UPDATE revisoes SET status = 'falhou', erro = 'A revisão foi interrompida.'
WHERE status = 'gerando' AND criada_em < now() - make_interval(mins => %s);

--QUERY: reservar
INSERT INTO revisoes (base_hash) VALUES (%s) RETURNING id;

--QUERY: falhar
UPDATE revisoes SET status = 'falhou', erro = %s WHERE id = %s AND status = 'gerando';

--QUERY: substituir_pronta
UPDATE revisoes SET status = 'substituida' WHERE status = 'pronta';

--QUERY: publicar
UPDATE revisoes SET status = 'pronta' WHERE id = %s AND status = 'gerando';

--QUERY: inserir_item
INSERT INTO revisao_itens (revisao_id, grupo, tarefa_id, por_que, acao, juntar_com, ordem)
VALUES (%s, %s, %s, %s, %s, %s, %s);

--QUERY: itens
SELECT i.id, i.grupo, i.tarefa_id, t.titulo, f.nome AS frente, t.status AS tarefa_status, i.por_que, i.acao,
       i.juntar_com, j.titulo AS juntar_com_titulo, i.status
FROM revisao_itens i
JOIN tarefas t ON t.id = i.tarefa_id
JOIN frentes f ON f.id = t.frente_id
LEFT JOIN tarefas j ON j.id = i.juntar_com
WHERE i.revisao_id = %s AND i.status <> 'descartado'
ORDER BY CASE i.grupo WHEN 'foco' THEN 1 WHEN 'pode_esperar' THEN 2 ELSE 3 END, i.ordem;

--QUERY: buscar_item_para_resolver
SELECT id, grupo, tarefa_id, acao, juntar_com, status FROM revisao_itens WHERE id = %s FOR UPDATE;

--QUERY: resolver_item
UPDATE revisao_itens SET status = %s WHERE id = %s;
