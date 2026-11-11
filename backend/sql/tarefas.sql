--QUERY: inserir
INSERT INTO tarefas (frente_id, titulo, prazo, termos, origem)
VALUES (%s, %s, %s, %s, %s)
RETURNING id;

--QUERY: buscar_por_id
-- `tudo_feito` é o "tudo feito, concluir?" do painel: conta pura, a Pauta nunca conclui sozinha.
SELECT t.id, t.frente_id, f.nome AS frente, t.titulo, t.prazo, t.status, t.termos, t.contexto, t.origem,
       t.criada_em, t.atualizada_em, t.ultimo_movimento_em, t.concluida_em, t.oculta, t.ocultada_em,
       count(c.id) AS itens_total,
       count(c.id) FILTER (WHERE c.feito) AS itens_feitos,
       (t.status = 'aberta' AND count(c.id) > 0 AND bool_and(c.feito)) AS tudo_feito
FROM tarefas t
JOIN frentes f ON f.id = t.frente_id
LEFT JOIN checklist_itens c ON c.tarefa_id = t.id
WHERE t.id = %s
GROUP BY t.id, f.nome;

--QUERY: listar_da_frente
-- Nível 2 do painel. Abertas primeiro (prazo mais perto primeiro, sem prazo depois; empate: a mexida por último
-- no topo), depois feitas e deixadas de lado (a mais recente primeiro). Ocultas só quando pedidas, e por último.
SELECT t.id, t.titulo, t.prazo, t.status, t.oculta, t.ultimo_movimento_em, t.concluida_em,
       count(c.id) AS itens_total,
       count(c.id) FILTER (WHERE c.feito) AS itens_feitos,
       (t.status = 'aberta' AND count(c.id) > 0 AND bool_and(c.feito)) AS tudo_feito
FROM tarefas t
LEFT JOIN checklist_itens c ON c.tarefa_id = t.id
WHERE t.frente_id = %s AND (%s OR NOT t.oculta)
GROUP BY t.id
ORDER BY t.oculta,
         (t.status <> 'aberta'),
         CASE WHEN t.status = 'aberta' THEN t.prazo END ASC NULLS LAST,
         CASE WHEN t.status = 'aberta' THEN t.ultimo_movimento_em END DESC,
         t.concluida_em DESC NULLS LAST,
         t.id DESC;

--QUERY: atualizar_campos
-- Campo NULL = não mexe. O prazo tem uma flag própria porque "tirar o prazo" (NULL) é uma mudança válida.
UPDATE tarefas
SET titulo = COALESCE(%s, titulo),
    frente_id = COALESCE(%s, frente_id),
    termos = COALESCE(%s, termos),
    prazo = CASE WHEN %s THEN %s::date ELSE prazo END,
    atualizada_em = now(),
    ultimo_movimento_em = now()
WHERE id = %s
RETURNING id;

--QUERY: mudar_status
-- Reabrir desoculta: tarefa aberta nunca fica escondida (e o CHECK da tabela não deixaria).
UPDATE tarefas
SET status = %(status)s,
    concluida_em = CASE WHEN %(status)s = 'feita' THEN now() ELSE NULL END,
    oculta = CASE WHEN %(status)s = 'aberta' THEN false ELSE oculta END,
    ocultada_em = CASE WHEN %(status)s = 'aberta' THEN NULL ELSE ocultada_em END,
    atualizada_em = now(),
    ultimo_movimento_em = now()
WHERE id = %(id)s
RETURNING id;

--QUERY: ocultar
UPDATE tarefas
SET oculta = %s, ocultada_em = CASE WHEN %s THEN now() ELSE NULL END, atualizada_em = now()
WHERE id = %s
RETURNING id;

--QUERY: tocar
UPDATE tarefas SET ultimo_movimento_em = now() WHERE id = %s;
