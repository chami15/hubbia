import { useEffect, useState } from 'react'
import { RetratoAgente } from '../agentes/RetratoAgente'
import { AGENTES, agentePorId, corCss, ehConceito, type AgenteId } from './agentes'
import type { Mundo, ResumoAgente } from './mundo'

// Gerência do prédio: quem está em cada sala (abrir, dispensar) e o catálogo de quem pode entrar. Abre pela
// esquerda, junto com configurações e mensagens — é "olhar o sistema", não "trabalhar com um agente".
//
// O prédio é imperativo (mundo.ts), então este painel lê um retrato dele a cada meio segundo em vez de assinar
// eventos: são no máximo 8 agentes, e o texto do "agora" muda o tempo todo de qualquer jeito.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'

interface Props {
  mundo: Mundo
  /** Vaga clicada no prédio: o agente escolhido entra nela. Sem vaga, entra na próxima livre. */
  vaga?: number
  aoAbrir: (id: AgenteId) => void
  aoFechar: () => void
}

export function PainelPredio({ mundo, vaga, aoAbrir, aoFechar }: Props) {
  const [presentes, setPresentes] = useState<ResumoAgente[]>(() => mundo.agentes())
  const [temEspaco, setTemEspaco] = useState(() => mundo.temEspaco())

  useEffect(() => {
    const id = window.setInterval(() => {
      setPresentes(mundo.agentes())
      setTemEspaco(mundo.temEspaco())
    }, 500)
    return () => window.clearInterval(id)
  }, [mundo])

  const noPredio = new Set([...mundo.vagas().filter((v): v is string => v !== null), ...presentes.map((p) => p.id)])
  const disponiveis = AGENTES.filter((a) => !noPredio.has(a.id))

  function adicionar(id: AgenteId) {
    if (mundo.adicionar(id, vaga)) {
      setPresentes(mundo.agentes())
      setTemEspaco(mundo.temEspaco())
    }
  }

  return (
    <>
      <div onClick={aoFechar} style={{ position: 'absolute', inset: 0, background: 'rgba(10, 12, 16, 0.35)', zIndex: 55 }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 'min(40vw, 380px)',
          fontFamily: MONO,
          color: 'var(--ink)',
          background: 'var(--deck)',
          borderRight: '1px solid var(--deck-line)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            background: 'var(--deck-2)',
            borderBottom: '1px solid var(--deck-line)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: 12,
            color: 'var(--ink-dim)',
          }}
        >
          {vaga !== undefined ? 'nova sala' : 'prédio'}
          <button onClick={aoFechar} aria-label="fechar" style={{ background: 'none', border: 'none', color: 'var(--ink)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4 }}>
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {vaga === undefined && (
            <Secao titulo={`no prédio · ${presentes.length}`}>
              {presentes.map((p) => {
                const a = agentePorId(p.id)
                if (!a) return null
                const ocupado = p.chegando || p.saindo
                return (
                  <Linha key={p.id} cor={corCss(a.cor)}>
                    <RetratoAgente agente={a} tamanho={36} anel={2} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.saindo ? 'indo embora' : p.chegando ? 'chegando' : p.atividade.toLowerCase()}
                      </div>
                    </div>
                    <BotaoPequeno disabled={ocupado} onClick={() => aoAbrir(p.id)}>
                      abrir
                    </BotaoPequeno>
                    <BotaoPequeno disabled={ocupado} onClick={() => mundo.dispensar(p.id)} titulo={`dispensar ${a.nome}: ele vai embora e a sala vira vaga`}>
                      dispensar
                    </BotaoPequeno>
                  </Linha>
                )
              })}
            </Secao>
          )}

          <Secao titulo={vaga !== undefined ? 'quem fica nesta vaga?' : 'adicionar agente'}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
              A sala é construída {vaga !== undefined ? 'nesta vaga' : 'na próxima vaga livre (ou numa coluna nova)'} e o agente chega pelo elevador.
            </p>
            {!temEspaco && <p style={{ margin: 0, fontSize: 12, color: 'var(--official)' }}>O prédio está cheio (8 salas). Dispense alguém para abrir vaga.</p>}
            {disponiveis.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-dim)' }}>Todos os agentes do catálogo já estão no prédio.</p>}
            {disponiveis.map((a) => (
              <Linha key={a.id} cor={corCss(a.cor)}>
                <RetratoAgente agente={a} tamanho={36} anel={2} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {a.nome}
                    {ehConceito(a) && <span style={{ marginLeft: 6, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>conceito</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{a.funcao.replace(' (conceito)', '')}</div>
                </div>
                <BotaoPequeno disabled={!temEspaco} onClick={() => adicionar(a.id)} destaque={corCss(a.cor)}>
                  adicionar
                </BotaoPequeno>
              </Linha>
            ))}
          </Secao>
        </div>
      </div>
    </>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '14px 16px', borderBottom: '1px solid var(--deck-line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{titulo}</div>
      {children}
    </section>
  )
}

function Linha({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        background: 'var(--deck-2)',
        border: '1px solid var(--deck-line)',
        borderLeft: `2px solid ${cor}`,
        borderRadius: 'var(--radius-deck)',
        animation: 'consoleListaEntra 0.2s ease-out',
      }}
    >
      {children}
    </div>
  )
}

function BotaoPequeno({
  children,
  onClick,
  disabled = false,
  destaque,
  titulo,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destaque?: string
  titulo?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      style={{
        font: 'inherit',
        fontSize: 11,
        color: destaque ? '#ffffff' : 'var(--ink)',
        background: destaque ?? 'transparent',
        border: destaque ? 'none' : '1px solid var(--deck-line)',
        borderRadius: 4,
        padding: '5px 8px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
