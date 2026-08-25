"""Sala de máquinas — saúde das conexões e contabilidade de custo.

É o resolver do agente **Motriz**, e a fonte do painel de infra do
frontend. Duas regras que definem tudo o que está aqui:

**1. Zero LLM.** Checagem de saúde é booleano e subtração: o token
expirou? é uma data. O orçamento estourou? é uma conta. Gastar token de
LLM pra descobrir que se está gastando muito token de LLM seria a coisa
mais cara e mais boba do hub. E como não custa nada, Motriz pode rodar
em TODO tick sem consultar orçamento — inclusive (principalmente)
quando o orçamento já estourou, que é justamente quando ele mais serve.

**2. Checagem local, nunca chamada externa.** Ver se o `token.json`
existe e não venceu é ler um arquivo. Bater na API do Google a cada
tick pra "conferir se está de pé" transformaria o monitor na maior
fonte de rate limit do sistema — o vigia virando o problema.
"""
import json
import os
from datetime import datetime, timedelta, timezone

from config import settings
from resolvers import tick as resolver_tick
from utils.query_executor import executar_query

# Um problema só vira aviso quando falta MENOS que isto pro token vencer
# — antes disso não há o que fazer a respeito, e aviso sobre o qual não
# se pode agir é aviso que ensina a ignorar aviso.
_DIAS_ALERTA_VENCIMENTO = 5

# Acima desta fração do teto diário, o orçamento entra em 'atencao'.
_FRACAO_ORCAMENTO_ATENCAO = 0.8


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _inicio_do_dia_real() -> datetime:
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(settings.timezone_padrao)
    hoje = datetime.now(tz).date()
    return datetime.combine(hoje, datetime.min.time(), tzinfo=tz)


def _item(nome: str, status: str, detalhe: str, acao: str | None = None) -> dict:
    """`status`: 'ok' | 'atencao' | 'quebrado' | 'nao_configurado'.

    'nao_configurado' é deliberadamente diferente de 'quebrado': o Norte
    sem token do GitHub num hub que não usa o Norte não é um defeito, é
    uma escolha. Tratar os dois como a mesma coisa encheria a tela de
    vermelho por algo que ninguém pediu."""
    return {"nome": nome, "status": status, "detalhe": detalhe, "acao": acao}


# ---------------------------------------------------------------------------
# Checagens — cada uma devolve um item, nenhuma levanta exceção
# ---------------------------------------------------------------------------

def _checar_banco() -> dict:
    try:
        executar_query("agentes:listar")
        return _item("Banco de dados", "ok", "Postgres respondendo.")
    except Exception as exc:
        return _item(
            "Banco de dados", "quebrado", f"Sem resposta: {exc}",
            acao="Confira se o container do Postgres está de pé (docker compose up -d).",
        )


def _checar_openai() -> dict:
    """Só confere se a chave EXISTE. Validar de verdade exigiria uma
    chamada paga — e um monitor que gasta pra dizer que você está
    gastando é exatamente o que este módulo não faz."""
    if not settings.openai_api_key:
        return _item(
            "OpenAI", "nao_configurado", "OPENAI_API_KEY vazia no .env.",
            acao="Sem ela, relatório, plano de dieta, card e papo social não funcionam.",
        )
    return _item("OpenAI", "ok", "Chave configurada.")


def _checar_google() -> dict:
    caminho = settings.google_token_path
    if not os.path.exists(caminho):
        return _item(
            "Google Calendar", "nao_configurado", f"Não achei '{caminho}'.",
            acao="Rode 'python -m scripts.autorizar_google_calendar' uma vez.",
        )
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            dados = json.load(arquivo)
    except Exception as exc:
        return _item(
            "Google Calendar", "quebrado", f"Token ilegível: {exc}",
            acao="Rode 'python -m scripts.autorizar_google_calendar' de novo.",
        )

    expiry = dados.get("expiry")
    tem_refresh = bool(dados.get("refresh_token"))
    if not expiry:
        return _item("Google Calendar", "ok", "Autorizado (sem data de expiração no token).")

    try:
        vence = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        if vence.tzinfo is None:
            vence = vence.replace(tzinfo=timezone.utc)
    except ValueError:
        return _item("Google Calendar", "ok", "Autorizado (data de expiração em formato desconhecido).")

    restante = vence - _agora()
    if restante.total_seconds() <= 0:
        # com refresh_token o próprio cliente renova sozinho na próxima
        # chamada — venceu não é sinônimo de quebrado aqui
        if tem_refresh:
            return _item("Google Calendar", "ok", "Token vencido, mas renova sozinho (tem refresh_token).")
        return _item(
            "Google Calendar", "quebrado", "Token vencido e sem refresh_token.",
            acao="Rode 'python -m scripts.autorizar_google_calendar' de novo.",
        )
    if restante < timedelta(days=_DIAS_ALERTA_VENCIMENTO) and not tem_refresh:
        dias = max(1, restante.days)
        return _item(
            "Google Calendar", "atencao", f"Token vence em {dias} dia(s) e não tem refresh_token.",
            acao="Reautorize antes de vencer pra Agenda não parar no meio.",
        )
    return _item("Google Calendar", "ok", "Autorizado.")


