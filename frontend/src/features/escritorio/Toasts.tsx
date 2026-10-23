import { useCallback, useRef, useState } from 'react'

// Notificação passageira, empilhada acima do ícone de avançar tick — pro
// chefe saber o que aconteceu num avanço sem precisar ter o painel de
// configurações aberto (hoje `rodada.interacoes` só aparece lá dentro).
// Diferente do TOAST solto de PainelEdicao.tsx (um pill único, preso ao
// modo de edição): aqui é uma PILHA reutilizável, chamável de qualquer
// lugar que precise avisar algo passageiro.

export type TipoToast = 'info' | 'sucesso' | 'aviso' | 'erro'

export interface ToastItem {
  id: number
  tipo: TipoToast
  titulo?: string
  texto: string
  // sobrescreve a cor padrão do tipo — usado pra tingir com a cor do
  // agente que gerou o aviso, do mesmo jeito que o card do Norte e a
  // bolha de proposta da Agenda já tingem por identidade
  cor?: string
  saindo?: boolean
}

const DURACAO_MS: Record<TipoToast, number> = {
  info: 6000,
  sucesso: 6000,
  aviso: 8000,
  erro: 9000,
}

// tempo pra animação de saída rodar antes do item sumir de verdade —
// sem isso o toast piscaria e desapareceria seco, em vez de deslizar
const DURACAO_SAIDA_MS = 250

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const proximoId = useRef(1)

  const fechar = useCallback((id: number) => {
    setToasts((atuais) => atuais.map((t) => (t.id === id ? { ...t, saindo: true } : t)))
    window.setTimeout(() => {
      setToasts((atuais) => atuais.filter((t) => t.id !== id))
    }, DURACAO_SAIDA_MS)
  }, [])

  const notificar = useCallback(
    (toast: Omit<ToastItem, 'id' | 'saindo'>) => {
      const id = proximoId.current++
      setToasts((atuais) => [...atuais, { ...toast, id }])
      window.setTimeout(() => fechar(id), DURACAO_MS[toast.tipo])
    },
    [fechar],
  )

  return { toasts, notificar, fechar }
}

const CORES: Record<TipoToast, string> = {
  info: 'var(--info)',
  sucesso: 'var(--good)',
  aviso: 'var(--official)',
  erro: 'var(--danger)',
}

interface Props {
  toasts: ToastItem[]
  aoFechar: (id: number) => void
}

// Empilha acima do ícone de avançar tick (bottom:16/right:16, ~44px) —
// mesma pilha de zIndex do HUD (65), só que por cima de tudo: uma
// notificação some sozinha, não pode ficar escondida atrás de um painel
// aberto.
export function Toasts({ toasts, aoFechar }: Props) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 72,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        width: 300,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} aoFechar={() => aoFechar(t.id)} />
      ))}
    </div>
  )
}

function Toast({ toast, aoFechar }: { toast: ToastItem; aoFechar: () => void }) {
  const cor = toast.cor ?? CORES[toast.tipo]
  return (
    <div
      style={{
        pointerEvents: 'auto',
        background: 'var(--deck-2)',
        border: '1px solid var(--deck-line)',
        borderLeft: `3px solid ${cor}`,
        borderRadius: 'var(--radius-deck)',
        padding: '10px 12px',
        boxShadow: '0 10px 28px -10px rgba(0,0,0,0.55)',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        overflow: 'hidden',
        animation: toast.saindo
          ? 'consoleToastSai .25s ease both'
          : 'consoleToastEntra .3s cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.titulo && (
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: cor,
              marginBottom: 3,
            }}
          >
            {toast.titulo}
          </div>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink)' }}>{toast.texto}</div>
      </div>
      <button
        onClick={aoFechar}
        aria-label="fechar notificação"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--ink-faint)',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
