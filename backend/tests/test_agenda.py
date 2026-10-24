"""Testes do domínio Agenda: TTL de pendência esquecida, consulta
determinística de pendência aberta, fechamento de pendência órfã ao
continuar negociação, e o roteamento de processar_mensagem."""
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

import resolvers.agenda as agenda
from utils.query_executor import executar_query


class FakeDecisao:
    def __init__(self, tipo, mensagem, acao=None, payload=None):
        self.tipo = tipo
        self.mensagem = mensagem
        self.acao = acao
        self.payload = payload


class TestConsultaDePendencia:
    def test_sem_nenhuma_pendencia(self, agente_agenda_id):
        resultado = agenda._responder_pendencia_atual(agente_agenda_id)
        assert resultado["acao_pendente_id"] is None
        assert "não tem nenhuma pendência" in resultado["mensagem"]

    def test_com_pendencia_aguardando_info(self, agente_agenda_id):
        executar_query(
            "acoes_pendentes:inserir",
            returning=True,
            params=(agente_agenda_id, "aguardando_info", "Qual dia?", '{"pedido_original": "marcar jantar"}'),
        )
        resultado = agenda._responder_pendencia_atual(agente_agenda_id)
        assert resultado["aguardando_confirmacao"] is False
        assert "esperando você responder" in resultado["mensagem"]

    def test_com_proposta_aguardando_confirmacao(self, agente_agenda_id):
        executar_query(
            "acoes_pendentes:inserir",
            returning=True,
            params=(agente_agenda_id, "criar_evento", "Jantar sábado 20h. Confirma?", '{"pedido_original": "x"}'),
        )
        resultado = agenda._responder_pendencia_atual(agente_agenda_id)
        assert resultado["aguardando_confirmacao"] is True

    async def test_consulta_e_respondida_mesmo_com_pendencia_aberta(self, agente_agenda_id):
        executar_query(
            "acoes_pendentes:inserir",
            returning=True,
            params=(agente_agenda_id, "criar_evento", "Jantar sábado 20h. Confirma?", '{"pedido_original": "x"}'),
        )
        resultado = await agenda.processar_mensagem("qual pendência em aberto?")
        assert resultado["aguardando_confirmacao"] is True


class TestTTLDePendencia:
    def test_pendencia_expira_sozinha_apos_ttl(self, agente_agenda_id):
        rows = executar_query(
            "acoes_pendentes:inserir",
            returning=True,
            params=(agente_agenda_id, "aguardando_info", "Qual dia?", '{"pedido_original": "x"}'),
        )
        pendente_id = rows[0]["id"]

        # força o criado_em pra fora do TTL
        from utils.db import Database
        with Database() as conn:
            conn.execute(
                "UPDATE acoes_pendentes SET criado_em = now() - interval '999 minutes' WHERE id = %s",
                (pendente_id,),
            )
            conn.commit()

        assert agenda._pendente_aberta(agente_agenda_id) is None

        status = executar_query("acoes_pendentes:buscar_por_id", params=(pendente_id,))[0]["status"]
        assert status == "expirado"


class TestFluxoDeNegociacao:
    async def test_resposta_livre_fecha_pendencia_anterior_antes_de_abrir_a_proxima(self, agente_agenda_id):
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=FakeDecisao("pergunta", "Qual dia?"))):
            primeira = await agenda.processar_mensagem("quero marcar um jantar")
        primeiro_id = primeira["acao_pendente_id"]

        nova_decisao = FakeDecisao(
            "proposta", "Jantar sábado 20h. Confirma?", acao="criar_evento",
            payload={"titulo": "Jantar", "inicio_iso": "2026-01-01T20:00:00", "fim_iso": "2026-01-01T22:00:00"},
        )
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=nova_decisao)):
            segunda = await agenda.processar_mensagem("sábado")

        status_primeira = executar_query("acoes_pendentes:buscar_por_id", params=(primeiro_id,))[0]["status"]
        assert status_primeira == "expirado"
        assert segunda["aguardando_confirmacao"] is True

    async def test_confirmar_dispara_acao_real_e_fecha_pendencia(self, agente_agenda_id):
        decisao = FakeDecisao(
            "proposta", "Jantar sábado 20h. Confirma?", acao="criar_evento",
            payload={"titulo": "Jantar", "inicio_iso": "2026-01-01T20:00:00", "fim_iso": "2026-01-01T22:00:00"},
        )
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=decisao)):
            proposta = await agenda.processar_mensagem("quero marcar um jantar sábado")

        with patch("resolvers.agenda.google_calendar.criar_evento_real", return_value={"id": "evt123"}):
            resultado = await agenda.processar_mensagem("sim")

        assert resultado["resultado"] == {"id": "evt123"}
        status = executar_query("acoes_pendentes:buscar_por_id", params=(proposta["acao_pendente_id"],))[0]["status"]
        assert status == "confirmado"

    async def test_consulta_direta_nao_chama_llm(self, agente_agenda_id):
        mock_decidir = AsyncMock()
        with patch("resolvers.agenda.decidir", mock_decidir), \
             patch("resolvers.agenda.google_calendar.listar_eventos", return_value=[]), \
             patch("resolvers.agenda.google_calendar.resumir_eventos", return_value=[]):
            resultado = await agenda.processar_mensagem("quais eventos eu tenho essa semana")
        assert mock_decidir.call_count == 0
        assert "não tem nenhum compromisso" in resultado["mensagem"]


