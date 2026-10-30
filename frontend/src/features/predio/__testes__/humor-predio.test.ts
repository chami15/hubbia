import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { adicionarAgente, criarSimulacao, definirHumores, passo, pensar, poseDoHumor } from '../sim'

function predio() {
  const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
  adicionarAgente(sim, 'cifra', 0, { jaNaMesa: true, status: 'ocioso' })
  let t = 0
  const rodar = (ms: number) => {
    for (const fim = t + ms; t < fim; ) {
      t += 50
      passo(sim, t, 50)
    }
  }
  return { sim, rodar, cifra: sim.agentes[0], agora: () => t }
}

describe('poseDoHumor: o humor vira postura com as poses que a arte já tem', () => {
  it.each([
    ['tenso', true, 'sulk'],
    ['preocupado', false, 'sulk'],
    ['entediado', true, 'wait'],
    ['entediado', false, 'stretch'],
    ['contido', true, 'wait'],
  ] as const)('%s (sentado: %s) → %s', (humor, sentado, pose) => {
    expect(poseDoHumor(humor, sentado)).toBe(pose)
  })
  it('ansioso não muda a postura (o "precisa de você" já corre e levanta a mão)', () => {
    expect(poseDoHumor('ansioso', true)).toBeUndefined()
  })
})

describe('humor no prédio', () => {
  it('ocioso na mesa com humor tenso fica cabisbaixo em vez de só sentado', () => {
    const { sim, cifra, agora } = predio()
    expect(cifra.pose).toBe('sit')
    definirHumores(sim, new Map([['cifra', { humor: 'tenso', motivo: '3 chamadas falharam hoje.' }]]), agora())
    expect(cifra.pose).toBe('sulk')
  })

  it('sem humor, volta à pose de sempre', () => {
    const { sim, cifra, agora } = predio()
    definirHumores(sim, new Map([['cifra', { humor: 'tenso', motivo: 'x' }]]), agora())
    definirHumores(sim, new Map(), agora())
    expect(cifra.pose).toBe('sit')
  })

  it('orgulhoso comemora uma vez, por pouco tempo, e volta ao normal', () => {
    const { sim, cifra, rodar, agora } = predio()
    definirHumores(sim, new Map([['cifra', { humor: 'orgulhoso', motivo: 'x' }]]), agora())
    expect(cifra.pose).toBe('cheer')
    rodar(4000)
    expect(cifra.pose).not.toBe('cheer')
    // o mesmo humor de novo (outra rodada do React) não comemora outra vez
    definirHumores(sim, new Map([['cifra', { humor: 'orgulhoso', motivo: 'x' }]]), agora())
    expect(cifra.pose).not.toBe('cheer')
  })

  it('pensar: balão de pensamento com o motivo, que some sozinho', () => {
    const { sim, cifra, rodar, agora } = predio()
    expect(pensar(sim, 'cifra', ['3 chamadas falharam hoje.'], agora())).toBe(true)
    expect(cifra.fala).toMatchObject({ linhas: ['3 chamadas falharam hoje.'], pensamento: true })
    rodar(15_000)
    expect((cifra.fala?.ate ?? 0) <= agora()).toBe(true)
  })
})
