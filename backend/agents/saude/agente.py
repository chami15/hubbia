"""Agente de Saúde (Vita) — quatro chamadas estruturadas independentes, sem
tool-calling e sem loop: estimar macro de uma refeição (texto ou foto),
gerar plano de dieta, e gerar o relatório semanal. Todo o resto do domínio
(peso, hidratação, sono, atividade, ficha de treino) é escrita direta no
banco pelo resolver, sem passar por aqui — só entra LLM onde tem alguma
estimativa/síntese real a fazer, nunca pra registro estruturado puro.

Tanto a estimativa de refeição quanto o plano de dieta passam por uma
checagem de consistência puramente aritmética (calorias vs. macros) antes
de sair daqui — o campo `confianca`/as orientações são prompt (soft), mas
o número final nunca fica incoerente com os próprios macros que a LLM
devolveu (ver `_corrigir_consistencia` e `_corrigir_consistencia_plano`).
"""
import json
from typing import Literal

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from agents._shared.execucoes import registrar_execucao
from config import settings

load_dotenv()

# Chave de junção com a linha em `agentes` — `registrar_execucao`
# resolve o id numérico por ela.
_ESPECIALIDADE = "saude"

_MARGEM_CONSISTENCIA_CALORIAS = 0.35  # 35% de diferença tolerada entre calorias informadas e as calculadas a partir dos macros


class EstimativaRefeicao(BaseModel):
    calorias: float = Field(..., ge=0, le=3000, description="Estimativa de calorias totais da refeição.")
    carboidratos_g: float = Field(..., ge=0, le=400)
    proteinas_g: float = Field(..., ge=0, le=300)
    gorduras_g: float = Field(..., ge=0, le=250)
    confianca: Literal["alta", "media", "baixa"] = Field(
        ..., description="Sua própria confiança nessa estimativa, dada a informação disponível."
    )


class PlanoDietaGerado(BaseModel):
    meta_calorica: int = Field(..., ge=800, le=6000)
    carboidratos_g: int = Field(..., ge=0)
    proteinas_g: int = Field(..., ge=0)
    gorduras_g: int = Field(..., ge=0)
    orientacoes: str = Field(
        ..., description="Orientações práticas e objetivas, considerando objetivo e restrições do chefe."
    )


class RelatorioSaudeGerado(BaseModel):
    resumo: str = Field(..., description="3 a 5 frases resumindo a semana.")
    evolucao_peso: str = Field(..., description="O que aconteceu com o peso na semana, com base nos dados recebidos.")
    adesao_alimentar: str = Field(..., description="Como foi a alimentação frente ao plano de dieta, se houver um ativo.")
    atividade_fisica: str = Field(..., description="Resumo da atividade física da semana.")
    recomendacoes: list[str] = Field(..., description="2 a 4 recomendações acionáveis pra próxima semana.")


_PROMPT_MACRO = """Você é o Vita, o agente de Saúde do hub. Direto, sem
rodeio, nunca alarmista. Sua tarefa aqui é estimar os macronutrientes de UMA
refeição, usando o perfil da pessoa como referência de porção média (uma
pessoa maior/mais pesada tende a comer porções maiores que uma pessoa menor
— use isso pra calibrar, não ignore).

== PERFIL ==
{perfil_json}

== REFEIÇÃO ({tipo_refeicao}) ==
{conteudo_refeicao}

== REGRAS ==
- calorias, carboidratos_g, proteinas_g e gorduras_g são SEMPRE estimativas
  aproximadas — não escreva ressalva sobre isso em lugar nenhum, os campos
  numéricos já implicam isso.
- carboidratos_g*4 + proteinas_g*4 + gorduras_g*9 precisa ficar PRÓXIMO do
  valor de calorias que você mesmo informar — nunca devolva números
  incoerentes entre si.
- confianca="baixa" é OBRIGATÓRIO sempre que a informação disponível
  (descrição ou foto) NÃO permitir identificar os alimentos com clareza —
  ex: descrição tipo "comi alguma coisa", "lanchei algo por aí", "almocei
  normal"; ou foto borrada/sem o prato visível. Isso vale mesmo quando você
  ainda assim vai estimar um número plausível baseado só no perfil — o
  campo precisa refletir que a informação real era quase nula, não só que
  a porção é incerta.
- confianca="media": alimentos identificados com clareza, mas falta noção
  de quantidade/porção (ex: "arroz, feijão e frango" sem dizer quanto; ou
  foto do prato sem noção clara de tamanho da porção).
- confianca="alta": alimento E quantidade/porção claros (ex: "200g de
  arroz, 150g de frango grelhado"; ou foto nítida com porção óbvia).
"""

