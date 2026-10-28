import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { adicionarAgente, criarSimulacao, falar, passo, visitando, visitar, type Status } from '../sim'

function predio(status: Partial<Record<string, Status>> = {}) {
  const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
  for (const id of ['cifra', 'vita', 'agenda', 'norte']) adicionarAgente(sim, id, 0, { jaNaMesa: true, status: status[id] ?? 'ocioso' })
  let t = 0
  const rodar = (ms: number) => {
    for (const fim = t + ms; t < fim; ) {
      t += 50
      passo(sim, t, 50)
    }
  }
  const ag = (id: string) => sim.agentes.find((a) => a.def.id === id)!
  /** Roda até a visita chegar (no máximo `limite` ms): a conversa é curta, então medir num instante fixo erra. */
  const ateChegar = (id: string, limite = 60_000) => {
    for (let k = 0; k < limite / 250 && !ag(id).visita?.chegou; k++) rodar(250)
  }
  return { sim, rodar, ag, ateChegar, agora: () => t }
}

describe('visita (encontro a partir de mensagem social real)', () => {
  it('vai até a sala do outro, fica em pé conversando com o balão, e depois volta para a própria sala', () => {
    const { sim, rodar, ag, ateChegar, agora } = predio()
    expect(visitar(sim, 'cifra', 'vita', ['oi, tudo bem'], agora())).toBe(true)
    ateChegar('cifra')
    const c = ag('cifra')
    expect(c.lugar?.area).toBe('vita')
    expect(c.lugar?.mesa).toBeUndefined()
    expect(c.pose).toBe('talk')
    expect(c.fala?.linhas).toEqual(['oi, tudo bem'])
    expect(visitando(sim).get('cifra')).toBe('vita')
    rodar(60_000)
    expect(ag('cifra').lugar?.area).toBe('cifra')
    expect(visitando(sim).size).toBe(0)
  })

  it('vale mesmo com o status "conversando" que o backend manda junto com a mensagem', () => {
    const { sim, ag, ateChegar, agora } = predio({ cifra: 'conversando' })
    visitar(sim, 'cifra', 'vita', ['oi'], agora())
    ateChegar('cifra')
    expect(ag('cifra').lugar?.area).toBe('vita')
  })

  it('ninguém visita quem está dormindo, nem dormindo sai para visitar', () => {
    const { sim, agora } = predio({ vita: 'dormindo', norte: 'dormindo' })
    expect(visitar(sim, 'cifra', 'vita', ['oi'], agora())).toBe(false)
    expect(visitar(sim, 'norte', 'cifra', ['oi'], agora())).toBe(false)
  })

  it('uma visita por vez', () => {
    const { sim, agora } = predio()
    expect(visitar(sim, 'cifra', 'vita', ['oi'], agora())).toBe(true)
    expect(visitar(sim, 'cifra', 'norte', ['oi'], agora())).toBe(false)
  })

  it('resposta: o balão aparece em quem responde, sem andar', () => {
    const { sim, rodar, ag, agora } = predio()
    rodar(1000)
    const antes = ag('vita').lugar?.id
    expect(falar(sim, 'vita', ['tudo ótimo'], agora())).toBe(true)
    rodar(1000)
    expect(ag('vita').fala?.linhas).toEqual(['tudo ótimo'])
    expect(ag('vita').lugar?.id).toBe(antes)
  })

  it('o balão some sozinho depois de um tempo (nada fica fixo na tela)', () => {
    const { sim, rodar, ag, agora } = predio()
    falar(sim, 'vita', ['tudo ótimo'], agora())
    rodar(20_000)
    expect((ag('vita').fala?.ate ?? 0) <= agora()).toBe(true)
  })
})

describe('regressão: a visita chegava e o anfitrião já tinha saído', () => {
  // O que acontecia (visto no navegador): a Cifra foi até a sala da Vita e falou sozinha, porque a Vita, ociosa,
  // tinha saído para outra atividade. Agora quem vai ser visitado espera no lugar até a conversa acabar.
  it('o anfitrião não sai para outra atividade enquanto a visita vem e conversa', () => {
    const { sim, rodar, ag, ateChegar, agora } = predio()
    rodar(1000)
    const vita = ag('vita')
    const ondeEstava = vita.lugar?.id
    vita.ate = 0 // estava prestes a decidir outra coisa
    visitar(sim, 'cifra', 'vita', ['oi'], agora())
    ateChegar('cifra')
    expect(ag('vita').lugar?.id).toBe(ondeEstava)
    expect(ag('cifra').lugar?.area).toBe(sim.predio.lugares.find((l) => l.id === ondeEstava)?.area)
  })

  it('depois que a visita vai embora, o anfitrião volta a fazer as coisas dele', () => {
    const { sim, rodar, ag, ateChegar, agora } = predio()
    visitar(sim, 'cifra', 'vita', ['oi'], agora())
    ateChegar('cifra')
    rodar(30_000)
    expect(ag('vita').recebendo).toBeUndefined()
  })
})

describe('regressão: a visita conversava de longe quando o anfitrião estava fora da sala', () => {
  // O que acontecia (visto no navegador): a Vita estava no balcão da recepção, o único lugar em pé ali era o dela, e a
  // Cifra caiu no plano B (a sala da Vita), conversando a meio prédio de distância. Agora a visita para do lado de quem
  // ela veio ver, onde ele estiver.
  it.each([1_000, 20_000, 45_000, 70_000, 95_000])('chega ao lado do anfitrião (no máximo 2 ladrilhos), começando em %i ms', (antes) => {
    const { sim, rodar, ag, ateChegar, agora } = predio()
    rodar(antes)
    if (!visitar(sim, 'cifra', 'vita', ['oi'], agora())) return // anfitrião indisponível naquele instante: não há visita
    ateChegar('cifra')
    const c = ag('cifra')
    const v = ag('vita')
    expect(c.visita?.chegou).toBe(true)
    expect(Math.hypot(c.x - v.x, c.y - v.y)).toBeLessThanOrEqual(2 * 16 + 8)
  })
})

describe('regressão: os balões de quem visita e de quem responde se sobrepunham', () => {
  // O que acontecia (visto no navegador): a Vita respondeu com a Cifra ainda falando ao lado; os dois balões ficaram um
  // em cima do outro, ilegíveis. Agora é a vez de cada um: quem responde toma a palavra e a visita fica ouvindo.
  it('a resposta encerra o balão de quem visitou, e a visita espera a resposta acabar para ir embora', () => {
    const { sim, rodar, ag, ateChegar, agora } = predio()
    visitar(sim, 'cifra', 'vita', ['vi que você bateu a meta. qual o segredo.'], agora())
    ateChegar('cifra')
    rodar(500)
    expect(falar(sim, 'vita', ['garrafa sempre na mesa e um lembrete a cada hora.'], agora())).toBe(true)
    rodar(50)
    expect((ag('cifra').fala?.ate ?? 0) <= agora()).toBe(true) // a Cifra parou de falar
    const fimDaResposta = ag('vita').fala!.ate
    rodar(fimDaResposta - agora() - 500)
    expect(ag('cifra').visita?.chegou).toBe(true) // ainda ouvindo
    rodar(30_000)
    expect(ag('cifra').visita).toBeUndefined() // foi embora depois
  })
})
