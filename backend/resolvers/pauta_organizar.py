"""Pauta, fase P2: organizar os textos `nova` (botão ou tick) e responder as perguntas de dúvida.

Ordem de uma rodada, do mais barato ao mais caro (docs/pauta-desenho.md, P2):
  1. texto preso em `lendo` há muito tempo vira `falhou` (nunca volta sozinho para a fila);
  2. pega o lote e marca `lendo` no mesmo comando (tick e botão juntos nunca leem o mesmo texto);
  3. texto repetido igual a um anterior vira `duplicada`, sem LLM;
  4. sobrou algo? UMA chamada de LLM para o lote, com segredo mascarado;
  5. a trava em código (`pauta_regras.revisar_decisao`) decide o que encaixa e o que vira pergunta;
  6. tudo é gravado numa transação só: ou o lote inteiro entra, ou nada (e os textos ficam `falhou`).

Responder uma pergunta não chama o LLM: a proposta já veio na chamada que gerou a dúvida.
"""
import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from agents.pauta import agente as agente_pauta
from config import settings
from resolvers import pauta as base
from resolvers import pauta_regras as regras
from resolvers import tick as resolver_tick
from utils.query_executor import executar_query
from utils.transacao import em_transacao

_CONTEXTO_TAREFAS = 60
_PERGUNTA_MAX = 140
_TRECHO_NA_PERGUNTA = 70
_DIAS_DA_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _hoje() -> date:
    return datetime.now(ZoneInfo(settings.timezone_padrao)).date()


def _prazo(texto: str | None) -> str | None:
    if not texto:
        return None
    try:
        return date.fromisoformat(texto.strip()).isoformat()
    except ValueError:
        return None  # data que não é data: melhor sem prazo do que com um inventado


def _resumo_vazio() -> dict:
    return {"lidos": 0, "organizados": 0, "perguntas": 0, "duplicados": 0, "falhas": 0, "devolvidos": 0, "chamou_llm": False}


# ---------------------------------------------------------------------------------------------- rodada

async def rodada(respeitar_teto: bool) -> dict:
    """Organizar os textos novos e depois atualizar o contexto das tarefas que receberam texto. É o que o botão
    "organizar agora" e o tick fazem; o tick para no teto do dia, o botão não."""
    from resolvers import pauta_contexto

    resumo = await organizar()
    resumo["contexto"] = await pauta_contexto.consolidar_pendentes(respeitar_teto)
    return resumo


# ---------------------------------------------------------------------------------------------- organizar

async def organizar() -> dict:
    """Uma rodada. Sem texto novo, devolve na hora sem gastar nada."""
    executar_query("anotacoes:recuperar_travadas", returning=True, params=(settings.pauta_minutos_leitura_travada,))
    resumo = _resumo_vazio()
    if not executar_query("anotacoes:existe_nova")[0]["existe"]:
        return resumo
    if resolver_tick.orcamento_disponivel_hoje() <= 0:
        raise base.ConflitoDeEstado("O orçamento de hoje acabou. Os textos continuam guardados e esperam até amanhã.")

    lote = executar_query(
        "anotacoes:pegar_lote",
        returning=True,
        params={"limite": settings.pauta_lote_max_textos, "max_caracteres": settings.pauta_lote_max_caracteres},
    )
    resumo["lidos"] = len(lote)

    para_ler = []
    for t in lote:
        original = executar_query(
            "anotacoes:buscar_original_igual", params=(t["texto_normalizado"], t["id"], settings.pauta_dias_repeticao)
        )
        if original:
            executar_query("anotacoes:marcar_duplicada", commit=True, params=(original[0]["id"], original[0]["tarefa_id"], t["id"]))
            resumo["duplicados"] += 1
        else:
            para_ler.append(t)
    if not para_ler:
        return resumo

    tarefas = executar_query("tarefas:listar_abertas_para_contexto", params=(_CONTEXTO_TAREFAS,))
    frentes = executar_query("frentes:listar_ativas")
    hoje = _hoje()
    textos_prompt = [
        {"id": t["id"], "texto": regras.mascarar_segredos(t["texto"])[: settings.pauta_caracteres_por_texto]}
        for t in para_ler
    ]
    prompt = agente_pauta.montar_prompt(
        f"{hoje.isoformat()} ({_DIAS_DA_SEMANA[hoje.weekday()]})", [f["nome"] for f in frentes], tarefas, textos_prompt
    )

    ids = [t["id"] for t in para_ler]
    resumo["chamou_llm"] = True
    try:
        resultado = await agente_pauta.organizar_lote(prompt)
    except RuntimeError as exc:
        executar_query("anotacoes:marcar_falhou", commit=True, params=(str(exc), ids))
        raise

    try:
        with em_transacao() as q:
            _aplicar(q, resultado["dado"].decisoes, para_ler, tarefas, frentes, resumo)
            q("perguntas:promover_proxima")
            q("anotacoes:herdar_tarefa_do_original")
    except Exception as exc:
        # nada do lote foi gravado (transação desfeita): os textos não podem ficar presos em `lendo`
        executar_query("anotacoes:marcar_falhou", commit=True, params=(f"Erro ao guardar a organização: {exc}", ids))
        raise RuntimeError(f"Erro ao guardar a organização: {exc}") from exc
    return resumo


