# Backlog — ideias adiadas de propósito

Ideias discutidas durante o design dos agentes que fazem sentido, mas foram
deliberadamente deixadas fora do escopo atual. Registradas aqui pra não se
perderem e pra já vir com o contexto do porquê foram adiadas.

---

## Canal de mensagem (Telegram/WhatsApp) para lançar gasto avulso — Agente Financeiro

**Ideia:** deixar o usuário mandar uma mensagem tipo "gastei 45 reais no mercado
hoje" pelo Telegram ou WhatsApp (Evolution API, já citada no MVP original) e o
Financeiro parseia isso (bom caso de uso de LLM: texto livre -> dado
estruturado) e contabiliza como uma transação, sem esperar o extrato mensal.

**Por que foi adiada (não é só "mais trabalho"):** isso cria um problema real
de integridade de dado, não só uma tela a mais. Se o gasto for lançado
manualmente pelo canal E também aparecer depois no extrato do cartão (porque
foi no cartão), ele conta **duas vezes** a menos que exista uma etapa de
reconciliação entre lançamento manual e a linha do extrato. Essa etapa não
existe hoje e precisa ser desenhada antes de implementar o canal, não depois.

**O que vai precisar quando for retomada:**
- Campo `origem` em `transacoes` (`manual` | `extrato`) para diferenciar a
  procedência de cada linha.
- Uma lógica de casamento (matching) entre lançamento manual e a transação
  correspondente do extrato quando ele chegar — por proximidade de data/valor,
  provavelmente com confirmação do usuário nos casos ambíguos, não automático.
- Decidir o que mostrar no relatório enquanto uma transação manual ainda não
  foi "casada" com o extrato (ela conta pro mês corrente, mas fica marcada
  como não conciliada).
- Escolha entre Telegram Bot API (mais simples de integrar) ou a Evolution
  API do WhatsApp (já usada em outras integrações do hub) como canal de
  entrada.

**Status:** não iniciado. Agente Financeiro atual (versão inicial) é
100% leitura/análise/relatório a partir do extrato mensal — sem escrita.

---

## Open Finance (conexão bancária automática)

**Ideia:** conectar direto com o banco via Open Finance (Pluggy, Belvo ou
similar) em vez do usuário exportar e subir o CSV/extrato manualmente.

**Por que foi adiada:** superfície de segurança/compliance real (autenticação
bancária, tokens de acesso a dado financeiro sensível), custo de API paga por
conexão, e não é o que valida a experiência do MVP — o upload manual já
resolve o objetivo de ter o relatório e os KPIs.

**Status:** não iniciado, sem previsão. Reavaliar só se o upload manual se
mostrar um atrito real de uso no dia a dia.

---

## Buscar lugares próximos (sugestão de restaurante/local) — Agente Agenda

**Ideia:** quando o agente estiver negociando um compromisso do tipo
"jantar"/"encontro" e ainda não houver um local definido, ele pergunta "já tem
ideia de onde?" — se a resposta for não, sugere restaurantes próximos
(provavelmente via Google Places API ou similar).

**Por que foi adiada:** é uma tool nova (busca de lugar) e mais uma API externa
pra configurar (credencial própria, custo por chamada) — o núcleo do agente
(negociar horário, criar/mover/cancelar evento com confirmação) precisa
funcionar e ser validado primeiro.

**O que vai precisar quando for retomada:**
- Tool `buscar_locais_proximos(tipo_lugar, localizacao)` — provavelmente
  Google Places API (já que já estamos no ecossistema Google pro Calendar).
- Decidir se a sugestão de local também passa pelo gate de confirmação (não
  é uma ação real no calendário, é só uma sugestão — provavelmente não precisa
  do mesmo rigor, mas vale pensar).
- Encaixe no fluxo de negociação existente: mais uma pergunta objetiva antes
  da proposta final de evento, não abre uma ramificação de conversa nova.

**Status:** não iniciado. Agente Agenda atual cuida só de horário/conflito de
agenda, sem sugestão de local.

---

## Canal Telegram para o agente de Saúde (e potencialmente outros)

