import { mensagemDeErro } from '../../api/client'
import {
  useAceitarCard,
  useCardAtivo,
  useFinalizarCard,
  useGerarCard,
  useRejeitarCard,
} from '../../hooks/useNorte'
import type { Card, TipoCard } from '../../types/norte'
import { AVISO_ERRO, BOTAO, BOTAO_PRINCIPAL, CARTAO, ROTULO } from './estilos'

// UM card por vez, nunca uma lista de sugestões acumuladas — é a decisão
// que separa este agente de um gerenciador de tarefas comum. A pergunta
// que ele responde é "qual o próximo passo?", e uma lista de dez
// próximos passos não responde isso.
//
// Rejeitar e finalizar já trazem o próximo card na mesma resposta, então
// não existe botão de "gerar próximo": o card simplesmente troca. Só o
// PRIMEIRO card de um projeto novo precisa de um pedido explícito, porque
// não há card anterior pra encadear.

const COR_TIPO: Record<TipoCard, string> = {
  feature: '#4ade80',
  bug: '#f0b7ab',
  refatoracao: '#dbb15f',
  proximo_passo: '#7dd3fc',
}

const ROTULO_TIPO: Record<TipoCard, string> = {
  feature: 'feature',
  bug: 'bug',
  refatoracao: 'refatoração',
  proximo_passo: 'próximo passo',
}

export function CardAtivo({ projetoId }: { projetoId: number }) {
  const { data: card, isLoading, error } = useCardAtivo(projetoId)
  const gerar = useGerarCard(projetoId)
  const aceitar = useAceitarCard(projetoId)
  const rejeitar = useRejeitarCard(projetoId)
  const finalizar = useFinalizarCard(projetoId)

  const ocupado = gerar.isPending || aceitar.isPending || rejeitar.isPending || finalizar.isPending
  const erroAcao = gerar.error ?? aceitar.error ?? rejeitar.error ?? finalizar.error
  // o encadeamento pode falhar sem desfazer a resolução — quando isso
  // acontece o backend manda um aviso, e esconder isso deixaria a tela
  // sem card nenhum e sem explicação
  const aviso = rejeitar.data?.aviso ?? finalizar.data?.aviso ?? null

  if (isLoading) return <div style={{ color: '#8d8779', fontSize: 12 }}>carregando card…</div>
  if (error) return <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>

  if (!card) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
          Nenhum card em aberto neste projeto. Peça uma sugestão — o Norte lê
          o repositório e propõe um próximo passo concreto.
        </div>
        {aviso && <div style={AVISO_ERRO}>{aviso}</div>}
        {erroAcao && <div style={AVISO_ERRO}>{mensagemDeErro(erroAcao)}</div>}
        <button style={BOTAO_PRINCIPAL} onClick={() => gerar.mutate()} disabled={ocupado}>
          {gerar.isPending ? 'lendo o repositório…' : 'gerar sugestão'}
        </button>
      </div>
    )
  }

  const sugerido = card.status === 'sugerido'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...CARTAO, borderColor: sugerido ? 'rgba(255,255,255,0.14)' : 'rgba(74,222,128,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...ROTULO, marginBottom: 0, color: COR_TIPO[card.tipo] }}>
            {ROTULO_TIPO[card.tipo]}
          </span>
          {card.origem === 'manual' && (
            <span style={{ ...ROTULO, marginBottom: 0 }}>· criado por você</span>
          )}
          {!sugerido && (
            <span style={{ ...ROTULO, marginBottom: 0, color: '#4ade80' }}>· aceito</span>
          )}
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.4, marginBottom: 8 }}>{card.titulo}</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: '#c4bdae' }}>{card.descricao}</p>

        <div style={{ ...ROTULO, marginTop: 12 }}>arquivos afetados</div>
        <ul
          style={{
            margin: '4px 0 0',
            paddingLeft: 16,
            fontSize: 11.5,
            lineHeight: 1.7,
            color: '#a89f8c',
            // caminho longo quebra em vez de esticar o painel
            overflowWrap: 'anywhere',
          }}
        >
          {card.arquivos_afetados.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      {aviso && <div style={AVISO_ERRO}>{aviso}</div>}
      {erroAcao && <div style={AVISO_ERRO}>{mensagemDeErro(erroAcao)}</div>}

      {/* os botões mudam com o status: sugerido é uma decisão (aceito ou
          não), aceito já é trabalho em andamento (só falta terminar) */}
      {sugerido ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ ...BOTAO_PRINCIPAL, flex: 1 }}
            onClick={() => aceitar.mutate(card.id)}
            disabled={ocupado}
          >
            {aceitar.isPending ? 'aceitando…' : 'aceitar'}
          </button>
          <button style={{ ...BOTAO, flex: 1 }} onClick={() => rejeitar.mutate(card.id)} disabled={ocupado}>
            {rejeitar.isPending ? 'buscando outra…' : 'rejeitar'}
          </button>
        </div>
      ) : (
        <button style={BOTAO_PRINCIPAL} onClick={() => finalizar.mutate(card.id)} disabled={ocupado}>
          {finalizar.isPending ? 'finalizando…' : 'marcar como feito'}
        </button>
      )}

      {sugerido && (
        <div style={{ color: '#8d8779', fontSize: 10.5, lineHeight: 1.5 }}>
          rejeitar já traz outra sugestão no lugar
        </div>
      )}
    </div>
  )
}

export function EtiquetaTipo({ card }: { card: Card }) {
  return (
    <span style={{ ...ROTULO, marginBottom: 0, color: COR_TIPO[card.tipo] }}>
      {ROTULO_TIPO[card.tipo]}
    </span>
  )
}
