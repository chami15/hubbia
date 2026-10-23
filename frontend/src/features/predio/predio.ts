// O prédio do hubbia, montado a partir dos agentes que a pessoa escolheu.
//
// A ideia veio do habblaud (cada projeto numa sala de um prédio), trocada para o nosso contexto: cada AGENTE tem a
// sua sala (modelo em salas.ts) e o térreo comum (recepção e copa) fica fixo à esquerda. As salas entram em VAGAS,
// duas por coluna (uma acima e uma abaixo do corredor); quando as vagas acabam, o prédio ganha mais uma coluna à
// direita. As colunas só crescem para a direita: assim ninguém muda de lugar quando chega um agente novo.
//
//   linhas 0-1    faces das paredes de cima          | recepção | vaga 0 | vaga 2 | ...
//   linhas 2-9    piso das salas de cima
//   linha  10     parede sul com as portas
//   linhas 11-14  corredor
//   linhas 15-16  faces das paredes de baixo (com as portas)
//   linhas 17-24  piso das salas de baixo            |  copa    | vaga 1 | vaga 3 | ...
//   linha  25     parede externa
import * as art from './habblaud/art/index';
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont';
import { FURNITURE, TILE, type Dir, type HeldItem, type Pose, type ScreenMode, type Sprite } from './habblaud/art/api';
import { agentePorId, type AgenteId } from './agentes';
import { COPA, RECEPCAO, SALAS, VAGA, type ModeloSala, type MovelModelo } from './salas';

export const ROWS = 26;
export const H = ROWS * TILE;
const CORE_W = 12;
const SALA_W = 14;
/** No máximo 8 salas de agente (4 colunas). */
export const MAX_VAGAS = 8;
/** Duração da obra e da desmontagem (as do habblaud). */
export const OBRA_MS = 2600;
export const DESMONTE_MS = 2200;

const SEAT_FOOT_DY = 3;
const WALK_FOOT_DY = 11;

const ANDAR_CIMA = { face: 0, piso: 2, linhas: 8 } as const;
const ANDAR_BAIXO = { face: 15, piso: 17, linhas: 8 } as const;
const CORREDOR = { linha: 11, linhas: 4 } as const;

export type AreaId = string;

export interface Area {
  id: AreaId;
  x0: number;
  w: number;
  andar: 'cima' | 'baixo';
  modelo: ModeloSala;
  /** Colunas LOCAIS da porta. */
  porta: [number, number];
  dono?: AgenteId;
  /** Índice da vaga (salas de agente e vagas livres). */
  vaga?: number;
  livre?: boolean;
  /** Texto da placa. */
  placa?: string;
}

/** Um móvel já posicionado no mundo. */
export interface Movel extends MovelModelo {
  area: Area;
  /** Ordem na obra (os móveis aparecem um a um). */
  ordem: number;
}

export interface Lugar {
  id: string;
  area: AreaId;
  tile: [number, number];
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  held?: HeldItem;
  seated?: boolean;
  sortY: number;
  mesa?: AgenteId;
  rotulo: string;
}

export interface Predio {
  cols: number;
  W: number;
  areas: Area[];
  naParede: Movel[];
  chao: Movel[];
  lugares: Lugar[];
  andavel: boolean[][];
  divisorias: Set<string>;
}

const andarDe = (a: Area) => (a.andar === 'cima' ? ANDAR_CIMA : ANDAR_BAIXO);
const mundo = (a: Area, lx: number, ly: number): [number, number] => [a.x0 + lx, andarDe(a).piso + ly];

/** Pés no centro de um tile (altura de quem anda). */
export const pesNoTile = (c: number, r: number): [number, number] => [c * TILE + 8, r * TILE + WALK_FOOT_DY];

/** Onde os agentes aparecem: na frente dos elevadores da recepção. */
export const SAIDA_ELEVADOR: readonly [number, number][] = [
  [2, ANDAR_CIMA.piso],
  [5, ANDAR_CIMA.piso],
];

