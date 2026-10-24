// Chamadas do domínio "agenda" — espelha backend/routers/agenda.py.
// Mesmo molde de api/agentes.ts: um arquivo por domínio, nenhum
// componente chama axios direto.
import { api } from './client'
import type { ConversaAgenda, RespostaAgenda } from '../types/agenda'

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

// Histórico do chat + pendência aberta, numa leitura só. Não passa pelo agente, então abrir o painel
// não gasta LLM (RNF01). Antes isto era a frase "qual pendência em aberto?" mandada como se fosse do chefe.
export async function obterConversa(): Promise<ConversaAgenda> {
  const resposta = await api.get<ConversaAgenda>('/agenda/conversa')
  return resposta.data
}
