import { describe, expect, it } from 'vitest'
import { AGENTES } from '../agentes'
import { MAX_VAGAS, lugaresInalcancaveis, mesaDe, montarPredio } from '../predio'
import { SALAS } from '../salas'
import { adicionarAgente, criarSimulacao, passo } from '../sim'

// Dado e lógica do prédio — não pixel (o desenho se confere no navegador). O que quebra fácil ao mexer num
// modelo de sala é um móvel fechando o caminho até um lugar, ou a porta: é isso que estes testes pegam.

describe('modelos de sala', () => {
  it('todo agente do catálogo tem sala e mesa', () => {
    for (const a of AGENTES) {
      expect(SALAS[a.id], a.id).toBeDefined()
      expect(SALAS[a.id].lugares.filter((l) => l.mesa), a.id).toHaveLength(1)
    }
  })

  it.each(AGENTES.map((a) => a.id))('sala %s: todo lugar é alcançável, em cima e embaixo do corredor', (id) => {
    const emCima = montarPredio([id, null])
    const embaixo = montarPredio([null, id])
    expect(lugaresInalcancaveis(emCima).map((l) => l.id)).toEqual([])
    expect(lugaresInalcancaveis(embaixo).map((l) => l.id)).toEqual([])
  })
})

describe('montagem do prédio', () => {
  it('cresce de duas em duas vagas e mantém a recepção e a copa', () => {
    const p = montarPredio(['cifra', 'vita', 'agenda', 'norte', 'motriz', null])
    expect(p.areas.map((a) => a.id)).toEqual(['recepcao', 'copa', 'cifra', 'vita', 'agenda', 'norte', 'motriz', 'vaga-5'])
    expect(p.cols).toBe(12 + 3 * 14)
  })

  it('prédio cheio (8 agentes) continua todo alcançável', () => {
    const ids = AGENTES.map((a) => a.id).slice(0, MAX_VAGAS)
    const p = montarPredio(ids)
    expect(lugaresInalcancaveis(p).map((l) => l.id)).toEqual([])
    for (const id of ids) expect(mesaDe(p, id), id).toBeDefined()
  })

  it('vaga livre fica fechada: nenhum lugar dentro dela', () => {
    const p = montarPredio(['cifra', null, null, null])
    expect(p.lugares.some((l) => l.area.startsWith('vaga-'))).toBe(false)
  })
})

describe('simulação', () => {
  it('agente que chega pelo elevador anda até a mesa e senta', () => {
    const p = montarPredio(['cifra', 'vita', 'agenda', 'norte'])
    const sim = criarSimulacao(p, () => undefined)
    adicionarAgente(sim, 'norte', 0, { chegaEm: 0, status: 'trabalhando' })
    for (let t = 50; t <= 30000; t += 50) passo(sim, t, 50)
    const a = sim.agentes[0]
    expect(a.lugar?.mesa).toBe('norte')
    expect(a.pose).toBe('type')
  })

  it('precisa de você: corre para a mesa e levanta a mão', () => {
    const p = montarPredio(['cifra', 'vita', 'agenda', 'norte'])
    const sim = criarSimulacao(p, () => undefined)
    adicionarAgente(sim, 'agenda', 0, { chegaEm: 0, status: 'precisa_de_voce' })
    for (let t = 50; t <= 20000; t += 50) passo(sim, t, 50)
    expect(sim.agentes[0].pose).toBe('raise_hand')
  })
})
