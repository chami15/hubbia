import * as THREE from 'three'
import type { AparenciaSimCAS } from './cas-sims'
import { PALETAS } from './sala'
import type { MovelSala, SalaDados } from './sala-dados'
import {
  criarLoteVizinhanca3D,
  criarMovel3D,
  direcaoParaAnguloY,
  posicionarMovel3D,
  type ModoParedesSims,
} from './moveis3d'
import { criarPersonagemSim3D, type PersonagemSim3D } from './personagem3d'
import { COR_NIVEL, type EstadoMundoSims } from './simulacao-sims'

// ---------------------------------------------------------------------------
// MUNDO 3D (three.js)
//
// Cena, câmera orbital, móveis, personagens e o LAÇO DE ANIMAÇÃO. O laço é
// o relógio de tudo: a cada quadro ele pede ao Escritorio o mundo simulado
// seguinte (`aoQuadro`), anima os personagens até ele, move as etiquetas
// do HUD e desenha. Uma batida só — antes o motor rodava num setInterval
// de 250ms à parte, e o boneco recebia posição nova 4x por segundo
// (andava aos trancos e alternava entre pose de andar e de parado).
//
// Paredes têm 3 modos (cortadas na frente da câmera, altas, baixas); porta
// abre sozinha quando alguém chega perto.
// ---------------------------------------------------------------------------

// Quão rápido a câmera alcança o alvo, por segundo. Era 0.14 POR QUADRO —
// a 144Hz a câmera ficava mais que o dobro mais rápida que a 60Hz.
const RIGIDEZ_CAMERA = 9

export interface OpcoesCena3D {
  aoClicarSim?: (simId: string, telaX: number, telaY: number) => void
  aoClicarMovelSimulacao?: (movel: MovelSala, telaX: number, telaY: number) => void
  aoClicarPorta?: (salaDestino: string) => void
  aoClicarPiso?: (coluna: number, linha: number, telaX: number, telaY: number) => void
  aoSelecionarMovelConstrucao?: (movelId: string) => void
  aoArrastarMovelConstrucao?: (movelId: string, novaColuna: number, novaLinha: number) => void
  aoDesativarSeguirCamera?: () => void
  // Chamado no começo de todo quadro com o dt real (≤0.5s); devolve o mundo já
  // avançado. É aqui que o motor (simulacao-sims.ts) roda.
  aoQuadro?: (dtSegundos: number) => EstadoMundoSims
  // Etiquetas (nome + balão) do HUD, por id de personagem. A cena só MOVE
  // esses elementos, todo quadro, direto no style — o conteúdo é do React.
  // Antes as posições iam pro estado do React a 20Hz: re-render do
  // Escritorio inteiro e etiqueta sempre um passo atrás do boneco.
  etiquetas?: () => Map<string, HTMLElement>
}

export interface ControladorCena3D {
  sincronizarMundoSims: (mundo: EstadoMundoSims) => void
  sincronizarSala: (sala: SalaDados, selecionadoId: string | null, modoConstruir: boolean) => void
  atualizarAparenciaSim3D: (simId: string, novaAparencia: AparenciaSimCAS) => void
  definirModoParedes: (modo: ModoParedesSims) => void
  centralizarCamera: () => void
  aplicarZoom: (fator: number) => void
  girarCameraHorizontal: (deltaRad: number) => void
  inclinarCameraVertical: (deltaRad: number) => void
  deslocarCameraTeclado: (dx: number, dz: number) => void
  // Com a maquete 2D na tela, o laço continua (o motor roda nele) mas não
  // desenha — antes o 3D seguia renderizando escondido.
  definirVisivel: (visivel: boolean) => void
  destruir: () => void
}

