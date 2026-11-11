-- Migration 015 — agente Pauta (secretário pessoal), fase P1: textos crus, tarefas por frente e checklist.
-- Desenho completo: docs/pauta-desenho.md. Decisões desta migration:
--   * cada fase traz a própria migration: `perguntas` nasce com a P2 e `sugestoes` com a P4. Criar tudo agora
--     travaria o desenho antes do uso real (migration aplicada nunca se edita; ajuste viraria migration de correção);
--   * o texto cru (`anotacoes.texto`) nunca é apagado nem reescrito: a organização pode errar, o original fica;
--   * `anotacoes.status` é o "já li?": o tick só olha `nova` (índice parcial abaixo), então sem texto novo a
--     checagem custa uma consulta e nenhuma chamada de LLM. Os outros estados nascem aqui porque são valores da
--     mesma coluna (o CHECK não muda depois), mas só a P2 os usa;
--   * prioridade não é coluna: é calculada na hora (prazo, tempo parada), igual ao "estagnado" do Norte;
--   * `oculta` é separada do `status`: ocultar é arrumação da tela (decisão do chefe), não muda o que aconteceu
--     com a tarefa. Só tarefa feita ou deixada de lado pode ser ocultada (o resolver garante; o CHECK é a rede);
--   * frentes em tabela (não CHECK): frente nova depois é um INSERT. As três fixas nascem aqui, porque são parte
--     do modelo, não dado de exemplo.

CREATE TABLE frentes (
    id      SERIAL PRIMARY KEY,
    nome    TEXT NOT NULL UNIQUE,
    ordem   INT  NOT NULL DEFAULT 0,
    ativa   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO frentes (nome, ordem) VALUES ('trabalho', 1), ('faculdade', 2), ('pessoal', 3)
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE tarefas (
    id                   SERIAL PRIMARY KEY,
    frente_id            INT  NOT NULL REFERENCES frentes(id),
    titulo               TEXT NOT NULL CHECK (length(btrim(titulo)) > 0),
    prazo                DATE,
    status               TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'feita', 'arquivada')),
    -- palavras que identificam a tarefa ("SL", "hubbia", "TCC"): é o que separa duas "APIs" de frentes diferentes
    termos               TEXT[] NOT NULL DEFAULT '{}',
    -- "o que já se sabe" (P3): tópicos curtos
    contexto             TEXT[],
    origem               TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('agente', 'manual')),
    criada_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- qualquer coisa que o chefe ou a Pauta fizeram nela (item marcado, texto novo): base do "parada há N dias"
    ultimo_movimento_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluida_em         TIMESTAMPTZ,
    oculta               BOOLEAN NOT NULL DEFAULT false,
    ocultada_em          TIMESTAMPTZ,
    CONSTRAINT tarefas_so_oculta_terminada CHECK (NOT oculta OR status IN ('feita', 'arquivada'))
);

CREATE INDEX tarefas_por_frente ON tarefas (frente_id, status) WHERE NOT oculta;

CREATE TABLE anotacoes (
    id                 SERIAL PRIMARY KEY,
    texto              TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    -- minúsculas, sem acento, pontuação ou espaço sobrando: acha o texto repetido sem LLM (P2)
    texto_normalizado  TEXT NOT NULL,
    tarefa_id          INT REFERENCES tarefas(id) ON DELETE SET NULL,
    status             TEXT NOT NULL DEFAULT 'nova'
                         CHECK (status IN ('nova', 'lendo', 'aguardando_voce', 'organizada', 'duplicada', 'falhou')),
    erro               TEXT,
    duplicada_de       INT REFERENCES anotacoes(id) ON DELETE SET NULL,
    recebida_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- quando a Pauta leu (P2). Texto escrito dentro de uma tarefa nunca é "lido": já nasce organizado
    lida_em            TIMESTAMPTZ,
    organizada_em      TIMESTAMPTZ
);

-- o tick pergunta "tem texto novo?" a cada rodada: com este índice a resposta não varre a tabela
CREATE INDEX anotacoes_novas ON anotacoes (recebida_em) WHERE status = 'nova';
CREATE INDEX anotacoes_por_tarefa ON anotacoes (tarefa_id, recebida_em DESC);

CREATE TABLE checklist_itens (
    id         SERIAL PRIMARY KEY,
    tarefa_id  INT  NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    texto      TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    ordem      INT  NOT NULL DEFAULT 0,
    feito      BOOLEAN NOT NULL DEFAULT false,
    feito_em   TIMESTAMPTZ,
    -- item do chefe (manual) nunca é alterado pela Pauta; ela só acrescenta (P2)
    origem     TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('agente', 'manual')),
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX checklist_por_tarefa ON checklist_itens (tarefa_id, ordem);
