// Chamadas da sala de máquinas — espelha backend/routers/infra.py.
// Mesmo molde dos outros domínios: um arquivo por domínio, nenhum
// componente chama axios direto.
import { api } from './client'
import type { MetricasInfra, Observabilidade, SaudeInfra } from '../types/infra'

export async function obterSaude(): Promise<SaudeInfra> {
  const resposta = await api.get<SaudeInfra>('/infra/saude')
  return resposta.data
}

export async function obterMetricas(dias = 1): Promise<MetricasInfra> {
  const resposta = await api.get<MetricasInfra>('/infra/metricas', { params: { dias } })
  return resposta.data
}

export async function obterObservabilidade(horas = 24): Promise<Observabilidade> {
  const resposta = await api.get<Observabilidade>('/infra/observabilidade', { params: { horas } })
  return resposta.data
}
