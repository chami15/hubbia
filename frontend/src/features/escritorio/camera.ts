import type { Application, Container, FederatedPointerEvent, Ticker } from 'pixi.js'
import { paraTela } from './iso'

// ---------------------------------------------------------------------------
// CÂMERA DO ESCRITÓRIO
//
// O `mundo` (container com a cena dentro) é quem se move — a cena nunca
// sabe que existe câmera. Tudo aqui mexe em ALVOS (escala/x/y desejados)
// e o ticker aproxima o mundo do alvo aos poucos; é isso que deixa zoom,
// arraste e "seguir agente" suaves sem nenhuma animação explícita.
//
//   - roda do mouse: zoom mantendo o ponto sob o cursor parado
//   - arrastar: botão do meio/direito sempre; esquerdo só fora do modo
//     construir (lá o esquerdo arrasta móvel)
//   - WASD (via Escritorio): passo fixo
//   - seguir: ancora no agente selecionado; qualquer pan manual solta
// ---------------------------------------------------------------------------

export interface ControladorCamera {
  centralizarSala: (imediato?: boolean) => void
  aplicarZoom: (fator: number, centroTela?: { x: number; y: number }) => void
  definirSeguirPonto: (pontoMundo: { x: number; y: number } | null) => void
  deslocarPorTeclado: (dx: number, dy: number) => void
  // true se o último gesto do ponteiro foi um arraste de câmera — quem
  // trata clique em móvel/agente/piso pergunta isso antes de abrir menu,
  // senão soltar o arraste em cima de uma mesa abria o menu dela
  acabouDeArrastar: () => boolean
  destruir: () => void
}

const MARGEM_INICIAL = 0.84
const ZOOM_MIN = 0.55 // relativo ao enquadramento inicial
const ZOOM_MAX = 2.35
// Quão rápido o mundo alcança o alvo, por segundo. Era 0.16 POR QUADRO
// — a 144Hz a câmera ficava mais que o dobro mais rápida que a 60Hz.
const RIGIDEZ = 11
// Abaixo disso (px) o gesto ainda é clique, não arraste.
const LIMIAR_ARRASTE = 5

