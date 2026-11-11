// Constantes e funções de estilo do painel da Pauta (separadas dos componentes de pixel.tsx por causa do fast refresh).
import type { CSSProperties } from 'react'

export const COR = 'var(--pauta)'
export const PAPEL = '#fff3b0' // o post-it
export const TINTA_PAPEL = '#3a2f12'
export const CONTORNO = '#0b0c10'
export const FONTE = 'var(--fonte-pixel)'

/** Retângulo com os cantos cortados em degraus de `s` px: o "arredondado" da pixel art (mesmo da bolha da Vita). */
export function degraus(s: number): string {
  const d = s * 2
  return `polygon(0 ${d}px, ${s}px ${d}px, ${s}px ${s}px, ${d}px ${s}px, ${d}px 0, calc(100% - ${d}px) 0, calc(100% - ${d}px) ${s}px, calc(100% - ${s}px) ${s}px, calc(100% - ${s}px) ${d}px, 100% ${d}px, 100% calc(100% - ${d}px), calc(100% - ${s}px) calc(100% - ${d}px), calc(100% - ${s}px) calc(100% - ${s}px), calc(100% - ${d}px) calc(100% - ${s}px), calc(100% - ${d}px) 100%, ${d}px 100%, ${d}px calc(100% - ${s}px), ${s}px calc(100% - ${s}px), ${s}px calc(100% - ${d}px), 0 calc(100% - ${d}px))`
}

/** O ícone de cada frente; frente nova (criada depois) usa o post-it. */
export function iconeDaFrente(nome: string): 'trabalho' | 'faculdade' | 'pessoal' | 'postit' {
  return nome === 'trabalho' || nome === 'faculdade' || nome === 'pessoal' ? nome : 'postit'
}

export const CAMPO: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0a0b0e',
  border: '2px solid var(--deck-line)',
  borderRadius: 0,
  color: 'var(--ink)',
  fontFamily: FONTE,
  fontSize: 14,
  padding: '7px 9px',
  colorScheme: 'dark',
}
