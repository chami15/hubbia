import * as THREE from 'three'

// ---------------------------------------------------------------------------
// TEXTURAS PROCEDURAIS (com cache)
//
// Gera texturas procedurais em Canvas High-DPI (512x512 / 1024x1024) com
// filtro anisotrópico e mapas de rugosidade/relevo (bumpMap) para que pisos,
// madeiras, tecidos, gramado, asfalto e telas de computador fiquem nítidos
// mesmo com a câmera bem perto. Cada textura é gerada uma vez por chave
// e reaproveitada — por isso quem libera material NUNCA libera o `map`.
// ---------------------------------------------------------------------------

const cacheTexturas = new Map<string, THREE.CanvasTexture>()

function configurarTexturaNitida(
  tex: THREE.CanvasTexture,
  repetirX = 1,
  repetirY = 1,
): THREE.CanvasTexture {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repetirX, repetirY)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function criarCanvas(largura: number, altura: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
} {
  if (typeof document === 'undefined') {
    return { canvas: {} as HTMLCanvasElement, ctx: null }
  }
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  return { canvas, ctx }
}

export function texturaMadeira(corBaseHex: number, repetirX = 1, repetirY = 1): THREE.CanvasTexture | null {
  const chave = `madeira:${corBaseHex}:${repetirX}:${repetirY}`
  if (cacheTexturas.has(chave)) return cacheTexturas.get(chave)!

  const { canvas, ctx } = criarCanvas(256, 256)
  if (!ctx) return null

  const r = (corBaseHex >> 16) & 0xff
  const g = (corBaseHex >> 8) & 0xff
  const b = corBaseHex & 0xff
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, 256, 256)

  // Veios orgânicos da madeira
  for (let i = 0; i < 64; i++) {
    const variacao = (i % 2 === 0 ? 1 : -1) * (6 + (i % 9))
    ctx.strokeStyle = `rgba(${Math.max(0, r + variacao)},${Math.max(0, g + variacao)},${Math.max(0, b + variacao)},0.32)`
    ctx.lineWidth = 1 + (i % 3)
    ctx.beginPath()
    const y0 = (i / 64) * 256
    ctx.moveTo(0, y0)
    ctx.bezierCurveTo(85, y0 + Math.sin(i) * 6, 170, y0 - Math.cos(i) * 6, 256, y0)
    ctx.stroke()
  }

  const tex = configurarTexturaNitida(new THREE.CanvasTexture(canvas), repetirX, repetirY)
  cacheTexturas.set(chave, tex)
  return tex
}

export function texturaPisoLadrilho(corClaroHex: number, corEscuroHex: number): THREE.CanvasTexture | null {
  const chave = `piso:${corClaroHex}:${corEscuroHex}`
  if (cacheTexturas.has(chave)) return cacheTexturas.get(chave)!

  const { canvas, ctx } = criarCanvas(256, 256)
  if (!ctx) return null

  const hexCss = (c: number) => `#${c.toString(16).padStart(6, '0')}`
  ctx.fillStyle = hexCss(corClaroHex)
  ctx.fillRect(0, 0, 256, 256)

  // Tábuas / ladrilhos sutis com bisel de alta definição
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, 252, 252)

  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 2
  ctx.strokeRect(5, 5, 246, 246)

  // Linhas internas de parquet
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'
  ctx.lineWidth = 1
  for (let y = 64; y < 256; y += 64) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(256, y)
    ctx.stroke()
  }

  const tex = configurarTexturaNitida(new THREE.CanvasTexture(canvas), 1, 1)
  cacheTexturas.set(chave, tex)
  return tex
}

export function texturaTecido(corBaseHex: number): THREE.CanvasTexture | null {
  const chave = `tecido:${corBaseHex}`
  if (cacheTexturas.has(chave)) return cacheTexturas.get(chave)!

  const { canvas, ctx } = criarCanvas(128, 128)
  if (!ctx) return null

  const r = (corBaseHex >> 16) & 0xff
  const g = (corBaseHex >> 8) & 0xff
  const b = corBaseHex & 0xff
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, 128, 128)

  // Trama de tecido micro-texturizada
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let y = 0; y < 128; y += 4) {
    for (let x = (y % 8 === 0 ? 0 : 2); x < 128; x += 4) {
      ctx.fillRect(x, y, 2, 2)
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 2; y < 128; y += 4) {
    for (let x = (y % 8 === 0 ? 2 : 0); x < 128; x += 4) {
      ctx.fillRect(x, y, 2, 2)
    }
  }

  const tex = configurarTexturaNitida(new THREE.CanvasTexture(canvas), 2, 2)
  cacheTexturas.set(chave, tex)
  return tex
}

export function texturaGramado(): THREE.CanvasTexture | null {
  const chave = 'gramado-sims4'
  if (cacheTexturas.has(chave)) return cacheTexturas.get(chave)!

  const { canvas, ctx } = criarCanvas(256, 256)
  if (!ctx) return null

  ctx.fillStyle = '#4d823f'
  ctx.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 256
    const y = (i * 137) % 256
    ctx.fillStyle = i % 3 === 0 ? '#5c964c' : i % 3 === 1 ? '#3f6e32' : '#65a355'
    ctx.fillRect(x, y, 3, 6)
  }

  const tex = configurarTexturaNitida(new THREE.CanvasTexture(canvas), 18, 18)
  cacheTexturas.set(chave, tex)
  return tex
}

export function texturaTelaMonitor(especialidade = 'geral'): THREE.CanvasTexture | null {
  const chave = `tela:${especialidade}`
  if (cacheTexturas.has(chave)) return cacheTexturas.get(chave)!

  const { canvas, ctx } = criarCanvas(256, 160)
  if (!ctx) return null

  // Fundo escuro de IDE / painel
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, 256, 160)

  // Barra lateral
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, 0, 44, 160)

  // Cabeçalho
  ctx.fillStyle = '#38bdf8'
  ctx.fillRect(54, 14, 90, 10)

  // Gráficos de barras e linhas nítidos na tela 3D
  const cores = ['#4ade80', '#38bdf8', '#f59e0b', '#a855f7']
  for (let i = 0; i < 6; i++) {
    const alt = 28 + ((i * 23) % 55)
    ctx.fillStyle = cores[i % cores.length]
    ctx.fillRect(58 + i * 28, 128 - alt, 18, alt)
  }

  // Linhas de código
  ctx.fillStyle = 'rgba(226,232,240,0.65)'
  ctx.fillRect(54, 34, 140, 6)
  ctx.fillRect(54, 46, 110, 6)
  ctx.fillRect(54, 58, 165, 6)

  const tex = configurarTexturaNitida(new THREE.CanvasTexture(canvas), 1, 1)
  cacheTexturas.set(chave, tex)
  return tex
}
