"""Pauta P4: a sugestão da Pauta dentro da tarefa. Postgres real; só o LLM é simulado.

O que se prova: nada mudou -> a mesma sugestão sem gastar; mudou -> nova (a anterior é substituída); dois cliques não
pagam duas vezes; saída curta e sem repetir o que o chefe descartou; aceitar põe no topo do checklist sem duplicar;
orçamento e falhas."""
from unittest.mock import AsyncMock, patch

import pytest

from agents.pauta.agente import SugestaoPasso
from config import settings
from tests.helpers import registrar_gasto, resultado_agente
from utils.query_executor import executar_query

_ALVO = "resolvers.pauta_sugestao.agente_pauta.sugerir_proximo_passo"


def _llm(passo="Listar os endpoints do SL", como=("Abrir a doc", "Anotar os GET"), por_que="Destrava o mapeamento."):
    return AsyncMock(return_value=resultado_agente(SugestaoPasso(proximo_passo=passo, como=list(como), por_que=por_que)))


def _sql(consulta: str, params=None) -> list[dict]:
    from utils.db import Database
    with Database() as conn:
        conn.execute(consulta, params)
        return conn.fetchall() if conn.get_cur().description else []


@pytest.fixture
def pauta():
    import resolvers.pauta as pauta
    return pauta


@pytest.fixture
def sug():
    import resolvers.pauta_sugestao as sug
    return sug


@pytest.fixture
def tarefa(pauta) -> int:
    frente = executar_query("frentes:listar_ativas")[0]["id"]
    return pauta.criar_tarefa(frente, "Avaliar a API do SL", termos=["SL"])["id"]


class TestSoGastaQuandoMudou:
    async def test_nada_mudou_devolve_a_mesma_sem_chamar(self, sug, tarefa):
        with patch(_ALVO, new=_llm()):
            primeira = await sug.sugerir(tarefa)
        llm = _llm()
        with patch(_ALVO, new=llm):
            segunda = await sug.sugerir(tarefa)
        assert primeira["nova"] is True and segunda["nova"] is False
        assert segunda["sugestao"]["id"] == primeira["sugestao"]["id"] and llm.call_count == 0

    async def test_marcar_um_item_conta_como_mudanca_e_substitui_a_anterior(self, sug, pauta, tarefa):
        item = pauta.adicionar_item(tarefa, "Ler a documentação")
        with patch(_ALVO, new=_llm()):
            primeira = await sug.sugerir(tarefa)
        pauta.atualizar_item(item["id"], feito=True)
        with patch(_ALVO, new=_llm(passo="Mapear os campos de pedidos")):
            segunda = await sug.sugerir(tarefa)
        assert segunda["nova"] is True
        estados = {r["id"]: r["status"] for r in _sql("SELECT id, status FROM sugestoes")}
        assert estados == {primeira["sugestao"]["id"]: "substituida", segunda["sugestao"]["id"]: "ativa"}

    async def test_contexto_novo_da_p3_conta_como_mudanca(self, sug, pauta, tarefa):
        with patch(_ALVO, new=_llm()):
            await sug.sugerir(tarefa)
        t = pauta.registrar_texto("fato novo", tarefa)
        executar_query("contexto:inserir", commit=True, params=(tarefa, "GET /pedidos paginado", [t["id"]], 1))
        llm = _llm(passo="Testar a paginação de pedidos")
        with patch(_ALVO, new=llm):
            assert (await sug.sugerir(tarefa))["nova"] is True
        assert llm.call_count == 1

    async def test_tarefa_fechada_nao_recebe_sugestao(self, sug, pauta, tarefa):
        pauta.mudar_status_tarefa(tarefa, "feita")
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado):
                await sug.sugerir(tarefa)
        assert llm.call_count == 0

    async def test_orcamento_esgotado_nao_chama_nem_reserva(self, sug, pauta, tarefa):
        agente = executar_query("agentes:upsert", returning=True, params=("Pauta", "colaborador", "pauta", None, "{}", 5, 4))
        registrar_gasto(agente[0]["id"], settings.orcamento_diario_usd + 1)
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado):
                await sug.sugerir(tarefa)
        assert llm.call_count == 0 and _sql("SELECT count(*) AS n FROM sugestoes")[0]["n"] == 0


class TestDoisCliques:
    async def test_segundo_clique_durante_a_geracao_nao_paga_de_novo(self, sug, pauta, tarefa):
        executar_query("sugestoes:reservar", returning=True, params=(tarefa, "x"))  # um clique já está gerando
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado, match="pensando"):
                await sug.sugerir(tarefa)
        assert llm.call_count == 0

    async def test_geracao_que_caiu_no_meio_nao_trava_o_botao(self, sug, tarefa):
        executar_query("sugestoes:reservar", returning=True, params=(tarefa, "x"))
        _sql("UPDATE sugestoes SET criada_em = now() - interval '1 hour'")
        with patch(_ALVO, new=_llm()):
            assert (await sug.sugerir(tarefa))["nova"] is True
        assert sorted(r["status"] for r in _sql("SELECT status FROM sugestoes")) == ["ativa", "falhou"]


