"""Agente Norte — duas chamadas estruturadas independentes, sem
tool-calling e sem loop: escanear um projeto (1x, no cadastro) e gerar UM
card de sugestão por vez. A leitura do repositório em si (árvore, README,
manifest, commits/arquivos alterados) é feita de forma determinística por
`agents/norte/github_client.py` — aqui só entra LLM pra interpretar esse
contexto já coletado, nunca pra "explorar" o repositório sozinho.

`arquivos_afetados` é obrigatório e não pode ser vazio (`Field(min_length=1)`)
— um card sem pelo menos um arquivo/path concreto nunca sai daqui, é
rejeitado na própria validação do schema, antes de chegar no resolver.
"""
import json
from typing import Literal

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from agents._shared.execucoes import cronometrar, registrar_execucao
from config import settings

# Chave de junção com a linha em `agentes` — `registrar_execucao`
# resolve o id numérico por ela.
_ESPECIALIDADE = "norte"

load_dotenv()


_STACK_MAX_ITENS = 10


class EscaneamentoProjeto(BaseModel):
    descricao: str = Field(..., description="2 a 3 frases sobre do que se trata o projeto.")
    stack: list[str] = Field(
        ...,
        min_length=1,
        description=f"No máximo {_STACK_MAX_ITENS} itens mais relevantes: linguagem de programação, "
        "banco de dados, framework de frontend, principais bibliotecas do backend — NUNCA "
        "helpers/utilitários genéricos (ex: parser de encoding, detector de tipo de arquivo).",
    )
    arquitetura_resumo: str = Field(
        ...,
        description="Resumo de ALTO NÍVEL da estrutura — pastas principais e o "
        "que cada uma faz, nunca arquivo-por-arquivo.",
    )


class CardGerado(BaseModel):
    tipo: Literal["feature", "bug", "refatoracao", "proximo_passo"]
    titulo: str = Field(..., description="Título curto e direto do card.")
    descricao: str = Field(..., description="O que fazer e por quê, objetivo — vai ser lido e executado pelo chefe.")
    arquivos_afetados: list[str] = Field(
        ..., min_length=1, description="Pelo menos 1 path concreto de arquivo/pasta a mexer — NUNCA uma descrição vaga."
    )


_PROMPT_SCAN = """Você é o Norte, o agente de projetos do hub. Direto,
objetivo. Sua tarefa é resumir um repositório a partir do contexto bruto
abaixo — nunca invente algo que não esteja nos dados recebidos.

== ESTRUTURA DE ALTO NÍVEL (raiz do repositório) ==
{arvore_raiz}

== README ==
{readme}

== MANIFESTS ENCONTRADOS (raiz e subpastas — projeto com backend/frontend
   separados costuma ter um manifest em cada um) ==
{manifests}

== O QUE VOCÊ DEVE PRODUZIR ==
- descricao: 2-3 frases sobre do que se trata o projeto.
- stack: só as {stack_max_itens} mais relevantes — linguagem de
  programação, banco de dados, framework de frontend, principais
  bibliotecas do backend. NUNCA liste helper/utilitário genérico (ex:
  lib de parsing de encoding, detector de tipo de arquivo) — isso só
  polui. Se houver manifest de mais de uma pasta (ex: backend E
  frontend), reflita AMBOS dentro do limite, não só o primeiro que
  aparecer. Nunca invente dependência que não apareceu nos manifests ou
  no README.
- arquitetura_resumo: resumo de alto nível — pastas principais e pra que
  cada uma serve. Nunca liste arquivo por arquivo.
"""

_PROMPT_CARD = """Você é o Norte, o agente de projetos do hub. Sua função
é ajudar o chefe a manter o momentum em projetos pessoais que ele tende a
abandonar no meio — sugerindo SEMPRE UM passo concreto e específico por
vez, nunca uma lista, nunca algo vago.

== PROJETO ==
{contexto_projeto}

== O QUE MUDOU DESDE A ÚLTIMA ANÁLISE ==
{mudancas_recentes}

== HISTÓRICO RECENTE DE CARDS (o que já foi rejeitado/finalizado) ==
{historico_cards}

== REGRAS ==
- ANTES de sugerir qualquer coisa, releia com atenção a `descricao` e a
  `arquitetura_resumo` dentro de `contexto_projeto`. Se alguma
  funcionalidade já está descrita ali como EXISTENTE, NUNCA sugira
  implementá-la do zero de novo — isso contradiz o que você mesmo já
  identificou sobre o projeto. Ex: se a descricao diz que upload de
  arquivo já funciona, não proponha "implementar upload de arquivo".
- Sugira UM card só, concreto e específico — nunca "melhorar a UI" ou
  "revisar o código", sempre algo com um arquivo/caminho claro em
  arquivos_afetados.
- NUNCA repita a essência de um card que já está no histórico como
  rejeitado — se um foi rejeitado, proponha algo genuinamente diferente,
  não a mesma ideia reescrita com outras palavras.
- Se um card recente foi finalizado, considere isso feito — não sugira a
  mesma coisa de novo, avance a partir dali.
- Prefira sugerir algo que dá pra concluir numa sessão de trabalho, não
  uma feature enorme — o objetivo é destravar o próximo passo pequeno,
  não redesenhar o projeto inteiro.
"""

