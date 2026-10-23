// Vitrine da arte do prédio: tudo o que o módulo do habblaud sabe desenhar, já com os agentes do hubbia. Só existe em
// DESENVOLVIMENTO (main.tsx a monta em `/#catalogo` sob `import.meta.env.DEV`, então não entra no build de produção).
//
// Para que serve: conferir de olho uma sala ou agente novo e pegar regressão visual depois de mexer na arte. Veio do
// protótipo standalone (branch test/hubblaud, tag arquivo/hubblaud-prototipo), a única peça dele que o frontend não tinha.
import * as art from '../habblaud/art/index';
import {
  FURNITURE,
  TILE,
  type Dir,
  type FloorKind,
  type FurnitureKind,
  type HeldItem,
  type IconName,
  type Pose,
  type ScreenMode,
  type WallStyle,
} from '../habblaud/art/api';
import { AGENTES } from '../agentes';
import { H, desenharPredio, montarPredio } from '../predio';

const CSS = `
.vitrine { min-height: 100%; padding: 20px 24px 48px; background: var(--void); color: var(--ink); font-family: var(--fonte-corpo); }
.vitrine h1 { margin: 0 0 4px; font-size: 20px; font-family: var(--fonte-display); }
.vitrine .sub { margin: 0 0 18px; color: var(--ink-dim); font-size: 13px; }
.vitrine section { background: var(--deck); border: 1px solid var(--deck-line); border-radius: var(--radius-deck); padding: 14px 16px 16px; margin-bottom: 18px; }
.vitrine h2 { margin: 0 0 4px; font-size: 15px; }
.vitrine .desc { margin: 0 0 12px; color: var(--ink-dim); font-size: 12px; }
.vitrine .grade { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.vitrine .celula { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.vitrine .celula span { font-size: 11px; color: var(--ink-dim); }
.vitrine canvas { image-rendering: pixelated; display: block; border-radius: 4px; }
`;

const ESCALA = 3;

const POSES: readonly [Pose, string][] = [
  ['stand', 'parado'], ['walk', 'andando'], ['run', 'correndo'], ['sit', 'sentado'], ['type', 'digitando'], ['sleep', 'cochilando'],
  ['drink', 'bebendo'], ['use', 'usando máquina'], ['raise_hand', 'mão levantada'], ['talk', 'conversando'], ['stretch', 'alongando'],
  ['read', 'lendo'], ['play', 'ping-pong'], ['wait', 'esperando'], ['cheer', 'comemorando'], ['laugh', 'rindo'], ['game', 'videogame'],
  ['rps', 'jokenpô'], ['groom', 'no espelho'], ['sulk', 'chateado'],
];
/** Item que combina com a pose (para a vitrine não mostrar a raquete no "bebendo"). */
const ITEM_DA_POSE: Partial<Record<Pose, HeldItem>> = { drink: 'coffee', read: 'book', play: 'paddle', game: 'controller', groom: 'comb', wait: 'popcorn' };
const SENTADAS: readonly Pose[] = ['sit', 'type', 'sleep', 'wait'];

const ITENS: readonly [HeldItem, string][] = [
  ['coffee', 'café'], ['water', 'água'], ['papers', 'papéis'], ['laptop', 'notebook'], ['book', 'livro'], ['box', 'caixa'], ['paddle', 'raquete'],
  ['popcorn', 'pipoca'], ['controller', 'controle'], ['phone', 'celular'], ['lipstick', 'batom'], ['comb', 'pente'],
];
const ICONES: readonly IconName[] = [
  'alert', 'question', 'zzz', 'check', 'heart', 'coffee', 'music', 'idea', 'sweat', 'star', 'lightning', 'chat', 'box', 'wave',
  'hourglass', 'cobweb', 'storm', 'coin', 'sparkle', 'trophy',
];
const TELAS: readonly [ScreenMode, string][] = [
  ['off', 'desligada'], ['standby', 'em espera'], ['idle', 'descanso'], ['code', 'código'], ['terminal', 'terminal'], ['browser', 'navegador'],
  ['search', 'busca'], ['chat', 'chat'], ['docs', 'documento'], ['tasks', 'tarefas'], ['alert', 'alerta'], ['progress', 'progresso'],
  ['show', 'programa'], ['game', 'videogame'],
];
const PISOS: readonly [FloorKind, string][] = [
  ['carpet', 'carpete'], ['wood', 'madeira'], ['tile_check', 'xadrez'], ['tile_white', 'azulejo'], ['concrete', 'cimento'], ['marble', 'mármore'],
  ['grass', 'grama'], ['sidewalk', 'calçada'], ['street', 'asfalto'],
];
const PAREDES: readonly [WallStyle, string][] = [
  [{ base: '#eef3ec', trim: '#16a34a', pattern: 'wood_panel' }, 'lambri'],
  [{ base: '#eef2fa', trim: '#2563eb', pattern: 'stripes' }, 'listras'],
  [{ base: '#f6f0e5', trim: '#b99f7a', pattern: 'tiles' }, 'azulejo'],
  [{ base: '#e6eef1', trim: '#0891b2', pattern: 'brick' }, 'tijolo'],
  [{ base: '#eceae6', trim: '#9aa2ae', pattern: 'marble' }, 'mármore'],
  [{ base: '#dfe9f2', trim: '#7fa3c4', pattern: 'glass' }, 'vidro'],
  [{ base: '#fbf1e8', trim: '#f97316', pattern: 'plain' }, 'lisa'],
];

