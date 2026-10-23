import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as apiEventosMundo from '../api/eventosMundo'

const CHAVE_EVENTOS_MUNDO = ['eventos-mundo']

export function useEventosMundo() {
  return useQuery({ queryKey: CHAVE_EVENTOS_MUNDO, queryFn: apiEventosMundo.listarEventosMundo })
}

export function useCriarEventoMundo() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: apiEventosMundo.criarEventoMundo,
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CHAVE_EVENTOS_MUNDO }),
  })
}
