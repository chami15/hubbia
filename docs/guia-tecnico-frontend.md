# Guia técnico do frontend (documento vivo)

Equivalente ao `guia-criacao-de-agentes.md`, só que pro frontend:
registra as decisões técnicas de stack, arquitetura, o histórico de
tentativas (inclusive as que deram errado) e as regras que valem pra
qualquer coisa nova — atualizado a cada decisão desse tipo.

Processo de trabalho: o chefe cuida do visual/UX (layout, cores,
estilo, o que a tela deve transmitir); a IA cuida da parte técnica
(arquitetura, performance, como o visual vira código) e explica o
porquê de cada escolha. Mesmo modelo de debate-antes-de-codar do
módulo de agentes.

---

# PARTE 0 — O prédio pixel (substitui o escritório isométrico)

**Estado atual.** A tela do hub deixou de ser o escritório isométrico em
PixiJS (sprites do Kenney + modo de edição) e virou um **prédio em pixel
art procedural**, com a arte extraída do habblaud (MIT; estudo completo
em `docs/estudo-habblaud.md`). As PARTES 3 a 7 abaixo ficam como
histórico de como o escritório isométrico funcionava — o código dele
saiu da árvore, mas segue na branch `frontend`.

**Por que trocou.** A exibição era a pedra no sapato: cada agente ou
sala nova exigia sprite, âncora medida e sala desenhada à mão no editor.
No prédio, tudo é desenhado em código a partir de dado: agente novo é
uma aparência (peças do personagem) e sala nova é uma lista de móveis.
Nenhum arquivo de imagem.

**Onde mora** (`src/features/predio/`):

| Arquivo | O quê |
| --- | --- |
| `habblaud/` | Módulo de arte copiado do habblaud, com o `LICENSE` (obrigatório pela MIT). Só duas mudanças: caminhos dos imports e os construtores sem *parameter property* (o tsconfig usa `erasableSyntaxOnly`) — marcadas com `(hubbia)`. |
| `agentes.ts` | Registro único dos agentes: nome, cor, especialidade (a ponte com GET /agentes), função e aparência pixel. Substitui `escritorio/agentes.ts`. `especialidade: null` = agente conceito (sem backend). |
| `salas.ts` | Modelos de sala em coordenadas locais (servem em cima ou embaixo do corredor). Regras para um modelo funcionar estão no topo do arquivo. |
| `predio.ts` | Monta o prédio a partir das vagas (recepção e copa fixas; duas vagas por coluna; cresce para a direita até 8), grade de caminhada, divisórias e o desenho por quadro (canvas 2D, ampliado pelo CSS sem suavização). |
| `sim.ts` | Comportamento (sem DOM): A* na grade, pausas, chegada pelo elevador, dispensa. |
| `mundo.ts` | O prédio vivo e imperativo (como a cena do Pixi era): canvas, laço, câmera, clique. O React só empurra dados e escuta cliques. |
| `vagas.ts` | Quem está em cada vaga — por enquanto no `localStorage`; é a única peça que muda quando "agentes ativos por chefe" for para o backend. |
| `PainelPredio.tsx` | Gerência: quem está no prédio (abrir, dispensar) e o catálogo (adicionar, inclusive clicando numa vaga). |

**Do backend para o prédio** (`Escritorio.tsx`, `statusNoPredio`):
mensagem não lida para o chefe → *precisa de você* (corre para a mesa e
levanta a mão); `pensando`/`executando` → *trabalhando*; `falando` →
*conversando*; `idle` → *ocioso* (e *dormindo* de madrugada, pela hora
simulada do tick). Dia e noite seguem a `hora_simulada`.

**Painéis.** Não mudaram: clicar num agente (ou na sala dele) abre o
mesmo `PainelDoAgente`; o Motriz abre a sala de máquinas (é o trabalho
dele). Os painéis abrem DENTRO da área do prédio, então a barra do topo
(relógio, mensagens, configurações, sala de máquinas, avançar tick)
nunca some. O retrato do agente (`RetratoAgente`) virou o busto em pixel
gerado pela mesma arte — o personagem do painel é o mesmo que anda.

**Testes.** `src/features/predio/__testes__/predio.test.ts`: toda sala do
catálogo tem todos os lugares alcançáveis em cima e embaixo do corredor,
o prédio cheio também, e a simulação leva o agente até a mesa. Ao mexer
num modelo de sala, é esse teste que pega móvel fechando caminho.

---

# PARTE 1 — O caminho até aqui (e os erros pelo caminho)

Esta seção existe porque o frontend foi reconstruído **cinco vezes**
antes de chegar num resultado aprovado. Documentar o porquê de cada
fracasso vale mais que documentar só a solução final — evita repetir.

## A visão do produto (o que deu norte)

O chefe descreveu assim, e é o critério contra o qual tudo é medido:

> "Imagino um espaço onde eu possa observar meus agentes, se
> comunicando, 'trabalhando', uma sala real, como se os agentes fossem
> pessoas reais. (...) como se eu tivesse olhando uma **maquete de
> fora**. (...) não quero um 'site' ou landing page para meus agentes,
> quero algo **vivo**, com cenário, ambientação, profundidade, capaz de
> trazer imersão."

Palavras-chave que viraram requisito técnico: **maquete vista de fora**
(daí a laje com espessura), **vivo** (daí a prioridade em personagens,
não em mobília), **profundidade**, **vários ambientes no futuro**.

## Tentativas que falharam, e o diagnóstico de cada uma

| # | Tentativa | Técnica | Por que foi rejeitada |
|---|---|---|---|
| 1 | Escritório top-down plano | SVG desenhado à mão (mesa/cadeira/janela como `<rect>`/`<ellipse>`) | Visual "cru e chapado". Formas geométricas escritas à mão não têm sombreamento, textura nem proporção convincentes. |
| 2 | Arte pronta do Recraft (`boxMesas.svg`) | SVG gerado por IA, usado como imagem estática | A **arte** era ótima, mas o SVG tinha milhares de `<path>` anônimos — impossível manipular peça por peça (recolorir uma cadeira, animar um monitor). Só servia como imagem "assada". |
| 3 | Habbo isométrico, v1 | `<pattern>` SVG (losango infinito) + `clip-path` CSS | Efeito de **vibração/moiré** (ilusão de ótica) por contraste alto num losango pequeno. E as posições eram porcentagens chutadas, sem matemática por trás. |
| 4 | Habbo isométrico, v2 (planta em L) | Losangos individuais + paredes derivadas da planta | Melhor estruturado, mas ainda era geometria desenhada à mão — mesmo problema de sempre: sem textura, sem acabamento. |
| 5 | Canvas2D puro ("clean/flat moderno") | `CanvasRenderingContext2D`, arquitetura IsoMath/Room/Entity/Renderer | Trocar SVG por Canvas **não mudou nada visualmente** — porque o problema nunca foi o motor de renderização. |

