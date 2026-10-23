import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useDashboardFinanceiro } from '../../hooks/useFinanceiro'
import { Contador } from '../agentes/Barras'
import { EsqueletoPainel } from '../agentes/EsqueletoPainel'
import type { DashboardFinanceiro } from '../../types/financeiro'
import { AVISO_ERRO, BOTAO, CAMPO, CARTAO, CORPO, ROTULO } from './estilos'
import { BarrasCategoria, ColunasDiarias, moeda } from './graficos'
import { RelatorioMensal } from './RelatorioMensal'
import { UploadExtrato } from './UploadExtrato'

// O painel do Cifra: dashboard, sem chat.
//
// O seletor de mês fica numa faixa ÚNICA no topo, valendo pro painel
// inteiro — nunca um filtro dentro de cada gráfico, que faria dois
// gráficos lado a lado poderem estar mostrando meses diferentes.

type Vista = 'painel' | 'extrato' | 'relatorio'

function mesAtual(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

export function PainelFinanceiro() {
  const [mes, setMes] = useState(mesAtual())
  const [vista, setVista] = useState<Vista>('painel')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 0' }}>
        {vista !== 'painel' && (
          <button style={{ ...BOTAO, fontSize: 11, padding: '4px 10px' }} onClick={() => setVista('painel')}>
            ← voltar
          </button>
        )}
        <input
          style={{ ...CAMPO, width: 130 }}
          aria-label="mês"
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
        />
        {vista === 'painel' && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button style={{ ...BOTAO, fontSize: 11 }} onClick={() => setVista('extrato')}>
              importar extrato
            </button>
            <button style={{ ...BOTAO, fontSize: 11 }} onClick={() => setVista('relatorio')}>
              relatório
            </button>
          </div>
        )}
      </div>

      {vista === 'extrato' && <UploadExtrato mes={mes} />}
      {vista === 'relatorio' && <RelatorioMensal mes={mes} />}
      {vista === 'painel' && <Dashboard mes={mes} />}
    </>
  )
}

function Dashboard({ mes }: { mes: string }) {
  const { data, isLoading, error } = useDashboardFinanceiro(mes)

  if (isLoading) return <EsqueletoPainel />
  if (error) {
    return (
      <div style={CORPO}>
        <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>
      </div>
    )
  }
  if (!data) return null

  const vazio = data.kpis.gasto_mensal === 0 && data.kpis.ganho_mensal === 0

  return (
    <div style={CORPO}>
      {vazio && (
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
          Nenhum lançamento neste mês. Importe um extrato pra começar.
        </div>
      )}

      <Kpis kpis={data.kpis} />

      {/* terminal financeiro, não dashboard de SaaS: os dois gráficos
          lado a lado quando cabe (painel "largo"), cada um na própria
          chapa — RNF já não era sobre isso, é só o "console" chegando
          aqui também (docs/frontend-design.md) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...CARTAO, flex: '1 1 260px' }}>
          <BarrasCategoria dados={data.graficos.gastos_por_categoria} />
        </div>
        <div style={{ ...CARTAO, flex: '1 1 260px' }}>
          <ColunasDiarias dados={data.graficos.evolucao_diaria} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...CARTAO, flex: '1 1 260px' }}>
          <MaioresGastos gastos={data.maiores_gastos} />
        </div>
        <div style={{ ...CARTAO, flex: '1 1 260px' }}>
          <Recorrencias itens={data.recorrencias_detectadas} />
        </div>
      </div>
    </div>
  )
}

function Kpis({ kpis }: { kpis: DashboardFinanceiro['kpis'] }) {
  // `saldo_ultimo_extrato` fica de fora: o backend ainda não extrai
  // saldo de fechamento (TODO declarado no resolver), então ele é sempre
  // null. Um KPI permanentemente vazio é ruído — melhor não existir até
  // o dado existir.
  return (
    <div style={{ display: 'flex', border: '1px solid var(--deck-line)', borderRadius: 'var(--radius-deck)', overflow: 'hidden' }}>
      <Kpi rotulo="gasto no mês" valor={kpis.gasto_mensal} destaque />
      <Kpi rotulo="entrou" valor={kpis.ganho_mensal} />
      <Kpi rotulo="previsto pro mês que vem" valor={kpis.gasto_previsto_proximo_mes} />
    </div>
  )
}

// Ticker de KPI — cada um é uma "ficha" própria (fundo alternado,
// separadas por hairline), não um número solto flutuando no ar.
function Kpi({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div style={{ flex: 1, background: 'var(--deck-2)', padding: '12px 14px', borderRight: '1px solid var(--deck-line)' }}>
      <div style={{ ...ROTULO, marginBottom: 5 }}>{rotulo}</div>
      <div style={{ fontSize: destaque ? 22 : 15, color: destaque ? '#4ade80' : '#e6e1d6', lineHeight: 1.2 }}>
        <Contador valor={valor} formatar={moeda} />
      </div>
    </div>
  )
}

function MaioresGastos({ gastos }: { gastos: DashboardFinanceiro['maiores_gastos'] }) {
  if (gastos.length === 0) {
    return <div style={{ color: '#6f6a5f', fontSize: 11.5 }}>nenhum gasto neste mês ainda</div>
  }
  return (
    <div>
      <div style={ROTULO}>maiores gastos</div>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {gastos.map((g, i) => (
          <li
            key={`${g.data}-${g.descricao}-${i}`}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              fontSize: 12,
              paddingBottom: 6,
              borderBottom: i < gastos.length - 1 ? '1px solid var(--deck-line)' : 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descricao}</div>
              <div style={{ ...ROTULO, marginBottom: 0, marginTop: 2 }}>
                {g.categoria} · {new Date(g.data).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <span style={{ color: '#a89f8c', fontVariantNumeric: 'tabular-nums' }}>{moeda(g.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Recorrencias({ itens }: { itens: DashboardFinanceiro['recorrencias_detectadas'] }) {
  if (itens.length === 0) {
    return <div style={{ color: '#6f6a5f', fontSize: 11.5 }}>nenhuma recorrência detectada ainda</div>
  }
  return (
    <div>
      <div style={ROTULO}>recorrências detectadas</div>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((r, i) => (
          <li
            key={`${r.descricao}-${i}`}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              fontSize: 12,
              paddingBottom: 6,
              borderBottom: i < itens.length - 1 ? '1px solid var(--deck-line)' : 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descricao}</div>
              <div style={{ ...ROTULO, marginBottom: 0, marginTop: 2 }}>
                {r.tipo === 'parcela' && r.parcela_atual && r.parcela_total
                  ? `parcela ${r.parcela_atual}/${r.parcela_total}`
                  : 'assinatura'}
                {/* o que NÃO projeta pro mês que vem precisa se
                    diferenciar: é a parcela que está acabando, e ela sai
                    da conta do previsto */}
                {!r.projeta_proximo_mes && ' · última'}
              </div>
            </div>
            <span style={{ color: '#a89f8c', fontVariantNumeric: 'tabular-nums' }}>{moeda(r.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
