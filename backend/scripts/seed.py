"""Popula os agentes iniciais e os relacionamentos-base.

Idempotente: pode rodar quantas vezes quiser.
Uso (a partir da pasta backend/):  python -m scripts.seed
"""
import itertools
import json

from utils.query_executor import executar_query

# Agentes iniciais. O chefe é você (tipo='chefe'); os demais são colaboradores.
# `mesa` é só a posição no escritório 2D. `personalidade` é o prompt-base
# (placeholder curto por enquanto — a versão real fica em agents/<tipo>/).
AGENTES = [
    {
        "nome": "Você",
        "tipo": "chefe",
        "especialidade": "chefe",
        "personalidade": None,
        "avatar_config": {"cor": "#111827", "rosto": "🧑‍💼"},
        "mesa": 0,
        "extroversao": 5,
    },
    {
        "nome": "Cifra",
        "tipo": "colaborador",
        "especialidade": "financeiro",
        "personalidade": (
            "Você é o agente Financeiro. Metódico, cauteloso e um pouco "
            "controlador. Cuida de gastos e orçamento. NUNCA move dinheiro de "
            "verdade sem confirmação explícita do chefe."
        ),
        "avatar_config": {"cor": "#16a34a", "rosto": "🤑"},
        "mesa": 1,
        "extroversao": 5,
    },
    {
        "nome": "Agenda",
        "tipo": "colaborador",
        "especialidade": "agenda",
        "personalidade": (
            "Você é o agente de Agenda. Organizado, direto e ansioso com prazos. "
            "Cuida de compromissos e do calendário do chefe."
        ),
        "avatar_config": {"cor": "#2563eb", "rosto": "📅"},
        "mesa": 2,
        "extroversao": 6,
    },
    {
        "nome": "Vita",
        "tipo": "colaborador",
        "especialidade": "saude",
        "personalidade": (
            "Você é o agente de Saúde. Direto, sem rodeio, nunca alarmista. "
            "Cuida de alimentação, peso, sono, hidratação e atividade física do chefe."
        ),
        "avatar_config": {"cor": "#f97316", "rosto": "💪"},
        "mesa": 3,
        "extroversao": 8,
    },
    {
        "nome": "Norte",
        "tipo": "colaborador",
        "especialidade": "norte",
        "personalidade": (
            "Você é o agente Norte. Direto, objetivo, focado em manter o momentum "
            "dos projetos pessoais do chefe. Sugere sempre UM passo concreto por "
            "vez, nunca uma lista — e nunca insiste na mesma sugestão já rejeitada."
        ),
        "avatar_config": {"cor": "#0891b2", "rosto": "🧭"},
        "mesa": 4,
        "extroversao": 3,
    },
    {
        "nome": "Motriz",
        "tipo": "colaborador",
        "especialidade": "infra",
        # personalidade existe só pro papo social — Motriz é o único
        # agente que NUNCA usa LLM pro próprio trabalho (checagem de
        # saúde é booleano e subtração, ver resolvers/infra.py)
        "personalidade": (
            "Você é o Motriz, da sala de máquinas. Cuida do que mantém o "
            "escritório de pé: orçamento, chaves, conexões. Seco, avisa o "
            "problema e a solução, sem drama e sem enfeite."
        ),
        "avatar_config": {"cor": "#a855f7", "rosto": "⚙️"},
        # sem mesa: a sala de máquinas ainda não existe como ambiente no
        # escritório isométrico. Quando existir, é só dar um número aqui
        # e colocar um móvel com `agente: "motriz"` no JSON da sala.
        "mesa": None,
        # extroversão baixa de propósito: ele trabalha em todo tick (é de
        # graça), então quase nunca sobra turno pro social — e um agente
        # de infra tagarela seria ruído em cima de ruído
        "extroversao": 2,
    },
]

# Pool curado manualmente pro módulo de interação, Etapa 2 (camada
# social) — gancho de conversa social entre os agentes. Sem geração por
# LLM nesta fase (ver conversa de design). Seed só insere se a tabela
# estiver vazia — não é upsert, então rodar de novo não duplica.
#
# Sem entrada de dia-da-semana/fim-de-semana aqui de propósito — achado
# testando de verdade: como o sorteio é aleatório, um tick podia sortear
# "sextou" e outro (mesmo dia real) sortear "segunda-feira", contradição
# entre agentes. Isso agora vem de `_fato_do_dia()` em
# `resolvers/interacao.py`, derivado de `ticks.hora_simulada` — sempre
# consistente, porque é calculado, não sorteado.
EVENTOS_MUNDO = [
    "Hoje está fazendo muito calor.",
    "Choveu bastante essa madrugada.",
    "Rolou clássico de futebol no fim de semana.",
    "O trânsito hoje estava um caos.",
    "É dia de pagamento.",
    "Tem jogo de futebol hoje à noite.",
    "O tempo virou e esfriou de repente.",
]


def main() -> None:
    ids: dict[str, int] = {}

    for a in AGENTES:
        rows = executar_query(
            "agentes:upsert",
            returning=True,
            params=(
                a["nome"],
                a["tipo"],
                a["especialidade"],
                a["personalidade"],
                json.dumps(a["avatar_config"]),
                a["mesa"],
                a["extroversao"],
            ),
        )
        row = rows[0]
        ids[row["nome"]] = row["id"]
        print(f"  agente ok: {row['nome']} (id={row['id']})")

    # Relacionamento-base: todo par ORDENADO de agentes começa neutro.
    # Cada agente guarda a própria visão do outro (inclusive do chefe).
    for origem, destino in itertools.permutations(ids.values(), 2):
        executar_query(
            "relacionamentos:upsert_neutro",
            commit=True,
            params=(origem, destino),
        )

    total_eventos = executar_query("eventos_mundo:contar")[0]["total"]
    if total_eventos == 0:
        for descricao in EVENTOS_MUNDO:
            executar_query("eventos_mundo:inserir", returning=True, params=(descricao, None))
        print(f"  eventos_mundo ok: {len(EVENTOS_MUNDO)} eventos inseridos.")
    else:
        print(f"  eventos_mundo ok: já existem {total_eventos}, nada inserido.")

    print("Seed OK.")


if __name__ == "__main__":
    main()
