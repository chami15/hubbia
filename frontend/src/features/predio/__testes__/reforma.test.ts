// Reformas no edifício: ampliar e reduzir uma sala, e mudar um agente de andar (pedido do chefe, 2026-11-13: "mudar o
// agente de lugar, deslocar ele, e ter uma animação de desconstruindo a sala e construindo no outro andar").
import { describe, expect, it } from 'vitest'
import {
  adicionarNoAndar, agentesDoEdificio, ampliada, ampliar, andarAtual, casaDe, criarEdificio, dispensar, mudarDeAndar, ondeAmpliar,
  passoEdificio, reduzir, temEspaco, vagasDoEdificio, type AmpliacoesPorAndar, type Edificio, type VagasPorAndar,
} from '../edificio'
import { DESMONTE_MS, OBRA_MS } from '../predio'
import { lerAmpliadas, lerVagas } from '../vagas'

function edificio(vagas: VagasPorAndar = { 0: ['cifra', 'vita', 'agenda', 'norte', null, null], 1: [null, null, null, null, null, null] }, ampliadas?: AmpliacoesPorAndar) {
  const salvas: { vagas: VagasPorAndar; ampliadas: AmpliacoesPorAndar }[] = []
  const ed = criarEdificio(vagas, 0, { aoMudarVagas: (v, a) => salvas.push({ vagas: v, ampliadas: a }), status: () => 'ocioso', ampliadas })
  let t = 0
  const rodar = (ms: number, cada?: (ed: Edificio) => void) => {
    for (const fim = t + ms; t < fim; ) {
      t += 50
      passoEdificio(ed, t, 50)
      const ids = agentesDoEdificio(ed).map((a) => a.id)
      expect(new Set(ids).size, `duplicado: ${ids.join(',')}`).toBe(ids.length)
      cada?.(ed)
    }
  }
  return { ed, rodar, salvas, agora: () => t }
}

const areaIds = (ed: Edificio, andar: number) => ed.andares.get(andar)!.predio.areas.map((a) => a.id)

