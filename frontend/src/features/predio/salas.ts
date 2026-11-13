// Modelos de sala: o que tem em cada sala, em coordenadas LOCAIS (lx 0..13 da esquerda, ly 0..7 a partir da primeira
// linha de piso). O prédio (predio.ts) só escolhe ONDE cada sala entra; a sala é a mesma em cima ou embaixo do corredor.
//
// Regras para um modelo funcionar nas duas posições:
// - a porta é nas colunas 6 e 7: deixe livres os tiles (6..7, 0) e (6..7, 7) — em cima a porta é ao sul, embaixo ao norte;
// - itens de parede fora de lx 6..8 (embaixo, a face da parede tem o vão da porta ali);
// - móveis que encostam na parede norte (estantes, geladeira) em ly 0, sem cobrir item de parede alto.
// Um modelo novo é só uma entrada aqui: nenhum desenho novo, só peças do catálogo da arte.
import type { Dir, FloorKind, FurnitureKind, HeldItem, Pose, WallStyle } from './habblaud/art/api';
import { TILE } from './habblaud/art/api';

export type Extra = 'janela' | 'quadro' | 'relogio' | 'tv' | 'placa' | 'tela';
export type ItemQuadro = { status: 'pending' | 'in_progress' | 'completed' };

export interface MovelModelo {
  kind: FurnitureKind;
  lx: number;
  ly: number;
  variant?: string;
  seed?: number;
  dx?: number;
  extra?: Extra;
}

export interface LugarModelo {
  lx: number;
  ly: number;
  sentado?: boolean;
  dx?: number;
  dir: Dir;
  pose: Pose;
  held?: HeldItem;
  rotulo: string;
  /** A mesa de trabalho do dono (a pose muda com o status). */
  mesa?: boolean;
  /** Onde o dono dorme (um por sala, sentado, fora da mesa): a pose vira 'sleep' e a luz da sala apaga. */
  descanso?: boolean;
}

export interface ModeloSala {
  piso: FloorKind;
  tint?: string;
  tint2?: string;
  parede: WallStyle;
  /** Itens de parede (ly ignorado). A placa recebe o nome do agente. */
  naParede: MovelModelo[];
  chao: MovelModelo[];
  lugares: LugarModelo[];
  tapetes?: { lx: number; ly: number; w: number; h: number; cor: string }[];
  quadro?: ItemQuadro[];
  /**
   * Colunas LOCAIS da porta [de, até). Sala de agente usa sempre [6, 8] (o padrão). Hall e copa dizem a sua: a porta do
   * hall não pode ficar embaixo dos elevadores quando ele está embaixo do corredor (a porta é na mesma parede).
   */
  porta?: [number, number];
}

const m = (kind: FurnitureKind, lx: number, ly: number, o: Partial<MovelModelo> = {}): MovelModelo => ({ kind, lx, ly, ...o });
const pe = (lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, held?: HeldItem): LugarModelo => ({ lx, ly, dir, pose, rotulo, held });
const senta = (lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, o: { held?: HeldItem; dx?: number; descanso?: boolean } = {}): LugarModelo => ({ lx, ly, dir, pose, rotulo, sentado: true, ...o });
/** Mesa do dono: cadeira virada para baixo + mesa vista por trás (o rosto fica visível). */
const mesa = (lx: number, ly: number, cadeira: string, tampo: string, seed = 1): { moveis: MovelModelo[]; lugar: LugarModelo } => ({
  moveis: [m('office_chair_front', lx, ly, { variant: cadeira, dx: TILE / 2 }), m('desk_back', lx, ly + 1, { variant: tampo, seed })],
  lugar: { lx, ly, dx: TILE / 2, dir: 'down', pose: 'type', rotulo: 'Na mesa', sentado: true, mesa: true },
});
const Q = (s: string): ItemQuadro[] => [...s].map((c) => ({ status: c === 'x' ? 'completed' : c === '>' ? 'in_progress' : 'pending' }));

// ------------------------------------------------------------------ áreas comuns (posição fixa)

export const RECEPCAO: ModeloSala = {
  porta: [3, 9],
  piso: 'marble',
  parede: { base: '#eceae6', trim: '#9aa2ae', pattern: 'marble' },
  naParede: [m('elevator', 1, 0), m('elevator', 4, 0), m('sign', 7.5, 0, { extra: 'placa' }), m('clock', 10.75, 0, { extra: 'relogio' })],
  chao: [
    m('plant_tall', 0, 0, { variant: 'ficus' }),
    m('plant_tall', 11, 0, { variant: 'palm' }),
    m('reception_desk', 7, 2, { seed: 1 }),
    m('bench', 0, 5),
    m('plant_small', 0, 7, { variant: 'flower' }),
    m('plant_small', 11, 7, { variant: 'succulent' }),
  ],
  lugares: [senta(0, 5, 'down', 'sit', 'No banco da recepção', { dx: 4 }), pe(8, 3, 'up', 'talk', 'Conversando na recepção')],
  tapetes: [{ lx: 3, ly: 4, w: 6, h: 3, cor: '#5f9e96' }],
};

