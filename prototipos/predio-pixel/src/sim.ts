// Simulação dos agentes no prédio: para onde cada um vai, como anda (A* na grade) e o que faz ao chegar.
//
// É a dinâmica do habblaud simplificada para agentes pessoais:
// - trabalhando: fica na mesa digitando e de tempos em tempos faz uma pausa (estante, café, bebedouro...);
// - ocioso: circula entre os lugares da própria sala e os comuns (copa, recepção);
// - precisa de você: CORRE para a mesa e levanta a mão com o alerta piscando (o "esperando você" do habblaud);
// - dormindo: cochila na mesa.
// Sem DOM: recebe o relógio e devolve as figuras para o desenho (predio.ts).
import * as art from './habblaud/art/index';
import { TILE, type Dir, type HeldItem, type IconName, type Pose } from './habblaud/art/api';
import { mulberry32 } from './habblaud/shared/hash';
import { AGENTES, type Agente, type AgenteId, type Status } from './agentes';
import { LUGARES, SAIDA_ELEVADOR, andavel, passagem, areaEm, mesaDe, pesNoTile, type AreaId, type Figura, type Lugar } from './predio';

const VELOCIDADE_ANDAR = 3.2 * TILE; // px/s (as do habblaud)
const VELOCIDADE_CORRER = 6 * TILE;

/** Quanto tempo fica em cada coisa (ms): [mínimo, máximo]. */
const TEMPO_NA_MESA: [number, number] = [16000, 30000];
const TEMPO_NA_PAUSA: [number, number] = [6000, 11000];
const TEMPO_OCIOSO: [number, number] = [7000, 13000];
/** Chance de a pausa ser na copa/recepção em vez da própria sala. */
const PAUSA_FORA = 0.4;

export interface AgenteVivo {
  def: Agente;
  appearance: ReturnType<typeof art.appearanceFromSeed>;
  status: Status;
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  held?: HeldItem;
  seated: boolean;
  sortY: number;
  /** Pontos (pés) que ainda faltam no caminho; vazio = parado no lugar. */
  caminho: [number, number][];
  correndo: boolean;
  lugar?: Lugar;
  /** Lugar para onde está indo (já reservado). */
  destino?: Lugar;
  ate: number;
  /** Ícone do assunto: aparece por alguns segundos enquanto trabalha. */
  iconeAte: number;
  proximoIcone: number;
  fase: number;
}

export interface Simulacao {
  agentes: AgenteVivo[];
  /** Quem está em cada lugar (ou indo para ele). */
  ocupado: Map<string, AgenteId>;
  rnd: () => number;
  /** Instantes em que cada elevador abriu (para a animação das portas). */
  elevadorAbriu: [number, number];
}

const entre = (rnd: () => number, [a, b]: [number, number]) => a + rnd() * (b - a);

export function criarSimulacao(agora: number): Simulacao {
  const rnd = mulberry32(20261022);
  const sim: Simulacao = { agentes: [], ocupado: new Map(), rnd, elevadorAbriu: [-1e9, -1e9] };
  AGENTES.forEach((def, i) => {
    // Chegam pelo elevador, um de cada vez.
    const [c, r] = SAIDA_ELEVADOR[i % 2];
    const [x, y] = pesNoTile(c, r);
    sim.agentes.push({
      def,
      appearance: art.appearanceFromSeed(def.seed, { look: def.look, parts: def.parts }),
      status: def.id === 'agenda' ? 'precisa_de_voce' : 'trabalhando',
      x, y, dir: 'down', pose: 'stand', seated: false, sortY: y,
      caminho: [], correndo: false,
      ate: agora + 400 + i * 1600,
      iconeAte: 0,
      proximoIcone: agora + 4000 + i * 1500,
      fase: i * 97,
    });
  });
  return sim;
}

/** Troca o status (pelo painel): sai do que estava fazendo e decide de novo na hora. */
export function mudarStatus(sim: Simulacao, id: AgenteId, status: Status, agora: number): void {
  const a = sim.agentes.find((x) => x.def.id === id);
  if (!a || a.status === status) return;
  a.status = status;
  a.ate = agora;
}

// ------------------------------------------------------------------ caminho (A* 4 direções)

const tileDe = (x: number, y: number): [number, number] => [Math.floor(x / TILE), Math.floor(y / TILE)];

