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
