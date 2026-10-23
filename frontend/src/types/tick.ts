// Espelha backend/resolvers/tick.py + routers/tick.py — Etapa 1 do
// motor de interação (o relógio simulado em si, sem comportamento de
// agente ainda).

export interface TickAtual {
  numero: number
  // null só no caso sentinela (nenhum tick rodou ainda) — nesse caso o
  // resolver também manda `mensagem`, mas a UI não depende dela: number
  // 0 já basta pra saber que o relógio nunca andou.
  hora_simulada: string | null
  estado_mundo?: Record<string, unknown>
  processado_em?: string
}

export interface TickAvancado {
  numero: number
  hora_simulada: string
  // orçamento do dia já recalculado depois do avanço — é o valor pra
  // mostrar imediatamente, sem esperar um GET /tick/orcamento separado
  orcamento_disponivel_hoje: number
  dry_run: boolean
  agentes_atualizados: number
}

export interface OrcamentoDiario {
  gasto_hoje: number
  disponivel_hoje: number
}
