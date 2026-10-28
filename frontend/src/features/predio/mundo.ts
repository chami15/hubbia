// O prédio vivo: canvas, laço de quadros, câmera, clique e o ciclo de vida das salas. Imperativo de propósito (como
// a cena do Pixi era): o React só cria, empurra dados (status, hora, seleção) e escuta os cliques — nada aqui
// re-renderiza componente.
//
// Ciclo de vida de uma sala: adicionar agente → obra (OBRA_MS) → ele chega pelo elevador; dispensar → ele volta ao
// elevador e some → desmontagem (DESMONTE_MS) → a sala vira vaga.
import * as art from './habblaud/art/index'
import { pixelText, pixelTextWidth } from './habblaud/art/pixelfont'
import { agentePorId, corCss, type AgenteId } from './agentes'
import { DESMONTE_MS, H, MAX_VAGAS, OBRA_MS, areaEm, desenharPredio, lugaresInalcancaveis, montarPredio, type EstadoCena, type Obra } from './predio'
import { SALAS } from './salas'
import { criarRelogio } from './relogio'
import { pontoNaTela, temAtalho } from './atalho'
import {
  adicionarAgente, areasOcupadas, criarSimulacao, definirParado, dispensarAgente, figuras, iconeDe, mudarStatus, passo, portaDoElevador, visivel,
  atividadeDe, type AgenteVivo, type Status,
} from './sim'

export type Vagas = (AgenteId | null)[]

export interface OpcoesMundo {
  vagas: Vagas
  aoClicarAgente: (id: AgenteId) => void
  aoClicarVaga: (vaga: number) => void
  /** Clique direito num agente que tem atalho rápido (ver `atalho.ts`). */
  aoAtalhoAgente?: (id: AgenteId) => void
  /** Avisado sempre que as vagas mudam (para salvar). */
  aoMudarVagas: (vagas: Vagas) => void
}

export interface ResumoAgente {
  id: AgenteId
  status: Status
  atividade: string
  chegando: boolean
  saindo: boolean
}

export interface Mundo {
  adicionar: (id: AgenteId, vaga?: number) => boolean
  dispensar: (id: AgenteId) => void
  definirStatus: (status: ReadonlyMap<AgenteId, Status>) => void
  definirHora: (hora: number) => void
  selecionar: (id: AgenteId | null) => void
  /** Congela só este agente (o atalho está aberto nele); `null` solta quem estava congelado. */
  congelar: (id: AgenteId | null) => void
  /** Cabeça do agente em coordenada de tela (viewport), ou null se ele não está visível. Para ancorar HTML por cima do canvas. */
  ancora: (id: AgenteId) => { x: number; y: number; pe: number } | null
  /** Quem está no prédio agora (inclui quem está chegando ou saindo). */
  agentes: () => ResumoAgente[]
  vagas: () => Vagas
  temEspaco: () => boolean
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

  const vagas: Vagas = [...opcoes.vagas]
  const obras = new Map<number, Obra>()
  const luz: Record<string, number> = {}
  let statusDesejado: ReadonlyMap<AgenteId, Status> = new Map()
  let hora = new Date().getHours()
  let selecionado: AgenteId | null = null
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

  let predio = montarPredio(vagas)
  const sim = criarSimulacao(predio, aoSair)
  for (const id of vagas) if (id) adicionarAgente(sim, id, 0, { jaNaMesa: true, status: STATUS_PADRAO })

  function reconstruir() {
    predio = montarPredio(vagas)
    sim.predio = predio
    canvas.width = predio.W
    canvas.height = H
    ajustarEscala()
    const ruins = lugaresInalcancaveis(predio)
    if (ruins.length) console.warn('[predio] lugares inalcançáveis:', ruins.map((l) => l.id).join(', '))
  }

  const statusDe = (id: AgenteId) => statusDesejado.get(id) ?? STATUS_PADRAO

  function adicionar(id: AgenteId, vagaEscolhida?: number): boolean {
    if (vagas.includes(id) || !SALAS[id] || !agentePorId(id)) return false
    const livre = (k: number) => vagas[k] === null && !obras.has(k)
    let i = vagaEscolhida !== undefined && livre(vagaEscolhida) ? vagaEscolhida : vagas.findIndex((_, k) => livre(k))
    if (i < 0) {
      if (vagas.length >= MAX_VAGAS) return false
      i = vagas.length
      vagas.push(null, null)
    }
    const t = relogio()
    vagas[i] = id
    obras.set(i, { inicio: t, tipo: 'construir' })
    reconstruir()
    adicionarAgente(sim, id, t, { chegaEm: t + OBRA_MS, status: statusDe(id) })
    opcoes.aoMudarVagas([...vagas])
    return true
  }

