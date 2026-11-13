// O prédio vivo: canvas, laço de quadros, câmera, clique e o ciclo de vida das salas. Imperativo de propósito (como
// a cena do Pixi era): o React só cria, empurra dados (status, hora, seleção) e escuta os cliques — nada aqui
// re-renderiza componente.
//
// Vários andares: o edifício (edificio.ts) roda TODOS ao mesmo tempo, e este módulo só desenha o andar visível (a
// "câmera"). Trocar de andar é só trocar o que se desenha: ninguém congela. Clique no elevador avisa a tela, que abre
// o painel do elevador e faz a animação das portas (Escritorio + PainelElevador).
//
// Ciclo de vida de uma sala: adicionar agente → obra (OBRA_MS) → ele chega pelo elevador; dispensar → ele volta ao
// elevador e some → desmontagem (DESMONTE_MS) → a sala vira vaga. Vagas e obras moram no edifício, por andar.
import * as art from './habblaud/art/index'
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont'
import { corCss, type AgenteId } from './agentes'
import { ANDARES, type AndarId } from './andares'
import {
  adicionarNoAndar, agentesDoEdificio, ampliada, ampliar, andarAtual, casaDe, criarEdificio, definirStatus as definirStatusNoEdificio, dispensar,
  falarNoEdificio, mudarDeAndar, ondeAmpliar, passoEdificio, reduzir, resumoDoAndar, temEspaco, vagasDoEdificio, visitandoNoEdificio, visitarNoEdificio,
  type AmpliacoesPorAndar, type AndarVivo, type ResumoAgente, type VagasPorAndar,
} from './edificio'
import { H, areaEm, desenharPredio, lugaresInalcancaveis, type EstadoCena } from './predio'
import { criarRelogio } from './relogio'
import { pontoNaTela, temAtalho } from './atalho'
import { ALTURA_LINHA, layoutBalao, textoParaBalao, type Encontro } from './encontros'
import type { Humor } from './humor'
import { dataComHora } from './relogioDoMundo'
import { afinidade, type Afinidades } from './relacoes'
import {
  areasOcupadas, definirHoraDoMundo, definirHumores, definirParado, definirTracos, figuras, iconeDe, pensar, portaDoElevador, visivel,
  type AgenteVivo, type Status,
} from './sim'

export type { AmpliacoesPorAndar, ResumoAgente, Vagas, VagasPorAndar } from './edificio'

export interface OpcoesMundo {
  vagas: VagasPorAndar
  /** Salas ampliadas salvas (vaga absorvida → dono), por andar. */
  ampliadas?: AmpliacoesPorAndar
  aoClicarAgente: (id: AgenteId) => void
  /** Vaga livre clicada no andar visível. */
  aoClicarVaga: (vaga: number) => void
  /** Clique num elevador do andar visível: a tela abre o painel do elevador. */
  aoClicarElevador?: () => void
  /** Clique direito num agente que tem atalho rápido (ver `atalho.ts`). */
  aoAtalhoAgente?: (id: AgenteId) => void
  /** Avisado sempre que as vagas (ou as ampliações) mudam (para salvar). */
  aoMudarVagas: (vagas: VagasPorAndar, ampliadas: AmpliacoesPorAndar) => void
}

/** Um andar para o painel do elevador. */
export interface ResumoAndar {
  id: AndarId
  nome: string
  botao: string
  agentes: number
  precisaDeVoce: number
}

