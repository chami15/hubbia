--QUERY: inserir
INSERT INTO projetos
    (nome, repositorio_url, repositorio_owner, repositorio_nome, branch, descricao, stack, arquitetura_resumo, ultimo_commit_sha)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
RETURNING id, nome, repositorio_url, repositorio_owner, repositorio_nome, branch, descricao, stack,
          arquitetura_resumo, ultimo_commit_sha, status, criado_em, atualizado_em;

--QUERY: listar
-- `estagnado` repete a MESMA regra de listar_estagnados (ativo, sem
-- card em aberto, parado há mais que o limite) mas pra TODO projeto,
-- não só o mais parado — é o que a tela usa pro destaque visual do
-- card. O cutoff é o mesmo "agora menos dias_estagnacao" calculado em
-- Python, pra não duplicar a leitura de config dentro do SQL.
SELECT p.id, p.nome, p.repositorio_url, p.repositorio_owner, p.repositorio_nome, p.branch, p.descricao, p.stack,
       p.arquitetura_resumo, p.status, p.criado_em, p.atualizado_em,
       (
           p.status = 'ativo'
           AND NOT EXISTS (SELECT 1 FROM cards WHERE projeto_id = p.id AND status IN ('sugerido', 'aceito'))
           AND COALESCE(ultimo_card.resolvido_em, p.criado_em) <= %s
       ) AS estagnado
FROM projetos p
LEFT JOIN LATERAL (
    SELECT resolvido_em FROM cards
    WHERE projeto_id = p.id AND status IN ('rejeitado', 'finalizado')
    ORDER BY resolvido_em DESC
    LIMIT 1
) ultimo_card ON true
ORDER BY p.atualizado_em DESC;

--QUERY: buscar_por_id
SELECT id, nome, repositorio_url, repositorio_owner, repositorio_nome, branch, descricao, stack,
       arquitetura_resumo, ultimo_commit_sha, status, criado_em, atualizado_em
FROM projetos
WHERE id = %s;

--QUERY: atualizar_status
UPDATE projetos
SET status = %s, atualizado_em = now()
WHERE id = %s
RETURNING id, nome, status, atualizado_em;

--QUERY: atualizar_ultimo_commit_sha
UPDATE projetos
SET ultimo_commit_sha = %s, atualizado_em = now()
WHERE id = %s;

--QUERY: listar_estagnados
-- Candidato a proatividade do Norte (Etapa 3): ativo, sem card em
-- aberto (sugerido/aceito), parado (desde o último card resolvido, ou
-- desde o cadastro se nunca resolveu nenhum) há mais tempo que o
-- limite. Só o mais parado (LIMIT 1) — 1 mensagem por agente por tick,
-- mesmo se vários projetos estiverem estagnados ao mesmo tempo.
SELECT p.id, p.nome, p.repositorio_owner, p.repositorio_nome, p.branch,
       COALESCE(ultimo_card.resolvido_em, p.criado_em) AS referencia_tempo_parado
FROM projetos p
LEFT JOIN LATERAL (
    SELECT resolvido_em FROM cards
    WHERE projeto_id = p.id AND status IN ('rejeitado', 'finalizado')
    ORDER BY resolvido_em DESC
    LIMIT 1
) ultimo_card ON true
WHERE p.status = 'ativo'
  AND NOT EXISTS (
      SELECT 1 FROM cards WHERE projeto_id = p.id AND status IN ('sugerido', 'aceito')
  )
  AND COALESCE(ultimo_card.resolvido_em, p.criado_em) <= %s
ORDER BY COALESCE(ultimo_card.resolvido_em, p.criado_em) ASC
LIMIT 1;