_PROMPT_PLANO = """Você é o Vita, o agente de Saúde do hub. Sua tarefa é
montar um plano alimentar (meta calórica + macros + orientações) pro
objetivo ESPECÍFICO dessa pessoa — nunca sugira algo genérico que ignore o
objetivo (ex: nunca proponha superávit calórico grande pra quem quer
emagrecer, nem déficit agressivo pra quem quer ganhar massa).

== PERFIL ==
{perfil_json}

== REGRAS ==
- meta_calorica e os macros precisam ser coerentes com objetivo, sexo,
  idade, altura e peso atual informados.
- Se houver restrição alimentar ou diabetes no perfil, orientacoes precisa
  mencionar isso explicitamente.
- Seja objetivo — orientacoes é pra ser lido e seguido, não um ensaio.
"""

_PROMPT_RELATORIO = """Você é o Vita, o agente de Saúde do hub. Direto, sem
alarmismo. Sua tarefa é narrar a evolução da semana com base EXCLUSIVAMENTE
nos dados já calculados abaixo — você NUNCA calcula nada sozinho, só
interpreta o que já veio pronto.

== DADOS DA SEMANA (já calculados) ==
{dados_json}

== REGRAS ==
- Nunca cite um número que não esteja explicitamente nos dados recebidos.
- Se faltar dado de alguma categoria (ex: nenhuma atividade registrada na
  semana), diga isso explicitamente em vez de inventar um padrão.
- evolucao_peso: só afirme tendência, estabilidade ou evolução se
  `peso_registros_na_semana` for 2 ou mais. Com 0 ou 1 registro, diga
  explicitamente que ainda não há base de comparação — NUNCA invente uma
  comparação com "semanas anteriores" que não foi fornecida nos dados.
- adesao_alimentar: `plano_dieta_ativo.meta_calorica` é uma meta DIÁRIA —
  compare com `media_calorica_diaria` (também diária, já calculada).
  NUNCA compare a meta diária com `calorias_totais_semana` (é o total da
  semana inteira, uma unidade de tempo diferente — comparar os dois
  direto não faz sentido). Se `dias_com_refeicao_registrada` for baixo,
  mencione isso — poucos dias rastreados na semana também é um sinal de
  aderência, não só o valor calórico em si.
- Não seja alarmista — aponte fato, não dramatize.
"""

_model_macro = None
_model_plano = None
_model_relatorio = None


def _get_model_macro():
    global _model_macro
    if _model_macro is None:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.2)
        _model_macro = base.with_structured_output(EstimativaRefeicao, include_raw=True)
    return _model_macro


def _get_model_plano():
    global _model_plano
    if _model_plano is None:
        base = init_chat_model(f"openai:{settings.llm_model_strong}", temperature=0.3)
        _model_plano = base.with_structured_output(PlanoDietaGerado, include_raw=True)
    return _model_plano


def _get_model_relatorio():
    global _model_relatorio
    if _model_relatorio is None:
        base = init_chat_model(f"openai:{settings.llm_model_strong}", temperature=0.3)
        _model_relatorio = base.with_structured_output(RelatorioSaudeGerado, include_raw=True)
    return _model_relatorio