export interface Mundo {
  /** Coloca o agente numa vaga do andar visível (a escolhida, ou a próxima livre). */
  adicionar: (id: AgenteId, vaga?: number) => boolean
  dispensar: (id: AgenteId) => void
  definirStatus: (status: ReadonlyMap<AgenteId, Status>) => void
  definirHora: (hora: number) => void
  selecionar: (id: AgenteId | null) => void
  /** Humor de cada agente com o motivo (humor.ts): vira postura e o pensamento ao selecionar. */
  definirHumores: (m: ReadonlyMap<AgenteId, { humor: Humor; motivo: string }>) => void
  /** Afinidade real entre colegas (relacoes.ts): o almoço em duplas passa a juntar quem se dá bem. */
  definirAfinidades: (m: Afinidades) => void
  /** Extroversão real (GET /agentes) por agente local: guia o quanto cada um sai da sala. */
  definirTracos: (m: ReadonlyMap<AgenteId, { extroversao: number }>) => void
  /** Encontros a partir de mensagens sociais reais (visita com balão, ou só o balão de resposta). */
  aplicarEncontros: (lista: Encontro[]) => void
  /** Quem está visitando quem agora (o planejador usa para a resposta virar balão). */
  visitando: () => Map<AgenteId, AgenteId>
  /** Congela só este agente (o atalho está aberto nele); `null` solta quem estava congelado. */
  congelar: (id: AgenteId | null) => void
  /** Cabeça do agente em coordenada de tela (viewport), ou null se ele não está visível. Para ancorar HTML por cima do canvas. */
  ancora: (id: AgenteId) => { x: number; y: number; pe: number } | null
  /** Quem está no prédio agora (inclui quem está chegando ou saindo). */
  agentes: () => ResumoAgente[]
  vagas: () => VagasPorAndar
  /** Cabe mais alguém no andar visível? */
  temEspaco: () => boolean
  /** Andar que está sendo desenhado. */
  andarVisivel: () => AndarId
  /** Passa a desenhar outro andar, na hora (a animação das portas é da tela, por cima). */
  mostrarAndar: (andar: AndarId) => void
  /** Onde o agente está agora: andar, `null` no elevador, `undefined` fora do prédio. */
  andarDoAgente: (id: AgenteId) => AndarId | null | undefined
  andares: () => ResumoAndar[]
  /** Andar da sala do agente (quem está se mudando já conta o novo). */
  casaDe: (id: AgenteId) => AndarId | undefined
  /** A sala (de um agente, no andar dele; ou a copa, no andar dado) pode ampliar agora? */
  podeAmpliar: (dono: AgenteId | 'copa', andar: AndarId) => boolean
  ampliada: (dono: AgenteId | 'copa', andar: AndarId) => boolean
  ampliar: (dono: AgenteId | 'copa', andar: AndarId) => boolean
  reduzir: (dono: AgenteId | 'copa', andar: AndarId) => boolean
  /** Cabe mais alguém no andar dado? */
  temEspacoEm: (andar: AndarId) => boolean
  /** Muda o agente de andar: sala nova em obra lá, ele pega o elevador, a sala antiga é desmontada. */
  mudarDeAndar: (id: AgenteId, andar: AndarId) => boolean
  destruir: () => void
}

/** Status inicial de quem ainda não tem dado do backend (agente conceito, ou o backend fora do ar). */
const STATUS_PADRAO: Status = 'trabalhando'

