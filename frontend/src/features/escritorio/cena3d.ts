import * as THREE from 'three'
import { AGENTES } from './agentes'
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
import { COR_PLUMBBOB_VERDE, type EstadoMundoSims } from './simulacao-sims'

// ---------------------------------------------------------------------------
// MOTOR 3D WEBGL COMPLETO ESTILO THE SIMS 4 (`cena3d.ts`)
//
// Implementa a perspectiva 3D real extraída de `Camera.ini` e
// `ThumbnailConfig.ini`:
//   - PerspectiveCamera (FOV 38°, TargetHeight 1.05m)
//   - Órbita 360° livre (Yaw) + Inclinação vertical (Pitch 18°..78°)
//   - Modos de Parede do The Sims 4 ('cortadas', 'altas', 'baixas')
//   - Vizinhança viva 3D (céu dinâmico conforme hora do dia, sol com sombras
//     suaves, gramado, rua, árvores e calçada)
//   - Personagens Sims 3D articulados + Móveis 3D com Raycasting interativo
// ---------------------------------------------------------------------------

export interface ProjecaoSimTela {
  id: string
  x: number
  y: number
  visivel: boolean
}

export interface OpcoesCena3D {
  aoClicarSim?: (simId: string, telaX: number, telaY: number) => void
  aoClicarMovelSimulacao?: (movel: MovelSala, telaX: number, telaY: number) => void
  aoClicarPorta?: (salaDestino: string) => void
  aoClicarPiso?: (coluna: number, linha: number, telaX: number, telaY: number) => void
  aoSelecionarMovelConstrucao?: (movelId: string) => void
  aoArrastarMovelConstrucao?: (movelId: string, novaColuna: number, novaLinha: number) => void
  aoDesativarSeguirCamera?: () => void
  aoAtualizarProjecoes?: (projecoes: Record<string, ProjecaoSimTela>) => void
}

export interface ControladorCena3D {
  sincronizarMundoSims: (mundo: EstadoMundoSims) => void
  sincronizarSala: (sala: SalaDados, selecionadoId: string | null, modoConstruir: boolean) => void
  definirModoParedes: (modo: ModoParedesSims) => void
  centralizarCamera: () => void
  aplicarZoom: (fator: number) => void
  girarCameraHorizontal: (deltaRad: number) => void
  inclinarCameraVertical: (deltaRad: number) => void
  deslocarCameraTeclado: (dx: number, dz: number) => void
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
  cena.fog = new THREE.FogExp2(0x87ceeb, 0.018)

  const larguraInicial = hospedeiro.clientWidth || window.innerWidth
  const alturaInicial = hospedeiro.clientHeight || window.innerHeight

  // PerspectiveCamera calibrada com Camera.ini (FOV = 38°)
  const camera = new THREE.PerspectiveCamera(38, larguraInicial / alturaInicial, 0.1, 120)

  const renderizador = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderizador.setSize(larguraInicial, alturaInicial)
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderizador.shadowMap.enabled = true
  renderizador.shadowMap.type = THREE.PCFSoftShadowMap
  renderizador.toneMapping = THREE.ACESFilmicToneMapping
  renderizador.toneMappingExposure = 1.08
  hospedeiro.appendChild(renderizador.domElement)

  // --- Iluminação Solar e Hemisférica (`LightPitch = 50, LightYaw = -75`) ---
  const luzHemisferica = new THREE.HemisphereLight(0xdbeafe, 0x4d7c3f, 0.85)
  cena.add(luzHemisferica)

  const luzSol = new THREE.DirectionalLight(0xfffbeb, 1.55)
  luzSol.position.set(9, 14, 10)
  luzSol.castShadow = true
  luzSol.shadow.mapSize.set(2048, 2048)
  luzSol.shadow.camera.near = 0.5
  luzSol.shadow.camera.far = 38
  const dSombra = 10
  luzSol.shadow.camera.left = -dSombra
  luzSol.shadow.camera.right = dSombra
  luzSol.shadow.camera.top = dSombra
  luzSol.shadow.camera.bottom = -dSombra
  luzSol.shadow.bias = -0.0005
  cena.add(luzSol)

  const luzPreenchimento = new THREE.DirectionalLight(0x93c5fd, 0.4)
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

  // Caixa de seleção verde 3D para o Modo Construir/Comprar
  const caixaSelecao3D = new THREE.BoxHelper(new THREE.Mesh(), 0x4ade80)
  caixaSelecao3D.visible = false
  cena.add(caixaSelecao3D)

  // Marcador de destino no chão quando o Sim ativo caminha
  const geoDestino = new THREE.RingGeometry(0.18, 0.25, 28)
  geoDestino.rotateX(-Math.PI / 2)
  const matDestino = new THREE.MeshBasicMaterial({
    color: COR_PLUMBBOB_VERDE,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  })
  const marcadorDestino3D = new THREE.Mesh(geoDestino, matDestino)
  marcadorDestino3D.position.y = 0.025
  marcadorDestino3D.visible = false
  cena.add(marcadorDestino3D)

