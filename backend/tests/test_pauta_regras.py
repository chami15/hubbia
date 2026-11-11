"""Regras puras da Pauta (P2): segredo mascarado, repetição e a trava de ambiguidade. São as partes frágeis da
organização, por isso cada caso que o chefe levantou na conversa de design tem um teste com o exemplo dele."""
import pytest

from resolvers.pauta_regras import (
    itens_novos,
    juntar_termos,
    mascarar_segredos,
    revisar_decisao,
    truncar,
)

TRABALHO, FACULDADE, PESSOAL = 1, 2, 3


class TestSegredos:
    @pytest.mark.parametrize("texto", [
        "usa a chave sk-proj-AbCdEf1234567890ABCDEFGH no header",
        "token do github ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
        "Authorization: Bearer abc.def-ghi_jkl123456",
        "AKIAIOSFODNN7EXAMPLE é a access key",
        "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
        "xoxb-1234567890-abcdefghij do slack",
        "uma chave solta Zx9QwErTy7UiOp3AsDfGh5JkLzXcVbNm2Q8w",
    ])
    def test_chaves_viram_segredo(self, texto):
        mascarado = mascarar_segredos(texto)
        assert "[segredo]" in mascarado
        # nenhum pedaço longo do original sobra
        assert not any(len(p) >= 16 and p in mascarado for p in texto.split() if any(c.isdigit() for c in p))

    @pytest.mark.parametrize("texto,esperado", [
        ("api_key=abc123segredo", "api_key=[segredo]"),
        ("senha: minhaSenha!", "senha: [segredo]"),
        ("TOKEN = xyz", "TOKEN = [segredo]"),
    ])
    def test_chave_valor_mantem_o_nome(self, texto, esperado):
        assert mascarar_segredos(texto) == esperado

    @pytest.mark.parametrize("texto", [
        "GET /api/v1/pedidos?pagina=2 lista os pedidos com paginação",
        "endpoint https://api.sl.com.br/v2/clientes/123/enderecos",
        "o id do pedido é 550e8400-e29b-41d4-a716-446655440000",
        "rodar python -m scripts.migrate antes",
        "ver a aula 12 do capítulo 3",
    ])
    def test_texto_normal_fica_intacto(self, texto):
        # mascarar demais estragaria justamente o contexto que o chefe mandou (endpoints, ids, caminhos)
        assert mascarar_segredos(texto) == texto


class TestTruncar:
    def test_corta_com_reticencias_e_junta_espacos(self):
        assert truncar("a  b\n c", 10) == "a b c"
        assert truncar("x" * 100, 10) == "x" * 9 + "…"
        assert len(truncar("palavra " * 50, 80)) == 80


class TestItensNovos:
    def test_igual_e_outras_palavras_sao_descartados(self):
        existentes = ["Listar os endpoints da API"]
        propostos = [
            "listar endpoints da API",          # mesmo, outras palavras
            "Listar os endpoints da API.",      # igual com pontuação
            "Mapear os campos para o banco",    # novo
            "Mapear campos pro banco",          # repete o anterior desta mesma leva
            "Testar endpoints",                 # parecido na forma, diferente no sentido: fica
        ]
        assert itens_novos(propostos, existentes) == ["Mapear os campos para o banco", "Testar endpoints"]

    def test_regressao_itens_que_so_mudam_o_numero_eram_tratados_como_repetidos(self):
        # "Ler capítulo 3" e "Ler capítulo 4" têm 93 por cento de semelhança de texto: a comparação descartava o
        # segundo como "o mesmo com outras palavras" e o capítulo 4 sumia do checklist.
        assert itens_novos(["Ler capítulo 4", "Exercício 2 da lista 3"], ["Ler capítulo 3", "Exercício 1 da lista 3"]) == [
            "Ler capítulo 4", "Exercício 2 da lista 3"]
        # mesmo número com outras palavras continua sendo repetido
        assert itens_novos(["ler o capitulo 3"], ["Ler capítulo 3"]) == []

    def test_corta_quantidade_tamanho_e_vazio(self):
        propostos = ["", "   ", *[f"Passo número {i} da tarefa grande" for i in range(10)]]
        aceitos = itens_novos(propostos, [], maximo=5)
        assert len(aceitos) == 5
        assert all(len(i) <= 120 for i in itens_novos(["x" * 300], []))