**Ideia:** o protótipo original que inspirou o agente de Saúde (bot
nutricionista) rodava 100% via Telegram (Pyrogram), inclusive recebendo foto
de prato direto por lá. Faria sentido esse ser o canal de entrada real no
dia a dia (mais rápido que abrir a API/frontend pra mandar uma foto).

**Por que foi adiada:** decidimos manter o agente de Saúde na mesma API do
resto do hub por enquanto (forms/menu, sem chat livre) — evita construir uma
integração de canal bespoke por agente antes de validar o núcleo (registro,
plano, relatório). Como Financeiro também já cogitou Telegram/WhatsApp pra
lançar gasto avulso (ver primeiro item deste arquivo), faz mais sentido
desenhar isso como uma camada de canal genérica, compartilhada entre agentes,
quando for retomada — não uma integração por agente.

**O que vai precisar quando for retomada:**
- Decidir a camada de canal (Telegram Bot API oficial, não Pyrogram/MTProto
  como no protótipo — mais simples e não exige sessão de usuário) de forma
  genérica, capaz de rotear pra qualquer agente do hub, não só Saúde.
- Upload de foto via Telegram precisa cair no mesmo endpoint de análise de
  refeição que a API já expõe — o canal só troca a forma de entrada, não a
  lógica.

**Status:** não iniciado. Agente de Saúde atual (inicial) usa forms/menu na
mesma API do hub, sem chat livre e sem canal externo.

---

## Agente de Saúde sugerir/montar a ficha de treino sozinho

**Ideia:** hoje (v1) o chefe cadastra a própria ficha de treino (dia da
semana -> grupo muscular -> exercícios com séries/repetições) via
`PUT /saude/ficha-treino` — é só escrita estruturada, sem LLM. A ideia é o
agente evoluir pra também SUGERIR/montar a ficha sozinho, tipo um personal
trainer de verdade — mesma lógica que já existe pra `gerar_plano_dieta`
(uma chamada estruturada usando o perfil como contexto), só que pra treino.

**Por que foi adiada:** o núcleo do agente (registro determinístico +
estimativa de macro de refeição + plano de dieta + relatório semanal)
precisa validar primeiro. Reaproveita boa parte do desenho já existente
quando for retomada (mesmo padrão de chamada estruturada única do
`gerar_plano_dieta`).

**O que vai precisar quando for retomada:**
- Uma função `agents/saude/agente.py:gerar_ficha_treino(perfil)` nos
  mesmos moldes de `gerar_plano_dieta` — schema estruturado (dias, grupos
  musculares, exercícios com séries/repetições), sem tool-loop.
- Decidir se o agente GERA a ficha inteira do zero ou só sugere ajustes em
  cima do que o chefe já cadastrou manualmente (provavelmente mais útil:
  sugerir sobre o que já existe, não substituir sem avisar).

**Status:** não iniciado. `ficha_treino_dias`/`ficha_treino_exercicios` já
existem no schema (com histórico via `ativo`), só a escrita manual está
implementada.

---

## Acesso multi-usuário ao agente Norte (colaborar em cards)

**Ideia:** quando o uso escalar, outras pessoas (não só o chefe) poderem
acessar um projeto no Norte e criar/resolver cards nele — útil se um
projeto pessoal virar algo com colaboradores.

**Por que foi adiada:** o hub inteiro hoje é single-user (o chefe) — não
existe conceito de múltiplos usuários, autenticação ou permissão em
NENHUM agente ainda. Introduzir isso só pro Norte seria inconsistente com
o resto do hub; se for retomado, é uma decisão de arquitetura do hub como
um todo (autenticação real), não um ajuste isolado de uma tabela.

**Status:** não iniciado. V1 do Norte é single-user, igual todo o resto.

---

## Leitura mais profunda do repositório no agente Norte

**Ideia:** a v1 do Norte manda pro LLM só um contexto raso na hora de
gerar um card — estrutura de pastas de alto nível (não recursiva),
README, manifest (package.json/pyproject.toml) e nomes (não conteúdo) dos
arquivos alterados recentemente. Se a qualidade das sugestões não for boa
o suficiente com isso, o próximo passo é ler o CONTEÚDO de fato dos
arquivos alterados recentemente (ou um subconjunto relevante) antes de
sugerir o card.

