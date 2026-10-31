# Aproveitamento do modo simulação (estilo The Sims) no prédio pixel

> **Estado: proposta, aguardando decisão do chefe.** Nada aqui foi implementado.
> Pesquisado em `claude/modest-wright-cmvki7` no commit `a2416c3` (tag local `3d/v0.1`). Para reproduzir qualquer afirmação:
> `git show a2416c3:frontend/src/features/escritorio/<arquivo>`.
>
> **Convenção do documento:** "**Fato**" = o que o código ou o banco fazem, conferido nos arquivos citados. "**Proposta**" = opinião minha, para você aceitar, mudar ou recusar.

## 1. Resumo

O 3D tem uma camada de jogo completa por cima do escritório: necessidades, humor, habilidades, relações, ~35 ações, autonomia, fila e menu radial. Ela é **TypeScript puro** (zero `three`, `pixi` ou `react`), bem testada, e o desenho 3D é a única parte presa ao renderizador.

O problema é o mesmo que você percebeu: a tela fica poluída (cinco zonas de HUD, barras, diamante e balão sobre cada personagem, menu radial). E há um problema mais fundo: **quase tudo ali é inventado no cliente** ("nada disso vai pro backend", doc da própria branch). Necessidade de café que cai sozinha, "Engenharia Financeira nível 8", amizade que sobe 1,2 por segundo: nada disso aconteceu de verdade com o agente.

**Recomendação:** trazer a *ideia* de agentes com vida interior, mas alimentada por **fatos reais que o backend já tem** e **revelada sob demanda**, nunca em HUD. Em ordem de valor:

1. **Conversas visíveis entre agentes** (hoje invisíveis no prédio): dois agentes se encontram e conversam com um balão curto de texto real.
2. **Relações reais** (afinidade que o backend já grava e nunca mostra): vira comportamento no prédio e uma seção no painel.
3. **Humor com motivo**, derivado de sinais reais (falhas, mensagens esperando, ociosidade...): aparece em poses e, ao clicar, com o *porquê*.
4. **Autonomia guiada pelo humor e pela personalidade** (extroversão real) e **rotina por hora**, sem criar um segundo relógio.

**Não trazer:** barras de necessidade, habilidades e níveis, menu radial, fila de ações, "controlar o agente", HUD, diamante, criador de personagem (por ora) e o renderizador 3D.

## 2. Critérios (o filtro de tudo abaixo)

1. **Sem poluição visual.** Nada novo e permanente na tela. A informação vive no comportamento do personagem, em objetos que já existem na sala (UI diegética) ou aparece no clique. Ver "orçamento de ruído" na seção 6.
2. **Introspectivo, não jogável.** Ajuda a perceber o agente *por dentro* (como está, por quê, com quem se dá bem). Não é para "jogar com bonecos": a interação do hubbia é falar com cada agente pelo painel dele.
3. **Dado real antes de dado inventado.** Se aparece na tela como fato, tem de ser fato. Já é decisão sua: o `dry_run` não encadeia porque "simular uma sequência exigiria inventar dado no cliente" (`docs/frontend-design.md`).
4. **Custo de LLM zero** (RNF01). Tudo derivado de dados existentes; nenhuma chamada nova de modelo.
5. **Testável.** Lógica pura com teste; bug vira teste de regressão (política do projeto).
6. **Desacoplado do mundo.** O motor 3D depende do formato de sala isométrico (`sala-dados`, `catalogo`). O que for trazido precisa de um adaptador para as salas do prédio (`features/predio/salas.ts`).

## 3. O que o 3D tem (fatos)

### 3.1 Motor (`simulacao-sims.ts`, 2.264 linhas, puro)

