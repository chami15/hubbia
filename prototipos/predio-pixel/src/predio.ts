// O prédio do hubbia: planta, móveis, grade de caminhada e desenho por quadro.
//
// A ideia veio do habblaud (cada projeto numa sala de um prédio), trocada para o nosso contexto: cada AGENTE
// tem a sua sala, mobiliada pelo assunto dele, e o térreo comum (recepção e copa) é onde eles se cruzam.
// A arte é toda do módulo copiado (./habblaud/art); aqui só se decide ONDE cada peça fica e em que ordem desenhar.
//
// Planta (tiles de 16 px; 40 x 26):
//
//   linhas 0-1    faces das paredes de cima         | recepção | Cifra  | Agenda |
//   linhas 2-9    piso das salas de cima            |   12     |   14   |   14   |
//   linha  10     parede sul com as portas
//   linhas 11-14  corredor
//   linhas 15-16  faces das paredes de baixo (com as portas)
//   linhas 17-24  piso das salas de baixo           |  copa    |  Vita  | Norte  |
//   linha  25     parede externa
import * as art from './habblaud/art/index';
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont';
import {
  FURNITURE,
  TILE,
  type Dir,
  type FloorKind,
  type FurnitureKind,
  type HeldItem,
  type Pose,
  type ScreenMode,
  type Sprite,
  type WallStyle,
} from './habblaud/art/api';
import type { AgenteId } from './agentes';

export const COLS = 40;
export const ROWS = 26;
export const W = COLS * TILE;
export const H = ROWS * TILE;

/** Pés de quem senta ficam 3 px acima da base do assento (igual ao habblaud). */
const SEAT_FOOT_DY = 3;
/** Pés de quem anda: um pouco abaixo do meio do tile, para a cabeça não "subir" na parede. */
const WALK_FOOT_DY = 11;

const ANDAR_CIMA = { face: 0, piso: 2, linhas: 8 } as const;
const ANDAR_BAIXO = { face: 15, piso: 17, linhas: 8 } as const;
const CORREDOR = { linha: 11, linhas: 4 } as const;

export type AreaId = 'recepcao' | 'copa' | AgenteId;

export interface Area {
  id: AreaId;
  nome: string;
  /** Coluna inicial e largura em tiles. */
  x0: number;
  w: number;
  andar: 'cima' | 'baixo';
  piso: FloorKind;
  tint?: string;
  tint2?: string;
  parede: WallStyle;
  /** Colunas LOCAIS da porta (para o corredor). */
  porta: [number, number];
  dono?: AgenteId;
}

export const AREAS: readonly Area[] = [
  {
    id: 'recepcao', nome: 'Recepção', x0: 0, w: 12, andar: 'cima', piso: 'marble',
    parede: { base: '#eceae6', trim: '#9aa2ae', pattern: 'marble' }, porta: [3, 9],
  },
  {
    id: 'cifra', nome: 'Sala da Cifra', x0: 12, w: 14, andar: 'cima', piso: 'carpet', tint: '#c4d6c4', tint2: '#b6cbb6',
    parede: { base: '#eef3ec', trim: '#16a34a', pattern: 'wood_panel' }, porta: [6, 8], dono: 'cifra',
  },
  {
    id: 'agenda', nome: 'Sala da Agenda', x0: 26, w: 14, andar: 'cima', piso: 'carpet', tint: '#c3cfe4', tint2: '#b6c4dc',
    parede: { base: '#eef2fa', trim: '#2563eb', pattern: 'stripes' }, porta: [6, 8], dono: 'agenda',
  },
  {
    id: 'copa', nome: 'Copa', x0: 0, w: 12, andar: 'baixo', piso: 'tile_check',
    parede: { base: '#f6f0e5', trim: '#b99f7a', pattern: 'tiles' }, porta: [4, 9],
  },
  {
    id: 'vita', nome: 'Sala da Vita', x0: 12, w: 14, andar: 'baixo', piso: 'wood',
    parede: { base: '#fbf1e8', trim: '#f97316', pattern: 'plain' }, porta: [6, 8], dono: 'vita',
  },
  {
    id: 'norte', nome: 'Sala do Norte', x0: 26, w: 14, andar: 'baixo', piso: 'carpet', tint: '#aab6bd', tint2: '#9faab2',
    parede: { base: '#e6eef1', trim: '#0891b2', pattern: 'brick' }, porta: [6, 8], dono: 'norte',
  },
];

