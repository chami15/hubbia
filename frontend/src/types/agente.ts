// Espelha o retorno de GET /agentes (ver backend/sql/agentes.sql:listar).
// Mesma disciplina do Pydantic no backend: um contrato só, usado em
// qualquer lugar que precise do formato de um agente.

export type EstadoAgente = 'idle' | 'pensando' | 'falando' | 'executando'
export type TipoAgente = 'colaborador' | 'chefe'

export interface AvatarConfig {
  cor: string
  rosto: string
}

export interface Agente {
  id: number
  nome: string
  tipo: TipoAgente
  especialidade: string
  estado: EstadoAgente
  mesa: number | null
  avatar_config: AvatarConfig
  ativo: boolean
}
