"""Relógio do mundo: a hora do mundo é uma CONTA sobre o tempo real, sem agendador.

    hora_do_mundo = ancora_mundo + (agora_real - ancora_real) * fator

Ela só alimenta o ambiente (céu, luz, "dormindo") e a janela de expediente: custo zero, e o tick (que gasta
LLM) não depende dela. O frontend repete a mesma conta com os dados de `GET /relogio`, então o relógio anda
sem nenhuma chamada. Ver docs/sprint-2-roteiro.md, Parte 2b.

Toda função recebe `agora` (padrão: agora de verdade) para o teste não depender do relógio da máquina.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from config import settings
from utils.query_executor import executar_query

_FATOR_MAX = 1440  # 1 min real = 1 dia do mundo; acima disso o céu vira estroboscópio


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone_padrao))


def hora_do_mundo(agora: datetime, ancora_real: datetime, ancora_mundo: datetime, fator: float) -> datetime:
    return ancora_mundo + (agora - ancora_real) * fator


def obter_relogio(agora: datetime | None = None) -> dict:
    """Devolve o relógio, criando-o na primeira leitura: parte da hora real (o céu bate com o do chefe no
    primeiro instante) e acelera daí em diante."""
    agora = agora or _agora()
    linhas = executar_query("relogio_mundo:buscar")
    if not linhas:
        executar_query("relogio_mundo:criar_padrao", commit=True, params=(agora, agora, settings.relogio_fator))
        linhas = executar_query("relogio_mundo:buscar")
    return dict(linhas[0])


def hora_atual(agora: datetime | None = None) -> datetime:
    agora = agora or _agora()
    r = obter_relogio(agora)
    return hora_do_mundo(agora, r["ancora_real"], r["ancora_mundo"], r["fator"])


def definir_fator(fator: float, agora: datetime | None = None) -> dict:
    """Troca a velocidade SEM saltar: reancora na hora do mundo de agora."""
    if not 0 < fator <= _FATOR_MAX:
        raise ValueError(f"Fator do relógio precisa estar entre 0 (exclusive) e {_FATOR_MAX}.")
    agora = agora or _agora()
    r = obter_relogio(agora)
    agora_mundo = hora_do_mundo(agora, r["ancora_real"], r["ancora_mundo"], r["fator"])
    executar_query("relogio_mundo:reancorar", commit=True, params=(agora, agora_mundo, fator))
    return obter_relogio(agora)


def descrever(agora: datetime | None = None) -> dict:
    """O que o frontend precisa para fazer a mesma conta sozinho (e corrigir a diferença de relógio com o servidor)."""
    agora = agora or _agora()
    r = obter_relogio(agora)
    return {
        "ancora_real": r["ancora_real"].isoformat(),
        "ancora_mundo": r["ancora_mundo"].isoformat(),
        "fator": r["fator"],
        "agora_real": agora.isoformat(),
        "hora_do_mundo": hora_do_mundo(agora, r["ancora_real"], r["ancora_mundo"], r["fator"]).isoformat(),
    }
