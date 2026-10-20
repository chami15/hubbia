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
| Estilo (painéis) | **Tailwind CSS v4** | Iteração visual rápida fora do canvas. |
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
        cena.ts             → maquete 2D: desenha o que NÃO é mobília (piso, laje, paredes, agentes)
        camera.ts           → câmera da maquete 2D (pan/zoom/seguir) — mexe no container, a cena nem sabe
        cena3d.ts           → mundo 3D (three.js): câmera orbital, móveis, personagens e o LAÇO
        moveis3d.ts         → lote 3D (terreno, paredes que se cortam) + um modelo por categoria
        personagem3d.ts     → boneco articulado (primitivas) com pose alvo + amortecimento
        texturas3d.ts       → texturas procedurais com cache
        simulacao-sims.ts   → o motor do modo simulação (necessidade, humor, fila, autonomia)
        roteamento-sims.ts  → rota A*, colisão, encaixe nos móveis, posição de conversa
        cas-sims.ts         → dados do criador de personagem (aparência, traços)
        catalogo-jogo.ts    → o que cada peça do catálogo faz no jogo
        HudSimulacao.tsx    → HUD do modo simulação (+ InspetorAgente, hud-estilos, AvatarAgente)
        MenuRadial.tsx      → menu de opções que abre no clique
        CatalogoConstrucao.tsx / CriadorPersonagem.tsx → modo construir / personagens
        Escritorio.tsx      → ciclo de vida do canvas Pixi + laço do motor + painéis
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

# PARTE 11 — O modo simulação (mundo 3D)

Camada de jogo por cima do escritório: cada agente tem necessidades
(energia, café, foco, social, diversão; ambiente vem da sala), humor,
habilidades e relações, anda pela sala desviando de móvel (A*) e escolhe
sozinho o que fazer (autonomia). O chefe clica num móvel, colega ou ponto
do chão e escolhe uma opção no menu radial. O modo principal é o mundo
3D (three.js); a maquete 2D isométrica (PixiJS) continua montada, mesmo
escondida, porque é a dona do editor de salas.

**Nada disso vai pro backend** — é estado só do frontend, recomeça a cada
recarga (aparência e traços do criador de personagem ficam no
localStorage). O único fio com o servidor é o estado real do agente
(`idle/pensando/falando/executando`, vira modificador de humor) e o balão
que uma rodada de tick provoca.

## Quem faz o quê

- `simulacao-sims.ts` — o motor. `avancarSimulacaoSims(mundo, sala, dt)`
  é **pura**: devolve o mundo seguinte sem tocar no anterior (testável sem
  canvas). Também gera as opções do menu (`obterInteracoesDo*`); a
  autonomia escolhe da MESMA lista, filtrando `autonoma` — o agente nunca
  faz sozinho algo que o chefe não poderia mandar.
- `roteamento-sims.ts` — pegada de cada móvel, rota A* em grade de meio
  tile, encaixe (sofá tem 3 lugares, mesa tem frente e lados) e posição
  de conversa.
- `cena3d.ts` + `personagem3d.ts` + `moveis3d.ts` — desenho 3D.
- `Escritorio.tsx` — liga tudo: dono do mundo (ref), menus, painéis.

## O laço: motor dentro do requestAnimationFrame da cena 3D

O mundo mora numa **ref** no `Escritorio`. A cada quadro, a cena 3D chama
`aoQuadro(dt)`: o Escritorio avança o motor (em subpassos de até 0.1s) e
devolve o mundo novo, que a cena anima e desenha no mesmo quadro. O React
(HUD) só recebe uma "foto" a cada `INTERVALO_HUD_MS` (140ms); ação do
chefe passa por `atualizarMundo`, que muda a ref e publica na hora. Com a
maquete 2D na tela, o laço continua (o motor roda nele) mas não desenha.

