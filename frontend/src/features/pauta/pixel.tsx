// Peças pixel art do painel da Pauta: a mesma língua do prédio em HTML (pedido do chefe: "uma arte mais pixel art").
// Regras: cantos em degraus (nunca arredondado), borda chapada de 2 px, sombra dura sem desfoque, fonte pixel, ícones
// desenhados em grade 8x8 e ampliados por inteiro (crispEdges). Animação só com transform.
import type { CSSProperties, ReactNode } from 'react'
import { CONTORNO, COR, FONTE, degraus } from './estilos'


/** Caixa com borda de 2 px em degraus. A borda é a caixa de fora; o miolo, a de dentro (clip-path corta borda CSS). */
export function Caixa({ cor = 'var(--deck-line)', fundo = 'var(--deck-2)', esmaecida, children, style, onClick, titulo }: {
  cor?: string
  fundo?: string
  esmaecida?: boolean
  children: ReactNode
  style?: CSSProperties
  onClick?: () => void
  titulo?: string
}) {
  const clicavel = Boolean(onClick)
  return (
    <div
      role={clicavel ? 'button' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      title={titulo}
      aria-label={clicavel ? titulo : undefined}
      onClick={onClick}
      onKeyDown={clicavel ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick?.()) : undefined}
      className={clicavel ? 'pauta-clicavel' : undefined}
      style={{ background: cor, clipPath: degraus(2), padding: 2, opacity: esmaecida ? 0.45 : 1, cursor: clicavel ? 'pointer' : undefined, display: 'flex', flexDirection: 'column' }}
    >
      {/* flex 1: numa grade que estica a caixa, o miolo acompanha (senão a cor da borda "vaza" por baixo) */}
      <div style={{ background: fundo, clipPath: degraus(2), padding: '8px 10px', flex: 1, ...style }}>{children}</div>
    </div>
  )
}

/** Botão pixel: borda chapada, sombra dura que "afunda" no clique. `cheio` = ação principal. */
export function Botao({ children, onClick, cheio, cor = COR, tinta = CONTORNO, desligado, titulo, pequeno, type = 'button' }: {
  children: ReactNode
  onClick?: () => void
  cheio?: boolean
  cor?: string
  /** Cor do texto do botão cheio: escura por padrão (fundo claro); clara quando a cor do botão é escura. */
  tinta?: string
  desligado?: boolean
  titulo?: string
  pequeno?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      title={titulo}
      disabled={desligado}
      onClick={onClick}
      className="pauta-botao"
      style={{
        fontFamily: FONTE,
        fontSize: pequeno ? 12 : 14,
        lineHeight: 1,
        padding: pequeno ? '4px 7px' : '6px 11px',
        border: `2px solid ${cor}`,
        borderRadius: 0,
        background: cheio ? cor : 'transparent',
        color: cheio ? tinta : cor,
        boxShadow: `2px 2px 0 ${CONTORNO}`,
        cursor: desligado ? 'default' : 'pointer',
        opacity: desligado ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/** Caixinha de marcar, quadrada, com o "v" desenhado em pixels. */
export function Marcar({ feito, onChange, rotulo }: { feito: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={feito}
      aria-label={rotulo}
      onClick={() => onChange(!feito)}
      className="pauta-botao"
      style={{
        width: 18, height: 18, flexShrink: 0, padding: 0, borderRadius: 0, cursor: 'pointer',
        border: `2px solid ${feito ? 'var(--good)' : 'var(--ink-dim)'}`, background: feito ? 'var(--good)' : '#0a0b0e',
        display: 'grid', placeItems: 'center',
      }}
    >
      {feito && <Icone nome="check" cor={CONTORNO} escala={1.5} />}
    </button>
  )
}

/** Barra de progresso em blocos separados (como a barra de vida de um jogo). */
export function Barra({ acesos, cor = COR }: { acesos: boolean[]; cor?: string }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: 2 }}>
      {acesos.map((a, i) => (
        <span key={i} style={{ width: 6, height: 8, background: a ? cor : 'rgba(255,255,255,0.1)' }} />
      ))}
    </div>
  )
}

/** Rótulo pequeno em caixa alta (cabeçalho de seção). */
export function Rotulo({ children, cor = 'var(--ink-dim)' }: { children: ReactNode; cor?: string }) {
  return <div style={{ fontFamily: FONTE, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: cor }}>{children}</div>
}

// ------------------------------------------------------------------------------------------------ ícones 8x8
// '#' = cor do ícone, 'o' = contorno escuro, '+' = brilho. Desenhados à mão, um por linha, para dar para ler o desenho.
const ICONES = {
  trabalho: [
    '..oooo..',
    '..o..o..',
    'oooooooo',
    'o######o',
    'o##++##o',
    'o######o',
    'o######o',
    'oooooooo',
  ],
  faculdade: [
    '...oo...',
    '.oo##oo.',
    'o######o',
    '.oo##oo.',
    '..o##o.o',
    '..o##o.o',
    '..oooo.o',
    '.......o',
  ],
  pessoal: [
    '...oo...',
    '..o##o..',
    '.o####o.',
    'o######o',
    '.o#oo#o.',
    '.o#oo#o.',
    '.o#oo#o.',
    '.oooooo.',
  ],
  postit: [
    'oooooooo',
    'o######o',
    'o#oooo#o',
    'o######o',
    'o#ooo##o',
    'o#####oo',
    'o####o..',
    'oooooo..',
  ],
  estrela: [
    '...oo...',
    '...##...',
    'oo####oo',
    '.o####o.',
    '..####..',
    '.o#oo#o.',
    '.oo..oo.',
    '........',
  ],
  ampulheta: [
    'oooooooo',
    '.o####o.',
    '..o##o..',
    '...oo...',
    '...oo...',
    '..o##o..',
    '.o####o.',
    'oooooooo',
  ],
  nuvem: [
    '........',
    '...ooo..',
    '..o###o.',
    '.o#####o',
    'o######o',
    '.oooooo.',
    '..o..o..',
    '.o..o...',
  ],
  lampada: [
    '..oooo..',
    '.o####o.',
    'o##++##o',
    'o######o',
    '.o####o.',
    '..oooo..',
    '..o##o..',
    '...oo...',
  ],
  pergunta: [
    '.oooooo.',
    'o##oo##o',
    '.oo..o#o',
    '....o#o.',
    '...o#o..',
    '...oo...',
    '...o#o..',
    '...oo...',
  ],
  voltar: [
    '...o....',
    '..o#....',
    '.o######',
    'o#######',
    '.o######',
    '..o#....',
    '...o....',
    '........',
  ],
  olho: [
    '........',
    '..oooo..',
    '.o#oo#o.',
    'o#o##o#o',
    '.o#oo#o.',
    '..oooo..',
    '........',
    '........',
  ],
  check: [
    '........',
    '.......#',
    '......##',
    '#....##.',
    '##..##..',
    '.####...',
    '..##....',
    '........',
  ],
} as const satisfies Record<string, readonly string[]>

export type NomeIcone = keyof typeof ICONES

export function Icone({ nome, cor = COR, escala = 2 }: { nome: NomeIcone; cor?: string; escala?: number }) {
  const linhas = ICONES[nome]
  const tam = 8 * escala
  return (
    <svg aria-hidden width={tam} height={tam} viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ flexShrink: 0, display: 'block' }}>
      {linhas.flatMap((linha, y) =>
        [...linha].map((c, x) =>
          c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === 'o' ? CONTORNO : c === '+' ? '#ffffffcc' : cor} />,
        ),
      )}
    </svg>
  )
}

