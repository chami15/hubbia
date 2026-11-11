-- Migration 016 — Pauta, fase P2: as perguntas de dúvida (docs/pauta-desenho.md, "Não confundir API do SL com API
-- do hubbia"). Decisões:
--   * uma pergunta VISÍVEL por vez (pedido do chefe): o índice único parcial em `aberta` é a rede de segurança,
--     o resolver promove a próxima da fila quando a atual é respondida. As outras esperam como `na_fila`;
--   * `opcoes` são montadas pelo CÓDIGO (as tarefas candidatas e "tarefa nova em ..."), nunca texto livre do LLM:
--     cada opção já diz o que acontece se for escolhida, então responder é aplicar, sem chamar o LLM de novo;
--   * `proposta` guarda o que o LLM já tinha extraído do texto (itens, prazo, termos, título): a resposta só decide
--     para onde vai. A fila de perguntas não gasta nada.

CREATE TABLE perguntas (
    id           SERIAL PRIMARY KEY,
    tipo         TEXT NOT NULL CHECK (tipo IN ('destino', 'mesma_tarefa')),
    anotacao_id  INT NOT NULL REFERENCES anotacoes(id) ON DELETE CASCADE,
    texto        TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    opcoes       JSONB NOT NULL CHECK (jsonb_typeof(opcoes) = 'array' AND jsonb_array_length(opcoes) >= 2),
    proposta     JSONB NOT NULL DEFAULT '{}',
    resposta     INT,
    status       TEXT NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila', 'aberta', 'respondida')),
    criada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    respondida_em TIMESTAMPTZ
);

CREATE UNIQUE INDEX perguntas_uma_aberta ON perguntas ((true)) WHERE status = 'aberta';
CREATE INDEX perguntas_fila ON perguntas (id) WHERE status = 'na_fila';
