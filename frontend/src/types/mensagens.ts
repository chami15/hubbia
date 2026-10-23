// Espelha o formato comum das três queries de mensagens (listar_todas,
// listar_por_tipo, caixa_de_entrada — sql/mensagens.sql): todas fazem o
// mesmo JOIN duplo (agentes + a própria tabela, pra citação), então
// devolvem exatamente a mesma forma de linha.

export type TipoMensagem = 'trabalho' | 'social'

export interface Mensagem {
  id: number
  tipo: TipoMensagem
  conteudo: string
  tick: number | null
  criado_em: string
  remetente_id: number
  remetente_nome: string
  destinatario_id: number | null
  destinatario_nome: string | null
  // auto-referência a outra mensagem — presente só quando esta é
  // resposta direta a outra (JOIN LEFT, então os três campos abaixo só
  // vêm preenchidos junto com este)
  respondendo_a_id: number | null
  respondendo_a_conteudo: string | null
  respondendo_a_remetente_nome: string | null
  // "lida" é por CLIQUE na mensagem específica (decisão do chefe), nunca
  // por abrir a thread inteira — não presente na resposta de
  // POST /responder (o insert não devolve a coluna), mas isso nunca
  // importa: a resposta é sempre do PRÓPRIO chefe, que não conta pro
  // "não lida" de qualquer forma (só mensagens QUE CHEGARAM contam)
  lida_pelo_chefe?: boolean
}
