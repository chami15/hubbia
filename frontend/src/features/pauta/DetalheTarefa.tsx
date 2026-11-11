// Nível 3: a tarefa. Checklist para acompanhar, a sugestão da Pauta (post-it), o que já se sabe e os textos originais.
import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import {
  useAdicionarItem, useAtualizarContexto, useMarcarItem, useMudarStatus, useOcultar, useRemoverItem, useResolverSugestao, useSugerir, useTarefa,
} from '../../hooks/usePauta'
import type { Sugestao, Tarefa } from '../../types/pauta'
import type { Avisar } from './PainelPauta'
import { blocos, prazoEmPalavras } from './logica'
import { Barra, Botao, Caixa, Icone, Marcar, Rotulo } from './pixel'
import { CAMPO, FONTE, PAPEL, TINTA_PAPEL, degraus } from './estilos'

const COR_PRAZO = { vencido: 'var(--danger)', perto: 'var(--pauta)', normal: 'var(--ink-dim)' } as const

export function DetalheTarefa({ tarefaId, avisar }: { tarefaId: number; avisar: Avisar }) {
  const { data: t, isLoading, error } = useTarefa(tarefaId)
  if (isLoading) return <Rotulo>carregando…</Rotulo>
  if (error || !t) return <div style={{ color: 'var(--danger)', fontSize: 14 }}>{mensagemDeErro(error)}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Cabecalho t={t} avisar={avisar} />
      <SugestaoDaPauta t={t} avisar={avisar} />
      <Checklist t={t} avisar={avisar} />
      <OQueJaSeSabe t={t} avisar={avisar} />
      {t.textos.length > 0 && (
        <details style={{ fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--ink-dim)' }}>textos originais ({t.textos.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {t.textos.map((x) => (
              <div key={x.id} style={{ whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--deck-line)', paddingLeft: 8, color: 'var(--ink-dim)', fontFamily: 'var(--fonte-corpo)' }}>
                {x.texto}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function Cabecalho({ t, avisar }: { t: Tarefa; avisar: Avisar }) {
  const status = useMudarStatus()
  const ocultar = useOcultar()
  const prazo = t.status === 'aberta' ? prazoEmPalavras(t.prazo, new Date()) : null
  const mudar = (s: 'aberta' | 'feita' | 'arquivada') => status.mutate({ id: t.id, status: s }, { onError: (e) => avisar(mensagemDeErro(e), true) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, textDecoration: t.status === 'feita' ? 'line-through' : undefined }}>{t.titulo}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--ink-dim)', flexWrap: 'wrap' }}>
        {prazo && <span style={{ color: COR_PRAZO[prazo.tom] }}>prazo: {prazo.texto}</span>}
        {t.status === 'feita' && <span style={{ color: 'var(--good)' }}>concluída</span>}
        {t.status === 'arquivada' && <span>deixada de lado</span>}
        {t.itens_total > 0 && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Barra acesos={blocos(t.itens_feitos, t.itens_total)} /> {t.itens_feitos}/{t.itens_total}
          </span>
        )}
      </div>
      {t.tudo_feito && (
        <Caixa cor="var(--good)" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <Icone nome="check" cor="var(--good)" /> <span style={{ flex: 1 }}>Tudo feito no checklist. Concluir?</span>
          <Botao pequeno cheio cor="var(--good)" onClick={() => mudar('feita')}>concluir</Botao>
        </Caixa>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {t.status === 'aberta' ? (
          <>
            {!t.tudo_feito && <Botao pequeno cor="var(--good)" onClick={() => mudar('feita')}>concluir</Botao>}
            <Botao pequeno cor="var(--ink-dim)" onClick={() => mudar('arquivada')}>deixar de lado</Botao>
          </>
        ) : (
          <>
            <Botao pequeno onClick={() => mudar('aberta')}>reabrir</Botao>
            <Botao pequeno cor="var(--ink-dim)" onClick={() => ocultar.mutate({ id: t.id, oculta: !t.oculta }, { onError: (e) => avisar(mensagemDeErro(e), true) })}>
              {t.oculta ? 'mostrar na lista' : 'ocultar'}
            </Botao>
          </>
        )}
      </div>
    </div>
  )
}

/** A sugestão como um post-it colado na tarefa: próximo passo, como (até 3 passos) e por que agora. */
function SugestaoDaPauta({ t, avisar }: { t: Tarefa; avisar: Avisar }) {
  const sugerir = useSugerir()
  const resolver = useResolverSugestao()
  if (t.status !== 'aberta') return null
  const s = t.sugestao
  const pedir = () =>
    sugerir.mutate(t.id, {
      onSuccess: (r) => !r.nova && avisar('Nada mudou na tarefa: é a mesma sugestão.'),
      onError: (e) => avisar(mensagemDeErro(e), true),
    })
  if (!s) {
    return (
      <div>
        <Botao onClick={pedir} desligado={sugerir.isPending} titulo="O próximo passo e como fazer, em poucas linhas">
          <Icone nome="lampada" escala={1.5} /> {sugerir.isPending ? 'pensando…' : 'sugestão da Pauta'}
        </Botao>
      </div>
    )
  }
  return <PostIt s={s} pensando={sugerir.isPending} aoRefazer={pedir} aoResolver={(aceitar) => resolver.mutate({ id: s.id, aceitar }, { onError: (e) => avisar(mensagemDeErro(e), true) })} />
}

function PostIt({ s, pensando, aoRefazer, aoResolver }: { s: Sugestao; pensando: boolean; aoRefazer: () => void; aoResolver: (aceitar: boolean) => void }) {
  return (
    <div style={{ background: '#b8860b', clipPath: degraus(2), padding: 2, maxWidth: 520, boxShadow: '4px 4px 0 #0b0c10', transform: 'rotate(-0.6deg)' }}>
      <div style={{ background: PAPEL, color: TINTA_PAPEL, clipPath: degraus(2), padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icone nome="lampada" cor="#d97706" escala={2} />
          <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.75 }}>próximo passo</span>
          {s.atual === false && <span style={{ fontSize: 12, color: '#b91c1c' }}>desatualizada</span>}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{s.proximo_passo}</div>
        {s.como.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.4 }}>
            {s.como.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        )}
        {s.por_que && <div style={{ fontSize: 13, opacity: 0.8 }}>{s.por_que}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Botao pequeno cheio cor={TINTA_PAPEL} tinta={PAPEL} onClick={() => aoResolver(true)}>pôr no checklist</Botao>
          <Botao pequeno cor={TINTA_PAPEL} onClick={() => aoResolver(false)}>descartar</Botao>
          {s.atual === false && <Botao pequeno cor={TINTA_PAPEL} onClick={aoRefazer} desligado={pensando}>{pensando ? 'pensando…' : 'sugerir de novo'}</Botao>}
        </div>
      </div>
    </div>
  )
}

function Checklist({ t, avisar }: { t: Tarefa; avisar: Avisar }) {
  const marcar = useMarcarItem()
  const remover = useRemoverItem()
  const adicionar = useAdicionarItem()
  const [novo, setNovo] = useState('')
  const erro = (e: unknown) => avisar(mensagemDeErro(e), true)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Rotulo>Checklist</Rotulo>
      {t.checklist.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Nenhum item ainda.</div>}
      {t.checklist.map((i) => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
          <Marcar feito={i.feito} rotulo={i.texto} onChange={(v) => marcar.mutate({ id: i.id, feito: v }, { onError: erro })} />
          <span style={{ flex: 1, textDecoration: i.feito ? 'line-through' : undefined, color: i.feito ? 'var(--ink-faint)' : 'var(--ink)' }}>{i.texto}</span>
          {i.origem === 'agente' && <span title="a Pauta acrescentou" style={{ fontSize: 11, color: 'var(--pauta)' }}>pauta</span>}
          <button type="button" aria-label={`remover ${i.texto}`} onClick={() => remover.mutate(i.id, { onError: erro })}
            style={{ background: 'none', border: 0, color: 'var(--ink-faint)', cursor: 'pointer', fontFamily: FONTE, fontSize: 14 }}>x</button>
        </div>
      ))}
      <form onSubmit={(e) => (e.preventDefault(), novo.trim() && adicionar.mutate({ tarefaId: t.id, texto: novo }, { onSuccess: () => setNovo(''), onError: erro }))}
        style={{ display: 'flex', gap: 8 }}>
        <input aria-label="novo item" value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={200} placeholder="Novo item…" style={CAMPO} />
        <Botao type="submit" pequeno desligado={!novo.trim()}>+ item</Botao>
      </form>
    </div>
  )
}

function OQueJaSeSabe({ t, avisar }: { t: Tarefa; avisar: Avisar }) {
  const atualizar = useAtualizarContexto()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Rotulo>O que já se sabe</Rotulo>
        <Botao pequeno cor="var(--ink-dim)" desligado={atualizar.isPending}
          onClick={() => atualizar.mutate(t.id, { onError: (e) => avisar(mensagemDeErro(e), true) })}
          titulo="Junta os textos novos desta tarefa ao que já se sabe">
          {atualizar.isPending ? 'atualizando…' : 'atualizar'}
        </Botao>
      </div>
      {t.contexto.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Ainda nada. Anote aqui o que for descobrindo (endpoints, decisões, nomes).</div>
      ) : (
        t.contexto.map((c) => (
          <div key={c.id} title={`saiu de ${c.fontes.length} texto${c.fontes.length > 1 ? 's' : ''}`} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.35 }}>
            <span aria-hidden style={{ width: 6, height: 6, background: 'var(--pauta)', marginTop: 6, flexShrink: 0 }} />
            <span>{c.texto}</span>
          </div>
        ))
      )}
    </div>
  )
}
