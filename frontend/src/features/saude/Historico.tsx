import { useMemo, useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useHistorico } from '../../hooks/useSaude'
import { AVISO_ERRO, BOTAO, CORPO, ROTULO } from './estilos'
import { montarLinhaDoTempo, type EntradaDoDia } from './linhaDoTempo'

// O que foi registrado, dia a dia: só leitura (nada aqui grava nem gasta LLM, então carrega ao abrir sem ferir o RNF01).
// Serve para conferir um registro errado e para ver a semana sem esperar o relatório.

const PERIODOS = [7, 14, 30] as const

const COR_TIPO: Record<EntradaDoDia['tipo'], string> = {
  refeicao: 'var(--vita)',
  atividade: 'var(--good)',
  sono: 'var(--info)',
  peso: 'var(--ink)',
  agua: 'var(--info)',
}

export function Historico() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(14)
  const { data, isLoading, error } = useHistorico(dias)
  const grupos = useMemo(() => (data ? montarLinhaDoTempo(data) : []), [data])

  return (
    <div style={CORPO}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ ...ROTULO, marginBottom: 0, marginRight: 4 }}>período</span>
        {PERIODOS.map((p) => (
          <button
            key={p}
            onClick={() => setDias(p)}
            aria-pressed={dias === p}
            style={{
              ...BOTAO,
              fontSize: 11,
              padding: '4px 10px',
              background: dias === p ? 'rgba(var(--vita-rgb), 0.18)' : BOTAO.background,
              border: `1px solid ${dias === p ? 'rgba(var(--vita-rgb), 0.5)' : 'var(--deck-line)'}`,
            }}
          >
            {p} dias
          </button>
        ))}
      </div>

      {error && <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>}
      {isLoading && <div style={{ color: '#8d8779', fontSize: 12 }}>carregando…</div>}

      {data && grupos.length === 0 && (
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>Nada registrado nos últimos {dias} dias.</div>
      )}

      {grupos.map((g) => (
        <section key={g.dia} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...ROTULO, marginTop: 6 }}>{g.rotulo}</div>
          {g.entradas.map((e) => (
            <div
              key={e.chave}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr',
                gap: 10,
                padding: '7px 0 7px 10px',
                borderLeft: `2px solid ${COR_TIPO[e.tipo]}`,
                borderBottom: '1px solid var(--deck-line)',
                fontSize: 12,
                alignItems: 'baseline',
              }}
            >
              <span style={{ color: 'var(--ink-dim)', fontVariantNumeric: 'tabular-nums' }}>{e.hora || '—'}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: 'var(--ink)' }}>{e.titulo}</span>
                {e.detalhe && <span style={{ display: 'block', color: 'var(--ink-dim)', fontSize: 11, marginTop: 2 }}>{e.detalhe}</span>}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
