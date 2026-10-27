"""Relógio do mundo (Sprint 2, fase C): a hora do mundo é uma CONTA sobre o tempo real, sem agendador.

hora_do_mundo = ancora_mundo + (agora_real - ancora_real) * fator

Zero LLM aqui. Todas as funções recebem `agora` para o teste não depender do relógio da máquina."""
from datetime import datetime, timedelta, timezone

import pytest

import resolvers.relogio as relogio

UTC = timezone.utc
ANCORA_REAL = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)
ANCORA_MUNDO = datetime(2026, 10, 27, 9, 0, tzinfo=UTC)


class TestConta:
    def test_fator_24_um_minuto_real_sao_24_minutos_do_mundo(self):
        h = relogio.hora_do_mundo(ANCORA_REAL + timedelta(minutes=1), ANCORA_REAL, ANCORA_MUNDO, 24)
        assert h == ANCORA_MUNDO + timedelta(minutes=24)

    def test_fator_24_uma_hora_real_e_um_dia_do_mundo(self):
        h = relogio.hora_do_mundo(ANCORA_REAL + timedelta(hours=1), ANCORA_REAL, ANCORA_MUNDO, 24)
        assert h == ANCORA_MUNDO + timedelta(days=1)

    def test_fator_1_e_tempo_real(self):
        h = relogio.hora_do_mundo(ANCORA_REAL + timedelta(minutes=37), ANCORA_REAL, ANCORA_MUNDO, 1)
        assert h == ANCORA_MUNDO + timedelta(minutes=37)

    def test_no_instante_da_ancora_a_hora_e_a_da_ancora(self):
        assert relogio.hora_do_mundo(ANCORA_REAL, ANCORA_REAL, ANCORA_MUNDO, 24) == ANCORA_MUNDO

    def test_atravessa_a_meia_noite(self):
        h = relogio.hora_do_mundo(ANCORA_REAL + timedelta(minutes=45), ANCORA_REAL, ANCORA_MUNDO, 24)  # 9h + 18h = 3h do dia seguinte
        assert (h.day, h.hour) == (28, 3)

    def test_fracao_de_segundo_nao_se_perde(self):
        h = relogio.hora_do_mundo(ANCORA_REAL + timedelta(seconds=2.5), ANCORA_REAL, ANCORA_MUNDO, 24)
        assert h == ANCORA_MUNDO + timedelta(seconds=60)


