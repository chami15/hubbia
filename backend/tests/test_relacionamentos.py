"""Relações reais (ideias do 3D, fase 2): a afinidade entre agentes que o tick grava a cada conversa, exposta para leitura.
Sem LLM. Só entre colegas (o chefe não entra) e só a afinidade (a coluna `opiniao` nunca é escrita)."""
from resolvers import agentes
from utils.query_executor import executar_query


def _agente(nome: str, tipo: str = "colaborador") -> int:
    return executar_query("agentes:upsert", returning=True, params=(nome, tipo, nome.lower(), None, "{}", 0, 5))[0]["id"]


def _relacao(a: int, b: int, afinidade: int) -> None:
    executar_query("relacionamentos:upsert_neutro", commit=True, params=(a, b))
    executar_query("relacionamentos:atualizar_afinidade", returning=True, params=(afinidade, a, b))


class TestRelacionamentos:
    def test_sem_relacoes_lista_vazia(self):
        assert agentes.listar_relacionamentos() == []

    def test_lista_cada_direcao_com_a_afinidade(self):
        cifra, vita = _agente("Cifra"), _agente("Vita")
        _relacao(cifra, vita, 40)
        _relacao(vita, cifra, 25)

        rels = agentes.listar_relacionamentos()

        assert sorted((r["agente_id"], r["alvo_agente_id"], r["afinidade"]) for r in rels) == sorted([(cifra, vita, 40), (vita, cifra, 25)])
        assert set(rels[0]) == {"agente_id", "alvo_agente_id", "afinidade"}  # nada de opiniao (nunca escrita)

    def test_chefe_e_inativo_ficam_de_fora(self):
        cifra, vita, chefe = _agente("Cifra"), _agente("Vita"), _agente("Chefe", "chefe")
        norte = _agente("Norte")
        _relacao(cifra, vita, 10)
        _relacao(cifra, chefe, 50)
        _relacao(norte, cifra, 30)
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET ativo = FALSE WHERE id = %s", (norte,))
            conn.commit()

        pares = {(r["agente_id"], r["alvo_agente_id"]) for r in agentes.listar_relacionamentos()}

        assert pares == {(cifra, vita)}

    def test_endpoint(self, client):
        a, b = _agente("Cifra"), _agente("Vita")
        _relacao(a, b, 12)
        r = client.get("/agentes/relacionamentos")
        assert r.status_code == 200 and r.json() == [{"agente_id": a, "alvo_agente_id": b, "afinidade": 12}]


class TestTracos:
    def test_regressao_get_agentes_nao_devolvia_a_extroversao(self, client):
        """A extroversão (0-10) está no banco e no seed e já decide quem puxa conversa no tick, mas GET /agentes não a
        devolvia: o prédio inventava o "gosto por sair da sala" à mão. Agora ela sai na rota e vira a fonte única."""
        _agente("Vita")
        executar_query("agentes:upsert", returning=True, params=("Norte", "colaborador", "norte", None, "{}", 0, 3))

        por_nome = {a["nome"]: a for a in client.get("/agentes").json()}

        assert por_nome["Norte"]["extroversao"] == 3
        assert por_nome["Vita"]["extroversao"] == 5
