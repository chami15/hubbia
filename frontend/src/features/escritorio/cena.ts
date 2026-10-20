import {
  Assets,
  Container,
   type FederatedPointerEvent,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Ticker,
  type Texture,
} from 'pixi.js'
import { paraTela, profundidade, TILE_W, TILE_H } from './iso'
import {
  ESPESSURA_LAJE,
  ALTURA_PAREDE,
  ESPESSURA_PAREDE,
  JANELA_BASE,
  JANELA_TOPO,
  PALETAS,
  type Janela,
  type Paleta,
} from './sala'
import { AGENTES, PASTA_AGENTES, RECORTES } from './agentes'
import { Maquete } from './maquete'
import { conferirSala, type MovelSala, type SalaDados } from './sala-dados'
import { CHAVES_PALETA } from './sala-conferir'
import {
  calcularCorDiamante,
  COR_NIVEL,
  INFO_HUMORES,
  type EstadoMundoSims,
  type EstadoSim,
} from './simulacao-sims'
import type { EstadoAgente } from '../../types/agente'

// Abordagem combinada:
//   - piso, laje e paredes são DESENHADOS (Graphics) → cor 100% livre,
//     nenhuma emenda entre tiles, e a laje grossa que dá o ar de maquete
//   - móveis são SPRITES do pack → arte de verdade
//   - agentes vivem na camada de móveis com profundidade recalculada a
//     cada quadro (coluna + linha), em corpo inteiro (diamante, balão) ou
//     no crachá redondo de antes. É a maquete 2D — o modo principal agora
//     é o mundo 3D (cena3d.ts); a 2D continua dona do editor de salas.

async function carregarRetratos(): Promise<Map<string, Texture>> {
  const mapa = new Map<string, Texture>()
  await Promise.all(
    AGENTES.map(async (a) => {
      mapa.set(a.id, await Assets.load(`${PASTA_AGENTES}/${a.arquivo}`))
    }),
  )
  return mapa
}

const DIAMETRO_CRACHA = 84
const ESPESSURA_ANEL = 5
const ALTURA_CORPO_SIM = 158

interface ControladorAnel {
  definirEstado(estado: EstadoAgente): void
  animar(deltaMS: number, tempoTotalMS: number): void
}

const DURACAO_PULSO_MS = 2400
const VELOCIDADE_COMETA = 0.0035 // rad/ms
const LARGURA_COMETA = Math.PI * 2 * 0.1

function clarear(cor: number, quantidade: number): number {
  const r = (cor >> 16) & 0xff
  const g = (cor >> 8) & 0xff
  const b = cor & 0xff
  const misturar = (canal: number) => Math.round(canal + (255 - canal) * quantidade)
  return (misturar(r) << 16) | (misturar(g) << 8) | misturar(b)
}

function escurecer(cor: number, quantidade: number): number {
  const r = (cor >> 16) & 0xff
  const g = (cor >> 8) & 0xff
  const b = cor & 0xff
  const misturar = (canal: number) => Math.round(canal * (1 - quantidade))
  return (misturar(r) << 16) | (misturar(g) << 8) | misturar(b)
}

function criarAnelAnimado(cor: number, raioTela: number): { grafico: Container; controlador: ControladorAnel } {
  const raioAnel = raioTela + ESPESSURA_ANEL / 2
  const corCometa = clarear(cor, 0.65)
  const anelBase = new Graphics()
  const halo = new Graphics()
  const cometa = new Graphics()

  let estadoAtual: EstadoAgente = 'idle'
  let anguloCometa = 0

  function desenharAnelBase(pontilhado: boolean) {
    anelBase.clear()
    if (!pontilhado) {
      anelBase.circle(0, 0, raioAnel)
      anelBase.stroke({ width: ESPESSURA_ANEL, color: cor })
      return
    }
    const TRACOS = 6
    for (let i = 0; i < TRACOS; i++) {
      const a0 = (i / TRACOS) * Math.PI * 2
      const a1 = a0 + ((Math.PI * 2) / TRACOS) * 0.6
      anelBase.arc(0, 0, raioAnel, a0, a1)
    }
    anelBase.stroke({ width: ESPESSURA_ANEL, color: cor })
  }

  function desenharCometa() {
    cometa.clear()
    cometa.arc(0, 0, raioAnel, anguloCometa, anguloCometa + LARGURA_COMETA)
    cometa.stroke({ width: ESPESSURA_ANEL + 2, color: corCometa, cap: 'round' })
  }

  desenharAnelBase(false)
  halo.circle(0, 0, raioAnel + 5)
  halo.stroke({ width: 4, color: cor })
  halo.visible = false
  desenharCometa()
  cometa.visible = false

  function definirEstado(estado: EstadoAgente) {
    if (estado === estadoAtual) return
    estadoAtual = estado
    desenharAnelBase(estado === 'pensando')
    halo.visible = estado === 'falando' || estado === 'pensando'
    cometa.visible = estado === 'executando'
  }

  function animar(_deltaMS: number, tempoTotalMS: number) {
    if (halo.visible) {
      const fase = (tempoTotalMS % DURACAO_PULSO_MS) / DURACAO_PULSO_MS
      halo.alpha = 0.25 + 0.65 * (0.5 - 0.5 * Math.cos(fase * Math.PI * 2))
    }
    if (cometa.visible) {
      anguloCometa += _deltaMS * VELOCIDADE_COMETA
      desenharCometa()
    }
  }

  const grupo = new Container()
  grupo.addChild(halo, anelBase, cometa)
  return { grafico: grupo, controlador: { definirEstado, animar } }
}

