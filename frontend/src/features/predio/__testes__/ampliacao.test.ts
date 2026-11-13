// Salas ampliadas (decisão do chefe, 2026-11-13): a sala de um agente (ou a copa) ocupa também a vaga vizinha, só para
// os lados, com uma porta só e sem parede no meio. A metade nova tem estilo próprio por agente (sala de reuniões,
// sala de time...). Estes testes cobram o modelo: alcançável em toda posição, sem divisória entre as metades e com a
// divisória com os outros vizinhos, sem porta na metade nova, e a vaga absorvida deixando de ser vaga livre.
import { describe, expect, it } from 'vitest'
import { AGENTES } from '../agentes'
import { ANDARES, TERREO, andarPorId } from '../andares'
import { lugaresInalcancaveis, montarPredio, passagem, vizinhasPossiveis, type Ampliacoes, type Area, type Predio } from '../predio'
import { ANEXOS } from '../salas'
import { adicionarAgente, criarSimulacao, passo } from '../sim'
import { TILE } from '../habblaud/art/api'

const ids = AGENTES.map((a) => a.id)
const LINHA_PISO = { cima: 2, baixo: 17 } as const
const LINHA_SUL_CIMA = 10

const anexo = (p: Predio, dono: string): Area | undefined => p.areas.find((a) => a.id === `${dono}:anexo`)

/** Linha do meio do piso de uma área: dá para atravessar de uma coluna à outra nesta linha? */
const atravessa = (p: Predio, a: Area, x: number) => passagem(p, x - 1, LINHA_PISO[a.andar] + 3, x, LINHA_PISO[a.andar] + 3)

describe('toda ampliação funciona em toda posição', () => {
  it.each(ANDARES.map((a) => [a.nome, a] as const))('%s: cada agente, em cada vaga, ampliado para cada lado possível', (_, andar) => {
    let casos = 0
    for (const id of ids) {
      for (let vaga = 0; vaga < andar.maxVagas; vaga++) {
        const vagas = Array<string | null>(andar.maxVagas).fill(null)
        vagas[vaga] = id
        for (const viz of vizinhasPossiveis(vagas, andar, id)) {
          const p = montarPredio(vagas, andar, { [viz]: id })
          const ax = anexo(p, id)
          expect(ax, `${id} na vaga ${vaga}, ampliado na ${viz}`).toBeDefined()
          expect(lugaresInalcancaveis(p).map((l) => l.id), `${id} na vaga ${vaga}, ampliado na ${viz}`).toEqual([])
          expect(p.lugares.filter((l) => l.area === ax!.id).length).toBeGreaterThan(0)
          casos++
        }
      }
    }
    // 3 colunas: as do meio ampliam para os dois lados, as das pontas para um só
    expect(casos).toBe(ids.length * 8)
  })

  it.each(ANDARES.filter((a) => a.nucleo.copa).map((a) => [a.nome, a] as const))('%s: a copa amplia para a coluna encostada nela, alcançável', (_, andar) => {
    const vagas = Array<string | null>(andar.maxVagas).fill(null)
    const [viz] = vizinhasPossiveis(vagas, andar, 'copa')
    const p = montarPredio(vagas, andar, { [viz]: 'copa' })
    const ax = anexo(p, 'copa')!
    const copa = p.areas.find((a) => a.nucleo === 'copa')!
    expect(ax.andar).toBe(copa.andar)
    // encostada: a metade nova começa onde a copa acaba, ou acaba onde a copa começa
    expect(ax.x0 === copa.x0 + copa.w || ax.x0 + ax.w === copa.x0).toBe(true)
    expect(lugaresInalcancaveis(p).map((l) => l.id)).toEqual([])
  })

  it('cada agente tem a sua ampliação, com estilo próprio (não é a mesma sala para todos)', () => {
    for (const id of ids) expect(ANEXOS[id], id).toBeDefined()
    const assinaturas = new Set(ids.map((id) => ANEXOS[id].chao.map((m) => m.kind).sort().join(',')))
    expect(assinaturas.size).toBe(ids.length)
  })
})

describe('uma sala só: sem parede no meio, uma porta só', () => {
  // Cifra embaixo na coluna do meio (vaga 3), ampliada à direita (vaga 5); a Vita à esquerda (vaga 1) fica separada
  const vagas = [null, 'vita', null, 'cifra', null, null]
  const p = montarPredio(vagas, TERREO, { 5: 'cifra' })
  const sala = p.areas.find((a) => a.id === 'cifra')!
  const ax = anexo(p, 'cifra')!

  it('entre as duas metades não há divisória; com o vizinho de lá, continua havendo', () => {
    expect(ax.x0).toBe(sala.x0 + sala.w)
    expect(atravessa(p, ax, ax.x0)).toBe(true)
    expect(atravessa(p, sala, sala.x0)).toBe(false) // parede com a sala da Vita
    // o desenho também: nenhum pilar na junção
    expect(p.divisorias.has(`${ax.x0},${LINHA_PISO.baixo}`)).toBe(false)
  })

  it('a metade nova não tem porta: o vão da porta (embaixo, na face da parede) só existe na sala original', () => {
    const vaoAberto = (a: Area) => [6, 7].some((lx) => p.andavel[LINHA_PISO.baixo - 1][a.x0 + lx])
    expect(vaoAberto(sala)).toBe(true)
    expect(vaoAberto(ax)).toBe(false)
  })

  it('em cima também: a parede sul da metade nova é fechada', () => {
    const p2 = montarPredio(['cifra', null, null, null, null, null], TERREO, { 2: 'cifra' })
    const ax2 = anexo(p2, 'cifra')!
    expect(ax2.andar).toBe('cima')
    for (let c = ax2.x0; c < ax2.x0 + ax2.w; c++) expect(p2.andavel[LINHA_SUL_CIMA][c], `coluna ${c}`).toBe(false)
  })

  it('a vaga absorvida deixa de ser vaga livre (não dá para pôr agente nela)', () => {
    expect(p.areas.some((a) => a.vaga === 5 && a.livre)).toBe(false)
    expect(p.areas.filter((a) => a.livre).map((a) => a.vaga).sort()).toEqual([0, 2, 4])
  })

  it('a metade nova usa o piso e a parede da sala original (parece um ambiente só)', () => {
    expect([ax.modelo.piso, ax.modelo.tint, ax.modelo.parede]).toEqual([sala.modelo.piso, sala.modelo.tint, sala.modelo.parede])
    expect(ax.dono).toBe('cifra') // clicar nela abre a Cifra; luz apaga com a sala vazia
  })
})

