// Painel da Pauta (secretário pessoal), em pixel art. Três níveis dentro do próprio painel, com "voltar" (decidido no
// desenho: nem dropdown, que vira sopa com checklist aberto, nem tela nova, que esconderia o prédio):
//   frentes -> tarefas da frente -> a tarefa (checklist, o que já se sabe, sugestão)  + a revisão "clarear a vista".
// O campo de despejar fica sempre no topo, e a pergunta da vez numa linha logo abaixo.
// Só três botões gastam LLM, todos com "processando" (RNF07): organizar agora, sugestão da Pauta e clarear a vista
// (mais o "atualizar" do contexto). Nada dispara sozinho ao abrir (RNF01).
import { useEffect, useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useContagemTextos, useFalhas, useFrentes, useOrganizar, usePergunta, useRegistrarTexto, useResponder, useTentarDeNovo } from '../../hooks/usePauta'
import { Frentes } from './Frentes'
import { ListaTarefas } from './ListaTarefas'
import { DetalheTarefa } from './DetalheTarefa'
import { RevisaoGeral } from './RevisaoGeral'
import { nomeDaFrente, resumoDaRodada, voltar, type Nivel } from './logica'
import { Botao, Icone } from './pixel'
import { CAMPO, COR, FONTE, PAPEL, TINTA_PAPEL, degraus } from './estilos'
import './pauta.css'

export type Avisar = (texto: string, erro?: boolean) => void

export function PainelPauta() {
  const [nivel, setNivel] = useState<Nivel>({ tipo: 'frentes' })
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null)
  const avisar: Avisar = (texto, erro = false) => setAviso({ texto, erro })
  // o aviso some sozinho: sem isso o "guardado" de antes parece resposta da próxima ação. Erro fica mais tempo.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), aviso.erro ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [aviso])
  const { data: frentes } = useFrentes()

  const frenteAtual = nivel.tipo === 'frente' || nivel.tipo === 'tarefa' ? frentes?.find((f) => f.id === nivel.frenteId) : undefined

  return (
    <div className="pauta-painel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONTE, color: 'var(--ink)' }}>
      <Despejo tarefaId={nivel.tipo === 'tarefa' ? nivel.tarefaId : undefined} avisar={avisar} />
      <Fila avisar={avisar} />
      <PerguntaDaVez avisar={avisar} />

      {aviso && (
        <div role="status" style={{ fontSize: 13, color: aviso.erro ? 'var(--danger)' : 'var(--good)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="fechar aviso" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontFamily: FONTE }}>x</button>
        </div>
      )}

      {nivel.tipo !== 'frentes' && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-dim)' }}>
          <Botao pequeno onClick={() => setNivel(voltar(nivel))} titulo="voltar">
            <Icone nome="voltar" escala={1.5} /> voltar
          </Botao>
          <span>
            {nivel.tipo === 'revisao' ? 'Clarear a vista' : frenteAtual ? nomeDaFrente(frenteAtual.nome) : ''}
            {nivel.tipo === 'tarefa' && ' › tarefa'}
          </span>
        </nav>
      )}

      {nivel.tipo === 'frentes' && <Frentes aoAbrir={(frenteId) => setNivel({ tipo: 'frente', frenteId })} aoClarear={() => setNivel({ tipo: 'revisao' })} />}
      {nivel.tipo === 'frente' && frenteAtual && (
        <ListaTarefas frente={frenteAtual} aoAbrir={(tarefaId) => setNivel({ tipo: 'tarefa', frenteId: nivel.frenteId, tarefaId })} avisar={avisar} />
      )}
      {nivel.tipo === 'tarefa' && <DetalheTarefa tarefaId={nivel.tarefaId} avisar={avisar} />}
      {nivel.tipo === 'revisao' && (
        <RevisaoGeral
          avisar={avisar}
          aoAbrirTarefa={(tarefaId, frenteNome) => {
            const f = frentes?.find((x) => x.nome === frenteNome)
            if (f) setNivel({ tipo: 'tarefa', frenteId: f.id, tarefaId })
          }}
        />
      )}
    </div>
  )
}