## As duas causas-raiz (o aprendizado central)

Depois da 5ª rejeição, o diagnóstico honesto foi:

**1. Geometria escrita à mão nunca vai parecer arte.**
Polígonos, retângulos e gradientes em código não alcançam o
acabamento de um asset feito por artista. A prova estava no próprio
projeto: o `boxMesas.svg` do Recraft ficou ótimo, a `Cadeira.tsx`
escrita à mão ficou ruim — **mesmo projeto, mesma pessoa avaliando**.
Não é questão de ajustar cor ou proporção; é limite do método.

**2. Toda tentativa era, por definição, uma sala morta.**
Em cada rodada o escopo foi "só a casca, sem avatar, sem agente, sem
movimento". Pedia-se um escritório **vivo** e entregava-se cinco vezes
uma sala vazia. Nenhuma quantidade de sombra ou textura resolve isso.

> **Regra que nasceu daqui:** quando o mesmo tipo de entrega é
> rejeitado 2-3 vezes seguidas, **parar de iterar e investigar a
> causa-raiz**. Continuar ajustando cor/proporção era tratar sintoma.

## Beco sem saída que vale registrar

Investigou-se o repositório **Quackster/Havana** (emulador open-source
de Habbo) buscando como o cliente desenha piso/parede. **Não serve:**
Havana é só o *servidor* (Java); o cliente original era proprietário
(Shockwave/Flash da Sulake) e existe no repo apenas como binário
compilado (`Habbo.swf`, `.cct`). Essa informação nunca foi pública.

Único aproveitamento: o servidor representa a sala como um
**heightmap** — string tipo `"0000|0000|xxxx"`, um caractere por tile.
Isso validou a ideia de representar a planta como matriz de caracteres.

## A solução que funcionou

**Assets de arte de verdade + cenário desenhado, combinados.**

- **Móveis:** sprites do **Kenney Furniture Kit** (CC0, domínio
  público) — 140 peças × 4 rotações = 560 PNGs, em
  `frontend/public/Isometric/`. Arte de artista, com sombreamento e
  textura reais.
- **Piso, laje e paredes:** **desenhados** com `Graphics` do Pixi —
  porque isso devolve **controle total de cor** (trocar a paleta da
  sala inteira é uma linha), elimina emendas entre tiles, e permite a
  laje grossa que dá o efeito de maquete.

O que faz os dois conversarem é a **geometria compartilhada** (ver
Parte 3). Se o piso fosse desenhado num ângulo diferente do dos
sprites, móvel e chão pareceriam filmados por câmeras diferentes — e o
olho percebe isso na hora.

---

# PARTE 2 — Stack e arquitetura

## Stack escolhida (e por quê)

| Peça | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript** | Contratos de dado explícitos (equivalente aos schemas Pydantic do backend). |
| Build/dev server | **Vite** | Hot reload rápido, é o "uvicorn do front". CORS do backend já configurado pra porta 5173. |
| UI | **React** | Cuida só do ciclo de vida do canvas e das telas de painel. |
| Renderização do mundo | **PixiJS v8** | Renderizador 2D acelerado por GPU. **Não é engine de jogo** (não tem física/cena/input como Phaser) — resolve exatamente o que dói: milhares de sprites, ordenação por profundidade, animação, câmera. |
| Estilo (painéis) | **Objetos inline `React.CSSProperties` + CSS custom properties** (`index.css`) | Tailwind v4 está instalado e importado, mas não é o método usado nos componentes — a convenção real que se consolidou é estilo inline por componente, com os tokens de design (cor, raio, fonte) centralizados como variáveis CSS (`var(--deck)`, `var(--radius-deck)` etc., ver Parte 11) em vez de classe utilitária. Documentado aqui porque a tabela original previa Tailwind e a prática divergiu. |
| Estado do servidor | **TanStack Query** | Cache/loading/erro/refetch dos dados da API. |
| Chamadas HTTP | **axios** | Só dentro do `api client`, nunca direto nos componentes. |
| Testes | **Vitest** + **Playwright** | Playwright também é usado pra *verificação visual* durante o desenvolvimento (screenshot + checagem de erro no console). |

### Por que PixiJS, se antes o veredito era "sem engine de jogo"

O conselho mudou porque **o escopo mudou**. Enquanto o alvo era "painel
de status de 5 mesas fixas", DOM+CSS bastava. Quando o chefe descreveu
*vários ambientes, transitar entre eles, agentes se movendo e
interagindo, um mundo que cresce*, o problema virou genuinamente de
jogo. Pixi é o meio-termo certo: renderizador puro, sem o peso de uma
engine completa.

## Estrutura de pastas

```
frontend/
  public/
    Isometric/              → os 560 PNGs do Kenney (asset estático, servido por caminho direto)
  src/
    api/                    → porta única pro backend (= utils/query_executor.py)
    types/                  → contratos TS espelhando os schemas do backend (= Pydantic)
    hooks/                  → lógica reutilizável (= resolvers/)
    components/             → UI genérica, usada em MAIS DE UM módulo
    features/
      escritorio/
        iso.ts              → matemática isométrica (o único lugar que sabe converter tile → pixel)
        sala.ts             → dimensões, paletas, constantes de parede/janela
        ancoras.ts          → GERADO por scripts/medir-ancoras.py: as 560 âncoras (peça × direção)
        salas/*.json        → o conteúdo de cada ambiente. Sala nova = arquivo novo.
        sala-dados.ts       → o formato da sala + os índices (por id, por agente)
        maquete.ts          → dona dos dados E dos sprites, mantendo os dois em sincronia
        catalogo.ts         → as 140 peças agrupadas por categoria
        persistencia.ts     → as três camadas: fonte / rascunho / sessão
        edicao.ts           → o modo de edição (tecla E)
        cena.ts             → desenha o que NÃO é mobília (piso, laje, paredes, crachás)
        Escritorio.tsx      → ciclo de vida do canvas Pixi + painéis
  scripts/
    medir-ancoras.py        → mede o "pé" de cada sprite e regera ancoras.ts
```

**Regra:** componente nunca fala direto com o backend — sempre
componente → hook → api client. Mesma disciplina do router → resolver
→ query_executor.

