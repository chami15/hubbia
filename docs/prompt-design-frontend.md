# Prompt de design — Hub de Agentes Pessoais ("Escritório Vivo")

> Registro de controle: prompt usado pra pedir um esboço/mockup visual
> do frontend a uma ferramenta de design (ex: Claude com foco em
> design). Não é a implementação — é o material de referência que deu
> origem ao primeiro esboço visual do "escritório vivo". Gerado a
> partir de tudo já decidido em `frontend-design.md`,
> `produto-e-sprints.md` e `avaliacao-mvp.md` até o fechamento da
> Sprint 0.

---

Você vai desenhar o conceito visual do frontend de um hub pessoal de
agentes de IA. O backend já existe e está completo — este prompt é
só pra gerar um ESBOÇO/mockup da interface, não para escrever a
implementação final.

## O que é o projeto

Um "escritório vivo": agentes de IA especializados (cada um cuidando
de um domínio da vida do usuário) representados como colegas de
trabalho num escritório 2D visto de cima. O usuário é o "chefe" — ele
também tem uma mesa nesse escritório. Os agentes trabalham, se
comunicam entre si e com o chefe, e têm um ciclo de "dia de trabalho"
simulado (motor de tick).

## Conceito visual central

**Vista de cima (top-down), 2D, estilo planta baixa de escritório**
— pense em algo como os jogos de gerenciamento/simulação vistos de
cima (tipo planta de escritório corporativo), NÃO isométrico, NÃO 3D.

- Mesinhas separadas, uma por agente + uma pro chefe, cada uma numa
  posição fixa da planta.
- Janelas no canto da sala (dão a sensação de ambiente real, luz
  entrando).
- Pode ter uma área de "copa"/mural central — é onde a metáfora do
  "papo de escritório" (conversa social entre agentes) ganha sentido
  espacial.
- Estética simples e limpa — cartões/formas geométricas básicas,
  cores sólidas, nada de textura realista ou grafismo pesado. É a
  mesma disciplina do "2D primeiro, 3D depois" que já vale pro projeto
  inteiro: aqui é a versão mais simples possível que já transmite
  "escritório", não um jogo renderizado.

## Os personagens (agente = mesa + avatar)

| Quem | Mesa | Cor | Emoji/rosto | Domínio |
|---|---|---|---|---|
| Você (chefe) | 0 | `#111827` (quase preto) | 🧑‍💼 | é o usuário real |
| Cifra | 1 | `#16a34a` (verde) | 🤑 | Financeiro |
| Agenda | 2 | `#2563eb` (azul) | 📅 | Google Calendar |
| Vita | 3 | `#f97316` (laranja) | 💪 | Saúde |
| Norte | 4 | `#0891b2` (ciano) | 🧭 | Projetos/GitHub |

Cada agente é um avatar/cartão na própria mesa, com a cor e o emoji
acima (já vêm do banco, não precisa reinventar). O chefe também
aparece no escritório, na mesa 0 — é o "colega" que os agentes às
vezes puxam papo ou mandam aviso.

## Estado visual de cada agente (muda com o tempo)

Cada agente tem um estado que devia refletir visualmente na mesa/
avatar dele:
- `idle` — parado, neutro (padrão).
- `pensando` — processando algo.
- `falando` — está numa conversa social.
- `executando` — está fazendo um trabalho real (gerando relatório,
  card, etc.).

## O que acontece ao clicar num agente

Cada agente abre um painel DIFERENTE — não existe painel genérico.

- **Cifra**: dashboard (KPIs + gráficos) com seletor de mês, botão de
  upload de extrato (escolhendo o banco antes), botão separado
  "Gerar relatório mensal" que mostra a narrativa quando existir.
- **Agenda**: chat simples (caixa de texto + histórico), com uma
  proposta pendente de confirmação aparecendo visualmente DIFERENTE de
  uma mensagem comum (ex: com botões Confirmar/Rejeitar em vez de só
  texto).
- **Vita**: menu de botões (Registrar refeição, atividade, sono,
  hidratação, ficha de treino, plano de dieta, relatório semanal,
  editar perfil) — cada botão abre um form próprio. Se o perfil ainda
  não existe, mostra uma "entrevista" inicial antes de liberar o
  resto. Peso e hidratação têm atalho rápido direto na bolha do
  avatar, sem abrir o menu inteiro (peso NUNCA vem pré-preenchido).