def _custo(tokens_in: int, tokens_out: int, barato: bool) -> float:
    preco_in = settings.preco_input_por_1k_barato if barato else settings.preco_input_por_1k_forte
    preco_out = settings.preco_output_por_1k_barato if barato else settings.preco_output_por_1k_forte
    return round((tokens_in / 1000) * preco_in + (tokens_out / 1000) * preco_out, 6)


def _extrair_resultado(resultado: dict, barato: bool, prompt: str | None = None) -> dict:
    modelo = settings.llm_model_cheap if barato else settings.llm_model_strong

    if resultado.get("parsing_error"):
        # registra ANTES de levantar: chamada que falhou no parsing
        # gastou token igual, e o orçamento precisa saber disso
        registrar_execucao(
            especialidade=_ESPECIALIDADE,
            modelo=modelo,
            contexto_prompt=prompt,
            erro=f"parsing_error: {resultado['parsing_error']}",
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
    )

    return {
        "dado": resultado["parsed"],
        "modelo": modelo,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "custo_usd": custo_usd,
    }


def _corrigir_consistencia(estimativa: EstimativaRefeicao) -> EstimativaRefeicao:
    """Se as calorias informadas não baterem com os macros (dentro de uma
    margem), recalcula a partir dos macros em vez de confiar cegamente no
    total solto que a LLM devolveu — os macros tendem a estar mais
    ancorados na descrição do prato do que um número de calorias à parte.
    Puramente aritmético, não gasta token nenhum extra. Roda só DEPOIS do
    gate de `_exigir_alimento_identificado` — aqui já sabemos que a LLM
    identificou algum alimento real, o problema é só a matemática interna."""
    calorias_pelos_macros = (
        estimativa.carboidratos_g * 4 + estimativa.proteinas_g * 4 + estimativa.gorduras_g * 9
    )
    if calorias_pelos_macros <= 0:
        raise ValueError("Estimativa sem macros válidos — não dá pra calcular calorias.")

    diferenca = abs(estimativa.calorias - calorias_pelos_macros) / calorias_pelos_macros
    if diferenca > _MARGEM_CONSISTENCIA_CALORIAS:
        estimativa.calorias = round(calorias_pelos_macros, 1)
        estimativa.confianca = "baixa"
    return estimativa


def _exigir_alimento_identificado(estimativa: EstimativaRefeicao) -> EstimativaRefeicao:
    """Gate ANTES da checagem de consistência: se a própria LLM devolveu
    confianca="baixa" (que pelo prompt agora significa especificamente
    "não consegui identificar nenhum alimento de verdade"), rejeita em vez
    de gravar um chute. Sem isso, descrições vazias tipo "qualquer coisa
    por aí" inflariam o histórico com números fabricados toda vez que
    fossem registradas, poluindo dashboard e relatório com dado sem
    informação real por trás. Precisa checar a confianca ORIGINAL, antes
    de `_corrigir_consistencia` rodar — essa função também pode rebaixar
    pra "baixa" por um motivo totalmente diferente (comida identificada,
    mas matemática interna incoerente), e esse caso não deve ser
    rejeitado, só corrigido."""
    if estimativa.confianca == "baixa":
        raise ValueError(
            "Não consegui identificar nenhum alimento nessa refeição — descreva "
            'pelo menos um alimento (mesmo que básico, tipo "macarrão" ou '
            '"miojo") pra eu conseguir estimar.'
        )
    return estimativa