class TestExpediente:
    """Expediente: 9h às 18h DO MUNDO, no fuso do chefe (config), todos os dias."""

    @pytest.mark.parametrize(
        "hora,esperado",
        [(0, False), (8, False), (9, True), (13, True), (17, True), (18, False), (23, False)],
    )
    def test_faixa_de_9_as_18_inicio_inclusive_fim_exclusivo(self, hora, esperado):
        from zoneinfo import ZoneInfo
        h = datetime(2026, 10, 27, hora, 30, tzinfo=ZoneInfo("America/Sao_Paulo"))
        assert relogio.em_expediente(h) is esperado

    def test_le_a_hora_no_fuso_do_chefe_nao_em_utc(self):
        # 12:00 UTC = 09:00 em São Paulo: já é expediente; 11:59 UTC (08:59) não
        assert relogio.em_expediente(datetime(2026, 10, 27, 12, 0, tzinfo=UTC)) is True
        assert relogio.em_expediente(datetime(2026, 10, 27, 11, 59, tzinfo=UTC)) is False

    def test_todos_os_dias_sao_iguais_sem_fim_de_semana(self):
        from zoneinfo import ZoneInfo
        sabado = datetime(2026, 10, 31, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
        domingo = datetime(2026, 11, 1, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
        assert sabado.weekday() == 5 and domingo.weekday() == 6
        assert relogio.em_expediente(sabado) and relogio.em_expediente(domingo)

    def test_horas_vem_do_config(self, monkeypatch):
        from zoneinfo import ZoneInfo
        monkeypatch.setattr(relogio.settings, "expediente_inicio", 10)
        monkeypatch.setattr(relogio.settings, "expediente_fim", 12)
        assert relogio.em_expediente(datetime(2026, 10, 27, 9, 30, tzinfo=ZoneInfo("America/Sao_Paulo"))) is False
        assert relogio.em_expediente(datetime(2026, 10, 27, 11, 30, tzinfo=ZoneInfo("America/Sao_Paulo"))) is True

    def test_expediente_agora_usa_a_hora_do_mundo(self):
        """Fator 24: 1 min real = 24 min do mundo. Começando às 10h do mundo, o expediente acaba (18h) 8h depois,
        ou seja, 20 min reais depois."""
        from datetime import timedelta
        from zoneinfo import ZoneInfo
        t0 = datetime(2026, 10, 27, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))  # real e mundo começam às 10h
        relogio.obter_relogio(agora=t0)
        assert relogio.expediente_agora(agora=t0) is True
        assert relogio.expediente_agora(agora=t0 + timedelta(minutes=19)) is True    # mundo 17:36
        assert relogio.expediente_agora(agora=t0 + timedelta(minutes=20)) is False   # mundo 18:00, fim exclusivo


class TestBanco:
    def test_primeira_leitura_cria_o_relogio_com_o_fator_do_config(self):
        r = relogio.obter_relogio(agora=ANCORA_REAL)
        assert r["fator"] == 24
        assert r["ancora_real"] == ANCORA_REAL
        # começa igual à hora real (o céu bate com o do chefe no primeiro instante); depois acelera
        assert r["ancora_mundo"] == ANCORA_REAL

    def test_leituras_seguintes_devolvem_o_mesmo_relogio_sem_duplicar(self):
        relogio.obter_relogio(agora=ANCORA_REAL)
        r2 = relogio.obter_relogio(agora=ANCORA_REAL + timedelta(hours=5))
        assert r2["ancora_real"] == ANCORA_REAL  # não reancorou
        from utils.query_executor import executar_query
        assert len(executar_query("relogio_mundo:buscar")) == 1

    def test_trocar_o_fator_nao_da_salto_na_hora_do_mundo(self):
        """Reancorar na hora atual do mundo: sem isso, passar de 24 para 12 faria o céu pular várias horas."""
        relogio.obter_relogio(agora=ANCORA_REAL)
        t = ANCORA_REAL + timedelta(minutes=30)
        antes = relogio.hora_atual(agora=t)

        relogio.definir_fator(12, agora=t)
        depois = relogio.hora_atual(agora=t)

        assert antes == depois
        # e daí em diante anda na velocidade nova: 10 min reais a fator 12 = 120 min do mundo
        assert relogio.hora_atual(agora=t + timedelta(minutes=10)) == antes + timedelta(minutes=120)

    @pytest.mark.parametrize("fator", [0, -1, 1441])
    def test_fator_fora_da_faixa_e_recusado(self, fator):
        with pytest.raises(ValueError):
            relogio.definir_fator(fator)


class TestFuso:
    def test_regressao_horarios_saem_no_fuso_do_chefe_nao_em_utc(self):
        """O banco devolve timestamptz em UTC. Sem converter, o frontend lia a hora do dia em UTC: o céu e o
        'dormindo' ficavam 3 horas errados para quem está em America/Sao_Paulo."""
        agora = datetime(2026, 10, 27, 15, 0, tzinfo=UTC)  # 12h em São Paulo

        d = relogio.descrever(agora=agora)

        assert d["ancora_mundo"].endswith("-03:00") and d["ancora_real"].endswith("-03:00")
        assert d["ancora_mundo"].startswith("2026-10-27T12:00:00")
        assert d["hora_do_mundo"].startswith("2026-10-27T12:00:00")


class TestHttp:
    def test_get_relogio_traz_tudo_que_o_frontend_precisa_para_calcular_sozinho(self, client):
        r = client.get("/relogio")
        assert r.status_code == 200
        corpo = r.json()
        assert set(corpo) == {"ancora_real", "ancora_mundo", "fator", "agora_real", "hora_do_mundo"}
        assert corpo["fator"] == 24

    def test_trocar_o_fator_pelo_endpoint(self, client):
        client.get("/relogio")
        r = client.put("/relogio/fator", json={"fator": 12})
        assert r.status_code == 200 and r.json()["fator"] == 12
        assert client.get("/relogio").json()["fator"] == 12

    def test_fator_invalido_vira_422(self, client):
        assert client.put("/relogio/fator", json={"fator": 0}).status_code == 422
        assert client.put("/relogio/fator", json={"fator": 5000}).status_code == 422
