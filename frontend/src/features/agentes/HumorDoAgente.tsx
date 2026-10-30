import { useHumores } from '../../hooks/useHumores'
import { corCss, type AgenteVisual } from '../predio/agentes'
import { ROTULO_HUMOR } from '../predio/humor'

// Uma linha no painel: o humor do agente e o PORQUÊ, com dado real (humor.ts). Só aparece quando há humor: agente
// tranquilo não ganha linha vazia nem "neutro". Nada de ícone, número ou barra (orçamento de ruído visual).
export function HumorDoAgente({ agente }: { agente: AgenteVisual }) {
  const h = useHumores().get(agente.id)
  if (!h) return null
  return (
    <div
      role="status"
      style={{ padding: '8px 16px', background: 'var(--deck-2)', borderBottom: '1px solid var(--deck-line)', fontSize: 11.5, lineHeight: 1.5 }}
    >
      <span style={{ color: corCss(agente.cor), letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10, marginRight: 8 }}>
        {ROTULO_HUMOR[h.humor]}
      </span>
      <span style={{ color: 'var(--ink)' }}>{h.motivo}</span>
    </div>
  )
}
