import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useSalvarPerfil } from '../../hooks/useSaude'
import type { Objetivo, PerfilSaude, Sexo } from '../../types/saude'
import { AVISO_ERRO, BOTAO, BOTAO_PRINCIPAL, CAMPO, CORPO, OPCAO, ROTULO } from './estilos'

// A entrevista inicial (RF13) e a edição do perfil são o MESMO formulário
// — os campos são idênticos e o endpoint é um upsert. O que muda é o
// enquadramento: sem perfil, esta tela bloqueia o resto do painel e se
// apresenta como apresentação; com perfil, é só mais uma ação do menu.

const OBJETIVOS: { valor: Objetivo; rotulo: string }[] = [
  { valor: 'emagrecer', rotulo: 'emagrecer' },
  { valor: 'ganhar_massa', rotulo: 'ganhar massa' },
  { valor: 'manter_peso', rotulo: 'manter o peso' },
  { valor: 'saude_geral', rotulo: 'saúde geral' },
]

interface Props {
  perfil: PerfilSaude | null
  aoSalvar: () => void
  aoCancelar?: () => void
}

export function FormPerfil({ perfil, aoSalvar, aoCancelar }: Props) {
  const salvar = useSalvarPerfil()
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [sexo, setSexo] = useState<Sexo>(perfil?.sexo ?? 'M')
  const [nascimento, setNascimento] = useState(perfil?.data_nascimento?.slice(0, 10) ?? '')
  const [altura, setAltura] = useState<number | ''>(perfil?.altura_cm ?? '')
  const [objetivo, setObjetivo] = useState<Objetivo>(perfil?.objetivo ?? 'saude_geral')
  const [diabetes, setDiabetes] = useState(perfil?.tem_diabetes ?? false)
  const [restricoes, setRestricoes] = useState(perfil?.restricoes_alimentares ?? '')
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const primeiraVez = perfil === null

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    // valida antes de mandar: o backend recusaria (422), mas dizer aqui
    // é mais rápido e mais claro que traduzir o erro de volta
    if (!nome.trim()) return setErroLocal('preencha o nome')
    if (!nascimento) return setErroLocal('preencha a data de nascimento')
    if (typeof altura !== 'number' || altura <= 0 || altura >= 300) {
      return setErroLocal('altura tem que ser um número em centímetros (ex: 178)')
    }
    setErroLocal(null)
    salvar.mutate(
      {
        nome: nome.trim(),
        sexo,
        data_nascimento: nascimento,
        altura_cm: altura,
        objetivo,
        tem_diabetes: diabetes,
        restricoes_alimentares: restricoes.trim() || null,
      },
      { onSuccess: aoSalvar },
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      {primeiraVez && (
        <div style={{ color: '#a89f8c', fontSize: 12, lineHeight: 1.7 }}>
          Antes de começar, preciso te conhecer. Isso calibra as estimativas de
          refeição, o plano de dieta e o relatório — sem isso, nada disso faz
          sentido.
        </div>
      )}

      <div>
        <div style={ROTULO}>nome</div>
        <input
          style={CAMPO}
          aria-label="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={80}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={ROTULO}>sexo</div>
          <select style={CAMPO} aria-label="sexo" value={sexo} onChange={(e) => setSexo(e.target.value as Sexo)}>
            <option value="M" style={OPCAO}>
              masculino
            </option>
            <option value="F" style={OPCAO}>
              feminino
            </option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={ROTULO}>nascimento</div>
          <input
            style={CAMPO}
            aria-label="data de nascimento"
            type="date"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={ROTULO}>altura (cm)</div>
          <input
            style={CAMPO}
            aria-label="altura em centímetros"
            type="number"
            value={altura}
            onChange={(e) => setAltura(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="178"
          />
        </div>
      </div>

      <div>
        <div style={ROTULO}>objetivo</div>
        <select style={CAMPO} aria-label="objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value as Objetivo)}>
          {OBJETIVOS.map((o) => (
            <option key={o.valor} value={o.valor} style={OPCAO}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={diabetes} onChange={(e) => setDiabetes(e.target.checked)} />
        tenho diabetes
      </label>

      <div>
        <div style={ROTULO}>restrições alimentares (opcional)</div>
        <input
          style={CAMPO}
          value={restricoes}
          onChange={(e) => setRestricoes(e.target.value)}
          placeholder="lactose, glúten, vegetariano…"
          maxLength={200}
        />
      </div>

      {(erroLocal || salvar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(salvar.error)}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ ...BOTAO_PRINCIPAL, flex: 1 }} disabled={salvar.isPending}>
          {salvar.isPending ? 'salvando…' : primeiraVez ? 'começar' : 'salvar'}
        </button>
        {aoCancelar && (
          <button type="button" style={BOTAO} onClick={aoCancelar}>
            cancelar
          </button>
        )}
      </div>
    </form>
  )
}
