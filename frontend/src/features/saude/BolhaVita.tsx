// Atalho de peso e hidratação ancorado na Vita (RF19): abre com clique direito nela, sem abrir o painel.
// Mesmo "idioma" do prédio: cantos em degraus de 2 px, borda chapada na cor dela, sem sombra suave nem arredondado.
// É HTML (precisa de campo de texto) por cima do canvas; a posição vem de `mundo.ancora` e é recalculada a cada quadro
// porque ela anda.
import { useEffect, useRef, useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useDashboard, useRegistrarHidratacao, useRegistrarPeso } from '../../hooks/useSaude'
import { encaixarBolha } from '../predio/atalho'

type Ancora = { x: number; y: number; pe: number }

const COR = 'var(--vita)'
const FUNDO = 'var(--deck)'
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
const COPOS_ML = [200, 300, 500]

/** Retângulo com os cantos cortados em degraus de `s` px: o "arredondado" da pixel art. */
function degraus(s: number): string {
  const d = s * 2
  return `polygon(0 ${d}px, ${s}px ${d}px, ${s}px ${s}px, ${d}px ${s}px, ${d}px 0, calc(100% - ${d}px) 0, calc(100% - ${d}px) ${s}px, calc(100% - ${s}px) ${s}px, calc(100% - ${s}px) ${d}px, 100% ${d}px, 100% calc(100% - ${d}px), calc(100% - ${s}px) calc(100% - ${d}px), calc(100% - ${s}px) calc(100% - ${s}px), calc(100% - ${d}px) calc(100% - ${s}px), calc(100% - ${d}px) 100%, ${d}px 100%, ${d}px calc(100% - ${s}px), ${s}px calc(100% - ${s}px), ${s}px calc(100% - ${d}px), 0 calc(100% - ${d}px))`
}

const CAMPO: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0a0b0e',
  border: '2px solid var(--deck-line)',
  borderRadius: 0,
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 12,
  padding: '4px 6px',
  colorScheme: 'dark',
}

const BOTAO_PX: React.CSSProperties = {
  border: '2px solid var(--vita)',
  borderRadius: 0,
  background: 'transparent',
  color: 'var(--vita)',
  font: 'inherit',
  fontSize: 11,
  padding: '3px 7px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
}

