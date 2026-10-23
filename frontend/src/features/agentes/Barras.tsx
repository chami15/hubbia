import { useEffect, useRef, useState } from 'react'

// As 4 barras do redesenho "Console" — vidro (blur) fica só pro HUD, mas
// o SHEEN/glow dessas continua fazendo sentido em cima do fundo opaco
// (`--deck`) dos painéis de agente: não é "vidro", é o preenchido tendo
// uma luz própria, tipo mostrador de instrumento.

interface BarraCapsulaProps {
  pct: number // 0–100
  cor: string // ex: 'var(--cifra)' ou um hex
}

// Progresso CONTÍNUO com valor conhecido — orçamento, hidratação.
export function BarraCapsula({ pct, cor }: BarraCapsulaProps) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      style={{
        height: 10,
        borderRadius: 999,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--deck-line)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${clamped}%`,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${cor}88, ${cor})`,
          boxShadow: `0 0 8px ${cor}88`,
          transition: 'width 0.4s cubic-bezier(.2,.8,.2,1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.5) 46%, transparent 62%)',
            backgroundSize: '200% 100%',
            animation: 'consoleSheen 3.2s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

interface BarraSegmentadaProps {
  total: number
  preenchidos: number
  cor: string
}

// Progresso em ETAPAS discretas — kanban do Norte, dias configurados na
// ficha de treino da Vita. Cada segmento acende com um pequeno atraso em
// cascata (vira um micro-evento, não um salto).
export function BarraSegmentada({ total, preenchidos, cor }: BarraSegmentadaProps) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => {
        const on = i < preenchidos
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 12,
              borderRadius: 3,
              background: on ? undefined : 'rgba(255,255,255,0.05)',
              backgroundImage: on ? `linear-gradient(180deg, ${cor}d8, ${cor}8c)` : undefined,
              border: '1px solid var(--deck-line)',
              opacity: on ? 1 : 0.5,
              boxShadow: on ? `0 0 8px ${cor}80` : 'none',
              animation: on ? `consoleSegPop .5s ease both` : undefined,
              animationDelay: on ? `${i * 0.07}s` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

interface BarraRadialProps {
  pct: number
  cor: string
  tamanho?: number
}

// Uma métrica-herói só — orçamento restante do dia, peso em tendência.
export function BarraRadial({ pct, cor, tamanho = 72 }: BarraRadialProps) {
  const raio = tamanho / 2 - 7
  const perimetro = 2 * Math.PI * raio
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = perimetro * (1 - clamped / 100)
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={raio}
        fill="none"
        stroke={cor}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={perimetro}
        strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 5px ${cor}a0)`, transition: 'stroke-dashoffset 0.6s cubic-bezier(.2,.8,.2,1)' }}
      />
    </svg>
  )
}

// Duração DESCONHECIDA — carregando dashboard, LLM gerando algo. Sem
// preenchido: só um segmento correndo, achado na anatomia de Progress
// Bar do uiguideline.com (`isIndeterminate`, presente em ~20 sistemas).
export function BarraIndeterminada({ cor = 'var(--info)' }: { cor?: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--deck-line)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '-35%',
          width: '35%',
          borderRadius: 999,
          background: `linear-gradient(90deg, transparent, ${cor}, transparent)`,
          animation: 'consoleIndet 1.5s ease-in-out infinite',
        }}
      />
    </div>
  )
}

interface ContadorProps {
  valor: number
  formatar: (v: number) => string
  cor?: string
}

// Número que muda com um pulinho, não uma troca seca — achado em
// designspells.com (app financeiro Family, dígitos de moeda "saltando"
// ao editar). Anima o texto INTEIRO num pulinho só quando `valor` muda;
// diferenciar dígito a dígito exigiria alinhar strings de tamanhos
// diferentes (R$ 999 → R$ 1.000) por pouco ganho visual a mais.
export function Contador({ valor, formatar, cor }: ContadorProps) {
  const [rolando, setRolando] = useState(false)
  const anterior = useRef(valor)

  useEffect(() => {
    if (anterior.current === valor) return
    anterior.current = valor
    setRolando(true)
    const t = setTimeout(() => setRolando(false), 500)
    return () => clearTimeout(t)
  }, [valor])

  return (
    <span
      style={{
        display: 'inline-block',
        color: cor,
        fontVariantNumeric: 'tabular-nums',
        animation: rolando ? 'consoleDigRoll .5s ease' : undefined,
      }}
    >
      {formatar(valor)}
    </span>
  )
}
