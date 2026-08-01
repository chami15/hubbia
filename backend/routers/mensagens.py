from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from resolvers import mensagens as resolver

router = APIRouter(prefix="/mensagens", tags=["mensagens"])


class RespostaInput(BaseModel):
    conteudo: str = Field(..., min_length=1)


@router.get("")
def listar_mensagens(
    tipo: Literal["trabalho", "social"] | None = Query(
        default=None, description="Filtra o canal. Vazio = todos."
    ),
    limite: int = Query(default=50, ge=1, le=500),
):
    return resolver.listar_mensagens(tipo, limite)


@router.get("/caixa-de-entrada")
def listar_caixa_de_entrada(limite: int = Query(default=50, ge=1, le=500)):
    try:
        return resolver.listar_caixa_de_entrada(limite)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{mensagem_id}/responder")
def responder_mensagem(mensagem_id: int, corpo: RespostaInput):
    try:
        return resolver.responder_mensagem(mensagem_id, corpo.conteudo)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{mensagem_id}/marcar-lida")
def marcar_mensagem_lida(mensagem_id: int):
    try:
        return resolver.marcar_mensagem_lida(mensagem_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