export function criarCena3D(
  hospedeiro: HTMLElement,
  salaInicial: SalaDados,
  mundoInicial: EstadoMundoSims,
  opcoes: OpcoesCena3D = {},
): ControladorCena3D {
  const cena = new THREE.Scene()
  cena.background = new THREE.Color(0x87ceeb)
  cena.fog = new THREE.FogExp2(0x87ceeb, 0.016)

  const larguraInicial = hospedeiro.clientWidth || window.innerWidth
  const alturaInicial = hospedeiro.clientHeight || window.innerHeight

  const camera = new THREE.PerspectiveCamera(38, larguraInicial / alturaInicial, 0.1, 120)

  const renderizador = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderizador.setSize(larguraInicial, alturaInicial)
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderizador.shadowMap.enabled = true
  // PCFSoft saiu do three; o PCF comum é o que ele já usava por baixo
  renderizador.shadowMap.type = THREE.PCFShadowMap
  renderizador.toneMapping = THREE.ACESFilmicToneMapping
  renderizador.toneMappingExposure = 1.08
  hospedeiro.appendChild(renderizador.domElement)

  // --- Luz: céu (hemisférica) + sol com sombra + preenchimento frio ---
  const luzHemisferica = new THREE.HemisphereLight(0xdbeafe, 0x4d7c3f, 0.88)
  cena.add(luzHemisferica)

  const luzSol = new THREE.DirectionalLight(0xfffbeb, 1.55)
  luzSol.position.set(9, 14, 10)
  luzSol.castShadow = true
  luzSol.shadow.mapSize.set(2048, 2048)
  luzSol.shadow.camera.near = 0.5
  luzSol.shadow.camera.far = 42
  const dSombra = 11
  luzSol.shadow.camera.left = -dSombra
  luzSol.shadow.camera.right = dSombra
  luzSol.shadow.camera.top = dSombra
  luzSol.shadow.camera.bottom = -dSombra
  luzSol.shadow.bias = -0.0005
  cena.add(luzSol)

  const luzPreenchimento = new THREE.DirectionalLight(0x93c5fd, 0.42)
  luzPreenchimento.position.set(-8, 7, -6)
  cena.add(luzPreenchimento)

  // --- Estado do Lote, Móveis e Sims 3D ---
  let dadosSala = salaInicial
  let mundoSims = mundoInicial
  let modoConstruirAtivo = false
  let movelSelecionadoId: string | null = null
  let modoParedes: ModoParedesSims = 'cortadas'

  const colunas = dadosSala.colunas || 7
  const linhas = dadosSala.linhas || 7
  const paleta = dadosSala.paleta ?? PALETAS.neutra

  const loteVizinhanca = criarLoteVizinhanca3D(colunas, linhas, paleta)
  cena.add(loteVizinhanca.grupo)

  const grupoMoveis = new THREE.Group()
  cena.add(grupoMoveis)
  const malhasMoveis = new Map<string, THREE.Group>()
  let assinaturaMoveisAnterior = ''

  const caixaSelecao3D = new THREE.BoxHelper(new THREE.Mesh(), 0x4ade80)
  caixaSelecao3D.visible = false
  cena.add(caixaSelecao3D)

  const geoDestino = new THREE.RingGeometry(0.18, 0.25, 28)
  geoDestino.rotateX(-Math.PI / 2)
  const matDestino = new THREE.MeshBasicMaterial({
    color: COR_NIVEL.bom.num,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  })
  const marcadorDestino3D = new THREE.Mesh(geoDestino, matDestino)
  marcadorDestino3D.position.y = 0.025
  marcadorDestino3D.visible = false
  cena.add(marcadorDestino3D)

  // Gerencia dinamicamente todos os Personagens Sims 3D (incluindo os criados no CAS)
  const personagens = new Map<string, PersonagemSim3D>()

  function garantirPersonagensSims(mundo: EstadoMundoSims) {
    for (const [id, sim] of Object.entries(mundo.sims)) {
      if (!personagens.has(id)) {
        const p3d = criarPersonagemSim3D(id, sim.cor)
        personagens.set(id, p3d)
        cena.add(p3d.grupoRaiz)
      }
    }
    for (const [id, p3d] of Array.from(personagens.entries())) {
      if (!mundo.sims[id]) {
        cena.remove(p3d.grupoRaiz)
        p3d.destruir()
        personagens.delete(id)
      }
    }
  }

  garantirPersonagensSims(mundoSims)

  function reconstruirMoveis3D(sala: SalaDados) {
    const novaAssinatura = JSON.stringify(sala.moveis)
    if (novaAssinatura === assinaturaMoveisAnterior) {
      atualizarCaixaSelecao()
      return
    }
    assinaturaMoveisAnterior = novaAssinatura

    // libera geometria/material de cada móvel antigo: cada um cria os seus,
    // e sem isso toda edição da sala deixava a versão anterior na GPU
    for (const m of malhasMoveis.values()) {
      grupoMoveis.remove(m)
      liberarObjeto(m)
    }
    malhasMoveis.clear()

    for (const movel of sala.moveis) {
      const m3d = criarMovel3D(movel)
      malhasMoveis.set(movel.id, m3d)
      grupoMoveis.add(m3d)
    }
    atualizarCaixaSelecao()
  }

  function atualizarCaixaSelecao() {
    if (!modoConstruirAtivo || !movelSelecionadoId) {
      caixaSelecao3D.visible = false
      return
    }
    const malha = malhasMoveis.get(movelSelecionadoId)
    if (!malha) {
      caixaSelecao3D.visible = false
      return
    }
    caixaSelecao3D.setFromObject(malha)
    caixaSelecao3D.visible = true
  }

  reconstruirMoveis3D(dadosSala)

  // --- Câmera orbital: giro livre, inclinação e distância, todos suavizados ---
  const centroPadrao = new THREE.Vector3((colunas - 1) / 2, 0.55, (linhas - 1) / 2)
  const alvoCamera = centroPadrao.clone()
  const alvoCameraDesejado = centroPadrao.clone()

  let yawAlvo = Math.PI * 0.23
  let pitchAlvo = 0.62
  let distanciaAlvo = Math.max(colunas, linhas) * 1.45

  let yawAtual = yawAlvo
  let pitchAtual = pitchAlvo
  let distanciaAtual = distanciaAlvo

  function centralizarCamera() {
    alvoCameraDesejado.set((colunas - 1) / 2, 0.55, (linhas - 1) / 2)
    yawAlvo = Math.PI * 0.23
    pitchAlvo = 0.62
    distanciaAlvo = Math.max(colunas, linhas) * 1.45
  }

  function aplicarZoom(fator: number) {
    distanciaAlvo = Math.max(3.4, Math.min(24, distanciaAlvo / fator))
  }

  function girarCameraHorizontal(deltaRad: number) {
    yawAlvo += deltaRad
  }

  function inclinarCameraVertical(deltaRad: number) {
    pitchAlvo = Math.max(0.26, Math.min(1.36, pitchAlvo + deltaRad))
  }

  function deslocarCameraTeclado(dx: number, dz: number) {
    const frenteX = -Math.sin(yawAtual)
    const frenteZ = -Math.cos(yawAtual)
    const direitaX = Math.cos(yawAtual)
    const direitaZ = -Math.sin(yawAtual)

    alvoCameraDesejado.x += direitaX * dx + frenteX * dz
    alvoCameraDesejado.z += direitaZ * dx + frenteZ * dz
  }

  // --- Interação de Mouse ---
  const raycaster = new THREE.Raycaster()
  const mouseNDC = new THREE.Vector2()
  const planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  let modoArrasteMouse: 'nenhum' | 'orbita' | 'pan' | 'movel' = 'nenhum'
  let movelArrastadoId: string | null = null
  let inicioMouseX = 0
  let inicioMouseY = 0
  let moveuSignificativo = false

  function atualizarMouseNDC(e: PointerEvent | MouseEvent) {
    const rect = renderizador.domElement.getBoundingClientRect()
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  function encontrarSimSobRay(): string | null {
    const raizesSims = Array.from(personagens.values()).map((p) => p.grupoRaiz)
    const hits = raycaster.intersectObjects(raizesSims, true)
    if (hits.length === 0) return null
    let obj: THREE.Object3D | null = hits[0].object
    while (obj) {
      if (obj.name.startsWith('sim-')) return obj.name.slice(4)
      obj = obj.parent
    }
    return null
  }

  function encontrarMovelSobRay(): string | null {
    const hits = raycaster.intersectObjects(grupoMoveis.children, true)
    if (hits.length === 0) return null
    let obj: THREE.Object3D | null = hits[0].object
    while (obj) {
      if (obj.userData?.movelId) return obj.userData.movelId as string
      obj = obj.parent
    }
    return null
  }

  function aoPointerDown(e: PointerEvent) {
    atualizarMouseNDC(e)
    raycaster.setFromCamera(mouseNDC, camera)
    inicioMouseX = e.clientX
    inicioMouseY = e.clientY
    moveuSignificativo = false

    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
      modoArrasteMouse = 'orbita'
      return
    }

    if (e.button !== 0) return

    if (modoConstruirAtivo) {
      const mId = encontrarMovelSobRay()
      if (mId) {
        movelSelecionadoId = mId
        movelArrastadoId = mId
        modoArrasteMouse = 'movel'
        opcoes.aoSelecionarMovelConstrucao?.(mId)
        atualizarCaixaSelecao()
        return
      }
    }

    modoArrasteMouse = 'pan'
  }

  function aoPointerMove(e: PointerEvent) {
    const dx = e.clientX - inicioMouseX
    const dy = e.clientY - inicioMouseY
    if (Math.hypot(dx, dy) > 5) moveuSignificativo = true

    if (modoArrasteMouse === 'orbita') {
      yawAlvo -= dx * 0.0075
      pitchAlvo = Math.max(0.24, Math.min(1.38, pitchAlvo + dy * 0.006))
      inicioMouseX = e.clientX
      inicioMouseY = e.clientY
      return
    }

    if (modoArrasteMouse === 'pan' && moveuSignificativo) {
      if (mundoSims.seguirSimAtivo) opcoes.aoDesativarSeguirCamera?.()
      const escalaPan = distanciaAtual * 0.0014
      deslocarCameraTeclado(-dx * escalaPan, dy * escalaPan)
      inicioMouseX = e.clientX
      inicioMouseY = e.clientY
      return
    }

    if (modoArrasteMouse === 'movel' && movelArrastadoId) {
      atualizarMouseNDC(e)
      raycaster.setFromCamera(mouseNDC, camera)
      const pontoChao = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(planoChao, pontoChao)) {
        const cNova = Math.max(-0.4, Math.min(colunas - 0.4, Number(pontoChao.x.toFixed(2))))
        const lNova = Math.max(-0.4, Math.min(linhas - 0.4, Number(pontoChao.z.toFixed(2))))
        const m3d = malhasMoveis.get(movelArrastadoId)
        if (m3d) {
          m3d.position.x = cNova
          m3d.position.z = lNova
          atualizarCaixaSelecao()
        }
        opcoes.aoArrastarMovelConstrucao?.(movelArrastadoId, cNova, lNova)
      }
      return
    }

    // hover só com o ponteiro EM CIMA do canvas: o pointermove é da janela,
    // e raycast em toda a cena a cada movimento sobre o HUD era custo à toa
    if (e.target !== renderizador.domElement) return
    atualizarMouseNDC(e)
    raycaster.setFromCamera(mouseNDC, camera)
    if (!modoConstruirAtivo) {
      const simHover = encontrarSimSobRay()
      const movelHover = encontrarMovelSobRay()
      renderizador.domElement.style.cursor = simHover || movelHover ? 'pointer' : 'grab'
    } else {
      const movelHover = encontrarMovelSobRay()
      renderizador.domElement.style.cursor = movelHover ? 'move' : 'grab'
    }
  }

  function aoPointerUp(e: PointerEvent) {
    const eraModo = modoArrasteMouse
    modoArrasteMouse = 'nenhum'
    movelArrastadoId = null

    // o pointerup é ouvido na janela inteira (pra arraste que sai do canvas);
    // gesto que NÃO começou no canvas — clique num botão do HUD — não é
    // clique na cena. Antes, clicar num botão abria o menu do que estivesse
    // atrás dele.
    if (eraModo === 'nenhum' || moveuSignificativo || eraModo === 'orbita') return

    atualizarMouseNDC(e)
    raycaster.setFromCamera(mouseNDC, camera)

    if (modoConstruirAtivo) return

    const simClicado = encontrarSimSobRay()
    if (simClicado) {
      opcoes.aoClicarSim?.(simClicado, e.clientX, e.clientY)
      return
    }

    const movelClicadoId = encontrarMovelSobRay()
    if (movelClicadoId) {
      const movelDados = dadosSala.moveis.find((m) => m.id === movelClicadoId)
      if (movelDados) {
        // Abre o Pie Menu mesmo para portas (permitindo escolher entre viajar de sala ou sair para a rua!)
        opcoes.aoClicarMovelSimulacao?.(movelDados, e.clientX, e.clientY)
        return
      }
    }

    const hitPiso = raycaster.intersectObject(loteVizinhanca.pisoInterativo, false)
    if (hitPiso.length > 0) {
      const pt = hitPiso[0].point
      const c = Math.max(-0.8, Math.min(colunas + 0.8, pt.x))
      const l = Math.max(-0.8, Math.min(linhas + 1.8, pt.z))
      opcoes.aoClicarPiso?.(c, l, e.clientX, e.clientY)
    }
  }

  function aoWheel(e: WheelEvent) {
    e.preventDefault()
    const fator = e.deltaY < 0 ? 1.14 : 1 / 1.14
    aplicarZoom(fator)
  }

  function aoContextMenu(e: MouseEvent) {
    e.preventDefault()
  }

  function aoRedimensionar() {
    const w = hospedeiro.clientWidth || window.innerWidth
    const h = hospedeiro.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderizador.setSize(w, h)
  }

  const dom = renderizador.domElement
  dom.addEventListener('pointerdown', aoPointerDown)
  window.addEventListener('pointermove', aoPointerMove)
  window.addEventListener('pointerup', aoPointerUp)
  dom.addEventListener('wheel', aoWheel, { passive: false })
  dom.addEventListener('contextmenu', aoContextMenu)
  window.addEventListener('resize', aoRedimensionar)

  // --- Loop de Animação 3D (60fps) ---
  let rafId = 0
  let visivel = true
  let ultimoTempoMS = performance.now()
  const vetorTemp = new THREE.Vector3()

  const corCeuAlvo = new THREE.Color()
  function atualizarIluminacaoRelogio(minutosDoDia: number, k: number) {
    const hora = (minutosDoDia / 60) % 24
    let corCeu = 0x87ceeb
    let intensidadeSol = 1.55
    if (hora < 6 || hora >= 20.5) {
      corCeu = 0x0f172a
      intensidadeSol = 0.35
    } else if (hora < 8.5) {
      corCeu = 0xfdba74
      intensidadeSol = 1.1
    } else if (hora >= 17.5) {
      corCeu = 0xfb923c
      intensidadeSol = 1.05
    }
    ;(cena.background as THREE.Color).lerp(corCeuAlvo.setHex(corCeu), k)
    if (cena.fog instanceof THREE.FogExp2) {
      cena.fog.color.copy(cena.background as THREE.Color)
    }
    luzSol.intensity += (intensidadeSol - luzSol.intensity) * k
  }

  function animarPortasProximidade(dt: number) {
    const listaSims = Object.values(mundoSims.sims)
    for (const movel of dadosSala.moveis) {
      if (!movel.peca.startsWith('doorway') && !movel.leva) continue
      const m3d = malhasMoveis.get(movel.id)
      if (!m3d) continue
      const pivo = m3d.getObjectByName('folhaPortaPivo')
      if (!pivo) continue

      const algumPerto = listaSims.some(
        (s) => Math.hypot(s.coluna - movel.coluna, s.linha - movel.linha) < 1.35,
      )
      const angAlvo = algumPerto ? -Math.PI * 0.62 : 0
      pivo.rotation.y += (angAlvo - pivo.rotation.y) * Math.min(1, dt * 8)
    }
  }

  function animar(agoraMS: number) {
    rafId = window.requestAnimationFrame(animar)
    // o motor recebe o tempo real (até meio segundo — aba que volta do
    // segundo plano não pode "pular" minutos); a animação, no máximo 0.1s
    const dtReal = Math.min(0.5, (agoraMS - ultimoTempoMS) / 1000)
    const dt = Math.min(0.1, dtReal)
    ultimoTempoMS = agoraMS
    const tempoSeg = agoraMS / 1000

    if (opcoes.aoQuadro) {
      mundoSims = opcoes.aoQuadro(dtReal)
      garantirPersonagensSims(mundoSims)
    }

    if (!visivel) return

    const simAtivo = mundoSims.sims[mundoSims.simAtivoId]
    if (mundoSims.seguirSimAtivo && simAtivo && !modoConstruirAtivo) {
      alvoCameraDesejado.set(simAtivo.coluna, 0.85, simAtivo.linha)
    }

    const kCamera = 1 - Math.exp(-RIGIDEZ_CAMERA * dt)
    yawAtual += (yawAlvo - yawAtual) * kCamera
    pitchAtual += (pitchAlvo - pitchAtual) * kCamera
    distanciaAtual += (distanciaAlvo - distanciaAtual) * kCamera
    alvoCamera.lerp(alvoCameraDesejado, kCamera)

    const raioHorizontal = distanciaAtual * Math.cos(pitchAtual)
    camera.position.set(
      alvoCamera.x + Math.sin(yawAtual) * raioHorizontal,
      alvoCamera.y + distanciaAtual * Math.sin(pitchAtual),
      alvoCamera.z + Math.cos(yawAtual) * raioHorizontal,
    )
    camera.lookAt(alvoCamera)

    loteVizinhanca.atualizarModoParedes(modoParedes, camera.position, centroPadrao)
    loteVizinhanca.animarVizinhanca(tempoSeg)
    atualizarIluminacaoRelogio(mundoSims.minutosDoDia, 1 - Math.exp(-3 * dt))
    animarPortasProximidade(dt)

    for (const [id, p3d] of personagens.entries()) {
      const sim = mundoSims.sims[id]
      if (!sim) continue

      let olharPara: { x: number; z: number } | null = null
      if (sim.interacaoAtual?.opcao.alvoSimId) {
        const outro = mundoSims.sims[sim.interacaoAtual.opcao.alvoSimId]
        if (outro) olharPara = { x: outro.coluna, z: outro.linha }
      } else if (sim.postura.superficieId) {
        const sup = dadosSala.moveis.find((m) => m.id === sim.postura.superficieId)
        if (sup) {
          const mesaProxima = dadosSala.moveis.find(
            (m) =>
              m.peca.startsWith('desk') &&
              Math.hypot(m.coluna - sup.coluna, m.linha - sup.linha) < 1.35,
          )
          if (mesaProxima) {
            olharPara = { x: mesaProxima.coluna, z: mesaProxima.linha }
          } else {
            const ang = direcaoParaAnguloY(sup.direcao)
            olharPara = { x: sim.coluna + Math.sin(ang), z: sim.linha + Math.cos(ang) }
          }
        }
      }

      p3d.atualizar(
        sim,
        id === mundoSims.simAtivoId,
        tempoSeg,
        dt,
        { x: sim.coluna, z: sim.linha },
        olharPara,
      )
    }

    if (simAtivo && simAtivo.destinoColuna !== null && simAtivo.destinoLinha !== null) {
      marcadorDestino3D.visible = true
      marcadorDestino3D.position.set(simAtivo.destinoColuna, 0.025, simAtivo.destinoLinha)
      marcadorDestino3D.scale.setScalar(1 + Math.sin(tempoSeg * 7) * 0.16)
    } else {
      marcadorDestino3D.visible = false
    }

    renderizador.render(cena, camera)

    posicionarEtiquetas()
  }

  // Cabeça de cada personagem → pixel da tela, aplicado direto no elemento.
  // `translate3d` em vez de left/top: só compõe, não refaz layout.
  function posicionarEtiquetas() {
    const etiquetas = opcoes.etiquetas?.()
    if (!etiquetas || etiquetas.size === 0) return
    const largura = renderizador.domElement.clientWidth
    const altura = renderizador.domElement.clientHeight
    for (const [id, p3d] of personagens) {
      const el = etiquetas.get(id)
      if (!el) continue
      p3d.obterPosicaoCabecaMundo(vetorTemp)
      vetorTemp.project(camera)
      const x = (vetorTemp.x * 0.5 + 0.5) * largura
      const y = (-vetorTemp.y * 0.5 + 0.5) * altura
      const visivel = vetorTemp.z < 1 && x > -120 && x < largura + 120 && y > -120 && y < altura + 120
      el.style.visibility = visivel ? 'visible' : 'hidden'
      if (visivel) el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    }
  }

  rafId = window.requestAnimationFrame(animar)

  return {
    sincronizarMundoSims(novoMundo) {
      mundoSims = novoMundo
      garantirPersonagensSims(novoMundo)
    },
    sincronizarSala(novaSala, selecionadoId, modoConstruir) {
      dadosSala = novaSala
      movelSelecionadoId = selecionadoId
      modoConstruirAtivo = modoConstruir
      reconstruirMoveis3D(novaSala)
      for (const m of novaSala.moveis) {
        const m3d = malhasMoveis.get(m.id)
        if (m3d) posicionarMovel3D(m3d, m)
      }
      atualizarCaixaSelecao()
    },
    atualizarAparenciaSim3D(simId, novaAparencia) {
      const p3d = personagens.get(simId)
      if (p3d) p3d.aplicarAparenciaCAS(novaAparencia)
    },
    definirModoParedes(modo) {
      modoParedes = modo
    },
    definirVisivel(v) {
      visivel = v
      if (v) aoRedimensionar()
    },
    centralizarCamera,
    aplicarZoom,
    girarCameraHorizontal,
    inclinarCameraVertical,
    deslocarCameraTeclado,
    destruir() {
      window.cancelAnimationFrame(rafId)
      dom.removeEventListener('pointerdown', aoPointerDown)
      window.removeEventListener('pointermove', aoPointerMove)
      window.removeEventListener('pointerup', aoPointerUp)
      dom.removeEventListener('wheel', aoWheel)
      dom.removeEventListener('contextmenu', aoContextMenu)
      window.removeEventListener('resize', aoRedimensionar)
      for (const p of personagens.values()) p.destruir()
      liberarObjeto(cena)
      renderizador.dispose()
      dom.remove()
    },
  }
}

function liberarObjeto(raiz: THREE.Object3D) {
  raiz.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.dispose()
    // textura não: vem do cache compartilhado de texturas3d.ts
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) m.dispose()
  })
}
