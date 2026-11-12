// A troca de andar na tela, como num elevador (pedido do chefe): as portas fecham por cima do prédio, o mostrador
// diz para onde vai, o andar é trocado com tudo escondido, e as portas abrem no andar novo. Puro e testado
// (__testes__/trocaDeAndar.test.ts): o andar só troca com as portas fechadas, e um clique no meio não embaralha nada.
import type { AndarId } from './andares'

export type FaseTroca = 'fechando' | 'fechado' | 'abrindo'

export interface Troca {
  de: AndarId
  para: AndarId
  fase: FaseTroca
  /** Quando a fase atual começou (ms). */
  inicio: number
}

export interface Tempos {
  fechar: number
  fechado: number
  abrir: number
}

export const TEMPOS: Tempos = { fechar: 420, fechado: 560, abrir: 420 }
/** Com "reduzir movimento" do sistema: sem portas deslizando, só um corte rápido. */
export const TEMPOS_REDUZIDOS: Tempos = { fechar: 0, fechado: 160, abrir: 0 }

/** Começa uma troca. null = nada a fazer (mesmo andar) ou já tem uma em andamento (o clique é ignorado). */
export function iniciarTroca(emAndamento: Troca | null, de: AndarId, para: AndarId, agora: number): Troca | null {
  if (emAndamento || de === para) return null
  return { de, para, fase: 'fechando', inicio: agora }
}

/**
 * Avança a troca no instante `agora`. `mostrar` vem preenchido UMA vez, quando as portas acabam de fechar: é a hora
 * de trocar o andar desenhado. `troca: null` = acabou (portas abertas no andar novo).
 */
export function avancarTroca(t: Troca, agora: number, tempos: Tempos = TEMPOS): { troca: Troca | null; mostrar?: AndarId } {
  const passou = agora - t.inicio
  if (t.fase === 'fechando' && passou >= tempos.fechar) return { troca: { ...t, fase: 'fechado', inicio: agora }, mostrar: t.para }
  if (t.fase === 'fechado' && passou >= tempos.fechado) return { troca: { ...t, fase: 'abrindo', inicio: agora } }
  if (t.fase === 'abrindo' && passou >= tempos.abrir) return { troca: null }
  return { troca: t }
}

/** Seta do mostrador: subindo ou descendo. */
export const sentido = (t: Pick<Troca, 'de' | 'para'>): '▲' | '▼' => (t.para > t.de ? '▲' : '▼')
