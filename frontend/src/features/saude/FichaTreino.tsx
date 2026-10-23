import { useEffect, useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useFichaTreino, useSalvarFichaTreino } from '../../hooks/useSaude'
import { BarraSegmentada } from '../agentes/Barras'
import type { DiaFicha, DiaSemana, ExercicioFicha } from '../../types/saude'
import { AVISO_ERRO, AVISO_OK, BOTAO, BOTAO_PRINCIPAL, CAMPO, CARTAO, CORPO, OPCAO, ROTULO } from './estilos'

// A ficha inteira é substituída num PUT só — por isso a tela edita tudo
// em memória e salva de uma vez, em vez de gravar campo a campo.
//
// O ponto de atenção declarado no design: **precisa ficar óbvio que cabe
// mais de um exercício por dia** — isso confundiu num teste manual da
// API. Daí cada dia ter um botão próprio de "+ exercício" dentro do
// cartão dele, e a contagem aparecer no cabeçalho do dia.

const DIAS: { valor: DiaSemana; rotulo: string }[] = [
  { valor: 'segunda', rotulo: 'segunda' },
  { valor: 'terca', rotulo: 'terça' },
  { valor: 'quarta', rotulo: 'quarta' },
  { valor: 'quinta', rotulo: 'quinta' },
  { valor: 'sexta', rotulo: 'sexta' },
  { valor: 'sabado', rotulo: 'sábado' },
  { valor: 'domingo', rotulo: 'domingo' },
]

function exercicioVazio(): ExercicioFicha {
  return { nome_exercicio: '', series: 3, repeticoes: 12 }
}

