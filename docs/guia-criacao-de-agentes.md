# Guia — Como criar um agente novo no hub

> Documento de referência técnica. Se você (humano ou IA) vai adicionar
> um agente novo, leia isto inteiro antes de escrever a primeira linha de
> código. O objetivo é que o quinto agente (e o sexto, e o décimo) sigam
> o mesmo padrão dos quatro primeiros sem reinventar decisão já tomada.

---

## 1. O processo — da ideia à aprovação

**Nunca começa pelo código.** A ordem é sempre:

1. **Idealização**: o dono do produto descreve a essência do que quer —
   qual dor, qual comportamento deveria mudar, o que ele imagina na
   prática.
2. **Debate de design**, em rodadas, cobrindo pelo menos:
   - Qual é o domínio de dado (tabelas, o que precisa ser guardado)?
   - Qual é o **padrão de interação**: chat, forms, dashboard, cards? (ver
     seção 3 — isso não é estético, define a arquitetura toda.)
   - Onde exatamente entra LLM, e onde é puramente determinístico? (regra
     geral: LLM só onde há uma estimativa/síntese/decisão real a fazer —
     nunca pra registro estruturado que já tem os dados prontos.)
   - O agente precisa **raciocinar/explorar** antes de decidir (padrão B,
     seção 4), ou o resolver já consegue calcular tudo que o LLM precisa
     saber antes da chamada (padrão A, o padrão default)?
   - Existe ação que mexe em **sistema externo de verdade**? Se sim, gate
     de confirmação humana é obrigatório (ver seção 6). Se a escrita fica
     só no nosso banco, geralmente não precisa.
   - Qual guardrail esse domínio específico exige? (todo domínio tem pelo
     menos um ponto de risco de alucinação/custo — identificar antes de
     codar, não depois de um bug em produção.)
   - O que fica **deliberadamente fora de escopo** agora? Vai pro
     `docs/backlog-futuro.md`, com o porquê.
3. **Aprovação explícita** do dono do produto antes de implementar
   (nunca assumir "pode" — esperar confirmação).
4. **Implementação**, seguindo a estrutura de pastas da seção 2.
5. **Teste rigoroso** (seção 7) — só depois disso o agente é considerado
   pronto.
6. **Documentar**: atualizar `docs/backlog-futuro.md` (o que ficou pra
   depois), `docs/frontend-design.md` (padrão de interação, pro frontend
   saber o que esperar) e `docs/produto-e-sprints.md` se mudar o
   panorama geral.

---

## 2. Estrutura de pastas — onde mexer

Todo agente novo, domínio `<dominio>`, cria/mexe exatamente nestes
lugares (usando o Saúde e o Norte como referência real):

```
db/migrations/NNN_<dominio>.sql   # próximo número sequencial, nunca edita uma migration já aplicada
sql/<entidade>.sql                 # uma ou mais, uma por tabela/agrupamento lógico de queries
agents/<dominio>/
  __init__.py                      # vazio
  agente.py                        # chamadas de LLM (padrão A ou B, ver seção 4)
  <cliente_externo>.py             # se houver integração externa (ex: github_client.py, google_calendar.py)
  tools.py                          # só se for padrão B (agente com tool-calling)
resolvers/<dominio>.py             # regra de negócio + guardrails — o router NUNCA fala com o banco direto
routers/<dominio>.py               # HTTP fino — só parse de request/response e mapeamento de erro pra status code
scripts/seed.py                    # adicionar uma entrada na lista AGENTES (nome, especialidade, avatar_config, mesa)
main.py                            # app.include_router(<dominio>.router)
```

Se precisar de credencial externa (OAuth, API key): adicionar em
`config.py` (nunca hardcode), documentar em `.env.example` com comentário
explicando pra que serve, e adicionar ao `.gitignore` qualquer arquivo de
token/credencial gerado (nunca comitar).

Se precisar de setup manual único (autorização OAuth, por exemplo): um
script em `scripts/autorizar_<dominio>.py`, e documentar o passo no
`README.md` na seção "Antes de usar de verdade".

---

## 3. Padrão de interação — decidir ANTES de codar

Não existe "chat" como padrão default. Cada agente usa o padrão mais
barato/determinístico que o domínio permitir:

