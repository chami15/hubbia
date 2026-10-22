import * as THREE from 'three'
import { obterAparenciaSim, type AparenciaSimCAS, type EstiloCabeloCAS, type EstiloRoupaCAS } from './cas-sims'
import {
  obterGeometriaBlender,
  obterSubmalhaBlender,
  type ChaveMalhaBlender,
} from './malhas-blender'
import { calcularCorDiamante, COR_NIVEL, type EstadoSim } from './simulacao-sims'
import { texturaTecido } from './texturas3d'

// ---------------------------------------------------------------------------
// PERSONAGEM 3D ESCULPIDO NO BLENDER COM SKINNING CONTÍNUO (CATMULL-CLARK)
//
// Utiliza as malhas subdivididas exportadas do Blender (`malhas-blender.ts`):
//   - `cabeca`: cabeça + pescoço + nariz + órbitas + maçãs do rosto + queixo +
//     orelhas numa única superfície Catmull-Clark contínua
//   - `torso_camisa_unificado` + `bracos_maos_unificados`: tronco, ombros,
//     mangas, antebraços, mãos e polegares em malha única ramificada com
//     `THREE.SkinnedMesh` (zero costuras ou esferas de articulação!)
//   - `calca_unificada`: cintura, quadril, glúteos, coxas, joelhos e canelas
//     em malha única 100% manifold com `THREE.SkinnedMesh`
//   - `cabelo_*` e `calcado_*`: cortes de cabelo e calçados subdivididos
// ---------------------------------------------------------------------------

function smoothstep(min: number, max: number, valor: number): number {
  const t = Math.max(0, Math.min(1, (valor - min) / (max - min)))
  return t * t * (3 - 2 * t)
}

export function aplicarPesosCalcaBlender(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const count = pos.count
  const skinIndices = new Uint16Array(count * 4)
  const skinWeights = new Float32Array(count * 4)

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const idxCoxa = x < 0 ? 9 : 11
    const idxPant = x < 0 ? 10 : 12

    const wPelve = smoothstep(0.47, 0.56, y)
    const wCoxaRel = smoothstep(0.22, 0.33, y)
    const wCoxa = (1 - wPelve) * wCoxaRel
    const wPant = (1 - wPelve) * (1 - wCoxaRel)

    const base = i * 4
    skinIndices[base] = 0
    skinIndices[base + 1] = idxCoxa
    skinIndices[base + 2] = idxPant
    skinIndices[base + 3] = 0

    skinWeights[base] = wPelve
    skinWeights[base + 1] = wCoxa
    skinWeights[base + 2] = wPant
    skinWeights[base + 3] = 0
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
  return geo
}

export function aplicarPesosTorsoBracosBlender(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const count = pos.count
  const skinIndices = new Uint16Array(count * 4)
  const skinWeights = new Float32Array(count * 4)

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const idxOmbro = x < 0 ? 3 : 6
    const idxAnte = x < 0 ? 4 : 7
    const idxMao = x < 0 ? 5 : 8

    const wBraco = smoothstep(0.125, 0.168, Math.abs(x))
    const wPeito = 1 - wBraco

    const wOmbroRel = smoothstep(0.72, 0.82, y)
    const wAnteRel = smoothstep(0.55, 0.63, y)

    const wOmbro = wBraco * wOmbroRel
    const wAnte = wBraco * (1 - wOmbroRel) * wAnteRel
    const wMao = wBraco * (1 - wOmbroRel) * (1 - wAnteRel)

    const base = i * 4
    skinIndices[base] = 2
    skinIndices[base + 1] = idxOmbro
    skinIndices[base + 2] = idxAnte
    skinIndices[base + 3] = idxMao

    skinWeights[base] = wPeito
    skinWeights[base + 1] = wOmbro
    skinWeights[base + 2] = wAnte
    skinWeights[base + 3] = wMao
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
  return geo
}

function chaveCabeloBlenderDe(estilo: EstiloCabeloCAS): ChaveMalhaBlender {
  switch (estilo) {
    case 'topete_cifra':
      return 'cabelo_cifra'
    case 'coque_agenda':
      return 'cabelo_agenda'
    case 'afro_vita':
      return 'cabelo_vita'
    case 'geek_norte':
      return 'cabelo_norte'
    case 'executivo':
      return 'cabelo_curto'
    case 'coque':
      return 'cabelo_coque'
    case 'rabo_cavalo':
      return 'cabelo_medio'
    case 'moderno':
      return 'cabelo_topete'
    case 'longo_ondulado':
      return 'cabelo_longo'
    case 'afro_puff':
      return 'cabelo_blackpower'
    case 'curto_cacheado':
      return 'cabelo_ondulado'
  }
}

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
  boca: THREE.Group
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
  propCadernetaCifra?: THREE.Mesh | THREE.Group
  propPostitsAgenda?: THREE.Mesh | THREE.Group
  propGarrafaVita?: THREE.Mesh | THREE.Group
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

function escurecerHex(cor: number, fator: number): number {
  const r = (cor >> 16) & 0xff
  const g = (cor >> 8) & 0xff
  const b = cor & 0xff
  const m = (c: number) => Math.max(0, Math.round(c * (1 - fator)))
  return (m(r) << 16) | (m(g) << 8) | m(b)
}

function amortecerValor(atual: number, alvo: number, velocidade: number, dt: number): number {
  return atual + (alvo - atual) * (1 - Math.exp(-velocidade * dt))
}

