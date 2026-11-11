"""Regras puras da Pauta (P2): segredo mascarado, repetição e a trava de ambiguidade. São as partes frágeis da
organização, por isso cada caso que o chefe levantou na conversa de design tem um teste com o exemplo dele."""
import pytest

from resolvers.pauta_regras import (
    itens_novos,
    juntar_termos,
    mascarar_segredos,
    revisar_decisao,
    topicos_validos,
    impressao_da_tarefa,
    item_equivalente,
    sugestao_valida,
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


class TestTopicos:
    def test_topico_sem_fonte_ou_com_fonte_inventada_e_descartado(self):
        # sem dizer de onde veio, não dá para o chefe conferir: pode ser invenção
        r = topicos_validos([("GET /pedidos é paginado", [1]), ("A API usa GraphQL", []), ("Prazo é sexta", [99])], {1, 2})
        assert r == [("GET /pedidos é paginado", [1])]

    def test_repetido_com_outras_palavras_se_funde_somando_fontes(self):
        r = topicos_validos([("GET /pedidos é paginado", [1]), ("get /pedidos é paginado.", [2])], {1, 2})
        assert r == [("GET /pedidos é paginado", [1, 2])]

    def test_numero_diferente_nao_funde(self):
        r = topicos_validos([("Endpoint v1 descontinuado", [1]), ("Endpoint v2 descontinuado", [1])], {1})
        assert len(r) == 2

    def test_corta_tamanho_e_quantidade(self):
        r = topicos_validos([(f"Fato número {i} sobre a API " + "x" * 200, [1]) for i in range(10)], {1})
        assert len(r) == 6 and all(len(t) <= 140 for t, _ in r)


def _tarefa_p4(**kw):
    base = {"titulo": "Avaliar a API", "prazo": None,
            "checklist": [{"texto": "Listar endpoints", "feito": False}], "contexto": [{"texto": "GET /pedidos paginado"}]}
    return {**base, **kw}


class TestImpressaoDaTarefa:
    def test_igual_quando_nada_que_importa_mudou(self):
        assert impressao_da_tarefa(_tarefa_p4()) == impressao_da_tarefa(_tarefa_p4(titulo="  avaliar a API "))

    @pytest.mark.parametrize("mudanca", [
        {"checklist": [{"texto": "Listar endpoints", "feito": True}]},          # marcou o item
        {"checklist": []},                                                       # removeu o item
        {"prazo": "2030-01-01"},                                                 # ganhou prazo
        {"contexto": [{"texto": "GET /pedidos paginado"}, {"texto": "POST /notas"}]},  # P3 acrescentou contexto
        {"titulo": "Avaliar a API do SL"},
    ])
    def test_muda_quando_algo_que_importa_mudou(self, mudanca):
        assert impressao_da_tarefa(_tarefa_p4(**mudanca)) != impressao_da_tarefa(_tarefa_p4())


class TestSugestaoValida:
    def test_corta_e_limpa(self):
        passo, como, por_que = sugestao_valida("Listar " + "x" * 200, ["a", "", "b", "c", "d"], "p" * 300, [])
        assert len(passo) <= 100 and como == ["a", "b", "c"] and len(por_que) <= 140

    def test_sem_passo_e_recusada(self):
        with pytest.raises(ValueError, match="nenhum passo"):
            sugestao_valida("  ", ["a"], "porque", [])

    def test_repetir_descartada_e_recusado(self):
        with pytest.raises(ValueError, match="descartou"):
            sugestao_valida("listar os endpoints da API", [], "", ["Listar endpoints da API"])

    def test_parecida_mas_com_outro_numero_passa(self):
        assert sugestao_valida("Ler capítulo 4", [], "", ["Ler capítulo 3"])[0] == "Ler capítulo 4"


class TestItemEquivalente:
    def test_acha_so_pendente(self):
        itens = [{"id": 1, "texto": "Listar endpoints", "feito": True}, {"id": 2, "texto": "Mapear campos", "feito": False}]
        assert item_equivalente("mapear os campos", itens)["id"] == 2
        assert item_equivalente("listar endpoints", itens) is None  # o feito não conta: sugerir de novo é outro passo
