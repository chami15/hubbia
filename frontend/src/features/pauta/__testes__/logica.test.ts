import { describe, expect, it } from 'vitest'
import { blocos, dataLocal, nomeDaFrente, prazoEmPalavras, resumoDaRodada, voltar } from '../logica'

const HOJE = new Date(2026, 10, 11, 22, 30) // 11/11, 22h30: de noite, onde o fuso costuma errar

describe('prazoEmPalavras', () => {
  it.each([
    ['2026-11-08', 'venceu há 3 dias', 'vencido'],
    ['2026-11-10', 'venceu ontem', 'vencido'],
    ['2026-11-11', 'vence hoje', 'perto'],
    ['2026-11-12', 'amanhã', 'perto'],
    ['2026-11-13', 'em 2 dias', 'perto'],
    ['2026-11-18', 'em 7 dias', 'normal'],
    ['2026-12-20', '20/12', 'normal'],
  ])('%s -> %s', (prazo, texto, tom) => {
    expect(prazoEmPalavras(prazo, HOJE)).toEqual({ texto, tom })
  })
  it('sem prazo, nada', () => expect(prazoEmPalavras(null, HOJE)).toBeNull())
  it('a data é a do calendário, não meia-noite UTC (que no Brasil é o dia anterior)', () => {
    expect(dataLocal('2026-11-20').getDate()).toBe(20)
  })
})

describe('blocos', () => {
  it('proporcional, com ao menos um aceso se algo foi feito', () => {
    expect(blocos(0, 5).filter(Boolean)).toHaveLength(0)
    expect(blocos(1, 30).filter(Boolean)).toHaveLength(1)
    expect(blocos(5, 10).filter(Boolean)).toHaveLength(4)
    expect(blocos(10, 10).filter(Boolean)).toHaveLength(8)
  })
  it('sem item, tudo apagado', () => expect(blocos(0, 0).every((b) => !b)).toBe(true))
})

describe('navegação', () => {
  it('tarefa volta para a lista da frente dela; o resto volta para as frentes', () => {
    expect(voltar({ tipo: 'tarefa', frenteId: 2, tarefaId: 9 })).toEqual({ tipo: 'frente', frenteId: 2 })
    expect(voltar({ tipo: 'frente', frenteId: 2 })).toEqual({ tipo: 'frentes' })
    expect(voltar({ tipo: 'revisao' })).toEqual({ tipo: 'frentes' })
  })
  it('nome da frente com maiúscula', () => expect(nomeDaFrente('faculdade')).toBe('Faculdade'))
})

describe('resumoDaRodada', () => {
  it('fala o que aconteceu em poucas palavras', () => {
    expect(resumoDaRodada({ lidos: 4, organizados: 2, perguntas: 1, duplicados: 1, falhas: 0, contexto: { tarefas: 1 } })).toBe(
      '2 organizados · 1 pergunta · 1 repetido · contexto de 1 tarefa',
    )
  })
  it('nada feito é dito, não silenciado', () => {
    expect(resumoDaRodada({ lidos: 0, organizados: 0, perguntas: 0, duplicados: 0, falhas: 0 })).toBe('Nada novo para organizar.')
  })
})