**Regra:** dado de negócio e apresentação nunca se misturam.
`agente.mesa` (que vem de `GET /agentes`) é o DADO de qual mesa o
agente ocupa; onde essa mesa fica na tela é mapeamento só do frontend.

**Regra:** a sala é DADO (`salas/*.json`), nunca código. Quem mexe nela
é o modo de edição, não o editor de texto. Gerar TypeScript de volta a
partir do editor foi descartado por ser frágil: some comentário,
formatação quebra, e um erro de sintaxe derruba o app inteiro.
Serializar JSON nunca quebra o build.

**Regra:** ninguém mexe em sprite direto — fala com a `Maquete`, que é
dona dos dados e dos sprites ao mesmo tempo e mantém os dois casados.

**Regra:** a identidade do agente NÃO mora na posição, mora no campo
`agente` do móvel. Quem pergunta "onde está a Cifra?" consulta o índice
por id; quem clica num sprite lê o campo. Por isso o agente pode ocupar
qualquer móvel, em qualquer sala, sem nada no código mudar — e o
backend continua sem saber de posição nenhuma.

---

# PARTE 3 — A geometria isométrica (medida, não teórica)

Esta é a parte mais importante do documento, e a fonte da maioria dos
bugs até aqui.

## O losango do Kenney NÃO é 2:1

O "pixel art isométrico clássico" usa proporção 2:1 (largura = 2 ×
altura). **O pack do Kenney não usa isso.** Escaneando os pixels
opacos do `floorFull_NE.png` por script:

```
floorFull_NE.png = 208 × 153 px
  → o losango do topo mede 208 × 146
  → os ~7px restantes são a espessura da laje, desenhada abaixo
  → proporção real ≈ 1,42:1  (meia-altura/meia-largura = 73/104 ≈ 0,70)
```

Constantes que saíram daí (em `iso.ts`):

```ts
export const TILE_W = 208
export const TILE_H = 146
export const TILE_ALTURA = 137   // altura da face da parede do pack
```

> **Lição:** nunca assumir a geometria de um asset por convenção.
> **Medir.** Um script de 10 linhas escaneando pixels opacos economizou
> horas de "por que isso não encaixa?".

## Conversão tile → tela

```ts
export function paraTela(coluna: number, linha: number, altura = 0) {
  return {
    x: (coluna - linha) * (TILE_W / 2),
    y: (coluna + linha) * (TILE_H / 2) - altura * TILE_ALTURA,
  }
}
```

- `+coluna` move na tela para **baixo-direita**
- `+linha` move na tela para **baixo-esquerda**
- `altura` sobe (empilhamento: monitor em cima da mesa, etc.)

## A armadilha nº 1: eixo do grid ≠ eixo da tela

**Este erro foi cometido e custou uma rodada inteira.** Ao tentar pôr
duas mesas "lado a lado", deslocou-se apenas a coluna — e elas saíram
na **diagonal**, porque `+coluna` anda na diagonal da tela.

Para deslocamento **puramente horizontal** na tela, mexer coluna e
linha em **direções opostas**:

```ts
{ coluna: c + e, linha: l - e }   // anda pra direita na tela
```

Para deslocamento **puramente vertical**, mexer os dois na **mesma
direção**:

```ts
{ coluna: c + d, linha: l + d }   // anda pra baixo na tela
```

**Corolário importante:** um bloco 2×2 de casas *adjacentes* no
tabuleiro aparece como um **losango** na tela, não como um retângulo.
Para que quatro móveis formem um **retângulo na tela**, eles precisam
estar em casas **diagonais** entre si no tabuleiro.

## Coordenada de tabuleiro (a linguagem de comunicação)

Como a planta é 7×7, o chefe propôs tratá-la como tabuleiro de xadrez:
**letra = coluna (A..G), número = linha (1..7)**. A mesa do chefe fica
em **B2**. Direção do móvel vai junto: `B2-NE`.

```ts
casa('B2')            // → { coluna: 1, linha: 1 }
entre('D3', 'D4')     // → { coluna: 3, linha: 2.5 }  (móvel na divisa de 2 casas)
```

Isso eliminou a ambiguidade de "move um pouco pra esquerda" — que era
fonte constante de retrabalho.

## Rotações dos sprites

Cada peça vem em 4 rotações: `_NE`, `_NW`, `_SE`, `_SW`.
Ex.: `desk_NE.png`, `chairDesk_SW.png`.

> **Lição prática:** a rotação certa **não** é dedutível pelo nome —
> depende de como a peça se relaciona com a cena. Duas vezes a direção
> da mesa do chefe foi corrigida errado por dedução. A solução que
> funciona: **renderizar as 4 rotações no lugar real e comparar lado a
> lado**, deixando o chefe escolher pelo número.

**O que os rótulos significam de fato.** Quando o espelhamento de porta
precisou de uma resposta exata (qual direção vira qual num espelho
horizontal), deduzir pelo nome deu errado de novo — a primeira tabela
fazia `NE↔SE` / `NW↔SW`, que não é reflexão nenhuma: é um giro de 180°,
e deixava a peça no **mesmo plano de parede** quando ela tinha acabado
de mudar de parede. Na tela: posição certa, peça atravessada.

A resposta veio de **medir**, não de deduzir: espelhando horizontalmente
a silhueta (o canal alfa, que é imune a sombreamento) de cada sprite e
comparando com as outras três direções, o casamento é inequívoco —
0,95–0,99 de sobreposição, o mesmo par pra toda peça com frente definida
(`chairDesk`, `desk`, `computerScreen`):

```
espelho horizontal:   NE ↔ NW      SE ↔ SW
```

Peças quase simétricas (`doorway`, `pottedPlant`) casam com duas
direções ao mesmo tempo e por isso **não** servem de referência — é
preciso medir numa peça que tenha frente.

Corolário útil: `{NE, SE}` ficam num plano de parede e `{NW, SW}` no
perpendicular. Qualquer transformação que mande uma peça de uma parede
pra outra tem que trocar de conjunto.

## Âncoras dos sprites

Cada PNG é cortado justo (sem padding transparente), então cada peça
tem um ponto de apoio diferente. `scripts/medir-ancoras.py` acha o
pixel opaco mais baixo (o "pé" da peça) e sobe meia altura de losango.

Dois detalhes que custaram tempo:

1. **O `getbbox()` do Pillow devolve o limite de baixo EXCLUSIVO.** Sem
   o `−1` o erro médio ficava 8× maior. Com ele, a fórmula reproduz as
   15 âncoras que tinham sido calibradas a olho com 0.0–0.1px de erro —
   foi essa validação que deu confiança pra gerar as outras 125.

