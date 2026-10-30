# Frontend — decisões de design por agente (documento vivo)

Nenhum frontend foi construído ainda — o hub inteiro até aqui é backend
(Financeiro, Agenda, Saúde). Mas cada agente, durante a conversa de design
*antes* de codar, já gerou decisões reais de UI/UX (chat vs. form, o que
aparece na tela, o que fica escondido) que valem a pena registrar agora,
enquanto estão frescas — senão se perdem até o frontend começar de
verdade. Este arquivo é atualizado a cada nova decisão desse tipo, não só
quando o frontend for implementado.

Diretriz geral já validada em `avaliacao-mvp.md`: **2D primeiro, 3D depois**
— uma UI 2D simples (cartões/painéis por agente) já prova a experiência
inteira; o "escritório 3D" é upgrade de fantasia, não pré-requisito.

---

## Princípios transversais (valem pra qualquer agente novo)

- **Chat livre não é o padrão — é a exceção.** Cada agente usa a
  interação mais barata/determinística que o domínio permitir. Chat só
  onde existe negociação/raciocínio real (Agenda). Registro estruturado
  vira botão + form (Saúde). Ação em lote vira upload (Financeiro).
- **Nenhum metadado de custo aparece pro chefe** (decisão original do
  Financeiro, ver `resolvers/financeiro.py:obter_relatorio`): modelo,
  tokens, custo_usd ficam só no banco, nunca na resposta que o frontend
  recebe. Vale pra todos os agentes, não é peculiaridade do Financeiro.
- **Ação que mexe em sistema externo sempre tem confirmação explícita
  antes de executar** (Agenda/Google Calendar) — isso precisa aparecer na
  UI como um estado visualmente diferente de uma mensagem comum (ver
  "decisões em aberto" abaixo), não só texto corrido perguntando "confirma?".
- **Ação que só mexe no próprio banco não precisa de confirmação** (Saúde)
  — pode salvar e já mostrar feedback imediato, sem fricção de "tem
  certeza?" pra cada registro do dia a dia.
- **Cor e emoji por agente já existem no banco** (`agentes.avatar_config`,
  populado em `scripts/seed.py`) — é só o frontend consumir, não precisa
  redecidir isso na hora de construir a tela.
- **Estado visual do agente já existe no schema** (`agentes.estado`:
  idle/pensando/falando/executando, ver `db/migrations/001_init.sql`) —
  ainda não é setado por nenhum resolver hoje (fica pro motor de tick
  atualizar), mas o campo já está pronto pro frontend ler.

---

## Por agente

### Financeiro (Cifra)

**Padrão de interação:** painel/dashboard, **sem chat**.

- Upload de extrato: seletor de arquivo + escolha de banco (Itaú/Nubank).
  Sem preview antes de importar — o retorno já vem com
  total/novas/duplicadas.
- Dashboard: KPIs + gráficos calculados ao vivo (`GET /financeiro/dashboard`),
  sempre por mês (`YYYY-MM`) — precisa de um seletor de mês na tela.
- Relatório mensal: ação deliberada e separada do dashboard (botão
  "Gerar relatório", nunca automático) — mostra a narrativa (padrões,
  recomendações, resumo) depois de gerado; se ainda não existe pro mês,
  a tela deveria oferecer o botão de gerar, não só um erro genérico.
- Metadados de custo (decisão explícita, ver princípios acima): não
  aparecem em lugar nenhum da tela.

### Agenda

**Padrão de interação:** chat conversacional (mas o backend roteia por
palavra-chave — não é um LLM em chat livre de verdade).

- Uma caixa de mensagem de texto simples (`POST /agenda/mensagem`).
- Resposta do agente pode ser: informativa, pergunta, ou proposta
  aguardando confirmação (`aguardando_confirmacao: true` no retorno) —
  a UI precisa diferenciar visualmente uma proposta pendente de uma
  mensagem comum (ver decisão em aberto abaixo sobre botões).
- Confirmar/rejeitar tem endpoint próprio
  (`POST /agenda/acoes/{id}/confirmar|rejeitar`) — não precisa
  necessariamente depender do usuário digitar "sim"/"não" de novo.
- Existe uma consulta determinística de "qual pendência está em aberto"
  (frase-gatilho no texto).

**Construído (painel do Agenda) — decisões que estavam em aberto e foram
resolvidas na prática:**

