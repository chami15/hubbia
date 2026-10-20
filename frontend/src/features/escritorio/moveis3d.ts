import * as THREE from 'three'
import { AGENTES } from './agentes'
import { categoriaDe } from './catalogo'
import type { Paleta } from './sala'
import type { Direcao } from './sala'
import type { MovelSala } from './sala-dados'
import {
  texturaGramado,
  texturaMadeira,
  texturaPisoLadrilho,
  texturaTecido,
  texturaTelaMonitor,
} from './texturas3d'

// ---------------------------------------------------------------------------
// LOTE E MOBÍLIA 3D
//
// O terreno em volta (gramado, calçada, rua, árvores), a laje e o piso do
// escritório, as 4 paredes com janela (que se cortam na frente da câmera)
// e um modelo 3D por categoria do catálogo, com texturas procedurais de
// texturas3d.ts. Porta tem a folha num pivô, que a cena 3D abre quando
// alguém chega perto.
// ---------------------------------------------------------------------------

export type ModoParedesSims = 'cortadas' | 'altas' | 'baixas'

export interface Parede3DControlavel {
  direcaoNormal: THREE.Vector3
  malhaAlta: THREE.Group
  malhaCortada: THREE.Mesh
}

export interface LoteVizinhanca3D {
  grupo: THREE.Group
  pisoInterativo: THREE.Mesh
  paredes: Parede3DControlavel[]
  arvores: THREE.Group[]
  pontoPortalRua: { coluna: number; linha: number }
  atualizarModoParedes: (modo: ModoParedesSims, posicaoCamera: THREE.Vector3, centroLote: THREE.Vector3) => void
  animarVizinhanca: (tempoSegundos: number) => void
}

const ALTURA_PAREDE_3D = 2.65
const ALTURA_CORTE_PAREDE_3D = 0.24
const ESPESSURA_PAREDE_3D = 0.14

export function direcaoParaAnguloY(direcao: Direcao): number {
  switch (direcao) {
    case 'NE':
      return 0
    case 'NW':
      return Math.PI / 2
    case 'SW':
      return Math.PI
    case 'SE':
      return -Math.PI / 2
  }
}

