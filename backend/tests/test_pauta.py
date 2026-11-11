"""Testes da Pauta (secretário pessoal), fase P1: textos crus, tarefas por frente, checklist, concluir/ocultar.
Nada aqui chama LLM; o que se prova é o dado (Postgres real) e as regras de estado."""
from datetime import date

import pytest

from utils.query_executor import executar_query


def _frente(nome: str) -> int:
    return next(f["id"] for f in executar_query("frentes:listar_com_contagem") if f["nome"] == nome)


@pytest.fixture
def pauta():
    import resolvers.pauta as pauta
    return pauta


@pytest.fixture
def trabalho() -> int:
    return _frente("trabalho")


class TestFrentes:
    def test_as_tres_frentes_fixas_nascem_na_migration(self, pauta):
        assert [f["nome"] for f in pauta.listar_frentes()] == ["trabalho", "faculdade", "pessoal"]

    def test_contagem_so_de_abertas(self, pauta, trabalho):
        pauta.criar_tarefa(trabalho, "Avaliar a API do SL")
        feita = pauta.criar_tarefa(trabalho, "Mandar relatório")
        pauta.mudar_status_tarefa(feita["id"], "feita")
        frentes = {f["nome"]: f for f in pauta.listar_frentes()}
        assert frentes["trabalho"]["abertas"] == 1
        assert frentes["faculdade"]["abertas"] == 0

    def test_frente_inexistente_404(self, client):
        assert client.get("/pauta/frentes/999/tarefas").status_code == 404


class TestTextos:
    def test_texto_solto_nasce_novo_e_nao_lido(self, pauta):
        t = pauta.registrar_texto("  lembrar de ver os endpoints da API  ")
        assert t["status"] == "nova"
        assert t["texto"] == "lembrar de ver os endpoints da API"  # só tira as bordas: o texto é o do chefe
        assert t["lida_em"] is None and t["tarefa_id"] is None
        assert pauta.contar_textos()["novas"] == 1

    def test_texto_dentro_da_tarefa_ja_nasce_organizado(self, pauta, trabalho):
        # o chefe disse onde é: não pode cair na fila do LLM (seria gasto à toa na P2)
        tarefa = pauta.criar_tarefa(trabalho, "Avaliar a API do SL")
        t = pauta.registrar_texto("GET /pedidos lista com paginação", tarefa["id"])
        assert t["status"] == "organizada" and t["organizada_em"] is not None
        assert pauta.contar_textos()["novas"] == 0
        assert [x["texto"] for x in pauta.obter_tarefa(tarefa["id"])["textos"]] == ["GET /pedidos lista com paginação"]

    def test_texto_original_guardado_com_normalizado_para_achar_repeticao(self, pauta):
        t = pauta.registrar_texto("Ligar pro João — amanhã!")
        assert t["texto"] == "Ligar pro João — amanhã!"
        assert _sql("SELECT texto_normalizado FROM anotacoes WHERE id = %s", (t["id"],)) == "ligar pro joao amanha"
        assert pauta.normalizar("ligar   pro joao, AMANHÃ") == "ligar pro joao amanha"

    def test_texto_vazio_422_e_tarefa_inexistente_404(self, client):
        assert client.post("/pauta/textos", json={"texto": "   "}).status_code == 422
        assert client.post("/pauta/textos", json={"texto": "oi", "tarefa_id": 999}).status_code == 404

    def test_texto_grande_aceito_ate_o_teto(self, client):
        assert client.post("/pauta/textos", json={"texto": "a" * 20_000}).status_code == 200
        assert client.post("/pauta/textos", json={"texto": "a" * 20_001}).status_code == 422


