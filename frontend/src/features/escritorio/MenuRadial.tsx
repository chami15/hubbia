import { AvatarAgente } from './AvatarAgente'
import type { CategoriaPieMenu, OpcaoPieMenu } from './simulacao-sims'

// ---------------------------------------------------------------------------
// MENU RADIAL — abre onde o chefe clicou (móvel, agente ou piso) com as
// opções em volta e o agente selecionado no centro: deixa claro QUEM vai
// fazer aquilo antes do clique.
//
// As opções do lado esquerdo crescem pra esquerda e as do direito pra
// direita (âncora na ponta de dentro): com texto de tamanho variável, é
// o que impede duas pílulas de se encavalarem — antes todas eram
// centralizadas no ponto e as de cima/baixo se cobriam com 5+ opções.
// ---------------------------------------------------------------------------

export interface EstadoMenuRadial {
  x: number
  y: number
  titulo: string
  opcoes: OpcaoPieMenu[]
}

interface Props {
  menu: EstadoMenuRadial | null
  agenteAtivo: { id: string; nome: string; cor: number }
  corDiamante?: string
  aoEscolher: (opcao: OpcaoPieMenu) => void
  aoFechar: () => void
}

// Cor do filete de cada opção — a categoria, não a opção, decide: o
// olho aprende "azul = trabalho" e acha a coisa sem ler.
const COR_CATEGORIA: Record<CategoriaPieMenu, string> = {
  trabalho: 'var(--info)',
  necessidades: 'var(--good)',
  social: 'var(--official)',
  ambiente: 'var(--accent)',
  navegacao: 'var(--ink-dim)',
  hubbia: 'var(--accent)',
}

const RAIO_CENTRO = 28
// pílula mais larga que dá pra prever sem medir o DOM — só pra manter o
// menu inteiro dentro da tela
const LARGURA_ESTIMADA = 210

export function MenuRadial({ menu, agenteAtivo, corDiamante = 'var(--good)', aoEscolher, aoFechar }: Props) {
  if (!menu || menu.opcoes.length === 0) return null

  const n = menu.opcoes.length
  // mais opções → círculo maior, pra cada uma ter sua "faixa" de altura
  const raio = Math.max(96, n * 22)
  const margemX = raio + LARGURA_ESTIMADA
  const margemY = raio + 30
  const cx = Math.max(margemX, Math.min(window.innerWidth - margemX, menu.x))
  const cy = Math.max(margemY, Math.min(window.innerHeight - margemY, menu.y))

  return (
    <div
      onClick={aoFechar}
      onContextMenu={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 85, userSelect: 'none', fontFamily: 'var(--fonte-corpo)' }}
    >
      <div
        role="menu"
        aria-label={menu.titulo}
        style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0, animation: 'consoleListaEntra .14s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -raio,
            top: -raio,
            width: raio * 2,
            height: raio * 2,
            borderRadius: '50%',
            border: '1px dashed rgba(255,255,255,0.12)',
            background: 'radial-gradient(circle, rgba(8,9,12,0.5) 0%, rgba(8,9,12,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        <button
          type="button"
          onClick={aoFechar}
          title="Fechar (Esc)"
          aria-label="fechar menu"
          style={{
            position: 'absolute',
            left: -RAIO_CENTRO,
            top: -RAIO_CENTRO,
            width: RAIO_CENTRO * 2,
            height: RAIO_CENTRO * 2,
            borderRadius: '50%',
            border: `2px solid ${corDiamante}`,
            background: 'var(--deck)',
            boxShadow: `0 0 18px ${corDiamante}55, 0 8px 20px rgba(0,0,0,0.6)`,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <AvatarAgente id={agenteAtivo.id} nome={agenteAtivo.nome} cor={agenteAtivo.cor} tamanho={44} anel={0} />
        </button>

        <div
          style={{
            position: 'absolute',
            left: 0,
            // embaixo do centro: em cima ele cruzava com as opções
            // laterais de cima, que caem quase na mesma altura
            top: RAIO_CENTRO + 8,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            background: 'var(--deck)',
            border: '1px solid var(--deck-line)',
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--ink-dim)',
            pointerEvents: 'none',
          }}
        >
          {menu.titulo}
        </div>

        {menu.opcoes.map((op, i) => {
          const angulo = -Math.PI / 2 + (i * Math.PI * 2) / n
          const cos = Math.cos(angulo)
          const px = cos * raio
          const py = Math.sin(angulo) * raio
          // perto do eixo vertical centraliza; fora dele, ancora pro lado
          const ancoraX = Math.abs(cos) < 0.2 ? '-50%' : cos < 0 ? '-100%' : '0%'
          return (
            <button
              key={op.id}
              type="button"
              role="menuitem"
              autoFocus={i === 0}
              className="menu-radial-item"
              onClick={() => {
                aoEscolher(op)
                aoFechar()
              }}
              style={{
                position: 'absolute',
                left: px,
                top: py,
                transform: `translate(${ancoraX}, -50%)`,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 12px 6px 10px',
                borderRadius: 999,
                background: 'rgba(20, 22, 27, 0.95)',
                border: '1px solid var(--deck-line)',
                borderLeft: `3px solid ${COR_CATEGORIA[op.categoria]}`,
                boxShadow: '0 8px 22px -8px rgba(0,0,0,0.75)',
                color: 'var(--ink)',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{op.icone}</span>
              <span>{op.titulo}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