| Padrão | Quando usar | Exemplo real |
|---|---|---|
| **Dashboard/painel** | Dado que já existe, só precisa ser calculado e mostrado | Financeiro |
| **Forms/menu de ações** | Registro estruturado, várias ações discretas e independentes | Saúde |
| **Cards (fila de 1)** | Sugestão que precisa de revisão humana antes de virar ação, mas não é uma negociação de mão-dupla | Norte |
| **Chat roteado por palavra-chave** | Precisa de linguagem natural de entrada, mas o roteamento em si é determinístico | Agenda (consulta direta) |
| **Chat com agente de verdade (tools)** | Precisa negociar/explorar antes de decidir | Agenda (negociação de horário) |

Chat livre de verdade (sem roteamento, sem tools, LLM decidindo tudo a
cada mensagem) **não é usado em nenhum agente do hub hoje** — foi
avaliado e rejeitado explicitamente na conversa de design do Agenda e de
novo na do Norte, por custo/controle. Se um agente futuro parecer
precisar disso, questione a premissa antes de implementar.

---

## 4. Os dois padrões de chamada de LLM

### Padrão A (default): chamada estruturada única, sem tool-calling

Usado quando o resolver já consegue montar todo o contexto que o LLM
precisa ANTES da chamada — o LLM só interpreta/estima/narra, nunca
decide "qual ferramenta chamar".

```python
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field
from config import settings

class MinhaSaida(BaseModel):
    campo: str = Field(..., description="Descrição clara — isso é lido pelo LLM, não é só documentação.")

_model = None

def _get_model():
    global _model
    if _model is None:
        base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.2)
        _model = base.with_structured_output(MinhaSaida, include_raw=True)  # include_raw=True SEMPRE
    return _model

async def minha_chamada(contexto: dict) -> dict:
    modelo = _get_model()
    try:
        resultado = await modelo.ainvoke(prompt_formatado)
    except Exception as exc:
        raise RuntimeError(f"Falha ao chamar o modelo: {exc}") from exc

    if resultado.get("parsing_error"):
        raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")

    raw = resultado["raw"]
    usage = getattr(raw, "usage_metadata", None) or {}
    # ... monta tokens_in/tokens_out/custo_usd, retorna resultado["parsed"] + metadados
```

Usado por: Financeiro (relatório), Saúde (4 chamadas), Norte (2
chamadas). É o padrão pra 90% dos casos — comece por aqui sempre.

### Padrão B: agente real com tools (`create_agent`)

Só quando o agente precisa **raciocinar/explorar** de verdade antes de
decidir — hoje só o Agenda usa isso (checa conflito de calendário antes
de propor horário). Requisitos obrigatórios:

```python
from langchain.agents import create_agent
from agents._shared.guardrails import MAX_TOOL_CALLS, RECURSION_LIMIT, tratar_erros_tools

agente = create_agent(
    model=model,
    tools=TOOLS,                       # só tools de LEITURA — nunca escrita
    response_format=MinhaDecisao,       # saída SEMPRE estruturada, nunca texto livre solto
    middleware=[tratar_erros_tools],    # OBRIGATÓRIO — ver seção 6
)

resultado = await agente.ainvoke(
    {"messages": [...]},
    config={"recursion_limit": RECURSION_LIMIT},  # OBRIGATÓRIO — teto físico
)
```

Tools ficam em `agents/<dominio>/tools.py`, decoradas com `@tool` do
LangChain, `args_schema` em Pydantic. A **docstring da tool é lida pelo
LLM** pra decidir quando chamar — escreva como instrução, não como
comentário de código:

```python
@tool(args_schema=PeriodoInput)
def listar_eventos_periodo(data_inicio_iso: str, data_fim_iso: str) -> dict:
    """Lista os eventos já marcados num período. Use isso pra saber o que
    já está na agenda antes de sugerir um novo horário — nunca proponha
    um horário sem checar conflito primeiro."""
    try:
        eventos = google_calendar.listar_eventos(data_inicio_iso, data_fim_iso)
    except Exception as exc:
        return {"status": "erro", "detalhe": f"Falha ao listar eventos: {exc}"}
    return {"status": "ok", "eventos": ...}
```

