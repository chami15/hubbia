-- Migration 018 — Pauta, fase P4: a "sugestão da Pauta" dentro de uma tarefa (próximo passo, como e por que agora).
-- Decisões:
--   * só para tarefa (a revisão geral da P5 traz a própria tabela quando nascer);
--   * `base_hash` é a impressão digital da tarefa quando a sugestão foi feita (título, prazo, checklist com o que está
--     marcado, contexto). Mesma impressão = nada mudou = devolve a mesma sugestão sem chamar o LLM. Conteúdo, não
--     relógio: uma atualização de contexto da P3 conta como mudança, abrir a tela não;
--   * `gerando` reserva a vez: dois cliques seguidos não pagam duas chamadas (índice único por tarefa);
--   * uma `ativa` por tarefa; a anterior vira `substituida` quando chega outra. `descartada` alimenta o "não repetir";
--   * `falhou` guarda o erro: nada é refeito sozinho, só com novo clique.

CREATE TABLE sugestoes (
    id             SERIAL PRIMARY KEY,
    tarefa_id      INT  NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'gerando'
                     CHECK (status IN ('gerando', 'ativa', 'aceita', 'descartada', 'substituida', 'falhou')),
    base_hash      TEXT NOT NULL,
    proximo_passo  TEXT,
    como           TEXT[] NOT NULL DEFAULT '{}',
    por_que        TEXT,
    erro           TEXT,
    criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvida_em   TIMESTAMPTZ,
    CONSTRAINT sugestao_ativa_tem_conteudo CHECK (status IN ('gerando', 'falhou') OR proximo_passo IS NOT NULL)
);

CREATE UNIQUE INDEX sugestoes_uma_ativa ON sugestoes (tarefa_id) WHERE status = 'ativa';
CREATE UNIQUE INDEX sugestoes_uma_gerando ON sugestoes (tarefa_id) WHERE status = 'gerando';
