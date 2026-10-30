// Humor com motivo (ideias do 3D, fase 3): o humor de cada agente sai de SINAIS REAIS que a API já devolve, nunca de
// barra inventada. O que interessa ao chefe é o PORQUÊ ("3 chamadas falharam hoje"), não um número. Puro, testável.
// Custo e tokens continuam fora (RNF02): das métricas só entra a CONTAGEM de falhas.
import type { Agente } from '../../types/agente'
import type { Mensagem } from '../../types/mensagens'
import type { Projeto } from '../../types/norte'
import type { AgenteId } from './agentes'

export type Humor = 'ansioso' | 'tenso' | 'contido' | 'preocupado' | 'orgulhoso' | 'entediado'

/** Como o humor aparece escrito no painel (uma palavra, sem ícone nem número). */
export const ROTULO_HUMOR: Record<Humor, string> = {
  ansioso: 'ansioso',
  tenso: 'tenso',
  contido: 'contido',
  preocupado: 'preocupado',
  orgulhoso: 'orgulhoso',
  entediado: 'entediado',
}

export interface Sinais {
  naoLidas: number
  falhasHoje: number
  orcamentoEsgotado: boolean
  /** O Motriz não gasta LLM: orçamento esgotado não o afeta. */
  gastaLlm: boolean
  projetosParados: string[]
  ultimaEntrega?: { texto: string; ticksAtras: number }
  /** Ticks desde a última mensagem dele (trabalho ou social); null se o tick atual é desconhecido. */
  ticksSemFazerNada: number | null
}

/** Mínimo de falhas no dia para ficar tenso (uma só é acaso). */
const FALHAS_PARA_TENSO = 2
/** Até quantos ticks depois de entregar ele segue orgulhoso. */
const TICKS_ORGULHO = 2
/** A partir de quantos ticks parado fica entediado (com o auto a cada 5 min, ~40 min reais). */
const TICKS_TEDIO = 8

/** "Fechei o relatório de março — gastos R$ ..." vira "fechei o relatório de março". */
function resumir(texto: string): string {
  const primeira = texto.split(/ — | - |\. |: /)[0].trim().replace(/[.!?]+$/, '')
  const curta = primeira.length > 60 ? `${primeira.slice(0, 57).trimEnd()}...` : primeira
  return curta.charAt(0).toLowerCase() + curta.slice(1)
}

/** Um humor por vez, do mais urgente ao mais leve. null = nada a dizer (e nada aparece). */
export function humorDe(s: Sinais): { humor: Humor; motivo: string } | null {
  if (s.naoLidas > 0) return { humor: 'ansioso', motivo: 'Está esperando sua resposta.' }
  if (s.falhasHoje >= FALHAS_PARA_TENSO) return { humor: 'tenso', motivo: `${s.falhasHoje} chamadas falharam hoje.` }
  if (s.orcamentoEsgotado && s.gastaLlm) return { humor: 'contido', motivo: 'O orçamento do dia acabou; até amanhã só o Motriz segue.' }
  if (s.projetosParados.length === 1) return { humor: 'preocupado', motivo: `O projeto ${s.projetosParados[0]} está parado.` }
  if (s.projetosParados.length > 1)
    return { humor: 'preocupado', motivo: `${s.projetosParados.length} projetos parados: ${s.projetosParados.join(', ')}.` }
  if (s.ultimaEntrega && s.ultimaEntrega.ticksAtras <= TICKS_ORGULHO)
    return { humor: 'orgulhoso', motivo: `Acabou de entregar: ${resumir(s.ultimaEntrega.texto)}.` }
  if (s.ticksSemFazerNada !== null && s.ticksSemFazerNada >= TICKS_TEDIO) return { humor: 'entediado', motivo: 'Faz tempo que não tem o que fazer.' }
  return null
}

export interface DadosDoHumor {
  agentes: readonly Agente[]
  mensagens: readonly Mensagem[]
  metricas?: { por_agente: readonly { agente_id: number; erros: number }[] }
  orcamentoDisponivel?: number
  projetos?: readonly Pick<Projeto, 'nome' | 'estagnado'>[]
  tickAtual?: number
}

/** Os sinais de cada agente do prédio a partir do que a API já devolve (agentes, mensagens, métricas, orçamento, projetos). */
export function sinaisPorAgente(d: DadosDoHumor, localDe: (idBackend: number) => AgenteId | undefined): Map<AgenteId, Sinais> {
  const chefe = d.agentes.find((a) => a.tipo === 'chefe')
  const saida = new Map<AgenteId, Sinais>()
  for (const a of d.agentes) {
    if (a.tipo !== 'colaborador') continue
    const id = localDe(a.id)
    if (!id) continue
    const dele = d.mensagens.filter((m) => m.remetente_id === a.id)
    const entregas = dele.filter((m) => m.tipo === 'trabalho' && m.destinatario_id === chefe?.id && m.tick !== null).sort((x, y) => (y.tick ?? 0) - (x.tick ?? 0))
    const ultimoTick = dele.reduce((max, m) => Math.max(max, m.tick ?? -Infinity), -Infinity)
    saida.set(id, {
      naoLidas: dele.filter((m) => m.destinatario_id === chefe?.id && m.lida_pelo_chefe === false).length,
      falhasHoje: d.metricas?.por_agente.find((p) => p.agente_id === a.id)?.erros ?? 0,
      orcamentoEsgotado: d.orcamentoDisponivel !== undefined && d.orcamentoDisponivel <= 0,
      gastaLlm: a.especialidade !== 'infra',
      projetosParados: a.especialidade === 'norte' ? (d.projetos ?? []).filter((p) => p.estagnado).map((p) => p.nome) : [],
      ultimaEntrega: entregas[0] && d.tickAtual !== undefined ? { texto: entregas[0].conteudo, ticksAtras: d.tickAtual - (entregas[0].tick ?? 0) } : undefined,
      ticksSemFazerNada: d.tickAtual === undefined ? null : Number.isFinite(ultimoTick) ? d.tickAtual - ultimoTick : d.tickAtual,
    })
  }
  return saida
}
