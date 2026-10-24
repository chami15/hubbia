import { describe, expect, it } from 'vitest'
import type { ConversaAgenda } from '../../../types/agenda'
import { conversaDoServidor } from '../conversa'

const fala = (id: number, de: 'chefe' | 'agente', texto: string, acao: number | null = null) => ({ id, de, texto, acao_pendente_id: acao, criado_em: '2026-10-24T10:00:00' })

describe('conversaDoServidor', () => {
  it('mantém a ordem e liga a proposta à fala que tem botão', () => {
    const c: ConversaAgenda = {
      falas: [fala(1, 'chefe', 'marca jantar'), fala(2, 'agente', 'Sábado 20h. Confirma?', 7)],
      acao_pendente_id: 7,
      aguardando_confirmacao: true,
    }
    const { falas, pendenteId } = conversaDoServidor(c)
    expect(falas).toEqual([
      { id: 1, de: 'chefe', texto: 'marca jantar', acaoPendenteId: undefined },
      { id: 2, de: 'agente', texto: 'Sábado 20h. Confirma?', acaoPendenteId: 7 },
    ])
    expect(pendenteId).toBe(7)
  })

  it('pergunta pendente não mostra botões (pendenteId nulo)', () => {
    const c: ConversaAgenda = { falas: [fala(1, 'agente', 'Qual dia?')], acao_pendente_id: 9, aguardando_confirmacao: false }
    expect(conversaDoServidor(c).pendenteId).toBeNull()
  })

  it('conversa vazia', () => {
    expect(conversaDoServidor({ falas: [], acao_pendente_id: null, aguardando_confirmacao: false })).toEqual({ falas: [], pendenteId: null })
  })
})
