import { describe, expect, it } from 'vitest'
import type { MotivoRecusaTick, RespostaTickAutomatico } from '../../../types/tick'
import { proximoPasso } from '../tickAutomatico'

const ok = (proximo_em_s: number) => ({ executado: true, tick: {} as never, rodada: {} as never, proximo_em_s }) as RespostaTickAutomatico
const recusa = (motivo: MotivoRecusaTick, parar: boolean, espera_s: number | null = null) =>
  ({ executado: false, motivo, mensagem: `msg ${motivo}`, parar, espera_s }) as RespostaTickAutomatico

describe('proximoPasso', () => {
  it('rodou: agenda a próxima no intervalo que o BACKEND mandou (o app não repete o número)', () => {
    expect(proximoPasso(ok(300))).toEqual({ tipo: 'agendar', emMs: 300_000 })
    expect(proximoPasso(ok(420))).toEqual({ tipo: 'agendar', emMs: 420_000 })
  })

  it.each<[MotivoRecusaTick]>([['fora_do_expediente'], ['orcamento_esgotado'], ['limite_diario'], ['fatia_orcamento']])(
    'recusa dura (%s): desliga e mostra a mensagem do backend',
    (motivo) => {
      expect(proximoPasso(recusa(motivo, true))).toEqual({ tipo: 'parar', mensagem: `msg ${motivo}` })
    },
  )

  it('cedo demais não desliga: espera o que o backend pediu e tenta de novo', () => {
    expect(proximoPasso(recusa('cedo_demais', false, 42))).toEqual({ tipo: 'agendar', emMs: 42_000 })
  })

  it('regressão: espera 0 ou ausente nunca vira laço de requisições', () => {
    // um `espera_s: 0` (ou faltando) faria o timer disparar sem pausa; o piso é 1 s e o padrão 5 s
    expect(proximoPasso(recusa('cedo_demais', false, 0))).toEqual({ tipo: 'agendar', emMs: 1_000 })
    expect(proximoPasso(recusa('cedo_demais', false, null))).toEqual({ tipo: 'agendar', emMs: 5_000 })
    expect(proximoPasso(ok(0))).toEqual({ tipo: 'agendar', emMs: 1_000 })
  })

  it('falha de rede desliga em vez de insistir (nada de retry automático)', () => {
    const p = proximoPasso({ erro: 'Sem conexão com o servidor.' })
    expect(p.tipo).toBe('parar')
    expect(p.tipo === 'parar' && p.mensagem).toContain('Sem conexão com o servidor.')
  })
})
