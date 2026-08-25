"""Motor de interação — Etapas 2 (social) e 3 (proatividade de
trabalho) do motor de tick. Toda a decisão de SE um agente tem motivo
de trabalho, QUEM tenta puxar assunto social, COM QUEM fala e SE existe
orçamento pra isso é resolvida de forma determinística (aritmética
pura, sem custo) ANTES de qualquer chamada de LLM — mesma disciplina
"check before you spend" do resto do hub.

Fluxo por rodada (chamada manual, sempre depois de `tick/avancar`),
por colaborador ativo:
1. Checa orçamento diário disponível — zero, encerra a rodada inteira
   sem gastar nada.
2. Trabalho tem prioridade: se o agente tem um motivo determinístico de
   proatividade no próprio domínio (hoje só o Norte, estagnação de
   projeto) e ainda não bateu o teto diário de avisos, usa o turno do
   tick pra isso — gera a ação real (ex: novo card) e avisa o chefe com
   uma mensagem tipo='trabalho', template determinístico (sem LLM
   extra pra escrever a frase).
3. Só quem NÃO tem motivo de trabalho (ou já bateu o teto) entra na
   disputa social: sorteia (ponderado por extroversão + tempo parado)
   se tenta puxar papo. Se sim, e tiver uma mensagem social recebida
   sem resposta ainda, responde a mais antiga primeiro — sem sorteio
   nesse caso, é prioridade garantida (o cooldown que já empurra a
   chance de falar é o que garante que ele eventualmente vai resolver
   isso, nenhuma fórmula de probabilidade nova). Sem pendência, sorteia
   (ponderado pela afinidade, nunca 100% garantido) com quem fala — o
   chefe também é candidato a receber papo social, nunca a puxar. Rate
   limit por par também se aplica aqui (inclusive pra responder).

`dry_run=True` calcula tudo (quem trabalharia/falaria, com quem/sobre
o quê) sem executar ação real nem persistir nada — mesmo espírito do
dry_run da Etapa 1.
"""
import random
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from agents.interacao import agente as agente_interacao
from config import settings
from resolvers import financeiro as resolver_financeiro
from resolvers import norte as resolver_norte
from resolvers import saude as resolver_saude
from resolvers import tick as resolver_tick
from utils.query_executor import executar_query

_ESTADO_FALANDO = "falando"
_ESTADO_EXECUTANDO = "executando"

_DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]


def _inicio_do_dia_real() -> datetime:
    hoje = datetime.now(ZoneInfo(settings.timezone_padrao)).date()
    return datetime.combine(hoje, datetime.min.time(), tzinfo=ZoneInfo(settings.timezone_padrao))


def _periodo_do_dia(hora: int) -> str:
    if hora < 6:
        return "madrugada"
    if hora < 12:
        return "manhã"
    if hora < 18:
        return "tarde"
    return "noite"


def _fato_do_dia(hora_simulada: datetime) -> str:
    """Derivado do relógio SIMULADO (`ticks.hora_simulada`), não da data
    real — garante consistência entre agentes no mesmo tick (é sempre o
    mesmo valor calculado, nunca sorteado) sem depender de nenhuma
    entrada de calendário no pool de `eventos_mundo` (achado testando de
    verdade: um tick podia sortear "sextou" e outro "segunda-feira" no
    mesmo dia real — ver docs/backlog-futuro.md pro calendário fictício
    completo, adiado pra próxima sprint)."""
    dia_semana = _DIAS_SEMANA[hora_simulada.weekday()]
    fim_de_semana = " (fim de semana)" if hora_simulada.weekday() >= 5 else ""
    periodo = _periodo_do_dia(hora_simulada.hour)
    return f"No escritório, hoje é {dia_semana}{fim_de_semana}, período da {periodo}."


def _chance_falar(extroversao: int, ticks_parado: int) -> float:
    chance = (
        (extroversao / 10) * settings.interacao_peso_extroversao
        + ticks_parado * settings.interacao_incremento_cooldown
    )
    return min(settings.interacao_chance_falar_max, max(0.0, chance))


def _peso_destinatario(afinidade: int) -> float:
    peso = 1 + (afinidade / 100) * settings.interacao_peso_afinidade_max
    return max(settings.interacao_peso_minimo, peso)


def _delta_afinidade(afinidade_atual: int) -> float:
    return settings.interacao_afinidade_incremento_max * (1 - afinidade_atual / 100)