  // Cria os 4 Personagens Sims 3D Articulados
  const personagens = new Map<string, PersonagemSim3D>()
  for (const ag of AGENTES) {
    const p3d = criarPersonagemSim3D(ag.id, ag.cor)
    personagens.set(ag.id, p3d)
    cena.add(p3d.grupoRaiz)
  }

  function reconstruirMoveis3D(sala: SalaDados) {
    const novaAssinatura = JSON.stringify(sala.moveis)
    if (novaAssinatura === assinaturaMoveisAnterior) {
      atualizarCaixaSelecao()
      return
    }
    assinaturaMoveisAnterior = novaAssinatura

    for (const m of malhasMoveis.values()) {
      grupoMoveis.remove(m)
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

  // --- Controle de Câmera 3D Estilo The Sims 4 (`Camera.ini`) ---
  const centroPadrao = new THREE.Vector3((colunas - 1) / 2, 0.55, (linhas - 1) / 2)
  const alvoCamera = centroPadrao.clone()
  const alvoCameraDesejado = centroPadrao.clone()

  let yawAlvo = Math.PI * 0.23   // ~41° diagonal clássica The Sims
  let pitchAlvo = 0.62          // ~35° de inclinação
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
    distanciaAlvo = Math.max(3.4, Math.min(22, distanciaAlvo / fator))
  }

  function girarCameraHorizontal(deltaRad: number) {
    yawAlvo += deltaRad
  }

  function inclinarCameraVertical(deltaRad: number) {
    pitchAlvo = Math.max(0.26, Math.min(1.36, pitchAlvo + deltaRad))
  }

  function deslocarCameraTeclado(dx: number, dz: number) {
    // Desloca no plano XZ relativo à orientação horizontal (yaw) da câmera!
    const frenteX = -Math.sin(yawAtual)
    const frenteZ = -Math.cos(yawAtual)
    const direitaX = Math.cos(yawAtual)
    const direitaZ = -Math.sin(yawAtual)

    alvoCameraDesejado.x += direitaX * dx + frenteX * dz
    alvoCameraDesejado.z += direitaZ * dx + frenteZ * dz
  }

  // --- Interação de Mouse (Órbita 3D, Pan, Raycasting e Drag de Móveis) ---
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

    // Botão direito (2) ou do meio (1) ou Alt+Clique -> Órbita 3D (Yaw + Pitch)
    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
      modoArrasteMouse = 'orbita'
      return
    }

    if (e.button !== 0) return

    // No Modo Construir, clicar num móvel 3D seleciona e permite arrastá-lo no piso
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

    // Atualiza cursor em hover
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

    if (moveuSignificativo || eraModo === 'orbita') return

    // Foi um clique limpo (tap)! Fazemos raycast na cena 3D:
    atualizarMouseNDC(e)
    raycaster.setFromCamera(mouseNDC, camera)

    if (modoConstruirAtivo) return

    // 1. Prioridade: Clicou num Sim 3D?
    const simClicado = encontrarSimSobRay()
    if (simClicado) {
      opcoes.aoClicarSim?.(simClicado, e.clientX, e.clientY)
      return
    }

    // 2. Clicou num Móvel / Objeto 3D?
    const movelClicadoId = encontrarMovelSobRay()
    if (movelClicadoId) {
      const movelDados = dadosSala.moveis.find((m) => m.id === movelClicadoId)
      if (movelDados) {
        if (movelDados.leva) {
          opcoes.aoClicarPorta?.(movelDados.leva)
        } else {
          opcoes.aoClicarMovelSimulacao?.(movelDados, e.clientX, e.clientY)
        }
        return
      }
    }