Regras do padrão B:
- Tool **nunca** executa ação de escrita real — só leitura. A escrita
  (criar/mover/cancelar, etc.) é sempre uma consequência de o resolver
  processar a saída estruturada do agente **depois** de confirmação
  humana (se aplicável), nunca dentro do loop de raciocínio.
- Tool sempre captura a própria exceção e devolve `{"status": "erro",
  "detalhe": ...}` em vez de deixar propagar — dá ao LLM informação
  legível pra decidir o que fazer, em vez de um crash.
- **Regra de decisão entre A e B**: comece SEMPRE tentando A. Só suba
  pra B se, depois de tentar montar o contexto todo no resolver, sobrar
  alguma decisão que genuinamente depende de explorar dado durante o
  raciocínio (não só "seria mais fácil deixar o LLM decidir").

---

## 5. Contexto — como os agentes recebem informação

Nenhum agente do hub mantém memória de conversa acumulada sem limite
(isso foi avaliado e descartado — ver o protótipo antigo que inspirou o
Saúde, que usava `ConversationBufferMemory` sem teto e foi
explicitamente rejeitado por causa disso). O padrão é:

- **Padrão A**: o contexto é montado do zero a cada chamada, só com o
  que é relevante PRA AQUELA chamada específica (perfil do chefe,
  dados já calculados, histórico recente limitado por `LIMIT` na query
  — nunca "todo o histórico"). Ver `_calcular_dados_semana` (Saúde) e
  `gerar_proximo_card` (Norte) como referência de "monta só o que
  importa".
- **Padrão B**: o contexto de negociação em andamento é montado
  explicitamente pelo resolver a cada mensagem (ver
  `_montar_contexto_negociacao` no Agenda) — inclui o pedido original e
  a resposta mais recente, não o histórico de conversa inteiro.
- Regra geral: se um dado pode crescer sem limite (histórico de cards,
  histórico de mensagens), sempre popular o contexto com uma consulta
  **limitada** (`LIMIT N`) direto no banco, nunca confiar em truncar do
  lado do prompt depois de já ter montado tudo.

---

## 6. Guardrails — catálogo do que já existe (reusar, não reinventar)

| Guardrail | Onde mora | Quando usar |
|---|---|---|
| `MAX_TOOL_CALLS` + `RECURSION_LIMIT` + `tratar_erros_tools` | `agents/_shared/guardrails.py` | Todo agente padrão B (tool-calling) |
| Checagem determinística ANTES de gastar | Cada resolver (`_pendente_aberta`, trava semanal do Saúde, `_garantir_sem_card_ativo` do Norte) | Toda ação cara (LLM/API externa) que tenha uma condição de bloqueio conhecida de antemão — nunca gasta a chamada só pra descobrir depois que estava bloqueado |
| Checagem de consistência aritmética pós-LLM | `_corrigir_consistencia` (Saúde) | Quando o LLM devolve múltiplos números relacionados por fórmula conhecida (ex: calorias vs. macros) — valide a fórmula depois, corrija ou rejeite, nunca confie cegamente |
| Rejeição de saída vaga | `Field(min_length=1)` no schema Pydantic + checagem explícita quando a vagueza não é capturável só pelo schema (`_exigir_alimento_identificado`, Saúde) | Sempre que o domínio precisa de especificidade (ex: `arquivos_afetados` do Norte não pode ser vazio) |
| Truncamento determinístico de limite | Norte, `stack[:_STACK_MAX_ITENS]` | Sempre que houver um limite de tamanho — nunca confiar só na instrução de prompt, o modelo pode ignorar |
| Nunca retry automático | Todos — uma tentativa, se falhar levanta `RuntimeError` claro | Qualquer chamada de LLM. Retry automático sozinho é gasto de token escondido — se precisar de nova tentativa, é o CHEFE quem decide pedir de novo, não o código |
| TTL de pendência esquecida | `_pendente_aberta`, Agenda | Sempre que existir um estado "aguardando resposta" que pode ficar órfão — sem TTL, uma pergunta esquecida vira armadilha de contexto pra mensagem futura não-relacionada |

**Regra de ouro**: todo domínio novo tem que ter pelo menos uma resposta
clara pra "o que impede esse agente de gastar dinheiro/gerar lixo sem
controle?" antes de ser aprovado — isso é parte do debate de design da
seção 1, não um detalhe de implementação.

