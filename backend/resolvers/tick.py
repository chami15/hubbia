"""Motor de tick — Etapa 1 (fundação, ver conversa de design do módulo de
interação): só o relógio simulado em si. Nenhuma chamada de LLM, nenhum
comportamento de agente ainda — isso entra nas próximas etapas (social,
depois proatividade de trabalho por domínio), cada uma validada
separadamente antes de acumular a próxima.

Disparo é sempre manual (endpoint), nunca um scheduler automático rodando
sozinho — mesma disciplina de "nunca automático até provar que é seguro"
usada em todo o resto do hub, só que aplicada pela primeira vez ao próprio
motor que existe pra ser autônomo no fim das contas (ver
docs/backlog-futuro.md pra quando isso mudar).
"""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from config import settings
from utils.query_executor import executar_query


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone_padrao))


def _inicio_do_dia() -> datetime:
    hoje = _agora().date()
    return datetime.combine(hoje, datetime.min.time(), tzinfo=ZoneInfo(settings.timezone_padrao))


def obter_tick_atual() -> dict | None:
    rows = executar_query("ticks:buscar_ultimo")
    return rows[0] if rows else None


def _calcular_proximo_tick() -> dict:
    ultimo = obter_tick_atual()
    if ultimo is None:
        return {"numero": 1, "hora_simulada": _agora()}
    return {
        "numero": ultimo["numero"] + 1,
        "hora_simulada": ultimo["hora_simulada"] + timedelta(minutes=settings.tick_minutos_simulados),
    }


def orcamento_gasto_hoje() -> float:
    """Soma o custo_usd de hoje em `tick_execucoes` — a tabela por onde
    TODA chamada de LLM do hub passa (ver agents/_shared/execucoes.py).

    Antes isto era um UNION escrito à mão sobre 5 tabelas de domínio, o
    que tinha dois furos: domínio novo que gastasse LLM e não fosse
    adicionado ali gastava invisível ao guardrail, e a Agenda — o agente
    mais caro do hub, o único com tool-calling — nunca gravou custo em
    tabela nenhuma, então nunca entrou na conta. Com uma tabela só,
    agente novo entra na contabilidade sem editar SQL de ninguém."""
    inicio = _inicio_do_dia()
    rows = executar_query("tick_execucoes:custo_gasto_hoje", params=(inicio,))
    return float(rows[0]["total"])


def orcamento_disponivel_hoje() -> float:
    return max(0.0, settings.orcamento_diario_usd - orcamento_gasto_hoje())


def avancar_tick(dry_run: bool = False) -> dict:
    """Avança o relógio simulado em 1 tick.

    dry_run=True calcula tudo (próximo número, hora simulada, orçamento
    disponível) mas NÃO persiste nada — nem o tick, nem o estado dos
    agentes. Serve pra conferir o que aconteceria sem gastar/gravar de
    verdade, mesmo espírito do --dry-run que scripts.migrate/seed já não
    têm mas que o motor de tick precisa ter desde o primeiro commit,
    dado que ele é o único ponto do hub pensado pra rodar sem supervisão
    direta no futuro.
    """
    proximo = _calcular_proximo_tick()
    orcamento_disponivel = orcamento_disponivel_hoje()

    resultado = {
        "numero": proximo["numero"],
        "hora_simulada": proximo["hora_simulada"].isoformat(),
        "orcamento_disponivel_hoje": round(orcamento_disponivel, 6),
        "dry_run": dry_run,
        "agentes_atualizados": 0,
    }

    if dry_run:
        return resultado

    estado_mundo = {
        "orcamento_gasto_hoje": round(settings.orcamento_diario_usd - orcamento_disponivel, 6),
        "orcamento_disponivel_hoje": round(orcamento_disponivel, 6),
    }
    executar_query(
        "ticks:inserir",
        returning=True,
        params=(proximo["numero"], proximo["hora_simulada"], json.dumps(estado_mundo)),
    )

    # Etapa 1: sempre 'idle' — nenhum comportamento real ainda define o
    # estado. Vira estado de verdade (pensando/falando/executando) quando
    # a camada social/proatividade existir.
    linhas_atualizadas = executar_query("agentes:atualizar_estado_ativos", commit=True, params=("idle",))
    resultado["agentes_atualizados"] = linhas_atualizadas

    return resultado
