// O edifício: todos os andares vivos ao mesmo tempo, sem DOM (testado em __testes__/edificio.test.ts).
//
// Cada andar tem o seu prédio (predio.ts) e a sua simulação (sim.ts). Os andares que o chefe não está vendo continuam
// rodando: os agentes trabalham, almoçam, visitam; só o desenho é do andar visível (mundo.ts). Por isso este módulo
// não sabe nada de canvas: ele é o "motor" e o mundo é a "câmera".
//
// Ligação entre andares = o elevador. Quem embarca num andar (sim.aoViajar) fica "em viagem" por um tempo
// proporcional à distância e é entregue no elevador do destino (receberViajante). Um agente está sempre em um lugar
// só: num andar, em viagem, ou fora do prédio.
//
// Vagas e obras também moram aqui, por andar: adicionar um agente abre obra na vaga, ele chega pelo elevador daquele
// andar; dispensado, vai ao elevador de onde estiver, e a sala da casa dele é desmontada.
import { agentePorId, type AgenteId } from './agentes'
import { ANDARES, andarPorId, type AndarDef, type AndarId } from './andares'
import { DESMONTE_MS, OBRA_MS, montarPredio, type Obra, type Predio } from './predio'
import { SALAS } from './salas'
import {
  adicionarAgente, atividadeDe, criarSimulacao, dispensarAgente, falar, mudarStatus, passo, receberViajante, viajar, visitar, visitando,
  type AgenteVivo, type Simulacao, type Status,
} from './sim'

export type Vagas = (AgenteId | null)[]
export type VagasPorAndar = Record<AndarId, Vagas>

/** Quanto dura a viagem de elevador: um tanto fixo (porta, partida) mais um tanto por andar. */
export function duracaoDaViagem(de: AndarId, para: AndarId): number {
  return 1400 + 900 * Math.abs(para - de)
}

export interface AndarVivo {
  def: AndarDef
  vagas: Vagas
  predio: Predio
  sim: Simulacao
  obras: Map<number, Obra>
}

export interface Edificio {
  andares: Map<AndarId, AndarVivo>
  emViagem: { a: AgenteVivo; de: AndarId; chegaEm: number }[]
  /** Avisado sempre que as vagas de algum andar mudam (para salvar). */
  aoMudarVagas: (v: VagasPorAndar) => void
  /** Status que o backend quer para cada agente (aplicado também a quem chega de viagem). */
  status: (id: AgenteId) => Status
  /** Remonta o prédio de um andar (o mundo redesenha); avisado quando as vagas dele mudam. */
  aoRemontar?: (andar: AndarId) => void
  /** Instante do último passo: quem vai embora é avisado de dentro do passo da simulação, que não repassa o tempo. */
  t: number
}

export interface ResumoAgente {
  id: AgenteId
  status: Status
  atividade: string
  chegando: boolean
  saindo: boolean
  /** Andar onde está agora; `null` = dentro do elevador, entre andares. */
  andar: AndarId | null
  /** Andar da sala dele. */
  casa: AndarId
}

/** Vagas de um andar sem nada (os de núcleo à direita têm número fixo de salas; o térreo começa com 2 colunas). */
export function vagasVazias(def: AndarDef): Vagas {
  return Array<AgenteId | null>(def.nucleo.lado === 'direita' ? def.maxVagas : 4).fill(null)
}

export function criarEdificio(
  vagas: VagasPorAndar,
  agora: number,
  o: { aoMudarVagas: (v: VagasPorAndar) => void; status: (id: AgenteId) => Status; andares?: readonly AndarDef[] },
): Edificio {
  const ed: Edificio = { andares: new Map(), emViagem: [], aoMudarVagas: o.aoMudarVagas, status: o.status, t: agora }
  for (const def of o.andares ?? ANDARES) {
    const vs = [...(vagas[def.id] ?? vagasVazias(def))]
    const predio = montarPredio(vs, def)
    const andar: AndarVivo = { def, vagas: vs, predio, sim: criarSimulacao(predio, (id) => aoSair(ed, id)), obras: new Map() }
    andar.sim.aoViajar = (a, t) => ed.emViagem.push({ a, de: def.id, chegaEm: t + duracaoDaViagem(def.id, a.viagem?.andar ?? def.id) })
    ed.andares.set(def.id, andar)
    for (const id of vs) if (id) adicionarAgente(andar.sim, id, agora, { jaNaMesa: true, status: o.status(id), casa: def.id })
  }
  return ed
}

