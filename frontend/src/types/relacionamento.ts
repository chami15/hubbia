// GET /agentes/relacionamentos (backend/resolvers/agentes.py): afinidade entre colegas, por direção (-100..100).
export interface Relacionamento {
  agente_id: number
  alvo_agente_id: number
  afinidade: number
}
