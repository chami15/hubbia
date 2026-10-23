import { useQuery } from '@tanstack/react-query'
import * as apiInfra from '../api/infra'

// Saúde e métricas são leitura determinística e barata (nenhum LLM, ver
// resolvers/infra.py) — por isso podem carregar ao abrir o painel, do
// mesmo jeito que o dashboard do Cifra e o da Vita já fazem.

export function useSaudeInfra() {
  return useQuery({ queryKey: ['infra', 'saude'], queryFn: apiInfra.obterSaude })
}

export function useMetricasInfra(dias = 1) {
  return useQuery({ queryKey: ['infra', 'metricas', dias], queryFn: () => apiInfra.obterMetricas(dias) })
}

export function useObservabilidade(horas = 24) {
  return useQuery({ queryKey: ['infra', 'observabilidade', horas], queryFn: () => apiInfra.obterObservabilidade(horas) })
}
