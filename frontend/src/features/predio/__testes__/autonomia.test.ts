import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { personalidadeDe, personalidadeEfetiva, saiDaSalaPelaExtroversao, tracosDe } from '../personalidade'
import { adicionarAgente, criarSimulacao, definirHumores, definirTracos, passo } from '../sim'

describe('gosto por sair da sala vem da extroversão real (seed = fonte única)', () => {
  it('0 a 10 vira 0% a 40% de chance de a pausa ser fora da sala', () => {
    expect(saiDaSalaPelaExtroversao(0)).toBe(0)
    expect(saiDaSalaPelaExtroversao(8)).toBeCloseTo(0.32)
    expect(saiDaSalaPelaExtroversao(15)).toBeCloseTo(0.4) // fora da faixa: limita
  })
  it('sem o dado do backend, fica o valor escrito na personalidade (reserva)', () => {
    expect(personalidadeEfetiva('cifra').saiDaSala).toBe(personalidadeDe('cifra').saiDaSala)
    expect(personalidadeEfetiva('cifra', { extroversao: 5 }).saiDaSala).toBeCloseTo(0.2)
  })
})

describe('humor guia a escolha (ideias do 3D, 6.4)', () => {
  it('tenso procura café: sai mais da sala e o café pesa muito mais', () => {
    const p = personalidadeEfetiva('cifra', { extroversao: 5 }, 'tenso')
    expect(p.saiDaSala).toBeGreaterThan(0.4)
    expect(p.favoritos['Tirando um café']).toBeGreaterThanOrEqual(4)
  })
  it('entediado procura companhia: sofá da copa e recepção pesam mais', () => {
    const p = personalidadeEfetiva('norte', { extroversao: 3 }, 'entediado')
    expect(p.saiDaSala).toBeGreaterThan(0.3)
    expect(p.favoritos['Batendo papo no sofá']).toBeGreaterThanOrEqual(3)
  })
  it('sem humor (ou humor que não pede nada), personalidade de sempre', () => {
    expect(personalidadeEfetiva('cifra', { extroversao: 5 }, 'orgulhoso')).toEqual(personalidadeEfetiva('cifra', { extroversao: 5 }))
  })
})

function saidas(extroversao: number, humor?: 'tenso') {
  const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
  adicionarAgente(sim, 'vita', 0, { jaNaMesa: true, status: 'ocioso' })
  definirTracos(sim, new Map([['vita', { extroversao }]]))
  if (humor) definirHumores(sim, new Map([['vita', { humor }]]), 0)
  const a = sim.agentes[0]
  const destinos: string[] = []
  let ultimo = a.destino?.id
  for (let t = 50; t <= 90 * 60_000; t += 50) {
    passo(sim, t, 50)
    if (a.destino && a.destino.id !== ultimo) destinos.push(a.destino.rotulo + '@' + a.destino.area)
    ultimo = a.destino?.id
  }
  const fora = destinos.filter((d) => d.endsWith('@copa') || d.endsWith('@recepcao'))
  return { fora: fora.length, cafe: destinos.filter((d) => d.startsWith('Tirando um café')).length, total: destinos.length }
}

describe('no prédio: o traço e o humor aparecem no que o agente faz', () => {
  it('extrovertido sai da sala mais que introvertido (mesma sorte, só o traço muda)', () => {
    const extro = saidas(10)
    const intro = saidas(0)
    expect(intro.fora).toBe(0)
    expect(extro.fora).toBeGreaterThan(intro.fora + 3)
  })
  it('tenso tira mais café', () => {
    expect(saidas(5, 'tenso').cafe).toBeGreaterThan(saidas(5).cafe)
  })
})

describe('tracosDe: traços que aparecem no painel e que de fato mudam o comportamento', () => {
  it('Vita: extrovertida e madrugadora; Norte: reservado e noturno; Motriz: calmo', () => {
    expect(tracosDe('vita', 8)).toEqual(expect.arrayContaining(['extrovertida', 'madrugadora']))
    expect(tracosDe('norte', 3)).toEqual(expect.arrayContaining(['reservado', 'noturno']))
    expect(tracosDe('motriz', 2)).toEqual(expect.arrayContaining(['calmo']))
  })
  it('no máximo três, e sem o dado do backend não inventa extroversão', () => {
    expect(tracosDe('vita', 8).length).toBeLessThanOrEqual(3)
    expect(tracosDe('vita')).not.toEqual(expect.arrayContaining(['extrovertida']))
  })
})

describe('favorito fora da sala também pesa (é por onde o humor pede café)', () => {
  it('saindo da sala, o café com peso 4 sai 80% das vezes', async () => {
    const { escolherAtividade } = await import('../rotina')
    const p = { ...personalidadeDe('cifra'), saiDaSala: 1, favoritos: { 'Tirando um café': 4 } }
    const opcoes = [
      { id: 'cafe', rotulo: 'Tirando um café', fora: true },
      { id: 'sofa', rotulo: 'Batendo papo no sofá', fora: true },
    ]
    let cafe = 0
    for (let i = 0; i < 100; i++) {
      const r = [0, (i + 0.5) / 100]
      if (escolherAtividade(p, opcoes, [], () => r.shift()!)?.id === 'cafe') cafe++
    }
    expect(cafe).toBe(80) // 4 / (4 + 1); com o café pesando 1, seria 50
  })
})