// ---------------------------------------------------------------------------
// DIAMANTE sobre a cabeça — bipirâmide com luz por faceta, girando no eixo Y
// ---------------------------------------------------------------------------
function desenharDiamante(
  g: Graphics,
  corBase: number,
  faseGiro: number,
  escala = 1,
  progressoInteracao = 0,
) {
  g.clear()
  const h = 24 * escala
  const r = 11.5 * escala
  const corClara = clarear(corBase, 0.45)
  const corMedia = corBase
  const corEscura = escurecer(corBase, 0.28)
  const corBorda = clarear(corBase, 0.72)

  // Halo suave ao redor do diamante
  g.circle(0, 0, 17 * escala).fill({ color: corBase, alpha: 0.18 })

  // Anel circular de progresso quando o Sim está executando uma interação
  if (progressoInteracao > 0.01) {
    const raioProg = 21 * escala
    g.circle(0, 0, raioProg).stroke({ width: 2.5, color: 0xffffff, alpha: 0.2 })
    g.arc(
      0,
      0,
      raioProg,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, progressoInteracao),
    ).stroke({ width: 3, color: corClara, cap: 'round' })
  }

  // Vértices do equador da bipirâmide girando
  const N = 4
  const angulos: number[] = []
  for (let i = 0; i < N; i++) {
    angulos.push(faseGiro + (i * Math.PI * 2) / N)
  }

  for (let i = 0; i < N; i++) {
    const a0 = angulos[i]
    const a1 = angulos[(i + 1) % N]
    const x0 = Math.sin(a0) * r
    const z0 = Math.cos(a0)
    const x1 = Math.sin(a1) * r
    const z1 = Math.cos(a1)

    // Só desenha as faces voltadas para a câmera (back-face culling)
    if (z0 + z1 < -0.25 && x1 <= x0) continue

    const iluminacao = (z0 + z1) / 2
    const corFaceSuperior = iluminacao > 0.2 ? corClara : iluminacao > -0.2 ? corMedia : corEscura
    const corFaceInferior = iluminacao > 0.2 ? corMedia : escurecer(corEscura, 0.15)

    // Metade superior (ponta de cima até o equador)
    g.poly([0, -h, x0, 0, x1, 0]).fill(corFaceSuperior)
    g.poly([0, -h, x0, 0, x1, 0]).stroke({ width: 1, color: corBorda, alpha: 0.65 })

    // Metade inferior (equador até a ponta de baixo)
    g.poly([0, h, x1, 0, x0, 0]).fill(corFaceInferior)
    g.poly([0, h, x1, 0, x0, 0]).stroke({ width: 1, color: corBorda, alpha: 0.5 })
  }
}

// ---------------------------------------------------------------------------
// AVATAR DO AGENTE (corpo inteiro + crachá + diamante + balão)
// ---------------------------------------------------------------------------
interface AvatarSimVisual {
  container: Container
  controladorAnel: ControladorAnel
  atualizarSim: (
    sim: EstadoSim | undefined,
    ativo: boolean,
    modoCorpoInteiro: boolean,
    tempoTotalMS: number,
    deltaMS: number,
  ) => void
}

