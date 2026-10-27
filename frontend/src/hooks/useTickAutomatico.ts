import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as apiTick from '../api/tick'
import { mensagemDeErro } from '../api/client'
import { proximoPasso, type ProximoPasso } from '../features/escritorio/tickAutomatico'
import type { RespostaTickAutomatico } from '../types/tick'
import { invalidarDepoisDoTick } from './useMundo'

type Executado = Extract<RespostaTickAutomatico, { executado: true }>

// O timer do tick automático (opt-in, Sprint 2). Só existe enquanto `ligado` for true e o app estiver aberto: fechou a aba,
// parou de gastar. Quem decide se pode rodar é o BACKEND (expediente, orçamento, limites); aqui só se espera ou se desliga.
// Aba escondida não dispara: o disparo atrasado fica pendente e roda quando o chefe volta (o timer do navegador é
// estrangulado em aba escondida, e gastar token com ninguém olhando é o que se quer evitar).
export function useTickAutomatico(opcoes: { ligado: boolean; aoRodar: (r: Executado) => void; aoParar: (mensagem: string) => void }) {
  const cliente = useQueryClient()
  // callbacks em ref: trocar de função a cada render não pode reiniciar o timer
  const aoRodar = useRef(opcoes.aoRodar)
  const aoParar = useRef(opcoes.aoParar)
  useEffect(() => {
    aoRodar.current = opcoes.aoRodar
    aoParar.current = opcoes.aoParar
  })

  const { ligado } = opcoes
  useEffect(() => {
    if (!ligado) return
    let cancelado = false
    let pendente = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function disparar() {
      if (cancelado) return
      if (document.visibilityState !== 'visible') {
        pendente = true
        return
      }
      pendente = false
      let passo: ProximoPasso
      try {
        const resposta = await apiTick.tickAutomatico()
        if (cancelado) return
        if (resposta.executado) {
          invalidarDepoisDoTick(cliente)
          aoRodar.current(resposta)
        }
        passo = proximoPasso(resposta)
      } catch (erro) {
        passo = proximoPasso({ erro: mensagemDeErro(erro) })
      }
      if (cancelado) return
      if (passo.tipo === 'parar') return aoParar.current(passo.mensagem)
      timer = setTimeout(() => void disparar(), passo.emMs)
    }

    function aoMudarVisibilidade() {
      if (pendente && document.visibilityState === 'visible') void disparar()
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    void disparar()

    return () => {
      cancelado = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [ligado, cliente])
}
