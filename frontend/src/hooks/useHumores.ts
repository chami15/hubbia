import { useMemo } from 'react'
import { AGENTES, type AgenteId } from '../features/predio/agentes'
import { humorDe, sinaisPorAgente, type Humor } from '../features/predio/humor'
import { useAgentes } from './useAgentes'
import { useMetricasInfra } from './useInfra'
import { useMensagens } from './useMensagens'
import { useProjetos } from './useNorte'
import { useOrcamentoDoDia, useTickAtual } from './useTick'

// Humor de cada agente (ideias do 3D, fase 3), calculado no navegador a partir de consultas que já existem: nenhuma chama
// LLM, então podem carregar ao abrir a tela (RNF01). Quem não tem humor fica fora do mapa (nada a mostrar).
export function useHumores(): Map<AgenteId, { humor: Humor; motivo: string }> {
  const { data: agentes } = useAgentes()
  const { data: mensagens } = useMensagens()
  const { data: metricas } = useMetricasInfra(1)
  const { data: orcamento } = useOrcamentoDoDia()
  const { data: projetos } = useProjetos()
  const { data: tick } = useTickAtual()

  return useMemo(() => {
    const saida = new Map<AgenteId, { humor: Humor; motivo: string }>()
    if (!agentes || !mensagens) return saida
    const localDe = (id: number) => {
      const a = agentes.find((x) => x.id === id)
      return a ? AGENTES.find((l) => l.especialidade === a.especialidade)?.id : undefined
    }
    const sinais = sinaisPorAgente(
      { agentes, mensagens, metricas, orcamentoDisponivel: orcamento?.disponivel_hoje, projetos, tickAtual: tick?.numero || undefined },
      localDe,
    )
    for (const [id, s] of sinais) {
      const h = humorDe(s)
      if (h) saida.set(id, h)
    }
    return saida
  }, [agentes, mensagens, metricas, orcamento, projetos, tick])
}