export function FichaTreino() {
  const { data, isLoading, error } = useFichaTreino()
  const salvar = useSalvarFichaTreino()
  const [dias, setDias] = useState<DiaFicha[]>([])
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  // a ficha do servidor entra no estado local uma vez, quando chega —
  // depois disso quem manda é a edição em andamento, senão um refetch
  // apagaria o que está sendo digitado
  useEffect(() => {
    if (data) setDias(data)
  }, [data])

  if (isLoading) return <div style={CORPO}>carregando ficha…</div>
  if (error) return <div style={CORPO}><div style={AVISO_ERRO}>{mensagemDeErro(error)}</div></div>

  const usados = new Set(dias.map((d) => d.dia_semana))
  const livres = DIAS.filter((d) => !usados.has(d.valor))

  function alterarDia(indice: number, mudanca: Partial<DiaFicha>) {
    setDias((atuais) => atuais.map((d, i) => (i === indice ? { ...d, ...mudanca } : d)))
    setSalvo(false)
  }

  function alterarExercicio(iDia: number, iEx: number, mudanca: Partial<ExercicioFicha>) {
    setDias((atuais) =>
      atuais.map((d, i) =>
        i === iDia
          ? { ...d, exercicios: d.exercicios.map((ex, j) => (j === iEx ? { ...ex, ...mudanca } : ex)) }
          : d,
      ),
    )
    setSalvo(false)
  }

  function submeter() {
    // o backend recusaria série/repetição zerada (422) — dizer aqui é
    // mais claro que traduzir o erro de volta depois
    for (const d of dias) {
      if (!d.grupo_muscular.trim()) return setErroLocal(`falta o grupo muscular de ${d.dia_semana}`)
      if (d.exercicios.length === 0) return setErroLocal(`${d.dia_semana} está sem nenhum exercício`)
      for (const ex of d.exercicios) {
        if (!ex.nome_exercicio.trim()) return setErroLocal(`tem exercício sem nome em ${d.dia_semana}`)
        if (ex.series <= 0 || ex.repeticoes <= 0) {
          return setErroLocal(`séries e repetições precisam ser maiores que zero em ${d.dia_semana}`)
        }
      }
    }
    setErroLocal(null)
    salvar.mutate(dias, { onSuccess: () => setSalvo(true) })
  }

  return (
    <div style={CORPO}>
      {salvo && <div style={AVISO_OK}>ficha salva</div>}

      {/* a semana inteira num olhar — quantos dias já têm plano, antes
          de rolar pra ver cada um */}
      <div>
        <div style={{ ...ROTULO, display: 'flex', justifyContent: 'space-between' }}>
          <span>semana</span>
          <span>{dias.length} / 7 dias</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <BarraSegmentada total={7} preenchidos={dias.length} cor="var(--vita)" />
        </div>
      </div>

      {dias.length === 0 && (
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
          Sua ficha está vazia. Adicione um dia de treino abaixo — cada dia
          pode ter quantos exercícios você quiser.
        </div>
      )}

      {dias.map((dia, iDia) => (
        <div key={dia.dia_semana} style={CARTAO}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <strong style={{ color: '#f97316', fontSize: 13, textTransform: 'capitalize' }}>
              {DIAS.find((d) => d.valor === dia.dia_semana)?.rotulo}
            </strong>
            <span style={{ color: '#8d8779', fontSize: 10.5 }}>
              {dia.exercicios.length} {dia.exercicios.length === 1 ? 'exercício' : 'exercícios'}
            </span>
            <button
              style={{ ...BOTAO, marginLeft: 'auto', fontSize: 10.5, padding: '3px 8px', color: '#c97b6e' }}
              onClick={() => { setDias((a) => a.filter((_, i) => i !== iDia)); setSalvo(false) }}
            >
              remover dia
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={ROTULO}>grupo muscular</div>
            <input
              style={CAMPO}
              value={dia.grupo_muscular}
              onChange={(e) => alterarDia(iDia, { grupo_muscular: e.target.value })}
              placeholder="peito e tríceps"
            />
          </div>

          <div style={ROTULO}>exercícios</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {dia.exercicios.map((ex, iEx) => (
              <div key={iEx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...CAMPO, flex: 1 }}
                  value={ex.nome_exercicio}
                  onChange={(e) => alterarExercicio(iDia, iEx, { nome_exercicio: e.target.value })}
                  placeholder="supino reto"
                />
                <input
                  style={{ ...CAMPO, width: 62 }}
                  type="number"
                  value={ex.series}
                  onChange={(e) => alterarExercicio(iDia, iEx, { series: Number(e.target.value) })}
                  title="séries"
                />
                <span style={{ color: '#8d8779', fontSize: 11 }}>×</span>
                <input
                  style={{ ...CAMPO, width: 62 }}
                  type="number"
                  value={ex.repeticoes}
                  onChange={(e) => alterarExercicio(iDia, iEx, { repeticoes: Number(e.target.value) })}
                  title="repetições"
                />
                <button
                  style={{ ...BOTAO, padding: '5px 8px', color: '#c97b6e' }}
                  title="remover exercício"
                  onClick={() =>
                    alterarDia(iDia, { exercicios: dia.exercicios.filter((_, j) => j !== iEx) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* o botão que resolve a confusão relatada: fica DENTRO do dia,
              deixando claro que o exercício novo entra naquele dia */}
          <button
            style={{ ...BOTAO, marginTop: 8, width: '100%', fontSize: 11 }}
            onClick={() => alterarDia(iDia, { exercicios: [...dia.exercicios, exercicioVazio()] })}
          >
            + exercício em {DIAS.find((d) => d.valor === dia.dia_semana)?.rotulo}
          </button>
        </div>
      ))}

      {livres.length > 0 && (
        <div>
          <div style={ROTULO}>adicionar dia</div>
          <select
            style={CAMPO}
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              setDias((a) => [
                ...a,
                { dia_semana: e.target.value as DiaSemana, grupo_muscular: '', exercicios: [exercicioVazio()] },
              ])
              setSalvo(false)
            }}
          >
            <option value="" style={OPCAO}>
              — escolha um dia —
            </option>
            {livres.map((d) => (
              <option key={d.valor} value={d.valor} style={OPCAO}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {(erroLocal || salvar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(salvar.error)}</div>
      )}

      <button style={BOTAO_PRINCIPAL} onClick={submeter} disabled={salvar.isPending || dias.length === 0}>
        {salvar.isPending ? 'salvando…' : 'salvar ficha'}
      </button>
    </div>
  )
}
