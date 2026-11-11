"""Pauta P2: organizar os textos e as perguntas de dúvida. Postgres real; só o LLM é simulado.

O que se prova aqui é o que o chefe pediu na conversa de design: sem texto novo nada é gasto; texto lido não volta
sozinho; repetido sai de graça; na dúvida pergunta (uma por vez, curta) e a resposta ensina; o que o chefe escreveu
ou marcou nunca é mexido; segredo não sai do banco; e nada fica pela metade."""
from unittest.mock import AsyncMock, patch

import psycopg
import pytest

from agents.pauta.agente import DecisaoTexto, OrganizacaoLote
from config import settings
from tests.helpers import registrar_gasto, resultado_agente, resultado_llm, resultado_llm_com_erro
from utils.query_executor import executar_query


def _sql(consulta: str, params=None) -> list[dict]:
    from utils.db import Database
    with Database() as conn:
        conn.execute(consulta, params)
        return conn.fetchall() if conn.get_cur().description else []


def _frente(nome: str) -> int:
    return next(f["id"] for f in executar_query("frentes:listar_ativas") if f["nome"] == nome)


def _status(anotacao_id: int) -> str:
    return executar_query("anotacoes:buscar_por_id", params=(anotacao_id,))[0]["status"]


def _decisao(texto_id, **kw) -> DecisaoTexto:
    padrao = {"destino": "existente", "confianca": "certa", "termos": [], "itens": []}
    return DecisaoTexto(texto_id=texto_id, **{**padrao, **kw})


def _llm(*decisoes):
    """Mocka a função do agente inteira (o caso comum). Use `.call_args` para ver o prompt que iria para o LLM."""
    return AsyncMock(return_value=resultado_agente(OrganizacaoLote(decisoes=list(decisoes))))


@pytest.fixture
def pauta():
    import resolvers.pauta as pauta
    return pauta


@pytest.fixture
def org():
    import resolvers.pauta_organizar as org
    return org


@pytest.fixture
def agente_pauta() -> int:
    return executar_query("agentes:upsert", returning=True,
                          params=("Pauta", "colaborador", "pauta", None, "{}", 5, 4))[0]["id"]


@pytest.fixture
def tarefas(pauta):
    """O cenário do chefe: API do SL no trabalho e API do hubbia no pessoal."""
    sl = pauta.criar_tarefa(_frente("trabalho"), "Avaliar a API do SL", termos=["SL", "API"])
    hubbia = pauta.criar_tarefa(_frente("pessoal"), "Integrar a API do hubbia", termos=["hubbia", "API"])
    return {"sl": sl["id"], "hubbia": hubbia["id"]}


class TestSoGastaComTextoNovo:
    async def test_sem_texto_novo_nao_chama_o_llm(self, org, pauta, tarefas):
        pauta.registrar_texto("dentro da tarefa", tarefas["sl"])  # já nasce organizado
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            resumo = await org.organizar()
        assert llm.call_count == 0 and resumo["chamou_llm"] is False

    async def test_texto_lido_sai_da_fila(self, org, pauta, tarefas):
        t = pauta.registrar_texto("endpoint de pedidos do SL")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=_llm(_decisao(t["id"], tarefa_id=tarefas["sl"]))):
            await org.organizar()
        linha = executar_query("anotacoes:buscar_por_id", params=(t["id"],))[0]
        assert linha["status"] == "organizada" and linha["lida_em"] is not None and linha["tarefa_id"] == tarefas["sl"]
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            await org.organizar()
        assert llm.call_count == 0  # já lido: a segunda rodada não gasta

    async def test_repetido_igual_sai_sem_llm(self, org, pauta, tarefas):
        primeiro = pauta.registrar_texto("Ligar pro João amanhã", tarefas["sl"])
        copia = pauta.registrar_texto("ligar pro joao, AMANHÃ!")
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            resumo = await org.organizar()
        assert llm.call_count == 0 and resumo["duplicados"] == 1
        linha = executar_query("anotacoes:buscar_por_id", params=(copia["id"],))[0]
        assert linha["status"] == "duplicada" and linha["duplicada_de"] == primeiro["id"]
        assert linha["tarefa_id"] == tarefas["sl"]

    async def test_dois_iguais_no_mesmo_lote_so_o_primeiro_vai_para_o_llm(self, org, pauta, tarefas):
        a = pauta.registrar_texto("endpoint de pedidos do SL")
        b = pauta.registrar_texto("Endpoint de pedidos do SL.")
        llm = _llm(_decisao(a["id"], tarefa_id=tarefas["sl"]))
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            await org.organizar()
        prompt = llm.call_args.args[0]
        assert f"[texto {a['id']}]" in prompt and f"[texto {b['id']}]" not in prompt
        # a cópia herda a tarefa que o original ganhou na mesma rodada
        assert executar_query("anotacoes:buscar_por_id", params=(b["id"],))[0]["tarefa_id"] == tarefas["sl"]

    async def test_sem_texto_novo_e_sem_orcamento_responde_nada_a_fazer(self, client, agente_pauta):
        # nada para organizar não é erro: o botão não pode reclamar de orçamento quando não ia gastar nada
        registrar_gasto(agente_pauta, settings.orcamento_diario_usd + 1)
        r = client.post("/pauta/organizar")
        assert r.status_code == 200 and r.json()["lidos"] == 0

    async def test_orcamento_esgotado_nao_le_nada(self, org, pauta, agente_pauta):
        t = pauta.registrar_texto("algo")
        registrar_gasto(agente_pauta, settings.orcamento_diario_usd + 1)
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            with pytest.raises(pauta.ConflitoDeEstado):
                await org.organizar()
        assert llm.call_count == 0 and _status(t["id"]) == "nova"