const todos = (ed: Edificio) => [...ed.andares.values()]

/** Andar onde o agente está agora, `null` se está no elevador entre andares, `undefined` se não está no prédio. */
export function andarAtual(ed: Edificio, id: AgenteId): AndarId | null | undefined {
  if (ed.emViagem.some((v) => v.a.def.id === id)) return null
  return todos(ed).find((an) => an.sim.agentes.some((a) => a.def.id === id))?.def.id
}

/** Andar da sala do agente (onde ele "mora"), ou undefined se não tem sala. */
export function casaDe(ed: Edificio, id: AgenteId): AndarId | undefined {
  return todos(ed).find((an) => an.vagas.includes(id))?.def.id
}

export function vagasDoEdificio(ed: Edificio): VagasPorAndar {
  return Object.fromEntries(todos(ed).map((an) => [an.def.id, [...an.vagas]]))
}

function remontar(ed: Edificio, an: AndarVivo): void {
  an.predio = montarPredio(an.vagas, an.def)
  an.sim.predio = an.predio
  ed.aoRemontar?.(an.def.id)
}

/** Um agente foi embora (embarcou dispensado, em qualquer andar): a sala dele, no andar de casa, é desmontada. */
function aoSair(ed: Edificio, id: AgenteId): void {
  for (const an of todos(ed)) {
    const i = an.vagas.indexOf(id)
    if (i >= 0) an.obras.set(i, { inicio: ed.t, tipo: 'desmontar' })
  }
}

/** Coloca um agente numa vaga do andar (a escolhida, a primeira livre, ou uma coluna nova se o andar cresce). */
export function adicionarNoAndar(ed: Edificio, id: AgenteId, andar: AndarId, agora: number, vagaEscolhida?: number): boolean {
  const an = ed.andares.get(andar)
  if (!an || casaDe(ed, id) !== undefined || andarAtual(ed, id) !== undefined || !SALAS[id] || !agentePorId(id)) return false
  const livre = (k: number) => an.vagas[k] === null && !an.obras.has(k)
  let i = vagaEscolhida !== undefined && livre(vagaEscolhida) ? vagaEscolhida : an.vagas.findIndex((_, k) => livre(k))
  if (i < 0) {
    if (an.def.nucleo.lado === 'direita' || an.vagas.length >= an.def.maxVagas) return false
    i = an.vagas.length
    an.vagas.push(null, null)
  }
  an.vagas[i] = id
  an.obras.set(i, { inicio: agora, tipo: 'construir' })
  remontar(ed, an)
  adicionarAgente(an.sim, id, agora, { chegaEm: agora + OBRA_MS, status: ed.status(id), casa: andar })
  ed.aoMudarVagas(vagasDoEdificio(ed))
  return true
}

export function temEspaco(ed: Edificio, andar: AndarId): boolean {
  const an = ed.andares.get(andar)
  if (!an) return false
  return an.vagas.some((v, k) => v === null && !an.obras.has(k)) || (an.def.nucleo.lado === 'esquerda' && an.vagas.length < an.def.maxVagas)
}

/** Dispensa onde ele estiver: no andar, vai ao elevador de lá; no meio da viagem, sai direto (a porta nem abre). */
export function dispensar(ed: Edificio, id: AgenteId, agora: number): void {
  const k = ed.emViagem.findIndex((v) => v.a.def.id === id)
  if (k >= 0) {
    ed.emViagem.splice(k, 1)
    ed.t = agora
    aoSair(ed, id)
    return
  }
  const andar = andarAtual(ed, id)
  if (andar !== undefined && andar !== null) dispensarAgente((ed.andares.get(andar) as AndarVivo).sim, id, agora)
}

/** Fecha as obras que terminaram (a desmontagem só libera a vaga no fim, quando a sala já sumiu). */
function fecharObras(ed: Edificio, t: number): void {
  for (const an of todos(ed)) {
    for (const [i, o] of an.obras) {
      if (o.tipo === 'construir' && t - o.inicio >= OBRA_MS) an.obras.delete(i)
      if (o.tipo === 'desmontar' && t - o.inicio >= DESMONTE_MS) {
        an.obras.delete(i)
        an.vagas[i] = null
        remontar(ed, an)
        ed.aoMudarVagas(vagasDoEdificio(ed))
      }
    }
  }
}

