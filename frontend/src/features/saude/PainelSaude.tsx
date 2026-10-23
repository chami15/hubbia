import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useDashboard, usePerfil, useRegistrarHidratacao, useRegistrarPeso } from '../../hooks/useSaude'
import { Contador } from '../agentes/Barras'
import { EsqueletoPainel } from '../agentes/EsqueletoPainel'
import { AVISO_ERRO, BOTAO, CAMPO, CORPO, ROTULO } from './estilos'
import { FichaTreino } from './FichaTreino'
import { FormPerfil } from './FormPerfil'
import { FormRefeicao } from './FormRefeicao'
import { FormAtividade, FormSono } from './FormsRegistro'
import { PlanoDieta, RelatorioSemanal } from './GeradosPorIA'

// O painel da Vita: menu de ações + forms determinísticos, sem chat.
//
// Enquanto o perfil não existir, a entrevista inicial BLOQUEIA o resto
// (RF13) — e isso não é rigor à toa: estimativa de refeição, plano de
// dieta e relatório usam o perfil como contexto, então sem ele o backend
// recusaria com um erro que não explicaria nada.

type Vista = 'menu' | 'refeicao' | 'atividade' | 'sono' | 'ficha' | 'dieta' | 'relatorio' | 'perfil'

const ACOES: { vista: Vista; rotulo: string; nota?: string }[] = [
  { vista: 'refeicao', rotulo: 'registrar refeição', nota: 'foto ou texto' },
  { vista: 'atividade', rotulo: 'registrar atividade' },
  { vista: 'sono', rotulo: 'registrar sono' },
  { vista: 'ficha', rotulo: 'ficha de treino' },
  { vista: 'dieta', rotulo: 'plano de dieta', nota: 'gera sob demanda' },
  { vista: 'relatorio', rotulo: 'relatório semanal', nota: 'gera sob demanda' },
  { vista: 'perfil', rotulo: 'editar perfil' },
]

const TITULOS: Record<Vista, string> = {
  menu: '',
  refeicao: 'registrar refeição',
  atividade: 'registrar atividade',
  sono: 'registrar sono',
  ficha: 'ficha de treino',
  dieta: 'plano de dieta',
  relatorio: 'relatório semanal',
  perfil: 'editar perfil',
}

export function PainelSaude() {
  const { data: perfil, isLoading, error } = usePerfil()
  const [vista, setVista] = useState<Vista>('menu')

  if (isLoading) return <EsqueletoPainel />

  if (error) {
    return (
      <div style={CORPO}>
        <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>
      </div>
    )
  }

  // sem perfil: a entrevista toma a tela inteira, sem menu nem voltar
  if (!perfil) {
    return <FormPerfil perfil={null} aoSalvar={() => setVista('menu')} />
  }

  if (vista === 'menu') return <Menu perfil={perfil.nome} aoEscolher={setVista} />

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px 0',
        }}
      >
        <button style={{ ...BOTAO, fontSize: 11, padding: '4px 10px' }} onClick={() => setVista('menu')}>
          ← voltar
        </button>
        <span style={{ fontSize: 12.5, color: '#e6e1d6' }}>{TITULOS[vista]}</span>
      </div>

      {vista === 'refeicao' && <FormRefeicao />}
      {vista === 'atividade' && <FormAtividade />}
      {vista === 'sono' && <FormSono />}
      {vista === 'ficha' && <FichaTreino />}
      {vista === 'dieta' && <PlanoDieta />}
      {vista === 'relatorio' && <RelatorioSemanal />}
      {vista === 'perfil' && (
        <FormPerfil perfil={perfil} aoSalvar={() => setVista('menu')} aoCancelar={() => setVista('menu')} />
      )}
    </>
  )
}

