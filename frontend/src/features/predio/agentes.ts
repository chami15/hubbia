// Registro dos agentes que o prédio sabe receber: identidade (nome, cor, função), a ponte com o backend
// (especialidade) e a aparência em pixel art. Só dado — quem desenha é predio.ts (com a arte do habblaud) e quem
// decide o comportamento é sim.ts.
//
// A aparência é FIXA (não sorteada): cada agente tem uma identidade visual só dele, com a cor do agente na roupa
// (a mesma de `avatar_config.cor` no banco). A `seed` só preencheria o que as `parts` não dizem — e as parts
// cobrem tudo, então trocar a seed não muda ninguém.
import type { AppearanceParts } from './habblaud/shared/appearance'
import type { IconName, ScreenMode } from './habblaud/art/api'

/** Id local do agente (cifra, agenda...). É também o id do modelo da sala dele (salas.ts). */
export type AgenteId = string

export interface AgenteVisual {
  id: AgenteId
  nome: string
  /** "da Cifra", "do Norte". */
  artigo: 'a' | 'o'
  cor: number
  // Com qual agente do BACKEND este corresponde. O agente do backend tem id NUMÉRICO (GET /agentes), sem
  // relação com o id string daqui — a única chave que liga os dois é a especialidade. null = agente conceito,
  // que ainda não existe no backend (só a arte e a sala estão prontas).
  especialidade: string | null
  // O que o agente FAZ, em português, pra barra do painel. Separado da especialidade de propósito: aquela é
  // chave de junção (tem que bater com o banco), esta é texto de tela.
  funcao: string
  look: 'f' | 'm'
  seed: number
  parts: AppearanceParts
  /** Ícone que aparece de vez em quando sobre a cabeça enquanto trabalha (o "assunto" dele). */
  icone: IconName
  /** O que a tela da sala mostra enquanto ele trabalha. */
  tela: ScreenMode
}

