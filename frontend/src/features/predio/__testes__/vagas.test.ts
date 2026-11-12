import { describe, expect, it } from 'vitest'
import { lerVagas, vagasPadrao } from '../vagas'

describe('vagas por andar', () => {
  it('primeira visita: térreo com os de fábrica, 2º andar vazio esperando', () => {
    const v = lerVagas(null)
    expect(v[0]).toEqual(['cifra', 'vita', 'agenda', 'norte', 'motriz', 'pauta', null, null])
    expect(v[1]).toEqual(Array(8).fill(null))
  })

  it('regressão: o formato antigo (só a lista do térreo) não pode perder a disposição do chefe', () => {
    // Antes dos andares, o navegador guardava só uma lista. Ler esse formato como inválido jogaria fora a arrumação
    // que o chefe fez (quem ele dispensou, quem ele adicionou) e voltaria ao padrão.
    const antigo = JSON.stringify(['cifra', null, 'agenda', 'norte', 'lume', null])
    // a lista antiga tinha 6 salas: completa até as 8 do andar, sem mexer em ninguém
    expect(lerVagas(antigo)).toEqual({ 0: ['cifra', null, 'agenda', 'norte', 'lume', null, null, null], 1: Array(8).fill(null) })
  })

  it('os dois andares têm a mesma disposição: 8 salas cada', () => {
    const v = lerVagas(null)
    expect([v[0].length, v[1].length]).toEqual([8, 8])
  })

  it('formato novo volta igual', () => {
    const v = { 0: ['cifra', 'vita', null, null, null, null, null, null], 1: ['pauta', null, null, null, null, null, null, null] }
    expect(lerVagas(JSON.stringify({ versao: 2, andares: v }))).toEqual(v)
  })

  it('o mesmo agente em dois andares fica só no primeiro', () => {
    const v = lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['cifra', null, null, null], 1: ['cifra', 'pauta', null, null] } }))
    expect(v[1]).toEqual([null, 'pauta', null, null, null, null, null, null])
  })

  it('lixo, agente que não existe e tamanho errado não quebram a tela', () => {
    expect(lerVagas('{{{')).toEqual(vagasPadrao())
    expect(lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['ninguem', 'cifra', null, null] } }))[0]).toEqual([null, 'cifra', null, null, null, null, null, null])
    expect(lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['cifra', 'vita', null], 1: Array(9).fill(null) } }))).toEqual({
      0: Array(8).fill(null), 1: Array(8).fill(null),
    })
  })
})
