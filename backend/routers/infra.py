"""HTTP fino da sala de máquinas.

Os dois endpoints são de LEITURA e não gastam LLM nenhum — podem ser
chamados ao abrir o painel sem ferir o RNF01, mesma situação do
dashboard do Cifra e do da Vita.
"""
from fastapi import APIRouter, Query

from resolvers import infra as resolver

router = APIRouter(prefix="/infra", tags=["infra"])


@router.get("/saude")
def obter_saude():
    """Saúde das conexões e do orçamento. Determinístico e local — nunca
    bate em API externa pra 'conferir se está de pé' (ver o comentário
    do módulo em resolvers/infra.py)."""
    return resolver.obter_saude()


@router.get("/observabilidade")
def obter_observabilidade(
    horas: int = Query(24, ge=1, le=168, description="Janela da série temporal. 24 = último dia."),
):
    """Painel de monitoramento: latência (p50/p95), tráfego, erros e
    saturação de orçamento, mais a série por hora, o log de execuções e
    o frescor de cada dependência."""
    return resolver.obter_observabilidade(horas=horas)


@router.get("/metricas")
def obter_metricas(
    dias: int = Query(1, ge=1, le=90, description="Janela em dias. 1 = hoje."),
):
    """Custo, chamadas e falhas por agente, a partir de tick_execucoes."""
    return resolver.obter_metricas(dias=dias)