const AREA_POR_ID = new Map(AREAS.map((a) => [a.id, a]));
export const area = (id: AreaId): Area => AREA_POR_ID.get(id) as Area;

const andarDe = (a: Area) => (a.andar === 'cima' ? ANDAR_CIMA : ANDAR_BAIXO);

/** Tile de mundo a partir do tile local da área (lx da esquerda, ly a partir da 1ª linha de piso). */
function mundo(a: Area, lx: number, ly: number): [number, number] {
  return [a.x0 + lx, andarDe(a).piso + ly];
}

/** Área em que fica um ponto de mundo (px), ou undefined no corredor. */
export function areaEm(x: number, y: number): Area | undefined {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  for (const a of AREAS) {
    const an = andarDe(a);
    if (c >= a.x0 && c < a.x0 + a.w && r >= an.face && r < an.piso + an.linhas) return a;
  }
  return undefined;
}

// ------------------------------------------------------------------ móveis

type Extra = 'janela' | 'quadro' | 'relogio' | 'tv' | 'placa' | 'tela';

interface Movel {
  kind: FurnitureKind;
  area: AreaId;
  /** Posição local (tiles); itens de parede só usam lx. */
  lx: number;
  ly: number;
  variant?: string;
  seed?: number;
  dx?: number;
  extra?: Extra;
  /** Texto da placa ou dono da tela. */
  texto?: string;
}

const M = (area: AreaId, kind: FurnitureKind, lx: number, ly: number, o: Partial<Movel> = {}): Movel => ({ kind, area, lx, ly, ...o });

/** Itens de parede (ly ignorado): ficam na face norte da área. */
const PAREDE: readonly Movel[] = [
  M('recepcao', 'elevator', 1, 0),
  M('recepcao', 'elevator', 4, 0),
  M('recepcao', 'sign', 7.5, 0, { extra: 'placa', texto: 'hubbia' }),
  M('recepcao', 'clock', 10.75, 0, { extra: 'relogio' }),

  M('cifra', 'window', 0, 0, { extra: 'janela' }),
  M('cifra', 'tv', 2.5, 0, { extra: 'tv', texto: 'cifra' }),
  M('cifra', 'sign', 5.5, 0, { extra: 'placa', texto: 'cifra' }),
  M('cifra', 'whiteboard', 9, 0, { extra: 'quadro', texto: 'cifra' }),
  M('cifra', 'clock', 12.5, 0, { extra: 'relogio' }),

  M('agenda', 'window', 0, 0, { extra: 'janela' }),
  M('agenda', 'clock', 3, 0, { extra: 'relogio' }),
  M('agenda', 'sign', 5.5, 0, { extra: 'placa', texto: 'agenda' }),
  M('agenda', 'whiteboard', 9, 0, { extra: 'quadro', texto: 'agenda' }),
  M('agenda', 'window', 12, 0, { extra: 'janela' }),

  M('copa', 'shelf_wall', 0.5, 0, { seed: 2 }),
  M('copa', 'window', 9.5, 0, { extra: 'janela' }),

  M('vita', 'mirror', 1, 0),
  M('vita', 'painting', 2.5, 0, { seed: 3 }),
  M('vita', 'sign', 9, 0, { extra: 'placa', texto: 'vita' }),
  M('vita', 'tv', 11.75, 0, { extra: 'tv', texto: 'vita' }),

  M('norte', 'whiteboard', 1, 0, { extra: 'quadro', texto: 'norte' }),
  M('norte', 'poster', 4.5, 0, { variant: 'ship_it' }),
  M('norte', 'sign', 9, 0, { extra: 'placa', texto: 'norte' }),
  M('norte', 'poster', 12, 0, { variant: 'bug' }),
  M('norte', 'clock', 13, 0, { extra: 'relogio' }),
];

