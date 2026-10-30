import { useEffect, useState } from 'react'
import { formatarHora, horaDoDia, horaDoMundoMs, horaLocalDoNavegador, msAteProximoMinuto, type RelogioMundo } from '../predio/relogioDoMundo'

// Hora do mundo no topo. Tem o próprio temporizador (como o Contador tem o próprio estado) para o resto da tela não
// re-renderizar à toa, e se reagenda para a VIRADA de cada minuto do mundo: assim as trocas ficam igualmente espaçadas
// (no fator 24, a cada 2,5 s). Sem relógio do backend, mostra a hora do navegador e confere a cada segundo.
export function RelogioDoTopo({ relogio }: { relogio: RelogioMundo | undefined }) {
  const ler = () => formatarHora(relogio ? horaDoDia(horaDoMundoMs(relogio, Date.now()), relogio.fusoMin) : horaLocalDoNavegador())
  const [texto, setTexto] = useState(ler)

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const atualizar = () => {
      setTexto(ler())
      t = setTimeout(atualizar, relogio ? msAteProximoMinuto(relogio, Date.now()) : 1000)
    }
    atualizar()
    return () => clearTimeout(t)
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
