import { describe, expect, it } from 'vitest'
import { TEMPOS, avancarTroca, iniciarTroca, sentido, type Troca } from '../trocaDeAndar'

/** Roda a troca de 10 em 10 ms e devolve em que instantes e para onde o andar desenhado mudou. */
function rodar(t0: Troca, ate = 5000) {
  let t: Troca | null = t0
  const trocas: { em: number; fase: string; andar: number }[] = []
  let fim = -1
  for (let agora = t0.inicio; agora <= t0.inicio + ate && t; agora += 10) {
    const fase: string = t.fase
    const r = avancarTroca(t, agora)
    if (r.mostrar !== undefined) trocas.push({ em: agora, fase, andar: r.mostrar })
    t = r.troca
    if (!t) fim = agora
  }
  return { trocas, fim }
}

describe('troca de andar (as portas do elevador)', () => {
  it('o andar troca uma vez só, no fim do fechar das portas (nunca com o prédio à mostra)', () => {
    const { trocas, fim } = rodar(iniciarTroca(null, 0, 1, 1000)!)
    expect(trocas).toEqual([{ em: 1000 + TEMPOS.fechar, fase: 'fechando', andar: 1 }])
    expect(fim).toBe(1000 + TEMPOS.fechar + TEMPOS.fechado + TEMPOS.abrir)
  })

  it('clique durante a troca é ignorado (não embaralha as portas nem troca duas vezes)', () => {
    const t = iniciarTroca(null, 0, 1, 0)!
    expect(iniciarTroca(t, 1, 0, 100)).toBeNull()
  })

  it('mesmo andar: nada acontece', () => {
    expect(iniciarTroca(null, 1, 1, 0)).toBeNull()
  })

  it('a seta do mostrador indica subir ou descer', () => {
    expect(sentido({ de: 0, para: 1 })).toBe('▲')
    expect(sentido({ de: 2, para: 0 })).toBe('▼')
  })
})
