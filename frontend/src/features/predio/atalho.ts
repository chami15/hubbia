// Bolha de atalho rápido ancorada no personagem (RF19: peso e hidratação da Vita sem abrir o painel).
// Só a geometria mora aqui, pura, para testar sem navegador: o canvas é ampliado por CSS e a bolha é HTML por cima,
// então "onde está a cabeça da Vita" precisa de uma conversão mundo → tela e de um encaixe que não deixe a bolha sair da área.
import type { AgenteId } from './agentes'

/** Quem tem atalho de campo único. Agente novo com atalho entra aqui; o resto do prédio não muda. */
export const AGENTES_COM_ATALHO: ReadonlySet<AgenteId> = new Set(['vita'])

export const temAtalho = (id: AgenteId) => AGENTES_COM_ATALHO.has(id)

export interface Caixa {
  left: number
  top: number
  width: number
  height: number
}

/** Ponto do mundo (px do canvas 1x) → coordenada de tela, dado o retângulo do canvas já ampliado. */
export function pontoNaTela(canvas: Caixa, mundo: { W: number; H: number }, ponto: { x: number; y: number }) {
  return { x: canvas.left + (ponto.x / mundo.W) * canvas.width, y: canvas.top + (ponto.y / mundo.H) * canvas.height }
}

export interface Encaixe {
  x: number
  y: number
  /** Onde a ponta da cauda cai dentro da bolha (px a partir da esquerda dela). */
  caudaX: number
  /** Sem espaço em cima, a bolha desce para baixo do personagem e a cauda aponta para cima. */
  abaixo: boolean
}

/**
 * Posiciona a bolha acima da âncora (cabeça do personagem), centrada nela; se bater na borda da área, desliza para dentro e a
 * cauda continua apontando para o personagem. Sem espaço em cima, vai para baixo. Tudo em pixel inteiro: borda de pixel art
 * em posição fracionária fica borrada.
 */
export function encaixarBolha(
  ancora: { x: number; y: number },
  bolha: { w: number; h: number },
  area: { w: number; h: number },
  opcoes: { folga?: number; margem?: number; pePersonagem?: number } = {},
): Encaixe {
  const { folga = 6, margem = 8, pePersonagem = 34 } = opcoes
  const cabeEmCima = ancora.y - folga - bolha.h >= margem
  const abaixo = !cabeEmCima
  const yBruto = abaixo ? ancora.y + pePersonagem + folga : ancora.y - folga - bolha.h
  const xBruto = ancora.x - bolha.w / 2
  const x = Math.round(Math.min(Math.max(xBruto, margem), Math.max(margem, area.w - bolha.w - margem)))
  const y = Math.round(Math.min(Math.max(yBruto, margem), Math.max(margem, area.h - bolha.h - margem)))
  const caudaX = Math.round(Math.min(Math.max(ancora.x - x, 10), bolha.w - 10))
  return { x, y, caudaX, abaixo }
}