export const COPA: ModeloSala = {
  porta: [4, 9],
  piso: 'tile_check',
  parede: { base: '#f6f0e5', trim: '#b99f7a', pattern: 'tiles' },
  naParede: [m('shelf_wall', 0.5, 0, { seed: 2 }), m('window', 9.5, 0, { extra: 'janela' })],
  chao: [
    m('fridge', 0, 0),
    m('coffee_machine', 1, 0),
    m('counter_sink', 2, 0),
    m('counter', 3, 0, { variant: 'drawers' }),
    m('vending_machine', 11, 0),
    m('cafe_table', 2, 3),
    m('cafe_chair', 1, 3, { variant: 'right' }),
    m('cafe_chair', 3, 3, { variant: 'left' }),
    m('arcade', 11, 3),
    m('sofa', 7, 6, { variant: 'down' }),
    m('coffee_table', 7, 7, { seed: 1 }),
    m('plant_tall', 0, 7, { variant: 'palm' }),
    m('plant_small', 11, 7, { variant: 'succulent' }),
  ],
  lugares: [
    pe(1, 1, 'up', 'use', 'Tirando um café'),
    pe(11, 1, 'up', 'use', 'Na máquina de lanches'),
    pe(0, 1, 'up', 'use', 'Abrindo a geladeira'),
    senta(1, 3, 'right', 'drink', 'Café na mesinha', { held: 'coffee' }),
    senta(3, 3, 'left', 'drink', 'Café na mesinha', { held: 'coffee' }),
    pe(11, 4, 'up', 'game', 'No fliperama', 'controller'),
    senta(7, 6, 'down', 'laugh', 'Batendo papo no sofá', { dx: 4 }),
    senta(9, 6, 'down', 'talk', 'Batendo papo no sofá', { dx: -4, held: 'coffee' }),
  ],
};

/**
 * Hall do elevador dos outros andares (o térreo tem a recepção). Os elevadores ficam à direita e a porta à esquerda:
 * assim o mesmo modelo serve em cima do corredor (porta na parede sul) e embaixo (porta na parede norte, a mesma dos
 * elevadores). Sem placa: o andar aparece no painel do elevador.
 */
export const HALL: ModeloSala = {
  porta: [1, 6],
  piso: 'marble',
  parede: { base: '#e9edf1', trim: '#8e9aab', pattern: 'marble' },
  naParede: [m('clock', 6, 0, { extra: 'relogio' }), m('elevator', 7, 0), m('elevator', 10, 0)],
  chao: [
    m('plant_tall', 0, 0, { variant: 'ficus' }),
    m('water_cooler', 11, 4),
    m('bench', 1, 6),
    m('plant_small', 0, 7, { variant: 'fern' }),
    m('plant_tall', 11, 7, { variant: 'palm' }),
  ],
  lugares: [
    senta(1, 6, 'down', 'sit', 'No banco do hall', { dx: 4 }),
    pe(11, 5, 'up', 'drink', 'No bebedouro do hall', 'water'),
    pe(5, 3, 'down', 'talk', 'Conversando no hall'),
  ],
  tapetes: [{ lx: 3, ly: 3, w: 5, h: 3, cor: '#7f8fa6' }],
};

/** Sala vazia esperando um agente: piso de obra, parede lisa e a placa "vaga". */
export const VAGA: ModeloSala = {
  piso: 'concrete',
  parede: { base: '#e3e6eb', trim: '#9aa2ae', pattern: 'plain' },
  naParede: [m('sign', 8.5, 0, { extra: 'placa' })],
  chao: [m('plant_small', 0, 7, { variant: 'succulent' }), m('plant_small', 13, 7, { variant: 'succulent' })],
  lugares: [],
};

// ------------------------------------------------------------------ salas dos agentes

const cifra = mesa(5, 1, 'green', 'dark');
const agenda = mesa(5, 1, 'blue', 'white', 2);
const vita = mesa(10, 2, 'red', 'wood', 3);
const norte = mesa(2, 2, 'black', 'dark', 6);
const lume = mesa(2, 2, 'gray', 'wood', 4);
const lar = mesa(9, 2, 'red', 'white', 5);
const rota = mesa(3, 2, 'blue', 'wood', 7);
const motriz = mesa(2, 2, 'gray', 'dark', 9);
const pauta = mesa(3, 2, 'gray', 'white', 8);

