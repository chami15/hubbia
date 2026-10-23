# Prédio pixel — instruções para agentes de IA

Quem trabalha aqui: leia isto inteiro (é a fonte única; o subagente `predio-pixel` só aponta para cá).

## Por que existe

O escritório isométrico exigia sprite, âncora medida e sala desenhada à mão para cada agente novo. Aqui **tudo é desenhado em código a partir de dado**:
agente novo = uma aparência (peças do personagem) + uma sala (lista de móveis). **Nenhuma imagem.** O prédio cresce conforme os agentes que o chefe escolhe.
A arte vem do habblaud (MIT). Contexto e inventário completo: `docs/estudo-habblaud.md`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `agentes.ts` | **Registro único** dos agentes: nome, `cor`, `especialidade` (ponte com o backend, `null` = conceito), `funcao`, aparência (`parts`), `icone`, `tela`. |
| `salas.ts` | **Modelos de sala** (móveis, lugares, piso, parede) em coordenadas locais + `RECEPCAO`, `COPA`, `VAGA`. |
| `predio.ts` | `montarPredio(vagas)` (puro): áreas, grade de caminhada, divisórias. E `desenharPredio(...)`: o quadro. |
| `sim.ts` | Comportamento sem DOM: A\*, pausas, elevador, status. |
| `mundo.ts` | O prédio vivo e imperativo: canvas, laço, câmera, clique. O React só cria, empurra dados e escuta cliques. |
| `relogio.ts` | Relógio de mundo que para com a aba escondida (injetável, para teste). |
| `vagas.ts` | Quem está em cada vaga (`localStorage`; é a única peça que muda quando isso for para o backend). |
| `PainelPredio.tsx` | Gerência: quem está no prédio (abrir/dispensar) e catálogo (adicionar). |
| `habblaud/` | Arte do habblaud **copiada**. Não edite (veja "Arte"). |
| `__testes__/` | `predio.test.ts` (salas alcançáveis, vagas, simulação e **regressões**) e `relogio.test.ts`. |

O status vem do backend em `features/escritorio/Escritorio.tsx::statusNoPredio` (mensagem não lida → `precisa_de_voce`; `pensando/executando` → `trabalhando`;
`falando` → `conversando`; `idle` → `ocioso`, `dormindo` de madrugada pela hora simulada do tick).

## Conceitos que todo mundo erra no começo

- `TILE = 16 px`. O canvas é 1x e o CSS amplia sem suavização (`image-rendering: pixelated`; escala inteira a partir de 2x). Nunca desenhe em escala fracionária.
- **Coordenada local** (`lx`, `ly` em tiles dentro da sala: `lx` 0..13, `ly` 0..7 a partir da primeira linha de piso) ≠ **mundo** (px). Em `salas.ts` é sempre local.
- **Âncora** = ponto dos pés. Móvel de chão: centro inferior do footprint. Item de parede: pé da face da parede. Personagem: centro dos pés.
- **Profundidade** = ordenar tudo pelo `y` da âncora. Móvel com `front` (encosto da cadeira) entra em `y + 0.5`, **por cima** de quem senta.
  Quem senta: pés `SEAT_FOOT_DY = 3` px acima da base do assento e `sortY = baseY + 0.25` (já faz `sentado()` em `predio.ts`).
- Uma sala tem 14×8 tiles e a **porta nas colunas locais 6–7**. Em cima a porta é na parede sul; embaixo, na norte. O mesmo modelo serve nos dois lados:
  deixe livres `(6..7, 0)` e `(6..7, 7)`, e não ponha item de parede sobre `lx` 6..8 se a sala pode ficar embaixo.
- Móvel `blocks: true` tira o tile da grade de caminhada; assento não bloqueia. Todo `lugar` precisa de tile alcançável: **o teste confere** (`lugaresInalcancaveis`).
- Divisória entre salas vizinhas é regra de `passagem()`, não parede desenhada: sem ela os agentes atravessavam de sala em sala.

## Receita: agente novo (e a sala dele)

1. **Aparência** em `agentes.ts`. `parts` com **todas** as 13 chaves (pele, cabelo, estilo, olhos, roupa, detalhe, estilo da roupa, parte de baixo, sapato, acessório + cor, barba)
   para a `seed` nunca decidir nada. Valores permitidos: `habblaud/shared/appearance.ts`. Cores em `#rrggbb`. **Roupa na cor do agente** (a mesma do painel/banco).
   Combinações proibidas: `cap`/`beanie` com cabelo `afro|bun|mohawk|pigtails`; `bow` com `bald|buzz`.
2. **Sala** em `salas.ts`, mobiliada pelo assunto do agente. Molde: `mesa()` para a mesa do dono + o resto. Peças e variantes válidas: `FURNITURE` em `habblaud/art/api.ts`.