export function criarLoteVizinhanca3D(
  colunas: number,
  linhas: number,
  paleta: Paleta,
): LoteVizinhanca3D {
  const grupo = new THREE.Group()
  const arvores: THREE.Group[] = []

  const cx = (colunas - 1) / 2
  const cz = (linhas - 1) / 2

  // 1. Gramado em volta do lote
  const geoGrama = new THREE.PlaneGeometry(56, 56)
  geoGrama.rotateX(-Math.PI / 2)
  const matGrama = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaGramado(),
    roughness: 0.88,
  })
  const grama = new THREE.Mesh(geoGrama, matGrama)
  grama.position.set(cx, -0.22, cz)
  grama.receiveShadow = true
  grupo.add(grama)

  // 2. Rua asfaltada e calçada na frente do lote (eixo Z positivo)
  const zRua = linhas + 3.2
  const calcada = new THREE.Mesh(
    new THREE.BoxGeometry(56, 0.08, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72 }),
  )
  calcada.position.set(cx, -0.18, zRua - 1.4)
  calcada.receiveShadow = true
  grupo.add(calcada)

  const rua = new THREE.Mesh(
    new THREE.BoxGeometry(56, 0.06, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }),
  )
  rua.position.set(cx, -0.2, zRua + 1.1)
  rua.receiveShadow = true
  grupo.add(rua)

  // Faixas tracejadas amarelas na rua
  const matFaixa = new THREE.MeshBasicMaterial({ color: 0xfef08a })
  for (let fx = -18; fx <= 24; fx += 3.2) {
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.14), matFaixa)
    faixa.position.set(fx, -0.19, zRua + 1.1)
    grupo.add(faixa)
  }

  // Passarela de pedras da calçada até a entrada do lote (Portal de Chegada/Saída)
  const passarela = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.055, 2.9),
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      map: texturaPisoLadrilho(0xcbd5e1, 0x94a3b8),
      roughness: 0.65,
    }),
  )
  passarela.position.set(cx, -0.185, linhas + 0.55)
  passarela.receiveShadow = true
  grupo.add(passarela)

  // Caixa de correio e poste na frente do lote (ponto de chegada de quem vem da rua)
  const caixaCorreio = new THREE.Group()
  const hasteCorreio = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.85, 10),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.3 }),
  )
  hasteCorreio.position.y = 0.425
  const topoCorreio = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.18, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.3, roughness: 0.4 }),
  )
  topoCorreio.position.set(0, 0.86, 0)
  const bandeirinha = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.14, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xef4444 }),
  )
  bandeirinha.position.set(0.12, 0.92, 0.05)
  caixaCorreio.add(hasteCorreio, topoCorreio, bandeirinha)
  caixaCorreio.position.set(cx + 1.25, -0.18, linhas + 1.25)
  habilitarSombraGrupo(caixaCorreio)
  grupo.add(caixaCorreio)

  // 3. Árvores e arbustos 3D ao redor do lote
  const posicoesArvores: [number, number, number][] = [
    [-2.8, -1.8, 1.1],
    [-3.2, linhas + 0.5, 0.95],
    [colunas + 2.2, -1.5, 1.2],
    [colunas + 2.6, linhas + 0.4, 1.0],
    [cx - 5.5, -3.2, 1.15],
    [cx + 5.5, -2.8, 1.05],
  ]

  for (const [ax, az, esc] of posicoesArvores) {
    const arvore = criarArvoreVizinhanca3D(esc)
    arvore.position.set(ax, -0.22, az)
    grupo.add(arvore)
    arvores.push(arvore)
  }

  // 4. Fundação / Laje de concreto do escritório
  const largLote = colunas
  const profLote = linhas
  const laje = new THREE.Mesh(
    new THREE.BoxGeometry(largLote + 0.32, 0.22, profLote + 0.32),
    new THREE.MeshStandardMaterial({ color: paleta.lajeFrente, roughness: 0.65 }),
  )
  laje.position.set(cx, -0.11, cz)
  laje.receiveShadow = true
  laje.castShadow = true
  grupo.add(laje)

  // 5. Piso em ladrilhos 3D com textura de alta definição
  const grupoLadrilhos = new THREE.Group()
  const geoTile = new THREE.BoxGeometry(0.992, 0.022, 0.992)
  const texLadrilho = texturaPisoLadrilho(paleta.pisoClaro, paleta.pisoEscuro)
  const matClaro = new THREE.MeshStandardMaterial({
    color: paleta.pisoClaro,
    map: texLadrilho,
    roughness: 0.35,
    metalness: 0.06,
  })
  const matEscuro = new THREE.MeshStandardMaterial({
    color: paleta.pisoEscuro,
    map: texLadrilho,
    roughness: 0.38,
    metalness: 0.06,
  })

  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const tile = new THREE.Mesh(geoTile, (c + l) % 2 === 0 ? matClaro : matEscuro)
      tile.position.set(c, 0, l)
      tile.receiveShadow = true
      grupoLadrilhos.add(tile)
    }
  }
  grupo.add(grupoLadrilhos)

  // Plano invisível expandido (inclui passarela frontal) para Raycast de cliques no chão
  const geoPisoRaycast = new THREE.PlaneGeometry(largLote + 4, profLote + 5)
  geoPisoRaycast.rotateX(-Math.PI / 2)
  const pisoInterativo = new THREE.Mesh(
    geoPisoRaycast,
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  pisoInterativo.position.set(cx, 0.012, cz + 1)
  pisoInterativo.name = 'piso-interativo'
  grupo.add(pisoInterativo)

  // 6. As 4 paredes com janela; as da frente da câmera se cortam (modo 'cortadas')
  const paredes: Parede3DControlavel[] = [
    criarParedeComJanela3D(
      largLote + ESPESSURA_PAREDE_3D,
      new THREE.Vector3(cx, 0, -0.5 - ESPESSURA_PAREDE_3D / 2),
      0,
      new THREE.Vector3(0, 0, 1),
      paleta.paredeDireita,
      paleta,
    ),
    criarParedeComJanela3D(
      profLote + ESPESSURA_PAREDE_3D,
      new THREE.Vector3(-0.5 - ESPESSURA_PAREDE_3D / 2, 0, cz),
      Math.PI / 2,
      new THREE.Vector3(1, 0, 0),
      paleta.paredeEsquerda,
      paleta,
    ),
    criarParedeComJanela3D(
      largLote + ESPESSURA_PAREDE_3D,
      new THREE.Vector3(cx, 0, linhas - 0.5 + ESPESSURA_PAREDE_3D / 2),
      0,
      new THREE.Vector3(0, 0, -1),
      paleta.paredeDireita,
      paleta,
    ),
    criarParedeComJanela3D(
      profLote + ESPESSURA_PAREDE_3D,
      new THREE.Vector3(colunas - 0.5 + ESPESSURA_PAREDE_3D / 2, 0, cz),
      Math.PI / 2,
      new THREE.Vector3(-1, 0, 0),
      paleta.paredeEsquerda,
      paleta,
    ),
  ]

  for (const p of paredes) {
    grupo.add(p.malhaAlta, p.malhaCortada)
  }

  // reaproveitado todo quadro (antes um Vector3 novo por chamada)
  const vetorCamera = new THREE.Vector3()
  function atualizarModoParedes(
    modo: ModoParedesSims,
    posicaoCamera: THREE.Vector3,
    centroLote: THREE.Vector3,
  ) {
    const dirCamera = vetorCamera.subVectors(posicaoCamera, centroLote).normalize()

    for (const p of paredes) {
      if (modo === 'altas') {
        p.malhaAlta.visible = true
        p.malhaCortada.visible = false
      } else if (modo === 'baixas') {
        p.malhaAlta.visible = false
        p.malhaCortada.visible = true
      } else {
        const produto = p.direcaoNormal.dot(dirCamera)
        const deveCortar = produto < 0.08
        p.malhaAlta.visible = !deveCortar
        p.malhaCortada.visible = deveCortar
      }
    }
  }

  function animarVizinhanca(tempoSegundos: number) {
    arvores.forEach((arv, idx) => {
      arv.rotation.z = Math.sin(tempoSegundos * 1.4 + idx) * 0.025
      arv.rotation.x = Math.cos(tempoSegundos * 1.1 + idx) * 0.018
    })
  }

  return {
    grupo,
    pisoInterativo,
    paredes,
    arvores,
    pontoPortalRua: { coluna: Number(cx.toFixed(2)), linha: Number((linhas + 1.15).toFixed(2)) },
    atualizarModoParedes,
    animarVizinhanca,
  }
}