- **Norte**: mostra só 1 card ativo por vez (nunca uma lista) com
  botões Aceitar/Rejeitar (se `sugerido`) ou Marcar como feito (se
  `aceito`) — abaixo, um histórico tipo changelog dos cards já
  resolvidos. Cadastro de projeto novo = colar link do repositório +
  escolher branch de um dropdown (busca as branches reais antes de
  deixar confirmar).

## Elementos "vivos" do escritório (parte central da experiência)

- **Relógio simulado**: controle visível (botão "avançar tempo" +
  toggle de `dry_run`/preview), mostrando o tick atual e a hora
  simulada. Sempre manual — nunca um timer sozinho.
- **Orçamento do dia**: gasto/disponível sempre visível (mas nunca o
  custo de uma ação individual — isso nunca aparece).
- **Conversas entre agentes**: quando dois agentes trocam mensagem
  social, pense em um balão de fala saindo da mesa de quem falou
  (efeito "escritório vivo" de verdade) — a mensagem pode ser resposta
  a outra (balãozinho com citação da mensagem original em cima, tipo
  reply do WhatsApp).
- **Avisos de trabalho**: quando um agente termina uma ação real
  (Cifra fechou relatório do mês, Vita fechou relatório da semana,
  Agenda mandou o resumo do dia, Norte gerou um card novo), isso
  precisa se destacar visualmente diferente de papo comum — é a
  atualização que o chefe realmente quer ver, sempre endereçada a ele.

## Telas separadas do escritório (fora da planta 2D)

- **Caixa de entrada do chefe**: estilo WhatsApp/e-mail — lista de
  conversas por agente (uma thread cada), com balão de citação igual
  ao das mensagens entre agentes. O chefe consegue responder um
  agente ali (texto literal dele).
- **Eventos do mundo**: form simples (só uma descrição) pra adicionar
  manualmente um "gancho de conversa" (tipo "sextou", "choveu hoje")
  que os agentes usam como inspiração de papo — sem geração
  automática por LLM.

## Stack técnica

- **React + Vite**, 2D puro — sem biblioteca gráfica pesada (nada de
  engine 3D, WebGL, Three.js). Cartões/formas/CSS/SVG resolvem tudo
  nesta fase.
- 3D é upgrade de fantasia pra bem mais tarde, não faz parte deste
  escopo.

## Restrições importantes (não decorativas, são regras do produto)

- Nenhuma ação que gasta LLM acontece sozinha — sempre um botão
  explícito do chefe (nunca automático por abrir tela ou upload).
- Nenhum custo (modelo, tokens, valor gasto por ação) aparece na
  interface — só o orçamento diário total.
- Ação que mexe em sistema externo (Agenda/Calendar) sempre passa por
  confirmação visual explícita antes de executar.
- Identidade visual (cor/avatar/tipografia) consistente entre os
  quatro painéis, mesmo eles sendo bem diferentes por dentro.

## Pontos em aberto — proponha uma solução pra cada um

1. A afinidade entre agentes (-100 a 100, cresce com conversa) aparece
   de alguma forma visual (ex: proximidade espacial das mesas, linha
   entre elas) ou fica só um dado interno, invisível?
2. O card do Norte "estagnado" (projeto parado há muito tempo) merece
   algum destaque visual na lista de projetos — cor, badge, ordenação?
3. O mural de mensagens (visão geral de tudo que rola no escritório)
   é melhor como feed/timeline separado, ou os balões de fala
   aparecendo direto nas mesas já bastam?

## O que eu quero como entregável

Um esboço/mockup de tela (pode ser wireframe descrito, HTML+CSS
estático, ou imagem) mostrando:
1. A planta do escritório com as 5 mesas + janelas, no visual descrito
   acima.
2. Como fica o painel de UM dos agentes aberto (escolha o que achar
   mais representativo).
3. Como fica a caixa de entrada do chefe.

Isso é só pra eu ter uma base visual de como o "escritório vivo" pode
se parecer — não precisa ser produção final.