/** O campo de despejar: qualquer tamanho, guardado na hora como foi escrito (sem LLM). Dentro de uma tarefa, entra nela. */
function Despejo({ tarefaId, avisar }: { tarefaId?: number; avisar: Avisar }) {
  const [texto, setTexto] = useState('')
  const registrar = useRegistrarTexto()
  function guardar() {
    if (!texto.trim()) return
    registrar.mutate(
      { texto, tarefaId },
      {
        onSuccess: () => {
          setTexto('')
          avisar(tarefaId ? 'Anotado nesta tarefa.' : 'Guardado. A Pauta organiza no próximo tick ou no "organizar agora".')
        },
        onError: (e) => avisar(mensagemDeErro(e), true),
      },
    )
  }
  return (
    <div style={{ background: COR, clipPath: degraus(2), padding: 2 }}>
      <div style={{ background: 'var(--deck)', clipPath: degraus(2), padding: 8, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Icone nome="postit" escala={2.5} />
        <textarea
          aria-label={tarefaId ? 'anotar nesta tarefa' : 'despejar um texto'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar()
          }}
          placeholder={tarefaId ? 'Anotar nesta tarefa…' : 'Despeje aqui: um lembrete, um contexto, tanto faz o tamanho…'}
          rows={texto.length > 120 ? 5 : 2}
          maxLength={20000}
          style={{ ...CAMPO, resize: 'vertical', flex: 1, lineHeight: 1.35 }}
        />
        <Botao cheio onClick={guardar} desligado={!texto.trim() || registrar.isPending} titulo="Ctrl+Enter também guarda">
          {registrar.isPending ? 'guardando…' : 'guardar'}
        </Botao>
      </div>
    </div>
  )
}

/** Quantos textos esperam, o botão de organizar agora e os que falharam (só voltam se o chefe pedir). */
function Fila({ avisar }: { avisar: Avisar }) {
  const { data: contagem } = useContagemTextos()
  const organizar = useOrganizar()
  const [verFalhas, setVerFalhas] = useState(false)
  const novas = contagem?.novas ?? 0
  const falhas = contagem?.falhas ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-dim)', flexWrap: 'wrap' }}>
        <span>{novas === 0 ? 'Nada esperando organização.' : `${novas} texto${novas > 1 ? 's' : ''} esperando organização.`}</span>
        <Botao
          pequeno
          onClick={() =>
            organizar.mutate(undefined, {
              onSuccess: (r) => avisar(resumoDaRodada(r)),
              onError: (e) => avisar(mensagemDeErro(e), true),
            })
          }
          desligado={organizar.isPending}
          titulo="Organiza os textos novos e atualiza o que já se sabe das tarefas"
        >
          {organizar.isPending ? 'organizando…' : 'organizar agora'}
        </Botao>
        {falhas > 0 && (
          <button type="button" onClick={() => setVerFalhas((v) => !v)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--danger)', fontFamily: FONTE, fontSize: 13, textDecoration: 'underline' }}>
            {falhas} com erro
          </button>
        )}
      </div>
      {verFalhas && <Falhas avisar={avisar} />}
    </div>
  )
}

function Falhas({ avisar }: { avisar: Avisar }) {
  const { data } = useFalhas()
  const tentar = useTentarDeNovo()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data?.map((f) => (
        <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, borderLeft: '2px solid var(--danger)', paddingLeft: 8 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.erro}>
            {f.texto}
          </span>
          <Botao pequeno cor="var(--danger)" onClick={() => tentar.mutate(f.id, { onError: (e) => avisar(mensagemDeErro(e), true) })}>
            tentar de novo
          </Botao>
        </div>
      ))}
    </div>
  )
}

/** A pergunta da vez, numa linha de post-it (pedido do chefe: uma por vez, nada de texto grande). */
function PerguntaDaVez({ avisar }: { avisar: Avisar }) {
  const { data: p } = usePergunta()
  const responder = useResponder()
  if (!p) return null
  return (
    <div style={{ background: CONTORNO_POSTIT, clipPath: degraus(2), padding: 2 }}>
      <div style={{ background: PAPEL, color: TINTA_PAPEL, clipPath: degraus(2), padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <Icone nome="pergunta" cor="#c2410c" escala={2} />
          <span style={{ flex: 1 }} title={p.texto_original}>{p.texto}</span>
          {p.na_fila > 0 && <span style={{ fontSize: 12, opacity: 0.7 }}>+{p.na_fila}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.opcoes.map((o) => (
            <Botao
              key={o.indice}
              pequeno
              cor={TINTA_PAPEL}
              desligado={responder.isPending}
              onClick={() => responder.mutate({ id: p.id, opcao: o.indice }, { onError: (e) => avisar(mensagemDeErro(e), true) })}
            >
              {o.rotulo}
            </Botao>
          ))}
        </div>
      </div>
    </div>
  )
}

const CONTORNO_POSTIT = '#b8860b'
