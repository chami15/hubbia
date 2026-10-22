import { useMemo } from 'react'
import * as art from '../predio/habblaud/art/index'
import { corCss, type AgenteVisual } from '../predio/agentes'

// O busto do agente em pixel art — o MESMO personagem que anda pelo prédio (a arte gera o busto a partir da
// aparência, então os dois nunca divergem). Antes era a foto recortada em círculo; o redesenho do prédio trocou
// tudo pela arte procedural do habblaud.

interface Props {
  agente: AgenteVisual
  /** lado do quadro, em px */
  tamanho: number
  /** espessura da moldura colorida em volta; 0 remove */
  anel?: number
}

export function RetratoAgente({ agente, tamanho, anel = 3 }: Props) {
  // o busto tem 20 px de lado; gera numa escala inteira que cubra o tamanho pedido e o CSS ajusta o resto
  const escala = Math.max(1, Math.ceil(tamanho / 20))
  const src = useMemo(
    () => art.avatarCanvas(agente.seed, { look: agente.look, parts: agente.parts, scale: escala }).toDataURL(),
    [agente.seed, agente.look, agente.parts, escala],
  )
  return (
    <img
      src={src}
      alt={agente.nome}
      width={tamanho}
      height={tamanho}
      style={{
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        boxSizing: 'border-box',
        imageRendering: 'pixelated',
        borderRadius: Math.round(tamanho / 6),
        border: anel > 0 ? `${anel}px solid ${corCss(agente.cor)}` : undefined,
        background: '#0b0e14',
      }}
    />
  )
}
