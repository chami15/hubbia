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
import { personalidadeDe } from './personalidade';
import { escolherAtividade, type Feito, type Opcao } from './rotina';
import { parearPorAfinidade } from './relacoes';

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

/**
 * Quanto tempo fica em cada coisa (ms reais): [mínimo, máximo], multiplicado pelo `ritmo` da personalidade.
 * Eram 16–30 s na mesa e 7–13 s ocioso: o prédio parecia um formigueiro ("3 idas do Cifra à copa em 5 minutos").
 * O teste `ritmo.test.ts` cobra o teto de idas e vindas.
 */
const TEMPO_NA_MESA: [number, number] = [60000, 120000];
const TEMPO_NA_PAUSA: [number, number] = [18000, 35000];
const TEMPO_OCIOSO: [number, number] = [30000, 55000];
/** Chance de quem está ocioso simplesmente continuar onde está em vez de procurar outra coisa. */
const FICAR_ONDE_ESTA = 0.35;
/** Quantas atividades recentes cada agente lembra (a rotina evita repetir e limita a copa). */
const MEMORIA = 5;
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
  /** Últimas atividades (mais recente no fim): a rotina usa para não repetir e não ir à copa toda hora. */
  recentes: Feito[];
  /**
   * Almoço de hoje: undefined = ainda não almoçou; 'indo'/'comendo' na copa ou na dupla; 'saindo_fora' a caminho do
   * elevador; 'fora' almoçando fora (invisível até as 13h); 'feito' já almoçou.
   */
  almoco?: 'indo' | 'comendo' | 'saindo_fora' | 'fora' | 'feito';
  /** Acabou de almoçar ou de visitar alguém: a próxima decisão é voltar para a mesa (senão o "fica onde está" o deixava lá). */
  voltarParaMesa?: boolean;
  /** Visita a outro agente por causa de uma mensagem social real (encontros.ts). */
  visita?: { para: AgenteId; linhas: string[]; lugarId?: string; chegou?: boolean };
  /** Alguém está vindo visitá-lo: espera onde está até a conversa acabar (senão a visita falava sozinha). */
  recebendo?: AgenteId;
  /** Balão de fala desenhado acima da cabeça até `ate`. */
  fala?: { linhas: string[]; ate: number };
}

/** Como o escritório almoça hoje: todos na copa, em duplas, ou fora (saem pelo elevador). Sorteado ao meio-dia. */
export type ModoAlmoco = 'copa' | 'duplas' | 'fora';

export interface EstadoAlmoco {
  ativo: boolean;
  /** Já houve almoço hoje (para o "almoço atrasado" de quem estava ocupado não disparar ao abrir o app às 13h30). */
  houveHoje: boolean;
  modo: ModoAlmoco;
  /** Duplas de hoje (cada um aponta para o parceiro). */
  pares: Map<AgenteId, AgenteId>;
}

export interface Simulacao {
  predio: Predio;
  agentes: AgenteVivo[];
  ocupado: Map<string, AgenteId>;
  rnd: () => number;
  elevadorAbriu: [number, number];
  /** Avisado quando um agente dispensado entra no elevador e some. */
  aoSair: (id: AgenteId) => void;
  /** Hora do MUNDO (0..24) que o prédio está vivendo; undefined até o relógio chegar (sem almoço). */
  hora?: number;
  almoco: EstadoAlmoco;
  /** Só para teste: fixa o modo do almoço em vez de sortear. */
  modoAlmocoFixo?: ModoAlmoco;
  /** Afinidade real entre dois agentes (relacoes.ts); sem ela, as duplas do almoço são sorteadas sem peso. */
  afinidade?: (a: AgenteId, b: AgenteId) => number;
}

const entre = (rnd: () => number, [a, b]: [number, number]) => a + rnd() * (b - a);
/** Tempo de uma faixa ajustado ao ritmo do agente (mais calmo = mais tempo em cada coisa). */
const tempo = (sim: Simulacao, a: AgenteVivo, faixa: [number, number]) => entre(sim.rnd, faixa) * personalidadeDe(a.def.id).ritmo;

export function criarSimulacao(predio: Predio, aoSair: (id: AgenteId) => void): Simulacao {
  return {
    predio, agentes: [], ocupado: new Map(), rnd: mulberry32(20261022), elevadorAbriu: [-1e9, -1e9], aoSair,
    almoco: { ativo: false, houveHoje: false, modo: 'copa', pares: new Map() },
  };
}

