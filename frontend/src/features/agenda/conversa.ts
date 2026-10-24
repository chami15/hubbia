// Tradução pura do histórico que o backend guardou para o formato do chat (sem React, para testar).
import type { FalaChat } from '../../hooks/useAgenda'
import type { ConversaAgenda } from '../../types/agenda'

export function conversaDoServidor(conversa: ConversaAgenda): { falas: FalaChat[]; pendenteId: number | null } {
  return {
    falas: conversa.falas.map((f) => ({ id: f.id, de: f.de, texto: f.texto, acaoPendenteId: f.acao_pendente_id ?? undefined })),
    // só PROPOSTA deixa botão: uma pergunta pendente (aguardando_info) se responde digitando
    pendenteId: conversa.aguardando_confirmacao ? conversa.acao_pendente_id : null,
  }
}
