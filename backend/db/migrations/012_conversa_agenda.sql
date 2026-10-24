-- Migration 012 — histórico do chat do Agenda.
--
-- Antes a conversa vivia só no estado do React e sumia ao fechar o painel (só a pendência voltava,
-- do servidor). A tabela `mensagens` NÃO serve: é da camada social entre agentes, com tick,
-- remetente e destinatário; misturar o chat do chefe ali poluiria o mural e as regras sociais.
--
-- `acao_pendente_id` só é preenchido nas PROPOSTAS (as que têm botão confirmar/rejeitar): é o que
-- faz os botões voltarem na bolha certa depois do reload. Pergunta (aguardando_info) fica sem.
CREATE TABLE conversa_agenda (
    id               SERIAL PRIMARY KEY,
    de               TEXT NOT NULL CHECK (de IN ('chefe', 'agente')),
    texto            TEXT NOT NULL,
    acao_pendente_id INT REFERENCES acoes_pendentes(id),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversa_agenda_criado_em ON conversa_agenda (criado_em, id);
