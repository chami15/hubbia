"""Pauta P3: o "o que já se sabe" de cada tarefa. Postgres real; só o LLM é simulado.

O que se prova: só gasta com texto novo; o LLM vê só os tópicos atuais e os textos novos; tópico sem fonte real não
entra; resposta vazia não apaga o que já se sabia; falha não volta sozinha; duas rodadas não consolidam a mesma
tarefa; orçamento e teto do dia valem."""
from unittest.mock import AsyncMock, patch

import pytest

from agents.pauta.agente import ContextoTarefa, TopicoContexto
from config import settings
from tests.helpers import registrar_gasto, resultado_agente
from utils.query_executor import executar_query

_ALVO = "resolvers.pauta_contexto.agente_pauta.consolidar_contexto"
_LONGO = "Endpoints do SL: GET /pedidos lista com paginação, GET /clientes/{id} traz o cadastro, POST /notas emite nota."


def _sql(consulta: str, params=None) -> list[dict]:
    from utils.db import Database
    with Database() as conn:
        conn.execute(consulta, params)
        return conn.fetchall() if conn.get_cur().description else []


def _llm(*topicos):
    return AsyncMock(return_value=resultado_agente(ContextoTarefa(topicos=[TopicoContexto(texto=t, fontes=f) for t, f in topicos])))


def _anotacao(anotacao_id: int) -> dict:
    return _sql("SELECT consolidada_em, consolidando_desde, consolidacao_erro FROM anotacoes WHERE id = %s", (anotacao_id,))[0]


@pytest.fixture
def pauta():
    import resolvers.pauta as pauta
    return pauta


@pytest.fixture
def ctx():
    import resolvers.pauta_contexto as ctx
    return ctx


@pytest.fixture
def agente_pauta() -> int:
    return executar_query("agentes:upsert", returning=True,
                          params=("Pauta", "colaborador", "pauta", None, "{}", 5, 4))[0]["id"]


@pytest.fixture
def tarefa(pauta) -> int:
    frente = executar_query("frentes:listar_ativas")[0]["id"]
    return pauta.criar_tarefa(frente, "Avaliar a API do SL", termos=["SL"])["id"]


def _texto_organizado_pela_p2(pauta, tarefa: int, texto: str) -> int:
    """Simula um texto que passou pela P2 (lido pelo LLM e posto na tarefa)."""
    t = pauta.registrar_texto(texto)
    _sql("UPDATE anotacoes SET status = 'organizada', tarefa_id = %s, lida_em = now(), organizada_em = now() WHERE id = %s",
         (tarefa, t["id"]))
    return t["id"]


class TestSoGastaComTextoNovo:
    async def test_sem_texto_pendente_nao_chama(self, ctx, tarefa):
        llm = _llm()
        with patch(_ALVO, new=llm):
            assert await ctx.consolidar_tarefa(tarefa) is None
            assert await ctx.consolidar_pendentes(respeitar_teto=True) == {"tarefas": 0, "falhas": 0}
        assert llm.call_count == 0

    async def test_texto_da_tarefa_vira_topico_com_fonte_e_nao_e_lido_de_novo(self, ctx, pauta, tarefa):
        t = pauta.registrar_texto("GET /pedidos é paginado", tarefa)  # curto, mas escrito pelo chefe: vale
        with patch(_ALVO, new=_llm(("GET /pedidos: lista com paginação", [t["id"]]))):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        contexto = pauta.obter_tarefa(tarefa)["contexto"]
        assert [(c["texto"], c["fontes"]) for c in contexto] == [("GET /pedidos: lista com paginação", [t["id"]])]
        assert _anotacao(t["id"])["consolidada_em"] is not None
        llm = _llm()
        with patch(_ALVO, new=llm):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        assert llm.call_count == 0

    async def test_lembrete_curto_da_p2_nao_gasta_mas_texto_longo_sim(self, ctx, pauta, tarefa):
        curto = _texto_organizado_pela_p2(pauta, tarefa, "SL: ligar pro João")
        llm = _llm()
        with patch(_ALVO, new=llm):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        assert llm.call_count == 0 and _anotacao(curto)["consolidada_em"] is not None
        longo = _texto_organizado_pela_p2(pauta, tarefa, _LONGO)
        llm = _llm(("GET /pedidos: lista com paginação", [longo]))
        with patch(_ALVO, new=llm):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        assert llm.call_count == 1

    async def test_o_llm_ve_so_os_topicos_atuais_e_os_textos_novos(self, ctx, pauta, tarefa):
        velho = pauta.registrar_texto("texto velho que já virou tópico", tarefa)
        with patch(_ALVO, new=_llm(("Fato velho", [velho["id"]]))):
            await ctx.consolidar_tarefa(tarefa)
        novo = pauta.registrar_texto("texto novo com fato novo", tarefa)
        llm = _llm(("Fato velho", [velho["id"]]), ("Fato novo", [novo["id"]]))
        with patch(_ALVO, new=llm):
            await ctx.consolidar_tarefa(tarefa)
        prompt = llm.call_args.args[0]
        assert "texto novo com fato novo" in prompt and "Fato velho" in prompt
        assert "texto velho que já virou tópico" not in prompt  # histórico não vai de novo
        assert [c["texto"] for c in pauta.obter_tarefa(tarefa)["contexto"]] == ["Fato velho", "Fato novo"]

    async def test_segredo_mascarado(self, ctx, pauta, tarefa):
        pauta.registrar_texto("SL: header Authorization: Bearer abcdefgh12345678xyz", tarefa)
        llm = _llm()
        with patch(_ALVO, new=llm):
            await ctx.consolidar_tarefa(tarefa)
        assert "abcdefgh12345678xyz" not in llm.call_args.args[0]


