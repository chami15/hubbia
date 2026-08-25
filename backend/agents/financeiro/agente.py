"""Agente Financeiro (Cifra) — geração da narrativa do relatório mensal.

Diferente de um agente com tool-calling (create_agent/LangGraph), aqui não
há decisão de "qual tool chamar": o resolver já calculou tudo (kpis,
gráficos, recorrências, maiores gastos) em Python/SQL antes de chegar aqui.
O LLM recebe esses números prontos e devolve só a parte narrativa — uma
chamada estruturada única, sem loop.
"""
import json

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from agents._shared.execucoes import registrar_execucao
from config import settings

load_dotenv()

# Chave de junção com a linha em `agentes` (a mesma que o frontend usa
# pra ligar crachá a agente) — `registrar_execucao` resolve o id por ela.
_ESPECIALIDADE = "financeiro"


class AnaliseFinanceira(BaseModel):
    padroes_identificados: list[str] = Field(
        ..., description="2 a 5 padrões concretos encontrados nos dados, citando números."
    )
    recomendacoes: list[str] = Field(
        ..., description="2 a 4 recomendações acionáveis, cada uma amarrada a um número concreto."
    )
    resumo_textual: str = Field(
        ..., description="3 a 5 frases resumindo o mês, tom direto, sem jargão."
    )


SYSTEM_PROMPT = """Você é o Cifra, o agente Financeiro do hub. Metódico, direto, um pouco
controlador com dinheiro — mas nunca alarmista. Sua função aqui é escrever a
análise do relatório financeiro mensal do chefe, com base EXCLUSIVAMENTE nos
dados já calculados abaixo. Você NUNCA calcula número nenhum sozinho — todo
valor, porcentagem e soma já vem pronto. Sua única tarefa é interpretar,
encontrar padrões e recomendar.

== DADOS DO MÊS (já calculados, use exatamente como estão) ==
{dados_json}

== O QUE VOCÊ DEVE PRODUZIR ==
1. padroes_identificados: 2 a 5 padrões concretos, citando os números recebidos.
2. recomendacoes: 2 a 4 recomendações acionáveis, cada uma amarrada a um
   número concreto (categoria que cresceu, assinatura sem uso aparente, etc.).
3. resumo_textual: 3 a 5 frases resumindo o mês, tom direto, sem jargão.

== REGRAS ==
- Nunca cite um valor que não esteja explicitamente nos dados recebidos.
- Se os dados de recorrência vierem vazios ou insuficientes (poucos meses de
  histórico ainda), diga isso explicitamente em vez de inventar um padrão.
- Não seja alarmista. Aponte fato, não dramatize.
"""

_model = None


def _get_model():
    global _model
    if _model is None:
        base = init_chat_model(f"openai:{settings.llm_model_strong}", temperature=0.3)
        _model = base.with_structured_output(AnaliseFinanceira, include_raw=True)
    return _model


async def gerar_analise(dados_calculados: dict) -> dict:
    """Recebe os dados já calculados e devolve a narrativa + metadados de custo.

    Retorna dict com: analise (AnaliseFinanceira), modelo, tokens_in,
    tokens_out, custo_usd. Lança RuntimeError se a chamada ou o parsing
    falharem.
    """
    model = _get_model()
    prompt = SYSTEM_PROMPT.format(
        dados_json=json.dumps(dados_calculados, ensure_ascii=False, indent=2, default=str)
    )

    try:
        resultado = await model.ainvoke(prompt)
    except Exception as exc:
        registrar_execucao(
            especialidade=_ESPECIALIDADE,
            modelo=settings.llm_model_strong,
            contexto_prompt=prompt,
            erro=f"falha na chamada: {exc}",
        )
        raise RuntimeError(f"Falha ao chamar o modelo: {exc}") from exc

    if resultado.get("parsing_error"):
        registrar_execucao(
            especialidade=_ESPECIALIDADE,
            modelo=settings.llm_model_strong,
            contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}",
        )
        raise RuntimeError(f"Agente não retornou o formato esperado: {resultado['parsing_error']}")

    raw = resultado["raw"]
    usage = getattr(raw, "usage_metadata", None) or {}
    tokens_in = usage.get("input_tokens", 0)
    tokens_out = usage.get("output_tokens", 0)
    custo_usd = round(
        (tokens_in / 1000) * settings.preco_input_por_1k_forte
        + (tokens_out / 1000) * settings.preco_output_por_1k_forte,
        6,
    )

    registrar_execucao(
        especialidade=_ESPECIALIDADE,
        modelo=settings.llm_model_strong,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        custo_usd=custo_usd,
        contexto_prompt=prompt,
        saida_bruta=str(resultado["parsed"]),
    )

    return {
        "analise": resultado["parsed"],
        "modelo": settings.llm_model_strong,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "custo_usd": custo_usd,
    }
