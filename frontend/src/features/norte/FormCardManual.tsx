import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useCriarCardManual } from '../../hooks/useNorte'
import type { TipoCard } from '../../types/norte'
import { AVISO_ERRO, BOTAO, BOTAO_PRINCIPAL, CAMPO, CORPO, OPCAO, ROTULO } from './estilos'

// Card de `origem: manual` — você mesmo decide o próximo passo, sem
// esperar sugestão do agente. Vale a MESMA regra de 1 card não-terminado
// por projeto (o banco tem índice único garantindo isso), então o
// backend recusa com 409 se já houver um em aberto.
//
// `arquivos_afetados` é obrigatório aqui como é no card do agente: é o
// que impede o card de virar "melhorar o botão" sem dizer onde.

const TIPOS: { valor: TipoCard; rotulo: string }[] = [
  { valor: 'proximo_passo', rotulo: 'próximo passo' },
  { valor: 'feature', rotulo: 'feature' },
  { valor: 'bug', rotulo: 'bug' },
  { valor: 'refatoracao', rotulo: 'refatoração' },
]

interface Props {
  projetoId: number
  aoCriar: () => void
  aoCancelar: () => void
}

export function FormCardManual({ projetoId, aoCriar, aoCancelar }: Props) {
  const criar = useCriarCardManual(projetoId)
  const [tipo, setTipo] = useState<TipoCard>('proximo_passo')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivos, setArquivos] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    const lista = arquivos
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean)
    if (!titulo.trim()) return setErroLocal('dê um título')
    if (!descricao.trim()) return setErroLocal('descreva o que precisa ser feito')
    if (lista.length === 0) return setErroLocal('liste pelo menos um arquivo afetado')
    setErroLocal(null)
    criar.mutate(
      { tipo, titulo: titulo.trim(), descricao: descricao.trim(), arquivos_afetados: lista },
      { onSuccess: aoCriar },
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      <div>
        <div style={ROTULO}>tipo</div>
        <select style={CAMPO} aria-label="tipo do card" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCard)}>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor} style={OPCAO}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div style={ROTULO}>título</div>
        <input
          style={CAMPO}
          aria-label="título do card"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={120}
          autoFocus
        />
      </div>

      <div>
        <div style={ROTULO}>descrição</div>
        <textarea
          style={{ ...CAMPO, minHeight: 80, resize: 'vertical' }}
          aria-label="descrição do card"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      <div>
        <div style={ROTULO}>arquivos afetados — um por linha</div>
        <textarea
          style={{ ...CAMPO, minHeight: 70, resize: 'vertical' }}
          aria-label="arquivos afetados"
          value={arquivos}
          onChange={(e) => setArquivos(e.target.value)}
          placeholder={'src/features/algo/Componente.tsx\nsrc/api/algo.ts'}
        />
      </div>

      {(erroLocal || criar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(criar.error)}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ ...BOTAO_PRINCIPAL, flex: 1 }} disabled={criar.isPending}>
          {criar.isPending ? 'criando…' : 'criar card'}
        </button>
        <button type="button" style={BOTAO} onClick={aoCancelar}>
          cancelar
        </button>
      </div>
    </form>
  )
}