```ts
// exemplo ilustrativo: a sala `lume` já existe; use o id do seu agente. Os testes passam a cobrir a sala nova sozinhos (iteram sobre `AGENTES`).
const lume = mesa(2, 2, 'gray', 'wood', 4)            // (lx, ly, cadeira, tampo, seed): cadeira de frente + mesa vista por trás
export const SALAS = { /* ... */ lume: {
  piso: 'carpet', tint: '#cdc8de', tint2: '#c2bbd5',
  parede: { base: '#f1f1fa', trim: '#4f46e5', pattern: 'wood_panel' },   // trim = cor do agente
  naParede: [m('window', 0, 0, { extra: 'janela' }), m('sign', 2.5, 0, { extra: 'placa' })],
  chao: [...lume.moveis, m('bookshelf', 8, 0, { seed: 11 }), m('armchair', 9, 4, { variant: 'right' })],
  lugares: [lume.lugar, pe(8, 1, 'up', 'read', 'Escolhendo um livro', 'book'), senta(9, 4, 'right', 'read', 'Lendo na poltrona', { held: 'book' })],
}}
```

   - Ao menos 4 lugares além da mesa. A pose combina com o móvel: balcão/máquina → `use` olhando `up`; estante → `read` com `held: 'book'`; assento → `dir` **igual à `variant`** do móvel
     (`armchair 'left'` → `dir 'left'`; `sofa 'down'` → `'down'`); bebedouro → `drink` com `held: 'water'`.
   - `extra`: `janela` (céu por hora), `quadro` (usa `quadro: Q('xx>..')`, `x` feito, `>` andando, `.` pendente), `relogio`, `tv` e `tela` (usam a `tela` do agente), `placa` (texto = nome).
   - Cada sala precisa de identidade própria: piso, parede (`pattern`) e ao menos 2 móveis que contem o domínio. Não copie a sala de outro agente trocando a cor.
3. **Backend**: se o agente existe lá, `especialidade` igual à do `seed.py`; se **não** existe, `especialidade: null` (aparece como conceito, com aviso) e a ponte fica pendente. Entrada em `INICIAIS` só se já vem no prédio de fábrica.
4. **Painel**: agente real ganha o painel em `features/agentes/PainelDoAgente.tsx`; o Motriz abre a sala de máquinas (ver `abrirAgente` em `Escritorio.tsx`).
5. **Verifique**: `npm test` (alcançável em cima **e** embaixo do corredor), depois no navegador com `/verificar-visual`: adicione o agente pelo painel do prédio e confira obra, chegada pelo elevador,
   mesa, pausas, dispensar. Olhe o PNG: sala cheia mas respirável, nada sobreposto, agente legível.
6. Documente: linha em `docs/guia-tecnico-frontend.md` PARTE 0 só se mudou arquitetura; o resto o código já diz.

## Receita: comportamento ou status novo

Status novo toca, nesta ordem: tipo `Status` e `STATUS_ROTULO` (`sim.ts`) · `decidir` · `aplicarPoseDaMesa` · `iconeDe` · `atividadeDe` · mapeamento de `telas` em `mundo.ts` ·
`statusNoPredio` (`Escritorio.tsx`) · teste em `predio.test.ts`. Tempo de pausa/ocioso são constantes no topo de `sim.ts`. Simulação sempre em passos de ≤ 50 ms (o navegador pode rodar a 2 fps).

## Arte (`habblaud/`)

- **Não edite.** É cópia MIT; o `LICENSE` precisa acompanhar. As únicas mudanças são marcadas `(hubbia)` (construtores sem *parameter property* por causa de `erasableSyntaxOnly`).
- Faltou um objeto (esteira, violão)? Antes de desenhar, veja se uma peça existente conta a história. Se for preciso: função nova em `habblaud/art/furniture/` no estilo das vizinhas
  (`floorSheet` + `ramp` para sombreamento + `b.outline()` + `contact` para a sombra), registre em `FurnitureKind`/`FURNITURE` (`art/api.ts`) e no `switch` de `furniture/index.ts`, marque `(hubbia)` e
  crie o teste que a coloca numa sala. Peça ao chefe para aprovar o visual antes de espalhar.
- **Nunca mude um `Appearance` depois de usá-lo**: a chave de cache é guardada num `WeakMap` pelo objeto e fica velha. Crie outro.
- `avatarCanvas` gera o busto do painel (`RetratoAgente`): é o mesmo personagem que anda, então os dois nunca divergem.

## Armadilhas já pagas (e o teste que guarda cada uma)

| Bug | Guarda |
|---|---|
| Agentes atravessavam a parede entre salas vizinhas (faltava `passagem()` nas divisórias) | `predio.test.ts` › "regressão: agentes atravessavam a parede…" |
| Sala que só funcionava em cima do corredor (móvel na coluna da porta de baixo) | `predio.test.ts` › "regressão: salas que só funcionavam em cima…" e o teste por sala nas duas posições |
| Aba escondida acumulava tempo e os agentes "teleportavam" ao voltar | `relogio.test.ts` › "regressão: aba escondida…". Não troque `criarRelogio` por `Date.now()` |
| `pkill -f vite` derruba o shell do agente | (ambiente) use `kill $(lsof -ti tcp:PORTA)` |
| Chromium headless a ~2 fps | (ambiente) espere 8–12 s para ver agentes andando; obra e elevador levam ~2,6 s |

**Bug novo no prédio?** Teste de regressão **antes** da correção, no mesmo arquivo, e uma linha nesta tabela. Não confie em "olhei no navegador e parece certo".
