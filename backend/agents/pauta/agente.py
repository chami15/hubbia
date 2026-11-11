"""Agente da Pauta (secretário pessoal) — P2: organizar um lote de textos numa chamada estruturada só (padrão A).

O resolver monta tudo antes (textos já com segredo mascarado, tarefas abertas com termos, frentes, data de hoje); o
modelo só decide destino, itens, prazo e se tem dúvida. Tudo que ele devolve é conferido em código depois
(`resolvers/pauta_regras.py`): id inventado, título longo, item repetido e "certeza" em caso ambíguo não passam.
"""
import json
from typing import Literal

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from agents._shared.execucoes import cronometrar, registrar_execucao
from config import settings

load_dotenv()

_ESPECIALIDADE = "pauta"


class DecisaoTexto(BaseModel):
    texto_id: int = Field(..., description="O id do texto, exatamente como veio na lista de TEXTOS.")
    destino: Literal["existente", "nova"] = Field(
        ..., description="'existente' se o texto é contexto ou parte de uma tarefa da lista; 'nova' se é outra coisa a fazer."
    )
    tarefa_id: int | None = Field(None, description="Com destino 'existente': o id de uma tarefa da lista. Nunca invente.")
    nova_titulo: str | None = Field(
        None, description="Com destino 'nova': o que fazer, começando por verbo no infinitivo, até 80 caracteres."
    )
    nova_frente: str | None = Field(None, description="Com destino 'nova': o nome de uma das FRENTES.")
    termos: list[str] = Field(
        default_factory=list,
        description="1 a 5 palavras que identificam o assunto (nome de sistema, cliente, matéria, projeto). Nada genérico.",
    )
    confianca: Literal["certa", "duvida"] = Field(
        ..., description="'duvida' sempre que o texto puder ser de mais de uma tarefa ou frente."
    )
    candidatos: list[int] = Field(
        default_factory=list, description="Com 'duvida': até 3 ids de tarefas da lista que podem ser o destino."
    )
    prazo: str | None = Field(None, description="Data AAAA-MM-DD só se o texto disser um prazo; senão null.")
    itens: list[str] = Field(
        default_factory=list,
        description="Até 5 passos concretos que o texto pede, curtos, começando por verbo. Lista vazia se o texto é só contexto.",
    )


class OrganizacaoLote(BaseModel):
    decisoes: list[DecisaoTexto] = Field(..., description="Uma decisão para cada texto da lista, sem pular nenhum.")


_PROMPT = """Você é a Pauta, secretária pessoal do chefe. Ele despeja textos soltos (lembretes curtos ou
textos longos de contexto) e você organiza cada um em uma tarefa, sem inventar nada.

== HOJE ==
{hoje}

== FRENTES ==
{frentes}

== TAREFAS ABERTAS (id, frente, título, termos) ==
{tarefas}

== TEXTOS ==
{textos}

== REGRAS ==
- Texto que dá contexto ou detalhe de uma tarefa da lista vai para ela (destino 'existente'), mesmo se for longo.
- 'nova' só quando é outra coisa a fazer. Título curto, objetivo, começando por verbo.
- Use os TERMOS das tarefas para decidir. Se o texto só usa uma palavra genérica (ex.: "a API") e existe mais de
  uma tarefa possível, marque 'duvida' e liste os candidatos. Não chute: o chefe responde a dúvida em um clique.
- Frente incerta (trabalho, faculdade ou pessoal) também é 'duvida'.
- Itens: só passos que o texto pede ou implica claramente. Contexto puro (explicação, lista de endpoints) não vira item.
- Prazo: só se o texto disser ("até sexta", "dia 20"); converta para data usando HOJE.
- Partes marcadas [segredo] foram escondidas de propósito: nunca as repita nem peça.
"""

_model = None


def _get_model():
    global _model
    if _model is None:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.1)
        _model = base.with_structured_output(OrganizacaoLote, include_raw=True)
    return _model


def _custo(tokens_in: int, tokens_out: int) -> float:
    return round(
        (tokens_in / 1000) * settings.preco_input_por_1k_barato + (tokens_out / 1000) * settings.preco_output_por_1k_barato,
        6,
    )


def montar_prompt(hoje: str, frentes: list[str], tarefas: list[dict], textos: list[dict]) -> str:
    linhas_tarefas = "\n".join(
        json.dumps({"id": t["id"], "frente": t["frente"], "titulo": t["titulo"], "termos": t["termos"]}, ensure_ascii=False)
        for t in tarefas
    ) or "(nenhuma ainda)"
    linhas_textos = "\n\n".join(f"[texto {t['id']}]\n{t['texto']}" for t in textos)
    return _PROMPT.format(hoje=hoje, frentes=", ".join(frentes), tarefas=linhas_tarefas, textos=linhas_textos)


async def organizar_lote(prompt: str) -> dict:
    """Uma chamada, uma tentativa. Falhou -> RuntimeError (o gasto é registrado mesmo assim)."""
    modelo = _get_model()
    erro = None
    with cronometrar() as t:
        try:
            resultado = await modelo.ainvoke(prompt)
        except Exception as exc:  # noqa: BLE001 — vira RuntimeError claro logo abaixo
            erro = exc
    # registra DEPOIS do `with`: só aí o cronômetro tem o tempo (chamada que demorou e estourou é a que mais interessa)
    if erro is not None:
        registrar_execucao(
            especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, contexto_prompt=prompt,
            erro=f"falha na chamada: {erro}", duracao_ms=t.ms,
        )
        raise RuntimeError(f"Falha ao chamar o modelo para organizar: {erro}") from erro

    if resultado.get("parsing_error"):
        registrar_execucao(
            especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}", duracao_ms=t.ms,
        )
        raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")

    usage = getattr(resultado["raw"], "usage_metadata", None) or {}
    tokens_in, tokens_out = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    custo = _custo(tokens_in, tokens_out)
    dado: OrganizacaoLote = resultado["parsed"]
    registrar_execucao(
        especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, tokens_in=tokens_in, tokens_out=tokens_out,
        custo_usd=custo, contexto_prompt=prompt, saida_bruta=dado.model_dump_json(), duracao_ms=t.ms,
    )
    return {"dado": dado, "modelo": settings.llm_model_cheap, "tokens_in": tokens_in, "tokens_out": tokens_out, "custo_usd": custo}
