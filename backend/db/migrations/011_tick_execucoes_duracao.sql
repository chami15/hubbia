-- Migration 011 — duração de cada chamada, em milissegundos.
--
-- Era a única lacuna real pra ter observabilidade de verdade na sala de
-- máquinas: `tick_execucoes` já sabia QUEM chamou, QUANTO custou e SE
-- falhou, mas não QUANTO TEMPO levou. Sem esta coluna não existe
-- latência, tempo de resposta médio, nem percentil — três das perguntas
-- que qualquer painel de monitoramento precisa responder.
--
-- Fica NULL nas linhas antigas (gravadas antes desta migration) e nas
-- execuções que falharam antes mesmo de chegar ao modelo. Os cálculos
-- de percentil ignoram NULL — melhor um percentil sobre menos amostras
-- do que um zero inventado puxando a média pra baixo.
ALTER TABLE tick_execucoes ADD COLUMN IF NOT EXISTS duracao_ms INT;

-- Percentil por agente e série por hora varrem uma janela de tempo e
-- agrupam — este índice cobre as duas.
CREATE INDEX IF NOT EXISTS idx_tick_execucoes_latencia
    ON tick_execucoes (criado_em, agente_id)
    WHERE duracao_ms IS NOT NULL;
