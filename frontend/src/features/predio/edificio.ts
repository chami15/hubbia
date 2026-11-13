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
//
// Sala ampliada: a vaga vizinha vira a metade nova da sala (obra nela); reduzir desmonta só essa metade.
// Mudar de andar: a sala nova começa a ser construída no destino, o agente vai ao elevador, e a sala antiga (com a
// ampliação, se tinha) é desmontada quando ele embarca. Ele só sai do elevador lá quando a obra acabou.
import { agentePorId, type AgenteId } from './agentes'
import { ANDARES, andarPorId, type AndarDef, type AndarId } from './andares'
import { DESMONTE_MS, OBRA_MS, montarPredio, vagaDaAmpliacao, vizinhasPossiveis, type Ampliacoes, type Obra, type Predio } from './predio'
import { SALAS } from './salas'
import {
  adicionarAgente, atividadeDe, criarSimulacao, dispensarAgente, falar, mudarStatus, passo, receberViajante, sairDaArea, viajar, visitar, visitando,
  type AgenteVivo, type Simulacao, type Status,
} from './sim'

export type Vagas = (AgenteId | null)[]
export type VagasPorAndar = Record<AndarId, Vagas>
export type AmpliacoesPorAndar = Record<AndarId, Ampliacoes>

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
  ampliadas: Ampliacoes
}