export const SALAS: Record<string, ModeloSala> = {
  // Financeiro: arquivos, pastas, impressora, segunda mesa com a planilha
  cifra: {
    piso: 'carpet', tint: '#c4d6c4', tint2: '#b6cbb6',
    parede: { base: '#eef3ec', trim: '#16a34a', pattern: 'wood_panel' },
    naParede: [m('window', 0, 0, { extra: 'janela' }), m('whiteboard', 2.5, 0, { extra: 'quadro' }), m('sign', 8.5, 0, { extra: 'placa' }), m('tv', 11.75, 0, { extra: 'tv' })],
    chao: [
      m('bookshelf', 0, 0, { seed: 3 }), ...cifra.moveis, m('trash_bin', 7, 2), m('filing_cabinet', 13, 1), m('binder_shelf', 13, 2, { seed: 2 }),
      m('binder_shelf', 13, 3, { seed: 5 }), m('printer', 0, 4), m('desk', 9, 4, { variant: 'dark', seed: 4, extra: 'tela' }),
      m('office_chair', 9, 5, { variant: 'green', dx: TILE / 2 }), m('armchair', 12, 4, { variant: 'left' }),
      m('plant_tall', 13, 7, { variant: 'monstera' }), m('plant_small', 0, 7, { variant: 'fern' }),
    ],
    lugares: [
      cifra.lugar, pe(1, 1, 'up', 'read', 'Consultando a estante', 'book'), pe(0, 5, 'up', 'use', 'Imprimindo o relatório', 'papers'),
      pe(12, 1, 'right', 'use', 'Arquivando extratos'), senta(12, 4, 'left', 'read', 'Revisando gastos na poltrona', { held: 'papers', descanso: true }),
    ],
    quadro: Q('xx>..'),
  },
  // Compromissos: cantinho de conversa, janelas, relógio
  agenda: {
    piso: 'carpet', tint: '#c3cfe4', tint2: '#b6c4dc',
    parede: { base: '#eef2fa', trim: '#2563eb', pattern: 'stripes' },
    naParede: [m('window', 0, 0, { extra: 'janela' }), m('clock', 2.25, 0, { extra: 'relogio' }), m('sign', 3, 0, { extra: 'placa' }), m('whiteboard', 8.5, 0, { extra: 'quadro' }), m('window', 12, 0, { extra: 'janela' })],
    chao: [
      m('plant_tall', 0, 0, { variant: 'bonsai' }), ...agenda.moveis, m('bookshelf', 10, 0, { seed: 7 }), m('armchair', 1, 4, { variant: 'right' }),
      m('coffee_table', 2, 4, { seed: 2 }), m('armchair', 4, 4, { variant: 'left' }), m('sofa', 10, 6, { variant: 'down' }),
      m('plant_small', 0, 7, { variant: 'flower' }), m('plant_small', 13, 0, { variant: 'fern' }),
    ],
    lugares: [
      agenda.lugar, senta(1, 4, 'right', 'talk', 'Ao telefone', { held: 'phone' }), senta(4, 4, 'left', 'read', 'Lendo a pauta', { held: 'papers' }),
      pe(10, 1, 'up', 'read', 'Procurando um contato', 'book'), pe(1, 1, 'up', 'drink', 'Olhando a janela', 'coffee'), senta(11, 6, 'down', 'sit', 'No sofá', { descanso: true }),
    ],
    tapetes: [{ lx: 1, ly: 3.4, w: 4, h: 2.6, cor: '#7d9ad6' }],
    quadro: Q('x>>...'),
  },
  // Saúde: bebedouro, puffs no tapete, plantas, espelho
  vita: {
    piso: 'wood',
    parede: { base: '#fbf1e8', trim: '#f97316', pattern: 'plain' },
    naParede: [m('mirror', 1, 0), m('painting', 2.5, 0, { seed: 3 }), m('sign', 8.5, 0, { extra: 'placa' }), m('tv', 11.75, 0, { extra: 'tv' })],
    chao: [
      m('water_cooler', 0, 0), m('plant_small', 4, 0, { variant: 'succulent' }), ...vita.moveis, m('beanbag', 2, 5, { variant: 'yellow' }),
      m('beanbag', 4, 5, { variant: 'red' }), m('fridge', 13, 4), m('plant_tall', 13, 0, { variant: 'monstera' }),
      m('plant_tall', 0, 7, { variant: 'ficus' }), m('plant_small', 13, 7, { variant: 'flower' }), m('plant_small', 9, 7, { variant: 'fern' }),
    ],
    lugares: [
      vita.lugar, pe(0, 1, 'up', 'drink', 'No bebedouro', 'water'), pe(1, 1, 'up', 'groom', 'No espelho', 'comb'), pe(3, 3, 'down', 'stretch', 'Se alongando'),
      senta(2, 5, 'down', 'read', 'No puff', { held: 'book' }), senta(4, 5, 'down', 'sit', 'Descansando no puff', { descanso: true }), pe(13, 5, 'up', 'use', 'Pegando uma fruta'),
    ],
    tapetes: [{ lx: 1, ly: 4.25, w: 5, h: 2.5, cor: '#f2a46b' }],
  },
  // Projetos: ilha de mesas, mesa de reunião, fliperama (a semente da "sala de programação")
  norte: {
    piso: 'carpet', tint: '#aab6bd', tint2: '#9faab2',
    parede: { base: '#e6eef1', trim: '#0891b2', pattern: 'brick' },
    naParede: [m('whiteboard', 1, 0, { extra: 'quadro' }), m('poster', 4.5, 0, { variant: 'ship_it' }), m('sign', 8.5, 0, { extra: 'placa' }), m('poster', 12, 0, { variant: 'bug' }), m('clock', 13, 0, { extra: 'relogio' })],
    chao: [
      m('plant_tall', 0, 0, { variant: 'palm' }), ...norte.moveis, m('desk', 2, 4, { variant: 'dark', seed: 8, extra: 'tela' }),
      m('office_chair', 2, 5, { variant: 'black', dx: TILE / 2 }), m('trash_bin', 4, 3), m('meeting_table', 9, 3, { seed: 2 }),
      m('stool', 9, 2), m('stool', 11, 2), m('stool', 9, 5), m('stool', 11, 5), m('arcade', 13, 3), m('bookshelf', 12, 0, { seed: 9 }), m('beanbag', 12, 6, { variant: 'blue' }),
      m('plant_small', 0, 7, { variant: 'fern' }),
    ],
    lugares: [
      norte.lugar, pe(2, 0, 'up', 'use', 'No quadro do projeto'), senta(9, 2, 'down', 'talk', 'Planejando na mesa de reunião', { held: 'laptop' }),
      senta(11, 5, 'up', 'read', 'Lendo um PR', { held: 'papers' }), pe(13, 4, 'up', 'game', 'No fliperama', 'controller'), pe(12, 1, 'up', 'read', 'Na estante', 'book'),
      senta(12, 6, 'down', 'game', 'Jogando no puff', { held: 'controller', descanso: true }),
    ],
    quadro: Q('xxx>...'),
  },
  // Sala de máquinas (Motriz): racks, arquivos, console de monitoramento e o painel de status na TV
  motriz: {
    piso: 'concrete',
    parede: { base: '#dfe2e8', trim: '#a855f7', pattern: 'brick' },
    naParede: [m('sign', 0.5, 0, { extra: 'placa' }), m('tv', 3.75, 0, { extra: 'tv' }), m('clock', 8.75, 0, { extra: 'relogio' })],
    chao: [
      ...motriz.moveis, m('desk', 2, 4, { variant: 'dark', seed: 10, extra: 'tela' }), m('office_chair', 2, 5, { variant: 'gray', dx: TILE / 2 }),
      m('binder_shelf', 10, 0, { seed: 21 }), m('binder_shelf', 11, 0, { seed: 22 }), m('binder_shelf', 12, 0, { seed: 23 }), m('binder_shelf', 13, 0, { seed: 24 }),
      m('filing_cabinet', 10, 3), m('filing_cabinet', 11, 3), m('filing_cabinet', 12, 3), m('filing_cabinet', 13, 3),
      m('arcade', 13, 5), m('armchair', 10, 6, { variant: 'right' }), m('printer', 0, 4), m('trash_bin', 4, 3), m('water_cooler', 0, 7), m('plant_small', 13, 7, { variant: 'succulent' }),
    ],
    lugares: [
      motriz.lugar, pe(11, 1, 'up', 'use', 'Checando os racks'), pe(12, 4, 'up', 'use', 'Conferindo as conexões'),
      pe(13, 6, 'up', 'use', 'No console de monitoramento'), pe(0, 5, 'up', 'use', 'Imprimindo o log', 'papers'), pe(4, 0, 'up', 'use', 'Olhando o painel de status'),
      senta(10, 6, 'right', 'read', 'De olho nos servidores', { held: 'laptop', descanso: true }),
    ],
  },
  // Estudos (conceito): biblioteca com poltronas de leitura
  // Secretária (Pauta): quadro de post-its, gaveteiros, estante de pastas, impressora e a poltrona de revisar a pauta
  pauta: {
    piso: 'carpet', tint: '#e3dcc2', tint2: '#d9d1b3',
    parede: { base: '#fbf7e8', trim: '#eab308', pattern: 'plain' },
    naParede: [m('window', 0, 0, { extra: 'janela' }), m('sign', 2.5, 0, { extra: 'placa' }), m('whiteboard', 10, 0, { extra: 'quadro' }), m('clock', 13, 0, { extra: 'relogio' })],
    chao: [
      ...pauta.moveis, m('binder_shelf', 8, 0, { seed: 31 }), m('binder_shelf', 9, 0, { seed: 32 }),
      m('filing_cabinet', 0, 2), m('filing_cabinet', 0, 3), m('printer', 0, 5), m('trash_bin', 5, 3),
      m('armchair', 12, 5, { variant: 'left' }), m('floor_lamp', 13, 4), m('plant_tall', 13, 7, { variant: 'bonsai' }), m('plant_small', 0, 7, { variant: 'flower' }),
    ],
    lugares: [
      pauta.lugar, pe(11, 0, 'up', 'use', 'Organizando o quadro'), pe(8, 1, 'up', 'read', 'Separando as pastas', 'papers'),
      pe(1, 3, 'left', 'use', 'Arquivando no gaveteiro'), pe(1, 5, 'left', 'use', 'Imprimindo a lista do dia'),
      senta(12, 5, 'left', 'read', 'Revisando a pauta na poltrona', { held: 'papers', descanso: true }), pe(4, 6, 'down', 'stretch', 'Pausa para respirar'),
    ],
    tapetes: [{ lx: 10.5, ly: 4.25, w: 3.5, h: 2.5, cor: '#f2d48a' }],
    quadro: Q('xx>....'),
  },
  lume: {
    piso: 'carpet', tint: '#cdc8de', tint2: '#c2bbd5',
    parede: { base: '#f1f1fa', trim: '#4f46e5', pattern: 'wood_panel' },
    naParede: [m('window', 0, 0, { extra: 'janela' }), m('sign', 2.5, 0, { extra: 'placa' }), m('clock', 12.5, 0, { extra: 'relogio' })],
    chao: [
      ...lume.moveis, m('bookshelf', 8, 0, { seed: 11 }), m('bookshelf', 10, 0, { seed: 12 }), m('binder_shelf', 13, 1, { seed: 3 }),
      m('floor_lamp', 8, 4), m('armchair', 9, 4, { variant: 'right' }), m('coffee_table', 10, 4, { seed: 3 }), m('armchair', 12, 4, { variant: 'left' }),
      m('plant_tall', 13, 7, { variant: 'bonsai' }), m('plant_small', 0, 7, { variant: 'fern' }), m('plant_small', 0, 0, { variant: 'flower' }),
    ],
    lugares: [
      lume.lugar, pe(8, 1, 'up', 'read', 'Escolhendo um livro', 'book'), pe(11, 1, 'up', 'read', 'Na estante', 'book'),
      senta(9, 4, 'right', 'read', 'Lendo na poltrona', { held: 'book', descanso: true }), senta(12, 4, 'left', 'read', 'Revisando anotações', { held: 'papers' }),
      pe(4, 5, 'down', 'stretch', 'Pausa para alongar'),
    ],
    tapetes: [{ lx: 8.5, ly: 3.25, w: 5, h: 2.5, cor: '#a58fd8' }],
  },
  // Casa e compras (conceito): cozinha, lista de compras, sofá
  lar: {
    piso: 'tile_white',
    parede: { base: '#fbf5ea', trim: '#d97706', pattern: 'tiles' },
    naParede: [m('window', 0.5, 0, { extra: 'janela' }), m('sign', 2.75, 0, { extra: 'placa' }), m('shelf_wall', 8.5, 0, { seed: 4 }), m('clock', 10.75, 0, { extra: 'relogio' }), m('window', 12, 0, { extra: 'janela' })],
    chao: [
      m('counter', 0, 0), m('counter_sink', 1, 0), m('microwave', 2, 0), m('fridge', 13, 0), m('trash_bin', 12, 0), ...lar.moveis,
      m('cafe_table', 3, 4), m('cafe_chair', 2, 4, { variant: 'right' }), m('cafe_chair', 4, 4, { variant: 'left' }),
      m('sofa', 10, 6, { variant: 'down' }), m('coffee_table', 10, 7, { seed: 4 }), m('plant_tall', 0, 7, { variant: 'palm' }), m('plant_small', 13, 7, { variant: 'flower' }),
    ],
    lugares: [
      lar.lugar, pe(1, 1, 'up', 'use', 'Lavando a louça'), pe(2, 1, 'up', 'use', 'Esquentando o almoço'), pe(13, 1, 'up', 'use', 'Conferindo a geladeira'),
      senta(2, 4, 'right', 'read', 'Fazendo a lista de compras', { held: 'papers' }), senta(4, 4, 'left', 'drink', 'Café da tarde', { held: 'coffee' }), senta(11, 6, 'down', 'sit', 'No sofá', { descanso: true }),
    ],
  },
  // Viagens (conceito): janelas, sofá, guia de viagem, mala
  rota: {
    piso: 'carpet', tint: '#e0cad2', tint2: '#d6bdc6',
    parede: { base: '#f9f2f4', trim: '#db2777', pattern: 'stripes' },
    naParede: [m('window', 0, 0, { extra: 'janela' }), m('tv', 2.25, 0, { extra: 'tv' }), m('clock', 4.5, 0, { extra: 'relogio' }), m('sign', 8.5, 0, { extra: 'placa' }), m('window', 12, 0, { extra: 'janela' })],
    chao: [
      ...rota.moveis, m('floor_lamp', 8, 2), m('sofa', 9, 2, { variant: 'down' }), m('coffee_table', 9, 3, { seed: 5 }), m('armchair', 12, 4, { variant: 'left' }),
      m('bench', 1, 6), m('plant_tall', 13, 0, { variant: 'monstera' }), m('plant_tall', 0, 0, { variant: 'palm' }), m('plant_small', 13, 7, { variant: 'flower' }),
    ],
    lugares: [
      rota.lugar, pe(1, 1, 'up', 'drink', 'Sonhando na janela', 'coffee'), senta(10, 2, 'down', 'read', 'Lendo um guia de viagem', { held: 'book', descanso: true }),
      senta(12, 4, 'left', 'talk', 'Ligando para o hotel', { held: 'phone' }), senta(1, 6, 'down', 'sit', 'Arrumando a mala', { held: 'box', dx: 4 }),
    ],
    tapetes: [{ lx: 8.5, ly: 1.5, w: 4, h: 3, cor: '#e7a0bd' }],
  },
};