/** Móveis de chão (lx, ly locais). Cada sala tem a mesa do dono: office_chair_front + desk_back (rosto visível). */
const CHAO: readonly Movel[] = [
  // Recepção
  M('recepcao', 'plant_tall', 0, 0, { variant: 'ficus' }),
  M('recepcao', 'plant_tall', 11, 0, { variant: 'palm' }),
  M('recepcao', 'reception_desk', 7, 2, { seed: 1 }),
  M('recepcao', 'bench', 0, 5),
  M('recepcao', 'plant_small', 0, 7, { variant: 'flower' }),
  M('recepcao', 'plant_small', 11, 7, { variant: 'succulent' }),

  // Cifra — financeiro: arquivos, pastas, impressora, segunda mesa com planilha
  M('cifra', 'bookshelf', 0, 0, { seed: 3 }),
  M('cifra', 'office_chair_front', 5, 1, { variant: 'green', dx: TILE / 2 }),
  M('cifra', 'desk_back', 5, 2, { variant: 'dark', seed: 1 }),
  M('cifra', 'trash_bin', 7, 2),
  M('cifra', 'filing_cabinet', 12, 0),
  M('cifra', 'binder_shelf', 13, 0, { seed: 2 }),
  M('cifra', 'binder_shelf', 13, 1, { seed: 5 }),
  M('cifra', 'printer', 0, 4),
  M('cifra', 'desk', 9, 4, { variant: 'dark', seed: 4, extra: 'tela', texto: 'cifra' }),
  M('cifra', 'office_chair', 9, 5, { variant: 'green', dx: TILE / 2 }),
  M('cifra', 'armchair', 12, 4, { variant: 'left' }),
  M('cifra', 'plant_tall', 13, 7, { variant: 'monstera' }),
  M('cifra', 'plant_small', 0, 7, { variant: 'fern' }),

  // Agenda — compromissos: cantinho de conversa, janelas, relógio
  M('agenda', 'plant_tall', 0, 0, { variant: 'bonsai' }),
  M('agenda', 'office_chair_front', 5, 1, { variant: 'blue', dx: TILE / 2 }),
  M('agenda', 'desk_back', 5, 2, { variant: 'white', seed: 2 }),
  M('agenda', 'bookshelf', 10, 0, { seed: 7 }),
  M('agenda', 'floor_lamp', 13, 0),
  M('agenda', 'armchair', 1, 4, { variant: 'right' }),
  M('agenda', 'coffee_table', 2, 4, { seed: 2 }),
  M('agenda', 'armchair', 4, 4, { variant: 'left' }),
  M('agenda', 'sofa', 10, 5, { variant: 'down' }),
  M('agenda', 'plant_small', 0, 7, { variant: 'flower' }),
  M('agenda', 'plant_small', 13, 7, { variant: 'fern' }),

  // Copa — comum a todos
  M('copa', 'fridge', 0, 0),
  M('copa', 'coffee_machine', 1, 0),
  M('copa', 'counter_sink', 2, 0),
  M('copa', 'counter', 3, 0, { variant: 'drawers' }),
  M('copa', 'vending_machine', 11, 0),
  M('copa', 'cafe_table', 2, 3),
  M('copa', 'cafe_chair', 1, 3, { variant: 'right' }),
  M('copa', 'cafe_chair', 3, 3, { variant: 'left' }),
  M('copa', 'arcade', 11, 3),
  M('copa', 'sofa', 7, 6, { variant: 'down' }),
  M('copa', 'coffee_table', 7, 7, { seed: 1 }),
  M('copa', 'plant_tall', 0, 7, { variant: 'palm' }),
  M('copa', 'plant_small', 11, 7, { variant: 'succulent' }),

  // Vita — saúde: bebedouro, puffs no tapete, plantas, espelho
  M('vita', 'water_cooler', 0, 0),
  M('vita', 'plant_small', 4, 0, { variant: 'succulent' }),
  M('vita', 'office_chair_front', 10, 2, { variant: 'red', dx: TILE / 2 }),
  M('vita', 'desk_back', 10, 3, { variant: 'wood', seed: 3 }),
  M('vita', 'beanbag', 2, 5, { variant: 'yellow' }),
  M('vita', 'beanbag', 4, 5, { variant: 'red' }),
  M('vita', 'fridge', 13, 4),
  M('vita', 'plant_tall', 13, 0, { variant: 'monstera' }),
  M('vita', 'plant_tall', 0, 7, { variant: 'ficus' }),
  M('vita', 'plant_small', 13, 7, { variant: 'flower' }),
  M('vita', 'plant_small', 8, 7, { variant: 'fern' }),

  // Norte — projetos: ilha de mesas, mesa de reunião, fliperama (a semente da "sala de programação")
  M('norte', 'plant_tall', 0, 0, { variant: 'palm' }),
  M('norte', 'office_chair_front', 2, 2, { variant: 'black', dx: TILE / 2 }),
  M('norte', 'desk_back', 2, 3, { variant: 'dark', seed: 6 }),
  M('norte', 'desk', 2, 4, { variant: 'dark', seed: 8, extra: 'tela', texto: 'norte' }),
  M('norte', 'office_chair', 2, 5, { variant: 'black', dx: TILE / 2 }),
  M('norte', 'trash_bin', 4, 3),
  M('norte', 'meeting_table', 9, 3, { seed: 2 }),
  M('norte', 'stool', 9, 2),
  M('norte', 'stool', 11, 2),
  M('norte', 'stool', 9, 5),
  M('norte', 'stool', 11, 5),
  M('norte', 'arcade', 13, 3),
  M('norte', 'bookshelf', 12, 0, { seed: 9 }),
  M('norte', 'plant_small', 0, 7, { variant: 'fern' }),
];

