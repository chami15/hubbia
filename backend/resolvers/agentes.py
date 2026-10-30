from utils.query_executor import executar_query


def listar_agentes() -> list[dict]:
    return executar_query("agentes:listar")


def listar_relacionamentos() -> list[dict]:
    """Afinidade real entre colegas (o tick grava a cada conversa social). O frontend usa para quem almoça com quem e
    para o "se dá bem com" do painel, sem mostrar número."""
    return [
        {"agente_id": r["agente_id"], "alvo_agente_id": r["alvo_agente_id"], "afinidade": int(r["afinidade"])}
        for r in executar_query("relacionamentos:listar_entre_colegas")
    ]