  function aoSair(id: AgenteId) {
    const i = vagas.indexOf(id)
    if (i >= 0) obras.set(i, { inicio: relogio(), tipo: 'desmontar' })
  }

  /** Fecha as obras que terminaram (a desmontagem só libera a vaga no fim, quando a sala já sumiu). */
  function fecharObras(t: number) {
    for (const [i, o] of obras) {
      if (o.tipo === 'construir' && t - o.inicio >= OBRA_MS) obras.delete(i)
      if (o.tipo === 'desmontar' && t - o.inicio >= DESMONTE_MS) {
        obras.delete(i)
        vagas[i] = null
        reconstruir()
        opcoes.aoMudarVagas([...vagas])
      }
    }
  }

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
    vagaSob = !a && ar?.livre && !obras.has(ar.vaga as number) ? ar.vaga : undefined
    canvas.style.cursor = a || ar?.dono || vagaSob !== undefined ? 'pointer' : 'default'
  }
  function aoSairDoCanvas() {
    sobre = undefined
    vagaSob = undefined
  }
  function aoClicar(ev: MouseEvent) {
    const [x, y] = pontoNoMundo(ev)
    const a = agenteEm(x, y)
    if (a && !a.saindo) return opcoes.aoClicarAgente(a.def.id)
    const ar = areaEm(predio, x, y)
    if (ar?.livre && !obras.has(ar.vaga as number)) return opcoes.aoClicarVaga(ar.vaga as number)
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

  function sobreposicoes(t: number) {
    return (c: CanvasRenderingContext2D) => {
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
      passo(sim, tt, d)
      dt -= d
    }
    ultimo = t
    fecharObras(t)

    const ocupadas = areasOcupadas(sim, t)
    for (const a of predio.areas) {
      const alvo = ocupadas.has(a.id) ? 1 : a.livre ? 0.7 : a.dono ? 0 : 0.6
      luz[a.id] = (luz[a.id] ?? alvo) + (alvo - (luz[a.id] ?? alvo)) * 0.06
    }
    const telas: EstadoCena['telas'] = {}
    for (const a of sim.agentes) {
      const naSala = areaEm(predio, a.x, a.y - 4)?.id === a.def.id
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
        agora: new Date(),
        telas,
        luz,
        elevadores: [portaDoElevador(sim.elevadorAbriu[0], t), portaDoElevador(sim.elevadorAbriu[1], t)],
        obras,
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
    dispensar: (id) => dispensarAgente(sim, id, relogio()),
    definirStatus: (status) => {
      statusDesejado = status
      const t = relogio()
      for (const a of sim.agentes) mudarStatus(sim, a.def.id, statusDe(a.def.id), t)
    },
    definirHora: (h) => {
      hora = h
    },
    selecionar: (id) => {
      selecionado = id
    },
    congelar: (id) => {
      for (const a of sim.agentes) definirParado(sim, a.def.id, a.def.id === id)
    },
    ancora: (id) => {
      const a = sim.agentes.find((g) => g.def.id === id)
      if (!a || !visivel(a, relogio())) return null
      const caixa = canvas.getBoundingClientRect()
      const topo = a.y - (a.seated ? 27 : 30)
      const p = pontoNaTela(caixa, { W: predio.W, H }, { x: a.x, y: topo })
      // `pe`: da cabeça até logo abaixo dos pés, já na escala da tela (a bolha desce até aí quando não cabe em cima)
      return { ...p, pe: ((a.y + 4 - topo) / H) * caixa.height }
    },
    agentes: () =>
      sim.agentes.map((a) => ({ id: a.def.id, status: a.status, atividade: atividadeDe(a), chegando: a.chegando, saindo: a.saindo })),
    vagas: () => [...vagas],
    temEspaco: () => vagas.some((v, k) => v === null && !obras.has(k)) || vagas.length < MAX_VAGAS,
    destruir: () => {
      cancelAnimationFrame(quadroId)
      observador.disconnect()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      canvas.remove()
    },
  }
}
