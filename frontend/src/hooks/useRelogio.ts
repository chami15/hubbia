import { useQuery } from '@tanstack/react-query'
import { obterRelogio } from '../api/relogio'

// O relógio anda sozinho (é uma conta sobre o tempo real); a query só traz o ponto de partida e o fator. Refaz de vez em
// quando para pegar uma troca de fator e corrigir deriva, nunca a cada segundo.
export function useRelogioMundo() {
  return useQuery({ queryKey: ['relogio'], queryFn: obterRelogio, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 })
}