/** Âncora de mundo (px) de um móvel: centro inferior do footprint (chão) ou do trecho de parede. */
function ancora(m: Movel): { x: number; y: number } {
  const a = area(m.area);
  const def = FURNITURE[m.kind];
  if (def.mount === 'wall') return { x: (a.x0 + m.lx) * TILE + (def.footprint.w * TILE) / 2, y: andarDe(a).piso * TILE };
  const [c, r] = mundo(a, m.lx, m.ly);
  return { x: c * TILE + (def.footprint.w * TILE) / 2 + (m.dx ?? 0), y: (r + def.footprint.h) * TILE };
}

// ------------------------------------------------------------------ lugares (onde um agente pode ficar)

export interface Lugar {
  id: string;
  area: AreaId;
  /** Tile de mundo para onde o caminho leva. */
  tile: [number, number];
  /** Pés (px de mundo) quando chega. */
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  held?: HeldItem;
  seated?: boolean;
  /** Ordem de profundidade (assentos: logo depois do assento, antes do encosto). */
  sortY: number;
  /** A mesa de trabalho do dono da sala. */
  mesa?: AgenteId;
  /** Só o dono da sala usa (fora a copa e a recepção, que são de todos). */
  soDoDono?: boolean;
  rotulo: string;
}

function emPe(areaId: AreaId, lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, held?: HeldItem): Lugar {
  const a = area(areaId);
  const [c, r] = mundo(a, lx, ly);
  const y = r * TILE + WALK_FOOT_DY;
  return { id: `${areaId}:${lx},${ly}:${pose}`, area: areaId, tile: [c, r], x: c * TILE + 8, y, dir, pose, held, sortY: y, soDoDono: !!a.dono, rotulo };
}

/** Assento: pés sobre o assento (o x vem da âncora do móvel, que já considera o dx). */
function sentado(areaId: AreaId, lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, o: { held?: HeldItem; dx?: number; mesa?: AgenteId } = {}): Lugar {
  const a = area(areaId);
  const [c, r] = mundo(a, lx, ly);
  const baseY = (r + 1) * TILE;
  return {
    id: `${areaId}:${lx},${ly}:${o.dx ?? 0}`,
    area: areaId,
    tile: [c, r],
    x: c * TILE + 8 + (o.dx ?? 0),
    y: baseY - SEAT_FOOT_DY,
    dir,
    pose,
    held: o.held,
    seated: true,
    sortY: baseY + 0.25,
    mesa: o.mesa,
    soDoDono: !!a.dono,
    rotulo,
  };
}