def _aplicar(q, decisoes, textos: list[dict], tarefas: list[dict], frentes: list[dict], resumo: dict) -> None:
    por_texto = {}
    for d in decisoes:
        por_texto.setdefault(d.texto_id, d)  # decisão repetida para o mesmo texto: vale a primeira
    tarefas = list(tarefas)  # cresce com as tarefas criadas neste lote (o texto seguinte pode ser a mesma)
    por_tarefa = {t["id"]: t for t in tarefas}
    frente_por_nome = {base.normalizar(f["nome"]): f for f in frentes}

    for t in textos:
        d = por_texto.get(t["id"])
        motivo = _invalida(d, por_tarefa, frente_por_nome)
        if motivo:
            q("anotacoes:marcar_falhou", (motivo, [t["id"]]))
            resumo["falhas"] += 1
            continue

        frente = frente_por_nome.get(base.normalizar(d.nova_frente or "")) if d.destino == "nova" else None
        titulo = regras.truncar(d.nova_titulo or "", regras.TITULO_MAX) if d.destino == "nova" else None
        proposta = {
            "itens": regras.itens_novos(d.itens, []),
            "prazo": _prazo(d.prazo),
            "termos": regras.juntar_termos([], d.termos, maximo=5),
            "titulo": titulo or regras.truncar(t["texto"].splitlines()[0], regras.TITULO_MAX),
        }
        revisao = regras.revisar_decisao(
            t["texto"], d.destino, d.tarefa_id, titulo, frente["id"] if frente else None,
            d.confianca, d.candidatos, tarefas,
        )

        if not revisao.perguntar:
            if d.destino == "existente":
                tarefa_id = d.tarefa_id
            else:
                tarefa_id = _criar_tarefa(q, frente["id"], proposta)
                nova = {"id": tarefa_id, "frente_id": frente["id"], "titulo": proposta["titulo"], "termos": proposta["termos"]}
                tarefas.append(nova)
                por_tarefa[tarefa_id] = nova
            _encaixar(q, t["id"], tarefa_id, proposta, aprender_termos=False)
            resumo["organizados"] += 1
            continue

        if resumo["perguntas"] >= settings.pauta_perguntas_por_lote:
            q("anotacoes:devolver_para_fila", ([t["id"]],))
            resumo["devolvidos"] += 1
            continue
        tipo, texto_pergunta, opcoes = _montar_pergunta(t["texto"], revisao, proposta, frente, por_tarefa, frentes)
        q("perguntas:inserir", (tipo, t["id"], texto_pergunta, json.dumps(opcoes, ensure_ascii=False),
                                json.dumps(proposta, ensure_ascii=False)))
        q("anotacoes:marcar_aguardando", (t["id"],))
        resumo["perguntas"] += 1


def _invalida(d, por_tarefa: dict, frente_por_nome: dict) -> str | None:
    """O que o LLM devolveu e o código recusa (vira `falhou`, com o motivo, e o chefe decide tentar de novo)."""
    if d is None:
        return "A Pauta não devolveu nada para este texto."
    # Em dúvida o texto vira pergunta de qualquer jeito, com opções montadas pelo código (candidatos inexistentes
    # são descartados na revisão): não há destino a validar. Exigir tarefa_id aqui mandava a dúvida para `falhou`.
    if d.confianca != "certa":
        return None
    if d.destino == "existente":
        if d.tarefa_id not in por_tarefa:
            return "A Pauta apontou uma tarefa que não existe (ou não está aberta)."
        return None
    if not frente_por_nome.get(base.normalizar(d.nova_frente or "")):
        return f"A Pauta sugeriu uma frente que não existe: {d.nova_frente!r}."
    if not base.normalizar(d.nova_titulo or ""):
        return "A Pauta sugeriu uma tarefa nova sem título."
    return None


def _criar_tarefa(q, frente_id: int, proposta: dict) -> int:
    return q("tarefas:inserir", (frente_id, proposta["titulo"], proposta["prazo"], proposta["termos"], "agente"))[0]["id"]


