"""Orquestra o domínio do Norte: projetos (repositórios do GitHub) e cards
(sugestão de próximo passo, um por vez, por projeto).

Guardrail central deste domínio (pedido explícito na conversa de design):
o agente só é acionado (LLM chamada) em dois momentos específicos —
(1) o chefe clica pra gerar o card quando o projeto não tem nenhum card
ativo, ou (2) resolver (aceitar->finalizar, ou rejeitar) o card atual
dispara a geração do próximo automaticamente. NUNCA em qualquer outro
momento. `_garantir_sem_card_ativo` é checado ANTES de qualquer chamada
de GitHub/LLM — nunca gasta chamada nenhuma só pra descobrir depois que
já existe um card em aberto; a UNIQUE INDEX em `cards` é só o backstop.
"""
import json
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from agents.norte import agente as agente_norte
from agents.norte import github_client
from config import settings
from utils.query_executor import executar_query

_HISTORICO_CARDS_LIMITE = 10

_PADRAO_URL_GITHUB = re.compile(r"github\.com[:/]([^/]+)/([^/.]+?)(\.git)?/?$")


def _parse_repositorio_url(url: str) -> tuple[str, str]:
    match = _PADRAO_URL_GITHUB.search(url.strip())
    if not match:
        raise ValueError(
            f"Não consegui reconhecer '{url}' como uma URL de repositório do GitHub "
            "(ex: https://github.com/dono/repositorio)."
        )
    return match.group(1), match.group(2)


def _garantir_sem_card_ativo(projeto_id: int) -> None:
    ativo = obter_card_ativo(projeto_id)
    if ativo:
        raise ValueError(
            f"Já existe um card '{ativo['status']}' (id={ativo['id']}) pra esse projeto — "
            "resolva-o (aceite/rejeite, ou finalize) antes de gerar outro."
        )


# --------------------------------------------------------------------------
# Projetos
# --------------------------------------------------------------------------

def listar_branches_disponiveis(repositorio_url: str) -> list[str]:
    owner, repo = _parse_repositorio_url(repositorio_url)
    return github_client.listar_branches(owner, repo)


async def criar_projeto(nome: str, repositorio_url: str, branch: str | None = None) -> dict:
    """Se `branch` vier, valida contra as branches reais do repositório
    ANTES de qualquer chamada de LLM — nunca deixa cadastrar apontando
    pra uma branch que não existe. Se não vier, resolve a default branch
    do GitHub. De qualquer forma, o valor CONCRETO escolhido fica
    guardado em `projetos.branch` — nunca mais re-resolvido depois."""
    owner, repo = _parse_repositorio_url(repositorio_url)

    if branch:
        branches_existentes = github_client.listar_branches(owner, repo)
        if branch not in branches_existentes:
            raise ValueError(
                f"Branch '{branch}' não existe em {owner}/{repo}. "
                f"Branches disponíveis: {', '.join(branches_existentes)}."
            )
    else:
        branch = github_client.obter_branch_padrao(owner, repo)

    arvore_raiz = github_client.obter_arvore_raiz(owner, repo, branch)
    readme = github_client.obter_readme(owner, repo, branch)
    manifests = github_client.obter_manifest(owner, repo, branch, arvore_raiz)
    commit_atual = github_client.obter_commit_mais_recente(owner, repo, branch)

    resultado = await agente_norte.escanear_projeto(arvore_raiz, readme, manifests)
    escaneamento = resultado["dado"]

    rows = executar_query(
        "projetos:inserir",
        returning=True,
        params=(
            nome,
            repositorio_url,
            owner,
            repo,
            branch,
            escaneamento.descricao,
            escaneamento.stack,
            escaneamento.arquitetura_resumo,
            commit_atual["sha"],
        ),
    )
    return rows[0]


def listar_projetos() -> list[dict]:
    # mesmo cálculo de cutoff que resolvers/interacao.py:_checar_norte usa
    # pra decidir proatividade — aqui é só leitura, exibida em TODO
    # projeto (lá é achar o mais parado, um só, pra gerar aviso de trabalho)
    limite = datetime.now(ZoneInfo(settings.timezone_padrao)) - timedelta(
        days=settings.interacao_dias_estagnacao_norte
    )
    return executar_query("projetos:listar", params=(limite,))


def obter_projeto(projeto_id: int) -> dict:
    rows = executar_query("projetos:buscar_por_id", params=(projeto_id,))
    if not rows:
        raise ValueError(f"Projeto {projeto_id} não encontrado.")
    return rows[0]


def atualizar_status_projeto(projeto_id: int, status: str) -> dict:
    rows = executar_query("projetos:atualizar_status", returning=True, params=(status, projeto_id))
    if not rows:
        raise ValueError(f"Projeto {projeto_id} não encontrado.")
    return rows[0]


# --------------------------------------------------------------------------
# Cards
# --------------------------------------------------------------------------