2. **A âncora é por peça × DIREÇÃO, não por peça.** O mesmo móvel tem
   alturas diferentes em cada rotação (`chairDesk` tem 78px em NE e
   97px em SE). Uma âncora só por peça faz o móvel pular do chão ao
   girar — e, antes disso ser descoberto, as cadeiras SW já estavam
   desenhadas flutuando ~5px com a âncora do NE.

## Paredes

- Uma peça de parede do pack cobre **exatamente uma aresta de tile**
  (não um tile inteiro) — foi por isso que os primeiros testes davam
  frestas.
- Hoje as paredes são **desenhadas**, com três partes: face, faixa de
  espessura no topo, e espessura na ponta lateral (a quina externa).
  Sem essas duas espessuras, a parede parece uma folha de papel.
- A espessura lateral é **normalizada** para o mesmo comprimento da
  faixa de cima, garantindo proporção consistente.

## Coordenadas dentro da parede

Para posicionar janela/quadro/porta sem repetir trigonometria:

```ts
naParede(de, ate, t, h)   // t = 0..1 ao longo do comprimento
                          // h = 0..1 na altura (0 = chão, 1 = topo)
```

---

# PARTE 4 — Camadas e ordenação (z-order)

**Bug clássico do isométrico, já cometido aqui:** um tile de piso
desenhado *depois* passava por cima de um móvel que estava *atrás*
dele (o tapete sumia). A causa era piso e móvel disputando o mesmo
espaço de `zIndex`.

**Solução: camadas separadas, na ordem de trás pra frente:**

```
1. paredes do fundo   (sempre atrás de tudo)
2. laje               (a espessura sob o piso)
3. piso
4. tapetes            (no chão, acima do piso, abaixo de qualquer móvel)
5. móveis             ← SÓ esta camada ordena por profundidade internamente
```

Dentro da camada de móveis, a profundidade sai do campo `sobre`:

```ts
const base  = baseNoChao(movel, porId)   // segue a cadeia de `sobre`
const nivel = nivelDe(movel, porId)      // quantos degraus acima do chão
sprite.zIndex = profundidade(base.coluna, base.linha) * 1000
              + nivel * 100
              + ordemNoArray
```

**Por que herdar do suporte, e não usar a posição própria:** um monitor
levemente deslocado da mesa tem profundidade MENOR que ela e desenha
ATRÁS — sumindo. Esse bug apareceu duas vezes e foi remendado à mão
(`zColuna`/`zLinha`) antes de virar o campo `sobre`, que resolve a
classe inteira: a peça herda a profundidade de quem a sustenta, desenha
sempre na frente, e acompanha o suporte quando ele se move.

---

# PARTE 5 — Regras de performance (anti-lag, anti-bug)

Valem desde o primeiro componente:

1. **Nunca animar `top`/`left`/`width`/`height`.** Só `transform` e
   `opacity` — acelerados por GPU; as outras forçam recálculo de
   layout da página inteira a cada frame.
2. **Isolamento de re-render.** Quando o estado de 1 agente muda, só
   aquele elemento redesenha. Nunca um estado global que force a
   árvore inteira.
3. **Zero polling/loop escondido.** Toda atualização nasce de ação
   explícita (via TanStack Query) — nada de `setInterval` disfarçado.
4. **Sempre testar no navegador de verdade antes de considerar
   pronto** (Playwright + olhar o console) — nunca "compilou, deve
   estar ok".
5. **Assets otimizados** — o pack inteiro tem 2,7 MB; PNGs servidos
   direto de `public/`, sem passar pelo bundler.
6. **Usar o tamanho nativo do sprite.** Redimensionar em runtime borra
   a arte. `TILE_W/TILE_H` foram escolhidos pra bater com o asset.

---

# PARTE 6 — Estratégia de assets (decidida)

**Regra principal: a IA não desenha mais mobília.** Foi a causa-raiz de
cinco reconstruções.

| O que | Como | Por quê |
|---|---|---|
| Móveis, objetos, decoração | **Sprites** do Kenney Furniture Kit (CC0) | Arte de artista; impossível de replicar em código. |
| Piso, laje, paredes, janelas | **Desenhados** (`Graphics` do Pixi) | Controle total de cor (paleta trocável), sem emendas, e a laje grossa da maquete. Formas simples e planas — onde código *funciona* bem. |
| Personagens | **pendente** — o Kenney Furniture Kit não tem | É o que falta pro "vivo". Vai precisar de pack próprio. |

Paletas ficam em `sala.ts` (`neutra`, `madeira`, `corporativa`,
`oliva`). Trocar o ambiente inteiro = mudar `PALETA`.

Sobre geradores de imagem por IA: majoritariamente produzem **raster**,
não vetor editável. Mesmo quando produzem SVG (Recraft), tende a vir
como milhares de `<path>` anônimos — bom como imagem, ruim como peça
manipulável. Bancos CC0 (Kenney, OpenGameArt) resolvem melhor.

> **Nota de ambiente:** o sandbox bloqueia `kenney.nl`, `itch.io` e
> `opengameart.org`, mas alcança GitHub e npm. Assets novos precisam
> ser baixados pelo chefe e commitados, ou vir de mirror no GitHub.

---

# PARTE 7 — O modo de edição (tecla E)

## Por que existe

Nasceu do gargalo real do projeto: descrever posição em palavras não
funciona numa cena isométrica. "Um pouco mais pra trás" vira um vetor
diferente dependendo da peça e de que lado o agente senta — e cada
rodada de *descreve → agente chuta o delta → renderiza → tá errado*
custava caro. Chegamos a gastar 5 rodadas seguidas num único monitor.

O editor tira essa tradução do caminho: o chefe arrasta, vê na hora, e
salva. Ninguém precisa acertar pixel por descrição.

## As três camadas

| Camada | Onde vive | Some quando |
|---|---|---|
| **fonte** | `salas/*.json`, no git | nunca (é o oficial) |
| **rascunho** | `localStorage` | só se descartar |
| **sessão** | memória da `Maquete` | ao recarregar |

**O código nunca adivinha qual é qual.** Quem decide é o chefe,
apertando um botão. Errar pra "permanente" é caro demais pra deixar por
conta de heurística — por isso são ações explícitas, e o HUD sempre
mostra em qual camada a tela está.

## Falhas que não fazem barulho

Quatro defeitos no JSON fazem a sala carregar *quase* certa, sem erro
em lugar nenhum — o pior tipo de defeito. Todos vêm de edição à mão do
arquivo; nenhum é produzido pelo editor:

| Defeito | O que acontece |
|---|---|
| `id` repetido | o índice é um `Map`: o segundo apaga o primeiro e sobra um sprite que ninguém consegue selecionar |
| `sobre` apontando pra id inexistente | `baseNoChao` devolve a própria peça; profundidade errada, pode desenhar atrás do que deveria cobrir |
| `sobre` apontando pra si mesmo | idem |
| `agente` desconhecido | o crachá some e nada explica por quê |
| mesmo agente em duas peças | o índice por agente é um `Map`: um dos crachás some |
| ciclo de apoio | a profundidade vira arbitrária, dependendo de qual peça foi consultada primeiro |

Defesa em **quatro camadas**, da que pega mais cedo pra que pega mais
tarde:

1. **o editor não consegue criar nenhum deles** — `novoId` evita id
   repetido, remover limpa o `sobre` dos filhos, atribuir agente tira
   ele de onde estava, e `criariaCiclo()` recusa fechar um laço de
   apoio

   > A guarda contra ciclo mora na `Maquete`, junto do dado, e **não**
   > na interface. Antes o que impedia ciclo era o editor só oferecer
   > como suporte peças que estão no chão — proteção que ninguém
   > escreveu de propósito e que sumiria em silêncio no dia em que
   > empilhar mais de um nível for permitido.
2. **o plugin recusa gravar** sala inconsistente (422 + motivo). É a
   camada que mais importa: o que não entra no arquivo versionado não
   vira problema de outro dia sem ninguém lembrar de onde veio
3. **`npm test`** percorre todo JSON em `salas/` e prova coerência —
   pega edição à mão antes de rodar o app
4. **painel vermelho na tela** ao carregar, listando cada defeito

**Nenhuma camada corrige nada** — adivinhar a intenção de um dado
torto é como se cria um problema pior que o original.

Se um defeito aparecer mesmo assim (só chega aí por edição à mão), os
dois mais prováveis se resolvem **dentro do editor**, sem tocar no
JSON: agente repetido → selecione a peça errada e escolha
`— ninguém —`; ciclo de apoio → selecione a peça e clique **soltar**.

`conferirSala()` mora em `sala-conferir.ts`, **um arquivo sem nenhum
import**. É usado pelo app (resolução `bundler`), pelo plugin do Vite
(`nodenext`) e pelos testes; qualquer dependência transitiva viraria
briga de resolução de módulo em um dos três.

## Rascunho versionado

A versão vai na **chave** do localStorage (`escritorio:rascunho:v1`),
não no conteúdo: rascunho de formato antigo simplesmente não é
encontrado, em vez de ser lido e interpretado errado. **Suba o número
sempre que `SalaDados` mudar de forma incompatível** — o rascunho
velho é abandonado e o chefe cai na fonte, que é o comportamento
seguro.

## Rascunho automático (e o que "alterado" passou a significar)

Trocar de sala recarrega a página, e o que estava só na memória
evaporava — foi assim que se perdeu trabalho num teste real: uma porta
criada na sala A sumiu ao navegar, enquanto o espelho dela (que já era
rascunho) sobreviveu na sala B. A assimetria fazia parecer que a peça
tinha *pulado de sala*.

Hoje toda mudança agenda uma gravação no rascunho (600ms de espera —
`notificar()` roda a cada pixel de arraste, e gravar em todos seria
escrever no localStorage centenas de vezes por gesto). O
`beforeunload` grava de novo, síncrono, cobrindo qualquer saída:
trocar de sala, fechar aba, recarregar.

**Com isso, "· alterado" mudou de significado.** A referência de
comparação passou a ser a **fonte** (o `.json` versionado), não o
estado em que a tela abriu. Antes queria dizer "mexi em algo desde que
abri"; agora quer dizer **"existe trabalho que ainda não está no
arquivo do projeto"** — que é a pergunta que importa na hora de fechar
a aba. Consequência visível: abrir uma sala que já tinha rascunho
pendente mostra "alterado" de cara, e isso é a informação certa.
Por isso "salvar rascunho" **não** zera mais o indicador; só gravar na
fonte zera.

Duas armadilhas que isso criou, ambas com guarda no código:

1. **O aviso de saída dispararia nas nossas próprias navegações.**
   Trocar de sala, criar/excluir sala e descartar rascunho recarregam a
   página de propósito. Todas passam por `recarregarDeProposito()`, que
   marca a intenção — o `beforeunload` só interrompe quando a saída
   *não* foi pedida por nós. Um aviso que aparece à toa é um aviso que
   se aprende a ignorar.
2. **"Descartar e voltar à fonte" seria ressuscitado.** A gravação de
   última hora do `beforeunload` regravaria exatamente o que o chefe
   acabou de mandar jogar fora, porque a maquete em memória ainda está
   suja. Daí a trava `descartado`.
3. **O descarte parava na metade.** Descartar apaga o rascunho *desta*
   sala — mas uma porta criada na sessão tem uma segunda metade, que
   nasceu no rascunho de *outra* sala. Ela sobrevivia ao descarte e
   virava uma porta órfã numa sala que o chefe nem tinha aberto (foi
   visto em teste). O editor guarda os espelhos que criou
   (`espelhosCriados`) e `removerEspelhos()` os apaga junto. Só os
   **desta sessão**: se o chefe já foi lá e gravou aquela sala na
   fonte, a peça virou decisão dele e não lixo nosso.

## Desfazer o vínculo de uma porta sai dos DOIS lados

Tirar o `leva` só do lado aberto deixava a outra porta apontando pra cá
pra sempre — uma passagem de mão única que ninguém pediu.

O par **não é gravado em lugar nenhum**: desde que o espelho nasce, as
duas peças são móveis independentes (decisão de projeto — é o que deixa
o chefe arrastar cada uma livremente). Então a contrapartida é achada
pela própria relação: é a peça da sala B que leva de volta pra A.

Isso é exato enquanto houver **uma**. Havendo mais de uma porta de B
pra A, `desvincularDoOutroLado()` devolve `'ambiguo'` e **não mexe em
nada** — escolher no chute desvincularia a porta errada, que é o tipo
de erro silencioso que este projeto inteiro tenta não cometer. O editor
diz a situação ao chefe em vez de adivinhar.

A peça em si **continua existindo**: some o vínculo, não a mobília. Um
vão de porta pode perfeitamente virar decoração.

## Copiar e colar peça (Ctrl+C / Ctrl+V)

A área de transferência é da sessão do editor — não vai pro
localStorage de propósito: uma peça copiada semanas atrás reaparecendo
sem contexto seria pior que ter que copiar de novo. Não sobrevive à
troca de sala, e isso é limitação conhecida, não esquecimento.