function Menu({ perfil, aoEscolher }: { perfil: string; aoEscolher: (v: Vista) => void }) {
  const { data: painel } = useDashboard()

  return (
    <div style={CORPO}>
      <div style={{ fontSize: 12.5, color: '#a89f8c' }}>Oi, {perfil}.</div>

      {/* KPIs ao vivo — consulta agregada, sem LLM, então pode carregar
          ao abrir sem ferir o RNF01. Ticker de fichas, mesma linguagem
          do Cifra — número dá o pulinho de Contador quando muda. */}
      {painel && (
        <div style={{ display: 'flex', border: '1px solid var(--deck-line)', borderRadius: 'var(--radius-deck)', overflow: 'hidden', flexWrap: 'wrap' }}>
          <Kpi rotulo="peso" valor={painel.peso_atual ?? 0} formatar={(v) => (painel.peso_atual === null ? '—' : v.toFixed(1))} sufixo={painel.peso_atual === null ? '' : 'kg'} />
          <Kpi rotulo="hoje" valor={painel.refeicoes_hoje.calorias} formatar={(v) => `${Math.round(v)}`} sufixo="kcal" destaque />
          <Kpi rotulo="água hoje" valor={painel.hidratacao_hoje_ml / 1000} formatar={(v) => v.toFixed(1)} sufixo="L" />
          <Kpi rotulo="atividades" valor={painel.atividades_na_semana} formatar={(v) => `${v}`} sufixo="na semana" />
        </div>
      )}

      <AtalhosRapidos />

      <div style={ROTULO}>o que você quer registrar</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {ACOES.map((a) => (
          <button
            key={a.vista}
            style={{ ...BOTAO, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3 }}
            onClick={() => aoEscolher(a.vista)}
          >
            <span>{a.rotulo}</span>
            {a.nota && <span style={{ fontSize: 10, color: '#8d8779' }}>{a.nota}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

// Peso e hidratação são de campo único e alta frequência — passar pelo
// menu inteiro pra digitar um número seria atrito puro. Ficam aqui em
// cima, sempre à mão.
//
// O peso NUNCA vem pré-preenchido com o último valor (decisão explícita):
// peso oscila, e um campo já preenchido convida a confirmar sem pesar.
function AtalhosRapidos() {
  const [peso, setPeso] = useState('')
  const [agua, setAgua] = useState('')
  const registrarPeso = useRegistrarPeso()
  const registrarAgua = useRegistrarHidratacao()

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <form
        style={{ flex: 1, display: 'flex', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault()
          const v = Number(peso)
          if (!v || v <= 0) return
          registrarPeso.mutate(v, { onSuccess: () => setPeso('') })
        }}
      >
        <input
          style={{ ...CAMPO, flex: 1 }}
          type="number"
          step="0.1"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          placeholder="peso kg"
          aria-label="registrar peso"
        />
        <button style={BOTAO} type="submit" disabled={registrarPeso.isPending || !peso}>
          ok
        </button>
      </form>

      <form
        style={{ flex: 1, display: 'flex', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault()
          const v = Number(agua)
          if (!v || v <= 0) return
          registrarAgua.mutate(v, { onSuccess: () => setAgua('') })
        }}
      >
        <input
          style={{ ...CAMPO, flex: 1 }}
          type="number"
          value={agua}
          onChange={(e) => setAgua(e.target.value)}
          placeholder="água ml"
          aria-label="registrar hidratação"
        />
        <button style={BOTAO} type="submit" disabled={registrarAgua.isPending || !agua}>
          ok
        </button>
      </form>
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  formatar,
  sufixo = '',
  destaque = false,
}: {
  rotulo: string
  valor: number
  formatar: (v: number) => string
  sufixo?: string
  destaque?: boolean
}) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: 'var(--deck-2)', padding: '10px 14px', borderRight: '1px solid var(--deck-line)' }}>
      <div style={{ ...ROTULO, marginBottom: 4 }}>{rotulo}</div>
      <div style={{ fontSize: destaque ? 19 : 15, color: destaque ? '#f97316' : '#e6e1d6' }}>
        <Contador valor={valor} formatar={formatar} />
        {sufixo && <span style={{ fontSize: 10.5, color: '#8d8779', marginLeft: 3 }}>{sufixo}</span>}
      </div>
    </div>
  )
}
