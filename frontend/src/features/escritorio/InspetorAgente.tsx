import { useState } from 'react'
import { AGENTES } from './agentes'
import { botaoHud, ROTULO, VIDRO } from './hud-estilos'
import {
  COR_NIVEL,
  nivelDaNecessidade,
  ROTULOS_NECESSIDADES,
  type ChaveNecessidade,
  type EstadoSim,
} from './simulacao-sims'
import type { EstadoAgente } from '../../types/agente'

// Ordem no inspetor — energia/café primeiro porque são as que mais
// derrubam o humor; ambiente por último porque é da sala, não do agente.
const CHAVES_NECESSIDADES: ChaveNecessidade[] = ['energia', 'cafeina', 'foco', 'social', 'diversao', 'ambiente']

type Tendencia = EstadoSim['taxasNecessidades'][ChaveNecessidade]

// Canto inferior direito do modo simulação: tudo sobre o agente
// SELECIONADO, em abas. Recolhível — com ele fechado sobra só a linha
// das abas, pra quem quer ver a sala inteira.

type Aba = 'necessidades' | 'carreira' | 'habilidades' | 'relacoes'

const ABAS: { id: Aba; titulo: string }[] = [
  { id: 'necessidades', titulo: 'Necessidades' },
  { id: 'carreira', titulo: 'Carreira' },
  { id: 'habilidades', titulo: 'Habilidades' },
  { id: 'relacoes', titulo: 'Relações' },
]

const ESTADO_SERVIDOR: Record<EstadoAgente, string> = {
  idle: 'ocioso',
  pensando: 'pensando',
  falando: 'conversando',
  executando: 'executando',
}

interface Props {
  agente: EstadoSim
  aoResolverNecessidade: (chave: ChaveNecessidade) => void
  aoInteragirComColega: (alvoId: string, tipo: 'papo' | 'projeto') => void
  aoAbrirPainel: () => void
}

