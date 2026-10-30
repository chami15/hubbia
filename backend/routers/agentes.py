from fastapi import APIRouter

from resolvers import agentes as resolver

router = APIRouter(prefix="/agentes", tags=["agentes"])


@router.get("")
def listar_agentes():
    return resolver.listar_agentes()


@router.get("/relacionamentos")
def listar_relacionamentos():
    return resolver.listar_relacionamentos()
