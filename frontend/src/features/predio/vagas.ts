// Quem está em cada vaga de cada andar, guardado NESTE navegador. É estado de tela, como era o rascunho da sala no
// escritório isométrico: quando "agentes ativos por chefe" existir no backend, esta é a única peça que muda.
//
// Formato salvo (versão 2): { versao: 2, andares: { "0": [...], "1": [...] } }. A versão 1 era só a lista do térreo:
// ela vira o térreo da versão 2, sem perder ninguém (testado em __testes__/vagas.test.ts).
import { INICIAIS } from './agentes'
import { ANDARES, andarPorId } from './andares'
import { vagasVazias, type Vagas, type VagasPorAndar } from './edificio'
import { SALAS } from './salas'

const CHAVE = 'hubbia:predio:vagas'

/** Disposição da primeira visita: térreo com os agentes de fábrica; os outros andares vazios. */
export function vagasPadrao(): VagasPorAndar {
  const [cifra, agenda, vita, norte, motriz, pauta] = INICIAIS
  const v: VagasPorAndar = Object.fromEntries(ANDARES.map((a) => [a.id, vagasVazias(a)]))
  // Cifra e Agenda em cima, Vita e Norte embaixo, Motriz e Pauta na coluna seguinte; a última coluna livre
  v[0] = [cifra, vita, agenda, norte, motriz, pauta, null, null]
  return v
}

/** Uma lista de vagas válida para o andar? (tamanho par, dentro do máximo; quem não existe vira vaga livre) */
function limpar(lista: unknown, andar: number, vistos: Set<string>): Vagas | null {
  const def = andarPorId(andar)
  if (!Array.isArray(lista) || lista.length % 2 !== 0 || lista.length > def.maxVagas || lista.length < 2) return null
  const v = lista.map((x) => {
    // agente repetido (em dois andares, ou duas vezes no mesmo) fica só na primeira vaga
    if (typeof x !== 'string' || !SALAS[x] || vistos.has(x)) return null
    vistos.add(x)
    return x
  })
  // todo andar tem todas as salas: lista salva mais curta (de antes) é completada com vagas livres
  return v.length === def.maxVagas ? v : [...v, ...Array(def.maxVagas - v.length).fill(null)]
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
    return { ...Object.fromEntries(ANDARES.map((a) => [a.id, vagasVazias(a)])), 0: terreo }
  }
  const andares = (dado as { versao?: number; andares?: Record<string, unknown> } | null)?.andares
  if (!andares || typeof andares !== 'object') return vagasPadrao()
  const v: VagasPorAndar = {}
  for (const def of ANDARES) v[def.id] = limpar(andares[String(def.id)], def.id, vistos) ?? vagasVazias(def)
  return v
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
