"""HTTP fino do domínio de Saúde: perfil, peso, hidratação, sono, atividade,
refeição (texto/foto), ficha de treino, plano de dieta e relatório semanal.

Cada ação é um endpoint dedicado (forms), não um roteador de intenção por
texto livre como o Agenda — só refeição, plano de dieta e relatório chamam
o LLM; todo o resto é escrita direta, sem custo de token.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from resolvers import saude as resolver

router = APIRouter(prefix="/saude", tags=["saude"])

_TAMANHO_MAX_FOTO_BYTES = 8 * 1024 * 1024  # 8MB
_TIPOS_IMAGEM_ACEITOS = ("image/jpeg", "image/png", "image/webp")
_TipoRefeicao = Literal["cafe_da_manha", "almoco", "cafe_da_tarde", "jantar", "outro"]


class PerfilInput(BaseModel):
    nome: str
    sexo: Literal["M", "F"]
    data_nascimento: date
    altura_cm: int = Field(..., gt=0, lt=300)
    objetivo: Literal["emagrecer", "ganhar_massa", "manter_peso", "saude_geral"]
    tem_diabetes: bool = False
    restricoes_alimentares: str | None = None


class PesoInput(BaseModel):
    peso_kg: float = Field(..., gt=0, lt=400)


class HidratacaoInput(BaseModel):
    quantidade_ml: int = Field(..., gt=0)


class SonoInput(BaseModel):
    horas: float = Field(..., ge=0, le=24)
    qualidade: Literal["ruim", "regular", "boa"] | None = None
    data_referencia: date | None = None


class AtividadeInput(BaseModel):
    tipo: Literal["corrida", "academia", "esporte", "caminhada", "outro"]
    duracao_min: int = Field(..., gt=0)
    observacao: str | None = None


class RefeicaoTextoInput(BaseModel):
    tipo_refeicao: _TipoRefeicao
    descricao: str


class ExercicioFichaInput(BaseModel):
    nome_exercicio: str
    series: int = Field(..., gt=0)
    repeticoes: int = Field(..., gt=0)


class DiaFichaInput(BaseModel):
    dia_semana: Literal["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
    grupo_muscular: str
    exercicios: list[ExercicioFichaInput]


class FichaTreinoInput(BaseModel):
    dias: list[DiaFichaInput]


@router.get("/perfil")
def obter_perfil():
    perfil = resolver.obter_perfil()
    if perfil is None:
        raise HTTPException(status_code=404, detail="Perfil ainda não configurado.")
    return perfil


@router.post("/perfil")
def salvar_perfil(corpo: PerfilInput):
    return resolver.salvar_perfil(corpo.model_dump())


@router.post("/peso")
def registrar_peso(corpo: PesoInput):
    return resolver.registrar_peso(corpo.peso_kg)


@router.post("/hidratacao")
def registrar_hidratacao(corpo: HidratacaoInput):
    return resolver.registrar_hidratacao(corpo.quantidade_ml)


@router.post("/sono")
def registrar_sono(corpo: SonoInput):
    return resolver.registrar_sono(corpo.horas, corpo.qualidade, corpo.data_referencia)


@router.post("/atividade")
def registrar_atividade(corpo: AtividadeInput):
    return resolver.registrar_atividade(corpo.tipo, corpo.duracao_min, corpo.observacao)


@router.post("/refeicao/texto")
async def registrar_refeicao_texto(corpo: RefeicaoTextoInput):
    try:
        return await resolver.registrar_refeicao_texto(corpo.tipo_refeicao, corpo.descricao)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/refeicao/foto")
async def registrar_refeicao_foto(
    tipo_refeicao: _TipoRefeicao = Form(...),
    legenda: str | None = Form(None),
    arquivo: UploadFile = File(...),
):
    if arquivo.content_type not in _TIPOS_IMAGEM_ACEITOS:
        raise HTTPException(status_code=422, detail="Formato de imagem não suportado — use JPEG, PNG ou WEBP.")

    conteudo = await arquivo.read()
    if len(conteudo) > _TAMANHO_MAX_FOTO_BYTES:
        raise HTTPException(status_code=422, detail="Imagem grande demais (máximo 8MB).")

    try:
        return await resolver.registrar_refeicao_foto(tipo_refeicao, conteudo, arquivo.content_type, legenda)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/ficha-treino")
def obter_ficha_treino():
    return resolver.obter_ficha_treino()


@router.put("/ficha-treino")
def salvar_ficha_treino(corpo: FichaTreinoInput):
    return resolver.salvar_ficha_treino([d.model_dump() for d in corpo.dias])


@router.post("/plano-dieta/gerar")
async def gerar_plano_dieta():
    try:
        return await resolver.gerar_plano_dieta()
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/plano-dieta/atual")
def obter_plano_dieta_atual():
    plano = resolver.obter_plano_dieta_atual()
    if plano is None:
        raise HTTPException(status_code=404, detail="Nenhum plano de dieta gerado ainda.")
    return plano


@router.post("/relatorio/gerar")
async def gerar_relatorio_semanal():
    try:
        return await resolver.gerar_relatorio_semanal()
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/relatorio/semana-atual")
def obter_relatorio_semana_atual():
    relatorio = resolver.obter_relatorio_semana_atual()
    if relatorio is None:
        raise HTTPException(status_code=404, detail="Relatório ainda não gerado para essa semana.")
    return relatorio


@router.get("/dashboard")
def obter_dashboard():
    return resolver.obter_dashboard()


@router.get("/historico")
def obter_historico(dias: int = Query(14, ge=1, le=90)):
    return resolver.obter_historico(dias=dias)
