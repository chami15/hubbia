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
