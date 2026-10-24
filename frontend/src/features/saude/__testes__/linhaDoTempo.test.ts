import { describe, expect, it } from 'vitest'
import type { HistoricoSaude } from '../../../types/saude'
import { diaLocal, montarLinhaDoTempo, rotuloDoDia } from '../linhaDoTempo'

// Datas montadas no fuso local de propósito: o agrupamento é por dia LOCAL, e o teste não pode depender do TZ da máquina.
const em = (dia: number, h: number, m = 0) => new Date(2026, 9, dia, h, m).toISOString()
const HOJE = new Date(2026, 9, 24, 15, 0)
const vazio: HistoricoSaude = { dias: 14, refeicoes: [], sono: [], atividades: [], peso: [], hidratacao: [] }

describe('montarLinhaDoTempo', () => {
  it('sem registros não há grupo nenhum', () => {
    expect(montarLinhaDoTempo(vazio, HOJE)).toEqual([])
  })

  it('agrupa por dia, dia mais recente primeiro, com hoje e ontem por extenso', () => {
    const grupos = montarLinhaDoTempo(
      { ...vazio, peso: [{ id: 1, peso_kg: 79.5, registrado_em: em(22, 8) }, { id: 2, peso_kg: 80, registrado_em: em(24, 8) }, { id: 3, peso_kg: 79.8, registrado_em: em(23, 8) }] },
      HOJE,
    )
    expect(grupos.map((g) => g.rotulo)).toEqual(['hoje', 'ontem', '22/10'])
  })

  it('dentro do dia, o mais recente vem primeiro e a hora sai no fuso local', () => {
    const [hoje] = montarLinhaDoTempo(
      {
        ...vazio,
        refeicoes: [
          { id: 1, tipo_refeicao: 'cafe_da_manha', origem: 'texto', descricao: 'pão', calorias: 300, carboidratos_g: 1, proteinas_g: 1, gorduras_g: 1, confianca_estimativa: 'alta', registrado_em: em(24, 8, 5) },
          { id: 2, tipo_refeicao: 'almoco', origem: 'foto', descricao: 'prato feito', calorias: 700.4, carboidratos_g: 1, proteinas_g: 1, gorduras_g: 1, confianca_estimativa: 'alta', registrado_em: em(24, 12, 30) },
        ],
      },
      HOJE,
    )
    expect(hoje.entradas.map((e) => [e.hora, e.titulo])).toEqual([['12:30', 'almoço · 700 kcal'], ['08:05', 'café da manhã · 300 kcal']])
  })

  it('estimativa que não é de alta confiança avisa, para não passar por número exato', () => {
    const [g] = montarLinhaDoTempo(
      { ...vazio, refeicoes: [{ id: 1, tipo_refeicao: 'jantar', origem: 'foto', descricao: 'pizza', calorias: 900, carboidratos_g: 1, proteinas_g: 1, gorduras_g: 1, confianca_estimativa: 'baixa', registrado_em: em(24, 20) }] },
      HOJE,
    )
    expect(g.entradas[0].detalhe).toBe('pizza · confiança baixa')
  })

  it('água vira uma linha só por dia, com o total e a contagem', () => {
    const [g] = montarLinhaDoTempo(
      { ...vazio, hidratacao: [{ id: 1, quantidade_ml: 500, registrado_em: em(24, 9) }, { id: 2, quantidade_ml: 300, registrado_em: em(24, 14, 10) }, { id: 3, quantidade_ml: 200, registrado_em: em(24, 11) }] },
      HOJE,
    )
    expect(g.entradas).toHaveLength(1)
    expect(g.entradas[0]).toMatchObject({ titulo: 'água · 1.0 L', detalhe: '3 registros', hora: '14:10' })
  })

  it('sono entra no dia da data de referência, sem hora, no fim do dia', () => {
    const [g] = montarLinhaDoTempo(
      { ...vazio, sono: [{ id: 1, horas: 7.5, qualidade: 'boa', data_referencia: '2026-10-24' }], peso: [{ id: 1, peso_kg: 80, registrado_em: em(24, 7) }] },
      HOJE,
    )
    expect(g.entradas.map((e) => e.tipo)).toEqual(['peso', 'sono'])
    expect(g.entradas[1]).toMatchObject({ hora: '', titulo: 'sono · 7.5 h', detalhe: 'boa' })
  })

  it('atividade sem observação não inventa detalhe', () => {
    const [g] = montarLinhaDoTempo({ ...vazio, atividades: [{ id: 1, tipo: 'corrida', duracao_min: 30, observacao: null, registrado_em: em(24, 18) }] }, HOJE)
    expect(g.entradas[0]).toMatchObject({ titulo: 'corrida · 30 min', detalhe: undefined })
  })
})

describe('rotuloDoDia', () => {
  it('vira o mês e o ano sem errar o ontem', () => {
    const primeiro = new Date(2026, 10, 1, 10)
    expect(rotuloDoDia(diaLocal(new Date(2026, 9, 31)), primeiro)).toBe('ontem')
  })
})