class TestTarefas:
    def test_criar_com_termos_sem_repeticao(self, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "Avaliar a API", termos=["SL", " sl ", "", "pedidos"])
        assert t["termos"] == ["SL", "pedidos"]
        assert t["frente"] == "trabalho" and t["origem"] == "manual" and t["status"] == "aberta"

    def test_ordem_da_lista_prazo_primeiro_e_feitas_depois(self, pauta, trabalho):
        sem_prazo = pauta.criar_tarefa(trabalho, "Sem prazo")
        longe = pauta.criar_tarefa(trabalho, "Prazo longe", prazo=date(2030, 1, 1))
        perto = pauta.criar_tarefa(trabalho, "Prazo perto", prazo=date(2029, 1, 1))
        feita = pauta.criar_tarefa(trabalho, "Já feita", prazo=date(2000, 1, 1))
        pauta.mudar_status_tarefa(feita["id"], "feita")
        ids = [t["id"] for t in pauta.listar_tarefas(trabalho)]
        assert ids == [perto["id"], longe["id"], sem_prazo["id"], feita["id"]]

    def test_patch_prazo_ausente_nao_mexe_e_null_tira(self, client, trabalho):
        t = client.post("/pauta/tarefas", json={"frente_id": trabalho, "titulo": "X", "prazo": "2030-05-01"}).json()
        assert client.patch(f"/pauta/tarefas/{t['id']}", json={"titulo": "Y"}).json()["prazo"] == "2030-05-01"
        sem = client.patch(f"/pauta/tarefas/{t['id']}", json={"prazo": None}).json()
        assert sem["prazo"] is None and sem["titulo"] == "Y"

    def test_mudar_de_frente(self, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "Estudar SQL")
        faculdade = _frente("faculdade")
        assert pauta.atualizar_tarefa(t["id"], frente_id=faculdade)["frente"] == "faculdade"
        assert pauta.listar_tarefas(trabalho) == []

    def test_titulo_vazio_422(self, client, trabalho):
        assert client.post("/pauta/tarefas", json={"frente_id": trabalho, "titulo": "  "}).status_code == 422


class TestFimDaTarefa:
    def test_concluir_reabrir_e_deixar_de_lado(self, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "Entregar")
        feita = pauta.mudar_status_tarefa(t["id"], "feita")
        assert feita["status"] == "feita" and feita["concluida_em"] is not None
        aberta = pauta.mudar_status_tarefa(t["id"], "aberta")
        assert aberta["concluida_em"] is None
        assert pauta.mudar_status_tarefa(t["id"], "arquivada")["status"] == "arquivada"

    def test_mesmo_status_409(self, client, trabalho):
        t = client.post("/pauta/tarefas", json={"frente_id": trabalho, "titulo": "X"}).json()
        assert client.post(f"/pauta/tarefas/{t['id']}/status", json={"status": "aberta"}).status_code == 409

    def test_tudo_feito_so_com_checklist_inteiro_marcado(self, pauta, trabalho):
        # "tudo feito, concluir?" é uma conta; a Pauta nunca conclui sozinha
        t = pauta.criar_tarefa(trabalho, "Avaliar a API")
        assert pauta.obter_tarefa(t["id"])["tudo_feito"] is False  # sem item não há "tudo"
        a = pauta.adicionar_item(t["id"], "Listar endpoints")
        b = pauta.adicionar_item(t["id"], "Mapear para o banco")
        pauta.atualizar_item(a["id"], feito=True)
        assert pauta.obter_tarefa(t["id"])["tudo_feito"] is False
        pauta.atualizar_item(b["id"], feito=True)
        tarefa = pauta.obter_tarefa(t["id"])
        assert tarefa["tudo_feito"] is True and tarefa["status"] == "aberta"
        assert pauta.listar_tarefas(trabalho)[0]["tudo_feito"] is True


class TestOcultar:
    def test_so_tarefa_terminada_pode_ser_ocultada(self, client, trabalho):
        t = client.post("/pauta/tarefas", json={"frente_id": trabalho, "titulo": "Aberta"}).json()
        r = client.post(f"/pauta/tarefas/{t['id']}/ocultar")
        assert r.status_code == 409 and "concluída" in r.json()["detail"]

    def test_oculta_some_da_lista_e_volta_quando_pedida(self, pauta, trabalho):
        aberta = pauta.criar_tarefa(trabalho, "Aberta")
        feita = pauta.criar_tarefa(trabalho, "Feita")
        pauta.mudar_status_tarefa(feita["id"], "feita")
        oculta = pauta.ocultar_tarefa(feita["id"])
        assert oculta["oculta"] is True and oculta["ocultada_em"] is not None
        assert [t["id"] for t in pauta.listar_tarefas(trabalho)] == [aberta["id"]]
        todas = pauta.listar_tarefas(trabalho, incluir_ocultas=True)
        assert [t["id"] for t in todas] == [aberta["id"], feita["id"]] and todas[-1]["oculta"] is True

    def test_reabrir_desoculta(self, pauta, trabalho):
        # tarefa aberta escondida seria esquecida: é o contrário do que a Pauta existe para fazer
        t = pauta.criar_tarefa(trabalho, "Feita")
        pauta.mudar_status_tarefa(t["id"], "feita")
        pauta.ocultar_tarefa(t["id"])
        reaberta = pauta.mudar_status_tarefa(t["id"], "aberta")
        assert reaberta["oculta"] is False and reaberta["ocultada_em"] is None

    def test_desocultar(self, client, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "Feita")
        pauta.mudar_status_tarefa(t["id"], "arquivada")
        pauta.ocultar_tarefa(t["id"])
        assert client.post(f"/pauta/tarefas/{t['id']}/desocultar").json()["oculta"] is False
        assert client.get(f"/pauta/frentes/{trabalho}/tarefas").json()[0]["id"] == t["id"]

    def test_banco_tambem_impede_ocultar_aberta(self, pauta, trabalho):
        # rede de segurança do CHECK: mesmo um UPDATE fora do resolver não deixa uma aberta sumir
        import psycopg
        t = pauta.criar_tarefa(trabalho, "Aberta")
        with pytest.raises(psycopg.errors.CheckViolation):
            executar_query("tarefas:ocultar", returning=True, params=(True, True, t["id"]))


