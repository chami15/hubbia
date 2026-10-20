import { PASTA_SPRITES, type Direcao } from './sala'

// ---------------------------------------------------------------
// O CATÁLOGO
//
// As 140 peças do pack, agrupadas pra dar pra achar coisa. O
// agrupamento sai do próprio nome do arquivo (kitchen*, lounge*,
// table*, ...), que é como o pack já vem organizado — por isso é
// derivado, e não uma lista escrita na mão que sairia do ar assim que
// o pack mudasse.
// ---------------------------------------------------------------

export interface Categoria {
  id: string
  nome: string
  // prefixos do nome do arquivo que caem nesta categoria
  prefixos: string[]
}

// A ordem aqui é a ordem das abas. A primeira que casar leva a peça,
// então as mais específicas vêm antes das genéricas.
export const CATEGORIAS: Categoria[] = [
  { id: 'trabalho', nome: 'Trabalho', prefixos: ['desk', 'computer', 'laptop', 'chairDesk', 'books', 'cardboard'] },
  { id: 'assentos', nome: 'Assentos', prefixos: ['chair', 'lounge', 'stool', 'bench', 'pillow'] },
  { id: 'mesas', nome: 'Mesas', prefixos: ['table', 'sideTable'] },
  { id: 'guardar', nome: 'Guardar', prefixos: ['bookcase', 'cabinet', 'coatRack'] },
  { id: 'luz', nome: 'Luz', prefixos: ['lamp', 'ceilingFan'] },
  { id: 'verde', nome: 'Plantas', prefixos: ['plant', 'pottedPlant'] },
  { id: 'chao', nome: 'Chão', prefixos: ['rug', 'floor'] },
  { id: 'parede', nome: 'Paredes', prefixos: ['wall', 'doorway', 'paneling', 'stairs'] },
  { id: 'eletro', nome: 'Eletrônicos', prefixos: ['television', 'speaker', 'radio'] },
  { id: 'cozinha', nome: 'Cozinha', prefixos: ['kitchen', 'hood', 'toaster'] },
  { id: 'banho', nome: 'Banheiro', prefixos: ['bathroom', 'bath', 'shower', 'toilet', 'washer', 'dryer'] },
  { id: 'quarto', nome: 'Quarto', prefixos: ['bed'] },
  { id: 'outros', nome: 'Outros', prefixos: [] },
]

// Toda peça do pack. Gerada por scripts/medir-ancoras.py como efeito
// colateral (ancoras.ts tem uma entrada por peça×direção), então aqui
// só listamos os nomes — a fonte da verdade continua sendo a pasta.
export const PECAS: string[] = [
  'bathroomCabinet', 'bathroomCabinetDrawer', 'bathroomMirror', 'bathroomSink',
  'bathroomSinkSquare', 'bathtub', 'bear', 'bedBunk', 'bedDouble', 'bedSingle',
  'bench', 'benchCushion', 'benchCushionLow', 'bookcaseClosed', 'bookcaseClosedDoors',
  'bookcaseClosedWide', 'bookcaseOpen', 'bookcaseOpenLow', 'books', 'cabinetBed',
  'cabinetBedDrawer', 'cabinetBedDrawerTable', 'cabinetTelevision', 'cabinetTelevisionDoors',
  'cardboardBoxClosed', 'cardboardBoxOpen', 'ceilingFan', 'chair', 'chairCushion',
  'chairDesk', 'chairModernCushion', 'chairModernFrameCushion', 'chairRounded',
  'coatRack', 'coatRackStanding', 'computerKeyboard', 'computerMouse', 'computerScreen',
  'desk', 'deskCorner', 'doorway', 'doorwayFront', 'doorwayOpen', 'dryer',
  'floorCorner', 'floorCornerRound', 'floorFull', 'floorHalf', 'hoodLarge', 'hoodModern',
  'kitchenBar', 'kitchenBarEnd', 'kitchenBlender', 'kitchenCabinet',
  'kitchenCabinetCornerInner', 'kitchenCabinetCornerRound', 'kitchenCabinetDrawer',
  'kitchenCabinetUpper', 'kitchenCabinetUpperCorner', 'kitchenCabinetUpperDouble',
  'kitchenCabinetUpperLow', 'kitchenCoffeeMachine', 'kitchenFridge', 'kitchenFridgeBuiltIn',
  'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenMicrowave', 'kitchenSink',
  'kitchenStove', 'kitchenStoveElectric', 'lampRoundFloor', 'lampRoundTable',
  'lampSquareCeiling', 'lampSquareFloor', 'lampSquareTable', 'lampWall', 'laptop',
  'loungeChair', 'loungeChairRelax', 'loungeDesignChair', 'loungeDesignSofa',
  'loungeDesignSofaCorner', 'loungeSofa', 'loungeSofaCorner', 'loungeSofaLong',
  'loungeSofaOttoman', 'paneling', 'pillow', 'pillowBlue', 'pillowBlueLong', 'pillowLong',
  'plantSmall1', 'plantSmall2', 'plantSmall3', 'pottedPlant', 'radio', 'rugDoormat',
  'rugRectangle', 'rugRound', 'rugRounded', 'rugSquare', 'shower', 'showerRound',
  'sideTable', 'sideTableDrawers', 'speaker', 'speakerSmall', 'stairs', 'stairsCorner',
  'stairsOpen', 'stairsOpenSingle', 'stoolBar', 'stoolBarSquare', 'table', 'tableCloth',
  'tableCoffee', 'tableCoffeeGlass', 'tableCoffeeGlassSquare', 'tableCoffeeSquare',
  'tableCross', 'tableCrossCloth', 'tableGlass', 'tableRound', 'televisionAntenna',
  'televisionModern', 'televisionVintage', 'toaster', 'toilet', 'toiletSquare', 'trashcan',
  'wall', 'wallCorner', 'wallCornerRond', 'wallDoorway', 'wallDoorwayWide', 'wallHalf',
  'wallWindow', 'wallWindowSlide', 'washer', 'washerDryerStacked',
]

