import { AGENTES } from './agentes'
import { RetratoAgente, corCss } from '../agentes/RetratoAgente'

// Retrato redondo de QUALQUER personagem do modo simulação. Os 4 agentes
// têm arte própria (RetratoAgente); personagem criado no criador não tem
// — antes ele "pegava emprestado" o retrato do Norte, o que fazia um
// personagem novo aparecer no HUD com a cara de outro. Sem arte, mostra a
// inicial sobre a cor de identidade.
interface Props {
  id: string
  nome: string
  cor: number
  tamanho: number
  anel?: number
}

export function AvatarAgente({ id, nome, cor, tamanho, anel = 3 }: Props) {
  const visual = AGENTES.find((a) => a.id === id)
  if (visual) return <RetratoAgente agente={visual} tamanho={tamanho} anel={anel} />

  const hex = corCss(cor)
  return (
    <div
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 35% 30%, ${hex}, ${hex}99)`,
        boxShadow: anel > 0 ? `0 0 0 ${anel}px ${hex}` : undefined,
        color: '#fff',
        fontFamily: 'var(--fonte-display)',
        fontWeight: 800,
        fontSize: tamanho * 0.45,
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      {nome.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
