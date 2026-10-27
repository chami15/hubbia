import { describe, expect, it } from 'vitest'
import { formatarHora, fusoDaString, horaDoDia, horaDoMundoMs, relogioDoServidor } from '../relogioDoMundo'

// Mesmos vetores de backend/tests/test_relogio.py: o frontend e o backend precisam concordar na conta.
const api = (extra: Partial<Parameters<typeof relogioDoServidor>[0]> = {}) => ({
  ancora_real: '2026-10-27T12:00:00-03:00',
  ancora_mundo: '2026-10-27T09:00:00-03:00',
  fator: 24,
  agora_real: '2026-10-27T12:00:00-03:00',
  hora_do_mundo: '2026-10-27T09:00:00-03:00',
  ...extra,
})
const real = Date.parse('2026-10-27T12:00:00-03:00')
const mundo = (r: ReturnType<typeof relogioDoServidor>, depoisMs: number) => horaDoMundoMs(r, real + depoisMs)

describe('horaDoMundoMs', () => {
  const r = relogioDoServidor(api(), real)

  it('fator 24: 1 minuto real são 24 minutos do mundo', () => {
    expect(mundo(r, 60_000)).toBe(Date.parse('2026-10-27T09:24:00-03:00'))
  })

  it('fator 24: uma hora real é um dia do mundo', () => {
    expect(mundo(r, 3_600_000)).toBe(Date.parse('2026-10-28T09:00:00-03:00'))
  })

  it('fator 1 é tempo real', () => {
    expect(mundo(relogioDoServidor(api({ fator: 1 }), real), 37 * 60_000)).toBe(Date.parse('2026-10-27T09:37:00-03:00'))
  })

  it('no instante da âncora, a hora é a da âncora', () => {
    expect(mundo(r, 0)).toBe(Date.parse('2026-10-27T09:00:00-03:00'))
  })

  it('corrige o relógio do navegador adiantado ou atrasado em relação ao servidor', () => {
    // o navegador está 5 min ATRASADO: quando o servidor diz 12:00, o navegador marca 11:55
    const navegadorAtrasado = relogioDoServidor(api(), real - 5 * 60_000)
    expect(horaDoMundoMs(navegadorAtrasado, real - 5 * 60_000)).toBe(Date.parse('2026-10-27T09:00:00-03:00'))
  })
})

describe('horaDoDia', () => {
  it('lê a hora no fuso do mundo, não no do navegador nem em UTC', () => {
    const quinze = Date.parse('2026-10-27T15:30:00Z') // 12:30 em São Paulo
    expect(horaDoDia(quinze, -180)).toBeCloseTo(12.5)
  })

  it('vira o dia sem sair de [0, 24)', () => {
    expect(horaDoDia(Date.parse('2026-10-28T02:59:59Z'), -180)).toBeCloseTo(23.9997, 3) // 23:59:59 do dia anterior em SP
    expect(horaDoDia(Date.parse('2026-10-28T03:00:00Z'), -180)).toBe(0)
  })

  it('instante antes de 1970 (módulo negativo) continua em [0, 24)', () => {
    const h = horaDoDia(-3_600_000, 0)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(24)
  })
})

describe('fusoDaString', () => {
  it.each([['2026-10-27T09:00:00-03:00', -180], ['2026-10-27T09:00:00+05:30', 330], ['2026-10-27T09:00:00Z', 0]])('%s → %i', (iso, esperado) => {
    expect(fusoDaString(iso)).toBe(esperado)
  })
})

describe('formatarHora', () => {
  it('HH:MM com zero à esquerda, sem arredondar para cima', () => {
    expect(formatarHora(9.5)).toBe('09:30')
    expect(formatarHora(23.9999)).toBe('23:59')
    expect(formatarHora(0)).toBe('00:00')
  })
})
