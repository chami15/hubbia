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


def em_expediente(hora: datetime) -> bool:
    """9h às 18h DO MUNDO (início inclusive, fim exclusivo), no fuso do chefe. Todos os dias são iguais: não há
    fim de semana (decisão do chefe: são agentes). Horas em `expediente_inicio`/`expediente_fim` do config."""
    h = hora.astimezone(ZoneInfo(settings.timezone_padrao)).hour
    return settings.expediente_inicio <= h < settings.expediente_fim


def expediente_agora(agora: datetime | None = None) -> bool:
    return em_expediente(hora_atual(agora))


def descrever(agora: datetime | None = None) -> dict:
    """O que o frontend precisa para fazer a mesma conta sozinho (e corrigir a diferença de relógio com o servidor).

    Os horários saem no FUSO DO CHEFE (`timezone_padrao`), não no UTC do banco: o frontend lê a hora do dia
    direto do deslocamento que vem na string, então UTC aqui deixaria o céu 3 horas errado."""
    agora = agora or _agora()
    r = obter_relogio(agora)
    fuso = ZoneInfo(settings.timezone_padrao)

    def local(d: datetime) -> str:
        return d.astimezone(fuso).isoformat()

    return {
        "ancora_real": local(r["ancora_real"]),
        "ancora_mundo": local(r["ancora_mundo"]),
        "fator": r["fator"],
        "agora_real": local(agora),
        "hora_do_mundo": local(hora_do_mundo(agora, r["ancora_real"], r["ancora_mundo"], r["fator"])),
    }