/** Coluna inicial e andar de uma vaga. */
export function posicaoDaVaga(i: number): { x0: number; andar: 'cima' | 'baixo' } {
  return { x0: CORE_W + Math.floor(i / 2) * SALA_W, andar: i % 2 === 0 ? 'cima' : 'baixo' };
}

/**
 * Monta o prédio para as vagas dadas (`vagas[i]` = id do agente ou null). Puro: o mesmo `vagas` dá o mesmo prédio,
 * então dá para remontar a cada mudança sem perder nada (lugares e móveis têm ids estáveis).
 */
export function montarPredio(vagas: readonly (AgenteId | null)[]): Predio {
  const nCols = Math.max(2, Math.ceil(vagas.length / 2));
  const cols = CORE_W + nCols * SALA_W;
  const areas: Area[] = [
    { id: 'recepcao', x0: 0, w: CORE_W, andar: 'cima', modelo: RECEPCAO, porta: [3, 9], placa: 'hubbia' },
    { id: 'copa', x0: 0, w: CORE_W, andar: 'baixo', modelo: COPA, porta: [4, 9] },
  ];
  for (let i = 0; i < nCols * 2; i++) {
    const { x0, andar } = posicaoDaVaga(i);
    const dono = vagas[i] ?? null;
    if (dono) areas.push({ id: dono, x0, w: SALA_W, andar, modelo: SALAS[dono], porta: [6, 8], dono, vaga: i, placa: (agentePorId(dono)?.nome ?? dono).toLowerCase() });
    else areas.push({ id: `vaga-${i}`, x0, w: SALA_W, andar, modelo: VAGA, porta: [6, 8], vaga: i, livre: true, placa: 'vaga' });
  }

  const naParede: Movel[] = [];
  const chao: Movel[] = [];
  const lugares: Lugar[] = [];
  for (const a of areas) {
    a.modelo.chao.forEach((mm, i) => chao.push({ ...mm, area: a, ordem: i }));
    a.modelo.naParede.forEach((mm, i) => naParede.push({ ...mm, area: a, ordem: i }));
    for (const l of a.modelo.lugares) {
      const [c, r] = mundo(a, l.lx, l.ly);
      if (l.sentado) {
        const baseY = (r + 1) * TILE;
        lugares.push({
          id: `${a.id}:${l.lx},${l.ly}:${l.dx ?? 0}`, area: a.id, tile: [c, r], x: c * TILE + 8 + (l.dx ?? 0), y: baseY - SEAT_FOOT_DY,
          dir: l.dir, pose: l.pose, held: l.held, seated: true, sortY: baseY + 0.25, mesa: l.mesa ? a.dono : undefined, rotulo: l.rotulo,
        });
      } else {
        const y = r * TILE + WALK_FOOT_DY;
        lugares.push({ id: `${a.id}:${l.lx},${l.ly}:${l.pose}`, area: a.id, tile: [c, r], x: c * TILE + 8, y, dir: l.dir, pose: l.pose, held: l.held, sortY: y, rotulo: l.rotulo });
      }
    }
  }

  // Grade de caminhada: piso das áreas, corredor e vãos das portas; vaga livre fica fechada; móveis tiram tiles.
  const andavel = Array.from({ length: ROWS }, () => Array<boolean>(cols).fill(false));
  for (const a of areas) {
    if (a.livre) continue;
    const an = andarDe(a);
    for (let r = an.piso; r < an.piso + an.linhas; r++) for (let c = a.x0; c < a.x0 + a.w; c++) andavel[r][c] = true;
    const [p0, p1] = a.porta;
    if (a.andar === 'cima') for (let c = a.x0 + p0; c < a.x0 + p1; c++) andavel[an.piso + an.linhas][c] = true;
    else for (let r = an.face; r < an.piso; r++) for (let c = a.x0 + p0; c < a.x0 + p1; c++) andavel[r][c] = true;
  }
  for (let r = CORREDOR.linha; r < CORREDOR.linha + CORREDOR.linhas; r++) for (let c = 0; c < cols; c++) andavel[r][c] = true;
  for (const mv of chao) {
    const def = FURNITURE[mv.kind];
    if (!def.blocks) continue;
    const [c0, r0] = mundo(mv.area, mv.lx, mv.ly);
    for (let r = r0; r < r0 + def.footprint.h; r++) for (let c = c0; c < c0 + def.footprint.w; c++) andavel[r][c] = false;
  }

  // Divisórias entre áreas vizinhas do mesmo andar (chave: "coluna da direita,linha").
  const divisorias = new Set<string>();
  for (const a of areas) {
    if (a.x0 === 0) continue;
    const an = andarDe(a);
    for (let r = an.face; r <= an.piso + an.linhas; r++) divisorias.add(`${a.x0},${r}`);
  }
  return { cols, W: cols * TILE, areas, naParede, chao, lugares, andavel, divisorias };
}

