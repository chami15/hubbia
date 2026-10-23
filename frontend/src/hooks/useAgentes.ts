// Hook = onde a lógica mora (equivalente a um resolver). O componente
// nunca chama listarAgentes() direto — sempre por aqui, pra ganhar
// cache/loading/erro de graça via TanStack Query.
import { useQuery } from '@tanstack/react-query'
import { listarAgentes } from '../api/agentes'

export function useAgentes() {
  return useQuery({
    queryKey: ['agentes'], // identifica esse dado no cache — se dois
    // componentes pedirem ['agentes'], só UMA chamada de rede é feita
    queryFn: listarAgentes,
  })
}