def _encaixar(q, anotacao_id: int, tarefa_id: int, proposta: dict, aprender_termos: bool) -> None:
    """Põe o texto na tarefa e acrescenta o que é novo. Nunca mexe no que o chefe escreveu ou marcou: só acrescenta
    item, só preenche prazo vazio."""
    q("anotacoes:marcar_organizada", (tarefa_id, anotacao_id))
    existentes = [i["texto"] for i in q("checklist:listar_da_tarefa", (tarefa_id,))]
    for item in regras.itens_novos(proposta.get("itens", []), existentes):
        q("checklist:inserir", (tarefa_id, item, "agente", tarefa_id))
    if proposta.get("prazo"):
        q("tarefas:definir_prazo_se_vazio", (proposta["prazo"], tarefa_id))
    if aprender_termos and proposta.get("termos"):
        atuais = q("tarefas:buscar_por_id", (tarefa_id,))[0]["termos"]
        q("tarefas:definir_termos", (regras.juntar_termos(atuais, proposta["termos"]), tarefa_id))
    q("tarefas:tocar", (tarefa_id,))


def _montar_pergunta(texto, revisao, proposta, frente, por_tarefa, frentes) -> tuple[str, str, list[dict]]:
    """Pergunta e opções montadas pelo código, curtas (pedido do chefe: nada de texto grande)."""
    trecho = regras.truncar(regras.mascarar_segredos(texto), _TRECHO_NA_PERGUNTA)
    titulo = proposta["titulo"]

    if revisao.tipo == "mesma_tarefa":
        parecida = por_tarefa[revisao.parecida_id]
        pergunta = f"“{regras.truncar(titulo, 50)}” é a mesma tarefa que “{regras.truncar(parecida['titulo'], 50)}”?"
        opcoes = [
            {"rotulo": "Sim, é a mesma", "acao": {"tipo": "existente", "tarefa_id": parecida["id"]}},
            {"rotulo": "Não, é outra tarefa", "acao": {"tipo": "nova", "frente_id": frente["id"], "titulo": titulo}},
        ]
        return "mesma_tarefa", regras.truncar(pergunta, _PERGUNTA_MAX), opcoes

    opcoes = [
        {"rotulo": regras.truncar(por_tarefa[c]["titulo"], 60), "acao": {"tipo": "existente", "tarefa_id": c}}
        for c in revisao.candidatos
    ]
    for f in frentes:
        opcoes.append({"rotulo": f"Tarefa nova em {f['nome']}", "acao": {"tipo": "nova", "frente_id": f["id"], "titulo": titulo}})
    return "destino", regras.truncar(f"“{trecho}” é de qual tarefa?", _PERGUNTA_MAX), opcoes


# ---------------------------------------------------------------------------------------------- perguntas

def pergunta_atual() -> dict | None:
    rows = executar_query("perguntas:atual")
    if not rows:
        return None
    p = rows[0]
    p["texto_original"] = regras.mascarar_segredos(p["texto_original"])
    p["opcoes"] = [{"indice": i, "rotulo": o["rotulo"]} for i, o in enumerate(p["opcoes"])]
    return p


def responder(pergunta_id: int, opcao: int) -> dict:
    """Aplica a opção escolhida, sem LLM. A resposta ensina: os termos do texto entram na tarefa escolhida, e da
    próxima vez a Pauta não precisa perguntar de novo."""
    with em_transacao() as q:
        rows = q("perguntas:buscar_para_responder", (pergunta_id,))
        if not rows:
            raise LookupError(f"Pergunta {pergunta_id} não encontrada.")
        p = rows[0]
        if p["status"] != "aberta":
            raise base.ConflitoDeEstado("Essa pergunta já foi respondida ou ainda não é a vez dela.")
        if not 0 <= opcao < len(p["opcoes"]):
            raise ValueError(f"Opção {opcao} não existe nessa pergunta.")

        acao, proposta = p["opcoes"][opcao]["acao"], p["proposta"]
        if acao["tipo"] == "existente":
            if not q("tarefas:buscar_por_id", (acao["tarefa_id"],)):
                raise LookupError("A tarefa dessa opção não existe mais.")
            tarefa_id = acao["tarefa_id"]
        else:
            tarefa_id = _criar_tarefa(q, acao["frente_id"], {**proposta, "titulo": acao["titulo"]})
        _encaixar(q, p["anotacao_id"], tarefa_id, proposta, aprender_termos=acao["tipo"] == "existente")
        q("perguntas:marcar_respondida", (opcao, pergunta_id))
        q("perguntas:promover_proxima")
        q("anotacoes:herdar_tarefa_do_original")
    return {"tarefa": base.obter_tarefa(tarefa_id), "proxima": pergunta_atual()}


def tentar_de_novo(anotacao_id: int) -> dict:
    rows = executar_query("anotacoes:tentar_de_novo", returning=True, params=(anotacao_id,))
    if rows:
        return rows[0]
    if not executar_query("anotacoes:buscar_por_id", params=(anotacao_id,)):
        raise LookupError(f"Texto {anotacao_id} não encontrado.")
    raise base.ConflitoDeEstado("Só um texto que falhou pode ser tentado de novo.")


def listar_falhas(limite: int = 20) -> list[dict]:
    return executar_query("anotacoes:listar_falhas", params=(limite,))
