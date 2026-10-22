import * as THREE from 'three'
import { AGENTES } from './agentes'
import { categoriaDe } from './catalogo'
import { obterGeometriaBlender } from './malhas-blender'
import { PALETAS, type Direcao, type Paleta } from './sala'
import type { MovelSala } from './sala-dados'
import {
  texturaGramado,
  texturaMadeira,
  texturaPisoLadrilho,
  texturaTecido,
  texturaTelaMonitor,
} from './texturas3d'

// ---------------------------------------------------------------------------
// FÓRMULA DE MOBÍLIA 3D E CONSTRUTOR DO LOTE
//
// Cada uma das 140 peças do catálogo é traduzida em geometria 3D através de
// uma FÓRMULA PARAMÉTRICA (`extrairReceitaMovel3D` + construtores modulares
// por família):
//   1. `extrairReceitaMovel3D(peca)` decodifica o identificador da peça em
//      parâmetros geométricos: família, formato (`redondo`, `canto`, `quadrado`,
//      `arredondado`, `cruzado`), porte (`pequeno`, `padrao`, `largo`, `longo`,
//      `baixo`, `alto`), acabamento (`vidro`, `toalha`, `estofado`, `armacao`,
//      `portas`, `gavetas`, `aereo`, `embutido`, `duplo`, `empilhado`, `aberto`)
//      e montagem (`chao`, `mesa`, `teto`, `parede`, `pe`).
//   2. Cada família constrói a malha 3D combinando primitivas suaves (tampos
//      chanfrados, estofados boleados, pés torneados, vidros translúcidos,
//      eletrodomésticos detalhados, louças sanitárias esculpidas, plantas por
//      espécie e iluminação emissiva).
//   3. Para adicionar novas peças no futuro, basta seguir a convenção de
//      nomenclatura (prefixo da família + modificadores) ou registrar um
//      construtor de família dedicado.
// ---------------------------------------------------------------------------

export const TAMANHO_TILE_3D = 1.0
export const ALTURA_PAREDE_3D = 2.65
export const ALTURA_CORTE_PAREDE_3D = 0.24
export const ESPESSURA_PAREDE_3D = 0.14

export type ModoParedesSims = 'cortadas' | 'altas' | 'baixas'

export type FamiliaMovel3D =
  | 'mesa_trabalho'
  | 'cadeira_escritorio'
  | 'monitor'
  | 'teclado'
  | 'mouse'
  | 'notebook'
  | 'sofa_lounge'
  | 'poltrona_lounge'
  | 'pufe'
  | 'banco'
  | 'banqueta'
  | 'cadeira'
  | 'almofada'
  | 'mesa_centro'
  | 'mesa_lateral'
  | 'mesa_jantar'
  | 'estante'
  | 'livros'
  | 'criado_mudo'
  | 'rack_tv'
  | 'cabideiro'
  | 'caixa_papelao'
  | 'lixeira'
  | 'luminaria'
  | 'ventilador_teto'
  | 'planta_vaso'
  | 'tapete'
  | 'piso_decorativo'
  | 'parede_interna'
  | 'porta'
  | 'lambri'
  | 'escada'
  | 'televisao'
  | 'caixa_som'
  | 'radio'
  | 'cafeteira'
  | 'geladeira'
  | 'micro_ondas'
  | 'liquidificador'
  | 'torradeira'
  | 'fogao'
  | 'pia_cozinha'
  | 'coifa'
  | 'balcao_ilha'
  | 'armario_cozinha'
  | 'pia_banheiro'
  | 'espelho_banheiro'
  | 'armario_banheiro'
  | 'banheira'
  | 'box_chuveiro'
  | 'vaso_sanitario'
  | 'lavadora_secadora'
  | 'cama'
  | 'urso_pelucia'

export interface ReceitaMovel3D {
  peca: string
  categoria: string
  familia: FamiliaMovel3D
  canto: boolean
  redondo: boolean
  arredondado: boolean
  quadrado: boolean
  vidro: boolean
  toalha: boolean
  cruzado: boolean
  grande: boolean
  pequeno: boolean
  longo: boolean
  largo: boolean
  baixo: boolean
  aberto: boolean
  fechado: boolean
  portas: boolean
  gavetas: boolean
  moderno: boolean
  estofado: boolean
  armacao: boolean
  design: boolean
  reclinavel: boolean
  retro: boolean
  antena: boolean
  montagem: 'chao' | 'mesa' | 'teto' | 'parede' | 'pe'
  embutido: boolean
  eletrico: boolean
  aereo: boolean
  duplo: boolean
  simples: boolean
  interno: boolean
  capacho: boolean
  retangular: boolean
  azul: boolean
  frontal: boolean
  ponta: boolean
  metade: boolean
  correr: boolean
  empilhado: boolean
  varianteNumero: 1 | 2 | 3
}