/** Dá para ir do tile (c1, r1) ao vizinho (c2, r2) sem atravessar uma divisória? */
export function passagem(p: Predio, c1: number, r1: number, c2: number, r2: number): boolean {
  return r1 !== r2 || !p.divisorias.has(`${Math.max(c1, c2)},${r1}`);
}

/** Área em que fica um ponto de mundo (px), ou undefined no corredor. */
export function areaEm(p: Predio, x: number, y: number): Area | undefined {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  return p.areas.find((a) => {
    const an = andarDe(a);
    return c >= a.x0 && c < a.x0 + a.w && r >= an.face && r < an.piso + an.linhas + (a.andar === 'cima' ? 1 : 0);
  });
}

export const mesaDe = (p: Predio, id: AgenteId): Lugar | undefined => p.lugares.find((l) => l.mesa === id);

/** Âncora de mundo (px) de um móvel: centro inferior do footprint (chão) ou do trecho de parede. */
function ancora(mv: Movel): { x: number; y: number } {
  const a = mv.area;
  const def = FURNITURE[mv.kind];
  if (def.mount === 'wall') return { x: (a.x0 + mv.lx) * TILE + (def.footprint.w * TILE) / 2, y: andarDe(a).piso * TILE };
  const [c, r] = mundo(a, mv.lx, mv.ly);
  return { x: c * TILE + (def.footprint.w * TILE) / 2 + (mv.dx ?? 0), y: (r + def.footprint.h) * TILE };
}

// ------------------------------------------------------------------ desenho

export interface Figura {
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

/** Obra em andamento numa vaga: construindo (0 → 1) ou desmontando (1 → 0). */
export interface Obra {
  inicio: number;
  tipo: 'construir' | 'desmontar';
}

export interface EstadoCena {
  t: number;
  hora: number;
  agora: Date;
  telas: Record<AreaId, ScreenMode>;
  luz: Record<AreaId, number>;
  elevadores: [number, number];
  obras: Map<number, Obra>;
  /** Vaga livre sob o cursor (destaque). */
  vagaSob?: number;
}

type Item = { y: number; draw: () => void };

function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, dy = 0): void {
  ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay + dy));
}

/** Progresso da montagem da área (1 = pronta). Na desmontagem a sala some de trás para frente. */
function progresso(a: Area, e: EstadoCena): number {
  const o = a.vaga !== undefined ? e.obras.get(a.vaga) : undefined;
  if (!o) return 1;
  const u = (e.t - o.inicio) / (o.tipo === 'construir' ? OBRA_MS : DESMONTE_MS);
  return o.tipo === 'construir' ? Math.min(1, Math.max(0, u)) : Math.max(0, 1 - u);
}

/** O móvel já apareceu? Retorna o deslocamento da "queda" (0 = no lugar) ou null se ainda não. */
function quedaDoMovel(mv: Movel, total: number, p: number): number | null {
  if (p >= 1) return 0;
  const vez = (mv.ordem + 1) / (total + 1);
  const u = (p - vez * 0.85) / 0.12;
  if (u < 0) return null;
  return u >= 1 ? 0 : -Math.round((1 - u) * (1 - u) * 10);
}

