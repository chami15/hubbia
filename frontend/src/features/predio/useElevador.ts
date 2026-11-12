// Gancho da troca de andar na tela: segue a linha do tempo de trocaDeAndar.ts (pura, testada) e troca o andar
// desenhado no instante em que as portas acabam de fechar. Também lê o resumo dos andares para o painel e o
// indicador (quem precisa de você em cada andar), a cada pouco: o prédio é imperativo, não avisa.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AndarId } from './andares'
import type { Mundo, ResumoAndar } from './mundo'
import { TEMPOS, TEMPOS_REDUZIDOS, avancarTroca, iniciarTroca, type Troca } from './trocaDeAndar'

const reduzido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useElevador(mundo: Mundo | null) {
  const [troca, setTroca] = useState<Troca | null>(null)
  const trocaRef = useRef<Troca | null>(null)
  const [andares, setAndares] = useState<ResumoAndar[]>([])
  const [visivel, setVisivel] = useState<AndarId>(0)

  useEffect(() => {
    if (!mundo) return
    const ler = () => {
      setAndares(mundo.andares())
      setVisivel(mundo.andarVisivel())
    }
    ler()
    const id = window.setInterval(ler, 700)
    return () => window.clearInterval(id)
  }, [mundo])

  const irPara = useCallback(
    (andar: AndarId) => {
      if (!mundo) return
      const t = iniciarTroca(trocaRef.current, mundo.andarVisivel(), andar, performance.now())
      if (!t) return
      const tempos = reduzido() ? TEMPOS_REDUZIDOS : TEMPOS
      trocaRef.current = t
      setTroca(t)
      // um timer por fase: no fim de cada uma, avança; o andar troca quando as portas terminam de fechar
      const proxima = (atual: Troca) => {
        const espera = atual.fase === 'fechando' ? tempos.fechar : atual.fase === 'fechado' ? tempos.fechado : tempos.abrir
        window.setTimeout(() => {
          const r = avancarTroca(atual, atual.inicio + espera, tempos)
          if (r.mostrar !== undefined) {
            mundo.mostrarAndar(r.mostrar)
            setVisivel(r.mostrar)
          }
          trocaRef.current = r.troca
          setTroca(r.troca)
          if (r.troca) proxima(r.troca)
        }, espera)
      }
      proxima(t)
    },
    [mundo],
  )

  return { troca, irPara, andares, visivel }
}
