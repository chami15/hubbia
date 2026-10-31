// Personalidade de cada agente no prédio: quando dorme, o quão calmo é, o quanto sai da sala e do que mais gosta de fazer.
// É o que faz cada um "parecer ele mesmo" (Norte no fliperama, Vita se alongando, Cifra nas papeladas) sem rotina fixa:
// a escolha continua sorteada (rotina.ts), só que com preferência. Custo zero: é tudo visual.
//
// Agente novo: ganhe uma entrada aqui (o teste cobra que todo agente tem e que os favoritos existem na sala dele).
import { AGENTES, type AgenteId } from './agentes'
import type { Humor } from './humor'

export interface Personalidade {
  /** Horas do MUNDO em que dorme, se estiver ocioso: [dorme, acorda). Pode atravessar a meia-noite ([22, 6]). */
  sono: [number, number]
  /** Multiplica os tempos na mesa e nas pausas: maior = mais calmo, levanta menos. */
  ritmo: number
  /** 0..1: chance de uma pausa ser fora da própria sala (copa, recepção). */
  saiDaSala: number
  /** Peso de cada atividade da própria sala, pelo rótulo do lugar (salas.ts). Rótulo que não está aqui pesa 1. */
  favoritos: Record<string, number>
}

export const PERSONALIDADE_PADRAO: Personalidade = { sono: [23, 7], ritmo: 1, saiDaSala: 0.2, favoritos: {} }

export const PERSONALIDADES: Record<AgenteId, Personalidade> = {
  // metódico: levanta pouco, quase não sai da sala, gosta de revisar gastos e arquivar
  cifra: {
    sono: [22, 6], ritmo: 1.3, saiDaSala: 0.15,
    favoritos: { 'Revisando gastos na poltrona': 3, 'Arquivando extratos': 2, 'Imprimindo o relatório': 1.5 },
  },
  // social: é quem mais circula, vive ao telefone
  agenda: {
    sono: [23, 6], ritmo: 1, saiDaSala: 0.35,
    favoritos: { 'Ao telefone': 3, 'Lendo a pauta': 2 },
  },
  // ativa e madrugadora: alonga, bebe água, come fruta
  vita: {
    sono: [22, 5], ritmo: 0.9, saiDaSala: 0.25,
    favoritos: { 'Se alongando': 3, 'No bebedouro': 2.5, 'Pegando uma fruta': 1.5 },
  },
  // noturno: fliperama, PRs e quadro do projeto; dorme tarde e acorda tarde
  norte: {
    sono: [2, 9], ritmo: 1, saiDaSala: 0.2,
    favoritos: { 'No fliperama': 3, 'Lendo um PR': 2, 'No quadro do projeto': 2 },
  },
  // noturno e vigilante: quase sempre de olho no console e nos racks
  motriz: {
    sono: [3, 9], ritmo: 1.4, saiDaSala: 0.1,
    favoritos: { 'No console de monitoramento': 3, 'Checando os racks': 2, 'Olhando o painel de status': 2 },
  },
  lume: { sono: [23, 7], ritmo: 1.3, saiDaSala: 0.1, favoritos: { 'Lendo na poltrona': 3, 'Escolhendo um livro': 2 } },
  lar: { sono: [22, 6], ritmo: 1, saiDaSala: 0.2, favoritos: { 'Esquentando o almoço': 2, 'Fazendo a lista de compras': 2 } },
  rota: { sono: [0, 8], ritmo: 1, saiDaSala: 0.3, favoritos: { 'Sonhando na janela': 2, 'Lendo um guia de viagem': 2 } },
}

export function personalidadeDe(id: AgenteId): Personalidade {
  return PERSONALIDADES[id] ?? PERSONALIDADE_PADRAO
}