describe('ampliar e reduzir', () => {
  it('amplia na vaga vizinha livre: obra, depois a metade nova ganha lugares; salva', () => {
    const { ed, rodar, salvas, agora } = edificio()
    // Agenda (vaga 2, coluna do meio, em cima): vizinhas 0 (Cifra) e 4 (livre)
    expect(ondeAmpliar(ed, 0, 'agenda')).toEqual([4])
    expect(ampliar(ed, 0, 'agenda', agora())).toBe(true)
    expect(areaIds(ed, 0)).toContain('agenda:anexo')
    expect(ed.andares.get(0)!.obras.get(4)?.tipo).toBe('construir')
    expect(ed.andares.get(0)!.predio.lugares.some((l) => l.area === 'agenda:anexo')).toBe(false)
    expect(salvas.at(-1)!.ampliadas[0]).toEqual({ 4: 'agenda' })
    rodar(OBRA_MS + 100)
    expect(ed.andares.get(0)!.obras.has(4)).toBe(false)
    expect(ed.andares.get(0)!.predio.lugares.some((l) => l.area === 'agenda:anexo')).toBe(true)
    expect(ampliada(ed, 0, 'agenda')).toBe(true)
  })

  it('a vaga absorvida não aceita agente novo; com todas tomadas, o andar está cheio', () => {
    const { ed, rodar, agora } = edificio({ 0: ['cifra', 'vita', 'agenda', 'norte', null, 'motriz'], 1: [null, null, null, null, null, null] })
    ampliar(ed, 0, 'agenda', agora())
    rodar(OBRA_MS + 100) // depois da obra: a vaga 4 é a metade nova, não vaga livre
    expect(temEspaco(ed, 0)).toBe(false)
    expect(adicionarNoAndar(ed, 'pauta', 0, agora(), 4)).toBe(false)
    expect(adicionarNoAndar(ed, 'pauta', 0, agora())).toBe(false)
  })

  it('uma ampliação por sala; sem vizinha livre, não amplia', () => {
    const { ed, agora } = edificio()
    expect(ampliar(ed, 0, 'agenda', agora())).toBe(true)
    expect(ampliar(ed, 0, 'agenda', agora())).toBe(false)
    // Cifra (vaga 0): a única vizinha é a 2, da Agenda
    expect(ondeAmpliar(ed, 0, 'cifra')).toEqual([])
    expect(ampliar(ed, 0, 'cifra', agora())).toBe(false)
  })

  it('a copa amplia por andar, opcional (nem toda copa precisa ser grande)', () => {
    const { ed, agora } = edificio({ 0: ['cifra', null, 'agenda', 'norte', null, null], 1: [null, null, null, null, null, null] })
    expect(ampliar(ed, 0, 'copa', agora())).toBe(true)
    expect(areaIds(ed, 0)).toContain('copa:anexo')
    expect(areaIds(ed, 1)).not.toContain('copa:anexo')
  })

  it('reduzir: quem está na metade nova sai, ela é desmontada e a vaga volta a ficar livre', () => {
    const { ed, rodar, salvas, agora } = edificio(undefined, { 0: { 4: 'agenda' } })
    expect(ampliada(ed, 0, 'agenda')).toBe(true)
    // põe a Agenda num lugar da ampliação
    const sim = ed.andares.get(0)!.sim
    const agenda = sim.agentes.find((a) => a.def.id === 'agenda')!
    const l = ed.andares.get(0)!.predio.lugares.find((x) => x.area === 'agenda:anexo')!
    Object.assign(agenda, { lugar: l, x: l.x, y: l.y, caminho: [], destino: undefined })
    sim.ocupado.set(l.id, 'agenda')
    expect(reduzir(ed, 0, 'agenda', agora())).toBe(true)
    expect(agenda.lugar).toBeUndefined()
    expect(ed.andares.get(0)!.predio.lugares.some((x) => x.area === 'agenda:anexo')).toBe(false)
    // durante a desmontagem ninguém volta para lá
    rodar(DESMONTE_MS + 100, () => expect(agenda.destino?.area).not.toBe('agenda:anexo'))
    expect(areaIds(ed, 0)).not.toContain('agenda:anexo')
    expect(temEspaco(ed, 0)).toBe(true)
    expect(salvas.at(-1)!.ampliadas[0]).toEqual({})
  })

  it('dispensar o dono desmonta a sala e a ampliação junto', () => {
    const { ed, rodar, agora } = edificio(undefined, { 0: { 4: 'agenda' } })
    dispensar(ed, 'agenda', agora())
    rodar(60_000)
    expect(areaIds(ed, 0)).not.toContain('agenda')
    expect(areaIds(ed, 0)).not.toContain('agenda:anexo')
    expect(ed.andares.get(0)!.ampliadas).toEqual({})
  })
})

