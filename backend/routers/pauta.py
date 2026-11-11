"""HTTP fino do domínio Pauta (secretário pessoal): textos crus, tarefas por frente e checklist (P1, sem LLM) e a
organização dos textos com as perguntas de dúvida (P2). Só `POST /pauta/organizar` chama LLM, e só por clique.
Regras em resolvers/pauta.py (P1) e resolvers/pauta_organizar.py (P2)."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from resolvers import pauta as resolver
from resolvers import pauta_organizar as organizacao

router = APIRouter(prefix="/pauta", tags=["pauta"])

# Tetos de entrada: o texto livre aceita "tanto faz o tamanho" (pedido do chefe), mas não sem limite.
_TEXTO_MAX = 20_000
_TITULO_MAX = 120
_ITEM_MAX = 200


class TextoInput(BaseModel):
    texto: str = Field(..., max_length=_TEXTO_MAX)
    tarefa_id: int | None = None


class TarefaInput(BaseModel):
    frente_id: int
    titulo: str = Field(..., max_length=_TITULO_MAX)
    prazo: date | None = None
    termos: list[str] = Field(default_factory=list, max_length=20)


class TarefaPatch(BaseModel):
    titulo: str | None = Field(None, max_length=_TITULO_MAX)
    frente_id: int | None = None
    termos: list[str] | None = Field(None, max_length=20)
    prazo: date | None = None  # mandar `"prazo": null` tira o prazo; não mandar não mexe


class StatusInput(BaseModel):
    status: Literal["aberta", "feita", "arquivada"]


class ItemInput(BaseModel):
    texto: str = Field(..., max_length=_ITEM_MAX)


class RespostaInput(BaseModel):
    opcao: int


class ItemPatch(BaseModel):
    texto: str | None = Field(None, max_length=_ITEM_MAX)
    feito: bool | None = None
    ordem: int | None = None


def _executar(funcao, *args, **kwargs):
    try:
        return funcao(*args, **kwargs)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except resolver.ConflitoDeEstado as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/textos")
def registrar_texto(corpo: TextoInput):
    return _executar(resolver.registrar_texto, corpo.texto, corpo.tarefa_id)


@router.get("/textos/contagem")
def contar_textos():
    return resolver.contar_textos()


@router.get("/frentes")
def listar_frentes():
    return resolver.listar_frentes()


@router.get("/frentes/{frente_id}/tarefas")
def listar_tarefas(frente_id: int, ocultas: bool = False):
    return _executar(resolver.listar_tarefas, frente_id, ocultas)


@router.post("/tarefas")
def criar_tarefa(corpo: TarefaInput):
    return _executar(resolver.criar_tarefa, corpo.frente_id, corpo.titulo, corpo.prazo, corpo.termos)


@router.get("/tarefas/{tarefa_id}")
def obter_tarefa(tarefa_id: int):
    return _executar(resolver.obter_tarefa, tarefa_id)


@router.patch("/tarefas/{tarefa_id}")
def atualizar_tarefa(tarefa_id: int, corpo: TarefaPatch):
    return _executar(
        resolver.atualizar_tarefa,
        tarefa_id,
        titulo=corpo.titulo,
        frente_id=corpo.frente_id,
        termos=corpo.termos,
        mudar_prazo="prazo" in corpo.model_fields_set,
        prazo=corpo.prazo,
    )


@router.post("/tarefas/{tarefa_id}/status")
def mudar_status(tarefa_id: int, corpo: StatusInput):
    return _executar(resolver.mudar_status_tarefa, tarefa_id, corpo.status)


@router.post("/tarefas/{tarefa_id}/ocultar")
def ocultar(tarefa_id: int):
    return _executar(resolver.ocultar_tarefa, tarefa_id, True)


@router.post("/tarefas/{tarefa_id}/desocultar")
def desocultar(tarefa_id: int):
    return _executar(resolver.ocultar_tarefa, tarefa_id, False)


@router.post("/tarefas/{tarefa_id}/checklist")
def adicionar_item(tarefa_id: int, corpo: ItemInput):
    return _executar(resolver.adicionar_item, tarefa_id, corpo.texto)


@router.patch("/checklist/{item_id}")
def atualizar_item(item_id: int, corpo: ItemPatch):
    return _executar(resolver.atualizar_item, item_id, corpo.texto, corpo.feito, corpo.ordem)


@router.delete("/checklist/{item_id}", status_code=204)
def remover_item(item_id: int):
    _executar(resolver.remover_item, item_id)
    return Response(status_code=204)


# ------------------------------------------------------------------------------ P2: organizar e perguntas

@router.post("/organizar")
async def organizar():
    """O botão "organizar agora". Sem texto novo, responde na hora sem gastar nada."""
    try:
        return await organizacao.organizar()
    except resolver.ConflitoDeEstado as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/perguntas/atual")
def pergunta_atual():
    return organizacao.pergunta_atual()


@router.post("/perguntas/{pergunta_id}/resposta")
def responder(pergunta_id: int, corpo: RespostaInput):
    return _executar(organizacao.responder, pergunta_id, corpo.opcao)


@router.get("/textos/falhas")
def listar_falhas():
    return organizacao.listar_falhas()


@router.post("/textos/{anotacao_id}/tentar-de-novo")
def tentar_de_novo(anotacao_id: int):
    return _executar(organizacao.tentar_de_novo, anotacao_id)