class TestValidacao:
    async def test_topico_sem_fonte_real_nao_entra(self, ctx, pauta, tarefa):
        t = pauta.registrar_texto("GET /pedidos é paginado", tarefa)
        with patch(_ALVO, new=_llm(("GET /pedidos: paginado", [t["id"]]), ("Usa GraphQL", [999]), ("Prazo sexta", []))):
            await ctx.consolidar_tarefa(tarefa)
        assert [c["texto"] for c in pauta.obter_tarefa(tarefa)["contexto"]] == ["GET /pedidos: paginado"]

    async def test_resposta_vazia_nao_apaga_o_que_ja_se_sabia(self, ctx, pauta, tarefa):
        a = pauta.registrar_texto("fato A", tarefa)
        with patch(_ALVO, new=_llm(("Fato A", [a["id"]]))):
            await ctx.consolidar_tarefa(tarefa)
        b = pauta.registrar_texto("fato B", tarefa)
        with patch(_ALVO, new=_llm(("Inventado", [999]))):
            with pytest.raises(RuntimeError):
                await ctx.consolidar_tarefa(tarefa)
        assert [c["texto"] for c in pauta.obter_tarefa(tarefa)["contexto"]] == ["Fato A"]
        assert _anotacao(b["id"])["consolidacao_erro"] is not None


class TestFalhaNaoVoltaSozinha:
    async def test_falha_marca_erro_e_o_tick_nao_tenta_de_novo(self, ctx, pauta, tarefa):
        t = pauta.registrar_texto(_LONGO, tarefa)
        with patch(_ALVO, new=AsyncMock(side_effect=RuntimeError("Falha ao chamar o modelo: timeout"))):
            resumo = await ctx.consolidar_pendentes(respeitar_teto=True)
        assert resumo == {"tarefas": 0, "falhas": 1}
        estado = _anotacao(t["id"])
        assert "timeout" in estado["consolidacao_erro"] and estado["consolidando_desde"] is None
        assert executar_query("anotacoes:existe_a_consolidar")[0]["existe"] is False
        llm = _llm()
        with patch(_ALVO, new=llm):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        assert llm.call_count == 0

    async def test_texto_novo_ou_o_botao_levam_o_que_falhou_junto(self, ctx, pauta, tarefa, client):
        falhou = pauta.registrar_texto("fato que falhou", tarefa)
        with patch(_ALVO, new=AsyncMock(side_effect=RuntimeError("timeout"))):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        # o botão "atualizar" da tarefa
        llm = _llm(("Fato", [falhou["id"]]))
        with patch(_ALVO, new=llm):
            r = client.post(f"/pauta/tarefas/{tarefa}/contexto")
        assert r.status_code == 200 and r.json()[0]["fontes"] == [falhou["id"]]
        assert "fato que falhou" in llm.call_args.args[0]
        assert _anotacao(falhou["id"])["consolidacao_erro"] is None