export function criarControladorCamera(
  aplicacao: Application,
  mundo: Container,
  podeArrastarComEsquerdo: () => boolean,
  aoSoltarSeguir?: () => void,
): ControladorCamera {
  let escalaBase = 1
  let escalaAlvo = 1
  let xAlvo = 0
  let yAlvo = 0
  let pontoSeguido: { x: number; y: number } | null = null

  let inicioArraste: { tela: { x: number; y: number }; alvo: { x: number; y: number } } | null = null
  let arrastou = false

  function enquadramentoBase() {
    const limites = mundo.getLocalBounds()
    if (limites.width <= 0 || limites.height <= 0) return null
    escalaBase = Math.min(
      (aplicacao.screen.width * MARGEM_INICIAL) / limites.width,
      (aplicacao.screen.height * MARGEM_INICIAL) / limites.height,
    )
    return {
      escala: escalaBase,
      x: aplicacao.screen.width / 2 - (limites.x + limites.width / 2) * escalaBase,
      // um pouco acima do centro: o HUD de baixo é mais alto que o de cima
      y: aplicacao.screen.height / 2 - (limites.y + limites.height / 2) * escalaBase - 28,
    }
  }

  function centralizarSala(imediato = false) {
    const base = enquadramentoBase()
    if (!base) return
    escalaAlvo = base.escala
    xAlvo = base.x
    yAlvo = base.y
    if (imediato) {
      mundo.scale.set(escalaAlvo)
      mundo.position.set(xAlvo, yAlvo)
    }
  }

  function aplicarZoom(fator: number, centroTela?: { x: number; y: number }) {
    const nova = Math.max(escalaBase * ZOOM_MIN, Math.min(escalaBase * ZOOM_MAX, escalaAlvo * fator))
    const cx = centroTela?.x ?? aplicacao.screen.width / 2
    const cy = centroTela?.y ?? aplicacao.screen.height / 2
    const mx = (cx - xAlvo) / escalaAlvo
    const my = (cy - yAlvo) / escalaAlvo
    escalaAlvo = nova
    xAlvo = cx - mx * nova
    yAlvo = cy - my * nova
  }

  function soltarSeguir() {
    if (!pontoSeguido) return
    pontoSeguido = null
    aoSoltarSeguir?.()
  }

  function deslocarPorTeclado(dx: number, dy: number) {
    soltarSeguir()
    xAlvo += dx
    yAlvo += dy
  }

  function aoRodaMouse(e: WheelEvent) {
    e.preventDefault()
    const rect = aplicacao.canvas.getBoundingClientRect()
    aplicarZoom(e.deltaY < 0 ? 1.13 : 1 / 1.13, { x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  function aoPressionar(e: FederatedPointerEvent) {
    arrastou = false
    if (e.button === 0 && !podeArrastarComEsquerdo()) return
    inicioArraste = { tela: { x: e.global.x, y: e.global.y }, alvo: { x: xAlvo, y: yAlvo } }
  }

  function aoMover(e: FederatedPointerEvent) {
    if (!inicioArraste) return
    const dx = e.global.x - inicioArraste.tela.x
    const dy = e.global.y - inicioArraste.tela.y
    if (!arrastou && Math.hypot(dx, dy) < LIMIAR_ARRASTE) return
    arrastou = true
    soltarSeguir()
    xAlvo = inicioArraste.alvo.x + dx
    yAlvo = inicioArraste.alvo.y + dy
  }

  function aoSoltar() {
    inicioArraste = null
  }

  function aoTick(t: Ticker) {
    if (pontoSeguido) {
      xAlvo = aplicacao.screen.width / 2 - pontoSeguido.x * escalaAlvo
      yAlvo = aplicacao.screen.height / 2 - (pontoSeguido.y - 48) * escalaAlvo
    }
    const k = 1 - Math.exp((-RIGIDEZ * t.deltaMS) / 1000)
    mundo.scale.set(mundo.scale.x + (escalaAlvo - mundo.scale.x) * k)
    mundo.x += (xAlvo - mundo.x) * k
    mundo.y += (yAlvo - mundo.y) * k
  }

  function aoRedimensionar() {
    if (!pontoSeguido) centralizarSala(false)
  }

  // botão direito arrasta a câmera — o menu do navegador por cima disso
  // só atrapalharia
  function semMenuDoNavegador(e: MouseEvent) {
    e.preventDefault()
  }

  centralizarSala(true)

  const canvas = aplicacao.canvas
  canvas.addEventListener('wheel', aoRodaMouse, { passive: false })
  canvas.addEventListener('contextmenu', semMenuDoNavegador)
  aplicacao.stage.on('pointerdown', aoPressionar)
  aplicacao.stage.on('pointermove', aoMover)
  aplicacao.stage.on('pointerup', aoSoltar)
  aplicacao.stage.on('pointerupoutside', aoSoltar)
  aplicacao.renderer.on('resize', aoRedimensionar)
  aplicacao.ticker.add(aoTick)

  return {
    centralizarSala,
    aplicarZoom,
    definirSeguirPonto: (p) => {
      pontoSeguido = p
    },
    deslocarPorTeclado,
    acabouDeArrastar: () => arrastou,
    destruir() {
      canvas.removeEventListener('wheel', aoRodaMouse)
      canvas.removeEventListener('contextmenu', semMenuDoNavegador)
      aplicacao.stage.off('pointerdown', aoPressionar)
      aplicacao.stage.off('pointermove', aoMover)
      aplicacao.stage.off('pointerup', aoSoltar)
      aplicacao.stage.off('pointerupoutside', aoSoltar)
      aplicacao.renderer.off('resize', aoRedimensionar)
      aplicacao.ticker.remove(aoTick)
    },
  }
}

// Ponto (no espaço do mundo) que a câmera mira quando segue um agente:
// um pouco acima do chão, na altura do peito.
export function pontoMundoDoSim(coluna: number, linha: number): { x: number; y: number } {
  return paraTela(coluna, linha, 0.35)
}