export function criarMundo(hospedeiro: HTMLElement, opcoes: OpcoesMundo): Mundo {
  const canvas = document.createElement('canvas')
  canvas.style.imageRendering = 'pixelated'
  canvas.style.display = 'block'
  canvas.style.borderRadius = '6px'
  canvas.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.45)'
  hospedeiro.appendChild(canvas)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  // luz de cada sala, por andar (os ids das áreas só são únicos dentro do andar)
  const luzes = new Map<AndarId, Record<string, number>>()
  let statusDesejado: ReadonlyMap<AgenteId, Status> = new Map()
  let hora = new Date().getHours()
  let selecionado: AgenteId | null = null
  let humores: ReadonlyMap<AgenteId, { humor: Humor; motivo: string }> = new Map()
  let sobre: AgenteId | undefined
  let vagaSob: number | undefined

  // relógio que não conta o tempo com a aba escondida (os agentes não "teleportam" ao voltar; ver relogio.ts)
  const tempo = criarRelogio()
  const relogio = tempo.agora
  function aoMudarVisibilidade() {
    if (document.hidden) tempo.pausar()
    else tempo.retomar()
  }
  document.addEventListener('visibilitychange', aoMudarVisibilidade)

  const statusDe = (id: AgenteId) => statusDesejado.get(id) ?? STATUS_PADRAO
  const ed = criarEdificio(opcoes.vagas, 0, { aoMudarVagas: opcoes.aoMudarVagas, status: statusDe, ampliadas: opcoes.ampliadas })
  let visivelId: AndarId = ANDARES[0].id
  // o andar visível; `predio` e `sim` são atalhos para ele (o resto do arquivo desenha só este)
  const atual = (): AndarVivo => ed.andares.get(visivelId) as AndarVivo
  let predio = atual().predio
  let sim = atual().sim

  function reconstruir() {
    predio = atual().predio
    sim = atual().sim
    canvas.width = predio.W
    canvas.height = H
    ajustarEscala()
    const ruins = lugaresInalcancaveis(predio)
    if (ruins.length) console.warn('[predio] lugares inalcançáveis:', ruins.map((l) => l.id).join(', '))
  }
  ed.aoRemontar = (andar) => {
    if (andar === visivelId) reconstruir()
  }

  function adicionar(id: AgenteId, vagaEscolhida?: number): boolean {
    return adicionarNoAndar(ed, id, visivelId, relogio(), vagaEscolhida)
  }

  /** Sims de todos os andares (o que vem do backend vale para todos). */
  const sims = () => [...ed.andares.values()].map((an) => an.sim)

  // ---------------------------------------------------------------- câmera

  function ajustarEscala() {
    const r = hospedeiro.getBoundingClientRect()
    const cabe = Math.min((r.width - 32) / predio.W, (r.height - 32) / H)
    // inteira a partir de 2x (pixel nítido); abaixo disso ocupa o espaço que tiver
    const escala = cabe >= 2 ? Math.floor(cabe) : Math.max(0.5, cabe)
    canvas.style.width = `${predio.W * escala}px`
    canvas.style.height = `${H * escala}px`
  }
  const observador = new ResizeObserver(ajustarEscala)
  observador.observe(hospedeiro)

  function pontoNoMundo(ev: MouseEvent): [number, number] {
    const r = canvas.getBoundingClientRect()
    return [((ev.clientX - r.left) / r.width) * predio.W, ((ev.clientY - r.top) / r.height) * H]
  }

  function agenteEm(x: number, y: number): AgenteVivo | undefined {
    const t = relogio()
    // caixa do corpo: ~16 px de largura, ~28 de altura acima dos pés; o mais à frente ganha
    return sim.agentes
      .filter((a) => visivel(a, t) && Math.abs(x - a.x) <= 8 && y <= a.y + 2 && y >= a.y - 28)
      .sort((a, b) => b.sortY - a.sortY)[0]
  }

  function aoMover(ev: PointerEvent) {
    const [x, y] = pontoNoMundo(ev)
    const a = agenteEm(x, y)
    const ar = areaEm(predio, x, y)
    sobre = a?.def.id
    vagaSob = !a && ar?.livre && !atual().obras.has(ar.vaga as number) ? ar.vaga : undefined
    const elevador = !a && !!opcoes.aoClicarElevador && noElevador(x, y)
    canvas.style.cursor = a || ar?.dono || vagaSob !== undefined || elevador ? 'pointer' : 'default'
  }
  function aoSairDoCanvas() {
    sobre = undefined
    vagaSob = undefined
  }
  /** O ponto está na porta de um elevador do andar? */
  const noElevador = (x: number, y: number) =>
    predio.elevadores.some(({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h + 6)

  function aoClicar(ev: MouseEvent) {
    const [x, y] = pontoNoMundo(ev)
    const a = agenteEm(x, y)
    if (a && !a.saindo) return opcoes.aoClicarAgente(a.def.id)
    if (opcoes.aoClicarElevador && noElevador(x, y)) return opcoes.aoClicarElevador()
    const ar = areaEm(predio, x, y)
    if (ar?.livre && !atual().obras.has(ar.vaga as number)) return opcoes.aoClicarVaga(ar.vaga as number)
    // clique na sala abre o dono (se ele já chegou e não está indo embora)
    const dono = ar?.dono && sim.agentes.find((g) => g.def.id === ar.dono && !g.chegando && !g.saindo)
    if (dono) opcoes.aoClicarAgente(dono.def.id)
  }
  function aoClicarDireito(ev: MouseEvent) {
    const [x, y] = pontoNoMundo(ev)
    const a = agenteEm(x, y)
    if (!a || a.saindo || !temAtalho(a.def.id) || !opcoes.aoAtalhoAgente) return
    ev.preventDefault() // só nos agentes com atalho: no resto o menu do navegador continua normal
    opcoes.aoAtalhoAgente(a.def.id)
  }
  canvas.addEventListener('pointermove', aoMover)
  canvas.addEventListener('contextmenu', aoClicarDireito)
  canvas.addEventListener('pointerleave', aoSairDoCanvas)
  canvas.addEventListener('click', aoClicar)

  // ---------------------------------------------------------------- laço

  /** Balão de fala em pixel art: borda escura com cantos cortados, fundo creme e cauda em degraus apontando para quem fala. */
  function desenharBalao(c: CanvasRenderingContext2D, linhas: string[], x: number, topo: number, pensamento = false) {
    const b = layoutBalao(linhas, x, topo, predio.W)
    const tinta = '#1f2430'
    const papel = '#fbf7ef'
    c.fillStyle = tinta
    c.fillRect(b.x0 + 1, b.y0, b.w - 2, b.h)
    c.fillRect(b.x0, b.y0 + 1, b.w, b.h - 2)
    if (pensamento) {
      // pensamento: a cauda são duas bolinhas descendo até a cabeça (como nos quadrinhos), não o bico da fala
      c.fillRect(b.caudaX - 2, b.y0 + b.h + 1, 4, 4)
      c.fillRect(b.caudaX, b.y0 + b.h + 6, 3, 3)
    } else {
      c.fillRect(b.caudaX - 2, b.y0 + b.h, 5, 1)
      c.fillRect(b.caudaX - 1, b.y0 + b.h + 1, 3, 1)
      c.fillRect(b.caudaX, b.y0 + b.h + 2, 1, 1)
    }
    c.fillStyle = papel
    c.fillRect(b.x0 + 1, b.y0 + 1, b.w - 2, b.h - 2)
    if (pensamento) {
      c.fillRect(b.caudaX - 1, b.y0 + b.h + 2, 2, 2)
      c.fillRect(b.caudaX + 1, b.y0 + b.h + 7, 1, 1)
    } else {
      c.fillRect(b.caudaX - 1, b.y0 + b.h - 1, 3, 1)
      c.fillRect(b.caudaX, b.y0 + b.h, 1, 1)
    }
    // +3: espaço dos acentos, que a fonte desenha acima da letra
    linhas.forEach((l, i) => pixelText(c, l, b.x0 + 3, b.y0 + 6 + i * ALTURA_LINHA, tinta))
  }

  function sobreposicoes(t: number) {
    return (c: CanvasRenderingContext2D) => {
      const baloes: (() => void)[] = []
      for (const a of sim.agentes) {
        if (!visivel(a, t)) continue
        const cor = corCss(a.def.cor)
        const marcado = a.def.id === selecionado
        const topo = a.y - (a.seated ? 27 : 30)
        if (marcado) {
          c.strokeStyle = cor
          c.lineWidth = 1
          c.beginPath()
          c.ellipse(Math.round(a.x) + 0.5, Math.round(a.seated ? a.sortY - 0.25 : a.y) + 0.5, 8, 3, 0, 0, Math.PI * 2)
          c.stroke()
        }
        const icone = iconeDe(a, t)
        if (icone) {
          const pisca = icone === 'alert' ? Math.floor(t / 400) % 2 : 0
          const sp = art.iconSprite(icone)
          c.drawImage(sp.canvas, Math.round(a.x - sp.ax), Math.round(topo - 4 - pisca - sp.ay))
        }
        const fala = a.fala
        if (fala && t < fala.ate) baloes.push(() => desenharBalao(c, fala.linhas, Math.round(a.x), Math.round(topo), fala.pensamento))
        if (marcado || a.def.id === sobre) {
          // quem tem atalho avisa como chegar nele, só no hover (nada fixo na tela)
          const nome = a.def.nome.toLowerCase() + (a.def.id === sobre && temAtalho(a.def.id) && opcoes.aoAtalhoAgente ? ' (clique direito)' : '')
          const tw = pixelTextWidth(nome)
          const x0 = Math.round(a.x - tw / 2) - 3
          const y0 = Math.round(a.y + 3)
          c.fillStyle = 'rgba(11,14,20,0.82)'
          c.fillRect(x0, y0, tw + 6, 9)
          c.fillStyle = cor
          c.fillRect(x0, y0 + 8, tw + 6, 1)
          pixelText(c, nome, x0 + 3, y0 + 2, '#e6ebf4')
        }
      }
      for (const desenhar of baloes) desenhar()
    }
  }

  let ultimo = 0
  let quadroId = 0
  function quadro() {
    const t = relogio()
    // passos de no máximo 50 ms: num navegador lento a simulação não atravessa parede
    let dt = Math.min(1000, t - ultimo)
    let tt = ultimo
    while (dt > 0) {
      const d = Math.min(50, dt)
      tt += d
      // todos os andares andam; só o visível é desenhado
      passoEdificio(ed, tt, d)
      dt -= d
    }
    ultimo = t

    const ocupadas = areasOcupadas(sim, t)
    const luz = luzes.get(visivelId) ?? {}
    luzes.set(visivelId, luz)
    for (const a of predio.areas) {
      // sala ampliada é um ambiente só: alguém em qualquer metade acende as duas
      const ocupada = ocupadas.has(a.id) || ocupadas.has(a.anexoDe ?? `${a.id}:anexo`)
      const alvo = ocupada ? 1 : a.livre ? 0.7 : a.dono ? 0 : 0.6
      luz[a.id] = (luz[a.id] ?? alvo) + (alvo - (luz[a.id] ?? alvo)) * 0.06
    }
    const telas: EstadoCena['telas'] = {}
    for (const a of sim.agentes) {
      const onde = areaEm(predio, a.x, a.y - 4)
      const naSala = onde?.id === a.def.id || onde?.anexoDe === a.def.id
      const naMesa = !!a.lugar?.mesa
      telas[a.def.id] =
        a.status === 'dormindo' ? 'off' : naMesa && a.status === 'trabalhando' ? a.def.tela : naMesa && a.status === 'precisa_de_voce' ? 'alert' : naMesa && a.status === 'conversando' ? 'chat' : naMesa && a.status === 'pensando' ? 'search' : naSala ? 'standby' : 'off'
    }
    desenharPredio(
      ctx,
      predio,
      {
        t,
        hora,
        // relógio de parede na hora do MUNDO (antes era a do navegador: dois relógios diferentes na mesma tela)
        agora: dataComHora(hora),
        telas,
        luz,
        elevadores: sim.elevadorAbriu.map((abriu) => portaDoElevador(abriu, t)),
        obras: atual().obras,
        vagaSob,
      },
      figuras(sim, t),
      sobreposicoes(t),
    )
    quadroId = requestAnimationFrame(quadro)
  }

  reconstruir()
  quadroId = requestAnimationFrame(quadro)

  return {
    adicionar,
    dispensar: (id) => dispensar(ed, id, relogio()),
    definirStatus: (status) => {
      statusDesejado = status
      definirStatusNoEdificio(ed, relogio())
    },
    definirHora: (h) => {
      hora = h
      for (const s of sims()) definirHoraDoMundo(s, h)
    },
    selecionar: (id) => {
      // selecionar alguém com humor mostra o porquê num balão de pensamento (só nesse momento; some sozinho)
      if (id && id !== selecionado) {
        const h = humores.get(id)
        const onde = andarAtual(ed, id)
        if (h && onde !== undefined && onde !== null) pensar((ed.andares.get(onde) as AndarVivo).sim, id, textoParaBalao(h.motivo), relogio())
      }
      selecionado = id
    },
    definirHumores: (m) => {
      humores = m
      for (const s of sims()) definirHumores(s, m, relogio())
    },
    congelar: (id) => {
      for (const s of sims()) for (const a of s.agentes) definirParado(s, a.def.id, a.def.id === id)
    },
    definirAfinidades: (m) => {
      for (const s of sims()) s.afinidade = (a, b) => afinidade(m, a, b)
    },
    definirTracos: (m) => {
      for (const s of sims()) definirTracos(s, m)
    },
    aplicarEncontros: (lista) => {
      const t = relogio()
      for (const e of lista) {
        if (e.tipo === 'visita') visitarNoEdificio(ed, e.de, e.para, e.linhas, t)
        else falarNoEdificio(ed, e.de, e.linhas, t)
      }
    },
    visitando: () => visitandoNoEdificio(ed),
    ancora: (id) => {
      const a = sim.agentes.find((g) => g.def.id === id)
      if (!a || !visivel(a, relogio())) return null
      const caixa = canvas.getBoundingClientRect()
      const topo = a.y - (a.seated ? 27 : 30)
      const p = pontoNaTela(caixa, { W: predio.W, H }, { x: a.x, y: topo })
      // `pe`: da cabeça até logo abaixo dos pés, já na escala da tela (a bolha desce até aí quando não cabe em cima)
      return { ...p, pe: ((a.y + 4 - topo) / H) * caixa.height }
    },
    agentes: () => agentesDoEdificio(ed),
    vagas: () => vagasDoEdificio(ed),
    temEspaco: () => temEspaco(ed, visivelId),
    andarVisivel: () => visivelId,
    mostrarAndar: (andar) => {
      if (andar === visivelId || !ed.andares.has(andar)) return
      visivelId = andar
      sobre = undefined
      vagaSob = undefined
      reconstruir()
    },
    andarDoAgente: (id) => andarAtual(ed, id),
    andares: () => ANDARES.map((a) => ({ id: a.id, nome: a.nome, botao: a.botao, ...resumoDoAndar(ed, a.id) })),
    casaDe: (id) => casaDe(ed, id),
    podeAmpliar: (dono, andar) => ondeAmpliar(ed, andar, dono).length > 0,
    ampliada: (dono, andar) => ampliada(ed, andar, dono),
    ampliar: (dono, andar) => ampliar(ed, andar, dono, relogio()),
    reduzir: (dono, andar) => reduzir(ed, andar, dono, relogio()),
    temEspacoEm: (andar) => temEspaco(ed, andar),
    mudarDeAndar: (id, andar) => mudarDeAndar(ed, id, andar, relogio()),
    destruir: () => {
      cancelAnimationFrame(quadroId)
      observador.disconnect()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      canvas.remove()
    },
  }
}