function aEstrela(de: [number, number], para: [number, number]): [number, number][] | null {
  const cols = andavel[0].length;
  const k = (c: number, r: number) => r * cols + c;
  const livre = (c: number, r: number) => r >= 0 && r < andavel.length && c >= 0 && c < cols && (andavel[r][c] || (c === para[0] && r === para[1]) || (c === de[0] && r === de[1]));
  const h = (c: number, r: number) => Math.abs(c - para[0]) + Math.abs(r - para[1]);
  const g = new Map<number, number>([[k(...de), 0]]);
  const veio = new Map<number, number>();
  const aberto: [number, number, number][] = [[h(...de), de[0], de[1]]];
  while (aberto.length) {
    // Lista pequena (a grade tem ~1000 tiles): achar o menor direto é mais simples que um heap e basta.
    let mi = 0;
    for (let i = 1; i < aberto.length; i++) if (aberto[i][0] < aberto[mi][0]) mi = i;
    const [, c, r] = aberto.splice(mi, 1)[0];
    if (c === para[0] && r === para[1]) {
      const out: [number, number][] = [];
      let cur: number | undefined = k(c, r);
      while (cur !== undefined) {
        out.push([cur % cols, Math.floor(cur / cols)]);
        cur = veio.get(cur);
      }
      return out.reverse();
    }
    const gc = g.get(k(c, r)) as number;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (!livre(nc, nr) || !passagem(c, r, nc, nr)) continue;
      const nk = k(nc, nr);
      if (gc + 1 < (g.get(nk) ?? Infinity)) {
        g.set(nk, gc + 1);
        veio.set(nk, k(c, r));
        aberto.push([gc + 1 + h(nc, nr), nc, nr]);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ decisões

function lugaresPara(a: AgenteVivo, fora: boolean): Lugar[] {
  return LUGARES.filter((l) => {
    if (l.mesa) return false;
    const comum = l.area === 'copa' || l.area === 'recepcao';
    return fora ? comum : l.area === a.def.id;
  });
}

function sortear<T>(rnd: () => number, lista: readonly T[]): T | undefined {
  return lista.length ? lista[Math.floor(rnd() * lista.length)] : undefined;
}

function liberar(sim: Simulacao, a: AgenteVivo): void {
  for (const l of [a.lugar, a.destino]) if (l && sim.ocupado.get(l.id) === a.def.id) sim.ocupado.delete(l.id);
  a.lugar = undefined;
  a.destino = undefined;
}

function irPara(sim: Simulacao, a: AgenteVivo, l: Lugar, correndo: boolean): boolean {
  const pontos = aEstrela(tileDe(a.x, a.y), l.tile);
  if (!pontos) return false;
  // Quem acabou de tirar café sai com o copo na mão; de resto anda de mãos livres.
  const comCafe = a.lugar?.rotulo === 'Tirando um café';
  liberar(sim, a);
  sim.ocupado.set(l.id, a.def.id);
  a.destino = l;
  a.correndo = correndo;
  a.seated = false;
  a.held = comCafe ? 'coffee' : undefined;
  // Pula o próprio tile; o último ponto é o lugar exato (pés no assento, por exemplo).
  a.caminho = pontos.slice(1).map(([c, r]) => pesNoTile(c, r));
  a.caminho.push([l.x, l.y]);
  return true;
}

function decidir(sim: Simulacao, a: AgenteVivo, agora: number): void {
  const mesa = mesaDe(a.def.id);
  const naMesa = a.lugar?.id === mesa.id;
  const quer = (l: Lugar | undefined, correndo = false) => !!l && (a.lugar?.id === l.id || irPara(sim, a, l, correndo));

  if (a.status === 'precisa_de_voce' || a.status === 'dormindo') {
    if (!naMesa && !a.destino) quer(mesa, a.status === 'precisa_de_voce');
    a.ate = agora + 1e9;
    if (naMesa) aplicarPoseDaMesa(a);
    return;
  }
  if (a.status === 'trabalhando') {
    if (!naMesa) {
      quer(mesa);
      a.ate = agora + entre(sim.rnd, TEMPO_NA_MESA);
      return;
    }
    // Hora da pausa.
    const fora = sim.rnd() < PAUSA_FORA;
    const livre = lugaresPara(a, fora).filter((l) => !sim.ocupado.has(l.id));
    if (quer(sortear(sim.rnd, livre))) a.ate = agora + 1e9;
    else a.ate = agora + entre(sim.rnd, TEMPO_NA_MESA);
    return;
  }
  // Ocioso: passeia.
  const fora = sim.rnd() < 0.5;
  const livre = [...lugaresPara(a, fora), ...(sim.rnd() < 0.2 ? [mesa] : [])].filter((l) => !sim.ocupado.has(l.id) && l.id !== a.lugar?.id);
  if (!quer(sortear(sim.rnd, livre))) a.ate = agora + 2000;
  else a.ate = agora + 1e9;
}

function aplicarPoseDaMesa(a: AgenteVivo): void {
  a.pose = a.status === 'precisa_de_voce' ? 'raise_hand' : a.status === 'dormindo' ? 'sleep' : a.status === 'ocioso' ? 'sit' : 'type';
  a.seated = true;
  a.held = undefined;
}

function chegou(sim: Simulacao, a: AgenteVivo, agora: number): void {
  const l = a.destino as Lugar;
  a.lugar = l;
  a.destino = undefined;
  a.x = l.x;
  a.y = l.y;
  a.dir = l.dir;
  a.pose = l.pose;
  a.held = l.held;
  a.seated = !!l.seated;
  a.sortY = l.sortY;
  a.correndo = false;
  if (l.mesa) {
    aplicarPoseDaMesa(a);
    a.ate = a.status === 'trabalhando' ? agora + entre(sim.rnd, TEMPO_NA_MESA) : a.status === 'ocioso' ? agora + entre(sim.rnd, TEMPO_OCIOSO) : agora + 1e9;
    return;
  }
  a.ate = agora + entre(sim.rnd, a.status === 'ocioso' ? TEMPO_OCIOSO : TEMPO_NA_PAUSA);
}

function andar(a: AgenteVivo, dt: number): boolean {
  let passo = ((a.correndo ? VELOCIDADE_CORRER : VELOCIDADE_ANDAR) * dt) / 1000;
  while (passo > 0 && a.caminho.length) {
    const [tx, ty] = a.caminho[0];
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (d <= passo) {
      a.x = tx;
      a.y = ty;
      passo -= d;
      a.caminho.shift();
    } else {
      a.x += (dx / d) * passo;
      a.y += (dy / d) * passo;
      passo = 0;
    }
  }
  a.pose = a.correndo ? 'run' : 'walk';
  a.sortY = a.y;
  return a.caminho.length === 0;
}

/** Avança a simulação `dt` ms até `agora`. */
export function passo(sim: Simulacao, agora: number, dt: number): void {
  for (const a of sim.agentes) {
    if (a.caminho.length) {
      if (andar(a, dt) && a.destino) chegou(sim, a, agora);
      continue;
    }
    // Recém-chegado pelo elevador: a porta abre e ele sai.
    if (!a.lugar && !a.destino && agora >= a.ate) {
      const i = SAIDA_ELEVADOR.findIndex(([c, r]) => tileDe(a.x, a.y)[0] === c && tileDe(a.x, a.y)[1] === r);
      if (i >= 0 && agora - sim.elevadorAbriu[i] > 2500) sim.elevadorAbriu[i] = agora;
    }
    if (agora >= a.ate) decidir(sim, a, agora);
    // Ícone do assunto de vez em quando, enquanto trabalha.
    if (agora >= a.proximoIcone) {
      if (a.status === 'trabalhando' && a.lugar?.mesa) a.iconeAte = agora + 2600;
      a.proximoIcone = agora + entre(sim.rnd, [7000, 12000]);
    }
  }
}

/** Ícone sobre a cabeça agora (ou nada). */
export function iconeDe(a: AgenteVivo, agora: number): IconName | undefined {
  if (a.status === 'precisa_de_voce') return 'alert';
  if (a.status === 'dormindo' && a.lugar?.mesa) return 'zzz';
  if (a.lugar?.held === 'coffee' || a.lugar?.rotulo === 'Tirando um café') return 'coffee';
  if (agora < a.iconeAte) return a.def.icone;
  return undefined;
}

/** "O que está fazendo" em português, para o painel. */
export function atividadeDe(a: AgenteVivo): string {
  if (a.caminho.length) {
    if (a.correndo) return 'Correndo para a mesa';
    const l = a.destino;
    return l?.mesa ? 'Voltando para a mesa' : l ? `A caminho: ${l.rotulo.toLowerCase()}` : 'Andando';
  }
  if (!a.lugar) return 'Saindo do elevador';
  if (a.lugar.mesa) {
    if (a.status === 'precisa_de_voce') return 'Esperando você responder';
    if (a.status === 'dormindo') return 'Cochilando na mesa';
    if (a.status === 'ocioso') return 'Sentado à toa na mesa';
    return 'Trabalhando na mesa';
  }
  return a.lugar.rotulo;
}

/** Figuras do quadro (o frame da animação sai do relógio + uma fase por agente, para não andarem em sincronia). */
export function figuras(sim: Simulacao, t: number): Figura[] {
  return sim.agentes.map((a) => ({
    id: a.def.id,
    x: a.x,
    y: a.y,
    sortY: a.sortY,
    dir: a.dir,
    pose: a.pose,
    frame: Math.floor((t + a.fase) / art.poseFrameDuration(a.pose)) % art.poseFrameCount(a.pose),
    held: a.held,
    seated: a.seated,
    appearance: a.appearance,
  }));
}

/** Área em que cada agente está agora (para a luz das salas). */
export function areasOcupadas(sim: Simulacao): Set<AreaId> {
  const s = new Set<AreaId>();
  for (const a of sim.agentes) {
    const ar = areaEm(a.x, a.y - 4);
    if (ar) s.add(ar.id);
  }
  return s;
}

/** Porta do elevador: abre rápido, fica aberta e fecha (0 fechada ... 4 aberta). */
export function portaDoElevador(abriu: number, agora: number): number {
  const d = agora - abriu;
  if (d < 0 || d > 2600) return 0;
  if (d < 400) return Math.round((d / 400) * 4);
  if (d < 1800) return 4;
  return Math.round(4 - ((d - 1800) / 800) * 4);
}
