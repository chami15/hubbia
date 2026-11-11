"""Pauta P5: clarear a vista. Postgres real; só o LLM é simulado.

O que se prova: com 0 ou 1 tarefa não gasta; mesma situação no mesmo dia devolve a mesma; o LLM recebe as tarefas já
ordenadas pela conta e com os números prontos; a saída é conferida (id real, um grupo por tarefa, prazo perto nunca
"pode esperar"); só "talvez nem valha" tem ação e só no clique; juntar leva textos, itens e termos sem apagar nada."""
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from agents.pauta.agente import ClarearVista, ItemFoco, ItemTalvez
from config import settings
from tests.helpers import registrar_gasto, resultado_agente
from utils.query_executor import executar_query

_ALVO = "resolvers.pauta_revisao.agente_pauta.clarear_a_vista"


def _llm(foco=(), esperar=(), talvez=()):
    return AsyncMock(return_value=resultado_agente(ClarearVista(
        foco=[ItemFoco(tarefa_id=i, por_que=p) for i, p in foco],
        pode_esperar=[ItemFoco(tarefa_id=i, por_que=p) for i, p in esperar],
        talvez_nem_valha=[ItemTalvez(tarefa_id=i, por_que=p, acao=a, juntar_com=j) for i, p, a, j in talvez],
    )))


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
def rev():
    import resolvers.pauta_revisao as rev
    return rev


@pytest.fixture
def frente() -> int:
    return executar_query("frentes:listar_ativas")[0]["id"]


@pytest.fixture
def tres(pauta, frente, rev):
    hoje = rev._hoje()  # o mesmo "hoje" do código (fuso do chefe): date.today() é UTC e erra o dia à noite
    return {
        "relatorio": pauta.criar_tarefa(frente, "Entregar relatório", prazo=hoje + timedelta(days=1))["id"],
        "api": pauta.criar_tarefa(frente, "Avaliar a API do SL")["id"],
        "curso": pauta.criar_tarefa(frente, "Fazer curso de Rust")["id"],
    }


class TestSoGastaQuandoPrecisa:
    async def test_nenhuma_ou_uma_tarefa_decide_sem_llm(self, rev, pauta, frente):
        llm = _llm()
        with patch(_ALVO, new=llm):
            vazia = (await rev.clarear())["revisao"]
            unica = pauta.criar_tarefa(frente, "Só esta")["id"]
            com_uma = (await rev.clarear())["revisao"]
        assert llm.call_count == 0
        assert vazia["foco"] == [] and [i["tarefa_id"] for i in com_uma["foco"]] == [unica]

    async def test_mesma_situacao_mesmo_dia_devolve_a_mesma(self, rev, tres):
        with patch(_ALVO, new=_llm(foco=[(tres["relatorio"], "vence amanhã")])):
            primeira = await rev.clarear()
        llm = _llm()
        with patch(_ALVO, new=llm):
            segunda = await rev.clarear()
        assert segunda["nova"] is False and segunda["revisao"]["id"] == primeira["revisao"]["id"]
        assert llm.call_count == 0

    async def test_marcar_item_muda_a_situacao_e_a_revisao_fica_velha(self, rev, pauta, tres):
        item = pauta.adicionar_item(tres["api"], "Listar endpoints")
        with patch(_ALVO, new=_llm(foco=[(tres["api"], "x")])):
            await rev.clarear()
        assert rev.obter()["atual"] is True
        pauta.atualizar_item(item["id"], feito=True)
        assert rev.obter()["atual"] is False
        llm = _llm(foco=[(tres["relatorio"], "y")])
        with patch(_ALVO, new=llm):
            assert (await rev.clarear())["nova"] is True
        assert llm.call_count == 1
        assert _sql("SELECT status FROM revisoes ORDER BY id") == [{"status": "substituida"}, {"status": "pronta"}]

    async def test_orcamento_esgotado(self, rev, pauta, tres):
        agente = executar_query("agentes:upsert", returning=True, params=("Pauta", "colaborador", "pauta", None, "{}", 5, 4))
        registrar_gasto(agente[0]["id"], settings.orcamento_diario_usd + 1)
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado):
                await rev.clarear()
        assert llm.call_count == 0 and _sql("SELECT count(*) AS n FROM revisoes")[0]["n"] == 0

    async def test_dois_cliques_nao_pagam_duas_vezes_e_reserva_velha_expira(self, rev, pauta, tres):
        executar_query("revisoes:reservar", returning=True, params=("x",))
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado, match="olhando"):
                await rev.clarear()
        assert llm.call_count == 0
        _sql("UPDATE revisoes SET criada_em = now() - interval '1 hour'")
        with patch(_ALVO, new=_llm()):
            assert (await rev.clarear())["nova"] is True


