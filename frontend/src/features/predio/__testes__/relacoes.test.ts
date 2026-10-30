import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../habblaud/shared/hash'
import { afinidade, afinidadesDoServidor, parearPorAfinidade, seDaBemCom } from '../relacoes'

const ids: Record<number, string> = { 2: 'cifra', 3: 'agenda', 4: 'vita', 5: 'norte' }
const localDe = (id: number) => ids[id]

describe('afinidadesDoServidor', () => {
  it('a afinidade do par é a média das duas direções (o backend grava cada lado)', () => {
    const m = afinidadesDoServidor([{ agente_id: 2, alvo_agente_id: 4, afinidade: 40 }, { agente_id: 4, alvo_agente_id: 2, afinidade: 20 }], localDe)
    expect(afinidade(m, 'cifra', 'vita')).toBe(30)
    expect(afinidade(m, 'vita', 'cifra')).toBe(30)
  })
  it('só uma direção gravada: vale ela; par sem registro: zero', () => {
    const m = afinidadesDoServidor([{ agente_id: 2, alvo_agente_id: 5, afinidade: 18 }], localDe)
    expect(afinidade(m, 'norte', 'cifra')).toBe(18)
    expect(afinidade(m, 'cifra', 'agenda')).toBe(0)
  })
  it('agente que o prédio não conhece é ignorado', () => {
    expect(afinidadesDoServidor([{ agente_id: 99, alvo_agente_id: 2, afinidade: 50 }], localDe).size).toBe(0)
  })
})

describe('seDaBemCom', () => {
  it('colegas presentes do que mais se dá bem para o que menos, sem ele mesmo', () => {
    const m = afinidadesDoServidor(
      [{ agente_id: 2, alvo_agente_id: 4, afinidade: 40 }, { agente_id: 2, alvo_agente_id: 5, afinidade: 10 }, { agente_id: 2, alvo_agente_id: 3, afinidade: 25 }],
      localDe,
    )
    expect(seDaBemCom('cifra', m, ['cifra', 'vita', 'norte', 'agenda']).map((x) => x.id)).toEqual(['vita', 'agenda', 'norte'])
  })
})

describe('parearPorAfinidade (duplas do almoço)', () => {
  const amigos = afinidadesDoServidor([{ agente_id: 2, alvo_agente_id: 4, afinidade: 90 }, { agente_id: 3, alvo_agente_id: 5, afinidade: 90 }], localDe)
  const af = (a: string, b: string) => afinidade(amigos, a, b)

  it('pares simétricos; com número ímpar um fica sem par', () => {
    const p = parearPorAfinidade(['cifra', 'agenda', 'vita', 'norte', 'lume'], af, mulberry32(1))
    for (const [x, y] of p) expect(p.get(y)).toBe(x)
    expect(p.size).toBe(4)
  })

  it('quem se dá bem almoça junto bem mais vezes (mas ainda varia: não é rotina fixa)', () => {
    const rnd = mulberry32(4)
    let juntos = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (parearPorAfinidade(['cifra', 'agenda', 'vita', 'norte'], af, rnd).get('cifra') === 'vita') juntos++
    expect(juntos / N).toBeGreaterThan(0.6) // sem afinidade seria 1/3
    expect(juntos / N).toBeLessThan(0.97) // e nunca vira certeza
  })
})