class TestSaida:
    async def test_cortada_em_codigo(self, sug, tarefa):
        with patch(_ALVO, new=_llm(passo="Fazer " + "x" * 300, como=["a", "b", "c", "d", "e"], por_que="p" * 500)):
            s = (await sug.sugerir(tarefa))["sugestao"]
        assert len(s["proximo_passo"]) <= 100 and s["como"] == ["a", "b", "c"] and len(s["por_que"]) <= 140

    async def test_repetir_a_descartada_falha_e_nao_vira_ativa(self, sug, pauta, tarefa):
        with patch(_ALVO, new=_llm(passo="Listar os endpoints do SL")):
            s = (await sug.sugerir(tarefa))["sugestao"]
        sug.descartar(s["id"])
        llm = _llm(passo="listar endpoints do SL")
        with patch(_ALVO, new=llm):
            with pytest.raises(RuntimeError, match="descartou"):
                await sug.sugerir(tarefa)
        assert "Listar os endpoints do SL" in llm.call_args.args[0]  # foi avisada no pedido
        assert sug.sugestao_ativa(tarefa) is None

    async def test_falha_do_llm_libera_o_botao(self, sug, tarefa):
        with patch(_ALVO, new=AsyncMock(side_effect=RuntimeError("timeout"))):
            with pytest.raises(RuntimeError):
                await sug.sugerir(tarefa)
        assert _sql("SELECT status, erro FROM sugestoes") == [{"status": "falhou", "erro": "timeout"}]
        with patch(_ALVO, new=_llm()):
            assert (await sug.sugerir(tarefa))["nova"] is True

    async def test_segredo_de_item_mascarado(self, sug, pauta, tarefa):
        pauta.adicionar_item(tarefa, "usar api_key=abc123segredo no teste")
        llm = _llm()
        with patch(_ALVO, new=llm):
            await sug.sugerir(tarefa)
        assert "abc123segredo" not in llm.call_args.args[0]


class TestAceitarDescartar:
    async def test_aceitar_poe_no_topo_do_checklist(self, sug, pauta, tarefa):
        pauta.adicionar_item(tarefa, "Mapear campos")
        with patch(_ALVO, new=_llm(passo="Listar os endpoints do SL")):
            s = (await sug.sugerir(tarefa))["sugestao"]
        t = sug.aceitar(s["id"])
        assert [i["texto"] for i in t["checklist"]] == ["Listar os endpoints do SL", "Mapear campos"]
        assert t["sugestao"] is None

    async def test_aceitar_o_que_ja_e_item_sobe_ele_sem_duplicar(self, sug, pauta, tarefa):
        pauta.adicionar_item(tarefa, "Ler a doc")
        pauta.adicionar_item(tarefa, "Listar os endpoints do SL")
        with patch(_ALVO, new=_llm(passo="listar endpoints do SL")):
            s = (await sug.sugerir(tarefa))["sugestao"]
        t = sug.aceitar(s["id"])
        assert [i["texto"] for i in t["checklist"]] == ["Listar os endpoints do SL", "Ler a doc"]

    async def test_resolver_duas_vezes_409_e_inexistente_404(self, client, tarefa):
        with patch(_ALVO, new=_llm()):
            s = client.post(f"/pauta/tarefas/{tarefa}/sugestao").json()["sugestao"]
        assert client.post(f"/pauta/sugestoes/{s['id']}/descartar").status_code == 200
        assert client.post(f"/pauta/sugestoes/{s['id']}/aceitar").status_code == 409
        assert client.post("/pauta/sugestoes/999/aceitar").status_code == 404

    async def test_aparece_na_tarefa_e_rotas(self, client, tarefa):
        assert client.post("/pauta/tarefas/999/sugestao").status_code == 404
        with patch(_ALVO, new=_llm()):
            r = client.post(f"/pauta/tarefas/{tarefa}/sugestao")
        assert r.status_code == 200 and r.json()["nova"] is True
        detalhe = client.get(f"/pauta/tarefas/{tarefa}").json()
        assert detalhe["sugestao"]["proximo_passo"] == "Listar os endpoints do SL"
        with patch(_ALVO, new=AsyncMock(side_effect=RuntimeError("timeout"))):
            client.post(f"/pauta/tarefas/{tarefa}/checklist", json={"texto": "mudou algo"})
            r = client.post(f"/pauta/tarefas/{tarefa}/sugestao")
        assert r.status_code == 422


class TestDesatualizada:
    async def test_sugestao_fica_marcada_como_velha_quando_a_tarefa_muda(self, sug, pauta, tarefa):
        with patch(_ALVO, new=_llm()):
            await sug.sugerir(tarefa)
        assert pauta.obter_tarefa(tarefa)["sugestao"]["atual"] is True
        pauta.adicionar_item(tarefa, "outra coisa")
        sugestao = pauta.obter_tarefa(tarefa)["sugestao"]
        assert sugestao["atual"] is False and "base_hash" not in sugestao
