// A lógica da conversa com o Agenda mora aqui (hook = resolver do
// frontend). O painel só desenha o que este hook devolve — não sabe
// nada de axios, de endpoint nem de qual pendência está aberta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { confirmarAcao, enviarMensagem, obterConversa, rejeitarAcao } from '../api/agenda'
import { mensagemDeErro } from '../api/client'
import type { RespostaAgenda } from '../types/agenda'
import { conversaDoServidor } from '../features/agenda/conversa'

export interface FalaChat {
  // chave estável pro React. Fala vinda do servidor traz o id do banco (positivo); fala criada agora
  // recebe um id local NEGATIVO, para nunca colidir com as do histórico
  id: number
  de: 'chefe' | 'agente'
  texto: string
  // preenchido quando esta fala do agente é uma PROPOSTA que abriu uma
  // pendência. Guardado na própria fala (e não só no estado global) pra
  // os botões aparecerem na bolha certa, e não na última da lista.
  acaoPendenteId?: number
}

// A conversa é gravada no backend (tabela `conversa_agenda`) e recarregada ao abrir o painel, junto
// com a pendência aberta. Quem grava é o servidor: o frontend só mostra a fala na hora (otimista) e
// o próximo reload traz a versão oficial.
export function useConversaAgenda() {
  const [falas, setFalas] = useState<FalaChat[]>([])
  const [pendenteId, setPendenteId] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const proximoId = useRef(-1)

  const adicionar = useCallback((de: FalaChat['de'], texto: string, acaoPendenteId?: number) => {
    setFalas((atuais) => [...atuais, { id: proximoId.current--, de, texto, acaoPendenteId }])
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

  // Ao abrir o painel, carrega o histórico e a pendência aberta (RF12: uma proposta esquecida de ontem
  // reaparece com os botões, sem depender do chefe lembrar de perguntar).
  //
  // Custo zero de LLM: é um GET de leitura (RNF01 respeitado).
  //
  // O ref existe porque o StrictMode roda o efeito duas vezes em dev — sem ele o histórico entraria
  // duplicado. Quem digitou antes do histórico chegar não perde a fala: o histórico entra ANTES das locais.
  const jaCarregou = useRef(false)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    if (jaCarregou.current) return
    jaCarregou.current = true
    obterConversa()
      .then((conversa) => {
        const { falas: historico, pendenteId: pendente } = conversaDoServidor(conversa)
        setFalas((atuais) => [...historico, ...atuais])
        setPendenteId((atual) => atual ?? pendente)
      })
      .catch(() => {
        // backend fora do ar na abertura não vira erro vermelho — o painel abre vazio e o chefe descobre
        // ao tentar mandar algo. Falhar barulhento aqui puniria quem só quis abrir a tela.
      })
      .finally(() => setCarregando(false))
  }, [])

  return {
    carregando,
    falas,
    pendenteId,
    erro,
    ocupado: mutacaoEnviar.isPending || mutacaoConfirmar.isPending || mutacaoRejeitar.isPending,
    enviar,
    confirmar,
    rejeitar,
  }
}
