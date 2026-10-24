"""Orquestra o domínio da Agenda: roteador de intenção + negociação de
horário + gate de confirmação antes de qualquer ação real no Google
Calendar.

Fluxo por mensagem recebida (ver processar_mensagem):
  1. "qual pendência em aberto?" (ou variações) -> responde direto, sem
     LLM, com a pendência atual (se houver) e há quanto tempo está aberta.
     Checado ANTES de tudo, mesmo com uma pendência aberta — senão essa
     pergunta seria confundida com uma resposta à negociação em curso.
  2. Se já existe uma acao_pendente aberta pro agente Agenda:
     - "sim/confirma/ok" -> executa a ação real, fecha a pendência.
     - "não/cancela" -> fecha como rejeitada, chama o agente de novo com
       o contexto da rejeição, abre nova pendência.
     - qualquer outra resposta (ajuste, resposta a uma pergunta do
       agente) -> chama o agente de novo com o contexto acumulado.
  3. Sem pendência aberta:
     - consulta simples (buscar/listar/quais) -> responde direto, sem
       LLM, lendo o Calendar de verdade.
     - senão -> aciona o agente de negociação com a mensagem como pedido
       original.

Nenhuma ação real (criar/mover/cancelar) executa sem confirmação
explícita — mesmo espírito de todo o projeto (ver acoes_pendentes).

Confirmar/rejeitar aqui é específico do Agenda por enquanto (dispatch pra
google_calendar). Quando um segundo agente precisar do mesmo gate, essa
parte genérica (buscar pendente, checar status, marcar resolvido) vale a
pena extrair pra um resolver compartilhado — não fizemos isso agora
porque só tem um consumidor até aqui.
"""
import json
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from agents.agenda import google_calendar
from agents.agenda.agente import decidir
from config import settings
from utils.query_executor import executar_query

_PADRAO_CONFIRMACAO = re.compile(r"^\s*(sim|confirma|confirmo|ok|blz|beleza|pode)\b", re.IGNORECASE)
_PADRAO_REJEICAO = re.compile(r"^\s*(n[aã]o|cancela|cancelar)\b", re.IGNORECASE)
_PADRAO_CONSULTA = re.compile(
    r"\b(o que (vou|tenho)|quais eventos|quais compromissos|listar|buscar|"
    r"tenho (algo|alguma coisa|compromisso))\b",
    re.IGNORECASE,
)
# Pergunta explícita sobre o que está pendente — precisa ser checada ANTES
# de assumir que a mensagem é resposta/confirmação de uma pendência aberta,
# senão "qual pendência em aberto?" seria tratada como uma resposta livre
# de negociação em vez de uma consulta de estado.
_PADRAO_CONSULTAR_PENDENCIA = re.compile(
    r"(qual|quais|que).{0,15}pend[eê]nci|pend[eê]ncia.{0,15}(aberto|abert)|"
    r"(tem|h[aá]) (algo|alguma coisa) (pendente|em aberto)|"
    r"o que (est[aá]|ficou|t[aá]) pendente",
    re.IGNORECASE,
)


def _agente_id() -> int:
    rows = executar_query("agentes:buscar_por_especialidade", params=("agenda",))
    if not rows:
        raise RuntimeError("Agente 'agenda' não encontrado — rode scripts.seed.")
    return rows[0]["id"]


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone_padrao))


def _pendente_aberta(agente_id: int) -> dict | None:
    """Devolve a pendência aberta, ou None se não houver — ou se a única
    que existir estiver velha demais (ver AGENDA_PENDENCIA_TTL_MINUTOS).
    Sem isso, uma pergunta esquecida (ex: "qual dia?" nunca respondida)
    vira uma armadilha: qualquer mensagem nova e não-relacionada que
    chegar depois seria tratada como resposta a ela, confundindo o
    agente com um contexto que não faz sentido."""
    rows = executar_query("acoes_pendentes:buscar_pendente_por_agente", params=(agente_id,))
    if not rows:
        return None

    pendente = rows[0]
    idade = _agora() - pendente["criado_em"]
    if idade > timedelta(minutes=settings.agenda_pendencia_ttl_minutos):
        executar_query("acoes_pendentes:marcar_expirada", commit=True, params=(pendente["id"],))
        return None

    return pendente


