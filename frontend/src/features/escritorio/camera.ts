import type { Application, Container, FederatedPointerEvent } from 'pixi.js'
import { paraTela } from './iso'

// ---------------------------------------------------------------------------
// CÂMERA ESTILO THE SIMS 4 (`Game\Bin\res\Camera.ini`)
//
// Recursos extraídos de `Camera.ini`:
//   - Zoom suave com roda do mouse (`MouseZoomInSpeed = 1.5`, interpolado)
//   - Arraste do pano de fundo com botão do meio, direito ou clique-e-arraste
//   - Teclas WASD para passear pela sala
//   - Modo Seguir Sim Ativo (`[FollowCameraParams]`): ancora suavemente a
//     câmera na posição isométrica do Sim selecionado enquanto ele anda.
// ---------------------------------------------------------------------------

export interface ControladorCamera {
  centralizarSala: (imediato?: boolean) => void
  aplicarZoom: (fator: number, centroTela?: { x: number; y: number }) => void
  definirSeguirPonto: (pontoMundo: { x: number; y: number } | null) => void
  deslocarPorTeclado: (dx: number, dy: number) => void
  obterEscalaRelativa: () => number
  destruir: () => void
}

const MARGEM_INICIAL = 0.84
const ZOOM_MIN_FATOR = 0.55
const ZOOM_MAX_FATOR = 2.35
const SUAVIZACAO = 0.16

export function criarControladorCamera(
  aplicacao: Application,
  mundo: Container,
  podeArrastar: () => boolean,
  aoInteragirManual?: () => void,
): ControladorCamera {
  let escalaBase = 1
  let escalaAlvo = 1
  let xAlvo = 0
  let yAlvo = 0
  let pontoSeguido: { x: number; y: number } | null = null

  let arrastandoCamera = false
  let pontoInicioArraste: { x: number; y: number } | null = null
  let mundoInicioArraste: { x: number; y: number } | null = null

  function calcularEnquadramentoBase() {
    const limites = mundo.getLocalBounds()
    if (limites.width <= 0 || limites.height <= 0) return
    escalaBase = Math.min(
      (aplicacao.screen.width * MARGEM_INICIAL) / limites.width,
      (aplicacao.screen.height * MARGEM_INICIAL) / limites.height,
    )
    return {
      escala: escalaBase,
      x: aplicacao.screen.width / 2 - (limites.x + limites.width / 2) * escalaBase,
      y: aplicacao.screen.height / 2 - (limites.y + limites.height / 2) * escalaBase - 28,
    }
  }

  function centralizarSala(imediato = false) {
    const base = calcularEnquadramentoBase()
    if (!base) return
    escalaAlvo = base.escala
    xAlvo = base.x
    yAlvo = base.y
    if (imediato) {
      mundo.scale.set(escalaAlvo)
      mundo.x = xAlvo
      mundo.y = yAlvo
    }
  }

  function aplicarZoom(fator: number, centroTela?: { x: number; y: number }) {
    const novaEscala = Math.max(
      escalaBase * ZOOM_MIN_FATOR,
      Math.min(escalaBase * ZOOM_MAX_FATOR, escalaAlvo * fator),
    )
    const cx = centroTela?.x ?? aplicacao.screen.width / 2
    const cy = centroTela?.y ?? aplicacao.screen.height / 2

    // Mantém o ponto sob o cursor fixo durante o zoom
    const mundoX = (cx - xAlvo) / escalaAlvo
    const mundoY = (cy - yAlvo) / escalaAlvo

    escalaAlvo = novaEscala
    xAlvo = cx - mundoX * novaEscala
    yAlvo = cy - mundoY * novaEscala
  }

  function definirSeguirPonto(pontoMundo: { x: number; y: number } | null) {
    pontoSeguido = pontoMundo
  }

  function deslocarPorTeclado(dx: number, dy: number) {
    if (pontoSeguido) {
      pontoSeguido = null
      aoInteragirManual?.()
    }
    xAlvo += dx
    yAlvo += dy
  }

  function aoRodaMouse(e: WheelEvent) {
    e.preventDefault()
    const fator = e.deltaY < 0 ? 1.13 : 1 / 1.13
    const rect = aplicacao.canvas.getBoundingClientRect()
    aplicarZoom(fator, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function aoPressionarPalco(e: FederatedPointerEvent) {
    // Permite arrastar câmera com botão do meio (1), direito (2) ou no fundo vazio
    if (!podeArrastar() && e.button === 0) return
    arrastandoCamera = true
    pontoInicioArraste = { x: e.global.x, y: e.global.y }
    mundoInicioArraste = { x: xAlvo, y: yAlvo }
  }

  function aoMoverPalco(e: FederatedPointerEvent) {
    if (!arrastandoCamera || !pontoInicioArraste || !mundoInicioArraste) return
    const dx = e.global.x - pontoInicioArraste.x
    const dy = e.global.y - pontoInicioArraste.y
    if (Math.hypot(dx, dy) > 6 && pontoSeguido) {
      pontoSeguido = null
      aoInteragirManual?.()
    }
    xAlvo = mundoInicioArraste.x + dx
    yAlvo = mundoInicioArraste.y + dy
  }

  function aoSoltarPalco() {
    arrastandoCamera = false
    pontoInicioArraste = null
    mundoInicioArraste = null
  }

  function aoTick() {
    if (pontoSeguido) {
      xAlvo = aplicacao.screen.width / 2 - pontoSeguido.x * escalaAlvo
      yAlvo = aplicacao.screen.height / 2 - (pontoSeguido.y - 48) * escalaAlvo
    }

    mundo.scale.set(mundo.scale.x + (escalaAlvo - mundo.scale.x) * SUAVIZACAO)
    mundo.x += (xAlvo - mundo.x) * SUAVIZACAO
    mundo.y += (yAlvo - mundo.y) * SUAVIZACAO
  }

  function aoRedimensionar() {
    if (!pontoSeguido) centralizarSala(false)
  }

  centralizarSala(true)

  const canvas = aplicacao.canvas
  canvas.addEventListener('wheel', aoRodaMouse, { passive: false })
  aplicacao.stage.on('pointerdown', aoPressionarPalco)
  aplicacao.stage.on('pointermove', aoMoverPalco)
  aplicacao.stage.on('pointerup', aoSoltarPalco)
  aplicacao.stage.on('pointerupoutside', aoSoltarPalco)
  aplicacao.renderer.on('resize', aoRedimensionar)
  aplicacao.ticker.add(aoTick)

  return {
    centralizarSala,
    aplicarZoom,
    definirSeguirPonto,
    deslocarPorTeclado,
    obterEscalaRelativa: () => (escalaBase > 0 ? escalaAlvo / escalaBase : 1),
    destruir() {
      canvas.removeEventListener('wheel', aoRodaMouse)
      aplicacao.stage.off('pointerdown', aoPressionarPalco)
      aplicacao.stage.off('pointermove', aoMoverPalco)
      aplicacao.stage.off('pointerup', aoSoltarPalco)
      aplicacao.stage.off('pointerupoutside', aoSoltarPalco)
      aplicacao.renderer.off('resize', aoRedimensionar)
      aplicacao.ticker.remove(aoTick)
    },
  }
}

export function pontoMundoDoSim(coluna: number, linha: number): { x: number; y: number } {
  return paraTela(coluna, linha, 0.35)
}
