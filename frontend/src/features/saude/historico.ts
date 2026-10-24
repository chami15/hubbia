// Junta as cinco listas do histórico numa linha do tempo por dia (pura, sem React, para testar).
// Água vira UMA linha por dia (dezenas de goles de 200 ml afogariam o resto); o demais entra registro a registro.
import type { HistoricoSaude, TipoAtividade, TipoRefeicao } from '../../types/saude'

export interface EntradaDoDia {
  chave: string
  hora: string
  tipo: 'refeicao' | 'atividade' | 'sono' | 'peso' | 'agua'
  titulo: string
  detalhe?: string
  /** Para ordenar dentro do dia (mais recente primeiro). */
  ordem: number
}

export interface GrupoDia {
  /** Data local `AAAA-MM-DD`. */
  dia: string
  rotulo: string
  entradas: EntradaDoDia[]
}

const ROTULO_REFEICAO: Record<TipoRefeicao, string> = {
  cafe_da_manha: 'café da manhã',
  almoco: 'almoço',
  cafe_da_tarde: 'café da tarde',
  jantar: 'jantar',
  outro: 'refeição',
}

const ROTULO_ATIVIDADE: Record<TipoAtividade, string> = {
  corrida: 'corrida',
  academia: 'academia',
  esporte: 'esporte',
  caminhada: 'caminhada',
  outro: 'atividade',
}

const dois = (n: number) => String(n).padStart(2, '0')

/** Dia no fuso do navegador: é o dia que o chefe vive, não o do servidor. */
export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

const horaLocal = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`

export function rotuloDoDia(dia: string, hoje: Date): string {
  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  if (dia === diaLocal(hoje)) return 'hoje'
  if (dia === diaLocal(ontem)) return 'ontem'
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

export function montarLinhaDoTempo(h: HistoricoSaude, hoje: Date = new Date()): GrupoDia[] {
  const porDia = new Map<string, EntradaDoDia[]>()
  const por = (dia: string) => {
    const lista = porDia.get(dia) ?? []
    porDia.set(dia, lista)
    return lista
  }

  for (const r of h.refeicoes) {
    const d = new Date(r.registrado_em)
    por(diaLocal(d)).push({
      chave: `refeicao-${r.id}`,
      hora: horaLocal(d),
      tipo: 'refeicao',
      titulo: `${ROTULO_REFEICAO[r.tipo_refeicao]} · ${Math.round(r.calorias)} kcal`,
      // estimativa fraca não pode passar por número exato: só "alta" dispensa aviso
      detalhe: r.confianca_estimativa === 'alta' ? r.descricao : `${r.descricao} · confiança ${r.confianca_estimativa}`,
      ordem: d.getTime(),
    })
  }
  for (const a of h.atividades) {
    const d = new Date(a.registrado_em)
    por(diaLocal(d)).push({
      chave: `atividade-${a.id}`,
      hora: horaLocal(d),
      tipo: 'atividade',
      titulo: `${ROTULO_ATIVIDADE[a.tipo]} · ${a.duracao_min} min`,
      detalhe: a.observacao ?? undefined,
      ordem: d.getTime(),
    })
  }
  for (const s of h.sono) {
    // sono tem só a data de referência, sem hora: fica no fim do dia
    por(s.data_referencia).push({
      chave: `sono-${s.id}`,
      hora: '',
      tipo: 'sono',
      titulo: `sono · ${s.horas} h`,
      detalhe: s.qualidade ?? undefined,
      ordem: new Date(`${s.data_referencia}T00:00:00`).getTime(),
    })
  }
  for (const p of h.peso) {
    const d = new Date(p.registrado_em)
    por(diaLocal(d)).push({ chave: `peso-${p.id}`, hora: horaLocal(d), tipo: 'peso', titulo: `peso · ${p.peso_kg.toFixed(1)} kg`, ordem: d.getTime() })
  }

  const agua = new Map<string, { ml: number; n: number; ultimo: Date }>()
  for (const g of h.hidratacao) {
    const d = new Date(g.registrado_em)
    const dia = diaLocal(d)
    const atual = agua.get(dia) ?? { ml: 0, n: 0, ultimo: d }
    atual.ml += g.quantidade_ml
    atual.n += 1
    if (d > atual.ultimo) atual.ultimo = d
    agua.set(dia, atual)
  }
  for (const [dia, a] of agua) {
    por(dia).push({
      chave: `agua-${dia}`,
      hora: horaLocal(a.ultimo),
      tipo: 'agua',
      titulo: `água · ${(a.ml / 1000).toFixed(1)} L`,
      detalhe: `${a.n} ${a.n === 1 ? 'registro' : 'registros'}`,
      ordem: a.ultimo.getTime(),
    })
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dia, entradas]) => ({ dia, rotulo: rotuloDoDia(dia, hoje), entradas: entradas.sort((a, b) => b.ordem - a.ordem) }))
}