type Pintor = (ctx: CanvasRenderingContext2D, t: number) => void;
let pintores: { ctx: CanvasRenderingContext2D; w: number; h: number; fundo: string; pintar: Pintor }[] = [];

function secao(raiz: HTMLElement, titulo: string, desc: string): HTMLElement {
  const s = document.createElement('section');
  s.innerHTML = `<h2>${titulo}</h2><p class="desc">${desc}</p>`;
  const g = document.createElement('div');
  g.className = 'grade';
  s.append(g);
  raiz.append(s);
  return g;
}

function celula(grade: HTMLElement, w: number, h: number, rotulo: string, pintar: Pintor, fundo = '#e9ecf1', escala = ESCALA): void {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
    c.style.width = `${w * escala}px`;
  c.style.height = `${h * escala}px`;
  const cel = document.createElement('div');
  cel.className = 'celula';
  const sp = document.createElement('span');
  sp.textContent = rotulo;
  cel.append(c, sp);
  grade.append(cel);
  pintores.push({ ctx: c.getContext('2d') as CanvasRenderingContext2D, w, h, fundo, pintar });
}

const quadroDe = (pose: Pose, t: number, fase = 0) => Math.floor((t + fase) / art.poseFrameDuration(pose)) % art.poseFrameCount(pose);

function blit(ctx: CanvasRenderingContext2D, s: { canvas: HTMLCanvasElement; ax: number; ay: number }, x: number, y: number): void {
  ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
}

