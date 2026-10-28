// Escolha da próxima atividade de um agente (pura, testável): sorteio com preferência (personalidade.ts), sem repetir o
// que acabou de fazer e sem ir à copa toda hora. É o que tira o "anda pra lá e pra cá" sem virar rotina fixa.
import type { Personalidade } from './personalidade'

export interface Opcao {
  id: string
  rotulo: string
  /** Fora da própria sala (copa, recepção). */
  fora: boolean
}

export interface Feito {
  id: string
  fora: boolean
}

/** Quantas atividades recentes bloqueiam a repetição do mesmo lugar. */
const SEM_REPETIR = 2
/** Uma saída da sala a cada tantas atividades, no máximo: era o "3 idas à copa em 5 minutos". */
const SAIDA_A_CADA = 3

export function escolherAtividade(p: Personalidade, opcoes: readonly Opcao[], recentes: readonly Feito[], rnd: () => number): Opcao | undefined {
  const evitar = new Set(recentes.slice(-SEM_REPETIR).map((f) => f.id))
  const saiuHaPouco = recentes.slice(-(SAIDA_A_CADA - 1)).some((f) => f.fora)
  let candidatas = opcoes.filter((o) => !evitar.has(o.id))
  // poucas opções na sala: aceita repetir algo que não seja o ÚLTIMO, em vez de ficar sem nada
  if (!candidatas.length) candidatas = opcoes.filter((o) => o.id !== recentes.at(-1)?.id)
  const dentro = candidatas.filter((o) => !o.fora)
  const fora = saiuHaPouco ? [] : candidatas.filter((o) => o.fora)

  const querSair = rnd() < p.saiDaSala
  const grupo = (querSair && fora.length) || !dentro.length ? fora : dentro
  if (!grupo.length) return undefined

  const peso = (o: Opcao) => (o.fora ? 1 : (p.favoritos[o.rotulo] ?? 1))
  const total = grupo.reduce((s, o) => s + peso(o), 0)
  let alvo = rnd() * total
  for (const o of grupo) {
    alvo -= peso(o)
    if (alvo < 0) return o
  }
  return grupo[grupo.length - 1]
}
