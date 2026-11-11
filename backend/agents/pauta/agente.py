"""Agente da Pauta (secretário pessoal). Duas chamadas estruturadas (padrão A), modelo barato:
  - P2 `organizar_lote`: um lote de textos -> destino, itens, prazo e se há dúvida;
  - P3 `consolidar_contexto`: os tópicos atuais de uma tarefa + só os textos novos -> "o que já se sabe";
  - P4 `sugerir_proximo_passo`: a tarefa inteira (enxuta) -> o próximo passo, como e por que agora.

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

class TopicoContexto(BaseModel):
    texto: str = Field(..., description="Um fato útil e curto (até 140 caracteres), sem opinião e sem repetir o título.")
    fontes: list[int] = Field(..., description="Os ids dos textos de onde o fato saiu (dos TEXTOS NOVOS ou das fontes dos TÓPICOS ATUAIS).")


class ContextoTarefa(BaseModel):
    topicos: list[TopicoContexto] = Field(..., description="Até 6 tópicos: os atuais revistos mais o que os textos novos acrescentam.")


_PROMPT_CONTEXTO = """Você é a Pauta, secretária pessoal do chefe. Mantenha o "o que já se sabe" de UMA tarefa:
fatos curtos que ajudam a fazê-la (endpoints e para que servem, decisões, números, nomes, links).

== TAREFA ==
{titulo}

== TÓPICOS ATUAIS (texto, fontes) ==
{topicos}

== TEXTOS NOVOS ==
{textos}

== REGRAS ==
- Devolva a lista inteira revista: mantenha o que continua valendo, junte o repetido, acrescente o novo.
- Se um texto novo corrige um tópico atual, fique com a versão nova.
- No máximo 6 tópicos, cada um com até 140 caracteres, em forma de fato ("GET /pedidos: lista com paginação").
- Cada tópico diz de quais textos saiu (ids). Nunca escreva algo que não esteja nos textos.
- Passos a fazer não são tópico (eles já estão no checklist). Partes [segredo] nunca são repetidas.
"""

class SugestaoPasso(BaseModel):
    proximo_passo: str = Field(..., description="UM passo concreto, começando por verbo, que dá para fazer numa sentada. Até 100 caracteres.")
    como: list[str] = Field(default_factory=list, description="Até 3 passos curtos (até 90 caracteres cada) de como fazer.")
    por_que: str = Field(..., description="Uma frase curta: por que este passo agora (prazo, o que destrava, o que está parado).")


_PROMPT_SUGESTAO = """Você é a Pauta, secretária pessoal do chefe. Ele está olhando UMA tarefa e quer saber o que fazer
a seguir e como prosseguir, de forma objetiva. Nada de texto longo.

== HOJE ==
{hoje}

== TAREFA ==
{tarefa}

== CHECKLIST (feito?, item) ==
{checklist}

== O QUE JÁ SE SABE ==
{contexto}

== JÁ SUGERIDOS E DESCARTADOS (não repita nem reformule) ==
{descartadas}

== REGRAS ==
- Um passo só, concreto, que caiba numa sessão de trabalho. Se um item pendente do checklist é o próximo passo, use-o.
- "como": no máximo 3 passos curtos, práticos, com o que já se sabe (nome do endpoint, do arquivo, da pessoa).
- "por_que": uma frase. Considere o prazo e o que destrava o resto.
- Nunca invente fato que não esteja acima. Partes [segredo] nunca são repetidas.
"""

_modelos: dict = {}


def _get_model(saida=None):
    saida = saida or OrganizacaoLote
    if saida not in _modelos:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.1)
        _modelos[saida] = base.with_structured_output(saida, include_raw=True)
    return _modelos[saida]


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


def montar_prompt_contexto(titulo: str, topicos: list[dict], textos: list[dict]) -> str:
    linhas_topicos = "\n".join(
        json.dumps({"texto": t["texto"], "fontes": t["fontes"]}, ensure_ascii=False) for t in topicos
    ) or "(nenhum ainda)"
    linhas_textos = "\n\n".join(f"[texto {t['id']}]\n{t['texto']}" for t in textos)
    return _PROMPT_CONTEXTO.format(titulo=titulo, topicos=linhas_topicos, textos=linhas_textos)


def montar_prompt_sugestao(hoje: str, tarefa: dict, descartadas: list[str]) -> str:
    cabecalho = f"{tarefa['titulo']} (frente: {tarefa['frente']}; prazo: {tarefa['prazo'] or 'sem prazo'})"
    checklist = "\n".join(f"[{'x' if i['feito'] else ' '}] {i['texto']}" for i in tarefa["checklist"]) or "(vazio)"
    contexto = "\n".join(f"- {c['texto']}" for c in tarefa["contexto"]) or "(nada ainda)"
    return _PROMPT_SUGESTAO.format(
        hoje=hoje, tarefa=cabecalho, checklist=checklist, contexto=contexto,
        descartadas="\n".join(f"- {d}" for d in descartadas) or "(nenhum)",
    )


async def sugerir_proximo_passo(prompt: str) -> dict:
    return await _chamar(_get_model(SugestaoPasso), prompt, "sugerir o próximo passo")


async def organizar_lote(prompt: str) -> dict:
    return await _chamar(_get_model(OrganizacaoLote), prompt, "organizar")


async def consolidar_contexto(prompt: str) -> dict:
    return await _chamar(_get_model(ContextoTarefa), prompt, "consolidar o contexto")


async def _chamar(modelo, prompt: str, o_que: str) -> dict:
    """Uma chamada, uma tentativa. Falhou -> RuntimeError (o gasto é registrado mesmo assim)."""
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
        raise RuntimeError(f"Falha ao chamar o modelo para {o_que}: {erro}") from erro

    if resultado.get("parsing_error"):
        registrar_execucao(
            especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}", duracao_ms=t.ms,
        )
        raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")

    usage = getattr(resultado["raw"], "usage_metadata", None) or {}
    tokens_in, tokens_out = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    custo = _custo(tokens_in, tokens_out)
    dado = resultado["parsed"]
    registrar_execucao(
        especialidade=_ESPECIALIDADE, modelo=settings.llm_model_cheap, tokens_in=tokens_in, tokens_out=tokens_out,
        custo_usd=custo, contexto_prompt=prompt, saida_bruta=dado.model_dump_json(), duracao_ms=t.ms,
    )
    return {"dado": dado, "modelo": settings.llm_model_cheap, "tokens_in": tokens_in, "tokens_out": tokens_out, "custo_usd": custo}