**A cópia não leva `agente` nem `leva`**, e isso não é detalhe de
conveniência:

- `agente` é exclusivo no conjunto INTEIRO de salas. Colar duplicaria
  alguém que só pode estar num lugar — exatamente o defeito que a
  conferência entre salas existe pra pegar.
- `leva` colado nasceria como uma porta **sem espelho do outro lado**:
  um vínculo quebrado que ninguém pediu, e do tipo silencioso.

O resto vem junto (direção, altura, apoio), porque é o que faz a cópia
ser útil — dois monitores na mesma mesa, por exemplo. Colagens
seguidas afastam mais a cada vez, senão colar três vezes daria uma
pilha de três peças no mesmo pixel.

## Gravar na fonte (só em dev)

O navegador não escreve em disco, mas o servidor de dev do Vite
escreve. `vite-plugin-salas.ts` abre uma rota local que recebe o JSON
da sala e grava em `salas/`. Depois é só `git add`.

`apply: 'serve'` faz o plugin existir **só** no `npm run dev`. No build
de produção o botão não renderiza (`import.meta.env.DEV`) e a rota não
existe — a fronteira é estrutural, não uma checagem que dá pra
esquecer.

O plugin valida o nome da sala por regex, confere que o caminho
resolvido não escapou da pasta, limita o tamanho do corpo e checa o
formato antes de gravar. O risco concreto que isso cobre não é ataque
remoto (é servidor local): é um POST malformado destruir a sala
versionada.

Gravar descarta o rascunho — ele virou oficial, e se continuasse
existindo teria prioridade no carregamento e esconderia a fonte recém
gravada.

## Comandos

| | |
|---|---|
| arrastar | mover livre |
| setas | mover pelo passo (nas 4 direções nomeadas) |
| `Q` / `W` | girar (só troca a textura + âncora da direção) |
| `PgUp` / `PgDn` | altura |
| `Tab` | próxima peça · `[` `]` passo · `Del` excluir |
| `Ctrl+Z` | desfazer (sem sair da edição) |
| `Ctrl+C` / `Ctrl+V` | copiar e colar a peça selecionada |
| `E` | entra e sai |

O desfazer guarda o estado inteiro da sala antes de cada gesto —
cópia integral em vez de operações inversas, porque uma sala tem
algumas dezenas de móveis e o simples aqui é também o confiável.

**O detalhe que faz a funcionalidade existir é o agrupamento.** Sem
ele, segurar a seta ou arrastar o mouse geraria um nível de desfazer
por quadro e `Ctrl+Z` andaria um pixel de cada vez. Gestos do mesmo
tipo dentro de 600ms reaproveitam o instantâneo do início da rajada, e
o arraste captura só no `pointerdown`.

O "· alterado" do HUD sai de **comparar** o estado atual com o do
último salvamento, não de um sinalizador que só liga. Assim desfazer
até o começo volta a dizer "sem alterações".

## Como adicionar mobília nova

O catálogo lista as 140 peças, agrupadas por categoria. As categorias
saem do prefixo do próprio nome do arquivo (`kitchen*`, `lounge*`,
`table*`), que é como o pack já vem organizado — derivado, e não uma
lista na mão que sairia do ar assim que o pack mudasse. A miniatura é o
próprio PNG (a maior peça tem ~140px, não vale gerar spritesheet).

Peça nova nasce no centro da sala já selecionada, pronta pra arrastar.

## Objeto em cima de objeto

O botão **apoiar** liga a peça selecionada ao móvel mais próximo abaixo
dela (meia casa de tolerância). Isso preenche o campo `sobre`, que faz
duas coisas: fixa a profundidade na do suporte (a peça nunca some atrás
dele) e faz ela acompanhar o suporte quando ele se move.

---

# PARTE 8 — Testes

`npm test` (vitest). Rodam sem navegador: são sobre dado e matemática,
não sobre pixel — o que dá pra ver na tela a gente já vê na tela.

O critério pra existir um teste aqui é **cobrir o que não está sob os
olhos**:

| Arquivo | O que protege |
|---|---|
| `salas.test.ts` | toda sala versionada é coerente, só usa peça que existe no pack e tem âncora medida. Descobre os arquivos sozinho — vale pras salas futuras |
| `sala-conferir.test.ts` | a própria rede de proteção pega cada defeito, e **não dá alarme falso** em sala boa (alarme falso ensina a ignorar o aviso, que é o mesmo que não ter) |
| `iso.test.ts` | a ida e volta tela ↔ tabuleiro do arraste. Se as duas contas divergirem, a peça escorrega do cursor sem erro nenhum |
| `catalogo.test.ts` | catálogo, arquivos do pack e âncoras casados entre si |

> **Já valeu a pena na primeira execução:** os testes acharam que
> `stairsOpen` e `stairsOpenSingle` tinham âncora **negativa** — fora
> da imagem. São largas e baixas demais pro losango da base caber, e a
> fórmula de medição não vale pra elas (4 dos 560 sprites). Ninguém
> tinha usado essas peças ainda, então o defeito estava lá esperando.

Os testes ficam em `__testes__/` e têm `tsconfig.test.json` próprio —
usam API do Node (ler os JSON de sala, listar os sprites), que não faz
sentido nos tipos do app.

---

# PARTE 9 — Pontos de atenção (checklist)

Antes de dar qualquer coisa por pronta:

- [ ] Rodou no navegador de verdade e o console está limpo?
- [ ] `npm run build` passa (tsc + vite)?
- [ ] Se mexeu em posição: conferiu que o eixo do grid ≠ eixo da tela?
- [ ] Se mexeu em rotação de sprite: comparou as 4 opções em vez de deduzir?
- [ ] Se adicionou peça nova: a âncora foi medida, não chutada?
- [ ] Se mexeu em z-order: a peça está na camada certa?
- [ ] Se mudou o pack de sprites: rodou `scripts/medir-ancoras.py` de novo?
- [ ] Se mudou posição de móvel: fez no modo de edição, e não na mão?
- [ ] `npm test` passa?
- [ ] Se mexeu no formato da sala: subiu a versão da chave do rascunho?
- [ ] Se adicionou dependência: avisou que o chefe precisa de `npm install` após o `git pull`?

## Erros recorrentes a evitar

1. **Iterar cegamente após rejeições repetidas.** Parar e investigar
   causa-raiz.
