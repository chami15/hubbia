"""Registro central de execução de LLM — a tabela `tick_execucoes`.

Existe porque até aqui cada domínio guardava o próprio custo na própria
tabela (`refeicoes.custo_usd`, `cards.custo_usd`, ...) e o orçamento
diário era um UNION escrito à mão sobre esses nomes. Duas consequências
ruins disso, as duas já observadas de verdade:

  * domínio novo que gasta LLM e não é adicionado naquela query gasta
    invisível ao guardrail — falha silenciosa, o tipo que este projeto
    inteiro se organiza pra não cometer;
  * a Agenda, que é o único agente com tool-calling (várias idas e
    voltas por pedido, o mais caro do hub), nunca gravou custo em tabela
    nenhuma — era invisível ao orçamento desde sempre.

Com tudo passando por aqui, o orçamento vira uma query sobre uma tabela
só, e agente novo entra na contabilidade sem editar SQL de ninguém.

REGRA CENTRAL DESTE MÓDULO: registrar NUNCA pode derrubar o trabalho de
verdade. Se gravar a auditoria falhar, o relatório do mês continua
existindo. Por isso todo caminho aqui engole a própria exceção e no
máximo imprime um aviso — é o oposto da disciplina do resto do hub
(onde falha vira erro claro), e é deliberado: log que quebra o que
estava logando é pior que log nenhum.
"""
import time
from contextlib import contextmanager

from utils.query_executor import executar_query


@contextmanager
def cronometrar():
    """Mede quanto tempo o bloco levou, em ms.

        with cronometrar() as t:
            resultado = await modelo.ainvoke(prompt)
        registrar_execucao(..., duracao_ms=t.ms)

    Fica em volta da chamada e NÃO dentro de `registrar_execucao` porque
    o que interessa medir é o tempo do MODELO, não o do nosso INSERT.
    Usa `perf_counter` (monotônico) em vez do relógio de parede: ajuste
    de horário no meio da medição não vira latência negativa.

    O tempo é contado mesmo quando o bloco levanta exceção — chamada que
    demorou 30s e estourou é justamente a que mais interessa num painel
    de monitoramento."""
    marca = type("Cronometro", (), {"ms": None})()
    inicio = time.perf_counter()
    try:
        yield marca
    finally:
        marca.ms = int((time.perf_counter() - inicio) * 1000)

# Prompt e saída crua entram truncados. São pra replay/diagnóstico, não
# pro dado em si — e o Norte manda contexto de repositório inteiro, que
# encheria o banco sem nunca ser lido até o fim.
_LIMITE_TEXTO = 4000


def _cortar(texto: str | None) -> str | None:
    if texto is None:
        return None
    if len(texto) <= _LIMITE_TEXTO:
        return texto
    return texto[:_LIMITE_TEXTO] + f"\n… [truncado, {len(texto)} chars no original]"


def _agente_id_de(especialidade: str) -> int | None:
    rows = executar_query("agentes:buscar_por_especialidade", params=(especialidade,))
    return rows[0]["id"] if rows else None


def _tick_atual() -> int | None:
    rows = executar_query("ticks:buscar_ultimo")
    return rows[0]["numero"] if rows else None


def registrar_execucao(
    especialidade: str,
    modelo: str,
    tokens_in: int = 0,
    tokens_out: int = 0,
    custo_usd: float = 0.0,
    contexto_prompt: str | None = None,
    saida_bruta: str | None = None,
    erro: str | None = None,
    dry_run: bool = False,
    duracao_ms: int | None = None,
) -> None:
    """Grava uma chamada de LLM em `tick_execucoes`.

    `especialidade` (não o id numérico) porque é o que cada módulo de
    agente sabe sobre si mesmo estaticamente — o id vive no banco e
    muda de ambiente pra ambiente. É a mesma chave de junção que o
    frontend já usa pra ligar crachá a agente (ver guia-tecnico, Parte 10).

    `tick` pode vir nulo: chamada disparada pelo chefe (gerar relatório,
    conversar com a Agenda) acontece FORA de um tick, e isso é
    informação legítima — não é dado faltando, é "aconteceu entre dois
    ticks".
    """
    try:
        agente_id = _agente_id_de(especialidade)
        if agente_id is None:
            print(f"[execucoes] AVISO: especialidade {especialidade!r} não existe em `agentes` — nada registrado.")
            return

        executar_query(
            "tick_execucoes:inserir",
            returning=True,
            params=(
                _tick_atual(),
                agente_id,
                modelo,
                _cortar(contexto_prompt),
                _cortar(saida_bruta),
                None,  # acao_parseada: reservado, ver docstring do módulo
                tokens_in,
                tokens_out,
                custo_usd,
                dry_run,
                erro,
                duracao_ms,
            ),
        )
    except Exception as exc:  # noqa: BLE001 — ver REGRA CENTRAL no topo
        print(f"[execucoes] AVISO: falha ao registrar execução de {especialidade!r}: {exc}")