function desenharItemParede(ctx: CanvasRenderingContext2D, mv: Movel, e: EstadoCena, dy: number): void {
  const elev = mv.kind === 'elevator' ? e.elevadores[mv.lx < 3 ? 0 : 1] : 0;
  const sp = art.furnitureSprites(mv.kind, mv.variant, elev, { seed: mv.seed }).base;
  const { x, y } = ancora(mv);
  const ox = x - sp.ax;
  const oy = y - sp.ay + dy;
  const r = sp.rects;
  const a = mv.area;
  if (mv.extra === 'janela' && r?.glass) art.drawWindowView(ctx, { x: ox + r.glass.x, y: oy + r.glass.y, w: r.glass.w, h: r.glass.h }, e.hora, e.t, a.x0 + mv.lx);
  blit(ctx, sp, x, y, dy);
  if (mv.extra === 'quadro' && r?.board) art.drawBoard(ctx, { x: ox + r.board.x, y: oy + r.board.y, w: r.board.w, h: r.board.h }, a.modelo.quadro ?? [], e.t);
  if (mv.extra === 'relogio' && r?.face) art.drawClock(ctx, { x: ox + r.face.x, y: oy + r.face.y, w: r.face.w, h: r.face.h }, e.agora);
  if (mv.extra === 'tv' && r?.tv) art.drawScreen(ctx, { x: ox + r.tv.x, y: oy + r.tv.y, w: r.tv.w, h: r.tv.h }, e.telas[a.id] ?? 'off', e.t, 7);
  if (mv.extra === 'placa' && r?.sign && a.placa) {
    const txt = a.livre && e.obras.has(a.vaga as number) ? 'em obra' : a.placa;
    const tw = pixelTextWidth(txt);
    pixelText(ctx, txt, Math.round(ox + r.sign.x + (r.sign.w - tw) / 2), Math.round(oy + r.sign.y + (r.sign.h - 5) / 2), a.livre ? '#7a8394' : '#2b3142');
  }
}

/** A segunda mesa mostra outra coisa que a TV: terminal no Norte e na sala de máquinas, documento nas outras. */
function telaDaMesa(mv: Movel, e: EstadoCena): ScreenMode {
  const modo = e.telas[mv.area.id];
  if (!modo || modo === 'off' || modo === 'standby') return modo ?? 'off';
  return mv.area.id === 'norte' || mv.area.id === 'motriz' ? 'terminal' : 'docs';
}