2. **Assumir geometria de asset por convenção.** Medir.
3. **Deduzir rotação de sprite.** Comparar visualmente.
4. **Confundir eixo de grid com eixo de tela.**
5. **Misturar piso e móvel no mesmo espaço de z-index.**
6. **Entregar "só a casca" quando o pedido é algo vivo.**
7. **Chutar posição a partir de descrição em palavras.** É ambíguo por
   natureza: "mais perto do agente" muda de direção conforme o lado em
   que ele senta. Existe modo de edição justamente pra isso.
8. **Derivar a posição de uma peça da posição de outra.** Já foi feito
   (o teclado saía do monitor, o mouse saía do teclado) e virou fonte de
   bug: mexer numa arrastava as outras e ninguém previa o resultado.
   Cada peça guarda a própria posição.
9. **Mexer nos mesmos arquivos que o chefe ao mesmo tempo.** Rendeu um
   merge conflito resolvido pela metade, que só não virou perda de
   trabalho porque os dois lados estavam commitados. Combinar antes quem
   mexe no quê.

---

# PARTE 10 — Painéis de agente (clique no crachá)

A decisão de **layout** (largura estreita vs. larga por tipo de
conteúdo, exclusividade, atalho de campo único) mora em
`frontend-design.md` — aqui só a parte técnica de como isso se encaixa
no que já existe.

## Interatividade reaproveitada da porta

Clicar num crachá de agente só abre painel **fora do modo de edição** —
mesmo mecanismo já construído pra porta clicável (múltiplas salas,
`edicao.ts`): `sprite.eventMode` e `cursor` alternam entre "arrastável"
(edição ligada) e "clicável" (edição desligada) na mesma função
`aplicarInteratividade()`, e os handlers (`pointerover` / `pointerout` /
`pointertap`) ficam ligados no sprite pra sempre, cada um decidindo
sozinho se age olhando `ativo` na hora — não uma lista de listeners
que é montada/desmontada a cada toggle. Em modo de edição, o crachá não
abre nada: a peça por baixo continua um móvel comum, arrastável.

## A ponte entre o crachá e o agente de verdade

O escritório desenha os crachás a partir de uma lista **própria e
estática** (`AGENTES` em `features/escritorio/agentes.ts`: id string
`cifra`/`agenda`/`vita`/`norte`, cor, retrato) — ela não sabe nada do
agente de verdade do backend, que tem **id numérico** (`GET /agentes`,
`types/agente.ts`).

A chave de junção entre os dois é o campo **`especialidade`** do
agente do backend (`financeiro`/`agenda`/`saude`/`norte` — ver
`backend/scripts/seed.py`), que bate 1:1 com o id string local. Nunca
comparar id numérico do backend contra o id string do escritório
diretamente — eles não têm relação nenhuma entre si, só via
`especialidade`.

Cada entrada de `AGENTES` declara a própria `especialidade`, em vez de
existir uma tabela de-para à parte: assim a ponte fica visível pra quem
lê o registro e é impossível esquecer dela ao adicionar um agente novo.

**`especialidade` e `funcao` são campos diferentes de propósito.**
`especialidade` é chave de junção — o valor TEM que bater com o banco.
`funcao` (`"compromissos e calendário"`) é texto de tela. Se a barra do
painel mostrasse a especialidade crua, apareceria "agenda" embaixo do
nome "Agenda", que não informa nada. Misturar os dois faria uma mudança
de redação virar uma quebra de integração.

## Erro de rede vira frase, num lugar só

`mensagemDeErro()` mora em `api/client.ts` — a porta pro backend é onde
a *forma* do erro é assunto. Traduz erro de axios em algo mostrável
(RNF03), e trata "sem resposta" (backend desligado) como caso próprio,
porque "Network Error" não ajuda ninguém a entender que basta subir o
servidor.

## Duas armadilhas encontradas construindo o painel do Agenda

1. **O atalho `E` continuava ligado por baixo do painel.** Com um painel
   aberto, um "e" digitado fora do campo de texto entrava no modo de
   edição *atrás* dele — dois modos ativos ao mesmo tempo. O handler de
   teclado do `Escritorio.tsx` agora ignora tudo enquanto há painel
   aberto, e `Esc` fecha (checado ANTES do filtro de campo de texto,
   porque é dentro do campo que a mão está).
2. **`StrictMode` roda o efeito duas vezes em dev.** A consulta de
   pendência ao abrir o painel aparecia duplicada na conversa. Resolvido
   com um `ref` de guarda — o mesmo cuidado vale pra qualquer efeito que
   dispare requisição com efeito visível na tela.

> **Ao testar painel com Playwright:** ancore o `page.route` no host do
> backend (`http://localhost:8000/agenda/**`), nunca em `**/agenda/**`.
> O padrão largo intercepta os próprios módulos que o Vite serve
> (`src/features/agenda/...`) e derruba o app com erro de MIME type —
> custou uma rodada de teste falso-negativo.

## Onde o painel vive

Painel de agente é **overlay DOM comum (React)**, nunca desenhado
dentro do Pixi — mesmo padrão de `PainelEdicao`, `PainelCatalogo`,
`PainelSalas` e `PopupPorta`. O Pixi cuida só da cena; toda UI de
painel é HTML/CSS por cima, posicionado `position: absolute` sobre o
mesmo container.

Se a abertura/fechamento for animada (slide-in), vale a mesma regra de
performance da PARTE 5: só `transform`/`opacity`, nunca animar
`width`/`left`/`right` — isso forçaria recálculo de layout a cada
frame.

---

# PARTE 11 — Redesenho visual "Console"

Decisões de DESIGN desse redesenho moram em `frontend-design.md`
("Construído — redesenho visual 'Console'"). Aqui só a parte técnica:
como cada peça foi implementada.

## Tokens de design centralizados

Todo o vocabulário visual (cor, raio, fonte) vive como CSS custom
property em `index.css`, num bloco `:root` só — nenhum componente
declara um hex de cor "solto" fora desse bloco:

```css
--void: #08090c;   --deck: #14161b;   --deck-2: #1b1e25;
--deck-line: rgba(255,255,255,0.09);
--ink: #e6e1d6;    --ink-dim: #8d8779; --ink-faint: #5b584e;
--accent: #5eead4; --good: #4ade80;   --official: #dbb15f;
--info: #7fb8de;   --danger: #ef4444;
--cifra: #16a34a;  --agenda: #2563eb; --vita: #f97316; --norte: #0891b2;
--fonte-display: 'ConsoleDisplay', ...;  --fonte-corpo: 'ConsoleCorpo', ...;
--radius-deck: 7px;
```