export function montarCatalogo(raiz: HTMLElement): void {
  pintores = [];
  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  raiz.className = 'vitrine';
  raiz.innerHTML = '<h1>Vitrine da arte do prédio</h1><p class="sub">Só em desenvolvimento. Tudo é gerado em código; nenhuma imagem.</p>';
  raiz.append(estilo);
  const aparencias = AGENTES.map((d) => ({ d, a: art.appearanceFromSeed(d.seed, { look: d.look, parts: d.parts }) }));

  const ag = secao(raiz, 'Os agentes', 'Aparência fixa de cada agente (roupa na cor dele), nas quatro direções, andando.');
  const DIRS: readonly Dir[] = ['down', 'left', 'up', 'right'];
  for (const { d, a } of aparencias) {
    celula(ag, 4 * 26, 40, d.nome, (ctx, t) => {
      DIRS.forEach((dir, i) => blit(ctx, art.characterSprite({ appearance: a, dir, pose: 'walk', frame: quadroDe('walk', t, i * 90) }), 13 + i * 26, 35));
    });
  }

  // Cada sala montada sozinha no prédio e recortada: a mesma sala que entra quando a pessoa adiciona o agente.
  const sl = secao(raiz, 'Salas', 'O modelo de sala de cada agente (salas.ts): só peças do catálogo, nenhum desenho novo.');
  for (const d of AGENTES) {
    const p = montarPredio([d.id, null]);
    const tmp = document.createElement('canvas');
    tmp.width = p.W;
    tmp.height = H;
    const ESC = 2;
    const w = 14 * TILE;
    const h = 11 * TILE;
    let ultimo = -1e9;
    celula(sl, w, h, `${d.nome} · ${d.funcao.replace(' (conceito)', '')}`, (ctx, t) => {
      // O prédio inteiro é desenhado a cada 400 ms (as telas animam devagar); o recorte vai a todo quadro.
      if (t - ultimo > 400) {
        ultimo = t;
        const tctx = tmp.getContext('2d') as CanvasRenderingContext2D;
        desenharPredio(tctx, p, { t, hora: 12, agora: new Date(), telas: { [d.id]: d.tela }, luz: {}, elevadores: [0, 0], obras: new Map() }, [], () => undefined);
      }
      ctx.drawImage(tmp, 12 * TILE, 0, w, h, 0, 0, w, h);
    }, '#1b1f2a', ESC);
  }

  const po = secao(raiz, 'Poses', 'As 20 poses do módulo, revezando os agentes. As sentadas aparecem sobre uma banqueta.');
  POSES.forEach(([pose, nome], i) => {
    const { a } = aparencias[i % aparencias.length];
    const sentada = SENTADAS.includes(pose);
    celula(po, 30, 40, nome, (ctx, t) => {
      if (sentada) blit(ctx, art.furnitureSprites('stool').base, 15, 37);
      blit(ctx, art.characterSprite({ appearance: a, dir: 'down', pose, frame: quadroDe(pose, t, i * 70), held: ITEM_DA_POSE[pose], seated: sentada }), 15, sentada ? 34 : 36);
    });
  });

  const it = secao(raiz, 'Na mão', 'Itens que um personagem pode segurar.');
  ITENS.forEach(([held, nome], i) => {
    const { a } = aparencias[i % aparencias.length];
    celula(it, 28, 38, nome, (ctx, t) => blit(ctx, art.characterSprite({ appearance: a, dir: 'down', pose: 'stand', frame: quadroDe('stand', t), held }), 14, 35));
  });

  const mv = secao(raiz, 'Móveis', `Os ${Object.keys(FURNITURE).length} móveis do catálogo (de chão e de parede), cada um com a primeira variante.`);
  for (const kind of Object.keys(FURNITURE) as FurnitureKind[]) {
    const def = FURNITURE[kind];
    const f = art.furnitureSprites(kind, def.variants?.[0], kind === 'elevator' ? 2 : 0);
    const w = Math.max(def.footprint.w * TILE, f.base.canvas.width) + 8;
    const h = f.base.canvas.height + 8;
    celula(mv, w, h, kind.replace(/_/g, ' '), (ctx) => {
      const x = w / 2;
      const y = h - 4 - (f.base.canvas.height - f.base.ay);
      blit(ctx, f.base, x, y);
      if (f.front) blit(ctx, f.front, x, y);
    });
  }

  const ic = secao(raiz, 'Ícones', 'Balões sobre a cabeça: status (alerta, zzz) e o assunto de cada agente (moeda, chat, coração, ideia).');
  for (const nome of ICONES) {
    const sp = art.iconSprite(nome);
    celula(ic, 20, 20, nome, (ctx) => ctx.drawImage(sp.canvas, Math.round(10 - sp.canvas.width / 2), Math.round(10 - sp.canvas.height / 2)));
  }

  const te = secao(raiz, 'Telas', 'O que um monitor ou TV pode mostrar — animado por quadro (no prédio, cada sala usa a do seu agente).');
  for (const [modo, nome] of TELAS) celula(te, 40, 28, nome, (ctx, t) => art.drawScreen(ctx, { x: 2, y: 2, w: 36, h: 24 }, modo, t, 5), '#1b1f2a');

  const pi = secao(raiz, 'Pisos', 'Gerados por tile, com variação pela semente.');
  for (const [kind, nome] of PISOS) celula(pi, 48, 32, nome, (ctx) => art.drawFloor(ctx, kind, 0, 0, 48, 32, { seed: 3, tint: '#c4d6c4', tint2: '#b6cbb6' }));

  const pa = secao(raiz, 'Paredes', 'Face norte (2 tiles de altura), com tampa e rodapé.');
  for (const [estilo, nome] of PAREDES) celula(pa, 48, 34, nome, (ctx) => art.drawWallFace(ctx, 0, 0, 48, estilo));

  const ou = secao(raiz, 'Janela, relógio e quadro', 'A janela segue a hora (amanhecer, dia, pôr do sol, noite), o relógio a hora real e o quadro as tarefas.');
  for (const h of [6, 12, 18.5, 22]) {
    const sp = art.furnitureSprites('window').base;
    celula(ou, 40, 40, `janela ${h}h`, (ctx, t) => {
      const g = sp.rects?.glass;
      const x = 20;
      const y = 36;
      if (g) art.drawWindowView(ctx, { x: x - sp.ax + g.x, y: y - sp.ay + g.y, w: g.w, h: g.h }, h, t, 1);
      blit(ctx, sp, x, y);
    });
  }
  const rel = art.furnitureSprites('clock').base;
  celula(ou, 24, 30, 'relógio', (ctx) => {
    blit(ctx, rel, 12, 26);
    const f = rel.rects?.face;
    if (f) art.drawClock(ctx, { x: 12 - rel.ax + f.x, y: 26 - rel.ay + f.y, w: f.w, h: f.h }, new Date());
  });
  const qd = art.furnitureSprites('whiteboard').base;
  celula(ou, 56, 40, 'quadro', (ctx, t) => {
    blit(ctx, qd, 28, 36);
    const r = qd.rects?.board;
    if (r) art.drawBoard(ctx, { x: 28 - qd.ax + r.x, y: 36 - qd.ay + r.y, w: r.w, h: r.h }, [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }], t);
  });

  const loop = (t: number) => {
    for (const p of pintores) {
      p.ctx.fillStyle = p.fundo;
      p.ctx.fillRect(0, 0, p.w, p.h);
      p.pintar(p.ctx, t);
    }
    // a página saiu da tela (HMR, troca de rota): para de pintar
    if (raiz.isConnected) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
