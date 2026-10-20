import * as THREE from 'three'
import { obterAparenciaSim, type AparenciaSimCAS } from './cas-sims'
import {
  calcularCorDiamante,
  COR_NIVEL,
  type EstadoSim,
} from './simulacao-sims'
import { texturaTecido } from './texturas3d'

// ---------------------------------------------------------------------------
// PERSONAGEM 3D ARTICULADO
//
// Boneco montado com primitivas (cápsula, esfera, cilindro) num esqueleto
// de grupos aninhados — pelve → coluna → peito → pescoço → cabeça, mais
// braços e pernas em 3 segmentos. Nenhum arquivo de modelo: aparência
// (pele, cabelo, roupa, porte, óculos) vem do criador de personagem
// (cas-sims.ts) e troca ao vivo.
//
// Animação = POSE ALVO por postura (andando, sentado, em pé, interagindo)
// + amortecimento exponencial de cada articulação até ela. É isso que
// deixa a troca de postura suave sem nenhuma curva de animação pronta.
// O amortecimento usa o dt REAL do quadro (1 - e^(-k·dt)); antes havia um
// piso de 0.08s que, a 60fps, fazia tudo 5x mais rápido que o pretendido
// (e mais rápido ainda a 144Hz).
// ---------------------------------------------------------------------------

export interface ArticulacoesSim3D {
  raiz: THREE.Group
  pelve: THREE.Group
  coluna: THREE.Group
  peito: THREE.Group
  pescoco: THREE.Group
  cabeca: THREE.Group
  olhoEsq: THREE.Group
  olhoDir: THREE.Group
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
  peEsq: THREE.Group
  coxaDir: THREE.Group
  panturrilhaDir: THREE.Group
  peDir: THREE.Group
  propCafe: THREE.Group
  propLivro: THREE.Group
  propTablet: THREE.Group
  diamanteGrupo: THREE.Group
  diamanteMesh: THREE.Mesh
  diamanteHalo: THREE.Mesh
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
  aplicarAparenciaCAS: (novaAparencia: AparenciaSimCAS) => void
  obterPosicaoCabecaMundo: (alvo: THREE.Vector3) => THREE.Vector3
  destruir: () => void
}

function habilitarSombraRecursivo(obj: THREE.Object3D) {
  obj.traverse((filho) => {
    if (filho instanceof THREE.Mesh) {
      filho.castShadow = true
      filho.receiveShadow = true
    }
  })
}

function amortecerValor(atual: number, alvo: number, velocidade: number, dt: number): number {
  const fator = 1 - Math.exp(-velocidade * Math.min(dt, 0.1))
  return atual + (alvo - atual) * fator
}

function amortecerEuler(
  eulerAtual: THREE.Euler,
  rxAlvo: number,
  ryAlvo: number,
  rzAlvo: number,
  velocidade: number,
  dt: number,
) {
  eulerAtual.x = amortecerValor(eulerAtual.x, rxAlvo, velocidade, dt)
  eulerAtual.y = amortecerValor(eulerAtual.y, ryAlvo, velocidade, dt)
  eulerAtual.z = amortecerValor(eulerAtual.z, rzAlvo, velocidade, dt)
}

// Tira e libera os filhos de um grupo que é reconstruído (roupa, cabelo).
// Geometria é sempre exclusiva; material só é liberado se não for um dos
// compartilhados do boneco (pele, roupa...), que continuam em uso. Antes
// os filhos só eram removidos — a cada troca no criador, GPU vazando.
function esvaziarGrupo(grupo: THREE.Group, materiaisCompartilhados: Set<THREE.Material>) {
  for (const filho of [...grupo.children]) {
    grupo.remove(filho)
    filho.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.geometry.dispose()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) if (!materiaisCompartilhados.has(m)) m.dispose()
    })
  }
}

