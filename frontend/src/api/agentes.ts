// Chamadas do domínio "agentes" — espelha GET /agentes
// (backend/routers/agentes.py). Cada domínio novo (financeiro, agenda,
// saude, norte, interacao) ganha um arquivo assim.
import { api } from './client'
import type { Agente } from '../types/agente'

export async function listarAgentes(): Promise<Agente[]> {
  const resposta = await api.get<Agente[]>('/agentes')
  return resposta.data
}
