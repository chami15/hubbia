// Quem está em cada vaga de cada andar, guardado NESTE navegador. É estado de tela, como era o rascunho da sala no
// escritório isométrico: quando "agentes ativos por chefe" existir no backend, esta é a única peça que muda.
//
// Formato salvo (versão 2): { versao: 2, andares: { "0": [...], "1": [...] } }. A versão 1 era só a lista do térreo:
// ela vira o térreo da versão 2, sem perder ninguém (testado em __testes__/vagas.test.ts).
import { INICIAIS, type AgenteId } from './agentes'
import { ANDARES, andarPorId } from './andares'
import { vagasVazias, type Vagas, type VagasPorAndar } from './edificio'
import { SALAS } from './salas'

const CHAVE = 'hubbia:predio:vagas'

/** Disposição da primeira visita: térreo com os agentes de fábrica; os outros andares vazios. */
export function vagasPadrao(): VagasPorAndar {
  const [cifra, agenda, vita, norte, motriz, pauta] = INICIAIS
  const v: VagasPorAndar = Object.fromEntries(ANDARES.map((a) => [a.id, vagasVazias(a)]))
  // Cifra e Agenda em cima, Vita e Norte embaixo, Motriz e Pauta na coluna seguinte
  v[0] = [cifra, vita, agenda, norte, motriz, pauta]
  return v
}

/**
 * Limpa a lista salva de um andar: quem não existe vira vaga livre, repetido fica só na primeira vez, lista curta é
 * completada até as salas do andar. Lista LONGA (o térreo já aceitou até 8 salas) não é recusada: o que passa do
 * máximo vai em `sobra`, para entrar em outro andar (senão quem estava ali sumia do prédio).
 */
function limpar(lista: unknown, andar: number, vistos: Set<string>): { vagas: Vagas; sobra: AgenteId[] } | null {
  const def = andarPorId(andar)
  if (!Array.isArray(lista) || lista.length % 2 !== 0 || lista.length < 2) return null
  const v = lista.map((x) => {
    // agente repetido (em dois andares, ou duas vezes no mesmo) fica só na primeira vaga
    if (typeof x !== 'string' || !SALAS[x] || vistos.has(x)) return null
    vistos.add(x)
    return x
  })
  const sobra = v.slice(def.maxVagas).filter((x): x is AgenteId => x !== null)
  const cabe = v.slice(0, def.maxVagas)
  return { vagas: [...cabe, ...Array<AgenteId | null>(def.maxVagas - cabe.length).fill(null)], sobra }
}

/** Põe quem sobrou nas primeiras vagas livres dos andares, na ordem dos andares. */
function acomodar(v: VagasPorAndar, sobra: AgenteId[]): VagasPorAndar {
  for (const id of sobra) {
    for (const def of ANDARES) {
      const i = v[def.id].indexOf(null)
      if (i >= 0) {
        v[def.id][i] = id
        break
      }
    }
  }
  return v
}

/** Lê o que estava salvo (puro: recebe o texto). Qualquer coisa estranha volta ao padrão, nunca quebra a tela. */
export function lerVagas(salvo: string | null): VagasPorAndar {
  let dado: unknown
  try {
    dado = JSON.parse(salvo ?? 'null')
  } catch {
    return vagasPadrao()
  }
  const vistos = new Set<string>()
  // versão 1: só a lista do térreo
  if (Array.isArray(dado)) {
    const terreo = limpar(dado, 0, vistos)
    if (!terreo) return vagasPadrao()
    return acomodar({ ...Object.fromEntries(ANDARES.map((a) => [a.id, vagasVazias(a)])), 0: terreo.vagas }, terreo.sobra)
  }
  const andares = (dado as { versao?: number; andares?: Record<string, unknown> } | null)?.andares
  if (!andares || typeof andares !== 'object') return vagasPadrao()
  const v: VagasPorAndar = {}
  const sobra: AgenteId[] = []
  for (const def of ANDARES) {
    const r = limpar(andares[String(def.id)], def.id, vistos)
    v[def.id] = r?.vagas ?? vagasVazias(def)
    sobra.push(...(r?.sobra ?? []))
  }
  return acomodar(v, sobra)
}

export function carregarVagas(): VagasPorAndar {
  try {
    return lerVagas(localStorage.getItem(CHAVE))
  } catch {
    // sem armazenamento (aba anônima, bloqueado): começa do padrão
    return vagasPadrao()
  }
}

export function salvarVagas(vagas: VagasPorAndar): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ versao: 2, andares: vagas }))
  } catch {
    // tudo bem: só não lembra na próxima visita
  }
}
