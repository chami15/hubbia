-- Migration 014 — de onde veio o tick (Sprint 2, fase C).
--
-- 'manual' = o chefe apertou o botão; 'automatico' = o timer do app disparou (opt-in, com limites).
-- A fatia do orçamento do automático (75% do teto) é a soma do custo das execuções dos ticks 'automatico';
-- sem esta coluna não há como separar o que o timer gastou do que o chefe pediu.
-- Ticks antigos eram todos manuais: DEFAULT 'manual' preenche o histórico certo.
ALTER TABLE ticks ADD COLUMN origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'automatico'));