class TestLote:
    async def test_teto_de_caracteres_com_o_primeiro_sempre_dentro(self, org, pauta, monkeypatch):
        monkeypatch.setattr(settings, "pauta_lote_max_caracteres", 100)
        grande = pauta.registrar_texto("a" * 300)
        outro = pauta.registrar_texto("b" * 50)
        lote = executar_query("anotacoes:pegar_lote", returning=True, params={"limite": 10, "max_caracteres": 100})
        assert [t["id"] for t in lote] == [grande["id"]]  # o grande não trava a fila; o outro espera
        assert _status(outro["id"]) == "nova"

    async def test_texto_ja_preso_por_outra_rodada_nao_e_pego_de_novo(self, pauta):
        # tick e botão ao mesmo tempo: o que uma rodada está segurando a outra pula (SKIP LOCKED)
        a = pauta.registrar_texto("primeiro")
        b = pauta.registrar_texto("segundo")
        from psycopg.rows import dict_row

        from tests.conftest import DATABASE_URL_TESTE
        from utils.sql_manager import sql_manager
        with psycopg.connect(DATABASE_URL_TESTE) as outra, psycopg.connect(DATABASE_URL_TESTE, row_factory=dict_row) as esta:
            outra.execute("SELECT id FROM anotacoes WHERE id = %s FOR UPDATE", (a["id"],))
            # sem o SKIP LOCKED esta rodada ficaria esperando a outra para sempre: com o teto, falha em 2 s
            esta.execute("SET lock_timeout = '2s'")
            lote = esta.execute(sql_manager.load_query("anotacoes:pegar_lote"),
                                {"limite": 10, "max_caracteres": 10_000}).fetchall()
            esta.commit()
            outra.rollback()
        assert [t["id"] for t in lote] == [b["id"]]

    async def test_leitura_travada_vira_falha_e_nao_volta_sozinha(self, org, pauta):
        t = pauta.registrar_texto("caiu no meio")
        _sql("UPDATE anotacoes SET status = 'lendo', lida_em = now() - interval '1 hour' WHERE id = %s", (t["id"],))
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            await org.organizar()
        assert _status(t["id"]) == "falhou" and llm.call_count == 0