| Peça | Como funciona | Linhas |
|---|---|---|
| **Necessidades** | 6: energia, foco, social, café, ambiente, diversão (0–100). Decaem por segundo (energia 0,30; café 0,36; social 0,24; diversão 0,26; foco 0,16). Uma "régua" única de níveis: bom ≥55, atenção ≥38, baixo ≥20, crítico. | 42–116, 1920–1925 |
| **Humor** | 8 humores (inspirado, focado, energizado, feliz, confiante, tenso, exausto, entediado) escolhidos por **modificadores com peso e motivo** ("Sem café: precisa de uma pausa"). O humor muda a velocidade de caminhada. | 141–237, 467–590 |
| **Ambiente da sala** | Nota da sala pela mobília, com teto por categoria (a 4ª planta já não conta) para incentivar variar. | 428–465 |
| **Habilidades e carreira** | 3 habilidades por agente com nível 1–10 e progresso (valores iniciais **escritos à mão**); "desempenho" 0–100 sobe ao trabalhar. | 383–406 |
| **Traços** | 3 traços por agente, texto fixo ("Gênio Financeiro", "Movido a Expresso"). | 360–381 |
| **Relações** | Por par: amizade e sinergia 0–100, sobem **nos dois lados** a cada conversa. | 297–304 |
| **Interações** | ~35 ações em 6 categorias (trabalho, necessidades, social, ambiente, navegação, hubbia) geradas por móvel, colega ou chão. | 636–1270 |
| **Autonomia** | Quando livre: se a pior necessidade está acima de 62 volta à mesa; senão escolhe a ação que mais a resolve, com nota `ganho × 2,5 − distância × 3 (+18 se é a própria mesa) + sorte × 8`. **Respiro** de 1,2–3,5 s entre ações. Só faz sozinho o que o chefe também poderia mandar. | 1579–1690 |
| **Tempo** | Relógio do jogo (1 minuto por segundo, velocidade 0–3, dia da semana). | 1914–1960 |
| **Ponte com o backend** | **Único fio real:** `estadoBackend` (vira o modificador "Processando"/"Em conversa") e o balão que uma rodada de tick provoca (mensagem real por 8,5 s). | 1873–1930 |

### 3.2 Rota e personalização

- `roteamento-sims.ts` (476): A\*, **slots por móvel** (sofá com 3 lugares), **conversa frente a frente a ~0,72 tile** e espaço pessoal (afasta quem fica colado).
- `cas-sims.ts` (439): aparência e traços editáveis, no `localStorage`; só visual, sem backend.

### 3.3 Interface (o que causa a poluição)

`HudSimulacao.tsx` (669 linhas) tem **cinco zonas**: topo-direita (~14 controles: modo, salas, criar personagem, paredes, câmera, zoom, seguir, 3D/2D, autonomia, mensagens, configurações), baixo-esquerda (fila de ações, seletor de agente, cartão), baixo-centro (tempo, relógio, avançar tick), baixo-direita (inspetor com 4 abas: necessidades, carreira, habilidades, relações) e, sobre cada personagem, **nome, humor, balão e diamante**. Mais o menu radial (`MenuRadial.tsx`).

### 3.4 Só serve ao 3D (não aproveitável)

`cena3d.ts` (656), `personagem3d.ts` (1.509), `moveis3d.ts` (2.037), `texturas3d.ts`, `malhas-blender.ts` (403 linhas, 909 KB gerados do Blender), `CriadorPersonagem.tsx` (1.138), paredes *cutaway*, câmera. Pesam: o `.glb` tem 16,7 MB no git.

### 3.5 Lições de engenharia (valem em qualquer mundo)

Documentadas na PARTE 11 do guia da branch, todas com bug real por trás: **um laço só** (motor, câmera e personagens no mesmo quadro); **suavização por tempo** (`k = 1 − exp(−rigidez × dt)`, nunca por quadro); **não arredondar dentro do motor** (o arredondamento engolia o decaimento); **respiro na autonomia** (sem ele o agente emendava ações e o cálculo rodava a cada quadro); relógio e sorte **injetáveis** nos testes.

## 4. O que o prédio pixel já tem (para não duplicar)

Pausas autônomas por lugares, A\* com divisórias, status (trabalhando, pensando, conversando, ocioso, precisa de você, dormindo) vindos do backend, ícone ocasional sobre a cabeça, luz que apaga na sala vazia, dia e noite pela **hora simulada do tick**, elevador, vagas.

**Não tem:** conversa entre agentes visível; relações; humor; personalidade influenciando o comportamento; colisão entre agentes andando (só reserva lugares).

## 5. O que o backend já sabe e a tela nunca mostra (fatos)

É aqui que mora a introspecção honesta, sem inventar nada:

| Dado real | Onde está | Situação |
|---|---|---|
| **Afinidade entre agentes** (−100..100) | `relacionamentos.afinidade`, gravada a cada conversa social (`_atualizar_afinidade`) e usada para decidir **quem fala com quem** | **Nenhuma rota expõe.** `docs/frontend-design.md` já tem a decisão em aberto "afinidade aparece na UI?", com proposta de barra −100..100 sem número. |
| **Conversas agente ↔ agente** | `mensagens` (tipo social/trabalho) e a resposta de `POST /interacao/tick/processar` (`agente_nome`, `destinatario_nome`, `mensagem`) | Só vira toast quando é para o chefe; entre agentes fica no mural. |
| **Falhas por agente** | `tick_execucoes.erro`, `GET /infra/metricas` (`por_agente[].erros`) | Mostrado só na sala de máquinas. |
| **Extroversão** (0–10) | `agentes.extroversao`, traço fixo por agente | Existe no banco; `GET /agentes` **não devolve** (a query `agentes:listar` não inclui a coluna). |
| **Opinião** de um agente sobre outro | `relacionamentos.opiniao` | Coluna **nunca escrita** (só lida). |
| **Memórias** (observação, reflexão, plano) | tabela `memorias` | **Nenhum código usa.** |
| **Eventos do mundo** do dia | `eventos_mundo`, `GET /interacao/eventos-mundo` | Só no painel de configurações. |
| Pendências que esperam o chefe | mensagens não lidas, `acoes_pendentes` | Já usado: vira "precisa de você". |

## 6. Avaliação de cada ideia

Legenda: **Trazer** · **Adaptar** (trazer a ideia, trocar a fonte do dado) · **Adiar** · **Não trazer**.

### 6.1 Conversas visíveis entre agentes — **Adaptar** (valor alto, custo baixo)

- **No 3D:** o "jig social" põe dois agentes frente a frente a ~0,72 tile e a fala sai em balão; a rodada do tick vira balão por 8,5 s.
- **No prédio (proposta):** quando uma rodada gera mensagem social do agente A para o B, os dois se encontram na copa ou na recepção, ficam frente a frente (pose `talk` já existe) e A mostra um balão curto com o começo da mensagem, que some em ~8 s. Dados 100% reais; zero custo; nenhum elemento fixo novo.
- **Por que é a primeira:** hoje o "escritório vivo" mostra agentes sozinhos nas mesas; a vida entre eles, que é o coração da ideia original, acontece escondida no mural.

### 6.2 Relações reais — **Adaptar** (valor alto)

- **No 3D:** amizade e sinergia inventadas, crescendo por tempo de conversa.
- **No prédio (proposta):** a afinidade **real** vira *comportamento*: agentes com afinidade alta escolhem a copa juntos e sentam lado a lado; os de afinidade baixa evitam o mesmo lugar. Detalhe sob demanda: ao clicar no agente, uma seção "Se dá bem com…" com uma barra fina por colega (sem número, como já proposto em `frontend-design.md`: "ambiente, não dashboard preciso").
- **Backend:** uma rota de leitura sem LLM (`GET /agentes/relacionamentos`). Fecha uma decisão em aberto do projeto.

### 6.3 Humor com motivo — **Adaptar** (valor alto; o *porquê* é a parte introspectiva)

- **No 3D:** 8 humores por modificadores ponderados, cada um com texto de motivo. A ideia boa é a **explicação**, não os números.
- **No prédio (proposta):** humor derivado de sinais reais, sem criar estado novo no backend:

| Sinal real | Humor sugerido | Explicação ao clicar (exemplo) |
|---|---|---|
| 2 ou mais falhas hoje (`/infra/metricas`) | tenso | "Duas chamadas falharam hoje." |
| Mensagem sua esperando há tempo | ansioso (já corre e levanta a mão) | "Está esperando sua resposta." |
| Vários ticks sem trabalhar | entediado | "Faz tempo que não tem o que fazer." |
| Entregou algo (relatório, card) | orgulhoso | "Terminou o relatório de março." |
| Orçamento do dia esgotado | contido | "O orçamento do dia acabou; só o Motriz segue." |
| Projeto estagnado (Norte) | preocupado | "Projeto X parado há 9 dias." |

- **Como aparece sem poluir:** como **postura**, usando poses que a arte já tem (`sulk`, `cheer`, `laugh`, `stretch`) e como **uma linha de texto** no painel ao abrir o agente. Nunca um selo permanente.
- **Cuidado (RNF02):** só falhas e estados entram; **custo e tokens continuam fora da tela**.

### 6.4 Autonomia guiada por humor e personalidade — **Adaptar** (médio; depende de 6.3)