def _ticks_parado(agente_id: int, numero_tick: int) -> int:
    rows = executar_query("mensagens:ultimo_tick_social_do_agente", params=(agente_id,))
    if not rows:
        return numero_tick
    return max(0, numero_tick - rows[0]["tick"])


def _par_disponivel(agente_a_id: int, agente_b_id: int) -> bool:
    inicio = _inicio_do_dia_real()
    rows = executar_query(
        "mensagens:contar_sociais_do_par_hoje",
        params=(agente_a_id, agente_b_id, agente_b_id, agente_a_id, inicio),
    )
    return rows[0]["total"] < settings.interacao_rate_limit_par_por_dia


def _buscar_pendente(agente_id: int) -> dict | None:
    """Mensagem social mais antiga recebida por esse agente que ainda
    não teve resposta. Responder pendência tem prioridade sobre
    sortear um destinatário novo — nenhuma fórmula de probabilidade
    nova pra isso, o cooldown que já empurra `chance_falar` garante que
    o agente eventualmente vai querer falar de novo e resolver isso."""
    rows = executar_query("mensagens:buscar_pendente_mais_antiga_para", params=(agente_id,))
    return rows[0] if rows else None


def _escolher_destinatario(agente_id: int, colaboradores: list[dict]) -> dict | None:
    afinidades = {
        r["alvo_agente_id"]: r["afinidade"]
        for r in executar_query("relacionamentos:listar_afinidades_de", params=(agente_id,))
    }
    elegiveis = [c for c in colaboradores if c["id"] != agente_id and _par_disponivel(agente_id, c["id"])]
    if not elegiveis:
        return None
    pesos = [_peso_destinatario(afinidades.get(c["id"], 0)) for c in elegiveis]
    return random.choices(elegiveis, weights=pesos, k=1)[0]


def _sortear_evento_mundo() -> dict | None:
    rows = executar_query("eventos_mundo:sortear_menos_usado")
    return rows[0] if rows else None


def _historico_do_par(agente_a_id: int, agente_b_id: int) -> list[dict]:
    return executar_query(
        "mensagens:ultimas_do_par",
        params=(agente_a_id, agente_b_id, agente_b_id, agente_a_id, settings.interacao_historico_mensagens_par),
    )


def _atualizar_afinidade(agente_id: int, alvo_id: int) -> None:
    rows = executar_query("relacionamentos:buscar_por_par", params=(agente_id, alvo_id))
    afinidade_atual = rows[0]["afinidade"] if rows else 0
    nova = afinidade_atual + _delta_afinidade(afinidade_atual)
    nova = max(-100, min(100, round(nova)))
    executar_query("relacionamentos:atualizar_afinidade", commit=True, params=(nova, agente_id, alvo_id))


def _pode_trabalho_hoje(agente_id: int) -> bool:
    inicio = _inicio_do_dia_real()
    rows = executar_query("mensagens:contar_trabalho_do_agente_hoje", params=(agente_id, inicio))
    return rows[0]["total"] < settings.interacao_rate_limit_trabalho_por_dia


_MESES_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _nome_mes(mes: date) -> str:
    return f"{_MESES_PT[mes.month - 1]}/{mes.year}"


def _meia_noite(d: date) -> datetime:
    return datetime.combine(d, datetime.min.time(), tzinfo=ZoneInfo(settings.timezone_padrao))


def _formatar_horario(inicio_iso: str) -> str:
    if "T" not in inicio_iso:
        return "dia todo"  # evento de dia inteiro (só data, sem hora)
    try:
        return datetime.fromisoformat(inicio_iso).strftime("%H:%M")
    except ValueError:
        return inicio_iso


# ---------------------------------------------------------------------------
# Handlers de proatividade de trabalho (Sabor A — "alerta/ação proativa").
# Cada especialidade que tem gatilho registra um dict com três funções:
#   checar(agente) -> contexto (dict) se há motivo AGORA, ou None.
#                  Determinístico, sem LLM — é o "check before you spend".
#                  Recebe o agente (alguns gatilhos dependem do próprio id,
#                  ex: Agenda checa se já mandou o resumo do dia). Pode
#                  levantar exceção (ex: Agenda com token do Google fora) —
#                  o tick trata como "sem trabalho" e cai pro social.
#   descrever(ctx) -> str curto do motivo (usado no dry_run, sem executar).
#   executar(ctx)  -> async; faz a ação real (gera relatório/card/etc.) e
#                  devolve a mensagem de aviso pro chefe (template
#                  determinístico).
# Adicionar um agente novo é só plugar um handler aqui — a lógica central do
# tick não muda. Agentes sem handler nunca disparam trabalho.
# ---------------------------------------------------------------------------

