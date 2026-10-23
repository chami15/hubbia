# Backend — Hub de Agentes

Fundação (banco + schema + scripts + API de leitura) + quatro agentes:
**Financeiro** (Cifra: upload de extrato Itaú/Nubank, dashboard ao vivo,
relatório mensal narrado por LLM), **Agenda** (Google Calendar: consulta
direta sem LLM, negociação de horário guiada, criar/mover/cancelar evento
sempre com confirmação humana antes de executar), **Saúde** (Vita: perfil,
peso, hidratação, sono, atividade física e ficha de treino via forms
determinísticos, sem LLM — só refeição, plano de dieta e relatório semanal
passam por LLM, cada um numa chamada estruturada única) e **Norte**
(projetos do GitHub: um card de sugestão por vez — feature, bug ou próximo
passo —, nunca mais de um ativo por projeto, encadeando o próximo card
automaticamente ao resolver o atual). O **motor de tick** (manual) percorre os
agentes ativos, e todo gasto de LLM passa por uma tabela só, `tick_execucoes`.
O **Motriz** (sala de máquinas, o único agente sem LLM) lê essa tabela e expõe
`/infra/*` (observabilidade, orçamento).

## ⚠️ Antes de usar de verdade

**Financeiro**: os parsers de `agents/financeiro/parsers/` (Itaú em PDF,
Nubank em CSV) já foram validados contra extrato real de cada banco — mas
bancos mudam formato de tempos em tempos; se um upload falhar, o erro
aponta o motivo (coluna não encontrada, cabeçalho não achado). O relatório
mensal (`POST /financeiro/relatorio/gerar`) chama a OpenAI de verdade —
precisa de `OPENAI_API_KEY` válida no `.env`. Upload e dashboard não usam
LLM, funcionam sem chave.

**Agenda**: precisa de `credentials.json` (OAuth "Desktop app", escopo
`calendar.events`) na raiz do `backend/` — nunca comitar esse arquivo nem
o `token.json` gerado na autorização (ambos no `.gitignore`). **Antes de
usar o agente**, rode uma vez, na sua máquina:

```bash
python -m scripts.autorizar_google_calendar
```

Isso abre o navegador pra você autorizar e grava o `token.json`. É
proposital que isso seja um passo manual separado, **não** algo que roda
sozinho na primeira chamada da API — se rodasse ali, uma chamada do
agente ficaria tentando abrir navegador no meio de uma requisição, o que
já causou trava/loop de custo real numa versão anterior (ver histórico).
Sem o `token.json`, qualquer chamada ao Calendar falha rápido com uma
mensagem clara, em vez de travar.

Nenhuma ação real (criar/mover/cancelar evento) executa sem confirmação
explícita — ver `acoes_pendentes`. O agente também tem teto de tool calls
+ `recursion_limit` do LangGraph (`agents/_shared/guardrails.py`) — se uma
tool falhar repetidamente, a execução é interrompida, nunca fica girando
sem parar gastando token.

**Saúde**: sem credencial externa nenhuma — só precisa da mesma
`OPENAI_API_KEY` do Financeiro. Diferente do Agenda, não é chat/roteamento
por texto: cada ação é um endpoint dedicado (forms). Peso, hidratação,
sono, atividade e ficha de treino nunca chamam LLM — escrita direta no
banco. Refeição (`POST /saude/refeicao/texto|foto`) estima macro numa
chamada estruturada única (nunca tenta de novo sozinha se falhar) e faz
uma checagem de consistência determinística (calorias vs. macros) antes de
salvar — se a estimativa não passar, nada é gravado. Plano de dieta e
relatório semanal (`POST /saude/plano-dieta/gerar`, `POST
/saude/relatorio/gerar`) são o mesmo padrão do relatório do Financeiro
(uma chamada estruturada, sem tool-loop). A trava de "um relatório por
semana" é checada **antes** de chamar o LLM (nunca gasta token só pra
descobrir depois que já existe) — a `UNIQUE` em `relatorios_saude` é só o
backstop. Sem gate de confirmação humana (`acoes_pendentes`) nesse
domínio: toda escrita mexe só no nosso próprio banco, nunca num sistema
externo, então não existe a mesma razão de pedir confirmação que existe no
Agenda (ver conversa de design).

**Norte**: precisa de um OAuth App do GitHub com **Device Flow**
habilitado (`github.com/settings/developers`) — só o `client_id` no
`.env`, Device Flow não usa `client_secret`. **Antes de usar o agente**,
rode uma vez, na sua máquina:

```bash
python -m scripts.autorizar_github
```

Isso mostra um código pra você digitar em `github.com/login/device` e
grava o `github_token.json` quando você aprovar — mesmo espírito do
`autorizar_google_calendar.py` do Agenda: passo manual único, nunca roda
sozinho numa requisição da API. Sem o token, cadastrar um projeto falha
rápido com mensagem clara.

