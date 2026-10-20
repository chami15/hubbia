import * as THREE from 'three'
import {
  calcularCorPlumbBob,
  COR_PLUMBBOB_VERDE,
  type EstadoSim,
} from './simulacao-sims'

// ---------------------------------------------------------------------------
// PERSONAGEM 3D ARTICULADO ESTILO THE SIMS 4
//
// Substitui as fotos 2D estáticas por um modelo humanoide 3D completo com
// esqueleto hierárquico (inspirado no rig de The Sims 4: Pelvis -> Spine ->
// Chest -> Neck -> Head + Clavicles/UpperArms/Forearms/Hands + Thighs/Calves/Feet),
// expressões faciais (piscar, boca articulada na fala, sobrancelhas por humor),
// acessórios 3D na mão (xícara de café, livro aberto, tablet luminoso),
// cristal PlumbBob 3D facetado com PointLight e máquina de estados de animação
// corporal (caminhada bípede, digitação sentado, descanso no sofá, gole de café,
// leitura, gesticulação social e reações emocionais).
// ---------------------------------------------------------------------------

export interface ArticulacoesSim3D {
  raiz: THREE.Group
  pelve: THREE.Group
  coluna: THREE.Group
  peito: THREE.Group
  pescoco: THREE.Group
  cabeca: THREE.Group
  olhoEsq: THREE.Mesh
  olhoDir: THREE.Mesh
  sobrancelhaEsq: THREE.Mesh
  sobrancelhaDir: THREE.Mesh
  boca: THREE.Mesh
  ombroEsq: THREE.Group
  antebracoEsq: THREE.Group
  maoEsq: THREE.Group
  ombroDir: THREE.Group
  antebracoDir: THREE.Group
  maoDir: THREE.Group
  coxaEsq: THREE.Group
  panturrilhaEsq: THREE.Group
  coxaDir: THREE.Group
  panturrilhaDir: THREE.Group
  propCafe: THREE.Group
  propLivro: THREE.Group
  propTablet: THREE.Group
  plumbBobGrupo: THREE.Group
  plumbBobMesh: THREE.Mesh
  plumbBobHalo: THREE.Mesh
  plumbBobLuz: THREE.PointLight
  anelSelecaoChao: THREE.Mesh
}

export interface PersonagemSim3D {
  id: string
  grupoRaiz: THREE.Group
  articulacoes: ArticulacoesSim3D
  anguloAtualY: number
  atualizar: (
    sim: EstadoSim | undefined,
    ativo: boolean,
    tempoSegundos: number,
    deltaSegundos: number,
    posicaoMundo: { x: number; z: number },
    direcaoOlhar?: { x: number; z: number } | null,
  ) => void
  obterPosicaoCabecaMundo: (alvo: THREE.Vector3) => THREE.Vector3
  destruir: () => void
}

interface EstiloVisualSim3D {
  tomPele: number
  corCabelo: number
  corRoupaPrincipal: number
  corRoupaSecundaria: number
  corCalca: number
  corSapato: number
  estiloCabelo: 'executivo' | 'coque' | 'rabo_cavalo' | 'moderno'
  oculos: boolean
  headset: boolean
}

const ESTILOS_POR_SIM: Record<string, EstiloVisualSim3D> = {
  cifra: {
    tomPele: 0xf1c29b,
    corCabelo: 0x271c15,
    corRoupaPrincipal: 0x16a34a, // Blazer verde esmeralda Cifra
    corRoupaSecundaria: 0xf8fafc, // Camisa social clara
    corCalca: 0x1e293b,
    corSapato: 0x0f172a,
    estiloCabelo: 'executivo',
    oculos: true,
    headset: false,
  },
  agenda: {
    tomPele: 0xf5cba7,
    corCabelo: 0x5c3317,
    corRoupaPrincipal: 0x2563eb, // Cardigã/blazer azul Agenda
    corRoupaSecundaria: 0xe0f2fe,
    corCalca: 0x334155,
    corSapato: 0x1e293b,
    estiloCabelo: 'coque',
    oculos: false,
    headset: false,
  },
  vita: {
    tomPele: 0xe5a97c,
    corCabelo: 0x3b1f12,
    corRoupaPrincipal: 0xf97316, // Jaqueta esportiva coral Vita
    corRoupaSecundaria: 0xffedd5,
    corCalca: 0x1f2937,
    corSapato: 0xf8fafc,
    estiloCabelo: 'rabo_cavalo',
    oculos: false,
    headset: false,
  },
  norte: {
    tomPele: 0xebbd96,
    corCabelo: 0x18181b,
    corRoupaPrincipal: 0x0891b2, // Moletom tech ciano Norte
    corRoupaSecundaria: 0x0f172a,
    corCalca: 0x1e293b,
    corSapato: 0x0f172a,
    estiloCabelo: 'moderno',
    oculos: false,
    headset: true,
  },
}

