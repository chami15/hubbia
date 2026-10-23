# Roteiro da Sprint 2 — do escritório de 4 agentes ao escritório de departamentos

> Documento de planejamento, escrito antes de qualquer código (mesmo
> processo de sempre: debater o desenho → aprovar → implementar). Cobre
> a ordem de execução da Sprint 2 e a reflexão de arquitetura sobre a
> visão de longo prazo do chefe: vários departamentos, vários projetos
> rodando em paralelo, tempo simulado, e metas mensuráveis de
> confiabilidade/desempenho/produtividade.
>
> **Nada aqui está aprovado ainda.** É proposta, com contraproposta
> onde eu discordo.

---

## Parte 0 — O que o código diz (e a documentação não dizia)

Antes de propor qualquer coisa, fui ler o código em vez da doc. Cinco
achados mudam o plano — todos são coisa que já está lá, não opinião.

### 0.1 `tick_execucoes` está vazia. A tabela do CONTROLE nunca foi ligada.

`docs/avaliacao-mvp.md` (seção 4, item 1) definiu essa tabela como *"a
tabela mais importante pro seu objetivo"* — replay, auditoria de custo,
diagnóstico quando um agente surta. Ela existe na migration 001 desde o
primeiro dia e **nenhum resolver escreve nela**. A única referência no
código inteiro é a limpeza do `conftest.py` dos testes.

Consequência prática: hoje é impossível responder "quanto custou o tick
42?", "qual agente gasta mais?", "quantas rodadas falharam essa
semana?". Não é que a resposta seja difícil — o dado não existe.

### 0.2 O orçamento diário é um `UNION` hardcoded de 5 tabelas

`sql/ticks.sql:custo_gasto_hoje` soma `custo_usd` de
`relatorios_financeiros`, `refeicoes`, `planos_dieta`, `relatorios_saude`
e `cards` — cinco nomes escritos à mão.

Isso é um **bug de escala esperando acontecer**: todo domínio novo que
gastar LLM e não for adicionado nessa query gasta dinheiro invisível ao
guardrail. Um departamento de marketing inteiro poderia rodar sem nunca
aparecer no orçamento. E a falha é silenciosa, que é exatamente o tipo
de defeito que este projeto inteiro se organiza pra não cometer.

O conserto é o mesmo do 0.1: se todo gasto passar por `tick_execucoes`,
o orçamento vira `SELECT SUM(custo_usd) FROM tick_execucoes WHERE ...` —
uma query, uma tabela, imune a domínio novo.

### 0.3 `_HANDLERS_TRABALHO` não consegue expressar uma esteira

O registro em `resolvers/interacao.py:305` é
`{especialidade: {checar, descrever, executar}}`. Cada agente **olha o
próprio domínio, age sozinho e avisa o chefe**. Nenhum agente consome a
saída de outro.

O departamento de marketing que o chefe descreveu (planejamento →
criação → revisão) é outra forma: um item de trabalho que **atravessa**
agentes, onde a entrada do agente B é a saída do agente A. Não existe
primitivo pra isso no hub. `mensagens.respondendo_a_id` é threading
social, não passagem de bastão de trabalho.

Isso é o achado mais importante do documento: **adicionar marketing não
é "plugar mais um handler".** Precisa de um primitivo novo. Detalhe na
Parte 3.

### 0.4 `relacionamentos` cresce N×(N−1)

`scripts/seed.py:121` usa `itertools.permutations` — pares dirigidos.

| agentes | linhas em `relacionamentos` |
|---|---|
| 5 (hoje) | 20 |
| 9 (+1 depto de 4) | 72 |
| 17 (+3 deptos de 4) | 272 |

Não é o volume que preocupa (272 linhas é nada pro Postgres) — é a
**roleta social**, que itera candidatos a cada tick de cada agente. Com
17 agentes, todo mundo vira candidato a puxar papo com todo mundo, e a
Vita comentando o tempo com o revisor de marketing não é imersão, é
ruído. Precisa de escopo. Proposta na Parte 3.

### 0.5 O frontend já tem a fundação de departamento — e o backend não tem nada

Múltiplas salas (`salas/*.json`), porta clicável que navega entre elas,
espelhamento automático, conferência de consistência entre o conjunto.
Tudo isso já existe e funciona.

