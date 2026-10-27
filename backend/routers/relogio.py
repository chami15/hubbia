"""HTTP fino do relógio do mundo (ver resolvers/relogio.py)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from resolvers import relogio as resolver

router = APIRouter(prefix="/relogio", tags=["relogio"])


class FatorInput(BaseModel):
    fator: float


@router.get("")
def obter_relogio():
    return resolver.descrever()


@router.put("/fator")
def definir_fator(corpo: FatorInput):
    try:
        resolver.definir_fator(corpo.fator)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return resolver.descrever()
