"""Domínio da Pauta (secretário pessoal), fase P1: guardar textos crus, tarefas por frente e checklist.

Nada aqui chama LLM. A P1 já é útil sozinha (checklist por frente, de graça); a organização dos textos `nova`
entra na P2. Desenho: docs/pauta-desenho.md.

Erros, do jeito que o router traduz:
  LookupError      -> 404 (tarefa, frente ou item não existe)
  ConflitoDeEstado -> 409 (ex.: ocultar tarefa ainda aberta)
  ValueError       -> 422 (entrada inválida: texto vazio, status desconhecido)
"""
import re
import unicodedata
from datetime import date

from utils.query_executor import executar_query

# Os textos originais vêm junto da tarefa, mas com teto: uma tarefa pode juntar dezenas de textos longos.
_TEXTOS_POR_TAREFA = 20
_STATUS_TAREFA = ("aberta", "feita", "arquivada")


class ConflitoDeEstado(Exception):
    """A ação não vale para o estado atual (ex.: ocultar tarefa aberta)."""


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, pontuação ou espaço sobrando. É o que reconhece "Ligar pro João!" e "ligar pro joao"
    como o mesmo texto sem gastar LLM (P2). Não é sinônimo: "outras palavras" é trabalho da P2."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", " ", sem_acento.lower()).strip()


def _limpo(texto: str | None, campo: str) -> str:
    texto = (texto or "").strip()
    if not texto:
        raise ValueError(f"{campo} não pode ficar vazio.")
    return texto


def _termos_limpos(termos: list[str]) -> list[str]:
    # sem repetição e sem vazio, na ordem em que vieram
    vistos: dict[str, str] = {}
    for t in termos:
        t = t.strip()
        if t and normalizar(t) not in vistos:
            vistos[normalizar(t)] = t
    return list(vistos.values())


# ---------------------------------------------------------------------------- frentes

def listar_frentes() -> list[dict]:
    return executar_query("frentes:listar_com_contagem")


def _garantir_frente(frente_id: int) -> None:
    rows = executar_query("frentes:buscar_por_id", params=(frente_id,))
    if not rows or not rows[0]["ativa"]:
        raise LookupError(f"Frente {frente_id} não encontrada.")


# ---------------------------------------------------------------------------- tarefas

def _buscar_tarefa(tarefa_id: int) -> dict:
    rows = executar_query("tarefas:buscar_por_id", params=(tarefa_id,))
    if not rows:
        raise LookupError(f"Tarefa {tarefa_id} não encontrada.")
    return rows[0]


def listar_tarefas(frente_id: int, incluir_ocultas: bool = False) -> list[dict]:
    _garantir_frente(frente_id)
    return executar_query("tarefas:listar_da_frente", params=(frente_id, incluir_ocultas))


def obter_tarefa(tarefa_id: int) -> dict:
    """Nível 3 do painel: a tarefa com o checklist e os textos que a formaram (os mais recentes primeiro)."""
    tarefa = _buscar_tarefa(tarefa_id)
    tarefa["checklist"] = executar_query("checklist:listar_da_tarefa", params=(tarefa_id,))
    # "o que já se sabe" (P3), com a origem de cada tópico. A coluna `tarefas.contexto` da 015 ficou sem uso.
    tarefa["contexto"] = executar_query("contexto:listar_da_tarefa", params=(tarefa_id,))
    sugestao = executar_query("sugestoes:ativa_da_tarefa", params=(tarefa_id,))
    tarefa["sugestao"] = sugestao[0] if sugestao else None
    if tarefa["sugestao"]:
        # a tarefa mudou depois da sugestão (item marcado, contexto novo): a tela mostra como "desatualizada"
        from resolvers.pauta_regras import impressao_da_tarefa
        tarefa["sugestao"]["atual"] = tarefa["sugestao"].pop("base_hash") == impressao_da_tarefa(tarefa)
    tarefa["textos"] = executar_query("anotacoes:listar_da_tarefa", params=(tarefa_id, _TEXTOS_POR_TAREFA))
    return tarefa


def criar_tarefa(frente_id: int, titulo: str, prazo: date | None = None, termos: list[str] | None = None) -> dict:
    _garantir_frente(frente_id)
    rows = executar_query(
        "tarefas:inserir",
        returning=True,
        params=(frente_id, _limpo(titulo, "O título"), prazo, _termos_limpos(termos or []), "manual"),
    )
    return obter_tarefa(rows[0]["id"])