function criarAvatarSim(
  agenteId: string,
  nomeAgente: string,
  retrato: Texture,
  recorte: { cx: number; cy: number; raio: number },
  corIdentidade: number,
): AvatarSimVisual {
  const container = new Container()
  const raioTela = DIAMETRO_CRACHA / 2

  // --- 1. Corpo inteiro ---
  const grupoCorpo = new Container()

  // Sombra elíptica no piso isométrico + anel de seleção no chão
  const sombraChao = new Graphics()
  const anelChao = new Graphics()

  // Sprite de corpo inteiro do personagem (as artes em /agentes/*2dSemfundo.png
  // são personagens completos em fundo transparente!)
  const spriteCorpo = new Sprite(retrato)
  spriteCorpo.anchor.set(0.5, 0.92)
  const escalaCorpo = ALTURA_CORPO_SIM / retrato.height
  spriteCorpo.scale.set(escalaCorpo)

  // Etiqueta discreta com nome e humor logo abaixo dos pés
  const estiloEtiqueta = new TextStyle({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    fontWeight: '700',
    fill: 0xf8fafc,
  })
  const textoEtiqueta = new Text({ text: nomeAgente, style: estiloEtiqueta })
  textoEtiqueta.anchor.set(0.5, 0.5)
  const fundoEtiqueta = new Graphics()
  const grupoEtiqueta = new Container()
  grupoEtiqueta.y = 16
  grupoEtiqueta.addChild(fundoEtiqueta, textoEtiqueta)

  // Indicador do item na mão (xícara de café, livro, tablet)
  const estiloItemMao = new TextStyle({ fontSize: 18 })
  const textoItemMao = new Text({ text: '', style: estiloItemMao })
  textoItemMao.anchor.set(0.5, 0.5)
  textoItemMao.x = 28
  textoItemMao.y = -62
  textoItemMao.visible = false

  grupoCorpo.addChild(sombraChao, anelChao, spriteCorpo, textoItemMao, grupoEtiqueta)

  // --- 2. Sub-container do modo CRACHÁ CLÁSSICO ---
  const grupoCracha = new Container()
  const spriteCracha = new Sprite(retrato)
  spriteCracha.anchor.set(recorte.cx, recorte.cy)
  const escalaCracha = raioTela / (recorte.raio * retrato.width)
  spriteCracha.scale.set(escalaCracha)

  const mascaraCracha = new Graphics()
  mascaraCracha.circle(0, 0, raioTela).fill(0xffffff)
  spriteCracha.mask = mascaraCracha

  const { grafico: anelCracha, controlador: controladorAnel } = criarAnelAnimado(corIdentidade, raioTela)
  const sombraCracha = new Graphics()
  sombraCracha.circle(0, raioTela * 0.15, raioTela * 0.9).fill({ color: 0x000000, alpha: 0.18 })
  grupoCracha.addChild(sombraCracha, spriteCracha, mascaraCracha, anelCracha)
  grupoCracha.visible = false

  // --- 3. Diamante acima da cabeça ---
  const graficoDiamante = new Graphics()
  graficoDiamante.y = -ALTURA_CORPO_SIM - 26

  // --- 4. Balão de pensamento / fala ---
  const grupoBalao = new Container()
  grupoBalao.y = -ALTURA_CORPO_SIM - 66
  grupoBalao.visible = false
  const fundoBalao = new Graphics()
  const estiloTextoBalao = new TextStyle({
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 11.5,
    fontWeight: '600',
    fill: 0x0f172a,
  })
  const textoBalao = new Text({ text: '', style: estiloTextoBalao })
  textoBalao.anchor.set(0.5, 0.5)
  grupoBalao.addChild(fundoBalao, textoBalao)

  container.addChild(grupoCorpo, grupoCracha, graficoDiamante, grupoBalao)

  let faseGiroDiamante = (agenteId.charCodeAt(0) % 7) * 0.8
  let chaveBalaoAnterior = ''
  let chaveEtiquetaAnterior = ''

  function desenharBalao(tipo: 'pensamento' | 'fala', icone: string, texto: string) {
    const chave = `${tipo}:${icone}:${texto}`
    if (chave === chaveBalaoAnterior) return
    chaveBalaoAnterior = chave

    const completo = `${icone} ${texto}`
    textoBalao.text = completo.length > 36 ? `${completo.slice(0, 35)}…` : completo
    const larg = Math.max(84, textoBalao.width + 24)
    const alt = 30

    fundoBalao.clear()
    // Sombra e corpo branco
    fundoBalao.roundRect(-larg / 2, -alt / 2 + 2, larg, alt, 14).fill({ color: 0x000000, alpha: 0.22 })
    fundoBalao.roundRect(-larg / 2, -alt / 2, larg, alt, 14).fill(0xffffff)
    fundoBalao
      .roundRect(-larg / 2, -alt / 2, larg, alt, 14)
      .stroke({ width: 2, color: tipo === 'fala' ? 0x38bdf8 : 0x84cc16, alpha: 0.9 })

    if (tipo === 'pensamento') {
      // Bolinhas de pensamento descendo até a cabeça
      fundoBalao.circle(-4, alt / 2 + 5, 3.5).fill(0xffffff)
      fundoBalao.circle(2, alt / 2 + 11, 2.2).fill(0xffffff)
    } else {
      // Rabicho de fala
      fundoBalao.poly([-6, alt / 2 - 1, 6, alt / 2 - 1, 0, alt / 2 + 9]).fill(0xffffff)
    }
  }

  function atualizarSim(
    sim: EstadoSim | undefined,
    ativo: boolean,
    modoCorpoInteiro: boolean,
    tempoTotalMS: number,
    deltaMS: number,
  ) {
    controladorAnel.animar(deltaMS, tempoTotalMS)
    grupoCorpo.visible = modoCorpoInteiro
    grupoCracha.visible = !modoCorpoInteiro

    const faseTempo = tempoTotalMS * 0.004 + (agenteId.charCodeAt(0) % 5)
    const posturaCorpo = sim?.postura.corpo ?? 'sentado_cadeira'

    // Animação de caminhada / postura / respiração no modo Corpo Inteiro
    if (modoCorpoInteiro) {
      let offsetY = 0
      let rotacao = 0
      if (posturaCorpo === 'andando') {
        offsetY = -Math.abs(Math.sin(tempoTotalMS * 0.014)) * 9
        rotacao = Math.sin(tempoTotalMS * 0.014) * 0.055
      } else if (posturaCorpo === 'sentado_cadeira' || posturaCorpo === 'sentado_sofa') {
        offsetY = 14 + Math.sin(faseTempo) * 1.6
      } else if (posturaCorpo === 'interagindo_em_pe') {
        offsetY = Math.sin(tempoTotalMS * 0.008) * 3
        rotacao = Math.sin(tempoTotalMS * 0.006) * 0.025
      } else {
        offsetY = Math.sin(faseTempo) * 2
      }

      spriteCorpo.y = offsetY
      spriteCorpo.rotation = rotacao
      const respiracaoEscala = 1 + Math.sin(faseTempo) * 0.014
      spriteCorpo.scale.set(escalaCorpo, escalaCorpo * respiracaoEscala)

      // Sombra no chão + anel de Sim ativo
      sombraChao.clear()
      sombraChao.ellipse(0, 0, 28, 13).fill({ color: 0x000000, alpha: 0.28 })

      anelChao.clear()
      const corDiamante = sim ? calcularCorDiamante(sim.necessidades).corNum : COR_NIVEL.bom.num
      if (ativo) {
        anelChao.ellipse(0, 0, 34, 16).stroke({ width: 3, color: corDiamante, alpha: 0.92 })
        anelChao.ellipse(0, 0, 39, 19).stroke({
          width: 1.5,
          color: corDiamante,
          alpha: 0.35 + 0.25 * Math.sin(tempoTotalMS * 0.005),
        })
      } else {
        anelChao.ellipse(0, 0, 30, 14).stroke({ width: 2, color: corIdentidade, alpha: 0.55 })
      }

      // Objeto carregado na mão (PostureAspectCarry)
      const carregando = sim?.postura.carregando ?? 'nada'
      if (carregando !== 'nada') {
        textoItemMao.visible = true
        textoItemMao.text =
          carregando === 'xicara_cafe' ? '☕' : carregando === 'livro' ? '📖' : '📱'
        textoItemMao.y = -58 + offsetY
      } else {
        textoItemMao.visible = false
      }

      // Etiqueta de nome + ícone de humor
      const infoHumor = sim ? INFO_HUMORES[sim.humor] : INFO_HUMORES.feliz
      const novaChaveEtiqueta = `${nomeAgente}:${infoHumor.icone}:${ativo}`
      if (novaChaveEtiqueta !== chaveEtiquetaAnterior) {
        chaveEtiquetaAnterior = novaChaveEtiqueta
        textoEtiqueta.text = `${infoHumor.icone} ${nomeAgente}`
        const largEtiq = textoEtiqueta.width + 14
        fundoEtiqueta.clear()
        fundoEtiqueta.roundRect(-largEtiq / 2, -10, largEtiq, 20, 10).fill({
          color: 0x0f172a,
          alpha: ativo ? 0.88 : 0.72,
        })
        fundoEtiqueta.roundRect(-largEtiq / 2, -10, largEtiq, 20, 10).stroke({
          width: ativo ? 1.5 : 1,
          color: ativo ? corDiamante : corIdentidade,
          alpha: 0.85,
        })
      }
    }

    // Diamante (grande no selecionado, compacto nos outros)
    faseGiroDiamante += deltaMS * 0.0026
    const corDiamante = sim ? calcularCorDiamante(sim.necessidades).corNum : COR_NIVEL.bom.num
    const progresso = sim?.interacaoAtual?.progresso ?? 0
    const escalaDiamante = ativo ? 1.05 : 0.52
    const baseDiamanteY = modoCorpoInteiro ? -ALTURA_CORPO_SIM - (ativo ? 22 : 10) : -raioTela - 24
    graficoDiamante.y = baseDiamanteY + Math.sin(tempoTotalMS * 0.0045) * 4.5
    graficoDiamante.alpha = ativo ? 1 : 0.78
    desenharDiamante(graficoDiamante, corDiamante, faseGiroDiamante, escalaDiamante, progresso)

    // Balão de pensamento / fala
    if (sim?.balao) {
      grupoBalao.visible = true
      grupoBalao.y = baseDiamanteY - (ativo ? 38 : 26) + Math.sin(tempoTotalMS * 0.005) * 2.5
      desenharBalao(sim.balao.tipo, sim.balao.icone, sim.balao.texto)
    } else {
      grupoBalao.visible = false
    }
  }

  return { container, controladorAnel, atualizarSim }
}

