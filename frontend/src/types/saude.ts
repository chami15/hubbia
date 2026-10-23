// Espelha os retornos de backend/routers/saude.py + resolvers/saude.py.
//
// Nenhum destes tipos tem `modelo`, `tokens_in`, `tokens_out` ou
// `custo_usd` — e isso não é esquecimento: o backend exclui esses campos
// dos RETURNING de propósito (ver sql/refeicoes.sql), porque metadado de
// custo nunca chega ao frontend (RNF02). Se um dia aparecer um aqui, é
// sinal de que algo vazou no backend, não de que a UI deveria mostrar.

export type Sexo = 'M' | 'F'
export type Objetivo = 'emagrecer' | 'ganhar_massa' | 'manter_peso' | 'saude_geral'
export type TipoRefeicao = 'cafe_da_manha' | 'almoco' | 'cafe_da_tarde' | 'jantar' | 'outro'
export type TipoAtividade = 'corrida' | 'academia' | 'esporte' | 'caminhada' | 'outro'
export type QualidadeSono = 'ruim' | 'regular' | 'boa'
// O quanto o modelo confia na estimativa de macros. É um NÍVEL, não um
// número: o backend guarda TEXT com CHECK IN ('alta','media','baixa')
// (005_saude.sql) e o agente devolve um Literal com os mesmos três
// valores. Tratar isso como 0..1 é o que produzia "NaN%" na tela.
export type NivelConfianca = 'alta' | 'media' | 'baixa'
export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo'

export interface PerfilSaude {
  id: number
  nome: string
  sexo: Sexo
  data_nascimento: string
  altura_cm: number
  objetivo: Objetivo
  tem_diabetes: boolean
  restricoes_alimentares: string | null
}

export interface PerfilEnviado {
  nome: string
  sexo: Sexo
  data_nascimento: string
  altura_cm: number
  objetivo: Objetivo
  tem_diabetes: boolean
  restricoes_alimentares: string | null
}

export interface DashboardSaude {
  // null quando nunca se registrou peso — a UI mostra "—", não zero,
  // porque zero seria uma leitura falsa
  peso_atual: number | null
  refeicoes_hoje: {
    calorias: number
    carboidratos_g: number
    proteinas_g: number
    gorduras_g: number
  }
  hidratacao_hoje_ml: number
  atividades_na_semana: number
}

export interface RefeicaoRegistrada {
  id: number
  tipo_refeicao: TipoRefeicao
  origem: 'texto' | 'foto'
  descricao: string
  calorias: number
  carboidratos_g: number
  proteinas_g: number
  gorduras_g: number
  // Vale mostrar: uma estimativa de foto ruim não pode passar por
  // número exato.
  confianca_estimativa: NivelConfianca
  registrado_em: string
}

export interface ExercicioFicha {
  nome_exercicio: string
  series: number
  repeticoes: number
}

export interface DiaFicha {
  dia_semana: DiaSemana
  grupo_muscular: string
  exercicios: ExercicioFicha[]
}

export interface PlanoDieta {
  id: number
  meta_calorica: number
  carboidratos_g: number
  proteinas_g: number
  gorduras_g: number
  orientacoes: string
  gerado_em: string
}

export interface AnaliseRelatorio {
  resumo: string
  evolucao_peso: string
  adesao_alimentar: string
  atividade_fisica: string
  recomendacoes: string[]
}

// O relatório guarda os dados brutos da semana JUNTO da análise. A tela
// usa a análise (que é o texto pro chefe ler) e alguns agregados; os
// arrays crus (`refeicoes`, `sono`, ...) existem no payload mas não
// precisam ser desenhados.
export interface RelatorioSemanal {
  semana_inicio: string
  dias_com_refeicao_registrada: number
  calorias_totais_semana: number
  media_calorica_diaria: number | null
  peso_registros_na_semana: number
  hidratacao_total_ml: number
  analise: AnaliseRelatorio
}
