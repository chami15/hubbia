# Hub de Agentes Pessoais ("Escritório Vivo") — Produto e Sprints

> Documento vivo. Atualizado a cada sprint concluída ou decisão de escopo
> relevante — não é uma fotografia única, é o registro contínuo de onde o
> projeto está e pra onde vai.

---

## 1. Visão geral do produto

### 1.1 Proposta e propósito

Um hub pessoal de agentes de IA especializados, cada um cuidando de uma
área da vida do usuário (finanças, agenda, saúde, projetos pessoais, e
mais no futuro), visualizados como colaboradores num escritório 2D/3D.
Diferente de um assistente genérico único, cada agente tem escopo
estreito, personalidade própria e um jeito de interagir desenhado pra
economia de custo e clareza — não existe "chat com tudo", existe o padrão
certo pra cada domínio (dashboard, forms, cards, chat roteado).

Inspiração declarada (ver `docs/mvp-hub-agentes.md`): hub de agentes por
especialidade (Qyon AI) + agentes generativos autônomos (linha de
pesquisa Stanford "Generative Agents") + a fantasia social de "The Sims"
aplicada a colaboradores de IA.

### 1.2 A dor que resolve

- **Fragmentação**: finanças, agenda, saúde e projetos pessoais vivem em
  apps/ferramentas diferentes, sem visão unificada nem lembrete cruzado.
- **Falta de controle sobre IA**: ferramentas de IA em geral não dão
  visibilidade de custo, não pedem confirmação antes de agir de verdade,
  e não são auditáveis — o usuário não sabe o que foi decidido nem por
  quê. Esse projeto trata isso como requisito desde o início, não como
  feature de "versão 2".
- **Procrastinação/abandono de projeto pessoal**: motivou diretamente o
  agente Norte — projetos começados e nunca terminados, sem ninguém de
  olho no que falta.
- **Fricção de acompanhamento manual**: registrar refeição, negociar
  horário, lançar gasto — tudo isso tem custo de atenção; o hub tenta
  reduzir esse custo sem trocar por outro custo pior (chat caro, ações
  automáticas sem controle).

### 1.3 Público-alvo (inicial)

**Uma pessoa: o próprio criador do sistema ("o chefe").** É
deliberadamente single-user — nenhum agente tem conceito de múltiplos
usuários, permissão ou autenticação multi-pessoa hoje. Expandir pra mais
usuários é uma decisão de arquitetura de hub inteiro, não um ajuste
isolado (ver `docs/backlog-futuro.md`), e não é objetivo desta fase.

### 1.4 O que ele afeta

Organização pessoal prática (dinheiro, tempo, saúde, projetos) e o
comportamento de quem usa — o objetivo declarado não é só "guardar dado",
é mudar o resultado real (ex: terminar mais projetos, ter menos surpresa
financeira, não perder compromisso). Efeito colateral desejado: um espaço
de experimentação com práticas de engenharia de agentes de IA
(guardrails, controle de custo, auditabilidade) que valem além deste
projeto específico.

### 1.5 Ciclo do projeto

Iterativo, módulo por módulo, nunca "tudo de uma vez":

1. **Idealizar** — o dono do produto descreve a necessidade e a essência
   do que quer resolver.
2. **Debater o desenho** — perguntas e contrapropostas até convergir:
   qual o padrão de interação, quando entra LLM vs. quando é
   determinístico, que guardrail o domínio exige, o que fica pra depois
   (backlog).
3. **Implementar** — só depois de aprovação explícita do desenho.
4. **Testar com rigor** — Postgres real, dado real sempre que possível,
   guardrails verificados com evidência (não "parece que funciona").
5. **Aprovar e documentar** — registrar decisões (backlog, frontend-design,
   este documento) antes de considerar o módulo pronto.

Esse ciclo é ele mesmo um resultado do projeto — ver
`docs/guia-criacao-de-agentes.md` pra ele formalizado como processo
repetível pra qualquer agente novo.

