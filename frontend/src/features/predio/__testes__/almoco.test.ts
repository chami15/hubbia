import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { adicionarAgente, criarSimulacao, figuras, passo, definirHoraDoMundo, mudarStatus, type ModoAlmoco, type Status } from '../sim'

const IDS = ['cifra', 'vita', 'agenda', 'norte']

function predio(modo: ModoAlmoco, status: Partial<Record<string, Status>> = {}) {
  const sim = criarSimulacao(montarPredio(IDS), () => undefined)
  sim.modoAlmocoFixo = modo // o sorteio do plano do dia é testado à parte; aqui o modo é fixo
  let aoSair = 0
  sim.aoSair = () => aoSair++
  for (const id of IDS) adicionarAgente(sim, id, 0, { jaNaMesa: true, status: status[id] ?? 'ocioso' })
  let t = 0
  const rodar = (hora: number, ms: number) => {
    definirHoraDoMundo(sim, hora)
    for (const fim = t + ms; t < fim; ) {
      t += 50
      passo(sim, t, 50)
    }
  }
  return { sim, rodar, saidas: () => aoSair, agora: () => t }
}

const area = (sim: ReturnType<typeof predio>['sim'], id: string) => sim.agentes.find((a) => a.def.id === id)!.lugar?.area

describe('almoço das 12h às 13h do mundo', () => {
  it('antes do meio-dia ninguém vai almoçar', () => {
    const { sim, rodar } = predio('copa')
    rodar(11.5, 60_000)
    expect(sim.agentes.every((a) => a.almoco === undefined)).toBe(true)
  })

  it('modo copa: ao meio-dia todos os livres vão para a copa e ficam até as 13h', () => {
    const { sim, rodar } = predio('copa')
    rodar(12, 60_000)
    expect(IDS.map((id) => area(sim, id))).toEqual(['copa', 'copa', 'copa', 'copa'])
    rodar(12.9, 60_000)
    expect(IDS.every((id) => area(sim, id) === 'copa')).toBe(true) // não levantam no meio do almoço
  })

  it('às 13h voltam para a própria sala', () => {
    const { sim, rodar } = predio('copa')
    rodar(12, 60_000)
    rodar(13.1, 90_000)
    expect(IDS.filter((id) => area(sim, id) === 'copa')).toHaveLength(0)
  })

  it('modo duplas: cada dupla almoça junta, no mesmo lugar', () => {
    const { sim, rodar } = predio('duplas')
    rodar(12, 70_000)
    const pares = sim.almoco.pares
    expect(pares.size).toBe(4)
    const rotulo = (id: string) => sim.agentes.find((a) => a.def.id === id)!.lugar?.rotulo
    for (const [a, b] of pares) {
      expect(area(sim, a)).toBe(area(sim, b))
      expect(rotulo(a)).toBe(rotulo(b)) // sentados juntos: mesinha com mesinha, sofá com sofá
    }
    expect(new Set(IDS.map(rotulo)).size).toBe(2) // duas duplas, dois cantos diferentes
  })

  it('modo fora: saem pelo elevador, somem, e voltam às 13h sem desmontar a sala', () => {
    const { sim, rodar, saidas } = predio('fora')
    rodar(12, 70_000)
    expect(figuras(sim, 70_000)).toHaveLength(0) // ninguém no prédio
    expect(sim.agentes).toHaveLength(4) // mas ninguém foi dispensado
    rodar(13.05, 90_000)
    expect(figuras(sim, 160_000)).toHaveLength(4)
    expect(saidas()).toBe(0) // a sala de ninguém foi desmontada
    expect(IDS.every((id) => area(sim, id) === id)).toBe(true) // de volta à própria sala
  })

  it('quem está ocupado não vai; almoça sozinho mais tarde, quando fica livre', () => {
    const { sim, rodar, agora } = predio('copa', { norte: 'pensando' })
    rodar(12, 60_000)
    expect(area(sim, 'norte')).toBe('norte')
    rodar(13.1, 30_000)
    mudarStatus(sim, 'norte', 'ocioso', agora())
    rodar(13.2, 60_000)
    expect(area(sim, 'norte')).toBe('copa')
  })

  it('abrir o app às 13h30 não cria uma correria de almoço atrasado', () => {
    const { sim, rodar } = predio('copa')
    rodar(13.5, 60_000)
    expect(IDS.filter((id) => area(sim, id) === 'copa').length).toBeLessThanOrEqual(1) // no máximo uma pausa normal
    expect(sim.agentes.every((a) => a.almoco === undefined)).toBe(true)
  })
})

describe('planejarAlmoco (sorteio puro)', () => {
  it('os três modos aparecem, perto dos pesos (45/35/20)', async () => {
    const { planejarAlmoco } = await import('../sim')
    const { mulberry32 } = await import('../habblaud/shared/hash')
    const rnd = mulberry32(11)
    const cont = { copa: 0, duplas: 0, fora: 0 }
    for (let i = 0; i < 4000; i++) cont[planejarAlmoco(rnd, IDS).modo]++
    expect(cont.copa / 4000).toBeGreaterThan(0.4)
    expect(cont.duplas / 4000).toBeGreaterThan(0.3)
    expect(cont.fora / 4000).toBeGreaterThan(0.15)
    expect(cont.fora / 4000).toBeLessThan(0.25)
  })

  it('duplas são simétricas; com número ímpar, um fica sem par (almoça na copa)', async () => {
    const { planejarAlmoco } = await import('../sim')
    const { pares } = planejarAlmoco(() => 0.3, ['a', 'b', 'c', 'd', 'e'])
    for (const [x, y] of pares) expect(pares.get(y)).toBe(x)
    expect(pares.size).toBe(4)
  })
})