O que **não** existe: qualquer noção de departamento no backend.
`agentes.especialidade` é `TEXT` livre, `agentes.mesa` é um `SMALLINT`
solto (pressupõe um escritório só), e a lista `AGENTES` do frontend é
estática em código. Adicionar um agente hoje exige editar **três**
lugares: `scripts/seed.py`, `escritorio/agentes.ts` e o JSON da sala.

---

## Parte 1 — A reflexão sobre a visão (é aqui que eu discordo)

O chefe pediu participação real. Então: a visão é boa e é alcançável,
mas tem quatro pontos onde eu acho que o caminho óbvio é o errado.

### 1.1 "Vários projetos rodando em paralelo" — paralelo em que sentido?

Existem dois significados e eles têm custos de arquitetura muito
diferentes:

- **(a) Paralelo dentro do tick** — um clique em "avançar" faz TODOS os
  departamentos andarem um passo. É determinístico, auditável, cabe no
  orçamento, e não fere RNF01/RNF09.
- **(b) Paralelo no tempo real** — coisas acontecem enquanto você não
  está olhando. Isso **quebra frontalmente** o princípio fundador do
  hub ("nada de LLM automático, todo avanço é ação deliberada do
  chefe") e precisa de uma história de segurança inteira nova: kill
  switch, teto rígido que pausa o relógio sozinho, alerta de gasto.

Minha leitura é que o chefe quer a **sensação** de (b). E a boa notícia
é que dá pra ter a sensação de (b) com a segurança de (a) — ver 1.2.

**Proposta:** Sprint 2 faz só (a). (b) fica pra uma sprint própria,
depois que os indicadores da Parte 5 estiverem rodando e a gente souber
o custo real por tick com vários departamentos. Ligar relógio automático
sem essa medição é apostar às cegas com dinheiro de verdade.

### 1.2 "Nem precisa ser com agentes, mas ter rodando" — essa é a melhor ideia do briefing, e ela é de graça

Essa frase foi solta de passagem mas é, na minha opinião, a mais
importante que o chefe escreveu. Ela separa duas coisas que o projeto
vinha tratando como uma só:

| | **Vida do escritório** | **Trabalho dos agentes** |
|---|---|---|
| o que é | agente anda até a copa, senta, muda de postura, o relógio anda, a barra de progresso de uma campanha sobe | gerar card, fechar relatório, escrever peça |
| custo | **zero** | LLM, caro |
| quando roda | sempre, contínuo | só em tick, sob orçamento |
| como é feito | tabela de horário determinística + animação | `_HANDLERS_TRABALHO` / esteiras |

**O escritório pode parecer vivo 24 horas por dia por R$ 0,00.** Isso é
exatamente como jogos de simulação resolvem: em *The Sims*, o
comportamento autônomo sai de um sistema de necessidades numérico, não
de IA; em *Stardew Valley* e na série *Persona*, cada NPC tem uma
**tabela de horário** — às 8h está na loja, às 14h na praça, às 20h em
casa — e isso é só uma consulta por hora do relógio. *Theme Hospital* e
*Two Point Hospital* fazem o jogador *assistir* a um departamento
funcionar, e nada ali "pensa".

**Contraproposta concreta:** a Fase E (Parte 2) implementa vida ambiente
determinística — agentes com rotina por hora simulada, deslocamento
entre móveis, estado visual — **sem uma única chamada de LLM**. É a
feature que mais entrega a fantasia por unidade de custo em todo este
roteiro, e ela é independente das outras: pode ser puxada pra frente se
o chefe quiser uma vitória visível cedo.

### 1.3 O departamento de marketing provavelmente **não** deve ser 3 agentes de LLM

Aqui eu discordo abertamente do caminho natural.

A pesquisa de padrões de orquestração multi-agente de 2026 é bem
consistente sobre o custo: um pipeline de 3 agentes consome ~29.000
tokens contra ~10.000 de uma abordagem de agente único equivalente, e
multi-agente entrega cerca de **2,1 pontos percentuais** de ganho de
acurácia por **aproximadamente o dobro do custo**. Um pipeline de 4
agentes acumula ~950ms de overhead de coordenação para ~500ms de
processamento real.

Traduzindo pro hub: com `orcamento_diario_usd = 1.00`, uma campanha de
marketing em 3 estágios de LLM pode comer uma fatia grande do dia
inteiro — e aí a Cifra, a Vita, o Norte e a Agenda ficam mudos, porque
o orçamento é um pote só (0.2). O chefe descobriria isso pelo silêncio,
não por um aviso.

**A distinção que resolve isso:** *a metáfora do escritório é uma
decisão de INTERFACE, não um mandato de arquitetura.* Dá pra ter três
avatares numa sala de marketing — Estrategista, Redator, Revisor, cada
um com crachá, cor e mesa — enquanto por baixo roda **um agente com três
chamadas estruturadas sequenciais**, sem mensagem entre agentes, sem
overhead de coordenação. O chefe vê um departamento; o backend paga por
um agente.

**Proposta:** começar assim. Se depois medir (Parte 5) que a qualidade
da peça não é boa o suficiente, aí sim promover estágios a agentes
independentes — um de cada vez, medindo o delta de custo e de taxa de
aceite. É o mesmo "comece sempre tentando o Padrão A, só suba pro B se
sobrar decisão que genuinamente precisa explorar" que já está no
`guia-criacao-de-agentes.md`, seção 4, aplicado a departamento em vez de
a agente.

### 1.4 Não construir uma "plataforma de departamentos" antes do segundo departamento existir

O instinto de "arquitetura bem planejada pra suportar N departamentos"
é bom, mas tem uma armadilha que este projeto **já pagou uma vez**: o
frontend foi reconstruído cinco vezes, e a regra que nasceu daí está
escrita no `guia-tecnico-frontend.md` — *"quando o mesmo tipo de entrega
é rejeitado 2-3 vezes seguidas, parar de iterar e investigar a
causa-raiz."* A causa-raiz lá foi projetar contra uma ideia em vez de
contra a realidade.

Abstração tirada de **uma** instância é chute. Tirada de **duas** é
padrão.

**Proposta:** desenhar o *schema* agora (migration é aditiva, é barato e
evita retrabalho de dado), mas construir marketing **concretamente**,
com o mínimo de generalização. A DSL de esteira, a UI de gestão de
departamento e o "criar departamento pela tela" só depois que existirem
dois departamentos de verdade e a gente puder ver o que eles têm em
comum de fato.

### 1.5 Sobre simular o tempo: já está metade pronto

O chefe perguntou "vamos ver se é possível". É — e boa parte já existe:

| peça | estado |
|---|---|
| relógio simulado (`ticks.hora_simulada`) | ✅ pronto |
| quanto tempo cada tick vale (`tick_minutos_simulados = 60`) | ✅ pronto |
| dia da semana + período do dia derivados do relógio simulado | ✅ pronto (`_fato_do_dia`) |
| snapshot do mundo por tick (`ticks.estado_mundo`) | ✅ pronto |
| **expediente** (agente não trabalha às 3h da manhã) | ❌ falta |
| **rate limit por dia SIMULADO** (hoje é dia real) | ❌ falta — já no backlog |
| **avançar vários ticks de uma vez** | ❌ falta |
| calendário fictício (estações, feriados) | ❌ falta — já no backlog |

Duas observações que valem mais que a lista:

**O expediente é um guardrail de custo disfarçado de imersão.** Se o
escritório só trabalha das 9h às 18h simuladas, 15 dos 24 ticks do dia
não gastam nada com trabalho — o agente só socializa ou fica ocioso.
Ganha realismo e corta ~60% do custo de trabalho pelo mesmo preço de uma
comparação de inteiros.

**Um dia simulado hoje custa 24 cliques.** Com `tick_minutos_simulados =
60`, avançar um dia inteiro é clicar 24 vezes. Se o chefe quer sentir a
passagem do tempo, precisa de "avançar até o fim do expediente" ou
"avançar 1 dia". **Mas isso multiplica o custo por N**, então a checagem
de orçamento tem que rodar **a cada tick de dentro do lote**, não só uma
vez na entrada, e o lote precisa parar e dizer por que parou. Sem isso,
um clique em "avançar 1 dia" é um clique que pode gastar o orçamento
inteiro sem aviso.

---

## Parte 2 — A ordem de execução

A ordem não é por tamanho nem por empolgação — é por dependência. Cada
fase existe porque a seguinte fica pior sem ela.

### Fase A — Higiene e rede de segurança

*Por que primeiro: é barato, tira ruído, e a partir da Fase D o volume
de código dobra — teste manual não escala junto.*

| # | Item | Onde | Nota |
|---|---|---|---|
| A1 | `border` + `borderColor` misturados | `PainelAgenda.tsx` (2×), `CardAtivo.tsx`, `FormRefeicao.tsx` | já no backlog; warning de React no console |
| A2 | CI no GitHub Actions | `.github/workflows/` | já no backlog, com as duas opções de Postgres efêmero desenhadas |
| A3 | Testar upload com arquivo REAL | Cifra (extrato Itaú/Nubank), Vita (foto de refeição) | só foi testado com dado sintético; o risco está no parser, não no upload |
| A4 | Escala global das salas | `Escritorio.tsx:centralizar`, `PainelSalas.tsx` | **bloqueado**: precisa o chefe escolher o teto (16/20/24) — ver backlog |

A4 depende de uma decisão do chefe. As outras três não dependem de nada.

### Fase B — Instrumentação (é o "saber se está ok" que o chefe pediu)

*Por que antes das features: não dá pra gerenciar o que não se mede, e a
Fase D dobra a superfície. Medir depois de dobrar é medir tarde.*

| # | Item | Resolve |
|---|---|---|
| B1 | Escrever em `tick_execucoes` em toda chamada de LLM do hub | 0.1 — a tabela do controle finalmente ligada |
| B2 | Orçamento passa a somar `tick_execucoes`, aposenta o `UNION` de 5 tabelas | 0.2 — imune a domínio novo |
| B3 | `GET /metricas` + painel de indicadores no frontend | dá corpo à Parte 5 |

B2 depende de B1. B3 depende dos dois.

### Fase C — Tempo simulado

*Por que antes do departamento: o expediente é o guardrail de custo que
torna vários departamentos viáveis dentro de USD 1/dia (1.5).*

| # | Item |
|---|---|
| C1 | `expediente_inicio` / `expediente_fim`; fora do expediente não há trabalho, só social/ocioso |
| C2 | Rate limits e orçamento chaveados no **dia simulado**, não no dia real |
| C3 | `POST /tick/avancar?ate=fim_do_expediente\|proximo_dia` — lote com checagem de orçamento **a cada tick interno** e motivo de parada explícito |

### Fase D — O segundo departamento (a feature grande)

*Por que aqui: precisa de B (pra medir se compensa) e de C (pra caber no
orçamento).*

| # | Item |
|---|---|
| D1 | Migration: `departamentos`, `agentes.departamento_id`, `entregaveis` |
| D2 | Escopo social por departamento (0.4) |
| D3 | Orçamento hierárquico: teto por departamento dentro do teto global |
| D4 | Esteira: 1 estágio por tick, com gate do chefe no fim |
| D5 | Marketing concreto — **1 agente, 3 chamadas** (1.3), 3 crachás na tela |
| D6 | Frontend: sala declara qual departamento exibe; `AGENTES` sai de código e vem do backend |

### Fase E — Vida ambiente (custo zero de LLM)

*Independente das outras. Pode ser puxada pra frente a qualquer momento
se o chefe quiser uma vitória visível cedo — é a que mais entrega
fantasia por real gasto (1.2).*

| # | Item |
|---|---|
| E1 | Rotina determinística por hora simulada (tabela de horário por agente) |
| E2 | Deslocamento visual entre móveis (ida à copa, volta pra mesa) |
| E3 | Ocupação visível do departamento — quantos itens em cada estágio da esteira |

---

## Parte 3 — Arquitetura proposta

### 3.1 Departamento é conceito de BACKEND. Sala é conceito de FRONTEND. Não acoplar.

É tentador dizer "sala = departamento", já que as salas existem. Eu sou
contra, e o motivo já está escrito como regra no
`guia-tecnico-frontend.md`: *"dado de negócio e apresentação nunca se
misturam."*

Se acoplar, arrastar uma mesa no modo de edição vira uma mudança de
política de orçamento. Um departamento deixaria de existir porque
alguém apagou uma sala. E um departamento não poderia ocupar duas salas
nem uma sala mostrar dois departamentos.

**Ligação por referência, não por identidade:** o JSON da sala declara
`"departamento": "marketing"`; o departamento existe no backend
independente de qualquer sala.

```sql
CREATE TABLE departamentos (
    id                   SERIAL PRIMARY KEY,
    slug                 TEXT NOT NULL UNIQUE,   -- 'pessoal', 'marketing'
    nome                 TEXT NOT NULL,
    orcamento_diario_usd NUMERIC(10,4),          -- NULL = sem teto próprio
    expediente_inicio    SMALLINT NOT NULL DEFAULT 9,
    expediente_fim       SMALLINT NOT NULL DEFAULT 18,
    ativo                BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE agentes ADD COLUMN departamento_id INT REFERENCES departamentos(id);
```

Os 4 agentes atuais entram num departamento `pessoal` — migration
aditiva, nada quebra.

### 3.2 O primitivo novo: `entregaveis` (a esteira)

Isto é o que 0.3 mostrou faltar. E a boa notícia é que **já existe 90%
dele no hub**: a tabela `cards` do Norte é um item de trabalho com
máquina de estados (`sugerido → aceito → finalizado | rejeitado`), dono,
custo e carimbo de resolução. Generalizar é seguir o que já foi validado
na prática, não inventar.

```sql
CREATE TABLE entregaveis (
    id              SERIAL PRIMARY KEY,
    departamento_id INT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    esteira         TEXT NOT NULL,      -- 'campanha'
    etapa           TEXT NOT NULL,      -- 'planejamento' | 'criacao' | 'revisao'
    status          TEXT NOT NULL       -- 'aguardando' | 'em_andamento'
                      CHECK (status IN ('aguardando','em_andamento',
                                        'aguardando_chefe','concluido','rejeitado')),
    responsavel_id  INT REFERENCES agentes(id),
    payload         JSONB NOT NULL,     -- o que foi produzido até aqui
    origem_id       INT REFERENCES entregaveis(id),  -- de qual item veio
    custo_usd       NUMERIC(10,6) NOT NULL DEFAULT 0,
    tick_criado     INT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvido_em    TIMESTAMPTZ
);
CREATE INDEX idx_entregaveis_fila ON entregaveis (departamento_id, status, etapa);
```

A esteira em si é declarativa, em Python — não uma tabela, porque é
código (regra), não dado do chefe:

```python
ESTEIRAS = {
    "campanha": [
        Etapa("planejamento", produz="briefing"),
        Etapa("criacao",      consome="briefing", produz="peca"),
        Etapa("revisao",      consome="peca",     gate_chefe=True),
    ],
}
```

**Um estágio por tick — nunca a esteira inteira.** Essa é a decisão mais
importante do desenho, por três razões que se reforçam:

1. **Custo:** o teto por tick continua valendo. A esteira inteira num
   clique seria um gasto não previsto pelo guardrail.
2. **Observabilidade:** dá pra ver a campanha andar estágio a estágio, e
   interromper no meio.
3. **É a metáfora funcionando:** uma campanha de 3 estágios leva 3 ticks
   = 3 horas simuladas. Isso *é* o escritório trabalhando ao longo do
   dia, e não um job em lote disfarçado de escritório.

O último estágio tem `gate_chefe=True` → o entregável para em
`aguardando_chefe` e espera aprovação, consistente com RNF04. É o mesmo
aceitar/rejeitar que o Norte já usa, e é o que alimenta a métrica de
produtividade da Parte 5.

### 3.3 O loop do tick passa a ter duas passadas

```
para cada departamento ativo:
    se fora do expediente (hora simulada)  → pula trabalho, só social
    se orçamento do departamento esgotado  → registra motivo, pula

    PASSADA 1 — especialistas   (o que já existe, _HANDLERS_TRABALHO)
        cada agente olha o próprio domínio e age sozinho

    PASSADA 2 — esteiras        (novo)
        pega o entregável mais antigo em 'aguardando'
        executa UM estágio, grava custo em tick_execucoes
        avança pra próxima etapa (ou 'aguardando_chefe' no fim)

PASSADA 3 — social  (quem não trabalhou neste tick)
    roleta ponderada, agora escopada por departamento (3.4)
```

### 3.4 Escopo social — conserta 0.4 e ganha realismo de graça

Hoje todo agente é candidato a falar com todo agente. Com 17 agentes
isso é ruído, custo e irrealismo ao mesmo tempo — num escritório de
verdade, você fala muito mais com quem senta perto.

**Proposta:** peso da roleta multiplicado por um fator de proximidade
organizacional — mesmo departamento pesa 1,0; departamento diferente
pesa algo como 0,15. Não zerar: conversa de corredor entre
departamentos existe e é justamente o que dá sabor. Fica um número em
`config.py`, ajustável depois de rodar de verdade — igual todas as
outras constantes do módulo de interação.

Isso não exige mudar `relacionamentos` nem o seed. É um multiplicador
em `_peso_destinatario`.

### 3.5 Orçamento hierárquico

```
orcamento_diario_usd (global, teto duro)
├── pessoal    → sem teto próprio (usa o que sobra)
└── marketing  → teto próprio, ex: 0.40
```

Regra: um departamento nunca passa do próprio teto; a soma nunca passa
do global. Departamento sem teto próprio divide a sobra.

Isso conserta o modo de falha silencioso que hoje existiria: com um pote
só, quem roda primeiro no loop come tudo, e o resultado depende da ordem
de iteração — não-determinístico e difícil de diagnosticar, exatamente o
que este projeto evita. E quando um teto é atingido, isso vira **uma
linha em `tick_execucoes` com motivo**, não um silêncio.

---

## Parte 4 — Requisitos

Continuando a numeração de `frontend-design.md` (que vai até RF25 /
RNF09).

### Funcionais

**Departamentos**
- **RF26** — Listar departamentos com seus agentes, orçamento do dia e
  ocupação (quantos entregáveis em cada estágio).
- **RF27** — Uma sala do escritório declara qual departamento exibe;
  navegar pela porta troca o departamento em foco.
- **RF28** — A lista de crachás do escritório vem do backend
  (`GET /agentes` com `departamento_id`), não de uma lista estática em
  código.

**Esteiras**
- **RF29** — Abrir um entregável novo numa esteira (ex: "nova campanha")
  como ação deliberada do chefe.
- **RF30** — Ver o quadro da esteira: cada entregável, em que etapa
  está, de quem é a vez.
- **RF31** — Aprovar ou rejeitar um entregável parado em
  `aguardando_chefe`, com o mesmo peso visual da proposta da Agenda.
- **RF32** — Ver o histórico de um entregável: o que cada etapa produziu
  e quanto custou.

**Tempo**
- **RF33** — Ver a hora simulada e se o escritório está dentro ou fora
  do expediente.
- **RF34** — Avançar até o fim do expediente ou até o próximo dia, com
  o motivo de parada sempre explícito (chegou ao alvo / orçamento
  esgotado / erro).

**Indicadores**
- **RF35** — Painel de indicadores do escritório (Parte 5), por
  departamento e agregado.

### Não funcionais

- **RNF10 (orçamento por departamento)** — Nenhum departamento gasta
  além do próprio teto, e a soma nunca passa do teto global. Atingir um
  teto é sempre registrado com motivo, nunca vira silêncio.
- **RNF11 (custo rastreável num lugar só)** — Toda chamada de LLM do hub
  grava em `tick_execucoes`. O orçamento é calculado a partir dela e de
  mais nada. Domínio novo entra na contabilidade sem editar SQL nenhum.
- **RNF12 (um estágio por tick)** — Uma esteira nunca executa mais de um
  estágio por tick, mesmo que o orçamento permita. A esteira é
  interrompível a qualquer momento sem deixar entregável pela metade.
- **RNF13 (avanço em lote é seguro)** — Avançar N ticks checa o
  orçamento a cada tick interno e para na hora em que estourar, com o
  motivo. Nunca é possível gastar o dia inteiro num clique sem aviso.
- **RNF14 (vida ambiente é grátis)** — Toda animação/rotina/deslocamento
  de agente é determinística e nunca chama LLM. O escritório pode
  parecer vivo com orçamento zerado.
- **RNF15 (expediente)** — Fora do expediente simulado, nenhum
  departamento executa trabalho. Social e ocioso continuam valendo.
- **RNF16 (departamento não quebra os outros)** — Falha de um
  departamento (token externo fora, erro de LLM) nunca derruba a rodada
  dos outros — mesma degradação graciosa que a Agenda sem token do
  Google já tem hoje.

---

## Parte 5 — Metas mensuráveis (o "ISO")

Um ajuste de vocabulário antes, porque muda o que a gente constrói: ISO
9001 é certificação de *organização*, com auditoria externa — não é o
que serve aqui. O que o chefe descreveu (confiabilidade, desempenho,
produtividade com número e alvo) é **SLI/SLO**: indicador + meta. Na
metáfora do projeto: **os indicadores do escritório**.

Todos os indicadores abaixo saem de dado que **já é persistido** — o que
falta é só ligar `tick_execucoes` (Fase B).

| Meta | Indicador (SLI) | De onde sai | Alvo inicial |
|---|---|---|---|
| **Confiabilidade** | % de rodadas de tick sem erro | `tick_execucoes.erro IS NULL` | ≥ 95% |
| **Confiabilidade** | % de entregáveis que atravessam a esteira sem travar | `entregaveis` sem `em_andamento` velho | ≥ 90% |
| **Custo** | custo médio por tick | `SUM(custo_usd)/COUNT(DISTINCT tick)` | ≤ orçamento ÷ ticks do expediente |
| **Custo** | dias em que o teto foi atingido | `tick_execucoes` com motivo de teto | ≤ 1 por semana |
| **Produtividade** | **custo por entregável ACEITO** | custo total ÷ aceitos | ↓ ao longo do tempo |
| **Utilidade** | taxa de aceite por agente | aceitos ÷ (aceitos + rejeitados) | ≥ 60% |
| **Desempenho** | latência p95 da rodada | `tick_execucoes.criado_em` | < 30s |
| **Vitalidade** | % de ticks de expediente que produziram algo | rodadas com ≥1 ação ÷ total | 30–70% |

Três comentários sobre a tabela, porque a escolha de indicador importa
mais que o número:

**"Custo por entregável aceito" é a métrica que vale mais que todas as
outras juntas.** Custo bruto não diz nada — um agente barato que produz
lixo é caro. Um agente que gera 10 cards e tem 9 rejeitados custou 10
chamadas pra entregar 1 coisa útil. Essa métrica responde direto à
pergunta que importa: *esse agente se paga?* E ela só é possível porque
o hub já persiste `custo_usd` em tudo e já tem gate de aceitar/rejeitar
no Norte — estender o gate a todo entregável torna **todo departamento
mensurável pelo mesmo critério**.

**Taxa de aceite é sinal de qualidade que não precisa de LLM pra
avaliar.** Nada de "LLM as a judge" (que custaria mais LLM pra medir
LLM). O chefe clicando "aceitar" ou "rejeitar" já é o rótulo.

**"Vitalidade" tem alvo em FAIXA, não em máximo.** 100% seria um
escritório que nunca para — caro e irreal. 0% é um escritório morto. A
faixa 30–70% é chute inicial declarado; o número certo aparece rodando.

**Alvo que não vale a pena perseguir agora:** disponibilidade (é
single-user, na máquina do chefe) e throughput (não há demanda externa).
Medir isso seria cerimônia.

---

## Parte 6 — Referências, e o que aproveitar de cada

**Orquestração multi-agente (2026).** Os padrões que se consolidaram em
produção são Supervisor, Sequential Pipeline, Parallel Fan-Out, Router,
Hierarchical e Evaluator-Optimizer. O marketing do chefe é claramente um
**Sequential Pipeline** — dependência linear estrita, cada etapa precisa
da saída completa da anterior. Isso valida o desenho de `entregaveis`
(3.2). O dado que eu usaria pra decidir, e que sustenta 1.3: pipeline de
3 agentes ≈ 29k tokens contra ≈ 10k de agente único, com ganho de
acurácia na casa de 2 pontos percentuais. *(Fontes ao final.)*

**Generative Agents (Park et al., Stanford, 2023).** Já é inspiração
declarada do projeto. A parte que interessa agora é a que o hub **ainda
não** copiou: memory stream + reflexão + planejamento. As tabelas
`memorias` (com `tipo` = observacao/reflexao/plano) existem desde a
migration 001 e nunca foram usadas. **Minha recomendação é continuar não
usando por enquanto** — reflexão é justamente a parte cara do paper
(reprocessa memória periodicamente com LLM), e o retorno num hub
single-user de 4 domínios não justifica o custo. Fica registrado como a
evolução natural *depois* que os indicadores da Parte 5 mostrarem que
sobra orçamento.

**Simulação de vida sem IA — *The Sims*, *Stardew Valley*, *Persona*,
*Theme Hospital* / *Two Point Hospital*, *RimWorld*.** É de onde sai a
Fase E. *The Sims* gera comportamento autônomo convincente com um
sistema de necessidades puramente numérico. *Stardew* e *Persona* usam
tabela de horário por NPC — consulta por hora, custo zero. *Two Point
Hospital* é literalmente a experiência que o chefe descreveu: assistir
departamentos funcionarem. Nenhum deles usa IA generativa, e todos
parecem mais vivos que qualquer coisa que o hub tem hoje. É o argumento
central de 1.2.

**Padrão de fila/mailbox (modelo de atores).** `entregaveis` com
`status='aguardando'` e um responsável por etapa é, na prática, uma
caixa de entrada por agente. Vale citar porque nomeia o padrão e porque
a literatura de atores já resolveu as perguntas que vão aparecer: o que
fazer com item preso em `em_andamento`, e como não perder trabalho
quando um estágio falha no meio.

**Execução durável (Temporal e afins).** É o que resolve "retomar de
onde parou" de verdade. **Contraindico pra este projeto**: peso
enormemente desproporcional pra um hub single-user com tick manual.
Cito só pra registrar que, se um dia as esteiras ficarem longas e
falharem no meio com frequência, esse é o nome do que se procura — e não
inventar um do zero.

---

## Parte 7 — O que eu NÃO faria nesta sprint

Registrado com o porquê, no mesmo espírito do `backlog-futuro.md`:

- **Relógio automático.** Só depois que a Parte 5 der o custo real por
  tick com vários departamentos. Ligar antes é apostar às cegas com
  dinheiro real (1.1).
- **`memorias` / reflexão.** É a parte cara do Generative Agents e o
  retorno num hub de um usuário só não justifica hoje (Parte 6).
- **pgvector.** Consequência do anterior — sem memória, não há o que
  vetorizar.
- **Criar departamento pela tela / DSL de esteira genérica.** Abstração
  de uma instância é chute (1.4). Depois do segundo departamento.
- **3D.** Continua sendo upgrade de fantasia sobre algo que já funciona,
  como `avaliacao-mvp.md` argumentou e continua valendo.
- **Multi-usuário.** Decisão de arquitetura do hub inteiro, não ajuste
  isolado — já está no backlog com esse mesmo argumento.
- **Trabalho formal entre agentes de departamentos diferentes.** Ainda
  sem caso de uso concreto (já no backlog). A esteira resolve o
  fluxo *dentro* de um departamento, que é o que o marketing precisa.

---

## Decisões que dependem do chefe antes de começar

1. **Teto da escala global das salas** (A4): 16, 20 ou 24? Define quanto
   o escritório atual encolhe (11%, 27% ou 38%).
2. **Marketing: 1 agente com 3 chamadas, ou 3 agentes de verdade?** Eu
   recomendo começar com 1 (1.3), mas é decisão de produto — se a
   fantasia de ter três colegas conversando entre si vale o custo, é uma
   resposta legítima e eu construo assim.
3. **Teto de orçamento do marketing.** Sugiro começar em USD 0,40 de USD
   1,00 e ajustar com o dado da Parte 5.
4. **Expediente:** 9h–18h simuladas? E o escritório trabalha no fim de
   semana simulado?
5. **Fase E pra frente?** Ela é independente e é a mais visível. Se a
   vontade for ver o escritório vivo logo, dá pra rodar antes da D sem
   prejuízo nenhum.

---

*(Documento de proposta. Vira registro de decisão em
`produto-e-sprints.md` quando a Sprint 2 for aprovada e começar.)*