### 1.6 Resultados esperados (visão de médio prazo)

- Um conjunto de agentes especializados cobrindo as áreas centrais da
  vida pessoal, cada um validado com dado real, nunca "MVP de mentirinha".
- Dinâmica social real entre agentes (módulo de interação/motor de tick)
  — o "escritório vivo" de verdade, não quatro backends isolados.
- Interface visual (2D primeiro, 3D como evolução) que torna esse
  ecossistema tangível.
- Controle de custo e auditabilidade como propriedade do sistema, não
  como boa intenção — todo gasto de LLM é rastreável, toda ação real tem
  gate de confirmação quando mexe em sistema externo.

---

## 2. Sprints

### Sprint 0 — Idealização até o primeiro MVP (ENCERRADA)

**Objetivo:** sair da ideia (documento MVP original, `docs/mvp-hub-agentes.md`
e `docs/avaliacao-mvp.md`) até ter uma base funcional, testada com dado
real, rodando sem problema grave. Cobre a fundação do hub + o **módulo de
agentes** (quatro agentes de domínio) e, pelo que já decidimos, também
absorve a introdução de testes automatizados antes de avançar pro próximo
módulo.

#### O que já foi feito

**Fundação:**
- Banco Postgres (psycopg3 + pool), schema versionado por migration
  (`db/migrations/001` a `007`), scripts `migrate`/`seed` idempotentes.
- Arquitetura em camadas consistente em todo o hub: `routers/` (HTTP
  fino) → `resolvers/` (regra de negócio + guardrails) → `utils/query_executor.py`
  (único ponto de acesso ao banco) → `sql/*.sql` (queries nomeadas,
  nunca inline).
- Tabelas de fundação já existentes mas **ainda não usadas**: `memorias`,
  `tick_execucoes` — reservadas pra Etapa 3 (proatividade de trabalho).
  `ticks` (Etapa 1), `mensagens` e `relacionamentos` (Etapa 2) já estão
  em uso — ver abaixo.

**Módulo de agentes (quatro agentes, um por domínio):**

| Agente | Domínio | Padrão de interação | LLM usado onde |
|---|---|---|---|
| **Cifra** (Financeiro) | Upload de extrato, dashboard, relatório mensal | Painel/dashboard, sem chat | 1 chamada estruturada (narrativa do relatório) |
| **Agenda** | Google Calendar | Chat roteado por palavra-chave + gate de confirmação | Agente real com tools (`create_agent`), única exceção do hub |
| **Vita** (Saúde) | Perfil, peso, sono, hidratação, atividade, refeição, ficha de treino, plano de dieta, relatório semanal | Menu de forms determinísticos, sem chat | 4 chamadas estruturadas independentes (macro por foto/texto, plano, relatório) |
| **Norte** | Projetos do GitHub — um card de sugestão por vez | Sem chat, sem lista — 1 card ativo por projeto | 2 chamadas estruturadas (scan do projeto, gerar card) |

Detalhes de cada um, decisões de design e bugs reais encontrados/corrigidos
estão no histórico de commits de cada domínio (mensagens de commit
descritivas) e em `docs/backlog-futuro.md` (o que foi adiado
deliberadamente).

**Guardrails e práticas consolidadas** (ver `docs/guia-criacao-de-agentes.md`
pro catálogo completo): checagem determinística ANTES de qualquer chamada
cara (nunca gasta LLM só pra descobrir depois que uma ação está
bloqueada), teto de tool-calling + recursion_limit pro único agente com
loop de raciocínio (Agenda), checagem de consistência aritmética
pós-LLM (Saúde, calorias vs. macros), truncamento determinístico de
limites (Norte, stack ≤ 10 itens), rejeição de saída vaga via schema
(`Field(min_length=1)`), nunca retry automático de chamada de LLM que
falhou, custo (modelo/tokens/custo_usd) sempre persistido mesmo quando
não exposto ao chefe.