export function BolhaVita({
  ancora,
  area,
  aoFechar,
}: {
  /** `mundo.ancora('vita')`: coordenada de tela da cabeça dela, ou null se ela saiu de cena. */
  ancora: () => Ancora | null
  area: React.RefObject<HTMLElement | null>
  aoFechar: () => void
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const cauda = useRef<HTMLDivElement>(null)
  const campoPeso = useRef<HTMLInputElement>(null)
  const [peso, setPeso] = useState('')
  const [agua, setAgua] = useState('')
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null)
  const { data: painel } = useDashboard()
  const registrarPeso = useRegistrarPeso()
  const registrarAgua = useRegistrarHidratacao()

  // acompanha a Vita: só transform (barato); fecha se ela sair de cena
  useEffect(() => {
    let id = 0
    function quadro() {
      const el = raiz.current
      const fundo = area.current?.getBoundingClientRect()
      const a = ancora()
      if (!a || !fundo) return aoFechar()
      if (el) {
        const e = encaixarBolha(
          { x: a.x - fundo.left, y: a.y - fundo.top },
          { w: el.offsetWidth, h: el.offsetHeight },
          { w: fundo.width, h: fundo.height },
          { pePersonagem: a.pe },
        )
        el.style.transform = `translate(${e.x}px, ${e.y}px)`
        el.style.visibility = 'visible'
        if (cauda.current) {
          cauda.current.style.left = `${e.caudaX}px`
          cauda.current.style[e.abaixo ? 'top' : 'bottom'] = '-8px'
          cauda.current.style[e.abaixo ? 'bottom' : 'top'] = 'auto'
          cauda.current.style.transform = `translateX(-50%) scaleY(${e.abaixo ? -1 : 1})`
        }
      }
      id = requestAnimationFrame(quadro)
    }
    id = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(id)
  }, [ancora, area, aoFechar])

  useEffect(() => campoPeso.current?.focus(), [])

  // clique fora fecha (o botão direito fica de fora: é o que reabre a bolha)
  useEffect(() => {
    function fora(e: PointerEvent) {
      if (e.button !== 0) return
      if (raiz.current && !raiz.current.contains(e.target as Node)) aoFechar()
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aoFechar])

  // o aviso some sozinho; sem isso o "✓" antigo parece resposta do registro seguinte
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(t)
  }, [aviso])

  function registrarPesoKg() {
    const v = Number(peso)
    if (!v || v <= 0) return
    registrarPeso.mutate(v, {
      onSuccess: () => {
        setPeso('')
        setAviso({ texto: `✓ peso ${v.toFixed(1)} kg`, erro: false })
      },
      onError: (e) => setAviso({ texto: mensagemDeErro(e), erro: true }),
    })
  }

  function registrarAguaMl(ml: number) {
    if (!ml || ml <= 0) return
    registrarAgua.mutate(ml, {
      onSuccess: () => {
        setAgua('')
        setAviso({ texto: `✓ +${ml} ml`, erro: false })
      },
      onError: (e) => setAviso({ texto: mensagemDeErro(e), erro: true }),
    })
  }

  const hoje = painel
    ? `${painel.peso_atual === null ? '—' : `${painel.peso_atual.toFixed(1)} kg`} · água ${(painel.hidratacao_hoje_ml / 1000).toFixed(1)} L`
    : ' '

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-label="registro rápido da Vita"
      style={{ position: 'absolute', left: 0, top: 0, zIndex: 50, width: 236, visibility: 'hidden', fontFamily: MONO, WebkitFontSmoothing: 'none' }}
    >
      <div style={{ background: COR, clipPath: degraus(2), padding: 2 }}>
        <div style={{ background: FUNDO, clipPath: degraus(2), padding: '8px 10px 10px', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: COR, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>vita · registro</span>
            <button type="button" onClick={aoFechar} aria-label="fechar" style={{ ...BOTAO_PX, border: 'none', color: 'var(--ink-dim)', padding: '0 2px', fontSize: 13 }}>
              x
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-dim)', minHeight: 13 }}>hoje: {hoje}</div>

          <form
            style={{ display: 'flex', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault()
              registrarPesoKg()
            }}
          >
            <input ref={campoPeso} style={CAMPO} type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="peso kg" aria-label="registrar peso" />
            <button style={{ ...BOTAO_PX, opacity: registrarPeso.isPending || !peso ? 0.45 : 1 }} type="submit" disabled={registrarPeso.isPending || !peso}>
              ok
            </button>
          </form>

          <div style={{ display: 'flex', gap: 6 }}>
            {COPOS_ML.map((ml) => (
              <button key={ml} type="button" style={{ ...BOTAO_PX, flex: 1, padding: '3px 0', opacity: registrarAgua.isPending ? 0.45 : 1 }} disabled={registrarAgua.isPending} onClick={() => registrarAguaMl(ml)}>
                +{ml}
              </button>
            ))}
          </div>
          <form
            style={{ display: 'flex', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault()
              registrarAguaMl(Number(agua))
            }}
          >
            <input style={CAMPO} type="number" value={agua} onChange={(e) => setAgua(e.target.value)} placeholder="água ml" aria-label="registrar hidratação" />
            <button style={{ ...BOTAO_PX, opacity: registrarAgua.isPending || !agua ? 0.45 : 1 }} type="submit" disabled={registrarAgua.isPending || !agua}>
              ok
            </button>
          </form>

          <div role="status" style={{ fontSize: 10.5, minHeight: 13, color: aviso?.erro ? 'var(--danger)' : 'var(--good)' }}>
            {aviso?.texto ?? ' '}
          </div>
        </div>
      </div>

      {/* cauda em degraus: 12 → 8 → 4 px, na cor da borda; o miolo repete menor na cor do fundo */}
      <div ref={cauda} aria-hidden style={{ position: 'absolute', bottom: -8, width: 12, height: 8 }}>
        {[12, 8, 4].map((w, i) => (
          <div key={w} style={{ position: 'absolute', top: i * 2, left: (12 - w) / 2, width: w, height: 2, background: COR }} />
        ))}
        {[8, 4].map((w, i) => (
          <div key={w} style={{ position: 'absolute', top: i * 2 - 2, left: (12 - w) / 2, width: w, height: 2, background: FUNDO }} />
        ))}
      </div>
    </div>
  )
}