def obter_card_ativo(projeto_id: int) -> dict | None:
    rows = executar_query("cards:buscar_ativo_por_projeto", params=(projeto_id,))
    return rows[0] if rows else None


def listar_historico_cards(projeto_id: int, limite: int = _HISTORICO_CARDS_LIMITE) -> list[dict]:
    return executar_query("cards:historico_por_projeto", params=(projeto_id, limite))


async def gerar_proximo_card(projeto_id: int) -> dict:
    """Guardrail principal do domínio: nunca chama GitHub/LLM se já
    existe um card não-terminado pra esse projeto."""
    _garantir_sem_card_ativo(projeto_id)

    projeto = obter_projeto(projeto_id)
    owner, repo, branch = projeto["repositorio_owner"], projeto["repositorio_nome"], projeto["branch"]

    commit_atual = github_client.obter_commit_mais_recente(owner, repo, branch)
    if projeto["ultimo_commit_sha"]:
        mudancas = github_client.obter_mudancas_desde(owner, repo, projeto["ultimo_commit_sha"], commit_atual["sha"])
    else:
        mudancas = {"commits": [commit_atual], "arquivos_alterados": []}

    contexto_projeto = {
        "nome": projeto["nome"],
        "descricao": projeto["descricao"],
        "stack": projeto["stack"],
        "arquitetura_resumo": projeto["arquitetura_resumo"],
    }
    historico = listar_historico_cards(projeto_id)

    resultado = await agente_norte.gerar_card(contexto_projeto, mudancas, historico)
    card_gerado = resultado["dado"]

    rows = executar_query(
        "cards:inserir",
        returning=True,
        params=(
            projeto_id,
            card_gerado.tipo,
            card_gerado.titulo,
            card_gerado.descricao,
            card_gerado.arquivos_afetados,
            "agente",
            "sugerido",
            resultado["modelo"],
            resultado["tokens_in"],
            resultado["tokens_out"],
            resultado["custo_usd"],
        ),
    )
    executar_query("projetos:atualizar_ultimo_commit_sha", commit=True, params=(commit_atual["sha"], projeto_id))
    return rows[0]


def criar_card_manual(projeto_id: int, tipo: str, titulo: str, descricao: str, arquivos_afetados: list[str]) -> dict:
    """Card criado pelo próprio chefe, sem esperar sugestão do agente —
    entra direto como 'aceito' (já é uma decisão sua, não uma sugestão a
    revisar), mas respeita a MESMA regra de só 1 card ativo por projeto."""
    _garantir_sem_card_ativo(projeto_id)
    rows = executar_query(
        "cards:inserir",
        returning=True,
        params=(projeto_id, tipo, titulo, descricao, arquivos_afetados, "manual", "aceito", None, 0, 0, 0),
    )
    return rows[0]


def _buscar_card(card_id: int) -> dict:
    rows = executar_query("cards:buscar_por_id", params=(card_id,))
    if not rows:
        raise ValueError(f"Card {card_id} não encontrado.")
    return rows[0]


def aceitar_card(card_id: int) -> dict:
    card = _buscar_card(card_id)
    if card["status"] != "sugerido":
        raise ValueError(f"Card {card_id} não está aguardando decisão (está '{card['status']}').")
    executar_query("cards:marcar_aceito", commit=True, params=(card_id,))
    return _buscar_card(card_id)


async def rejeitar_card(card_id: int) -> dict:
    card = _buscar_card(card_id)
    if card["status"] != "sugerido":
        raise ValueError(f"Card {card_id} não está aguardando decisão (está '{card['status']}').")
    executar_query("cards:marcar_rejeitado", commit=True, params=(card_id,))
    return await _resolver_e_encadear_proximo(card_id, card["projeto_id"])


async def finalizar_card(card_id: int) -> dict:
    card = _buscar_card(card_id)
    if card["status"] != "aceito":
        raise ValueError(f"Card {card_id} não está em andamento (está '{card['status']}').")
    executar_query("cards:marcar_finalizado", commit=True, params=(card_id,))
    return await _resolver_e_encadear_proximo(card_id, card["projeto_id"])


async def _resolver_e_encadear_proximo(card_id: int, projeto_id: int) -> dict:
    """Depois de resolver um card (rejeitado/finalizado), gera o próximo
    automaticamente — mesmo padrão que o Agenda já usa ao rejeitar uma
    proposta. Se a geração do próximo falhar, o card já resolvido
    continua resolvido (isso já aconteceu de verdade); só avisa que o
    encadeamento não deu certo, em vez de esconder o problema."""
    card_resolvido = _buscar_card(card_id)
    resultado = {"card_resolvido": card_resolvido, "proximo_card": None, "aviso": None}
    try:
        resultado["proximo_card"] = await gerar_proximo_card(projeto_id)
    except Exception as exc:
        resultado["aviso"] = f"Card resolvido, mas não consegui gerar o próximo automaticamente: {exc}"
    return resultado
