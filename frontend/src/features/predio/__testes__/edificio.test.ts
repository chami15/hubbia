import { describe, expect, it } from 'vitest'
import {
  adicionarNoAndar, agentesDoEdificio, andarAtual, casaDe, criarEdificio, definirStatus, dispensar, passoEdificio, resumoDoAndar, temEspaco,
  visitandoNoEdificio, visitarNoEdificio, type Edificio, type VagasPorAndar,
} from '../edificio'
import type { Status } from '../sim'

function edificio(vagas: VagasPorAndar = { 0: ['cifra', 'vita', 'agenda', 'norte', null, null], 1: ['pauta', null, null, null, null, null] }) {
  const salvas: VagasPorAndar[] = []
  const status = new Map<string, Status>()
  const ed = criarEdificio(vagas, 0, { aoMudarVagas: (v) => salvas.push(v), status: (id) => status.get(id) ?? 'trabalhando' })
  let t = 0
  const rodar = (ms: number, cada?: (ed: Edificio) => void) => {
    for (const fim = t + ms; t < fim; ) {
      t += 50
      passoEdificio(ed, t, 50)
      // invariante do prédio inteiro: ninguém em dois lugares ao mesmo tempo
      const ids = agentesDoEdificio(ed).map((a) => a.id)
      expect(new Set(ids).size, `duplicado: ${ids.join(',')}`).toBe(ids.length)
      cada?.(ed)
    }
  }
  return { ed, rodar, salvas, status, agora: () => t }
}

describe('edifício: os andares vivem juntos', () => {
  it('cada um começa na própria mesa, no seu andar', () => {
    const { ed } = edificio()
    expect(andarAtual(ed, 'cifra')).toBe(0)
    expect(andarAtual(ed, 'pauta')).toBe(1)
    expect(casaDe(ed, 'pauta')).toBe(1)
  })

  it('o andar que ninguém está vendo continua andando (os agentes não congelam)', () => {
    const { ed, rodar } = edificio()
    const pauta = ed.andares.get(1)!.sim.agentes[0]
    const antes = pauta.lugar?.id
    let mudou = false
    rodar(10 * 60_000, () => {
      if (pauta.lugar?.id !== antes) mudou = true
    })
    expect(mudou).toBe(true)
  })

  it('visita a quem está em outro andar: elevador, viagem, conversa e volta', () => {
    const { ed, rodar, agora } = edificio()
    expect(visitarNoEdificio(ed, 'cifra', 'pauta', ['oi pauta'], agora())).toBe(true)
    expect(visitandoNoEdificio(ed).get('cifra')).toBe('pauta')
    const passou = new Set<string>()
    rodar(150_000, (e) => passou.add(String(andarAtual(e, 'cifra'))))
    expect([...passou]).toEqual(expect.arrayContaining(['0', 'null', '1']))
    expect(andarAtual(ed, 'cifra')).toBe(0)
  })

  it('no mesmo andar, a visita de sempre (sem elevador)', () => {
    const { ed, rodar, agora } = edificio()
    expect(visitarNoEdificio(ed, 'cifra', 'vita', ['oi'], agora())).toBe(true)
    rodar(60_000, (e) => expect(andarAtual(e, 'cifra')).toBe(0))
  })

  it('não visita quem está dormindo no outro andar', () => {
    const { ed, status, agora } = edificio()
    status.set('pauta', 'dormindo')
    definirStatus(ed, agora())
    expect(visitarNoEdificio(ed, 'cifra', 'pauta', ['oi'], agora())).toBe(false)
  })

  it('status do backend chega em todos os andares, e em quem está no elevador quando ele chega', () => {
    const { ed, rodar, status, agora } = edificio()
    visitarNoEdificio(ed, 'cifra', 'pauta', ['oi'], agora())
    rodar(30_000, (e) => {
      if (andarAtual(e, 'cifra') === null && status.get('cifra') !== 'pensando') {
        status.set('cifra', 'pensando')
        status.set('pauta', 'pensando')
        definirStatus(e, agora())
      }
    })
    expect(ed.andares.get(1)!.sim.agentes.find((a) => a.def.id === 'pauta')!.status).toBe('pensando')
    expect(agentesDoEdificio(ed).find((a) => a.id === 'cifra')!.status).toBe('pensando')
  })
})

describe('edifício: vagas e obras por andar', () => {
  it('adicionar no 2º andar: obra lá, chega pelo elevador de lá, vagas salvas por andar', () => {
    const { ed, rodar, salvas, agora } = edificio({ 0: ['cifra', 'vita', null, null, null, null], 1: Array(6).fill(null) })
    expect(adicionarNoAndar(ed, 'lume', 1, agora())).toBe(true)
    expect(salvas.at(-1)).toEqual({ 0: ['cifra', 'vita', null, null, null, null], 1: ['lume', null, null, null, null, null] })
    rodar(15_000)
    expect(andarAtual(ed, 'lume')).toBe(1)
    expect(ed.andares.get(1)!.sim.agentes.find((a) => a.def.id === 'lume')!.chegando).toBe(false)
  })

  it('o mesmo agente não entra em dois andares', () => {
    const { ed, agora } = edificio()
    expect(adicionarNoAndar(ed, 'cifra', 1, agora())).toBe(false)
  })

  it('andar cheio não cresce: 6 salas fixas (no térreo também)', () => {
    const cheio = ['cifra', 'vita', 'agenda', 'norte', 'motriz', 'pauta']
    const { ed, agora } = edificio({ 0: cheio, 1: Array(6).fill(null) })
    expect(temEspaco(ed, 0)).toBe(false)
    expect(adicionarNoAndar(ed, 'lume', 0, agora())).toBe(false)
    expect(temEspaco(ed, 1)).toBe(true)
  })

  it('dispensado enquanto visita outro andar: sai por lá, e a sala de casa é desmontada', () => {
    const { ed, rodar, salvas, agora } = edificio()
    visitarNoEdificio(ed, 'cifra', 'pauta', ['oi'], agora())
    rodar(20_000)
    expect(andarAtual(ed, 'cifra')).toBe(1)
    dispensar(ed, 'cifra', agora())
    rodar(30_000)
    expect(andarAtual(ed, 'cifra')).toBeUndefined()
    expect(salvas.at(-1)![0]).toEqual([null, 'vita', 'agenda', 'norte', null, null])
  })

  it('dispensado dentro do elevador: some na hora, sem reaparecer em andar nenhum', () => {
    const { ed, rodar, salvas, agora } = edificio()
    visitarNoEdificio(ed, 'cifra', 'pauta', ['oi'], agora())
    let dispensou = false
    rodar(60_000, (e) => {
      if (!dispensou && andarAtual(e, 'cifra') === null) {
        dispensou = true
        dispensar(e, 'cifra', agora())
      }
      if (dispensou) expect(andarAtual(e, 'cifra')).toBeUndefined()
    })
    expect(dispensou).toBe(true)
    expect(salvas.at(-1)![0][0]).toBeNull()
  })

  it('resumo do andar para o painel do elevador: quem precisa de você', () => {
    const { ed, status, agora } = edificio()
    status.set('pauta', 'precisa_de_voce')
    definirStatus(ed, agora())
    expect(resumoDoAndar(ed, 1)).toEqual({ agentes: 1, precisaDeVoce: 1 })
    expect(resumoDoAndar(ed, 0).precisaDeVoce).toBe(0)
  })
})
