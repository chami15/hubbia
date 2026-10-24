import { describe, expect, it } from 'vitest'
import { encaixarBolha, pontoNaTela, temAtalho } from '../atalho'

describe('pontoNaTela', () => {
  it('amplia o mundo pelo tamanho que o canvas tem na tela', () => {
    // canvas 1x de 200x100 mostrado em 600x300 a partir de (50, 20): o ponto (100, 50) fica no meio
    expect(pontoNaTela({ left: 50, top: 20, width: 600, height: 300 }, { W: 200, H: 100 }, { x: 100, y: 50 })).toEqual({ x: 350, y: 170 })
  })
})

describe('encaixarBolha', () => {
  const bolha = { w: 200, h: 80 }
  const area = { w: 800, h: 600 }

  it('fica centrada acima do personagem quando há espaço', () => {
    const e = encaixarBolha({ x: 400, y: 300 }, bolha, area)
    expect(e).toMatchObject({ x: 300, y: 214, abaixo: false, caudaX: 100 })
  })

  it('desliza para dentro na borda mas a cauda continua no personagem', () => {
    const e = encaixarBolha({ x: 20, y: 300 }, bolha, area)
    expect(e.x).toBe(8)
    expect(e.x + e.caudaX).toBeGreaterThanOrEqual(20 - 1)
    expect(e.x + e.caudaX).toBeLessThanOrEqual(20 + 10) // a cauda não sai do canto da bolha: aproxima o máximo que dá
  })

  it('vai para baixo quando não cabe em cima', () => {
    const e = encaixarBolha({ x: 400, y: 40 }, bolha, area)
    expect(e.abaixo).toBe(true)
    expect(e.y).toBeGreaterThan(40)
  })

  it('nunca sai da área, nem em área pequena', () => {
    const e = encaixarBolha({ x: 790, y: 590 }, bolha, { w: 300, h: 150 })
    expect(e.x).toBeGreaterThanOrEqual(8)
    expect(e.y).toBeGreaterThanOrEqual(8)
    expect(e.x + bolha.w).toBeLessThanOrEqual(300)
    expect(e.y + bolha.h).toBeLessThanOrEqual(150)
  })

  it('devolve pixel inteiro (borda de pixel art em posição fracionária borra)', () => {
    const e = encaixarBolha({ x: 400.6, y: 300.4 }, { w: 201, h: 81 }, area)
    for (const v of [e.x, e.y, e.caudaX]) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('temAtalho', () => {
  it('só a Vita tem atalho por enquanto', () => {
    expect(temAtalho('vita')).toBe(true)
    expect(temAtalho('cifra')).toBe(false)
  })
})
