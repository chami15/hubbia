import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { adicionarAgente, criarSimulacao, passo } from '../sim'
import { statusNoPredio } from '../status'

describe('statusNoPredio: do estado do backend para o que o prédio desenha', () => {
  it('mensagem não lida pesa mais que qualquer estado', () => {
    for (const e of ['idle', 'pensando', 'falando', 'executando'] as const) expect(statusNoPredio(e, true, 12)).toBe('precisa_de_voce')
  })

  it('de madrugada quem está ocioso cochila; quem trabalha continua', () => {
    expect(statusNoPredio('idle', false, 3)).toBe('dormindo')
    expect(statusNoPredio('executando', false, 3)).toBe('trabalhando')
  })

  it('durante o dia: idle é ocioso, falando é conversando', () => {
    expect(statusNoPredio('idle', false, 14)).toBe('ocioso')
    expect(statusNoPredio('falando', false, 14)).toBe('conversando')
  })
})

describe('regressão: pensando e executando eram indistinguíveis no prédio', () => {
  // No escritório isométrico cada estado do backend tinha animação própria no crachá (pontilhado em `pensando`,
  // cometa em `executando`; ver docs/frontend-design.md). Na migração para o prédio os dois viraram "trabalhando"
  // e o chefe deixou de ver se o agente estava só pensando ou já executando.
  it('os quatro estados do backend dão quatro aparências diferentes', () => {
    const vistos = (['idle', 'pensando', 'falando', 'executando'] as const).map((e) => statusNoPredio(e, false, 14))
    expect(new Set(vistos).size).toBe(4)
  })

  function pose(status: 'pensando' | 'trabalhando') {
    const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
    adicionarAgente(sim, 'cifra', 0, { jaNaMesa: true, status })
    for (let t = 50; t <= 2000; t += 50) passo(sim, t, 50)
    return sim.agentes[0].pose
  }

  it('quem pensa fica na mesa lendo; quem executa fica digitando', () => {
    expect(pose('pensando')).toBe('read')
    expect(pose('trabalhando')).toBe('type')
  })
})
