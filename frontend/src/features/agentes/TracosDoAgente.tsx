import { useAgentes } from '../../hooks/useAgentes'
import { corCss, type AgenteVisual } from '../predio/agentes'
import { tracosDe } from '../predio/personalidade'

// Até três traços em chips (ideias do 3D, fase 4). Só traço que muda o que se vê no prédio (sai mais da sala, dorme
// tarde, levanta menos): chip decorativo que não corresponde a nada seria a "poluição" que o critério do 3D proíbe.
// A extroversão vem do backend (seed), a mesma que o prédio usa: o painel e o comportamento não divergem.
export function TracosDoAgente({ agente }: { agente: AgenteVisual }) {
  const { data: aoVivo } = useAgentes()
  const extroversao = agente.especialidade ? aoVivo?.find((a) => a.especialidade === agente.especialidade)?.extroversao : undefined
  const tracos = tracosDe(agente.id, extroversao)
  if (!tracos.length) return null
  const cor = corCss(agente.cor)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 16px', background: 'var(--deck-2)', borderBottom: '1px solid var(--deck-line)' }}>
      {tracos.map((t) => (
        <span key={t} style={{ fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--ink)', border: `1px solid ${cor}`, padding: '2px 8px' }}>
          {t}
        </span>
      ))}
    </div>
  )
}
