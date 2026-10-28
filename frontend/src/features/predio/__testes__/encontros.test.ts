import { describe, expect, it } from 'vitest'
import type { Mensagem } from '../../../types/mensagens'
import { layoutBalao, limparParaFonte, planejarEncontros, textoParaBalao } from '../encontros'

describe('limparParaFonte', () => {
  it('fica em minúsculas, guarda os acentos que a fonte tem e troca ? e ! por ponto', () => {
    expect(limparParaFonte('Você VIU o relatório? Ótimo!')).toBe('você viu o relatório. ótimo.')
  })
  it('acento que a fonte não tem cai para a letra base; aspas e emoji somem', () => {
    expect(limparParaFonte('“Pão” à la crème 😀 ü')).toBe('pão à la creme u')
  })
})

describe('textoParaBalao', () => {
  it('quebra por palavra sem passar do limite da linha', () => {
    const l = textoParaBalao('bom dia, já viu o quadro do projeto novo hoje cedo', 16, 5)
    expect(l.every((x) => x.length <= 16)).toBe(true)
    expect(l.join(' ')).toBe('bom dia, já viu o quadro do projeto novo hoje cedo')
  })
  it('texto longo termina em "..." na última linha', () => {
    const l = textoParaBalao('a '.repeat(80), 10, 2)
    expect(l).toHaveLength(2)
    expect(l[1].endsWith('...')).toBe(true)
    expect(l[1].length).toBeLessThanOrEqual(10)
  })
  it('palavra maior que a linha é cortada', () => {
    expect(textoParaBalao('supercalifragilisticoexpialidoso', 10, 5).every((x) => x.length <= 10)).toBe(true)
  })
})

const msg = (o: Partial<Mensagem>): Mensagem => ({
  id: 1, tipo: 'social', conteudo: 'oi, tudo bem', tick: 1, criado_em: '', remetente_id: 2, remetente_nome: '', destinatario_id: 3,
  destinatario_nome: '', respondendo_a_id: null, respondendo_a_conteudo: null, respondendo_a_remetente_nome: null, ...o,
})
const ids: Record<number, string> = { 1: 'chefe', 2: 'cifra', 3: 'vita', 4: 'norte' }
const ctx = (o: { presentes?: string[]; visitando?: [string, string][] } = {}) => ({
  localDe: (id: number) => (ids[id] === 'chefe' ? undefined : ids[id]),
  presentes: new Set(o.presentes ?? ['cifra', 'vita', 'norte']),
  visitando: new Map(o.visitando ?? []),
})

describe('planejarEncontros', () => {
  it('mensagem social entre dois agentes presentes vira visita com o texto', () => {
    expect(planejarEncontros([msg({})], ctx())).toEqual([{ tipo: 'visita', de: 'cifra', para: 'vita', linhas: ['oi, tudo bem'] }])
  })
  it('trabalho, mural (sem destinatário) e mensagem para o chefe não viram encontro', () => {
    expect(planejarEncontros([msg({ tipo: 'trabalho' }), msg({ id: 2, destinatario_id: null }), msg({ id: 3, destinatario_id: 1 })], ctx())).toEqual([])
  })
  it('agente fora do prédio (dispensado ou almoçando fora) não recebe nem faz visita', () => {
    expect(planejarEncontros([msg({})], ctx({ presentes: ['cifra'] }))).toEqual([])
  })
  it('resposta para quem está visitando você vira só um balão, sem andar', () => {
    const r = planejarEncontros([msg({ id: 9, remetente_id: 3, destinatario_id: 2, conteudo: 'tudo ótimo' })], ctx({ visitando: [['cifra', 'vita']] }))
    expect(r).toEqual([{ tipo: 'fala', de: 'vita', linhas: ['tudo ótimo'] }])
  })
  it('pergunta e resposta no mesmo lote: visita e depois o balão de resposta', () => {
    const r = planejarEncontros([msg({ id: 2, remetente_id: 3, destinatario_id: 2, conteudo: 'tudo' }), msg({ id: 1 })], ctx())
    expect(r.map((e) => e.tipo)).toEqual(['visita', 'fala'])
  })
  it('uma visita por vez: a segunda mensagem do mesmo remetente no lote é ignorada', () => {
    const r = planejarEncontros([msg({ id: 1 }), msg({ id: 2, destinatario_id: 4 })], ctx())
    expect(r).toHaveLength(1)
  })
})

describe('layoutBalao', () => {
  it('fica acima da cabeça e centrado em quem fala', () => {
    const b = layoutBalao(['oi'], 100, 50, 400)
    expect(b.y0 + b.h).toBeLessThan(50)
    expect(Math.abs(b.x0 + b.w / 2 - 100)).toBeLessThanOrEqual(1) // pixel inteiro: no máximo 1 px de arredondamento
  })
  it('na borda do prédio, desliza para dentro e a cauda continua no personagem', () => {
    const b = layoutBalao(['uma frase comprida aqui'], 4, 50, 400)
    expect(b.x0).toBeGreaterThanOrEqual(2)
    expect(b.caudaX).toBeGreaterThanOrEqual(b.x0 + 4)
    expect(b.caudaX).toBeLessThanOrEqual(10)
  })
})
