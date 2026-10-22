# Estudo: habblaud → hubbia

Investigação do repositório [marmottajr/habblaud](https://github.com/marmottajr/habblaud) (v1.0.3, licença MIT,
© 2026 Márcio Junior) para descobrir o que dá para trazer para o hubbia: arte, dinâmica dos agentes, integrações,
cosméticos e perfumaria. O resultado prático está em `prototipos/predio-pixel/` (a arte extraída rodando com os
nossos 4 agentes num prédio).

---

## 1. Resumo em uma tela

- **O servidor é local e está todo no repositório.** Um Node puro (zero dependências de runtime) lê os arquivos do
  Claude Code/Codex na máquina e manda o estado por SSE para um canvas no navegador. O único servidor separado é o
  do **Habblaud World** (a cidade online, `server.habblaud.com`), que é opcional e está num repositório **privado**.
- **A arte é 100% procedural e extraível.** ~9.200 linhas de TypeScript puro desenham personagens, 46 móveis, pisos,
  paredes, telas animadas e ícones em `PixelBuf` (sem imagens). Depende só de 3 arquivos pequenos de `shared/`.
  **Já está copiada e funcionando** em `prototipos/predio-pixel/src/habblaud/`, sem nenhuma alteração além dos imports.
- **A dinâmica é o que dá vida:** estados com coreografia (corre e levanta a mão quando precisa de você), pausas com
  lugares (café, bebedouro, espelho), luz que apaga na sala vazia, elevador, vida social com personalidades e rodas.
- **Diferença de fundo:** no habblaud você **assiste** agentes de terceiros (Claude Code) trabalhando — a interação
  é responder permissões e mandar mensagens. No hubbia os agentes são **nossos**, cada um com um domínio e um painel
  próprio; o prédio vira a **porta de entrada** para falar com cada agente, não só uma TV.

---

## 2. Arquitetura do habblaud

```
 ~/.claude*/sessions/<pid>.json ──────┐
 ~/.claude*/projects/.../*.jsonl ─────┼──▶ servidor Node ──▶ modelo do escritório ──▶ SSE ──▶ navegador
 .../subagents/**/agent-*.jsonl ──────┘    (polling 1 s)                                   (canvas + UI)
```

| Parte | Onde | O que faz |
| --- | --- | --- |
| `server/` | Node 22, sem deps | Lê sessões e transcripts (somente leitura), monta o "modelo do escritório", SSE, API HTTP. Subpastas: `sources/` (sessões, shells, GitHub, histórico), `model/`, `permissions/`, `messages/`, `deliveries/`, `spawn/`, `dictation/` (Whisper local), `pty/` (terminal), `remote/` (HTTPS + senha scrypt para o celular), `accounts/` (uso 5h/semanal), `world/` (cliente do World). |
| `client/src/art` | TS puro | Pixel art procedural (o que extraímos). Contrato em `art/api.ts`. |
| `client/src/world` | TS + canvas | O escritório: `layout/` (prédio, salas), `sim/` (comportamento), `path/` (A*), `social/` (personas, rodas, moedinhas), `render/` (luz, dia/noite, partículas, efeitos do GitHub), `camera`, `playback` (timelapse), `city/` (o World). |
| `client/src/ui` | DOM puro | Gaveta, feed, entregas, permissões, "Meu dia", timelapse, terminal (xterm), editor de personagem, sons, toasts. |
| `shared/` | TS puro | Protocolo (`types.ts`), atividades em PT-BR, aparência, i18n, simulador de demonstração. |
| `mod/` | Plugins do Claude Code | `habblaud-permissoes` (hook PermissionRequest), `habblaud-mensagens` (entrega mensagens à sessão), statusline de uso, hooks do Codex. |

**Resposta direta à pergunta:** o ambiente inteiro (servidor + escritório) roda a partir do código do repositório,
na máquina do usuário (Node ou Docker). Nada depende de servidor externo, exceto o World — e mesmo ele fica
desligado até a pessoa criar conta.

---

## 3. A arte (o que mais interessa)

### 3.1 Como funciona

- **Tudo é desenhado em código** num `PixelBuf` (RGBA `Uint8ClampedArray` com origem e `set/put/blend`), testável em
  Node. Só no fim vira `<canvas>`, **uma vez por combinação** de parâmetros (cache com limite).
- Perspectiva **top-down 3/4**, `TILE = 16 px`, personagem 24×34 com âncora nos pés. Sombreamento por *hue shift*
  (cores mais quentes na luz, mais frias na sombra), contorno escuro, paleta clara.
