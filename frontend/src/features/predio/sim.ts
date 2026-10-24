// Simulação dos agentes no prédio: para onde cada um vai, como anda (A* na grade) e o que faz ao chegar.
//
// É a dinâmica do habblaud simplificada para agentes pessoais:
// - trabalhando: fica na mesa digitando e de tempos em tempos faz uma pausa (estante, café, bebedouro...);
// - ocioso: circula entre os lugares da própria sala e os comuns (copa, recepção);
// - precisa de você: CORRE para a mesa e levanta a mão com o alerta piscando (o "esperando você" do habblaud);
// - dormindo: cochila na mesa.
// E o ciclo de vida: chega pelo elevador quando a sala fica pronta e, ao ser dispensado, volta ao elevador e vai embora.
// Sem DOM: recebe o relógio e devolve as figuras para o desenho (predio.ts).
import * as art from './habblaud/art/index';
import { TILE, type Dir, type HeldItem, type IconName, type Pose } from './habblaud/art/api';
import { mulberry32 } from './habblaud/shared/hash';
import { agentePorId, type AgenteId, type AgenteVisual } from './agentes';
import { SAIDA_ELEVADOR, areaEm, mesaDe, passagem, pesNoTile, type AreaId, type Figura, type Lugar, type Predio } from './predio';

/**
 * Estados que o prédio sabe desenhar. Vêm do backend (estado do agente + mensagens não lidas + hora simulada; ver
 * Escritorio.tsx); "precisa de você" é o "esperando você" do habblaud.
 */
export type Status = 'trabalhando' | 'pensando' | 'conversando' | 'ocioso' | 'precisa_de_voce' | 'dormindo';

export const STATUS_ROTULO: Record<Status, string> = {
  trabalhando: 'Trabalhando',
  pensando: 'Pensando',
  conversando: 'Conversando',
  ocioso: 'Ocioso',
  precisa_de_voce: 'Precisa de você',
  dormindo: 'Dormindo',
};

const VELOCIDADE_ANDAR = 3.2 * TILE; // px/s (as do habblaud)
const VELOCIDADE_CORRER = 6 * TILE;

/** Quanto tempo fica em cada coisa (ms): [mínimo, máximo]. */
const TEMPO_NA_MESA: [number, number] = [16000, 30000];
const TEMPO_NA_PAUSA: [number, number] = [6000, 11000];
const TEMPO_OCIOSO: [number, number] = [7000, 13000];
/** Chance de a pausa ser na copa/recepção em vez da própria sala. */
const PAUSA_FORA = 0.4;
/** Quanto tempo a porta do elevador fica aberta antes de quem sai sumir. */
const EMBARQUE_MS = 900;

export interface AgenteVivo {
  def: AgenteVisual;
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
  iconeAte: number;
  proximoIcone: number;
  fase: number;
  /** Ainda não saiu do elevador (invisível até a porta abrir). */
  chegando: boolean;
  /** Foi dispensado: está indo para o elevador. */
  saindo: boolean;
  /** Entrou no elevador: some quando a porta fecha. */
  embarcouEm?: number;
  /** Congelado no lugar (o chefe está com o atalho aberto nele): não anda nem decide nada até soltar. */
  parado: boolean;
}

export interface Simulacao {
  predio: Predio;
  agentes: AgenteVivo[];
  ocupado: Map<string, AgenteId>;
  rnd: () => number;
  elevadorAbriu: [number, number];
  /** Avisado quando um agente dispensado entra no elevador e some. */
  aoSair: (id: AgenteId) => void;
}

const entre = (rnd: () => number, [a, b]: [number, number]) => a + rnd() * (b - a);

export function criarSimulacao(predio: Predio, aoSair: (id: AgenteId) => void): Simulacao {
  return { predio, agentes: [], ocupado: new Map(), rnd: mulberry32(20261022), elevadorAbriu: [-1e9, -1e9], aoSair };
}

