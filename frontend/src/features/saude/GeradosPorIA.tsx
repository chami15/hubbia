import { mensagemDeErro } from '../../api/client'
import { useGerarPlanoDieta, useGerarRelatorioSemanal, usePlanoDieta, useRelatorioSemanal } from '../../hooks/useSaude'
import { AVISO_ERRO, BOTAO_PRINCIPAL, CARTAO, CORPO, ROTULO } from './estilos'

// As duas únicas ações do painel que gastam token. Nenhuma roda sozinha
// ao abrir a tela — só por botão (RNF01). O que a tela faz ao abrir é
// só LER o que já existe, que é consulta barata e sem LLM.

export function PlanoDieta() {
  const { data: plano, isLoading, error } = usePlanoDieta()
  const gerar = useGerarPlanoDieta()

  if (isLoading) return <div style={CORPO}>carregando…</div>

  return (
    <div style={CORPO}>
      {error && <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>}

      {plano ? (
        <div style={CARTAO}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
            <Numero rotulo="meta diária" valor={`${Math.round(plano.meta_calorica)}`} sufixo="kcal" destaque />
            <Numero rotulo="carboidratos" valor={`${Math.round(plano.carboidratos_g)}`} sufixo="g" />
            <Numero rotulo="proteínas" valor={`${Math.round(plano.proteinas_g)}`} sufixo="g" />
            <Numero rotulo="gorduras" valor={`${Math.round(plano.gorduras_g)}`} sufixo="g" />
          </div>
          <div style={ROTULO}>orientações</div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {plano.orientacoes}
          </p>
          <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 10 }}>
            gerado em {new Date(plano.gerado_em).toLocaleDateString('pt-BR')}
          </div>
        </div>
      ) : (
        <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
          Nenhum plano de dieta gerado ainda. O plano usa seu perfil e seu peso
          mais recente como base.
        </div>
      )}

      {gerar.isError && <div style={AVISO_ERRO}>{mensagemDeErro(gerar.error)}</div>}

      <button style={BOTAO_PRINCIPAL} onClick={() => gerar.mutate()} disabled={gerar.isPending}>
        {gerar.isPending ? 'gerando…' : plano ? 'gerar um novo plano' : 'gerar plano de dieta'}
      </button>
      {plano && (
        <div style={{ color: '#8d8779', fontSize: 10.5 }}>
          gerar um novo substitui o atual — o antigo fica no histórico
        </div>
      )}
    </div>
  )
}

export function RelatorioSemanal() {
  const { data: relatorio, isLoading, error } = useRelatorioSemanal()
  const gerar = useGerarRelatorioSemanal()

  if (isLoading) return <div style={CORPO}>carregando…</div>

  // 409 = já existe relatório desta semana. O backend checa isso ANTES de
  // chamar o modelo, então o clique repetido não gasta token — mas a tela
  // tem que dizer isso em vez de mostrar um erro seco.
  const jaGerado = relatorio !== null && relatorio !== undefined

  return (
    <div style={CORPO}>
      {error && <div style={AVISO_ERRO}>{mensagemDeErro(error)}</div>}

      {jaGerado ? (
        <>
          <div style={CARTAO}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Numero rotulo="dias com refeição" valor={`${relatorio.dias_com_refeicao_registrada}`} />
              <Numero
                rotulo="média diária"
                valor={relatorio.media_calorica_diaria === null ? '—' : `${Math.round(relatorio.media_calorica_diaria)}`}
                sufixo={relatorio.media_calorica_diaria === null ? '' : 'kcal'}
              />
              <Numero rotulo="pesagens" valor={`${relatorio.peso_registros_na_semana}`} />
              <Numero rotulo="água" valor={`${(relatorio.hidratacao_total_ml / 1000).toFixed(1)}`} sufixo="L" />
            </div>
          </div>

          <Secao titulo="resumo" texto={relatorio.analise.resumo} />
          <Secao titulo="evolução do peso" texto={relatorio.analise.evolucao_peso} />
          <Secao titulo="adesão alimentar" texto={relatorio.analise.adesao_alimentar} />
          <Secao titulo="atividade física" texto={relatorio.analise.atividade_fisica} />

          <div>
            <div style={ROTULO}>recomendações</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
              {relatorio.analise.recomendacoes.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div style={{ color: '#8d8779', fontSize: 11, lineHeight: 1.6 }}>
            O relatório desta semana já foi gerado. Só dá pra gerar outro depois
            que a semana virar.
          </div>
        </>
      ) : (
        <>
          <div style={{ color: '#8d8779', fontSize: 12, lineHeight: 1.7 }}>
            Nenhum relatório gerado pra esta semana. Ele cruza o que você
            registrou — refeições, peso, atividade, sono e água.
          </div>
          {gerar.isError && <div style={AVISO_ERRO}>{mensagemDeErro(gerar.error)}</div>}
          <button style={BOTAO_PRINCIPAL} onClick={() => gerar.mutate()} disabled={gerar.isPending}>
            {gerar.isPending ? 'gerando…' : 'gerar relatório da semana'}
          </button>
        </>
      )}
    </div>
  )
}

function Secao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <div style={ROTULO}>{titulo}</div>
      <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.65 }}>{texto}</p>
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  sufixo = '',
  destaque = false,
}: {
  rotulo: string
  valor: string
  sufixo?: string
  destaque?: boolean
}) {
  return (
    <div>
      <div style={{ ...ROTULO, marginBottom: 2 }}>{rotulo}</div>
      <div style={{ fontSize: destaque ? 19 : 15, color: destaque ? '#f97316' : '#e6e1d6' }}>
        {valor}
        {sufixo && <span style={{ fontSize: 11, color: '#8d8779', marginLeft: 2 }}>{sufixo}</span>}
      </div>
    </div>
  )
}
