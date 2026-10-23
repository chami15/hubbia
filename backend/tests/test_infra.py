"""Testes da sala de máquinas (resolvers/infra.py) e do agente Motriz.

Nenhum destes testes mocka LLM, e isso não é economia de esforço: o
domínio de infra é o único do hub que **não pode** chamar modelo. Se um
dia alguém introduzir uma chamada aqui, `test_motriz_nao_gasta_llm`
quebra — é o teste que protege a regra.
"""
import pytest

import resolvers.tick as tick
from resolvers import infra, interacao
from tests.helpers import registrar_gasto
from utils.query_executor import executar_query


def _criar_agente(nome: str, especialidade: str, extroversao: int = 5) -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=(nome, "colaborador", especialidade, f"Personalidade de {nome}.", "{}", 0, extroversao),
    )
    return rows[0]["id"]


def _criar_chefe() -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=("Chefe", "chefe", "chefe", None, "{}", 0, 5),
    )
    return rows[0]["id"]


async def _rodar_tick() -> dict | None:
    """Avança o relógio, processa a rodada e devolve a entrada do Motriz."""
    tick.avancar_tick()
    resultado = await interacao.processar_tick_completo()
    return next((i for i in resultado["interacoes"] if i["agente_nome"] == "Motriz"), None)


class TestSaude:
    def test_banco_de_pe_aparece_ok(self):
        saude = infra.obter_saude()
        banco = next(i for i in saude["itens"] if i["nome"] == "Banco de dados")
        assert banco["status"] == "ok"

    def test_orcamento_esgotado_vira_quebrado(self):
        from config import settings

        registrar_gasto(_criar_agente("A", "teste"), settings.orcamento_diario_usd * 2)

        saude = infra.obter_saude()
        orcamento = next(i for i in saude["itens"] if i["nome"] == "Orçamento do dia")
        assert orcamento["status"] == "quebrado"
        assert saude["status_geral"] == "quebrado"

    def test_status_geral_e_o_pior_dos_itens(self):
        """Um item quebrado não pode ficar escondido atrás de cinco ok."""
        from config import settings

        registrar_gasto(_criar_agente("A", "teste"), settings.orcamento_diario_usd * 2)
        saude = infra.obter_saude()

        assert any(i["status"] == "ok" for i in saude["itens"])
        assert saude["status_geral"] == "quebrado"

    def test_nao_configurado_nao_e_o_mesmo_que_quebrado(self):
        """Norte sem token do GitHub num hub que não usa o Norte é uma
        escolha, não um defeito — não pode pintar a tela de vermelho."""
        saude = infra.obter_saude()
        github = next(i for i in saude["itens"] if i["nome"] == "GitHub")

        assert github["status"] == "nao_configurado"
        # sozinho, não degrada o geral
        assert saude["status_geral"] != "quebrado"


class TestMetricas:
    def test_sem_chamada_nenhuma_taxa_de_sucesso_e_total(self):
        m = infra.obter_metricas()
        assert m["chamadas"] == 0
        assert m["taxa_sucesso"] == 1.0

    def test_agrupa_custo_por_agente(self):
        a = _criar_agente("A", "teste")
        b = _criar_agente("B", "teste2")
        registrar_gasto(a, 0.01)
        registrar_gasto(a, 0.02)
        registrar_gasto(b, 0.05)

        m = infra.obter_metricas()
        por_nome = {r["agente_nome"]: r for r in m["por_agente"]}

        assert round(por_nome["A"]["custo_usd"], 2) == 0.03
        assert por_nome["A"]["chamadas"] == 2
        assert round(por_nome["B"]["custo_usd"], 2) == 0.05

    def test_erro_entra_na_taxa_de_sucesso(self):
        a = _criar_agente("A", "teste")
        registrar_gasto(a, 0.01)
        registrar_gasto(a, 0.01, erro="parsing_error: x")

        m = infra.obter_metricas()
        assert m["chamadas"] == 2
        assert m["erros"] == 1
        assert m["taxa_sucesso"] == 0.5

    def test_dry_run_fica_de_fora(self):
        a = _criar_agente("A", "teste")
        registrar_gasto(a, 0.5, dry_run=True)

        m = infra.obter_metricas()
        assert m["chamadas"] == 0
        assert m["custo_usd"] == 0.0


