import type { ReactNode } from 'react'
import { corCss, type AgenteVisual } from '../predio/agentes'
import type { EstadoAgente } from '../../types/agente'
import { RetratoAgente } from './RetratoAgente'

// O quadro comum dos painéis de agente: barra de topo com retrato, nome,
// função e estado + o conteúdo específico daquele agente por dentro.
//
// Existe porque o CONTEÚDO de cada painel é radicalmente diferente (chat
// no Agenda, dashboard no Cifra, menu de forms no Vita, card no Norte),
// mas a moldura é a mesma — e repetir a moldura quatro vezes garantiria
// que uma hora as quatro ficassem sutilmente diferentes.
//
// Duas larguras, decididas em frontend-design.md:
//   estreito → conversa, menu, card único. O escritório fica visível ao
//              lado, porque faz sentido acompanhar a sala enquanto usa.
//   largo    → dashboard e formulário tabular. Escurece o escritório
//              atrás, porque aí a atenção é toda no painel.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'

const LARGURAS = {
  estreito: 360,
  largo: 'min(56vw, 820px)',
} as const

const ROTULO_ESTADO: Record<EstadoAgente, string> = {
  idle: 'ocioso',
  pensando: 'pensando',
  falando: 'falando',
  executando: 'executando',
}

export type LarguraPainel = keyof typeof LARGURAS

interface Props {
  agente: AgenteVisual
  /** vem do backend (GET /agentes). Ausente = backend fora do ar; a barra
   *  degrada pro que é local (retrato, nome, cor, função) em vez de sumir */
  estado?: EstadoAgente
  largura: LarguraPainel
  aoFechar: () => void
  /** Faixa logo abaixo do cabeçalho, comum a todos os agentes (hoje: "se dá bem com"). */
  extra?: ReactNode
  children: ReactNode
}

export function PainelAgente({ agente, estado, largura, aoFechar, extra, children }: Props) {
  const cor = corCss(agente.cor)

  return (
    <>
      {largura === 'largo' && (
        <div
          onClick={aoFechar}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10, 12, 16, 0.55)',
            zIndex: 55,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: LARGURAS[largura],
          fontFamily: MONO,
          color: '#e6e1d6',
          background: 'var(--deck)',
          borderLeft: `1px solid ${cor}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
        }}
      >
        {/* barra de identidade — a cor é a MESMA do anel do crachá no
            escritório, então o painel se lê como "continuação" do agente
            que você clicou, não como uma janela genérica */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: cor,
            color: '#ffffff',
          }}
        >
          <RetratoAgente agente={agente} tamanho={52} anel={2} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.02em' }}>{agente.nome}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{agente.funcao}</div>
            {estado && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 6,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 999,
                  padding: '3px 8px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#ffffff',
                    // 'idle' é o estado de repouso: ponto apagado, pra
                    // não parecer que algo está acontecendo quando não está
                    opacity: estado === 'idle' ? 0.45 : 1,
                  }}
                />
                {ROTULO_ESTADO[estado]}
              </div>
            )}
          </div>

          <button
            onClick={aoFechar}
            aria-label={`fechar painel de ${agente.nome}`}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              font: 'inherit',
              fontSize: 16,
              lineHeight: 1,
              width: 28,
              height: 28,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>

        {extra}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </>
  )
}
