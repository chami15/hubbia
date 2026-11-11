"""Pauta, fase P5: "clarear a vista" — foco (até 3), pode esperar, talvez nem valha. Só por clique.

Antes de gastar, na ordem: nenhuma ou uma tarefa aberta decide sozinho, sem LLM; mesma situação no mesmo dia devolve a
revisão pronta (impressão geral); orçamento; reserva `gerando`. As tarefas vão para o LLM já ordenadas pela conta de
urgência (`pauta_regras.urgencia`), no máximo 40. Depois: `pauta_regras.revisao_valida` (id real, um grupo por tarefa,
limites, prazo perto nunca "pode esperar", juntar só com tarefa aberta).

Tudo é sugestão. Só "talvez nem valha" tem ação, e só no clique: deixar de lado, ou juntar com outra (textos, itens e
termos vão para a que fica; a outra é deixada de lado, nada é apagado).
"""
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

from agents.pauta import agente as agente_pauta
from config import settings
from resolvers import pauta as base
from resolvers import pauta_regras as regras
from resolvers import tick as resolver_tick
from utils.query_executor import executar_query
from utils.transacao import em_transacao

_MINUTOS_GERANDO = 5
_DIAS_DA_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _hoje():
    return datetime.now(ZoneInfo(settings.timezone_padrao)).date()


def _montar(revisao_id: int, atual: bool) -> dict:
    itens = executar_query("revisoes:itens", params=(revisao_id,))
    grupos = {"foco": [], "pode_esperar": [], "talvez_nem_valha": []}
    for i in itens:
        grupos[i.pop("grupo")].append(i)
    return {"id": revisao_id, "atual": atual, **grupos}


def obter() -> dict | None:
    """A última revisão pronta (ou None), com `atual=false` se a situação já mudou desde que foi feita."""
    pronta = executar_query("revisoes:pronta")
    if not pronta:
        return None
    tarefas = executar_query("revisoes:tarefas_abertas_resumo")
    return _montar(pronta[0]["id"], pronta[0]["base_hash"] == regras.impressao_geral(tarefas, _hoje()))


def _gravar(q, revisao_id: int, r: regras.Revisao5) -> None:
    for grupo in ("foco", "pode_esperar", "talvez_nem_valha"):
        for ordem, item in enumerate(getattr(r, grupo), start=1):
            q("revisoes:inserir_item", (revisao_id, grupo, item.tarefa_id, item.por_que, item.acao, item.juntar_com, ordem))


async def clarear() -> dict:
    """Devolve `{"revisao": ..., "nova": bool}`. `nova=False`: nada mudou hoje, é a mesma (não gastou)."""
    hoje = _hoje()
    tarefas = executar_query("revisoes:tarefas_abertas_resumo")
    impressao = regras.impressao_geral(tarefas, hoje)
    pronta = executar_query("revisoes:pronta")
    if pronta and pronta[0]["base_hash"] == impressao:
        return {"revisao": _montar(pronta[0]["id"], True), "nova": False}

    executar_query("revisoes:expirar_gerando", commit=True, params=(_MINUTOS_GERANDO,))
    sem_llm = len(tarefas) <= 1
    if not sem_llm and resolver_tick.orcamento_disponivel_hoje() <= 0:
        raise base.ConflitoDeEstado("O orçamento de hoje acabou. Peça para clarear a vista de novo amanhã.")
    try:
        reserva = executar_query("revisoes:reservar", returning=True, params=(impressao,))[0]["id"]
    except psycopg.errors.UniqueViolation:
        raise base.ConflitoDeEstado("Já estou olhando suas tarefas. Espere um instante.") from None

    if sem_llm:
        # nada a comparar: a única tarefa é o foco (ou não há nada). Não paga uma chamada para dizer o óbvio.
        revisao = regras.Revisao5(foco=[regras.ItemRevisao(t["id"], "É a única tarefa aberta.") for t in tarefas])
    else:
        ordenadas = sorted(tarefas, key=lambda t: -regras.urgencia(t, hoje))[: settings.pauta_revisao_tarefas_no_prompt]
        por_id = {t["id"]: t for t in ordenadas}
        resumo = [_resumo(t, hoje) for t in ordenadas]
        prompt = agente_pauta.montar_prompt_revisao(f"{hoje.isoformat()} ({_DIAS_DA_SEMANA[hoje.weekday()]})", resumo)
        try:
            dado = (await agente_pauta.clarear_a_vista(prompt))["dado"]
        except RuntimeError as exc:
            executar_query("revisoes:falhar", commit=True, params=(str(exc), reserva))
            raise
        revisao = regras.revisao_valida(
            [regras.ItemRevisao(i.tarefa_id, i.por_que) for i in dado.foco],
            [regras.ItemRevisao(i.tarefa_id, i.por_que) for i in dado.pode_esperar],
            [regras.ItemRevisao(i.tarefa_id, i.por_que, i.acao, i.juntar_com) for i in dado.talvez_nem_valha],
            por_id, hoje,
        )

    with em_transacao() as q:
        q("revisoes:substituir_pronta")
        _gravar(q, reserva, revisao)
        q("revisoes:publicar", (reserva,))
    return {"revisao": _montar(reserva, True), "nova": True}


