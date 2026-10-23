import { useHistoricoCards } from '../../hooks/useNorte'
import { EtiquetaTipo } from './CardAtivo'
import { ROTULO } from './estilos'

// O feed do que já foi resolvido — tipo changelog. Fica ABAIXO do card
// ativo, e sem botão nenhum: é registro, não fila de trabalho.

export function HistoricoCards({ projetoId }: { projetoId: number }) {
  const { data: cards } = useHistoricoCards(projetoId)

  if (!cards || cards.length === 0) return null

  return (
    <div>
      <div style={ROTULO}>já resolvidos</div>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.map((card) => {
          const feito = card.status === 'finalizado'
          return (
            <li
              key={card.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                fontSize: 12,
                // rejeitado fica apagado: é registro de algo que NÃO
                // aconteceu, e não pode competir com o que foi feito
                opacity: feito ? 1 : 0.55,
              }}
            >
              <span style={{ color: feito ? '#4ade80' : '#8d8779', fontSize: 11 }}>
                {feito ? '✓' : '×'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ lineHeight: 1.4, textDecoration: feito ? 'none' : 'line-through' }}>
                  {card.titulo}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <EtiquetaTipo card={card} />
                  {card.resolvido_em && (
                    <span style={{ ...ROTULO, marginBottom: 0 }}>
                      · {new Date(card.resolvido_em).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
