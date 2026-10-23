// Espelha backend/routers/norte.py + db/migrations/006_norte.sql.
//
// Como nos outros domínios, nada de `modelo`/`tokens`/`custo_usd` aqui:
// as colunas existem em `cards`, mas os RETURNING não as devolvem (RNF02).

export type StatusProjeto = 'ativo' | 'pausado' | 'concluido' | 'abandonado'
export type TipoCard = 'feature' | 'bug' | 'refatoracao' | 'proximo_passo'
export type StatusCard = 'sugerido' | 'aceito' | 'rejeitado' | 'finalizado'
export type OrigemCard = 'agente' | 'manual'

export interface Projeto {
  id: number
  nome: string
  repositorio_url: string
  repositorio_owner: string
  repositorio_nome: string
  branch: string | null
  // os três saem de um scan feito UMA vez, no cadastro — podem vir null
  // se o scan não conseguiu inferir
  descricao: string | null
  stack: string[] | null
  arquitetura_resumo: string | null
  status: StatusProjeto
  criado_em: string
  atualizado_em: string
  // calculado no servidor (mesma regra de projetos:listar_estagnados,
  // usada pela proatividade do tick): ativo, sem card em aberto, parado
  // há mais que o limite configurado. Nunca true fora de status='ativo'.
  estagnado: boolean
}

export interface Card {
  id: number
  projeto_id: number
  tipo: TipoCard
  titulo: string
  descricao: string
  // sempre com pelo menos um caminho — o banco tem CHECK de cardinalidade.
  // É o que impede o card de virar "melhorar o botão" sem dizer onde.
  arquivos_afetados: string[]
  origem: OrigemCard
  status: StatusCard
  criado_em: string
  resolvido_em?: string | null
}

// Rejeitar e finalizar já devolvem o PRÓXIMO card na mesma resposta — por
// isso a UI não tem botão de "gerar próximo".
//
// `aviso` existe porque o encadeamento pode falhar SEM desfazer a
// resolução (isso já aconteceu de verdade, segundo o comentário do
// resolver): o card resolvido continua resolvido, e o aviso conta que o
// próximo não veio. A tela precisa mostrar isso em vez de simplesmente
// não ter card nenhum sem explicação.
export interface ResolucaoCard {
  card_resolvido: Card
  proximo_card: Card | null
  aviso: string | null
}