// ------------------------------------------------------------------ ampliações (sala dupla)

/**
 * A metade nova de uma sala ampliada (decisão do chefe, 2026-11-13): ocupa a vaga vizinha do mesmo lado do corredor,
 * sem divisória e sem porta própria (a porta é a da sala original). Cada agente tem a sua, com estilo próprio (sala
 * de reuniões, sala de time...): é caso excepcional, não regra. Piso e parede vêm da sala original (parece um
 * ambiente só); aqui ficam só os móveis e os lugares.
 *
 * Regras para funcionar dos dois lados (a ampliação pode ficar à esquerda ou à direita da sala) e em cima ou embaixo:
 * colunas lx 0 e 13 livres nas linhas 1 a 6 (é por elas que se passa de uma metade para a outra); a ampliação.test cobra.
 */
export interface AnexoModelo {
  naParede: MovelModelo[];
  chao: MovelModelo[];
  lugares: LugarModelo[];
  tapetes?: ModeloSala['tapetes'];
}

const ANEXO_PADRAO: AnexoModelo = {
  // sala de reuniões neutra (agente conceito, ou agente novo que ainda não ganhou a sua)
  naParede: [m('whiteboard', 5, 0), m('clock', 10, 0, { extra: 'relogio' })],
  chao: [
    m('meeting_table', 5, 3, { seed: 3 }), m('stool', 5, 2), m('stool', 7, 2), m('stool', 5, 5), m('stool', 7, 5),
    m('plant_tall', 12, 0, { variant: 'ficus' }), m('plant_small', 1, 7, { variant: 'fern' }),
  ],
  lugares: [senta(5, 2, 'down', 'talk', 'Na sala de reuniões'), senta(7, 5, 'up', 'read', 'Anotando na reunião', { held: 'papers' })],
};

