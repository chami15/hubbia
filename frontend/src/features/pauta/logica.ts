// Lógica pura do painel da Pauta (testada em __testes__/logica.test.ts): prazo em palavras, barra em blocos e a
// navegação entre os níveis (frentes -> tarefas -> tarefa, e a revisão). Nada aqui toca DOM nem API.

/** Data local AAAA-MM-DD sem fuso: `new Date('2026-11-20')` seria meia-noite UTC, que no Brasil vira o dia anterior. */
export function dataLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

function diasAte(prazo: string, hoje: Date): number {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((dataLocal(prazo).getTime() - h.getTime()) / 86_400_000)
}

export type TomPrazo = 'vencido' | 'perto' | 'normal'

/** "venceu ontem", "vence hoje", "amanhã", "em 5 dias", "20/12". Curto, para caber na linha da tarefa. */
export function prazoEmPalavras(prazo: string | null, hoje: Date): { texto: string; tom: TomPrazo } | null {
  if (!prazo) return null
  const dias = diasAte(prazo, hoje)
  if (dias < -1) return { texto: `venceu há ${-dias} dias`, tom: 'vencido' }
  if (dias === -1) return { texto: 'venceu ontem', tom: 'vencido' }
  if (dias === 0) return { texto: 'vence hoje', tom: 'perto' }
  if (dias === 1) return { texto: 'amanhã', tom: 'perto' }
  if (dias <= 2) return { texto: `em ${dias} dias`, tom: 'perto' }
  if (dias <= 7) return { texto: `em ${dias} dias`, tom: 'normal' }
  const d = dataLocal(prazo)
  return { texto: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, tom: 'normal' }
}

/** Barra de progresso em blocos (pixel): quantos dos `n` blocos acendem. Sem item, nenhum; com algum feito, ao menos um. */
export function blocos(feitos: number, total: number, n = 8): boolean[] {
  if (total <= 0) return Array(n).fill(false)
  const cheios = feitos === 0 ? 0 : Math.max(1, Math.round((feitos / total) * n))
  return Array.from({ length: n }, (_, i) => i < Math.min(n, cheios))
}

export type Nivel =
  | { tipo: 'frentes' }
  | { tipo: 'frente'; frenteId: number }
  | { tipo: 'tarefa'; frenteId: number; tarefaId: number }
  | { tipo: 'revisao' }

/** Para onde o "voltar" leva. A revisão volta para as frentes; a tarefa, para a lista da frente dela. */
export function voltar(n: Nivel): Nivel {
  if (n.tipo === 'tarefa') return { tipo: 'frente', frenteId: n.frenteId }
  return { tipo: 'frentes' }
}

export const nomeDaFrente = (nome: string): string => nome.charAt(0).toUpperCase() + nome.slice(1)

/** O que a rodada fez, numa frase curta (vira aviso no painel). Nada feito = diz isso, em vez de silêncio. */
export function resumoDaRodada(r: { organizados: number; perguntas: number; duplicados: number; falhas: number; lidos: number; contexto?: { tarefas: number } }): string {
  const partes: string[] = []
  if (r.organizados) partes.push(`${r.organizados} organizado${r.organizados > 1 ? 's' : ''}`)
  if (r.perguntas) partes.push(`${r.perguntas} pergunta${r.perguntas > 1 ? 's' : ''}`)
  if (r.duplicados) partes.push(`${r.duplicados} repetido${r.duplicados > 1 ? 's' : ''}`)
  if (r.falhas) partes.push(`${r.falhas} com erro`)
  if (r.contexto?.tarefas) partes.push(`contexto de ${r.contexto.tarefas} tarefa${r.contexto.tarefas > 1 ? 's' : ''}`)
  return partes.length ? partes.join(' · ') : 'Nada novo para organizar.'
}
