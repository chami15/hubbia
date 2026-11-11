"""Regras determinísticas da Pauta (P2): o que o código decide sem perguntar ao LLM, e o que ele recusa do LLM.

Tudo aqui é puro (sem banco, sem rede) de propósito: são as partes frágeis da organização e precisam de teste
caso a caso (tests/test_pauta_regras.py). O resolver só junta isto com o banco.

- `mascarar_segredos`: chave e token colados junto com os endpoints nunca saem do banco.
- `itens_novos`: o checklist só cresce com o que é novo (nem igual, nem "o mesmo com outras palavras").
- `revisar_decisao`: a trava que não depende do LLM. Mesmo quando ele diz que tem certeza, vira pergunta se o
  texto cita um termo de tarefas de frentes diferentes, se o destino não tem nada a ver com o texto, ou se a
  "tarefa nova" parece uma que já existe. Na dúvida, pergunta; nunca chuta.
"""
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from config import settings
from difflib import SequenceMatcher

from resolvers.pauta import normalizar

TITULO_MAX = 80
ITEM_MAX = 120
TOPICO_MAX = 140
TOPICOS_POR_TAREFA = 6
PASSO_MAX = 100
COMO_MAX = 90
COMO_PASSOS = 3
POR_QUE_MAX = 140
ITENS_POR_TEXTO = 5
TERMOS_POR_TAREFA = 10

# Parecido a partir daqui = "o mesmo com outras palavras". Calibrado nos testes com pares reais
# ("Listar os endpoints da API" x "listar endpoints da api" sim; "Listar endpoints" x "Testar endpoints" não).
_PARECIDO_ITEM = 0.85
_PARECIDO_TITULO = 0.75
_PALAVRAS_EM_COMUM_TITULO = 0.6

_SEGREDO = "[segredo]"
# A ordem importa: os padrões específicos antes do genérico de "sequência longa".
_PADROES_SEGREDO = [
    # chave: valor / chave=valor -> mantém o nome, esconde o valor
    (re.compile(r"(?i)\b(api[_-]?key|apikey|token|secret|segredo|senha|password|passwd|client[_-]?secret)(\s*[:=]\s*)(\S+)"),
     lambda m: f"{m.group(1)}{m.group(2)}{_SEGREDO}"),
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"), lambda m: f"Bearer {_SEGREDO}"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), lambda m: _SEGREDO),                      # OpenAI e afins
    (re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"), lambda m: _SEGREDO),      # GitHub
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"), lambda m: _SEGREDO),
    (re.compile(r"\bxox[abpors]-[A-Za-z0-9-]{10,}"), lambda m: _SEGREDO),               # Slack
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), lambda m: _SEGREDO),                          # AWS
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), lambda m: _SEGREDO),  # JWT
    # sequência longa com letra E número: cara de chave. Sem hífen de propósito: UUID (id de pedido, de registro) é
    # contexto útil e tem hífen a cada bloco; caminho de URL tem barra. Chave com hífen é pega pelos padrões acima.
    (re.compile(r"\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{32,}\b"), lambda m: _SEGREDO),
]

_STOPWORDS = {
    "para", "pra", "pro", "com", "sem", "que", "uma", "umas", "uns", "dos", "das", "nos", "nas", "por", "pelo", "pela",
    "isso", "esse", "essa", "este", "esta", "aqui", "como", "mais", "muito", "tem", "ter", "fazer", "ver", "sobre",
    "depois", "antes", "ainda", "tambem", "quando", "onde", "qual", "quais", "todo", "toda", "todos", "todas",
}


def mascarar_segredos(texto: str) -> str:
    for padrao, troca in _PADROES_SEGREDO:
        texto = padrao.sub(troca, texto)
    return texto


def truncar(texto: str, maximo: int) -> str:
    texto = " ".join(texto.split())
    return texto if len(texto) <= maximo else texto[: maximo - 1].rstrip() + "…"


def palavras(texto: str) -> set[str]:
    """Palavras que contam para dizer "esses dois falam da mesma coisa": 3+ letras, sem as de ligação."""
    return {p for p in normalizar(texto).split() if len(p) >= 3 and p not in _STOPWORDS}


def parecido(a: str, b: str) -> float:
    return SequenceMatcher(None, normalizar(a), normalizar(b)).ratio()