class TestEncaixe:
    async def test_contexto_vai_para_a_tarefa_e_so_acrescenta(self, org, pauta, tarefas):
        manual = pauta.adicionar_item(tarefas["sl"], "Listar os endpoints da API")
        pauta.atualizar_item(manual["id"], feito=True)
        pauta.atualizar_tarefa(tarefas["sl"], mudar_prazo=True, prazo="2030-01-10")
        t = pauta.registrar_texto("SL: listar endpoints da api e mapear os campos de pedidos para o banco, até dia 20")
        decisao = _decisao(t["id"], tarefa_id=tarefas["sl"], prazo="2026-11-20",
                           itens=["listar endpoints da API", "Mapear os campos de pedidos para o banco"])
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=_llm(decisao)):
            await org.organizar()
        tarefa = pauta.obter_tarefa(tarefas["sl"])
        assert [(i["texto"], i["feito"], i["origem"]) for i in tarefa["checklist"]] == [
            ("Listar os endpoints da API", True, "manual"),               # o do chefe: intacto e marcado
            ("Mapear os campos de pedidos para o banco", False, "agente"),  # só o novo entrou
        ]
        assert tarefa["prazo"].isoformat() == "2030-01-10"  # prazo do chefe nunca é trocado

    async def test_prazo_vazio_e_preenchido(self, org, pauta, tarefas):
        t = pauta.registrar_texto("SL: entregar até dia 20")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=_llm(_decisao(t["id"], tarefa_id=tarefas["sl"], prazo="2026-11-20"))):
            await org.organizar()
        assert pauta.obter_tarefa(tarefas["sl"])["prazo"].isoformat() == "2026-11-20"

    async def test_tarefa_nova_nasce_da_pauta(self, org, pauta, tarefas):
        t = pauta.registrar_texto("comprar ração do cachorro")
        decisao = _decisao(t["id"], destino="nova", nova_titulo="Comprar ração", nova_frente="Pessoal",
                           termos=["cachorro"], itens=["Ver preço no mercado"], prazo="não é data")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=_llm(decisao)):
            await org.organizar()
        nova = pauta.listar_tarefas(_frente("pessoal"))
        criada = next(x for x in nova if x["titulo"] == "Comprar ração")
        detalhe = pauta.obter_tarefa(criada["id"])
        assert detalhe["origem"] == "agente" and detalhe["termos"] == ["cachorro"] and detalhe["prazo"] is None
        assert [i["texto"] for i in detalhe["checklist"]] == ["Ver preço no mercado"]

    async def test_saida_do_llm_cortada_em_codigo(self, org, pauta, tarefas):
        t = pauta.registrar_texto("comprar coisas da casa")
        decisao = _decisao(t["id"], destino="nova", nova_titulo="Comprar " + "x" * 200, nova_frente="pessoal",
                           itens=[f"Item {i} da lista de compras" for i in range(12)])
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=_llm(decisao)):
            await org.organizar()
        criada = next(x for x in pauta.listar_tarefas(_frente("pessoal")) if x["titulo"].startswith("Comprar x"))
        assert len(criada["titulo"]) <= 80 and criada["itens_total"] == 5


class TestRecusasDoCodigo:
    async def test_tarefa_inventada_falha_so_aquele_texto(self, org, pauta, tarefas):
        ruim = pauta.registrar_texto("algo do SL")
        bom = pauta.registrar_texto("pedidos do SL")
        llm = _llm(_decisao(ruim["id"], tarefa_id=999), _decisao(bom["id"], tarefa_id=tarefas["sl"]))
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            resumo = await org.organizar()
        assert (resumo["falhas"], resumo["organizados"]) == (1, 1)
        falha = executar_query("anotacoes:buscar_por_id", params=(ruim["id"],))[0]
        assert falha["status"] == "falhou" and "não existe" in falha["erro"]
        assert _status(bom["id"]) == "organizada"

    async def test_texto_sem_decisao_e_frente_inventada_falham(self, org, pauta):
        a = pauta.registrar_texto("um")
        b = pauta.registrar_texto("dois")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=_llm(_decisao(b["id"], destino="nova", nova_titulo="Dois", nova_frente="lazer"))):
            await org.organizar()
        assert _status(a["id"]) == "falhou" and _status(b["id"]) == "falhou"

    async def test_erro_ao_gravar_desfaz_o_lote_inteiro(self, org, pauta, tarefas):
        a = pauta.registrar_texto("comprar pão")
        b = pauta.registrar_texto("comprar leite")
        llm = _llm(_decisao(a["id"], destino="nova", nova_titulo="Comprar pão", nova_frente="pessoal"),
                   _decisao(b["id"], destino="nova", nova_titulo="Comprar leite", nova_frente="pessoal"))
        chamadas = {"n": 0}
        original = org.regras.revisar_decisao

        def quebra_no_segundo(*args, **kwargs):
            chamadas["n"] += 1
            if chamadas["n"] == 2:
                raise RuntimeError("banco caiu")
            return original(*args, **kwargs)

        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm), \
             patch.object(org.regras, "revisar_decisao", side_effect=quebra_no_segundo):
            with pytest.raises(RuntimeError):
                await org.organizar()
        # o primeiro já tinha criado a tarefa dentro da transação: tem que ter sido desfeito
        assert [x["titulo"] for x in pauta.listar_tarefas(_frente("pessoal"))] == ["Integrar a API do hubbia"]
        assert _status(a["id"]) == "falhou" and _status(b["id"]) == "falhou"


