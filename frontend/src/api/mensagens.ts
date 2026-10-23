// Chamadas de mensagens — espelha backend/routers/mensagens.py.
import { api } from './client'
import type { Mensagem, TipoMensagem } from '../types/mensagens'

// O mural devolve TODO PAR (agente↔agente e agente↔chefe), não só o que
// foi direcionado ao chefe — é o que permite montar uma "conversa" das
// duas pontas (ver PainelCaixaDeEntrada.tsx pro porquê disso importar).
export async function listarMensagens(tipo?: TipoMensagem, limite = 500): Promise<Mensagem[]> {
  return (await api.get<Mensagem[]>('/mensagens', { params: { tipo, limite } })).data
}

export async function responderMensagem(mensagemId: number, conteudo: string): Promise<Mensagem> {
  return (await api.post<Mensagem>(`/mensagens/${mensagemId}/responder`, { conteudo })).data
}

export async function marcarMensagemLida(mensagemId: number): Promise<{ id: number; lida_pelo_chefe: boolean }> {
  return (await api.post(`/mensagens/${mensagemId}/marcar-lida`)).data
}