// Os 4 cantos externos da planta.
function cantos(colunas: number, linhas: number) {
  return {
    norte: paraTela(-0.5, -0.5),
    leste: paraTela(colunas - 0.5, -0.5),
    sul: paraTela(colunas - 0.5, linhas - 0.5),
    oeste: paraTela(-0.5, linhas - 0.5),
  }
}

function desenharLaje(colunas: number, linhas: number, paleta: Paleta): Graphics {
  const { leste, sul, oeste } = cantos(colunas, linhas)
  const g = new Graphics()

  g.poly([
    oeste.x, oeste.y,
    sul.x, sul.y,
    sul.x, sul.y + ESPESSURA_LAJE,
    oeste.x, oeste.y + ESPESSURA_LAJE,
  ])
  g.fill(paleta.lajeFrente)

  g.poly([
    sul.x, sul.y,
    leste.x, leste.y,
    leste.x, leste.y + ESPESSURA_LAJE,
    sul.x, sul.y + ESPESSURA_LAJE,
  ])
  g.fill(paleta.lajeLado)

  return g
}

function desenharPiso(
  colunas: number,
  linhas: number,
  paleta: Paleta,
  aoClicarPiso?: (coluna: number, linha: number, telaX: number, telaY: number) => void,
): Graphics {
  const g = new Graphics()
  const hw = TILE_W / 2
  const hh = TILE_H / 2

  for (let linha = 0; linha < linhas; linha++) {
    for (let coluna = 0; coluna < colunas; coluna++) {
      const { x, y } = paraTela(coluna, linha)
      g.poly([x, y - hh, x + hw, y, x, y + hh, x - hw, y])
      g.fill((coluna + linha) % 2 === 0 ? paleta.pisoClaro : paleta.pisoEscuro)
      g.stroke({ width: 1, color: paleta.pisoJunta, alignment: 0.5 })
    }
  }

  if (aoClicarPiso) {
    g.eventMode = 'static'
    g.cursor = 'pointer'
    g.on('pointertap', (e: FederatedPointerEvent) => {
      const local = g.toLocal(e.global)
      // Inversa exata de paraTela(coluna, linha, 0):
      const coluna = local.x / TILE_W + local.y / TILE_H
      const linha = local.y / TILE_H - local.x / TILE_W
      if (coluna >= -0.4 && coluna <= colunas - 0.4 && linha >= -0.4 && linha <= linhas - 0.4) {
        const cLimpo = Math.max(0, Math.min(colunas - 1, coluna))
        const lLimpo = Math.max(0, Math.min(linhas - 1, linha))
        aoClicarPiso(cLimpo, lLimpo, e.global.x, e.global.y)
      }
    })
  }

  return g
}

