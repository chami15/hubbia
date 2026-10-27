// Relógio do mundo — espelha backend/routers/relogio.py.
import { api } from './client'
import { relogioDoServidor, type RelogioMundo } from '../features/predio/relogioDoMundo'
import type { RelogioApi } from '../types/relogio'

export async function obterRelogio(): Promise<RelogioMundo> {
  const antes = Date.now()
  const { data } = await api.get<RelogioApi>('/relogio')
  // o servidor carimbou o "agora" no meio da ida e volta: usar o ponto médio tira o atraso da rede da conta
  return relogioDoServidor(data, (antes + Date.now()) / 2)
}