- **No 3D:** a escolha pontua necessidade × distância × sorte e respeita um respiro entre ações.
- **No prédio (proposta):** hoje a pausa é um sorteio. Passa a ser guiada por humor e por traço **real**: `extroversao` (0–10, já no banco) faz o extrovertido ir à copa e o introvertido ficar na mesa; humor tenso procura café; entediado procura conversa. Mantém o respiro e a regra "só faz o que o chefe poderia mandar".
- **Backend:** incluir `extroversao` em `GET /agentes` (uma coluna).

### 6.5 Rotina por hora — **Adaptar** (médio, custo baixo)

- **No 3D:** relógio próprio do jogo; a branch deixou como decisão em aberto os "dois relógios" (jogo × servidor).
- **No prédio (proposta):** **um relógio só, o do tick** (`hora_simulada`, que já faz o agente dormir de madrugada). Rotina por faixa: manhã café e planejamento, meio-dia copa, fim do dia alongar, noite luzes apagadas. Resolve a dúvida dos dois relógios sem criar o segundo.

### 6.6 Espaço pessoal e slots por móvel — **Trazer** (baixo esforço, melhora a leitura)

- **Fato:** o prédio não trata colisão entre agentes andando; dois podem se sobrepor.
- **Proposta:** afastar suavemente quem fica colado (`encontrarPosicaoLivrePerto`, `k = 1 − exp(−6·dt)`) e permitir mais de um lugar no sofá. Com teste de regressão.

### 6.7 Pensamentos e balões — **Adaptar** (médio, **alto risco de poluição**)

- **No 3D:** balão com humor, "Cadê o café?", "Preciso descansar", sempre que a necessidade fica crítica.
- **Proposta:** balão **somente** em evento real (6.1) e quando o chefe seleciona o agente ("o que está pensando" = os motivos do humor). Nada de balão periódico.

### 6.8 Traços de personalidade — **Adaptar** (baixo custo)

- **No 3D:** 3 traços fixos por agente.
- **Proposta:** 2 ou 3 chips de texto no painel, **coerentes com a `personalidade` que já está no `seed.py`** (uma só fonte), e que de fato mudem o comportamento (6.4). Chip que não muda nada é enfeite.

### 6.9 UI diegética — ideia nova, **Trazer** (alto valor, zero poluição)

Não veio do 3D, mas atende ao pedido. Em vez de painéis, a informação mora nos **objetos que já existem nas salas**: a TV da sala pode passar o evento do mundo do dia (`eventos_mundo`); o quadro branco do Norte já mostra o andamento dos cards; o relógio já mostra a hora simulada. Cada objeto é um "painel" que o chefe só lê se olhar.

### 6.10 Diário do agente (`memorias`) — **Adiar**

A tabela existe e nada a usa. Um "diário" (observação, reflexão, plano) seria a feature mais introspectiva de todas, mas exige o agente **escrever** memórias (custo de LLM) e decisão de produto sobre quando. Fica no backlog, com o porquê.

### 6.11 Não trazer, e por quê

| Item do 3D | Motivo |
|---|---|
| **Barras de necessidade** (energia, foco, café...) | Inventadas; é a maior fonte de poluição. O que presta delas vira estado *interno e invisível* se (6.3) e (6.4) precisarem. |
| **Habilidades, níveis, carreira** | Gamificação com valores escritos à mão ("Engenharia Financeira nível 8"). O equivalente honesto é **histórico real** no painel (relatórios gerados, cards finalizados), que é outra feature. |
| **Menu radial, fila de ações, "controlar o agente"** | Transforma o hubbia em jogo de bonecos e disputa espaço com o painel de cada agente. A autonomia é o ponto. |
| **HUD de cinco zonas, diamante, velocidade do tempo** | É exatamente a poluição. O tempo do hubbia é o tick, manual (RNF09). |
| **Pontuação de ambiente** | Gamificação da decoração; depende de editor de salas que o prédio não tem. |
| **Criador de personagem** | Adiar: a aparência dos agentes é fixa por decisão. Se o chefe quiser personalizar, o habblaud tem um editor reaproveitável. |
| **Renderizador 3D, modelos Blender** | Só serve à linha 3D (ver `docs/mapa-de-branches.md`, contrato `criarMundo`). |

## 7. Plano em fases (sem HUD novo em nenhuma)