export const LUGARES: readonly Lugar[] = [
  // Mesas (a pose muda com o status; a daqui é a de trabalho)
  sentado('cifra', 5, 1, 'down', 'type', 'Na mesa', { dx: TILE / 2, mesa: 'cifra' }),
  sentado('agenda', 5, 1, 'down', 'type', 'Na mesa', { dx: TILE / 2, mesa: 'agenda' }),
  sentado('vita', 10, 2, 'down', 'type', 'Na mesa', { dx: TILE / 2, mesa: 'vita' }),
  sentado('norte', 2, 2, 'down', 'type', 'Na mesa', { dx: TILE / 2, mesa: 'norte' }),

  // Cifra
  emPe('cifra', 1, 1, 'up', 'read', 'Consultando a estante', 'book'),
  emPe('cifra', 0, 5, 'up', 'use', 'Imprimindo o relatório', 'papers'),
  emPe('cifra', 12, 1, 'up', 'use', 'Arquivando extratos'),
  sentado('cifra', 12, 4, 'left', 'read', 'Revisando gastos na poltrona', { held: 'papers' }),

  // Agenda
  sentado('agenda', 1, 4, 'right', 'talk', 'Ao telefone', { held: 'phone' }),
  sentado('agenda', 4, 4, 'left', 'read', 'Lendo a pauta', { held: 'papers' }),
  emPe('agenda', 10, 1, 'up', 'read', 'Procurando um contato', 'book'),
  emPe('agenda', 1, 1, 'up', 'drink', 'Olhando a janela', 'coffee'),
  sentado('agenda', 11, 5, 'down', 'sit', 'No sofá', { dx: 0 }),

  // Vita
  emPe('vita', 0, 1, 'up', 'drink', 'No bebedouro', 'water'),
  emPe('vita', 1, 1, 'up', 'groom', 'No espelho', 'comb'),
  emPe('vita', 3, 3, 'down', 'stretch', 'Se alongando'),
  sentado('vita', 2, 5, 'down', 'read', 'No puff', { held: 'book' }),
  sentado('vita', 4, 5, 'down', 'sit', 'Descansando no puff'),
  emPe('vita', 13, 5, 'up', 'use', 'Pegando uma fruta'),

  // Norte
  emPe('norte', 2, 0, 'up', 'use', 'No quadro do projeto'),
  sentado('norte', 9, 2, 'down', 'talk', 'Planejando na mesa de reunião', { held: 'laptop' }),
  sentado('norte', 11, 5, 'up', 'read', 'Lendo um PR', { held: 'papers' }),
  emPe('norte', 13, 4, 'up', 'game', 'No fliperama', 'controller'),
  emPe('norte', 12, 1, 'up', 'read', 'Na estante', 'book'),

  // Copa (todos)
  emPe('copa', 1, 1, 'up', 'use', 'Tirando um café'),
  emPe('copa', 11, 1, 'up', 'use', 'Na máquina de lanches'),
  emPe('copa', 0, 1, 'up', 'use', 'Abrindo a geladeira'),
  sentado('copa', 1, 3, 'right', 'drink', 'Café na mesinha', { held: 'coffee' }),
  sentado('copa', 3, 3, 'left', 'drink', 'Café na mesinha', { held: 'coffee' }),
  emPe('copa', 11, 4, 'up', 'game', 'No fliperama', 'controller'),
  sentado('copa', 7, 6, 'down', 'laugh', 'Batendo papo no sofá', { dx: 4 }),
  sentado('copa', 9, 6, 'down', 'talk', 'Batendo papo no sofá', { dx: -4, held: 'coffee' }),

  // Recepção (todos)
  sentado('recepcao', 0, 5, 'down', 'sit', 'No banco da recepção', { dx: 4 }),
  emPe('recepcao', 8, 3, 'up', 'talk', 'Conversando na recepção'),
];

export const mesaDe = (id: AgenteId): Lugar => LUGARES.find((l) => l.mesa === id) as Lugar;

/** Onde os agentes aparecem: na frente dos elevadores. */
export const SAIDA_ELEVADOR: readonly [number, number][] = [
  [2, ANDAR_CIMA.piso],
  [5, ANDAR_CIMA.piso],
];

// ------------------------------------------------------------------ grade de caminhada

