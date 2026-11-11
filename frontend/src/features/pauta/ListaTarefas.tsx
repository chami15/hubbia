// Nível 2: as tarefas de uma frente, uma frase cada, com prazo e progresso em blocos. Feitas e deixadas de lado podem
// ser ocultadas (pedido do chefe); "exibir ocultas" traz de volta, esmaecidas.
import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useCriarTarefa, useOcultar, useTarefas } from '../../hooks/usePauta'
import type { Frente, TarefaResumo } from '../../types/pauta'
import type { Avisar } from './PainelPauta'
import { blocos, nomeDaFrente, prazoEmPalavras } from './logica'
import { Barra, Botao, Caixa, Icone, Rotulo } from './pixel'
import { CAMPO, FONTE, iconeDaFrente } from './estilos'

const COR_PRAZO = { vencido: 'var(--danger)', perto: 'var(--pauta)', normal: 'var(--ink-dim)' } as const

export function ListaTarefas({ frente, aoAbrir, avisar }: { frente: Frente; aoAbrir: (id: number) => void; avisar: Avisar }) {
  const [ocultas, setOcultas] = useState(false)
  const { data: tarefas, isLoading } = useTarefas(frente.id, ocultas)
  const [titulo, setTitulo] = useState('')
  const criar = useCriarTarefa()

  function nova() {
    if (!titulo.trim()) return
    criar.mutate({ frente_id: frente.id, titulo }, { onSuccess: () => setTitulo(''), onError: (e) => avisar(mensagemDeErro(e), true) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icone nome={iconeDaFrente(frente.nome)} escala={3} />
        <span style={{ fontSize: 20, fontWeight: 700 }}>{nomeDaFrente(frente.nome)}</span>
      </div>

      <form onSubmit={(e) => (e.preventDefault(), nova())} style={{ display: 'flex', gap: 8 }}>
        <input aria-label="nova tarefa" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Nova tarefa, em uma frase…" style={CAMPO} />
        <Botao type="submit" desligado={!titulo.trim() || criar.isPending}>criar</Botao>
      </form>

      {isLoading && <Rotulo>carregando…</Rotulo>}
      {tarefas?.length === 0 && <div style={{ fontSize: 14, color: 'var(--ink-dim)' }}>Nenhuma tarefa aqui. Despeje um texto ou crie uma acima.</div>}
      {tarefas?.map((t) => <LinhaTarefa key={t.id} t={t} aoAbrir={() => aoAbrir(t.id)} avisar={avisar} />)}

      <div>
        <Botao pequeno cor="var(--ink-dim)" onClick={() => setOcultas((v) => !v)}>
          <Icone nome="olho" cor="var(--ink-dim)" escala={1.5} /> {ocultas ? 'esconder as ocultas' : 'exibir tarefas ocultas'}
        </Botao>
      </div>
    </div>
  )
}

function LinhaTarefa({ t, aoAbrir, avisar }: { t: TarefaResumo; aoAbrir: () => void; avisar: Avisar }) {
  const ocultar = useOcultar()
  const prazo = t.status === 'aberta' ? prazoEmPalavras(t.prazo, new Date()) : null
  const terminada = t.status !== 'aberta'
  return (
    <Caixa esmaecida={t.oculta} cor={prazo?.tom === 'vencido' ? 'var(--danger)' : undefined} onClick={aoAbrir} titulo={`abrir ${t.titulo}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, textDecoration: t.status === 'feita' ? 'line-through' : undefined, color: terminada ? 'var(--ink-dim)' : 'var(--ink)' }}>
        {t.titulo}
      </span>
      {t.tudo_feito && <span style={{ fontSize: 12, color: 'var(--good)' }}>tudo feito</span>}
      {t.status === 'arquivada' && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>deixada de lado</span>}
      {prazo && <span style={{ fontSize: 12, color: COR_PRAZO[prazo.tom], whiteSpace: 'nowrap' }}>{prazo.texto}</span>}
      {t.itens_total > 0 && <Barra acesos={blocos(t.itens_feitos, t.itens_total)} cor={terminada ? 'var(--ink-faint)' : 'var(--pauta)'} />}
      {terminada && (
        <span onClick={(e) => e.stopPropagation()}>
          <Botao
            pequeno
            cor="var(--ink-dim)"
            titulo={t.oculta ? 'voltar para a lista' : 'sumir da lista principal'}
            onClick={() => ocultar.mutate({ id: t.id, oculta: !t.oculta }, { onError: (e) => avisar(mensagemDeErro(e), true) })}
          >
            <span style={{ fontFamily: FONTE }}>{t.oculta ? 'mostrar' : 'ocultar'}</span>
          </Botao>
        </span>
      )}
    </Caixa>
  )
}