Antes o motor rodava num `setInterval` de 250ms com o estado no React: o
boneco recebia posição nova 4x por segundo (andava aos trancos e
alternava entre pose de andar e de parado) e o HUD inteiro re-renderizava
a cada passo.

**Regra:** um laço só. Motor, câmera e personagens no mesmo quadro.

**Regra:** suavização por tempo, nunca por quadro. `x += (alvo - x) *
0.14` a cada quadro é o dobro mais rápido a 120Hz que a 60Hz; o certo é
`k = 1 - exp(-rigidez * dt)`. Vale pra câmera, pro amortecimento das
articulações (havia um piso de 0.08s no dt que fazia tudo 5x mais
rápido) e pro "afastar pra manter espaço pessoal" do motor.

**Regra:** nada de arredondar dentro do motor. Com passo de 1 quadro, a
queda de uma necessidade é ~0.005 — arredondar pra uma casa engolia o
decaimento inteiro. Arredondar é assunto de tela.

**Regra:** autonomia com respiro. Agente que termina uma ação espera 1–3s
antes de escolher outra; quando nada serve, espera o máximo. Sem isso a
autonomia — que testa todos os móveis e calcula encaixe — rodava a cada
quadro.

## Etiquetas sobre os personagens

Nome, humor e balão de cada personagem são DOM (HudSimulacao →
`EtiquetasDaCena`), mas a POSIÇÃO é escrita pela cena 3D, todo quadro,
direto no `style.transform` (`translate3d`, só composição). O React só
decide o conteúdo. Antes as posições iam pro estado do React a 20Hz:
re-render do Escritorio inteiro e etiqueta sempre um passo atrás.

## Memória da GPU

Geometria e material criados com `new` ficam na GPU até `dispose()`.
Móvel 3D é refeito a cada edição da sala, e roupa/cabelo do boneco a
cada troca no criador — os dois agora liberam o que tiram (`liberarObjeto`
em cena3d.ts, `esvaziarGrupo` em personagem3d.ts). Textura NUNCA é
liberada junto: vem do cache compartilhado de texturas3d.ts.

Sem `PointLight` por personagem: cada luz dinâmica pesa em todo material
e recompila shader quando o número de luzes muda (personagem novo).

## Clique × arraste

O `pointerup` da cena 3D é ouvido na janela (pra arraste que sai do
canvas), então ele só vira clique se o gesto COMEÇOU no canvas — senão um
clique num botão do HUD abria o menu do que estivesse atrás. Na 2D, quem
trata clique pergunta `camera.acabouDeArrastar()` antes de abrir menu.

Fora do modo construir, toda peça da 2D é `eventMode: 'static'` (editor,
`aplicarInteratividade`) — antes só porta era.

## Uma régua só pra "está mal"

`nivelDaNecessidade` (bom/atenção/baixo/crítico) decide a cor do
diamante, da barra do inspetor e quando o agente reclama. Cores saem da
paleta Console (`COR_NIVEL`), assim como as dos humores.

## Personagem criado × agente

Os 4 agentes existem no backend; personagem criado no criador é só do
jogo — sem painel, sem rodada. Por isso: o NOME dos 4 não é editável no
criador (é por ele que a cena é ligada ao backend), o botão "Painel" só
aparece pra eles, e o retrato de quem não tem arte é a inicial sobre a
cor (`AvatarAgente`).

## Propriedade intelectual

A mecânica (necessidade, humor, menu radial, indicador sobre a cabeça,
criador de personagem) é gênero, não dono. O que NÃO entra no código:
valores, nomes de arquivo, nomes internos ou estrutura copiados de jogo
de terceiros. Cores e números aqui são da paleta e do ajuste do próprio
projeto. (Alguns identificadores herdados — `CAS`, `Sims` — ficaram por
ora; o texto de tela já não usa.)

---

*(Este arquivo cresce conforme novas decisões técnicas do frontend
forem tomadas — não é reescrito do zero a cada atualização.)*
