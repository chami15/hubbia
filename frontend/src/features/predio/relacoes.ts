// Relações reais (ideias do 3D, fase 2): a afinidade que o backend grava a cada conversa vira COMPORTAMENTO (quem almoça
// com quem) e uma leitura sob demanda no painel ("se dá bem com", sem número). Puro, para testar sem navegador.
import type { Relacionamento } from '../../types/relacionamento'
import type { AgenteId } from './agentes'

/** Afinidade do PAR (ordem não importa): média das duas direções que o backend guarda. */
export type Afinidades = ReadonlyMap<string, number>

const chave = (a: AgenteId, b: AgenteId) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function afinidadesDoServidor(rels: readonly Relacionamento[], localDe: (idBackend: number) => AgenteId | undefined): Map<string, number> {
  const somas = new Map<string, { total: number; n: number }>()
  for (const r of rels) {
    const a = localDe(r.agente_id)
    const b = localDe(r.alvo_agente_id)
    if (!a || !b || a === b) continue
    const s = somas.get(chave(a, b)) ?? { total: 0, n: 0 }
    s.total += r.afinidade
    s.n += 1
    somas.set(chave(a, b), s)
  }
  return new Map([...somas].map(([k, s]) => [k, s.total / s.n]))
}

export function afinidade(m: Afinidades, a: AgenteId, b: AgenteId): number {
  return m.get(chave(a, b)) ?? 0
}

/** Colegas presentes, do que mais se dá bem para o que menos (o painel desenha uma barra por colega, sem número). */
export function seDaBemCom(id: AgenteId, m: Afinidades, presentes: readonly AgenteId[]): { id: AgenteId; afinidade: number }[] {
  return presentes
    .filter((x) => x !== id)
    .map((x) => ({ id: x, afinidade: afinidade(m, id, x) }))
    .sort((p, q) => q.afinidade - p.afinidade)
}

/**
 * Duplas do almoço com peso na afinidade: sorteia alguém, e o par dele é sorteado com peso maior para quem ele se dá
 * bem. Continua aleatório (o chefe pediu personalidade, não rotina fixa), só que amigos tendem a almoçar juntos.
 */
export function parearPorAfinidade(ids: readonly AgenteId[], af: (a: AgenteId, b: AgenteId) => number, rnd: () => number): Map<AgenteId, AgenteId> {
  const restantes = [...ids]
  const pares = new Map<AgenteId, AgenteId>()
  while (restantes.length >= 2) {
    const a = restantes.splice(Math.floor(rnd() * restantes.length), 1)[0]
    // peso 1 para quem é neutro, até 1 + 100/12 ≈ 9 para afinidade máxima; afinidade negativa pesa menos que neutro
    const pesos = restantes.map((c) => Math.max(0.2, 1 + af(a, c) / 12))
    let alvo = rnd() * pesos.reduce((s, p) => s + p, 0)
    let k = 0
    while (k < pesos.length - 1 && alvo >= pesos[k]) alvo -= pesos[k++]
    const b = restantes.splice(k, 1)[0]
    pares.set(a, b)
    pares.set(b, a)
  }
  return pares
}
