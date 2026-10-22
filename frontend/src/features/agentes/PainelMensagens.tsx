import { useMemo, useState } from 'react'
import { useAgentes } from '../../hooks/useAgentes'
import { useMarcarMensagemLida, useMensagens, useResponderMensagem } from '../../hooks/useMensagens'
import { mensagemDeErro } from '../../api/client'
import { AGENTES, corCss } from '../predio/agentes'
import type { Mensagem } from '../../types/mensagens'

// Mensagens do módulo de interação (docs/frontend-design.md) — duas
// abas sobre o MESMO dado (`GET /mensagens`, todo par, sem filtro):
//
//   minhas conversas — só o que toca o chefe, agrupado numa thread por
//                      colega (RF25). É a aba acionável: dá pra responder.
//   mural            — TUDO, inclusive papo agente↔agente que nunca
//                      passa pelo chefe (RF22). É só leitura — a
//                      "linha do tempo" do escritório inteiro.
//
// As duas usam o mesmo visual de balão de fala (cor por identidade do
// agente, trabalho com borda âmbar, citação quando é resposta a algo) —
// é o que faz o mural parecer "gente conversando", não uma tabela de log.
//
// NÃO usa GET /mensagens/caixa-de-entrada pra "minhas conversas". Esse
// endpoint filtra por `destinatario_id = chefe`, então devolve só o que
// CHEGA — a resposta que o próprio chefe manda (`destinatario_id` vira o
// AGENTE) fica de fora, e uma "conversa" sem o lado do chefe é só metade
// dela. Por isso as duas abas partem do mural (`GET /mensagens`, que tem
// as duas pontas de qualquer par) — mais fetch do que a aba de conversas
// sozinha precisaria, mas o único jeito de montar o balão de citação de
// duas vias sem inventar endpoint novo, e a aba mural precisa dele de
// qualquer forma.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'
const COR_TRABALHO = '#dbb15f'
// mesmo tom da bolinha do ícone de mensagens (Escritorio.tsx) — o
// "não lida" precisa ser reconhecível como a MESMA coisa nos dois lugares
const COR_NAO_LIDA = '#ef4444'

const BACKDROP: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(10, 12, 16, 0.55)',
  zIndex: 55,
}

// Superfície de trabalho, não instrumento flutuante — mesma chapa opaca
// e cantos retos do resto da casa (docs/frontend-design.md).
const PAINEL: React.CSSProperties = {
  position: 'absolute',
  // abre pela ESQUERDA (decisão do chefe) — o ícone que abre este
  // painel também mora no canto inferior ESQUERDO agora (Escritorio.tsx)
  left: 0,
  top: 0,
  bottom: 0,
  width: 'min(56vw, 720px)',
  fontFamily: MONO,
  color: '#e6e1d6',
  background: 'var(--deck)',
  borderRight: '1px solid var(--deck-line)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 60,
}

const CABECALHO: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  background: 'var(--deck-2)',
  borderBottom: '1px solid var(--deck-line)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 12,
  color: '#8d8779',
}

const BOTAO_FECHAR: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e6e1d6',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
}

const BOTAO: React.CSSProperties = {
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 6,
  color: '#e6e1d6',
  font: 'inherit',
  fontWeight: 600,
  fontSize: 11,
  padding: '5px 9px',
  cursor: 'pointer',
}

const ABA: React.CSSProperties = {
  flex: 1,
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 4,
  color: '#8d8779',
  font: 'inherit',
  fontSize: 11.5,
  padding: '7px 10px',
  cursor: 'pointer',
}

const ABA_ATIVA: React.CSSProperties = {
  ...ABA,
  color: '#e6e1d6',
}

const LINK: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8d8779',
  font: 'inherit',
  fontSize: 10.5,
  padding: 0,
  cursor: 'pointer',
}

const CAMPO_RESPOSTA: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: '#0a0b0e',
  border: '1px solid var(--deck-line)',
  borderRadius: 4,
  color: '#e6e1d6',
  font: 'inherit',
  fontSize: 11.5,
  padding: '6px 8px',
  colorScheme: 'dark',
}