class TestChecklist:
    def test_itens_em_ordem_e_marcar_desmarcar(self, client, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "Avaliar a API")
        a = client.post(f"/pauta/tarefas/{t['id']}/checklist", json={"texto": "Listar endpoints"}).json()
        b = client.post(f"/pauta/tarefas/{t['id']}/checklist", json={"texto": "Mapear campos"}).json()
        assert (a["ordem"], b["ordem"]) == (1, 2) and a["origem"] == "manual"
        marcado = client.patch(f"/pauta/checklist/{a['id']}", json={"feito": True}).json()
        assert marcado["feito"] is True and marcado["feito_em"] is not None
        renomeado = client.patch(f"/pauta/checklist/{a['id']}", json={"texto": "Listar os endpoints"}).json()
        assert renomeado["feito"] is True and renomeado["feito_em"] == marcado["feito_em"]  # editar não desmarca
        desmarcado = client.patch(f"/pauta/checklist/{a['id']}", json={"feito": False}).json()
        assert desmarcado["feito"] is False and desmarcado["feito_em"] is None
        detalhe = client.get(f"/pauta/tarefas/{t['id']}").json()
        assert [i["texto"] for i in detalhe["checklist"]] == ["Listar os endpoints", "Mapear campos"]
        assert (detalhe["itens_total"], detalhe["itens_feitos"]) == (2, 0)

    def test_remover_item(self, client, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "X")
        item = pauta.adicionar_item(t["id"], "Y")
        assert client.delete(f"/pauta/checklist/{item['id']}").status_code == 204
        assert client.delete(f"/pauta/checklist/{item['id']}").status_code == 404
        assert pauta.obter_tarefa(t["id"])["checklist"] == []

    def test_mexer_no_checklist_conta_como_movimento(self, pauta, trabalho):
        # é a base do "parada há N dias" (P5): marcar um item é sinal de vida da tarefa
        t = pauta.criar_tarefa(trabalho, "X")
        antes = pauta.obter_tarefa(t["id"])["ultimo_movimento_em"]
        pauta.adicionar_item(t["id"], "Y")
        assert pauta.obter_tarefa(t["id"])["ultimo_movimento_em"] > antes

    def test_item_vazio_422_e_tarefa_inexistente_404(self, client, pauta, trabalho):
        t = pauta.criar_tarefa(trabalho, "X")
        assert client.post(f"/pauta/tarefas/{t['id']}/checklist", json={"texto": " "}).status_code == 422
        assert client.post("/pauta/tarefas/999/checklist", json={"texto": "a"}).status_code == 404
        assert client.patch("/pauta/checklist/999", json={"feito": True}).status_code == 404


class TestSemLlm:
    def test_nenhuma_rota_da_p1_gasta(self, client, trabalho):
        # P1 é de graça: nada em tick_execucoes depois de usar tudo
        t = client.post("/pauta/tarefas", json={"frente_id": trabalho, "titulo": "X"}).json()
        client.post("/pauta/textos", json={"texto": "solto"})
        client.post("/pauta/textos", json={"texto": "dentro", "tarefa_id": t["id"]})
        client.post(f"/pauta/tarefas/{t['id']}/checklist", json={"texto": "Y"})
        assert _sql("SELECT count(*) AS n FROM tick_execucoes") == 0


def _sql(consulta: str, params=None):
    """Lê uma coluna direto do banco, para conferir o que a API não devolve (de propósito)."""
    from utils.db import Database
    with Database() as conn:
        conn.execute(consulta, params)
        return next(iter(conn.fetchall()[0].values()))
