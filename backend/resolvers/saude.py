"""Orquestra o domínio de Saúde: perfil, peso, hidratação, sono, atividade
física, refeições (com estimativa de macro via LLM), ficha de treino, plano
de dieta e relatório semanal.

Diferente do Agenda, aqui não existe roteamento por texto livre nem gate de
confirmação humana: cada ação já é um endpoint dedicado (forms, não chat),
e toda escrita mexe só no nosso próprio banco — nunca um sistema externo —
então não existe a mesma razão de ser pra pedir confirmação antes de salvar
(ver conversa de design do agente). Só quatro ações passam pelo LLM: estimar
macro de refeição (foto ou texto), gerar plano de dieta e gerar relatório
semanal — todo o resto é escrita determinística direta, sem custo de token.
"""
import base64
import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from agents.saude import agente as agente_saude
from config import settings
from utils.query_executor import executar_query

_DIAS_SEMANA = ("segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo")


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone_padrao))


def _hoje() -> date:
    return _agora().date()


def _idade_anos(data_nascimento: date) -> int:
    hoje = _hoje()
    idade = hoje.year - data_nascimento.year
    if (hoje.month, hoje.day) < (data_nascimento.month, data_nascimento.day):
        idade -= 1
    return idade


def _inicio_do_dia(dia: date) -> datetime:
    return datetime.combine(dia, datetime.min.time(), tzinfo=ZoneInfo(settings.timezone_padrao))


def _inicio_semana(referencia: date | None = None) -> date:
    referencia = referencia or _hoje()
    return referencia - timedelta(days=referencia.weekday())  # segunda-feira da semana


# --------------------------------------------------------------------------
# Perfil
# --------------------------------------------------------------------------

def _perfil_bruto() -> dict | None:
    rows = executar_query("perfil_saude:buscar")
    return rows[0] if rows else None


def perfil_existe() -> bool:
    return _perfil_bruto() is not None


def obter_perfil() -> dict | None:
    return _perfil_bruto()


def salvar_perfil(dados: dict) -> dict:
    rows = executar_query(
        "perfil_saude:upsert",
        returning=True,
        params=(
            dados["nome"],
            dados["sexo"],
            dados["data_nascimento"],
            dados["altura_cm"],
            dados["objetivo"],
            dados["tem_diabetes"],
            dados.get("restricoes_alimentares"),
        ),
    )
    return rows[0]


def _perfil_contexto() -> dict:
    """Perfil formatado como contexto pra LLM — inclui a idade calculada a
    partir da data de nascimento (nunca um número fixo, que ficaria errado
    com o tempo) e o peso mais recente (peso não mora no perfil, mora em
    peso_historico — evita guardar a mesma informação em dois lugares)."""
    perfil = _perfil_bruto()
    if not perfil:
        raise RuntimeError("Perfil de saúde ainda não configurado — complete a entrevista inicial primeiro.")

    peso_rows = executar_query("peso_historico:mais_recente")
    peso_atual = float(peso_rows[0]["peso_kg"]) if peso_rows else None

    return {
        "nome": perfil["nome"],
        "sexo": perfil["sexo"],
        "idade": _idade_anos(perfil["data_nascimento"]),
        "altura_cm": perfil["altura_cm"],
        "peso_kg_atual": peso_atual,
        "objetivo": perfil["objetivo"],
        "tem_diabetes": perfil["tem_diabetes"],
        "restricoes_alimentares": perfil["restricoes_alimentares"],
    }


# --------------------------------------------------------------------------
# Registros determinísticos — sem LLM
# --------------------------------------------------------------------------

def registrar_peso(peso_kg: float) -> dict:
    rows = executar_query("peso_historico:inserir", returning=True, params=(peso_kg,))
    return rows[0]


def registrar_hidratacao(quantidade_ml: int) -> dict:
    rows = executar_query("hidratacao_historico:inserir", returning=True, params=(quantidade_ml,))
    return rows[0]


def registrar_sono(horas: float, qualidade: str | None, data_referencia: date | None) -> dict:
    rows = executar_query(
        "sono_historico:inserir",
        returning=True,
        params=(horas, qualidade, data_referencia or _hoje()),
    )
    return rows[0]