def _ha_quanto_tempo(momento: datetime) -> str:
    """Formata o tempo decorrido desde `momento` de forma legível, tipo
    'há 5 minutos' — usado pra deixar claro há quanto tempo uma pendência
    está esperando resposta, sem o chefe ter que calcular de cabeça."""
    minutos = int((_agora() - momento).total_seconds() // 60)
    if minutos < 1:
        return "há menos de um minuto"
    if minutos < 60:
        return f"há {minutos} minuto{'s' if minutos != 1 else ''}"
    horas = minutos // 60
    return f"há {horas} hora{'s' if horas != 1 else ''}"


def _registrar_fala(de: str, texto: str, acao_pendente_id: int | None = None) -> None:
    """Guarda uma fala do chat para ele sobreviver ao reload (ver migration 012)."""
    executar_query("conversa_agenda:inserir", commit=True, params=(de, texto, acao_pendente_id))


def obter_conversa(limite: int = 200) -> dict:
    """Histórico do chat + a pendência aberta agora, tudo de uma vez ao abrir o painel.

    Só leitura e sem LLM, então é seguro abrir a tela sem gastar nada (RNF01). Substitui o truque
    antigo de mandar a frase 'qual pendência em aberto?' como se o chefe a tivesse digitado, que com
    o histórico gravado viraria uma fala falsa a cada abertura."""
    falas = [
        {
            "id": f["id"],
            "de": f["de"],
            "texto": f["texto"],
            "acao_pendente_id": f["acao_pendente_id"],
            "criado_em": f["criado_em"].isoformat(),
        }
        for f in executar_query("conversa_agenda:ultimas", params=(limite,))
    ]
    pendente = _pendente_aberta(_agente_id())
    return {
        "falas": falas,
        "acao_pendente_id": pendente["id"] if pendente else None,
        "aguardando_confirmacao": bool(pendente) and pendente["tipo"] != "aguardando_info",
    }


def _responder_pendencia_atual(agente_id: int) -> dict:
    """Resposta determinística (sem LLM) pra "qual pendência em aberto?" —
    o chefe pode perder o fio no meio do chat e precisar consultar direto
    o que está esperando resposta dele."""
    pendente = _pendente_aberta(agente_id)
    if not pendente:
        return {
            "mensagem": "Você não tem nenhuma pendência em aberto comigo agora.",
            "acao_pendente_id": None,
            "aguardando_confirmacao": False,
        }

    tempo = _ha_quanto_tempo(pendente["criado_em"])
    if pendente["tipo"] == "aguardando_info":
        mensagem = f'Ainda estou esperando você responder ({tempo}): "{pendente["descricao"]}"'
    else:
        mensagem = f'Tem uma proposta esperando sua confirmação ({tempo}): "{pendente["descricao"]}"'

    return {
        "mensagem": mensagem,
        "acao_pendente_id": pendente["id"],
        "aguardando_confirmacao": pendente["tipo"] != "aguardando_info",
    }


def _montar_contexto_negociacao(pedido_original: str, pendente: dict | None, resposta_chefe: str | None) -> str:
    partes = [f'Pedido original do chefe: "{pedido_original}"']
    if pendente and resposta_chefe:
        partes.append(f'Você propôs: "{pendente["descricao"]}"')
        partes.append(f'O chefe respondeu: "{resposta_chefe}"')

        # Preserva a ação original (mover/cancelar) entre rodadas de
        # negociação — sem isso, uma rejeição podia fazer o agente
        # "esquecer" que era pra MOVER um evento existente e criar um
        # novo em vez de mover, duplicando o compromisso.
        if pendente["tipo"] in ("mover_evento", "cancelar_evento"):
            evento_id = pendente["payload"].get("evento_id")
            partes.append(
                f'IMPORTANTE: essa proposta era sobre ALTERAR um evento que já '
                f'existe (evento_id="{evento_id}"). Sua nova proposta também '
                f'precisa usar acao="{pendente["tipo"]}" com esse MESMO '
                f'evento_id — nunca crie um evento novo aqui, isso duplicaria '
                f'o compromisso e deixaria o antigo intacto.'
            )

        partes.append("Gere uma nova proposta ajustada, considerando essa resposta.")
    return "\n".join(partes)


async def _acionar_agente(
    agente_id: int, pedido_original: str, pendente: dict | None, resposta_chefe: str | None
) -> dict:
    contexto = _montar_contexto_negociacao(pedido_original, pendente, resposta_chefe)
    decisao = await decidir(contexto, _agora().isoformat())

    if decisao.tipo == "resposta":
        # só informativo — nada fica pendente, não há o que confirmar
        return {"mensagem": decisao.mensagem, "acao_pendente_id": None, "aguardando_confirmacao": False}

    if decisao.tipo == "pergunta":
        rows = executar_query(
            "acoes_pendentes:inserir",
            returning=True,
            params=(
                agente_id,
                "aguardando_info",
                decisao.mensagem,
                json.dumps({"pedido_original": pedido_original}),
            ),
        )
        return {"mensagem": decisao.mensagem, "acao_pendente_id": rows[0]["id"], "aguardando_confirmacao": False}

    payload = dict(decisao.payload or {})
    payload["pedido_original"] = pedido_original
    mensagem = _com_pedido_confirmacao(decisao.mensagem)
    rows = executar_query(
        "acoes_pendentes:inserir",
        returning=True,
        params=(agente_id, decisao.acao, mensagem, json.dumps(payload)),
    )
    return {"mensagem": mensagem, "acao_pendente_id": rows[0]["id"], "aguardando_confirmacao": True}


def _com_pedido_confirmacao(mensagem: str) -> str:
    """Garante que toda proposta convide a confirmar — não depende do
    modelo lembrar de fazer isso na prosa toda vez (já vimos que esquece)."""
    texto = mensagem.rstrip()
    if texto.endswith("?"):
        return texto
    return f"{texto} Confirma?"


def _executar_acao_real(tipo: str, payload: dict) -> dict:
    if tipo == "criar_evento":
        return google_calendar.criar_evento_real(
            titulo=payload["titulo"],
            inicio_iso=payload["inicio_iso"],
            fim_iso=payload["fim_iso"],
            descricao=payload.get("descricao"),
        )
    if tipo == "mover_evento":
        return google_calendar.mover_evento_real(
            evento_id=payload["evento_id"],
            novo_inicio_iso=payload["novo_inicio_iso"],
            novo_fim_iso=payload["novo_fim_iso"],
        )
    if tipo == "cancelar_evento":
        google_calendar.cancelar_evento_real(evento_id=payload["evento_id"])
        return {"cancelado": True}
    raise ValueError(f"Tipo de ação desconhecido: {tipo}")


def _responder_consulta_direta() -> dict:
    """Consulta simples (listar/buscar) não precisa do agente — chama a
    API do Calendar direto, sem custo de LLM."""
    agora = _agora()
    fim = agora + timedelta(days=7)
    eventos = google_calendar.listar_eventos(agora.isoformat(), fim.isoformat())
    resumidos = google_calendar.resumir_eventos(eventos)
    if not resumidos:
        mensagem = "Você não tem nenhum compromisso nos próximos 7 dias."
    else:
        linhas = [f'- {e["titulo"]} ({e["inicio"]})' for e in resumidos]
        mensagem = "Seus próximos compromissos:\n" + "\n".join(linhas)
    return {"mensagem": mensagem, "acao_pendente_id": None, "aguardando_confirmacao": False}


async def processar_mensagem(mensagem: str) -> dict:
    """Processa a fala do chefe e grava a conversa. A fala dele entra ANTES de chamar o agente:
    se o LLM falhar, a pergunta continua no histórico (sem resposta inventada)."""
    _registrar_fala("chefe", mensagem)
    resposta = await _processar_mensagem(mensagem)
    _registrar_resposta(resposta)
    return resposta


def _registrar_resposta(resposta: dict) -> None:
    # só a proposta guarda o id: é a única fala com botão (ver migration 012)
    proposta = resposta.get("aguardando_confirmacao") is True
    _registrar_fala("agente", resposta["mensagem"], resposta.get("acao_pendente_id") if proposta else None)


async def _processar_mensagem(mensagem: str) -> dict:
    agente_id = _agente_id()

    # Checa ANTES de olhar pra pendência aberta: se o chefe está perguntando
    # "qual pendência em aberto?", isso é uma consulta de estado, não uma
    # resposta à negociação em andamento — precisa ser respondido igual
    # esteja ou não esperando confirmação/informação.
    if _PADRAO_CONSULTAR_PENDENCIA.search(mensagem):
        return _responder_pendencia_atual(agente_id)

    pendente = _pendente_aberta(agente_id)

    if pendente:
        pedido_original = pendente["payload"].get("pedido_original", mensagem)

        if pendente["tipo"] != "aguardando_info" and _PADRAO_CONFIRMACAO.match(mensagem):
            return _confirmar_acao(pendente["id"])

        if pendente["tipo"] != "aguardando_info" and _PADRAO_REJEICAO.match(mensagem):
            executar_query("acoes_pendentes:marcar_rejeitada", commit=True, params=(pendente["id"],))
            return await _acionar_agente(agente_id, pedido_original, pendente, mensagem)

        # resposta livre (ajuste ou resposta a uma pergunta) — continua a
        # negociação. Fecha a pendência atual antes de abrir a próxima:
        # sem isso, cada rodada de "resposta livre" deixava a pendência
        # anterior aberta pra sempre, acumulando várias 'pendente'
        # simultâneas pro mesmo agente (só a rejeição explícita fechava).
        executar_query("acoes_pendentes:marcar_expirada", commit=True, params=(pendente["id"],))
        return await _acionar_agente(agente_id, pedido_original, pendente, mensagem)

    if _PADRAO_CONSULTA.search(mensagem):
        return _responder_consulta_direta()

    return await _acionar_agente(agente_id, mensagem, None, None)


def confirmar_acao(acao_id: int) -> dict:
    """Confirmação pelo botão: grava só a resposta do agente (o clique não é uma fala do chefe)."""
    resposta = _confirmar_acao(acao_id)
    _registrar_resposta(resposta)
    return resposta


def _confirmar_acao(acao_id: int) -> dict:
    rows = executar_query("acoes_pendentes:buscar_por_id", params=(acao_id,))
    if not rows:
        raise ValueError(f"Ação pendente {acao_id} não encontrada.")
    acao = rows[0]
    if acao["status"] != "pendente":
        return {"mensagem": f"Essa ação já foi {acao['status']}, nada a fazer.", "acao_pendente_id": acao_id}

    try:
        resultado = _executar_acao_real(acao["tipo"], acao["payload"])
        executar_query(
            "acoes_pendentes:marcar_confirmada_sucesso",
            commit=True,
            params=(json.dumps(resultado, default=str), acao_id),
        )
        return {"mensagem": "Feito — ação confirmada e executada.", "acao_pendente_id": acao_id, "resultado": resultado}
    except Exception as exc:
        executar_query("acoes_pendentes:marcar_confirmada_erro", commit=True, params=(str(exc), acao_id))
        return {"mensagem": f"A ação foi confirmada mas falhou ao executar: {exc}", "acao_pendente_id": acao_id}


def rejeitar_acao(acao_id: int) -> dict:
    executar_query("acoes_pendentes:marcar_rejeitada", commit=True, params=(acao_id,))
    resposta = {"mensagem": "Ação descartada.", "acao_pendente_id": acao_id}
    _registrar_resposta(resposta)
    return resposta
