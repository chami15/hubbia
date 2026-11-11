-- Migration 017 — Pauta, fase P3: "o que já se sabe" de cada tarefa, em tópicos curtos (docs/pauta-desenho.md).
-- Decisões:
--   * tópicos em tabela, com `fontes` (os textos de onde cada um saiu): o chefe confere se nada foi inventado.
--     A coluna `tarefas.contexto` (text[], da 015) não guarda a origem e fica SEM USO a partir daqui: foi criada
--     cedo demais, que é justamente o motivo de cada fase trazer a própria migration;
--   * `anotacoes.consolidada_em` é o "já entrou no contexto?", como o `status` é o "já li?" da P2: sem texto
--     pendente, o tick não chama nada;
--   * `consolidando_desde` reserva os textos durante a chamada (tick e botão juntos não consolidam a mesma tarefa
--     duas vezes); reserva velha (processo que caiu) expira;
--   * `consolidacao_erro`: chamada que falhou NÃO volta sozinha (seria retentativa automática). O texto só entra de
--     novo quando chegar outro texto para a mesma tarefa ou quando o chefe pedir.

CREATE TABLE contexto_topicos (
    id           SERIAL PRIMARY KEY,
    tarefa_id    INT  NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    texto        TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    fontes       INT[] NOT NULL CHECK (cardinality(fontes) > 0),
    ordem        INT  NOT NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contexto_por_tarefa ON contexto_topicos (tarefa_id, ordem);

ALTER TABLE anotacoes
    ADD COLUMN consolidada_em      TIMESTAMPTZ,
    ADD COLUMN consolidando_desde  TIMESTAMPTZ,
    ADD COLUMN consolidacao_erro   TEXT;

-- textos que já existem antes da P3 entram no contexto na primeira rodada (nada se perde)
CREATE INDEX anotacoes_a_consolidar ON anotacoes (tarefa_id)
    WHERE consolidada_em IS NULL AND tarefa_id IS NOT NULL AND status = 'organizada';