/** true = dá para andar. Piso das áreas, corredor e vãos das portas; móveis que bloqueiam tiram o tile. */
export const andavel: boolean[][] = (() => {
  const g = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (const a of AREAS) {
    const an = andarDe(a);
    for (let r = an.piso; r < an.piso + an.linhas; r++) for (let c = a.x0; c < a.x0 + a.w; c++) g[r][c] = true;
    const [p0, p1] = a.porta;
    if (a.andar === 'cima') for (let c = a.x0 + p0; c < a.x0 + p1; c++) g[an.piso + an.linhas][c] = true;
    else for (let r = an.face; r < an.piso; r++) for (let c = a.x0 + p0; c < a.x0 + p1; c++) g[r][c] = true;
  }
  for (let r = CORREDOR.linha; r < CORREDOR.linha + CORREDOR.linhas; r++) for (let c = 0; c < COLS; c++) g[r][c] = true;
  for (const m of CHAO) {
    const def = FURNITURE[m.kind];
    if (!def.blocks) continue;
    const [c0, r0] = mundo(area(m.area), m.lx, m.ly);
    for (let r = r0; r < r0 + def.footprint.h; r++) for (let c = c0; c < c0 + def.footprint.w; c++) g[r][c] = false;
  }
  return g;
})();

/**
 * Divisórias entre áreas vizinhas do mesmo andar: os tiles dos dois lados são andáveis, mas não se passa de um para
 * o outro (só pelas portas e pelo corredor). Chave: "coluna da direita,linha".
 */
const divisorias: Set<string> = (() => {
  const s = new Set<string>();
  for (const a of AREAS) {
    if (a.x0 === 0) continue;
    const an = andarDe(a);
    for (let r = an.face; r <= an.piso + an.linhas; r++) s.add(`${a.x0},${r}`);
  }
  return s;
})();

/** Dá para ir do tile (c1, r1) ao vizinho (c2, r2) sem atravessar uma divisória? */
export function passagem(c1: number, r1: number, c2: number, r2: number): boolean {
  if (r1 !== r2) return true;
  return !divisorias.has(`${Math.max(c1, c2)},${r1}`);
}

/** Centro de um tile, na altura dos pés de quem anda. */
export const pesNoTile = (c: number, r: number): [number, number] => [c * TILE + 8, r * TILE + WALK_FOOT_DY];

// ------------------------------------------------------------------ desenho

/** Um personagem pronto para o quadro, já resolvido pela simulação. */
export interface Figura {
  id: AgenteId;
  x: number;
  y: number;
  sortY: number;
  dir: Dir;
  pose: Pose;
  frame: number;
  held?: HeldItem;
  seated?: boolean;
  appearance: ReturnType<typeof art.appearanceFromSeed>;
}

/** Estado do mundo que muda o desenho dos móveis (telas, quadro, luz, elevador). */
export interface EstadoCena {
  t: number;
  hora: number;
  agora: Date;
  /** Tela de cada sala: o que o dono está fazendo nela. */
  telas: Partial<Record<AreaId, ScreenMode>>;
  /** Luz de cada área, de 0 (apagada) a 1 (acesa). */
  luz: Record<AreaId, number>;
  /** Estado da porta de cada elevador (0 fechada ... 4 aberta). */
  elevadores: [number, number];
}

type Item = { y: number; draw: () => void };

function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number): void {
  ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
}

/** Itens do quadro branco de cada sala (o que o habblaud usa para as tarefas do agente). */
const QUADROS: Record<string, { status: 'pending' | 'in_progress' | 'completed' }[]> = {
  cifra: [{ status: 'completed' }, { status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }],
  agenda: [{ status: 'completed' }, { status: 'in_progress' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }],
  norte: [{ status: 'completed' }, { status: 'completed' }, { status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }],
};

let semente = 0;
const elevadorIdx = (m: Movel) => (m.lx < 3 ? 0 : 1);

