# Backend — instruções para agentes de IA

FastAPI + psycopg (Postgres, **SQL à mão**, sem ORM) + LangChain/OpenAI. Os princípios gerais estão no `AGENTS.md` da raiz;
o processo completo para agente novo está em `docs/guia-criacao-de-agentes.md` (leia inteiro antes de criar um) e na skill `/novo-agente`.

## Camadas (nunca pule uma)

```
routers/<dominio>.py    HTTP fino: parse, chama o resolver, mapeia erro → status. NUNCA fala com o banco.
resolvers/<dominio>.py  regra de negócio + guardrails. Levanta ValueError/RuntimeError com mensagem clara.
agents/<dominio>/       só chamadas de LLM (agente.py), clientes externos e tools (padrão B).
sql/<entidade>.sql      queries nomeadas: `--QUERY: nome`. Chamada: executar_query("arquivo:nome", params=(...)).
db/migrations/NNN_*.sql schema. Aditivas e imutáveis. `scripts/migrate.py` aplica em ordem.
utils/                  infra compartilhada. Mudou aqui? Teste TODOS os agentes, não só o que motivou.
```

- Parâmetros do SQL sempre por `params=(...)` (`%s`). `**kwargs` do `executar_query` interpola identificador **interno**, nunca dado de fora.
- `returning=True` para INSERT/UPDATE com `RETURNING`; `commit=True` devolve linhas afetadas; sem flag devolve as linhas do SELECT.
- Mapeamento de erro nos routers: não encontrado → **404**, conflito de estado (já aceito, card ativo existe) → **409**, entrada inválida/falha de LLM → **422**.
  O frontend mostra a `detail` ao chefe (RNF03): escreva a mensagem para ser lida por ele.
- Configuração só em `config.py` (`settings`), com default óbvio; documente em `.env.example`. Credencial gerada (token) vai no `.gitignore`.

## Chamada de LLM

**Padrão A (default):** chamada estruturada única, sem tools. O resolver monta todo o contexto *antes*; o LLM só interpreta/estima/narra.

```python
base = init_chat_model(f"openai:{settings.llm_model_cheap}", temperature=0.2)
modelo = base.with_structured_output(MinhaSaida, include_raw=True)   # include_raw=True SEMPRE
with cronometrar() as t:
    resultado = await modelo.ainvoke(prompt)
if resultado.get("parsing_error"):
    raise RuntimeError(f"Saída fora do formato esperado: {resultado['parsing_error']}")
```

Molde real: `agents/saude/agente.py` (`_extrair_resultado` calcula custo, chama `registrar_execucao` e devolve `{dado, modelo, tokens_in, tokens_out, custo_usd}`).
**Padrão B** (`create_agent` com tools) só se for impossível montar o contexto antes — hoje só a Agenda. Exige `tratar_erros_tools`,
`RECURSION_LIMIT`, tools **só de leitura** e docstring escrita como instrução (o LLM a lê). Detalhe e regra de decisão A vs B: guia §4.

Regras que valem sempre:
- Modelo barato (`llm_model_cheap`) por padrão; forte só para execução real/relatório.
- **Nunca retry automático** (cada tentativa é token). Falhou → `RuntimeError` claro; quem decide tentar de novo é o chefe.
- **Todo gasto vai para `tick_execucoes`** via `agents/_shared/execucoes.py::registrar_execucao` (e `cronometrar()` em volta do `ainvoke`). Esse registro
  **nunca pode derrubar o trabalho**: ele engole a própria exceção de propósito. O orçamento diário sai só dessa tabela. Domínio novo que esquece de registrar gasta invisível.
- Cheque o bloqueio determinístico **antes** de chamar (`_pendente_aberta`, trava semanal da Saúde, `_garantir_sem_card_ativo` do Norte).
- Valide o que o LLM devolveu: fórmula conhecida (`_corrigir_consistencia`), campo vago (`min_length=1` + checagem explícita), limite de tamanho truncado **em código**
  (`stack[:N]`), nunca só pedido no prompt.
- Contexto limitado por `LIMIT N` na query; nada de histórico sem teto.

## Agente novo: o que tocar (esquecer um destes dá 404 ou agente invisível)

`db/migrations/NNN_<dominio>.sql` · `sql/<entidade>.sql` · `agents/<dominio>/` · `resolvers/<dominio>.py` · `routers/<dominio>.py` ·
`main.py` (`app.include_router`) · `scripts/seed.py` (entrada em `AGENTES`: nome, especialidade, `avatar_config` com cor, `mesa`, `extroversao`) ·
`resolvers/interacao.py::_HANDLERS_TRABALHO` se ele tiver proatividade (`checar`/`descrever`/`executar`/`custa_llm`; `custa_llm=False` só se **nunca** chama LLM) ·
`tests/test_<dominio>.py` · **`tests/conftest.py::_TABELAS`** (tabela nova fora dessa lista não é limpa entre testes e um teste contamina outro).
A `especialidade` é a chave que o frontend usa para ligar o agente do banco ao personagem (`frontend/src/features/predio/agentes.ts`): combine o valor dos dois lados.

## Testes (`pytest`, de `backend/`)

- Postgres **real** (o do `docker compose`), banco `<nome>_test` recriado do zero com todas as migrations. Mocke **só** o LLM e API externa, nunca o banco.
- Helpers em `tests/helpers.py`: `resultado_agente(...)` (mocka a função do agente inteira), `resultado_llm(...)` (mocka o modelo, deixa `_extrair_resultado` rodar), `registrar_gasto(...)`.
- Guardrail se prova com evidência: mock com `call_count` afirmando que a chamada cara **não** aconteceu.
- Cubra o caminho de erro (nada pela metade no banco) e a camada HTTP com `TestClient` (status certo: 404 vs 409 vs 422).
- Motriz é o único que não pode chamar LLM; `test_motriz_nao_gasta_llm` protege isso. Não quebre.
- Antes de dar por pronto: `python -m scripts.migrate && python -m scripts.seed` do zero + `pytest`.
