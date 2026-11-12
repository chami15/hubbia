import { describe, expect, it } from 'vitest'
import { andarPorId, TERREO, type AndarDef } from '../andares'
import { montarPredio } from '../predio'
import {
  adicionarAgente, criarSimulacao, dispensarAgente, passo, receberViajante, viajar, visitar, visivel, type AgenteVivo, type Simulacao,
} from '../sim'

const VIAGEM_MS = 1500

/** Dois andares ligados à mão: quem embarca num some e, depois da viagem, aparece no elevador do outro. */
function predio(segundo: AndarDef = andarPorId(1)) {
  const emViagem: { a: AgenteVivo; chegaEm: number }[] = []
  const saiu: string[] = []
  const andares = new Map<number, Simulacao>()
  const aoViajar = (a: AgenteVivo, t: number) => emViagem.push({ a, chegaEm: t + VIAGEM_MS })
  const terreo = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte'], TERREO), (id) => saiu.push(id))
  const cima = criarSimulacao(montarPredio(['pauta', null, null, null], segundo), (id) => saiu.push(id))
  terreo.aoViajar = aoViajar
  cima.aoViajar = aoViajar
  andares.set(0, terreo).set(segundo.id, cima)
  for (const id of ['cifra', 'vita', 'agenda', 'norte']) adicionarAgente(terreo, id, 0, { jaNaMesa: true, status: 'trabalhando' })
  adicionarAgente(cima, 'pauta', 0, { jaNaMesa: true, status: 'ocioso' })
  let t = 0
  /** Onde o agente está agora: andar, ou 'viagem', ou undefined (foi embora). Nunca em dois lugares ao mesmo tempo. */
  const onde = (id: string): number | 'viagem' | undefined => {
    const lugares = [...andares].filter(([, s]) => s.agentes.some((a) => a.def.id === id)).map(([k]) => k)
    const viajando = emViagem.some((v) => v.a.def.id === id)
    expect(lugares.length + (viajando ? 1 : 0), `${id} em mais de um lugar`).toBeLessThanOrEqual(1)
    return viajando ? 'viagem' : lugares[0]
  }
  const rodar = (ms: number, cada?: () => void) => {
    for (let fim = t + ms; t < fim; ) {
      t += 50
      for (const s of andares.values()) passo(s, t, 50)
      for (const v of [...emViagem]) {
        if (t < v.chegaEm) continue
        emViagem.splice(emViagem.indexOf(v), 1)
        receberViajante(andares.get(v.a.viagem!.andar)!, v.a, t)
      }
      cada?.()
    }
  }
  const agente = (id: string) => [...andares.values()].flatMap((s) => s.agentes).find((a) => a.def.id === id)
  return { terreo, cima, onde, rodar, agente, saiu, agora: () => t }
}