def registrar_atividade(tipo: str, duracao_min: int, observacao: str | None) -> dict:
    rows = executar_query(
        "atividades_fisicas:inserir",
        returning=True,
        params=(tipo, duracao_min, observacao),
    )
    return rows[0]


# --------------------------------------------------------------------------
# Refeições — únicas ações de REGISTRO que passam pelo LLM
# --------------------------------------------------------------------------

def _salvar_refeicao(tipo_refeicao: str, origem: str, descricao: str, imagem_path: str | None, resultado: dict) -> dict:
    """Só chega aqui depois que a estimativa (chamada + validação de schema
    + checagem de consistência) já deu certo — nunca existe refeição
    gravada pela metade. Se `agente_saude` levantou RuntimeError/ValueError
    antes, esse erro propaga e nada é inserido no banco."""
    estimativa = resultado["dado"]
    rows = executar_query(
        "refeicoes:inserir",
        returning=True,
        params=(
            tipo_refeicao,
            origem,
            descricao,
            imagem_path,
            estimativa.calorias,
            estimativa.carboidratos_g,
            estimativa.proteinas_g,
            estimativa.gorduras_g,
            estimativa.confianca,
            resultado["modelo"],
            resultado["tokens_in"],
            resultado["tokens_out"],
            resultado["custo_usd"],
        ),
    )
    return rows[0]


async def registrar_refeicao_texto(tipo_refeicao: str, descricao: str) -> dict:
    perfil = _perfil_contexto()
    resultado = await agente_saude.estimar_macros_texto(descricao, tipo_refeicao, perfil)
    return _salvar_refeicao(tipo_refeicao, "texto", descricao, None, resultado)


async def registrar_refeicao_foto(
    tipo_refeicao: str, imagem_bytes: bytes, content_type: str, legenda: str | None = None
) -> dict:
    perfil = _perfil_contexto()
    imagem_base64 = base64.b64encode(imagem_bytes).decode("utf-8")
    resultado = await agente_saude.estimar_macros_foto(imagem_base64, content_type, tipo_refeicao, perfil)
    descricao = legenda or "Foto de refeição"
    return _salvar_refeicao(tipo_refeicao, "foto", descricao, None, resultado)


# --------------------------------------------------------------------------
# Ficha de treino — cadastrada pelo próprio chefe, sem LLM (fase 2 do
# domínio: o agente sugerir/montar sozinho fica pra depois)
# --------------------------------------------------------------------------

def obter_ficha_treino() -> list[dict]:
    dias = executar_query("ficha_treino:listar_dias_ativos")
    resultado = []
    for dia in dias:
        exercicios = executar_query("ficha_treino:listar_exercicios_por_dia", params=(dia["id"],))
        resultado.append({**dia, "exercicios": exercicios})
    return resultado


def salvar_ficha_treino(dias: list[dict]) -> list[dict]:
    """Substitui a ficha inteira. Não apaga histórico: o dia antigo é
    desativado (ativo=false) em vez de removido, o novo entra como uma
    linha nova — os exercícios antigos continuam ligados à linha antiga,
    dá pra auditar depois o que você treinava há meses (decisão de design:
    manter histórico de ficha de treino e plano de dieta)."""
    dias_informados = {d["dia_semana"] for d in dias}
    for dia_semana in _DIAS_SEMANA:
        if dia_semana not in dias_informados:
            executar_query("ficha_treino:desativar_dia", commit=True, params=(dia_semana,))

    for dia in dias:
        executar_query("ficha_treino:desativar_dia", commit=True, params=(dia["dia_semana"],))
        linha = executar_query(
            "ficha_treino:inserir_dia",
            returning=True,
            params=(dia["dia_semana"], dia["grupo_muscular"]),
        )[0]
        for ordem, exercicio in enumerate(dia["exercicios"]):
            executar_query(
                "ficha_treino:inserir_exercicio",
                returning=True,
                params=(linha["id"], exercicio["nome_exercicio"], exercicio["series"], exercicio["repeticoes"], ordem),
            )

    return obter_ficha_treino()


# --------------------------------------------------------------------------
# Plano de dieta — gerado pelo LLM a partir do perfil
# --------------------------------------------------------------------------

