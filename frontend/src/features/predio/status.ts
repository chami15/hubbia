// Ponte entre o que o backend sabe de um agente (estado do tick, mensagem não lida, hora simulada) e o status que o
// prédio desenha. Fica fora de Escritorio.tsx para poder ser testada sem montar a tela.
import type { EstadoAgente } from '../../types/agente'
import type { Status } from './sim'

/** Mensagem não lida pesa mais que o estado do momento. */
export function statusNoPredio(estado: EstadoAgente | undefined, temNaoLida: boolean, hora: number): Status {
  if (temNaoLida) return 'precisa_de_voce'
  if (estado === 'pensando') return 'pensando'
  if (estado === 'executando') return 'trabalhando'
  if (estado === 'falando') return 'conversando'
  // de madrugada, quem está à toa cochila na mesa
  if (hora < 6 || hora >= 23) return 'dormindo'
  return estado === 'idle' ? 'ocioso' : 'trabalhando'
}