class TestFalhaDoLlm:
    async def test_falha_marca_falhou_e_so_volta_pelo_chefe(self, org, pauta, client):
        t = pauta.registrar_texto("algo")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=AsyncMock(side_effect=RuntimeError("Falha ao chamar o modelo para organizar: timeout"))):
            with pytest.raises(RuntimeError):
                await org.organizar()
        assert _status(t["id"]) == "falhou"
        assert executar_query("anotacoes:existe_nova")[0]["existe"] is False  # o tick não pega de novo
        assert client.post(f"/pauta/textos/{t['id']}/tentar-de-novo").json()["status"] == "nova"
        assert client.post(f"/pauta/textos/{t['id']}/tentar-de-novo").status_code == 409

    async def test_gasto_registrado_mesmo_quando_o_formato_vem_errado(self, org, pauta, agente_pauta):
        t = pauta.registrar_texto("algo")
        modelo = AsyncMock()
        modelo.ainvoke = AsyncMock(return_value=resultado_llm_com_erro("json quebrado"))
        with patch("agents.pauta.agente._get_model", return_value=modelo):
            with pytest.raises(RuntimeError):
                await org.organizar()
        assert _status(t["id"]) == "falhou"
        registro = _sql("SELECT erro FROM tick_execucoes WHERE agente_id = %s", (agente_pauta,))
        assert len(registro) == 1 and "parsing_error" in registro[0]["erro"]

    async def test_chamada_boa_registra_custo_e_sem_segredo(self, org, pauta, tarefas, agente_pauta):
        t = pauta.registrar_texto("SL: a chave é sk-proj-AbCdEf1234567890ABCDEFGH, usar no header")
        modelo = AsyncMock()
        modelo.ainvoke = AsyncMock(return_value=resultado_llm(
            OrganizacaoLote(decisoes=[_decisao(t["id"], tarefa_id=tarefas["sl"])]), tokens_in=1000, tokens_out=200))
        with patch("agents.pauta.agente._get_model", return_value=modelo):
            await org.organizar()
        prompt = modelo.ainvoke.call_args.args[0]
        assert "sk-proj" not in prompt and "[segredo]" in prompt
        registro = _sql("SELECT custo_usd, contexto_prompt FROM tick_execucoes WHERE agente_id = %s", (agente_pauta,))
        assert len(registro) == 1 and float(registro[0]["custo_usd"]) > 0
        assert "sk-proj" not in registro[0]["contexto_prompt"]  # nem no log de auditoria
        # no banco da Pauta o original continua inteiro (é do chefe)
        assert "sk-proj" in executar_query("anotacoes:buscar_por_id", params=(t["id"],))[0]["texto"]