type Ponto2 = { x: number; y: number }

function naParede(de: Ponto2, ate: Ponto2, t: number, h: number): Ponto2 {
  return {
    x: de.x + (ate.x - de.x) * t,
    y: de.y + (ate.y - de.y) * t - h * ALTURA_PAREDE,
  }
}

function quadNaParede(
  g: Graphics,
  de: Ponto2,
  ate: Ponto2,
  t0: number,
  t1: number,
  h0: number,
  h1: number,
  cor: number,
) {
  const a = naParede(de, ate, t0, h1)
  const b = naParede(de, ate, t1, h1)
  const c = naParede(de, ate, t1, h0)
  const d = naParede(de, ate, t0, h0)
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y])
  g.fill(cor)
}

function desenharVidro(
  g: Graphics,
  de: Ponto2,
  ate: Ponto2,
  t0: number,
  t1: number,
  h0: number,
  h1: number,
  paleta: Paleta,
) {
  const a = naParede(de, ate, t0, h1)
  const b = naParede(de, ate, t1, h1)
  const c = naParede(de, ate, t1, h0)
  const d = naParede(de, ate, t0, h0)

  const ceu = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: paleta.janelaBrilho },
      { offset: 0.55, color: paleta.janelaVidro },
      { offset: 1, color: paleta.janelaVidroBase },
    ],
  })

  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y])
  g.fill(ceu)

  const rt0 = t0 + (t1 - t0) * 0.08
  const rt1 = t0 + (t1 - t0) * 0.32
  const p1 = naParede(de, ate, rt0, h1)
  const p2 = naParede(de, ate, rt1, h1)
  const p3 = naParede(de, ate, rt1 - (t1 - t0) * 0.16, h0)
  const p4 = naParede(de, ate, rt0 - (t1 - t0) * 0.16, h0)
  g.poly([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y])
  g.fill({ color: 0xffffff, alpha: 0.22 })
}

