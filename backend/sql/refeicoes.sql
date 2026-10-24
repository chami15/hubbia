--QUERY: inserir
INSERT INTO refeicoes
    (tipo_refeicao, origem, descricao, imagem_path, calorias, carboidratos_g,
     proteinas_g, gorduras_g, confianca_estimativa, modelo, tokens_in, tokens_out, custo_usd)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
RETURNING id, tipo_refeicao, origem, descricao, calorias, carboidratos_g,
          proteinas_g, gorduras_g, confianca_estimativa, registrado_em;

--QUERY: historico
SELECT id, tipo_refeicao, origem, descricao, calorias, carboidratos_g,
       proteinas_g, gorduras_g, confianca_estimativa, registrado_em
FROM refeicoes
WHERE registrado_em >= %s
ORDER BY registrado_em ASC;

--QUERY: total_periodo
SELECT
    COALESCE(SUM(calorias), 0)       AS calorias,
    COALESCE(SUM(carboidratos_g), 0) AS carboidratos_g,
    COALESCE(SUM(proteinas_g), 0)    AS proteinas_g,
    COALESCE(SUM(gorduras_g), 0)     AS gorduras_g
FROM refeicoes
WHERE registrado_em >= %s;

--QUERY: semana_fechada_sem_relatorio
-- Proatividade do Vita (Etapa 3): a semana FECHADA (anterior à semana
-- atual) mais antiga com algum registro de saúde (refeição, peso ou
-- atividade) e sem relatório gerado. Bucketiza os eventos por semana no
-- fuso local (primeiro parâmetro), pra bater com a segunda-feira usada
-- no resto do domínio. Segundo parâmetro é a data de hoje (local).
WITH eventos AS (
    SELECT registrado_em AS ts FROM refeicoes
    UNION ALL SELECT registrado_em FROM peso_historico
    UNION ALL SELECT registrado_em FROM atividades_fisicas
),
semanas AS (
    SELECT DISTINCT date_trunc('week', ts AT TIME ZONE %s)::date AS semana FROM eventos
)
SELECT MIN(s.semana) AS semana
FROM semanas s
WHERE s.semana < date_trunc('week', %s::date)::date
  AND NOT EXISTS (
      SELECT 1 FROM relatorios_saude r WHERE r.semana_inicio = s.semana
  );

--QUERY: recentes
-- Leitura para a tela de histórico: mais recente primeiro, com teto. Sem modelo/tokens/custo de propósito (RNF02),
-- e sem o caminho da imagem (detalhe interno).
SELECT id, tipo_refeicao, origem, descricao, calorias, carboidratos_g,
       proteinas_g, gorduras_g, confianca_estimativa, registrado_em
FROM refeicoes
WHERE registrado_em >= %s
ORDER BY registrado_em DESC, id DESC
LIMIT %s;
