"""Regras determinísticas da Pauta (P2): o que o código decide sem perguntar ao LLM, e o que ele recusa do LLM.

Tudo aqui é puro (sem banco, sem rede) de propósito: são as partes frágeis da organização e precisam de teste
caso a caso (tests/test_pauta_regras.py). O resolver só junta isto com o banco.

- `mascarar_segredos`: chave e token colados junto com os endpoints nunca saem do banco.
- `itens_novos`: o checklist só cresce com o que é novo (nem igual, nem "o mesmo com outras palavras").
- `revisar_decisao`: a trava que não depende do LLM. Mesmo quando ele diz que tem certeza, vira pergunta se o
  texto cita um termo de tarefas de frentes diferentes, se o destino não tem nada a ver com o texto, ou se a
  "tarefa nova" parece uma que já existe. Na dúvida, pergunta; nunca chuta.
"""
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from resolvers.pauta import normalizar

TITULO_MAX = 80
ITEM_MAX = 120
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
