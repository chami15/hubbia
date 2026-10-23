// Quem está em cada vaga do prédio, guardado NESTE navegador. É estado de tela, como era o rascunho da sala no
// escritório isométrico: quando "agentes ativos por chefe" existir no backend, esta é a única peça que muda.
import { INICIAIS } from './agentes'
import { MAX_VAGAS } from './predio'
import { SALAS } from './salas'
import type { Vagas } from './mundo'

const CHAVE = 'hubbia:predio:vagas'

/** Disposição da primeira visita: Cifra e Agenda em cima, Vita e Norte embaixo, Motriz na coluna seguinte. */
function padrao(): Vagas {
  const [cifra, agenda, vita, norte, motriz] = INICIAIS
  return [cifra, vita, agenda, norte, motriz, null]
}

export function carregarVagas(): Vagas {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
    if (Array.isArray(v) && v.length >= 4 && v.length <= MAX_VAGAS && v.length % 2 === 0) {
      const vistos = new Set<string>()
      return v.map((x) => {
        if (typeof x !== 'string' || !SALAS[x] || vistos.has(x)) return null
        vistos.add(x)
        return x
      })
    }
  } catch {
    // sem armazenamento (aba anônima, bloqueado): começa do padrão
  }
  return padrao()
}

export function salvarVagas(vagas: Vagas): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(vagas))
  } catch {
    // tudo bem: só não lembra na próxima visita
  }
}
