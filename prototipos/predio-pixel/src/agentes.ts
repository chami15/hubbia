// Os agentes do hubbia vestidos com a arte do habblaud. A aparência é FIXA (não sorteada): cada agente tem uma
// identidade visual só dele, com a cor do agente na roupa (a mesma cor que já vem do banco). A `seed` só preenche
// o que as `parts` não dizem — e como as parts cobrem tudo, trocar a seed não muda ninguém.
import type { AppearanceParts } from './habblaud/shared/appearance';
import type { IconName, ScreenMode } from './habblaud/art/api';

/** Id do agente; é também o id do modelo da sala dele (salas.ts). */
export type AgenteId = string;

/** Estados que o prédio sabe desenhar. Os nomes são os do hubbia; "precisa de você" é o "esperando você" do habblaud. */
export type Status = 'trabalhando' | 'ocioso' | 'precisa_de_voce' | 'dormindo';

export interface Agente {
  id: AgenteId;
  nome: string;
  dominio: string;
  /** Cor do agente (a do banco). */
  cor: string;
  look: 'f' | 'm';
  seed: number;
  parts: AppearanceParts;
  /** Ícone que aparece de vez em quando sobre a cabeça enquanto trabalha (o "assunto" dele). */
  icone: IconName;
  /** O que a tela da sala mostra enquanto ele trabalha. */
  tela: ScreenMode;
  /** Como se conversa com ele (docs/frontend-design.md): o painel de cada um é diferente. */
  interacao: string;
  /** Atalho de campo único que vive na bolha do agente, sem abrir o painel (só a Vita tem hoje). */
  atalho?: { rotulo: string; campos: string[] };
  /** Agente que ainda não existe no backend: só a arte e a sala estão prontas. */
  conceito?: boolean;
  /** "da Cifra", "do Norte". */
  artigo: 'a' | 'o';
}

