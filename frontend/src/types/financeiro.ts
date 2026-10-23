// Espelha backend/routers/financeiro.py + resolvers/financeiro.py.
// Sem modelo/tokens/custo aqui: o resolver não os devolve, por decisão
// de produto (RNF02) — é a decisão original que virou regra do projeto.

export type Banco = 'itau' | 'nubank'

export interface ResultadoImportacao {
  total_no_arquivo: number
  novas: number
  duplicadas: number
  periodo_inicio: string | null
  periodo_fim: string | null
}

export interface GastoPorCategoria {
  categoria: string
  valor: number
  percentual: number
}

export interface PontoDiario {
  dia: number
  valor: number
}

export interface MaiorGasto {
  descricao: string
  valor: number
  data: string
  categoria: string
}

export interface Recorrencia {
  descricao: string
  tipo: 'parcela' | 'assinatura'
  valor: number
  parcela_atual?: number
  parcela_total?: number
  parcelas_restantes?: number
  projeta_proximo_mes: boolean
}

export interface DashboardFinanceiro {
  kpis: {
    gasto_mensal: number
    ganho_mensal: number
    // sempre null hoje: extrair saldo de fechamento ainda não está
    // implementado nos parsers (TODO declarado no resolver). O tipo
    // conta isso em vez de fingir que o número existe.
    saldo_ultimo_extrato: number | null
    gasto_previsto_proximo_mes: number
  }
  graficos: {
    entradas_saidas: { entradas: number; saidas: number }
    gastos_por_categoria: GastoPorCategoria[]
    evolucao_diaria: PontoDiario[]
  }
  recorrencias_detectadas: Recorrencia[]
  maiores_gastos: MaiorGasto[]
}

export interface AnaliseFinanceira {
  padroes_identificados: string[]
  recomendacoes: string[]
  resumo_textual: string
}

// O relatório congela o dashboard do momento da geração e acrescenta a
// narrativa — por isso herda a forma do dashboard.
export interface RelatorioFinanceiro extends DashboardFinanceiro {
  mes_referencia: string
  analise: AnaliseFinanceira
}
