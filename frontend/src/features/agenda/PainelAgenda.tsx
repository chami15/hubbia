import { useEffect, useRef, useState } from 'react'
import { useConversaAgenda, type FalaChat } from '../../hooks/useAgenda'
import { corCss, type AgenteVisual } from '../predio/agentes'

// O conteúdo do painel do Agenda: chat.
//
// É o único dos quatro agentes que é conversa de verdade — os outros são
// dashboard/menu/card (ver frontend-design.md). O que exige cuidado aqui
// é a PROPOSTA: uma resposta que está esperando confirmação não pode
// parecer uma mensagem comum, senão o chefe passa batido por uma ação
// que vai mexer no Google Calendar de verdade (RF10 + RNF04).

const COR_PROPOSTA = '#dbb15f'

// Fundo opaco, cantos de 6px — mesma linguagem "deck" do resto da casa
// (docs/frontend-design.md, redesenho "Console").
const BOTAO: React.CSSProperties = {
  border: '1px solid var(--deck-line)',
  background: 'var(--deck-2)',
  borderRadius: 6,
  color: '#e6e1d6',
  font: 'inherit',
  fontWeight: 600,
  fontSize: 11.5,
  padding: '7px 12px',
  cursor: 'pointer',
}

interface Props {
  agente: AgenteVisual
}

export function PainelAgenda({ agente }: Props) {
  const { falas, pendenteId, erro, ocupado, enviar, confirmar, rejeitar } = useConversaAgenda()
  const [texto, setTexto] = useState('')
  const fimDaLista = useRef<HTMLDivElement>(null)

  // rolar pro fim a cada fala nova — sem isso a resposta do agente
  // chegaria fora da vista numa conversa longa
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth' })
  }, [falas.length, ocupado])

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    enviar(texto)
    setTexto('')
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {falas.length === 0 && (
          <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>
            Fale com a Agenda como você falaria com uma pessoa.
            <br />
            <br />
            <span style={{ opacity: 0.75 }}>
              &quot;marca dentista quinta de manhã&quot;
              <br />
              &quot;o que eu tenho essa semana?&quot;
            </span>
          </div>
        )}

        {falas.map((fala) => (
          <Bolha key={fala.id} fala={fala} agente={agente} aberta={fala.acaoPendenteId === pendenteId} />
        ))}

        {/* RNF07: ação com LLM pode demorar alguns segundos — precisa
            dizer que está viva, senão parece travada */}
        {ocupado && <div style={{ color: '#8d8779', fontSize: 11.5, fontStyle: 'italic' }}>Agenda está pensando…</div>}

        <div ref={fimDaLista} />
      </div>

      {erro && (
        <div
          role="alert"
          style={{
            margin: '0 16px 10px',
            padding: '9px 11px',
            background: '#f0b7ab',
            color: '#3b1512',
            borderRadius: 6,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          {erro}
        </div>
      )}

      {pendenteId !== null && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={confirmar}
              disabled={ocupado}
              style={{
                ...BOTAO,
                flex: 1,
                background: 'rgba(74,222,128,0.2)',
                border: '1px solid rgba(74,222,128,0.5)',
                opacity: ocupado ? 0.5 : 1,
              }}
            >
              confirmar
            </button>
            <button
              onClick={rejeitar}
              disabled={ocupado}
              style={{ ...BOTAO, flex: 1, opacity: ocupado ? 0.5 : 1 }}
            >
              rejeitar
            </button>
          </div>
          {/* o backend aceita os dois caminhos (regex de "sim"/"não" e
              endpoint por id) — dizer isso evita a dúvida de "posso só
              responder ou tenho que clicar?" */}
          <div style={{ color: '#8d8779', fontSize: 10.5 }}>ou responda por texto pra ajustar a proposta</div>
        </div>
      )}

      <form
        onSubmit={submeter}
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid var(--deck-line)',
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="escreva pra Agenda…"
          disabled={ocupado}
          autoFocus
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--deck-2)',
            border: '1px solid var(--deck-line)',
            borderRadius: 6,
            color: '#e6e1d6',
            font: 'inherit',
            fontSize: 12,
            padding: '8px 10px',
            colorScheme: 'dark',
          }}
        />
        <button
          type="submit"
          disabled={ocupado || !texto.trim()}
          style={{
            ...BOTAO,
            background: corCss(agente.cor),
            border: `1px solid ${corCss(agente.cor)}`,
            color: '#ffffff',
            opacity: ocupado || !texto.trim() ? 0.45 : 1,
          }}
        >
          enviar
        </button>
      </form>
    </>
  )
}

function Bolha({ fala, agente, aberta }: { fala: FalaChat; agente: AgenteVisual; aberta: boolean }) {
  const doChefe = fala.de === 'chefe'
  // proposta AINDA em aberto ganha destaque; depois de resolvida volta a
  // ser uma mensagem comum no histórico — manter o alerta aceso pra algo
  // já decidido ensinaria a ignorar o destaque
  const proposta = !doChefe && fala.acaoPendenteId !== undefined && aberta

  return (
    <div style={{ display: 'flex', justifyContent: doChefe ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '9px 12px',
          borderRadius: 6,
          fontSize: 12.5,
          lineHeight: 1.55,
          // `pre-wrap` porque a lista de compromissos vem com \n do
          // backend — sem isso viraria um parágrafo só
          whiteSpace: 'pre-wrap',
          background: doChefe ? corCss(agente.cor) : 'var(--deck-2)',
          color: doChefe ? '#ffffff' : '#e6e1d6',
          border: proposta ? `1px solid ${COR_PROPOSTA}` : '1px solid transparent',
          // pulsa devagar enquanto espera — "isto está aberto", sem
          // gritar (mesma keyframe do card estagnado do Norte, mesma
          // cor "oficial" da proposta)
          animation: proposta ? 'consoleStagPulse 2.6s ease-in-out infinite' : undefined,
        }}
      >
        {proposta && (
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: COR_PROPOSTA,
              marginBottom: 5,
            }}
          >
            proposta · aguardando você
          </div>
        )}
        {fala.texto}
      </div>
    </div>
  )
}