describe('mudar de andar', () => {
  it('constrói lá, vai ao elevador, desmonta aqui quando embarca, e só sai do elevador com a sala pronta', () => {
    const { ed, rodar, salvas, agora } = edificio(undefined, { 0: { 4: 'agenda' } })
    expect(mudarDeAndar(ed, 'agenda', 1, agora())).toBe(true)
    // a sala nova já está em obra no destino; ele mora lá a partir de agora
    expect(ed.andares.get(1)!.vagas).toContain('agenda')
    expect([...ed.andares.get(1)!.obras.values()].map((o) => o.tipo)).toEqual(['construir'])
    expect(casaDe(ed, 'agenda')).toBe(1)
    // salvo: só no destino (recarregando a página, ele não volta para a sala antiga)
    expect(salvas.at(-1)!.vagas[0]).not.toContain('agenda')
    expect(salvas.at(-1)!.vagas[1]).toContain('agenda')

    const vistos: (number | null | undefined)[] = []
    let desmontouAntesDeEmbarcar = false
    let saiuComObra = false
    rodar(120_000, (e) => {
      const onde = andarAtual(e, 'agenda')
      if (vistos.at(-1) !== onde) vistos.push(onde)
      const terreo = e.andares.get(0)!
      if (onde === 0 && [...terreo.obras.values()].some((o) => o.tipo === 'desmontar')) desmontouAntesDeEmbarcar = true
      const ag = e.andares.get(1)!.sim.agentes.find((a) => a.def.id === 'agenda')
      if (ag && !ag.chegando && e.andares.get(1)!.obras.size > 0) saiuComObra = true
    })
    expect(vistos).toEqual([0, null, 1])
    expect(desmontouAntesDeEmbarcar).toBe(false)
    expect(saiuComObra).toBe(false)
    // térreo: sala e ampliação sumiram, vagas livres; 2º andar: sala dele, e ele na mesa
    expect(areaIds(ed, 0)).not.toContain('agenda')
    expect(areaIds(ed, 0)).not.toContain('agenda:anexo')
    expect(ed.andares.get(0)!.vagas).not.toContain('agenda')
    expect(areaIds(ed, 1)).toContain('agenda')
    const agenda = ed.andares.get(1)!.sim.agentes.find((a) => a.def.id === 'agenda')!
    expect(agenda.lugar?.area).toBe('agenda')
  })

  it('não muda: para o mesmo andar, andar cheio, quem já está de mudança ou ainda chegando', () => {
    const cheio = { 0: ['cifra', 'vita', 'agenda', 'norte', null, null], 1: ['motriz', 'pauta', 'lume', 'lar', 'rota', null] }
    const { ed, agora } = edificio(cheio)
    expect(mudarDeAndar(ed, 'cifra', 0, agora())).toBe(false)
    expect(adicionarNoAndar(ed, 'motriz', 1, agora())).toBe(false) // já está
    // ocupa a última vaga do 2º andar com uma obra
    ed.andares.get(1)!.vagas[5] = null
    expect(mudarDeAndar(ed, 'cifra', 1, agora())).toBe(true)
    expect(mudarDeAndar(ed, 'vita', 1, agora())).toBe(false) // agora cheio
    // a Cifra já está de mudança: não muda de novo no meio
    expect(mudarDeAndar(ed, 'cifra', 0, agora())).toBe(false)
    // quem acabou de ser contratado e ainda está chegando (sala em obra) também não
    const outro = edificio({ 0: ['cifra', null, null, null, null, null], 1: [null, null, null, null, null, null] })
    expect(adicionarNoAndar(outro.ed, 'vita', 0, outro.agora())).toBe(true)
    expect(mudarDeAndar(outro.ed, 'vita', 1, outro.agora())).toBe(false)
  })

  it('dispensado no meio da mudança: as duas salas somem, ninguém fica no prédio', () => {
    const { ed, rodar, agora } = edificio()
    mudarDeAndar(ed, 'norte', 1, agora())
    let dispensou = false
    rodar(90_000, (e) => {
      if (!dispensou && andarAtual(e, 'norte') === null) {
        dispensar(e, 'norte', agora())
        dispensou = true
      }
    })
    expect(dispensou).toBe(true)
    expect(andarAtual(ed, 'norte')).toBeUndefined()
    expect(areaIds(ed, 0)).not.toContain('norte')
    expect(areaIds(ed, 1)).not.toContain('norte')
    expect(vagasDoEdificio(ed)[0]).not.toContain('norte')
    expect(vagasDoEdificio(ed)[1]).not.toContain('norte')
  })
})

describe('salas ampliadas salvas no navegador', () => {
  const vagas = lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['cifra', 'vita', 'agenda', null, null, null], 1: [null, null, null, null, null, null] } }))

  it('formato sem `ampliadas` (o de antes) lê como nenhuma ampliação', () => {
    expect(lerAmpliadas(JSON.stringify({ versao: 2, andares: {} }), vagas)).toEqual({ 0: {}, 1: {} })
    expect(lerAmpliadas(JSON.stringify(['cifra']), vagas)).toEqual({ 0: {}, 1: {} })
    expect(lerAmpliadas('{lixo', vagas)).toEqual({ 0: {}, 1: {} })
  })

  it('fica só o que faz sentido: vizinha livre, dono no andar, uma por dono', () => {
    const salvo = JSON.stringify({
      versao: 2, andares: {},
      ampliadas: { 0: { 4: 'agenda', 3: 'vita', 5: 'cifra', 1: 'copa' }, 1: { 0: 'agenda', 2: 'copa' } },
    })
    // agenda 4: ok; vita (vaga 1) na 3: ok; cifra (vaga 0) na 5: não é vizinha; copa do térreo na 1: ocupada pela Vita
    // 2º andar: agenda não mora lá; copa do 2º andar é na coluna encostada no núcleo (à direita, em cima): vaga 4, não 2
    expect(lerAmpliadas(salvo, vagas)).toEqual({ 0: { 4: 'agenda', 3: 'vita' }, 1: {} })
  })
})
