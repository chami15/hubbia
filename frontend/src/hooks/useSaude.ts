// Hooks do domínio de saúde. Cada tela do painel pega daqui o que
// precisa; nenhuma chama a API direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as apiSaude from '../api/saude'

const CHAVE_PERFIL = ['saude', 'perfil']
const CHAVE_DASHBOARD = ['saude', 'dashboard']
const CHAVE_FICHA = ['saude', 'ficha-treino']
const CHAVE_PLANO = ['saude', 'plano-dieta']
const CHAVE_RELATORIO = ['saude', 'relatorio']

// `retry: false` nos três que podem devolver 404: a camada de api já
// traduz 404 pra null, então uma re-tentativa só atrasaria a tela pra
// chegar na mesma resposta.
export function usePerfil() {
  return useQuery({ queryKey: CHAVE_PERFIL, queryFn: apiSaude.obterPerfil, retry: false })
}

export function useDashboard() {
  return useQuery({ queryKey: CHAVE_DASHBOARD, queryFn: apiSaude.obterDashboard })
}

export function useFichaTreino() {
  return useQuery({ queryKey: CHAVE_FICHA, queryFn: apiSaude.obterFichaTreino })
}

export function usePlanoDieta() {
  return useQuery({ queryKey: CHAVE_PLANO, queryFn: apiSaude.obterPlanoDieta, retry: false })
}

export function useRelatorioSemanal() {
  return useQuery({ queryKey: CHAVE_RELATORIO, queryFn: apiSaude.obterRelatorioSemanal, retry: false })
}

// Todo registro (peso, água, sono, atividade, refeição) muda os números
// do dashboard — invalidar aqui é o que faz o KPI atualizar sozinho
// depois de salvar, sem cada form precisar lembrar disso.
function useRegistro<Entrada, Saida>(fn: (e: Entrada) => Promise<Saida>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CHAVE_DASHBOARD }),
  })
}

export function useRegistrarPeso() {
  return useRegistro(apiSaude.registrarPeso)
}

export function useRegistrarHidratacao() {
  return useRegistro(apiSaude.registrarHidratacao)
}

export function useRegistrarSono() {
  return useRegistro(apiSaude.registrarSono)
}

export function useRegistrarAtividade() {
  return useRegistro(apiSaude.registrarAtividade)
}

export function useRegistrarRefeicaoTexto() {
  return useRegistro(apiSaude.registrarRefeicaoTexto)
}

export function useRegistrarRefeicaoFoto() {
  return useRegistro(apiSaude.registrarRefeicaoFoto)
}

export function useSalvarPerfil() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiSaude.salvarPerfil,
    onSuccess: (perfil) => {
      // escreve direto no cache em vez de invalidar: o POST já devolve o
      // perfil salvo, então refazer o GET seria uma ida à rede pra
      // buscar o que já está na mão
      cliente.setQueryData(CHAVE_PERFIL, perfil)
    },
  })
}

export function useSalvarFichaTreino() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiSaude.salvarFichaTreino,
    onSuccess: (dias) => cliente.setQueryData(CHAVE_FICHA, dias),
  })
}

export function useGerarPlanoDieta() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiSaude.gerarPlanoDieta,
    onSuccess: (plano) => cliente.setQueryData(CHAVE_PLANO, plano),
  })
}

export function useGerarRelatorioSemanal() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiSaude.gerarRelatorioSemanal,
    onSuccess: (r) => cliente.setQueryData(CHAVE_RELATORIO, r),
  })
}