Guardrail central do domínio (pedido explícito na conversa de design): o
agente só é acionado (chamada de LLM/GitHub) em dois momentos — o chefe
clica pra gerar o card quando o projeto não tem nenhum ativo, ou resolver
(aceitar→finalizar, ou rejeitar) o card atual dispara o próximo
automaticamente. **Nunca em qualquer outro momento.** O resolver checa se
já existe um card não-terminado **antes** de chamar GitHub/LLM — nunca
gasta uma chamada sequer só pra descobrir depois que já existia (a
`UNIQUE INDEX` em `cards` é só o backstop). A leitura do repositório em si
(árvore de arquivos, README, manifest, commits/arquivos alterados) é toda
determinística (`agents/norte/github_client.py`, chamadas diretas à API
do GitHub) — o LLM só entra pra interpretar esse contexto já coletado,
nunca pra "explorar" o repositório sozinho (contexto raso de propósito
nessa v1, ver `docs/backlog-futuro.md`).

## Como subir

```bash
cd backend

# 1) Sobe o Postgres (e o Adminer em http://localhost:8080 pra ver o banco)
docker compose up -d

# 2) Ambiente Python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3) Config
cp .env.example .env      # ajuste se precisar

# 4) Cria o schema e popula os agentes iniciais
python -m scripts.migrate
python -m scripts.seed

# 5) Sobe a API
uvicorn main:app --reload
```

## Testes

```bash
pip install -r requirements-dev.txt   # só uma vez
pytest                                 # roda tudo — descoberta automática
```

Reaproveita o **mesmo Postgres do `docker-compose.yml`** (precisa estar de
pé — `docker compose up -d`) — não sobe container novo nenhum, só cria um
banco separado (`<nome_do_banco>_test`) dentro dele, recriado do zero a
cada rodada de teste. Nunca toca no banco de desenvolvimento real. Nenhuma
chamada de LLM/API externa de verdade acontece — tudo mockado
(`unittest.mock`), determinístico, sem custo de token. Ver
`tests/conftest.py` (fixtures de banco/cliente HTTP) e
`docs/guia-criacao-de-agentes.md` (seção 9 — o que testar em todo agente
novo antes de aprovar).

## Conferindo

- `http://localhost:8000/health` → `{"status":"ok"}`
- `http://localhost:8000/agentes` → lista com Você (chefe), Cifra (financeiro), Agenda, Vita (saúde), Norte (projetos)
- `http://localhost:8000/docs` → Swagger de todas as rotas
- `http://localhost:8080` → Adminer, pra inspecionar as tabelas na mão
  (sistema: PostgreSQL · servidor: `db` · usuário: `hub` · senha: `hub` · base: `hub_agentes`)

## Troubleshooting

**`password authentication failed for user "hub"`**
Geralmente significa que quem está respondendo na porta não é o container —
é outro Postgres (nativo, comum no Windows se você já tem PostgreSQL/pgAdmin
instalado, ou outro projeto seu). Por isso o `docker-compose.yml` publica o
container na porta **5000** do host (o container continua ouvindo 5432
*dentro* dele; só a porta exposta pra fora muda). Antes de mudar a porta de
novo, confira estas 4 coisas — **na ordem**, porque se o erro persistir após
trocar a porta, o problema provavelmente não é a porta:

1. **O container está de pé na porta certa?**
   ```bash
   docker compose ps
   ```
2. **Sobrou volume de uma tentativa anterior?** (o Postgres só aplica usuário/
   senha na *primeira* inicialização do volume — se reaproveitar um volume
   velho, a senha antiga continua valendo mesmo com compose novo)
   ```bash
   docker volume ls
   ```
3. **O `.env` realmente tem a porta nova?**
   ```bash
   # Windows (PowerShell)
   type .env
   # mac/linux
   cat .env
   ```
4. **Existe uma variável de ambiente `DATABASE_URL` no sistema sobrescrevendo
   o `.env`?** (isso tem prioridade sobre o arquivo e é uma causa comum e
   silenciosa)
   ```bash
   # Windows (PowerShell)
   $env:DATABASE_URL
   # mac/linux
   echo $DATABASE_URL
   ```

Se o item 2 mostrar um volume antigo, recrie do zero (projeto novo, sem dado
de valor):
```bash
docker compose down -v
docker compose up -d
```
Se o item 4 imprimir alguma coisa, é isso: remova a variável de ambiente do
sistema (ou do perfil do PowerShell) e rode de novo — o `.env` só vale se não
houver uma variável de ambiente com o mesmo nome já definida.

## Estrutura

Camadas granulares por entidade — router (HTTP fino) nunca fala com o banco
direto, sempre passa pelo resolver; SQL nunca fica inline no Python, sempre
em arquivo versionado com queries nomeadas.

