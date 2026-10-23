// Persistência do toggle de som — mesmo espírito de dry-run.ts: só
// localStorage, nada de servidor. Começa DESLIGADO de propósito: som é
// opcional (o chefe pediu "sutil e opcional"), ninguém deveria levar um
// susto de áudio a primeira vez que abre o hub sem ter pedido.

const CHAVE = 'escritorio:som:ativo'

export function somAtivo(): boolean {
  return localStorage.getItem(CHAVE) === '1'
}

export function definirSomAtivo(ativo: boolean): void {
  if (ativo) localStorage.setItem(CHAVE, '1')
  else localStorage.removeItem(CHAVE)
}

let contexto: AudioContext | null = null

// Tom curto sintetizado (osciloscópio simples) em vez de um arquivo de
// áudio — sem asset pra carregar, e o resultado soa como "beep de
// instrumento", que combina com o resto do hub. Só é chamado a partir de
// um clique (avançar tick), então o AudioContext nunca esbarra na
// política de autoplay do navegador.
export function tocarSom(): void {
  try {
    contexto ??= new AudioContext()
    const agora = contexto.currentTime
    const osc = contexto.createOscillator()
    const ganho = contexto.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, agora)
    osc.frequency.exponentialRampToValueAtTime(660, agora + 0.12)
    ganho.gain.setValueAtTime(0, agora)
    ganho.gain.linearRampToValueAtTime(0.08, agora + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.28)
    osc.connect(ganho)
    ganho.connect(contexto.destination)
    osc.start(agora)
    osc.stop(agora + 0.3)
  } catch {
    // Web Audio indisponível ou contexto bloqueado — som é só um
    // extra, nunca pode derrubar o avanço de tick por causa disto
  }
}
