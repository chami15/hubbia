import { AGENTES } from './agentes'
import { RetratoAgente } from '../agentes/RetratoAgente'
import {
  ZONA_MORTA_PIE_MENU_PX,
  type OpcaoPieMenu,
} from './simulacao-sims'

// ---------------------------------------------------------------------------
// MENU RADIAL "PIE MENU" DE THE SIMS 4 (`interactions/pie_menu_category.pyc`)
//
// Extraído de `Game\Bin\Default.ini` [UI]:
//   piemenudeadzone = 28
// As opções se distribuem radialmente ao redor do ponto clicado na tela,
// com o retrato do Sim ativo e o diamante PlumbBob no centro da zona morta.
// ---------------------------------------------------------------------------

export interface EstadoMenuPie {
  x: number
  y: number
  tituloAlvo: string
  opcoes: OpcaoPieMenu[]
}

interface Props {
  menu: EstadoMenuPie | null
  simAtivoId: string
  corPlumbBobHex: string
  aoEscolher: (opcao: OpcaoPieMenu) => void
  aoFechar: () => void
}

const RAIO_PETALAS = 118

export function MenuPie({
  menu,
  simAtivoId,
  corPlumbBobHex,
  aoEscolher,
  aoFechar,
}: Props) {
  if (!menu || menu.opcoes.length === 0) return null

  const agenteAtivo = AGENTES.find((a) => a.id === simAtivoId) ?? AGENTES[0]

  // Mantém o centro do Pie Menu dentro da área visível da janela
  const margem = 180
  const cx = Math.max(margem, Math.min(window.innerWidth - margem, menu.x))
  const cy = Math.max(margem, Math.min(window.innerHeight - margem, menu.y))
  const n = menu.opcoes.length

  return (
    <div
      onClick={aoFechar}
      onContextMenu={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: cx,
          top: cy,
          width: 0,
          height: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Anel orbital sutil ligando as pétalas do Pie Menu */}
        <div
          style={{
            position: 'absolute',
            left: -RAIO_PETALAS,
            top: -RAIO_PETALAS,
            width: RAIO_PETALAS * 2,
            height: RAIO_PETALAS * 2,
            borderRadius: '50%',
            border: '1px dashed rgba(255,255,255,0.18)',
            background: 'radial-gradient(circle, rgba(15,23,42,0.42) 0%, rgba(15,23,42,0) 72%)',
            pointerEvents: 'none',
          }}
        />

        {/* Centro do Pie Menu (Deadzone = 28px de raio -> 56px de diâmetro) */}
        <button
          type="button"
          onClick={aoFechar}
          title="Fechar menu (Esc)"
          style={{
            position: 'absolute',
            left: -ZONA_MORTA_PIE_MENU_PX,
            top: -ZONA_MORTA_PIE_MENU_PX,
            width: ZONA_MORTA_PIE_MENU_PX * 2,
            height: ZONA_MORTA_PIE_MENU_PX * 2,
            borderRadius: '50%',
            border: `2.5px solid ${corPlumbBobHex}`,
            background: 'rgba(15, 23, 42, 0.92)',
            boxShadow: `0 0 22px ${corPlumbBobHex}66, 0 8px 20px rgba(0,0,0,0.6)`,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <RetratoAgente agente={agenteAtivo} tamanho={44} />
        </button>

        {/* Rótulo do objeto/Sim clicado logo acima do centro */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: -ZONA_MORTA_PIE_MENU_PX - 26,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#cbd5e1',
            pointerEvents: 'none',
          }}
        >
          {menu.tituloAlvo}
        </div>

        {/* Pétalas radiais de interação */}
        {menu.opcoes.map((op, i) => {
          const angulo = -Math.PI / 2 + (i * Math.PI * 2) / n
          const px = Math.cos(angulo) * RAIO_PETALAS
          const py = Math.sin(angulo) * RAIO_PETALAS
          const corBorda = op.corDestaque ?? 'rgba(255,255,255,0.24)'

          return (
            <button
              key={op.id}
              type="button"
              onClick={() => {
                aoEscolher(op)
                aoFechar()
              }}
              style={{
                position: 'absolute',
                left: px,
                top: py,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 13px',
                borderRadius: 999,
                background: 'rgba(17, 24, 39, 0.94)',
                backdropFilter: 'blur(12px)',
                border: `1.5px solid ${corBorda}`,
                boxShadow: op.corDestaque
                  ? `0 8px 22px -6px rgba(0,0,0,0.7), 0 0 14px ${op.corDestaque}44`
                  : '0 8px 22px -6px rgba(0,0,0,0.7)',
                color: '#f8fafc',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'transform 0.12s ease, background 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.06)'
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.98)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'
                e.currentTarget.style.background = 'rgba(17, 24, 39, 0.94)'
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{op.icone}</span>
              <span>{op.titulo}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
