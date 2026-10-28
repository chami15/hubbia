import { describe, expect, it } from 'vitest'
import { AGENTES } from '../agentes'
import { montarPredio } from '../predio'
import { personalidadeDe } from '../personalidade'
import { SALAS } from '../salas'
import { adicionarAgente, areasOcupadas, criarSimulacao, passo } from '../sim'
import { statusNoPredio } from '../status'

describe('descanso: cada sala tem um lugar para dormir que não é a cadeira da mesa', () => {
  it.each(AGENTES.map((a) => [a.id]))('%s tem exatamente um descanso, sentado e fora da mesa', (id) => {
    const descansos = SALAS[id].lugares.filter((l) => l.descanso)
    expect(descansos).toHaveLength(1)
    expect(descansos[0].sentado).toBe(true)
    expect(descansos[0].mesa).toBeFalsy()
  })

  it('o descanso vira um Lugar do prédio marcado (e alcançável, como todo lugar: predio.test cobra)', () => {
    const p = montarPredio(['norte', 'motriz'])
    expect(p.lugares.filter((l) => l.descanso).map((l) => l.area).sort()).toEqual(['motriz', 'norte'])
  })
})

describe('sono individual (hora do mundo + personalidade)', () => {
  it('à meia-noite o Cifra dorme e o Norte, noturno, segue acordado', () => {
    expect(statusNoPredio('idle', false, 0, personalidadeDe('cifra').sono)).toBe('dormindo')
    expect(statusNoPredio('idle', false, 0, personalidadeDe('norte').sono)).toBe('ocioso')
    expect(statusNoPredio('idle', false, 3, personalidadeDe('norte').sono)).toBe('dormindo')
  })

  it('o que o backend está fazendo continua mandando: executando não dorme', () => {
    expect(statusNoPredio('executando', false, 0, personalidadeDe('cifra').sono)).toBe('trabalhando')
  })

  it('agente conceito (sem backend) também tem dia e noite: ocioso de dia, dormindo de noite', () => {
    expect(statusNoPredio(undefined, false, 14, personalidadeDe('lume').sono)).toBe('ocioso')
    expect(statusNoPredio(undefined, false, 2, personalidadeDe('lume').sono)).toBe('dormindo')
  })
})

describe('regressão: dormia sentado na cadeira da mesa, com a luz da sala acesa', () => {
  // O que acontecia: "dormindo" levava o agente para a mesa (pose sleep na cadeira) e a sala contava como ocupada,
  // então a luz ficava acesa a noite inteira. Agora ele vai ao descanso da sala e a luz da sala dele apaga.
  function dormir(id: string) {
    const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
    adicionarAgente(sim, id, 0, { jaNaMesa: true, status: 'dormindo' })
    for (let t = 50; t <= 40_000; t += 50) passo(sim, t, 50)
    return { sim, a: sim.agentes[0] }
  }

  it('vai dormir no descanso, com a pose de sono', () => {
    const { a } = dormir('agenda')
    expect(a.lugar?.descanso).toBe(true)
    expect(a.lugar?.mesa).toBeUndefined()
    expect(a.pose).toBe('sleep')
  })

  it('quem dorme não acende a sala', () => {
    const { sim } = dormir('vita')
    expect(areasOcupadas(sim, 40_000).has('vita')).toBe(false)
  })

  it('acordado na sala, a sala conta como ocupada (luz acesa)', () => {
    const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
    adicionarAgente(sim, 'vita', 0, { jaNaMesa: true, status: 'trabalhando' })
    passo(sim, 50, 50)
    expect(areasOcupadas(sim, 50).has('vita')).toBe(true)
  })
})
