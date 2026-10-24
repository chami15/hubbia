"""HTTP fino do domínio Agenda: mensagem em texto livre (roteada por
intenção) e confirmação/rejeição de ação pendente antes de mexer de
verdade no Google Calendar.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from resolvers import agenda as resolver

router = APIRouter(prefix="/agenda", tags=["agenda"])


class MensagemInput(BaseModel):
    texto: str


@router.get("/conversa")
def obter_conversa():
    return resolver.obter_conversa()


@router.post("/mensagem")
async def processar_mensagem(corpo: MensagemInput):
    return await resolver.processar_mensagem(corpo.texto)


@router.post("/acoes/{acao_id}/confirmar")
def confirmar_acao(acao_id: int):
    return resolver.confirmar_acao(acao_id)


@router.post("/acoes/{acao_id}/rejeitar")
def rejeitar_acao(acao_id: int):
    return resolver.rejeitar_acao(acao_id)
