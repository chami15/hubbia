import { describe, expect, it } from 'vitest'
import type { Agente } from '../../../types/agente'
import type { Mensagem } from '../../../types/mensagens'
import type { Projeto } from '../../../types/norte'
import { humorDe, sinaisPorAgente, type Sinais } from '../humor'

const agente = (id: number, especialidade: string, tipo: 'chefe' | 'colaborador' = 'colaborador') =>
  ({ id, nome: especialidade, tipo, especialidade, estado: 'idle', mesa: null, avatar_config: { cor: '#000', rosto: '' }, ativo: true }) as unknown as Agente
const AGENTES = [agente(1, 'chefe', 'chefe'), agente(2, 'financeiro'), agente(5, 'norte'), agente(6, 'infra')]
const local: Record<string, string> = { financeiro: 'cifra', norte: 'norte', infra: 'motriz' }
const localDe = (id: number) => local[AGENTES.find((a) => a.id === id)?.especialidade ?? '']
const msg = (o: Partial<Mensagem>): Mensagem => ({
  id: 1, tipo: 'trabalho', conteudo: 'ok', tick: 10, criado_em: '', remetente_id: 2, remetente_nome: '', destinatario_id: 1, destinatario_nome: '',
  respondendo_a_id: null, respondendo_a_conteudo: null, respondendo_a_remetente_nome: null, lida_pelo_chefe: true, ...o,
})
const base: Sinais = { naoLidas: 0, falhasHoje: 0, orcamentoEsgotado: false, gastaLlm: true, projetosParados: [], ticksSemFazerNada: 0 }

describe('humorDe: um humor por vez, sempre com o motivo real', () => {
  it('sem nenhum sinal, sem humor (nada para mostrar)', () => {
    expect(humorDe(base)).toBeNull()
  })
  it('mensagem esperando você vem antes de tudo', () => {
    expect(humorDe({ ...base, naoLidas: 1, falhasHoje: 5 })).toEqual({ humor: 'ansioso', motivo: 'Está esperando sua resposta.' })
  })
  it('duas falhas ou mais deixam tenso (uma só, não)', () => {
    expect(humorDe({ ...base, falhasHoje: 1 })).toBeNull()
    expect(humorDe({ ...base, falhasHoje: 3 })).toEqual({ humor: 'tenso', motivo: '3 chamadas falharam hoje.' })
  })
  it('orçamento esgotado deixa contido quem usa LLM, não o Motriz', () => {
    expect(humorDe({ ...base, orcamentoEsgotado: true })?.humor).toBe('contido')
    expect(humorDe({ ...base, orcamentoEsgotado: true, gastaLlm: false })).toBeNull()
  })
  it('projeto parado deixa preocupado, dizendo qual', () => {
    expect(humorDe({ ...base, projetosParados: ['hubbia'] })).toEqual({ humor: 'preocupado', motivo: 'O projeto hubbia está parado.' })
    expect(humorDe({ ...base, projetosParados: ['a', 'b'] })?.motivo).toBe('2 projetos parados: a, b.')
  })
  it('entrega recente deixa orgulhoso, com o que entregou (resumido)', () => {
    const h = humorDe({ ...base, ultimaEntrega: { texto: 'Fechei o relatório de março — gastos R$ 1200,00, ganhos R$ 3000,00.', ticksAtras: 1 } })
    expect(h?.humor).toBe('orgulhoso')
    expect(h?.motivo).toBe('Acabou de entregar: fechei o relatório de março.')
    expect(humorDe({ ...base, ultimaEntrega: { texto: 'x', ticksAtras: 5 } })).toBeNull() // já faz tempo
  })
  it('muitos ticks sem fazer nada deixam entediado', () => {
    expect(humorDe({ ...base, ticksSemFazerNada: 7 })).toBeNull()
    expect(humorDe({ ...base, ticksSemFazerNada: 8 })?.humor).toBe('entediado')
  })
})

describe('sinaisPorAgente: do que a API já devolve para os sinais de cada agente', () => {
  const projetos = [{ nome: 'hubbia', estagnado: true }, { nome: 'outro', estagnado: false }] as Projeto[]
  const s = sinaisPorAgente(
    {
      agentes: AGENTES,
      mensagens: [
        msg({ id: 1, remetente_id: 2, tipo: 'trabalho', conteudo: 'Fechei o relatório', tick: 9 }),
        msg({ id: 2, remetente_id: 5, tipo: 'social', destinatario_id: 2, tick: 2 }),
        msg({ id: 3, remetente_id: 6, tipo: 'trabalho', lida_pelo_chefe: false, tick: 10 }),
      ],
      metricas: { por_agente: [{ agente_id: 5, erros: 2 }] },
      orcamentoDisponivel: 0.3,
      projetos,
      tickAtual: 10,
    },
    localDe,
  )

  it('mensagem não lida conta para quem mandou', () => {
    expect(s.get('motriz')?.naoLidas).toBe(1)
    expect(s.get('cifra')?.naoLidas).toBe(0)
  })
  it('falhas de hoje saem das métricas da sala de máquinas (só a contagem, nada de custo)', () => {
    expect(s.get('norte')?.falhasHoje).toBe(2)
  })
  it('a última entrega é a última mensagem de trabalho para o chefe, com quantos ticks atrás', () => {
    expect(s.get('cifra')?.ultimaEntrega).toEqual({ texto: 'Fechei o relatório', ticksAtras: 1 })
  })
  it('ticks sem fazer nada contam da última mensagem dele, de qualquer tipo', () => {
    expect(s.get('norte')?.ticksSemFazerNada).toBe(8)
  })
  it('projetos parados só pesam no Norte; o Motriz não gasta LLM', () => {
    expect(s.get('norte')?.projetosParados).toEqual(['hubbia'])
    expect(s.get('cifra')?.projetosParados).toEqual([])
    expect(s.get('motriz')?.gastaLlm).toBe(false)
  })
  it('o chefe não tem humor', () => {
    expect(s.has('chefe')).toBe(false)
  })
})
