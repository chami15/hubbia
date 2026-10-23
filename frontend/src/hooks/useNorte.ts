import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as apiNorte from '../api/norte'
import type { Card, ResolucaoCard } from '../types/norte'

const CHAVE_PROJETOS = ['norte', 'projetos']
const chaveCardAtivo = (id: number) => ['norte', 'card-ativo', id]
const chaveHistorico = (id: number) => ['norte', 'historico', id]

export function useProjetos() {
  return useQuery({ queryKey: CHAVE_PROJETOS, queryFn: apiNorte.listarProjetos })
}

export function useCardAtivo(projetoId: number) {
  return useQuery({
    queryKey: chaveCardAtivo(projetoId),
    queryFn: () => apiNorte.obterCardAtivo(projetoId),
    retry: false,
  })
}

export function useHistoricoCards(projetoId: number) {
  return useQuery({
    queryKey: chaveHistorico(projetoId),
    queryFn: () => apiNorte.listarHistoricoCards(projetoId),
  })
}

// As branches só são buscadas quando já existe uma URL — `enabled` evita
// uma chamada com string vazia enquanto o chefe ainda está colando o link.
export function useBranches(repositorioUrl: string) {
  return useQuery({
    queryKey: ['norte', 'branches', repositorioUrl],
    queryFn: () => apiNorte.listarBranches(repositorioUrl),
    enabled: repositorioUrl.trim().length > 0,
    retry: false,
  })
}

export function useCriarProjeto() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiNorte.criarProjeto,
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CHAVE_PROJETOS }),
  })
}

export function useGerarCard(projetoId: number) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => apiNorte.gerarCard(projetoId),
    onSuccess: (card) => {
      cliente.setQueryData(chaveCardAtivo(projetoId), card)
      // `estagnado` (GET /norte/projetos) depende de existir card aberto —
      // gerar um agora é exatamente o que zera essa condição, e é o botão
      // "retomar" do kanban que dispara isso a partir da LISTA, sem passar
      // pela tela do projeto — sem invalidar aqui o card ficaria certo mas
      // o badge "estagnado" continuaria aceso até um reload
      void cliente.invalidateQueries({ queryKey: CHAVE_PROJETOS })
    },
  })
}

export function useCriarCardManual(projetoId: number) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (dados: Parameters<typeof apiNorte.criarCardManual>[1]) =>
      apiNorte.criarCardManual(projetoId, dados),
    onSuccess: (card) => cliente.setQueryData(chaveCardAtivo(projetoId), card),
  })
}

export function useAceitarCard(projetoId: number) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiNorte.aceitarCard,
    // aceitar não encadeia — o mesmo card continua ativo, só mudou de status
    onSuccess: (card: Card) => cliente.setQueryData(chaveCardAtivo(projetoId), card),
  })
}

// Rejeitar e finalizar compartilham o mesmo efeito: o card resolvido sai
// de cena, o próximo (que já veio na resposta) entra no lugar, e o
// histórico ganha uma linha. Escrever o próximo card direto no cache
// evita um GET que só buscaria o que já está na mão.
function useResolver(projetoId: number, fn: (cardId: number) => Promise<ResolucaoCard>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      cliente.setQueryData(chaveCardAtivo(projetoId), r.proximo_card)
      void cliente.invalidateQueries({ queryKey: chaveHistorico(projetoId) })
    },
  })
}

export function useRejeitarCard(projetoId: number) {
  return useResolver(projetoId, apiNorte.rejeitarCard)
}

export function useFinalizarCard(projetoId: number) {
  return useResolver(projetoId, apiNorte.finalizarCard)
}