**Módulo de interação — Etapa 1 (relógio simulado, fundação):**
- `resolvers/tick.py` + `routers/tick.py` + `sql/ticks.sql`: relógio
  simulado (`ticks.numero`, `ticks.hora_simulada`, avança
  `tick_minutos_simulados` por tick), atualização do `estado` dos
  agentes tipo `colaborador` ativos (sempre `idle` nesta etapa — ainda
  não há comportamento real que justifique `pensando`/`falando`/
  `executando`), e cálculo de orçamento diário já gasto (soma
  `custo_usd` de todas as tabelas de domínio que já rastreiam custo de
  LLM: `relatorios_financeiros`, `refeicoes`, `planos_dieta`,
  `relatorios_saude`, `cards`) vs. `orcamento_diario_usd`.
- Disparo é manual via `POST /tick/avancar` (nunca scheduler automático
  ainda — mesma disciplina "nunca automático até provar que é seguro"
  do resto do hub), com suporte a `dry_run=true` pra conferir sem
  gravar nada.
- Zero chamada de LLM nesta etapa — é só a fundação (relógio + estado +
  orçamento) que as próximas etapas (social, depois proatividade) vão
  usar antes de gastar qualquer coisa.
- 11 testes novos (`tests/test_tick.py`), rodados contra Postgres real
  duas vezes seguidas pra confirmar repetibilidade.

**Módulo de interação — Etapa 2 (camada social):**
- `resolvers/interacao.py` + `agents/interacao/agente.py` +
  `routers/interacao.py`: a cada rodada (manual, sempre depois de
  `POST /tick/avancar`), decide deterministicamente — sem gastar LLM —
  quem tenta puxar assunto social nesse tick (extroversão do agente +
  quantos ticks parado desde a última fala social) e, pra quem tenta,
  com quem fala (roleta ponderada pela afinidade em `relacionamentos`,
  nunca 100% garantido pro "melhor amigo" nem 0% pra ninguém — piso
  mínimo protege contra afinidade negativa inverter o peso). Só depois
  disso é que 1 chamada estruturada (Padrão A) gera o conteúdo da
  mensagem.
- Afinidade cresce por interação (não por tick), com retorno
  decrescente — quanto mais alta já está, menor o próximo ganho. Todos
  os pares começam neutros (0). Sem mecanismo de queda ainda: fica pro
  dia em que entrar checagem de sentimento via LLM (ver
  `docs/backlog-futuro.md`).
- `eventos_mundo` é pool curado manualmente (clima, futebol, trânsito
  etc. — sem entradas de dia da semana, ver abaixo) — sem LLM gerando
  eventos —, sorteado priorizando os menos usados recentemente.
  Histórico recente de mensagens do par entra no prompt, com regra
  explícita de não repetir assunto — evita o loop de sempre falar do
  mesmo evento.
- **Achado testando de verdade** (validação manual do chefe, ponta a
  ponta com Postgres e OpenAI reais): como `eventos_mundo` é sorteado
  aleatoriamente, um tick podia sortear "sextou" e outro (mesmo dia
  real) sortear "segunda-feira" — contradição entre agentes. Corrigido
  tirando as entradas de calendário do pool e calculando um "fato do
  dia" (dia da semana, fim de semana, período do dia) determinístico a
  partir de `ticks.hora_simulada` — o relógio SIMULADO do escritório,
  não a data real —, sempre consistente porque é calculado, não
  sorteado. Calendário fictício completo (semanas/estações/feriados
  fictícios) fica pra próxima sprint, ver `docs/backlog-futuro.md`.
- Guardrails: orçamento diário (Etapa 1) checado ANTES de qualquer
  chamada de LLM, rate limit de mensagens sociais por par por dia,
  `dry_run` em todo endpoint que geraria mensagem de verdade, disparo
  sempre manual.
