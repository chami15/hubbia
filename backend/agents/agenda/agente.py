"""Agente de Agenda — negociação de horário guiada, nunca chat livre.

Diferente do Financeiro (uma chamada estruturada sobre dado pronto), esse
agente precisa RACIOCINAR: checar a agenda existente, julgar se um
horário faz sentido pro tipo de compromisso, e propor UMA coisa concreta
por vez. Por isso usa `create_agent` de verdade, com tools de leitura —
mas a saída final é sempre estruturada (`response_format`), nunca texto
livre solto, e a escrita (criar/mover/cancelar) nunca acontece aqui: o
agente só PROPÕE, o resolver é quem grava a ação_pendente e quem executa
de verdade depois da confirmação humana.
"""
from typing import Literal

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langgraph.errors import GraphRecursionError
from pydantic import BaseModel, Field

from agents._shared.execucoes import registrar_execucao
from agents._shared.guardrails import MAX_TOOL_CALLS, RECURSION_LIMIT, tratar_erros_tools
from agents.agenda.tools import buscar_eventos, listar_eventos_periodo
from config import settings

load_dotenv()

TOOLS = [listar_eventos_periodo, buscar_eventos]

# Chave de junção com a linha em `agentes` — `registrar_execucao`
# resolve o id numérico por ela.
_ESPECIALIDADE = "agenda"


def _somar_uso(mensagens: list) -> tuple[int, int]:
    """Soma tokens de TODAS as mensagens do agente, não só da última.

    É o que diferencia contabilizar um agente com tool-calling de um de
    chamada única: um pedido ("marca dentista quinta") vira várias idas
    e voltas ao modelo — pensar, chamar `listar_eventos_periodo`, ler o
    resultado, decidir. Olhar só a resposta final subestimaria o custo
    real, que é justamente o motivo de este ser o agente mais caro do
    hub por interação.
    """
    tokens_in = tokens_out = 0
    for msg in mensagens or []:
        uso = getattr(msg, "usage_metadata", None) or {}
        tokens_in += uso.get("input_tokens", 0) or 0
        tokens_out += uso.get("output_tokens", 0) or 0
    return tokens_in, tokens_out


def _registrar(mensagens: list, prompt: str, erro: str | None = None) -> None:
    tokens_in, tokens_out = _somar_uso(mensagens)
    custo = round(
        (tokens_in / 1000) * settings.preco_input_por_1k_barato
        + (tokens_out / 1000) * settings.preco_output_por_1k_barato,
        6,
    )
    registrar_execucao(
        especialidade=_ESPECIALIDADE,
        modelo=settings.llm_model_cheap,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        custo_usd=custo,
        contexto_prompt=prompt,
        erro=erro,
    )


class DecisaoAgenda(BaseModel):
    tipo: Literal["proposta", "pergunta", "resposta"] = Field(
        ...,
        description="'proposta' se já tem uma sugestão concreta e acionável; "
        "'pergunta' se precisa de mais informação antes de propor; "
        "'resposta' se é só uma resposta informativa, sem ação nem pergunta pendente "
        "(ex: o chefe perguntou algo que já dava pra responder com o que as tools trouxeram).",
    )
    mensagem: str = Field(..., description="Texto exato que o chefe vai ver — direto, sem enrolação.")
    acao: Literal["criar_evento", "mover_evento", "cancelar_evento"] | None = Field(
        default=None, description="Preenchido só quando tipo=='proposta'."
    )
    payload: dict | None = Field(
        default=None,
        description=(
            "Dados pra executar a ação se confirmada. Preenchido só quando tipo=='proposta'. "
            "criar_evento: {titulo, inicio_iso, fim_iso, descricao?}. "
            "mover_evento: {evento_id, novo_inicio_iso, novo_fim_iso}. "
            "cancelar_evento: {evento_id}."
        ),
    )