function desenharJanela(g: Graphics, de: Ponto2, ate: Ponto2, janela: Janela, paleta: Paleta) {
  const { inicio, fim, base, topo } = janela
  quadNaParede(g, de, ate, inicio, fim, base, topo, paleta.janelaMoldura)

  const margemT = (fim - inicio) * 0.12
  const margemH = (topo - base) * 0.1
  const vt0 = inicio + margemT
  const vt1 = fim - margemT
  const vh0 = base + margemH
  const vh1 = topo - margemH

  desenharVidro(g, de, ate, vt0, vt1, vh0, vh1, paleta)

  const meio = (vt0 + vt1) / 2
  const larguraCaixilho = (fim - inicio) * 0.035
  quadNaParede(g, de, ate, meio - larguraCaixilho, meio + larguraCaixilho, vh0, vh1, paleta.janelaMoldura)
  quadNaParede(g, de, ate, inicio - margemT, fim + margemT, base - 0.035, base, paleta.paredeTopo)
}

function normalizarParaEspessura(v: Ponto2): Ponto2 {
  const comprimento = Math.hypot(v.x, v.y)
  const escala = ESPESSURA_PAREDE / comprimento
  return { x: v.x * escala, y: v.y * escala }
}

function desenharPontaLateral(g: Graphics, ponta: Ponto2, fora: Ponto2, cor: number, paleta: Paleta) {
  const p2 = { x: ponta.x + fora.x, y: ponta.y + fora.y }

  g.poly([ponta.x, ponta.y, p2.x, p2.y, p2.x, p2.y - ALTURA_PAREDE, ponta.x, ponta.y - ALTURA_PAREDE])
  g.fill(cor)

  g.poly([
    ponta.x, ponta.y - ALTURA_PAREDE,
    p2.x, p2.y - ALTURA_PAREDE,
    p2.x, p2.y - ALTURA_PAREDE - ESPESSURA_PAREDE,
    ponta.x, ponta.y - ALTURA_PAREDE - ESPESSURA_PAREDE,
  ])
  g.fill(paleta.paredeTopo)
}

function desenharParede(
  de: Ponto2,
  ate: Ponto2,
  cor: number,
  janelas: Janela[],
  foraNaPonta: Ponto2,
  paleta: Paleta,
): Graphics {
  const g = new Graphics()
  const alturaRodape = 12

  g.poly([de.x, de.y, ate.x, ate.y, ate.x, ate.y - ALTURA_PAREDE, de.x, de.y - ALTURA_PAREDE])
  g.fill(cor)

  g.poly([de.x, de.y, ate.x, ate.y, ate.x, ate.y - alturaRodape, de.x, de.y - alturaRodape])
  g.fill(paleta.rodape)

  for (const janela of janelas) desenharJanela(g, de, ate, janela, paleta)

  g.poly([
    de.x, de.y - ALTURA_PAREDE,
    ate.x, ate.y - ALTURA_PAREDE,
    ate.x, ate.y - ALTURA_PAREDE - ESPESSURA_PAREDE,
    de.x, de.y - ALTURA_PAREDE - ESPESSURA_PAREDE,
  ])
  g.fill(paleta.paredeTopo)

  desenharPontaLateral(g, ate, foraNaPonta, cor, paleta)

  return g
}

export interface Cena {
  raiz: Container
  maquete: Maquete
  redesenharAgentes: () => void
  problemas: string[]
  paleta: Paleta
  definirAgentesClicaveis: (podem: boolean) => void
  definirEstadosAgentes: (estados: Map<string, EstadoAgente>) => void
  sincronizarMundoSims: (mundo: EstadoMundoSims) => void
  destruirAnimacoes: () => void
}

export interface OpcoesCena {
  aoClicarAgente?: (agenteId: string, telaX?: number, telaY?: number) => void
  aoClicarMovelSimulacao?: (movel: MovelSala, telaX: number, telaY: number) => void
  aoClicarPiso?: (coluna: number, linha: number, telaX: number, telaY: number) => void
}