- Migration 008 (`agentes.extroversao`, `eventos_mundo.ultimo_uso_tick`)
  — nenhuma tabela nova, `mensagens`/`relacionamentos` já existiam
  reservadas desde a fundação.
- 15 testes novos (`tests/test_interacao.py`) cobrindo as fórmulas
  puras (incluindo o fato do dia), os 3 guardrails e a persistência
  real (mensagem, afinidade nos dois sentidos, estado do agente, evento
  marcado como usado) — suíte total com 74 testes, rodada duas vezes
  seguidas contra Postgres real. **Etapa 2 validada ponta a ponta pelo
  chefe** na própria máquina, com Postgres e OpenAI reais (não só
  testes automatizados) — todos os números batendo com a fórmula
  esperada.
- **Extensão pós-validação**: o chefe também virou candidato a
  RECEBER papo social (nunca a puxar — ele não é simulado), reforçando
  a imersão de escritório vivo; e o prompt foi afrouxado pra permitir
  o social tocar em trabalho de forma informal (fofoca/opinião, nunca
  relatório formal) — esse continua sendo o papel exclusivo do tipo
  `trabalho`.
- **Thread de resposta (balãozinho)**: outro achado da validação
  manual — agentes trocavam mensagem mas nunca se respondiam de
  verdade, cada um só puxava assunto novo. `mensagens.respondendo_a_id`
  (auto-referência, migration 009, campo único — remetente/conteúdo da
  original sempre via JOIN, nunca duplicado) resolve isso: ao decidir
  falar, o agente primeiro olha se tem mensagem social recebida sem
  resposta e responde a mais antiga — prioridade garantida, sem
  fórmula de probabilidade nova (o cooldown que já empurra
  `chance_falar` garante a resposta eventual sozinho). Rate limit por
  par continua valendo mesmo pra responder pendência.

**Módulo de interação — Etapa 3 (proatividade de trabalho — Sabor A, os 4 agentes):**
- Dois "sabores" de proatividade combinados: **Sabor A (alerta/ação
  proativa)** — o agente percebe algo vencido, EXECUTA a ação e avisa —
  feito agora; **Sabor B (aviso/cutucão comportamental)** — no backlog,
  pra depois.
- `resolvers/interacao.py` tem um registro `_HANDLERS_TRABALHO` por
  `especialidade`, cada um com `checar(agente) / descrever(ctx) /
  executar(ctx)`. Adicionar um agente proativo é só plugar um handler —
  a lógica central do tick não muda. Todos os gatilhos são 100%
  determinísticos (query, sem LLM) — "check before you spend".
- **Norte**: projeto `ativo`, sem card em aberto, parado há mais de
  `interacao_dias_estagnacao_norte` dias → gera o próximo card e avisa.