function amortecerEuler(
  rot: THREE.Euler,
  rx: number,
  ry: number,
  rz: number,
  velocidade: number,
  dt: number,
) {
  const f = 1 - Math.exp(-velocidade * dt)
  rot.x += (rx - rot.x) * f
  rot.y += (ry - rot.y) * f
  rot.z += (rz - rot.z) * f
}


// Controle cirúrgico de sombras: o corpo projeta sombra no chão e móveis, mas
// a pele do rosto e as micro-feições NUNCA recebem auto-sombra do shadow map
// (`receiveShadow = false`), eliminando 100% do efeito de "rosto manchado".
function configurarSombrasPersonagem(raiz: THREE.Object3D) {
  raiz.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const semAutoSombra = Boolean(obj.userData?.semAutoSombra)
      const detalheFacial = Boolean(obj.userData?.detalheFacial)
      obj.castShadow = !detalheFacial
      obj.receiveShadow = !semAutoSombra && !detalheFacial
    }
  })
}

// Remove todos os filhos de um Group e libera a geometria de cada Mesh na GPU.
function esvaziarGrupo(grupo: THREE.Group) {
  for (const f of [...grupo.children]) {
    f.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    grupo.remove(f)
  }
}

export function criarPersonagemSim3D(
  agenteId: string,
  corIdentidade: number,
  aparenciaInicial?: AparenciaSimCAS,
): PersonagemSim3D {
  let aparencia = aparenciaInicial ?? obterAparenciaSim(agenteId, corIdentidade)

  const grupoRaiz = new THREE.Group()
  grupoRaiz.name = `sim-${agenteId}`

  // Materiais compartilhados entre as partes do corpo (atualizados ao vivo no criador)
  const matPele = new THREE.MeshStandardMaterial({
    color: aparencia.tomPele,
    roughness: 0.54,
    metalness: 0.02,
    emissive: aparencia.tomPele,
    emissiveIntensity: 0.07,
  })
  const matPeleRosto = new THREE.MeshStandardMaterial({
    color: aparencia.tomPele,
    roughness: 0.52,
    metalness: 0.01,
    emissive: aparencia.tomPele,
    emissiveIntensity: 0.08,
  })
  const matLabios = new THREE.MeshStandardMaterial({
    color: escurecerHex(aparencia.tomPele, 0.22),
    roughness: 0.38,
    metalness: 0.02,
    emissive: escurecerHex(aparencia.tomPele, 0.28),
    emissiveIntensity: 0.06,
  })
  const matRoupa = new THREE.MeshStandardMaterial({
    color: aparencia.corRoupaPrincipal,
    map: texturaTecido(aparencia.corRoupaPrincipal),
    roughness: 0.5,
    metalness: 0.04,
  })
  const matCamisa = new THREE.MeshStandardMaterial({
    color: aparencia.corRoupaSecundaria,
    roughness: 0.44,
    metalness: 0.03,
  })
  const matCalca = new THREE.MeshStandardMaterial({
    color: aparencia.corCalca,
    map: texturaTecido(aparencia.corCalca),
    roughness: 0.56,
    metalness: 0.04,
  })
  const matCabelo = new THREE.MeshStandardMaterial({
    color: aparencia.corCabelo,
    roughness: 0.64,
    metalness: 0.05,
  })
  const corOlhoDirInicial = aparencia.corOlhoDireito ?? aparencia.corOlhos
  const corOlhoEsqInicial = aparencia.corOlhoEsquerdo ?? aparencia.corOlhos

  const matIrisDir = new THREE.MeshStandardMaterial({
    color: corOlhoDirInicial,
    roughness: 0.18,
    metalness: 0.08,
    emissive: corOlhoDirInicial,
    emissiveIntensity: 0.12,
  })
  const matIrisEsq = new THREE.MeshStandardMaterial({
    color: corOlhoEsqInicial,
    roughness: 0.18,
    metalness: 0.08,
    emissive: corOlhoEsqInicial,
    emissiveIntensity: 0.12,
  })
  const matSapato = new THREE.MeshStandardMaterial({
    color: aparencia.corSapato,
    roughness: 0.34,
    metalness: 0.14,
  })
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.28 })
  const matBrancoOlho = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    emissive: 0xffffff,
    emissiveIntensity: 0.12,
  })

  // --- ANEL DE SELEÇÃO NO CHÃO ---
  const geoAnel = new THREE.RingGeometry(0.24, 0.31, 36)
  geoAnel.rotateX(-Math.PI / 2)
  const matAnel = new THREE.MeshBasicMaterial({
    color: corIdentidade,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
  })
  const anelSelecaoChao = new THREE.Mesh(geoAnel, matAnel)
  anelSelecaoChao.position.y = 0.015
  grupoRaiz.add(anelSelecaoChao)

  // --- HIERARQUIA ESQUELÉTICA ---
  const pelve = new THREE.Group()
  pelve.position.set(0, 0.56, 0)
  grupoRaiz.add(pelve)

  const malhaPelve = new THREE.Mesh(obterSubmalhaBlender('calca_pelve'), matCalca)
  pelve.add(malhaPelve)

  const coluna = new THREE.Group()
  coluna.position.set(0, 0.06, 0)
  pelve.add(coluna)

  const peito = new THREE.Group()
  peito.position.set(0, 0.02, 0)
  coluna.add(peito)

  const grupoTorso = new THREE.Group()
  peito.add(grupoTorso)

  function construirRoupaTorso(estilo: EstiloRoupaCAS) {
    esvaziarGrupo(grupoTorso)

    if (estilo === 'trenchcoat_cifra') {
      const malhaTrench = new THREE.Mesh(obterGeometriaBlender('roupa_cifra_trenchcoat'), matRoupa)
      malhaTrench.userData = { semAutoSombra: true }
      const matCorrente = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.2 })
      const corrente = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0025, 6, 16, Math.PI * 0.8), matCorrente)
      corrente.position.set(0.045, 0.08, 0.105)
      corrente.rotation.z = -0.35
      corrente.rotation.x = -0.15
      grupoTorso.add(malhaTrench, corrente)
      return
    } else if (estilo === 'cardigan_agenda') {
      const malhaCardigan = new THREE.Mesh(obterGeometriaBlender('roupa_agenda_cardigan'), matRoupa)
      malhaCardigan.userData = { semAutoSombra: true }
      const matBroche = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.15 })
      const broche = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8), matBroche)
      broche.position.set(0, 0.28, 0.088)
      broche.rotation.x = Math.PI / 2
      grupoTorso.add(malhaCardigan, broche)
      return
    } else if (estilo === 'regata_vita') {
      const malhaRegata = new THREE.Mesh(obterGeometriaBlender('roupa_vita_regata'), matRoupa)
      malhaRegata.userData = { semAutoSombra: true }
      grupoTorso.add(malhaRegata)
      return
    } else if (estilo === 'moletom_norte') {
      const malhaMoletom = new THREE.Mesh(obterGeometriaBlender('roupa_norte_moletom'), matRoupa)
      malhaMoletom.userData = { semAutoSombra: true }
      const matCordao = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.5 })
      for (const lado of [-1, 1]) {
        const cordao = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.14, 6), matCordao)
        cordao.position.set(lado * 0.032, 0.22, 0.108)
        cordao.rotation.z = -lado * 0.08
        grupoTorso.add(cordao)
      }
      grupoTorso.add(malhaMoletom)
      return
    }

    const malhaTorso = new THREE.Mesh(obterSubmalhaBlender('torso_peito'), matRoupa)
    grupoTorso.add(malhaTorso)

    // Gola / peitilho orgânico curvo acompanhando o decote
    const peitilho = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.048, 0.16, 18, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
      matCamisa,
    )
    peitilho.scale.set(1, 1, 0.65)
    peitilho.position.set(0, 0.285, 0.064)
    grupoTorso.add(peitilho)

    if (estilo === 'blazer_executivo') {
      // Lapelas curvas tubulares acompanhando o peito
      for (const lado of [-1, 1]) {
        const lapela = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.14, 8, 12), matRoupa)
        lapela.scale.set(1.2, 1, 0.55)
        lapela.position.set(lado * 0.042, 0.255, 0.098)
        lapela.rotation.z = lado * 0.24
        lapela.rotation.x = -0.09
        grupoTorso.add(lapela)
      }
      // Botão central arredondado do blazer
      const botao = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 10), matEscuro)
      botao.scale.set(1, 1, 0.45)
      botao.position.set(0, 0.145, 0.098)
      grupoTorso.add(botao)
    } else if (estilo === 'moletom_tech') {
      // Capuz macio em formato de anel esculpido ao redor da nuca
      const capuz = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.034, 12, 24), matRoupa)
      capuz.rotation.x = Math.PI / 2 + 0.22
      capuz.scale.set(1.05, 0.95, 0.85)
      capuz.position.set(0, 0.365, -0.018)
      // Bolso frontal canguru arredondado
      const bolso = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.095, 10, 14), matCamisa)
      bolso.rotation.z = Math.PI / 2
      bolso.scale.set(1, 1, 0.38)
      bolso.position.set(0, 0.095, 0.092)
      grupoTorso.add(capuz, bolso)
    } else if (estilo === 'jaqueta_esportiva') {
      // Gola alta esportiva + fecho frontal cilíndrico fino
      const golaAlta = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.018, 10, 22), matCamisa)
      golaAlta.rotation.x = Math.PI / 2
      golaAlta.scale.set(1, 0.82, 1)
      golaAlta.position.set(0, 0.362, 0.005)
      const ziper = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.28, 6, 10), matCamisa)
      ziper.position.set(0, 0.18, 0.098)
      grupoTorso.add(golaAlta, ziper)
    } else if (estilo === 'camisa_social') {
      // Colarinho social curvado + botões delicados
      const colarinho = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.015, 10, 22), matCamisa)
      colarinho.rotation.x = Math.PI / 2 + 0.08
      colarinho.scale.set(1, 0.82, 1)
      colarinho.position.set(0, 0.36, 0.006)
      grupoTorso.add(colarinho)
      for (const yBotao of [0.24, 0.17, 0.1]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), matCamisa)
        b.scale.set(1, 1, 0.4)
        b.position.set(0, yBotao, 0.097)
        grupoTorso.add(b)
      }
    }
  }

  // --- PESCOÇO E CABEÇA ESCULPIDA ---
  const pescoco = new THREE.Group()
  pescoco.position.set(0, 0.36, 0)
  peito.add(pescoco)

  const cabeca = new THREE.Group()
  cabeca.position.set(0, 0.068, 0)
  pescoco.add(cabeca)

  const malhaCabeca = new THREE.Mesh(obterGeometriaBlender('cabeca'), matPeleRosto)
  malhaCabeca.position.set(0, 0, 0)
  malhaCabeca.userData = { semAutoSombra: true }
  cabeca.add(malhaCabeca)

  // Olhos expressivos amendoados com pálpebra superior, esclera limpa, íris, pupila e reflexo
  function criarOlho(lado: -1 | 1): THREE.Group {
    const grupoOlho = new THREE.Group()
    grupoOlho.position.set(lado * 0.048, 0.16, 0.118)
    grupoOlho.rotation.y = lado * 0.14

    const esclera = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 14), matBrancoOlho)
    esclera.scale.set(1.18, 0.92, 0.55)
    esclera.userData = { detalheFacial: true }

    const matIrisLado = lado > 0 ? matIrisDir : matIrisEsq
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 20), matIrisLado)
    iris.position.set(0, -0.001, 0.014)
    iris.userData = { detalheFacial: true }

    const pupila = new THREE.Mesh(
      new THREE.CircleGeometry(0.0068, 16),
      new THREE.MeshBasicMaterial({ color: 0x090d16 }),
    )
    pupila.position.set(0, -0.001, 0.0148)
    pupila.userData = { detalheFacial: true }

    const brilho = new THREE.Mesh(
      new THREE.CircleGeometry(0.0032, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    brilho.position.set(lado * 0.0042, 0.0045, 0.0155)
    brilho.userData = { detalheFacial: true }

    // Linha de cílios/pálpebra superior curvada que dá acabamento limpo ao olhar
    const cilios = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.0028, 8, 18, Math.PI * 0.88),
      matEscuro,
    )
    cilios.rotation.z = Math.PI * 0.06
    cilios.scale.set(1.18, 0.9, 0.7)
    cilios.position.set(0, 0.002, 0.009)
    cilios.userData = { detalheFacial: true }

    grupoOlho.add(esclera, iris, pupila, brilho, cilios)
    cabeca.add(grupoOlho)
    return grupoOlho
  }

  const olhoEsq = criarOlho(-1)
  const olhoDir = criarOlho(1)

  // Sobrancelhas arqueadas suaves
  function criarSobrancelha(lado: -1 | 1): THREE.Mesh {
    const sob = new THREE.Mesh(
      new THREE.TorusGeometry(0.025, 0.0042, 8, 16, Math.PI * 0.72),
      matCabelo,
    )
    sob.rotation.z = Math.PI * 0.14 - lado * 0.06
    sob.scale.set(1.15, 0.65, 0.6)
    sob.position.set(lado * 0.049, 0.184, 0.118)
    sob.rotation.y = lado * 0.15
    sob.userData = { detalheFacial: true }
    cabeca.add(sob)
    return sob
  }

  const sobrancelhaEsq = criarSobrancelha(-1)
  const sobrancelhaDir = criarSobrancelha(1)

  // Boca esculpida com lábio superior e inferior suaves (sorriso sereno natural)
  const boca = new THREE.Group()
  boca.position.set(0, 0.09, 0.128)
  const labioSup = new THREE.Mesh(
    new THREE.TorusGeometry(0.021, 0.0042, 10, 18, Math.PI * 0.82),
    matLabios,
  )
  labioSup.rotation.x = Math.PI * 0.88
  labioSup.rotation.z = Math.PI * 0.09
  labioSup.scale.set(1.15, 0.65, 0.65)
  labioSup.position.set(0, 0.003, 0)
  labioSup.userData = { detalheFacial: true }

  const labioInf = new THREE.Mesh(
    new THREE.TorusGeometry(0.019, 0.0048, 10, 18, Math.PI * 0.78),
    matLabios,
  )
  labioInf.rotation.x = Math.PI * 0.92
  labioInf.rotation.z = Math.PI * 0.11
  labioInf.scale.set(1.12, 0.72, 0.7)
  labioInf.position.set(0, -0.001, 0.001)
  labioInf.userData = { detalheFacial: true }

  boca.add(labioSup, labioInf)
  cabeca.add(boca)

  // --- DETALHES FACIAIS CANÔNICOS (Barba/Cicatriz, Pinta, Sardas/Diastema, Olheiras) ---
  const grupoDetalhesFaciais = new THREE.Group()
  cabeca.add(grupoDetalhesFaciais)

  function construirDetalhesFaciais(ap: AparenciaSimCAS) {
    esvaziarGrupo(grupoDetalhesFaciais)
    const detalhe = ap.detalheFacial ?? 'nenhum'

    if (detalhe === 'cifra_barba_cicatriz') {
      const matBarba = new THREE.MeshStandardMaterial({
        color: 0x451a03,
        roughness: 0.8,
        transparent: true,
        opacity: 0.65,
      })
      const barbaMandibula = new THREE.Mesh(
        new THREE.TorusGeometry(0.092, 0.009, 8, 24, Math.PI * 0.95),
        matBarba,
      )
      barbaMandibula.rotation.x = Math.PI * 0.44
      barbaMandibula.position.set(0, 0.045, 0.038)
      barbaMandibula.userData = { detalheFacial: true, semAutoSombra: true }

      const cavanhaque = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.024, 6, 10),
        matBarba,
      )
      cavanhaque.position.set(0, 0.048, 0.126)
      cavanhaque.userData = { detalheFacial: true, semAutoSombra: true }

      const matCicatriz = new THREE.MeshBasicMaterial({ color: 0xfbe5d6 })
      const corteSobrancelha = new THREE.Mesh(
        new THREE.PlaneGeometry(0.004, 0.015),
        matCicatriz,
      )
      corteSobrancelha.position.set(-0.054, 0.187, 0.124)
      corteSobrancelha.rotation.z = 0.35
      corteSobrancelha.userData = { detalheFacial: true, semAutoSombra: true }

      const matArgola = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.85,
        roughness: 0.2,
      })
      const argola = new THREE.Mesh(
        new THREE.TorusGeometry(0.009, 0.002, 6, 14),
        matArgola,
      )
      argola.position.set(-0.132, 0.138, -0.015)
      argola.rotation.y = Math.PI / 2
      argola.userData = { detalheFacial: true, semAutoSombra: true }

      grupoDetalhesFaciais.add(barbaMandibula, cavanhaque, corteSobrancelha, argola)
    } else if (detalhe === 'agenda_pinta_madura') {
      const matPinta = new THREE.MeshBasicMaterial({ color: 0x1c1917 })
      const pinta = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 12), matPinta)
      pinta.position.set(-0.026, 0.106, 0.133)
      pinta.rotation.y = -0.15
      pinta.userData = { detalheFacial: true, semAutoSombra: true }
      grupoDetalhesFaciais.add(pinta)
    } else if (detalhe === 'vita_sardas_diastema') {
      const matSarda = new THREE.MeshBasicMaterial({
        color: 0x9a3412,
        transparent: true,
        opacity: 0.58,
      })
      const offsetsSardas: [number, number, number][] = [
        [-0.028, 0.135, 0.125],
        [-0.038, 0.142, 0.121],
        [-0.046, 0.132, 0.115],
        [0.028, 0.135, 0.125],
        [0.038, 0.142, 0.121],
        [0.046, 0.132, 0.115],
        [0, 0.145, 0.132],
      ]
      for (const [sx, sy, sz] of offsetsSardas) {
        const s = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 8), matSarda)
        s.position.set(sx, sy, sz)
        s.rotation.y = sx * 1.5
        s.userData = { detalheFacial: true, semAutoSombra: true }
        grupoDetalhesFaciais.add(s)
      }

      const matDente = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const denteEsq = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.007), matDente)
      denteEsq.position.set(-0.0042, 0.092, 0.129)
      denteEsq.userData = { detalheFacial: true, semAutoSombra: true }
      const denteDir = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.007), matDente)
      denteDir.position.set(0.0042, 0.092, 0.129)
      denteDir.userData = { detalheFacial: true, semAutoSombra: true }
      grupoDetalhesFaciais.add(denteEsq, denteDir)
    } else if (detalhe === 'norte_olheiras') {
      const matOlheira = new THREE.MeshBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.35,
      })
      for (const lado of [-1, 1]) {
        const olh = new THREE.Mesh(
          new THREE.TorusGeometry(0.019, 0.0035, 6, 14, Math.PI * 0.7),
          matOlheira,
        )
        olh.rotation.z = Math.PI * 0.15
        olh.position.set(lado * 0.048, 0.138, 0.118)
        olh.userData = { detalheFacial: true, semAutoSombra: true }
        grupoDetalhesFaciais.add(olh)
      }
    }
  }

  // --- CABELO E ACESSÓRIOS ---
  const grupoCabeloEAcessorios = new THREE.Group()
  cabeca.add(grupoCabeloEAcessorios)

  function construirCabeloEAcessorios(ap: AparenciaSimCAS) {
    esvaziarGrupo(grupoCabeloEAcessorios)

    // Cabelo esculpido e subdividido no Blender com Catmull-Clark
    const chaveCabelo = chaveCabeloBlenderDe(ap.estiloCabelo)
    const malhaCabelo = new THREE.Mesh(obterGeometriaBlender(chaveCabelo), matCabelo)
    malhaCabelo.position.set(0, 0, 0)
    malhaCabelo.userData = { semAutoSombra: true }
    grupoCabeloEAcessorios.add(malhaCabelo)

    // Mecha frontal prateada do Cifra
    if (ap.estiloCabelo === 'topete_cifra') {
      const matMecha = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.35,
        roughness: 0.3,
      })
      const mecha = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.016, 0.07, 8, 12),
        matMecha,
      )
      mecha.position.set(0.038, 0.23, 0.14)
      mecha.rotation.z = -0.32
      mecha.rotation.x = 0.22
      mecha.userData = { semAutoSombra: true }
      grupoCabeloEAcessorios.add(mecha)
    }

    // Dois lápis com borrachas no coque da Agenda
    if (ap.estiloCabelo === 'coque_agenda') {
      const matLapis = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })
      const matBorracha = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 })
      const matMetalico = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 })

      for (const angulo of [0.45, -0.45]) {
        const gLapis = new THREE.Group()
        const corpoLapis = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8), matLapis)
        const anelLapis = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 8), matMetalico)
        anelLapis.position.y = 0.075
        const borracha = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.016, 8), matBorracha)
        borracha.position.y = 0.088
        gLapis.add(corpoLapis, anelLapis, borracha)
        gLapis.position.set(0, 0.268, -0.05)
        gLapis.rotation.z = angulo
        gLapis.rotation.y = 0.18
        gLapis.userData = { semAutoSombra: true }
        grupoCabeloEAcessorios.add(gLapis)
      }
    }

    // Mechas verde-limão vibrantes no afro da Vita
    if (ap.estiloCabelo === 'afro_vita') {
      const matMechaLimao = new THREE.MeshStandardMaterial({
        color: 0x84cc16,
        emissive: 0x84cc16,
        emissiveIntensity: 0.22,
        roughness: 0.5,
      })
      const tendris: [number, number, number, number][] = [
        [0.085, 0.22, 0.1, 0.4],
        [-0.09, 0.21, 0.08, -0.35],
        [0.03, 0.27, 0.11, 0.15],
      ]
      for (const [mx, my, mz, rz] of tendris) {
        const tendril = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 12, Math.PI * 0.8), matMechaLimao)
        tendril.position.set(mx, my, mz)
        tendril.rotation.z = rz
        tendril.userData = { semAutoSombra: true }
        grupoCabeloEAcessorios.add(tendril)
      }
    }

    // Colar / pingente tech do Norte
    if (ap.estiloCabelo === 'geek_norte' || ap.estiloRoupa === 'moletom_norte') {
      const matPingente = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.2,
      })
      const cordao = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.002, 6, 20), matEscuro)
      cordao.position.set(0, 0.02, 0.04)
      cordao.rotation.x = Math.PI * 0.42
      const pingente = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), matPingente)
      pingente.position.set(0, -0.04, 0.082)
      grupoCabeloEAcessorios.add(cordao, pingente)
    }

    // Óculos 3D (Blender ou Procedural)
    if (ap.oculos === 'gatinho_agenda') {
      const matOculos = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 })
      const malhaOculos = new THREE.Mesh(obterGeometriaBlender('acessorio_agenda_oculos'), matOculos)
      malhaOculos.rotation.y = Math.PI
      malhaOculos.position.set(0, 0.055, 0)
      malhaOculos.userData = { detalheFacial: true, semAutoSombra: true }
      grupoCabeloEAcessorios.add(malhaOculos)
    } else if (ap.oculos === 'geek_norte') {
      const matOculos = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.2, metalness: 0.1 })
      const malhaOculos = new THREE.Mesh(obterGeometriaBlender('acessorio_norte_oculos'), matOculos)
      malhaOculos.rotation.y = Math.PI
      malhaOculos.position.set(0, 0.065, 0)
      malhaOculos.userData = { detalheFacial: true, semAutoSombra: true }
      grupoCabeloEAcessorios.add(malhaOculos)
    } else if (ap.oculos !== 'nenhum') {
      const matLente = new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
      })
      for (const lado of [-1, 1]) {
        const aro = new THREE.Mesh(
          new THREE.TorusGeometry(0.031, 0.0038, 10, ap.oculos === 'redondo' ? 24 : 16),
          matEscuro,
        )
        if (ap.oculos === 'retangular') {
          aro.scale.set(1.16, 0.78, 1)
        }
        aro.position.set(lado * 0.049, 0.162, 0.138)
        aro.userData = { detalheFacial: true, semAutoSombra: true }

        const lente = new THREE.Mesh(new THREE.CircleGeometry(0.029, 20), matLente)
        if (ap.oculos === 'retangular') {
          lente.scale.set(1.16, 0.78, 1)
        }
        lente.position.set(lado * 0.049, 0.162, 0.138)
        lente.userData = { detalheFacial: true, semAutoSombra: true }

        grupoCabeloEAcessorios.add(aro, lente)
      }
      const ponte = new THREE.Mesh(new THREE.CapsuleGeometry(0.003, 0.026, 6, 8), matEscuro)
      ponte.rotation.z = Math.PI / 2
      ponte.position.set(0, 0.166, 0.138)
      ponte.userData = { detalheFacial: true, semAutoSombra: true }
      grupoCabeloEAcessorios.add(ponte)
    }

    // Headset 3D com arco e conchas acolchoadas
    if (ap.headset) {
      const matHeadset = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        metalness: 0.45,
        roughness: 0.28,
      })
      const arco = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.011, 10, 26, Math.PI), matHeadset)
      arco.position.set(0, 0.15, -0.005)
      grupoCabeloEAcessorios.add(arco)
      for (const lado of [-1, 1]) {
        const concha = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.018, 10, 14), matHeadset)
        concha.scale.set(0.65, 1.1, 1)
        concha.position.set(lado * 0.158, 0.142, -0.005)
        grupoCabeloEAcessorios.add(concha)
      }
    }

    grupoCabeloEAcessorios.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData?.detalheFacial) {
        o.userData = { semAutoSombra: true }
      }
    })
  }

  // --- BRAÇOS ESCULPIDOS (Ombro -> Braço -> Antebraço -> Mão) ---
  function criarBraco(lado: -1 | 1) {
    const ombro = new THREE.Group()
    ombro.position.set(lado * 0.186, 0.325, 0)
    peito.add(ombro)

    const malhaBracoSup = new THREE.Mesh(
      obterSubmalhaBlender(lado < 0 ? 'braco_ombro_esq' : 'braco_ombro_dir'),
      matRoupa,
    )
    ombro.add(malhaBracoSup)

    const antebraco = new THREE.Group()
    antebraco.position.set(0, -0.192, 0)
    ombro.add(antebraco)

    const malhaAntebraco = new THREE.Mesh(
      obterSubmalhaBlender(lado < 0 ? 'braco_antebraco_esq' : 'braco_antebraco_dir'),
      matPele,
    )
    antebraco.add(malhaAntebraco)

    const mao = new THREE.Group()
    mao.position.set(0, -0.188, 0)
    antebraco.add(mao)

    const malhaMao = new THREE.Mesh(
      obterSubmalhaBlender(lado < 0 ? 'braco_mao_esq' : 'braco_mao_dir'),
      matPele,
    )
    mao.add(malhaMao)

    return { ombro, antebraco, mao }
  }

  const bracoEsq = criarBraco(-1)
  const bracoDir = criarBraco(1)

  // --- OBJETOS NA MÃO (café, livro, tablet com cantos suaves) ---
  const propCafe = new THREE.Group()
  const caneca = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.034, 0.088, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  )
  const asaCaneca = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.005, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  )
  asaCaneca.rotation.z = -Math.PI / 2
  asaCaneca.position.set(0.036, 0, 0)
  const liquidoCafe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16),
    new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.3 }),
  )
  liquidoCafe.position.y = 0.04
  propCafe.add(caneca, asaCaneca, liquidoCafe)
  propCafe.position.set(0, -0.025, 0.048)
  propCafe.visible = false
  bracoDir.mao.add(propCafe)

  const propLivro = new THREE.Group()
  const capaLivro = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.05, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4 }),
  )
  capaLivro.rotation.z = Math.PI / 2
  capaLivro.scale.set(1, 1, 0.26)
  const paginasLivro = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.05, 0.046, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 }),
  )
  paginasLivro.rotation.z = Math.PI / 2
  paginasLivro.scale.set(1, 1, 0.22)
  paginasLivro.position.y = 0.004
  propLivro.add(capaLivro, paginasLivro)
  propLivro.position.set(0.038, -0.022, 0.058)
  propLivro.visible = false
  bracoEsq.mao.add(propLivro)

  const propTablet = new THREE.Group()
  const corpoTablet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.3 }),
  )
  corpoTablet.scale.set(1.05, 1, 0.76)
  const telaTablet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.064, 0.064, 0.014, 20),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
    }),
  )
  telaTablet.scale.set(1.05, 1, 0.76)
  propTablet.add(corpoTablet, telaTablet)
  propTablet.position.set(0.038, -0.014, 0.058)
  propTablet.visible = false
  bracoEsq.mao.add(propTablet)

  // Caderneta de couro marrom do Cifra (mão direita)
  const propCadernetaCifra = new THREE.Mesh(
    obterGeometriaBlender('prop_cifra_caderneta'),
    new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.45, metalness: 0.1 }),
  )
  propCadernetaCifra.position.set(0.015, -0.02, 0.05)
  propCadernetaCifra.rotation.z = Math.PI / 2
  propCadernetaCifra.visible = false
  bracoDir.mao.add(propCadernetaCifra)

  // Fichário com post-its da Agenda (mão esquerda)
  const propPostitsAgenda = new THREE.Mesh(
    obterGeometriaBlender('prop_agenda_postits'),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }),
  )
  propPostitsAgenda.position.set(0.025, -0.02, 0.055)
  propPostitsAgenda.visible = false
  bracoEsq.mao.add(propPostitsAgenda)

  // Garrafa térmica de Vita (mão direita)
  const propGarrafaVita = new THREE.Mesh(
    obterGeometriaBlender('prop_vita_garrafa'),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.25 }),
  )
  propGarrafaVita.position.set(0, -0.02, 0.05)
  propGarrafaVita.visible = false
  bracoDir.mao.add(propGarrafaVita)

  // --- PERNAS E CALÇADOS ESCULPIDOS (Coxa -> Panturrilha -> Pé) ---
  function criarPerna(lado: -1 | 1) {
    const coxa = new THREE.Group()
    coxa.position.set(lado * 0.082, -0.035, 0)
    pelve.add(coxa)

    const malhaCoxa = new THREE.Mesh(
      obterSubmalhaBlender(lado < 0 ? 'calca_coxa_esq' : 'calca_coxa_dir'),
      matCalca,
    )
    coxa.add(malhaCoxa)

    const panturrilha = new THREE.Group()
    panturrilha.position.set(0, -0.252, 0)
    coxa.add(panturrilha)

    const malhaPanturrilha = new THREE.Mesh(
      obterSubmalhaBlender(lado < 0 ? 'calca_panturrilha_esq' : 'calca_panturrilha_dir'),
      matCalca,
    )
    panturrilha.add(malhaPanturrilha)

    const pe = new THREE.Group()
    pe.position.set(0, -0.242, 0)
    panturrilha.add(pe)

    const matSola = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    const sola = new THREE.Mesh(obterGeometriaBlender('calcado_sola'), matSola)
    const cabedal = new THREE.Mesh(obterGeometriaBlender('calcado_cabedal'), matSapato)
    sola.userData = { semAutoSombra: true }
    cabedal.userData = { semAutoSombra: true }
    pe.add(sola, cabedal)

    return { coxa, panturrilha, pe }
  }

  const pernaEsq = criarPerna(-1)
  const pernaDir = criarPerna(1)

  // --- DIAMANTE SOBRE A CABEÇA ---
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
    matPele.emissive.setHex(novaAparencia.tomPele)
    matPeleRosto.color.setHex(novaAparencia.tomPele)
    matPeleRosto.emissive.setHex(novaAparencia.tomPele)
    matPeleRosto.needsUpdate = true
    matLabios.color.setHex(escurecerHex(novaAparencia.tomPele, 0.22))
    matLabios.emissive.setHex(escurecerHex(novaAparencia.tomPele, 0.28))

    const corDir = novaAparencia.corOlhoDireito ?? novaAparencia.corOlhos
    const corEsq = novaAparencia.corOlhoEsquerdo ?? novaAparencia.corOlhos
    matIrisDir.color.setHex(corDir)
    matIrisDir.emissive.setHex(corDir)
    matIrisEsq.color.setHex(corEsq)
    matIrisEsq.emissive.setHex(corEsq)

    matCabelo.color.setHex(novaAparencia.corCabelo)
    matRoupa.color.setHex(novaAparencia.corRoupaPrincipal)
    matRoupa.map = texturaTecido(novaAparencia.corRoupaPrincipal)
    matRoupa.needsUpdate = true
    matCamisa.color.setHex(novaAparencia.corRoupaSecundaria)
    matCalca.color.setHex(novaAparencia.corCalca)
    matCalca.map = texturaTecido(novaAparencia.corCalca)
    matCalca.needsUpdate = true
    matSapato.color.setHex(novaAparencia.corSapato)

    construirDetalhesFaciais(novaAparencia)
    construirRoupaTorso(novaAparencia.estiloRoupa)
    construirCabeloEAcessorios(novaAparencia)

    // Escala de porte físico no torso/ombros (mantendo a cabeça proporcional)
    const escalaPorteX =
      novaAparencia.porteFisico === 'esguio' ? 0.92 : novaAparencia.porteFisico === 'atletico' ? 1.08 : 1
    peito.scale.set(escalaPorteX, 1, escalaPorteX)
    pescoco.scale.set(1 / escalaPorteX, 1, 1 / escalaPorteX)

    configurarSombrasPersonagem(grupoRaiz)
    diamanteMesh.castShadow = false
    diamanteMesh.receiveShadow = false
    diamanteHalo.castShadow = false
    diamanteHalo.receiveShadow = false
    anelSelecaoChao.castShadow = false
    anelSelecaoChao.receiveShadow = false
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
    propCadernetaCifra,
    propPostitsAgenda,
    propGarrafaVita,
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

    // Interpolação angular suave pelo menor arco
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
    if (carregando !== 'nada') {
      propCafe.visible = carregando === 'xicara_cafe'
      propLivro.visible = carregando === 'livro'
      propTablet.visible = carregando === 'tablet'
      propCadernetaCifra.visible = false
      propPostitsAgenda.visible = false
      propGarrafaVita.visible = false
    } else {
      const propCustom = aparencia.propMao ?? 'nenhum'
      propCafe.visible = propCustom === 'cafe'
      propLivro.visible = propCustom === 'livro'
      propTablet.visible = propCustom === 'tablet'
      propCadernetaCifra.visible = propCustom === 'caderneta_cifra'
      propPostitsAgenda.visible = propCustom === 'agenda_postits'
      propGarrafaVita.visible = propCustom === 'garrafa_vita'
    }

    // 4. Expressões faciais orgânicas: piscar suave, sobrancelhas amortecidas e fala
    const cicloPiscar = (tempoSegundos + semente * 0.13) % 4.3
    const piscando = cicloPiscar > 4.12
    const escalaOlhoY = amortecerValor(olhoEsq.scale.y, piscando ? 0.08 : 1, 28, dt)
    olhoEsq.scale.y = escalaOlhoY
    olhoDir.scale.y = escalaOlhoY

    const humor = sim?.humor ?? 'feliz'
    const anguloSobrancelhaAlvo =
      humor === 'tenso' ? 0.22 : humor === 'exausto' ? -0.18 : humor === 'inspirado' ? -0.12 : 0
    sobrancelhaEsq.rotation.z = amortecerValor(
      sobrancelhaEsq.rotation.z,
      Math.PI * 0.2 - anguloSobrancelhaAlvo,
      10,
      dt,
    )
    sobrancelhaDir.rotation.z = amortecerValor(
      sobrancelhaDir.rotation.z,
      Math.PI * 0.08 + anguloSobrancelhaAlvo,
      10,
      dt,
    )

    const falando =
      sim?.balao?.tipo === 'fala' ||
      sim?.estadoBackend === 'falando' ||
      sim?.interacaoAtual?.opcao.categoria === 'social'
    if (falando) {
      boca.scale.y = amortecerValor(
        boca.scale.y,
        1 + Math.abs(Math.sin(tempoSegundos * 13)) * 1.45,
        20,
        dt,
      )
      boca.scale.x = amortecerValor(
        boca.scale.x,
        0.9 + Math.sin(tempoSegundos * 9.5) * 0.14,
        20,
        dt,
      )
    } else {
      boca.scale.y = amortecerValor(boca.scale.y, 1, 14, dt)
      boca.scale.x = amortecerValor(boca.scale.x, 1, 14, dt)
    }

    // 5. Pose alvo da postura atual
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
        estiloCam === 'energizado' ? 0.66 : estiloCam === 'sereno' ? 0.46 : 0.56
      const quiqueVertical =
        estiloCam === 'energizado' ? 0.04 : estiloCam === 'sereno' ? 0.016 : 0.026

      pelveYAlvo = 0.56 + Math.abs(cosW) * quiqueVertical - 0.01
      pelveRy = senW * 0.09
      pelveRz = cosW * 0.035

      colRx = estiloCam === 'confiante' ? -0.03 : 0.05
      peitoRy = -senW * 0.08
      peitoRz = -cosW * 0.025

      coxaERx = senW * amplitudePassada
      pantERx = Math.max(0.05, cosW * 0.62 + 0.24)
      peERx = -senW * 0.26 - 0.04

      coxaDRx = senOp * amplitudePassada
      pantDRx = Math.max(0.05, cosOp * 0.62 + 0.24)
      peDRx = -senOp * 0.26 - 0.04

      const ampBraco = estiloCam === 'confiante' ? 0.5 : 0.42
      ombERx = senOp * ampBraco
      ombERz = estiloCam === 'confiante' ? 0.13 : 0.08
      antERx = -0.26 - Math.max(0, senOp * 0.3)
      maoERx = cosOp * 0.12

      ombDRx = senW * ampBraco
      ombDRz = estiloCam === 'confiante' ? -0.13 : -0.08
      antDRx = -0.26 - Math.max(0, senW * 0.3)
      maoDRx = cosW * 0.12

      if (carregando === 'xicara_cafe') {
        ombDRx = -0.45
        antDRx = -0.85
        maoDRx = 0.1
      } else if (carregando === 'livro' || carregando === 'tablet') {
        ombERx = -0.45
        antERx = -0.82
      }

      cabRy = Math.sin(w * 0.5) * 0.06
      cabRx = estiloCam === 'confiante' ? -0.04 : 0.02
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

    // 6. Amortecimento de todas as articulações até a pose alvo
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
