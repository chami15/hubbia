"""Tick automático (Sprint 2, fase C): o timer do app dispara rodadas sozinho, opt-in, e o BACKEND é quem garante os limites.

Travas, nesta ordem: fora do expediente -> orçamento total esgotado -> máximo de ticks por dia real -> fatia do
orçamento do automático -> intervalo mínimo (a única "mole": o frontend só espera e tenta de novo).
Sem colaboradores cadastrados a rodada não chama LLM, então esta suíte não mocka modelo nenhum."""
from unittest.mock import patch

import pytest

import resolvers.tick as tick
import resolvers.tick_automatico as auto
from tests.helpers import registrar_gasto
from utils.db import Database
from utils.query_executor import executar_query


@pytest.fixture(autouse=True)
def _dentro_do_expediente():
    """Por padrão é horário de expediente; os testes de 'fora' sobrescrevem."""
    with patch("resolvers.relogio.expediente_agora", return_value=True) as p:
        yield p


async def _rodar():
    return await auto.tentar_tick_automatico()


def _envelhecer_ticks(minutos: int):
    """Faz os ticks existentes parecerem de `minutos` atrás (o intervalo é medido por `processado_em`)."""
    with Database() as conn:
        conn.execute("UPDATE ticks SET processado_em = processado_em - make_interval(mins => %s)", (minutos,))


def _agente() -> int:
    return executar_query("agentes:upsert", returning=True, params=("Teste", "colaborador", "teste", None, "{}", 0, 5))[0]["id"]


class TestExecuta:
    async def test_dentro_de_tudo_roda_o_tick_e_a_rodada_e_grava_origem_automatico(self):
        r = await _rodar()

        assert r["executado"] is True
        assert r["tick"]["numero"] == 1 and r["rodada"]["tick"] == 1
        assert tick.obter_tick_atual()["origem"] == "automatico"


class TestTravas:
    async def test_fora_do_expediente_recusa_e_manda_parar(self, _dentro_do_expediente):
        _dentro_do_expediente.return_value = False

        r = await _rodar()

        assert r == {"executado": False, "motivo": "fora_do_expediente", "parar": True, "espera_s": None, "mensagem": r["mensagem"]}
        assert tick.obter_tick_atual() is None  # nada gravado

    async def test_intervalo_minimo_recusa_sem_mandar_parar_e_diz_quanto_esperar(self):
        await _rodar()

        r = await _rodar()

        assert r["executado"] is False and r["motivo"] == "cedo_demais"
        assert r["parar"] is False  # o frontend só espera: jitter de timer não pode desligar o toggle
        assert 1 <= r["espera_s"] <= 300
        assert tick.obter_tick_atual()["numero"] == 1

    async def test_passado_o_intervalo_volta_a_rodar(self):
        await _rodar()
        _envelhecer_ticks(6)

        assert (await _rodar())["executado"] is True

    async def test_maximo_de_ticks_automaticos_por_dia(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "tick_automatico_max_dia", 2)
        for _ in range(2):
            assert (await _rodar())["executado"] is True
            _envelhecer_ticks(6)

        r = await _rodar()

        assert r["motivo"] == "limite_diario" and r["parar"] is True

    async def test_tick_manual_nao_conta_para_o_maximo_do_automatico(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "tick_automatico_max_dia", 1)
        tick.avancar_tick()  # manual
        tick.avancar_tick()  # manual

        assert (await _rodar())["executado"] is True

    async def test_fatia_do_orcamento_do_automatico(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "orcamento_diario_usd", 1.0)
        monkeypatch.setattr(auto.settings, "tick_automatico_fatia_orcamento", 0.75)
        agente = _agente()
        await _rodar()
        registrar_gasto(agente, 0.80, tick=1)  # o automático já gastou 80% do dia
        _envelhecer_ticks(6)

        r = await _rodar()

        assert r["motivo"] == "fatia_orcamento" and r["parar"] is True

    async def test_abaixo_da_fatia_continua_rodando(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "orcamento_diario_usd", 1.0)
        monkeypatch.setattr(auto.settings, "tick_automatico_fatia_orcamento", 0.75)
        agente = _agente()
        await _rodar()
        registrar_gasto(agente, 0.70, tick=1)
        _envelhecer_ticks(6)

        assert (await _rodar())["executado"] is True

    async def test_gasto_do_chefe_nao_entra_na_fatia_do_automatico(self, monkeypatch):
        """Os 25% de reserva existem para o que o chefe pede na hora: gasto manual (ou fora de tick) não esgota o automático."""
        monkeypatch.setattr(auto.settings, "orcamento_diario_usd", 1.0)
        monkeypatch.setattr(auto.settings, "tick_automatico_fatia_orcamento", 0.75)
        agente = _agente()
        tick.avancar_tick()  # tick 1, manual
        registrar_gasto(agente, 0.80, tick=1)  # o chefe gastou 80% sozinho (relatório, Agenda...)
        registrar_gasto(agente, 0.10, tick=None)  # e uma ação fora de tick

        assert (await _rodar())["executado"] is True

    async def test_orcamento_total_esgotado(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "orcamento_diario_usd", 1.0)
        agente = _agente()
        tick.avancar_tick()
        registrar_gasto(agente, 1.0, tick=1)

        r = await _rodar()

        assert r["motivo"] == "orcamento_esgotado" and r["parar"] is True

    async def test_dry_run_nao_conta_gasto(self, monkeypatch):
        monkeypatch.setattr(auto.settings, "orcamento_diario_usd", 1.0)
        agente = _agente()
        await _rodar()
        registrar_gasto(agente, 5.0, tick=1, dry_run=True)
        _envelhecer_ticks(6)

        assert (await _rodar())["executado"] is True


class TestOrdemDasTravas:
    async def test_regressao_motivo_duro_ganha_do_mole(self, _dentro_do_expediente):
        """Se o expediente acabou E o intervalo ainda não passou, o motivo é o expediente (parar), não 'cedo demais'
        (esperar): senão o frontend ficaria tentando de novo a noite inteira."""
        await _rodar()
        _dentro_do_expediente.return_value = False

        r = await _rodar()

        assert r["motivo"] == "fora_do_expediente" and r["parar"] is True


class TestHttp:
    def test_endpoint_executa_e_responde_200(self, client):
        r = client.post("/tick/automatico")
        assert r.status_code == 200 and r.json()["executado"] is True

    def test_recusa_tambem_e_200_com_o_motivo(self, client):
        client.post("/tick/automatico")
        r = client.post("/tick/automatico")
        assert r.status_code == 200
        assert r.json()["executado"] is False and r.json()["motivo"] == "cedo_demais"
