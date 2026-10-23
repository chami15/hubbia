import { mensagemDeErro } from '../../api/client'
import { useGerarRelatorio, useRelatorioFinanceiro } from '../../hooks/useFinanceiro'
import { AVISO_ERRO, BOTAO_PRINCIPAL, CARTAO, CORPO, ROTULO } from './estilos'

// A narrativa do mês — a única coisa do painel do Cifra que gasta token.
// Abrir a tela só LÊ o que já existe (consulta barata); gerar é sempre
// um clique explícito, como o relatório da Vita (RNF01).

export function RelatorioMensal({ mes }: { mes: string }) {
  const { data: relatorio, isLoading, error } = useRelatorioFinanceiro(mes)
  const gerar = useGerarRelatorio(mes)

  if (isLoading) return <div style={CORPO}>carregando…</div>

  return (
    <div style={CORPO}>
      {error && <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>}

      {relatorio ? (
        <>
          <div style={CARTAO}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7 }}>{relatorio.analise.resumo_textual}</p>
          </div>

          <Lista titulo="padrões identificados" itens={relatorio.analise.padroes_identificados} />
          <Lista titulo="recomendações" itens={relatorio.analise.recomendacoes} />

          {/* o relatório congela o dashboard do momento em que foi
              gerado — dizer isso evita a leitura de que os números
              acompanham novos lançamentos */}
          <div style={{ color: '#8d8779', fontSize: 10.5, lineHeight: 1.6 }}>
            gerar de novo substitui este relatório pelos números de agora
          </div>
        </>
      ) : (
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
          Nenhum relatório gerado pra este mês. Ele lê os lançamentos já
          importados e escreve a análise.
        </div>
      )}

      {gerar.isError && <div style={AVISO_ERRO}>{mensagemDeErro(gerar.error)}</div>}

      <button style={BOTAO_PRINCIPAL} onClick={() => gerar.mutate()} disabled={gerar.isPending}>
        {gerar.isPending ? 'analisando o mês…' : relatorio ? 'gerar de novo' : 'gerar relatório'}
      </button>
    </div>
  )
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null
  return (
    <div>
      <div style={ROTULO}>{titulo}</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
