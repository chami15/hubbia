// Ponte entre o que o backend sabe de um agente (estado do tick, mensagem não lida, hora simulada) e o status que o
// prédio desenha. Fica fora de Escritorio.tsx para poder ser testada sem montar a tela.
import type { EstadoAgente } from '../../types/agente'
import { horaDeDormir } from './personalidade'
import type { Status } from './sim'

/**
 * Mensagem não lida pesa mais que o estado do momento; o que o backend está fazendo pesa mais que o sono.
 * `sono` é a janela da personalidade ([dorme, acorda) em horas do mundo; cada agente tem a sua, ver personalidade.ts).
 * Sem estado (agente conceito, sem backend): ocioso de dia, dormindo de noite, para ele também ter um dia.
 */
export function statusNoPredio(estado: EstadoAgente | undefined, temNaoLida: boolean, hora: number, sono: [number, number] = [23, 6]): Status {
  if (temNaoLida) return 'precisa_de_voce'
  if (estado === 'pensando') return 'pensando'
  if (estado === 'executando') return 'trabalhando'
  if (estado === 'falando') return 'conversando'
  if (horaDeDormir({ sono }, hora)) return 'dormindo'
  return 'ocioso'
}
