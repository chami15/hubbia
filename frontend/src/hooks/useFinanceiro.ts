import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as apiFin from '../api/financeiro'

const chaveDashboard = (mes: string) => ['financeiro', 'dashboard', mes]
const chaveRelatorio = (mes: string) => ['financeiro', 'relatorio', mes]

export function useDashboardFinanceiro(mes: string) {
  return useQuery({ queryKey: chaveDashboard(mes), queryFn: () => apiFin.obterDashboard(mes) })
}

export function useRelatorioFinanceiro(mes: string) {
  return useQuery({ queryKey: chaveRelatorio(mes), queryFn: () => apiFin.obterRelatorio(mes), retry: false })
}

export function useImportarExtrato(mes: string) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiFin.importarExtrato,
    // importar muda os números do mês — invalidar aqui é o que faz o
    // dashboard se atualizar sozinho depois do upload
    onSuccess: () => void cliente.invalidateQueries({ queryKey: chaveDashboard(mes) }),
  })
}

export function useGerarRelatorio(mes: string) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => apiFin.gerarRelatorio(mes),
    onSuccess: (r) => cliente.setQueryData(chaveRelatorio(mes), r),
  })
}