/** O prédio recebe a hora do mundo (mundo.ts manda a cada segundo). É o que dispara e encerra o almoço. */
export function definirHoraDoMundo(sim: Simulacao, hora: number): void {
  sim.hora = hora;
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
    x, y, dir: 'down', pose: 'stand', seated: false, sortY: y, parado: false, recentes: [],
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
  // almoçando fora: o status vale quando ele voltar, às 13h (mexer no `ate` traria ele de volta antes)
  if (a.almoco === 'fora' || a.almoco === 'saindo_fora') return;
  a.ate = agora;
}

// ------------------------------------------------------------------ encontros (mensagens sociais reais)

/** Quanto o balão fica na tela: o suficiente para ler, nunca fixo. */
const duracaoDaFala = (linhas: readonly string[]) => Math.min(12000, 4000 + linhas.join(' ').length * 90);

/** Dá para conversar com ele agora? (no prédio, acordado e não almoçando fora) */
function disponivel(a: AgenteVivo): boolean {
  return !a.saindo && !a.chegando && a.embarcouEm === undefined && a.status !== 'dormindo' && a.almoco !== 'fora' && a.almoco !== 'saindo_fora';
}

/** O remetente de uma mensagem social vai até o destinatário e fala. false = agora não dá (e o encontro é descartado). */
export function visitar(sim: Simulacao, de: AgenteId, para: AgenteId, linhas: string[], agora: number): boolean {
  const v = sim.agentes.find((a) => a.def.id === de);
  const alvo = sim.agentes.find((a) => a.def.id === para);
  if (!v || !alvo || v === alvo || !disponivel(v) || !disponivel(alvo) || v.parado || v.visita) return false;
  if (v.almoco === 'indo' || v.almoco === 'comendo') v.almoco = 'feito';
  v.visita = { para, linhas };
  v.ate = agora;
  alvo.recebendo = de;
  return true;
}

/** Balão em quem já está no lugar (a resposta para quem veio visitar). */
export function falar(sim: Simulacao, quem: AgenteId, linhas: string[], agora: number): boolean {
  const a = sim.agentes.find((x) => x.def.id === quem);
  if (!a || !disponivel(a)) return false;
  a.fala = { linhas, ate: agora + duracaoDaFala(linhas) };
  // vez de falar: quem estava conversando com ele cala (senão os dois balões ficavam um em cima do outro)
  for (const v of sim.agentes) {
    const interlocutor = v.visita?.para === quem || a.visita?.para === v.def.id;
    if (v !== a && interlocutor && v.fala && v.fala.ate > agora) v.fala.ate = agora;
  }
  return true;
}

