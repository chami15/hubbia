// "Clarear a vista": foco (até 3), pode esperar, talvez nem valha. Abrir não gasta nada; só o botão "clarear agora".
// Só "talvez nem valha" tem ação, e só no clique: deixar de lado ou juntar com outra.
import { mensagemDeErro } from '../../api/client'
import { useClarear, useResolverItemRevisao, useRevisao } from '../../hooks/usePauta'
import type { ItemRevisao } from '../../types/pauta'
import type { Avisar } from './PainelPauta'
import { nomeDaFrente } from './logica'
import { Botao, Caixa, Icone, Rotulo, type NomeIcone } from './pixel'

const GRUPOS: { chave: 'foco' | 'pode_esperar' | 'talvez_nem_valha'; titulo: string; icone: NomeIcone; cor: string }[] = [
  { chave: 'foco', titulo: 'Foco agora', icone: 'estrela', cor: 'var(--pauta)' },
  { chave: 'pode_esperar', titulo: 'Pode esperar', icone: 'ampulheta', cor: 'var(--info)' },
  { chave: 'talvez_nem_valha', titulo: 'Talvez nem valha', icone: 'nuvem', cor: 'var(--ink-dim)' },
]

export function RevisaoGeral({ avisar, aoAbrirTarefa }: { avisar: Avisar; aoAbrirTarefa: (tarefaId: number, frente: string) => void }) {
  const { data: revisao, isLoading } = useRevisao()
  const clarear = useClarear()
  const resolver = useResolverItemRevisao()
  const resolverItem = (i: ItemRevisao, aceitar: boolean) => resolver.mutate({ id: i.id, aceitar }, { onError: (e) => avisar(mensagemDeErro(e), true) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Botao cheio desligado={clarear.isPending}
          onClick={() => clarear.mutate(undefined, { onSuccess: (r) => !r.nova && avisar('Nada mudou hoje: é a mesma revisão.'), onError: (e) => avisar(mensagemDeErro(e), true) })}>
          <Icone nome="estrela" cor="#0b0c10" escala={1.5} /> {clarear.isPending ? 'olhando tudo…' : 'clarear agora'}
        </Botao>
        {revisao && !revisao.atual && <span style={{ fontSize: 13, color: 'var(--danger)' }}>desatualizada: suas tarefas mudaram desde então</span>}
      </div>
      {isLoading && <Rotulo>carregando…</Rotulo>}
      {!isLoading && !revisao && <div style={{ fontSize: 14, color: 'var(--ink-dim)' }}>Ainda não houve revisão. "Clarear agora" olha todas as tarefas abertas.</div>}
      {revisao && GRUPOS.map((g) => (
        <div key={g.chave} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icone nome={g.icone} cor={g.cor} escala={2} />
            <Rotulo cor={g.cor}>{g.titulo}</Rotulo>
          </div>
          {revisao[g.chave].length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>nada aqui</div>}
          {revisao[g.chave].map((i) => (
            <Caixa key={i.id} cor={g.chave === 'foco' ? 'var(--pauta)' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <button type="button" onClick={() => aoAbrirTarefa(i.tarefa_id, i.frente)}
                  style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink)', fontFamily: 'inherit', fontSize: 15, cursor: 'pointer', textAlign: 'left', flex: 1 }}>
                  {i.titulo}
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{nomeDaFrente(i.frente)}</span>
              </div>
              {i.por_que && <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{i.por_que}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                {i.acao === 'arquivar' && <Botao pequeno cor="var(--ink-dim)" onClick={() => resolverItem(i, true)}>deixar de lado</Botao>}
                {i.acao === 'juntar' && <Botao pequeno onClick={() => resolverItem(i, true)}>juntar com “{i.juntar_com_titulo}”</Botao>}
                <Botao pequeno cor="var(--ink-faint)" onClick={() => resolverItem(i, false)}>dispensar</Botao>
              </div>
            </Caixa>
          ))}
        </div>
      ))}
    </div>
  )
}