def _corrigir_consistencia_plano(plano: PlanoDietaGerado) -> PlanoDietaGerado:
    """Mesma auditoria da refeição, na direção oposta: aqui meta_calorica É
    o alvo deliberado (é em cima dele que orientacoes é escrito), então se
    os macros não baterem, escala os três proporcionalmente pra somar
    exatamente meta_calorica — preserva a proporção entre eles, só corrige
    a escala. Puramente aritmético, sem chamada extra."""
    calorias_pelos_macros = plano.carboidratos_g * 4 + plano.proteinas_g * 4 + plano.gorduras_g * 9
    if calorias_pelos_macros <= 0:
        raise ValueError("Plano sem macros válidos — não dá pra conferir consistência.")

    diferenca = abs(plano.meta_calorica - calorias_pelos_macros) / calorias_pelos_macros
    if diferenca > _MARGEM_CONSISTENCIA_CALORIAS:
        fator = plano.meta_calorica / calorias_pelos_macros
        plano.carboidratos_g = round(plano.carboidratos_g * fator)
        plano.proteinas_g = round(plano.proteinas_g * fator)
        plano.gorduras_g = round(plano.gorduras_g * fator)
    return plano


async def estimar_macros_texto(descricao: str, tipo_refeicao: str, perfil: dict) -> dict:
    """Lança RuntimeError/ValueError se a chamada, o parsing ou a checagem
    de consistência falharem — uma tentativa só, sem retry automático (não
    gasta token à toa tentando se corrigir sozinho)."""
    modelo = _get_model_macro()
    prompt = _PROMPT_MACRO.format(
        perfil_json=json.dumps(perfil, ensure_ascii=False, default=str),
        tipo_refeicao=tipo_refeicao,
        conteudo_refeicao=f'Descrição dada pelo chefe: "{descricao}"',
    )
    try:
        resultado = await modelo.ainvoke(prompt)
    except Exception as exc:
        raise RuntimeError(f"Falha ao chamar o modelo de estimativa: {exc}") from exc

    saida = _extrair_resultado(resultado, barato=True, prompt=prompt)
    saida["dado"] = _corrigir_consistencia(_exigir_alimento_identificado(saida["dado"]))
    return saida


async def estimar_macros_foto(imagem_base64: str, mime_type: str, tipo_refeicao: str, perfil: dict) -> dict:
    modelo = _get_model_macro()
    prompt_texto = _PROMPT_MACRO.format(
        perfil_json=json.dumps(perfil, ensure_ascii=False, default=str),
        tipo_refeicao=tipo_refeicao,
        conteudo_refeicao="Foto do prato anexada — analise a imagem.",
    )
    mensagem = HumanMessage(
        content=[
            {"type": "text", "text": prompt_texto},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{imagem_base64}"}},
        ]
    )
    try:
        resultado = await modelo.ainvoke([mensagem])
    except Exception as exc:
        raise RuntimeError(f"Falha ao chamar o modelo de estimativa: {exc}") from exc

    # só o texto vai pro registro — a imagem em base64 encheria
    # `contexto_prompt` de bytes que ninguém vai reler
    saida = _extrair_resultado(resultado, barato=True, prompt=prompt_texto)
    saida["dado"] = _corrigir_consistencia(_exigir_alimento_identificado(saida["dado"]))
    return saida


async def gerar_plano_dieta(perfil: dict) -> dict:
    modelo = _get_model_plano()
    prompt = _PROMPT_PLANO.format(perfil_json=json.dumps(perfil, ensure_ascii=False, default=str))
    try:
        resultado = await modelo.ainvoke(prompt)
    except Exception as exc:
        raise RuntimeError(f"Falha ao chamar o modelo de plano de dieta: {exc}") from exc

    saida = _extrair_resultado(resultado, barato=False, prompt=prompt)
    saida["dado"] = _corrigir_consistencia_plano(saida["dado"])
    return saida


async def gerar_relatorio_semanal(dados_semana: dict) -> dict:
    modelo = _get_model_relatorio()
    prompt = _PROMPT_RELATORIO.format(
        dados_json=json.dumps(dados_semana, ensure_ascii=False, indent=2, default=str)
    )
    try:
        resultado = await modelo.ainvoke(prompt)
    except Exception as exc:
        raise RuntimeError(f"Falha ao chamar o modelo de relatório: {exc}") from exc
    return _extrair_resultado(resultado, barato=False, prompt=prompt)