/** Quem está visitando quem agora (para a resposta virar balão em vez de outra visita). */
export function visitando(sim: Simulacao): Map<AgenteId, AgenteId> {
  return new Map(sim.agentes.filter((a) => a.visita).map((a) => [a.def.id, (a.visita as NonNullable<AgenteVivo['visita']>).para]));
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

const ehComum = (l: Lugar) => l.area === 'copa' || l.area === 'recepcao';

/** O que o agente pode fazer agora: lugares livres da própria sala e das áreas comuns (e a mesa, se `comMesa`). */
function opcoesDe(sim: Simulacao, a: AgenteVivo, comMesa: boolean): Map<string, Lugar> {
  const porId = new Map<string, Lugar>();
  for (const l of sim.predio.lugares) {
    const dele = l.area === a.def.id && (!l.mesa || (comMesa && l.mesa === a.def.id));
    if (!dele && !(ehComum(l) && !l.mesa)) continue;
    const dono = sim.ocupado.get(l.id);
    if (dono && dono !== a.def.id) continue;
    porId.set(l.id, l);
  }
  return porId;
}

/** Escolhe e vai para a próxima atividade, pela personalidade. false = não achou nada (ou não há caminho). */
function proximaAtividade(sim: Simulacao, a: AgenteVivo, comMesa: boolean): boolean {
  const porId = opcoesDe(sim, a, comMesa);
  const opcoes: Opcao[] = [...porId.values()].filter((l) => l.id !== a.lugar?.id).map((l) => ({ id: l.id, rotulo: l.rotulo, fora: ehComum(l) }));
  const o = escolherAtividade(personalidadeDe(a.def.id), opcoes, a.recentes, sim.rnd);
  const l = o && porId.get(o.id);
  if (!o || !l || !irPara(sim, a, l, false)) return false;
  a.recentes = [...a.recentes, { id: o.id, fora: o.fora }].slice(-MEMORIA);
  return true;
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

// ------------------------------------------------------------------ almoço (12h às 13h do mundo)

const INICIO_ALMOCO = 12;
const FIM_ALMOCO = 13;
/** Até quando quem estava ocupado ainda almoça (sozinho, na copa). */
const FIM_ALMOCO_ATRASADO = 14;
const PESOS_ALMOCO: [ModoAlmoco, number][] = [['copa', 0.45], ['duplas', 0.35], ['fora', 0.2]];
/** Onde as duplas sentam, por rótulo do lugar: mesinha da copa, sofá da copa, recepção. */
const LUGARES_DE_DUPLA: [string, string][] = [
  ['Café na mesinha', 'Café na mesinha'],
  ['Batendo papo no sofá', 'Batendo papo no sofá'],
  ['No banco da recepção', 'Conversando na recepção'],
];

/** Sorteio do plano do almoço (puro): o modo pelo peso e as duplas embaralhadas. */
export function planejarAlmoco(
  rnd: () => number,
  ids: readonly AgenteId[],
  afinidade?: (a: AgenteId, b: AgenteId) => number,
): { modo: ModoAlmoco; pares: Map<AgenteId, AgenteId> } {
  let alvo = rnd();
  let modo: ModoAlmoco = 'copa';
  for (const [m, p] of PESOS_ALMOCO) {
    if (alvo < p) {
      modo = m;
      break;
    }
    alvo -= p;
  }
  // com afinidade real, amigos tendem a almoçar juntos (sem virar rotina fixa)
  if (afinidade) return { modo, pares: parearPorAfinidade(ids, afinidade, rnd) };
  const embaralhados = [...ids];
  for (let i = embaralhados.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
  }
  const pares = new Map<AgenteId, AgenteId>();
  for (let i = 0; i + 1 < embaralhados.length; i += 2) {
    pares.set(embaralhados[i], embaralhados[i + 1]);
    pares.set(embaralhados[i + 1], embaralhados[i]);
  }
  return { modo, pares };
}

const naJanela = (h: number | undefined, de: number, ate: number) => h !== undefined && h >= de && h < ate;

/** Abre e fecha o almoço conforme a hora do mundo. */
function cuidarDoAlmoco(sim: Simulacao, agora: number): void {
  const st = sim.almoco;
  if (sim.hora !== undefined && sim.hora < INICIO_ALMOCO) st.houveHoje = false; // manhã: dia novo
  const dentro = naJanela(sim.hora, INICIO_ALMOCO, FIM_ALMOCO);
  if (dentro && !st.ativo && !st.houveHoje) {
    const plano = planejarAlmoco(sim.rnd, sim.agentes.map((a) => a.def.id), sim.afinidade);
    st.ativo = true;
    st.houveHoje = true;
    st.modo = sim.modoAlmocoFixo ?? plano.modo;
    st.pares = plano.pares;
    for (const a of sim.agentes) {
      a.almoco = undefined;
      // quem está livre decide logo (espalhado, para não saírem todos no mesmo segundo)
      if (a.status === 'ocioso' && !a.caminho.length && !a.chegando) a.ate = Math.min(a.ate, agora + entre(sim.rnd, [0, 6000]));
    }
  }
  if (!dentro && st.ativo) {
    st.ativo = false;
    let k = 0;
    for (const a of sim.agentes) {
      if (a.almoco === 'fora') {
        // volta pelo elevador, um de cada vez
        a.almoco = 'feito';
        a.ate = agora + 400 + k++ * 900;
      } else if (a.almoco === 'comendo' || a.almoco === 'indo' || a.almoco === 'saindo_fora') {
        a.almoco = 'feito';
        a.voltarParaMesa = true;
        if (!a.caminho.length) a.ate = agora + entre(sim.rnd, [0, 5000]);
      }
    }
  }
}

function lugarPorRotulo(sim: Simulacao, rotulo: string, ignorar?: string): Lugar | undefined {
  return sim.predio.lugares.find((l) => l.rotulo === rotulo && l.id !== ignorar && ehComum(l));
}

/** Vai almoçar (true) ou não precisa/não dá (false). */
function irAlmocar(sim: Simulacao, a: AgenteVivo): boolean {
  const st = sim.almoco;
  const atrasado = !st.ativo;
  if (!atrasado && st.modo === 'fora') {
    const i = sim.agentes.indexOf(a) % 2;
    if (!irPara(sim, a, elevador(i), false)) return false;
    a.almoco = 'saindo_fora';
    return true;
  }
  if (!atrasado && st.modo === 'duplas') {
    const parceiro = st.pares.get(a.def.id);
    const p = parceiro && sim.agentes.find((x) => x.def.id === parceiro);
    if (p && p.status === 'ocioso') {
      // a dupla de índice k usa o par de lugares k; quem vem primeiro no par senta no primeiro lugar
      const ordem = [...new Set([...st.pares.keys()].map((id) => [id, st.pares.get(id) as AgenteId].sort().join('|')))];
      const k = ordem.indexOf([a.def.id, parceiro].sort().join('|'));
      const par = LUGARES_DE_DUPLA[k];
      if (par) {
        const primeiro = lugarPorRotulo(sim, par[0]);
        const segundo = lugarPorRotulo(sim, par[1], primeiro?.id);
        const meu = a.def.id < parceiro ? primeiro : segundo;
        if (meu && (!sim.ocupado.has(meu.id) || sim.ocupado.get(meu.id) === a.def.id) && irPara(sim, a, meu, false)) {
          a.almoco = 'indo';
          return true;
        }
      }
    }
  }
  // copa (o modo, o atrasado ou a dupla que não deu): um lugar livre da copa, sentado de preferência
  const livres = sim.predio.lugares.filter((l) => l.area === 'copa' && !sim.ocupado.has(l.id));
  const sentados = livres.filter((l) => l.seated);
  const alvo = (sentados.length ? sentados : livres)[Math.floor(sim.rnd() * (sentados.length || livres.length))];
  if (!alvo || !irPara(sim, a, alvo, false)) return false;
  a.almoco = 'indo';
  return true;
}

/** Ladrilhos ao redor de quem é visitado, do mais natural (ao lado) ao menos (na diagonal, a dois passos). */
const AO_REDOR: readonly [number, number][] = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, 2]];