---

## 7. Observabilidade — registrar sem exibir

- Toda chamada estruturada retorna `modelo`, `tokens_in`, `tokens_out`,
  `custo_usd` — e isso é **sempre persistido** na tabela correspondente
  (ex: `refeicoes.custo_usd`, `cards.custo_usd`), mesmo quando não é
  exibido ao chefe. Decisão de produto: metadado de custo nunca aparece
  no frontend, mas sempre fica no banco pra auditoria.
- Log de aviso (`print(f"[dominio] AVISO: ...")`) em pontos de falha
  esperada (ex: `recursion_limit` estourado no Agenda) — visibilidade
  pro dev investigar se acontecer com frequência, sem quebrar a resposta
  ao chefe (a resposta em si é sempre graciosa, nunca um 500 cru).
- Em tools (padrão B), o middleware `tratar_erros_tools` já loga duração
  e resultado de cada chamada (`[tool] nome -> ok (0.4s)` ou `-> ERRO`) —
  reuse isso, não crie um logging próprio por agente.
- Quando o motor de tick existir, `tick_execucoes` centraliza isso pro
  hub inteiro — hoje cada domínio guarda seu próprio custo na tabela
  própria porque não há orquestrador central ainda.

---

## 8. Cautelas — não quebrar os outros agentes

- **Nunca edite uma migration já aplicada.** Sempre uma nova, numerada
  sequencialmente. Migrations são aditivas.
- **`utils/query_executor.py`, `utils/db.py`, `utils/connection.py`,
  `utils/sql_manager.py` são infraestrutura compartilhada** — qualquer
  mudança aqui exige testar TODOS os agentes existentes depois, não só
  o que motivou a mudança.
- **Nunca comitar segredo** — token, credencial, `.env` real. Sempre via
  `config.py` (com default vazio/óbvio) + `.env.example` documentado +
  `.gitignore`.
- **Não esqueça o `scripts/seed.py`** (entrada na lista `AGENTES`) e o
  `main.py` (`app.include_router(...)`) — os dois passos mais fáceis de
  esquecer ao criar um agente novo, e o sintoma (agente não aparece em
  `/agentes`, ou rota 404) só aparece no teste manual, não no
  `py_compile`.
- **Ação que mexe em sistema externo real sempre com confirmação
  explícita** antes de executar (ver `acoes_pendentes` do Agenda) —
  nunca assuma que "o chefe provavelmente quer isso".

---

## 9. Processo de teste antes de aprovar um agente novo

Nenhum agente é considerado pronto sem passar por isto:

1. **Postgres real, não só mock de banco.** Aplicar a migration nova do
   zero (`hub_agentes_test` ou equivalente), popular seed, exercitar o
   resolver fim a fim.
2. **Mockar só a chamada de LLM** (e API externa, se houver) — nunca o
   banco. O caminho de dado real precisa ser exercitado de verdade.
3. **Testar os guardrails com evidência**, não só "parece que bloqueou"
   — usar mock com `call_count` e afirmar que uma chamada cara NÃO
   aconteceu quando deveria estar bloqueada.
4. **Testar o caminho de erro**: LLM falha, API externa falha — confirmar
   que nada fica gravado pela metade (nem uma linha parcial no banco).
5. **Testar a camada HTTP** com `TestClient` do FastAPI, não só o
   resolver isolado — erros precisam mapear pro status code certo (404
   vs. 409 vs. 422).
6. **Rodar o pipeline `migrate` + `seed` do zero** antes de considerar
   pronto — garante que um ambiente novo sobe sem passo manual
   escondido.
7. Só commitar depois de tudo isso passar. "Compilou" não é "testado".

A suíte permanente (`tests/`, `pytest` + `pytest-asyncio`) que roda essas
mesmas verificações automaticamente já existe — era dívida técnica
identificada na Sprint 0, resolvida antes do módulo de interação (ver
`docs/produto-e-sprints.md`). Reaproveita o Postgres do
`docker-compose.yml` já existente, banco de teste separado por sufixo
`_test`. Agente novo entra na suíte já existente, não precisa criar
infraestrutura de teste do zero — só os testes específicos do domínio
novo.
