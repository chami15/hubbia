import { useQuery } from '@tanstack/react-query'
import { obterRelogio } from '../api/relogio'

// O relógio anda sozinho (é uma conta sobre o tempo real); a query só traz o ponto de partida e o fator. Refaz a cada
// minuto (um GET barato) para pegar uma troca de fator (PUT /relogio/fator): com 15 min, quem trocava o fator via curl
// via o relógio seguir na velocidade antiga e depois saltar.
export function useRelogioMundo() {
  return useQuery({ queryKey: ['relogio'], queryFn: obterRelogio, staleTime: 30_000, refetchInterval: 60_000 })
}
