"""`em_transacao`: tudo ou nada. É a base da P2 da Pauta (aplicar um lote sem deixar nada pela metade)."""
import pytest

from utils.query_executor import executar_query
from utils.transacao import em_transacao


def _frente() -> int:
    return executar_query("frentes:listar_com_contagem")[0]["id"]


def _total_tarefas() -> int:
    from utils.db import Database
    with Database() as conn:
        conn.execute("SELECT count(*) AS n FROM tarefas")
        return conn.fetchall()[0]["n"]


def test_confirma_tudo_no_fim():
    with em_transacao() as q:
        q("tarefas:inserir", (_frente(), "A", None, [], "manual"))
        q("tarefas:inserir", (_frente(), "B", None, [], "manual"))
    assert _total_tarefas() == 2


def test_excecao_no_meio_desfaz_o_que_ja_tinha_rodado():
    with pytest.raises(RuntimeError):
        with em_transacao() as q:
            q("tarefas:inserir", (_frente(), "A", None, [], "manual"))
            raise RuntimeError("caiu no meio")
    assert _total_tarefas() == 0


def test_erro_do_banco_no_meio_desfaz_tudo():
    import psycopg
    with pytest.raises(psycopg.Error):
        with em_transacao() as q:
            q("tarefas:inserir", (_frente(), "A", None, [], "manual"))
            q("tarefas:inserir", (_frente(), "   ", None, [], "manual"))  # CHECK: título vazio
    assert _total_tarefas() == 0


def test_devolve_linhas_ou_contagem():
    with em_transacao() as q:
        linhas = q("tarefas:inserir", (_frente(), "A", None, [], "manual"))
        assert isinstance(linhas, list) and linhas[0]["id"]
        assert q("tarefas:tocar", (linhas[0]["id"],)) == 1