export function criarPersonagemSim3D(
  agenteId: string,
  corIdentidade: number,
  aparenciaExplicita?: AparenciaSimCAS,
): PersonagemSim3D {
  let aparencia = aparenciaExplicita ?? obterAparenciaSim(agenteId, corIdentidade)

  const matPele = new THREE.MeshStandardMaterial({
    color: aparencia.tomPele,
    roughness: 0.48,
    metalness: 0.02,
  })
  const matCabelo = new THREE.MeshStandardMaterial({
    color: aparencia.corCabelo,
    roughness: 0.58,
    metalness: 0.06,
  })
  const matRoupa = new THREE.MeshStandardMaterial({
    color: aparencia.corRoupaPrincipal,
    map: texturaTecido(aparencia.corRoupaPrincipal),
    roughness: 0.52,
  })
  const matCamisa = new THREE.MeshStandardMaterial({
    color: aparencia.corRoupaSecundaria,
    roughness: 0.45,
  })
  const matCalca = new THREE.MeshStandardMaterial({
    color: aparencia.corCalca,
    map: texturaTecido(aparencia.corCalca),
    roughness: 0.62,
  })
  const matSapato = new THREE.MeshStandardMaterial({
    color: aparencia.corSapato,
    roughness: 0.32,
    metalness: 0.12,
  })
  const matEsclera = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
  const matIris = new THREE.MeshStandardMaterial({ color: aparencia.corOlhos, roughness: 0.25 })
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 })
  const matBrilhoOlho = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const matBoca = new THREE.MeshStandardMaterial({ color: 0xc25953, roughness: 0.38 })
  const materiaisCompartilhados = new Set<THREE.Material>([
    matPele, matCabelo, matRoupa, matCamisa, matCalca, matSapato, matEsclera, matIris, matEscuro, matBrilhoOlho, matBoca,
  ])

  const grupoRaiz = new THREE.Group()
  grupoRaiz.name = `sim-${agenteId}`

  // Anel de seleção no chão
  const geoAnel = new THREE.RingGeometry(0.27, 0.34, 36)
  geoAnel.rotateX(-Math.PI / 2)
  const matAnel = new THREE.MeshBasicMaterial({
    color: COR_NIVEL.bom.num,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  })
  const anelSelecaoChao = new THREE.Mesh(geoAnel, matAnel)
  anelSelecaoChao.position.y = 0.015
  grupoRaiz.add(anelSelecaoChao)

  // --- PELVE (altura em pé = 0.56m) ---
  const pelve = new THREE.Group()
  pelve.position.set(0, 0.56, 0)
  grupoRaiz.add(pelve)

  const malhaQuadril = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.08, 10, 16), matCalca)
  malhaQuadril.rotation.z = Math.PI / 2
  malhaQuadril.scale.set(0.95, 1, 0.82)
  pelve.add(malhaQuadril)

  // Cinto sutil na cintura
  const malhaCinto = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.032, 20), matSapato)
  malhaCinto.scale.set(1, 1, 0.72)
  malhaCinto.position.set(0, 0.055, 0)
  pelve.add(malhaCinto)

  // --- COLUNA E PEITO ---
  const coluna = new THREE.Group()
  coluna.position.set(0, 0.06, 0)
  pelve.add(coluna)

  const peito = new THREE.Group()
  peito.position.set(0, 0.02, 0)
  coluna.add(peito)

  // Grupo dinâmico de roupa do torso (reconstruído ao trocar estilo no CAS)
  const grupoRoupaTorso = new THREE.Group()
  peito.add(grupoRoupaTorso)

  function construirRoupaTorso(estiloRoupa: AparenciaSimCAS['estiloRoupa']) {
    esvaziarGrupo(grupoRoupaTorso, materiaisCompartilhados)

    // Torso orgânico esculpido
    const torsoBase = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.138, 0.36, 20), matRoupa)
    torsoBase.scale.set(1.02, 1, 0.68)
    torsoBase.position.set(0, 0.19, 0)
    grupoRoupaTorso.add(torsoBase)

    // Ombros arredondados naturais
    const linhaOmbros = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.24, 10, 16), matRoupa)
    linhaOmbros.rotation.z = Math.PI / 2
    linhaOmbros.scale.set(1, 1, 0.82)
    linhaOmbros.position.set(0, 0.335, 0)
    grupoRoupaTorso.add(linhaOmbros)

    if (estiloRoupa === 'blazer_executivo') {
      // Camisa interna em V + lapelas do blazer
      const camisaInterna = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.33, 0.205), matCamisa)
      camisaInterna.position.set(0, 0.2, 0.012)
      const lapelaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.02), matRoupa)
      lapelaEsq.position.set(-0.055, 0.23, 0.112)
      lapelaEsq.rotation.z = -0.18
      const lapelaDir = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.02), matRoupa)
      lapelaDir.position.set(0.055, 0.23, 0.112)
      lapelaDir.rotation.z = 0.18
      grupoRoupaTorso.add(camisaInterna, lapelaEsq, lapelaDir)
    } else if (estiloRoupa === 'moletom_tech') {
      // Capuz traseiro + bolso canguru frontal
      const capuz = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.032, 10, 18), matRoupa)
      capuz.rotation.x = Math.PI / 2 + 0.25
      capuz.position.set(0, 0.365, -0.02)
      const bolso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), matCamisa)
      bolso.position.set(0, 0.1, 0.105)
      grupoRoupaTorso.add(capuz, bolso)
    } else if (estiloRoupa === 'jaqueta_esportiva') {
      // Faixa central esportiva + gola alta
      const ziperCentral = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.206), matCamisa)
      ziperCentral.position.set(0, 0.195, 0.012)
      const golaAlta = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.085, 0.06, 16), matRoupa)
      golaAlta.position.set(0, 0.38, 0)
      grupoRoupaTorso.add(ziperCentral, golaAlta)
    } else {
      // Camisa social slim com colarinho e botões
      const colarinho = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 8, 16), matCamisa)
      colarinho.rotation.x = Math.PI / 2
      colarinho.position.set(0, 0.37, 0.01)
      const faixaBotoes = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.34, 0.205), matCamisa)
      faixaBotoes.position.set(0, 0.19, 0.012)
      grupoRoupaTorso.add(colarinho, faixaBotoes)
    }
  }

  // --- PESCOÇO E CABEÇA ---
  const pescoco = new THREE.Group()
  pescoco.position.set(0, 0.385, 0)
  peito.add(pescoco)

  const malhaPescoco = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.064, 0.095, 16), matPele)
  malhaPescoco.position.set(0, 0.032, 0)
  pescoco.add(malhaPescoco)

  const cabeca = new THREE.Group()
  cabeca.position.set(0, 0.072, 0)
  pescoco.add(cabeca)

  // Cabeça orgânica de alta subdivisão (crânio + mandíbula suave)
  const malhaCabeca = new THREE.Mesh(new THREE.SphereGeometry(0.156, 28, 24), matPele)
  malhaCabeca.scale.set(0.94, 1.08, 0.96)
  malhaCabeca.position.set(0, 0.142, 0)
  cabeca.add(malhaCabeca)

  // Orelhas 3D esquerda e direita
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), matPele)
    orelha.scale.set(0.45, 0.85, 0.65)
    orelha.position.set(lado * 0.146, 0.142, -0.005)
    cabeca.add(orelha)
  }

  // Nariz 3D orgânico
  const malhaNariz = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.048, 12), matPele)
  malhaNariz.rotation.x = Math.PI / 2 - 0.15
  malhaNariz.position.set(0, 0.136, 0.154)
  cabeca.add(malhaNariz)

  // Olhos 3D detalhados (Esclera branca + Íris colorida + Pupila + Brilho especular)
  function criarOlhoDetalhado(lado: -1 | 1): THREE.Group {
    const gOlho = new THREE.Group()
    gOlho.position.set(lado * 0.052, 0.162, 0.134)

    const esclera = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 14), matEsclera)
    esclera.scale.set(1.1, 0.92, 0.65)
    gOlho.add(esclera)

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 12, 12), matIris)
    iris.scale.set(1, 1, 0.45)
    iris.position.set(0, 0, 0.012)
    gOlho.add(iris)

    const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 10), matEscuro)
    pupila.scale.set(1, 1, 0.4)
    pupila.position.set(0, 0, 0.016)
    gOlho.add(pupila)

    const brilho = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 8, 8), matBrilhoOlho)
    brilho.position.set(0.005, 0.005, 0.019)
    gOlho.add(brilho)

    return gOlho
  }

  const olhoEsq = criarOlhoDetalhado(-1)
  const olhoDir = criarOlhoDetalhado(1)
  cabeca.add(olhoEsq, olhoDir)

  const geoSobrancelha = new THREE.CapsuleGeometry(0.0055, 0.034, 6, 8)
  geoSobrancelha.rotateZ(Math.PI / 2)
  const sobrancelhaEsq = new THREE.Mesh(geoSobrancelha, matCabelo)
  sobrancelhaEsq.position.set(-0.052, 0.196, 0.143)
  const sobrancelhaDir = new THREE.Mesh(geoSobrancelha, matCabelo)
  sobrancelhaDir.position.set(0.052, 0.196, 0.143)
  cabeca.add(sobrancelhaEsq, sobrancelhaDir)

  const geoBoca = new THREE.CapsuleGeometry(0.0065, 0.036, 6, 10)
  geoBoca.rotateZ(Math.PI / 2)
  const boca = new THREE.Mesh(geoBoca, matBoca)
  boca.position.set(0, 0.092, 0.142)
  cabeca.add(boca)

  // Grupo dinâmico de cabelo e acessórios da cabeça
  const grupoCabeloEAcessorios = new THREE.Group()
  cabeca.add(grupoCabeloEAcessorios)

  function construirCabeloEAcessorios(ap: AparenciaSimCAS) {
    esvaziarGrupo(grupoCabeloEAcessorios, materiaisCompartilhados)

    // Calota capilar base
    const topoCabelo = new THREE.Mesh(
      new THREE.SphereGeometry(0.163, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
      matCabelo,
    )
    topoCabelo.position.set(0, 0.156, -0.008)
    grupoCabeloEAcessorios.add(topoCabelo)

    // Costeletas / acabamento lateral
    for (const lado of [-1, 1]) {
      const lateral = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.07, 6, 8), matCabelo)
      lateral.position.set(lado * 0.142, 0.17, 0.02)
      grupoCabeloEAcessorios.add(lateral)
    }

    if (ap.estiloCabelo === 'executivo') {
      const franja = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 8, 12), matCabelo)
      franja.rotation.z = Math.PI / 2 - 0.12
      franja.position.set(0.01, 0.27, 0.085)
      grupoCabeloEAcessorios.add(franja)
    } else if (ap.estiloCabelo === 'coque') {
      const coque = new THREE.Mesh(new THREE.SphereGeometry(0.074, 16, 16), matCabelo)
      coque.position.set(0, 0.265, -0.115)
      grupoCabeloEAcessorios.add(coque)
    } else if (ap.estiloCabelo === 'rabo_cavalo') {
      const elástico = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 8, 14), matRoupa)
      elástico.position.set(0, 0.19, -0.15)
      const rabo = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.2, 14), matCabelo)
      rabo.rotation.x = -0.65
      rabo.position.set(0, 0.15, -0.19)
      grupoCabeloEAcessorios.add(elástico, rabo)
    } else if (ap.estiloCabelo === 'moderno') {
      const topete = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.12, 10, 14), matCabelo)
      topete.rotation.z = Math.PI / 2
      topete.rotation.x = -0.25
      topete.position.set(0, 0.29, 0.055)
      grupoCabeloEAcessorios.add(topete)
    } else if (ap.estiloCabelo === 'longo_ondulado') {
      for (const lado of [-1, 1]) {
        const mecha = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 10, 12), matCabelo)
        mecha.position.set(lado * 0.125, 0.07, -0.04)
        mecha.rotation.z = lado * -0.12
        grupoCabeloEAcessorios.add(mecha)
      }
      const costas = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.09), matCabelo)
      costas.position.set(0, 0.08, -0.12)
      grupoCabeloEAcessorios.add(costas)
    } else if (ap.estiloCabelo === 'afro_puff') {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.195, 22, 20), matCabelo)
      puff.position.set(0, 0.225, -0.02)
      grupoCabeloEAcessorios.add(puff)
    } else if (ap.estiloCabelo === 'curto_cacheado') {
      const posCachos: [number, number, number][] = [
        [0, 0.29, 0.04],
        [-0.08, 0.27, 0.03],
        [0.08, 0.27, 0.03],
        [-0.11, 0.23, -0.02],
        [0.11, 0.23, -0.02],
        [0, 0.27, -0.08],
      ]
      for (const [cx, cy, cz] of posCachos) {
        const cacho = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), matCabelo)
        cacho.position.set(cx, cy, cz)
        grupoCabeloEAcessorios.add(cacho)
      }
    }

    // Óculos 3D ('redondo' ou 'retangular')
    if (ap.oculos !== 'nenhum') {
      if (ap.oculos === 'redondo') {
        const aroEsq = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0045, 8, 20), matEscuro)
        aroEsq.position.set(-0.052, 0.162, 0.15)
        const aroDir = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0045, 8, 20), matEscuro)
        aroDir.position.set(0.052, 0.162, 0.15)
        grupoCabeloEAcessorios.add(aroEsq, aroDir)
      } else {
        const aroEsq = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.042, 0.006), matEscuro)
        aroEsq.position.set(-0.052, 0.162, 0.15)
        const lenteEsq = new THREE.Mesh(
          new THREE.BoxGeometry(0.056, 0.03, 0.008),
          new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35 }),
        )
        lenteEsq.position.set(-0.052, 0.162, 0.15)
        const aroDir = aroEsq.clone()
        aroDir.position.x = 0.052
        const lenteDir = lenteEsq.clone()
        lenteDir.position.x = 0.052
        grupoCabeloEAcessorios.add(aroEsq, lenteEsq, aroDir, lenteDir)
      }
      const ponte = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.005, 0.006), matEscuro)
      ponte.position.set(0, 0.166, 0.15)
      grupoCabeloEAcessorios.add(ponte)
    }

    // Headset 3D com microfone lateral
    if (ap.headset) {
      const matHeadset = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        metalness: 0.45,
        roughness: 0.28,
      })
      const arco = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.012, 10, 24, Math.PI), matHeadset)
      arco.position.set(0, 0.15, 0)
      const conchaEsq = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.028, 14), matHeadset)
      conchaEsq.rotation.z = Math.PI / 2
      conchaEsq.position.set(-0.162, 0.145, 0)
      const conchaDir = conchaEsq.clone()
      conchaDir.position.x = 0.162
      grupoCabeloEAcessorios.add(arco, conchaEsq, conchaDir)
    }
  }

  // --- BRAÇOS ARTICULADOS (Ombro -> Braço -> Antebraço -> Mão com polegar) ---
  function criarBraco(lado: -1 | 1) {
    const ombro = new THREE.Group()
    ombro.position.set(lado * 0.2, 0.335, 0)
    peito.add(ombro)

    const malhaBracoSup = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.16, 10, 14), matRoupa)
    malhaBracoSup.position.set(0, -0.1, 0)
    ombro.add(malhaBracoSup)

    const antebraco = new THREE.Group()
    antebraco.position.set(0, -0.2, 0)
    ombro.add(antebraco)

    const malhaAntebraco = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.15, 10, 14), matPele)
    malhaAntebraco.position.set(0, -0.09, 0)
    antebraco.add(malhaAntebraco)

    const mao = new THREE.Group()
    mao.position.set(0, -0.19, 0)
    antebraco.add(mao)

    const palma = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), matPele)
    palma.scale.set(0.85, 1.1, 0.65)
    const polegar = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.022, 6, 8), matPele)
    polegar.position.set(lado * -0.025, -0.005, 0.022)
    polegar.rotation.x = 0.6
    mao.add(palma, polegar)

    return { ombro, antebraco, mao }
  }

  const bracoEsq = criarBraco(-1)
  const bracoDir = criarBraco(1)

  // --- OBJETOS NA MÃO (café, livro, tablet) ---
  const propCafe = new THREE.Group()
  const caneca = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.036, 0.09, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  )
  const liquidoCafe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.037, 0.037, 0.01, 14),
    new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.3 }),
  )
  liquidoCafe.position.y = 0.042
  propCafe.add(caneca, liquidoCafe)
  propCafe.position.set(0, -0.02, 0.05)
  propCafe.visible = false
  bracoDir.mao.add(propCafe)

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

  // --- PERNAS E TORNOZELOS ARTICULADOS (Coxa -> Panturrilha -> Pé) ---
  function criarPerna(lado: -1 | 1) {
    const coxa = new THREE.Group()
    coxa.position.set(lado * 0.086, -0.04, 0)
    pelve.add(coxa)

    const malhaCoxa = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.18, 10, 14), matCalca)
    malhaCoxa.position.set(0, -0.12, 0)
    coxa.add(malhaCoxa)

    const panturrilha = new THREE.Group()
    panturrilha.position.set(0, -0.25, 0)
    coxa.add(panturrilha)

    const malhaPanturrilha = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.18, 10, 14), matCalca)
    malhaPanturrilha.position.set(0, -0.12, 0)
    panturrilha.add(malhaPanturrilha)

    const pe = new THREE.Group()
    pe.position.set(0, -0.24, 0)
    panturrilha.add(pe)

    const sapato = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.095, 8, 12), matSapato)
    sapato.rotation.x = Math.PI / 2
    sapato.scale.set(1.08, 1, 0.68)
    sapato.position.set(0, 0, 0.036)
    pe.add(sapato)

    return { coxa, panturrilha, pe }
  }

  const pernaEsq = criarPerna(-1)
  const pernaDir = criarPerna(1)

  // --- DIAMANTE sobre a cabeça: cor = pior necessidade do agente. Brilho
  // vem do emissivo, sem luz pontual — uma PointLight por personagem pesava
  // na GPU e recompilava todos os materiais a cada personagem novo. ---
  const diamanteGrupo = new THREE.Group()
  diamanteGrupo.position.set(0, 1.58, 0)
  grupoRaiz.add(diamanteGrupo)

  const geoDiamante = new THREE.OctahedronGeometry(0.11, 0)
  geoDiamante.scale(0.75, 1.55, 0.75)
  const matDiamante = new THREE.MeshStandardMaterial({
    color: COR_NIVEL.bom.num,
    emissive: COR_NIVEL.bom.num,
    emissiveIntensity: 0.65,
    roughness: 0.15,
    metalness: 0.25,
    flatShading: true,
  })
  const diamanteMesh = new THREE.Mesh(geoDiamante, matDiamante)
  diamanteGrupo.add(diamanteMesh)

  const matHalo = new THREE.MeshBasicMaterial({
    color: COR_NIVEL.bom.num,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  })
  const diamanteHalo = new THREE.Mesh(geoDiamante.clone().scale(1.18, 1.18, 1.18), matHalo)
  diamanteGrupo.add(diamanteHalo)


  function aplicarAparenciaCAS(novaAparencia: AparenciaSimCAS) {
    aparencia = novaAparencia
    matPele.color.setHex(novaAparencia.tomPele)
    matIris.color.setHex(novaAparencia.corOlhos)
    matCabelo.color.setHex(novaAparencia.corCabelo)
    matRoupa.color.setHex(novaAparencia.corRoupaPrincipal)
    matRoupa.map = texturaTecido(novaAparencia.corRoupaPrincipal)
    matRoupa.needsUpdate = true
    matCamisa.color.setHex(novaAparencia.corRoupaSecundaria)
    matCalca.color.setHex(novaAparencia.corCalca)
    matCalca.map = texturaTecido(novaAparencia.corCalca)
    matCalca.needsUpdate = true
    matSapato.color.setHex(novaAparencia.corSapato)

    construirRoupaTorso(novaAparencia.estiloRoupa)
    construirCabeloEAcessorios(novaAparencia)

    // Escala de porte físico no torso/ombros
    const escalaPorteX =
      novaAparencia.porteFisico === 'esguio' ? 0.91 : novaAparencia.porteFisico === 'atletico' ? 1.09 : 1
    peito.scale.set(escalaPorteX, 1, escalaPorteX)

    habilitarSombraRecursivo(grupoRaiz)
    diamanteMesh.castShadow = false
    diamanteHalo.castShadow = false
    anelSelecaoChao.castShadow = false
  }

  aplicarAparenciaCAS(aparencia)

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
    peEsq: pernaEsq.pe,
    coxaDir: pernaDir.coxa,
    panturrilhaDir: pernaDir.panturrilha,
    peDir: pernaDir.pe,
    propCafe,
    propLivro,
    propTablet,
    diamanteGrupo,
    diamanteMesh,
    diamanteHalo,
    anelSelecaoChao,
  }

  let anguloAtualY = 0
  let ultimaPosX = 0
  let ultimaPosZ = 0
  let inicializadoPos = false
  let faseCaminhadaAcumulada = 0
  const semente = (agenteId.charCodeAt(0) * 17 + (agenteId.charCodeAt(1) || 7) * 31) % 100

  function atualizar(
    sim: EstadoSim | undefined,
    ativo: boolean,
    tempoSegundos: number,
    deltaSegundos: number,
    posicaoMundo: { x: number; z: number },
    direcaoOlhar?: { x: number; z: number } | null,
  ) {
    const dt = Math.max(0.001, Math.min(0.1, deltaSegundos))
    const primeiroQuadro = !inicializadoPos

    // 1. Posição e velocidade real no plano 3D
    const dxMov = inicializadoPos ? posicaoMundo.x - ultimaPosX : 0
    const dzMov = inicializadoPos ? posicaoMundo.z - ultimaPosZ : 0
    const distMov = Math.hypot(dxMov, dzMov)
    const velocidadeInstantanea = distMov / dt

    ultimaPosX = posicaoMundo.x
    ultimaPosZ = posicaoMundo.z
    inicializadoPos = true

    grupoRaiz.position.set(posicaoMundo.x, 0, posicaoMundo.z)

    let anguloAlvo = anguloAtualY
    if (distMov > 0.0015) {
      anguloAlvo = Math.atan2(dxMov, dzMov)
    } else if (direcaoOlhar) {
      anguloAlvo = Math.atan2(direcaoOlhar.x - posicaoMundo.x, direcaoOlhar.z - posicaoMundo.z)
    }

    // Interpolação angular ultra suave pelo menor arco (sem trancos!)
    let diffAngulo = anguloAlvo - anguloAtualY
    while (diffAngulo > Math.PI) diffAngulo -= Math.PI * 2
    while (diffAngulo < -Math.PI) diffAngulo += Math.PI * 2
    anguloAtualY += diffAngulo * (1 - Math.exp(-11 * dt))
    grupoRaiz.rotation.y = anguloAtualY

    // 2. Diamante e anel de seleção no chão
    const corDiamante = sim ? calcularCorDiamante(sim.necessidades).corNum : COR_NIVEL.bom.num
    ;(diamanteMesh.material as THREE.MeshStandardMaterial).color.setHex(corDiamante)
    ;(diamanteMesh.material as THREE.MeshStandardMaterial).emissive.setHex(corDiamante)
    ;(diamanteHalo.material as THREE.MeshBasicMaterial).color.setHex(corDiamante)
    ;(diamanteMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = amortecerValor(
      (diamanteMesh.material as THREE.MeshStandardMaterial).emissiveIntensity,
      ativo ? 0.9 : 0.45,
      8,
      dt,
    )

    const escalaDiamanteAlvo = ativo ? 1.06 : 0.54
    const novaEscalaDiamante = amortecerValor(diamanteGrupo.scale.x, escalaDiamanteAlvo, 10, dt)
    diamanteGrupo.scale.setScalar(novaEscalaDiamante)
    diamanteMesh.rotation.y = tempoSegundos * 2.1 + semente
    diamanteHalo.rotation.y = -tempoSegundos * 1.35

    ;(anelSelecaoChao.material as THREE.MeshBasicMaterial).color.setHex(
      ativo ? corDiamante : corIdentidade,
    )
    ;(anelSelecaoChao.material as THREE.MeshBasicMaterial).opacity = ativo
      ? 0.75 + Math.sin(tempoSegundos * 3.8) * 0.2
      : 0.3
    anelSelecaoChao.scale.setScalar(ativo ? 1.08 : 0.85)

    // 3. O que está na mão
    const carregando = sim?.postura.carregando ?? 'nada'
    propCafe.visible = carregando === 'xicara_cafe'
    propLivro.visible = carregando === 'livro'
    propTablet.visible = carregando === 'tablet'

    // 4. Expressões faciais orgânicas: piscar suave, sobrancelhas amortecidas e fala
    const cicloPiscar = (tempoSegundos + semente * 0.13) % 4.3
    const piscando = cicloPiscar > 4.12
    const escalaOlhoY = amortecerValor(olhoEsq.scale.y, piscando ? 0.1 : 1, 28, dt)
    olhoEsq.scale.y = escalaOlhoY
    olhoDir.scale.y = escalaOlhoY

    const humor = sim?.humor ?? 'feliz'
    const anguloSobrancelhaAlvo =
      humor === 'tenso' ? 0.26 : humor === 'exausto' ? -0.2 : humor === 'inspirado' ? -0.14 : 0
    sobrancelhaEsq.rotation.z = amortecerValor(sobrancelhaEsq.rotation.z, -anguloSobrancelhaAlvo, 10, dt)
    sobrancelhaDir.rotation.z = amortecerValor(sobrancelhaDir.rotation.z, anguloSobrancelhaAlvo, 10, dt)

    const falando =
      sim?.balao?.tipo === 'fala' ||
      sim?.estadoBackend === 'falando' ||
      sim?.interacaoAtual?.opcao.categoria === 'social'
    if (falando) {
      boca.scale.y = amortecerValor(boca.scale.y, 1 + Math.abs(Math.sin(tempoSegundos * 13)) * 2.1, 20, dt)
      boca.scale.x = amortecerValor(boca.scale.x, 0.86 + Math.sin(tempoSegundos * 9.5) * 0.18, 20, dt)
    } else {
      boca.scale.y = amortecerValor(boca.scale.y, 1, 14, dt)
      boca.scale.x = amortecerValor(boca.scale.x, 1, 14, dt)
    }

    // 5. Pose alvo da postura atual (o amortecimento vem no passo 6)
    const postura = sim?.postura.corpo ?? 'em_pe'
    const fase = tempoSegundos * 2.1 + semente

    let pelveYAlvo = 0.56
    let pelveRx = 0, pelveRy = 0, pelveRz = 0
    let colRx = 0, colRy = 0, colRz = 0
    let peitoRx = 0, peitoRy = 0, peitoRz = 0
    let pescRx = 0, pescRy = 0, pescRz = 0
    let cabRx = 0, cabRy = 0, cabRz = 0
    let ombERx = 0, ombERy = 0, ombERz = 0.08
    let antERx = -0.12, antERy = 0, antERz = 0
    let maoERx = 0, maoERy = 0, maoERz = 0
    let ombDRx = 0, ombDRy = 0, ombDRz = -0.08
    let antDRx = -0.12, antDRy = 0, antDRz = 0
    let maoDRx = 0, maoDRy = 0, maoDRz = 0
    let coxaERx = 0, coxaERy = 0, coxaERz = 0
    let pantERx = 0
    let peERx = 0
    let coxaDRx = 0, coxaDRy = 0, coxaDRz = 0
    let pantDRx = 0
    let peDRx = 0
    let diamanteYAlvo = 1.58 + Math.sin(tempoSegundos * 2.8) * 0.035

    if (postura === 'andando' || distMov > 0.002) {
      // Frequência da passada sincronizada com a velocidade real para os pés não deslizarem!
      const velEfetiva = Math.max(1.1, Math.min(2.6, velocidadeInstantanea || 1.55))
      const estiloCam = aparencia.estiloCaminhada
      const multCadencia =
        estiloCam === 'energizado' ? 6.4 : estiloCam === 'sereno' ? 4.8 : 5.6
      faseCaminhadaAcumulada += dt * velEfetiva * multCadencia

      const w = faseCaminhadaAcumulada
      const senW = Math.sin(w)
      const cosW = Math.cos(w)
      const senOp = -senW
      const cosOp = -cosW

      const amplitudePassada =
        estiloCam === 'energizado' ? 0.68 : estiloCam === 'sereno' ? 0.48 : 0.58
      const quiqueVertical =
        estiloCam === 'energizado' ? 0.042 : estiloCam === 'sereno' ? 0.018 : 0.028

      // Movimento pélvico orgânico em 3 eixos (bounce vertical, sway lateral e twist)
      pelveYAlvo = 0.56 + Math.abs(cosW) * quiqueVertical - 0.01
      pelveRy = senW * 0.09
      pelveRz = cosW * 0.035

      // Contra-rotação natural da coluna e peito (contrapposto)
      colRx = estiloCam === 'confiante' ? -0.03 : 0.06
      peitoRy = -senW * 0.08
      peitoRz = -cosW * 0.025

      // Pernas com flexão natural de joelho na fase de balanço (swing phase) e rolamento do pé
      coxaERx = senW * amplitudePassada
      pantERx = Math.max(0.05, cosW * 0.65 + 0.25)
      peERx = -senW * 0.28 - 0.05

      coxaDRx = senOp * amplitudePassada
      pantDRx = Math.max(0.05, cosOp * 0.65 + 0.25)
      peDRx = -senOp * 0.28 - 0.05

      // Braços em contra-fase com atraso orgânico no antebraço e punho
      const ampBraco = estiloCam === 'confiante' ? 0.52 : 0.44
      ombERx = senOp * ampBraco
      ombERz = estiloCam === 'confiante' ? 0.14 : 0.08
      antERx = -0.28 - Math.max(0, senOp * 0.32)
      maoERx = cosOp * 0.12

      ombDRx = senW * ampBraco
      ombDRz = estiloCam === 'confiante' ? -0.14 : -0.08
      antDRx = -0.28 - Math.max(0, senW * 0.32)
      maoDRx = cosW * 0.12

      // Se estiver carregando café ou tablet enquanto caminha, estabiliza o braço!
      if (carregando === 'xicara_cafe') {
        ombDRx = -0.45
        antDRx = -0.85
        maoDRx = 0.1
      } else if (carregando === 'livro' || carregando === 'tablet') {
        ombERx = -0.45
        antERx = -0.82
      }

      cabRy = Math.sin(w * 0.5) * 0.06
      cabRx = estiloCam === 'confiante' ? -0.05 : 0.02
    } else if (postura === 'sentado_cadeira') {
      pelveYAlvo = 0.42
      colRx = 0.11 + Math.sin(fase * 0.7) * 0.02
      peitoRx = 0.04
      coxaERx = -Math.PI * 0.46
      coxaERy = -0.06
      pantERx = Math.PI * 0.46
      coxaDRx = -Math.PI * 0.46
      coxaDRy = 0.06
      pantDRx = Math.PI * 0.46

      // Digitação fluida e assimétrica com movimento de punhos
      const d = tempoSegundos * 8.5
      ombERx = -0.68 + Math.sin(d) * 0.05
      ombERy = 0.12
      antERx = -0.66 + Math.cos(d * 1.2) * 0.09
      maoERx = Math.sin(d * 2.1) * 0.14

      ombDRx = -0.68 + Math.cos(d * 0.9) * 0.05
      ombDRy = -0.12
      antDRx = -0.66 + Math.sin(d * 1.1) * 0.09
      maoDRx = Math.cos(d * 2.3) * 0.14

      pescRx = 0.04
      cabRy = Math.sin(tempoSegundos * 1.3 + semente) * 0.16
      cabRx = -0.04 + Math.sin(tempoSegundos * 2.1) * 0.035
      diamanteYAlvo = 1.42 + Math.sin(tempoSegundos * 2.8) * 0.035
    } else if (postura === 'sentado_sofa') {
      pelveYAlvo = 0.39
      pelveRx = -0.1
      colRx = -0.18
      peitoRx = -0.06 + Math.sin(fase) * 0.02
      coxaERx = -Math.PI * 0.41
      coxaERy = -0.1
      pantERx = Math.PI * 0.34
      peERx = 0.12
      coxaDRx = -Math.PI * 0.41
      coxaDRy = 0.1
      pantDRx = Math.PI * 0.34
      peDRx = 0.12

      ombERx = -0.15
      ombERz = 0.26
      antERx = -0.48
      ombDRx = -0.15
      ombDRz = -0.26
      antDRx = -0.48

      cabRx = -0.08 + Math.sin(fase) * 0.04
      cabRy = Math.sin(fase * 0.6) * 0.2
      diamanteYAlvo = 1.38 + Math.sin(tempoSegundos * 2.8) * 0.035
    } else if (postura === 'interagindo_em_pe') {
      pelveYAlvo = 0.56 + Math.sin(fase * 1.3) * 0.008
      pelveRz = Math.sin(fase * 0.7) * 0.025
      colRz = -pelveRz * 0.8

      if (carregando === 'xicara_cafe') {
        const gole = Math.pow((Math.sin(tempoSegundos * 1.8) + 1) * 0.5, 2)
        ombDRx = -0.58 - gole * 0.62
        ombDRy = -0.18 * gole
        antDRx = -0.82 - gole * 0.52
        maoDRx = 0.15 * gole
        cabRx = -gole * 0.2
        ombERx = Math.sin(fase) * 0.08
      } else if (carregando === 'livro' || carregando === 'tablet') {
        ombERx = -0.62
        ombERy = 0.22
        antERx = -0.82
        ombDRx = -0.48 + Math.sin(tempoSegundos * 3.2) * 0.18
        ombDRy = -0.15
        antDRx = -0.62 + Math.cos(tempoSegundos * 3.2) * 0.18
        pescRx = 0.12
        cabRx = 0.12 + Math.sin(tempoSegundos * 2.4) * 0.04
        cabRy = Math.sin(tempoSegundos * 1.5) * 0.11
      } else {
        // Conversa social / gesticulação orgânica e suave (sem movimentos robóticos!)
        const g = tempoSegundos * 3.6 + semente
        ombERx = -0.38 + Math.sin(g) * 0.24
        ombERz = 0.16 + Math.cos(g * 0.7) * 0.1
        antERx = -0.62 + Math.sin(g * 1.1) * 0.2
        maoERz = Math.sin(g * 1.6) * 0.18

        ombDRx = -0.38 + Math.cos(g * 0.9) * 0.24
        ombDRz = -0.16 - Math.sin(g * 0.7) * 0.1
        antDRx = -0.62 + Math.cos(g * 1.1) * 0.2
        maoDRz = -Math.cos(g * 1.6) * 0.18

        peitoRy = Math.sin(g * 0.45) * 0.1
        pescRy = Math.sin(g * 0.5) * 0.08
        cabRy = Math.sin(g * 0.65) * 0.16
        cabRz = Math.cos(g * 0.55) * 0.06
      }
    } else {
      // Em pé (idle) com transferência natural de peso entre os quadris (contrapposto)
      const resp = Math.sin(fase)
      const pesoLateral = Math.sin(fase * 0.45)
      pelveYAlvo = 0.56 + resp * 0.006
      pelveRz = pesoLateral * 0.03
      colRz = -pesoLateral * 0.025
      peitoRx = resp * 0.022

      if (humor === 'exausto') {
        colRx = 0.2
        pescRx = 0.12
        cabRx = 0.18 + resp * 0.05
        ombERx = 0.12
        ombDRx = 0.12
      } else if (humor === 'energizado' || humor === 'inspirado') {
        pelveYAlvo = 0.56 + Math.abs(Math.sin(tempoSegundos * 3.2)) * 0.015
        ombERz = 0.14 + resp * 0.04
        ombDRz = -0.14 - resp * 0.04
        cabRy = Math.sin(fase * 0.7) * 0.16
      } else if (humor === 'tenso') {
        ombDRx = -0.88
        ombDRy = -0.2
        antDRx = -1.08
        cabRz = 0.09
      } else {
        ombERx = Math.sin(fase * 0.7) * 0.04
        ombDRx = -Math.sin(fase * 0.7) * 0.04
        cabRy = Math.sin(fase * 0.4) * 0.18
        cabRz = Math.cos(fase * 0.35) * 0.035
      }
    }

    // 6. Amortecimento de todas as articulações até a pose alvo. No
    // primeiro quadro vai direto (senão o boneco nasceria "desmontando").
    const velDamp = primeiroQuadro ? 1000 : postura === 'andando' ? 20 : 14
    const dtEfetivo = primeiroQuadro ? 1 : dt
    pelve.position.y = amortecerValor(pelve.position.y, pelveYAlvo, velDamp, dtEfetivo)
    amortecerEuler(pelve.rotation, pelveRx, pelveRy, pelveRz, velDamp, dtEfetivo)
    amortecerEuler(coluna.rotation, colRx, colRy, colRz, velDamp, dtEfetivo)
    amortecerEuler(peito.rotation, peitoRx, peitoRy, peitoRz, velDamp, dtEfetivo)
    amortecerEuler(pescoco.rotation, pescRx, pescRy, pescRz, velDamp, dtEfetivo)
    amortecerEuler(cabeca.rotation, cabRx, cabRy, cabRz, velDamp, dtEfetivo)

    amortecerEuler(bracoEsq.ombro.rotation, ombERx, ombERy, ombERz, velDamp, dtEfetivo)
    amortecerEuler(bracoEsq.antebraco.rotation, antERx, antERy, antERz, velDamp, dtEfetivo)
    amortecerEuler(bracoEsq.mao.rotation, maoERx, maoERy, maoERz, velDamp, dtEfetivo)

    amortecerEuler(bracoDir.ombro.rotation, ombDRx, ombDRy, ombDRz, velDamp, dtEfetivo)
    amortecerEuler(bracoDir.antebraco.rotation, antDRx, antDRy, antDRz, velDamp, dtEfetivo)
    amortecerEuler(bracoDir.mao.rotation, maoDRx, maoDRy, maoDRz, velDamp, dtEfetivo)

    amortecerEuler(pernaEsq.coxa.rotation, coxaERx, coxaERy, coxaERz, velDamp, dtEfetivo)
    amortecerEuler(pernaEsq.panturrilha.rotation, pantERx, 0, 0, velDamp, dtEfetivo)
    amortecerEuler(pernaEsq.pe.rotation, peERx, 0, 0, velDamp, dtEfetivo)

    amortecerEuler(pernaDir.coxa.rotation, coxaDRx, coxaDRy, coxaDRz, velDamp, dtEfetivo)
    amortecerEuler(pernaDir.panturrilha.rotation, pantDRx, 0, 0, velDamp, dtEfetivo)
    amortecerEuler(pernaDir.pe.rotation, peDRx, 0, 0, velDamp, dtEfetivo)

    diamanteGrupo.position.y = amortecerValor(diamanteGrupo.position.y, diamanteYAlvo, 12, dtEfetivo)
  }

  function obterPosicaoCabecaMundo(alvo: THREE.Vector3): THREE.Vector3 {
    diamanteGrupo.getWorldPosition(alvo)
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
    aplicarAparenciaCAS,
    obterPosicaoCabecaMundo,
    destruir,
  }
}
