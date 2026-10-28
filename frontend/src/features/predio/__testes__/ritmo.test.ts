import { describe, expect, it } from 'vitest'
import { montarPredio } from '../predio'
import { adicionarAgente, criarSimulacao, passo, type Status } from '../sim'

// Conta o que um agente faz em `minutos` reais: cada vez que ele sai de um lugar para outro é uma "levantada".
function rodar(id: string, status: Status, minutos: number) {
  const sim = criarSimulacao(montarPredio(['cifra', 'vita', 'agenda', 'norte']), () => undefined)
  adicionarAgente(sim, id, 0, { jaNaMesa: true, status })
  const a = sim.agentes[0]
  const destinos: string[] = []
  let ultimo = a.destino?.id
  for (let t = 50; t <= minutos * 60_000; t += 50) {
    passo(sim, t, 50)
    if (a.destino && a.destino.id !== ultimo) destinos.push(a.destino.id)
    ultimo = a.destino?.id
  }
  return { destinos, copa: destinos.filter((d) => d.startsWith('copa:') || d.startsWith('recepcao:')) }
}

describe('regressão: agentes andavam pra lá e pra cá sem descanso', () => {
  // O que acontecia: ocioso trocava de lugar a cada 7–13 s e quem trabalhava fazia pausa a cada 16–30 s, sorteando a copa
  // em 40% das vezes sem memória ("3 idas do Cifra à copa em 5 minutos"). Agora o ritmo é calmo e segue a personalidade.
  it('ocioso: no máximo uma mudança de lugar a cada ~45 s reais', () => {
    const { destinos } = rodar('cifra', 'ocioso', 10)
    expect(destinos.length).toBeLessThanOrEqual(13)
  })

  it('trabalhando: no máximo uma pausa (ida e volta) a cada ~90 s reais', () => {
    const { destinos } = rodar('cifra', 'trabalhando', 10)
    expect(destinos.length).toBeLessThanOrEqual(14) // ida + volta conta 2
  })

  it('Cifra não vai à copa toda hora: no máximo 2 idas em 10 minutos reais', () => {
    for (const status of ['ocioso', 'trabalhando'] as const) expect(rodar('cifra', status, 10).copa.length).toBeLessThanOrEqual(2)
  })

  it('mas continua vivo: em 10 minutos ocioso faz alguma coisa', () => {
    expect(rodar('vita', 'ocioso', 10).destinos.length).toBeGreaterThanOrEqual(3)
  })
})

describe('personalidade aparece no que o agente faz', () => {
  it('Norte passa no fliperama e Vita se alonga (os favoritos de cada um)', () => {
    const norte = rodar('norte', 'ocioso', 40).destinos
    const vita = rodar('vita', 'ocioso', 40).destinos
    expect(norte.some((d) => d.startsWith('norte:') && d.includes('game'))).toBe(true)
    expect(vita.some((d) => d.startsWith('vita:') && d.includes('stretch'))).toBe(true)
  })

  it('nunca vai duas vezes seguidas ao mesmo lugar (fora a volta para a mesa)', () => {
    const d = rodar('agenda', 'ocioso', 30).destinos
    for (let i = 1; i < d.length; i++) if (!d[i].includes(':5,1:')) expect(d[i]).not.toBe(d[i - 1])
  })
})
