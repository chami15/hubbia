"""Pauta, fase P3: o "o que já se sabe" de cada tarefa, em tópicos curtos com a origem de cada um.

Uma chamada por tarefa, só com os tópicos atuais + os textos NOVOS dela (nunca o histórico inteiro). O que o LLM
devolve passa por `pauta_regras.topicos_validos`: tópico sem fonte real é descartado, repetido se funde, tamanho e
quantidade cortados em código. Antes de gastar: lembrete curto já organizado não vira contexto, texto que falhou não
volta sozinho, tarefa reservada por outra rodada é pulada, orçamento e teto do dia são conferidos.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from agents.pauta import agente as agente_pauta
from config import settings
from resolvers import pauta as base
from resolvers import pauta_regras as regras
from resolvers import tick as resolver_tick
from utils.query_executor import executar_query
from utils.transacao import em_transacao

# reserva mais velha que isso é de uma rodada que caiu no meio
_MINUTOS_RESERVA = 10


def topicos(tarefa_id: int) -> list[dict]:
    return executar_query("contexto:listar_da_tarefa", params=(tarefa_id,))


def chamadas_hoje() -> int:
    inicio = datetime.now(ZoneInfo(settings.timezone_padrao)).replace(hour=0, minute=0, second=0, microsecond=0)
    return executar_query("tick_execucoes:contar_do_agente_desde", params=("pauta", inicio))[0]["total"]


async def consolidar_pendentes(respeitar_teto: bool) -> dict:
    """Uma rodada: até N tarefas com texto novo. `respeitar_teto` é o tick (para no teto do dia); o botão não para."""
    executar_query("anotacoes:dispensar_curtas_de_contexto", commit=True, params=(settings.pauta_contexto_min_caracteres,))
    resumo = {"tarefas": 0, "falhas": 0}
    pendentes = executar_query(
        "anotacoes:tarefas_a_consolidar", params=(_MINUTOS_RESERVA, settings.pauta_contexto_tarefas_por_rodada)
    )
    for linha in pendentes:
        if respeitar_teto and chamadas_hoje() >= settings.pauta_rodadas_por_dia:
            break
        try:
            if await consolidar_tarefa(linha["tarefa_id"]) is not None:
                resumo["tarefas"] += 1
        except base.ConflitoDeEstado:
            break  # orçamento acabou: as outras também esperam
        except RuntimeError:
            resumo["falhas"] += 1
    return resumo


async def consolidar_tarefa(tarefa_id: int) -> list[dict] | None:
    """Consolida os textos pendentes da tarefa. Sem texto pendente (ou reservado por outra rodada), devolve None e não
    gasta. Também é o botão "atualizar" da tarefa: inclui os textos cuja consolidação falhou antes."""
    base.obter_tarefa(tarefa_id)  # LookupError se não existe
    textos = executar_query(
        "anotacoes:reservar_para_contexto", returning=True,
        params={"tarefa_id": tarefa_id, "minutos": _MINUTOS_RESERVA},
    )
    if not textos:
        return None
    if resolver_tick.orcamento_disponivel_hoje() <= 0:
        executar_query("anotacoes:liberar_reserva", commit=True, params=([t["id"] for t in textos],))
        raise base.ConflitoDeEstado("O orçamento de hoje acabou. O contexto é atualizado amanhã.")

    textos.sort(key=lambda t: (t["organizada_em"], t["id"]))
    nesta, total = [], 0
    for t in textos:
        if nesta and total + len(t["texto"]) > settings.pauta_contexto_max_caracteres:
            break
        nesta.append(t)
        total += len(t["texto"])
    sobra = [t["id"] for t in textos[len(nesta):]]
    if sobra:
        executar_query("anotacoes:liberar_reserva", commit=True, params=(sobra,))  # fica para a próxima rodada

    ids = [t["id"] for t in nesta]
    atuais = topicos(tarefa_id)
    tarefa = base.obter_tarefa(tarefa_id)
    prompt = agente_pauta.montar_prompt_contexto(
        tarefa["titulo"],
        atuais,
        [{"id": t["id"], "texto": regras.mascarar_segredos(t["texto"])[: settings.pauta_caracteres_por_texto]} for t in nesta],
    )
    try:
        resultado = await agente_pauta.consolidar_contexto(prompt)
    except RuntimeError as exc:
        executar_query("anotacoes:marcar_erro_de_contexto", commit=True, params=(str(exc), ids))
        raise

    fontes_validas = set(ids) | {f for t in atuais for f in t["fontes"]}
    validos = regras.topicos_validos([(t.texto, t.fontes) for t in resultado["dado"].topicos], fontes_validas)
    if atuais and not validos:
        # apagar tudo o que já se sabia por causa de uma resposta vazia seria perder contexto: fica o anterior
        erro = "A Pauta devolveu o contexto vazio; o anterior foi mantido."
        executar_query("anotacoes:marcar_erro_de_contexto", commit=True, params=(erro, ids))
        raise RuntimeError(erro)

    with em_transacao() as q:
        q("contexto:apagar_da_tarefa", (tarefa_id,))
        for ordem, (texto, fontes) in enumerate(validos, start=1):
            q("contexto:inserir", (tarefa_id, texto, fontes, ordem))
        q("anotacoes:marcar_consolidadas", (ids,))
    return topicos(tarefa_id)