def _checar_norte(agente: dict) -> dict | None:
    limite = datetime.now(ZoneInfo(settings.timezone_padrao)) - timedelta(
        days=settings.interacao_dias_estagnacao_norte
    )
    rows = executar_query("projetos:listar_estagnados", params=(limite,))
    if not rows:
        return None
    projeto = rows[0]
    dias_parado = (datetime.now(ZoneInfo(settings.timezone_padrao)) - projeto["referencia_tempo_parado"]).days
    return {"projeto": projeto, "dias_parado": dias_parado}


def _descrever_norte(ctx: dict) -> str:
    return f"Projeto {ctx['projeto']['nome']} parado há {ctx['dias_parado']} dias sem card ativo."


async def _executar_norte(ctx: dict) -> str:
    card = await resolver_norte.gerar_proximo_card(ctx["projeto"]["id"])
    return (
        f"Projeto {ctx['projeto']['nome']} parado há {ctx['dias_parado']} dias "
        f"sem card ativo — gerei um novo: '{card['titulo']}'."
    )


def _checar_cifra(agente: dict) -> dict | None:
    hoje = datetime.now(ZoneInfo(settings.timezone_padrao)).date()
    rows = executar_query("transacoes:mes_fechado_sem_relatorio", params=(hoje,))
    mes = rows[0]["mes"] if rows else None
    return {"mes": mes} if mes else None


def _descrever_cifra(ctx: dict) -> str:
    return f"Relatório de {_nome_mes(ctx['mes'])} ainda não foi fechado."


async def _executar_cifra(ctx: dict) -> str:
    relatorio = await resolver_financeiro.gerar_relatorio(ctx["mes"])
    kpis = relatorio["kpis"]
    return (
        f"Fechei o relatório de {_nome_mes(ctx['mes'])} — "
        f"gastos R$ {kpis['gasto_mensal']:.2f}, ganhos R$ {kpis['ganho_mensal']:.2f}."
    )


def _checar_vita(agente: dict) -> dict | None:
    hoje = datetime.now(ZoneInfo(settings.timezone_padrao)).date()
    rows = executar_query(
        "refeicoes:semana_fechada_sem_relatorio", params=(settings.timezone_padrao, hoje)
    )
    semana = rows[0]["semana"] if rows else None
    return {"semana": semana} if semana else None


def _descrever_vita(ctx: dict) -> str:
    return f"Relatório da semana de {ctx['semana'].strftime('%d/%m')} ainda não foi fechado."


async def _executar_vita(ctx: dict) -> str:
    relatorio = await resolver_saude.gerar_relatorio_semanal(ctx["semana"])
    dias = relatorio.get("dias_com_refeicao_registrada", 0)
    return (
        f"Fechei o relatório da semana de {ctx['semana'].strftime('%d/%m')} — "
        f"{dias} dia(s) com refeição registrada."
    )


def _checar_agenda(agente: dict) -> dict | None:
    # Uma vez por dia real: se a Agenda já mandou algo de trabalho hoje
    # (o resumo diário é a única coisa que ela manda como trabalho), não
    # repete — anti-repetição sem tabela nova, reaproveitando o mesmo
    # contador do teto diário.
    inicio = _inicio_do_dia_real()
    ja_enviou = executar_query(
        "mensagens:contar_trabalho_do_agente_hoje", params=(agente["id"], inicio)
    )[0]["total"]
    if ja_enviou > 0:
        return None

    # Leitura do Calendar aqui (não no executar) de propósito: se o token
    # do Google estiver fora, isto levanta exceção, o tick trata como
    # "sem trabalho" e a Agenda cai pro social — em vez de ficar presa
    # tentando o dia todo. Calendário vazio NÃO é erro (vira "bora
    # descansar").
    from agents.agenda import google_calendar

    hoje = datetime.now(ZoneInfo(settings.timezone_padrao)).date()
    eventos = google_calendar.resumir_eventos(
        google_calendar.listar_eventos(_meia_noite(hoje).isoformat(), _meia_noite(hoje + timedelta(days=1)).isoformat())
    )
    return {"eventos": eventos}