SYSTEM_PROMPT = """Você é o agente de Agenda do hub. Organizado, direto, um pouco
ansioso com prazo. Sua função é ajudar o chefe a agendar, mover ou cancelar
compromissos de forma prática — sem bate-papo, sem rodeio.

== REGRAS DE COMPORTAMENTO — siga esta árvore de decisão, NESSA ordem ==

PASSO A (só se o pedido usar linguagem de MUDANÇA sobre algo que já
existe — "alterar", "mudar", "mover", "remarcar", "trocar o dia/horário
do", "cancelar", "desmarcar", ou se referir a um compromisso que o chefe
já tem, ex: "o jantar", "minha reunião de amanhã"):
  Chame buscar_eventos UMA vez pra achar esse evento existente — isso NÃO
  depende de saber pra qual dia novo o chefe quer mudar, então faça esse
  passo mesmo que o pedido não diga o dia novo ainda. Guarde o evento_id
  encontrado. Se não achar nada parecido, pare e pergunte qual compromisso
  o chefe quer dizer (não invente, não tente de novo com outro termo).
  Se o pedido NÃO for sobre mudar algo existente, pule direto pro passo B.

PASSO B (sempre, depois do passo A se ele se aplicou):
  Verifique se você já sabe o dia/horário NOVO desejado (pra quando mover,
  ou quando marcar o novo compromisso). Se NÃO souber, PARE AGORA — não
  chame mais nenhuma tool — e responda tipo='pergunta' perguntando
  objetivamente esse dia. Ter achado o evento existente no passo A não
  significa que já dá pra propor: ainda falta saber PARA QUANDO.

PASSO C (só com o dia/horário novo já confirmado):
  Confira conflito na agenda pro período novo (listar_eventos_periodo),
  se ainda não tiver checado. Proponha UMA coisa concreta:
  - Se veio do passo A: acao="mover_evento" ou "cancelar_evento" com o
    MESMO evento_id achado — nunca acao="criar_evento" aqui, isso
    duplicaria o compromisso e deixaria o antigo intacto (erro grave).
  - Senão: acao="criar_evento".

Máximo de {max_tool_calls} chamadas de tool no total (no máximo 1 no passo
A + 1 no passo C, nunca mais que isso pro mesmo pedido). Se uma tool
retornar erro, NÃO tente de novo — responda tipo='pergunta' explicando o
que não foi possível verificar. Cada resposta propõe ou pergunta UMA
coisa concreta por vez — nunca liste várias opções, nunca pergunta aberta
tipo "quando você prefere?" (isso é diferente de perguntar objetivamente
o dia no passo B).
Use bom senso de horário conforme o TIPO de compromisso:
- Reunião de trabalho: horário comercial, nunca de noite nem manhã muito cedo.
- Refeição (almoço/jantar): respeita o horário de refeição de verdade
  (almoço ~12h-14h, jantar ~19h-21h) — nunca almoço às 16h nem jantar às 11h.
- Compromisso pessoal/lazer: à noite ou fim de semana é razoável.
Nunca proponha um horário claramente inadequado pro tipo de evento.

Se receber uma rejeição/ajuste de uma proposta anterior (isso vai vir
explícito no contexto, inclusive o evento_id se for mudança de algo
existente), gere UMA nova proposta ajustada — nunca repita a mesma
sugestão, e nunca troque acao="mover_evento" por acao="criar_evento" só
porque a primeira tentativa foi rejeitada.

Mas cuidado: se a resposta do chefe claramente NÃO tem relação com o que
você propôs ou perguntou (assunto diferente, pedido novo, sem nenhuma
ligação com o contexto anterior), NÃO force uma continuidade artificial —
trate como um pedido novo e independente, ignorando a proposta/pergunta
anterior. Insistir em conectar algo que não tem conexão é o que causa
confusão e faz você girar em tools à toa tentando encaixar as duas coisas.

== CONTEXTO ==
Data/hora atual: {agora}

== FORMATO DE SAÍDA ==
Sempre estruturado: tipo, mensagem, e (se tipo=="proposta") acao + payload
com os dados exatos necessários pra executar depois de confirmado. Use
tipo="resposta" pra qualquer coisa que não seja proposta nem pergunta —
nunca invente um quarto tipo.
"""

_agente = None


def _get_agente():
    global _agente
    if _agente is None:
        model = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.2)
        _agente = create_agent(
            model=model,
            tools=TOOLS,
            response_format=DecisaoAgenda,
            middleware=[tratar_erros_tools],
        )
    return _agente


async def decidir(mensagem_contexto: str, agora_iso: str) -> DecisaoAgenda:
    """`mensagem_contexto` já vem montada pelo resolver com o pedido
    original + histórico de proposta/rejeição, se houver (ver
    resolvers/agenda.py). Lança RuntimeError se a chamada falhar.

    `recursion_limit` é o teto físico — se o agente ficar girando (tool
    falhando repetidamente, por exemplo), o LangGraph interrompe sozinho
    em vez de continuar chamando a OpenAI sem parar."""
    agente = _get_agente()
    prompt_sistema = SYSTEM_PROMPT.format(agora=agora_iso, max_tool_calls=MAX_TOOL_CALLS)

    try:
        resultado = await agente.ainvoke(
            {
                "messages": [
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": mensagem_contexto},
                ]
            },
            config={"recursion_limit": RECURSION_LIMIT},
        )
    except GraphRecursionError:
        # Esperado poder acontecer (pedido ambíguo, modelo explorando demais)
        # — nunca deixa virar erro 500 pro chefe. Log fica pro dev investigar
        # se acontecer direto demais; a resposta ao usuário é sempre graciosa.
        print(
            f"[agenda] AVISO: recursion_limit ({RECURSION_LIMIT}) estourado — "
            f"pedido: {mensagem_contexto[:200]!r}"
        )
        # este é o caminho MAIS caro que existe (girou até o teto físico) e
        # era justamente o que não aparecia em lugar nenhum. Sem as
        # mensagens em mãos aqui, registra o evento com custo zero — o
        # importante é a sala de máquinas ver que aconteceu.
        _registrar([], mensagem_contexto, erro=f"recursion_limit ({RECURSION_LIMIT}) estourado")
        return DecisaoAgenda(
            tipo="pergunta",
            mensagem=(
                "Não consegui decidir uma proposta com as informações que tenho. "
                "Pode reformular de um jeito mais direto — por exemplo, dizendo o "
                "dia (ou período) que você quer marcar?"
            ),
        )
    except Exception as exc:
        _registrar([], mensagem_contexto, erro=f"falha na chamada: {exc}")
        raise RuntimeError(f"Falha ao invocar o agente de agenda: {exc}") from exc

    _registrar(resultado.get("messages"), mensagem_contexto)
    return resultado["structured_response"]