export const ANEXOS: Record<string, AnexoModelo> = {
  // Cifra: reunião de orçamento, com o arquivo de contratos
  cifra: {
    naParede: [m('whiteboard', 2, 0, { extra: 'quadro' }), m('clock', 10, 0, { extra: 'relogio' })],
    chao: [
      m('meeting_table', 5, 3, { seed: 7 }), m('stool', 5, 2), m('stool', 7, 2), m('stool', 5, 5), m('stool', 7, 5),
      m('filing_cabinet', 10, 0), m('filing_cabinet', 11, 0), m('binder_shelf', 12, 0, { seed: 41 }), m('plant_small', 1, 7, { variant: 'succulent' }),
    ],
    lugares: [
      senta(5, 2, 'down', 'talk', 'Reunião de orçamento', { held: 'papers' }), senta(7, 5, 'up', 'read', 'Conferindo planilhas na reunião', { held: 'papers' }),
      pe(10, 1, 'up', 'use', 'No arquivo de contratos'),
    ],
    tapetes: [{ lx: 4, ly: 2, w: 5, h: 4, cor: '#9cc49c' }],
  },
  // Agenda: sala de reuniões com TV para videochamada
  agenda: {
    naParede: [m('tv', 4, 0, { extra: 'tv' }), m('clock', 9, 0, { extra: 'relogio' })],
    chao: [
      m('meeting_table', 4, 3, { seed: 5 }), m('stool', 4, 2), m('stool', 6, 2), m('stool', 4, 5), m('stool', 6, 5),
      m('plant_tall', 12, 0, { variant: 'ficus' }), m('plant_small', 12, 7, { variant: 'flower' }),
    ],
    lugares: [
      senta(4, 2, 'down', 'talk', 'Na sala de reuniões'), senta(6, 5, 'up', 'talk', 'Apresentando a pauta', { held: 'laptop' }),
      pe(10, 3, 'down', 'talk', 'Ao telefone na reunião', 'phone'),
    ],
    tapetes: [{ lx: 3, ly: 2, w: 5, h: 4, cor: '#9fb3d8' }],
  },
  // Vita: estúdio de exercício
  vita: {
    naParede: [m('mirror', 3, 0), m('mirror', 4, 0), m('window', 9, 0, { extra: 'janela' })],
    chao: [
      m('water_cooler', 12, 0), m('beanbag', 10, 5, { variant: 'green' }), m('beanbag', 11, 5, { variant: 'yellow' }),
      m('plant_tall', 1, 7, { variant: 'monstera' }), m('plant_small', 12, 7, { variant: 'flower' }),
    ],
    lugares: [
      pe(3, 1, 'up', 'groom', 'Ajeitando o cabelo no espelho', 'comb'), pe(4, 4, 'down', 'stretch', 'Treino funcional'),
      pe(12, 1, 'up', 'drink', 'No bebedouro do estúdio', 'water'), senta(10, 5, 'down', 'sit', 'Descansando no puff do estúdio'),
    ],
    tapetes: [{ lx: 2, ly: 3, w: 6, h: 3, cor: '#f2a46b' }],
  },
  // Norte: sala de time (mais de um agente trabalhando junto)
  norte: {
    naParede: [m('poster', 2, 0, { variant: 'code' }), m('whiteboard', 5, 0, { extra: 'quadro' }), m('poster', 10, 0, { variant: 'rocket' })],
    chao: [
      m('office_chair_front', 3, 2, { variant: 'black', dx: TILE / 2 }), m('desk_back', 3, 3, { variant: 'dark', seed: 61 }),
      m('office_chair_front', 8, 2, { variant: 'blue', dx: TILE / 2 }), m('desk_back', 8, 3, { variant: 'dark', seed: 62 }),
      m('desk', 3, 5, { variant: 'dark', seed: 63, extra: 'tela' }), m('office_chair', 3, 6, { variant: 'black', dx: TILE / 2 }),
      m('plant_tall', 12, 7, { variant: 'palm' }),
    ],
    lugares: [
      senta(3, 2, 'down', 'type', 'Pareando no código', { dx: TILE / 2 }), senta(8, 2, 'down', 'type', 'Revisando com o time', { dx: TILE / 2 }),
      senta(3, 6, 'up', 'type', 'Programando na mesa do time', { dx: TILE / 2 }),
    ],
  },
  // Motriz: datacenter
  motriz: {
    naParede: [m('clock', 12, 0, { extra: 'relogio' })],
    chao: [
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((lx) => m('binder_shelf', lx, 0, { seed: 50 + lx })),
      m('filing_cabinet', 2, 4), m('filing_cabinet', 3, 4), m('filing_cabinet', 4, 4),
      m('filing_cabinet', 9, 4), m('filing_cabinet', 10, 4), m('filing_cabinet', 11, 4),
    ],
    lugares: [
      pe(6, 1, 'up', 'use', 'Checando o datacenter'), pe(3, 5, 'up', 'use', 'Trocando um disco'), pe(10, 5, 'up', 'use', 'Conferindo os cabos'),
    ],
  },
  // Pauta: sala de planejamento e arquivo morto
  pauta: {
    naParede: [m('whiteboard', 2, 0, { extra: 'quadro' }), m('window', 9, 0, { extra: 'janela' })],
    chao: [
      m('bookshelf', 6, 0, { seed: 33 }), m('filing_cabinet', 11, 0), m('filing_cabinet', 12, 0),
      m('meeting_table', 4, 4, { seed: 9 }), m('stool', 4, 3), m('stool', 6, 3), m('stool', 4, 6), m('stool', 6, 6),
      m('armchair', 11, 5, { variant: 'left' }), m('floor_lamp', 12, 4),
    ],
    lugares: [
      pe(3, 1, 'up', 'use', 'Colando post-its no quadro'), senta(4, 3, 'down', 'read', 'Planejando a semana', { held: 'papers' }),
      pe(11, 1, 'up', 'use', 'No arquivo morto'), senta(11, 5, 'left', 'read', 'Lendo a pauta na poltrona', { held: 'papers' }),
    ],
    tapetes: [{ lx: 3, ly: 3, w: 5, h: 4, cor: '#f2d48a' }],
  },
  // Lume: biblioteca
  lume: {
    naParede: [m('clock', 7, 0, { extra: 'relogio' })],
    chao: [
      m('bookshelf', 2, 0, { seed: 71 }), m('bookshelf', 4, 0, { seed: 72 }), m('bookshelf', 8, 0, { seed: 73 }), m('bookshelf', 10, 0, { seed: 74 }),
      m('armchair', 3, 4, { variant: 'right' }), m('floor_lamp', 2, 4), m('armchair', 10, 4, { variant: 'left' }), m('floor_lamp', 11, 4),
    ],
    lugares: [
      pe(3, 1, 'up', 'read', 'Procurando um livro', 'book'), pe(9, 1, 'up', 'read', 'Na biblioteca', 'book'),
      senta(3, 4, 'right', 'read', 'Lendo na biblioteca', { held: 'book' }), senta(10, 4, 'left', 'read', 'Estudando na poltrona', { held: 'book' }),
    ],
    tapetes: [{ lx: 4, ly: 3, w: 6, h: 3, cor: '#a58fd8' }],
  },
  // Lar: sala de jantar
  lar: {
    naParede: [m('window', 2, 0, { extra: 'janela' }), m('painting', 6, 0, { seed: 8 }), m('window', 10, 0, { extra: 'janela' })],
    chao: [
      m('cafe_table', 4, 3), m('cafe_chair', 3, 3, { variant: 'right' }), m('cafe_chair', 5, 3, { variant: 'left' }),
      m('cafe_table', 9, 3), m('cafe_chair', 8, 3, { variant: 'right' }), m('cafe_chair', 10, 3, { variant: 'left' }),
      m('plant_tall', 12, 0, { variant: 'palm' }), m('plant_small', 1, 7, { variant: 'flower' }),
    ],
    lugares: [
      senta(3, 3, 'right', 'drink', 'Jantando', { held: 'coffee' }), senta(10, 3, 'left', 'drink', 'Lanche da tarde', { held: 'coffee' }),
      pe(6, 6, 'down', 'stretch', 'Arrumando a mesa'),
    ],
  },
  // Rota: sala de embarque
  rota: {
    naParede: [m('window', 2, 0, { extra: 'janela' }), m('window', 5, 0, { extra: 'janela' }), m('window', 9, 0, { extra: 'janela' })],
    chao: [m('bench', 2, 5), m('bench', 8, 5), m('plant_tall', 12, 0, { variant: 'monstera' }), m('plant_small', 1, 7, { variant: 'succulent' })],
    lugares: [
      senta(2, 5, 'down', 'sit', 'Esperando o embarque', { dx: 4 }), senta(8, 5, 'down', 'read', 'Planejando o roteiro', { held: 'book', dx: 4 }),
      pe(6, 1, 'up', 'drink', 'Olhando a vista', 'coffee'),
    ],
    tapetes: [{ lx: 1, ly: 4, w: 11, h: 3, cor: '#e7a0bd' }],
  },
  // Copa maior: mais mesas, outro sofá e um segundo café
  copa: {
    naParede: [m('window', 5, 0, { extra: 'janela' }), m('shelf_wall', 9, 0, { seed: 6 })],
    chao: [
      m('coffee_machine', 11, 0), m('vending_machine', 12, 0),
      m('cafe_table', 3, 3), m('cafe_chair', 2, 3, { variant: 'right' }), m('cafe_chair', 4, 3, { variant: 'left' }),
      m('cafe_table', 9, 3), m('cafe_chair', 8, 3, { variant: 'right' }), m('cafe_chair', 10, 3, { variant: 'left' }),
      m('sofa', 5, 6, { variant: 'down' }), m('plant_small', 1, 7, { variant: 'succulent' }), m('plant_tall', 12, 7, { variant: 'palm' }),
    ],
    lugares: [
      pe(11, 1, 'up', 'use', 'Tirando um café'),
      senta(2, 3, 'right', 'drink', 'Café na mesinha', { held: 'coffee' }), senta(4, 3, 'left', 'drink', 'Café na mesinha', { held: 'coffee' }),
      senta(8, 3, 'right', 'laugh', 'Papo na mesa da copa'), senta(10, 3, 'left', 'talk', 'Papo na mesa da copa', { held: 'coffee' }),
      senta(5, 6, 'down', 'laugh', 'Batendo papo no sofá', { dx: 4 }),
    ],
  },
};

/** A ampliação de quem (agente ou 'copa'); agente sem a sua usa a sala de reuniões neutra. */
export const anexoDe = (dono: string): AnexoModelo => ANEXOS[dono] ?? ANEXO_PADRAO;