- **Cifra**: mês FECHADO mais antigo com transações e sem relatório →
  gera o relatório do mês e avisa ("Fechei o relatório de X — gastos
  R$..., ganhos R$...").
- **Vita**: semana FECHADA mais antiga com registro de saúde e sem
  relatório → gera o relatório semanal daquela semana e avisa.
- **Agenda**: primeira rodada de tick do dia em que ainda não mandou o
  resumo → lê o Google Calendar do dia e manda o resumo determinístico
  (horário — título); dia vazio vira "Nenhum compromisso para hoje,
  bora descansar!". A leitura do Calendar é no `checar`, então se o
  token do Google estiver fora, a Agenda cai pro social em vez de
  travar (tratada como o "filho rebelde" da proatividade também).
- **Aviso sempre com template determinístico** (zero LLM extra pra
  escrever a frase — o dado já vem da ação executada). A ação em si
  (gerar card/relatório) usa LLM onde já usava; a Agenda não usa LLM
  nenhum (só lê e formata).
- **Trabalho ganha prioridade sobre social no mesmo tick.**
- Guardrails: teto de `interacao_rate_limit_trabalho_por_dia` (5)
  avisos por agente por dia; anti-repetição por domínio sem peça nova
  (relatório/card que passa a existir sai do gatilho; a Agenda checa se
  já mandou trabalho hoje); orçamento diário compartilhado.
- Endpoint renomeado de `/interacao/social/processar` pra
  `/interacao/tick/processar` (cobre as duas etapas).
- Testes: gatilho, prioridade, teto diário, não-repetição e degradação
  graciosa (Agenda sem token) por agente — suíte com 105 testes.
- **Validado manualmente pelo chefe**, ponta a ponta com Postgres e
  OpenAI reais: Cifra fechou o relatório de um mês real e avisou com o
  valor certo; Vita fechou o relatório de uma semana real; Agenda
  mandou "Nenhum compromisso para hoje, bora descansar!" e, testado de
  propósito, não repetiu o aviso no mesmo dia real até a mensagem ser
  apagada manualmente (confirma que a trava é exatamente "já mandou
  hoje"). Threading social (responder pendência, ficar no assunto)
  também confirmado nesses mesmos ticks.
- **No backlog**: Sabor B (avisos comportamentais); trabalho formal
  ENTRE agentes (não só agente→chefe), sem caso de uso definido ainda.

**Sprint 0 encerrada aqui** — módulo de agentes (4 domínios) + módulo
de interação (3 etapas + proatividade Sabor A) completos, testados
(automatizado e manual) e documentados. Próximo módulo: frontend.

**Documentação já existente:**
- `docs/backlog-futuro.md` — ideias adiadas deliberadamente, com o porquê.
- `docs/frontend-design.md` — decisões de UI/UX por agente + requisitos
  funcionais/não funcionais, pro módulo de frontend (futuro) ter norte
  claro.

#### Módulos que serão adicionados (fora do escopo desta sprint)

- **Testes automatizados** — decidido fazer AGORA, antes do módulo de
  interação (ver seção 2.2 abaixo), justamente porque o próximo módulo
  mexe em infraestrutura compartilhada por todos os agentes.
- **Módulo de interação** (motor de tick) — dividido em 3 etapas pra
  não acumular risco: **Etapas 1 (relógio simulado), 2 (camada social)
  e 3 (proatividade de trabalho) feitas** — ver acima. Sabor A da
  proatividade cobre os 4 agentes; falta o Sabor B (avisos
  comportamentais), no backlog.
- **Módulo de frontend** — 2D primeiro, ver `docs/frontend-design.md`.
  Backend segue sendo priorizado antes.
- **Quinto agente (e mais)** — confirmado que vai existir, sem data
  definida. Não entra nesta sprint.
- **Norte, refinamento contínuo** — é o agente mais novo e o menos
  "blindado" dos quatro (contexto raso de leitura de repositório, ainda
  vai precisar de leitura mais profunda de código — já registrado como
  prioridade em `docs/backlog-futuro.md`). Tratar como o que mais recebe
  ajuste nas próximas rodadas, não como "pronto e esquecido".

#### O que falta para concluir esta sprint

1. ~~Suíte de testes automatizados cobrindo os quatro agentes~~ — **feita**.
2. ~~Confirmar que a fundação aguenta o módulo de interação sem
   retrabalho estrutural~~ — **confirmada**.
3. ~~Módulo de interação (3 etapas + proatividade Sabor A nos 4
   agentes), testado e validado manualmente~~ — **feito**.

**Sprint 0 encerrada.** Todo o backend do "escritório vivo" (módulo de
agentes + módulo de interação) está funcionando, testado (automatizado
e manual) e documentado. Próxima sprint: **módulo de frontend**
(`docs/frontend-design.md` já tem o levantamento de requisitos pra
começar com norte claro).

#### Resultado esperado desta sprint

Uma base de quatro agentes funcionando de forma confiável e testada,
seguindo um processo replicável (ver guia de criação de agentes), com
infraestrutura compartilhada estável o suficiente pra suportar o
módulo de interação sem retrabalho — e o próprio módulo de interação
(relógio simulado, camada social, proatividade de trabalho) rodando de
ponta a ponta, validado tanto por testes automatizados quanto por uso
manual real. **Alcançado.**

#### Stack técnica (Sprint 0)

- **Backend**: Python, FastAPI, Uvicorn.
- **Banco**: PostgreSQL (psycopg3 + `psycopg_pool.ConnectionPool`, pool
  em autocommit).
- **LLM**: OpenAI via LangChain (`langchain`, `langchain-openai`) —
  `init_chat_model` + `.with_structured_output(..., include_raw=True)`
  como padrão dominante; `create_agent` (LangGraph por baixo) só onde
  há raciocínio real de verdade (Agenda).
- **Integrações externas**: Google Calendar (`google-api-python-client`,
  OAuth "Desktop app"), GitHub API (Device Flow OAuth, biblioteca
  `requests` pura, sem SDK).
- **Parsing de arquivo**: `pdfplumber` (extrato Itaú em PDF), CSV nativo
  com detecção de delimitador (Nubank).
- **Validação de contrato**: Pydantic v2 (schemas de entrada de router e
  de saída estruturada de LLM).
- **Sem framework de frontend ainda** — planejado React + Vite pro
  módulo de frontend (2D), ver `docs/avaliacao-mvp.md`.
- **Motor de tick (Etapas 1, 2 e 3)**: `resolvers/tick.py` +
  `resolvers/interacao.py` + `agents/interacao/agente.py` — relógio
  simulado manual (sem scheduler automático ainda, ver
  `docs/backlog-futuro.md`), camada social entre agentes (elegibilidade
  e escolha de destinatário determinísticas, afinidade com retorno
  decrescente, `eventos_mundo` curado manualmente) e proatividade de
  trabalho Sabor A nos 4 agentes (gatilho determinístico por domínio,
  registro `_HANDLERS_TRABALHO` — Norte/Cifra/Vita/Agenda).
- **Testes**: `pytest` + `pytest-asyncio` (resolvers são majoritariamente
  `async`) + `unittest.mock`/`pytest-mock` (mocka LLM e API externa,
  nunca o banco) — suíte reaproveita o Postgres do `docker-compose.yml`
  já existente, banco de teste separado por sufixo `_test`.

---

### Sprint 1 — Módulo de frontend (EM ANDAMENTO)

> **Atualização (2026-10-23): o escritório isométrico foi substituído pelo prédio em pixel art** (arte procedural do
> habblaud, `frontend/src/features/predio/`). Painéis dos agentes, tick, mensagens, configurações e sala de máquinas
> seguem os mesmos; o que mudou é o "mundo" onde os agentes aparecem (agora com salas por agente, vagas e elevador).
> O texto abaixo descreve o que foi construído **na versão isométrica** e fica como registro: as menções a PixiJS,
> sprites do Kenney, modo de edição e anel do crachá são históricas (o código está na tag `v0.3.0`).
> Ver `docs/guia-tecnico-frontend.md` PARTE 0.

**Objetivo:** dar ao "escritório vivo" a interface visual que a Sprint 0
deixou como próximo passo — o escritório isométrico 2D, o painel de cada
um dos quatro agentes, e os controles do motor de tick (relógio,
mensagens, configurações) — tudo consumindo a API já pronta e testada,
sem tocar em regra de negócio do backend.

#### O que já foi feito

**Escritório isométrico (a fundação visual):**
- Depois de **cinco tentativas rejeitadas** (SVG à mão, arte de IA como
  imagem estática, dois formatos de losango em `<pattern>` SVG, Canvas2D
  puro — ver `docs/guia-tecnico-frontend.md`, Parte 1, pro diagnóstico de
  cada uma), a solução que funcionou combina **sprites de artista**
  (Kenney Furniture Kit, CC0 — móveis) com **piso/laje/paredes
  desenhados** (`Graphics` do Pixi, pra controle total de paleta).
- Geometria isométrica **medida, não teórica** (o pack não é 2:1 como o
  "clássico"), coordenada de tabuleiro tipo xadrez (`B2`, `B2-NE`) pra
  eliminar ambiguidade de "mais pra lá", âncoras por peça × direção
  (560 sprites) medidas por script.
- **Múltiplas salas**: cada ambiente é dado (`salas/*.json`), nunca
  código — porta clicável navega entre salas, com espelhamento
  automático e conferência de consistência entre o conjunto inteiro
  (nome duplicado, agente já usado noutra sala, porta pra sala
  inexistente).
- **Modo de edição** (tecla `E`): arrastar/girar/empilhar móveis visual,
  três camadas de persistência (fonte no git / rascunho no
  `localStorage` / sessão em memória), rascunho automático com defesa
  contra perda de trabalho ao trocar de sala, desfazer agrupado por
  rajada de gesto, copiar/colar.
- **Defesa em 4 camadas** contra defeito silencioso de sala (id
  duplicado, `sobre` circular ou apontando pro nada, agente em duas
  peças): o editor não consegue criar a maioria, o plugin de gravação
  recusa salvar sala inconsistente, `npm test` prova coerência de toda
  sala versionada, e um painel vermelho lista qualquer defeito ao
  carregar.

**Painéis dos quatro agentes (clique no crachá abre o painel do
domínio):**
- **Cifra**: dashboard com seletor de mês, gráficos calculados ao vivo,
  upload de extrato, relatório mensal sob demanda.
- **Agenda**: chat com histórico de sessão, proposta pendente
  visualmente destacada (confirmar/rejeitar por botão OU por texto),
  consulta de pendência determinística ao abrir (custa zero de LLM).
- **Vita**: entrevista inicial bloqueando o resto até existir perfil,
  menu de forms determinísticos, atalho de peso/hidratação sem abrir o
  menu inteiro, ficha de treino com múltiplos exercícios por dia.
- **Norte**: card único por projeto (nunca lista), histórico tipo
  changelog, cadastro com branch real buscada no GitHub (nunca digitada
  à mão), visão geral em **kanban por status do projeto** com destaque
  de "estagnado" e botão "retomar".
- Ponte entre o crachá (id string local, `AGENTES` em
  `escritorio/agentes.ts`) e o agente de verdade do backend (id
  numérico) é sempre via `especialidade`, nunca comparação direta de id.

**Motor de tick no HUD:**
- Relógio simulado + orçamento diário sempre visíveis, avançar tick
  (com `dry_run` persistente) e processar a rodada social/trabalho
  virados **um clique só**.
- Mensagens: caixa de entrada (thread por agente, com resposta em
  texto) + mural geral (RF22) unificados no mesmo painel, com
  `lida_pelo_chefe` finalmente em uso (bolinha de não lida no HUD).
- Eventos do mundo: cadastro simples (só descrição) do pool que
  alimenta o gancho de conversa social.

**Redesenho visual "Console" (a "outra cara" do hub, ver
`docs/frontend-design.md` e `docs/guia-tecnico-frontend.md` Parte 11
pros detalhes completos):**
- **Fundação**: tokens de design centralizados (`index.css`) — paleta
  `--deck`/`--deck-2` opaca pros painéis (nunca mais translúcida com
  cantos muito arredondados), cor de identidade por agente, tipografia
  própria (placeholder de Chubbo/Supreme via Google Fonts, por bloqueio
  de rede ao Fontshare — trocável depois), biblioteca de barras
  reutilizável (cápsula, segmentada, radial, indeterminada, contador com
  animação de dígito).
- **Avatares vivos**: o `estado` do agente (`idle`/`pensando`/
  `falando`/`executando`, que já existia no schema desde a fundação mas
  nunca tinha chegado ao desenho) agora anima o anel do crachá na cena
  — pontilhado pulsante em "pensando", halo em "falando", cometa
  girando em "executando" —, via `Ticker.shared` do Pixi.
- **As quatro telas dos agentes ganharam identidade própria**: ticker de
  KPI com números animados no Cifra e na Vita, barra segmentada de dias
  de treino, colunas do kanban do Norte tingidas por status, bolha de
  proposta da Agenda pulsando na cor "oficial".
- **Sistema de notificação (toast)**: o resultado de um avanço de tick
  (aviso, trabalho proativo de um agente, mensagem social endereçada ao
  chefe) agora aparece como notificação passageira, tingida pela cor do
  agente — antes só existia dentro do painel de configurações, invisível
  se ele estivesse fechado.
- **Code-splitting por painel + esqueleto de carregamento**: cada painel
  de agente virou um chunk próprio (`React.lazy`), com um esqueleto no
  estilo "deck" no lugar do "carregando…" em texto puro.
- **Som opcional**: tom curto sintetizado (Web Audio, sem asset), toggle
  em configurações, tocando só em trabalho proativo — desligado por
  padrão.

#### O que falta para concluir esta sprint

Fechamento (2026-10-24), com um commit por item na branch `feat/fechar-sprint-1`:

1. ~~Escala global das salas~~ — era do escritório isométrico; no prédio pixel as salas têm tamanho fixo (14×8 tiles), não se aplica.
2. ✅ Atalho de peso/hidratação da Vita (RF19): bolha em pixel art ancorada nela, clique direito (`features/saude/BolhaVita.tsx`).
3. ✅ `border`/`borderColor` misturados: corrigido em todo `features/`, com teste que impede a volta.
4. ✅ Upload de extrato e foto de refeição com arquivo real: testado pelo chefe contra dado real, funcionando.
5. ✅ Conversa da Agenda persistida (tabela `conversa_agenda`, `GET /agenda/conversa`).
6. ✅ Histórico da Vita: `GET /saude/historico?dias=N` e a aba "histórico" no painel (linha do tempo por dia, só leitura).

#### Resultado esperado desta sprint

Um escritório isométrico navegável, com os quatro agentes acessíveis
por um painel próprio cada, o motor de tick operável de ponta a ponta
pela interface (nunca só por `curl`), e uma identidade visual coesa
("Console") que substitui o estilo "console de debug" inicial — sem
regredir nenhuma garantia do backend (RNF01–RNF09 continuam valendo,
nada de LLM automático, nenhum metadado de custo exposto). **Em
andamento** — núcleo funcional completo, pontas soltas documentadas
acima.

---

*(Próximas sprints serão adicionadas a este documento conforme
iniciarem — este arquivo não é reescrito do zero a cada atualização, é
incrementado.)*


### Próxima sprint — ideias do 3D no prédio pixel (decidido, ainda sem "pode" de desenho)

O chefe aprovou **começar** a aplicar as ideias de `docs/aproveitamento-the-sims.md` na próxima sprint, sempre sem poluição visual e só com dado real:

1. **Fase 1 (backend, sem visual novo):** expor `relacionamentos.afinidade` e `agentes.extroversao`; passar a escrever `opiniao`. Com testes.
2. **Fase 2:** motor puro em TypeScript (humor e relações a partir desses dados), em arquivo novo, testado.
3. **Fase 3:** uma superfície introspectiva só, ao selecionar o agente (nada de HUD permanente).
4. **Fase 4 (autonomia):** só com aprovação à parte, e o tick continua manual.

O desenho técnico da Fase 1 ainda precisa do "pode" explícito do chefe antes de codar. A `claude/modest-wright-cmvki7` continua laboratório do 3D imersivo.
