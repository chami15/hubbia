"""Tick automático (Sprint 2, fase C): o timer do app pede uma rodada a cada N minutos reais e AQUI se decide se pode.

Quem garante os limites é o backend, nunca o frontend (um segundo navegador aberto, ou um bug de timer, não pode furar o
teto). Cada recusa volta com um MOTIVO e com `parar`: motivo "duro" desliga o toggle no app e avisa o chefe; o único
"mole" é o intervalo mínimo (o app só espera `espera_s` e tenta de novo, para jitter de timer não desligar nada).

Ordem das travas (a dura sempre ganha da mole, senão o app tentaria de novo a noite inteira):
  1. fora do expediente (hora do MUNDO)   2. orçamento total do dia esgotado   3. máximo de ticks automáticos no dia real
  4. fatia do orçamento do automático     5. intervalo mínimo entre automáticos

Dinheiro e contagem são por DIA REAL: o fator do relógio não entra aqui (só decide quando a janela de expediente abre).
Limitação conhecida: checar e gravar não são atômicos; duas abas abertas disparando no mesmo milissegundo poderiam
passar as duas. O app é de uma pessoa só e o intervalo é de 5 minutos, então não vale lock distribuído.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from config import settings
from resolvers import interacao, relogio, tick
from utils.query_executor import executar_query


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone_padrao))


def _recusa(motivo: str, mensagem: str, parar: bool = True, espera_s: int | None = None) -> dict:
    return {"executado": False, "motivo": motivo, "mensagem": mensagem, "parar": parar, "espera_s": espera_s}


async def tentar_tick_automatico() -> dict:
    agora = _agora()
    inicio_dia = tick._inicio_do_dia()

    if not relogio.expediente_agora():
        return _recusa(
            "fora_do_expediente",
            f"Fora do expediente ({settings.expediente_inicio}h às {settings.expediente_fim}h do mundo): "
            "o tick automático espera o escritório abrir.",
        )

    if tick.orcamento_disponivel_hoje() <= 0:
        return _recusa("orcamento_esgotado", "O orçamento do dia acabou: tick automático desligado até amanhã.")

    feitos, ultimo = (lambda r: (int(r["total"]), r["ultimo"]))(executar_query("ticks:automaticos_desde", params=(inicio_dia,))[0])
    if feitos >= settings.tick_automatico_max_dia:
        return _recusa("limite_diario", f"Chegou ao máximo de {settings.tick_automatico_max_dia} ticks automáticos hoje.")

    teto_automatico = settings.orcamento_diario_usd * settings.tick_automatico_fatia_orcamento
    gasto_automatico = float(executar_query("tick_execucoes:custo_automatico_desde", params=(inicio_dia,))[0]["total"])
    if gasto_automatico >= teto_automatico:
        return _recusa(
            "fatia_orcamento",
            f"O tick automático já usou {settings.tick_automatico_fatia_orcamento:.0%} do orçamento do dia; "
            "o restante fica de reserva para o que você pedir.",
        )

    if ultimo is not None:
        faltam = settings.tick_automatico_intervalo_min * 60 - (agora - ultimo).total_seconds()
        if faltam > 0:
            return _recusa("cedo_demais", "Ainda não passou o intervalo mínimo entre ticks automáticos.", parar=False, espera_s=int(faltam) + 1)

    resultado_tick = tick.avancar_tick(origem="automatico")
    rodada = await interacao.processar_tick_completo()
    return {"executado": True, "tick": resultado_tick, "rodada": rodada, "proximo_em_s": settings.tick_automatico_intervalo_min * 60}