function habilitarSombraGrupo(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
}

function criarArvoreVizinhanca3D(escala = 1): THREE.Group {
  const g = new THREE.Group()
  const tronco = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 1.3, 12),
    new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      map: texturaMadeira(0x6b4423),
      roughness: 0.85,
    }),
  )
  tronco.position.y = 0.65
  tronco.castShadow = true
  g.add(tronco)

  const matFolhas1 = new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.72 })
  const matFolhas2 = new THREE.MeshStandardMaterial({ color: 0x3b854f, roughness: 0.72 })

  const copa1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), matFolhas1)
  copa1.position.set(0, 1.75, 0)
  copa1.castShadow = true
  const copa2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 1), matFolhas2)
  copa2.position.set(0.32, 2.25, 0.18)
  copa2.castShadow = true
  const copa3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), matFolhas2)
  copa3.position.set(-0.28, 2.1, -0.22)
  copa3.castShadow = true

  g.add(copa1, copa2, copa3)
  g.scale.setScalar(escala)
  return g
}

function criarParedeComJanela3D(
  comprimento: number,
  posicao: THREE.Vector3,
  rotacaoY: number,
  direcaoNormal: THREE.Vector3,
  corParede: number,
  paleta: Paleta,
): Parede3DControlavel {
  const matParede = new THREE.MeshStandardMaterial({ color: corParede, roughness: 0.72 })
  const matTopo = new THREE.MeshStandardMaterial({ color: paleta.paredeTopo, roughness: 0.55 })
  const matRodape = new THREE.MeshStandardMaterial({ color: paleta.rodape, roughness: 0.55 })
  const matMoldura = new THREE.MeshStandardMaterial({ color: paleta.janelaMoldura, roughness: 0.35 })
  const matVidro = new THREE.MeshPhysicalMaterial({
    color: paleta.janelaVidro,
    transparent: true,
    opacity: 0.34,
    roughness: 0.08,
    transmission: 0.5,
  })

  const malhaAlta = new THREE.Group()
  malhaAlta.position.copy(posicao)
  malhaAlta.rotation.y = rotacaoY

  const largJanela = Math.min(2.1, comprimento * 0.34)
  const largLado = (comprimento - largJanela) / 2
  const altPeitoril = 0.85
  const altJanela = 1.25
  const altVerga = ALTURA_PAREDE_3D - altPeitoril - altJanela

  const pilarEsq = new THREE.Mesh(
    new THREE.BoxGeometry(largLado, ALTURA_PAREDE_3D, ESPESSURA_PAREDE_3D),
    matParede,
  )
  pilarEsq.position.set(-comprimento / 2 + largLado / 2, ALTURA_PAREDE_3D / 2, 0)
  pilarEsq.castShadow = true
  pilarEsq.receiveShadow = true

  const pilarDir = new THREE.Mesh(
    new THREE.BoxGeometry(largLado, ALTURA_PAREDE_3D, ESPESSURA_PAREDE_3D),
    matParede,
  )
  pilarDir.position.set(comprimento / 2 - largLado / 2, ALTURA_PAREDE_3D / 2, 0)
  pilarDir.castShadow = true
  pilarDir.receiveShadow = true

  const baixoJanela = new THREE.Mesh(
    new THREE.BoxGeometry(largJanela, altPeitoril, ESPESSURA_PAREDE_3D),
    matParede,
  )
  baixoJanela.position.set(0, altPeitoril / 2, 0)
  baixoJanela.castShadow = true
  baixoJanela.receiveShadow = true

  const cimaJanela = new THREE.Mesh(
    new THREE.BoxGeometry(largJanela, altVerga, ESPESSURA_PAREDE_3D),
    matParede,
  )
  cimaJanela.position.set(0, altPeitoril + altJanela + altVerga / 2, 0)
  cimaJanela.castShadow = true

  const vidro = new THREE.Mesh(
    new THREE.BoxGeometry(largJanela - 0.08, altJanela - 0.08, 0.03),
    matVidro,
  )
  vidro.position.set(0, altPeitoril + altJanela / 2, 0)

  const peitoril = new THREE.Mesh(
    new THREE.BoxGeometry(largJanela + 0.12, 0.06, ESPESSURA_PAREDE_3D + 0.05),
    matMoldura,
  )
  peitoril.position.set(0, altPeitoril, 0)

  const caixilhoVertical = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, altJanela, ESPESSURA_PAREDE_3D + 0.02),
    matMoldura,
  )
  caixilhoVertical.position.set(0, altPeitoril + altJanela / 2, 0)

  const rodape = new THREE.Mesh(
    new THREE.BoxGeometry(comprimento, 0.11, ESPESSURA_PAREDE_3D + 0.02),
    matRodape,
  )
  rodape.position.set(0, 0.055, 0)

  const topo = new THREE.Mesh(
    new THREE.BoxGeometry(comprimento, 0.06, ESPESSURA_PAREDE_3D + 0.02),
    matTopo,
  )
  topo.position.set(0, ALTURA_PAREDE_3D + 0.03, 0)

  malhaAlta.add(
    pilarEsq,
    pilarDir,
    baixoJanela,
    cimaJanela,
    vidro,
    peitoril,
    caixilhoVertical,
    rodape,
    topo,
  )

  const malhaCortada = new THREE.Mesh(
    new THREE.BoxGeometry(comprimento, ALTURA_CORTE_PAREDE_3D, ESPESSURA_PAREDE_3D),
    matTopo,
  )
  malhaCortada.position.copy(posicao)
  malhaCortada.position.y = ALTURA_CORTE_PAREDE_3D / 2
  malhaCortada.rotation.y = rotacaoY
  malhaCortada.receiveShadow = true

  return {
    direcaoNormal,
    malhaAlta,
    malhaCortada,
  }
}