describe('visita a outro andar pelo elevador', () => {
  it('vai até o elevador, some, aparece no outro andar, conversa, e volta para a mesa', () => {
    const { terreo, onde, rodar, agente, agora } = predio()
    expect(viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi pauta'] })).toBe(true)
    const visto = new Set<string>()
    let falou = false
    rodar(60_000, () => {
      visto.add(String(onde('cifra')))
      const c = agente('cifra')
      if (c?.fala?.linhas[0] === 'oi pauta') falou = true
    })
    expect([...visto]).toEqual(expect.arrayContaining(['0', 'viagem', '1']))
    expect(falou).toBe(true)
    // de volta em casa, a primeira coisa é sentar na própria mesa (depois a rotina segue: pode sair para uma pausa)
    let sentouNaMesa = false
    rodar(120_000, () => {
      if (onde('cifra') === 0 && agente('cifra')!.lugar?.mesa === 'cifra') sentouNaMesa = true
    })
    expect(onde('cifra')).toBe(0)
    expect(sentouNaMesa).toBe(true)
    expect(agente('cifra')!.viagem).toBeUndefined()
  })

  it('regressão: chega no outro andar dentro do elevador, sem pular de lugar', () => {
    // sem isso, quem chegava aparecia onde estava no andar de origem (outra coordenada) e "teleportava" na tela
    const { terreo, cima, rodar, agente, agora } = predio()
    viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi'] })
    let primeira: [number, number] | undefined
    rodar(30_000, () => {
      const c = cima.agentes.find((a) => a.def.id === 'cifra')
      if (c && !primeira && visivel(c, agora())) primeira = [c.x, c.y]
    })
    const saidas = cima.predio.elevadores.map(({ tile: [col, lin] }) => [col * 16 + 8, lin * 16 + 11])
    expect(saidas).toContainEqual(primeira)
    expect(agente('cifra')).toBeDefined()
  })

  it('o anfitrião espera no lugar enquanto a visita vem', () => {
    const { terreo, cima, rodar, agora } = predio()
    viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi'] })
    let esperou = false
    rodar(30_000, () => {
      if (cima.agentes.find((a) => a.def.id === 'pauta')?.recebendo === 'cifra') esperou = true
    })
    expect(esperou).toBe(true)
  })

  it('em viagem não está disponível para outra visita nem para outra viagem', () => {
    const { terreo, agora } = predio()
    viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi'] })
    expect(visitar(terreo, 'vita', 'cifra', ['ei'], agora())).toBe(false)
    expect(viajar(terreo, 'cifra', 1, agora())).toBe(false)
  })

  it('dispensado enquanto visita outro andar: sai pelo elevador de lá e vai embora (não volta para a mesa)', () => {
    const { terreo, cima, onde, rodar, saiu, agora } = predio()
    viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi'] })
    rodar(20_000)
    expect(onde('cifra')).toBe(1)
    dispensarAgente(cima, 'cifra', agora())
    rodar(30_000)
    expect(onde('cifra')).toBeUndefined()
    expect(saiu).toEqual(['cifra'])
  })
})

describe('dispensado no meio da viagem de volta', () => {
  it('vai embora de vez: não reaparece no andar de casa', () => {
    const { terreo, cima, onde, rodar, saiu, agente, agora } = predio()
    viajar(terreo, 'cifra', 1, agora(), { para: 'pauta', linhas: ['oi'] })
    let dispensou = false
    let voltouAoTerreo = false
    // espera a conversa acabar e ela começar a voltar (viagem para casa marcada, ainda no 2º andar)
    rodar(90_000, () => {
      const c = agente('cifra')
      if (dispensou && onde('cifra') === 0) voltouAoTerreo = true
      if (c && onde('cifra') === 1 && c.viagem?.andar === 0 && !c.saindo) {
        dispensou = true
        dispensarAgente(cima, 'cifra', agora())
      }
    })
    expect(dispensou).toBe(true)
    expect(voltouAoTerreo).toBe(false) // não pode passar pelo térreo antes de ir embora
    expect(saiu).toEqual(['cifra'])
    expect(onde('cifra')).toBeUndefined()
    expect(terreo.agentes.some((a) => a.def.id === 'cifra')).toBe(false)
  })
})

describe('andar sem copa', () => {
  it('na hora do almoço, quem está lá pega o elevador para almoçar fora (não fica sem almoçar)', () => {
    const semCopa: AndarDef = { ...andarPorId(1), id: 2, nucleo: { ...andarPorId(1).nucleo, copa: undefined } }
    const { cima, rodar } = predio(semCopa)
    cima.modoAlmocoFixo = 'copa'
    const pauta = cima.agentes[0]
    let saiu = false
    for (let h = 11.9; h < 12.5; h += 0.01) {
      cima.hora = h
      rodar(500, () => {
        if (pauta.almoco === 'fora' || pauta.almoco === 'saindo_fora') saiu = true
      })
    }
    expect(saiu).toBe(true)
  })
})