def _checar_github() -> dict:
    if not settings.github_client_id:
        return _item(
            "GitHub", "nao_configurado", "GITHUB_CLIENT_ID vazio no .env.",
            acao="Sem ele, o Norte não consegue cadastrar nem escanear projeto.",
        )
    caminho = settings.github_token_path
    if not os.path.exists(caminho):
        return _item(
            "GitHub", "nao_configurado", f"Não achei '{caminho}'.",
            acao="Rode 'python -m scripts.autorizar_github' uma vez.",
        )
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            dados = json.load(arquivo)
    except Exception as exc:
        return _item(
            "GitHub", "quebrado", f"Token ilegível: {exc}",
            acao="Rode 'python -m scripts.autorizar_github' de novo.",
        )
    if not dados.get("access_token"):
        return _item(
            "GitHub", "quebrado", "Arquivo existe mas não tem 'access_token'.",
            acao="Rode 'python -m scripts.autorizar_github' de novo.",
        )
    return _item("GitHub", "ok", "Autorizado.")


def _checar_orcamento() -> dict:
    gasto = resolver_tick.orcamento_gasto_hoje()
    teto = settings.orcamento_diario_usd
    disponivel = max(0.0, teto - gasto)
    fracao = (gasto / teto) if teto else 0.0

    if disponivel <= 0:
        return _item(
            "Orçamento do dia", "quebrado",
            f"Esgotado — US$ {gasto:.4f} de US$ {teto:.2f}.",
            acao="O escritório para de trabalhar até amanhã. Suba orcamento_diario_usd se precisar de mais hoje.",
        )
    if fracao >= _FRACAO_ORCAMENTO_ATENCAO:
        return _item(
            "Orçamento do dia", "atencao",
            f"US$ {gasto:.4f} de US$ {teto:.2f} ({fracao * 100:.0f}%).",
            acao="Perto do teto — o que sobra dá pra poucas ações.",
        )
    return _item("Orçamento do dia", "ok", f"US$ {gasto:.4f} de US$ {teto:.2f} ({fracao * 100:.0f}%).")


def _checar_erros_recentes() -> dict:
    """Falhas registradas em `tick_execucoes` — o dado que só passou a
    existir quando toda chamada de LLM virou uma linha ali."""
    try:
        rows = executar_query("tick_execucoes:ultimos_erros", params=(5,))
    except Exception as exc:
        return _item("Falhas recentes", "quebrado", f"Não consegui ler tick_execucoes: {exc}")

    if not rows:
        return _item("Falhas recentes", "ok", "Nenhuma falha registrada.")

    ultima = rows[0]
    return _item(
        "Falhas recentes", "atencao",
        f"{len(rows)} falha(s) — a última na {ultima['agente_nome']}: {(ultima['erro'] or '')[:120]}",
        acao="Veja o detalhe na lista de execuções.",
    )


def obter_saude() -> dict:
    """Fotografia da saúde do escritório. Determinística e barata —
    pode ser chamada a cada tick e a cada abertura de painel."""
    itens = [
        _checar_banco(),
        _checar_orcamento(),
        _checar_openai(),
        _checar_google(),
        _checar_github(),
        _checar_erros_recentes(),
    ]

    # o pior status manda: um item quebrado não pode ficar escondido
    # atrás de cinco itens ok
    if any(i["status"] == "quebrado" for i in itens):
        geral = "quebrado"
    elif any(i["status"] == "atencao" for i in itens):
        geral = "atencao"
    else:
        geral = "ok"

    return {"status_geral": geral, "itens": itens}


def obter_metricas(dias: int = 1) -> dict:
    """Custo e uso a partir de `tick_execucoes`. `dias=1` é hoje."""
    inicio = _inicio_do_dia_real() - timedelta(days=max(0, dias - 1))

    resumo_rows = executar_query("tick_execucoes:resumo_desde", params=(inicio,))
    resumo = dict(resumo_rows[0]) if resumo_rows else {}
    por_agente = [dict(r) for r in executar_query("tick_execucoes:custo_por_agente_desde", params=(inicio,))]
    erros = [dict(r) for r in executar_query("tick_execucoes:ultimos_erros", params=(10,))]

    chamadas = int(resumo.get("chamadas") or 0)
    custo = float(resumo.get("custo_usd") or 0)
    n_erros = int(resumo.get("erros") or 0)

    return {
        "desde": inicio.isoformat(),
        "dias": dias,
        "chamadas": chamadas,
        "ticks_com_gasto": int(resumo.get("ticks_com_gasto") or 0),
        "custo_usd": round(custo, 6),
        "erros": n_erros,
        # taxa de sucesso é o indicador de CONFIABILIDADE da Parte 5 do
        # roteiro da Sprint 2 — sem chamada nenhuma, 100% (não há falha)
        "taxa_sucesso": round((chamadas - n_erros) / chamadas, 4) if chamadas else 1.0,
        "custo_medio_por_chamada": round(custo / chamadas, 6) if chamadas else 0.0,
        "orcamento_diario_usd": settings.orcamento_diario_usd,
        "por_agente": [
            {
                "agente_id": r["agente_id"],
                "agente_nome": r["agente_nome"],
                "especialidade": r["especialidade"],
                "chamadas": int(r["chamadas"]),
                "custo_usd": round(float(r["custo_usd"]), 6),
                "tokens_in": int(r["tokens_in"]),
                "tokens_out": int(r["tokens_out"]),
                "erros": int(r["erros"]),
            }
            for r in por_agente
        ],
        "ultimos_erros": [
            {
                "id": r["id"],
                "tick": r["tick"],
                "agente_nome": r["agente_nome"],
                "modelo": r["modelo"],
                "erro": r["erro"],
                "criado_em": r["criado_em"].isoformat() if r["criado_em"] else None,
            }
            for r in erros
        ],
    }
