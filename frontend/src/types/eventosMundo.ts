// Espelha backend/resolvers/interacao.py (listar_eventos_mundo /
// criar_evento_mundo) — pool curado de ganchos de conversa social
// (ver `_sortear_evento_mundo`, sql/eventos_mundo.sql:sortear_menos_usado).

export interface EventoMundo {
  id: number
  descricao: string
  // tick em que o evento foi CADASTRADO — null pra quem já veio do seed
  tick: number | null
  // tick da última vez que entrou numa mensagem social. null = nunca
  // usado, e é o que prioriza o sorteio (ASC NULLS FIRST) — ausente na
  // resposta de criação (o INSERT não devolve essa coluna), então
  // sempre trate como "ainda não usado" quando faltar
  ultimo_uso_tick?: number | null
  criado_em: string
}
