import { describe, expect, it } from 'vitest'
import { AGENTES } from '../agentes'
import { ANDARES, TERREO, andarPorId } from '../andares'
import { lugaresInalcancaveis, montarPredio } from '../predio'

const ids = AGENTES.map((a) => a.id)

describe('cada andar se monta inteiro a partir do dado', () => {
  it.each(ANDARES.map((a) => [a.nome, a] as const))('%s: todo lugar alcançável, cheio de salas', (_, andar) => {
    const p = montarPredio(ids.slice(0, andar.maxVagas), andar)
    expect(lugaresInalcancaveis(p).map((l) => l.id)).toEqual([])
  })

  it.each(ANDARES.map((a) => [a.nome, a] as const))('%s: toda sala funciona em toda vaga (em cima e embaixo do corredor)', (_, andar) => {
    for (const id of ids) {
      for (let vaga = 0; vaga < andar.maxVagas; vaga++) {
        const vagas = Array<string | null>(andar.maxVagas).fill(null)
        vagas[vaga] = id
        const ruins = lugaresInalcancaveis(montarPredio(vagas, andar))
        expect(ruins.map((l) => l.id), `${id} na vaga ${vaga}`).toEqual([])
      }
    }
  })

  it.each(ANDARES.map((a) => [a.nome, a] as const))('%s: tem elevador, e dá para chegar na frente de cada um', (_, andar) => {
    const p = montarPredio([], andar)
    expect(p.elevadores.length).toBeGreaterThan(0)
    for (const { tile: [c, r] } of p.elevadores) expect(p.andavel[r][c], `elevador em ${c},${r}`).toBe(true)
    // os índices batem com a ordem: é por eles que a porta certa abre
    expect(p.naParede.filter((m) => m.kind === 'elevator').map((m) => m.elevador)).toEqual(p.elevadores.map((_, i) => i))
  })
})

describe('o hall de cada andar fica num canto diferente (pedido do chefe)', () => {
  it('térreo: recepção em cima à esquerda; 2º andar: hall embaixo à direita, com copa própria', () => {
    const terreo = montarPredio(['cifra', 'vita', 'agenda', 'norte'], TERREO)
    const segundo = montarPredio([], andarPorId(1))
    const hallT = terreo.areas.find((a) => a.nucleo === 'hall')!
    const hall2 = segundo.areas.find((a) => a.nucleo === 'hall')!
    expect([hallT.id, hallT.x0, hallT.andar]).toEqual(['recepcao', 0, 'cima'])
    expect([hall2.id, hall2.x0 > 0, hall2.andar]).toEqual(['hall', true, 'baixo'])
    expect(segundo.areas.some((a) => a.nucleo === 'copa')).toBe(true)
  })

  it('núcleo à direita não anda: o andar tem largura fixa, cheio ou vazio', () => {
    // andar maior que o mínimo de 2 colunas: com 4 salas, o "fixo" e o "pelas vagas" dariam o mesmo e o teste não provaria nada
    const andar = { ...andarPorId(1), maxVagas: 8 }
    const vazio = montarPredio([], andar)
    const cheio = montarPredio(ids.slice(0, andar.maxVagas), andar)
    expect(cheio.W).toBe(vazio.W)
    expect(cheio.areas.find((a) => a.id === 'hall')!.x0).toBe(vazio.areas.find((a) => a.id === 'hall')!.x0)
  })

  it('térreo e 2º andar têm a mesma disposição: 8 salas e a mesma largura (decisão do chefe)', () => {
    const terreo = montarPredio([], TERREO)
    const segundo = montarPredio([], andarPorId(1))
    expect(terreo.areas.filter((a) => a.vaga !== undefined)).toHaveLength(8)
    expect(segundo.areas.filter((a) => a.vaga !== undefined)).toHaveLength(8)
    expect(segundo.W).toBe(terreo.W)
  })

  it('vazio, o 2º andar mostra as vagas livres (esperando o agente de investimentos)', () => {
    const p = montarPredio([], andarPorId(1))
    expect(p.areas.filter((a) => a.livre)).toHaveLength(andarPorId(1).maxVagas)
  })
})

describe('porta não fica embaixo de item de parede', () => {
  it('em toda área embaixo do corredor (a porta é na parede de cima, a mesma dos elevadores e quadros)', () => {
    for (const andar of ANDARES) {
      const p = montarPredio(ids.slice(0, andar.maxVagas), andar)
      for (const mv of p.naParede.filter((m) => m.area.andar === 'baixo')) {
        const largura = { elevator: 2, whiteboard: 3, window: 2, sign: 3, painting: 2, tv: 2, shelf_wall: 2 }[mv.kind as string] ?? 1
        const [p0, p1] = mv.area.porta
        const sobrepoe = mv.lx < p1 && mv.lx + largura > p0
        expect(sobrepoe, `${andar.nome}: ${mv.kind} em ${mv.area.id} (lx ${mv.lx}) x porta [${p0}, ${p1})`).toBe(false)
      }
    }
  })
})