> **Andamento (2026-10-30):** a fase 1 (conversas visíveis com balão) e a rotina por hora (6.5) saíram na Fase E da Sprint 2
> (`feat/vida-do-predio`). A **fase 2 (relações reais)** está na `feat/relacoes`: `GET /agentes/relacionamentos`, duplas do
> almoço pela afinidade e a faixa "se dá bem com" no painel (barra por colega, sem número). Decisão 1 da seção 8 respondida
> como proposto. A **fase 3 (humor com motivo)** está na `feat/humor`: humor de sinais reais (mensagem esperando, falhas
> do dia, orçamento, projeto parado, entrega recente, tempo parado) com o motivo em texto no painel, postura no prédio e
> balão de pensamento só ao selecionar. Decisões 2 e 3 da seção 8 respondidas como proposto (falhas entram, só a contagem;
> balão só em evento real e ao selecionar). A **fase 4 (autonomia por traço real)** está na `feat/autonomia`: `GET /agentes`
> devolve a `extroversao` do seed, que vira o gosto por sair da sala (0–10 → 0–40%, fonte única); tenso procura café e
> entediado procura companhia; o painel mostra até três traços (extrovertido/reservado, noturno/madrugador, calmo), só os
> que mudam o comportamento. Sem backend, vale a reserva escrita em `personalidade.ts`. **As quatro fases estão feitas.**

| Fase | Entrega | Backend novo | Teste de regressão |
|---|---|---|---|
| 1 | Conversas visíveis (6.1) + espaço pessoal (6.6) | nenhum | agentes não se sobrepõem; mensagem social gera encontro |
| 2 | Relações reais (6.2) | `GET /agentes/relacionamentos` (leitura) | rota 200 com pares; comportamento escolhe lugar pela afinidade |
| 3 | Humor com motivo (6.3) e balão sob demanda (6.7) | nenhum (usa `/infra/metricas` e mensagens) | cada sinal → humor esperado, com o motivo certo |
| 4 | Autonomia por humor e traço (6.4), rotina por hora (6.5), chips (6.8) | `extroversao` em `GET /agentes` | extrovertido visita a copa mais que introvertido (determinístico, sorte injetada) |

Em todas: lógica **pura** em módulo próprio (como `status.ts` e `relogio.ts`), sorte e relógio injetáveis, e checagem visual (abaixo).

### Orçamento de ruído visual (regra de aceite)

- **Permitido permanente:** personagem, ícone ocasional (≤ 1 por agente, ≤ 3 s), balão em evento real, nome no hover ou seleção.
- **Proibido permanente:** barras, diamantes, números, painéis flutuantes, menus.
- **Teste do print:** screenshot da tela inicial (`/verificar-visual`) antes e depois de cada fase; **nenhum elemento fixo novo** além dos permitidos. Se aparecer, a fase não está pronta.

## 8. Decisões que dependem do chefe

1. **Afinidade pode aparecer na UI?** (decisão em aberto no `frontend-design.md`) Esta proposta responde "sim, como comportamento e seção sob demanda, sem número".
2. **Falhas podem influenciar o humor visível?** O RNF02 só proíbe custo e tokens.
3. **Balões só em evento real e ao selecionar?** Ou prefere nenhum?
4. **Diário do agente** (`memorias`): vale o custo de LLM? (backlog)
5. **Histórico real no painel** (o que o agente já fez) como substituto honesto de "habilidades"?
6. **Criador de personagem:** manter adiado?
7. **A linha 3D:** continua como mundo alternativo (contrato `criarMundo`), recebendo estas mesmas ideias depois, ou fica só como laboratório?

## 9. Fontes

Todos os caminhos em `frontend/src/features/escritorio/` no commit `a2416c3`, salvo indicação: `simulacao-sims.ts`, `roteamento-sims.ts`, `cas-sims.ts`, `HudSimulacao.tsx`, `InspetorAgente.tsx`, `MenuRadial.tsx`, `__testes__/simulacao-sims.test.ts` (426 linhas, ~40 casos); `docs/guia-tecnico-frontend.md` PARTE 11 e `docs/backlog-futuro.md` ("Modo simulação: decisões em aberto"). Backend (branch atual): `backend/db/migrations/001_init.sql` (`relacionamentos`, `memorias`, `eventos_mundo`), `backend/resolvers/interacao.py` (`_atualizar_afinidade`), `backend/sql/agentes.sql`, `backend/resolvers/infra.py` (`obter_metricas`).