def _proposta():
    return FakeDecisao(
        "proposta", "Jantar sábado 20h. Confirma?", acao="criar_evento",
        payload={"titulo": "Jantar", "inicio_iso": "2026-01-01T20:00:00", "fim_iso": "2026-01-01T22:00:00"},
    )


class TestConversaPersistida:
    """A conversa do chat da Agenda sobrevive ao reload: antes ficava só no
    estado do React e sumia ao fechar o painel (só a pendência voltava)."""

    async def test_fala_do_chefe_e_resposta_do_agente_ficam_gravadas_em_ordem(self, agente_agenda_id):
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=FakeDecisao("resposta", "Quinta está livre."))):
            await agenda.processar_mensagem("como está minha quinta?")

        falas = agenda.obter_conversa()["falas"]

        assert [(f["de"], f["texto"]) for f in falas] == [("chefe", "como está minha quinta?"), ("agente", "Quinta está livre.")]

    async def test_so_proposta_guarda_o_id_da_pendencia(self, agente_agenda_id):
        """Pergunta (aguardando_info) também abre pendência, mas não tem botão: só a proposta
        pode ser 'aberta' na bolha, senão a tela mostraria confirmar/rejeitar numa pergunta."""
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=FakeDecisao("pergunta", "Qual dia?"))):
            await agenda.processar_mensagem("quero marcar um jantar")
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=_proposta())):
            proposta = await agenda.processar_mensagem("sábado")

        agente = [f for f in agenda.obter_conversa()["falas"] if f["de"] == "agente"]

        assert agente[0]["acao_pendente_id"] is None
        assert agente[1]["acao_pendente_id"] == proposta["acao_pendente_id"]

    async def test_confirmar_pelo_botao_grava_so_a_resposta_do_agente(self, agente_agenda_id):
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=_proposta())):
            proposta = await agenda.processar_mensagem("marca jantar sábado")
        with patch("resolvers.agenda.google_calendar.criar_evento_real", return_value={"id": "e1"}):
            agenda.confirmar_acao(proposta["acao_pendente_id"])

        falas = agenda.obter_conversa()["falas"]

        assert [f["de"] for f in falas] == ["chefe", "agente", "agente"]
        assert falas[-1]["texto"] == "Feito — ação confirmada e executada."

    async def test_confirmar_digitando_sim_nao_grava_a_resposta_duas_vezes(self, agente_agenda_id):
        """Digitar 'sim' passa por processar_mensagem e depois por confirmar_acao: sem cuidado, a resposta
        'Feito' ficava gravada duas vezes."""
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=_proposta())):
            await agenda.processar_mensagem("marca jantar sábado")
        with patch("resolvers.agenda.google_calendar.criar_evento_real", return_value={"id": "e1"}):
            await agenda.processar_mensagem("sim")

        textos = [(f["de"], f["texto"]) for f in agenda.obter_conversa()["falas"]]

        assert textos.count(("agente", "Feito — ação confirmada e executada.")) == 1
        assert textos.count(("chefe", "sim")) == 1

    async def test_rejeitar_pelo_botao_grava_a_resposta(self, agente_agenda_id):
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=_proposta())):
            proposta = await agenda.processar_mensagem("marca jantar sábado")
        agenda.rejeitar_acao(proposta["acao_pendente_id"])

        assert agenda.obter_conversa()["falas"][-1]["texto"] == "Ação descartada."

    async def test_falha_do_agente_deixa_so_a_fala_do_chefe(self, agente_agenda_id):
        """Se o LLM falha o chefe vê o erro na tela; a pergunta dele continua no histórico, sem resposta inventada."""
        with patch("resolvers.agenda.decidir", new=AsyncMock(side_effect=RuntimeError("fora do ar"))):
            with pytest.raises(RuntimeError):
                await agenda.processar_mensagem("marca dentista")

        assert [(f["de"], f["texto"]) for f in agenda.obter_conversa()["falas"]] == [("chefe", "marca dentista")]

    def test_historico_devolve_as_ultimas_falas_em_ordem(self, agente_agenda_id):
        for i in range(5):
            agenda._registrar_fala("chefe", f"fala {i}")

        falas = agenda.obter_conversa(limite=3)["falas"]

        assert [f["texto"] for f in falas] == ["fala 2", "fala 3", "fala 4"]

    async def test_conversa_traz_a_proposta_aberta_para_mostrar_os_botoes(self, agente_agenda_id):
        with patch("resolvers.agenda.decidir", new=AsyncMock(return_value=_proposta())):
            proposta = await agenda.processar_mensagem("marca jantar sábado")

        conversa = agenda.obter_conversa()

        assert conversa["acao_pendente_id"] == proposta["acao_pendente_id"]
        assert conversa["aguardando_confirmacao"] is True

    def test_conversa_sem_pendencia(self, agente_agenda_id):
        conversa = agenda.obter_conversa()
        assert conversa == {"falas": [], "acao_pendente_id": None, "aguardando_confirmacao": False}

    def test_endpoint_devolve_a_conversa(self, client, agente_agenda_id):
        agenda._registrar_fala("chefe", "oi")

        resposta = client.get("/agenda/conversa")

        assert resposta.status_code == 200
        assert resposta.json()["falas"][0]["texto"] == "oi"
