"""Pauta, fase P4: a "sugestão da Pauta" dentro de uma tarefa (próximo passo, como, por que agora). Só por clique.

Antes de gastar, na ordem: a tarefa existe e está aberta; nada mudou desde a última sugestão (impressão digital igual)
devolve a mesma sem chamar; orçamento; reserva `gerando` (dois cliques seguidos não pagam duas vezes). Depois da
chamada: `pauta_regras.sugestao_valida` corta o tamanho e recusa repetir uma sugestão descartada.
Aceitar põe o passo no topo do checklist (ou sobe o item que já dizia o mesmo); descartar alimenta o "não repetir".
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


def sugestao_ativa(tarefa_id: int) -> dict | None:
    rows = executar_query("sugestoes:ativa_da_tarefa", params=(tarefa_id,))
    return rows[0] if rows else None


def _mascarada(tarefa: dict) -> dict:
    """O que vai para o LLM: itens e contexto também passam pelo mascaramento (o chefe pode ter colado uma chave num item)."""
    return {
        **tarefa,
        "titulo": regras.mascarar_segredos(tarefa["titulo"]),
        "checklist": [{**i, "texto": regras.mascarar_segredos(i["texto"])}
                      for i in tarefa["checklist"][: settings.pauta_sugestao_itens_no_prompt]],
        "contexto": [{**c, "texto": regras.mascarar_segredos(c["texto"])} for c in tarefa["contexto"]],
    }


async def sugerir(tarefa_id: int) -> dict:
    """Devolve `{"sugestao": ..., "nova": bool}`. `nova=False` = nada mudou, é a mesma de antes (não gastou)."""
    tarefa = base.obter_tarefa(tarefa_id)  # LookupError -> 404
    if tarefa["status"] != "aberta":
        raise base.ConflitoDeEstado("A tarefa não está aberta: reabra para pedir uma sugestão.")
    impressao = regras.impressao_da_tarefa(tarefa)
    ativa = sugestao_ativa(tarefa_id)
    if ativa and ativa["base_hash"] == impressao:
        return {"sugestao": ativa, "nova": False}
    if resolver_tick.orcamento_disponivel_hoje() <= 0:
        raise base.ConflitoDeEstado("O orçamento de hoje acabou. Peça a sugestão de novo amanhã.")

    executar_query("sugestoes:expirar_gerando", commit=True, params=(tarefa_id, _MINUTOS_GERANDO))
    try:
        reserva = executar_query("sugestoes:reservar", returning=True, params=(tarefa_id, impressao))[0]["id"]
    except psycopg.errors.UniqueViolation:
        raise base.ConflitoDeEstado("Já estou pensando nessa tarefa. Espere um instante.") from None

    descartadas = [d["proximo_passo"] for d in
                   executar_query("sugestoes:descartadas_recentes", params=(tarefa_id, settings.pauta_sugestao_descartadas))]
    hoje = datetime.now(ZoneInfo(settings.timezone_padrao)).date()
    prompt = agente_pauta.montar_prompt_sugestao(
        f"{hoje.isoformat()} ({_DIAS_DA_SEMANA[hoje.weekday()]})", _mascarada(tarefa), descartadas
    )
    try:
        resultado = await agente_pauta.sugerir_proximo_passo(prompt)
        dado = resultado["dado"]
        passo, como, por_que = regras.sugestao_valida(dado.proximo_passo, dado.como, dado.por_que, descartadas)
    except (RuntimeError, ValueError) as exc:
        executar_query("sugestoes:falhar", commit=True, params=(str(exc), reserva))
        raise RuntimeError(str(exc)) from exc

    with em_transacao() as q:
        q("sugestoes:substituir_ativa", (tarefa_id,))
        nova = q("sugestoes:ativar", (passo, como, por_que, reserva))[0]
    return {"sugestao": nova, "nova": True}


def _resolver(sugestao_id: int, status: str):
    with em_transacao() as q:
        rows = q("sugestoes:buscar_para_resolver", (sugestao_id,))
        if not rows:
            raise LookupError(f"Sugestão {sugestao_id} não encontrada.")
        s = rows[0]
        if s["status"] != "ativa":
            raise base.ConflitoDeEstado("Essa sugestão já foi resolvida.")
        q("sugestoes:resolver", (status, sugestao_id))
        if status == "aceita":
            itens = q("checklist:listar_da_tarefa", (s["tarefa_id"],))
            igual = regras.item_equivalente(s["proximo_passo"], itens)
            if igual:
                q("checklist:mover_para_o_topo", (s["tarefa_id"], igual["id"]))
            else:
                q("checklist:inserir_no_topo", (s["tarefa_id"], s["proximo_passo"], s["tarefa_id"]))
            q("tarefas:tocar", (s["tarefa_id"],))
    return s["tarefa_id"]


def aceitar(sugestao_id: int) -> dict:
    return base.obter_tarefa(_resolver(sugestao_id, "aceita"))


def descartar(sugestao_id: int) -> dict:
    return base.obter_tarefa(_resolver(sugestao_id, "descartada"))