- Contrato `ArtModule` (`art/api.ts`): `characterSprite`, `avatarCanvas`, `furnitureSprites`, `drawFloor`, `drawRug`,
  `drawWallFace/Top`, `drawSouthWall`, `drawScreen`, `drawBoard`, `drawWindowView`, `drawClock`, `iconSprite`, `roomTheme`.
- **Âncoras e profundidade:** móvel de chão ancora no centro inferior do footprint; de parede, no pé da face da
  parede; ordena-se tudo pelo `y` da âncora. Móveis com `front` (encosto da cadeira, porta da cabine) são desenhados
  **por cima** de quem senta — o truque que deixa a cena crível.

### 3.2 Inventário

| Item | Quantidade / lista |
| --- | --- |
| **Poses** (20) | stand, walk, run, sit, type, sleep, drink, use, raise_hand, talk, stretch, read, play, wait, cheer, laugh, game, rps, groom, sulk |
| **Na mão** (15) | coffee, water, papers, laptop, book, box, paddle, popcorn, controller, phone, lipstick, comb, rock, paper, scissors |
| **Aparência** | 8 tons de pele, 14 cabelos, 7 partes de cima, calça/short/saia, 8 acessórios (óculos, fone, boné, gorro, brinco, laço...), barba/bigode, crachá (subagente), look f/m. Editor com regras de combinação. |
| **Móveis** (46) | escritório (mesas frente/verso, cadeiras, estantes, arquivo, impressora, divisória de vidro, mesa de reunião), parede (quadro kanban, janela, relógio, pôster, quadro, TV, interruptor, elevador com 5 estados, placa, espelho), copa (balcão, cafeteira, micro-ondas, geladeira, máquina de lanches), lounge (sofá, poltrona, puff, ping-pong, fliperama), banheiro, recepção, banco |
| **Pisos** (9) | carpete (tingível), madeira, xadrez, azulejo, cimento, mármore, grama, calçada, asfalto |
| **Paredes** | lisa, listras, azulejo, lambri, tijolo, vidro, mármore (+ externa) |
| **Telas** (14) | off, standby, idle, code, terminal, browser, search, chat, docs, tasks, alert, progress, show (futebol/novela), game |
| **Ícones** (~25) | alert, question, zzz, check, heart, coffee, music, idea, sweat, star, lightning, chat, coin, sparkle, trophy, ampulheta, teia, tempestade, mãos do jokenpô |
| **Temas** | 10 temas de sala, temas sazonais (Natal, Halloween) com props e fantasias nos personagens |

### 3.3 O que foi extraído

`prototipos/predio-pixel/src/habblaud/art/` (cópia fiel) + `shared/appearance.ts`, `shared/hash.ts`,
`shared/world/appearance-flat.ts` e um `i18n.ts` mínimo no lugar do i18n deles. Typecheck limpo com TS 6 e Vite 8
(as versões do nosso frontend). Os 4 agentes ganharam **aparência fixa** (`src/agentes.ts`):

| Agente | Visual |
| --- | --- |
| **Cifra** (financeiro, `#16a34a`) | camisa social com gravata verde, óculos, cabelo de lado |
| **Agenda** (compromissos, `#2563eb`) | blusa azul, coque, brincos, saia |
| **Vita** (saúde, `#f97316`) | camiseta laranja, rabo de cavalo, short e tênis |
| **Norte** (projetos, `#0891b2`) | moletom ciano, cabelo cacheado, fone, barba por fazer |

**Licença:** MIT permite copiar, modificar e usar comercialmente, **desde que o aviso de copyright e a licença
acompanhem a cópia** — por isso `src/habblaud/LICENSE` e o crédito no rodapé do protótipo. Ao levar para o
frontend, manter a pasta com o LICENSE (e citar no README).

**Integração com o frontend (React + PixiJS):** a arte devolve `HTMLCanvasElement`; vira textura com
`Texture.from(sprite.canvas)` (respeitando `ax/ay` como `anchor`) ou é desenhada num canvas 2D próprio, como no
protótipo. O módulo não tem dependência de framework.

---

## 4. Dinâmica dos agentes

### 4.1 Estados e coreografia (o "o que cada um está fazendo")