/**
 * Coloca um agente no prédio. `jaNaMesa`: aparece sentado (primeira carga da página); senão chega pelo elevador
 * em `chegaEm` (quando a obra da sala termina).
 */
export function adicionarAgente(sim: Simulacao, id: AgenteId, agora: number, o: { jaNaMesa?: boolean; chegaEm?: number; status?: Status } = {}): void {
  if (sim.agentes.some((a) => a.def.id === id)) return;
  const def = agentePorId(id);
  if (!def) return;
  const i = sim.agentes.length;
  const [c, r] = SAIDA_ELEVADOR[i % 2];
  const [x, y] = pesNoTile(c, r);
  const a: AgenteVivo = {
    def,
    appearance: art.appearanceFromSeed(def.seed, { look: def.look, parts: def.parts }),
    status: o.status ?? 'trabalhando',
    x, y, dir: 'down', pose: 'stand', seated: false, sortY: y, parado: false,
    caminho: [], correndo: false,
    ate: o.chegaEm ?? agora,
    iconeAte: 0,
    proximoIcone: agora + 4000 + i * 1500,
    fase: i * 97,
    chegando: !o.jaNaMesa,
    saindo: false,
  };
  sim.agentes.push(a);
  const mesa = mesaDe(sim.predio, id);
  if (o.jaNaMesa && mesa) {
    a.destino = mesa;
    sim.ocupado.set(mesa.id, id);
    chegou(sim, a, agora);
    // Começa em tempos diferentes para não saírem todos juntos na primeira pausa.
    a.ate = agora + entre(sim.rnd, [3000, 20000]);
  }
}

/** Dispensa um agente: ele larga o que estava fazendo e vai para o elevador. */
export function dispensarAgente(sim: Simulacao, id: AgenteId, agora: number): void {
  const a = sim.agentes.find((x) => x.def.id === id);
  if (!a || a.saindo) return;
  a.saindo = true;
  a.ate = agora;
  if (a.chegando) {
    // Nem tinha saído do elevador.
    sim.agentes.splice(sim.agentes.indexOf(a), 1);
    sim.aoSair(id);
  }
}

/** Troca o status (pelo painel): sai do que estava fazendo e decide de novo na hora. */
export function mudarStatus(sim: Simulacao, id: AgenteId, status: Status, agora: number): void {
  const a = sim.agentes.find((x) => x.def.id === id);
  if (!a || a.status === status || a.saindo) return;
  a.status = status;
  a.ate = agora;
}

/**
 * Congela (ou solta) um agente. Parado, ele mantém o que estava fazendo: sentado continua sentado, andando
 * para onde estiver. Existe porque o atalho em bolha fica ancorado no personagem, e um alvo que se mexe
 * escapa do clique. Ao soltar, o trajeto e as pausas seguem de onde pararam.
 */
export function definirParado(sim: Simulacao, id: AgenteId, parado: boolean): void {
  const a = sim.agentes.find((x) => x.def.id === id);
  if (a) a.parado = parado;
}

// ------------------------------------------------------------------ caminho (A* 4 direções)

const tileDe = (x: number, y: number): [number, number] => [Math.floor(x / TILE), Math.floor(y / TILE)];