def _descrever_agenda(ctx: dict) -> str:
    return f"Resumo da agenda de hoje ainda não enviado ({len(ctx['eventos'])} compromisso(s))."


async def _executar_agenda(ctx: dict) -> str:
    eventos = ctx["eventos"]
    if not eventos:
        return "Nenhum compromisso para hoje, bora descansar!"
    linhas = [f"{_formatar_horario(e['inicio'])} — {e['titulo']}" for e in eventos]
    return "Compromissos de hoje:\n" + "\n".join(linhas)


_SEM_PROBLEMA = "Tudo normalizado na sala de máquinas."


def _texto_do_aviso(problemas: list[dict]) -> str:
    """Texto derivado DETERMINISTICAMENTE da lista de problemas — é o que
    faz a comparação com o último aviso funcionar como detector de
    mudança de estado (mesmo problema → mesmo texto → não repete)."""
    if not problemas:
        return _SEM_PROBLEMA
    linhas = []
    for p in problemas:
        marca = "✕" if p["status"] == "quebrado" else "!"
        linha = f"{marca} {p['nome']}: {p['detalhe']}"
        if p.get("acao"):
            linha += f"\n   → {p['acao']}"
        linhas.append(linha)
    return "Da sala de máquinas:\n" + "\n".join(linhas)


def _checar_infra(agente: dict) -> dict | None:
    """Motriz — o único handler que NÃO gasta LLM nenhum (nem no `executar`).

    Por isso ele é checado em todo tick sem consultar orçamento, e
    continua funcionando com o orçamento estourado — que é exatamente
    quando um aviso de infra mais importa.

    Só devolve trabalho quando o estado MUDA: se a situação é a mesma do
    último aviso, fica quieto. Sem isso, um token vencido viraria a
    mesma mensagem em todo tick até alguém consertar, e em dois dias o
    chefe teria aprendido a não ler o Motriz."""
    from resolvers import infra as resolver_infra

    saude = resolver_infra.obter_saude()
    problemas = [i for i in saude["itens"] if i["status"] in ("quebrado", "atencao")]
    texto = _texto_do_aviso(problemas)

    rows = executar_query("mensagens:ultimo_trabalho_do_agente", params=(agente["id"],))
    ultimo = rows[0]["conteudo"] if rows else None

    if texto == ultimo:
        return None
    # nada quebrado e nunca avisou nada: não existe "voltou ao normal"
    # de um problema que nunca houve
    if not problemas and ultimo is None:
        return None

    return {"texto": texto, "problemas": problemas}


def _descrever_infra(ctx: dict) -> str:
    if not ctx["problemas"]:
        return "Infra voltou ao normal."
    nomes = ", ".join(p["nome"] for p in ctx["problemas"])
    return f"{len(ctx['problemas'])} ponto(s) de atenção na infra: {nomes}."


async def _executar_infra(ctx: dict) -> str:
    # `async` só pra casar com a assinatura dos outros handlers — não há
    # nada pra esperar aqui, o texto já veio pronto do `checar`
    return ctx["texto"]


# `custa_llm` diz se o `executar` daquele handler chama modelo. É o que
# permite o Motriz continuar rodando com o orçamento estourado: o teto
# bloqueia o que gasta, não o que só lê arquivo e faz subtração. A
# Agenda é o único caso de trabalho que já não custava (só lê e formata
# o Calendar), mas a LEITURA dela bate em API externa — por isso fica
# marcada como custosa mesmo assim, e para junto quando o teto estoura.
_HANDLERS_TRABALHO = {
    "norte": {"checar": _checar_norte, "descrever": _descrever_norte, "executar": _executar_norte, "custa_llm": True},
    "financeiro": {"checar": _checar_cifra, "descrever": _descrever_cifra, "executar": _executar_cifra, "custa_llm": True},
    "saude": {"checar": _checar_vita, "descrever": _descrever_vita, "executar": _executar_vita, "custa_llm": True},
    "agenda": {"checar": _checar_agenda, "descrever": _descrever_agenda, "executar": _executar_agenda, "custa_llm": True},
    "infra": {"checar": _checar_infra, "descrever": _descrever_infra, "executar": _executar_infra, "custa_llm": False},
}