function desenharParede(ctx: CanvasRenderingContext2D, m: Movel, e: EstadoCena): void {
  const state = m.kind === 'elevator' ? e.elevadores[elevadorIdx(m)] : 0;
  const sp = art.furnitureSprites(m.kind, m.variant, state, { seed: m.seed }).base;
  const { x, y } = ancora(m);
  const ox = x - sp.ax;
  const oy = y - sp.ay;
  const r = sp.rects;
  if (m.extra === 'janela' && r?.glass) art.drawWindowView(ctx, { x: ox + r.glass.x, y: oy + r.glass.y, w: r.glass.w, h: r.glass.h }, e.hora, e.t, m.lx | 0);
  blit(ctx, sp, x, y);
  if (m.extra === 'quadro' && r?.board) art.drawBoard(ctx, { x: ox + r.board.x, y: oy + r.board.y, ...wh(r.board) }, QUADROS[m.texto ?? ''] ?? [], e.t);
  if (m.extra === 'relogio' && r?.face) art.drawClock(ctx, { x: ox + r.face.x, y: oy + r.face.y, ...wh(r.face) }, e.agora);
  if (m.extra === 'tv' && r?.tv) art.drawScreen(ctx, { x: ox + r.tv.x, y: oy + r.tv.y, ...wh(r.tv) }, e.telas[m.area] ?? 'off', e.t, 7);
  if (m.extra === 'placa' && r?.sign && m.texto) {
    const tw = pixelTextWidth(m.texto);
    pixelText(ctx, m.texto, Math.round(ox + r.sign.x + (r.sign.w - tw) / 2), Math.round(oy + r.sign.y + (r.sign.h - 5) / 2), '#2b3142');
  }
}

const wh = (r: { w: number; h: number }) => ({ w: r.w, h: r.h });

function telaDaMesa(m: Movel, e: EstadoCena): ScreenMode {
  const modo = e.telas[m.area];
  if (!modo || modo === 'off') return 'off';
  // A segunda mesa mostra outra coisa que a TV: planilha na Cifra, terminal no Norte.
  if (modo === 'standby') return 'standby';
  return m.area === 'norte' ? 'terminal' : 'docs';
}

/**
 * Desenha o prédio inteiro em `ctx` (resolução 1x; quem amplia é o CSS). Ordem: pisos, faces das paredes com
 * os itens de parede, tudo que tem profundidade (móveis, encostos, pessoas, parede sul) ordenado pelo y, luz de
 * cada sala, divisórias e parede externa por cima.
 */