/** Fita de obra e poeira sobre a sala em construção ou desmontagem. */
function desenharObra(ctx: CanvasRenderingContext2D, a: Area, p: number, t: number): void {
  const an = andarDe(a);
  const x = a.x0 * TILE;
  const y = an.piso * TILE;
  const w = a.w * TILE;
  const h = an.linhas * TILE;
  for (let i = 0; i < w; i += 4) {
    ctx.fillStyle = (i / 4 + Math.floor(t / 150)) % 2 === 0 ? '#f2c14e' : '#2b3142';
    ctx.fillRect(x + i, y + 1, 4, 2);
    ctx.fillRect(x + i, y + h - 3, 4, 2);
  }
  const n = 14;
  for (let i = 0; i < n; i++) {
    const s = (i * 9301 + 49297) % 233280;
    const px = x + 8 + ((s % 1000) / 1000) * (w - 16);
    const fase = (t / 900 + i / n) % 1;
    const py = y + h - 8 - fase * (h - 16);
    ctx.fillStyle = `rgba(230, 222, 205, ${(0.55 * (1 - fase) * Math.min(1, (1 - p) * 4 + 0.2)).toFixed(3)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
  }
}

/**
 * Desenha o prédio em `ctx` (1x; o CSS amplia). Ordem: pisos, faces das paredes com os itens de parede, tudo que tem
 * profundidade ordenado pelo y (móveis, encostos, pessoas, parede sul), luz das salas, obras, divisórias, céu, extra.
 */
export function desenharPredio(ctx: CanvasRenderingContext2D, p: Predio, e: EstadoCena, figuras: readonly Figura[], extra: (ctx: CanvasRenderingContext2D) => void): void {
  const W = p.W;
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, W, H);

  art.drawFloor(ctx, 'concrete', 0, CORREDOR.linha * TILE, W, CORREDOR.linhas * TILE, { seed: 9 });
  const prog = new Map(p.areas.map((a) => [a.id, progresso(a, e)]));
  // Durante a obra o piso e a parede ainda são os da vaga; viram os da sala no primeiro terço.
  const modeloVisivel = (a: Area) => ((prog.get(a.id) as number) < 0.35 ? VAGA : a.modelo);
  p.areas.forEach((a, i) => {
    const an = andarDe(a);
    const md = modeloVisivel(a);
    const o = { seed: i + 1, tint: md.tint, tint2: md.tint2 };
    art.drawFloor(ctx, md.piso, a.x0 * TILE, an.piso * TILE, a.w * TILE, an.linhas * TILE, o);
    if (a.livre) return;
    const [p0, p1] = a.porta;
    if (a.andar === 'cima') art.drawFloor(ctx, md.piso, (a.x0 + p0) * TILE, (an.piso + an.linhas) * TILE, (p1 - p0) * TILE, TILE, o);
    else art.drawFloor(ctx, md.piso, (a.x0 + p0) * TILE, an.face * TILE, (p1 - p0) * TILE, (an.piso - an.face) * TILE, o);
  });
  for (const a of p.areas) {
    if ((prog.get(a.id) as number) < 0.5) continue;
    for (const t of a.modelo.tapetes ?? []) art.drawRug(ctx, (a.x0 + t.lx) * TILE, (andarDe(a).piso + t.ly) * TILE, t.w * TILE, t.h * TILE, t.cor, a.x0 + 1);
  }

  // Faces das paredes: em cima sem passagem (a porta é na parede sul); embaixo com o vão da porta (menos na vaga).
  for (const a of p.areas) {
    const an = andarDe(a);
    const doorways = a.andar === 'baixo' && !a.livre ? [{ x: (a.x0 + a.porta[0]) * TILE, w: (a.porta[1] - a.porta[0]) * TILE }] : [];
    art.drawWallFace(ctx, a.x0 * TILE, an.face * TILE, a.w * TILE, modeloVisivel(a).parede, { doorways });
  }
  for (const mv of p.naParede) {
    const dy = quedaDoMovel(mv, mv.area.modelo.naParede.length, prog.get(mv.area.id) as number);
    if (dy !== null) desenharItemParede(ctx, mv, e, dy);
  }

  const itens: Item[] = [];
  for (const mv of p.chao) {
    const dy = quedaDoMovel(mv, mv.area.modelo.chao.length, prog.get(mv.area.id) as number);
    if (dy === null) continue;
    const f = art.furnitureSprites(mv.kind, mv.variant, mv.kind === 'coffee_machine' ? Math.floor(e.t / 2500) % 2 : 0, { seed: mv.seed });
    const { x, y } = ancora(mv);
    itens.push({
      y,
      draw: () => {
        blit(ctx, f.base, x, y, dy);
        const r = f.base.rects?.screen;
        if (mv.extra === 'tela' && r) art.drawScreen(ctx, { x: x - f.base.ax + r.x, y: y - f.base.ay + r.y + dy, w: r.w, h: r.h }, telaDaMesa(mv, e), e.t, 11);
      },
    });
    if (f.front) {
      const front = f.front;
      itens.push({ y: y + 0.5, draw: () => blit(ctx, front, x, y, dy) });
    }
  }
  for (const fg of figuras) {
    itens.push({
      y: fg.sortY,
      draw: () => blit(ctx, art.characterSprite({ appearance: fg.appearance, dir: fg.dir, pose: fg.pose, frame: fg.frame, held: fg.held, seated: fg.seated }), fg.x, fg.y),
    });
  }
  const sulY = (ANDAR_CIMA.piso + ANDAR_CIMA.linhas) * TILE;
  for (const a of p.areas.filter((x) => x.andar === 'cima')) {
    const doorways = a.livre ? [] : [{ x: (a.x0 + a.porta[0]) * TILE, w: (a.porta[1] - a.porta[0]) * TILE }];
    const parede = modeloVisivel(a).parede;
    itens.push({ y: sulY + TILE, draw: () => art.drawSouthWall(ctx, a.x0 * TILE, sulY, a.w * TILE, parede, { doorways }) });
  }
  itens.sort((a, b) => a.y - b.y);
  for (const it of itens) it.draw();

  for (const a of p.areas) {
    const an = andarDe(a);
    const apagado = 1 - (e.luz[a.id] ?? 1);
    if (apagado > 0.01) {
      ctx.fillStyle = `rgba(16, 20, 40, ${(0.38 * apagado).toFixed(3)})`;
      ctx.fillRect(a.x0 * TILE, an.face * TILE, a.w * TILE, (an.piso + an.linhas - an.face) * TILE);
    }
    const emObra = a.vaga !== undefined && e.obras.has(a.vaga);
    if (emObra) desenharObra(ctx, a, prog.get(a.id) as number, e.t);
    if (a.livre && !emObra) {
      const sob = e.vagaSob === a.vaga;
      if (sob) {
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.9)';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(a.x0 * TILE + 3.5, an.piso * TILE + 2.5, a.w * TILE - 7, an.linhas * TILE - 5);
        ctx.setLineDash([]);
      }
      // "+" pulsando no meio da vaga: dá para clicar e escolher um agente.
      const cx = Math.round((a.x0 + a.w / 2) * TILE);
      const cy = Math.round((an.piso + an.linhas / 2) * TILE);
      const s = 5 + (Math.floor(e.t / 500) % 2);
      ctx.fillStyle = sob ? '#5eead4' : 'rgba(122, 131, 148, 0.8)';
      ctx.fillRect(cx - s, cy - 1, s * 2, 2);
      ctx.fillRect(cx - 1, cy - s, 2, s * 2);
    }
  }

  for (const a of p.areas) {
    const an = andarDe(a);
    const y0 = an.face * TILE;
    const h = (a.andar === 'cima' ? an.piso + an.linhas + 1 : an.piso + an.linhas) * TILE - y0;
    if (a.x0 > 0) art.drawWallTop(ctx, a.x0 * TILE - 2, y0, 4, h, a.modelo.parede);
  }
  art.drawWallTop(ctx, 0, 0, 3, H, RECEPCAO.parede);
  art.drawWallTop(ctx, W - 3, 0, 3, H, p.areas[p.areas.length - 1].modelo.parede);
  art.drawSouthWall(ctx, 0, (ROWS - 1) * TILE, W, { base: '#cfd3da', trim: '#8a919c', pattern: 'brick', exterior: true });

  ceu(ctx, W, e.hora);
  extra(ctx);
}

/** Céu do dia sobre o prédio: azul-escuro à noite, alaranjado no fim da tarde, nada de dia. */
function ceu(ctx: CanvasRenderingContext2D, W: number, hora: number): void {
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

/** Lugares que ninguém alcança a partir do corredor (erro num modelo de sala). Vai para o console do protótipo. */
export function lugaresInalcancaveis(p: Predio): Lugar[] {
  const vis = Array.from({ length: ROWS }, () => Array<boolean>(p.cols).fill(false));
  const fila: [number, number][] = [[0, CORREDOR.linha]];
  vis[CORREDOR.linha][0] = true;
  while (fila.length) {
    const [c, r] = fila.shift() as [number, number];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= p.cols || vis[nr][nc] || !p.andavel[nr][nc] || !passagem(p, c, r, nc, nr)) continue;
      vis[nr][nc] = true;
      fila.push([nc, nr]);
    }
  }
  return p.lugares.filter(({ tile: [c, r] }) => !vis[r][c]);
}
