// Chamadas do relógio simulado — espelha backend/routers/tick.py.
import { api } from './client'
import type { OrcamentoDiario, TickAtual, TickAvancado } from '../types/tick'

export async function obterTickAtual(): Promise<TickAtual> {
  return (await api.get<TickAtual>('/tick/atual')).data
}

// dryRun=true calcula (próximo número, hora, orçamento) sem persistir
// nada — nem o tick, nem o estado dos agentes. É o "conferir antes de
// avançar de verdade" que o backend foi desenhado pra suportar desde o
// primeiro commit do motor de tick.
export async function avancarTick(dryRun: boolean): Promise<TickAvancado> {
  return (await api.post<TickAvancado>('/tick/avancar', null, { params: { dry_run: dryRun } })).data
}

export async function obterOrcamentoDoDia(): Promise<OrcamentoDiario> {
  return (await api.get<OrcamentoDiario>('/tick/orcamento')).data
}
