"""Testes do domínio de mensagens: listagem, caixa de entrada do chefe
e resposta REAL do chefe (texto literal dele, sem LLM) a uma mensagem
social recebida."""
import pytest

import resolvers.mensagens as mensagens
from utils.query_executor import executar_query


def _criar_agente(nome: str, tipo: str = "colaborador", especialidade: str = "teste") -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=(nome, tipo, especialidade, None, "{}", 0, 5),
    )
    return rows[0]["id"]


def _criar_chefe(nome: str = "Você") -> int:
    return _criar_agente(nome, tipo="chefe", especialidade="chefe")


def _inserir_mensagem(remetente_id, destinatario_id, tipo, conteudo, tick=1, respondendo_a_id=None) -> dict:
    rows = executar_query(
        "mensagens:inserir",
        returning=True,
        params=(remetente_id, destinatario_id, tipo, conteudo, tick, respondendo_a_id),
    )
    return rows[0]


class TestCaixaDeEntrada:
    def test_lista_so_mensagens_direcionadas_ao_chefe(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        outro_id = _criar_agente("Vita", especialidade="saude")

        _inserir_mensagem(agente_id, chefe_id, "social", "Pra você, chefe")
        _inserir_mensagem(agente_id, outro_id, "social", "Não é pra você")

        caixa = mensagens.listar_caixa_de_entrada(50)

        assert len(caixa) == 1
        assert caixa[0]["conteudo"] == "Pra você, chefe"
        assert caixa[0]["destinatario_id"] == chefe_id


class TestResponderMensagem:
    def test_responde_com_sucesso(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        original = _inserir_mensagem(agente_id, chefe_id, "social", "Bom dia, chefe!")

        resposta = mensagens.responder_mensagem(original["id"], "Bom dia, Norte!")

        assert resposta["remetente_id"] == chefe_id
        assert resposta["destinatario_id"] == agente_id
        assert resposta["respondendo_a_id"] == original["id"]
        assert resposta["conteudo"] == "Bom dia, Norte!"
        assert resposta["tipo"] == "social"

    def test_rejeita_responder_mensagem_nao_direcionada_a_ele(self):
        _criar_chefe()
        a_id = _criar_agente("A")
        b_id = _criar_agente("B")
        original = _inserir_mensagem(a_id, b_id, "social", "Conversa entre colegas")

        with pytest.raises(ValueError, match="não foi direcionada"):
            mensagens.responder_mensagem(original["id"], "Intrometendo...")

    def test_rejeita_responder_mensagem_de_trabalho(self):
        chefe_id = _criar_chefe()
        norte_id = _criar_agente("Norte", especialidade="norte")
        original = _inserir_mensagem(norte_id, chefe_id, "trabalho", "Projeto X parado, gerei um card.")

        with pytest.raises(ValueError, match="mensagens sociais"):
            mensagens.responder_mensagem(original["id"], "Ok, valeu!")

    def test_rejeita_mensagem_inexistente(self):
        _criar_chefe()
        with pytest.raises(ValueError, match="não encontrada"):
            mensagens.responder_mensagem(99999, "Oi?")


class TestListagemTrazLidaPeloChefe:
    def test_mensagem_nova_comeca_nao_lida(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        _inserir_mensagem(agente_id, chefe_id, "social", "Bom dia!")

        todas = mensagens.listar_mensagens(None, 50)
        assert todas[0]["lida_pelo_chefe"] is False

    def test_filtro_por_tipo_tambem_traz_o_campo(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        _inserir_mensagem(agente_id, chefe_id, "trabalho", "Aviso de trabalho")

        do_tipo = mensagens.listar_mensagens("trabalho", 50)
        assert do_tipo[0]["lida_pelo_chefe"] is False


class TestMarcarMensagemLida:
    def test_marca_como_lida(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        original = _inserir_mensagem(agente_id, chefe_id, "social", "Oi, chefe!")

        resultado = mensagens.marcar_mensagem_lida(original["id"])

        assert resultado["lida_pelo_chefe"] is True
        de_novo = mensagens.listar_mensagens(None, 50)
        assert de_novo[0]["lida_pelo_chefe"] is True

    def test_e_idempotente(self):
        chefe_id = _criar_chefe()
        agente_id = _criar_agente("Norte", especialidade="norte")
        original = _inserir_mensagem(agente_id, chefe_id, "social", "Oi de novo!")

        mensagens.marcar_mensagem_lida(original["id"])
        resultado = mensagens.marcar_mensagem_lida(original["id"])  # marcar já-lida não quebra
        assert resultado["lida_pelo_chefe"] is True

    def test_rejeita_mensagem_nao_direcionada_ao_chefe(self):
        _criar_chefe()
        a_id = _criar_agente("A")
        b_id = _criar_agente("B")
        original = _inserir_mensagem(a_id, b_id, "social", "Conversa entre colegas")

        with pytest.raises(ValueError, match="não foi direcionada"):
            mensagens.marcar_mensagem_lida(original["id"])

    def test_rejeita_mensagem_inexistente(self):
        _criar_chefe()
        with pytest.raises(ValueError, match="não encontrada"):
            mensagens.marcar_mensagem_lida(99999)
