import { describe, expect, it } from 'vitest'
import { criarRelogio } from '../relogio'

describe('regressão: aba escondida acumulava tempo e os agentes "teleportavam" ao voltar', () => {
  // O relógio de parede seguia andando com a aba escondida (o rAF para, o tempo não). Ao voltar, a simulação
  // recebia minutos de uma vez. O relógio do prédio tem de parar junto com a aba.
  function relogioFalso() {
    let t = 1000
    return { parede: () => t, passar: (ms: number) => (t += ms) }
  }

  it('não conta o tempo em que ficou pausado', () => {
    const f = relogioFalso()
    const r = criarRelogio(f.parede)
    f.passar(500)
    expect(r.agora()).toBe(500)
    r.pausar()
    f.passar(10 * 60 * 1000) // dez minutos com a aba escondida
    expect(r.agora()).toBe(500) // congelado durante a pausa
    r.retomar()
    expect(r.agora()).toBe(500) // e continua de onde parou
    f.passar(250)
    expect(r.agora()).toBe(750)
  })

  it('pausar duas vezes seguidas não perde tempo nem estoura a conta', () => {
    const f = relogioFalso()
    const r = criarRelogio(f.parede)
    r.pausar()
    f.passar(1000)
    r.pausar() // evento repetido do navegador
    f.passar(1000)
    r.retomar()
    r.retomar() // idem
    f.passar(100)
    expect(r.agora()).toBe(100)
  })
})