async def gerar_plano_dieta() -> dict:
    perfil = _perfil_contexto()
    resultado = await agente_saude.gerar_plano_dieta(perfil)
    plano = resultado["dado"]

    executar_query("planos_dieta:desativar_todos", commit=True)
    rows = executar_query(
        "planos_dieta:inserir",
        returning=True,
        params=(
            plano.meta_calorica,
            plano.carboidratos_g,
            plano.proteinas_g,
            plano.gorduras_g,
            plano.orientacoes,
            resultado["modelo"],
            resultado["tokens_in"],
            resultado["tokens_out"],
            resultado["custo_usd"],
        ),
    )
    return rows[0]


def obter_plano_dieta_atual() -> dict | None:
    rows = executar_query("planos_dieta:buscar_ativo")
    return rows[0] if rows else None


# --------------------------------------------------------------------------
# Relatório semanal — a trava de "um por semana" é checada ANTES de chamar
# o LLM (nunca gasta token pra depois descobrir que já existe); o UNIQUE em
# `semana_inicio` no banco é só o backstop, não o mecanismo principal.
# --------------------------------------------------------------------------

def obter_relatorio_semana_atual() -> dict | None:
    rows = executar_query("relatorios_saude:buscar_por_semana", params=(_inicio_semana(),))
    return rows[0]["relatorio"] if rows else None


def _calcular_dados_semana(inicio_semana: date) -> dict:
    inicio_dt = _inicio_do_dia(inicio_semana)

    refeicoes = executar_query("refeicoes:historico", params=(inicio_dt,))
    pesos = executar_query("peso_historico:historico", params=(inicio_dt,))
    atividades = executar_query("atividades_fisicas:historico", params=(inicio_dt,))
    sono = executar_query("sono_historico:historico", params=(inicio_semana,))
    hidratacao_total = executar_query("hidratacao_historico:total_periodo", params=(inicio_dt,))[0]["total_ml"]
    plano_ativo = obter_plano_dieta_atual()

    # Pré-calculado aqui, não deixado pra LLM inferir: `meta_calorica` do
    # plano é uma meta DIÁRIA, mas `refeicoes` cobre a semana inteira —
    # sem uma média diária pronta, a LLM comparava o total bruto da semana
    # direto com a meta diária (unidades de tempo diferentes), o que já
    # gerou uma conclusão sem sentido num teste real.
    dias_com_refeicao = len({
        r["registrado_em"].astimezone(ZoneInfo(settings.timezone_padrao)).date() for r in refeicoes
    })
    calorias_totais_semana = sum(float(r["calorias"]) for r in refeicoes)
    media_calorica_diaria = (
        round(calorias_totais_semana / dias_com_refeicao, 1) if dias_com_refeicao else None
    )

    return {
        "semana_inicio": inicio_semana.isoformat(),
        "refeicoes": [dict(r) for r in refeicoes],
        "dias_com_refeicao_registrada": dias_com_refeicao,
        "calorias_totais_semana": round(calorias_totais_semana, 1),
        "media_calorica_diaria": media_calorica_diaria,
        "peso_historico": [dict(p) for p in pesos],
        "peso_registros_na_semana": len(pesos),
        "atividades": [dict(a) for a in atividades],
        "sono": [dict(s) for s in sono],
        "hidratacao_total_ml": hidratacao_total,
        "plano_dieta_ativo": plano_ativo,
    }


async def gerar_relatorio_semanal(inicio_semana: date | None = None) -> dict:
    """`inicio_semana` (segunda-feira) opcional — sem ele, gera o da
    semana atual (uso manual pelo chefe). A proatividade do Vita passa
    uma semana JÁ FECHADA explícita (ver `resolvers/interacao.py`)."""
    inicio_semana = inicio_semana or _inicio_semana()

    existente = executar_query("relatorios_saude:buscar_por_semana", params=(inicio_semana,))
    if existente:
        raise ValueError(
            f"Já existe relatório pra semana de {inicio_semana.isoformat()} — "
            "só é possível gerar um novo depois que essa semana terminar."
        )

    dados_semana = _calcular_dados_semana(inicio_semana)
    resultado = await agente_saude.gerar_relatorio_semanal(dados_semana)

    relatorio_completo = {**dados_semana, "analise": resultado["dado"].model_dump()}

    rows = executar_query(
        "relatorios_saude:inserir",
        returning=True,
        params=(
            inicio_semana,
            json.dumps(relatorio_completo, default=str),
            resultado["modelo"],
            resultado["tokens_in"],
            resultado["tokens_out"],
            resultado["custo_usd"],
        ),
    )
    return rows[0]["relatorio"]