export function desenharPredio(ctx: CanvasRenderingContext2D, e: EstadoCena, figuras: readonly Figura[], extra: (ctx: CanvasRenderingContext2D) => void): void {
  semente = 0;
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, W, H);

  // Pisos (as portas levam o piso da sala até o vão).
  art.drawFloor(ctx, 'concrete', 0, CORREDOR.linha * TILE, W, CORREDOR.linhas * TILE, { seed: 9 });
  for (const a of AREAS) {
    const an = andarDe(a);
    const o = { seed: ++semente, tint: a.tint, tint2: a.tint2 };
    art.drawFloor(ctx, a.piso, a.x0 * TILE, an.piso * TILE, a.w * TILE, an.linhas * TILE, o);
    const [p0, p1] = a.porta;
    if (a.andar === 'cima') art.drawFloor(ctx, a.piso, (a.x0 + p0) * TILE, (an.piso + an.linhas) * TILE, (p1 - p0) * TILE, TILE, o);
    else art.drawFloor(ctx, a.piso, (a.x0 + p0) * TILE, an.face * TILE, (p1 - p0) * TILE, (an.piso - an.face) * TILE, o);
  }
  art.drawRug(ctx, (12 + 1) * TILE, (17 + 4) * TILE + 4, 5 * TILE, 3 * TILE - 8, '#f2a46b', 4);
  art.drawRug(ctx, 3 * TILE, (2 + 4) * TILE, 6 * TILE, 3 * TILE, '#5f9e96', 2);
  art.drawRug(ctx, (26 + 1) * TILE, (2 + 3) * TILE + 6, 4 * TILE, 3 * TILE - 6, '#7d9ad6', 6);

  // Faces das paredes: em cima sem passagem (a porta é na parede sul); embaixo com o vão da porta.
  for (const a of AREAS) {
    const an = andarDe(a);
    const doorways = a.andar === 'baixo' ? [{ x: (a.x0 + a.porta[0]) * TILE, w: (a.porta[1] - a.porta[0]) * TILE }] : [];
    art.drawWallFace(ctx, a.x0 * TILE, an.face * TILE, a.w * TILE, a.parede, { doorways });
  }
  for (const m of PAREDE) desenharParede(ctx, m, e);

  // Profundidade.
  const itens: Item[] = [];
  for (const m of CHAO) {
    const f = art.furnitureSprites(m.kind, m.variant, m.kind === 'coffee_machine' ? Math.floor(e.t / 2500) % 2 : 0, { seed: m.seed });
    const { x, y } = ancora(m);
    itens.push({
      y,
      draw: () => {
        blit(ctx, f.base, x, y);
        const r = f.base.rects?.screen;
        if (m.extra === 'tela' && r) art.drawScreen(ctx, { x: x - f.base.ax + r.x, y: y - f.base.ay + r.y, w: r.w, h: r.h }, telaDaMesa(m, e), e.t, 11);
      },
    });
    if (f.front) {
      const front = f.front;
      itens.push({ y: y + 0.5, draw: () => blit(ctx, front, x, y) });
    }
  }
  for (const fg of figuras) {
    itens.push({
      y: fg.sortY,
      draw: () => blit(ctx, art.characterSprite({ appearance: fg.appearance, dir: fg.dir, pose: fg.pose, frame: fg.frame, held: fg.held, seated: fg.seated }), fg.x, fg.y),
    });
  }
  // Parede sul do andar de cima (com as portas), na profundidade dela.
  const sulY = (ANDAR_CIMA.piso + ANDAR_CIMA.linhas) * TILE;
  for (const a of AREAS.filter((x) => x.andar === 'cima')) {
    itens.push({
      y: sulY + TILE,
      draw: () => art.drawSouthWall(ctx, a.x0 * TILE, sulY, a.w * TILE, a.parede, { doorways: [{ x: (a.x0 + a.porta[0]) * TILE, w: (a.porta[1] - a.porta[0]) * TILE }] }),
    });
  }
  itens.sort((a, b) => a.y - b.y);
  for (const it of itens) it.draw();

  // Luz: sala vazia fica na penumbra (no habblaud a luz apaga quando o último sai).
  for (const a of AREAS) {
    const apagado = 1 - e.luz[a.id];
    if (apagado <= 0.01) continue;
    const an = andarDe(a);
    ctx.fillStyle = `rgba(16, 20, 40, ${(0.38 * apagado).toFixed(3)})`;
    ctx.fillRect(a.x0 * TILE, an.face * TILE, a.w * TILE, (an.piso + an.linhas - an.face) * TILE);
  }

  // Divisórias entre as áreas e as bordas do prédio.
  for (const a of AREAS) {
    const an = andarDe(a);
    const y0 = an.face * TILE;
    const h = (a.andar === 'cima' ? an.piso + an.linhas + 1 : an.piso + an.linhas) * TILE - y0;
    if (a.x0 > 0) art.drawWallTop(ctx, a.x0 * TILE - 2, y0, 4, h, a.parede);
  }
  art.drawWallTop(ctx, 0, 0, 3, H, AREAS[0].parede);
  art.drawWallTop(ctx, W - 3, 0, 3, H, AREAS[2].parede);
  art.drawSouthWall(ctx, 0, (ROWS - 1) * TILE, W, { base: '#cfd3da', trim: '#8a919c', pattern: 'brick', exterior: true });

  noite(ctx, e.hora);
  extra(ctx);
}

/** Céu do dia sobre o prédio: azul-escuro à noite, alaranjado no fim da tarde, nada de dia. */
function noite(ctx: CanvasRenderingContext2D, hora: number): void {
  const h = ((hora % 24) + 24) % 24;
  let a = 0;
  let cor = '20, 26, 70';
  if (h < 5.5 || h >= 20) a = 0.42;
  else if (h < 7.5) a = 0.42 * (1 - (h - 5.5) / 2);
  else if (h >= 17.5) {
    const u = (h - 17.5) / 2.5;
    a = u < 0.5 ? 0.16 * (u / 0.5) : 0.16 + 0.26 * ((u - 0.5) / 0.5);
    cor = u < 0.5 ? '160, 80, 40' : '20, 26, 70';
  }
  if (a <= 0) return;
  ctx.fillStyle = `rgba(${cor}, ${a.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}