describe('dado incoerente não vira sala torta', () => {
  it('ampliação que não é vizinha, ou em vaga ocupada, é ignorada', () => {
    const vagas = ['cifra', 'vita', null, null, 'agenda', null]
    // vaga 1 é do outro lado do corredor; vaga 4 é da Agenda (e a 2 colunas)
    for (const amp of [{ 1: 'cifra' }, { 4: 'cifra' }, { 3: 'cifra' }] as Ampliacoes[]) {
      const p = montarPredio(vagas, TERREO, amp)
      expect(anexo(p, 'cifra'), JSON.stringify(amp)).toBeUndefined()
      expect(p.areas.find((a) => a.id === 'vita')).toBeDefined()
      expect(p.areas.find((a) => a.id === 'agenda')).toBeDefined()
    }
  })

  it('ampliação de quem não está no andar é ignorada (a vaga continua livre)', () => {
    const p = montarPredio([null, null, null, null, null, null], TERREO, { 2: 'cifra' })
    expect(anexo(p, 'cifra')).toBeUndefined()
    expect(p.areas.find((a) => a.vaga === 2)?.livre).toBe(true)
  })

  it('copa ampliada num andar sem copa é ignorada', () => {
    const semCopa = { ...andarPorId(1), nucleo: { ...andarPorId(1).nucleo, copa: undefined } }
    expect(vizinhasPossiveis([], semCopa, 'copa')).toEqual([])
    expect(anexo(montarPredio([], semCopa, { 0: 'copa' }), 'copa')).toBeUndefined()
  })
})

describe('obra na ampliação', () => {
  it('enquanto a obra não acaba, a metade nova não tem lugares (ninguém senta em móvel que ainda está caindo)', () => {
    const vagas = ['cifra', null, null, null, null, null]
    expect(montarPredio(vagas, TERREO, { 2: 'cifra' }, new Set([2])).lugares.filter((l) => l.area === 'cifra:anexo')).toEqual([])
    expect(montarPredio(vagas, TERREO, { 2: 'cifra' }).lugares.filter((l) => l.area === 'cifra:anexo').length).toBeGreaterThan(0)
  })
})

describe('na simulação', () => {
  it('o dono usa a ampliação; o colega do lado nunca entra nela', () => {
    const p = montarPredio(['cifra', 'vita', 'agenda', null, null, null], TERREO, { 3: 'vita' })
    const sim = criarSimulacao(p, () => undefined)
    adicionarAgente(sim, 'vita', 0, { jaNaMesa: true, status: 'ocioso' })
    adicionarAgente(sim, 'cifra', 0, { jaNaMesa: true, status: 'ocioso' })
    const areasDe = new Map<string, Set<string>>([['vita', new Set()], ['cifra', new Set()]])
    for (let t = 50; t <= 4 * 60 * 60_000; t += 50) {
      passo(sim, t, 50)
      for (const a of sim.agentes) if (a.destino) areasDe.get(a.def.id)!.add(a.destino.area)
    }
    expect(areasDe.get('vita')!.has('vita:anexo')).toBe(true)
    expect(areasDe.get('cifra')!.has('vita:anexo')).toBe(false)
  })

  it('a copa ampliada é de todos: qualquer um vai tomar café nela', () => {
    // a copa do térreo é embaixo: amplia na vaga 1 (coluna encostada, embaixo)
    const vagas = ['cifra', null, 'vita', null, null, null]
    const [viz] = vizinhasPossiveis(vagas, TERREO, 'copa')
    expect(viz).toBe(1)
    const p = montarPredio(vagas, TERREO, { [viz]: 'copa' })
    expect(anexo(p, 'copa')).toBeDefined()
    const sim = criarSimulacao(p, () => undefined)
    adicionarAgente(sim, 'cifra', 0, { jaNaMesa: true, status: 'ocioso' })
    adicionarAgente(sim, 'vita', 0, { jaNaMesa: true, status: 'ocioso' })
    const foram = new Set<string>()
    for (let t = 50; t <= 6 * 60 * 60_000; t += 50) {
      passo(sim, t, 50)
      for (const a of sim.agentes) if (a.destino?.area === 'copa:anexo') foram.add(a.def.id)
    }
    expect(foram.size).toBeGreaterThan(0)
  })

  it('o ponto de junção é largo: dá para passar de uma metade para a outra em várias linhas', () => {
    const p = montarPredio(['cifra', null, null, null, null, null], TERREO, { 2: 'cifra' })
    const ax = anexo(p, 'cifra')!
    const linhas = Array.from({ length: 8 }, (_, ly) => LINHA_PISO.cima + ly)
      .filter((r) => p.andavel[r][ax.x0 - 1] && p.andavel[r][ax.x0] && passagem(p, ax.x0 - 1, r, ax.x0, r))
    expect(linhas.length).toBeGreaterThanOrEqual(4)
    expect(TILE).toBe(16)
  })
})
