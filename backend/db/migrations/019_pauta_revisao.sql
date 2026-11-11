-- Migration 019 — Pauta, fase P5: "clarear a vista" (foco, pode esperar, talvez nem valha). Só por clique.
-- Decisões:
--   * `base_hash` = impressão de TODAS as tarefas abertas + a data de hoje: mesma situação no mesmo dia devolve a mesma
--     revisão sem chamar o LLM. No dia seguinte o "parada há N dias" mudou, então pode pedir de novo;
--   * `gerando` reserva a vez (dois cliques não pagam duas chamadas), como na P4;
--   * itens apontam para tarefas; só `talvez_nem_valha` tem ação (deixar de lado ou juntar com outra), e só depois do
--     clique do chefe. "Adiar" do desenho saiu: "pode esperar" já diz isso sem inventar um estado novo.

CREATE TABLE revisoes (
    id         SERIAL PRIMARY KEY,
    status     TEXT NOT NULL DEFAULT 'gerando' CHECK (status IN ('gerando', 'pronta', 'substituida', 'falhou')),
    base_hash  TEXT NOT NULL,
    erro       TEXT,
    criada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX revisoes_uma_gerando ON revisoes ((true)) WHERE status = 'gerando';
CREATE UNIQUE INDEX revisoes_uma_pronta ON revisoes ((true)) WHERE status = 'pronta';

CREATE TABLE revisao_itens (
    id           SERIAL PRIMARY KEY,
    revisao_id   INT  NOT NULL REFERENCES revisoes(id) ON DELETE CASCADE,
    grupo        TEXT NOT NULL CHECK (grupo IN ('foco', 'pode_esperar', 'talvez_nem_valha')),
    tarefa_id    INT  NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    por_que      TEXT NOT NULL,
    acao         TEXT CHECK (acao IN ('arquivar', 'juntar')),
    juntar_com   INT REFERENCES tarefas(id) ON DELETE SET NULL,
    ordem        INT  NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'descartado')),
    CONSTRAINT revisao_acao_so_no_talvez CHECK (acao IS NULL OR grupo = 'talvez_nem_valha'),
    CONSTRAINT revisao_juntar_tem_destino CHECK (acao <> 'juntar' OR juntar_com IS NOT NULL)
);

CREATE INDEX revisao_itens_da_revisao ON revisao_itens (revisao_id, grupo, ordem);
