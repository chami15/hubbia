// Chamadas do domínio "agenda" — espelha backend/routers/agenda.py.
// Mesmo molde de api/agentes.ts: um arquivo por domínio, nenhum
// componente chama axios direto.
import { api } from './client'
import type { RespostaAgenda } from '../types/agenda'

export async function enviarMensagem(texto: string): Promise<RespostaAgenda> {
  const resposta = await api.post<RespostaAgenda>('/agenda/mensagem', { texto })
  return resposta.data
}

export async function confirmarAcao(acaoId: number): Promise<RespostaAgenda> {
  const resposta = await api.post<RespostaAgenda>(`/agenda/acoes/${acaoId}/confirmar`)
  return resposta.data
}

export async function rejeitarAcao(acaoId: number): Promise<RespostaAgenda> {
  const resposta = await api.post<RespostaAgenda>(`/agenda/acoes/${acaoId}/rejeitar`)
  return resposta.data
}

// A frase-gatilho que o resolver reconhece pra devolver a pendência atual
// (ver _PADRAO_CONSULTAR_PENDENCIA em resolvers/agenda.py). Passa pelo
// MESMO endpoint de mensagem, mas é checada antes de tudo e respondida
// de forma determinística — nenhum LLM é chamado, então dá pra consultar
// isso ao abrir o painel sem violar o RNF01 ("nada de LLM automático").
const FRASE_CONSULTA_PENDENCIA = 'qual pendência em aberto?'

export function consultarPendencia(): Promise<RespostaAgenda> {
  return enviarMensagem(FRASE_CONSULTA_PENDENCIA)
}
