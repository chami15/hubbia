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
}

const m = (kind: FurnitureKind, lx: number, ly: number, o: Partial<MovelModelo> = {}): MovelModelo => ({ kind, lx, ly, ...o });
const pe = (lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, held?: HeldItem): LugarModelo => ({ lx, ly, dir, pose, rotulo, held });
const senta = (lx: number, ly: number, dir: Dir, pose: Pose, rotulo: string, o: { held?: HeldItem; dx?: number } = {}): LugarModelo => ({ lx, ly, dir, pose, rotulo, sentado: true, ...o });
/** Mesa do dono: cadeira virada para baixo + mesa vista por trás (o rosto fica visível). */
const mesa = (lx: number, ly: number, cadeira: string, tampo: string, seed = 1): { moveis: MovelModelo[]; lugar: LugarModelo } => ({
  moveis: [m('office_chair_front', lx, ly, { variant: cadeira, dx: TILE / 2 }), m('desk_back', lx, ly + 1, { variant: tampo, seed })],
  lugar: { lx, ly, dx: TILE / 2, dir: 'down', pose: 'type', rotulo: 'Na mesa', sentado: true, mesa: true },
});
const Q = (s: string): ItemQuadro[] => [...s].map((c) => ({ status: c === 'x' ? 'completed' : c === '>' ? 'in_progress' : 'pending' }));

// ------------------------------------------------------------------ áreas comuns (posição fixa)

export const RECEPCAO: ModeloSala = {
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
      pe(12, 1, 'right', 'use', 'Arquivando extratos'), senta(12, 4, 'left', 'read', 'Revisando gastos na poltrona', { held: 'papers' }),
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
      pe(10, 1, 'up', 'read', 'Procurando um contato', 'book'), pe(1, 1, 'up', 'drink', 'Olhando a janela', 'coffee'), senta(11, 6, 'down', 'sit', 'No sofá'),
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
      senta(2, 5, 'down', 'read', 'No puff', { held: 'book' }), senta(4, 5, 'down', 'sit', 'Descansando no puff'), pe(13, 5, 'up', 'use', 'Pegando uma fruta'),
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
      m('stool', 9, 2), m('stool', 11, 2), m('stool', 9, 5), m('stool', 11, 5), m('arcade', 13, 3), m('bookshelf', 12, 0, { seed: 9 }),
      m('plant_small', 0, 7, { variant: 'fern' }),
    ],
    lugares: [
      norte.lugar, pe(2, 0, 'up', 'use', 'No quadro do projeto'), senta(9, 2, 'down', 'talk', 'Planejando na mesa de reunião', { held: 'laptop' }),
      senta(11, 5, 'up', 'read', 'Lendo um PR', { held: 'papers' }), pe(13, 4, 'up', 'game', 'No fliperama', 'controller'), pe(12, 1, 'up', 'read', 'Na estante', 'book'),
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
      m('arcade', 13, 5), m('printer', 0, 4), m('trash_bin', 4, 3), m('water_cooler', 0, 7), m('plant_small', 13, 7, { variant: 'succulent' }),
    ],
    lugares: [
      motriz.lugar, pe(11, 1, 'up', 'use', 'Checando os racks'), pe(12, 4, 'up', 'use', 'Conferindo as conexões'),
      pe(13, 6, 'up', 'use', 'No console de monitoramento'), pe(0, 5, 'up', 'use', 'Imprimindo o log', 'papers'), pe(4, 0, 'up', 'use', 'Olhando o painel de status'),
    ],
  },
  // Estudos (conceito): biblioteca com poltronas de leitura
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
      senta(9, 4, 'right', 'read', 'Lendo na poltrona', { held: 'book' }), senta(12, 4, 'left', 'read', 'Revisando anotações', { held: 'papers' }),
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
      senta(2, 4, 'right', 'read', 'Fazendo a lista de compras', { held: 'papers' }), senta(4, 4, 'left', 'drink', 'Café da tarde', { held: 'coffee' }), senta(11, 6, 'down', 'sit', 'No sofá'),
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
      rota.lugar, pe(1, 1, 'up', 'drink', 'Sonhando na janela', 'coffee'), senta(10, 2, 'down', 'read', 'Lendo um guia de viagem', { held: 'book' }),
      senta(12, 4, 'left', 'talk', 'Ligando para o hotel', { held: 'phone' }), senta(1, 6, 'down', 'sit', 'Arrumando a mala', { held: 'box', dx: 4 }),
    ],
    tapetes: [{ lx: 8.5, ly: 1.5, w: 4, h: 3, cor: '#e7a0bd' }],
  },
};
