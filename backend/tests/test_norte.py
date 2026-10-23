"""Testes do domínio Norte: projetos (GitHub), guardrail de "só 1 card
ativo por projeto" (checado ANTES de qualquer chamada de GitHub/LLM),
encadeamento automático do próximo card, e validação de branch."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.norte.agente import CardGerado, EscaneamentoProjeto
from tests.helpers import resultado_agente, resultado_llm


def _escaneamento():
    return EscaneamentoProjeto(descricao="Projeto de teste.", stack=["Python"], arquitetura_resumo="backend/ e frontend/")


async def _criar_projeto_mockado(norte, nome="Projeto", url="https://github.com/o/r", branch=None):
    with patch("resolvers.norte.github_client.obter_arvore_raiz", return_value=[]), \
         patch("resolvers.norte.github_client.obter_readme", return_value=None), \
         patch("resolvers.norte.github_client.obter_manifest", return_value=[]), \
         patch("resolvers.norte.github_client.obter_branch_padrao", return_value="main"), \
         patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-0", "mensagem": "init"}), \
         patch("resolvers.norte.agente_norte.escanear_projeto", new=AsyncMock(return_value=resultado_agente(_escaneamento()))):
        return await norte.criar_projeto(nome, url, branch)


class TestParsingDeUrl:
    @pytest.mark.parametrize("url,esperado", [
        ("https://github.com/chami15/toss-hub-agente", ("chami15", "toss-hub-agente")),
        ("https://github.com/chami15/toss-hub-agente.git", ("chami15", "toss-hub-agente")),
        ("https://github.com/chami15/toss-hub-agente/", ("chami15", "toss-hub-agente")),
        ("git@github.com:chami15/toss-hub-agente.git", ("chami15", "toss-hub-agente")),
    ])
    def test_formatos_validos(self, url, esperado):
        import resolvers.norte as norte
        assert norte._parse_repositorio_url(url) == esperado

    def test_url_nao_github_rejeitada(self):
        import resolvers.norte as norte
        with pytest.raises(ValueError):
            norte._parse_repositorio_url("https://gitlab.com/owner/repo")


class TestCriarProjeto:
    async def test_criacao_basica(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)
        assert projeto["descricao"] == "Projeto de teste."
        assert projeto["branch"] == "main"

    async def test_branch_explicita_valida(self):
        import resolvers.norte as norte
        with patch("resolvers.norte.github_client.listar_branches", return_value=["main", "dev"]):
            projeto = await _criar_projeto_mockado(norte, branch="dev")
        assert projeto["branch"] == "dev"

    async def test_branch_inexistente_e_rejeitada_sem_chamar_scan(self):
        import resolvers.norte as norte
        mock_arvore = MagicMock()
        mock_llm = AsyncMock()
        with patch("resolvers.norte.github_client.listar_branches", return_value=["main", "dev"]), \
             patch("resolvers.norte.github_client.obter_arvore_raiz", mock_arvore), \
             patch("resolvers.norte.agente_norte.escanear_projeto", mock_llm):
            with pytest.raises(ValueError, match="não existe"):
                await norte.criar_projeto("X", "https://github.com/o/r", branch="feature-fantasma")
        assert mock_arvore.call_count == 0
        assert mock_llm.call_count == 0


class TestGuardrailDeCardUnico:
    async def test_bloqueia_gerar_card_com_um_ja_ativo_sem_chamar_github_ou_llm(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)

        card = CardGerado(tipo="proximo_passo", titulo="T1", descricao="D1", arquivos_afetados=["a.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-1", "mensagem": "m"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card))):
            await norte.gerar_proximo_card(projeto["id"])

        mock_github = MagicMock()
        mock_llm = AsyncMock()
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", mock_github), \
             patch("resolvers.norte.agente_norte.gerar_card", mock_llm):
            with pytest.raises(ValueError, match="Já existe um card"):
                await norte.gerar_proximo_card(projeto["id"])
        assert mock_github.call_count == 0
        assert mock_llm.call_count == 0

    async def test_card_manual_tambem_respeita_a_regra(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)
        norte.criar_card_manual(projeto["id"], "feature", "Manual", "desc", ["x.py"])
        with pytest.raises(ValueError, match="Já existe um card"):
            norte.criar_card_manual(projeto["id"], "bug", "Outro", "desc", ["y.py"])


class TestCicloDeVidaDoCard:
    async def test_rejeitar_encadeia_proximo_automaticamente(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)

        card1 = CardGerado(tipo="proximo_passo", titulo="T1", descricao="D1", arquivos_afetados=["a.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-1", "mensagem": "m"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card1))):
            card_gerado = await norte.gerar_proximo_card(projeto["id"])

        card2 = CardGerado(tipo="feature", titulo="T2", descricao="D2", arquivos_afetados=["b.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-2", "mensagem": "m2"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card2))):
            resultado = await norte.rejeitar_card(card_gerado["id"])

        assert resultado["card_resolvido"]["status"] == "rejeitado"
        assert resultado["proximo_card"]["titulo"] == "T2"
        assert resultado["aviso"] is None

    async def test_falha_no_encadeamento_nao_corrompe_resolucao_principal(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)

        card1 = CardGerado(tipo="proximo_passo", titulo="T1", descricao="D1", arquivos_afetados=["a.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-1", "mensagem": "m"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card1))):
            card_gerado = await norte.gerar_proximo_card(projeto["id"])

        with patch("resolvers.norte.github_client.obter_commit_mais_recente", side_effect=RuntimeError("GitHub fora do ar")):
            resultado = await norte.rejeitar_card(card_gerado["id"])

        assert resultado["card_resolvido"]["status"] == "rejeitado"
        assert resultado["proximo_card"] is None
        assert "não consegui gerar o próximo" in resultado["aviso"]
        assert norte.obter_card_ativo(projeto["id"]) is None

    async def test_aceitar_depois_finalizar(self):
        import resolvers.norte as norte
        projeto = await _criar_projeto_mockado(norte)
        card1 = CardGerado(tipo="proximo_passo", titulo="T1", descricao="D1", arquivos_afetados=["a.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-1", "mensagem": "m"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card1))):
            card_gerado = await norte.gerar_proximo_card(projeto["id"])

        aceito = norte.aceitar_card(card_gerado["id"])
        assert aceito["status"] == "aceito"

        card2 = CardGerado(tipo="bug", titulo="T2", descricao="D2", arquivos_afetados=["b.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-2", "mensagem": "m2"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card2))):
            resultado = await norte.finalizar_card(aceito["id"])
        assert resultado["card_resolvido"]["status"] == "finalizado"
        assert resultado["proximo_card"]["titulo"] == "T2"

    def test_nao_aceita_card_que_nao_esta_sugerido(self):
        import resolvers.norte as norte
        with pytest.raises(ValueError, match="não encontrado"):
            norte.aceitar_card(9999)


class TestListarProjetosComEstagnacao:
    """`estagnado` em GET /norte/projetos repete a MESMA regra de
    projetos:listar_estagnados (usada pra proatividade do tick), só que
    pra todo projeto — é o que a tela usa pro destaque visual do card."""

    async def test_projeto_recente_nao_estagnado(self):
        import resolvers.norte as norte
        await _criar_projeto_mockado(norte)
        projetos = norte.listar_projetos()
        assert projetos[0]["estagnado"] is False

    async def test_projeto_parado_sem_card_e_estagnado(self):
        import resolvers.norte as norte
        from utils.db import Database

        projeto = await _criar_projeto_mockado(norte)
        with Database() as conn:
            conn.execute(
                "UPDATE projetos SET criado_em = now() - interval '30 days' WHERE id = %s",
                (projeto["id"],),
            )
            conn.commit()

        projetos = norte.listar_projetos()
        achado = next(p for p in projetos if p["id"] == projeto["id"])
        assert achado["estagnado"] is True

    async def test_projeto_parado_mas_com_card_aberto_nao_e_estagnado(self):
        import resolvers.norte as norte
        from utils.db import Database

        projeto = await _criar_projeto_mockado(norte)
        with Database() as conn:
            conn.execute(
                "UPDATE projetos SET criado_em = now() - interval '30 days' WHERE id = %s",
                (projeto["id"],),
            )
            conn.commit()

        card = CardGerado(tipo="bug", titulo="T", descricao="D", arquivos_afetados=["a.py"])
        with patch("resolvers.norte.github_client.obter_commit_mais_recente", return_value={"sha": "sha-1", "mensagem": "m"}), \
             patch("resolvers.norte.github_client.obter_mudancas_desde", return_value={"commits": [], "arquivos_alterados": []}), \
             patch("resolvers.norte.agente_norte.gerar_card", new=AsyncMock(return_value=resultado_agente(card))):
            await norte.gerar_proximo_card(projeto["id"])

        projetos = norte.listar_projetos()
        achado = next(p for p in projetos if p["id"] == projeto["id"])
        assert achado["estagnado"] is False

    async def test_projeto_pausado_nunca_e_estagnado_mesmo_parado_ha_muito(self):
        import resolvers.norte as norte
        from utils.db import Database

        projeto = await _criar_projeto_mockado(norte)
        with Database() as conn:
            conn.execute(
                "UPDATE projetos SET criado_em = now() - interval '30 days' WHERE id = %s",
                (projeto["id"],),
            )
            conn.commit()
        norte.atualizar_status_projeto(projeto["id"], "pausado")

        projetos = norte.listar_projetos()
        achado = next(p for p in projetos if p["id"] == projeto["id"])
        assert achado["estagnado"] is False


class TestStackTruncada:
    async def test_stack_truncada_a_10_mesmo_se_llm_devolver_mais(self):
        from agents.norte.agente import escanear_projeto

        muitos_itens = [f"lib{i}" for i in range(15)]
        escaneamento = EscaneamentoProjeto(descricao="d", stack=muitos_itens, arquitetura_resumo="a")
        with patch("agents.norte.agente._get_model_scan") as get_model:
            get_model.return_value.ainvoke = AsyncMock(return_value=resultado_llm(escaneamento))
            saida = await escanear_projeto([], "readme", [])
        assert len(saida["dado"].stack) == 10