class TestOQueVaiParaOLlm:
    async def test_ordenadas_pela_conta_com_os_numeros_prontos(self, rev, pauta, tres):
        _sql("UPDATE tarefas SET ultimo_movimento_em = now() - interval '20 days' WHERE id = %s", (tres["curso"],))
        llm = _llm()
        with patch(_ALVO, new=llm):
            await rev.clarear()
        prompt = llm.call_args.args[0]
        posicoes = [prompt.index(f'"id": {tres[k]},') for k in ("relatorio", "curso", "api")]
        assert posicoes == sorted(posicoes)  # vence amanhã, depois parada 20 dias, depois o resto
        assert '"dias_para_o_prazo": 1' in prompt and '"dias_parada": 20' in prompt

    async def test_teto_de_tarefas_no_pedido(self, rev, pauta, frente, monkeypatch):
        monkeypatch.setattr(settings, "pauta_revisao_tarefas_no_prompt", 2)
        for i in range(5):
            pauta.criar_tarefa(frente, f"Tarefa {i}")
        llm = _llm()
        with patch(_ALVO, new=llm):
            await rev.clarear()
        assert llm.call_args.args[0].count('"id":') == 2


class TestSaidaConferida:
    async def test_id_inventado_repetido_e_prazo_perto_em_pode_esperar(self, rev, tres):
        llm = _llm(foco=[(tres["api"], "a"), (999, "inventada")],
                   esperar=[(tres["api"], "repetida"), (tres["relatorio"], "vence amanhã, mas pode esperar?"),
                            (tres["curso"], "sem prazo")])
        with patch(_ALVO, new=llm):
            r = (await rev.clarear())["revisao"]
        assert [i["tarefa_id"] for i in r["foco"]] == [tres["api"]]
        assert [i["tarefa_id"] for i in r["pode_esperar"]] == [tres["curso"]]

    async def test_falha_do_llm_registra_e_libera(self, rev, tres):
        with patch(_ALVO, new=AsyncMock(side_effect=RuntimeError("timeout"))):
            with pytest.raises(RuntimeError):
                await rev.clarear()
        assert _sql("SELECT status, erro FROM revisoes") == [{"status": "falhou", "erro": "timeout"}]
        assert rev.obter() is None
        with patch(_ALVO, new=_llm()):
            assert (await rev.clarear())["nova"] is True