    // 3. Clicou no Piso 3D?
    const hitPiso = raycaster.intersectObject(loteVizinhanca.pisoInterativo, false)
    if (hitPiso.length > 0) {
      const pt = hitPiso[0].point
      const c = Math.max(0, Math.min(colunas - 1, pt.x))
      const l = Math.max(0, Math.min(linhas - 1, pt.z))
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
  let ultimoTempoMS = performance.now()
  let ultimoEnvioProjecaoMS = 0
  const vetorTemp = new THREE.Vector3()

  function atualizarIluminacaoRelogio(minutosDoDia: number) {
    const hora = (minutosDoDia / 60) % 24
    // Ciclo suave de cor do céu e intensidade solar
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
    ;(cena.background as THREE.Color).lerp(new THREE.Color(corCeu), 0.05)
    if (cena.fog instanceof THREE.FogExp2) {
      cena.fog.color.copy(cena.background as THREE.Color)
    }
    luzSol.intensity += (intensidadeSol - luzSol.intensity) * 0.05
  }

  function animar(agoraMS: number) {
    rafId = window.requestAnimationFrame(animar)
    const dt = Math.min(0.1, (agoraMS - ultimoTempoMS) / 1000)
    ultimoTempoMS = agoraMS
    const tempoSeg = agoraMS / 1000

    // 1. Se FollowCamera estiver ativo, segue suavemente o Sim ativo
    const simAtivo = mundoSims.sims[mundoSims.simAtivoId]
    if (mundoSims.seguirSimAtivo && simAtivo && !modoConstruirAtivo) {
      alvoCameraDesejado.set(simAtivo.coluna, 0.85, simAtivo.linha)
    }

    // 2. Interpola câmera (órbita esférica suave estilo Camera.ini)
    yawAtual += (yawAlvo - yawAtual) * 0.14
    pitchAtual += (pitchAlvo - pitchAtual) * 0.14
    distanciaAtual += (distanciaAlvo - distanciaAtual) * 0.14
    alvoCamera.lerp(alvoCameraDesejado, 0.14)

    const raioHorizontal = distanciaAtual * Math.cos(pitchAtual)
    camera.position.set(
      alvoCamera.x + Math.sin(yawAtual) * raioHorizontal,
      alvoCamera.y + distanciaAtual * Math.sin(pitchAtual),
      alvoCamera.z + Math.cos(yawAtual) * raioHorizontal,
    )
    camera.lookAt(alvoCamera)

    // 3. Atualiza corte automático das paredes (The Sims 4 Cutaway Walls)
    loteVizinhanca.atualizarModoParedes(modoParedes, camera.position, centroPadrao)
    loteVizinhanca.animarVizinhanca(tempoSeg)
    atualizarIluminacaoRelogio(mundoSims.minutosDoDia)

    // 4. Atualiza todos os Personagens Sims 3D e suas posturas / ossos
    for (const [id, p3d] of personagens.entries()) {
      const sim = mundoSims.sims[id]
      const movelAssento = dadosSala.moveis.find((m) => m.agente === id)
      const col = sim ? sim.coluna : (movelAssento?.coluna ?? 2)
      const lin = sim ? sim.linha : (movelAssento?.linha ?? 2)

      // Descobre para onde o Sim deve olhar (para outro Sim numa conversa, ou para a mesa/objeto)
      let olharPara: { x: number; z: number } | null = null
      if (sim?.interacaoAtual?.opcao.alvoSimId) {
        const outro = mundoSims.sims[sim.interacaoAtual.opcao.alvoSimId]
        if (outro) olharPara = { x: outro.coluna, z: outro.linha }
      } else if (sim?.postura.superficieId) {
        const sup = dadosSala.moveis.find((m) => m.id === sim.postura.superficieId)
        if (sup) {
          // Olha na direção para a qual a cadeira/móvel aponta ou para a mesa próxima
          const mesaProxima = dadosSala.moveis.find(
            (m) =>
              m.peca.startsWith('desk') &&
              Math.hypot(m.coluna - sup.coluna, m.linha - sup.linha) < 1.35,
          )
          if (mesaProxima) {
            olharPara = { x: mesaProxima.coluna, z: mesaProxima.linha }
          } else {
            const ang = direcaoParaAnguloY(sup.direcao)
            olharPara = { x: col + Math.sin(ang), z: lin + Math.cos(ang) }
          }
        }
      }

      p3d.atualizar(
        sim,
        id === mundoSims.simAtivoId,
        tempoSeg,
        dt,
        { x: col, z: lin },
        olharPara,
      )
    }

    // 5. Marcador de destino 3D no chão
    if (simAtivo && simAtivo.destinoColuna !== null && simAtivo.destinoLinha !== null) {
      marcadorDestino3D.visible = true
      marcadorDestino3D.position.set(simAtivo.destinoColuna, 0.025, simAtivo.destinoLinha)
      marcadorDestino3D.scale.setScalar(1 + Math.sin(tempoSeg * 7) * 0.16)
    } else {
      marcadorDestino3D.visible = false
    }

    renderizador.render(cena, camera)

    // 6. Projeta a posição da cabeça 3D de cada Sim para coordenadas de tela (para balões HTML)
    if (opcoes.aoAtualizarProjecoes && agoraMS - ultimoEnvioProjecaoMS > 50) {
      ultimoEnvioProjecaoMS = agoraMS
      const rect = renderizador.domElement.getBoundingClientRect()
      const projecoes: Record<string, ProjecaoSimTela> = {}
      for (const [id, p3d] of personagens.entries()) {
        p3d.obterPosicaoCabecaMundo(vetorTemp)
        vetorTemp.project(camera)
        const x = (vetorTemp.x * 0.5 + 0.5) * rect.width
        const y = (-(vetorTemp.y * 0.5) + 0.5) * rect.height
        projecoes[id] = {
          id,
          x: Math.round(x),
          y: Math.round(y),
          visivel: vetorTemp.z < 1 && x >= -100 && x <= rect.width + 100 && y >= -100 && y <= rect.height + 100,
        }
      }
      opcoes.aoAtualizarProjecoes(projecoes)
    }
  }

  rafId = window.requestAnimationFrame(animar)

  return {
    sincronizarMundoSims(novoMundo) {
      mundoSims = novoMundo
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
    definirModoParedes(modo) {
      modoParedes = modo
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
      renderizador.dispose()
      dom.remove()
    },
  }
}