class TestPerguntas:
    async def _organizar(self, org, *decisoes):
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=_llm(*decisoes)):
            return await org.organizar()

    async def test_regressao_duvida_sem_tarefa_apontada_falhava_em_vez_de_perguntar(self, org, pauta, tarefas):
        # Em dúvida, o LLM costuma não escolher tarefa (tarefa_id nulo, só candidatos). A validação exigia um
        # tarefa_id existente antes de olhar a confiança, e o texto ia para `falhou` em vez de virar pergunta.
        t = pauta.registrar_texto("a API caiu de novo")
        resumo = await self._organizar(org, _decisao(t["id"], confianca="duvida", candidatos=[tarefas["sl"]]))
        assert (resumo["perguntas"], resumo["falhas"]) == (1, 0)
        assert _status(t["id"]) == "aguardando_voce"

    async def test_termo_em_duas_frentes_vira_pergunta_mesmo_com_certeza(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("a API está devolvendo 500 no login")
        resumo = await self._organizar(org, _decisao(t["id"], tarefa_id=tarefas["sl"], termos=["login"],
                                                     itens=["Ver o log do login"]))
        assert resumo["perguntas"] == 1 and _status(t["id"]) == "aguardando_voce"
        p = client.get("/pauta/perguntas/atual").json()
        assert p["tipo"] == "destino" and len(p["texto"]) <= 140
        rotulos = [o["rotulo"] for o in p["opcoes"]]
        assert rotulos[:2] == ["Avaliar a API do SL", "Integrar a API do hubbia"]
        assert "Tarefa nova em pessoal" in rotulos
        assert all("acao" not in o for o in p["opcoes"])  # a tela só vê o rótulo; o que acontece fica no banco

    async def test_responder_nao_chama_llm_e_ensina_o_termo(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("a API está devolvendo 500 no login")
        await self._organizar(org, _decisao(t["id"], tarefa_id=tarefas["sl"], termos=["login"], itens=["Ver o log do login"]))
        p = client.get("/pauta/perguntas/atual").json()
        llm = _llm()
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote", new=llm):
            r = client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 1})  # é do hubbia
        assert r.status_code == 200 and llm.call_count == 0
        tarefa = r.json()["tarefa"]
        assert tarefa["id"] == tarefas["hubbia"] and "login" in tarefa["termos"]
        assert [i["texto"] for i in tarefa["checklist"]] == ["Ver o log do login"]
        assert _status(t["id"]) == "organizada" and r.json()["proxima"] is None

    async def test_resposta_tarefa_nova(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("API: estudar REST para a prova")
        await self._organizar(org, _decisao(t["id"], tarefa_id=tarefas["sl"], itens=["Revisar verbos HTTP"]))
        p = client.get("/pauta/perguntas/atual").json()
        indice = next(o["indice"] for o in p["opcoes"] if o["rotulo"] == "Tarefa nova em faculdade")
        tarefa = client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": indice}).json()["tarefa"]
        assert tarefa["frente"] == "faculdade" and tarefa["origem"] == "agente"
        assert tarefa["titulo"] == "API: estudar REST para a prova"
        assert [i["texto"] for i in tarefa["checklist"]] == ["Revisar verbos HTTP"]

    async def test_uma_visivel_por_vez_e_a_proxima_sobe(self, org, pauta, tarefas, client):
        a = pauta.registrar_texto("a API caiu")
        b = pauta.registrar_texto("a API mudou de versão")
        await self._organizar(org, _decisao(a["id"], confianca="duvida"), _decisao(b["id"], confianca="duvida"))
        assert _sql("SELECT status FROM perguntas ORDER BY id") == [{"status": "aberta"}, {"status": "na_fila"}]
        p = client.get("/pauta/perguntas/atual").json()
        assert p["na_fila"] == 1
        proxima = client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 0}).json()["proxima"]
        assert proxima is not None and proxima["id"] != p["id"]

    async def test_banco_impede_duas_abertas(self, org, pauta):
        a = pauta.registrar_texto("x")
        b = pauta.registrar_texto("y")
        opcoes = '[{"rotulo": "a", "acao": {}}, {"rotulo": "b", "acao": {}}]'
        for anotacao in (a, b):
            executar_query("perguntas:inserir", returning=True, params=("destino", anotacao["id"], "?", opcoes, "{}"))
        _sql("UPDATE perguntas SET status = 'aberta' WHERE anotacao_id = %s", (a["id"],))
        with pytest.raises(psycopg.errors.UniqueViolation):
            _sql("UPDATE perguntas SET status = 'aberta' WHERE anotacao_id = %s", (b["id"],))

    async def test_mesma_tarefa_com_outro_nome(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("analisar os endpoints")
        await self._organizar(org, _decisao(t["id"], destino="nova", nova_titulo="Analisar a API do SL",
                                            nova_frente="trabalho"))
        p = client.get("/pauta/perguntas/atual").json()
        assert p["tipo"] == "mesma_tarefa" and [o["rotulo"] for o in p["opcoes"]] == ["Sim, é a mesma", "Não, é outra tarefa"]
        tarefa = client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 0}).json()["tarefa"]
        assert tarefa["id"] == tarefas["sl"]
        assert len(pauta.listar_tarefas(_frente("trabalho"))) == 1  # não criou a duplicata

    async def test_erros_de_resposta(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("a API caiu")
        await self._organizar(org, _decisao(t["id"], confianca="duvida"))
        p = client.get("/pauta/perguntas/atual").json()
        assert client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 99}).status_code == 422
        assert client.post("/pauta/perguntas/999/resposta", json={"opcao": 0}).status_code == 404
        assert client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 0}).status_code == 200
        assert client.post(f"/pauta/perguntas/{p['id']}/resposta", json={"opcao": 0}).status_code == 409

    async def test_teto_de_perguntas_por_lote_devolve_o_resto_para_a_fila(self, org, pauta, monkeypatch):
        monkeypatch.setattr(settings, "pauta_perguntas_por_lote", 1)
        a = pauta.registrar_texto("um")
        b = pauta.registrar_texto("dois")
        resumo = await self._organizar(org, _decisao(a["id"], confianca="duvida", destino="nova", nova_titulo="Um",
                                                     nova_frente="pessoal"),
                                       _decisao(b["id"], confianca="duvida", destino="nova", nova_titulo="Dois",
                                                nova_frente="pessoal"))
        assert (resumo["perguntas"], resumo["devolvidos"]) == (1, 1)
        assert _status(b["id"]) == "nova"

    async def test_pergunta_mostra_o_texto_sem_segredo(self, org, pauta, tarefas, client):
        t = pauta.registrar_texto("API: token=abc123xyz para testar")
        await self._organizar(org, _decisao(t["id"], confianca="duvida"))
        p = client.get("/pauta/perguntas/atual").json()
        assert "abc123xyz" not in p["texto"] and "abc123xyz" not in p["texto_original"]