/** Avança todos os andares (passos de até 50 ms, como sempre) e entrega quem chegou de viagem. */
export function passoEdificio(ed: Edificio, t: number, dt: number): void {
  ed.t = t
  for (const an of todos(ed)) passo(an.sim, t, dt)
  for (const v of [...ed.emViagem]) {
    if (t < v.chegaEm) continue
    ed.emViagem.splice(ed.emViagem.indexOf(v), 1)
    const destino = ed.andares.get(v.a.viagem?.andar ?? v.de) ?? ed.andares.get(v.de)
    if (destino) receberViajante(destino.sim, v.a, t)
  }
  fecharObras(ed, t)
}

// ------------------------------------------------------------------ o que vem do backend, aplicado a todos os andares

export function definirStatus(ed: Edificio, agora: number): void {
  for (const an of todos(ed)) for (const a of an.sim.agentes) mudarStatus(an.sim, a.def.id, ed.status(a.def.id), agora)
  // quem está no elevador recebe o status novo ao chegar
  for (const v of ed.emViagem) v.a.status = ed.status(v.a.def.id)
}

/**
 * Mensagem social real: o remetente vai até o destinatário. No mesmo andar, a visita de sempre; em outro, ele pega o
 * elevador (pedido do chefe: "eles vão até o elevador, entram, ele fecha e ele aparece no outro andar").
 */
export function visitarNoEdificio(ed: Edificio, de: AgenteId, para: AgenteId, linhas: string[], agora: number): boolean {
  const ad = andarAtual(ed, de)
  const ap = andarAtual(ed, para)
  if (ad === undefined || ad === null || ap === undefined || ap === null) return false
  const sim = (ed.andares.get(ad) as AndarVivo).sim
  if (ad === ap) return visitar(sim, de, para, linhas, agora)
  const alvo = (ed.andares.get(ap) as AndarVivo).sim.agentes.find((a) => a.def.id === para)
  if (!alvo || alvo.saindo || alvo.chegando || alvo.viagem || alvo.status === 'dormindo') return false
  return viajar(sim, de, ap, agora, { para, linhas })
}

export function falarNoEdificio(ed: Edificio, quem: AgenteId, linhas: string[], agora: number): boolean {
  const andar = andarAtual(ed, quem)
  return andar !== undefined && andar !== null && falar((ed.andares.get(andar) as AndarVivo).sim, quem, linhas, agora)
}

/** Quem está visitando (ou a caminho de visitar) quem, em todo o prédio. */
export function visitandoNoEdificio(ed: Edificio): Map<AgenteId, AgenteId> {
  const m = new Map<AgenteId, AgenteId>()
  for (const an of todos(ed)) for (const [de, para] of visitando(an.sim)) m.set(de, para)
  for (const an of todos(ed)) for (const a of an.sim.agentes) if (a.viagem?.visita) m.set(a.def.id, a.viagem.visita.para)
  for (const v of ed.emViagem) if (v.a.viagem?.visita) m.set(v.a.def.id, v.a.viagem.visita.para)
  return m
}

export function agentesDoEdificio(ed: Edificio): ResumoAgente[] {
  const lista: ResumoAgente[] = []
  for (const an of todos(ed)) {
    for (const a of an.sim.agentes) {
      lista.push({ id: a.def.id, status: a.status, atividade: atividadeDe(a), chegando: a.chegando, saindo: a.saindo, andar: an.def.id, casa: a.casa })
    }
  }
  for (const v of ed.emViagem) {
    const destino = andarPorId(v.a.viagem?.andar ?? v.de)
    lista.push({ id: v.a.def.id, status: v.a.status, atividade: `No elevador, indo ao ${destino.nome.toLowerCase()}`, chegando: false, saindo: v.a.saindo, andar: null, casa: v.a.casa })
  }
  return lista
}

/** Resumo de um andar para o painel do elevador: quantos estão lá e quantos precisam do chefe. */
export function resumoDoAndar(ed: Edificio, andar: AndarId): { agentes: number; precisaDeVoce: number } {
  const an = ed.andares.get(andar)
  if (!an) return { agentes: 0, precisaDeVoce: 0 }
  const presentes = an.sim.agentes.filter((a) => !a.saindo)
  return { agentes: presentes.length, precisaDeVoce: presentes.filter((a) => a.status === 'precisa_de_voce').length }
}
