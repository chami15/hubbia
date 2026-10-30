import { useMemo } from 'react'
import { useAgentes, useRelacionamentos } from '../../hooks/useAgentes'
import { AGENTES, corCss, type AgenteVisual } from '../predio/agentes'
import { afinidadesDoServidor, seDaBemCom } from '../predio/relacoes'

// "Se dá bem com…" (ideias do 3D, fase 2): a afinidade REAL que o backend grava a cada conversa, lida sob demanda no
// painel. Uma barra fina por colega, SEM número ("ambiente, não dashboard preciso", frontend-design.md). Some para agente
// conceito (não conversa) e diz com franqueza quando ainda não houve conversa nenhuma, em vez de barras vazias.
const MAX_COLEGAS = 4

export function SeDaBemCom({ agente }: { agente: AgenteVisual }) {
  const { data: rels } = useRelacionamentos()
  const { data: aoVivo } = useAgentes()

  const lista = useMemo(() => {
    if (!rels || !aoVivo || !agente.especialidade) return null
    const localDe = (id: number) => {
      const a = aoVivo.find((x) => x.id === id)
      return a ? AGENTES.find((l) => l.especialidade === a.especialidade)?.id : undefined
    }
    const colegas = AGENTES.filter((a) => a.especialidade && aoVivo.some((x) => x.especialidade === a.especialidade)).map((a) => a.id)
    return seDaBemCom(agente.id, afinidadesDoServidor(rels, localDe), colegas).slice(0, MAX_COLEGAS)
  }, [rels, aoVivo, agente])

  if (!lista || !lista.length) return null
  const conversou = lista.some((c) => c.afinidade > 0)

  return (
    <div style={{ padding: '9px 16px 10px', background: 'var(--deck-2)', borderBottom: '1px solid var(--deck-line)' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>se dá bem com</div>
      {!conversou ? (
        <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>Ainda não conversou com ninguém.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '5px 14px' }}>
          {lista.map((c) => {
            const colega = AGENTES.find((a) => a.id === c.id)!
            const fracao = Math.max(0.04, Math.min(1, c.afinidade / 100))
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{colega.nome}</span>
                <span style={{ height: 4, background: 'var(--deck-line)', overflow: 'hidden' }} aria-label={`afinidade com ${colega.nome}`}>
                  {/* scaleX, não width: animação só por transform (frontend/AGENTS.md) */}
                  <span style={{ display: 'block', height: '100%', background: corCss(colega.cor), transform: `scaleX(${fracao})`, transformOrigin: 'left' }} />
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
