"""Agente de interação social — Etapa 2 do motor de tick. Uma chamada
estruturada só, sem tool-calling e sem loop (mesmo Padrão A do resto do
hub): gera UMA mensagem social curta de um agente pra outro, dado o
histórico recente do par e um evento do mundo sorteado como gancho.

Toda a decisão de QUEM fala, COM QUEM fala e SE fala é resolvida antes
de chegar aqui (ver `resolvers/interacao.py`) — puramente aritmético,
sem custo de LLM. Esta função só entra depois que já foi decidido que
uma mensagem vai ser gerada de verdade.
"""
import json

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from agents._shared.execucoes import registrar_execucao
from config import settings

load_dotenv()

_PROMPT_SOCIAL = """Você é {nome_remetente}. {personalidade}

Você tá de papo com {rotulo_destinatario} — bate-papo de escritório, tipo
mandar mensagem pra um amigo. Nada formal.

{fato_do_dia}

Conversa recente entre vocês (mais recente primeiro, pode estar vazia):
{historico_json}

{instrucao_assunto}

Como escrever:
- Bem curto. Uma ou duas frases no máximo, do jeito que se fala no dia a dia.
- Descontraído e simples. Pode usar gíria, pode ser só uma frase solta.
- NÃO precisa terminar com pergunta nem proposta — às vezes é só um comentário.
- Nada de texto grande, arrumadinho ou burocrático. É conversa, não recado formal.
- {nota_chefe}
"""


class MensagemSocialGerada(BaseModel):
    conteudo: str = Field(..., min_length=1, max_length=300, description="A mensagem social em si, bem curta e natural.")


_model_social = None


def _get_model_social():
    global _model_social
    if _model_social is None:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.8)
        _model_social = base.with_structured_output(MensagemSocialGerada, include_raw=True)
    return _model_social


def _custo(tokens_in: int, tokens_out: int) -> float:
    preco_in = settings.preco_input_por_1k_barato
    preco_out = settings.preco_output_por_1k_barato
    return round((tokens_in / 1000) * preco_in + (tokens_out / 1000) * preco_out, 6)


def _extrair_resultado(resultado: dict, especialidade: str, prompt: str | None = None) -> dict:
    """`especialidade` é de QUEM FALOU — a conta do papo social vai pro
    agente que puxou assunto, não pra um "departamento de interação"
    que não existe em `agentes`."""
    if resultado.get("parsing_error"):
        # registra ANTES de levantar: chamada que falhou no parsing
        # gastou token igual, e o orçamento precisa saber disso
        registrar_execucao(
            especialidade=especialidade,
            modelo=settings.llm_model_cheap,
            contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}",
        )
        raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")

    raw = resultado["raw"]
    usage = getattr(raw, "usage_metadata", None) or {}
    tokens_in = usage.get("input_tokens", 0)
    tokens_out = usage.get("output_tokens", 0)
    custo_usd = _custo(tokens_in, tokens_out)

    registrar_execucao(
        especialidade=especialidade,
        modelo=settings.llm_model_cheap,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        custo_usd=custo_usd,
        contexto_prompt=prompt,
        saida_bruta=str(resultado["parsed"]),
    )

    return {
        "dado": resultado["parsed"],
        "modelo": settings.llm_model_cheap,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "custo_usd": custo_usd,
    }


async def gerar_mensagem_social(
    personalidade: str,
    nome_remetente: str,
    especialidade_remetente: str,
    nome_destinatario: str,
    historico_recente: list[dict],
    evento_mundo: str | None,
    fato_do_dia: str,
    destinatario_eh_chefe: bool = False,
    mensagem_para_responder: str | None = None,
    pode_puxar_assunto_novo: bool = True,
) -> dict:
    """Lança RuntimeError se a chamada ou o parsing falharem — uma
    tentativa só, sem retry automático.

    Três modos, decididos ANTES daqui pelo resolver (ver
    `resolvers/interacao.py`), pra não deixar toda mensagem virar um
    assunto novo (o que soava forçado/repetitivo na validação manual):
    - respondendo a uma mensagem: fica no assunto do que foi dito;
    - `pode_puxar_assunto_novo=False`: segue o papo em andamento, sem
      trazer assunto novo — o caso mais comum numa conversa de verdade;
    - `pode_puxar_assunto_novo=True`: pode puxar assunto novo (usa o
      evento como gancho, se tiver) — ocasional, ou pra começar do
      zero quando não há conversa em andamento."""
    modelo = _get_model_social()
    if mensagem_para_responder:
        instrucao_assunto = (
            f'{nome_destinatario} acabou de te falar: "{mensagem_para_responder}". '
            "Responde a isso, no mesmo assunto — não puxa outro assunto do nada."
        )
    elif not pode_puxar_assunto_novo:
        instrucao_assunto = (
            "Segue o papo no clima do que já tá rolando aí em cima. Só comenta, "
            "reage, continua a conversa — NÃO puxa assunto novo agora."
        )
    elif evento_mundo:
        instrucao_assunto = (
            f'Puxa um assunto. Se quiser, usa isso de gancho: "{evento_mundo}" — '
            "mas pode ser qualquer coisa leve do teu dia também."
        )
    else:
        instrucao_assunto = "Puxa um assunto leve pra começar a conversa."

    if destinatario_eh_chefe:
        rotulo_destinatario = f"seu chefe, {nome_destinatario}"
        nota_chefe = "É o chefe — pode ser simpático, mas um pouco mais na dele que com um colega."
    else:
        rotulo_destinatario = f"seu colega {nome_destinatario}"
        nota_chefe = "É um colega, fica à vontade."
    prompt = _PROMPT_SOCIAL.format(
        nome_remetente=nome_remetente,
        personalidade=personalidade or "",
        rotulo_destinatario=rotulo_destinatario,
        fato_do_dia=fato_do_dia,
        historico_json=json.dumps(historico_recente, ensure_ascii=False, default=str),
        instrucao_assunto=instrucao_assunto,
        nota_chefe=nota_chefe,
    )
    try:
        resultado = await modelo.ainvoke(prompt)
    except Exception as exc:
        registrar_execucao(
            especialidade=especialidade_remetente,
            modelo=settings.llm_model_cheap,
            contexto_prompt=prompt,
            erro=f"falha na chamada: {exc}",
        )
        raise RuntimeError(f"Falha ao chamar o modelo de mensagem social: {exc}") from exc

    return _extrair_resultado(resultado, especialidade_remetente, prompt)