/** Está na janela de sono? `hora` é a hora do mundo (0..24, com fração). */
export function horaDeDormir(p: Pick<Personalidade, 'sono'>, hora: number): boolean {
  const [dorme, acorda] = p.sono
  return dorme <= acorda ? hora >= dorme && hora < acorda : hora >= dorme || hora < acorda
}

// ------------------------------------------------------------------ autonomia por traço real (ideias do 3D, fase 4)

/** Chance máxima de uma pausa ser fora da sala, para extroversão 10. Acima disso o prédio vira formigueiro de novo. */
const SAI_DA_SALA_MAX = 0.4

/**
 * Extroversão do banco (0..10, do seed) → gosto por sair da sala. É o traço REAL: o mesmo número que o backend usa
 * nas relações. Linear de propósito: 5 dá 0,2, o padrão de antes, então ninguém muda de comportamento sem motivo.
 */
export function saiDaSalaPelaExtroversao(extroversao: number): number {
  return (Math.min(10, Math.max(0, extroversao)) / 10) * SAI_DA_SALA_MAX
}

/**
 * O que o humor pede (fase 3 → escolha): tenso procura café, entediado procura companhia (sofá da copa, recepção).
 * Os outros humores só mudam a postura: ansioso espera resposta na mesa, contido não tem orçamento, preocupado e
 * orgulhoso não pedem lugar. Somar em vez de fixar mantém a diferença entre um tímido e um extrovertido.
 */
const PEDIDO_DO_HUMOR: Partial<Record<Humor, { saiDaSala: number; favoritos: Record<string, number> }>> = {
  tenso: { saiDaSala: 0.3, favoritos: { 'Tirando um café': 4 } },
  entediado: { saiDaSala: 0.2, favoritos: { 'Batendo papo no sofá': 3, 'Conversando na recepção': 3 } },
}

/** Personalidade de agora: a escrita aqui, com a extroversão do backend (se veio) e o que o humor pede. */
export function personalidadeEfetiva(id: AgenteId, tracos?: { extroversao?: number }, humor?: Humor): Personalidade {
  const base = personalidadeDe(id)
  let saiDaSala = tracos?.extroversao !== undefined ? saiDaSalaPelaExtroversao(tracos.extroversao) : base.saiDaSala
  let favoritos = base.favoritos
  const pedido = humor && PEDIDO_DO_HUMOR[humor]
  if (pedido) {
    saiDaSala = Math.min(1, saiDaSala + pedido.saiDaSala)
    favoritos = { ...favoritos, ...pedido.favoritos }
  }
  return { ...base, saiDaSala, favoritos }
}

/** Limiares dos traços do painel: só o que de fato muda o comportamento no prédio. */
const EXTROVERTIDO = 7
const RESERVADO = 3
const CALMO = 1.25

/**
 * Até três traços para o painel, com a concordância do agente (artigo 'a' = feminino). Cada um corresponde a algo
 * visível: extrovertido sai mais da sala, noturno dorme depois da meia-noite, madrugador acorda cedo, calmo levanta
 * menos. Sem a extroversão do backend, não diz nada sobre ela (não inventa traço a partir da reserva local).
 */
export function tracosDe(id: AgenteId, extroversao?: number): string[] {
  const p = personalidadeDe(id)
  const fem = AGENTES.find((a) => a.id === id)?.artigo === 'a'
  const g = (masc: string, femi: string) => (fem ? femi : masc)
  const t: string[] = []
  if (extroversao !== undefined && extroversao >= EXTROVERTIDO) t.push(g('extrovertido', 'extrovertida'))
  if (extroversao !== undefined && extroversao <= RESERVADO) t.push(g('reservado', 'reservada'))
  const [dorme, acorda] = p.sono
  if (dorme <= 4) t.push(g('noturno', 'noturna'))
  else if (acorda <= 5) t.push(g('madrugador', 'madrugadora'))
  if (p.ritmo >= CALMO) t.push('calm' + (fem ? 'a' : 'o'))
  return t.slice(0, 3)
}