// ---------------------------------------------------------------------------
// CONSTRUTOR DE MÓVEIS E OBJETOS 3D NÍTIDOS (`criarMovel3D`)
// ---------------------------------------------------------------------------
export function criarMovel3D(movel: MovelSala): THREE.Group {
  const grupo = new THREE.Group()
  grupo.name = `movel-${movel.id}`
  grupo.userData = { movelId: movel.id }

  const p = movel.peca
  const cat = categoriaDe(p)
  const corAgente = movel.agente
    ? (AGENTES.find((a) => a.id === movel.agente)?.cor ?? 0x3b82f6)
    : null

  const matMadeiraClara = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaMadeira(0xd4a373),
    roughness: 0.45,
    metalness: 0.05,
  })
  const matMadeiraEscura = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaMadeira(0x6b4423),
    roughness: 0.5,
    metalness: 0.05,
  })
  const matMetalEscuro = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.62,
    roughness: 0.28,
  })
  const matMetalCromo = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.8,
    roughness: 0.2,
  })
  const matBranco = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })

  if (p.startsWith('desk')) {
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.055, 0.65), matMadeiraClara)
    tampo.position.set(0, 0.73, 0)
    grupo.add(tampo)

    const painelFrontal = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.32, 0.03), matMadeiraEscura)
    painelFrontal.position.set(0, 0.54, -0.22)
    grupo.add(painelFrontal)

    const gaveteiro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.56), matMetalEscuro)
    gaveteiro.position.set(0.35, 0.48, 0)
    grupo.add(gaveteiro)

    for (const [lx, lz] of [
      [-0.49, -0.26],
      [-0.49, 0.26],
      [0.49, -0.26],
      [0.49, 0.26],
    ]) {
      const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 12), matMetalEscuro)
      perna.position.set(lx, 0.36, lz)
      grupo.add(perna)
    }
  } else if (p.startsWith('chairDesk')) {
    const corEstofado = corAgente ?? 0x334155
    const matEstofado = new THREE.MeshStandardMaterial({
      color: corEstofado,
      map: texturaTecido(corEstofado),
      roughness: 0.48,
    })

    const baseCentral = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 12), matMetalEscuro)
    baseCentral.position.set(0, 0.2, 0)
    grupo.add(baseCentral)

    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5
      const haste = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.26), matMetalEscuro)
      haste.position.set(Math.sin(a) * 0.12, 0.04, Math.cos(a) * 0.12)
      haste.rotation.y = a
      grupo.add(haste)
    }

    const assento = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.075, 0.46), matEstofado)
    assento.position.set(0, 0.41, 0)
    grupo.add(assento)

    const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.065), matEstofado)
    encosto.position.set(0, 0.68, -0.2)
    encosto.rotation.x = -0.08
    grupo.add(encosto)

    for (const lado of [-1, 1]) {
      const apoio = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.28), matMetalEscuro)
      apoio.position.set(lado * 0.24, 0.52, -0.02)
      grupo.add(apoio)
    }
  } else if (p.startsWith('computerScreen')) {
    const texTela = texturaTelaMonitor(String(corAgente ?? 'geral'))
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.018, 0.16), matMetalEscuro)
    base.position.set(0, 0.01, 0)
    const haste = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.03), matMetalEscuro)
    haste.position.set(0, 0.09, -0.03)
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.35, 0.03), matMetalEscuro)
    moldura.position.set(0, 0.28, 0)
    const tela = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.31),
      new THREE.MeshBasicMaterial({ map: texTela }),
    )
    tela.position.set(0, 0.28, 0.017)
    grupo.add(base, haste, moldura, tela)
  } else if (p.startsWith('computerKeyboard')) {
    const teclado = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.12), matMetalEscuro)
    teclado.position.set(0, 0.015, 0)
    grupo.add(teclado)
  } else if (p.startsWith('computerMouse')) {
    const mouse = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.04, 8, 12), matBranco)
    mouse.rotation.x = Math.PI / 2
    mouse.position.set(0, 0.02, 0)
    grupo.add(mouse)
  } else if (p.startsWith('laptop')) {
    const texTela = texturaTelaMonitor('laptop')
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.24), matMetalCromo)
    base.position.set(0, 0.01, 0)
    const tampa = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.015), matMetalCromo)
    tampa.position.set(0, 0.12, -0.11)
    tampa.rotation.x = -0.2
    const tela = new THREE.Mesh(
      new THREE.PlaneGeometry(0.31, 0.19),
      new THREE.MeshBasicMaterial({ map: texTela }),
    )
    tela.position.set(0, 0.12, -0.1)
    tela.rotation.x = -0.2
    grupo.add(base, tampa, tela)
  } else if (p.includes('CoffeeMachine')) {
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.26), matMetalEscuro)
    corpo.position.set(0, 0.18, 0)
    const bico = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 14), matMetalCromo)
    bico.position.set(0, 0.22, 0.12)
    const caneca = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 14), matBranco)
    caneca.position.set(0, 0.06, 0.11)
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
    )
    led.position.set(0.08, 0.3, 0.132)
    grupo.add(corpo, bico, caneca, led)
  } else if (p.includes('Fridge')) {
    // Geladeira Duplex 3D
    const alt = p.includes('Small') ? 0.95 : 1.72
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.72, alt, 0.68), matMetalCromo)
    corpo.position.set(0, alt / 2, 0)
    const puxador = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, alt * 0.45, 10), matMetalEscuro)
    puxador.position.set(0.26, alt * 0.55, 0.355)
    grupo.add(corpo, puxador)
  } else if (cat === 'cozinha') {
    const gabinete = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.74, 0.58), matMadeiraEscura)
    gabinete.position.set(0, 0.37, 0)
    const bancada = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.62), matBranco)
    bancada.position.set(0, 0.76, 0)
    grupo.add(gabinete, bancada)
  } else if (p.startsWith('lounge') || p.startsWith('bench')) {
    const matSofa = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      map: texturaTecido(0x0284c7),
      roughness: 0.6,
    })
    const matAlmofada = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      map: texturaTecido(0x38bdf8),
      roughness: 0.55,
    })
    const larg = p.includes('Chair') ? 0.85 : p.includes('Long') ? 1.85 : 1.55

    const base = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.28, 0.78), matSofa)
    base.position.set(0, 0.2, 0)
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.48, 0.2), matSofa)
    encosto.position.set(0, 0.52, -0.29)
    const bracoE = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.78), matSofa)
    bracoE.position.set(-larg / 2 + 0.08, 0.36, 0)
    const bracoD = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.78), matSofa)
    bracoD.position.set(larg / 2 - 0.08, 0.36, 0)
    const almofada = new THREE.Mesh(new THREE.BoxGeometry(larg - 0.34, 0.1, 0.56), matAlmofada)
    almofada.position.set(0, 0.37, 0.06)
    grupo.add(base, encosto, bracoE, bracoD, almofada)
  } else if (cat === 'assentos') {
    const matAssento = new THREE.MeshStandardMaterial({
      color: 0x475569,
      map: texturaTecido(0x475569),
      roughness: 0.52,
    })
    const assento = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.48), matAssento)
    assento.position.set(0, 0.42, 0)
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.06), matAssento)
    encosto.position.set(0, 0.66, -0.21)
    grupo.add(assento, encosto)
    for (const [lx, lz] of [
      [-0.2, -0.2],
      [-0.2, 0.2],
      [0.2, -0.2],
      [0.2, 0.2],
    ]) {
      const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 10), matMetalCromo)
      perna.position.set(lx, 0.21, lz)
      grupo.add(perna)
    }
  } else if (p.startsWith('bookcase') || cat === 'guardar') {
    const estrutura = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.65, 0.34), matMadeiraEscura)
    estrutura.position.set(0, 0.825, 0)
    grupo.add(estrutura)

    const coresLivros = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6]
    for (let nivel = 0; nivel < 3; nivel++) {
      for (let i = 0; i < 5; i++) {
        const livro = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.26, 0.22),
          new THREE.MeshStandardMaterial({ color: coresLivros[(nivel + i) % coresLivros.length] }),
        )
        livro.position.set(-0.28 + i * 0.14, 0.38 + nivel * 0.46, 0.06)
        grupo.add(livro)
      }
    }
  } else if (cat === 'luz') {
    // Luminária 3D com cúpula emissiva quente
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.25, 12), matMetalCromo)
    haste.position.set(0, 0.625, 0)
    const cupula = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.28, 18, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.7,
        side: THREE.DoubleSide,
      }),
    )
    cupula.position.set(0, 1.28, 0)
    grupo.add(haste, cupula)
  } else if (cat === 'eletro') {
    if (p.startsWith('television')) {
      const texTV = texturaTelaMonitor('tv')
      const painel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.68, 0.05), matMetalEscuro)
      painel.position.set(0, 0.65, 0)
      const tela = new THREE.Mesh(
        new THREE.PlaneGeometry(1.08, 0.61),
        new THREE.MeshBasicMaterial({ map: texTV }),
      )
      tela.position.set(0, 0.65, 0.027)
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.24), matMetalEscuro)
      base.position.set(0, 0.28, 0)
      grupo.add(painel, tela, base)
    } else {
      // Caixa de som / Rádio Hi-Fi
      const caixa = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.32), matMetalEscuro)
      caixa.position.set(0, 0.34, 0)
      const cone1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.04, 16), matMetalCromo)
      cone1.rotation.x = Math.PI / 2
      cone1.position.set(0, 0.46, 0.16)
      const cone2 = cone1.clone()
      cone2.position.y = 0.22
      grupo.add(caixa, cone1, cone2)
    }
  } else if (cat === 'verde') {
    const vaso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.16, 0.36, 16),
      new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.65 }),
    )
    vaso.position.set(0, 0.18, 0)
    grupo.add(vaso)

    const matFolha = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.48 })
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8
      const folha = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), matFolha)
      folha.scale.set(0.65, 1.45, 0.35)
      folha.position.set(Math.sin(a) * 0.14, 0.52 + (i % 2) * 0.12, Math.cos(a) * 0.14)
      folha.rotation.y = a
      folha.rotation.x = 0.35
      grupo.add(folha)
    }
  } else if (cat === 'mesas') {
    const matVidroMesa = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.6,
      roughness: 0.08,
    })
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.98), matVidroMesa)
    tampo.position.set(0, 0.72, 0)
    grupo.add(tampo)
    for (const [lx, lz] of [
      [-0.42, -0.42],
      [-0.42, 0.42],
      [0.42, -0.42],
      [0.42, 0.42],
    ]) {
      const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 12), matMetalCromo)
      perna.position.set(lx, 0.36, lz)
      grupo.add(perna)
    }
  } else if (p.startsWith('doorway') || movel.leva) {
    // Porta arquitetônica 3D com folha pivotante (`folhaPortaPivo`) que abre quando um Sim passa!
    const batenteEsq = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.1, 0.18), matMadeiraEscura)
    batenteEsq.position.set(-0.44, 1.05, 0)
    const batenteDir = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.1, 0.18), matMadeiraEscura)
    batenteDir.position.set(0.44, 1.05, 0)
    const batenteSup = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.18), matMadeiraEscura)
    batenteSup.position.set(0, 2.06, 0)
    grupo.add(batenteEsq, batenteDir, batenteSup)

    const pivoPorta = new THREE.Group()
    pivoPorta.name = 'folhaPortaPivo'
    pivoPorta.position.set(-0.39, 0, 0)

    const folhaPorta = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.98, 0.08), matMadeiraClara)
    folhaPorta.position.set(0.39, 1.0, 0)
    const macaneta = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), matMetalCromo)
    macaneta.position.set(0.68, 0.96, 0.065)
    const macanetaTras = macaneta.clone()
    macanetaTras.position.z = -0.065

    pivoPorta.add(folhaPorta, macaneta, macanetaTras)
    grupo.add(pivoPorta)

    if (movel.leva) {
      const tapetePorta = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.02, 0.48),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45 }),
      )
      tapetePorta.position.set(0, 0.015, 0.36)
      grupo.add(tapetePorta)
    }
  } else if (cat === 'chao') {
    const tapete = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.018, 1.2),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        map: texturaTecido(0x334155),
        roughness: 0.85,
      }),
    )
    tapete.position.set(0, 0.01, 0)
    grupo.add(tapete)
  } else if (cat === 'quarto') {
    // Cama 3D aconchegante
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.85), matMadeiraEscura)
    base.position.set(0, 0.16, 0)
    const colchao = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.22, 1.75),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, map: texturaTecido(0x3b82f6), roughness: 0.6 }),
    )
    colchao.position.set(0, 0.36, 0)
    const travesseiro = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.1, 0.32), matBranco)
    travesseiro.position.set(0, 0.5, -0.62)
    grupo.add(base, colchao, travesseiro)
  } else {
    const bloco = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), matMadeiraClara)
    bloco.position.set(0, 0.325, 0)
    grupo.add(bloco)
  }

  grupo.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true
      obj.receiveShadow = true
      obj.userData = { movelId: movel.id }
    }
  })

  posicionarMovel3D(grupo, movel)
  return grupo
}

export function posicionarMovel3D(grupo: THREE.Group, movel: MovelSala) {
  const yBase = movel.sobre ? 0.755 : (movel.altura ?? 0) * 4.2
  grupo.position.set(movel.coluna, yBase, movel.linha)
  grupo.rotation.y = direcaoParaAnguloY(movel.direcao)
}
