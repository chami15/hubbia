// Decisão pura do tick automático: dada a resposta do backend (ou uma falha de rede), o que o timer faz a seguir.
// Fora do hook para testar sem navegador. O BACKEND é quem garante os limites; aqui só se decide esperar ou desligar.
import type { RespostaTickAutomatico } from '../../types/tick'

export type ProximoPasso = { tipo: 'agendar'; emMs: number } | { tipo: 'parar'; mensagem: string }

/** Espera mínima entre tentativas: um backend que respondesse `espera_s: 0` viraria um laço de requisições. */
const ESPERA_MINIMA_S = 1
const ESPERA_PADRAO_S = 5

export function proximoPasso(resposta: RespostaTickAutomatico | { erro: string }): ProximoPasso {
  if ('erro' in resposta) {
    // falha de rede/servidor: desliga em vez de insistir. Cada tentativa pode custar token, e quem decide
    // tentar de novo é o chefe (mesma regra do backend: nunca retry automático).
    return { tipo: 'parar', mensagem: `Tick automático desligado: ${resposta.erro}` }
  }
  if (resposta.executado) return { tipo: 'agendar', emMs: Math.max(ESPERA_MINIMA_S, resposta.proximo_em_s) * 1000 }
  if (resposta.parar) return { tipo: 'parar', mensagem: resposta.mensagem }
  // única recusa "mole" (intervalo mínimo): jitter de timer não pode desligar o toggle
  return { tipo: 'agendar', emMs: Math.max(ESPERA_MINIMA_S, resposta.espera_s ?? ESPERA_PADRAO_S) * 1000 }
}