/**
 * Onde a visita para: um ladrilho livre AO LADO de quem ela veio ver (ou de onde ele está indo, se estiver andando), na
 * mesma área. Não depende de haver um "lugar" pronto ali: antes a visita só usava lugares em pé e, sem vaga perto (a Vita
 * no balcão da recepção), ia para a sala do outro e conversava de longe.
 */
function pontoDeVisita(sim: Simulacao, a: AgenteVivo, alvo: AgenteVivo): Lugar | undefined {
  const [c0, r0] = alvo.destino ? alvo.destino.tile : tileDe(alvo.x, alvo.y);
  const area = areaEm(sim.predio, c0 * TILE + 8, r0 * TILE + 8)?.id;
  // ladrilhos de lugares reservados por outros ficam de fora (alguém vai sentar ou parar ali)
  const reservados = new Set(sim.predio.lugares.filter((l) => sim.ocupado.has(l.id) && sim.ocupado.get(l.id) !== a.def.id).map((l) => `${l.tile[0]},${l.tile[1]}`));
  for (const v of sim.agentes) if (v !== a && v.visita?.lugarId?.startsWith('visita:')) reservados.add(v.visita.lugarId.slice(7));
  for (const [dc, dr] of AO_REDOR) {
    const c = c0 + dc;
    const r = r0 + dr;
    if (!sim.predio.andavel[r]?.[c] || reservados.has(`${c},${r}`)) continue;
    const [x, y] = pesNoTile(c, r);
    if (areaEm(sim.predio, x, y - 4)?.id !== area) continue;
    // de frente para o anfitrião
    const dir = dc < 0 ? 'right' : dc > 0 ? 'left' : dr > 0 ? 'up' : 'down';
    return { id: `visita:${c},${r}`, area: area ?? alvo.def.id, tile: [c, r], x, y, dir, pose: 'talk', sortY: y, rotulo: 'Conversando' };
  }
  return undefined;
}

function soltarAnfitriao(sim: Simulacao, visitante: AgenteVivo): void {
  const alvo = sim.agentes.find((x) => x.def.id === visitante.visita?.para);
  if (alvo?.recebendo === visitante.def.id) {
    alvo.recebendo = undefined;
    alvo.ate = Math.min(alvo.ate, 0);
  }
}