**Por que foi adiada:** é bem mais caro (mais tokens por chamada) e mais
complexo — provavelmente precisaria virar um agente com tool-calling
(explorar quais arquivos vale a pena ler) em vez da chamada estruturada
única que a v1 usa, exigindo os mesmos guardrails de recursion_limit que
já usamos no Agenda. Decisão deliberada: começar raso, validar qualidade
das sugestões primeiro, só aprofundar se necessário.

**Confirmado que é necessário** (teste real com o repositório toss-flow,
ver conversa de design): o primeiro card gerado sugeriu implementar uma
funcionalidade (upload de planilha) que a própria `descricao` do projeto
já dizia existir — o Norte não tem como saber o que já está implementado
de fato sem ler o código, só o resumo compacto (descricao/arquitetura/
README). Foi adicionada uma regra de prompt pra mitigar o caso óbvio
(nunca contradizer a própria descricao/arquitetura), mas isso não
resolve o problema de raiz — só a leitura de conteúdo real resolve.
**O chefe confirmou que isso é prioridade pra próxima sprint, não "algum
dia".**

**Status:** não iniciado, mas confirmado como necessário e priorizado
pra próxima sprint. V1 do Norte usa só o contexto raso descrito acima.

---

## Pipeline de CI no GitHub (rodar a suíte de testes automaticamente)

**Ideia:** GitHub Actions rodando `pytest` a cada push/PR na branch
`agentes` (e depois `main`), pegando regressão antes de chegar no chefe
testar manualmente.

**Por que foi adiada:** a suíte de testes local (ver
`docs/produto-e-sprints.md`, Sprint 0) reaproveita o Postgres do
`docker-compose.yml` que o chefe já sobe manualmente na máquina dele —
não existe isso num runner do GitHub Actions, então o pipeline de CI
precisa de uma estratégia diferente de banco, não a mesma da suíte
local.

**O que vai precisar quando for retomada:**
- Um `.github/workflows/testes.yml` que sobe um Postgres efêmero **no
  próprio runner** — duas opções: (a) o serviço `postgres` nativo do
  GitHub Actions (`jobs.<job>.services`, mais simples, não precisa de
  biblioteca nova) ou (b) `testcontainers` (mesma lib cogitada e
  descartada pra uso local, mas que faz mais sentido aqui, já que o
  runner do GitHub Actions tem Docker disponível por padrão e não há
  `docker compose up -d` manual pra reaproveitar).
- Rodar `scripts.migrate` + a suíte `pytest` contra esse banco efêmero.
- Nunca rodar teste end-to-end de verdade (API real do GitHub/OpenAI) no
  CI — custaria token a cada push. Só os níveis 1-3 (unitário, integração
  com LLM mockado, contrato HTTP) descritos na conversa de design da
  suíte de testes.
- Decidir o gatilho: todo push, só em PR, ou só antes de merge — e se
  quebrar o pipeline deveria bloquear o merge (branch protection) ou só
  avisar.

**Status:** não iniciado. Suíte de testes local é pré-requisito (feita
primeiro, ver Sprint 0).

---

## Afinidade sensível ao conteúdo/sentimento da conversa — módulo de interação

**Ideia:** hoje (Etapa 2, camada social) a afinidade entre dois agentes
cresce só pela frequência de troca de mensagem (fórmula de retorno
decrescente, ver conversa de design). A ideia adiada é fazer o
*tamanho* do ganho de afinidade variar de acordo com o teor da
conversa — ex: falar de assuntos específicos ou uma mensagem com tom
mais "caloroso" renderia mais afinidade do que uma troca genérica.

**Por que foi adiada:** fazer isso direito exige ou uma chamada de LLM
extra por mensagem só pra classificar sentimento/tópico (dobra o custo
de cada interação social) ou uma heurística de palavra-chave (frágil,
fácil de furar e de dar resultado estranho). Decisão: validar primeiro
a mecânica simples de frequência com retorno decrescente rodando de
verdade, e só depois avaliar se vale a pena adicionar essa camada.

**Status:** não iniciado. Pré-requisito: Etapa 2 (camada social) do
motor de tick rodando de forma estável.

