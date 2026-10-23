import { useQuery } from '@tanstack/react-query'
import * as apiTick from '../api/tick'

const CHAVE_TICK = ['tick', 'atual']
const CHAVE_ORCAMENTO = ['tick', 'orcamento']

export function useTickAtual() {
  return useQuery({ queryKey: CHAVE_TICK, queryFn: apiTick.obterTickAtual })
}

export function useOrcamentoDoDia() {
  return useQuery({ queryKey: CHAVE_ORCAMENTO, queryFn: apiTick.obterOrcamentoDoDia })
}

// Avançar o tick sozinho não existe mais como ação da UI — virou parte
// de useAvancarMundo (hooks/useMundo.ts), sempre junto da rodada.