def _resumo(t: dict, hoje) -> dict:
    """Uma linha por tarefa para o LLM: os números já calculados (ele não faz conta de data)."""
    prazo = regras._dia(t["prazo"])
    return {
        "id": t["id"],
        "frente": t["frente"],
        "titulo": regras.mascarar_segredos(t["titulo"]),
        "prazo": prazo.isoformat() if prazo else None,
        "dias_para_o_prazo": (prazo - hoje).days if prazo else None,
        "dias_parada": (hoje - regras._dia(t["ultimo_movimento_em"])).days,
        "progresso": f"{t['itens_feitos']}/{t['itens_total']}",
        "proximo_item": regras.mascarar_segredos(t["proximo_item"]) if t["proximo_item"] else None,
    }


# ------------------------------------------------------------------------------------------------ resolver itens

def descartar_item(item_id: int) -> dict | None:
    _resolver_item(item_id, aceitar=False)
    return obter()


def aceitar_item(item_id: int) -> dict | None:
    """Executa a ação de um "talvez nem valha". Foco e "pode esperar" não têm ação para aceitar."""
    _resolver_item(item_id, aceitar=True)
    return obter()


def _resolver_item(item_id: int, aceitar: bool) -> None:
    with em_transacao() as q:
        rows = q("revisoes:buscar_item_para_resolver", (item_id,))
        if not rows:
            raise LookupError(f"Item {item_id} não encontrado.")
        item = rows[0]
        if item["status"] != "pendente":
            raise base.ConflitoDeEstado("Esse item já foi resolvido.")
        if not aceitar:
            q("revisoes:resolver_item", ("descartado", item_id))
            return
        if item["acao"] is None:
            raise base.ConflitoDeEstado("Esse item não tem ação: é só para você saber.")
        tarefa = q("tarefas:buscar_por_id", (item["tarefa_id"],))[0]
        if tarefa["status"] != "aberta":
            raise base.ConflitoDeEstado("Essa tarefa já não está aberta.")
        if item["acao"] == "juntar":
            _juntar(q, origem=tarefa, destino_id=item["juntar_com"])
        q("tarefas:mudar_status", {"status": "arquivada", "id": item["tarefa_id"]})
        q("revisoes:resolver_item", ("aceito", item_id))


def _juntar(q, origem: dict, destino_id: int) -> None:
    destino = q("tarefas:buscar_por_id", (destino_id,))
    if not destino or destino[0]["status"] != "aberta":
        raise base.ConflitoDeEstado("A tarefa com que ia juntar não está mais aberta.")
    destino = destino[0]
    q("anotacoes:mover_para_tarefa", (destino_id, origem["id"]))
    itens_destino = q("checklist:listar_da_tarefa", (destino_id,))
    for item in q("checklist:listar_da_tarefa", (origem["id"],)):
        # repetido (mesma coisa, mesmo estado de feito ou não) fica na que é deixada de lado
        if any(regras._mesma_coisa(item["texto"], d["texto"], regras._PARECIDO_ITEM) for d in itens_destino):
            continue
        q("checklist:mover_para_tarefa", (destino_id, destino_id, item["id"]))
    q("tarefas:definir_termos", (regras.juntar_termos(destino["termos"], origem["termos"]), destino_id))
    if origem["prazo"] and (destino["prazo"] is None or origem["prazo"] < destino["prazo"]):
        q("tarefas:atualizar_campos", (None, None, None, True, origem["prazo"], destino_id))  # fica o prazo mais cedo
    q("tarefas:tocar", (destino_id,))
