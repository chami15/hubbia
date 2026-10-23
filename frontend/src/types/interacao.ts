// Espelha backend/resolvers/interacao.py (POST /interacao/tick/processar)
// — Etapas 2 (social) e 3 (proatividade de trabalho) do motor de tick.

export type TipoInteracao = 'trabalho' | 'social' | null

export interface InteracaoAgente {
  agente_id: number
  agente_nome: string
  tipo: TipoInteracao
  // só passa de null quando o agente NÃO tinha motivo de trabalho —
  // sorteia se ele tenta puxar papo social neste tick. Vem preenchido
  // mesmo quando `quer_falar` deu false, então dá pra mostrar a chance
  // que rolou mesmo num tick sem ação nenhuma.
  chance_falar: number | null
  quer_falar: boolean
  destinatario_id: number | null
  destinatario_nome: string | null
  // null em dry_run — a ação/mensagem nunca chega a ser gerada, mesmo
  // quando tipo e destinatário já estão decididos
  mensagem: string | null
  // só em tipo === 'trabalho'
  motivo?: string
  // só em tipo === 'social' com quer_falar — presente (mesmo null)
  // quando o agente respondeu a uma pendência em vez de puxar assunto novo
  respondendo_a_id?: number | null
  // erro pontual DESTE agente (ex: token do Google fora, sem destinatário
  // elegível) — nunca derruba o resto da rodada
  aviso?: string
}

export interface RodadaProcessada {
  tick: number
  dry_run: boolean
  orcamento_disponivel_hoje: number
  // presente só quando a rodada INTEIRA não rodou (orçamento esgotado,
  // sem colaborador ativo) — nesse caso `interacoes` vem vazio
  aviso?: string
  interacoes: InteracaoAgente[]
}