export function categoriaDe(peca: string): string {
  for (const c of CATEGORIAS) {
    if (c.prefixos.some((p) => peca.startsWith(p))) return c.id
  }
  return 'outros'
}

export function pecasDaCategoria(id: string): string[] {
  return PECAS.filter((p) => categoriaDe(p) === id)
}

// Só as categorias que têm peça — evita aba vazia na interface.
export function categoriasComPecas(): Categoria[] {
  return CATEGORIAS.filter((c) => pecasDaCategoria(c.id).length > 0)
}

// Nome legível: quebra o camelCase do arquivo. `kitchenFridgeLarge`
// vira "kitchen fridge large" — não é tradução, mas é o suficiente
// pra bater o olho e achar, e não exige manter 140 rótulos na mão.
export function rotuloDe(peca: string): string {
  return peca.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase()
}

// Nome em português pra TEXTO DE JOGO (menu radial, balão). Por
// prefixo, do mais específico pro mais genérico — o pack tem 140 peças,
// mas elas se agrupam em umas 40 "coisas"; variante (cor, tamanho,
// ângulo) não muda o nome. Peça fora da lista cai no `rotuloDe`.
// [prefixo, nome, gênero] — o gênero só serve pra concordar a variação
// do catálogo ("tapete redondo", "mesa redonda").
const NOMES_PT: [prefixo: string, nome: string, genero: 'm' | 'f'][] = [
  ['kitchenCoffeeMachine', 'cafeteira', 'f'],
  ['kitchenFridge', 'geladeira', 'f'],
  ['kitchenMicrowave', 'micro-ondas', 'm'],
  ['kitchenBlender', 'liquidificador', 'm'],
  ['kitchenSink', 'pia', 'f'],
  ['kitchenStove', 'fogão', 'm'],
  ['kitchenBar', 'balcão', 'm'],
  ['kitchenCabinet', 'armário', 'm'],
  ['hood', 'coifa', 'f'],
  ['computerScreen', 'monitor', 'm'],
  ['computerKeyboard', 'teclado', 'm'],
  ['computerMouse', 'mouse', 'm'],
  ['chairDesk', 'cadeira', 'f'],
  ['deskCorner', 'mesa em L', 'f'],
  ['desk', 'mesa', 'f'],
  ['laptop', 'notebook', 'm'],
  ['loungeChair', 'poltrona', 'f'],
  ['loungeDesignChair', 'poltrona', 'f'],
  ['loungeSofaOttoman', 'pufe', 'm'],
  ['loungeDesignSofa', 'sofá', 'm'],
  ['loungeSofa', 'sofá', 'm'],
  ['bookcase', 'estante', 'f'],
  ['books', 'livros', 'm'],
  ['pottedPlant', 'planta', 'f'],
  ['plant', 'planta', 'f'],
  ['lamp', 'luminária', 'f'],
  ['ceilingFan', 'ventilador', 'm'],
  ['tableCoffee', 'mesa de centro', 'f'],
  ['sideTable', 'mesinha', 'f'],
  ['table', 'mesa', 'f'],
  ['rug', 'tapete', 'm'],
  ['cabinetTelevision', 'rack da TV', 'm'],
  ['television', 'TV', 'f'],
  ['radio', 'rádio', 'm'],
  ['speaker', 'caixa de som', 'f'],
  ['coatRack', 'cabideiro', 'm'],
  ['stoolBar', 'banqueta', 'f'],
  ['bench', 'banco', 'm'],
  ['pillow', 'almofada', 'f'],
  ['chair', 'cadeira', 'f'],
  ['cardboardBox', 'caixa', 'f'],
  ['trashcan', 'lixeira', 'f'],
  ['wallDoorway', 'parede com vão', 'f'],
  ['wallWindow', 'parede com janela', 'f'],
  ['wall', 'parede', 'f'],
  ['doorway', 'porta', 'f'],
  ['toaster', 'torradeira', 'f'],
  ['cabinetBed', 'criado-mudo', 'm'],
  ['bedBunk', 'beliche', 'm'],
  ['bed', 'cama', 'f'],
  ['bathroomCabinet', 'armário de banheiro', 'm'],
  ['bathroomMirror', 'espelho', 'm'],
  ['bathroomSink', 'pia de banheiro', 'f'],
  ['bathtub', 'banheira', 'f'],
  ['shower', 'chuveiro', 'm'],
  ['toilet', 'vaso sanitário', 'm'],
  ['washerDryer', 'lava e seca', 'f'],
  ['washer', 'lavadora', 'f'],
  ['dryer', 'secadora', 'f'],
  ['stairs', 'escada', 'f'],
  ['floor', 'piso', 'm'],
  ['paneling', 'lambri', 'm'],
  ['bear', 'urso de pelúcia', 'm'],
]

