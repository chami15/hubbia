"""Registro de execução de LLM (`agents/_shared/execucoes.py`): o cronômetro e o que ele grava."""
import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from agents._shared.execucoes import cronometrar
from utils.query_executor import executar_query


class TestCronometro:
    def test_tempo_congela_na_saida(self):
        with cronometrar() as t:
            time.sleep(0.02)
        medido = t.ms
        time.sleep(0.02)
        assert medido >= 20 and t.ms == medido

    def test_regressao_tempo_lido_dentro_do_bloco_era_none(self):
        # Os agentes registram a chamada que FALHOU dentro do `with cronometrar()` (no except), e o tempo só era
        # preenchido no `finally`, depois: toda falha ia para tick_execucoes com duracao_ms nulo, justamente a
        # chamada que demorou e estourou, que é a que o painel de monitoramento mais precisa ver.
        with cronometrar() as t:
            time.sleep(0.02)
            dentro = t.ms
        assert dentro is not None and dentro >= 20

    async def test_regressao_falha_de_agente_real_grava_a_duracao(self):
        # o mesmo bug de ponta a ponta, num agente que já existia (Vita): chamada que estoura depois de 30 ms
        from agents.saude import agente as agente_saude
        executar_query("agentes:upsert", returning=True, params=("Vita", "colaborador", "saude", None, "{}", 3, 8))

        async def demora_e_falha(_prompt):
            await asyncio.sleep(0.03)
            raise TimeoutError("timeout")

        modelo = AsyncMock()
        modelo.ainvoke = demora_e_falha
        with patch.object(agente_saude, "_get_model_macro", return_value=modelo):
            with pytest.raises(RuntimeError):
                await agente_saude.estimar_macros_texto("arroz", "almoco", {})
        from utils.db import Database
        with Database() as conn:
            conn.execute("SELECT duracao_ms, erro FROM tick_execucoes")
            linhas = conn.fetchall()
        assert len(linhas) == 1 and "timeout" in linhas[0]["erro"]
        assert linhas[0]["duracao_ms"] is not None and linhas[0]["duracao_ms"] >= 30


class TestSemChaveDaOpenAI:
    def test_regressao_sem_chave_virava_500_sem_explicacao(self, client):
        # Sem OPENAI_API_KEY o erro sai ao criar o modelo (antes do try de cada agente) e é `OpenAIError`, que nenhum
        # router tratava: 500 cru, que o navegador mostra como "não consegui falar com o servidor". Agora vira 422 com
        # a causa e o que fazer, em todas as rotas de uma vez (tratador único no main.py).
        from openai import OpenAIError

        from agents.saude import agente as agente_saude
        import resolvers.saude as saude
        from tests.test_saude import _perfil_padrao
        saude.salvar_perfil(_perfil_padrao())
        with patch.object(agente_saude, "_get_model_macro", side_effect=OpenAIError("Missing credentials")):
            r = client.post("/saude/refeicao/texto", json={"tipo_refeicao": "almoco", "descricao": "arroz e feijão"})
        assert r.status_code == 422
        assert "OPENAI_API_KEY" in r.json()["detail"]
