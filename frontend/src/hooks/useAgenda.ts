// A lógica da conversa com o Agenda mora aqui (hook = resolver do
// frontend). O painel só desenha o que este hook devolve — não sabe
// nada de axios, de endpoint nem de qual pendência está aberta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { confirmarAcao, consultarPendencia, enviarMensagem, rejeitarAcao } from '../api/agenda'
import { mensagemDeErro } from '../api/client'
import type { RespostaAgenda } from '../types/agenda'

export interface FalaChat {
  // chave estável pro React — a conversa só cresce, então um contador
  // simples basta e não depende de índice do array
  id: number
  de: 'chefe' | 'agente'
  texto: string
  // preenchido quando esta fala do agente é uma PROPOSTA que abriu uma
  // pendência. Guardado na própria fala (e não só no estado global) pra
  // os botões aparecerem na bolha certa, e não na última da lista.
  acaoPendenteId?: number
}

// O histórico da conversa é de SESSÃO, não de banco: a tabela `mensagens`
// do backend é da camada social entre agentes, não deste chat. Fechar o
// painel e reabrir começa limpo — a pendência em aberto, essa sim, é
// recuperada do servidor ao abrir (ver `consultarPendencia`).
export function useConversaAgenda() {
  const [falas, setFalas] = useState<FalaChat[]>([])
  const [pendenteId, setPendenteId] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const proximoId = useRef(1)

  const adicionar = useCallback((de: FalaChat['de'], texto: string, acaoPendenteId?: number) => {
    setFalas((atuais) => [...atuais, { id: proximoId.current++, de, texto, acaoPendenteId }])
  }, [])

  // Toda resposta do backend passa por aqui: vira uma fala do agente e
  // atualiza qual pendência está aberta. Concentrar isso evita que cada
  // ação (enviar/confirmar/rejeitar) interprete o contrato do seu jeito.
  const aplicarResposta = useCallback(
    (resposta: RespostaAgenda) => {
      const proposta = resposta.aguardando_confirmacao === true
      adicionar('agente', resposta.mensagem, proposta ? (resposta.acao_pendente_id ?? undefined) : undefined)
      // só uma PROPOSTA deixa algo pra clicar. Uma pergunta
      // (aguardando_info) também tem acao_pendente_id, mas se responde
      // digitando, não apertando botão.
      setPendenteId(proposta ? resposta.acao_pendente_id : null)
    },
    [adicionar],
  )

  const aoFalhar = useCallback((e: unknown) => setErro(mensagemDeErro(e)), [])

  const mutacaoEnviar = useMutation({
    mutationFn: enviarMensagem,
    onSuccess: aplicarResposta,
    onError: aoFalhar,
  })
  const mutacaoConfirmar = useMutation({
    mutationFn: confirmarAcao,
    onSuccess: (resposta) => {
      // confirmar/rejeitar não devolvem `aguardando_confirmacao`, e
      // resolvem a pendência de qualquer jeito — daí o setPendenteId(null)
      // explícito em vez de deixar por conta de aplicarResposta
      adicionar('agente', resposta.mensagem)
      setPendenteId(null)
    },
    onError: aoFalhar,
  })
  const mutacaoRejeitar = useMutation({
    mutationFn: rejeitarAcao,
    onSuccess: (resposta) => {
      adicionar('agente', resposta.mensagem)
      setPendenteId(null)
    },
    onError: aoFalhar,
  })

  const enviar = useCallback(
    (texto: string) => {
      const limpo = texto.trim()
      if (!limpo) return
      setErro(null)
      adicionar('chefe', limpo)
      mutacaoEnviar.mutate(limpo)
    },
    [adicionar, mutacaoEnviar],
  )

  const confirmar = useCallback(() => {
    if (pendenteId === null) return
    setErro(null)
    mutacaoConfirmar.mutate(pendenteId)
  }, [pendenteId, mutacaoConfirmar])

  const rejeitar = useCallback(() => {
    if (pendenteId === null) return
    setErro(null)
    mutacaoRejeitar.mutate(pendenteId)
  }, [pendenteId, mutacaoRejeitar])

  // Ao abrir o painel, pergunta ao servidor o que ficou pendente — assim
  // uma proposta esquecida de ontem reaparece com os botões, em vez de
  // depender do chefe lembrar de perguntar (RF12).
  //
  // Custo zero de LLM: essa frase é interceptada por regex no resolver
  // antes de qualquer chamada de modelo (RNF01 respeitado).
  //
  // O ref existe porque o StrictMode roda o efeito duas vezes em dev —
  // sem ele a pendência apareceria duplicada na conversa.
  const jaConsultou = useRef(false)
  useEffect(() => {
    if (jaConsultou.current) return
    jaConsultou.current = true
    consultarPendencia()
      .then((resposta) => {
        // silêncio quando não há nada pendente: anunciar "você não tem
        // pendência" toda vez que abre o painel é ruído
        if (resposta.acao_pendente_id === null) return
        aplicarResposta(resposta)
      })
      .catch(() => {
        // backend fora do ar na abertura não vira erro vermelho — o
        // painel abre normal e o chefe descobre ao tentar mandar algo.
        // Falhar barulhento aqui puniria quem só quis abrir a tela.
      })
  }, [aplicarResposta])

  return {
    falas,
    pendenteId,
    erro,
    ocupado: mutacaoEnviar.isPending || mutacaoConfirmar.isPending || mutacaoRejeitar.isPending,
    enviar,
    confirmar,
    rejeitar,
  }
}