function habilitarSombraRecursivo(obj: THREE.Object3D) {
  obj.traverse((filho) => {
    if (filho instanceof THREE.Mesh) {
      filho.castShadow = true
      filho.receiveShadow = true
    }
  })
}

export function criarPersonagemSim3D(agenteId: string, corIdentidade: number): PersonagemSim3D {
  const estilo = ESTILOS_POR_SIM[agenteId] ?? {
    tomPele: 0xf1c29b,
    corCabelo: 0x271c15,
    corRoupaPrincipal: corIdentidade,
    corRoupaSecundaria: 0xf8fafc,
    corCalca: 0x1e293b,
    corSapato: 0x0f172a,
    estiloCabelo: 'executivo',
    oculos: false,
    headset: false,
  }

  const matPele = new THREE.MeshStandardMaterial({ color: estilo.tomPele, roughness: 0.55 })
  const matCabelo = new THREE.MeshStandardMaterial({ color: estilo.corCabelo, roughness: 0.65 })
  const matRoupa = new THREE.MeshStandardMaterial({ color: estilo.corRoupaPrincipal, roughness: 0.48 })
  const matCamisa = new THREE.MeshStandardMaterial({ color: estilo.corRoupaSecundaria, roughness: 0.5 })
  const matCalca = new THREE.MeshStandardMaterial({ color: estilo.corCalca, roughness: 0.6 })
  const matSapato = new THREE.MeshStandardMaterial({ color: estilo.corSapato, roughness: 0.4 })
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3 })
  const matBoca = new THREE.MeshStandardMaterial({ color: 0xb94a48, roughness: 0.4 })

  const grupoRaiz = new THREE.Group()
  grupoRaiz.name = `sim-${agenteId}`

  // Anel de seleção luminoso no chão (estilo The Sims 4)
  const geoAnel = new THREE.RingGeometry(0.28, 0.35, 32)
  geoAnel.rotateX(-Math.PI / 2)
  const matAnel = new THREE.MeshBasicMaterial({
    color: COR_PLUMBBOB_VERDE,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  })
  const anelSelecaoChao = new THREE.Mesh(geoAnel, matAnel)
  anelSelecaoChao.position.y = 0.015
  grupoRaiz.add(anelSelecaoChao)

  // --- PELVE (b__Pelvis__, altura padrão em pé = 0.56m) ---
  const pelve = new THREE.Group()
  pelve.position.set(0, 0.56, 0)
  grupoRaiz.add(pelve)

  const malhaQuadril = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.19), matCalca)
  pelve.add(malhaQuadril)

  // --- COLUNA E PEITO (b__Spine0__ / b__Spine1__) ---
  const coluna = new THREE.Group()
  coluna.position.set(0, 0.06, 0)
  pelve.add(coluna)

  const peito = new THREE.Group()
  peito.position.set(0, 0.02, 0)
  coluna.add(peito)

  const malhaTorso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.2), matRoupa)
  malhaTorso.position.set(0, 0.19, 0)
  peito.add(malhaTorso)

  // Detalhe da camisa / gola no peito
  const malhaCamisa = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.21), matCamisa)
  malhaCamisa.position.set(0, 0.2, 0.005)
  peito.add(malhaCamisa)

  // --- PESCOÇO E CABEÇA (b__Neck__ / b__Head__) ---
  const pescoco = new THREE.Group()
  pescoco.position.set(0, 0.39, 0)
  peito.add(pescoco)

  const malhaPescoco = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 12), matPele)
  malhaPescoco.position.set(0, 0.03, 0)
  pescoco.add(malhaPescoco)

  const cabeca = new THREE.Group()
  cabeca.position.set(0, 0.07, 0)
  pescoco.add(cabeca)

  const malhaCabeca = new THREE.Mesh(new THREE.SphereGeometry(0.155, 22, 20), matPele)
  malhaCabeca.scale.set(0.95, 1.08, 0.96)
  malhaCabeca.position.set(0, 0.14, 0)
  cabeca.add(malhaCabeca)

  // Nariz 3D sutil
  const malhaNariz = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), matPele)
  malhaNariz.rotation.x = Math.PI / 2
  malhaNariz.position.set(0, 0.135, 0.155)
  cabeca.add(malhaNariz)

  // Olhos, sobrancelhas e boca
  const geoOlho = new THREE.SphereGeometry(0.021, 10, 10)
  const olhoEsq = new THREE.Mesh(geoOlho, matEscuro)
  olhoEsq.position.set(-0.05, 0.16, 0.138)
  const olhoDir = new THREE.Mesh(geoOlho, matEscuro)
  olhoDir.position.set(0.05, 0.16, 0.138)
  cabeca.add(olhoEsq, olhoDir)

  const geoSobrancelha = new THREE.BoxGeometry(0.044, 0.01, 0.012)
  const sobrancelhaEsq = new THREE.Mesh(geoSobrancelha, matCabelo)
  sobrancelhaEsq.position.set(-0.05, 0.195, 0.142)
  const sobrancelhaDir = new THREE.Mesh(geoSobrancelha, matCabelo)
  sobrancelhaDir.position.set(0.05, 0.195, 0.142)
  cabeca.add(sobrancelhaEsq, sobrancelhaDir)

  const boca = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.015), matBoca)
  boca.position.set(0, 0.092, 0.142)
  cabeca.add(boca)

  // Cabelo estilizado em 3D por personagem
  const topoCabelo = new THREE.Mesh(
    new THREE.SphereGeometry(0.162, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    matCabelo,
  )
  topoCabelo.position.set(0, 0.155, -0.008)
  cabeca.add(topoCabelo)

  if (estilo.estiloCabelo === 'coque') {
    const coque = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 12), matCabelo)
    coque.position.set(0, 0.26, -0.11)
    cabeca.add(coque)
  } else if (estilo.estiloCabelo === 'rabo_cavalo') {
    const rabo = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 10), matCabelo)
    rabo.rotation.x = -0.6
    rabo.position.set(0, 0.16, -0.17)
    cabeca.add(rabo)
  } else if (estilo.estiloCabelo === 'moderno') {
    const topete = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.12), matCabelo)
    topete.position.set(0, 0.28, 0.05)
    topete.rotation.x = -0.2
    cabeca.add(topete)
  }

  // Óculos 3D (Cifra)
  if (estilo.oculos) {
    const aroEsq = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0045, 8, 16), matEscuro)
    aroEsq.position.set(-0.05, 0.16, 0.148)
    const aroDir = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0045, 8, 16), matEscuro)
    aroDir.position.set(0.05, 0.16, 0.148)
    const ponte = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.005, 0.005), matEscuro)
    ponte.position.set(0, 0.165, 0.148)
    cabeca.add(aroEsq, aroDir, ponte)
  }

  // Headset 3D (Norte)
  if (estilo.headset) {
    const arco = new THREE.Mesh(
      new THREE.TorusGeometry(0.165, 0.012, 8, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.4, roughness: 0.3 }),
    )
    arco.position.set(0, 0.15, 0)
    cabeca.add(arco)
  }

  // --- BRAÇOS ARTICULADOS (Ombro -> Braço -> Antebraço -> Mão) ---
  function criarBraco(lado: -1 | 1) {
    const ombro = new THREE.Group()
    ombro.position.set(lado * 0.2, 0.34, 0)
    peito.add(ombro)

    const malhaBracoSup = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.16, 8, 12), matRoupa)
    malhaBracoSup.position.set(0, -0.1, 0)
    ombro.add(malhaBracoSup)

    const antebraco = new THREE.Group()
    antebraco.position.set(0, -0.2, 0)
    ombro.add(antebraco)

    const malhaAntebraco = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.15, 8, 12), matPele)
    malhaAntebraco.position.set(0, -0.09, 0)
    antebraco.add(malhaAntebraco)

    const mao = new THREE.Group()
    mao.position.set(0, -0.19, 0)
    antebraco.add(mao)

    const malhaMao = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 10), matPele)
    mao.add(malhaMao)

    return { ombro, antebraco, mao }
  }

  const bracoEsq = criarBraco(-1)
  const bracoDir = criarBraco(1)

  // --- OBJETOS CARREGADOS NAS MÃOS (PostureAspectCarry) ---
  // 1. Xícara de Café Expresso na mão direita
  const propCafe = new THREE.Group()
  const caneca = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.036, 0.09, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  )
  const liquidoCafe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.037, 0.037, 0.01, 12),
    new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.3 }),
  )
  liquidoCafe.position.y = 0.042
  propCafe.add(caneca, liquidoCafe)
  propCafe.position.set(0, -0.02, 0.05)
  propCafe.visible = false
  bracoDir.mao.add(propCafe)

  // 2. Livro Técnico na mão esquerda
  const propLivro = new THREE.Group()
  const capaLivro = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.03, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4 }),
  )
  const paginasLivro = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.024, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 }),
  )
  paginasLivro.position.y = 0.005
  propLivro.add(capaLivro, paginasLivro)
  propLivro.position.set(0.04, -0.02, 0.06)
  propLivro.visible = false
  bracoEsq.mao.add(propLivro)

  // 3. Tablet Luminoso na mão esquerda
  const propTablet = new THREE.Group()
  const corpoTablet = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.015, 0.11),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.3 }),
  )
  const telaTablet = new THREE.Mesh(
    new THREE.BoxGeometry(0.135, 0.017, 0.095),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
    }),
  )
  propTablet.add(corpoTablet, telaTablet)
  propTablet.position.set(0.04, -0.01, 0.06)
  propTablet.visible = false
  bracoEsq.mao.add(propTablet)

  // --- PERNAS ARTICULADAS (Coxa -> Panturrilha -> Pé) ---
  function criarPerna(lado: -1 | 1) {
    const coxa = new THREE.Group()
    coxa.position.set(lado * 0.085, -0.04, 0)
    pelve.add(coxa)

    const malhaCoxa = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 8, 12), matCalca)
    malhaCoxa.position.set(0, -0.12, 0)
    coxa.add(malhaCoxa)

    const panturrilha = new THREE.Group()
    panturrilha.position.set(0, -0.25, 0)
    coxa.add(panturrilha)

    const malhaPanturrilha = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.18, 8, 12), matCalca)
    malhaPanturrilha.position.set(0, -0.12, 0)
    panturrilha.add(malhaPanturrilha)

    const pe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.17), matSapato)
    pe.position.set(0, -0.24, 0.035)
    panturrilha.add(pe)

    return { coxa, panturrilha }
  }

  const pernaEsq = criarPerna(-1)
  const pernaDir = criarPerna(1)

  // --- CRISTAL PLUMBBOB 3D REAL + POINT LIGHT (`Default.ini` [PlumbBob]) ---
  const plumbBobGrupo = new THREE.Group()
  plumbBobGrupo.position.set(0, 1.56, 0)
  grupoRaiz.add(plumbBobGrupo)

  const geoPlumb = new THREE.OctahedronGeometry(0.11, 0)
  geoPlumb.scale(0.75, 1.55, 0.75)
  const matPlumb = new THREE.MeshStandardMaterial({
    color: COR_PLUMBBOB_VERDE,
    emissive: COR_PLUMBBOB_VERDE,
    emissiveIntensity: 0.65,
    roughness: 0.15,
    metalness: 0.25,
    flatShading: true,
  })
  const plumbBobMesh = new THREE.Mesh(geoPlumb, matPlumb)
  plumbBobGrupo.add(plumbBobMesh)

  const matHalo = new THREE.MeshBasicMaterial({
    color: COR_PLUMBBOB_VERDE,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  })
  const plumbBobHalo = new THREE.Mesh(geoPlumb.clone().scale(1.18, 1.18, 1.18), matHalo)
  plumbBobGrupo.add(plumbBobHalo)

  const plumbBobLuz = new THREE.PointLight(COR_PLUMBBOB_VERDE, 0.9, 2.6)
  plumbBobLuz.position.set(0, -0.05, 0)
  plumbBobGrupo.add(plumbBobLuz)

  habilitarSombraRecursivo(grupoRaiz)
  // O PlumbBob não projeta sombra escura na cabeça do Sim
  plumbBobMesh.castShadow = false
  plumbBobHalo.castShadow = false
  anelSelecaoChao.castShadow = false

  const articulacoes: ArticulacoesSim3D = {
    raiz: grupoRaiz,
    pelve,
    coluna,
    peito,
    pescoco,
    cabeca,
    olhoEsq,
    olhoDir,
    sobrancelhaEsq,
    sobrancelhaDir,
    boca,
    ombroEsq: bracoEsq.ombro,
    antebracoEsq: bracoEsq.antebraco,
    maoEsq: bracoEsq.mao,
    ombroDir: bracoDir.ombro,
    antebracoDir: bracoDir.antebraco,
    maoDir: bracoDir.mao,
    coxaEsq: pernaEsq.coxa,
    panturrilhaEsq: pernaEsq.panturrilha,
    coxaDir: pernaDir.coxa,
    panturrilhaDir: pernaDir.panturrilha,
    propCafe,
    propLivro,
    propTablet,
    plumbBobGrupo,
    plumbBobMesh,
    plumbBobHalo,
    plumbBobLuz,
    anelSelecaoChao,
  }

  const {
    ombroEsq,
    antebracoEsq,
    ombroDir,
    antebracoDir,
    coxaEsq,
    panturrilhaEsq,
    coxaDir,
    panturrilhaDir,
  } = articulacoes

  let anguloAtualY = 0
  let ultimaPosX = 0
  let ultimaPosZ = 0
  let inicializadoPos = false
  const semente = (agenteId.charCodeAt(0) * 17 + agenteId.charCodeAt(1) * 31) % 100

  function atualizar(
    sim: EstadoSim | undefined,
    ativo: boolean,
    tempoSegundos: number,
    deltaSegundos: number,
    posicaoMundo: { x: number; z: number },
    direcaoOlhar?: { x: number; z: number } | null,
  ) {
    // 1. Posição e orientação suave no plano 3D
    const dxMov = posicaoMundo.x - ultimaPosX
    const dzMov = posicaoMundo.z - ultimaPosZ
    const distMov = Math.hypot(dxMov, dzMov)

    if (!inicializadoPos) {
      ultimaPosX = posicaoMundo.x
      ultimaPosZ = posicaoMundo.z
      inicializadoPos = true
    } else {
      ultimaPosX = posicaoMundo.x
      ultimaPosZ = posicaoMundo.z
    }

    grupoRaiz.position.set(posicaoMundo.x, 0, posicaoMundo.z)

    let anguloAlvo = anguloAtualY
    if (distMov > 0.002) {
      anguloAlvo = Math.atan2(dxMov, dzMov)
    } else if (direcaoOlhar) {
      anguloAlvo = Math.atan2(direcaoOlhar.x - posicaoMundo.x, direcaoOlhar.z - posicaoMundo.z)
    }

    // Interpolação angular suave pelo menor arco
    let diffAngulo = anguloAlvo - anguloAtualY
    while (diffAngulo > Math.PI) diffAngulo -= Math.PI * 2
    while (diffAngulo < -Math.PI) diffAngulo += Math.PI * 2
    anguloAtualY += diffAngulo * Math.min(1, deltaSegundos * 10)
    grupoRaiz.rotation.y = anguloAtualY

    // 2. PlumbBob 3D e Anel de Seleção no Chão
    const corPlumb = sim ? calcularCorPlumbBob(sim.necessidades).corNum : COR_PLUMBBOB_VERDE
    ;(plumbBobMesh.material as THREE.MeshStandardMaterial).color.setHex(corPlumb)
    ;(plumbBobMesh.material as THREE.MeshStandardMaterial).emissive.setHex(corPlumb)
    ;(plumbBobHalo.material as THREE.MeshBasicMaterial).color.setHex(corPlumb)
    plumbBobLuz.color.setHex(corPlumb)
    plumbBobLuz.intensity = ativo ? 1.1 : 0.35

    const escalaPlumb = ativo ? 1.05 : 0.55
    plumbBobGrupo.scale.setScalar(escalaPlumb)
    plumbBobMesh.rotation.y = tempoSegundos * 2.2 + semente
    plumbBobHalo.rotation.y = -tempoSegundos * 1.4

    ;(anelSelecaoChao.material as THREE.MeshBasicMaterial).color.setHex(
      ativo ? corPlumb : corIdentidade,
    )
    ;(anelSelecaoChao.material as THREE.MeshBasicMaterial).opacity = ativo
      ? 0.75 + Math.sin(tempoSegundos * 4) * 0.2
      : 0.32
    anelSelecaoChao.scale.setScalar(ativo ? 1.08 : 0.85)

    // 3. Props carregados nas mãos (PostureAspectCarry)
    const carregando = sim?.postura.carregando ?? 'nada'
    propCafe.visible = carregando === 'xicara_cafe'
    propLivro.visible = carregando === 'livro'
    propTablet.visible = carregando === 'tablet'

    // 4. Expressões faciais: piscar natural, sobrancelhas por emoção e fala
    const cicloPiscar = (tempoSegundos + semente * 0.13) % 4.2
    const piscando = cicloPiscar > 4.04
    olhoEsq.scale.y = piscando ? 0.12 : 1
    olhoDir.scale.y = piscando ? 0.12 : 1

    const humor = sim?.humor ?? 'feliz'
    const anguloSobrancelha =
      humor === 'tenso' ? 0.28 : humor === 'exausto' ? -0.22 : humor === 'inspirado' ? -0.14 : 0
    sobrancelhaEsq.rotation.z = -anguloSobrancelha
    sobrancelhaDir.rotation.z = anguloSobrancelha

    const falando =
      sim?.balao?.tipo === 'fala' ||
      sim?.estadoBackend === 'falando' ||
      sim?.interacaoAtual?.opcao.categoria === 'social'
    if (falando) {
      boca.scale.y = 1 + Math.abs(Math.sin(tempoSegundos * 14)) * 2.2
      boca.scale.x = 0.85 + Math.sin(tempoSegundos * 10) * 0.2
    } else {
      boca.scale.set(1, 1, 1)
    }

    // 5. Máquina de estados de animação corporal (ARB / PostureSpec)
    const postura = sim?.postura.corpo ?? 'em_pe'
    const fase = tempoSegundos * 2.2 + semente

    // Reseta rotações base antes de aplicar a postura ativa
    coluna.rotation.set(0, 0, 0)
    peito.rotation.set(0, 0, 0)
    cabeca.rotation.set(0, 0, 0)
    ombroEsq.rotation.set(0, 0, 0.08)
    antebracoEsq.rotation.set(0, 0, 0)
    ombroDir.rotation.set(0, 0, -0.08)
    antebracoDir.rotation.set(0, 0, 0)
    coxaEsq.rotation.set(0, 0, 0)
    panturrilhaEsq.rotation.set(0, 0, 0)
    coxaDir.rotation.set(0, 0, 0)
    panturrilhaDir.rotation.set(0, 0, 0)

    if (postura === 'andando') {
      // Ciclo de caminhada bípede 3D realista
      const w = tempoSegundos * 9.5
      const passo = Math.sin(w)
      const passoOposto = Math.sin(w + Math.PI)

      pelve.position.y = 0.56 + Math.abs(Math.cos(w)) * 0.035
      pelve.rotation.y = passo * 0.08
      coluna.rotation.x = 0.08

      // Pernas alternando passada e flexão de joelho
      coxaEsq.rotation.x = passo * 0.65
      panturrilhaEsq.rotation.x = Math.max(0, -passo * 0.75)
      coxaDir.rotation.x = passoOposto * 0.65
      panturrilhaDir.rotation.x = Math.max(0, -passoOposto * 0.75)

      // Braços balançando em contra-fase com as pernas
      ombroEsq.rotation.x = passoOposto * 0.52
      antebracoEsq.rotation.x = -0.35 - Math.max(0, passoOposto * 0.25)
      ombroDir.rotation.x = passo * 0.52
      antebracoDir.rotation.x = -0.35 - Math.max(0, passo * 0.25)

      cabeca.rotation.y = Math.sin(w * 0.5) * 0.08
      plumbBobGrupo.position.y = 1.58 + Math.sin(tempoSegundos * 3.5) * 0.04
    } else if (postura === 'sentado_cadeira') {
      // Sentado na cadeira de escritório digitando / analisando monitor
      pelve.position.y = 0.42
      coluna.rotation.x = 0.14
      coxaEsq.rotation.x = -Math.PI * 0.46
      panturrilhaEsq.rotation.x = Math.PI * 0.46
      coxaDir.rotation.x = -Math.PI * 0.46
      panturrilhaDir.rotation.x = Math.PI * 0.46

      // Braços estendidos sobre a mesa digitando alternadamente
      const digitando = tempoSegundos * 11
      ombroEsq.rotation.x = -0.72 + Math.sin(digitando) * 0.07
      antebracoEsq.rotation.x = -0.68 + Math.cos(digitando * 1.3) * 0.12
      ombroDir.rotation.x = -0.72 + Math.cos(digitando) * 0.07
      antebracoDir.rotation.x = -0.68 + Math.sin(digitando * 1.3) * 0.12

      // Cabeça olhando para o monitor com micro-movimentos de leitura
      cabeca.rotation.y = Math.sin(tempoSegundos * 1.6 + semente) * 0.18
      cabeca.rotation.x = -0.05 + Math.sin(tempoSegundos * 2.5) * 0.04
      plumbBobGrupo.position.y = 1.42 + Math.sin(tempoSegundos * 3) * 0.04
    } else if (postura === 'sentado_sofa') {
      // Relaxado no sofá estofado
      pelve.position.y = 0.39
      coluna.rotation.x = -0.22 // Reclinado para trás
      coxaEsq.rotation.x = -Math.PI * 0.42
      panturrilhaEsq.rotation.x = Math.PI * 0.35
      coxaDir.rotation.x = -Math.PI * 0.42
      panturrilhaDir.rotation.x = Math.PI * 0.35

      ombroEsq.rotation.z = 0.28
      antebracoEsq.rotation.x = -0.45
      ombroDir.rotation.z = -0.28
      antebracoDir.rotation.x = -0.45

      cabeca.rotation.x = -0.1 + Math.sin(fase) * 0.05
      cabeca.rotation.y = Math.sin(fase * 0.7) * 0.22
      plumbBobGrupo.position.y = 1.38 + Math.sin(tempoSegundos * 3) * 0.04
    } else if (postura === 'interagindo_em_pe') {
      pelve.position.y = 0.56 + Math.sin(fase * 1.5) * 0.01

      if (carregando === 'xicara_cafe') {
        // Animação de tomar goles de café expresso
        const cicloGole = (Math.sin(tempoSegundos * 2.2) + 1) * 0.5
        ombroDir.rotation.x = -0.65 - cicloGole * 0.65
        antebracoDir.rotation.x = -0.85 - cicloGole * 0.55
        cabeca.rotation.x = -cicloGole * 0.22
        ombroEsq.rotation.x = Math.sin(fase) * 0.12
      } else if (carregando === 'livro' || carregando === 'tablet') {
        // Segurando livro/tablet na mão esquerda e gesticulando/folheando com a direita
        ombroEsq.rotation.x = -0.68
        antebracoEsq.rotation.x = -0.82
        ombroDir.rotation.x = -0.5 + Math.sin(tempoSegundos * 4) * 0.25
        antebracoDir.rotation.x = -0.6 + Math.cos(tempoSegundos * 4) * 0.25
        cabeca.rotation.x = 0.18 + Math.sin(tempoSegundos * 3) * 0.05
        cabeca.rotation.y = Math.sin(tempoSegundos * 1.8) * 0.12
      } else {
        // Conversa social / gesticulação expressiva estilo Simlish!
        const g = tempoSegundos * 5.2
        ombroEsq.rotation.x = -0.45 + Math.sin(g) * 0.35
        ombroEsq.rotation.z = 0.18 + Math.cos(g * 0.8) * 0.15
        antebracoEsq.rotation.x = -0.65 + Math.sin(g * 1.2) * 0.25

        ombroDir.rotation.x = -0.45 + Math.cos(g) * 0.35
        ombroDir.rotation.z = -0.18 - Math.sin(g * 0.8) * 0.15
        antebracoDir.rotation.x = -0.65 + Math.cos(g * 1.2) * 0.25

        peito.rotation.y = Math.sin(g * 0.5) * 0.12
        cabeca.rotation.y = Math.sin(g * 0.7) * 0.2
        cabeca.rotation.z = Math.cos(g * 0.6) * 0.08
      }
      plumbBobGrupo.position.y = 1.56 + Math.sin(tempoSegundos * 3) * 0.04
    } else {
      // Em pé (idle) com reações emocionais do humor atual
      pelve.position.y = 0.56 + Math.sin(fase) * 0.008

      if (humor === 'exausto') {
        // Ombros caídos e cabeça pesada
        coluna.rotation.x = 0.24
        cabeca.rotation.x = 0.26 + Math.sin(fase) * 0.06
        ombroEsq.rotation.x = 0.15
        ombroDir.rotation.x = 0.15
      } else if (humor === 'energizado' || humor === 'inspirado') {
        // Postura vibrante e confiante
        pelve.position.y = 0.56 + Math.abs(Math.sin(tempoSegundos * 4)) * 0.02
        ombroEsq.rotation.z = 0.16 + Math.sin(fase) * 0.05
        ombroDir.rotation.z = -0.16 - Math.sin(fase) * 0.05
        cabeca.rotation.y = Math.sin(fase * 0.8) * 0.18
      } else if (humor === 'tenso') {
        // Mão direita coçando a têmpora / testa
        ombroDir.rotation.x = -0.95
        antebracoDir.rotation.x = -1.1
        cabeca.rotation.z = 0.1
      } else {
        // Respiração natural e olhar curioso ao redor da sala
        peito.rotation.x = Math.sin(fase) * 0.025
        ombroEsq.rotation.x = Math.sin(fase * 0.8) * 0.06
        ombroDir.rotation.x = -Math.sin(fase * 0.8) * 0.06
        cabeca.rotation.y = Math.sin(fase * 0.45) * 0.22
      }
      plumbBobGrupo.position.y = 1.56 + Math.sin(tempoSegundos * 3) * 0.04
    }
  }

  function obterPosicaoCabecaMundo(alvo: THREE.Vector3): THREE.Vector3 {
    plumbBobGrupo.getWorldPosition(alvo)
    alvo.y += 0.26
    return alvo
  }

  function destruir() {
    grupoRaiz.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else obj.material.dispose()
      }
    })
  }

  return {
    id: agenteId,
    grupoRaiz,
    articulacoes,
    get anguloAtualY() {
      return anguloAtualY
    },
    atualizar,
    obterPosicaoCabecaMundo,
    destruir,
  }
}