export interface Edificio {
  andares: Map<AndarId, AndarVivo>
  emViagem: { a: AgenteVivo; de: AndarId; chegaEm: number }[]
  /** Avisado sempre que as vagas (ou as ampliações) de algum andar mudam (para salvar). */
  aoMudarVagas: (v: VagasPorAndar, ampliadas: AmpliacoesPorAndar) => void
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

/** Vagas de um andar sem nada: todas as salas do andar, livres. */
export function vagasVazias(def: AndarDef): Vagas {
  return Array<AgenteId | null>(def.maxVagas).fill(null)
}

export function criarEdificio(
  vagas: VagasPorAndar,
  agora: number,
  o: {
    aoMudarVagas: (v: VagasPorAndar, ampliadas: AmpliacoesPorAndar) => void
    status: (id: AgenteId) => Status
    andares?: readonly AndarDef[]
    ampliadas?: AmpliacoesPorAndar
  },
): Edificio {
  const ed: Edificio = { andares: new Map(), emViagem: [], aoMudarVagas: o.aoMudarVagas, status: o.status, t: agora }
  for (const def of o.andares ?? ANDARES) {
    const vs = [...(vagas[def.id] ?? vagasVazias(def))]
    const ampliadas = { ...(o.ampliadas?.[def.id] ?? {}) }
    const predio = montarPredio(vs, def, ampliadas)
    const andar: AndarVivo = { def, vagas: vs, predio, sim: criarSimulacao(predio, (id) => aoSair(ed, id)), obras: new Map(), ampliadas }
    andar.sim.aoViajar = (a, t) => aoEmbarcar(ed, andar, a, t)
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

function agenteVivo(ed: Edificio, id: AgenteId): AgenteVivo | undefined {
  for (const an of todos(ed)) {
    const a = an.sim.agentes.find((x) => x.def.id === id)
    if (a) return a
  }
  return ed.emViagem.find((v) => v.a.def.id === id)?.a
}

/**
 * Andar da sala do agente (onde ele "mora"), ou undefined se não tem sala. Quem está se mudando já mora no destino,
 * mesmo com a sala antiga ainda de pé (desmontando): por isso vale o `casa` do agente antes das vagas.
 */
export function casaDe(ed: Edificio, id: AgenteId): AndarId | undefined {
  return agenteVivo(ed, id)?.casa ?? todos(ed).find((an) => an.vagas.includes(id))?.def.id
}

/** Vagas para salvar: a sala antiga de quem está se mudando já conta como livre (senão, recarregando, ele voltava). */
export function vagasDoEdificio(ed: Edificio): VagasPorAndar {
  return Object.fromEntries(todos(ed).map((an) => [an.def.id, an.vagas.map((id) => (id && casaDe(ed, id) === an.def.id ? id : null))]))
}

export function ampliadasDoEdificio(ed: Edificio): AmpliacoesPorAndar {
  return Object.fromEntries(todos(ed).map((an) => [an.def.id, { ...an.ampliadas }]))
}

function avisar(ed: Edificio): void {
  ed.aoMudarVagas(vagasDoEdificio(ed), ampliadasDoEdificio(ed))
}

function remontar(ed: Edificio, an: AndarVivo): void {
  // ampliação em obra (montando ou desmontando) fica sem lugares: ninguém senta em móvel que está caindo ou sumindo
  const emObra = new Set([...an.obras.keys()].filter((k) => an.ampliadas[k] !== undefined))
  an.predio = montarPredio(an.vagas, an.def, an.ampliadas, emObra)
  an.sim.predio = an.predio
  ed.aoRemontar?.(an.def.id)
}

/** Desmonta a sala de `id` neste andar (e a ampliação dela, se tiver). */
function desmontarSala(ed: Edificio, an: AndarVivo, id: AgenteId, t: number): void {
  // já desmontando (dispensado no meio da mudança) não recomeça: a sala sumiria e reapareceria
  const i = an.vagas.indexOf(id)
  if (i >= 0 && an.obras.get(i)?.tipo !== 'desmontar') an.obras.set(i, { inicio: t, tipo: 'desmontar' })
  const k = vagaDaAmpliacao(an.vagas, an.def, id, an.ampliadas)
  if (k >= 0 && an.obras.get(k)?.tipo !== 'desmontar') {
    an.obras.set(k, { inicio: t, tipo: 'desmontar' })
    sairDaArea(an.sim, `${id}:anexo`, t)
  }
  remontar(ed, an)
}

/** Um agente foi embora (embarcou dispensado, em qualquer andar): a sala dele (e a que estava sendo feita para ele) é desmontada. */
function aoSair(ed: Edificio, id: AgenteId): void {
  for (const an of todos(ed)) if (an.vagas.includes(id)) desmontarSala(ed, an, id, ed.t)
}

/**
 * Alguém entrou no elevador para outro andar. Se ele está se mudando (a casa já é outra e a sala dele ainda está
 * aqui), a sala daqui começa a ser desmontada.
 */
function aoEmbarcar(ed: Edificio, an: AndarVivo, a: AgenteVivo, t: number): void {
  const para = a.viagem?.andar ?? an.def.id
  if (a.casa !== an.def.id && an.vagas.includes(a.def.id)) desmontarSala(ed, an, a.def.id, t)
  // a sala nova começou a obra quando ele largou tudo; andar até o elevador, embarcar e viajar sempre passa de OBRA_MS
  // (reforma.test cobra que ele nunca sai do elevador com a obra em andamento)
  ed.emViagem.push({ a, de: an.def.id, chegaEm: t + duracaoDaViagem(an.def.id, para) })
}

/** Vaga livre de verdade: sem agente, sem obra e sem ser a metade de uma sala ampliada. */
const vagaLivre = (an: AndarVivo, k: number) => an.vagas[k] === null && !an.obras.has(k) && an.ampliadas[k] === undefined

/** Coloca um agente numa vaga do andar (a escolhida, ou a primeira livre). Andar cheio: false. */
export function adicionarNoAndar(ed: Edificio, id: AgenteId, andar: AndarId, agora: number, vagaEscolhida?: number): boolean {
  const an = ed.andares.get(andar)
  if (!an || casaDe(ed, id) !== undefined || andarAtual(ed, id) !== undefined || !SALAS[id] || !agentePorId(id)) return false
  const livre = (k: number) => vagaLivre(an, k)
  const i = vagaEscolhida !== undefined && livre(vagaEscolhida) ? vagaEscolhida : an.vagas.findIndex((_, k) => livre(k))
  if (i < 0) return false
  an.vagas[i] = id
  an.obras.set(i, { inicio: agora, tipo: 'construir' })
  remontar(ed, an)
  adicionarAgente(an.sim, id, agora, { chegaEm: agora + OBRA_MS, status: ed.status(id), casa: andar })
  avisar(ed)
  return true
}

export function temEspaco(ed: Edificio, andar: AndarId): boolean {
  const an = ed.andares.get(andar)
  if (!an) return false
  return an.vagas.some((_, k) => vagaLivre(an, k))
}

// ------------------------------------------------------------------ salas ampliadas

/** A sala de `dono` (agente ou 'copa') neste andar está pronta, sem obra nela? */
function salaPronta(an: AndarVivo, dono: AgenteId | 'copa'): boolean {
  if (dono === 'copa') return !!an.def.nucleo.copa
  const i = an.vagas.indexOf(dono)
  return i >= 0 && !an.obras.has(i)
}

/** Vagas livres onde a sala de `dono` pode ampliar agora (vazio: já ampliada, em obra, ou sem vizinha livre). */
export function ondeAmpliar(ed: Edificio, andar: AndarId, dono: AgenteId | 'copa'): number[] {
  const an = ed.andares.get(andar)
  if (!an || !salaPronta(an, dono) || Object.values(an.ampliadas).includes(dono)) return []
  if (dono !== 'copa' && casaDe(ed, dono) !== andar) return [] // de mudança: a sala daqui já não é dele
  return vizinhasPossiveis(an.vagas, an.def, dono).filter((k) => vagaLivre(an, k))
}

/** A sala de `dono` está ampliada (e não está sendo desmontada) neste andar? */
export function ampliada(ed: Edificio, andar: AndarId, dono: AgenteId | 'copa'): boolean {
  const an = ed.andares.get(andar)
  if (!an) return false
  const k = vagaDaAmpliacao(an.vagas, an.def, dono, an.ampliadas)
  return k >= 0 && an.obras.get(k)?.tipo !== 'desmontar'
}

/** Amplia a sala de `dono` (na vaga escolhida, ou na primeira possível): obra na vaga vizinha. false = não dá agora. */
export function ampliar(ed: Edificio, andar: AndarId, dono: AgenteId | 'copa', agora: number, vaga?: number): boolean {
  const an = ed.andares.get(andar)
  const possiveis = ondeAmpliar(ed, andar, dono)
  const k = vaga !== undefined ? (possiveis.includes(vaga) ? vaga : -1) : (possiveis[0] ?? -1)
  if (!an || k < 0) return false
  an.ampliadas[k] = dono
  an.obras.set(k, { inicio: agora, tipo: 'construir' })
  remontar(ed, an)
  avisar(ed)
  return true
}

/** Desfaz a ampliação: quem estava na metade nova sai, ela é desmontada e a vaga volta a ficar livre no fim. */
export function reduzir(ed: Edificio, andar: AndarId, dono: AgenteId | 'copa', agora: number): boolean {
  const an = ed.andares.get(andar)
  if (!an || !ampliada(ed, andar, dono)) return false
  const k = vagaDaAmpliacao(an.vagas, an.def, dono, an.ampliadas)
  if (an.obras.has(k)) return false // ainda montando: espera acabar
  an.obras.set(k, { inicio: agora, tipo: 'desmontar' })
  sairDaArea(an.sim, `${dono}:anexo`, agora)
  remontar(ed, an)
  return true
}

// ------------------------------------------------------------------ mudança de andar

/**
 * Muda o agente de andar (pedido do chefe): a sala nova começa a ser construída no destino, ele larga o que fazia e vai
 * ao elevador; quando embarca, a sala antiga é desmontada; no destino, sai do elevador quando a obra acabou.
 * Só a partir do andar de casa, parado na vida normal (não chegando, saindo nem viajando). false = agora não dá.
 */
export function mudarDeAndar(ed: Edificio, id: AgenteId, destino: AndarId, agora: number, vagaEscolhida?: number): boolean {
  const casa = casaDe(ed, id)
  const an = ed.andares.get(destino)
  if (!an || casa === undefined || casa === destino || andarAtual(ed, id) !== casa) return false
  const a = (ed.andares.get(casa) as AndarVivo).sim.agentes.find((x) => x.def.id === id)
  if (!a || a.saindo || a.chegando || a.viagem || a.embarcouEm !== undefined) return false
  const i = vagaEscolhida !== undefined && vagaLivre(an, vagaEscolhida) ? vagaEscolhida : an.vagas.findIndex((_, k) => vagaLivre(an, k))
  if (i < 0) return false
  an.vagas[i] = id
  an.obras.set(i, { inicio: agora, tipo: 'construir' })
  remontar(ed, an)
  // a casa nova manda: a próxima decisão dele (já) é pegar o elevador para lá (ver `decidir` em sim.ts)
  a.casa = destino
  a.ate = agora
  avisar(ed)
  return true
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
      if (o.tipo === 'construir' && t - o.inicio >= OBRA_MS) {
        an.obras.delete(i)
        if (an.ampliadas[i] !== undefined) remontar(ed, an) // a ampliação pronta ganha os lugares
      }
      if (o.tipo === 'desmontar' && t - o.inicio >= DESMONTE_MS) {
        an.obras.delete(i)
        if (an.ampliadas[i] !== undefined) delete an.ampliadas[i]
        else an.vagas[i] = null
        remontar(ed, an)
        avisar(ed)
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
