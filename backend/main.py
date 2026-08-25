"""Ponto de entrada da API (FastAPI).

Fatia atual: leitura (health, agentes, mensagens) + domínio do Financeiro
(upload de extrato, dashboard, relatório mensal) + domínio da Agenda
(mensagem roteada, gate de confirmação no Google Calendar) + domínio de
Saúde (perfil, peso, hidratação, sono, atividade, refeição, ficha de
treino, plano de dieta, relatório semanal) + domínio do Norte (projetos
do GitHub, cards de sugestão um por vez) + motor de tick, Etapa 1
(relógio simulado) e Etapa 2 (camada social — quem puxa assunto com
quem, mensagens sociais entre agentes; ver conversa de design do módulo
de interação). Sobe com:  uvicorn main:app --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import agenda, agentes, financeiro, infra, interacao, mensagens, norte, saude, tick
from utils.connection import close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    close_pool()


app = FastAPI(title="Hub de Agentes — Backend", version="0.2.0", lifespan=lifespan)

# Libera o front local (Vite) a consumir a API durante o desenvolvimento.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agentes.router)
app.include_router(mensagens.router)
app.include_router(financeiro.router)
app.include_router(agenda.router)
app.include_router(saude.router)
app.include_router(norte.router)
app.include_router(tick.router)
app.include_router(interacao.router)
app.include_router(infra.router)


@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok"}
