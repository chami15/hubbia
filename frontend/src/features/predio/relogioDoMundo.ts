// A hora do mundo é uma CONTA sobre o tempo real (a mesma do backend, resolvers/relogio.py):
//   hora_do_mundo = ancora_mundo + (agora_real - ancora_real) * fator
// Pura e sem React para testar com os mesmos vetores do backend. Quem a usa (céu, luz, "dormindo", relógio do topo)
// só pergunta "que horas são no mundo agora?" e não precisa de nenhuma chamada: o relógio anda sozinho.
import type { RelogioApi } from '../../types/relogio'

export interface RelogioMundo {
  ancoraRealMs: number
  ancoraMundoMs: number
  fator: number
  /** Fuso do mundo em minutos em relação ao UTC (São Paulo = -180), lido do deslocamento que o servidor mandou. */
  fusoMin: number
  /** Servidor menos navegador, em ms: somado ao `Date.now()` local dá o "agora" do servidor. */
  deslocamentoMs: number
}

/** `-03:00` → -180; `Z` → 0. */
export function fusoDaString(iso: string): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** `agoraLocalMs` = o instante (do navegador) em que a resposta chegou. */
export function relogioDoServidor(api: RelogioApi, agoraLocalMs: number): RelogioMundo {
  return {
    ancoraRealMs: Date.parse(api.ancora_real),
    ancoraMundoMs: Date.parse(api.ancora_mundo),
    fator: api.fator,
    fusoMin: fusoDaString(api.ancora_mundo),
    deslocamentoMs: Date.parse(api.agora_real) - agoraLocalMs,
  }
}

/** Instante do mundo (ms desde 1970) para um instante local. */
export function horaDoMundoMs(r: RelogioMundo, agoraLocalMs: number): number {
  return r.ancoraMundoMs + (agoraLocalMs + r.deslocamentoMs - r.ancoraRealMs) * r.fator
}

/** Hora do dia no mundo, de 0 (inclusive) a 24 (exclusive), com fração. */
export function horaDoDia(mundoMs: number, fusoMin: number): number {
  const DIA = 86_400_000
  const noFuso = mundoMs + fusoMin * 60_000
  return (((noFuso % DIA) + DIA) % DIA) / 3_600_000
}

export function formatarHora(hora: number): string {
  const h = Math.floor(hora)
  const m = Math.floor((hora - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Hora do dia no relógio do navegador: o que valia antes do relógio do mundo e o que sobra se o backend estiver fora. */
export function horaLocalDoNavegador(agora: Date = new Date()): number {
  return agora.getHours() + agora.getMinutes() / 60
}
