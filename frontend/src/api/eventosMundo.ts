// Chamadas de eventos_mundo — espelha backend/routers/interacao.py.
import { api } from './client'
import type { EventoMundo } from '../types/eventosMundo'

export async function listarEventosMundo(): Promise<EventoMundo[]> {
  return (await api.get<EventoMundo[]>('/interacao/eventos-mundo')).data
}

export async function criarEventoMundo(descricao: string): Promise<EventoMundo> {
  return (await api.post<EventoMundo>('/interacao/eventos-mundo', { descricao })).data
}
