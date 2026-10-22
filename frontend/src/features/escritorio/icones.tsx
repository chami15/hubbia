// Ícones do HUD do escritório — SVG desenhado à mão, no mesmo espírito
// visual das referências que o chefe mandou (traço grosso, ponta
// arredondada, sem preenchimento): não são os PNGs exatos — não há como
// extrair o arquivo de uma imagem colada na conversa, só "ver" ela —
// mas cobrem a mesma linguagem (ícone de linha, monocromático,
// `currentColor` pra herdar a cor de quem usa). Trocar por um arquivo
// de verdade depois é só substituir o componente por uma <img>.

interface Props {
  tamanho?: number
}

export function IconeAvancarTick({ tamanho = 22 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5v11a1.5 1.5 0 0 0 2.3 1.27l8.5-5.5a1.5 1.5 0 0 0 0-2.54l-8.5-5.5A1.5 1.5 0 0 0 3 6.5Z" />
      <path d="M12.2 6.5v11a1.5 1.5 0 0 0 2.3 1.27l8.5-5.5a1.5 1.5 0 0 0 0-2.54l-8.5-5.5a1.5 1.5 0 0 0-2.3 1.27Z" />
    </svg>
  )
}

export function IconeMensagens({ tamanho = 22 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2.5} y={5} width={19} height={14} rx={2.5} />
      <path d="M3 6.5l9 6.5 9-6.5" />
    </svg>
  )
}

export function IconeConfiguracoes({ tamanho = 22 }: Props) {
  const DENTES = 8
  const raioInterno = 7.4
  const raioExterno = 9.6
  const meiaLargura = 0.34 // meio-ângulo do dente, em radianos

  const dentes = Array.from({ length: DENTES }, (_, i) => {
    const centro = (i / DENTES) * Math.PI * 2
    const a1 = centro - meiaLargura
    const a2 = centro + meiaLargura
    const p = (raio: number, angulo: number) => ({
      x: 12 + raio * Math.cos(angulo),
      y: 12 + raio * Math.sin(angulo),
    })
    const a = p(raioInterno, a1)
    const b = p(raioExterno, a1)
    const c = p(raioExterno, a2)
    const d = p(raioInterno, a2)
    return `M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)} L${c.x.toFixed(2)},${c.y.toFixed(2)} L${d.x.toFixed(2)},${d.y.toFixed(2)}`
  }).join(' ')

  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={raioInterno} />
      <circle cx={12} cy={12} r={2.6} />
      <path d={dentes} />
    </svg>
  )
}

// Sala de máquinas — linha de pulso (monitor de sinal vital). Escolhido
// por ser inconfundível ao lado da engrenagem de configurações: as duas
// são "coisa de sistema", mas engrenagem é onde se MEXE e pulso é onde
// se OLHA se está de pé.
export function IconeSalaDeMaquinas({ tamanho = 22 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l2.5-6 4 12 2.5-6H22" />
    </svg>
  )
}

export function IconePredio({ tamanho = 22 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={3} width={16} height={18} rx={1.5} />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" />
    </svg>
  )
}