/** Catálogo: todos os agentes que o prédio sabe receber. A pessoa escolhe quais entram. */
export const CATALOGO: readonly Agente[] = [
  {
    id: 'cifra',
    nome: 'Cifra',
    artigo: 'a',
    dominio: 'Financeiro',
    cor: '#16a34a',
    look: 'm',
    seed: 101,
    parts: {
      skin: '#eab894', hair: '#3b2a20', hairStyle: 'side_part', eyes: '#4a2f22',
      top: '#f4f4f0', topAccent: '#16a34a', topStyle: 'shirt_tie', bottom: '#2f3b55', bottomStyle: 'pants', shoes: '#3a2a20',
      accessory: 'glasses', accessoryColor: '#2b2b33', facialHair: 'none',
    },
    icone: 'coin',
    tela: 'tasks',
    interacao: 'Painel com dashboard do mês e relatório mensal — sem chat.',
  },
  {
    id: 'agenda',
    nome: 'Agenda',
    artigo: 'a',
    dominio: 'Compromissos',
    cor: '#2563eb',
    look: 'f',
    seed: 202,
    parts: {
      skin: '#f6cfb0', hair: '#1f1a17', hairStyle: 'bun', eyes: '#2b2236',
      top: '#2563eb', topAccent: '#dfe7ef', topStyle: 'blouse', bottom: '#3d4352', bottomStyle: 'skirt', shoes: '#2b2b33',
      accessory: 'earrings', accessoryColor: '#f2c14e', facialHair: 'none',
    },
    icone: 'chat',
    tela: 'chat',
    interacao: 'Chat: propõe ações e espera você confirmar ou rejeitar.',
  },
  {
    id: 'vita',
    nome: 'Vita',
    artigo: 'a',
    dominio: 'Saúde',
    cor: '#f97316',
    look: 'f',
    seed: 303,
    parts: {
      skin: '#bd8560', hair: '#5a3623', hairStyle: 'ponytail', eyes: '#3c2a1e',
      top: '#f97316', topAccent: '#f4f4f0', topStyle: 'tshirt', bottom: '#2f3b55', bottomStyle: 'shorts', shoes: '#f4f4f0',
      accessory: 'none', accessoryColor: '#2b2b33', facialHair: 'none',
    },
    icone: 'heart',
    tela: 'progress',
    interacao: 'Menu de ações com formulários (refeição, treino, sono...) — sem chat.',
    atalho: { rotulo: 'Registro rápido', campos: ['Peso (kg)', 'Água (ml)'] },
  },
  {
    id: 'norte',
    nome: 'Norte',
    artigo: 'o',
    dominio: 'Projetos',
    cor: '#0891b2',
    look: 'm',
    seed: 404,
    parts: {
      skin: '#d69f78', hair: '#2a2420', hairStyle: 'curly', eyes: '#2b2236',
      top: '#0891b2', topAccent: '#f4f4f0', topStyle: 'hoodie', bottom: '#262a33', bottomStyle: 'pants', shoes: '#e8e3d6',
      accessory: 'headphones', accessoryColor: '#2b2b33', facialHair: 'stubble',
    },
    icone: 'idea',
    tela: 'code',
    interacao: 'Um card por vez por projeto: aceitar, rejeitar, marcar como feito.',
  },
  {
    id: 'lume',
    nome: 'Lume',
    artigo: 'a',
    dominio: 'Estudos',
    cor: '#8b5cf6',
    look: 'f',
    seed: 505,
    parts: {
      skin: '#ffe2cc', hair: '#c0703a', hairStyle: 'bob', eyes: '#3c7a52',
      top: '#8b5cf6', topAccent: '#f4f4f0', topStyle: 'sweater', bottom: '#3d4352', bottomStyle: 'skirt', shoes: '#5a3b22',
      accessory: 'glasses', accessoryColor: '#5a3a28', facialHair: 'none',
    },
    icone: 'star',
    tela: 'docs',
    interacao: 'Plano de estudos, revisões espaçadas e resumos (conceito).',
    conceito: true,
  },
  {
    id: 'lar',
    nome: 'Lar',
    artigo: 'o',
    dominio: 'Casa e compras',
    cor: '#d97706',
    look: 'm',
    seed: 606,
    parts: {
      skin: '#9a6444', hair: '#1f1a17', hairStyle: 'buzz', eyes: '#2b2236',
      top: '#d97706', topAccent: '#f4f4f0', topStyle: 'polo', bottom: '#55613b', bottomStyle: 'pants', shoes: '#3a2a20',
      accessory: 'none', accessoryColor: '#2b2b33', facialHair: 'beard',
    },
    icone: 'box',
    tela: 'search',
    interacao: 'Lista de compras, contas da casa e manutenção (conceito).',
    conceito: true,
  },
  {
    id: 'rota',
    nome: 'Rota',
    artigo: 'a',
    dominio: 'Viagens',
    cor: '#db2777',
    look: 'f',
    seed: 707,
    parts: {
      skin: '#7a4a31', hair: '#2a2420', hairStyle: 'wavy', eyes: '#2b2236',
      top: '#db2777', topAccent: '#f4f4f0', topStyle: 'jacket', bottom: '#2f3b55', bottomStyle: 'pants', shoes: '#f4f4f0',
      accessory: 'sunglasses', accessoryColor: '#22232b', facialHair: 'none',
    },
    icone: 'wave',
    tela: 'browser',
    interacao: 'Roteiros, reservas e documentos da viagem (conceito).',
    conceito: true,
  },
];

/** Os agentes que já existem no backend (entram no prédio na primeira visita). */
export const INICIAIS: readonly AgenteId[] = ['cifra', 'agenda', 'vita', 'norte'];

export const agentePorId = (id: AgenteId): Agente => CATALOGO.find((a) => a.id === id) as Agente;

export const STATUS_ROTULO: Record<Status, string> = {
  trabalhando: 'Trabalhando',
  ocioso: 'Ocioso',
  precisa_de_voce: 'Precisa de você',
  dormindo: 'Dormindo',
};