---

## Calendário fictício completo — motor de tick

**Ideia:** ir além do fato simples de dia-da-semana/período do dia
(derivado de `ticks.hora_simulada`, isso já entra na Etapa 2) e simular
de verdade a passagem do tempo dentro do "escritório vivo" — X ticks
equivalendo a um dia fictício, Y ticks a uma semana fictícia, e assim
por diante, com um calendário interno completo (estações, feriados
fictícios, etc.). O objetivo é os próprios agentes terem uma base
temporal rica pra se orientar e conversar (saber se é dia ou noite, que
dia da semana fictício é, potencialmente até época do ano fictícia),
não só o chefe observando de fora.

**Por que foi adiada:** é uma feature grande por si só, que merece
debate de design próprio (quanto tempo fictício cada tick representa,
como isso se relaciona com `tick_minutos_simulados` já existente, se
afeta comportamento dos agentes ou é só contexto passivo, se vale a
pena ter feriados/estações fictícios). Misturar isso com o fechamento
simples da Etapa 2 (dia da semana + período do dia) ou com o começo da
Etapa 3 ia acumular risco demais de uma vez só — mesma disciplina de
etapas que guia todo o módulo de interação.

**Status:** não iniciado. Ideia confirmada pelo chefe como prioridade
da próxima sprint (não "algum dia") — retomar com debate de design
próprio antes de qualquer código.

---

## Trabalho formal entre agentes (não só agente→chefe) — módulo de interação

**Ideia:** hoje (Etapa 3) `mensagens.tipo='trabalho'` é escopado só pra
agente→chefe (alertas/atualizações proativas, ex: Norte avisando de
card gerado por estagnação). A ideia adiada é permitir mensagem
formal de trabalho **entre agentes** também — ex: a Cifra avisando
formalmente a Agenda sobre algo relevante aos dois domínios, uma
coordenação de verdade entre colaboradores, não só fofoca social.

