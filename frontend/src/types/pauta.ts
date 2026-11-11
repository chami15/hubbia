// Espelha backend/routers/pauta.py (Pauta, secretário pessoal). Datas vêm como string ISO.

export interface Frente {
  id: number
  nome: string
  ordem: number
  abertas: number
  prazo_mais_proximo: string | null
}

export type StatusTarefa = 'aberta' | 'feita' | 'arquivada'

/** Uma linha da lista de tarefas de uma frente. */
export interface TarefaResumo {
  id: number
  titulo: string
  prazo: string | null
  status: StatusTarefa
  oculta: boolean
  ultimo_movimento_em: string
  concluida_em: string | null
  itens_total: number
  itens_feitos: number
  tudo_feito: boolean
}

export interface ItemChecklist {
  id: number
  tarefa_id: number
  texto: string
  ordem: number
  feito: boolean
  feito_em: string | null
  origem: 'agente' | 'manual'
}

/** "O que já se sabe" (P3): cada tópico diz de quais textos saiu. */
export interface Topico {
  id: number
  texto: string
  fontes: number[]
  ordem: number
}

export interface TextoDaTarefa {
  id: number
  texto: string
  status: string
  recebida_em: string
}

export interface Sugestao {
  id: number
  tarefa_id: number
  status: string
  proximo_passo: string
  como: string[]
  por_que: string
  criada_em: string
  /** false = a tarefa mudou depois da sugestão (mostrar como desatualizada). */
  atual?: boolean
}

export interface Tarefa extends TarefaResumo {
  frente_id: number
  frente: string
  termos: string[]
  origem: 'agente' | 'manual'
  checklist: ItemChecklist[]
  contexto: Topico[]
  textos: TextoDaTarefa[]
  sugestao: Sugestao | null
}

export interface ContagemTextos {
  novas: number
  aguardando_voce: number
  falhas: number
}

export interface TextoFalhou {
  id: number
  texto: string
  erro: string
  recebida_em: string
}

export interface Pergunta {
  id: number
  tipo: 'destino' | 'mesma_tarefa'
  texto: string
  opcoes: { indice: number; rotulo: string }[]
  texto_original: string
  na_fila: number
}

export interface ResumoRodada {
  lidos: number
  organizados: number
  perguntas: number
  duplicados: number
  falhas: number
  devolvidos: number
  chamou_llm: boolean
  contexto?: { tarefas: number; falhas: number }
}

export type GrupoRevisao = 'foco' | 'pode_esperar' | 'talvez_nem_valha'

export interface ItemRevisao {
  id: number
  tarefa_id: number
  titulo: string
  frente: string
  tarefa_status: StatusTarefa
  por_que: string
  acao: 'arquivar' | 'juntar' | null
  juntar_com: number | null
  juntar_com_titulo: string | null
  status: 'pendente' | 'aceito' | 'descartado'
}

export interface Revisao {
  id: number
  atual: boolean
  foco: ItemRevisao[]
  pode_esperar: ItemRevisao[]
  talvez_nem_valha: ItemRevisao[]
}