async def processar_tick_completo(dry_run: bool = False) -> dict:
    tick_atual = resolver_tick.obter_tick_atual()
    if tick_atual is None:
        raise ValueError(
            "Nenhum tick rodou ainda — avance o relógio (POST /tick/avancar) antes de processar interação."
        )
    numero_tick = tick_atual["numero"]

    resultado = {"tick": numero_tick, "dry_run": dry_run, "interacoes": []}

    orcamento_disponivel = resolver_tick.orcamento_disponivel_hoje()
    resultado["orcamento_disponivel_hoje"] = round(orcamento_disponivel, 6)
    # Orçamento esgotado NÃO encerra mais a rodada inteira: os handlers
    # que não gastam LLM (hoje o Motriz) continuam rodando, porque é
    # exatamente com o teto estourado que um aviso de infra mais serve —
    # é ele que vai dizer POR QUE o escritório ficou quieto. O que fica
    # bloqueado é tudo que custa: trabalho com LLM e papo social.
    sem_orcamento = orcamento_disponivel <= 0
    if sem_orcamento:
        resultado["aviso"] = (
            "Orçamento diário esgotado — só o que não gasta LLM rodou neste tick."
        )

    colaboradores = executar_query("agentes:listar_colaboradores_ativos")
    if not colaboradores:
        resultado["aviso"] = "Nenhum colaborador ativo."
        return resultado

    chefe_rows = executar_query("agentes:buscar_chefe")
    chefe = chefe_rows[0] if chefe_rows else None
    # Social precisa de pelo menos 2 colaboradores pra ter com quem falar,
    # mas trabalho não — um único colaborador ativo ainda pode ser
    # proativo no próprio domínio (ex: só o Norte ativo).
    permite_social = len(colaboradores) >= 2
    # O chefe é candidato a RECEBER papo social (deixa mais imersivo — um
    # "bom dia" ocasional, por exemplo), mas nunca ELEGE falar — ele não é
    # simulado, é o chefe de verdade. Por isso entra só no pool de
    # destinatários, nunca no loop de `colaboradores` que decide quem tenta.
    candidatos_destinatario = colaboradores + ([chefe] if chefe else [])

    evento = _sortear_evento_mundo()
    evento_usado_neste_tick = False
    fato_do_dia = _fato_do_dia(tick_atual["hora_simulada"])

    for agente in colaboradores:
        entrada = {
            "agente_id": agente["id"],
            "agente_nome": agente["nome"],
            "tipo": None,
            "chance_falar": None,
            "quer_falar": False,
            "destinatario_id": None,
            "destinatario_nome": None,
            "mensagem": None,
        }

        # Trabalho tem prioridade sobre social (combinado na conversa de
        # design da Etapa 3): se o agente tem motivo determinístico de
        # proatividade e ainda não bateu o teto diário, usa o turno pra
        # isso e NUNCA disputa o social nesse mesmo tick. Qual gatilho
        # cada agente tem fica em `_HANDLERS_TRABALHO`.
        handler = _HANDLERS_TRABALHO.get(agente["especialidade"])
        contexto_trabalho = None
        # com o teto estourado, nem checa o que custa: a checagem da
        # Agenda, por exemplo, já bate no Google antes de qualquer coisa
        if handler and not (sem_orcamento and handler["custa_llm"]):
            try:
                contexto_trabalho = handler["checar"](agente)
            except Exception as exc:
                # Checagem de trabalho não pode derrubar o tick — ex:
                # Agenda com o token do Google fora. Registra e segue: o
                # agente cai pro social normalmente neste tick.
                entrada["aviso"] = f"Falha ao checar proatividade de trabalho: {exc}"

        if contexto_trabalho and _pode_trabalho_hoje(agente["id"]):
            entrada["tipo"] = "trabalho"
            entrada["motivo"] = handler["descrever"](contexto_trabalho)
            if not dry_run:
                if chefe is None:
                    entrada["aviso"] = "Sem chefe cadastrado pra receber o aviso."
                else:
                    try:
                        conteudo = await handler["executar"](contexto_trabalho)
                        executar_query(
                            "mensagens:inserir",
                            returning=True,
                            params=(agente["id"], chefe["id"], "trabalho", conteudo, numero_tick, None),
                        )
                        executar_query(
                            "agentes:atualizar_estado", commit=True, params=(_ESTADO_EXECUTANDO, agente["id"])
                        )
                        entrada["destinatario_id"] = chefe["id"]
                        entrada["destinatario_nome"] = chefe["nome"]
                        entrada["mensagem"] = conteudo
                    except Exception as exc:
                        entrada["aviso"] = f"Falha ao executar proatividade de trabalho: {exc}"
            resultado["interacoes"].append(entrada)
            continue

        # social sempre custa LLM (gera a mensagem) — com o teto
        # estourado ninguém puxa papo
        if not permite_social or sem_orcamento:
            resultado["interacoes"].append(entrada)
            continue

        ticks_parado = _ticks_parado(agente["id"], numero_tick)
        chance = _chance_falar(agente["extroversao"], ticks_parado)
        quer_falar = random.random() < chance
        entrada["chance_falar"] = round(chance, 4)
        entrada["quer_falar"] = quer_falar

        if quer_falar:
            entrada["tipo"] = "social"

            # Responder pendência tem prioridade sobre sortear alguém
            # novo — só vale se o par ainda não bateu o rate-limit do
            # dia (a pendência não pula essa fila).
            destinatario = None
            respondendo_a_id = None
            pendente = _buscar_pendente(agente["id"])
            if pendente and _par_disponivel(agente["id"], pendente["remetente_id"]):
                candidato = next(
                    (c for c in candidatos_destinatario if c["id"] == pendente["remetente_id"]), None
                )
                if candidato:
                    destinatario = candidato
                    respondendo_a_id = pendente["id"]

            if destinatario is None:
                destinatario = _escolher_destinatario(agente["id"], candidatos_destinatario)

            if destinatario is None:
                entrada["aviso"] = "Nenhum destinatário elegível (rate limit do dia atingido em todos os pares)."
            else:
                entrada["destinatario_id"] = destinatario["id"]
                entrada["destinatario_nome"] = destinatario["nome"]
                entrada["respondendo_a_id"] = respondendo_a_id

                if not dry_run:
                    historico = _historico_do_par(agente["id"], destinatario["id"])
                    destinatario_eh_chefe = chefe is not None and destinatario["id"] == chefe["id"]
                    mensagem_para_responder = pendente["conteudo"] if respondendo_a_id else None

                    # Puxar assunto novo é ocasional, não o padrão de toda
                    # mensagem (senão soa forçado — achado na validação
                    # manual). Resposta nunca puxa (fica no assunto);
                    # conversa vazia sempre pode (precisa começar por
                    # algo); conversa em andamento sorteia.
                    if respondendo_a_id:
                        pode_novo_assunto = False
                    elif not historico:
                        pode_novo_assunto = True
                    else:
                        pode_novo_assunto = random.random() < settings.interacao_chance_novo_assunto

                    evento_desc = evento["descricao"] if (evento and pode_novo_assunto) else None
                    if evento_desc is not None:
                        evento_usado_neste_tick = True

                    resposta = await agente_interacao.gerar_mensagem_social(
                        agente["personalidade"],
                        agente["nome"],
                        agente["especialidade"],
                        destinatario["nome"],
                        historico,
                        evento_desc,
                        fato_do_dia,
                        destinatario_eh_chefe,
                        mensagem_para_responder,
                        pode_novo_assunto,
                    )
                    conteudo = resposta["dado"].conteudo
                    executar_query(
                        "mensagens:inserir",
                        returning=True,
                        params=(agente["id"], destinatario["id"], "social", conteudo, numero_tick, respondendo_a_id),
                    )
                    _atualizar_afinidade(agente["id"], destinatario["id"])
                    _atualizar_afinidade(destinatario["id"], agente["id"])
                    executar_query("agentes:atualizar_estado", commit=True, params=(_ESTADO_FALANDO, agente["id"]))
                    entrada["mensagem"] = conteudo

        resultado["interacoes"].append(entrada)

    # Só marca o evento como usado se ele foi de fato injetado em alguma
    # mensagem — com a chance de novo assunto, nem todo tick com papo
    # social usa o evento, e o `ultimo_uso_tick` precisa refletir uso
    # real (é o que ordena o sorteio "menos usado primeiro").
    if not dry_run and evento is not None and evento_usado_neste_tick:
        executar_query("eventos_mundo:marcar_usado", commit=True, params=(numero_tick, evento["id"]))

    return resultado


def listar_eventos_mundo() -> list[dict]:
    return executar_query("eventos_mundo:listar")


def criar_evento_mundo(descricao: str) -> dict:
    tick_atual = resolver_tick.obter_tick_atual()
    numero_tick = tick_atual["numero"] if tick_atual else None
    rows = executar_query("eventos_mundo:inserir", returning=True, params=(descricao, numero_tick))
    return rows[0]