class TestReserva:
    async def test_tarefa_reservada_por_outra_rodada_e_pulada(self, ctx, pauta, tarefa):
        pauta.registrar_texto(_LONGO, tarefa)
        executar_query("anotacoes:reservar_para_contexto", returning=True, params={"tarefa_id": tarefa, "minutos": 10})
        llm = _llm()
        with patch(_ALVO, new=llm):
            assert await ctx.consolidar_tarefa(tarefa) is None
        assert llm.call_count == 0

    async def test_reserva_velha_de_rodada_que_caiu_expira(self, ctx, pauta, tarefa):
        t = pauta.registrar_texto("fato", tarefa)
        _sql("UPDATE anotacoes SET consolidando_desde = now() - interval '1 hour' WHERE id = %s", (t["id"],))
        with patch(_ALVO, new=_llm(("Fato", [t["id"]]))):
            await ctx.consolidar_pendentes(respeitar_teto=True)
        assert _anotacao(t["id"])["consolidada_em"] is not None

    async def test_teto_de_caracteres_deixa_o_resto_para_a_proxima(self, ctx, pauta, tarefa, monkeypatch):
        monkeypatch.setattr(settings, "pauta_contexto_max_caracteres", 100)
        a = pauta.registrar_texto("a" * 90, tarefa)
        b = pauta.registrar_texto("b" * 90, tarefa)
        llm = _llm(("Fato a", [a["id"]]))
        with patch(_ALVO, new=llm):
            await ctx.consolidar_tarefa(tarefa)
        assert "a" * 90 in llm.call_args.args[0] and "b" * 90 not in llm.call_args.args[0]
        assert _anotacao(b["id"]) == {"consolidada_em": None, "consolidando_desde": None, "consolidacao_erro": None}


class TestLimites:
    async def test_orcamento_esgotado_libera_a_reserva(self, ctx, pauta, tarefa, agente_pauta):
        t = pauta.registrar_texto("fato", tarefa)
        registrar_gasto(agente_pauta, settings.orcamento_diario_usd + 1)
        llm = _llm()
        with patch(_ALVO, new=llm):
            with pytest.raises(pauta.ConflitoDeEstado):
                await ctx.consolidar_tarefa(tarefa)
        assert llm.call_count == 0 and _anotacao(t["id"])["consolidando_desde"] is None

    async def test_tres_tarefas_por_rodada(self, ctx, pauta):
        frente = executar_query("frentes:listar_ativas")[0]["id"]
        for i in range(5):
            tarefa = pauta.criar_tarefa(frente, f"Tarefa {i}")["id"]
            pauta.registrar_texto(f"fato da tarefa {i}", tarefa)
        llm = AsyncMock(side_effect=lambda prompt: resultado_agente(ContextoTarefa(topicos=[])))
        with patch(_ALVO, new=llm):
            resumo = await ctx.consolidar_pendentes(respeitar_teto=False)
        assert llm.call_count == 3 and resumo["tarefas"] == 3

    async def test_tick_para_no_teto_e_o_botao_nao(self, ctx, pauta, tarefa, agente_pauta, monkeypatch):
        monkeypatch.setattr(settings, "pauta_rodadas_por_dia", 1)
        registrar_gasto(agente_pauta, 0.0001)
        pauta.registrar_texto("fato", tarefa)
        llm = AsyncMock(return_value=resultado_agente(ContextoTarefa(topicos=[])))
        with patch(_ALVO, new=llm):
            await ctx.consolidar_pendentes(respeitar_teto=True)
            assert llm.call_count == 0
            await ctx.consolidar_pendentes(respeitar_teto=False)
            assert llm.call_count == 1


class TestTickERotas:
    async def test_tick_trabalha_so_para_atualizar_contexto(self, pauta, tarefa, agente_pauta):
        import resolvers.interacao as interacao
        import resolvers.tick as tick
        from tests.test_interacao import _criar_chefe
        _criar_chefe()
        tick.avancar_tick()
        t = pauta.registrar_texto("fato", tarefa)
        assert interacao._checar_pauta({"id": agente_pauta}) == {"novas": 0}
        with patch(_ALVO, new=_llm(("Fato", [t["id"]]))):
            resultado = await interacao.processar_tick_completo()
        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agente_pauta)
        assert entrada["tipo"] == "trabalho" and "aviso" not in entrada
        assert [c["texto"] for c in pauta.obter_tarefa(tarefa)["contexto"]] == ["Fato"]

    async def test_organizar_agora_tambem_atualiza_o_contexto(self, client, pauta, tarefa):
        t = pauta.registrar_texto("fato", tarefa)
        with patch(_ALVO, new=_llm(("Fato", [t["id"]]))):
            r = client.post("/pauta/organizar")
        assert r.status_code == 200 and r.json()["contexto"] == {"tarefas": 1, "falhas": 0}

    async def test_rota_atualizar(self, client, pauta, tarefa):
        assert client.post("/pauta/tarefas/999/contexto").status_code == 404
        llm = _llm()
        with patch(_ALVO, new=llm):
            assert client.post(f"/pauta/tarefas/{tarefa}/contexto").json() == []
        assert llm.call_count == 0