@pytest.mark.asyncio
class TestMotriz:
    async def test_sem_problema_nenhum_fica_quieto(self):
        _criar_chefe()
        _criar_agente("Motriz", "infra", extroversao=0)

        entrada = await _rodar_tick()
        assert entrada["tipo"] != "trabalho"

    async def test_avisa_quando_aparece_problema(self):
        from config import settings

        chefe_id = _criar_chefe()
        motriz_id = _criar_agente("Motriz", "infra", extroversao=0)
        registrar_gasto(motriz_id, settings.orcamento_diario_usd * 2)

        entrada = await _rodar_tick()

        assert entrada["tipo"] == "trabalho"
        assert "Orçamento" in entrada["mensagem"]
        assert entrada["destinatario_id"] == chefe_id

    async def test_nao_repete_o_mesmo_aviso(self):
        """Aviso que se repete todo tick ensina a ignorar aviso."""
        from config import settings

        _criar_chefe()
        motriz_id = _criar_agente("Motriz", "infra", extroversao=0)
        registrar_gasto(motriz_id, settings.orcamento_diario_usd * 2)

        primeira = await _rodar_tick()
        segunda = await _rodar_tick()

        assert primeira["tipo"] == "trabalho"
        assert segunda["tipo"] != "trabalho"

    async def test_avisa_de_novo_quando_normaliza(self):
        from config import settings
        from utils.db import Database

        _criar_chefe()
        motriz_id = _criar_agente("Motriz", "infra", extroversao=0)
        registrar_gasto(motriz_id, settings.orcamento_diario_usd * 2)
        await _rodar_tick()  # avisa do problema

        with Database() as conn:  # some o gasto → orçamento normaliza
            conn.execute("DELETE FROM tick_execucoes")
            conn.commit()

        entrada = await _rodar_tick()
        assert entrada["tipo"] == "trabalho"
        assert "normalizado" in entrada["mensagem"]

    async def test_roda_mesmo_com_orcamento_estourado(self):
        """É justamente com o teto estourado que um aviso de infra mais
        serve — é ele que diz POR QUE o escritório ficou quieto."""
        from config import settings

        _criar_chefe()
        motriz_id = _criar_agente("Motriz", "infra", extroversao=0)
        # outro colaborador, que DEVE ficar bloqueado
        _criar_agente("Cifra", "financeiro", extroversao=10)
        registrar_gasto(motriz_id, settings.orcamento_diario_usd * 2)

        tick.avancar_tick()
        resultado = await interacao.processar_tick_completo()

        assert "esgotado" in resultado["aviso"]
        motriz = next(i for i in resultado["interacoes"] if i["agente_nome"] == "Motriz")
        cifra = next(i for i in resultado["interacoes"] if i["agente_nome"] == "Cifra")
        assert motriz["tipo"] == "trabalho"
        assert cifra["tipo"] is None

    async def test_motriz_nao_gasta_llm(self, mocker):
        """A regra central do domínio: infra é 100% determinístico.

        Se alguém introduzir uma chamada de modelo aqui um dia, este
        teste quebra — que é exatamente o ponto."""
        from config import settings

        _criar_chefe()
        motriz_id = _criar_agente("Motriz", "infra", extroversao=0)
        registrar_gasto(motriz_id, settings.orcamento_diario_usd * 2)
        gasto_antes = tick.orcamento_gasto_hoje()

        mock_social = mocker.patch("resolvers.interacao.agente_interacao.gerar_mensagem_social")

        entrada = await _rodar_tick()

        assert entrada["tipo"] == "trabalho"
        assert mock_social.call_count == 0
        assert tick.orcamento_gasto_hoje() == gasto_antes


class TestObservabilidade:
    def test_janela_tem_um_balde_por_hora(self):
        """Hora SEM chamada precisa aparecer como zero, não sumir — buraco
        no eixo do tempo mente sobre o formato da curva."""
        obs = infra.obter_observabilidade(horas=6)

        assert len(obs["serie"]) == 6
        assert all(p["chamadas"] == 0 for p in obs["serie"])

    def test_percentis_de_latencia(self):
        a = _criar_agente("A", "teste")
        for ms in [100, 200, 300, 400, 5000]:
            registrar_gasto(a, 0.001, duracao_ms=ms)

        obs = infra.obter_observabilidade(horas=24)

        assert obs["latencia"]["amostras"] == 5
        assert obs["latencia"]["p50_ms"] == 300
        # p95 fica perto do outlier — é justamente o que a média esconderia
        assert obs["latencia"]["p95_ms"] > 4000

    def test_chamada_sem_duracao_nao_entra_no_percentil(self):
        """Linha antiga (anterior à migration 011) ou falha que nem chegou
        ao modelo não vira latência zero puxando a média pra baixo."""
        a = _criar_agente("A", "teste")
        registrar_gasto(a, 0.001, duracao_ms=500)
        registrar_gasto(a, 0.001, duracao_ms=None)

        obs = infra.obter_observabilidade(horas=24)

        assert obs["latencia"]["amostras"] == 1
        assert obs["trafego"]["chamadas"] == 2  # tráfego conta as duas

    def test_saturacao_e_o_orcamento(self):
        from config import settings

        a = _criar_agente("A", "teste")
        registrar_gasto(a, settings.orcamento_diario_usd / 2)

        obs = infra.obter_observabilidade(horas=24)
        assert round(obs["saturacao"]["fracao"], 2) == 0.5

    def test_dry_run_nao_polui_nenhum_sinal(self):
        a = _criar_agente("A", "teste")
        registrar_gasto(a, 0.5, dry_run=True, duracao_ms=9999)

        obs = infra.obter_observabilidade(horas=24)

        assert obs["trafego"]["chamadas"] == 0
        assert obs["latencia"]["amostras"] == 0
        assert obs["saturacao"]["gasto_usd"] == 0.0

    def test_dependencia_com_erro_mais_novo_que_o_sucesso(self):
        """O 'uptime' honesto: última chamada bem-sucedida por dependência,
        derivada do uso real — sem pingar Google/GitHub a cada tick."""
        a = _criar_agente("Agenda", "agenda")
        registrar_gasto(a, 0.001, duracao_ms=100)
        registrar_gasto(a, 0.001, duracao_ms=100, erro="token expirado")

        obs = infra.obter_observabilidade(horas=24)
        dep = next(d for d in obs["dependencias"] if d["especialidade"] == "agenda")

        assert dep["ultimo_ok"] is not None
        assert dep["ultimo_erro"] is not None
        assert dep["ultimo_erro"] > dep["ultimo_ok"]  # está falhando AGORA

    def test_log_traz_as_execucoes_mais_recentes(self):
        a = _criar_agente("A", "teste")
        registrar_gasto(a, 0.001, duracao_ms=111, erro="algo quebrou")

        obs = infra.obter_observabilidade(horas=24)

        assert len(obs["execucoes"]) == 1
        assert obs["execucoes"][0]["erro"] == "algo quebrou"
        assert obs["execucoes"][0]["duracao_ms"] == 111
