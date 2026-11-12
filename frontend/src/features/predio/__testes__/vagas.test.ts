import { describe, expect, it } from 'vitest'
import { lerVagas, vagasPadrao } from '../vagas'

const livre6 = Array(6).fill(null)

describe('vagas por andar', () => {
  it('primeira visita: térreo com os de fábrica, 2º andar vazio esperando', () => {
    const v = lerVagas(null)
    expect(v[0]).toEqual(['cifra', 'vita', 'agenda', 'norte', 'motriz', 'pauta'])
    expect(v[1]).toEqual(livre6)
  })

  it('os dois andares têm a mesma disposição: 6 salas cada', () => {
    const v = lerVagas(null)
    expect([v[0].length, v[1].length]).toEqual([6, 6])
  })

  it('regressão: o formato antigo (só a lista do térreo) não pode perder a disposição do chefe', () => {
    // Antes dos andares, o navegador guardava só uma lista. Ler esse formato como inválido jogaria fora a arrumação
    // que o chefe fez (quem ele dispensou, quem ele adicionou) e voltaria ao padrão.
    const antigo = JSON.stringify(['cifra', null, 'agenda', 'norte'])
    expect(lerVagas(antigo)).toEqual({ 0: ['cifra', null, 'agenda', 'norte', null, null], 1: livre6 })
  })

  it('regressão: térreo salvo com mais de 6 salas não pode sumir com ninguém', () => {
    // O térreo já aceitou até 8 salas. Com 6 por andar, a lista salva de 8 era recusada inteira (tamanho acima do
    // máximo) e voltava ao padrão: quem estava nas salas 7 e 8 sumia do prédio. Os de sobra vão para o 2º andar.
    const antigo = JSON.stringify(['cifra', 'vita', 'agenda', 'norte', 'motriz', 'pauta', 'lume', 'lar'])
    const v = lerVagas(antigo)
    expect(v[0]).toEqual(['cifra', 'vita', 'agenda', 'norte', 'motriz', 'pauta'])
    expect(v[1]).toEqual(['lume', 'lar', null, null, null, null])
    const novo = JSON.stringify({ versao: 2, andares: { 0: ['cifra', null, 'agenda', null, null, null, 'rota', null], 1: livre6 } })
    expect(Object.values(lerVagas(novo)).flat()).toEqual(expect.arrayContaining(['cifra', 'agenda', 'rota']))
  })

  it('formato novo volta igual', () => {
    const v = { 0: ['cifra', 'vita', null, null, null, null], 1: ['pauta', null, null, null, null, null] }
    expect(lerVagas(JSON.stringify({ versao: 2, andares: v }))).toEqual(v)
  })

  it('o mesmo agente em dois andares fica só no primeiro', () => {
    const v = lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['cifra', null, null, null], 1: ['cifra', 'pauta', null, null] } }))
    expect(v[1]).toEqual([null, 'pauta', null, null, null, null])
  })

  it('lixo, agente que não existe e tamanho errado não quebram a tela', () => {
    expect(lerVagas('{{{')).toEqual(vagasPadrao())
    expect(lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['ninguem', 'cifra', null, null] } }))[0]).toEqual([null, 'cifra', null, null, null, null])
    expect(lerVagas(JSON.stringify({ versao: 2, andares: { 0: ['cifra', 'vita', null], 1: 'nada' } }))).toEqual({ 0: livre6, 1: livre6 })
  })
})