# --------------------------------------------------------------------------
# Dashboard — KPIs ao vivo, sem LLM (mesmo espírito do dashboard do
# Financeiro: nunca cachear algo tão barato de agregar)
# --------------------------------------------------------------------------

def obter_dashboard() -> dict:
    inicio_hoje = _inicio_do_dia(_hoje())
    inicio_semana_dt = _inicio_do_dia(_inicio_semana())

    peso_recente = executar_query("peso_historico:mais_recente")
    totais_hoje = executar_query("refeicoes:total_periodo", params=(inicio_hoje,))[0]
    hidratacao_hoje = executar_query("hidratacao_historico:total_periodo", params=(inicio_hoje,))[0]["total_ml"]
    atividades_semana = executar_query("atividades_fisicas:historico", params=(inicio_semana_dt,))

    return {
        "peso_atual": float(peso_recente[0]["peso_kg"]) if peso_recente else None,
        "refeicoes_hoje": {
            "calorias": float(totais_hoje["calorias"]),
            "carboidratos_g": float(totais_hoje["carboidratos_g"]),
            "proteinas_g": float(totais_hoje["proteinas_g"]),
            "gorduras_g": float(totais_hoje["gorduras_g"]),
        },
        "hidratacao_hoje_ml": hidratacao_hoje,
        "atividades_na_semana": len(atividades_semana),
    }


# --------------------------------------------------------------------------
# Histórico (leitura do que foi registrado)
# --------------------------------------------------------------------------
def obter_historico(dias: int = 14, limite: int = 200) -> dict:
    """Tudo o que foi registrado nos últimos `dias` (hoje conta como o 1º), mais recente primeiro.

    Só leitura e sem LLM. Cada lista tem teto (`limite`): água pode ter dezenas de registros por dia e
    uma tela não precisa de todos. Modelo/tokens/custo ficam de fora (RNF02): as queries `recentes` nem
    selecionam essas colunas."""
    inicio = _hoje() - timedelta(days=dias - 1)
    desde = _inicio_do_dia(inicio)

    def iso(v: datetime | None) -> str | None:
        return v.isoformat() if v else None

    return {
        "dias": dias,
        "refeicoes": [
            {
                "id": r["id"],
                "tipo_refeicao": r["tipo_refeicao"],
                "origem": r["origem"],
                "descricao": r["descricao"],
                "calorias": float(r["calorias"]),
                "carboidratos_g": float(r["carboidratos_g"]),
                "proteinas_g": float(r["proteinas_g"]),
                "gorduras_g": float(r["gorduras_g"]),
                "confianca_estimativa": r["confianca_estimativa"],
                "registrado_em": iso(r["registrado_em"]),
            }
            for r in executar_query("refeicoes:recentes", params=(desde, limite))
        ],
        "sono": [
            {
                "id": r["id"],
                "horas": float(r["horas"]),
                "qualidade": r["qualidade"],
                "data_referencia": r["data_referencia"].isoformat(),
            }
            for r in executar_query("sono_historico:recentes", params=(inicio, limite))
        ],
        "atividades": [
            {
                "id": r["id"],
                "tipo": r["tipo"],
                "duracao_min": r["duracao_min"],
                "observacao": r["observacao"],
                "registrado_em": iso(r["registrado_em"]),
            }
            for r in executar_query("atividades_fisicas:recentes", params=(desde, limite))
        ],
        "peso": [
            {"id": r["id"], "peso_kg": float(r["peso_kg"]), "registrado_em": iso(r["registrado_em"])}
            for r in executar_query("peso_historico:recentes", params=(desde, limite))
        ],
        "hidratacao": [
            {"id": r["id"], "quantidade_ml": r["quantidade_ml"], "registrado_em": iso(r["registrado_em"])}
            for r in executar_query("hidratacao_historico:recentes", params=(desde, limite))
        ],
    }