export function InspetorAgente({ agente, aoResolverNecessidade, aoInteragirComColega, aoAbrirPainel }: Props) {
  const [aba, setAba] = useState<Aba>('necessidades')
  const [aberto, setAberto] = useState(true)

  return (
    <div style={{ ...VIDRO, position: 'absolute', right: 16, bottom: 16, zIndex: 62, width: 372, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 6px 0',
          borderBottom: aberto ? '1px solid var(--deck-line)' : 'none',
        }}
      >
        {ABAS.map((a) => {
          const ativa = aberto && aba === a.id
          return (
            <button
              key={a.id}
              type="button"
              className="console-aba"
              data-ativo={ativa}
              onClick={() => {
                if (ativa) setAberto(false)
                else {
                  setAba(a.id)
                  setAberto(true)
                }
              }}
              style={{
                padding: '8px 9px 9px',
                background: 'none',
                border: 'none',
                color: ativa ? 'var(--ink)' : 'var(--ink-dim)',
                fontFamily: 'var(--fonte-corpo)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {a.titulo}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={aberto ? 'recolher inspetor' : 'expandir inspetor'}
          title={aberto ? 'Recolher' : 'Expandir'}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-dim)', cursor: 'pointer', padding: '4px 8px' }}
        >
          {aberto ? '▾' : '▴'}
        </button>
      </div>

      {aberto && (
        <div style={{ padding: '10px 12px 12px' }}>
          {aba === 'necessidades' && <Necessidades agente={agente} aoResolver={aoResolverNecessidade} />}
          {aba === 'carreira' && <Carreira agente={agente} aoAbrirPainel={aoAbrirPainel} />}
          {aba === 'habilidades' && <Habilidades agente={agente} />}
          {aba === 'relacoes' && <Relacoes agente={agente} aoInteragir={aoInteragirComColega} />}
        </div>
      )}
    </div>
  )
}

function Necessidades({ agente, aoResolver }: { agente: EstadoSim; aoResolver: (k: ChaveNecessidade) => void }) {
  return (
    <>
      <div style={{ ...ROTULO, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span>{agente.nome}</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>clique numa barra pra resolver</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {CHAVES_NECESSIDADES.map((chave) => {
          const meta = ROTULOS_NECESSIDADES[chave]
          const valor = Math.round(agente.necessidades[chave])
          const cor = COR_NIVEL[nivelDaNecessidade(valor)].hex
          // ambiente é da sala: não tem o que o agente "resolver"
          const daSala = chave === 'ambiente'
          return (
            <button
              key={chave}
              type="button"
              className="hud-botao"
              disabled={daSala}
              onClick={() => aoResolver(chave)}
              title={daSala ? meta.descricao : `${meta.descricao} Clique pra resolver agora.`}
              style={{
                textAlign: 'left',
                padding: '7px 9px',
                borderRadius: 9,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--deck-line)',
                color: 'var(--ink)',
                fontFamily: 'var(--fonte-corpo)',
                cursor: daSala ? 'default' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>
                <span>{meta.icone}</span>
                <span>{meta.nome}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, color: cor, fontVariantNumeric: 'tabular-nums' }}>
                  <SetaTendencia tendencia={agente.taxasNecessidades[chave]} />
                  {valor}
                </span>
              </div>
              <Barra pct={valor} cor={cor} />
            </button>
          )
        })}
      </div>
    </>
  )
}

function SetaTendencia({ tendencia }: { tendencia: Tendencia }) {
  if (tendencia === 0) return null
  const subindo = tendencia > 0
  return (
    <span aria-hidden="true" style={{ fontSize: 8, opacity: subindo ? 1 : 0.55 }}>
      {tendencia >= 2 ? '▲▲' : subindo ? '▲' : '▼'}
    </span>
  )
}

function Barra({ pct, cor, altura = 6 }: { pct: number; cor: string; altura?: number }) {
  return (
    <div style={{ height: altura, borderRadius: 999, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          borderRadius: 999,
          background: `linear-gradient(90deg, ${cor}aa, ${cor})`,
          boxShadow: `0 0 6px ${cor}66`,
          // a foto chega ~7x/s; a transição preenche o intervalo
          transition: 'width 0.18s linear, background 0.3s ease',
        }}
      />
    </div>
  )
}

function Carreira({ agente, aoAbrirPainel }: { agente: EstadoSim; aoAbrirPainel: () => void }) {
  const nativo = AGENTES.some((a) => a.id === agente.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{agente.funcao.charAt(0).toUpperCase() + agente.funcao.slice(1)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
            {nativo ? (
              <>
                No servidor: <span style={{ color: 'var(--accent)' }}>{ESTADO_SERVIDOR[agente.estadoBackend]}</span>
              </>
            ) : (
              // criado no criador de personagem: só existe no jogo
              'Personagem do jogo — não roda no servidor'
            )}
          </div>
        </div>
        {nativo && (
          <button type="button" className="hud-botao" onClick={aoAbrirPainel} style={botaoHud({ destaque: true })}>
            Abrir painel
          </button>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: 'var(--ink-dim)' }}>Desempenho no expediente</span>
          <span style={{ color: 'var(--good)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(agente.desempenhoCarreira)}%</span>
        </div>
        <Barra pct={agente.desempenhoCarreira} cor="#4ade80" altura={7} />
      </div>

      <div>
        <div style={{ ...ROTULO, marginBottom: 6 }}>Traços</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {agente.tracos.map((t) => (
            <span
              key={t.id}
              title={t.descricao}
              style={{
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--deck-line)',
              }}
            >
              {t.icone} {t.nome}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Habilidades({ agente }: { agente: EstadoSim }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {agente.habilidades.map((h) => (
        <div key={h.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            <span>
              {h.icone} {h.nome}
            </span>
            <span style={{ color: 'var(--info)', fontVariantNumeric: 'tabular-nums' }}>nível {h.nivel}/10</span>
          </div>
          <Barra pct={h.progresso} cor="#7fb8de" />
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>Sobe praticando: trabalho, leitura e conversa contam.</div>
    </div>
  )
}

function Relacoes({ agente, aoInteragir }: { agente: EstadoSim; aoInteragir: (alvoId: string, tipo: 'papo' | 'projeto') => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {agente.relacionamentos.map((r) => (
        <div key={r.alvoId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{r.nome}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <MiniMedidor rotulo="amizade" valor={r.amizade} cor="#4ade80" />
              <MiniMedidor rotulo="sinergia" valor={r.sinergia} cor="#dbb15f" />
            </div>
          </div>
          {/* o chefe não está na sala — dá pra ver a relação, não puxar papo */}
          {r.alvoId !== 'chefe' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="hud-botao"
                onClick={() => aoInteragir(r.alvoId, 'papo')}
                title={`Conversar com ${r.nome}`}
                aria-label={`conversar com ${r.nome}`}
                style={botaoHud({ quadrado: true })}
              >
                💬
              </button>
              <button
                type="button"
                className="hud-botao"
                onClick={() => aoInteragir(r.alvoId, 'projeto')}
                title={`Alinhar projeto com ${r.nome}`}
                aria-label={`alinhar projeto com ${r.nome}`}
                style={botaoHud({ quadrado: true })}
              >
                🤝
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MiniMedidor({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-dim)', marginBottom: 3 }}>
        <span>{rotulo}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(valor)}</span>
      </div>
      <Barra pct={valor} cor={cor} altura={4} />
    </div>
  )
}
