import { useEffect, useState } from 'react'
import { formatarHora, horaDoDia, horaDoMundoMs, horaLocalDoNavegador, type RelogioMundo } from '../predio/relogioDoMundo'

// Hora do mundo no topo. Tem o próprio intervalo (como o Contador tem o próprio estado) para o resto da tela não
// re-renderizar a cada segundo: o React só troca o texto quando o minuto do mundo muda (a cada ~2,5 s no fator 24).
export function RelogioDoTopo({ relogio }: { relogio: RelogioMundo | undefined }) {
  const ler = () => formatarHora(relogio ? horaDoDia(horaDoMundoMs(relogio, Date.now()), relogio.fusoMin) : horaLocalDoNavegador())
  const [texto, setTexto] = useState(ler)

  useEffect(() => {
    const atualizar = () => setTexto(ler())
    atualizar()
    const t = setInterval(atualizar, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ler` só depende de `relogio`
  }, [relogio])

  return (
    <span
      title={relogio ? `hora do mundo (1 min real = ${relogio.fator} min)` : 'hora do navegador (relógio do mundo indisponível)'}
      style={{ fontSize: 15, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
    >
      {texto}
    </span>
  )
}