```
config.py                 # settings via .env (banco, LLM, tick, orçamento)
main.py                    # app FastAPI (monta os routers)

db/
  migrations/              # .sql versionados, aplicados em ordem (schema)

utils/                     # infraestrutura de acesso a dado
  connection.py            # pool psycopg3 (psycopg_pool.ConnectionPool)
  db.py                    # context manager `with Database() as conn:`
  sql_manager.py           # carrega/cacheia queries nomeadas de sql/*.sql
  query_executor.py        # executar_query() — único ponto de entrada no banco

sql/                       # SQL puro, nunca embutido no Python
  agentes.sql
  mensagens.sql
  relacionamentos.sql
  transacoes.sql
  extratos_importados.sql
  relatorios_financeiros.sql
  acoes_pendentes.sql
  perfil_saude.sql
  peso_historico.sql
  hidratacao_historico.sql
  sono_historico.sql
  atividades_fisicas.sql
  refeicoes.sql
  ficha_treino.sql
  planos_dieta.sql
  relatorios_saude.sql
  projetos.sql
  cards.sql

agents/                    # lógica dos agentes LLM, um domínio por pasta
  financeiro/
    agente.py               # chamada única estruturada (sem tool-loop, sem
                             # decisão a tomar: sempre os mesmos cálculos)
    categorizador.py         # categorização por regra, sem LLM
    recorrencias.py           # detecção de assinatura/parcela, lógica pura
    parsers/
      itau.py                # PDF Itaú -> formato interno (pdfplumber, posicional)
      nubank.py               # CSV Nubank -> formato interno
  agenda/
    google_calendar.py        # só carrega/renova token existente (determinístico) —
                              # NUNCA abre navegador aqui, falha rápido se não autorizado
    tools.py                   # tools de LEITURA do agente (listar/buscar)
    agente.py                   # create_agent com raciocínio (checa conflito,
                                # julga horário) — saída sempre estruturada,
                                # nunca escreve no calendário direto
  saude/
    agente.py                 # 4 chamadas estruturadas independentes, sem
                              # tool-loop: estimar macro (texto/foto), plano
                              # de dieta, relatório semanal — inclui a
                              # checagem de consistência calorias-vs-macros
  norte/
    github_client.py           # só leitura determinística do GitHub (árvore,
                               # README, manifest, commits/diff) — sem LLM
    agente.py                   # 2 chamadas estruturadas: escanear projeto
                                # (1x, no cadastro) e gerar 1 card por vez
  _shared/
    guardrails.py               # middleware de tool-calling (captura erro, teto de
                                # chamadas) — reusado por qualquer agente com tool-loop
    execucoes.py                # registrar_execucao/cronometrar: todo gasto em tick_execucoes

resolvers/                 # regra de negócio (o router chama isso, nunca o banco)
  agentes.py
  mensagens.py
  financeiro.py             # importar extrato, calcular dashboard, gerar relatório
  agenda.py                  # roteador de intenção + negociação + gate de confirmação
  saude.py                    # perfil, peso, hidratação, sono, atividade, refeição,
                              # ficha de treino, plano de dieta, relatório semanal
  norte.py                     # projetos + cards — guardrail de "só 1 card ativo
                               # por vez" checado antes de qualquer chamada de LLM
  infra.py                      # Motriz (sem LLM): observabilidade e orçamento
                                # a partir de tick_execucoes (migrations 010–011)

routers/                   # HTTP fino — só parse de request/response
  agentes.py                # GET /agentes
  mensagens.py               # GET /mensagens
  financeiro.py               # POST /financeiro/extrato, GET /dashboard, /relatorio
  agenda.py                    # POST /agenda/mensagem, /agenda/acoes/{id}/confirmar|rejeitar
  saude.py                      # um endpoint por ação (forms) — perfil, peso,
                                # hidratação, sono, atividade, refeição, ficha de
                                # treino, plano de dieta, relatório, dashboard
  norte.py                       # projetos + cards (gerar/aceitar/rejeitar/finalizar)
  infra.py                        # /infra/* — sala de máquinas

scripts/
  migrate.py                # aplica as migrations (idempotente)
  seed.py                    # cria agentes + relacionamentos-base, via executar_query
  autorizar_google_calendar.py  # passo manual único: abre navegador, grava token.json
  autorizar_github.py            # passo manual único: Device Flow, grava github_token.json

docker-compose.yml          # postgres + adminer
```

## Próxima fatia (a combinar)

Departamentos e esteiras da Sprint 2 (proposta ainda **não aprovada**, ver
`docs/produto-e-sprints.md`). Itens adiados de propósito, ver
`docs/backlog-futuro.md`: canal Telegram; agente de Saúde sugerir/montar a
ficha de treino sozinho; acesso multi-usuário aos cards do Norte; leitura
mais profunda do repositório no Norte (conteúdo de arquivo, não só nomes)
se o contexto raso da v1 não gerar sugestões boas o suficiente.
