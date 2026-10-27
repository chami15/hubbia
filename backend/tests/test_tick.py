"""Testes do motor de tick — Etapa 1 (fundação): relógio simulado, sem
nenhum comportamento de agente ainda. Zero chamada de LLM em toda a
suíte, condizente com o escopo real dessa etapa."""
from unittest.mock import patch

import pytest

import resolvers.tick as tick
from tests.helpers import registrar_gasto
from utils.query_executor import executar_query


def _criar_agente(nome: str, tipo: str = "colaborador", ativo: bool = True) -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=(nome, tipo, "teste", None, "{}", 0, 5),
    )
    agente_id = rows[0]["id"]
    if not ativo:
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET ativo = FALSE WHERE id = %s", (agente_id,))
            conn.commit()
    return agente_id


class TestRelogioSimulado:
    def test_sem_tick_nenhum(self):
        assert tick.obter_tick_atual() is None

    def test_primeiro_tick_comeca_no_numero_1(self):
        resultado = tick.avancar_tick()
        assert resultado["numero"] == 1
        assert resultado["dry_run"] is False

        atual = tick.obter_tick_atual()
        assert atual["numero"] == 1

    def test_segundo_tick_incrementa_numero(self):
        primeiro = tick.avancar_tick()
        segundo = tick.avancar_tick()
        assert segundo["numero"] == primeiro["numero"] + 1

    def test_hora_do_tick_e_a_hora_do_mundo_no_instante_dele_nao_um_passo_fixo(self):
        """Sprint 2 (fase C): o tick não tem hora própria. Antes cada tick somava `tick_minutos_simulados` (60 min)
        à hora do anterior; agora grava a hora do relógio do mundo naquele instante, e dois ticks seguidos
        saem com a hora que o relógio mandar, sem relação com um passo fixo."""
        from datetime import datetime, timezone
        h1 = datetime(2026, 10, 27, 9, 0, tzinfo=timezone.utc)
        h2 = datetime(2026, 10, 27, 9, 7, tzinfo=timezone.utc)  # 7 min depois, não 60

        with patch("resolvers.tick.relogio.hora_atual", side_effect=[h1, h2]):
            primeiro = tick.avancar_tick()
            segundo = tick.avancar_tick()

        assert datetime.fromisoformat(primeiro["hora_simulada"]) == h1
        assert datetime.fromisoformat(segundo["hora_simulada"]) == h2

    def test_origem_padrao_e_manual_e_fica_gravada(self):
        tick.avancar_tick()
        assert tick.obter_tick_atual()["origem"] == "manual"

    def test_origem_automatico_fica_gravada(self):
        tick.avancar_tick(origem="automatico")
        assert tick.obter_tick_atual()["origem"] == "automatico"

    def test_origem_desconhecida_e_recusada_e_nao_grava(self):
        with pytest.raises(ValueError):
            tick.avancar_tick(origem="cron")
        assert tick.obter_tick_atual() is None

    def test_dry_run_nao_persiste_nada(self):
        resultado = tick.avancar_tick(dry_run=True)
        assert resultado["numero"] == 1  # calculado, mas não gravado
        assert tick.obter_tick_atual() is None  # nada persistido de verdade


class TestEstadoDosAgentes:
    def test_tick_atualiza_estado_de_colaborador_ativo(self):
        agente_id = _criar_agente("Teste Colaborador")
        executar_query("agentes:atualizar_estado_ativos", commit=True, params=("falando",))  # sujeira prévia proposital

        tick.avancar_tick()

        agente = executar_query("agentes:buscar_por_id", params=(agente_id,))[0]
        assert agente["estado"] == "idle"

    def test_tick_nao_mexe_no_chefe(self):
        chefe_id = _criar_agente("Você", tipo="chefe")
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET estado = 'executando' WHERE id = %s", (chefe_id,))
            conn.commit()

        tick.avancar_tick()

        chefe = executar_query("agentes:buscar_por_id", params=(chefe_id,))[0]
        assert chefe["estado"] == "executando"  # intocado

    def test_tick_nao_mexe_em_colaborador_inativo(self):
        agente_id = _criar_agente("Inativo", ativo=False)
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET estado = 'pensando' WHERE id = %s", (agente_id,))
            conn.commit()

        tick.avancar_tick()

        agente = executar_query("agentes:buscar_por_id", params=(agente_id,))[0]
        assert agente["estado"] == "pensando"  # intocado, não está ativo

    def test_dry_run_nao_atualiza_estado(self):
        agente_id = _criar_agente("Teste")
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET estado = 'falando' WHERE id = %s", (agente_id,))
            conn.commit()

        tick.avancar_tick(dry_run=True)

        agente = executar_query("agentes:buscar_por_id", params=(agente_id,))[0]
        assert agente["estado"] == "falando"  # intocado


class TestOrcamentoDiario:
    def test_sem_gasto_nenhum(self):
        assert tick.orcamento_gasto_hoje() == 0.0
        from config import settings
        assert tick.orcamento_disponivel_hoje() == settings.orcamento_diario_usd

    def test_soma_custo_de_agentes_diferentes(self):
        """O orçamento é do ESCRITÓRIO, não de um agente — soma todo mundo.

        Antes este teste inseria numa tabela de domínio (relatório, card)
        porque o orçamento era um UNION sobre elas. Agora quem move o
        orçamento é a execução registrada em `tick_execucoes`, venha de
        que domínio vier — inclusive de domínio que ainda não existe."""
        registrar_gasto(_criar_agente("A"), 0.01)
        registrar_gasto(_criar_agente("B"), 0.02)

        assert round(tick.orcamento_gasto_hoje(), 2) == 0.03

    def test_dry_run_nao_conta_no_orcamento(self):
        """Prévia não gastou nada de verdade — não pode consumir teto."""
        agente_id = _criar_agente("A")
        registrar_gasto(agente_id, 0.5, dry_run=True)

        assert tick.orcamento_gasto_hoje() == 0.0

    def test_chamada_que_falhou_ainda_conta(self):
        """Chamada que quebrou no parsing queimou token igual — se não
        contasse, um agente com defeito furaria o teto em silêncio."""
        registrar_gasto(_criar_agente("A"), 0.01, erro="parsing_error: xyz")

        assert round(tick.orcamento_gasto_hoje(), 2) == 0.01

    def test_orcamento_disponivel_nunca_fica_negativo(self):
        from config import settings
        registrar_gasto(_criar_agente("A"), settings.orcamento_diario_usd * 10)

        assert tick.orcamento_disponivel_hoje() == 0.0

    def test_tick_registra_snapshot_de_orcamento_no_estado_mundo(self):
        registrar_gasto(_criar_agente("A"), 0.01)
        tick.avancar_tick()
        atual = tick.obter_tick_atual()
        assert atual["estado_mundo"]["orcamento_gasto_hoje"] == 0.01