| Estado no habblaud | O que se vê | Equivalente no hubbia |
| --- | --- | --- |
| Trabalhando | Na mesa digitando; o monitor e um balão mostram a atividade (📖 lendo, 💻 terminal...) | Agente processando (relatório, scan do repositório, plano de dieta) |
| **Precisa de você** | **Corre** para a mesa e **levanta a mão**, alerta piscando, sino | Proposta da Agenda esperando confirmação, card do Norte sugerido, onboarding da Vita pendente |
| Esperando o shell | Ampulheta, pipoca → gira na cadeira (3 min) → teia de aranha (10) → cochila (25) → confete ou nuvem de chuva | Tarefa longa em segundo plano (import de extrato, geração de relatório): a mesma escalada cômica serve |
| Ocioso | Passeia: café, bebedouro, banheiro, sofá, celular no puff, espelho; cochila após 10 min | Agente sem nada pendente |
| Subagente concluído | Vai até quem o chamou, entrega, sai pelo elevador | Um agente entregando algo a outro (ex.: Cifra avisando a Agenda de um vencimento) |
| Sessão encerrada | Vai embora; o último da sala apaga a luz | Agente desativado |

Detalhes do `sim/behavior.ts` que valem copiar: pesos de atividade ociosa (`IDLE_WEIGHTS`), tempo sentado sorteado,
`shouldRun` (corre quando tem pressa), `chooseSeat`, `isLastInRoom` (apagar a luz), `lightLevel`, e a tela que
acompanha o modo (`screenModeFor`).

### 4.2 Movimento

- Grade de caminhada (`WalkGrid`) gerada da planta + **A\*** 4 direções; registro de lugares (`SpotRegistry`) com
  reserva para dois não sentarem no mesmo lugar. Andar 3,2 tiles/s, correr 6 tiles/s.
- Elevador com portas animadas para chegadas e saídas; salas que **são construídas** (2,6 s) quando um projeto
  aparece e **desmontadas** em jardim quando somem.
- No protótipo: A\* + reserva de lugares + divisórias entre salas, correr para a mesa, elevador na chegada.

### 4.3 Vida social (encenação, sem efeito nos agentes)

- **Personalidade** por semente: 2–3 traços entre 14 (competição, apostas, games, TV, fofoca, vaidade, cafeína,
  piadas, esporte, timidez, economia, sonecas, calma, leitura), bordão próprio, **amizades e rivalidades**.
- **Rodas** quando dois ou mais estão à toa: TV (futebol que pisca GOL e a torcida comemora), videogame, fliperama,
  pingue-pongue com placar, papo na copa (fofoca com nomes dos colegas), conversa, jokenpô valendo moedinhas, espelho.
- **Moedinhas** fictícias: ganha ao concluir tarefas e entregar; aposta no jokenpô; extrato na gaveta.

**Para o hubbia:** encaixa muito bem — os nossos agentes já têm personalidade de produto. Cifra "pão-dura"
(economia) e competitiva, Vita esportiva e da calma, Agenda sociável e da cafeína, Norte gamer e da leitura. As
falas podem sair do domínio ("Gasto com delivery subiu 30% 👀", "Bebeu água hoje?"). E o sistema de
**entregas entre agentes** já está no backlog (`docs/backlog-futuro.md`, recados agente→agente).

---

## 5. Interface, integrações e perfumaria

| Recurso | Como é no habblaud | Vale para o hubbia? |
| --- | --- | --- |
| **Gaveta do agente** | Atividade, tarefas, linha do tempo, estatísticas, vida social, editor do personagem | **Sim — vira o painel de cada agente** (dashboard da Cifra, chat da Agenda, menu da Vita, card do Norte) |
| **Responder pelo escritório** | Cartão de permissão (aprovar, recusar com motivo, sempre permitir), perguntas com opções; tecla P vai para o próximo pedido; contador na barra | **Sim**: "precisa de você" + fila de pendências (confirmar ação da Agenda, aceitar card do Norte) |
| **Caixa de mensagem** | Manda texto à sessão; rascunho por agente; Enter/Shift+Enter | Sim, para a Agenda (chat) |
| **Entregas** | O que cada agente terminou "como um BA receberia": manchete, resumo, anexos | **Sim**: relatório mensal da Cifra, plano de dieta da Vita, card finalizado do Norte |
| **Meu dia** | Tempo por status, gargalo humano ("esperando você"), por hora e projeto | Adaptável: quanto tempo propostas esperaram você, o que cada agente fez no dia |
| **Timelapse** | Replay do dia com sépia e "Voltar ao vivo" | Perfumaria boa para depois |
| **Feed + toasts** | Últimos eventos, avisos agrupados com contador | Sim |
| **Notificações** | Notification do navegador com a aba oculta, sino, contador no título | Sim (casa com os alertas proativos do backlog) |
| **Dia e noite** | Hora local: azulado à noite, halos de abajures e monitores, sol pelas janelas, tom quente no entardecer; `?hora=21:30` | Sim (o protótipo tem uma versão simples com o controle "Hora") |
| **Sons** | Sintetizados por WebAudio (sem arquivos): teclado, ding do elevador, sino, estalo, pingue-pongue; volume por categoria; desligados por padrão | Sim, barato e charmoso |
| **Temas sazonais** | Natal e Halloween automáticos pelo calendário | Perfumaria |
| **Partículas e efeitos** | Confete, moedas, brilho; festa/alarme na sala por eventos do GitHub (PR mergeado, CI vermelho) | Sim: confete quando a Vita bate a meta, alarme quando a Cifra vê gasto fora do padrão, festa no card finalizado do Norte |
| **Câmera** | Arrastar, zoom, clique duplo para seguir; atalhos de teclado | Sim |
| **Editor de personagem** | Peças com prévia, sortear, regras de combinação | Opcional: o usuário customizar o visual dos agentes |
| **Ditado** | Whisper local (whisper.cpp) | Talvez para a Agenda |
| **Modo demonstração** | Simulador gera agentes falsos | **Sim**: ótimo para desenvolver o frontend sem backend |
| **Acesso pelo celular** | HTTPS com CA local e senha scrypt | Não se aplica (nosso backend já é servidor) |
| **Terminal, Codex, contas de uso** | xterm/node-pty, hooks do Codex, uso 5h/semanal | Não se aplica (é específico de agentes de código) — exceto numa futura "sala de programação" |
| **Habblaud World** | Cidade online, cada habblaud vira um prédio | Não por enquanto |