// Decodifica o nome da peça na receita paramétrica 3D
export function extrairReceitaMovel3D(peca: string): ReceitaMovel3D {
  const tokens = peca
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
  const tem = (t: string) => tokens.includes(t)

  let familia: FamiliaMovel3D = 'caixa_papelao'
  if (peca.startsWith('desk')) familia = 'mesa_trabalho'
  else if (peca.startsWith('chairDesk')) familia = 'cadeira_escritorio'
  else if (peca.startsWith('computerScreen')) familia = 'monitor'
  else if (peca.startsWith('computerKeyboard')) familia = 'teclado'
  else if (peca.startsWith('computerMouse')) familia = 'mouse'
  else if (peca.startsWith('laptop')) familia = 'notebook'
  else if (peca.startsWith('loungeSofaOttoman')) familia = 'pufe'
  else if (peca.startsWith('loungeChair') || peca.startsWith('loungeDesignChair')) familia = 'poltrona_lounge'
  else if (peca.startsWith('lounge')) familia = 'sofa_lounge'
  else if (peca.startsWith('bench')) familia = 'banco'
  else if (peca.startsWith('stool')) familia = 'banqueta'
  else if (peca.startsWith('pillow')) familia = 'almofada'
  else if (peca.startsWith('chair')) familia = 'cadeira'
  else if (peca.startsWith('tableCoffee')) familia = 'mesa_centro'
  else if (peca.startsWith('sideTable')) familia = 'mesa_lateral'
  else if (peca.startsWith('table')) familia = 'mesa_jantar'
  else if (peca.startsWith('bookcase')) familia = 'estante'
  else if (peca.startsWith('books')) familia = 'livros'
  else if (peca.startsWith('cabinetBed')) familia = 'criado_mudo'
  else if (peca.startsWith('cabinetTelevision')) familia = 'rack_tv'
  else if (peca.startsWith('coatRack')) familia = 'cabideiro'
  else if (peca.startsWith('cardboardBox')) familia = 'caixa_papelao'
  else if (peca.startsWith('trashcan')) familia = 'lixeira'
  else if (peca.startsWith('ceilingFan')) familia = 'ventilador_teto'
  else if (peca.startsWith('lamp')) familia = 'luminaria'
  else if (peca.startsWith('plant') || peca.startsWith('pottedPlant')) familia = 'planta_vaso'
  else if (peca.startsWith('rug')) familia = 'tapete'
  else if (peca.startsWith('floor')) familia = 'piso_decorativo'
  else if (peca.startsWith('doorway')) familia = 'porta'
  else if (peca.startsWith('wall')) familia = 'parede_interna'
  else if (peca.startsWith('paneling')) familia = 'lambri'
  else if (peca.startsWith('stairs')) familia = 'escada'
  else if (peca.startsWith('television')) familia = 'televisao'
  else if (peca.startsWith('speaker')) familia = 'caixa_som'
  else if (peca.startsWith('radio')) familia = 'radio'
  else if (peca.startsWith('kitchenCoffeeMachine')) familia = 'cafeteira'
  else if (peca.startsWith('kitchenFridge')) familia = 'geladeira'
  else if (peca.startsWith('kitchenMicrowave')) familia = 'micro_ondas'
  else if (peca.startsWith('kitchenBlender')) familia = 'liquidificador'
  else if (peca.startsWith('toaster')) familia = 'torradeira'
  else if (peca.startsWith('kitchenStove')) familia = 'fogao'
  else if (peca.startsWith('kitchenSink')) familia = 'pia_cozinha'
  else if (peca.startsWith('hood')) familia = 'coifa'
  else if (peca.startsWith('kitchenBar')) familia = 'balcao_ilha'
  else if (peca.startsWith('kitchenCabinet')) familia = 'armario_cozinha'
  else if (peca.startsWith('bathroomSink')) familia = 'pia_banheiro'
  else if (peca.startsWith('bathroomMirror')) familia = 'espelho_banheiro'
  else if (peca.startsWith('bathroomCabinet')) familia = 'armario_banheiro'
  else if (peca.startsWith('bathtub')) familia = 'banheira'
  else if (peca.startsWith('shower')) familia = 'box_chuveiro'
  else if (peca.startsWith('toilet')) familia = 'vaso_sanitario'
  else if (peca.startsWith('washer') || peca.startsWith('dryer')) familia = 'lavadora_secadora'
  else if (peca.startsWith('bed')) familia = 'cama'
  else if (peca.startsWith('bear')) familia = 'urso_pelucia'

  let montagem: ReceitaMovel3D['montagem'] = 'chao'
  if (tem('table')) montagem = 'mesa'
  else if (tem('ceiling') || peca === 'ceilingFan') montagem = 'teto'
  else if (tem('wall') && familia === 'luminaria') montagem = 'parede'
  else if (tem('standing')) montagem = 'pe'

  const varianteNumero: 1 | 2 | 3 = tem('3') ? 3 : tem('2') ? 2 : 1

  return {
    peca,
    categoria: categoriaDe(peca),
    familia,
    canto: tem('corner'),
    redondo: tem('round') || tem('rond'),
    arredondado: tem('rounded'),
    quadrado: tem('square'),
    vidro: tem('glass'),
    toalha: tem('cloth'),
    cruzado: tem('cross'),
    grande: tem('large'),
    pequeno: tem('small'),
    longo: tem('long'),
    largo: tem('wide'),
    baixo: tem('low'),
    aberto: tem('open'),
    fechado: tem('closed'),
    portas: tem('doors'),
    gavetas: tem('drawer') || tem('drawers'),
    moderno: tem('modern'),
    estofado: tem('cushion'),
    armacao: tem('frame'),
    design: tem('design'),
    reclinavel: tem('relax'),
    retro: tem('vintage'),
    antena: tem('antenna'),
    montagem,
    embutido: tem('built'),
    eletrico: tem('electric'),
    aereo: tem('upper'),
    duplo: tem('double') || tem('bunk'),
    simples: tem('single'),
    interno: tem('inner'),
    capacho: tem('doormat'),
    retangular: tem('rectangle'),
    azul: tem('blue'),
    frontal: tem('front'),
    ponta: tem('end'),
    metade: tem('half'),
    correr: tem('slide'),
    empilhado: tem('stacked'),
    varianteNumero,
  }
}

// ---------------------------------------------------------------------------
// CONVERSÃO DE DIREÇÃO ISOMÉTRICA PARA ÂNGULO EULER Y NO THREE.JS
// ---------------------------------------------------------------------------
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
  atualizarModoParedes: (
    modo: ModoParedesSims,
    posicaoCamera: THREE.Vector3,
    centroLote: THREE.Vector3,
  ) => void
  animarVizinhanca: (tempoSegundos: number) => void
}

// ---------------------------------------------------------------------------
// AMBIENTE E VIZINHANÇA 3D (LOTE, JARDIM, CALÇADA, RUA, ÁRVORES E PAREDES)
// ---------------------------------------------------------------------------
export function criarLoteVizinhanca3D(
  colunas: number,
  linhas: number,
  paleta: Paleta = PALETAS.neutra,
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
// HELPERS DE GEOMETRIA SUAVE PARA MOBÍLIA (ESTILO ESTÚDIO DE DESIGN)
// ---------------------------------------------------------------------------

// Cria uma almofada/bloco de cantos boleados usando cilindro ou cápsula
// achatada, evitando quinas vivas de BoxGeometry em sofás, colchões e poltronas.
function criarAlmofadaBoleada(
  largura: number,
  altura: number,
  profundidade: number,
  mat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group()
  const r = Math.min(altura * 0.45, largura * 0.2, profundidade * 0.2)
  const miolo = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(0.02, largura - r * 1.2),
      altura,
      Math.max(0.02, profundidade - r * 1.2),
    ),
    mat,
  )
  g.add(miolo)

  // Bordas cilíndricas frontais e laterais para dar toque macio de estofado
  const bordaFrente = new THREE.Mesh(
    new THREE.CylinderGeometry(altura * 0.48, altura * 0.48, Math.max(0.02, largura - r), 12),
    mat,
  )
  bordaFrente.rotation.z = Math.PI / 2
  bordaFrente.scale.set(1, 1, 0.65)
  bordaFrente.position.z = profundidade / 2 - r * 0.35
  const bordaTras = bordaFrente.clone()
  bordaTras.position.z = -(profundidade / 2 - r * 0.35)
  g.add(bordaFrente, bordaTras)
  return g
}

function adicionarQuatroPernas(
  grupo: THREE.Group,
  larg: number,
  prof: number,
  alt: number,
  raioTopo: number,
  raioBase: number,
  mat: THREE.Material,
  inclinacao = 0,
) {
  const ox = larg / 2
  const oz = prof / 2
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(raioTopo, raioBase, alt, 12), mat)
    perna.position.set(sx * ox, alt / 2, sz * oz)
    if (inclinacao !== 0) {
      perna.rotation.z = -sx * inclinacao
      perna.rotation.x = sz * inclinacao
    }
    grupo.add(perna)
  }
}