- **Confirmar/rejeitar tem OS DOIS caminhos: botão e texto.** O backend
  já aceita ambos (regex de "sim/confirma/pode" e "não/cancela" + endpoint
  por id), então restringir a UI a um só seria jogar fora capacidade que
  já existe. Os botões evitam a ambiguidade de digitação; o texto continua
  valendo porque é ele que permite **ajustar** a proposta ("pode ser, mas
  às 10h") em vez de só aceitar ou recusar em bloco. O painel deixa isso
  explícito com uma linha abaixo dos botões.
- **A pendência É consultada proativamente ao abrir o painel.** O que
  destravou a dúvida foi notar que essa frase-gatilho é interceptada por
  regex ANTES de qualquer chamada de modelo (`_PADRAO_CONSULTAR_PENDENCIA`
  em `resolvers/agenda.py`) — ou seja, custa zero de LLM e não viola o
  RNF01. Se não há nada pendente, o painel fica em silêncio: anunciar
  "você não tem pendências" toda vez que abre é ruído.
- **O histórico do chat é de SESSÃO, não de banco.** A tabela `mensagens`
  é da camada social entre agentes, não deste chat — fechar e reabrir o
  painel começa a conversa limpa. O que é recuperado do servidor ao abrir
  é só a *pendência*, que é o que de fato não pode se perder.
- **Uma proposta já resolvida perde o destaque** e vira mensagem comum no
  histórico. Manter o alerta aceso em algo já decidido ensina a ignorar o
  destaque — que é o mesmo que não ter destaque.

### Saúde (Vita)

**Padrão de interação:** menu de ações + forms determinísticos,
**sem chat**.

- Onboarding: se `GET /saude/perfil` voltar 404, mostrar a "entrevista"
  inicial (form: nome, sexo, data de nascimento, altura, objetivo,
  diabetes, restrições) antes de liberar o resto do menu.
- Menu principal (um botão por ação, cada um abre um form diferente):
  Registrar refeição · Registrar atividade · Registrar sono · Registrar
  hidratação · Ficha de treino · Plano de dieta · Relatório semanal ·
  Editar perfil.
- Registrar refeição tem DOIS caminhos visíveis (não um só): "mandar
  foto" ou "descrever por texto" — cada um chama um endpoint diferente
  (`/saude/refeicao/foto` vs `/saude/refeicao/texto`).
- Registrar atividade: form em etapas — primeiro tipo (corrida/academia/
  esporte/caminhada/outro), depois duração.
- **Peso e hidratação são atalho rápido direto na bolha do agente**
  (decisão explícita, ver conversa de design) — não passam pelo menu
  lateral inteiro, só um campo único. Peso **nunca** vem pré-preenchido
  com o último valor (decisão explícita — peso oscila de um jeito que
  pré-preencher seria contraprodutivo).
- Ficha de treino: form de múltiplos exercícios por dia da semana — a UI
  precisa deixar claro que dá pra adicionar mais de um exercício por dia
  (isso já confundiu no teste manual da API).
- Plano de dieta e relatório semanal são ações deliberadas (botão
  "Gerar"), igual o relatório do Financeiro — nunca automáticas.

**Construído (painel da Vita):**

- Painel **largo** com backdrop, conforme a regra de largura por tipo de
  conteúdo — a ficha de treino é formulário tabular e não caberia na
  faixa estreita.
- **A entrevista inicial bloqueia o painel inteiro** enquanto não houver
  perfil: sem ele o backend recusa refeição/dieta/relatório com um erro
  que não explicaria nada pro chefe. Entrevista e "editar perfil" são o
  MESMO formulário (o endpoint é upsert) — o que muda é o enquadramento.
- **KPIs no topo do menu** (`GET /saude/dashboard`): peso, kcal de hoje,
  água de hoje, atividades na semana. Consulta agregada sem LLM, então
  pode carregar ao abrir sem ferir o RNF01.
- **Ficha de treino:** o botão "+ exercício" fica DENTRO do cartão do
  dia e diz o nome do dia ("+ exercício em segunda"), e a contagem
  aparece no cabeçalho ("3 exercícios"). É a resposta direta à confusão
  registrada no teste manual da API — o botão genérico fora do cartão
  não deixava claro em qual dia o exercício entraria.
- **Refeição:** os dois caminhos ficam como abas lado a lado, ambas
  sempre visíveis. Esconder um atrás do outro faria o chefe achar que só
  existe o que está na frente. O resultado mostra a **confiança da
  estimativa** — uma foto ruim gera número fraco, e exibir como se fosse
  medido seria mentira.
- **404 não é erro** em três endpoints (perfil, plano, relatório): é
  "ainda não existe". A camada de api traduz pra `null`, senão um estado
  esperado viraria alerta vermelho — e alerta que aparece à toa ensina a
  ignorar alerta.
- **Peso nunca vem pré-preenchido** (decisão original mantida) e o campo
  limpa depois de registrar.

**RF19 (feito):** além dos atalhos no topo do painel, a Vita tem uma
bolha de registro rápido ancorada nela no prédio: **clique direito** no
personagem (a dica aparece no hover, nada fixo na tela). Peso em campo
único (nunca pré-preenchido), água em 3 botões (+200/+300/+500 ml) ou
valor livre, e o "hoje" do dashboard na própria bolha. Esc ou clique fora
fecha; clique esquerdo continua abrindo o painel completo. Enquanto a
bolha está aberta a Vita **fica parada** (alvo que anda escapa do
clique); ao fechar, ela segue de onde parou. Geometria
testada em `features/predio/atalho.ts`; o componente é
`features/saude/BolhaVita.tsx`. Outro agente com atalho entra em
`AGENTES_COM_ATALHO`.

### Norte (Projetos)

**Padrão de interação:** um card por vez, por projeto — **sem chat, sem
lista de tarefas tradicional**. Backend implementado e validado com
repositório real; frontend ainda por desenhar.

- Pré-requisito: autorização OAuth do GitHub feita fora do fluxo normal
  (script manual único, mesmo espírito do
  `scripts/autorizar_google_calendar.py` do Agenda) — sem token válido, o
  cadastro de projeto falha rápido com mensagem clara.
- Cadastrar um projeto = colar o link do repositório **+ escolher a
  branch de um dropdown** (não digitar à mão): o frontend chama
  `GET /norte/repositorios/branches?repositorio_url=...` assim que o link
  é colado, mostra as branches reais como opções, e só então o chefe
  confirma — nunca deixa cadastrar apontando pra uma branch que não
  existe (achado testando: nem todo repositório tem o conteúdo real na
  default branch do GitHub). Se o chefe não escolher nenhuma, usa a
  default do repositório automaticamente. Isso só faz o scan inicial
  (descrição/stack/arquitetura) — **não gera nenhum card sozinho**.
- Cada projeto mostra **só um card ativo por vez** (`sugerido` ou
  `aceito`) — nunca uma lista de várias sugestões acumuladas. Abaixo
  dele, um histórico/feed dos cards já resolvidos (`rejeitado` /
  `finalizado`), tipo changelog.
- Botões de decisão no card ativo: **Aceitar** / **Rejeitar** (quando
  `sugerido`), **Marcar como feito** (quando `aceito`).
- Resolver o card ATUAL (aceitar->finalizar ou rejeitar) já devolve o
  PRÓXIMO card na mesma resposta — a UI não precisa de um botão "gerar
  próximo", só troca o card exibido pelo que já veio na resposta.
  Exceção: o primeiríssimo card de um projeto novo precisa de um botão
  explícito "gerar primeira sugestão" (não existe "card anterior" pra
  encadear).
- Card sempre mostra `arquivos_afetados` (paths concretos) — nunca uma
  descrição vaga tipo "melhorar o botão".
- Card pode ter `origem: manual` (você mesmo cria, sem esperar sugestão
  do agente) — mesma regra de "só 1 card não-terminado por projeto" vale
  também pra esse caso.
- Painel de projetos (visão geral): lista de projetos com sinalização de
  "estagnado" (calculado por tempo desde o último card resolvido/commit,
  não um status fixo) — é aqui que mora o "ficar de olho" que motivou o
  agente.

**Construído (painel do Norte):**

- Painel **largo**, e não estreito como a regra de largura previa. O que
  mudou a conta foram os `arquivos_afetados`: caminho de projeto real
  passa de 50 caracteres e quebraria em três linhas na faixa estreita,
  justamente no dado que torna o card acionável.
- Duas vistas: lista de projetos e projeto aberto (identidade do scan +
  card ativo + histórico). Sem chat, sem lista de tarefas.
- **Cadastro:** o link é colado, o `blur` do campo dispara a busca das
  branches reais, e a branch vira um `select` — nunca um campo de texto.
  Buscar a cada tecla digitada seria uma chamada ao GitHub por caractere.
- **Botões mudam com o status:** `sugerido` mostra aceitar/rejeitar (é
  uma decisão), `aceito` mostra "marcar como feito" (já é trabalho em
  andamento).
- **Rejeitar/finalizar não pedem card novo** — o próximo já vem na
  resposta e entra direto no cache. Verificado no teste: resolver um card
  não dispara nenhuma chamada extra a `/cards/gerar`.
- **O `aviso` do encadeamento é exibido.** Quando o próximo card falha ao
  ser gerado, o card resolvido continua resolvido e o backend manda um
  aviso — escondê-lo deixaria a tela sem card e sem explicação.
- **Histórico:** rejeitado aparece apagado e riscado, finalizado com ✓.
  Registro do que NÃO aconteceu não pode competir visualmente com o que
  foi feito.
- **Visão geral em kanban, agrupado por STATUS DO PROJETO** (ativo/
  pausado/concluído/abandonado) — decidido pelo chefe entre isso e uma
  lista simples. A coluna é o status do PROJETO (decisão deliberada,
  muda raro), não o status do CARD (sugerido/aceito/..., muda toda
  hora e já tem tela própria em `CardAtivo`) — confundir os dois
  status dentro do mesmo quadro contaria duas histórias diferentes na
  mesma grade.
- **`estagnado` fechado**: `GET /norte/projetos` agora devolve o campo
  (mesma regra de `projetos:listar_estagnados`, calculada pra TODO
  projeto — antes só existia pra achar o mais parado, um só, pra
  proatividade do tick). Card estagnado fica apagado (opacidade
  reduzida) com rótulo "estagnado" e um botão **retomar**, que chama o
  mesmo `POST /cards/gerar` de sempre — é seguro chamar direto porque
  `estagnado` já garante que não existe card aberto.

**Pendente:** nada de Norte fica pendente nesta leva. As duas próximas
perguntas (ver "Decisões em aberto") — sinalizar afinidade entre agentes
na UI, e como visualizar o mural geral — não são deste agente
especificamente.

---

## Módulo de interação (motor de tick — Etapas 1, 2 e 3 prontas)

Backend do relógio simulado (Etapa 1), da camada social entre agentes
(Etapa 2) e da proatividade de trabalho (Etapa 3, só o Norte por
enquanto) já existem e estão testados. O que já dá pra prever sobre o
frontend, pra não ficar refazendo depois:

**Relógio simulado**
- Disparo manual (`POST /tick/avancar`, botão "avançar tick") **ou**
  automático opt-in (botão "auto", `POST /tick/automatico`), que o chefe
  liga e que começa desligado a cada carregamento. O timer só roda com o
  app aberto e a aba visível; quem decide se pode é o backend (expediente
  9–18 do mundo, orçamento, 40 por dia real, 75% do teto, intervalo de 5
  min) e a recusa volta com o motivo (Sprint 2, Parte 2b do roteiro). Fora do
  expediente o auto **espera** a abertura do escritório (não desliga); só
  orçamento e limite do dia desligam o botão e avisam.
- Suporte a `dry_run`: a UI deveria deixar claro quando está só
  "conferindo" (calcula e mostra o que aconteceria) vs. de fato
  avançando e gravando.
- Exibir o tick atual e a hora simulada em algum lugar sempre visível
  do escritório (`GET /tick/atual`), já que tudo (mensagens, estado dos
  agentes) é referenciado por número de tick.
- Exibir orçamento diário gasto/disponível (`GET /tick/orcamento`) —
  visível pro chefe, ao contrário do custo por ação individual (que
  nunca aparece, ver RNF02).
- Automação do relógio: feita como **tick automático opt-in** (botão "auto", ver "Disparo" acima). Ainda fora: contador
  regressivo até o próximo tick na UI (melhoria futura, não bloqueia nada).

**Construído — 1ª versão (cartão flutuante do relógio):** o relógio
viveu um tempo como um cartão sozinho no canto inferior esquerdo, com
"conferir"/"avançar" como botões separados e uma seção "rodada do tick"
atrás de um toggle. Essa versão foi **substituída** pelo redesenho
abaixo, depois de uma varredura visual (chefe pediu pra consolidar tudo
num menu só). O histórico da primeira versão fica só como contexto —
o que vale hoje é a seção seguinte.

**Construído — redesenho do HUD (menu único + dry_run persistente):**

- **Dois grupos de ícone, cada um no seu canto**, em vez de cartões
  espalhados pelos quatro cantos (relógio no inferior-esquerdo, eventos
  no inferior-direito, toggle de mensagens no superior-esquerdo).
  **Inferior esquerdo:** mensagens (com badge de não lida) e
  configurações (engrenagem), empilhados. **Inferior direito:** avançar
  1 tick sozinho, em destaque verde — é a ação mais frequente, fica
  isolada do resto. Sempre visíveis, em qualquer modo, com `zIndex`
  ACIMA não só do backdrop dos painéis "largo" mas dos PRÓPRIOS painéis
  (mensagens/configurações/agente), porque cada canto fica
  geometricamente por baixo de ALGUM painel que se estende até aquele
  lado (mensagens e configurações abrem pela esquerda; um painel de
  agente "largo" abre pela direita) — bater só o backdrop não bastava.
- **Ícones são SVG desenhado à mão** (`escritorio/icones.tsx`), não os
  PNGs originais — não há como extrair bytes de imagem de uma que só
  foi colada na conversa, só "ver" ela. Mesma linguagem visual (traço
  grosso, arredondado, monocromático via `currentColor`); trocar pelo
  arquivo de verdade depois é só substituir por uma `<img>`.
- **Avançar tick e processar rodada viraram UM clique só**
  (`hooks/useMundo.ts::useAvancarMundo`), sempre nessa ordem — decisão
  do chefe. Antes eram dois botões (relógio, depois "rodada do tick").
  Se o passo de processar a rodada falhar (só pode acontecer com
  `dry_run` no PRIMEIRO clique de todos — nesse caso não existe tick
  REAL ainda pra servir de base), o avanço do relógio não é desfeito;
  só a rodada mostra um aviso explicando isso.
- **`dry_run` virou um MODO persistente (liga/desliga), não mais um
  botão "conferir" separado.** Ligado, o ícone de avançar só confere
  (nunca gasta/grava); desligado, avança de verdade. Persistido em
  localStorage (`escritorio/dry-run.ts`), mesmo espírito do rascunho de
  sala: "salva só localmente, pra voltar de onde parou". Como o
  backend NUNCA grava nada em dry_run, desligar o modo é só apagar a
  prévia local — o estado real nunca foi tocado, não há o que
  "reverter" de fato.
  - Importante limite técnico documentado: dry_run **não encadeia**.
    Cada chamada calcula a partir do ÚLTIMO TICK REAL, nunca de um tick
    simulado anterior — clicar 3× com o modo ligado sempre mostra a
    MESMA prévia ("seria o tick N+1"), não uma progressão. Simular uma
    sequência de verdade exigiria inventar dado no cliente (orçamento e
    mensagens fictícios sem base real) — decisão explícita do chefe foi
    NÃO fazer isso.
- **Painel de configurações e painel de mensagens abrem os DOIS pela
  ESQUERDA** (mensagens era pela direita antes — mudou a pedido do
  chefe, junto com os ícones indo pro canto inferior esquerdo). Reúne o
  que eram dois cartões (relógio+orçamento e eventos do mundo) num só
  painel de configurações, mais o toggle de dry_run e o resultado do
  último avanço (real ou simulado).
- **Mensagens não lidas: `lida_pelo_chefe` finalmente em uso.** A
  coluna existia desde o início do schema mas nenhum endpoint a
  expunha. Agora `GET /mensagens` devolve o campo e
  `POST /mensagens/{id}/marcar-lida` marca uma mensagem específica.
  **"Lida" é por CLIQUE na mensagem, nunca por abrir a thread/aba** —
  decisão explícita do chefe: só conta como visto o que ele realmente
  clicou, não o que passou na frente dele. O ícone de mensagens ganha
  uma bolinha vermelha quando há pelo menos uma não lida
  (`useContagemNaoLidas`, que reaproveita o mesmo cache de `['mensagens']`
  sem fetch extra).

**Mensagens entre agentes (mural/social e trabalho)**
- Toda mensagem trocada fica em `mensagens`, sempre associada a um
  tick, gerada por `POST /interacao/tick/processar` (renomeado de
  `/interacao/social/processar` — agora cobre trabalho e social juntos,
  disparo manual sempre depois de `POST /tick/avancar`).
- **`tipo='social'`**: entre colaboradores, ou colaborador→chefe
  (imersão, "bom dia" ocasional) — pode tocar em trabalho de forma
  informal, mas nunca é um relatório.
- **`tipo='trabalho'`**: os 4 agentes geram (Sabor A da proatividade),
  sempre direcionado ao chefe — Norte (novo card por estagnação), Cifra
  (relatório mensal fechado), Vita (relatório semanal fechado), Agenda
  (resumo diário de compromissos). Mensagem de **mural**
  (`destinatario_id NULL`) ainda não é gerada por nenhuma etapa — schema
  já suporta, UI não precisa disso ainda.
- Diferenciar visualmente `trabalho` (fundo mais “oficial”, talvez com
  destaque/badge — é a atualização que o chefe realmente quer ver) de
  `social` (tom mais leve, copa) — mesma tabela, propósitos bem
  diferentes.
- Estado do agente (`idle`/`pensando`/`falando`/`executando`, já
  existente em `agentes.estado`) reflete visualmente no avatar/mesa do
  escritório 2D — `'falando'` numa mensagem social, `'executando'` numa
  proatividade de trabalho; volta a `'idle'` no próximo
  `POST /tick/avancar`.
  - **Construído**: o anel do crachá anima por estado (pontilhado
    pulsante em `pensando`, halo em `falando`, cometa girando em
    `executando`), via `Ticker.shared` do Pixi — ver "Construído —
    redesenho visual 'Console'" abaixo e `docs/guia-tecnico-frontend.md`
    Parte 11 pro detalhe técnico da animação.
- `POST /interacao/tick/processar?dry_run=true` mostra, sem gastar nem
  executar nada, quem trabalharia/falaria e com quem/sobre o quê nesse
  tick — útil como preview antes de confirmar de verdade.

**Balãozinho de resposta (thread social)**
- `mensagens.respondendo_a_id` (auto-referência a outra `mensagens.id`,
  nullable) marca quando uma mensagem social é resposta direta a outra
  — mesma ideia de "responder" do WhatsApp/Instagram DM.
- Não precisa de campo duplicado nenhum pro conteúdo/remetente da
  mensagem original — um JOIN da própria tabela `mensagens` nela mesma
  já traz tudo pronto pra UI montar o balão (citação em cima, resposta
  embaixo):
  ```sql
  SELECT m.id, m.conteudo, m.criado_em, m.remetente_id, r.nome AS remetente_nome,
         m.respondendo_a_id,
         original.conteudo AS respondendo_a_conteudo,
         original_remetente.nome AS respondendo_a_remetente_nome
  FROM mensagens m
  JOIN agentes r ON r.id = m.remetente_id
  LEFT JOIN mensagens original ON original.id = m.respondendo_a_id
  LEFT JOIN agentes original_remetente ON original_remetente.id = original.remetente_id
  ```
- Quando `respondendo_a_id` for `NULL`, a mensagem é uma fala nova (sem
  balão de citação) — a UI só desenha o balão quando o campo vier
  preenchido.
- Mecânica por trás (não afeta a UI diretamente, só o que aparece):
  quando um agente decide falar e tem uma mensagem social recebida
  ainda sem resposta, ele responde a mais antiga primeiro — nunca
  sorteio nesse caso, é prioridade garantida sobre a roleta normal.

**Caixa de entrada do chefe (estilo WhatsApp/e-mail)**
- `GET /mensagens/caixa-de-entrada` — só o que foi direcionado ao
  chefe (de qualquer agente), já com o mesmo formato de balão acima
  (`respondendo_a_id` + citação via JOIN). É a visão "minha caixa de
  mensagens" — uma tela separada do mural geral (`GET /mensagens`),
  focada só no que É pra ele.
- `POST /mensagens/{id}/responder` — o chefe escreve a própria resposta
  (texto literal, sem LLM) a uma mensagem que recebeu. Vira uma
  mensagem normal, com o mesmo balão de citação apontando pra
  original. Só funciona pra mensagem que foi de fato direcionada a ele
  e que seja `tipo='social'` — avisos de trabalho (ex: card do Norte)
  não se respondem por aqui, têm o próprio fluxo (aceitar/rejeitar/
  finalizar).
- Pensar a UI como uma lista de conversas por agente (uma "thread" por
  colega, não um feed único misturado) — mais perto de DM/e-mail do
  que de mural: clica no agente, vê o histórico com ele, responde ali.
- ~~Ainda não decidido: badge de "não lida"~~ — **resolvido:**
  `lida_pelo_chefe` está em uso (`POST /mensagens/{id}/marcar-lida`),
  "lida" é por clique na mensagem específica. Ver "Construído —
  redesenho do HUD" acima.

**Construído (mensagens — caixa de entrada + mural) — decisões tomadas na prática:**

- **NÃO usa `GET /mensagens/caixa-de-entrada`.** Esse endpoint filtra
  por `destinatario_id = chefe`, então devolve só o que CHEGA — a
  resposta que o próprio chefe manda (`destinatario_id` vira o AGENTE)
  fica de fora, e sem ela a "conversa" mostraria só metade, como se o
  agente estivesse falando sozinho. A tela usa `GET /mensagens` (o
  mural, sem filtro de participante — tem as duas pontas) e filtra no
  CLIENTE pra só o que envolve o chefe. Mais fetch do que seria
  necessário, mas o único jeito de montar um balão de duas vias sem
  inventar endpoint novo. Backlog: se o mural crescer muito, isso pede
  paginação ou um endpoint de thread dedicado.
- **Toggle é um ícone no menu único do canto inferior direito** (era um
  botão de texto no canto superior esquerdo — mudou no redesenho do
  HUD, ver acima). Fecha sozinho quando o painel abre — ele já tem X,
  Esc e clique no backdrop pra fechar; manter os dois seria redundância.
- **Mutuamente exclusivo com o painel de agente**, mesma regra que já
  valia só entre agentes ("um painel de cada vez"): abrir mensagens
  fecha um agente aberto, e clicar num crachá fecha as mensagens.
- **O mural (RF22) vive no MESMO painel, numa segunda aba — não em
  outro toggle.** As duas telas partem exatamente do mesmo fetch
  (`GET /mensagens`); a diferença é só o agrupamento (thread-com-o-chefe
  vs. tudo, cronológico). Um quinto botão flutuando no escritório só
  pra trocar de agrupamento do MESMO dado seria chrome sem propósito.
- **O mural usa o mesmo visual de balão de fala**, sem alternar lado
  esquerdo/direito — alternar lado representa uma relação de duas
  pontas (o "eu" de uma conversa), e o mural mistura pares diferentes
  na mesma lista (inclusive agente↔agente, que nunca toca o chefe). A
  cor por identidade do remetente já resolve "quem falou" numa lista
  vertical só, sem precisar fingir um "eu" que não existe ali.
- **Uma thread por colega, accordion — não duas colunas.** Só 4
  interlocutores possíveis (os 4 agentes), então uma lista vertical que
  expande/recolhe cobre o "clica no agente, vê o histórico" do jeito
  mais simples, sem precisar de um layout mestre-detalhe.
- **"Responder" fica em cada bolha do AGENTE, não numa caixa de texto
  fixa no rodapé.** `POST /mensagens/{id}/responder` exige o id de UMA
  mensagem específica (é o que vira `respondendo_a_id`) — não existe
  "mandar uma mensagem nova pra essa thread" do lado do chefe, só
  "responder a esta aqui". A UI segue exatamente essa forma em vez de
  fingir um composer genérico que o backend não sustenta. Some quando a
  mensagem é `tipo='trabalho'` (mesma regra do backend) ou já é do
  próprio chefe.
- **Cor por identidade do agente na bolha recebida** (a mesma do
  crachá), bolha do chefe sempre neutra — assim dá pra saber quem
  falou o quê olhando de relance, mesmo com várias threads abertas.

**`eventos_mundo` (gancho de conversa social)**
- Pool curado manualmente (clima, futebol, fim de semana, etc.), já
  seedado (10 eventos iniciais) e sorteado de verdade a cada rodada
  social (`GET /interacao/eventos-mundo` lista, `POST` adiciona) — sem
  geração automática por LLM. A UI precisa de uma forma simples de
  **adicionar um evento novo** (form curto: descrição, pronto — não
  precisa de mais campos).
- Não precisa de tela de gestão elaborada (editar/remover) na primeira
  versão — só adicionar/listar é suficiente pra começar.

**Construído (eventos do mundo) — decisões tomadas na prática:**

- **Vive dentro do painel de configurações** (canto inferior direito →
  ícone de engrenagem → painel pela esquerda), não mais um cartão
  flutuante próprio — dobrado ali no redesenho do HUD junto com
  relógio/orçamento/dry_run, ver "Construído — redesenho do HUD" acima.
- **Nunca usado (`ultimo_uso_tick === null`) ganha um marcador visual**
  na lista — é exatamente o critério que `sortear_menos_usado` usa pra
  priorizar (`ORDER BY ultimo_uso_tick ASC NULLS FIRST`), então mostrar
  isso ajuda o chefe a entender por que um evento novo tende a aparecer
  primeiro na próxima rodada.
- **Sem editar/remover, como o próprio doc já fechava** — só uma lista
  rolável e um campo de texto curto.

**Afinidade e relacionamento entre agentes**
- `relacionamentos.afinidade` (-100 a 100) entre cada par — cresce por
  interação social com retorno decrescente (Etapa 2), todos começam
  neutros (0), sem mecanismo de queda ainda. Ainda não decidido se isso
  aparece na UI (ex: indicador de "proximidade" entre avatares) ou fica
  só interno, moldando quem fala com quem sem nunca ficar visível. Ver
  "Decisões em aberto" abaixo.

---

## Escritório 2D (visão geral, ainda não desenhado)

> **Atualização (2026-10-23):** este escritório existe e hoje é um **prédio em pixel art** (uma sala por agente, vagas para
> adicionar e dispensar agentes, estados do backend como poses). O texto abaixo é o planejamento original, mantido como
> registro. O que vale hoje: `docs/guia-tecnico-frontend.md` PARTE 0 e `frontend/src/features/predio/AGENTS.md`.

Ainda não há protótipo nenhum de tela. O que já está decidido/disponível
pra quando começar:
- Um avatar/cartão por agente (cor + emoji já vêm do banco).
- Clicar no avatar abre o painel daquele agente — mas o CONTEÚDO do
  painel é diferente por agente (dashboard pro Financeiro, chat pro
  Agenda, menu de forms pro Saúde, quadro de card único por projeto pro
  Norte) — não existe um "painel genérico" único que sirva pros quatro.
- Atalhos que vivem na própria bolha do avatar, sem abrir o painel
  inteiro (hoje só peso/hidratação do Saúde, mas o padrão pode se repetir
  pra outros agentes futuros com ações de campo único e alta frequência).

---

## Painel do agente — layout (decidido)

Resolve a "decisão em aberto" que existia aqui antes sobre lateral vs.
modal vs. dentro do avatar. **É lateral — mas não um tamanho único pros
quatro agentes.**

- **Painel estreito** (mesma faixa do catálogo de mobília do
  escritório): usado por conteúdo que é conversa, menu de botões ou um
  card único — Agenda, o menu principal do Vita, o card do Norte. O
  escritório continua visível ao lado; faz sentido acompanhar a sala
  enquanto conversa com um agente.
- **Painel largo** (bem mais que a faixa do catálogo — próximo de
  metade da tela ou mais): usado por conteúdo denso — o dashboard do
  Cifra (KPIs + gráfico) e formulários tabulares do Vita (ficha de
  treino com vários exercícios por dia da semana). Espremer gráfico ou
  tabela numa faixa estreita não é opção. O escritório escurece atrás
  dele (sinaliza foco), diferente do painel estreito.
- Largura exata e o visual de cada um são detalhe de implementação —
  a decisão registrada aqui é só a existência das DUAS faixas, não o
  pixel exato.
- **Só um painel de agente aberto por vez.** Abrir outro troca o
  conteúdo do painel existente, nunca empilha um sobre o outro — mesma
  filosofia de "uma coisa focada por vez" que já vale entre modo de
  edição / catálogo / menu de salas.
- **Painel de agente aberto esconde o menu lateral de salas** (o que
  lista/cria/exclui salas) — trocar de sala não faz sentido no meio de
  uma conversa com um agente, mesma regra que já impede trocar de sala
  durante o modo de edição.
- **Atalho de campo único (peso/hidratação) não abre o painel
  inteiro** — é um popup pequeno ancorado no próprio crachá do agente,
  com um campo e confirmar. Reaproveita o mesmo mecanismo visual do
  popup que aparece ao passar o mouse numa porta (hover/clique
  ancorados na posição do sprite na tela).
- **Estado de qual painel está aberto não persiste entre reloads** —
  sempre fecha ao recarregar a página. É estado de UI transitório, não
  dado — não faz sentido salvar isso em rascunho nem em lugar nenhum
  do backend.
- **Fora de escopo por ora:** responsividade pra tela pequena/mobile.
  O escritório e os painéis assumem desktop.

---

## Requisitos funcionais

Derivados do que já existe no backend de cada agente — não são desejo,
são o que a API já suporta e o frontend precisa cobrir.

**Gerais / Escritório**
- RF01: Listar os agentes ativos (`GET /agentes`), exibindo nome, cor e
  emoji do `avatar_config`.
- RF02: Clicar no avatar de um agente abre o painel daquele domínio —
  o tipo de painel (dashboard, chat, menu de forms) depende do agente.
- RF03: Expor na própria bolha do avatar os atalhos de campo único,
  quando existirem (hoje: peso e hidratação do Saúde).

**Financeiro (Cifra)**
- RF04: Upload de extrato (Itaú PDF ou Nubank CSV), escolhendo o banco
  antes do envio.
- RF05: Exibir o resultado do upload (total no arquivo, novas,
  duplicadas, período coberto).
- RF06: Exibir o dashboard mensal (KPIs + gráficos) com seletor de mês.
- RF07: Gerar o relatório mensal sob demanda, como ação separada e
  deliberada do dashboard.
- RF08: Exibir o relatório já gerado (padrões, recomendações, resumo)
  quando existir; indicar claramente quando ainda não foi gerado pro mês
  selecionado.

**Agenda**
- RF09: Enviar mensagens de texto livre pro agente.
- RF10: Diferenciar visualmente uma proposta aguardando confirmação de
  uma mensagem informativa comum.
- RF11: Confirmar ou rejeitar uma proposta pendente.
- RF12: Consultar o que está pendente no momento, sem depender do chefe
  lembrar de perguntar em texto.

**Saúde (Vita)**
- RF13: Exibir a entrevista inicial (form de perfil) quando o perfil
  ainda não existir; bloquear o resto do menu até ela ser preenchida.
- RF14: Exibir o menu de ações (refeição, atividade, sono, hidratação,
  ficha de treino, plano de dieta, relatório, editar perfil).
- RF15: Registrar refeição por dois caminhos distintos — foto ou
  descrição em texto.
- RF16: Registrar atividade em duas etapas (tipo, depois duração).
- RF17: Editar a ficha de treino com múltiplos exercícios por dia da
  semana.
- RF18: Gerar plano de dieta e relatório semanal sob demanda; indicar
  quando o relatório da semana já foi gerado (bloqueado até a próxima).
- RF19: Atalho de campo único pra peso e hidratação, sem abrir o menu
  completo.

**Módulo de interação (motor de tick)**
- RF20: Avançar o relógio simulado manualmente (`POST /tick/avancar`),
  com opção de `dry_run` pra conferir sem gravar.
- RF21: Exibir o tick atual, a hora simulada e o orçamento diário
  gasto/disponível sempre visíveis no escritório.
- RF22: Exibir o mural de mensagens (sem destinatário) e as mensagens
  direcionadas entre pares de agentes, diferenciando visualmente tipo
  trabalho de tipo social.
- RF23: Adicionar um novo `eventos_mundo` por um form simples
  (descrição), sem geração automática por LLM.
- RF24: Processar a rodada completa do tick (`POST
  /interacao/tick/processar`, com `dry_run`) — trabalho tem prioridade
  sobre social; destacar visualmente quando um agente gerou um aviso
  de trabalho de verdade (os 4 agentes geram: card, relatório mensal,
  relatório semanal, resumo de agenda).
- RF25: Exibir a caixa de entrada do chefe (`GET
  /mensagens/caixa-de-entrada`) e responder uma mensagem social
  recebida (`POST /mensagens/{id}/responder`) — estilo WhatsApp/e-mail,
  uma thread por agente.

## Requisitos não funcionais

- **RNF01 (controle de custo):** nenhuma ação que dispare uma chamada de
  LLM acontece automaticamente — sempre uma ação deliberada do chefe
  (botão "gerar", envio de mensagem), nunca disparada por upload, tela
  abrindo ou timer.
- **RNF02 (transparência):** nenhum metadado de custo (modelo, tokens,
  custo_usd) aparece na interface — mas o estado de cada ação (pendente,
  confirmada, rejeitada, expirada) é sempre visível e claro. **Decisão do
  chefe (2026-10-23):** nem a sala de máquinas é exceção; ela mostra só o
  orçamento agregado (gasto/teto), e a API `/infra/*` não devolve o detalhe.
- **RNF03 (confiabilidade de erro):** erros da API (422, 404, 409, etc.)
  aparecem como mensagem clara e acionável, nunca como erro genérico ou
  tela quebrada.
- **RNF04 (auditabilidade):** ação real em sistema externo (Agenda) exige
  confirmação explícita antes de executar; ação que só grava no próprio
  banco (Saúde) pode ser imediata, sem fricção.
- **RNF05 (consistência visual):** apesar de cada agente ter um padrão de
  interação diferente (chat, dashboard, forms), identidade visual (cor,
  avatar, tipografia) é consistente entre os painéis.
- **RNF06 (privacidade):** dado financeiro e de saúde é sensível — sem
  telemetria/analytics de terceiros nessas telas; dado nunca sai do
  ambiente do próprio chefe.
- **RNF07 (performance percebida):** consultas diretas sem LLM (dashboard,
  histórico) respondem de forma imediata; ações com LLM (relatório,
  plano, estimativa de refeição) indicam visualmente que estão
  processando, já que podem levar alguns segundos.
- **RNF08 (2D primeiro):** interface inicial é 2D (cartões/painéis), sem
  biblioteca gráfica pesada — 3D é evolução posterior, não bloqueia o
  resto (ver `avaliacao-mvp.md`).
- **RNF09 (tick deliberado):** todo avanço de tick é uma ação deliberada
  do chefe: o botão manual, ou o **liga/desliga do automático** (que
  começa desligado e é opt-in). Revisado em 2026-10-27 (antes: "sempre
  manual"); a mesma disciplina do RNF01, agora com limites garantidos no
  backend em vez de só no gesto.

---

## Construído — redesenho visual "Console"

> **Nota (2026-10-23):** as menções abaixo ao "anel do crachá" e ao `Ticker` do Pixi descrevem o escritório isométrico.
> No prédio pixel o estado do agente aparece como **pose e ícone**: `idle` ocioso, `pensando` lendo papéis com uma
> lâmpada, `executando` digitando, `falando` conversando com balão de chat; mensagem não lida vira "precisa de você".

Depois que as quatro telas de agente e o HUD do motor de tick já
estavam funcionalmente prontos (seções acima), o chefe pediu uma
segunda passada — **"outra cara"** pro hub, saindo do estilo "console de
debug" (monoespaçado, translúcido, cantos muito arredondados) sem mexer
em nenhuma decisão de interação já tomada. Detalhe técnico completo em
`docs/guia-tecnico-frontend.md`, Parte 11 — aqui só as decisões de
design.

- **Superfície opaca ("deck") em vez de vidro translúcido** — vale pra
  catálogo, configurações, edição, mensagens e os quatro painéis de
  agente. **Vidro (blur) fica reservado só pro HUD** (os clusters de
  ícone nos cantos) — é a única camada que fica sempre por cima de tudo
  o mais, então faz sentido ela parecer "flutuante"; conteúdo é
  superfície de trabalho, não instrumento.
- **Cantos retos** (`--radius-deck: 7px`, botões 6px) em vez de pill —
  pedido explícito do chefe, "algo mais sólido".
- **Tipografia própria**: par de fontes de exibição + corpo (placeholder
  de Chubbo/Supreme via Google Fonts — Fontshare está bloqueado neste
  ambiente; trocável depois sem tocar em nenhum componente, só o
  `@font-face`).
- **Biblioteca de barras reutilizável** (`features/agentes/Barras.tsx`):
  cápsula (progresso contínuo — orçamento), segmentada (etapas discretas
  — dias de treino, kanban), radial, indeterminada, e um `Contador` que
  anima o dígito quando o número muda — usado em todo KPI do Cifra e da
  Vita.
- **Cada agente ganhou um tratamento específico**, não um verniz
  genérico repetido quatro vezes: gráficos do Cifra em cartões próprios,
  ficha de treino da Vita com barra de progresso da semana, colunas do
  kanban do Norte tingidas pela cor do status, bolha de proposta da
  Agenda pulsando na cor "oficial" enquanto espera confirmação.
- **Sistema de notificação (toast)**: o resultado de um avanço de tick
  real (aviso da rodada, aviso pontual de um agente, trabalho proativo,
  mensagem social endereçada ao chefe) vira uma notificação passageira
  empilhada perto do ícone de avançar tick, tingida pela cor do agente
  que a gerou. Resolve uma lacuna real: antes disso, `rodada.interacoes`
  só aparecia pra quem tivesse o painel de configurações aberto na hora
  certa — um card gerado pelo Norte ou uma falha de rede no próprio
  avanço passavam batido.
- **Code-splitting por painel + esqueleto de carregamento**: cada painel
  de agente virou chunk próprio, carregado só quando aquele agente é
  aberto; o "carregando…" em texto puro virou um esqueleto no mesmo tom
  "deck", reaproveitado tanto pro carregamento do chunk quanto pro
  carregamento do dado.
- **Som opcional** (toggle em configurações, desligado por padrão): tom
  curto sintetizado via Web Audio, sem asset de áudio, tocando só
  quando um agente faz trabalho proativo — não em toda notificação, pra
  não virar ruído.

---

## Decisões em aberto (resolver quando o frontend começar de verdade)

- ~~Visão geral de projetos do Norte~~ — **resolvido: kanban**, agrupado
  por status do projeto. Ver "Construído (painel do Norte)".
- ~~Como sinalizar "estagnado" visualmente~~ — **resolvido:** card
  apagado (opacidade reduzida) + rótulo "estagnado" + botão "retomar".
  Ver "Construído (painel do Norte)".
- ~~Como visualizar o mural de mensagens~~ — **resolvido:** aba dentro
  do mesmo painel de mensagens, feed cronológico com balão de fala por
  remetente (sem lado fixo esquerdo/direito). Ver "Construído
  (mensagens — caixa de entrada + mural)". A ideia de balão saindo do
  AVATAR no escritório 2D (mais espacial) segue não implementada — o
  que foi construído é o painel/log, não algo sobre a cena isométrica.
- **Afinidade entre agentes aparece na UI ou fica só interna?** **Decidido (2026-10-30):**
  aparece como comportamento (amigos almoçam juntos) e como a faixa "se dá bem com"
  no painel de cada agente, uma barra por colega, sem número (`SeDaBemCom.tsx`).
  Histórico da discussão: ainda
  não decidido se o "escritório vivo" mostra de alguma forma visual
  (proximidade dos avatares, indicador de relação) o quanto dois
  agentes se dão bem, ou se isso só molda comportamento (quem fala com
  quem) sem nunca virar informação exposta ao chefe. Proposta em
  avaliação: painel compacto (mesmo estilo do de eventos do mundo) com
  uma barra −100..100 por par de agentes (6 pares), colorida
  vermelho/cinza/verde, sem número exposto — ambiente, não dashboard
  preciso. Aguardando confirmação antes de construir.