**Por que foi adiada:** ainda não existe nenhum caso de uso concreto
("por que a Cifra precisaria mandar um recado formal pra Agenda? que
decisão isso dispara?"). Decisão: manter o escopo da Etapa 3 enxuto
(só agente→chefe) até aparecer uma razão real de coordenação entre
domínios que justifique essa mensagem.

**Status:** não iniciado. Pré-requisito: Etapa 3 (proatividade de
trabalho) rodando de forma estável, e um caso de uso real identificado.

---

## Rate limits baseados em dia SIMULADO, não em dia real — módulo de interação

**Ideia:** hoje todos os tetos diários do motor de tick (rate limit de
mensagens sociais por par, teto de avisos proativos de trabalho por
agente, orçamento diário) são calculados a partir do **dia real**
(`datetime.now()`), porque o disparo do tick ainda é sempre manual —
não existe "um dia" simulado consistente pra usar como referência
ainda. Quando o relógio simulado virar automático (ver backlog do
motor de tick / `tick_intervalo_min` já existente em `config.py`), com
uma cadência definida de ticks por dia fictício (ex: 24 ticks = 1 dia),
esses tetos deveriam passar a ser calculados em cima do dia SIMULADO
(`ticks.hora_simulada`), não mais do relógio real — senão alguém
disparando muitos ticks manualmente num único dia real burla o teto
pretendido, e o inverso (poucos ticks num dia real longo) faz o teto
resetar sem o "dia" fictício ter de fato avançado o suficiente.

**Por que foi adiada:** só faz sentido migrar isso depois que existir
uma cadência automática de tick definida — antes disso não tem "dia
simulado" real pra basear o cálculo, só o disparo manual que já
temos.

**Status:** não iniciado. Pré-requisito: automação do disparo do tick
(ver backlog de `tick_intervalo_min`) e definição de quantos ticks
equivalem a um dia fictício.

---

## Conteúdo social soando forçado/repetitivo — módulo de interação

**Ideia:** achado na validação manual do chefe (thread de resposta):
as mensagens sociais estão emendando um comentário sobre "o chefe" com
frequência alta demais, de um jeito que soa repetitivo/forçado entre
mensagens de agentes diferentes, em vez de variado e natural. Não é
sobre a mecânica de decisão (elegibilidade, roleta, resposta de
pendência — tudo isso já validado e funcionando certo), é sobre a
QUALIDADE do texto gerado pelo prompt em si.

**Causa raiz (confirmada):** o próprio prompt mandava "não repita
assunto do histórico" + "traga algo novo" em TODA mensagem, forçando
novidade a cada turno — o oposto de uma conversa real. Somado a frases
longas e elaboradas, dava o efeito de sempre emendar um comentário
sobre o chefe.

**Já tratado (primeira rodada):** prompt reescrito pra tom curto e
casual (frase solta, gíria ok, sem terminar com pergunta/proposta,
`max_length` 500 -> 300); e "puxar assunto novo" virou ocasional via
`interacao_chance_novo_assunto` (30%) em vez do padrão de toda
mensagem — resposta nunca puxa, conversa vazia sempre pode, conversa
em andamento sorteia. Ver commit "Deixa a conversa social mais
natural".

**O que ainda pode faltar (observar em rodadas futuras):** afinar a %
(30% pode precisar subir/descer), mais variedade de ganchos além de
eventos_mundo + fofoca sobre o chefe, e avaliar se o tom ficou natural
o suficiente ou se ainda escorrega pro mesmo fallback. Reabrir só
depois de mais exemplos reais rodando.

**Status:** primeira rodada de ajuste feita e testada; refinamento fino
pendente de observação real.

---

## Proatividade Sabor B (aviso/cutucão comportamental) — módulo de interação

**Ideia:** o Sabor A da proatividade (feito — os 4 agentes) é
"alerta/ação proativa": o agente percebe um entregável vencido, EXECUTA
a ação (gera relatório/card, lê a agenda) e avisa. O Sabor B, adiado,
é o "cutucão comportamental": o agente percebe uma LACUNA no
comportamento do chefe e alfineta, sem gerar artefato nenhum — ex:
Vita "faz 2 dias sem registrar refeição", Cifra "gasto dessa semana
bem acima da média", Agenda "compromisso amanhã ainda sem confirmar".

**Por que foi adiado:** diferente do Sabor A (condição binária limpa:
"existe mês/semana fechado sem relatório"), o Sabor B precisa de
thresholds subjetivos (o que é "gasto acima do normal"? quantos dias
sem refeição viram cutucão?) e de uma guarda anti-spam mais delicada
pra não virar chateação. Decidido validar o Sabor A rodando primeiro.

**Onde encaixa quando for retomado:** mesma infra já pronta — é só
plugar mais handlers em `_HANDLERS_TRABALHO` (ou um registro paralelo),
cada um com seu `checar` determinístico. O teto diário de avisos por
agente e o orçamento compartilhado já cobrem o anti-spam base; o que
falta é definir os gatilhos comportamentais por domínio, um a um, no
mesmo processo de debate.

**Status:** não iniciado. Pré-requisito: Sabor A rodando de forma
estável e observado na prática.

---

## Escala global das salas (mobília do mesmo tamanho em qualquer ambiente) — Frontend

**Prioridade: alta.** Não é ideia solta — é um defeito conhecido, com a
solução já desenhada e validada visualmente. Só foi adiada pra não travar
outras frentes.

**O problema:** hoje a escala do mundo é calculada pra CADA sala caber na
tela, então ela muda conforme o tamanho da sala. O mesmo `bench` aparece
com tamanhos bem diferentes dependendo do ambiente:

| sala | escala do mundo (tela 1440×900) |
|---|---|
| 6×6 | 0,76 |
| 7×7 | 0,66 |
| 10×10 | 0,49 |
| 20×20 | 0,26 |

Ou seja: até 66% de diferença de tamanho pro mesmo móvel. Quebra a ideia
de "um mundo só" — atravessar uma porta não deveria redimensionar a
mobília.

**Caminhos descartados (com o porquê):**
- *Escalar só o objeto espelhado pra compensar:* não existe escala por
  objeto, só do mundo inteiro. Compensar deixaria uma porta mais alta que
  a própria parede, ao lado de uma mesa em escala normal.
- *Zoom fixo + câmera (pan/zoom):* testado e **rejeitado visualmente**.
  Em sala grande o fundo preto some, as paredes ficam cortadas e a sala
  deixa de parecer maquete vista de fora — que é a ideia fundadora do
  projeto. E como pra ver uma sala grande inteira ela precisa ser pequena
  na tela, dar zoom out chega exatamente na imagem de hoje: a câmera não
  elimina o compromisso, só muda o momento em que ele aparece.

**A solução escolhida (validada em print, aprovada como conceito):** uma
escala ÚNICA e global, derivada não do tamanho da sala atual, mas do
**maior tamanho de sala que o sistema permite**. Se a maior cabe, todas
cabem — e como a escala é a mesma pra todas, o móvel nunca muda de
tamanho. Sala pequena passa a sobrar fundo em volta, que é a leitura
correta de uma sala pequena.

**Detalhe geométrico que importa:** a área que a sala ocupa na tela
depende SÓ da soma `colunas + linhas` (largura = (c+l)×104, altura =
(c+l)×73 + parede). Uma 10×10 e uma 14×6 ocupam exatamente a mesma área.
Então o teto deve ser sobre a SOMA, não sobre cada lado — assim salas
compridas e estreitas continuam possíveis.

**A decisão que ficou em aberto:** qual teto, já que ele define quanto
tudo encolhe em relação a hoje.

| teto (soma) | maior sala | escritório encolhe |
|---|---|---|
| 16 | 8×8, 10×6, 12×4 | 11% |
| 20 | 10×10, 14×6, 16×4 | 27% |
| 24 | 12×12, 16×8 | 38% |

Não existe versão em que o escritório fica igual a hoje E a mobília é
consistente entre salas: "igual a hoje" é justamente a escala que só
serve pro 7×7.

**O que muda quando for retomado:** só a conta da escala em
`Escritorio.tsx` (`centralizar`) e o limite do formulário em
`PainelSalas.tsx` (hoje 3–20 por lado, chute que nunca foi pedido —
viraria um teto sobre a soma). Nada de criação de sala, formato, paleta
ou fundo é afetado.

**Status:** não iniciado, decisão de teto pendente com o chefe.

---

## Pontas soltas dos painéis de agente — Frontend

As quatro telas de agente (Agenda, Vita, Norte, Cifra) estão construídas
e verificadas em navegador com backend simulado. Isto é a lista do que
ficou faltando em cada uma, pra ser varrido depois — nenhum é
desconhecido, todos foram decisões conscientes de adiar.

**Vita — atalho de peso/hidratação na bolha do avatar (RF19).**
A especificação pede os dois campos como atalho **na bolha do crachá,
sem abrir o painel**. Hoje eles estão no topo do painel: resolve o
atrito de navegar por menus, mas ainda exige abrir a tela. Falta o
popup ancorado no crachá — o mecanismo visual já existe
(`PopupPorta`), o que falta é ele aceitar conteúdo interativo (o popup
de porta é `pointerEvents: none`) e um gesto de abertura que não
conflite com o clique que abre o painel.

**Cifra — KPI de saldo do último extrato.**
`saldo_ultimo_extrato` é sempre `null`: extrair saldo de fechamento não
está implementado nos parsers (TODO declarado em
`resolvers/financeiro.py`). O KPI foi **omitido** da tela em vez de
mostrar um "—" permanente, que seria ruído. Quando o parser passar a
extrair, é só voltar a exibir.

**Cifra — upload de extrato com arquivo real.**
O caminho foi verificado com um PDF sintético via Playwright (o
multipart monta e o resultado é exibido), mas nunca com um extrato de
verdade do Itaú/Nubank. É o primeiro teste a fazer quando o Postgres
subir — o risco não está no upload, está no parser.

**Vita — upload de foto de refeição com imagem real.**
Mesma situação: o caminho de texto foi verificado ponta a ponta, o de
foto só na montagem do multipart. Vale testar com foto de verdade.

**Editor — Ctrl+C/Ctrl+V não sobrevive à troca de sala.**
A área de transferência é da sessão do editor, de propósito (guardar em
localStorage faria uma peça copiada semanas atrás reaparecer sem
contexto). Mas copiar um móvel de uma sala e colar em outra é um desejo
razoável que hoje não é atendido. Se virar necessidade, o caminho é uma
"área de transferência entre salas" explícita, com validade curta.

**Aviso de saída ao fechar a aba — não verificado em navegador.**
A lógica está coberta pelos outros testes (o rascunho grava, e as
navegações internas suprimem o aviso), mas o diálogo nativo do
`beforeunload` não dispara de forma confiável em fechamento
programático do Playwright. Só validação manual fecha esse.

---

## Ler de volta o que já foi registrado (histórico) — Backend + Frontend

Levantado na primeira bateria de testes com o Postgres de verdade. Três
sintomas diferentes, uma causa comum: **o dado é gravado, mas não existe
endpoint que o leia de volta.** Nada está sendo perdido.

**Vita — refeição, sono e atividade somem da tela.**
`POST /saude/refeicao/*`, `/sono` e `/atividade` gravam e devolvem o
registro, que a tela mostra ali mesmo. Ao trocar de aba, some. As
queries de leitura **já existem** (`refeicoes:historico`,
`sono_historico:historico`, `atividades_fisicas:historico`) — o que
falta é `GET` pra cada uma no router e uma lista na tela. É a menor das
três e a mais visível.

**Agenda — a conversa não sobrevive ao reload.**
Aqui é diferente das outras duas: o chat **não é gravado em lugar
nenhum**. `resolvers/agenda.py` persiste só a `acao_pendente` (com o
`pedido_original`, que é o que reconstrói o contexto da negociação); as
bolhas vivem no estado do React e morrem com ele. A tabela `mensagens`
existe e é usada pelo módulo de interação (agente↔agente), não pelo
chat com o chefe.
Decidir primeiro **se** deve persistir: o agente é de negociação curta
("marca dentista quinta"), não um assistente de conversa longa, e
histórico eterno tem custo de contexto. Se for persistir, o par é
gravar em `mensagens` no resolver + `GET /agenda/conversa`.

**Cifra — extrato importado que "não aparece".**
O dashboard é estritamente por mês (`data >= mes AND data < mes+1mês`,
em `sql/transacoes.sql`) e abre no mês CORRENTE. Extrato de mês passado
importa certo e não aparece até trocar o seletor. O upload já devolve
`periodo_inicio`/`periodo_fim`; o conserto barato é o painel oferecer
pular pro mês do extrato recém-importado em vez de deixar o chefe
descobrir sozinho. Confirmar antes com `SELECT DISTINCT
date_trunc('month', data) FROM transacoes` que é isso mesmo.

---

## Teto de tool calls do agente de Agenda é só instrução, não trava — Backend

Em teste, responder "sexta" a uma pergunta do agente fez ele chamar
`listar_eventos_periodo` seis vezes seguidas até estourar o
`recursion_limit` (12). O `recursion_limit` fez o trabalho dele — a
falha é graciosa, vira uma pergunta educada e nunca 500 —, mas
`MAX_TOOL_CALLS` aparece no SYSTEM_PROMPT como texto ("Máximo de {N}
chamadas de tool"), e instrução em prompt não é limite: é sugestão.

O certo é um middleware que conte as chamadas e corte na N-ésima,
devolvendo o controle ao modelo com "chega de tool, responda agora".
Aí o `recursion_limit` volta a ser o que deve ser: rede de segurança
que nunca é tocada, e não o mecanismo de parada de todo dia.

---

## Aviso de saída contradiz o auto-rascunho — Frontend (decisão do chefe)

O comportamento pedido está implementado e funciona: mudança na sala
vira rascunho local sozinho (600ms), e fechar a aba com trabalho fora
do arquivo do projeto dispara o aviso do navegador. O problema é o
TEXTO: o diálogo nativo diz que as alterações podem ser perdidas — e
elas não são. Recarregar sem salvar mantém tudo, que é justamente o que
foi pedido ("igual funciona no excel").

O navegador não deixa escolher a frase do diálogo, então as saídas são:
tirar o aviso e confiar no auto-rascunho; manter e deixar o HUD dizer
claramente "rascunho local · fora do arquivo do projeto"; ou trocar o
aviso do navegador por um do próprio app na troca de sala. É decisão de
UX — fica com o chefe.

---

## Painel de mensagens busca até 500 linhas do mural pra tudo — Frontend/Backend

`PainelMensagens.tsx` (as duas abas — "minhas conversas" e "mural")
parte do MESMO fetch: `GET /mensagens` com `limite=500` (o teto do
endpoint), sem filtro nenhum no servidor. A aba de conversas filtra no
CLIENTE pra só o que toca o chefe; a aba de mural usa tudo. Funciona,
mas busca sempre o máximo permitido mesmo quando só uma fração interessa
(a aba de conversas, por exemplo, ignora todo papo agente↔agente). Se o
volume de mensagens crescer, duas coisas quebram: (1) a conversa do
chefe pode sair da janela de 500 antes de aparecer na aba de conversas;
(2) o próprio mural, que hoje mostra tudo sem paginação, vira uma lista
que só cresce dentro do painel.

Por que não `GET /mensagens/caixa-de-entrada` pra aba de conversas: esse
endpoint filtra por `destinatario_id = chefe`, então só devolve o que
CHEGA a ele — a resposta que o próprio chefe manda
(`POST /mensagens/{id}/responder`) grava com `destinatario_id` = o
AGENTE, e por isso fica de fora dessa consulta. Uma thread montada só
com ele mostraria o agente falando sozinho.

Consertos possíveis (escolha do chefe, é decisão de arquitetura visível
na tela): (a) um endpoint novo tipo `GET
/mensagens/conversa/{agente_id}` que já traga as duas pontas pra
alimentar só a aba de conversas; (b) paginação de verdade em
`GET /mensagens` pro mural (hoje é "os 500 mais recentes", sem
"carregar mais"); ou (c) `GET /mensagens/caixa-de-entrada` passar a
incluir também o que o chefe enviou (mudaria o significado do endpoint
pra quem mais o consome hoje — nenhum outro lugar por enquanto).

---

## `border` + `borderColor` misturados no mesmo objeto de estilo — Frontend

Achado varrendo o escritório com o navegador aberto: o console do React
avisa "Removing a style property during rerender... don't mix shorthand
and non-shorthand properties" toda vez que um componente usa `{...BASE,
borderColor: X}` sobre uma `BASE` que já define `border: 'Npx solid Y'`
— as duas describem a MESMA propriedade CSS por caminhos diferentes, e
o React não sabe garantir qual vale depois de um re-render.

Já corrigido nos componentes do escritório/HUD e no `botaoPrincipal`
compartilhado (`features/agentes/estilos.ts`), que alimenta os quatro
painéis de agente. **Ainda pendente** nos arquivos que têm essa mesma
mistura só LOCALMENTE (não usam `botaoPrincipal`, então a correção
daquele arquivo não alcançou):

- `features/agenda/PainelAgenda.tsx` (dois lugares: os botões de
  confirmar/rejeitar e a bolha do chefe no chat)
- `features/norte/CardAtivo.tsx` (a borda do card muda de cor conforme
  `sugerido`)
- `features/saude/FormRefeicao.tsx` (as abas "texto"/"foto")

Consertar é sempre a mesma receita: trocar `borderColor: X` por
`border: 'Npx solid X'` completo (mesma largura/estilo da base).

---

## Ícones do HUD são SVG aproximado, não os arquivos originais — Frontend

O chefe colou três referências visuais (avançar/fast-forward, envelope,
engrenagem) direto na conversa. Não há ferramenta que extraia bytes de
imagem de algo só "visto" numa mensagem — por isso `escritorio/icones.tsx`
tem versões desenhadas à mão em SVG, na mesma linguagem visual (traço
grosso, arredondado, monocromático), mas não pixel-a-pixel iguais às
referências.

Se o chefe quiser os arquivos exatos: soltar os PNGs/SVGs em
`frontend/public/icones/` (ou pasta equivalente) e trocar os três
componentes (`IconeAvancarTick`, `IconeMensagens`, `IconeConfiguracoes`)
por `<img src="..." />` — a troca é local a esse arquivo, nada mais
depende do formato interno do ícone.