_model_scan = None
_model_card = None


def _get_model_scan():
    global _model_scan
    if _model_scan is None:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.2)
        _model_scan = base.with_structured_output(EscaneamentoProjeto, include_raw=True)
    return _model_scan


def _get_model_card():
    global _model_card
    if _model_card is None:
        base = init_chat_model(f"openai:{settings.llm_model_strong}", temperature=0.4)
        _model_card = base.with_structured_output(CardGerado, include_raw=True)
    return _model_card


def _custo(tokens_in: int, tokens_out: int, barato: bool) -> float:
    preco_in = settings.preco_input_por_1k_barato if barato else settings.preco_input_por_1k_forte
    preco_out = settings.preco_output_por_1k_barato if barato else settings.preco_output_por_1k_forte
    return round((tokens_in / 1000) * preco_in + (tokens_out / 1000) * preco_out, 6)


def _extrair_resultado(resultado: dict, barato: bool, prompt: str | None = None, duracao_ms: int | None = None) -> dict:
    modelo = settings.llm_model_cheap if barato else settings.llm_model_strong

    if resultado.get("parsing_error"):
        # registra ANTES de levantar: chamada que falhou no parsing
        # gastou token igual, e o orçamento precisa saber disso
        registrar_execucao(
            especialidade=_ESPECIALIDADE,
            modelo=modelo,
            contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}",
            duracao_ms=duracao_ms,
        )
        raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")

    raw = resultado["raw"]
    usage = getattr(raw, "usage_metadata", None) or {}
    tokens_in = usage.get("input_tokens", 0)
    tokens_out = usage.get("output_tokens", 0)
    custo_usd = _custo(tokens_in, tokens_out, barato)

    registrar_execucao(
        especialidade=_ESPECIALIDADE,
        modelo=modelo,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        custo_usd=custo_usd,
        contexto_prompt=prompt,
        saida_bruta=str(resultado["parsed"]),
        duracao_ms=duracao_ms,
    )

    return {
        "dado": resultado["parsed"],
        "modelo": modelo,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "custo_usd": custo_usd,
    }


async def escanear_projeto(arvore_raiz: list[dict], readme: str | None, manifests: list[dict]) -> dict:
    """Lança RuntimeError se a chamada ou o parsing falharem — uma
    tentativa só, sem retry automático."""
    modelo = _get_model_scan()
    prompt = _PROMPT_SCAN.format(
        arvore_raiz=json.dumps(arvore_raiz, ensure_ascii=False),
        readme=(readme or "(sem README)")[:4000],
        manifests=json.dumps(manifests, ensure_ascii=False) if manifests else "(nenhum manifest conhecido encontrado, nem na raiz nem em subpastas)",
        stack_max_itens=_STACK_MAX_ITENS,
    )
    with cronometrar() as t:
        try:
            resultado = await modelo.ainvoke(prompt)
        except Exception as exc:
            registrar_execucao(
                especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, contexto_prompt=prompt,
                erro=f"falha na chamada: {exc}", duracao_ms=t.ms,
            )
            raise RuntimeError(f"Falha ao chamar o modelo de escaneamento: {exc}") from exc

    saida = _extrair_resultado(resultado, barato=True, prompt=prompt, duracao_ms=t.ms)
    # Trunca deterministicamente — não confia só na instrução de prompt
    # pro limite de itens, mesmo espírito das outras checagens do hub.
    saida["dado"].stack = saida["dado"].stack[:_STACK_MAX_ITENS]
    return saida


async def gerar_card(contexto_projeto: dict, mudancas_recentes: dict, historico_cards: list[dict]) -> dict:
    modelo = _get_model_card()
    prompt = _PROMPT_CARD.format(
        contexto_projeto=json.dumps(contexto_projeto, ensure_ascii=False, default=str),
        mudancas_recentes=json.dumps(mudancas_recentes, ensure_ascii=False, default=str),
        historico_cards=json.dumps(historico_cards, ensure_ascii=False, default=str) if historico_cards else "(nenhum card resolvido ainda)",
    )
    with cronometrar() as t:
        try:
            resultado = await modelo.ainvoke(prompt)
        except Exception as exc:
            registrar_execucao(
                especialidade=_ESPECIALIDADE, modelo=settings.llm_model_strong, contexto_prompt=prompt,
                erro=f"falha na chamada: {exc}", duracao_ms=t.ms,
            )
            raise RuntimeError(f"Falha ao chamar o modelo de geração de card: {exc}") from exc
    return _extrair_resultado(resultado, barato=False, prompt=prompt, duracao_ms=t.ms)