def atualizar_tarefa(
    tarefa_id: int,
    titulo: str | None = None,
    frente_id: int | None = None,
    termos: list[str] | None = None,
    mudar_prazo: bool = False,
    prazo: date | None = None,
) -> dict:
    """Renomear, mudar de frente, editar termos ou prazo. `mudar_prazo` separa "não mexe no prazo" de "tira o prazo"."""
    _buscar_tarefa(tarefa_id)
    if frente_id is not None:
        _garantir_frente(frente_id)
    titulo = _limpo(titulo, "O título") if titulo is not None else None
    termos = _termos_limpos(termos) if termos is not None else None
    executar_query(
        "tarefas:atualizar_campos",
        returning=True,
        params=(titulo, frente_id, termos, mudar_prazo, prazo, tarefa_id),
    )
    return obter_tarefa(tarefa_id)


def mudar_status_tarefa(tarefa_id: int, status: str) -> dict:
    """Concluir (`feita`), deixar de lado (`arquivada`) ou reabrir (`aberta`, que também desoculta).
    Nada é apagado: a tarefa sai da vista e continua no histórico."""
    if status not in _STATUS_TAREFA:
        raise ValueError(f"Status desconhecido: {status!r}.")
    tarefa = _buscar_tarefa(tarefa_id)
    if tarefa["status"] == status:
        raise ConflitoDeEstado(f"A tarefa já está '{status}'.")
    executar_query("tarefas:mudar_status", returning=True, params={"status": status, "id": tarefa_id})
    return obter_tarefa(tarefa_id)


def ocultar_tarefa(tarefa_id: int, oculta: bool = True) -> dict:
    """Arrumação da tela, decidida pelo chefe: só tarefa feita ou deixada de lado some da lista principal.
    Tarefa aberta escondida seria esquecida, que é exatamente o que a Pauta existe para evitar."""
    tarefa = _buscar_tarefa(tarefa_id)
    if oculta and tarefa["status"] == "aberta":
        raise ConflitoDeEstado("Só dá para ocultar tarefa concluída ou deixada de lado.")
    executar_query("tarefas:ocultar", returning=True, params=(oculta, oculta, tarefa_id))
    return obter_tarefa(tarefa_id)


# ---------------------------------------------------------------------------- textos (anotações)

def registrar_texto(texto: str, tarefa_id: int | None = None) -> dict:
    """Guarda o texto como o chefe escreveu, na hora e sem LLM. Escrito dentro de uma tarefa já nasce organizado
    (o chefe disse onde é); solto, nasce `nova` e espera a Pauta ler (P2)."""
    texto = _limpo(texto, "O texto")
    if tarefa_id is not None:
        _buscar_tarefa(tarefa_id)
    rows = executar_query(
        "anotacoes:inserir",
        returning=True,
        params={"texto": texto, "normalizado": normalizar(texto), "tarefa_id": tarefa_id},
    )
    if tarefa_id is not None:
        executar_query("tarefas:tocar", commit=True, params=(tarefa_id,))
    return rows[0]


def contar_textos() -> dict:
    return executar_query("anotacoes:contar_por_status")[0]


# ---------------------------------------------------------------------------- checklist

def _buscar_item(item_id: int) -> dict:
    rows = executar_query("checklist:buscar_por_id", params=(item_id,))
    if not rows:
        raise LookupError(f"Item {item_id} não encontrado.")
    return rows[0]


def adicionar_item(tarefa_id: int, texto: str) -> dict:
    _buscar_tarefa(tarefa_id)
    rows = executar_query(
        "checklist:inserir", returning=True, params=(tarefa_id, _limpo(texto, "O item"), "manual", tarefa_id)
    )
    executar_query("tarefas:tocar", commit=True, params=(tarefa_id,))
    return rows[0]


def atualizar_item(item_id: int, texto: str | None = None, feito: bool | None = None, ordem: int | None = None) -> dict:
    _buscar_item(item_id)
    texto = _limpo(texto, "O item") if texto is not None else None
    rows = executar_query(
        "checklist:atualizar",
        returning=True,
        params={"id": item_id, "texto": texto, "feito": feito, "ordem": ordem},
    )
    executar_query("tarefas:tocar", commit=True, params=(rows[0]["tarefa_id"],))
    return rows[0]


def remover_item(item_id: int) -> None:
    rows = executar_query("checklist:remover", returning=True, params=(item_id,))
    if not rows:
        raise LookupError(f"Item {item_id} não encontrado.")
    executar_query("tarefas:tocar", commit=True, params=(rows[0]["tarefa_id"],))