def _numeros(texto: str) -> list[str]:
    return re.findall(r"\d+", texto)


def _mesma_coisa(a: str, b: str, limite: float) -> bool:
    if normalizar(a) == normalizar(b):
        return True
    # "Ler capítulo 3" x "Ler capítulo 4": quase o mesmo texto, outra coisa a fazer. Número diferente = item diferente
    if _numeros(a) != _numeros(b):
        return False
    return parecido(a, b) >= limite


def itens_novos(propostos: list[str], existentes: list[str], maximo: int = ITENS_POR_TEXTO) -> list[str]:
    """Os itens propostos que de fato acrescentam: sem vazio, sem repetir o que já existe (nem entre si), cortados
    no tamanho e na quantidade em código (pedir no prompt não basta)."""
    aceitos: list[str] = []
    for item in propostos:
        item = truncar(item, ITEM_MAX)
        if not normalizar(item):
            continue
        if any(_mesma_coisa(item, e, _PARECIDO_ITEM) for e in [*existentes, *aceitos]):
            continue
        aceitos.append(item)
        if len(aceitos) == maximo:
            break
    return aceitos


def juntar_termos(atuais: list[str], novos: list[str], maximo: int = TERMOS_POR_TAREFA) -> list[str]:
    vistos = {normalizar(t) for t in atuais}
    resultado = list(atuais)
    for t in novos:
        t = truncar(t, 40)
        if normalizar(t) and normalizar(t) not in vistos and len(resultado) < maximo:
            vistos.add(normalizar(t))
            resultado.append(t)
    return resultado


def _cita(texto_norm: str, termo: str) -> bool:
    termo = normalizar(termo)
    return bool(termo) and f" {termo} " in f" {texto_norm} "


@dataclass
class Revisao:
    """O que fazer com um texto depois da trava. `perguntar=False` = pode encaixar sem falar com o chefe."""
    perguntar: bool
    tipo: str | None = None          # 'destino' (de qual tarefa/frente?) ou 'mesma_tarefa' (é a mesma que X?)
    motivo: str | None = None        # por que a trava disparou (vai para o teste e para o log, não para a tela)
    parecida_id: int | None = None   # em 'mesma_tarefa', a tarefa que já existe
    candidatos: tuple[int, ...] = ()  # tarefas que fazem sentido oferecer como opção


def revisar_decisao(
    texto: str,
    destino: str,
    tarefa_id: int | None,
    nova_titulo: str | None,
    nova_frente_id: int | None,
    confianca: str,
    candidatos_llm: list[int],
    tarefas: list[dict],
) -> Revisao:
    """`tarefas`: as abertas, cada uma com id, frente_id, titulo e termos (as mesmas que foram para o LLM)."""
    por_id = {t["id"]: t for t in tarefas}
    texto_norm = normalizar(texto)
    candidatos = tuple(dict.fromkeys(c for c in [*([tarefa_id] if tarefa_id else []), *candidatos_llm] if c in por_id))[:3]

    # termos citados no texto -> quais tarefas e frentes eles apontam
    citados: dict[str, set[int]] = {}
    for t in tarefas:
        for termo in t["termos"] or []:
            if _cita(texto_norm, termo):
                citados.setdefault(normalizar(termo), set()).add(t["id"])

    if confianca != "certa":
        return Revisao(True, "destino", "a Pauta ficou em dúvida", candidatos=candidatos)

    if destino == "existente":
        escolhida = por_id[tarefa_id]
        termos_da_escolhida = {normalizar(x) for x in escolhida["termos"] or []}
        exclusivo = any(ids == {tarefa_id} for termo, ids in citados.items() if termo in termos_da_escolhida)
        if not exclusivo and citados:
            tarefas_citadas = set().union(*citados.values())
            frentes = {por_id[i]["frente_id"] for i in tarefas_citadas}
            if tarefa_id not in tarefas_citadas:
                outras = tuple(sorted(tarefas_citadas))[:3]
                return Revisao(True, "destino", "o texto cita termo de outra tarefa", candidatos=(tarefa_id, *outras)[:3])
            if len(frentes) > 1:
                return Revisao(True, "destino", "termo citado existe em frentes diferentes",
                               candidatos=tuple(dict.fromkeys([tarefa_id, *sorted(tarefas_citadas)]))[:3])
        elif not citados and not (palavras(texto) & palavras(escolhida["titulo"])):
            return Revisao(True, "destino", "o destino não tem nada em comum com o texto", candidatos=candidatos)
        return Revisao(False)

    # tarefa nova: parece uma que já existe na mesma frente?
    for t in tarefas:
        if t["frente_id"] != nova_frente_id:
            continue
        pa, pb = palavras(nova_titulo or ""), palavras(t["titulo"])
        em_comum = len(pa & pb) / max(1, min(len(pa), len(pb)))
        if parecido(nova_titulo or "", t["titulo"]) >= _PARECIDO_TITULO or (pa and pb and em_comum >= _PALAVRAS_EM_COMUM_TITULO):
            return Revisao(True, "mesma_tarefa", "título parecido com uma tarefa aberta", parecida_id=t["id"])
    # cita termo de tarefa existente mas o LLM quis criar outra: pergunta (pode ser contexto da existente)
    if citados:
        tarefas_citadas = tuple(sorted(set().union(*citados.values())))[:3]
        return Revisao(True, "destino", "tarefa nova, mas o texto cita termo de tarefa existente", candidatos=tarefas_citadas)
    return Revisao(False)


