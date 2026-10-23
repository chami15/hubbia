-- Migration 010 — `tick_execucoes.tick` passa a aceitar NULL.
--
-- A tabela nasceu na 001 pressupondo que toda chamada de LLM aconteceria
-- DENTRO de um tick. Na prática metade não acontece: gerar o relatório do
-- mês, estimar o macro de uma refeição e conversar com a Agenda são
-- ações que o CHEFE dispara, entre um tick e outro.
--
-- `tick NULL` não é dado faltando — é a informação de que aquilo
-- aconteceu fora do relógio do escritório. E a distinção importa pra
-- sala de máquinas: separa "o escritório gastou sozinho" (trabalho
-- proativo, papo social) de "eu mandei gastar" (ação direta minha).
-- Sem isso, custo por tick misturaria as duas coisas e não significaria
-- nada.
ALTER TABLE tick_execucoes ALTER COLUMN tick DROP NOT NULL;

-- Consulta dominante da sala de máquinas: "quanto gastei hoje" e
-- "quanto cada agente gastou hoje" — sempre filtrando dry_run.
CREATE INDEX IF NOT EXISTS idx_tick_execucoes_dia
    ON tick_execucoes (criado_em, dry_run);
