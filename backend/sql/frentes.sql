--QUERY: listar_com_contagem
-- Nível 1 do painel: as frentes com quantas tarefas abertas cada uma tem (oculta nunca é aberta, então não entra).
SELECT f.id, f.nome, f.ordem,
       count(t.id) FILTER (WHERE t.status = 'aberta') AS abertas,
       min(t.prazo) FILTER (WHERE t.status = 'aberta') AS prazo_mais_proximo
FROM frentes f
LEFT JOIN tarefas t ON t.frente_id = f.id
WHERE f.ativa
GROUP BY f.id
ORDER BY f.ordem, f.id;

--QUERY: buscar_por_id
SELECT id, nome, ordem, ativa FROM frentes WHERE id = %s;