class TestTermos:
    def test_junta_sem_repetir_e_com_teto(self):
        assert juntar_termos(["SL"], ["sl", "pedidos", " ", "Pedidos"]) == ["SL", "pedidos"]
        assert len(juntar_termos([], [f"t{i}" for i in range(30)])) == 10


def _tarefa(id_, frente, titulo, termos=()):
    return {"id": id_, "frente_id": frente, "titulo": titulo, "termos": list(termos)}


# O exemplo do chefe: "API do SL" no trabalho e "API do hubbia" no pessoal.
TAREFAS = [
    _tarefa(10, TRABALHO, "Avaliar a API do SL", ["SL", "API"]),
    _tarefa(20, PESSOAL, "Integrar a API do hubbia", ["hubbia", "API"]),
    _tarefa(30, FACULDADE, "Trabalho de banco de dados", ["TCC"]),
]


def _revisar(texto, destino="existente", tarefa_id=10, titulo=None, frente=None, confianca="certa", candidatos=()):
    return revisar_decisao(texto, destino, tarefa_id, titulo, frente, confianca, list(candidatos), TAREFAS)


class TestTravaDeAmbiguidade:
    def test_termo_exclusivo_encaixa_sem_perguntar(self):
        assert _revisar("o endpoint de pedidos da API do SL tem paginação").perguntar is False

    def test_termo_em_duas_frentes_pergunta_mesmo_com_certeza(self):
        # "API" sozinho existe no trabalho E no pessoal: o LLM pode ter acertado, mas é chute
        r = _revisar("a API está devolvendo 500 no login")
        assert r.perguntar and r.tipo == "destino"
        assert set(r.candidatos) == {10, 20}

    def test_cita_termo_de_outra_tarefa_pergunta(self):
        # o LLM mandou para a do SL, mas o texto fala do hubbia
        r = _revisar("no hubbia o tick automático parou")
        assert r.perguntar and 20 in r.candidatos and 10 in r.candidatos

    def test_destino_sem_nada_em_comum_pergunta(self):
        r = _revisar("comprar ração do cachorro", tarefa_id=30)
        assert r.perguntar and r.motivo == "o destino não tem nada em comum com o texto"

    def test_palavra_do_titulo_basta_sem_termo(self):
        assert _revisar("modelar as tabelas do trabalho de banco", tarefa_id=30).perguntar is False

    def test_duvida_declarada_sempre_pergunta(self):
        r = _revisar("o endpoint de pedidos da API do SL", confianca="duvida", candidatos=[10, 20, 999])
        assert r.perguntar and r.candidatos == (10, 20)  # id inventado (999) não vira opção

    def test_tarefa_nova_parecida_com_existente_pergunta_se_e_a_mesma(self):
        r = _revisar("ver a api do sl", destino="nova", tarefa_id=None, titulo="Analisar a API do SL", frente=TRABALHO)
        assert r.perguntar and r.tipo == "mesma_tarefa" and r.parecida_id == 10

    def test_tarefa_nova_parecida_em_outra_frente_nao_conta_como_mesma(self):
        r = _revisar("estudar para a prova", destino="nova", tarefa_id=None, titulo="Trabalho de banco de dados",
                     frente=PESSOAL)
        assert r.tipo != "mesma_tarefa"

    def test_tarefa_nova_que_cita_termo_existente_pergunta(self):
        r = _revisar("TCC: marcar reunião com orientador", destino="nova", tarefa_id=None,
                     titulo="Marcar reunião com orientador", frente=FACULDADE)
        assert r.perguntar and r.tipo == "destino" and r.candidatos == (30,)

    def test_tarefa_nova_de_verdade_encaixa(self):
        r = _revisar("comprar ração do cachorro", destino="nova", tarefa_id=None, titulo="Comprar ração", frente=PESSOAL)
        assert r.perguntar is False
