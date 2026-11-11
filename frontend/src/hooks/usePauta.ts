// Hooks da Pauta. Toda mutação invalida tudo de ['pauta']: as telas se cruzam (marcar um item muda a lista da frente,
// a contagem, a "sugestão desatualizada" e a revisão), e são poucas leituras baratas. Melhor recarregar a mais do que
// mostrar um número velho.
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query'
import * as apiPauta from '../api/pauta'

const RAIZ = ['pauta']

export const useFrentes = () => useQuery({ queryKey: [...RAIZ, 'frentes'], queryFn: apiPauta.listarFrentes })

export const useTarefas = (frenteId: number | null, ocultas: boolean) =>
  useQuery({
    queryKey: [...RAIZ, 'tarefas', frenteId, ocultas],
    queryFn: () => apiPauta.listarTarefas(frenteId as number, ocultas),
    enabled: frenteId !== null,
  })

export const useTarefa = (id: number | null) =>
  useQuery({ queryKey: [...RAIZ, 'tarefa', id], queryFn: () => apiPauta.obterTarefa(id as number), enabled: id !== null })

export const useContagemTextos = () => useQuery({ queryKey: [...RAIZ, 'contagem'], queryFn: apiPauta.contarTextos })

export const useFalhas = () => useQuery({ queryKey: [...RAIZ, 'falhas'], queryFn: apiPauta.listarFalhas })

export const usePergunta = () => useQuery({ queryKey: [...RAIZ, 'pergunta'], queryFn: apiPauta.perguntaAtual })

export const useRevisao = () => useQuery({ queryKey: [...RAIZ, 'revisao'], queryFn: apiPauta.obterRevisao })

/** Opções de toda mutação da Pauta (pura, testada em __testes__/usePauta.test.ts). */
export function opcoesDaMutacaoPauta<A, R>(cliente: QueryClient, fn: (a: A) => Promise<R>): UseMutationOptions<R, Error, A> {
  // onSettled, não onSuccess: ação que falha também muda o backend (o "organizar" marca os textos como "com erro").
  // Só no sucesso, a tela ficava dizendo "2 textos esperando" depois da falha.
  return { mutationFn: fn, onSettled: () => cliente.invalidateQueries({ queryKey: RAIZ }) }
}

/** Mutação que, ao terminar, recarrega tudo da Pauta. */
function useMutacaoPauta<A, R>(fn: (a: A) => Promise<R>) {
  return useMutation(opcoesDaMutacaoPauta(useQueryClient(), fn))
}

export const useRegistrarTexto = () =>
  useMutacaoPauta(({ texto, tarefaId }: { texto: string; tarefaId?: number }) => apiPauta.registrarTexto(texto, tarefaId))
export const useCriarTarefa = () => useMutacaoPauta(apiPauta.criarTarefa)
export const useMudarStatus = () =>
  useMutacaoPauta(({ id, status }: { id: number; status: 'aberta' | 'feita' | 'arquivada' }) => apiPauta.mudarStatus(id, status))
export const useOcultar = () => useMutacaoPauta(({ id, oculta }: { id: number; oculta: boolean }) => apiPauta.ocultar(id, oculta))
export const useAdicionarItem = () =>
  useMutacaoPauta(({ tarefaId, texto }: { tarefaId: number; texto: string }) => apiPauta.adicionarItem(tarefaId, texto))
export const useMarcarItem = () => useMutacaoPauta(({ id, feito }: { id: number; feito: boolean }) => apiPauta.atualizarItem(id, { feito }))
export const useRemoverItem = () => useMutacaoPauta(apiPauta.removerItem)
export const useOrganizar = () => useMutacaoPauta(apiPauta.organizar)
export const useResponder = () => useMutacaoPauta(({ id, opcao }: { id: number; opcao: number }) => apiPauta.responder(id, opcao))
export const useTentarDeNovo = () => useMutacaoPauta(apiPauta.tentarDeNovo)
export const useAtualizarContexto = () => useMutacaoPauta(apiPauta.atualizarContexto)
export const useSugerir = () => useMutacaoPauta(apiPauta.sugerir)
export const useResolverSugestao = () =>
  useMutacaoPauta(({ id, aceitar }: { id: number; aceitar: boolean }) => apiPauta.resolverSugestao(id, aceitar))
export const useClarear = () => useMutacaoPauta(apiPauta.clarear)
export const useResolverItemRevisao = () =>
  useMutacaoPauta(({ id, aceitar }: { id: number; aceitar: boolean }) => apiPauta.resolverItemRevisao(id, aceitar))
