import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as apiMensagens from '../api/mensagens'
import { useAgentes } from './useAgentes'

const CHAVE_MENSAGENS = ['mensagens']

export function useMensagens() {
  return useQuery({ queryKey: CHAVE_MENSAGENS, queryFn: () => apiMensagens.listarMensagens() })
}

export function useResponderMensagem() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ mensagemId, conteudo }: { mensagemId: number; conteudo: string }) =>
      apiMensagens.responderMensagem(mensagemId, conteudo),
    // a resposta do chefe é, ela mesma, uma mensagem nova — reinvalidar
    // é o que faz ela aparecer na própria conversa sem precisar de um
    // segundo estado local só pra essa mensagem
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CHAVE_MENSAGENS }),
  })
}

export function useMarcarMensagemLida() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (mensagemId: number) => apiMensagens.marcarMensagemLida(mensagemId),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CHAVE_MENSAGENS }),
  })
}

// Quantas mensagens direcionadas ao chefe ele ainda não clicou — é o que
// vira a bolinha vermelha no ícone de mensagens (Escritorio.tsx). Mora
// aqui (não num componente) porque tanto o ícone quanto o painel de
// mensagens em si precisam do mesmo número, e os dois já compartilham o
// mesmo cache (['mensagens']) — nenhum fetch a mais por causa disto.
export function useContagemNaoLidas(): number {
  const { data: agentes } = useAgentes()
  const { data: mensagens } = useMensagens()
  const chefeId = agentes?.find((a) => a.tipo === 'chefe')?.id
  if (chefeId == null || !mensagens) return 0
  return mensagens.filter((m) => m.destinatario_id === chefeId && !m.lida_pelo_chefe).length
}