/** Segue a visita em andamento. true = a decisão de agora é a visita. */
function continuarVisita(sim: Simulacao, a: AgenteVivo, agora: number): boolean {
  const v = a.visita as NonNullable<AgenteVivo['visita']>;
  if (v.chegou) {
    // ainda na conversa (falando ou ouvindo a resposta): o status do backend não interrompe
    const anfitriao = sim.agentes.find((x) => x.def.id === v.para);
    const fim = Math.max(a.fala?.ate ?? 0, anfitriao?.fala?.ate ?? 0);
    if (agora < fim) {
      a.ate = fim + 800;
      return true;
    }
    soltarAnfitriao(sim, a);
    a.visita = undefined;
    a.voltarParaMesa = true;
    return false;
  }
  if (v.lugarId && a.destino?.id === v.lugarId) {
    a.ate = agora + 1e9;
    return true;
  }
  const alvo = sim.agentes.find((x) => x.def.id === v.para);
  const l = alvo && disponivel(alvo) ? pontoDeVisita(sim, a, alvo) : undefined;
  if (!l || !irPara(sim, a, l, false)) {
    soltarAnfitriao(sim, a);
    a.visita = undefined;
    return false;
  }
  v.lugarId = l.id;
  a.ate = agora + 1e9;
  return true;
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
  // visita (mensagem social real) vem antes de tudo, menos de ir embora
  if (a.visita && continuarVisita(sim, a, agora)) return;
  // quem está sendo visitado espera onde está (termina o passo, se estiver andando) até a visita ir embora
  if (a.recebendo) {
    const visitante = sim.agentes.find((x) => x.def.id === a.recebendo);
    if (visitante?.visita?.para === a.def.id) {
      a.ate = agora + 1500;
      return;
    }
    a.recebendo = undefined;
  }
  // terminou o almoço atrasado (ou foi chamado no meio): segue a vida
  if ((a.almoco === 'comendo' || a.almoco === 'indo') && (!sim.almoco.ativo || a.status !== 'ocioso')) a.almoco = 'feito';
  // almoço: só quem está livre; quem estava ocupado vai depois, sozinho, até as 14h
  const horaDeAlmocar = sim.almoco.ativo || (sim.almoco.houveHoje && naJanela(sim.hora, FIM_ALMOCO, FIM_ALMOCO_ATRASADO));
  if (a.status === 'ocioso' && a.almoco === undefined && horaDeAlmocar && irAlmocar(sim, a)) {
    a.ate = agora + 1e9;
    return;
  }
  const naMesa = a.lugar?.id === mesa.id;
  const quer = (l: Lugar | undefined, correndo = false) => !!l && (a.lugar?.id === l.id || irPara(sim, a, l, correndo));
  if (a.voltarParaMesa) {
    a.voltarParaMesa = false;
    if (!naMesa && quer(mesa)) {
      a.ate = agora + 1e9;
      return;
    }
  }

  if (a.status === 'dormindo') {
    // dorme no descanso da própria sala (não na cadeira); se alguém estiver lá, na mesa mesmo
    const cama = descansoDe(sim, a);
    const alvo = cama && (!sim.ocupado.has(cama.id) || sim.ocupado.get(cama.id) === a.def.id) ? cama : mesa;
    if (a.lugar?.id !== alvo.id && a.destino?.id !== alvo.id) quer(alvo);
    a.ate = agora + 1e9;
    if (a.lugar?.id === alvo.id) deitar(a);
    return;
  }
  if (a.status === 'precisa_de_voce' || a.status === 'conversando' || a.status === 'pensando') {
    if (!naMesa && !a.destino) quer(mesa, a.status === 'precisa_de_voce');
    a.ate = agora + 1e9;
    if (naMesa) aplicarPoseDaMesa(a);
    return;
  }
  if (a.status === 'trabalhando') {
    if (!naMesa) {
      quer(mesa);
      a.ate = agora + tempo(sim, a, TEMPO_NA_MESA);
      return;
    }
    // pausa: a personalidade escolhe para onde (sem repetir, copa no máximo uma vez a cada três)
    a.ate = proximaAtividade(sim, a, false) ? agora + 1e9 : agora + tempo(sim, a, TEMPO_NA_MESA);
    return;
  }
  // Ocioso: sem pressa. Às vezes só fica onde está; senão faz algo da personalidade (a mesa conta como opção).
  if (a.lugar && sim.rnd() < FICAR_ONDE_ESTA) {
    a.ate = agora + tempo(sim, a, TEMPO_OCIOSO);
    return;
  }
  a.ate = proximaAtividade(sim, a, true) ? agora + 1e9 : agora + 5000;
}