function paletaValida(p: unknown): p is Paleta {
  if (typeof p !== 'object' || p === null) return false
  const registro = p as Record<string, unknown>
  return CHAVES_PALETA.every((chave) => typeof registro[chave] === 'number')
}

export async function criarCena(dados: SalaDados, opcoes: OpcoesCena = {}): Promise<Cena> {
  const problemas = conferirSala(dados, AGENTES.map((a) => a.id))
  for (const problema of problemas) console.warn(`[sala] ${problema}`)

  const colunas = typeof dados.colunas === 'number' && dados.colunas > 0 ? dados.colunas : 7
  const linhas = typeof dados.linhas === 'number' && dados.linhas > 0 ? dados.linhas : 7
  const paleta = paletaValida(dados.paleta) ? dados.paleta : PALETAS.neutra

  const maquete = new Maquete(dados)
  const [retratos] = await Promise.all([carregarRetratos(), maquete.montar()])

  const cena = new Container()
  const camadaMoveis = maquete.camada

  const { norte, leste, oeste } = cantos(colunas, linhas)

  const janelaEsquerda: Janela[] = [
    { inicio: 0.36, fim: 0.6, base: JANELA_BASE, topo: JANELA_TOPO },
  ]
  const janelaDireita: Janela[] = [
    { inicio: 0.36, fim: 0.6, base: JANELA_BASE, topo: JANELA_TOPO },
  ]

  const foraEsquerda = normalizarParaEspessura({ x: -TILE_W / 2, y: -TILE_H / 2 })
  const foraDireita = normalizarParaEspessura({ x: TILE_W / 2, y: -TILE_H / 2 })

  let agentesClicaveis = true

  const pisoGrafico = desenharPiso(colunas, linhas, paleta, (c, l, tx, ty) => {
    if (!agentesClicaveis) return
    opcoes.aoClicarPiso?.(c, l, tx, ty)
  })

  cena.addChild(
    desenharParede(norte, oeste, paleta.paredeEsquerda, janelaEsquerda, foraEsquerda, paleta),
    desenharParede(norte, leste, paleta.paredeDireita, janelaDireita, foraDireita, paleta),
    desenharLaje(colunas, linhas, paleta),
    pisoGrafico,
  )

  cena.addChild(camadaMoveis)

  // Marca de destino no chão quando o Sim ativo está caminhando até um tile
  const marcadorDestino = new Graphics()
  marcadorDestino.zIndex = 5
  marcadorDestino.visible = false
  camadaMoveis.addChild(marcadorDestino)

  const ALTURA_CRACHA = 0.62
  const avatares = new Map<string, AvatarSimVisual>()
  const estadosAtuais = new Map<string, EstadoAgente>()
  let mundoSimsAtual: EstadoMundoSims | null = null
  const moveisComHandlerSimulacao = new Set<string>()

  function ligarCliquesMoveisSimulacao() {
    for (const m of maquete.moveis) {
      const sprite = maquete.spriteDe(m.id)
      if (!sprite) continue
      if (agentesClicaveis) {
        sprite.eventMode = 'static'
        sprite.cursor = 'pointer'
      }
      if (moveisComHandlerSimulacao.has(m.id)) continue
      moveisComHandlerSimulacao.add(m.id)
      sprite.on('pointertap', (e: FederatedPointerEvent) => {
        if (!agentesClicaveis) return
        // Se for porta válida, o handler do editor já cuida ou o Pie Menu oferece viajar
        const movelAtual = maquete.movel(m.id)
        if (!movelAtual) return
        if (movelAtual.leva) return
        e.stopPropagation()
        opcoes.aoClicarMovelSimulacao?.(movelAtual, e.global.x, e.global.y)
      })
    }
  }

  function posicionarAvatarNaCena(agenteId: string, av: AvatarSimVisual) {
    const sim = mundoSimsAtual?.sims[agenteId]
    const modoCorpo = mundoSimsAtual?.modoCorpoInteiro ?? true
    const movelAssento = maquete.agentes().get(agenteId)

    const col = sim ? sim.coluna : (movelAssento?.coluna ?? 2)
    const lin = sim ? sim.linha : (movelAssento?.linha ?? 2)
    const altura = modoCorpo ? 0.04 : ALTURA_CRACHA

    const { x, y } = paraTela(col, lin, altura)
    av.container.x = x
    av.container.y = y

    // Ordenação de profundidade isométrica: se o Sim está sentado num móvel,
    // desenha logo à frente dele; se está andando pela sala, usa a profundidade
    // real (coluna + linha) para passar atrás das mesas da frente!
    const superficieId = sim?.postura.superficieId ?? movelAssento?.id
    const spriteSuperficie = superficieId ? maquete.spriteDe(superficieId) : undefined
    if (spriteSuperficie && sim?.postura.corpo !== 'andando') {
      av.container.zIndex = spriteSuperficie.zIndex + 50
    } else {
      av.container.zIndex = profundidade(col, lin) * 1000 + 250
    }
  }

  function redesenharAgentes() {
    for (const av of avatares.values()) av.container.destroy({ children: true })
    avatares.clear()

    // Desenha os Sims que possuem assento na sala ou estão no estado do mundo Sims
    const agentesDaSala = maquete.agentes()
    const idsParaRenderizar =
      agentesDaSala.size > 0
        ? Array.from(agentesDaSala.keys())
        : AGENTES.map((a) => a.id)

    for (const agenteId of idsParaRenderizar) {
      const agente = AGENTES.find((a) => a.id === agenteId)
      const retrato = retratos.get(agenteId)
      const recorte = RECORTES[agenteId]
      if (!agente || !retrato || !recorte) continue

      const av = criarAvatarSim(agenteId, agente.nome, retrato, recorte, agente.cor)
      const estado = estadosAtuais.get(agenteId)
      if (estado) av.controladorAnel.definirEstado(estado)

      if (opcoes.aoClicarAgente) {
        av.container.eventMode = agentesClicaveis ? 'static' : 'none'
        av.container.cursor = agentesClicaveis ? 'pointer' : 'default'
        av.container.on('pointertap', (e: FederatedPointerEvent) => {
          if (!agentesClicaveis) return
          e.stopPropagation()
          opcoes.aoClicarAgente?.(agenteId, e.global.x, e.global.y)
        })
      }

      posicionarAvatarNaCena(agenteId, av)
      camadaMoveis.addChild(av.container)
      avatares.set(agenteId, av)
    }

    ligarCliquesMoveisSimulacao()
  }

  function definirAgentesClicaveis(podem: boolean) {
    agentesClicaveis = podem
    pisoGrafico.eventMode = podem ? 'static' : 'none'
    pisoGrafico.cursor = podem ? 'pointer' : 'default'
    for (const av of avatares.values()) {
      av.container.eventMode = podem && opcoes.aoClicarAgente ? 'static' : 'none'
      av.container.cursor = podem && opcoes.aoClicarAgente ? 'pointer' : 'default'
    }
    if (podem) ligarCliquesMoveisSimulacao()
  }

  function definirEstadosAgentes(estados: Map<string, EstadoAgente>) {
    for (const [agenteId, estado] of estados) {
      estadosAtuais.set(agenteId, estado)
      avatares.get(agenteId)?.controladorAnel.definirEstado(estado)
    }
  }

  function sincronizarMundoSims(mundo: EstadoMundoSims) {
    mundoSimsAtual = mundo
    for (const [agenteId, av] of avatares.entries()) {
      posicionarAvatarNaCena(agenteId, av)
    }
  }

  let tempoAcumuladoMS = 0
  function aoTick(t: Ticker) {
    tempoAcumuladoMS += t.deltaMS
    const simAtivoId = mundoSimsAtual?.simAtivoId ?? AGENTES[0].id
    const modoCorpo = mundoSimsAtual?.modoCorpoInteiro ?? true

    for (const [agenteId, av] of avatares.entries()) {
      const sim = mundoSimsAtual?.sims[agenteId]
      posicionarAvatarNaCena(agenteId, av)
      av.atualizarSim(sim, agenteId === simAtivoId, modoCorpo, tempoAcumuladoMS, t.deltaMS)
    }

    // Desenha marcador no chão quando o Sim ativo está indo para um destino
    const simAtivo = mundoSimsAtual?.sims[simAtivoId]
    if (simAtivo && simAtivo.destinoColuna !== null && simAtivo.destinoLinha !== null) {
      const { x, y } = paraTela(simAtivo.destinoColuna, simAtivo.destinoLinha, 0.01)
      const raioPulso = 16 + Math.sin(tempoAcumuladoMS * 0.008) * 4
      marcadorDestino.clear()
      marcadorDestino.ellipse(x, y, raioPulso, raioPulso * 0.5).stroke({
        width: 2.5,
        color: COR_NIVEL.bom.num,
        alpha: 0.85,
      })
      marcadorDestino.circle(x, y, 4).fill({ color: COR_NIVEL.bom.num, alpha: 0.9 })
      marcadorDestino.visible = true
    } else {
      marcadorDestino.visible = false
    }
  }

  Ticker.shared.add(aoTick)
  function destruirAnimacoes() {
    Ticker.shared.remove(aoTick)
  }

  redesenharAgentes()

  return {
    raiz: cena,
    maquete,
    redesenharAgentes,
    problemas,
    paleta,
    definirAgentesClicaveis,
    definirEstadosAgentes,
    sincronizarMundoSims,
    destruirAnimacoes,
  }
}