class TestAcoes:
    async def _revisao(self, rev, **kw):
        with patch(_ALVO, new=_llm(**kw)):
            return (await rev.clarear())["revisao"]

    async def test_foco_nao_tem_acao_mas_pode_ser_dispensado(self, rev, pauta, tres, client):
        r = await self._revisao(rev, foco=[(tres["api"], "a")])
        item = r["foco"][0]["id"]
        assert client.post(f"/pauta/revisao/itens/{item}/aceitar").status_code == 409
        depois = client.post(f"/pauta/revisao/itens/{item}/descartar").json()
        assert depois["foco"] == [] and pauta.obter_tarefa(tres["api"])["status"] == "aberta"

    async def test_arquivar_so_no_clique(self, rev, pauta, tres):
        r = await self._revisao(rev, talvez=[(tres["curso"], "parada há 40 dias", "arquivar", None)])
        assert pauta.obter_tarefa(tres["curso"])["status"] == "aberta"  # a revisão sozinha não mexe em nada
        rev.aceitar_item(r["talvez_nem_valha"][0]["id"])
        assert pauta.obter_tarefa(tres["curso"])["status"] == "arquivada"

    async def test_juntar_leva_textos_itens_termos_e_prazo_sem_apagar(self, rev, pauta, frente):
        fica = pauta.criar_tarefa(frente, "Avaliar a API do SL", termos=["SL"], prazo=date(2030, 5, 1))["id"]
        sai = pauta.criar_tarefa(frente, "Ver endpoints do SL", termos=["endpoints"], prazo=date(2030, 3, 1))["id"]
        pauta.adicionar_item(fica, "Listar endpoints")
        pauta.adicionar_item(sai, "listar os endpoints")   # repetido: fica na deixada de lado
        pauta.adicionar_item(sai, "Testar paginação")      # novo: vai
        texto = pauta.registrar_texto("GET /pedidos paginado", sai)
        executar_query("anotacoes:marcar_consolidadas", commit=True, params=([texto["id"]],))
        r = await self._revisao(rev, talvez=[(sai, "é a mesma coisa", "juntar", fica)])
        rev.aceitar_item(r["talvez_nem_valha"][0]["id"])

        destino = pauta.obter_tarefa(fica)
        assert [i["texto"] for i in destino["checklist"]] == ["Listar endpoints", "Testar paginação"]
        assert destino["termos"] == ["SL", "endpoints"] and destino["prazo"] == date(2030, 3, 1)
        assert [t["texto"] for t in destino["textos"]] == ["GET /pedidos paginado"]
        # o texto volta a contar como novo para o contexto da que fica (P3)
        assert _sql("SELECT consolidada_em FROM anotacoes WHERE id = %s", (texto["id"],))[0]["consolidada_em"] is None
        origem = pauta.obter_tarefa(sai)
        assert origem["status"] == "arquivada" and [i["texto"] for i in origem["checklist"]] == ["listar os endpoints"]

    async def test_tarefa_concluida_depois_da_revisao_nao_vira_deixada_de_lado(self, rev, pauta, tres):
        # o chefe concluiu a tarefa depois da revisão: aceitar o "arquivar" velho trocaria "feita" por "arquivada"
        r = await self._revisao(rev, talvez=[(tres["curso"], "parada", "arquivar", None)])
        pauta.mudar_status_tarefa(tres["curso"], "feita")
        with pytest.raises(pauta.ConflitoDeEstado):
            rev.aceitar_item(r["talvez_nem_valha"][0]["id"])
        assert pauta.obter_tarefa(tres["curso"])["status"] == "feita"

    async def test_juntar_com_tarefa_que_fechou_depois_falha_sem_mexer(self, rev, pauta, tres):
        r = await self._revisao(rev, talvez=[(tres["curso"], "duplicada", "juntar", tres["api"])])
        pauta.mudar_status_tarefa(tres["api"], "feita")
        with pytest.raises(pauta.ConflitoDeEstado):
            rev.aceitar_item(r["talvez_nem_valha"][0]["id"])
        assert pauta.obter_tarefa(tres["curso"])["status"] == "aberta"

    async def test_resolver_duas_vezes_409_e_rotas(self, rev, tres, client):
        assert client.get("/pauta/revisao").json() is None
        with patch(_ALVO, new=_llm(talvez=[(tres["curso"], "parada", "arquivar", None)])):
            r = client.post("/pauta/revisao")
        assert r.status_code == 200 and r.json()["nova"] is True
        item = r.json()["revisao"]["talvez_nem_valha"][0]
        assert item["titulo"] == "Fazer curso de Rust" and item["acao"] == "arquivar"
        assert client.post(f"/pauta/revisao/itens/{item['id']}/aceitar").status_code == 200
        assert client.post(f"/pauta/revisao/itens/{item['id']}/aceitar").status_code == 409
        assert client.post("/pauta/revisao/itens/999/descartar").status_code == 404