function descansoDe(sim: Simulacao, a: AgenteVivo): Lugar | undefined {
  return sim.predio.lugares.find((l) => l.descanso && l.area === a.def.id);
}

/** Pose de sono em qualquer assento (a 'sleep' é sentada: cabeça baixa). */
function deitar(a: AgenteVivo): void {
  a.pose = 'sleep';
  a.seated = true;
  a.held = undefined;
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
  if (a.saindo || a.almoco === 'saindo_fora') {
    // Na frente do elevador: a porta abre, ele entra e some.
    const i = l.id === 'elevador:0' ? 0 : 1;
    sim.elevadorAbriu[i] = agora;
    a.embarcouEm = agora;
    return;
  }
  if (a.status === 'dormindo' && (l.descanso || l.mesa)) {
    deitar(a);
    a.ate = agora + 1e9;
    return;
  }
  if (a.visita?.lugarId === l.id) {
    // chegou na visita: em pé, virado para quem veio ver, e o balão com o que ele disse
    const alvo = sim.agentes.find((x) => x.def.id === a.visita?.para);
    if (alvo) a.dir = Math.abs(alvo.x - a.x) > Math.abs(alvo.y - a.y) ? (alvo.x < a.x ? 'left' : 'right') : alvo.y < a.y ? 'up' : 'down';
    // o anfitrião se vira para a visita (sentado não: a pose de assento tem direção fixa do móvel)
    if (alvo && !alvo.seated && !alvo.caminho.length) alvo.dir = a.dir === 'left' ? 'right' : a.dir === 'right' ? 'left' : a.dir === 'up' ? 'down' : 'up';
    a.pose = 'talk';
    a.held = undefined;
    a.visita.chegou = true;
    a.fala = { linhas: a.visita.linhas, ate: agora + duracaoDaFala(a.visita.linhas) };
    a.ate = a.fala.ate + 800;
    return;
  }
  if (a.almoco === 'indo') {
    // almoçando: na janela fica até as 13h (cuidarDoAlmoco libera); atrasado, só uma pausa longa
    a.almoco = 'comendo';
    a.ate = sim.almoco.ativo ? agora + 1e9 : agora + tempo(sim, a, TEMPO_NA_PAUSA) * 2;
    return;
  }
  if (l.mesa) {
    aplicarPoseDaMesa(a);
    a.ate = a.status === 'trabalhando' ? agora + tempo(sim, a, TEMPO_NA_MESA) : a.status === 'ocioso' ? agora + tempo(sim, a, TEMPO_OCIOSO) : agora + 1e9;
    return;
  }
  a.ate = agora + tempo(sim, a, a.status === 'ocioso' ? TEMPO_OCIOSO : TEMPO_NA_PAUSA);
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
  cuidarDoAlmoco(sim, agora);
  for (const a of [...sim.agentes]) {
    if (a.embarcouEm !== undefined && a.almoco === 'saindo_fora') {
      // almoço fora: some no elevador, mas continua no prédio (volta às 13h pelo mesmo caminho de quem chega)
      if (agora - a.embarcouEm > EMBARQUE_MS) {
        liberar(sim, a);
        a.embarcouEm = undefined;
        a.chegando = true;
        a.almoco = 'fora';
        a.ate = Infinity;
        const [x, y] = pesNoTile(...SAIDA_ELEVADOR[sim.agentes.indexOf(a) % 2]);
        a.x = x;
        a.y = y;
        a.sortY = y;
        a.pose = 'stand';
      }
      continue;
    }
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
  if (a.fala && agora < a.fala.ate) return undefined; // o balão já diz o que está acontecendo
  if (a.saindo) return 'wave';
  if (a.status === 'precisa_de_voce') return 'alert';
  if (a.status === 'dormindo' && (a.lugar?.mesa || a.lugar?.descanso)) return 'zzz';
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
  if (a.status === 'dormindo' && a.lugar.descanso) return 'Dormindo';
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

/** Área em que cada agente visível e ACORDADO está agora (para a luz das salas: quem dorme apaga a luz). */
export function areasOcupadas(sim: Simulacao, t: number): Set<AreaId> {
  const s = new Set<AreaId>();
  for (const a of sim.agentes) {
    if (!visivel(a, t)) continue;
    if (a.status === 'dormindo' && !a.caminho.length) continue;
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
