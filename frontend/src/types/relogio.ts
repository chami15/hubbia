// Espelha GET /relogio (backend/resolvers/relogio.py). Os horários vêm no fuso do chefe (com o deslocamento na string).
export interface RelogioApi {
  ancora_real: string
  ancora_mundo: string
  fator: number
  /** "Agora" segundo o servidor: serve para corrigir a diferença entre o relógio dele e o do navegador. */
  agora_real: string
  hora_do_mundo: string
}
