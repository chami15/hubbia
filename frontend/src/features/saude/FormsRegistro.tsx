import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useRegistrarAtividade, useRegistrarSono } from '../../hooks/useSaude'
import type { QualidadeSono, TipoAtividade } from '../../types/saude'
import { AVISO_ERRO, AVISO_OK, BOTAO, BOTAO_PRINCIPAL, CAMPO, CORPO, OPCAO, ROTULO } from './estilos'

// Os dois registros determinísticos que não são atalho de campo único:
// atividade (que tem duas etapas) e sono.
//
// Nenhum dos dois passa por LLM — são escrita direta no banco. Por isso
// salvam na hora, sem confirmação: RNF04 só exige "tem certeza?" pra ação
// que mexe em sistema EXTERNO (o Google Calendar do Agenda), não pra
// registro no próprio banco.

const ATIVIDADES: { valor: TipoAtividade; rotulo: string }[] = [
  { valor: 'corrida', rotulo: 'corrida' },
  { valor: 'academia', rotulo: 'academia' },
  { valor: 'esporte', rotulo: 'esporte' },
  { valor: 'caminhada', rotulo: 'caminhada' },
  { valor: 'outro', rotulo: 'outro' },
]

export function FormAtividade() {
  // Duas etapas de verdade (RF16): escolher o tipo é uma decisão, e
  // mostrar duração junto faria a tela pedir tudo de uma vez — que é
  // exatamente o que a etapa separada evita.
  const [tipo, setTipo] = useState<TipoAtividade | null>(null)
  const [duracao, setDuracao] = useState<number | ''>('')
  const [observacao, setObservacao] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const registrar = useRegistrarAtividade()

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!tipo) return
    if (typeof duracao !== 'number' || duracao <= 0) {
      return setErroLocal('quantos minutos?')
    }
    setErroLocal(null)
    registrar.mutate(
      { tipo, duracao_min: duracao, observacao: observacao.trim() || null },
      {
        onSuccess: () => {
          setPronto(true)
          setTipo(null)
          setDuracao('')
          setObservacao('')
        },
      },
    )
  }

  if (!tipo) {
    return (
      <div style={CORPO}>
        {pronto && <div style={AVISO_OK}>atividade registrada</div>}
        <div style={ROTULO}>que tipo de atividade?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {ATIVIDADES.map((a) => (
            <button key={a.valor} style={BOTAO} onClick={() => { setTipo(a.valor); setPronto(false) }}>
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#f97316' }}>{ATIVIDADES.find((a) => a.valor === tipo)?.rotulo}</span>
        <button type="button" style={{ ...BOTAO, fontSize: 10.5, padding: '3px 8px' }} onClick={() => setTipo(null)}>
          trocar
        </button>
      </div>

      <div>
        <div style={ROTULO}>duração (minutos)</div>
        <input
          style={CAMPO}
          type="number"
          value={duracao}
          onChange={(e) => setDuracao(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="45"
          autoFocus
        />
      </div>

      <div>
        <div style={ROTULO}>observação (opcional)</div>
        <input style={CAMPO} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={200} />
      </div>

      {(erroLocal || registrar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(registrar.error)}</div>
      )}

      <button type="submit" style={BOTAO_PRINCIPAL} disabled={registrar.isPending}>
        {registrar.isPending ? 'salvando…' : 'registrar atividade'}
      </button>
    </form>
  )
}

export function FormSono() {
  const [horas, setHoras] = useState<number | ''>('')
  const [qualidade, setQualidade] = useState<QualidadeSono | ''>('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const registrar = useRegistrarSono()

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (typeof horas !== 'number' || horas < 0 || horas > 24) {
      return setErroLocal('quantas horas você dormiu? (0 a 24)')
    }
    setErroLocal(null)
    registrar.mutate(
      { horas, qualidade: qualidade || null },
      {
        onSuccess: () => {
          setPronto(true)
          setHoras('')
          setQualidade('')
        },
      },
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      {pronto && <div style={AVISO_OK}>sono registrado</div>}

      <div>
        <div style={ROTULO}>horas dormidas</div>
        <input
          style={CAMPO}
          type="number"
          step="0.5"
          value={horas}
          onChange={(e) => { setHoras(e.target.value === '' ? '' : Number(e.target.value)); setPronto(false) }}
          placeholder="7.5"
          autoFocus
        />
      </div>

      <div>
        <div style={ROTULO}>qualidade (opcional)</div>
        <select style={CAMPO} value={qualidade} onChange={(e) => setQualidade(e.target.value as QualidadeSono | '')}>
          <option value="" style={OPCAO}>
            — não dizer —
          </option>
          <option value="ruim" style={OPCAO}>
            ruim
          </option>
          <option value="regular" style={OPCAO}>
            regular
          </option>
          <option value="boa" style={OPCAO}>
            boa
          </option>
        </select>
      </div>

      {(erroLocal || registrar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(registrar.error)}</div>
      )}

      <button type="submit" style={BOTAO_PRINCIPAL} disabled={registrar.isPending}>
        {registrar.isPending ? 'salvando…' : 'registrar sono'}
      </button>
    </form>
  )
}
