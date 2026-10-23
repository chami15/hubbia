// Chamadas do motor de interação (social + proatividade de trabalho) —
// espelha backend/routers/interacao.py.
import { api } from './client'
import type { RodadaProcessada } from '../types/interacao'

// dryRun=true calcula quem trabalharia/falaria e com quem, sem executar
// ação nem persistir nada — mesmo espírito do dry_run do relógio.
export async function processarRodada(dryRun: boolean): Promise<RodadaProcessada> {
  return (
    await api.post<RodadaProcessada>('/interacao/tick/processar', null, { params: { dry_run: dryRun } })
  ).data
}
