"""Configuração compartilhada da suíte de testes.

Reaproveita o MESMO Postgres do `docker-compose.yml` (o que você já sobe
com `docker compose up -d` pro dia a dia) — não sobe nenhum container
novo, só cria um banco separado (`<banco_normal>_test`) dentro dele, pra
nunca encostar no banco de desenvolvimento de verdade. No CI
(.github/workflows/ci.yml) o "banco de sempre" é o serviço `postgres` do
próprio runner, apontado por DATABASE_URL: a mesma estratégia serve.
"""
import pathlib

import psycopg
import pytest
from fastapi.testclient import TestClient

import config

# Precisa mudar a URL ANTES de qualquer resolver/router ser importado, pra
# garantir que o pool de conexões (utils/connection.py, criado só na
# primeira query) nasça já apontando pro banco de teste, nunca pro banco
# de desenvolvimento real.
_base, _, _nome_banco = config.settings.database_url.rpartition("/")
NOME_BANCO_TESTE = f"{_nome_banco}_test"
DATABASE_URL_TESTE = f"{_base}/{NOME_BANCO_TESTE}"
DATABASE_URL_MANUTENCAO = f"{_base}/postgres"

config.settings.database_url = DATABASE_URL_TESTE

MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "db" / "migrations"

# Toda tabela de domínio criada pelas migrations — truncada entre testes
# pra nenhum depender de estado deixado por outro (isolamento).
_TABELAS = [
    "agentes", "memorias", "relacionamentos", "mensagens", "eventos_mundo",
    "ticks", "tick_execucoes", "relogio_mundo",
    "extratos_importados", "transacoes", "relatorios_financeiros",
    "acoes_pendentes", "conversa_agenda",
    "perfil_saude", "peso_historico", "hidratacao_historico", "sono_historico",
    "atividades_fisicas", "refeicoes", "ficha_treino_dias", "ficha_treino_exercicios",
    "planos_dieta", "relatorios_saude",
    "projetos", "cards",
]


@pytest.fixture(scope="session", autouse=True)
def banco_de_teste():
    """Roda uma vez pra sessão inteira de teste: recria o banco de teste
    do zero (sem dado de rodada anterior) e aplica todas as migrations."""
    conn = psycopg.connect(DATABASE_URL_MANUTENCAO)
    conn.autocommit = True
    try:
        conn.execute(f'DROP DATABASE IF EXISTS "{NOME_BANCO_TESTE}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{NOME_BANCO_TESTE}"')
    finally:
        conn.close()

    conn = psycopg.connect(DATABASE_URL_TESTE)
    conn.autocommit = True
    try:
        for arquivo in sorted(MIGRATIONS_DIR.glob("*.sql")):
            conn.execute(arquivo.read_text(encoding="utf-8"))
    finally:
        conn.close()

    yield

    from utils.connection import close_pool
    close_pool()


@pytest.fixture(autouse=True)
def limpar_tabelas():
    """Roda ANTES de cada teste — garante isolamento sem precisar recriar
    o banco (recriar o banco a cada teste seria lento demais)."""
    from utils.db import Database

    with Database() as conn:
        conn.execute(f"TRUNCATE {', '.join(_TABELAS)} RESTART IDENTITY CASCADE")
        conn.commit()
    yield


@pytest.fixture
def client() -> TestClient:
    from main import app

    return TestClient(app)


@pytest.fixture
def agente_agenda_id() -> int:
    """Cria só o agente 'agenda' (mínimo que o resolver do Agenda precisa
    — ele busca por especialidade). Não usa scripts.seed inteiro porque
    a maioria dos testes de outros domínios não precisa de nenhum agente
    cadastrado."""
    from utils.query_executor import executar_query

    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=("Agenda", "colaborador", "agenda", None, "{}", 1, 5),
    )
    return rows[0]["id"]