def topicos_validos(propostos: list[tuple[str, list[int]]], fontes_validas: set[int]) -> list[tuple[str, list[int]]]:
    """O "o que já se sabe" que o código aceita do LLM (P3). Cada tópico precisa apontar ao menos um texto que de fato
    existe naquela tarefa: tópico sem fonte (ou com fonte inventada) pode ser invenção e é descartado. Repetido com
    outras palavras se funde no primeiro (somando as fontes). Tamanho e quantidade cortados aqui, não no prompt."""
    aceitos: list[tuple[str, list[int]]] = []
    for texto, fontes in propostos:
        texto = truncar(texto, TOPICO_MAX)
        fontes = list(dict.fromkeys(f for f in fontes if f in fontes_validas))
        if not normalizar(texto) or not fontes:
            continue
        igual = next((i for i, (t, _) in enumerate(aceitos) if _mesma_coisa(t, texto, _PARECIDO_ITEM)), None)
        if igual is not None:
            t, f = aceitos[igual]
            aceitos[igual] = (t, list(dict.fromkeys([*f, *fontes])))
            continue
        if len(aceitos) < TOPICOS_POR_TAREFA:
            aceitos.append((texto, fontes))
    return aceitos


def impressao_da_tarefa(tarefa: dict) -> str:
    """Impressão digital do que importa para sugerir o próximo passo (P4): título, prazo, checklist (texto e se está
    feito, na ordem) e contexto. Mesma impressão = nada mudou = a sugestão anterior continua valendo, sem chamar o LLM.
    Normaliza o texto (caixa, acento, espaço) para uma correção de digitação não custar uma chamada nova."""
    dado = {
        "titulo": normalizar(tarefa["titulo"]),
        "prazo": str(tarefa.get("prazo") or ""),
        "itens": [[normalizar(i["texto"]), bool(i["feito"])] for i in tarefa.get("checklist", [])],
        "contexto": [normalizar(c["texto"]) for c in tarefa.get("contexto", [])],
    }
    return hashlib.sha256(json.dumps(dado, ensure_ascii=False).encode()).hexdigest()


def sugestao_valida(proximo_passo: str, como: list[str], por_que: str, descartadas: list[str]) -> tuple[str, list[str], str]:
    """O que o código aceita da sugestão: curta (pedido do chefe: nada de texto longo), com passo de verdade, e sem
    repetir uma que ele já descartou. ValueError com o motivo, para virar falha visível."""
    passo = truncar(proximo_passo or "", PASSO_MAX)
    if not normalizar(passo):
        raise ValueError("A Pauta não sugeriu nenhum passo.")
    if any(_mesma_coisa(passo, d, _PARECIDO_ITEM) for d in descartadas if d):
        raise ValueError("A Pauta repetiu uma sugestão que você já descartou.")
    passos = [truncar(c, COMO_MAX) for c in como if normalizar(c)][:COMO_PASSOS]
    return passo, passos, truncar(por_que or "", POR_QUE_MAX)


