from resolvers import tick as resolver_tick
from utils.query_executor import executar_query


def listar_mensagens(tipo: str | None, limite: int) -> list[dict]:
    if tipo:
        return executar_query("mensagens:listar_por_tipo", params=(tipo, limite))
    return executar_query("mensagens:listar_todas", params=(limite,))


def _buscar_chefe() -> dict:
    rows = executar_query("agentes:buscar_chefe")
    if not rows:
        raise ValueError("Nenhum chefe cadastrado.")
    return rows[0]


def listar_caixa_de_entrada(limite: int) -> list[dict]:
    """"Caixa de mensagens do chefe" — tudo que foi direcionado a ele,
    resolvido no servidor (o frontend não precisa saber o id do chefe)."""
    chefe = _buscar_chefe()
    return executar_query("mensagens:caixa_de_entrada", params=(chefe["id"], limite))


def responder_mensagem(mensagem_id: int, conteudo: str) -> dict:
    """Resposta REAL do chefe (texto literal dele, sem LLM) a uma
    mensagem social que ele recebeu. Só mensagens `tipo='social'`
    direcionadas a ele — avisos de trabalho (ex: Norte) têm seu próprio
    fluxo de decisão (aceitar/rejeitar/finalizar o card), não fazem
    sentido como "conversa" respondível aqui."""
    chefe = _buscar_chefe()

    rows = executar_query("mensagens:buscar_por_id", params=(mensagem_id,))
    if not rows:
        raise ValueError(f"Mensagem {mensagem_id} não encontrada.")
    original = rows[0]

    if original["destinatario_id"] != chefe["id"]:
        raise ValueError(f"Mensagem {mensagem_id} não foi direcionada a você — não é possível responder.")
    if original["tipo"] != "social":
        raise ValueError(
            "Só é possível responder mensagens sociais — avisos de trabalho têm seu próprio "
            "fluxo (aceitar/rejeitar/finalizar o card, por domínio)."
        )

    tick_atual = resolver_tick.obter_tick_atual()
    numero_tick = tick_atual["numero"] if tick_atual else None

    resultado = executar_query(
        "mensagens:inserir",
        returning=True,
        params=(chefe["id"], original["remetente_id"], "social", conteudo, numero_tick, mensagem_id),
    )
    return resultado[0]


def marcar_mensagem_lida(mensagem_id: int) -> dict:
    """"Lida" é por CLIQUE na mensagem específica (decisão do chefe) —
    nunca por abrir o painel ou expandir a conversa inteira. Só faz
    sentido pra mensagem que chegou PRA ele; marcar uma que ele mesmo
    mandou, ou que é de outro par, não tem o que significar aqui."""
    chefe = _buscar_chefe()

    rows = executar_query("mensagens:buscar_por_id", params=(mensagem_id,))
    if not rows:
        raise ValueError(f"Mensagem {mensagem_id} não encontrada.")
    if rows[0]["destinatario_id"] != chefe["id"]:
        raise ValueError(f"Mensagem {mensagem_id} não foi direcionada a você.")

    resultado = executar_query("mensagens:marcar_lida", returning=True, params=(mensagem_id,))
    return resultado[0]