class TestTick:
    async def _cenario(self, agente_pauta):
        import resolvers.tick as tick
        from tests.test_interacao import _criar_chefe
        chefe = _criar_chefe()
        tick.avancar_tick()
        return chefe

    async def test_tick_organiza_sem_mandar_mensagem(self, org, pauta, tarefas, agente_pauta):
        import resolvers.interacao as interacao
        await self._cenario(agente_pauta)
        t = pauta.registrar_texto("pedidos do SL")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=_llm(_decisao(t["id"], tarefa_id=tarefas["sl"]))):
            resultado = await interacao.processar_tick_completo()
        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agente_pauta)
        assert entrada["tipo"] == "trabalho" and entrada["mensagem"] is None and "aviso" not in entrada
        assert executar_query("agentes:buscar_por_id", params=(agente_pauta,))[0]["estado"] == "executando"
        assert _status(t["id"]) == "organizada"
        assert executar_query("mensagens:listar_todas", params=(10,)) == []  # nada de lembrete no chat

    async def test_tick_sem_texto_novo_nao_trabalha(self, agente_pauta):
        import resolvers.interacao as interacao
        assert interacao._checar_pauta({"id": agente_pauta}) is None

    async def test_tick_para_no_teto_do_dia(self, pauta, agente_pauta, monkeypatch):
        import resolvers.interacao as interacao
        monkeypatch.setattr(settings, "pauta_rodadas_por_dia", 2)
        pauta.registrar_texto("algo")
        assert interacao._checar_pauta({"id": agente_pauta}) == {"novas": 1}
        registrar_gasto(agente_pauta, 0.0001)
        registrar_gasto(agente_pauta, 0.0001)
        assert interacao._checar_pauta({"id": agente_pauta}) is None


class TestRotas:
    async def test_organizar_por_http(self, client, pauta, tarefas):
        t = pauta.registrar_texto("pedidos do SL")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=_llm(_decisao(t["id"], tarefa_id=tarefas["sl"]))):
            r = client.post("/pauta/organizar")
        assert r.status_code == 200 and r.json()["organizados"] == 1

    async def test_falha_do_llm_vira_422_e_aparece_nas_falhas(self, client, pauta):
        pauta.registrar_texto("algo")
        with patch("resolvers.pauta_organizar.agente_pauta.organizar_lote",
                   new=AsyncMock(side_effect=RuntimeError("Falha ao chamar o modelo para organizar: timeout"))):
            r = client.post("/pauta/organizar")
        assert r.status_code == 422 and "timeout" in r.json()["detail"]
        assert [f["texto"] for f in client.get("/pauta/textos/falhas").json()] == ["algo"]