/** A\* em 4 direções sobre a grade do prédio (exportada para os testes de regressão de caminho). */
export function aEstrela(p: Predio, de: [number, number], para: [number, number]): [number, number][] | null {
  const g0 = p.andavel;
  const cols = p.cols;
  const k = (c: number, r: number) => r * cols + c;
  const livre = (c: number, r: number) => r >= 0 && r < g0.length && c >= 0 && c < cols && (g0[r][c] || (c === para[0] && r === para[1]) || (c === de[0] && r === de[1]));
  const h = (c: number, r: number) => Math.abs(c - para[0]) + Math.abs(r - para[1]);
  const g = new Map<number, number>([[k(...de), 0]]);
  const veio = new Map<number, number>();
  const aberto: [number, number, number][] = [[h(...de), de[0], de[1]]];
  while (aberto.length) {
    // Grade pequena (~1.700 tiles no prédio cheio): achar o menor direto é mais simples que um heap e basta.
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
      if (!livre(nc, nr) || !passagem(p, c, r, nc, nr)) continue;
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

function lugaresPara(sim: Simulacao, a: AgenteVivo, fora: boolean): Lugar[] {
  return sim.predio.lugares.filter((l) => {
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
  const pontos = aEstrela(sim.predio, tileDe(a.x, a.y), l.tile);
  if (!pontos) return false;
  // Quem acabou de tirar café sai com o copo na mão; de resto anda de mãos livres.
  const comCafe = a.lugar?.rotulo === 'Tirando um café';
  liberar(sim, a);
  sim.ocupado.set(l.id, a.def.id);
  a.destino = l;
  a.correndo = correndo;
  a.seated = false;
  a.held = comCafe ? 'coffee' : undefined;
  a.caminho = pontos.slice(1).map(([c, r]) => pesNoTile(c, r));
  a.caminho.push([l.x, l.y]);
  return true;
}

/** "Lugar" na frente do elevador, para quem vai embora. */
function elevador(i: number): Lugar {
  const [c, r] = SAIDA_ELEVADOR[i];
  const [x, y] = pesNoTile(c, r);
  return { id: `elevador:${i}`, area: 'recepcao', tile: [c, r], x, y, dir: 'up', pose: 'stand', sortY: y, rotulo: 'Indo embora' };
}

function decidir(sim: Simulacao, a: AgenteVivo, agora: number): void {
  if (a.saindo) {
    if (!a.destino?.id.startsWith('elevador')) {
      const i = sim.rnd() < 0.5 ? 0 : 1;
      if (!irPara(sim, a, elevador(i), false)) a.ate = agora + 500;
    }
    return;
  }
  const mesa = mesaDe(sim.predio, a.def.id);
  if (!mesa) return;
  const naMesa = a.lugar?.id === mesa.id;
  const quer = (l: Lugar | undefined, correndo = false) => !!l && (a.lugar?.id === l.id || irPara(sim, a, l, correndo));

  if (a.status === 'precisa_de_voce' || a.status === 'dormindo' || a.status === 'conversando' || a.status === 'pensando') {
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
    const fora = sim.rnd() < PAUSA_FORA;
    const livre = lugaresPara(sim, a, fora).filter((l) => !sim.ocupado.has(l.id));
    a.ate = quer(sortear(sim.rnd, livre)) ? agora + 1e9 : agora + entre(sim.rnd, TEMPO_NA_MESA);
    return;
  }
  // Ocioso: passeia.
  const fora = sim.rnd() < 0.5;
  const livre = [...lugaresPara(sim, a, fora), ...(sim.rnd() < 0.2 ? [mesa] : [])].filter((l) => !sim.ocupado.has(l.id) && l.id !== a.lugar?.id);
  a.ate = quer(sortear(sim.rnd, livre)) ? agora + 1e9 : agora + 2000;
}

function aplicarPoseDaMesa(a: AgenteVivo): void {
  a.pose = a.status === 'precisa_de_voce' ? 'raise_hand' : a.status === 'dormindo' ? 'sleep' : a.status === 'conversando' ? 'talk' : a.status === 'pensando' ? 'read' : a.status === 'ocioso' ? 'sit' : 'type';
  a.seated = true;
  // pensando = de papéis na mão, lendo; os demais estados ficam de mãos livres
  a.held = a.status === 'pensando' ? 'papers' : undefined;
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
  if (a.saindo) {
    // Na frente do elevador: a porta abre, ele entra e some.
    const i = l.id === 'elevador:0' ? 0 : 1;
    sim.elevadorAbriu[i] = agora;
    a.embarcouEm = agora;
    return;
  }
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
  for (const a of [...sim.agentes]) {
    if (a.embarcouEm !== undefined) {
      if (agora - a.embarcouEm > EMBARQUE_MS) {
        liberar(sim, a);
        sim.agentes.splice(sim.agentes.indexOf(a), 1);
        sim.aoSair(a.def.id);
      }
      continue;
    }
    // `saindo` ignora o congelamento: dispensar fecha o atalho, mas se escapar ninguém fica preso no prédio
    if (a.parado && !a.saindo) {
      if (a.caminho.length) a.pose = 'stand'; // congelado no meio do passo não fica "andando no lugar"
      continue;
    }
    if (a.caminho.length) {
      if (andar(a, dt) && a.destino) chegou(sim, a, agora);
      continue;
    }
    if (a.chegando) {
      if (agora < a.ate) continue;
      // A sala ficou pronta: a porta do elevador abre e ele sai.
      const i = SAIDA_ELEVADOR.findIndex(([c, r]) => tileDe(a.x, a.y)[0] === c && tileDe(a.x, a.y)[1] === r);
      if (i >= 0) sim.elevadorAbriu[i] = agora;
      a.chegando = false;
      a.ate = agora + 450;
      continue;
    }
    if (agora >= a.ate) decidir(sim, a, agora);
    if (agora >= a.proximoIcone) {
      if (a.status === 'trabalhando' && a.lugar?.mesa) a.iconeAte = agora + 2600;
      a.proximoIcone = agora + entre(sim.rnd, [7000, 12000]);
    }
  }
}

/** Ícone sobre a cabeça agora (ou nada). */
export function iconeDe(a: AgenteVivo, agora: number): IconName | undefined {
  if (a.saindo) return 'wave';
  if (a.status === 'precisa_de_voce') return 'alert';
  if (a.status === 'dormindo' && a.lugar?.mesa) return 'zzz';
  if (a.status === 'conversando' && a.lugar?.mesa) return 'chat';
  if (a.status === 'pensando' && a.lugar?.mesa) return 'idea';
  if (a.lugar?.held === 'coffee' || a.lugar?.rotulo === 'Tirando um café') return 'coffee';
  if (agora < a.iconeAte) return a.def.icone;
  return undefined;
}

/** "O que está fazendo" em português, para o painel. */
export function atividadeDe(a: AgenteVivo): string {
  if (a.chegando) return 'Subindo pelo elevador';
  if (a.saindo) return 'Indo embora';
  if (a.caminho.length) {
    if (a.correndo) return 'Correndo para a mesa';
    const l = a.destino;
    return l?.mesa ? 'Voltando para a mesa' : l ? `A caminho: ${l.rotulo.toLowerCase()}` : 'Andando';
  }
  if (!a.lugar) return 'Chegando';
  if (a.lugar.mesa) {
    if (a.status === 'precisa_de_voce') return 'Esperando você responder';
    if (a.status === 'dormindo') return 'Cochilando na mesa';
    if (a.status === 'conversando') return 'Conversando';
    if (a.status === 'pensando') return 'Pensando';
    if (a.status === 'ocioso') return 'Sentado à toa na mesa';
    return 'Trabalhando na mesa';
  }
  return a.lugar.rotulo;
}

/** Visível no quadro (quem ainda está no elevador ou já embarcou não aparece). */
export const visivel = (a: AgenteVivo, agora: number): boolean => !a.chegando && (a.embarcouEm === undefined || agora - a.embarcouEm < EMBARQUE_MS * 0.5);

/** Figuras do quadro (o frame sai do relógio + uma fase por agente, para não andarem em sincronia). */
export function figuras(sim: Simulacao, t: number): Figura[] {
  return sim.agentes.filter((a) => visivel(a, t)).map((a) => ({
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

/** Área em que cada agente visível está agora (para a luz das salas). */
export function areasOcupadas(sim: Simulacao, t: number): Set<AreaId> {
  const s = new Set<AreaId>();
  for (const a of sim.agentes) {
    if (!visivel(a, t)) continue;
    const ar = areaEm(sim.predio, a.x, a.y - 4);
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
