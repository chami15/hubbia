// Espelha backend/resolvers/infra.py (GET /infra/saude, /infra/metricas).
// Nada aqui gasta LLM — os dois endpoints são leitura determinística,
// então podem carregar ao abrir o painel sem ferir o RNF01.

export type StatusInfra = 'ok' | 'atencao' | 'quebrado' | 'nao_configurado'

export interface ItemSaude {
  nome: string
  status: StatusInfra
  detalhe: string
  // o que fazer a respeito — só vem preenchido quando existe uma ação
  // concreta do chefe. Aviso sem ação é aviso que ensina a ignorar aviso.
  acao: string | null
}

export interface SaudeInfra {
  // o PIOR status entre os itens: um item quebrado nunca fica escondido
  // atrás de cinco itens ok
  status_geral: StatusInfra
  itens: ItemSaude[]
}

export interface CustoPorAgente {
  agente_id: number
  agente_nome: string
  especialidade: string
  chamadas: number
  erros: number
}

export interface ErroExecucao {
  id: number
  // null quando a chamada aconteceu FORA de um tick — ação que o chefe
  // disparou direto (gerar relatório, falar com a Agenda). Não é dado
  // faltando, é a distinção entre "o escritório gastou sozinho" e "eu
  // mandei gastar" (ver migration 010).
  tick: number | null
  agente_nome: string
  erro: string | null
  criado_em: string | null
}

export interface MetricasInfra {
  desde: string
  dias: number
  chamadas: number
  ticks_com_gasto: number
  custo_usd: number
  erros: number
  taxa_sucesso: number
  orcamento_diario_usd: number
  por_agente: CustoPorAgente[]
  ultimos_erros: ErroExecucao[]
}

// --- painel de monitoramento (GET /infra/observabilidade) ---

export interface PontoSerie {
  hora: string
  chamadas: number
  erros: number
  // null quando a hora não teve nenhuma chamada com duração medida
  duracao_media_ms: number | null
}

export interface LatenciaAgente {
  agente_id: number
  agente_nome: string
  especialidade: string
  amostras: number
  p50_ms: number
  p95_ms: number
  max_ms: number
}

export interface Dependencia {
  especialidade: string
  agente_nome: string
  ultimo_ok: string | null
  ultimo_erro: string | null
}

export interface Execucao {
  id: number
  tick: number | null
  agente_nome: string
  especialidade: string
  duracao_ms: number | null
  erro: string | null
  criado_em: string | null
  contexto_prompt: string | null
  saida_bruta: string | null
}

export interface Observabilidade {
  janela_horas: number
  gerado_em: string
  // os quatro sinais clássicos. `saturacao` é o ORÇAMENTO, não CPU:
  // num hub cujo gargalo real é dinheiro de LLM, "quanto do teto já
  // foi" é a medida honesta de quão perto o sistema está de parar.
  latencia: { p50_ms: number | null; p95_ms: number | null; media_ms: number | null; amostras: number }
  trafego: { chamadas: number; chamadas_por_hora: number }
  erros: { total: number; taxa_sucesso: number }
  saturacao: { gasto_usd: number; teto_usd: number; fracao: number }
  serie: PontoSerie[]
  latencia_por_agente: LatenciaAgente[]
  dependencias: Dependencia[]
  execucoes: Execucao[]
}