Cada cor semântica (`--good`, `--official`, `--info`, `--danger`) tem
uma variante `-rgb` irmã (`--good-rgb: 74,222,128`), porque `box-shadow`
com alpha variável precisa de `rgba(var(--good-rgb), 0.35)` — CSS não
deixa extrair os componentes RGB de uma cor já resolvida.

## Fontes: placeholder documentado, não gambiarra silenciosa

O par pedido pelo chefe (Chubbo Bold + Supreme Regular, via Fontshare)
não pôde ser baixado — o sandbox bloqueia `fontshare.com`. A solução foi
uma substituta **variável** e **de licença livre** por eixo tipográfico
(não por peso fixo): Fraunces (weight 100–900, tem os eixos `opsz`/
`wght`/`SOFT`) no lugar de Chubbo, Manrope (weight 200–800) no lugar de
Supreme, ambas do Google Fonts, auto-hospedadas em
`public/fonts/*.woff2` com `@font-face` de range de peso. Trocar pelos
arquivos reais depois é só substituir os dois `.woff2` — nenhum
componente referencia o nome da fonte diretamente, todos usam
`var(--fonte-display)`/`var(--fonte-corpo)`.

## Biblioteca de barras (`features/agentes/Barras.tsx`)

Cinco componentes puros de apresentação, sem chamada de API: `BarraCapsula`
(progresso contínuo 0–100), `BarraSegmentada` (N etapas discretas, cada
uma ou preenchida ou vazia), `BarraRadial` (anel SVG), `BarraIndeterminada`
(sem valor conhecido — animação de vaivém), e `Contador` (número que
"gira" um dígito, via `useRef` guardando o valor anterior e comparando a
cada render — só anima quando o valor de fato mudou, nunca no primeiro
render).

## Avatares vivos: animação do anel sem depender de `Application`

O anel do crachá (`cena.ts`) precisa animar continuamente (halo
pulsando, cometa girando) sem ter acesso direto à instância `Application`
do Pixi que só existe dentro de `Escritorio.tsx`. Solução: `Ticker.shared`
— o ticker GLOBAL do Pixi, que roda independente de qual `Application`
foi criada, com `remove()` explícito no cleanup pra nunca vazar um
ticker de uma cena já desmontada.

Cada avatar tem um `ControladorAnel` (`{ definirEstado, animar }`)
guardado num `Map<agenteId, ControladorAnel>` dentro da cena. Quando o
estado muda (`idle → falando`, etc.), `definirEstado` troca a
visibilidade/desenho de três `Graphics` sobrepostos (anel base, halo,
cometa) — nunca redesenha o crachá inteiro. `animar(deltaMS,
tempoTotalMS)` roda a cada frame só pros controladores cujo estado
precisa de movimento contínuo (halo e cometa; o anel pontilhado de
`pensando` é estático, só o padrão de traço muda).

Três bugs visuais reais encontrados testando (nenhum era bug de
lógica — o estado sempre aplicava certo, era a renderização que não
comunicava):
1. **Cometa invisível**: desenhado na MESMA cor do anel base — dois
   traços sobrepostos da mesma cor não se distinguem. Corrigido com uma
   função `clarear(cor, quantidade)` que mistura em direção ao branco
   (`canal + (255 - canal) * quantidade`), gerando uma cor mais clara
   só pro cometa.
2. **Pontilhado pouco legível**: 10 traços finos com 55% de
   preenchimento viravam quase invisíveis no tamanho real do avatar em
   jogo (a antialiasing engolia o vão). Reduzido pra 6 traços com 60%
   de preenchimento — menos traços, mais largos, lê melhor em escala
   pequena.
3. **Halo apagado demais**: o `stroke()` do halo já vinha com `alpha`
   embutido, e `animar()` TAMBÉM setava o `alpha` do objeto a cada
   frame — os dois multiplicam, então o alpha efetivo era um terço do
   pretendido. Corrigido tirando o alpha do `stroke()` e deixando só
   `animar()` controlar, com faixa maior (0.25–0.9).

## Toasts (`features/escritorio/Toasts.tsx`)

Pilha de notificação própria, empilhada acima do ícone de avançar tick
(zIndex 80 — acima até do HUD, zIndex 65, porque uma notificação nunca
pode ficar escondida atrás de um painel aberto). `useToasts()` é um hook
local a `Escritorio.tsx` (não um Context global — só um consumidor
existe hoje), com auto-dispensa por tipo (6s info/sucesso, 8s aviso, 9s
erro) e uma animação de saída (`saindo: true` por 250ms antes de
remover de fato, pra não sumir seco).

Gatilho: dentro de `aoClicarAvancar` (`Escritorio.tsx`), no `onSuccess`/
`onError` de `useAvancarMundo`. Só dispara em avanço REAL (nunca
`dry_run` — prévia não avisa nada). Cor de cada toast vem do agente que
gerou o evento (`AGENTES.find(a => a.nome === ...)`, mesmo config local
usado pra colorir o crachá), não uma cor genérica por tipo.

## Code-splitting por painel + esqueleto

Os quatro painéis de agente (`PainelDoAgente.tsx`) viraram `React.lazy`,
cada um seu próprio chunk — confirmado no build (`PainelFinanceiro`
12kB, `PainelNorte` 15kB, `PainelSaude` 25kB, `PainelAgenda` 5kB, todos
fora do bundle principal). O `Suspense` fica só em volta dos `children`
de `PainelAgente`, nunca do componente inteiro — a moldura (retrato,
nome, estado, botão de fechar) é síncrona e aparece na hora, só o
CONTEÚDO mostra o esqueleto enquanto o chunk carrega.

`EsqueletoPainel` (`features/agentes/EsqueletoPainel.tsx`) é reaproveitado
em dois lugares: o fallback do `Suspense` (chunk carregando) e o
`isLoading` de cada painel (dado ainda não chegou) — mesmo componente,
duas causas diferentes de "ainda não posso mostrar o conteúdo real".

## Som opcional (`features/escritorio/som.ts`)

Tom sintetizado via Web Audio (`OscillatorNode` + `GainNode`, envelope
curto ~300ms) em vez de um arquivo de áudio — sem asset pra carregar.
Toggle persistido em `localStorage` (mesmo padrão de `dry-run.ts`),
**desligado por padrão** — som é opcional de verdade, ninguém deveria
levar um susto de áudio sem ter pedido. `AudioContext` só é criado
dentro do handler de clique de avançar tick (nunca antes), porque
criar/tocar áudio fora de um gesto do usuário esbarra na política de
autoplay do navegador.

---

*(Este arquivo cresce conforme novas decisões técnicas do frontend
forem tomadas — não é reescrito do zero a cada atualização.)*