const ERRO: React.CSSProperties = {
  color: '#f0b7ab',
  fontSize: 11,
  lineHeight: 1.5,
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

// Cor da bolha pela identidade de quem FALOU (mesma cor do crachá) —
// mensagem do chefe (que não tem crachá nem entrada em AGENTES) cai no
// tom neutro, o mesmo usado pra qualquer remetente desconhecido
function corDoRemetente(nome: string): string {
  const visual = AGENTES.find((a) => a.nome === nome)
  return visual ? corCss(visual.cor) : '#8d8779'
}

type Aba = 'conversas' | 'mural'

export function PainelMensagens({ aoFechar }: { aoFechar: () => void }) {
  const [aba, setAba] = useState<Aba>('conversas')
  const { data: agentes } = useAgentes()
  const { data: mensagens, isLoading, error } = useMensagens()

  const chefeId = agentes?.find((a) => a.tipo === 'chefe')?.id

  return (
    <>
      <div onClick={aoFechar} style={BACKDROP} />
      <div style={PAINEL}>
        <header style={CABECALHO}>
          <span>mensagens</span>
          <button style={BOTAO_FECHAR} onClick={aoFechar} aria-label="fechar mensagens">
            ×
          </button>
        </header>

        <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
          <button
            className="console-aba"
            data-ativo={aba === 'conversas'}
            style={aba === 'conversas' ? ABA_ATIVA : ABA}
            onClick={() => setAba('conversas')}
          >
            minhas conversas
          </button>
          <button
            className="console-aba"
            data-ativo={aba === 'mural'}
            style={aba === 'mural' ? ABA_ATIVA : ABA}
            onClick={() => setAba('mural')}
          >
            mural
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLoading && <div style={{ color: '#8d8779', fontSize: 12 }}>carregando…</div>}
          {error && <div style={ERRO}>{mensagemDeErro(error)}</div>}

          {!isLoading && !error && aba === 'conversas' && <MinhasConversas mensagens={mensagens ?? []} chefeId={chefeId} />}
          {!isLoading && !error && aba === 'mural' && <Mural mensagens={mensagens ?? []} chefeId={chefeId} />}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------
// Aba "minhas conversas" — uma thread por colega (RF25)
// ---------------------------------------------------------------

interface Conversa {
  outroId: number
  outroNome: string
  // ascendente por id — ordem de leitura de uma conversa
  mensagens: Mensagem[]
}

// Agrupa o mural (que traz TODO par) só nas mensagens que tocam o
// chefe, uma conversa por interlocutor — é aqui que "feed único" vira
// "uma thread por colega" (decisão de design registrada no guia).
function agruparPorConversa(mensagens: Mensagem[], chefeId: number): Conversa[] {
  const porOutro = new Map<number, { nome: string; mensagens: Mensagem[] }>()

  for (const m of mensagens) {
    if (m.remetente_id !== chefeId && m.destinatario_id !== chefeId) continue
    const outroId = m.remetente_id === chefeId ? m.destinatario_id : m.remetente_id
    const outroNome = m.remetente_id === chefeId ? m.destinatario_nome : m.remetente_nome
    if (outroId == null) continue
    const entrada = porOutro.get(outroId) ?? { nome: outroNome ?? `agente ${outroId}`, mensagens: [] }
    entrada.mensagens.push(m)
    porOutro.set(outroId, entrada)
  }

  const conversas = [...porOutro.entries()].map(([outroId, { nome, mensagens: doOutro }]) => {
    doOutro.sort((a, b) => a.id - b.id)
    return { outroId, outroNome: nome, mensagens: doOutro }
  })
  conversas.sort((a, b) => b.mensagens.at(-1)!.id - a.mensagens.at(-1)!.id)
  return conversas
}

// "lida" é por CLIQUE na mensagem específica (decisão do chefe) — nunca
// por abrir a conversa/aba. Só mensagens que CHEGARAM pra ele contam;
// as que ele mesmo escreveu não têm o que "ler".
function naoLida(msg: Mensagem, chefeId: number | undefined): boolean {
  return msg.destinatario_id === chefeId && !msg.lida_pelo_chefe
}

function MinhasConversas({ mensagens, chefeId }: { mensagens: Mensagem[]; chefeId: number | undefined }) {
  const responder = useResponderMensagem()
  const marcarLida = useMarcarMensagemLida()
  const [abertas, setAbertas] = useState<Set<number>>(new Set())
  const [respondendoId, setRespondendoId] = useState<number | null>(null)
  const [texto, setTexto] = useState('')

  const conversas = useMemo(() => {
    if (chefeId == null) return []
    return agruparPorConversa(mensagens, chefeId)
  }, [mensagens, chefeId])

  function alternar(id: number) {
    setAbertas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function abrirResposta(mensagemId: number) {
    setRespondendoId(mensagemId)
    setTexto('')
  }

  function enviarResposta(mensagemId: number) {
    const conteudo = texto.trim()
    if (!conteudo) return
    responder.mutate(
      { mensagemId, conteudo },
      { onSuccess: () => { setRespondendoId(null); setTexto('') } },
    )
  }

  if (conversas.length === 0) {
    return (
      <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
        Nenhuma mensagem ainda — avance o relógio e processe uma rodada (ícones
        do canto inferior direito) pra gerar conversa.
      </div>
    )
  }

  return (
    <>
      {conversas.map((c) => {
        const cor = corDoRemetente(c.outroNome)
        const ultima = c.mensagens.at(-1)!
        const aberta = abertas.has(c.outroId)
        const temNaoLida = c.mensagens.some((m) => naoLida(m, chefeId))

        return (
          <div
            key={c.outroId}
            style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}
          >
            <button
              onClick={() => alternar(c.outroId)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: 'none',
                color: '#e6e1d6',
                font: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.outroNome}
                  {temNaoLida && (
                    <span
                      style={{ width: 6, height: 6, borderRadius: '50%', background: COR_NAO_LIDA, flexShrink: 0 }}
                      aria-label="mensagem não lida"
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#8d8779',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {truncar(ultima.conteudo, 64)}
                </div>
              </span>
              <span style={{ color: '#8d8779', fontSize: 11 }}>{aberta ? '▾' : '▸'}</span>
            </button>

            {aberta && (
              <div
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {c.mensagens.map((msg) => {
                  const doChefe = msg.remetente_id === chefeId
                  const podeResponder = msg.tipo === 'social' && !doChefe
                  const estaNaoLida = naoLida(msg, chefeId)

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: doChefe ? 'flex-end' : 'flex-start',
                        gap: 3,
                      }}
                    >
                      <div
                        // clicar É o "lida" — nunca abrir a conversa (decisão
                        // do chefe). Idempotente: clicar numa já lida não
                        // muda nada, então não precisa condicionar o handler
                        onClick={() => { if (estaNaoLida) marcarLida.mutate(msg.id) }}
                        style={{
                          maxWidth: '85%',
                          padding: '8px 11px',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          cursor: estaNaoLida ? 'pointer' : 'default',
                          background: doChefe ? 'rgba(255,255,255,0.1)' : `${cor}22`,
                          border: msg.tipo === 'trabalho' ? `1px solid ${COR_TRABALHO}` : '1px solid transparent',
                          boxShadow: estaNaoLida ? `0 0 0 1px ${COR_NAO_LIDA}` : 'none',
                        }}
                      >
                        {estaNaoLida && (
                          <div style={{ fontSize: 9.5, color: COR_NAO_LIDA, marginBottom: 4 }}>● não lida — clique pra marcar como lida</div>
                        )}
                        {msg.tipo === 'trabalho' && <RotuloTrabalho />}
                        {msg.respondendo_a_id != null && <Citacao msg={msg} />}
                        {msg.conteudo}
                      </div>

                      {podeResponder &&
                        (respondendoId === msg.id ? (
                          <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: '85%' }}>
                            <input
                              autoFocus
                              style={CAMPO_RESPOSTA}
                              value={texto}
                              onChange={(e) => setTexto(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') enviarResposta(msg.id)
                              }}
                              placeholder={`responder pra ${c.outroNome}…`}
                            />
                            <button style={BOTAO} onClick={() => enviarResposta(msg.id)} disabled={responder.isPending}>
                              enviar
                            </button>
                            <button style={BOTAO} onClick={() => setRespondendoId(null)}>
                              ×
                            </button>
                          </div>
                        ) : (
                          <button style={LINK} onClick={() => abrirResposta(msg.id)}>
                            responder
                          </button>
                        ))}
                    </div>
                  )
                })}

                {responder.isError && respondendoId != null && <div style={ERRO}>{mensagemDeErro(responder.error)}</div>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------
// Aba "mural" — linha do tempo com TUDO (RF22), inclusive papo
// agente↔agente que nunca passa pelo chefe. Só leitura.
// ---------------------------------------------------------------

function Mural({ mensagens, chefeId }: { mensagens: Mensagem[]; chefeId: number | undefined }) {
  const marcarLida = useMarcarMensagemLida()
  // cronológico ascendente (mais antiga em cima) — mesma leitura de
  // cima pra baixo que qualquer chat da casa já usa
  const ordenadas = useMemo(() => [...mensagens].sort((a, b) => a.id - b.id), [mensagens])

  if (ordenadas.length === 0) {
    return (
      <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
        Nenhuma mensagem ainda — avance o relógio e processe uma rodada (ícones
        do canto inferior direito) pra ver o escritório conversar.
      </div>
    )
  }

  return (
    <>
      {ordenadas.map((msg) => (
        <BolhaMural
          key={msg.id}
          msg={msg}
          naoLida={naoLida(msg, chefeId)}
          aoMarcarLida={() => marcarLida.mutate(msg.id)}
        />
      ))}
    </>
  )
}

// Sem lado esquerdo/direito de propósito: alternar lados representa
// UMA relação de duas pontas (o "eu" de uma conversa), e o mural mistura
// pares diferentes na mesma lista — forçar um lado fixo pra cada bolha
// mentiria sobre quem é "eu" aqui. A cor por remetente já resolve "quem
// falou" numa lista vertical só.
function BolhaMural({ msg, naoLida, aoMarcarLida }: { msg: Mensagem; naoLida: boolean; aoMarcarLida: () => void }) {
  const cor = corDoRemetente(msg.remetente_nome)

  return (
    <div
      onClick={() => { if (naoLida) aoMarcarLida() }}
      style={{
        padding: '9px 12px',
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        cursor: naoLida ? 'pointer' : 'default',
        background: `${cor}18`,
        border: msg.tipo === 'trabalho' ? `1px solid ${COR_TRABALHO}` : '1px solid transparent',
        boxShadow: naoLida ? `0 0 0 1px ${COR_NAO_LIDA}` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, color: cor }}>
          {msg.remetente_nome} → {msg.destinatario_nome ?? 'mural'}
        </span>
        {msg.tick != null && <span style={{ fontSize: 10, color: '#6f6a5f', flexShrink: 0 }}>tick {msg.tick}</span>}
      </div>
      {naoLida && <div style={{ fontSize: 9.5, color: COR_NAO_LIDA, marginBottom: 4 }}>● não lida</div>}
      {msg.tipo === 'trabalho' && <RotuloTrabalho />}
      {msg.respondendo_a_id != null && <Citacao msg={msg} />}
      {msg.conteudo}
    </div>
  )
}

function RotuloTrabalho() {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COR_TRABALHO,
        marginBottom: 4,
      }}
    >
      trabalho
    </div>
  )
}

function Citacao({ msg }: { msg: Mensagem }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        opacity: 0.7,
        borderLeft: '2px solid rgba(255,255,255,0.25)',
        paddingLeft: 6,
        marginBottom: 5,
      }}
    >
      ↩ {msg.respondendo_a_remetente_nome}: {truncar(msg.respondendo_a_conteudo ?? '', 80)}
    </div>
  )
}