export const AGENTES: AgenteVisual[] = [
  {
    id: 'cifra',
    nome: 'Cifra',
    artigo: 'a',
    cor: 0x16a34a,
    especialidade: 'financeiro',
    funcao: 'finanças e extratos',
    look: 'm',
    seed: 101,
    parts: {
      skin: '#eab894', hair: '#3b2a20', hairStyle: 'side_part', eyes: '#4a2f22',
      top: '#f4f4f0', topAccent: '#16a34a', topStyle: 'shirt_tie', bottom: '#2f3b55', bottomStyle: 'pants', shoes: '#3a2a20',
      accessory: 'glasses', accessoryColor: '#2b2b33', facialHair: 'none',
    },
    icone: 'coin',
    tela: 'tasks',
  },
  {
    id: 'agenda',
    nome: 'Agenda',
    artigo: 'a',
    cor: 0x2563eb,
    especialidade: 'agenda',
    funcao: 'compromissos e calendário',
    look: 'f',
    seed: 202,
    parts: {
      skin: '#f6cfb0', hair: '#1f1a17', hairStyle: 'bun', eyes: '#2b2236',
      top: '#2563eb', topAccent: '#dfe7ef', topStyle: 'blouse', bottom: '#3d4352', bottomStyle: 'skirt', shoes: '#2b2b33',
      accessory: 'earrings', accessoryColor: '#f2c14e', facialHair: 'none',
    },
    icone: 'chat',
    tela: 'chat',
  },
  {
    id: 'vita',
    nome: 'Vita',
    artigo: 'a',
    cor: 0xf97316,
    especialidade: 'saude',
    funcao: 'saúde e rotina',
    look: 'f',
    seed: 303,
    parts: {
      skin: '#bd8560', hair: '#5a3623', hairStyle: 'ponytail', eyes: '#3c2a1e',
      top: '#f97316', topAccent: '#f4f4f0', topStyle: 'tshirt', bottom: '#2f3b55', bottomStyle: 'shorts', shoes: '#f4f4f0',
      accessory: 'none', accessoryColor: '#2b2b33', facialHair: 'none',
    },
    icone: 'heart',
    tela: 'progress',
  },
  {
    id: 'norte',
    nome: 'Norte',
    artigo: 'o',
    cor: 0x0891b2,
    especialidade: 'norte',
    funcao: 'projetos e código',
    look: 'm',
    seed: 404,
    parts: {
      skin: '#d69f78', hair: '#2a2420', hairStyle: 'curly', eyes: '#2b2236',
      top: '#0891b2', topAccent: '#f4f4f0', topStyle: 'hoodie', bottom: '#262a33', bottomStyle: 'pants', shoes: '#e8e3d6',
      accessory: 'headphones', accessoryColor: '#2b2b33', facialHair: 'stubble',
    },
    icone: 'idea',
    tela: 'code',
  },
  {
    // O agente da sala de máquinas: não gasta LLM, cuida de orçamento, chaves e conexões. Até aqui ele não tinha
    // lugar no escritório (mesa null no seed); no prédio ganha a sala de máquinas, que abre o painel de infra.
    id: 'motriz',
    nome: 'Motriz',
    artigo: 'o',
    cor: 0xa855f7,
    especialidade: 'infra',
    funcao: 'sala de máquinas',
    look: 'm',
    seed: 808,
    parts: {
      skin: '#f6cfb0', hair: '#4a4a52', hairStyle: 'buzz', eyes: '#2b2236',
      top: '#a855f7', topAccent: '#f4f4f0', topStyle: 'jacket', bottom: '#262a33', bottomStyle: 'pants', shoes: '#2b2b33',
      accessory: 'cap', accessoryColor: '#2b2b33', facialHair: 'mustache',
    },
    icone: 'lightning',
    tela: 'terminal',
  },
  {
    id: 'lume',
    nome: 'Lume',
    artigo: 'a',
    cor: 0x4f46e5,
    especialidade: null,
    funcao: 'estudos (conceito)',
    look: 'f',
    seed: 505,
    parts: {
      skin: '#ffe2cc', hair: '#c0703a', hairStyle: 'bob', eyes: '#3c7a52',
      top: '#4f46e5', topAccent: '#f4f4f0', topStyle: 'sweater', bottom: '#3d4352', bottomStyle: 'skirt', shoes: '#5a3b22',
      accessory: 'glasses', accessoryColor: '#5a3a28', facialHair: 'none',
    },
    icone: 'star',
    tela: 'docs',
  },
  {
    id: 'lar',
    nome: 'Lar',
    artigo: 'o',
    cor: 0xd97706,
    especialidade: null,
    funcao: 'casa e compras (conceito)',
    look: 'm',
    seed: 606,
    parts: {
      skin: '#9a6444', hair: '#1f1a17', hairStyle: 'buzz', eyes: '#2b2236',
      top: '#d97706', topAccent: '#f4f4f0', topStyle: 'polo', bottom: '#55613b', bottomStyle: 'pants', shoes: '#3a2a20',
      accessory: 'none', accessoryColor: '#2b2b33', facialHair: 'beard',
    },
    icone: 'box',
    tela: 'search',
  },
  {
    id: 'rota',
    nome: 'Rota',
    artigo: 'a',
    cor: 0xdb2777,
    especialidade: null,
    funcao: 'viagens (conceito)',
    look: 'f',
    seed: 707,
    parts: {
      skin: '#7a4a31', hair: '#2a2420', hairStyle: 'wavy', eyes: '#2b2236',
      top: '#db2777', topAccent: '#f4f4f0', topStyle: 'jacket', bottom: '#2f3b55', bottomStyle: 'pants', shoes: '#f4f4f0',
      accessory: 'sunglasses', accessoryColor: '#22232b', facialHair: 'none',
    },
    icone: 'wave',
    tela: 'browser',
  },
]

/** Quem entra no prédio na primeira visita: os agentes que existem no backend. */
export const INICIAIS: readonly AgenteId[] = ['cifra', 'agenda', 'vita', 'norte', 'motriz']

export const agentePorId = (id: AgenteId): AgenteVisual | undefined => AGENTES.find((a) => a.id === id)

export const ehConceito = (a: AgenteVisual): boolean => a.especialidade === null

export function corCss(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`
}