---

## 6. Como fica no hubbia

**O prédio** (já no protótipo): recepção com elevadores e placa "hubbia", uma sala por agente mobiliada pelo
domínio e um térreo comum.

| Sala | Mobília / clima | Tela da sala |
| --- | --- | --- |
| Cifra | lambri verde, arquivos, pastas, impressora, segunda mesa com planilha | tarefas / documento |
| Agenda | listras azuis, relógio, janelas, cantinho de conversa com poltronas, sofá | chat |
| Vita | piso de madeira, bebedouro, espelho, puffs no tapete, plantas, geladeira | progresso |
| Norte | tijolo ciano, ilha de mesas, mesa de reunião com banquetas, fliperama, pôsteres "ship it" e "bug" | código / terminal |
| Copa e recepção | de todos: café, geladeira, lanches, fliperama, sofá, banco | — |

**A interação** (o que o habblaud não tem): clicar no agente ou na sala abre a gaveta com **o painel daquele
agente** (cada um diferente, como já está decidido em `docs/frontend-design.md`) e os **atalhos na bolha** (peso e
água da Vita). "Precisa de você" passa a significar uma decisão sua pendente, com fila e tecla de atalho.

**A sala de programação** (futuro): é literalmente o habblaud — a sala do Norte já tem a ilha de mesas e as telas
de código/terminal; dá para ligar nela agentes de código reais lendo o mesmo tipo de fonte (sessões do Claude Code)
ou o estado do próprio Norte.

---

## 7. Roteiro sugerido

1. **Protótipo (feito):** arte extraída, prédio com 4 salas, agentes andando, status simulado, gaveta, catálogo.
2. **Ligar ao backend:** status de cada agente vindo do motor de tick (pendências → "precisa de você", tarefas longas
   → "esperando", sem nada → ocioso); SSE ou polling do TanStack Query.
3. **Levar para o frontend:** `src/habblaud/` como pacote interno (com o LICENSE); render no PixiJS ou num canvas
   2D dentro do React; a gaveta vira o container dos painéis por agente que já estão desenhados.
4. **Dinâmica fina:** balões com a atividade real ("gerando relatório de março"), escalada da espera longa
   (pipoca → teia → cochilo → confete), entregas entre agentes com o personagem indo até a sala do outro.
5. **Perfumaria:** dia/noite completo com halos, sons WebAudio, partículas por evento, vida social com personalidades
   dos nossos agentes, modo demonstração, timelapse, temas sazonais.
6. **Sala de programação** com agentes de código.

---

## 8. Cuidados

- **Licença:** manter `LICENSE` do habblaud junto da arte copiada e o crédito visível (README/rodapé).
- **Não copiamos** o logotipo, as ilustrações e os quadros gerados por IA do habblaud (estão fora de `art/`) nem
  nada do World (privado).
- A arte usa textos em português embutidos só no editor (`editorConflict`); o resto é visual puro.
- Fonte bitmap `pixelfont.ts` (3×5, minúsculas com acentos) serve para placas e rótulos no canvas.
