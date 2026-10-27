-- Migration 013 — relógio do mundo (Sprint 2, fase C).
--
-- A hora do mundo NÃO é gravada a cada tick: é uma conta sobre o tempo real,
--   hora_do_mundo = ancora_mundo + (agora_real - ancora_real) * fator
-- Por isso o relógio anda sozinho, de graça e sem processo rodando (o frontend faz a mesma conta).
-- Esta tabela só guarda o ponto de partida e a velocidade. Trocar o fator REANCORA na hora atual
-- do mundo, senão o céu daria um salto.
--
-- Singleton (uma linha só, como `perfil_saude`): é o relógio do hub inteiro, de uma pessoa só.
CREATE TABLE relogio_mundo (
    id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ancora_real  TIMESTAMPTZ NOT NULL,
    ancora_mundo TIMESTAMPTZ NOT NULL,
    fator        DOUBLE PRECISION NOT NULL CHECK (fator > 0 AND fator <= 1440)
);