// ---------------------------------------------------------------------------
// CONSTRUTOR DE MÓVEIS E OBJETOS 3D BASEADO NA FÓRMULA (`criarMovel3D`)
// ---------------------------------------------------------------------------
export function criarMovel3D(movel: MovelSala): THREE.Group {
  const grupo = new THREE.Group()
  grupo.name = `movel-${movel.id}`
  grupo.userData = { movelId: movel.id }

  const r = extrairReceitaMovel3D(movel.peca)
  const corAgente = movel.agente
    ? (AGENTES.find((a) => a.id === movel.agente)?.cor ?? 0x3b82f6)
    : null

  // Paleta de materiais compartilhados por peça
  const matMadeiraClara = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaMadeira(0xd4a373),
    roughness: 0.44,
    metalness: 0.05,
  })
  const matMadeiraMedia = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaMadeira(0xa47148),
    roughness: 0.46,
    metalness: 0.05,
  })
  const matMadeiraEscura = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texturaMadeira(0x5c3a21),
    roughness: 0.48,
    metalness: 0.05,
  })
  const matMetalEscuro = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.65,
    roughness: 0.28,
  })
  const matMetalCromo = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.82,
    roughness: 0.18,
  })
  const matMetalDourado = new THREE.MeshStandardMaterial({
    color: 0xd4a359,
    metalness: 0.75,
    roughness: 0.24,
  })
  const matBranco = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.26 })
  const matPorcelana = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.14,
    metalness: 0.06,
  })
  const matVidro = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.52,
    roughness: 0.08,
    metalness: 0.1,
  })
  const matEspelho = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.06,
  })

  switch (r.familia) {
    // -----------------------------------------------------------------------
    // 1. ESTAÇÕES DE TRABALHO E ESCRITÓRIO
    // -----------------------------------------------------------------------
    case 'mesa_trabalho': {
      if (r.canto) {
        // Mesa executiva em L (`deskCorner`) com asa lateral e gaveteiro suspenso
        const tampoPrincipal = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.052, 0.64), matMadeiraClara)
        tampoPrincipal.position.set(0, 0.73, -0.12)
        const tampoLateral = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.052, 0.68), matMadeiraClara)
        tampoLateral.position.set(-0.3, 0.73, 0.28)
        const cantoArredondado = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.052, 20), matMadeiraClara)
        cantoArredondado.position.set(-0.27, 0.73, -0.12)
        const saiaFrontal = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.34, 0.03), matMadeiraEscura)
        saiaFrontal.position.set(0.04, 0.53, -0.36)
        const gaveteiro = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.56), matMetalEscuro)
        gaveteiro.position.set(0.38, 0.47, -0.12)
        grupo.add(tampoPrincipal, tampoLateral, cantoArredondado, saiaFrontal, gaveteiro)
        for (const [lx, lz] of [
          [-0.52, -0.38],
          [0.52, -0.38],
          [0.52, 0.14],
          [-0.52, 0.54],
          [-0.08, 0.54],
        ]) {
          const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.72, 12), matMetalEscuro)
          perna.position.set(lx, 0.36, lz)
          grupo.add(perna)
        }
      } else {
        // Mesa de trabalho padrão (`desk`) com borda boleada, calha de cabos e gaveteiro
        const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.64), matMadeiraClara)
        tampo.position.set(0, 0.73, 0)
        const bordaFrente = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.12, 14), matMadeiraClara)
        bordaFrente.rotation.z = Math.PI / 2
        bordaFrente.position.set(0, 0.73, 0.32)
        const painelFrontal = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.32, 0.028), matMadeiraEscura)
        painelFrontal.position.set(0, 0.54, -0.22)
        const gaveteiro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.56), matMetalEscuro)
        gaveteiro.position.set(0.35, 0.48, 0)
        for (const gy of [0.58, 0.44]) {
          const puxador = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.1, 6, 8), matMetalCromo)
          puxador.rotation.z = Math.PI / 2
          puxador.position.set(0.35, gy, 0.29)
          grupo.add(puxador)
        }
        grupo.add(tampo, bordaFrente, painelFrontal, gaveteiro)
        adicionarQuatroPernas(grupo, 0.98, 0.52, 0.72, 0.025, 0.022, matMetalEscuro)
      }
      break
    }

    case 'cadeira_escritorio': {
      const corEstofado = corAgente ?? 0x334155
      const matEstofado = new THREE.MeshStandardMaterial({
        color: corEstofado,
        map: texturaTecido(corEstofado),
        roughness: 0.46,
      })
      const estofado = new THREE.Mesh(obterGeometriaBlender('cadeira_estofado'), matEstofado)
      const estrutura = new THREE.Mesh(obterGeometriaBlender('cadeira_estrutura'), matMetalEscuro)
      grupo.add(estofado, estrutura)
      break
    }

    case 'monitor': {
      const texTela = texturaTelaMonitor(String(corAgente ?? 'geral'))
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.016, 20), matMetalEscuro)
      base.scale.set(1.1, 1, 0.78)
      base.position.set(0, 0.01, 0)
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 12), matMetalCromo)
      haste.position.set(0, 0.1, -0.035)
      haste.rotation.x = -0.12
      const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.35, 0.024), matMetalEscuro)
      moldura.position.set(0, 0.28, 0)
      const tela = new THREE.Mesh(
        new THREE.PlaneGeometry(0.545, 0.315),
        new THREE.MeshBasicMaterial({ map: texTela }),
      )
      tela.position.set(0, 0.28, 0.014)
      grupo.add(base, haste, moldura, tela)
      break
    }

    case 'teclado': {
      const chassi = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.016, 0.12), matMetalCromo)
      chassi.position.set(0, 0.012, 0)
      chassi.rotation.x = 0.06
      const teclas = new THREE.Mesh(new THREE.BoxGeometry(0.295, 0.008, 0.095), matMetalEscuro)
      teclas.position.set(0, 0.02, 0)
      teclas.rotation.x = 0.06
      grupo.add(chassi, teclas)
      break
    }

    case 'mouse': {
      const mousePad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.004, 20),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 }),
      )
      mousePad.position.set(0, 0.003, 0)
      const corpoMouse = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.034, 10, 14), matBranco)
      corpoMouse.rotation.x = Math.PI / 2
      corpoMouse.scale.set(1, 1, 0.65)
      corpoMouse.position.set(0, 0.018, 0)
      grupo.add(mousePad, corpoMouse)
      break
    }

    case 'notebook': {
      const texTela = texturaTelaMonitor('laptop')
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.24), matMetalCromo)
      base.position.set(0, 0.01, 0)
      const teclado = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.13), matMetalEscuro)
      teclado.rotation.x = -Math.PI / 2
      teclado.position.set(0, 0.019, -0.02)
      const tampa = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.012), matMetalCromo)
      tampa.position.set(0, 0.12, -0.115)
      tampa.rotation.x = -0.22
      const tela = new THREE.Mesh(
        new THREE.PlaneGeometry(0.31, 0.19),
        new THREE.MeshBasicMaterial({ map: texTela }),
      )
      tela.position.set(0, 0.12, -0.107)
      tela.rotation.x = -0.22
      grupo.add(base, teclado, tampa, tela)
      break
    }

    // -----------------------------------------------------------------------
    // 2. ASSENTOS, SOFÁS, POLTRONAS, PUFE, BANCOS E ALMOFADAS
    // -----------------------------------------------------------------------
    case 'sofa_lounge': {
      const corBase = r.design ? 0x0d9488 : 0x0284c7
      const corAlmofada = r.design ? 0x2dd4bf : 0x38bdf8
      const matSofa = new THREE.MeshStandardMaterial({
        color: corBase,
        map: texturaTecido(corBase),
        roughness: 0.56,
      })
      const matAlm = new THREE.MeshStandardMaterial({
        color: corAlmofada,
        map: texturaTecido(corAlmofada),
        roughness: 0.5,
      })

      if (r.design && !r.canto) {
        const estofado = new THREE.Mesh(obterGeometriaBlender('sofa_estofado'), matSofa)
        const almofadas = new THREE.Mesh(obterGeometriaBlender('sofa_almofadas'), matAlm)
        const pes = new THREE.Mesh(obterGeometriaBlender('sofa_pes'), matMadeiraEscura)
        grupo.add(estofado, almofadas, pes)
        break
      }

      const larg = r.longo ? 1.95 : r.canto ? 1.45 : 1.58
      const prof = 0.8
      const base = criarAlmofadaBoleada(larg, 0.24, prof, matSofa)
      base.position.set(0, 0.2, 0)
      const encosto = criarAlmofadaBoleada(larg, 0.44, 0.22, matSofa)
      encosto.position.set(0, 0.5, -prof / 2 + 0.11)
      encosto.rotation.x = -0.06
      grupo.add(base, encosto)

      // Almofadas de assento individuais
      const numAssentos = r.longo ? 3 : 2
      const largAssento = (larg - 0.34) / numAssentos
      for (let i = 0; i < numAssentos; i++) {
        const xA = -((numAssentos - 1) * largAssento) / 2 + i * largAssento
        const alm = criarAlmofadaBoleada(largAssento - 0.03, 0.11, 0.56, matAlm)
        alm.position.set(xA, 0.36, 0.06)
        grupo.add(alm)
      }

      if (r.canto) {
        // Chaise / módulo lateral de canto em L
        const chaise = criarAlmofadaBoleada(0.68, 0.24, 0.65, matSofa)
        chaise.position.set(larg / 2 - 0.34, 0.2, 0.62)
        const almChaise = criarAlmofadaBoleada(0.62, 0.11, 0.6, matAlm)
        almChaise.position.set(larg / 2 - 0.34, 0.36, 0.62)
        grupo.add(chaise, almChaise)
      }

      for (const lado of [-1, 1]) {
        const braco = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.56, 10, 14), matSofa)
        braco.rotation.x = Math.PI / 2
        braco.scale.set(0.95, 1, 1.35)
        braco.position.set(lado * (larg / 2 - 0.08), 0.38, 0.02)
        grupo.add(braco)
      }
      adicionarQuatroPernas(grupo, larg - 0.22, prof - 0.2, 0.1, 0.025, 0.018, matMadeiraEscura, 0.08)
      break
    }

    case 'poltrona_lounge': {
      const corPoltrona = r.design ? 0xd97706 : r.reclinavel ? 0x4f46e5 : 0x0284c7
      const matPoltrona = new THREE.MeshStandardMaterial({
        color: corPoltrona,
        map: texturaTecido(corPoltrona),
        roughness: 0.52,
      })

      if (r.design) {
        // Poltrona Egg orgânica com base giratória cromada
        const discoBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.025, 22), matMetalCromo)
        discoBase.position.y = 0.015
        const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.32, 14), matMetalCromo)
        coluna.position.y = 0.17
        const concha = new THREE.Mesh(
          new THREE.SphereGeometry(0.44, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.72),
          matPoltrona,
        )
        concha.rotation.x = Math.PI * 0.65
        concha.scale.set(0.95, 1.05, 1.15)
        concha.position.set(0, 0.56, -0.04)
        const almofada = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.09, 20), matPoltrona)
        almofada.position.set(0, 0.38, 0.04)
        grupo.add(discoBase, coluna, concha, almofada)
      } else {
        const base = criarAlmofadaBoleada(0.84, 0.24, 0.78, matPoltrona)
        base.position.set(0, 0.22, 0)
        const encosto = criarAlmofadaBoleada(0.76, 0.52, 0.2, matPoltrona)
        encosto.position.set(0, 0.56, -0.26)
        encosto.rotation.x = r.reclinavel ? -0.26 : -0.1
        grupo.add(base, encosto)
        for (const lado of [-1, 1]) {
          const braco = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.54, 10, 14), matPoltrona)
          braco.rotation.x = Math.PI / 2
          braco.position.set(lado * 0.36, 0.38, 0.02)
          grupo.add(braco)
        }
        adicionarQuatroPernas(grupo, 0.66, 0.58, 0.14, 0.024, 0.016, matMadeiraMedia, 0.1)
      }
      break
    }

    case 'pufe': {
      const matPufe = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        map: texturaTecido(0x0284c7),
        roughness: 0.55,
      })
      const corpo = criarAlmofadaBoleada(0.68, 0.32, 0.68, matPufe)
      corpo.position.set(0, 0.22, 0)
      grupo.add(corpo)
      adicionarQuatroPernas(grupo, 0.5, 0.5, 0.09, 0.024, 0.018, matMadeiraEscura)
      break
    }

    case 'banco': {
      const alt = r.baixo ? 0.34 : 0.44
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.44), matMadeiraClara)
      tampo.position.set(0, alt, 0)
      grupo.add(tampo)
      if (r.estofado) {
        const matAlm = new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          map: texturaTecido(0x3b82f6),
          roughness: 0.55,
        })
        const alm = criarAlmofadaBoleada(1.1, 0.07, 0.4, matAlm)
        alm.position.set(0, alt + 0.055, 0)
        grupo.add(alm)
      }
      adicionarQuatroPernas(grupo, 0.98, 0.32, alt, 0.026, 0.02, matMetalEscuro)
      break
    }

    case 'banqueta': {
      const matAssento = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        map: texturaTecido(0xd97706),
        roughness: 0.48,
      })
      const assento = r.quadrado
        ? criarAlmofadaBoleada(0.38, 0.07, 0.38, matAssento)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.075, 22), matAssento)
      assento.position.set(0, 0.68, 0)
      const aroPes = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 22), matMetalCromo)
      aroPes.rotation.x = Math.PI / 2
      aroPes.position.set(0, 0.24, 0)
      grupo.add(assento, aroPes)
      adicionarQuatroPernas(grupo, 0.24, 0.24, 0.66, 0.016, 0.014, matMetalCromo, 0.06)
      break
    }

    case 'cadeira': {
      const corCad = r.moderno ? 0x0f766e : r.arredondado ? 0xb45309 : 0x475569
      const matCad = new THREE.MeshStandardMaterial({
        color: corCad,
        map: texturaTecido(corCad),
        roughness: 0.5,
      })
      const matEstrut = r.armacao || r.moderno ? matMetalCromo : matMadeiraClara

      if (r.arredondado) {
        const assento = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.06, 22), matCad)
        assento.position.set(0, 0.44, 0)
        const encosto = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.36, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8),
          matCad,
        )
        encosto.position.set(0, 0.64, 0)
        grupo.add(assento, encosto)
      } else {
        const assento = r.estofado
          ? criarAlmofadaBoleada(0.46, 0.065, 0.46, matCad)
          : new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.045, 0.45), matMadeiraClara)
        assento.position.set(0, 0.43, 0)
        const encosto = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.18, 0.16, 10, 16),
          r.estofado ? matCad : matMadeiraClara,
        )
        encosto.scale.set(1.1, 1, 0.22)
        encosto.position.set(0, 0.69, -0.2)
        grupo.add(assento, encosto)
      }
      adicionarQuatroPernas(grupo, 0.36, 0.36, 0.43, 0.018, 0.014, matEstrut, r.moderno ? 0.07 : 0)
      break
    }

    case 'almofada': {
      const cor = r.azul ? 0x2563eb : 0xf43f5e
      const matAlm = new THREE.MeshStandardMaterial({
        color: cor,
        map: texturaTecido(cor),
        roughness: 0.6,
      })
      const larg = r.longo ? 0.58 : 0.34
      const alm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, larg - 0.18, 10, 16), matAlm)
      alm.rotation.z = Math.PI / 2
      alm.scale.set(0.48, 1, 1.2)
      alm.position.set(0, 0.06, 0)
      grupo.add(alm)
      break
    }

    // -----------------------------------------------------------------------
    // 3. MESAS (CENTRO, LATERAL, JANTAR E REUNIÃO)
    // -----------------------------------------------------------------------
    case 'mesa_centro': {
      const larg = r.quadrado ? 0.78 : 1.08
      const prof = r.quadrado ? 0.78 : 0.62
      const matTampo = r.vidro ? matVidro : matMadeiraClara
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.036, prof), matTampo)
      tampo.position.set(0, 0.4, 0)
      grupo.add(tampo)
      if (r.vidro) {
        const aro = new THREE.Mesh(new THREE.BoxGeometry(larg - 0.04, 0.025, prof - 0.04), matMetalCromo)
        aro.position.set(0, 0.38, 0)
        grupo.add(aro)
      }
      adicionarQuatroPernas(grupo, larg - 0.12, prof - 0.12, 0.39, 0.02, 0.016, r.vidro ? matMetalCromo : matMadeiraEscura)
      break
    }

    case 'mesa_lateral': {
      const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 22), matMadeiraClara)
      tampo.position.set(0, 0.54, 0)
      grupo.add(tampo)
      if (r.gavetas) {
        const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.24, 22), matMadeiraEscura)
        corpo.position.set(0, 0.41, 0)
        const puxador = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), matMetalDourado)
        puxador.position.set(0, 0.41, 0.26)
        grupo.add(corpo, puxador)
      }
      adicionarQuatroPernas(grupo, 0.32, 0.32, 0.53, 0.018, 0.012, matMadeiraEscura, 0.06)
      break
    }

    case 'mesa_jantar': {
      const matTampo = r.vidro
        ? matVidro
        : r.toalha
          ? new THREE.MeshStandardMaterial({ color: 0xfef2f2, map: texturaTecido(0xfef2f2), roughness: 0.7 })
          : matMadeiraClara

      if (r.redondo) {
        const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.045, 28), matTampo)
        tampo.position.set(0, 0.73, 0)
        const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.68, 16), matMadeiraEscura)
        coluna.position.set(0, 0.36, 0)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.04, 24), matMadeiraEscura)
        base.position.set(0, 0.02, 0)
        grupo.add(tampo, coluna, base)
      } else {
        const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.045, 0.88), matTampo)
        tampo.position.set(0, 0.73, 0)
        grupo.add(tampo)
        if (r.toalha) {
          const caimento = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.91), matTampo)
          caimento.position.set(0, 0.67, 0)
          grupo.add(caimento)
        }
        if (r.cruzado) {
          for (const rotZ of [-0.52, 0.52]) {
            const trave = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78, 0.68), matMadeiraEscura)
            trave.position.set(0, 0.36, 0)
            trave.rotation.z = rotZ
            grupo.add(trave)
          }
        } else {
          adicionarQuatroPernas(
            grupo,
            0.94,
            0.7,
            0.72,
            0.028,
            0.022,
            r.vidro ? matMetalCromo : matMadeiraEscura,
          )
        }
      }
      break
    }

    // -----------------------------------------------------------------------
    // 4. ESTANTES, ARMÁRIOS, RACKS E ORGANIZAÇÃO
    // -----------------------------------------------------------------------
    case 'estante': {
      const larg = r.largo ? 1.32 : 0.92
      const alt = r.baixo ? 0.92 : 1.68
      const prof = 0.34

      // Laterais, topo e base
      const esq = new THREE.Mesh(new THREE.BoxGeometry(0.04, alt, prof), matMadeiraEscura)
      esq.position.set(-larg / 2 + 0.02, alt / 2, 0)
      const dir = esq.clone()
      dir.position.x = larg / 2 - 0.02
      const topo = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.04, prof), matMadeiraEscura)
      topo.position.set(0, alt - 0.02, 0)
      const base = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.06, prof), matMadeiraEscura)
      base.position.set(0, 0.03, 0)
      grupo.add(esq, dir, topo, base)

      if (r.fechado) {
        const fundo = new THREE.Mesh(new THREE.BoxGeometry(larg - 0.04, alt - 0.04, 0.02), matMadeiraMedia)
        fundo.position.set(0, alt / 2, -prof / 2 + 0.015)
        grupo.add(fundo)
      }

      const niveis = r.baixo ? 2 : 4
      const coresLivros = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899]
      for (let n = 1; n <= niveis; n++) {
        const yPrat = (alt / (niveis + 1)) * n
        const prat = new THREE.Mesh(new THREE.BoxGeometry(larg - 0.06, 0.03, prof - 0.02), matMadeiraClara)
        prat.position.set(0, yPrat, 0)
        grupo.add(prat)

        // Livros decorativos organizados nas prateleiras
        const qtdLivros = r.largo ? 7 : 5
        for (let i = 0; i < qtdLivros; i++) {
          const altL = 0.2 + ((i + n) % 3) * 0.03
          const livro = new THREE.Mesh(
            new THREE.BoxGeometry(0.055, altL, 0.2),
            new THREE.MeshStandardMaterial({ color: coresLivros[(n * 3 + i) % coresLivros.length], roughness: 0.45 }),
          )
          livro.position.set(-larg * 0.34 + i * 0.1, yPrat + 0.015 + altL / 2, 0.02)
          if (i === qtdLivros - 1) livro.rotation.z = 0.22
          grupo.add(livro)
        }
      }

      if (r.portas) {
        for (const lado of [-1, 1]) {
          const porta = new THREE.Mesh(new THREE.BoxGeometry(larg * 0.46, alt * 0.42, 0.025), matMadeiraClara)
          porta.position.set(lado * (larg * 0.235), alt * 0.24, prof / 2)
          const pux = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 10), matMetalDourado)
          pux.position.set(lado * 0.05, alt * 0.28, prof / 2 + 0.02)
          grupo.add(porta, pux)
        }
      }
      break
    }

    case 'livros': {
      const cores = [0x2563eb, 0xdc2626, 0x16a34a]
      cores.forEach((cor, i) => {
        const l = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.04, 0.16),
          new THREE.MeshStandardMaterial({ color: cor, roughness: 0.45 }),
        )
        l.position.set(0, 0.02 + i * 0.042, 0)
        l.rotation.y = (i - 1) * 0.18
        grupo.add(l)
      })
      break
    }

    case 'criado_mudo': {
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.46, 0.42), matMadeiraClara)
      corpo.position.set(0, 0.28, 0)
      grupo.add(corpo)
      if (r.gavetas) {
        const frenteGav = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.02), matMadeiraEscura)
        frenteGav.position.set(0, 0.36, 0.215)
        const pux = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), matMetalDourado)
        pux.position.set(0, 0.36, 0.23)
        grupo.add(frenteGav, pux)
      }
      adicionarQuatroPernas(grupo, 0.38, 0.32, 0.08, 0.02, 0.014, matMadeiraEscura)
      break
    }

    case 'rack_tv': {
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.42, 0.44), matMadeiraEscura)
      corpo.position.set(0, 0.28, 0)
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.035, 0.46), matMadeiraClara)
      tampo.position.set(0, 0.5, 0)
      grupo.add(corpo, tampo)
      if (r.portas) {
        for (const lado of [-1, 1]) {
          const porta = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.02), matMadeiraClara)
          porta.position.set(lado * 0.44, 0.28, 0.225)
          grupo.add(porta)
        }
      }
      adicionarQuatroPernas(grupo, 1.24, 0.34, 0.1, 0.022, 0.016, matMetalEscuro, 0.08)
      break
    }

    case 'cabideiro': {
      if (r.montagem === 'pe') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 18), matMadeiraEscura)
        base.position.y = 0.02
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 1.68, 12), matMadeiraEscura)
        haste.position.y = 0.84
        grupo.add(base, haste)
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2
          const gancho = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.14, 6, 8), matMetalDourado)
          gancho.position.set(Math.sin(a) * 0.07, 1.56, Math.cos(a) * 0.07)
          gancho.rotation.z = -Math.sin(a) * 0.65
          gancho.rotation.x = Math.cos(a) * 0.65
          grupo.add(gancho)
        }
      } else {
        const prancha = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.04), matMadeiraClara)
        prancha.position.set(0, 1.42, -0.35)
        grupo.add(prancha)
        for (const xG of [-0.22, 0, 0.22]) {
          const pino = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 10), matMetalDourado)
          pino.rotation.x = Math.PI / 2
          pino.position.set(xG, 1.42, -0.31)
          grupo.add(pino)
        }
      }
      break
    }

    case 'caixa_papelao': {
      const matPapelao = new THREE.MeshStandardMaterial({ color: 0xc89f70, roughness: 0.82 })
      const caixa = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.42), matPapelao)
      caixa.position.set(0, 0.18, 0)
      grupo.add(caixa)
      if (r.aberto) {
        for (const lado of [-1, 1]) {
          const aba = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.4), matPapelao)
          aba.position.set(lado * 0.28, 0.35, 0)
          aba.rotation.z = lado * -0.55
          grupo.add(aba)
        }
      } else {
        const fita = new THREE.Mesh(
          new THREE.BoxGeometry(0.47, 0.01, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.5 }),
        )
        fita.position.set(0, 0.362, 0)
        grupo.add(fita)
      }
      break
    }

    case 'lixeira': {
      const cesto = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.36, 18), matMetalCromo)
      cesto.position.set(0, 0.18, 0)
      const borda = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 20), matMetalEscuro)
      borda.rotation.x = Math.PI / 2
      borda.position.set(0, 0.36, 0)
      grupo.add(cesto, borda)
      break
    }

    // -----------------------------------------------------------------------
    // 5. ILUMINAÇÃO E CLIMATIZAÇÃO
    // -----------------------------------------------------------------------
    case 'luminaria': {
      const matCupula = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.72,
        roughness: 0.3,
        side: THREE.DoubleSide,
      })

      if (r.montagem === 'teto') {
        const plafon = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.48), matCupula)
        plafon.position.set(0, 2.48, 0)
        grupo.add(plafon)
      } else if (r.montagem === 'parede') {
        const suporte = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), matMetalDourado)
        suporte.position.set(0, 1.5, -0.35)
        const arandela = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), matCupula)
        arandela.position.set(0, 1.56, -0.26)
        grupo.add(suporte, arandela)
      } else if (r.montagem === 'mesa') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 18), matMetalDourado)
        base.position.set(0, 0.015, 0)
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.28, 12), matMetalDourado)
        haste.position.set(0, 0.15, 0)
        const cupula = r.quadrado
          ? new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.24), matCupula)
          : new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 20, 1, true), matCupula)
        cupula.position.set(0, 0.32, 0)
        grupo.add(base, haste, cupula)
      } else {
        // Luminária de piso alta
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.035, 22), matMetalDourado)
        base.position.set(0, 0.018, 0)
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.32, 14), matMetalDourado)
        haste.position.set(0, 0.67, 0)
        const cupula = r.quadrado
          ? new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), matCupula)
          : new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 22, 1, true), matCupula)
        cupula.position.set(0, 1.36, 0)
        grupo.add(base, haste, cupula)
      }
      break
    }

    case 'ventilador_teto': {
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 12), matMetalEscuro)
      haste.position.set(0, 2.38, 0)
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20), matMetalEscuro)
      motor.position.set(0, 2.2, 0)
      const luminariaCentral = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfacc15, emissiveIntensity: 0.6 }),
      )
      luminariaCentral.scale.set(1, 0.55, 1)
      luminariaCentral.position.set(0, 2.15, 0)
      grupo.add(haste, motor, luminariaCentral)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        const pa = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.015, 0.11), matMadeiraEscura)
        pa.position.set(Math.cos(a) * 0.32, 2.2, Math.sin(a) * 0.32)
        pa.rotation.y = -a
        grupo.add(pa)
      }
      break
    }

    // -----------------------------------------------------------------------
    // 6. PLANTAS E PAISAGISMO INTERNO
    // -----------------------------------------------------------------------
    case 'planta_vaso': {
      const grande = movel.peca === 'pottedPlant'
      const corVaso = grande ? 0xc2410c : r.varianteNumero === 2 ? 0xf8fafc : r.varianteNumero === 3 ? 0x334155 : 0xd97706
      const altVaso = grande ? 0.36 : 0.22
      const rVaso = grande ? 0.22 : 0.14

      if (grande) {
        const matVaso = new THREE.MeshStandardMaterial({ color: corVaso, roughness: 0.58 })
        const vasoBlender = new THREE.Mesh(obterGeometriaBlender('planta_vaso_ceramico'), matVaso)
        const matTerra = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 })
        const terraBlender = new THREE.Mesh(obterGeometriaBlender('planta_terra'), matTerra)
        const matFolhas = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.38, side: THREE.DoubleSide })
        const folhasBlender = new THREE.Mesh(obterGeometriaBlender('planta_folhas_botanicas'), matFolhas)
        grupo.add(vasoBlender, terraBlender, folhasBlender)
        break
      }

      const vaso = new THREE.Mesh(
        new THREE.CylinderGeometry(rVaso, rVaso * 0.74, altVaso, 18),
        new THREE.MeshStandardMaterial({ color: corVaso, roughness: 0.58 }),
      )
      vaso.position.set(0, altVaso / 2, 0)
      const terra = new THREE.Mesh(
        new THREE.CylinderGeometry(rVaso * 0.92, rVaso * 0.92, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 }),
      )
      terra.position.set(0, altVaso - 0.01, 0)
      grupo.add(vaso, terra)

      const matFolha = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45 })
      const matFolhaClara = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.45 })

      if (r.varianteNumero === 2) {
        // Espada-de-São-Jorge vertical elegante
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI * 2) / 6
          const lamina = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.36 + (i % 2) * 0.08, 8), matFolha)
          lamina.scale.set(1, 1, 0.35)
          lamina.position.set(Math.sin(a) * 0.045, altVaso + 0.16, Math.cos(a) * 0.045)
          lamina.rotation.y = a
          grupo.add(lamina)
        }
      } else {
        // Suculenta / arbusto redondo compacto
        for (let i = 0; i < 7; i++) {
          const a = (i * Math.PI * 2) / 7
          const broto = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), i % 2 === 0 ? matFolha : matFolhaClara)
          broto.position.set(Math.sin(a) * 0.07, altVaso + 0.09 + (i % 2) * 0.04, Math.cos(a) * 0.07)
          grupo.add(broto)
        }
      }
      break
    }

    // -----------------------------------------------------------------------
    // 7. COZINHA E COPA GOURMET
    // -----------------------------------------------------------------------
    case 'cafeteira': {
      const corpo = new THREE.Mesh(obterGeometriaBlender('cafeteira_corpo'), matMetalEscuro)
      const topoCromo = new THREE.Mesh(obterGeometriaBlender('cafeteira_cromado'), matMetalCromo)
      const caneca = new THREE.Mesh(obterGeometriaBlender('cafeteira_xicara'), matBranco)
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
      )
      led.position.set(0.08, 0.28, 0.08)
      grupo.add(corpo, topoCromo, caneca, led)
      break
    }

    case 'geladeira': {
      const alt = r.pequeno ? 0.92 : r.grande ? 1.86 : 1.72
      const larg = r.grande ? 0.88 : 0.72
      const matCorpo = r.embutido ? matMadeiraEscura : matMetalCromo
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, 0.68), matCorpo)
      corpo.position.set(0, alt / 2, 0)
      grupo.add(corpo)

      if (r.grande) {
        // Side-by-side de duas portas + dispenser de água/gelo
        for (const lado of [-1, 1]) {
          const pux = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, alt * 0.55, 10), matMetalEscuro)
          pux.position.set(lado * 0.05, alt * 0.52, 0.355)
          grupo.add(pux)
        }
        const dispenser = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02), matMetalEscuro)
        dispenser.position.set(-0.2, alt * 0.58, 0.345)
        grupo.add(dispenser)
      } else {
        const puxador = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, alt * 0.45, 10), matMetalEscuro)
        puxador.position.set(0.26, alt * 0.55, 0.355)
        grupo.add(puxador)
      }
      break
    }

    case 'micro_ondas': {
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.34), matMetalCromo)
      corpo.position.set(0, 0.14, 0)
      const visor = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.25 }),
      )
      visor.position.set(-0.05, 0.14, 0.172)
      const pux = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 10), matMetalEscuro)
      pux.position.set(0.14, 0.14, 0.18)
      grupo.add(corpo, visor, pux)
      break
    }

    case 'liquidificador': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.12, 16), matMetalEscuro)
      base.position.set(0, 0.06, 0)
      const jarra = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.22, 16), matVidro)
      jarra.position.set(0, 0.23, 0)
      const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.03, 16), matMetalEscuro)
      tampa.position.set(0, 0.35, 0)
      grupo.add(base, jarra, tampa)
      break
    }

    case 'torradeira': {
      const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.14, 10, 14), matMetalCromo)
      corpo.rotation.z = Math.PI / 2
      corpo.scale.set(1, 1, 0.85)
      corpo.position.set(0, 0.09, 0)
      grupo.add(corpo)
      break
    }

    case 'fogao': {
      const gabinete = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.74, 0.62), matMetalCromo)
      gabinete.position.set(0, 0.37, 0)
      const portaForno = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), matMetalEscuro)
      portaForno.position.set(0, 0.32, 0.312)
      const puxForno = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 10), matMetalEscuro)
      puxForno.rotation.z = Math.PI / 2
      puxForno.position.set(0, 0.58, 0.33)
      grupo.add(gabinete, portaForno, puxForno)

      // Bocas de cocção / indução no topo
      const matBoca = new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: r.eletrico ? 0xef4444 : 0x000000,
        emissiveIntensity: r.eletrico ? 0.35 : 0,
      })
      for (const [bx, bz] of [
        [-0.18, -0.14],
        [0.18, -0.14],
        [-0.18, 0.14],
        [0.18, 0.14],
      ]) {
        const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 18), matBoca)
        boca.position.set(bx, 0.748, bz)
        grupo.add(boca)
      }
      break
    }

    case 'pia_cozinha': {
      const gabinete = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.74, 0.58), matMadeiraEscura)
      gabinete.position.set(0, 0.37, 0)
      const bancada = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.62), matBranco)
      bancada.position.set(0, 0.76, 0)
      const cuba = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.38), matMetalCromo)
      cuba.position.set(0, 0.788, 0.02)
      // Torneira gourmet em arco alto
      const hasteTorn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 10), matMetalCromo)
      hasteTorn.position.set(0, 0.89, -0.18)
      const arcoTorn = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 16, Math.PI), matMetalCromo)
      arcoTorn.rotation.y = Math.PI / 2
      arcoTorn.position.set(0, 0.99, -0.1)
      grupo.add(gabinete, bancada, cuba, hasteTorn, arcoTorn)
      break
    }

    case 'coifa': {
      const larg = r.grande ? 0.96 : 0.76
      const chamine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.26), matMetalCromo)
      chamine.position.set(0, 2.15, -0.12)
      const campana = new THREE.Mesh(new THREE.ConeGeometry(larg * 0.62, 0.24, 4), matMetalCromo)
      campana.rotation.y = Math.PI / 4
      campana.scale.set(1, 1, 0.68)
      campana.position.set(0, 1.82, -0.05)
      grupo.add(chamine, campana)
      break
    }

    case 'balcao_ilha': {
      const larg = r.ponta ? 0.62 : 1.12
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.88, 0.54), matMadeiraEscura)
      corpo.position.set(0, 0.44, 0)
      const tampo = r.ponta
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 22), matMadeiraClara)
        : new THREE.Mesh(new THREE.BoxGeometry(larg + 0.06, 0.05, 0.64), matMadeiraClara)
      tampo.position.set(0, 0.9, 0.03)
      grupo.add(corpo, tampo)
      break
    }

    case 'armario_cozinha': {
      if (r.aereo) {
        const larg = r.duplo ? 1.15 : 0.78
        const alt = r.baixo ? 0.42 : 0.66
        const arm = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, 0.36), matMadeiraClara)
        arm.position.set(0, 1.72, -0.12)
        grupo.add(arm)
      } else {
        const gabinete = r.redondo
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.74, 22), matMadeiraEscura)
          : new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.74, 0.58), matMadeiraEscura)
        gabinete.position.set(0, 0.37, 0)
        const bancada = r.redondo
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 22), matBranco)
          : new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.62), matBranco)
        bancada.position.set(0, 0.76, 0)
        grupo.add(gabinete, bancada)
      }
      break
    }

    // -----------------------------------------------------------------------
    // 8. BANHEIRO E LAVANDERIA
    // -----------------------------------------------------------------------
    case 'pia_banheiro': {
      const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.72, 18), matPorcelana)
      coluna.position.set(0, 0.36, 0)
      const cuba = r.quadrado
        ? new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.44), matPorcelana)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.18, 22), matPorcelana)
      cuba.position.set(0, 0.76, 0)
      const torneira = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10), matMetalCromo)
      torneira.position.set(0, 0.88, -0.14)
      grupo.add(coluna, cuba, torneira)
      break
    }

    case 'espelho_banheiro': {
      const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.03), matMetalDourado)
      moldura.position.set(0, 1.38, -0.25)
      const espelho = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.76), matEspelho)
      espelho.position.set(0, 1.38, -0.232)
      grupo.add(moldura, espelho)
      break
    }

    case 'armario_banheiro': {
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.76, 0.46), matBranco)
      corpo.position.set(0, 0.38, 0)
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.48), matMadeiraClara)
      tampo.position.set(0, 0.78, 0)
      grupo.add(corpo, tampo)
      break
    }

    case 'banheira': {
      const casco = new THREE.Mesh(obterGeometriaBlender('banheira_casco'), matPorcelana)
      const matAgua = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
      })
      const agua = new THREE.Mesh(obterGeometriaBlender('banheira_agua'), matAgua)
      grupo.add(casco, agua)
      break
    }

    case 'box_chuveiro': {
      const base = r.redondo
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 22), matPorcelana)
        : new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.88), matPorcelana)
      base.position.set(0, 0.04, 0)
      const cabineVidro = r.redondo
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.92, 22, 1, true), matVidro)
        : new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.92, 0.84), matVidro)
      cabineVidro.position.set(0, 1.04, 0)
      const ducha = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.04, 16), matMetalCromo)
      ducha.position.set(0, 1.92, 0)
      grupo.add(base, cabineVidro, ducha)
      break
    }

    case 'vaso_sanitario': {
      const caixaAcoplada = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.18), matPorcelana)
      caixaAcoplada.position.set(0, 0.62, -0.18)
      const bacia = r.quadrado
        ? new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.48), matPorcelana)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.42, 20), matPorcelana)
      bacia.position.set(0, 0.21, 0.04)
      const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 20), matPorcelana)
      tampa.position.set(0, 0.43, 0.04)
      grupo.add(caixaAcoplada, bacia, tampa)
      break
    }

    case 'lavadora_secadora': {
      const criarTambor = (yOffset: number) => {
        const gab = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.82, 0.62), matBranco)
        gab.position.set(0, yOffset + 0.41, 0)
        const aroEscotilha = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 10, 22), matMetalCromo)
        aroEscotilha.position.set(0, yOffset + 0.42, 0.315)
        const vidroEscotilha = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), matVidro)
        vidroEscotilha.position.set(0, yOffset + 0.42, 0.316)
        grupo.add(gab, aroEscotilha, vidroEscotilha)
      }
      criarTambor(0)
      if (r.empilhado) criarTambor(0.84)
      break
    }

    // -----------------------------------------------------------------------
    // 9. ELETRÔNICOS E ÁUDIO
    // -----------------------------------------------------------------------
    case 'televisao': {
      const texTV = texturaTelaMonitor('tv')
      if (r.retro || r.antena) {
        const gabRetro = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.38), matMadeiraEscura)
        gabRetro.position.set(0, 0.26, 0)
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ map: texTV }))
        tela.position.set(-0.04, 0.26, 0.192)
        grupo.add(gabRetro, tela)
        for (const lado of [-1, 1]) {
          const hasteAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.36, 8), matMetalCromo)
          hasteAnt.position.set(lado * 0.1, 0.64, 0)
          hasteAnt.rotation.z = lado * -0.45
          grupo.add(hasteAnt)
        }
      } else {
        const painel = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.68, 0.045), matMetalEscuro)
        painel.position.set(0, 0.65, 0)
        const tela = new THREE.Mesh(
          new THREE.PlaneGeometry(1.12, 0.62),
          new THREE.MeshBasicMaterial({ map: texTV }),
        )
        tela.position.set(0, 0.65, 0.025)
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.24), matMetalCromo)
        base.position.set(0, 0.28, 0)
        grupo.add(painel, tela, base)
      }
      break
    }

    case 'caixa_som': {
      const alt = r.pequeno ? 0.36 : 0.72
      const caixa = new THREE.Mesh(new THREE.BoxGeometry(0.32, alt, 0.28), matMetalEscuro)
      caixa.position.set(0, alt / 2, 0)
      const cone1 = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.07, 0.03, 18), matMetalCromo)
      cone1.rotation.x = Math.PI / 2
      cone1.position.set(0, alt * 0.68, 0.145)
      grupo.add(caixa, cone1)
      if (!r.pequeno) {
        const cone2 = cone1.clone()
        cone2.position.y = alt * 0.32
        grupo.add(cone2)
      }
      break
    }

    case 'radio': {
      const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 10, 16), matMadeiraClara)
      corpo.rotation.z = Math.PI / 2
      corpo.scale.set(1, 1, 0.68)
      corpo.position.set(0, 0.1, 0)
      const gradeSom = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), matMetalDourado)
      gradeSom.position.set(-0.06, 0.1, 0.064)
      const dial = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 10), matMetalEscuro)
      dial.position.set(0.07, 0.1, 0.064)
      grupo.add(corpo, gradeSom, dial)
      break
    }

    // -----------------------------------------------------------------------
    // 10. QUARTO, CAMAS E DECORAÇÃO AFETIVA
    // -----------------------------------------------------------------------
    case 'cama': {
      const larg = r.duplo && !movel.peca.includes('Bunk') ? 1.48 : 0.98
      const prof = 1.88
      const corColchao = r.duplo ? 0x2563eb : 0x0d9488
      const matColchao = new THREE.MeshStandardMaterial({
        color: corColchao,
        map: texturaTecido(corColchao),
        roughness: 0.56,
      })

      const montarLeito = (yBase: number) => {
        const estrado = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.2, prof), matMadeiraEscura)
        estrado.position.set(0, yBase + 0.14, 0)
        const colchao = criarAlmofadaBoleada(larg - 0.06, 0.2, prof - 0.08, matColchao)
        colchao.position.set(0, yBase + 0.32, 0)
        const cabeceira = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.62, 0.08), matMadeiraEscura)
        cabeceira.position.set(0, yBase + 0.42, -prof / 2 + 0.04)
        grupo.add(estrado, colchao, cabeceira)

        const numTrav = larg > 1.2 ? 2 : 1
        for (let i = 0; i < numTrav; i++) {
          const xT = numTrav === 2 ? (i === 0 ? -0.34 : 0.34) : 0
          const trav = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.36, 10, 14), matBranco)
          trav.rotation.z = Math.PI / 2
          trav.scale.set(0.55, 1, 1.2)
          trav.position.set(xT, yBase + 0.46, -prof / 2 + 0.28)
          grupo.add(trav)
        }
      }

      montarLeito(0)
      if (movel.peca.includes('Bunk')) {
        montarLeito(0.96)
        adicionarQuatroPernas(grupo, larg - 0.08, prof - 0.08, 1.72, 0.032, 0.032, matMadeiraEscura)
      }
      break
    }

    case 'urso_pelucia': {
      const matPelucia = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.78 })
      const barriga = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), matPelucia)
      barriga.scale.set(1, 1.15, 0.9)
      barriga.position.set(0, 0.16, 0)
      const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), matPelucia)
      cabeca.position.set(0, 0.36, 0.02)
      const focinho = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), matBranco)
      focinho.position.set(0, 0.34, 0.11)
      grupo.add(barriga, cabeca, focinho)
      for (const lado of [-1, 1]) {
        const orelha = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), matPelucia)
        orelha.position.set(lado * 0.085, 0.45, 0.01)
        const pata = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.08, 8, 10), matPelucia)
        pata.rotation.x = Math.PI / 2
        pata.position.set(lado * 0.09, 0.06, 0.08)
        grupo.add(orelha, pata)
      }
      break
    }

    // -----------------------------------------------------------------------
    // 11. PISOS, TAPETES, PORTAS, PAREDES INTERNAS E ESCADAS
    // -----------------------------------------------------------------------
    case 'tapete': {
      const corTapete = r.capacho ? 0x92400e : r.redondo ? 0x0f766e : r.arredondado ? 0x4338ca : 0x334155
      const matTapete = new THREE.MeshStandardMaterial({
        color: corTapete,
        map: texturaTecido(corTapete),
        roughness: 0.85,
      })
      if (r.redondo) {
        const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.016, 32), matTapete)
        disco.position.set(0, 0.01, 0)
        grupo.add(disco)
      } else {
        const larg = r.capacho ? 0.76 : r.quadrado ? 1.35 : 1.68
        const prof = r.capacho ? 0.48 : r.quadrado ? 1.35 : 1.18
        const tapete = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.016, prof), matTapete)
        tapete.position.set(0, 0.01, 0)
        grupo.add(tapete)
      }
      break
    }

    case 'piso_decorativo': {
      const larg = r.metade ? 0.5 : 0.98
      const placa = r.redondo
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.014, 24), matMadeiraMedia)
        : new THREE.Mesh(new THREE.BoxGeometry(larg, 0.014, 0.98), matMadeiraMedia)
      placa.position.set(0, 0.008, 0)
      grupo.add(placa)
      break
    }

    case 'porta': {
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
      if (r.aberto) pivoPorta.rotation.y = -Math.PI * 0.45

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
      break
    }

    case 'parede_interna': {
      const alt = r.metade ? 1.15 : 2.25
      if (movel.peca.includes('Window')) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.85, 0.14), matBranco)
        base.position.set(0, 0.425, 0)
        const vidro = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.15, 0.04), matVidro)
        vidro.position.set(0, 1.42, 0)
        const topo = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.25, 0.14), matBranco)
        topo.position.set(0, 2.12, 0)
        grupo.add(base, vidro, topo)
      } else {
        const bloco = new THREE.Mesh(new THREE.BoxGeometry(0.98, alt, 0.14), matBranco)
        bloco.position.set(0, alt / 2, 0)
        grupo.add(bloco)
      }
      break
    }

    case 'lambri': {
      const painel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.12, 0.04), matMadeiraEscura)
      painel.position.set(0, 0.56, -0.42)
      grupo.add(painel)
      break
    }

    case 'escada': {
      const qtdDegraus = 6
      for (let i = 0; i < qtdDegraus; i++) {
        const degrau = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.06, 0.24), matMadeiraClara)
        degrau.position.set(0, 0.18 + i * 0.22, -0.45 + i * 0.2)
        grupo.add(degrau)
      }
      break
    }
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