def item_equivalente(texto: str, itens: list[dict]) -> dict | None:
    """Item pendente do checklist que já diz o mesmo: aceitar a sugestão sobe ele para o topo em vez de duplicar."""
    return next((i for i in itens if not i["feito"] and _mesma_coisa(texto, i["texto"], _PARECIDO_ITEM)), None)


# ------------------------------------------------------------------------------------------- P5: clarear a vista

FOCO_MAX = 3
ESPERAR_MAX = 5
TALVEZ_MAX = 3
DIAS_PRAZO_PERTO = 2


def _dia(valor) -> date | None:
    """Data no fuso do chefe. O banco devolve o horário em UTC: o `.date()` direto erra o dia entre 21h e meia-noite."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.astimezone(ZoneInfo(settings.timezone_padrao)).date() if valor.tzinfo else valor.date()
    return valor


def urgencia(tarefa: dict, hoje: date) -> float:
    """Conta pura para ordenar as tarefas antes do LLM (e para decidir sozinha quando há uma tarefa só): prazo vencido
    na frente de tudo, depois prazo perto, depois o tempo parada (até 30 dias contam)."""
    pontos = 0.0
    prazo = _dia(tarefa.get("prazo"))
    if prazo is not None:
        dias = (prazo - hoje).days
        pontos += 1000 + (-dias) * 10 if dias < 0 else max(0, 500 - dias * 30)
    parada = _dia(tarefa.get("ultimo_movimento_em"))
    if parada is not None:
        pontos += min(30, (hoje - parada).days) * 2
    return pontos


def impressao_geral(tarefas: list[dict], hoje: date) -> str:
    """Impressão de todas as abertas + o dia: mesma situação no mesmo dia = mesma revisão, sem chamar o LLM."""
    dado = [hoje.isoformat()] + sorted(
        [t["id"], normalizar(t["titulo"]), str(t.get("prazo") or ""), int(t["itens_total"]), int(t["itens_feitos"]),
         str(_dia(t.get("ultimo_movimento_em")) or "")]
        for t in tarefas
    )
    return hashlib.sha256(json.dumps(dado, ensure_ascii=False).encode()).hexdigest()


@dataclass
class ItemRevisao:
    tarefa_id: int
    por_que: str
    acao: str | None = None
    juntar_com: int | None = None


@dataclass
class Revisao5:
    foco: list[ItemRevisao] = field(default_factory=list)
    pode_esperar: list[ItemRevisao] = field(default_factory=list)
    talvez_nem_valha: list[ItemRevisao] = field(default_factory=list)


def revisao_valida(foco: list[ItemRevisao], esperar: list[ItemRevisao], talvez: list[ItemRevisao],
                   tarefas: dict[int, dict], hoje: date) -> Revisao5:
    """O que o código aceita da revisão: só tarefas abertas de verdade, cada uma em um grupo só (foco ganha), nos
    limites de quantidade, e sem contradição com o prazo: tarefa com prazo em até 2 dias nunca "pode esperar".
    Juntar só com outra tarefa aberta; ação que não fecha vira informação (sem ação)."""
    vistas: set[int] = set()
    r = Revisao5()

    def aceitar(item: ItemRevisao, destino: list, maximo: int) -> None:
        if item.tarefa_id not in tarefas or item.tarefa_id in vistas or len(destino) >= maximo:
            return
        vistas.add(item.tarefa_id)
        destino.append(ItemRevisao(item.tarefa_id, truncar(item.por_que or "", POR_QUE_MAX), item.acao, item.juntar_com))

    for item in foco:
        aceitar(item, r.foco, FOCO_MAX)
    for item in esperar:
        prazo = _dia(tarefas.get(item.tarefa_id, {}).get("prazo"))
        if prazo is not None and (prazo - hoje).days <= DIAS_PRAZO_PERTO:
            continue
        aceitar(item, r.pode_esperar, ESPERAR_MAX)
    for item in talvez:
        acao = item.acao if item.acao in ("arquivar", "juntar") else None
        juntar = item.juntar_com if acao == "juntar" else None
        if acao == "juntar" and (juntar not in tarefas or juntar == item.tarefa_id):
            acao, juntar = None, None
        aceitar(ItemRevisao(item.tarefa_id, item.por_que, acao, juntar), r.talvez_nem_valha, TALVEZ_MAX)
    return r