export function nomeDoMovel(peca: string): string {
  return NOMES_PT.find(([prefixo]) => peca.startsWith(prefixo))?.[1] ?? rotuloDe(peca)
}

// Variação da peça (o que sobra do nome depois do prefixo) — só pro
// CATÁLOGO, onde dá pra diferenciar "mesa redonda" de "mesa de vidro".
// Par = [feminino, masculino]; string = invariável.
const VARIACOES_PT: Record<string, string | [string, string]> = {
  corner: 'de canto',
  round: ['redonda', 'redondo'],
  rounded: ['arredondada', 'arredondado'],
  rond: ['redonda', 'redondo'],
  square: ['quadrada', 'quadrado'],
  glass: 'de vidro',
  cloth: 'com toalha',
  cross: 'de base cruzada',
  large: 'grande',
  small: ['pequena', 'pequeno'],
  long: ['longa', 'longo'],
  low: ['baixa', 'baixo'],
  wide: ['larga', 'largo'],
  open: ['aberta', 'aberto'],
  closed: ['fechada', 'fechado'],
  doors: 'com portas',
  drawer: 'com gaveta',
  drawers: 'com gavetas',
  modern: ['moderna', 'moderno'],
  cushion: ['estofada', 'estofado'],
  frame: 'de armação',
  design: 'design',
  relax: ['reclinável', 'reclinável'],
  vintage: 'retrô',
  antenna: 'de antena',
  floor: 'de chão',
  table: 'de mesa',
  ceiling: 'de teto',
  wall: 'de parede',
  standing: 'de pé',
  built: ['embutida', 'embutido'],
  electric: ['elétrica', 'elétrico'],
  upper: ['aérea', 'aéreo'],
  double: ['dupla', 'duplo'],
  single: 'simples',
  inner: ['interna', 'interno'],
  doormat: 'capacho',
  rectangle: 'retangular',
  blue: 'azul',
  front: 'frontal',
  end: 'de ponta',
  full: ['inteira', 'inteiro'],
  half: 'pela metade',
  slide: 'de correr',
  stacked: '',
  1: '1',
  2: '2',
  3: '3',
}

export function nomeCompletoDoMovel(peca: string): string {
  const achado = NOMES_PT.find(([prefixo]) => peca.startsWith(prefixo))
  if (!achado) return capitalizar(rotuloDe(peca))
  const [prefixo, nome, genero] = achado
  const resto = rotuloDe(peca.slice(prefixo.length)).split(' ').filter(Boolean)
  const variacao = resto
    .map((p) => {
      const v = VARIACOES_PT[p]
      return Array.isArray(v) ? v[genero === 'f' ? 0 : 1] : v
    })
    .filter(Boolean)
  return capitalizar([nome, ...variacao].join(' '))
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// A miniatura do catálogo é o próprio PNG — são pequenos (a maior
// peça tem ~140px), então não vale gerar spritesheet nem thumbnail.
export function miniatura(peca: string, direcao: Direcao = 'NE'): string {
  return `${PASTA_SPRITES}/${peca}_${direcao}.png`
}
