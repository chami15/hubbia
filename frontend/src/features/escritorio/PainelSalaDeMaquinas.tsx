import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useObservabilidade, useSaudeInfra } from '../../hooks/useInfra'
import { formatarMs, GraficoAtividade, GraficoLatencia } from './graficos-infra'
import type { Dependencia, Execucao, ItemSaude, StatusInfra } from '../../types/infra'

// A sala de máquinas — o painel de monitoramento do escritório.
//
// Os quatro sinais clássicos de observabilidade, medidos em cima de
// `tick_execucoes`: latência, tráfego, erros e saturação. A saturação
// aqui é o ORÇAMENTO, não CPU nem memória — num hub cujo gargalo real é
// dinheiro de LLM, "quanto do teto já foi" é a medida honesta de quão
// perto o sistema está de parar.
//
// Nada aqui gasta LLM: os dois endpoints são leitura determinística, o
// que deixa o painel carregar ao abrir sem ferir o RNF01. É o mesmo
// motivo de o Motriz poder rodar em todo tick.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'

const BACKDROP: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(10, 12, 16, 0.6)',
  zIndex: 55,
}

// Largo, e não a faixa estreita dos outros painéis de sistema: é o
// conteúdo mais denso do app (gráficos + tabela de log), e a regra de
// largura do projeto já diz que dashboard não cabe em faixa estreita.
//
// Abre pela DIREITA, diferente de configurações e mensagens — e isso é
// consequência da largura, não gosto: o cluster de ícones do canto
// inferior esquerdo tem três botões e fica em zIndex 65 (acima dos
// painéis, de propósito, pra continuar clicável). Num painel estreito
// ele só cobria o rodapé; num painel largo passa por cima do conteúdo
// no meio da rolagem. À direita só existe UM ícone (avançar tick), e é
// o mesmo lado por onde os painéis "largos" de agente já abrem.
const PAINEL: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: 'min(72vw, 1060px)',
  fontFamily: MONO,
  color: 'var(--ink)',
  background: 'var(--deck)',
  borderLeft: '1px solid var(--deck-line)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 60,
}

const CABECALHO: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 18px',
  background: 'var(--deck-2)',
  borderBottom: '1px solid var(--deck-line)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-dim)',
}

const CARTAO: React.CSSProperties = {
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 'var(--radius-deck)',
  padding: 14,
}

const ROTULO: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-dim)',
}

// 'nao_configurado' é cinza de propósito, não vermelho: o Norte sem
// token do GitHub num hub que não usa o Norte é uma escolha, não um
// defeito. Pintar os dois de vermelho ensinaria a ignorar o vermelho.
const COR_STATUS: Record<StatusInfra, string> = {
  ok: 'var(--good)',
  atencao: 'var(--official)',
  quebrado: 'var(--danger)',
  nao_configurado: 'var(--ink-faint)',
}

const ROTULO_STATUS: Record<StatusInfra, string> = {
  ok: 'de pé',
  atencao: 'atenção',
  quebrado: 'quebrado',
  nao_configurado: 'não configurado',
}

const JANELAS = [6, 24, 72] as const

function haQuantoTempo(iso: string | null): string {
  if (!iso) return 'nunca'
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  return `há ${Math.floor(horas / 24)}d`
}

interface Props {
  aoFechar: () => void
}

export function PainelSalaDeMaquinas({ aoFechar }: Props) {
  const [horas, setHoras] = useState<number>(24)
  const { data: saude, error: erroSaude } = useSaudeInfra()
  const { data: obs, isLoading, error: erroObs } = useObservabilidade(horas)

  const corGeral = saude ? COR_STATUS[saude.status_geral] : 'var(--ink-faint)'

  return (
    <>
      <div onClick={aoFechar} style={BACKDROP} />
      <div style={PAINEL}>
        <header style={CABECALHO}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: corGeral,
              boxShadow: `0 0 9px 2px ${corGeral}`,
              flexShrink: 0,
            }}
          />
          <span>sala de máquinas</span>
          {saude && (
            <span style={{ color: corGeral, letterSpacing: '0.06em' }}>
              · {ROTULO_STATUS[saude.status_geral]}
            </span>
          )}

          {/* filtro de janela: uma linha só, acima de tudo que ele filtra */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {JANELAS.map((h) => (
              <button
                key={h}
                onClick={() => setHoras(h)}
                style={{
                  background: h === horas ? 'var(--deck)' : 'transparent',
                  border: `1px solid ${h === horas ? 'var(--deck-line)' : 'transparent'}`,
                  borderRadius: 5,
                  color: h === horas ? 'var(--ink)' : 'var(--ink-dim)',
                  font: 'inherit',
                  fontSize: 10.5,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                {h}h
              </button>
            ))}
          </div>

          <button
            onClick={aoFechar}
            aria-label="fechar sala de máquinas"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink)',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </header>

        {/* o respiro no fim não é estético: o cluster de ícones do HUD
            fica em zIndex 65 — ACIMA deste painel, de propósito, pra
            continuar clicável (ver Escritorio.tsx) — e cobriria as
            últimas linhas. Com o padding, elas rolam pra cima dele. */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            paddingBottom: 180,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {(erroSaude || erroObs) && (
            <div style={{ ...CARTAO, border: '1px solid var(--danger)', color: '#f0b7ab', fontSize: 11.5, lineHeight: 1.6 }}>
              {mensagemDeErro(erroObs ?? erroSaude)}
            </div>
          )}

          {isLoading && !obs && (
            <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>lendo os instrumentos…</div>
          )}

          {obs && (
            <>
              {/* --- os quatro sinais --- */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <Sinal
                  rotulo="latência p95"
                  valor={formatarMs(obs.latencia.p95_ms)}
                  nota={
                    obs.latencia.amostras
                      ? `p50 ${formatarMs(obs.latencia.p50_ms)} · ${obs.latencia.amostras} amostras`
                      : 'sem amostra na janela'
                  }
                />
                <Sinal
                  rotulo="tráfego"
                  valor={`${obs.trafego.chamadas}`}
                  nota={`${obs.trafego.chamadas_por_hora}/h em ${obs.janela_horas}h`}
                />
                <Sinal
                  rotulo="sucesso"
                  valor={`${Math.round(obs.erros.taxa_sucesso * 100)}%`}
                  nota={obs.erros.total ? `${obs.erros.total} falha(s)` : 'nenhuma falha'}
                  cor={obs.erros.taxa_sucesso < 0.95 ? 'var(--official)' : 'var(--good)'}
                />
                <Sinal
                  rotulo="saturação"
                  valor={`${Math.round(obs.saturacao.fracao * 100)}%`}
                  nota={`US$ ${obs.saturacao.gasto_usd.toFixed(4)} de ${obs.saturacao.teto_usd.toFixed(2)}`}
                  cor={
                    obs.saturacao.fracao >= 1
                      ? 'var(--danger)'
                      : obs.saturacao.fracao >= 0.8
                        ? 'var(--official)'
                        : undefined
                  }
                />
              </div>

              {/* --- atividade ao longo do tempo --- */}
              <div style={CARTAO}>
                <div style={{ ...ROTULO, marginBottom: 12 }}>atividade · últimas {obs.janela_horas}h</div>
                <GraficoAtividade serie={obs.serie} />
              </div>

              {/* --- latência por agente + dependências --- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, alignItems: 'start' }}>
                <div style={CARTAO}>
                  <div style={{ ...ROTULO, marginBottom: 12 }}>tempo de resposta por agente</div>
                  <GraficoLatencia dados={obs.latencia_por_agente} />
                </div>

                <div style={CARTAO}>
                  <div style={{ ...ROTULO, marginBottom: 4 }}>dependências</div>
                  {/* "uptime" honesto: em vez de pingar Google/GitHub a
                      cada tick (o que faria do monitor a maior fonte de
                      rate limit do sistema), mostra quando cada uma foi
                      usada COM SUCESSO pela última vez */}
                  <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 10 }}>
                    última chamada bem-sucedida — derivado do uso real, sem pingar ninguém
                  </div>
                  {obs.dependencias.length === 0 ? (
                    <div style={{ color: 'var(--ink-faint)', fontSize: 11.5 }}>Nenhuma chamada registrada ainda.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {obs.dependencias.map((d) => (
                        <LinhaDependencia key={d.especialidade} dep={d} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* --- alertas (health checks que não estão ok) --- */}
              {saude && (
                <div style={CARTAO}>
                  <div style={{ ...ROTULO, marginBottom: 12 }}>conexões e alertas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {saude.itens.map((item, i) => (
                      <LinhaSaude key={item.nome} item={item} indice={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* --- log de execuções --- */}
              <div style={CARTAO}>
                <div style={{ ...ROTULO, marginBottom: 4 }}>log de execuções</div>
                <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 10 }}>
                  toda chamada de LLM do hub, mais recente primeiro · clique pra ver o que entrou e o que saiu
                </div>
                {obs.execucoes.length === 0 ? (
                  <div style={{ color: 'var(--ink-faint)', fontSize: 11.5 }}>
                    Nenhuma chamada registrada. O escritório não gastou nada.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '68px 1fr 92px',
                        gap: 10,
                        ...ROTULO,
                        paddingBottom: 6,
                        borderBottom: '1px solid var(--deck-line)',
                      }}
                    >
                      <span>hora</span>
                      <span>agente</span>
                      <span style={{ textAlign: 'right' }}>duração</span>
                    </div>
                    {obs.execucoes.map((e) => (
                      <LinhaExecucao key={e.id} exec={e} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Sinal({
  rotulo,
  valor,
  nota,
  cor,
}: {
  rotulo: string
  valor: string
  nota: string
  cor?: string
}) {
  return (
    <div style={CARTAO}>
      <div style={ROTULO}>{rotulo}</div>
      <div style={{ fontSize: 24, marginTop: 6, color: cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {valor}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.4 }}>{nota}</div>
    </div>
  )
}

function LinhaDependencia({ dep }: { dep: Dependencia }) {
  // erro mais recente que o último sucesso = está falhando AGORA. É a
  // única leitura que importa: um erro antigo já superado não é notícia.
  const falhandoAgora =
    dep.ultimo_erro !== null && (dep.ultimo_ok === null || dep.ultimo_erro > dep.ultimo_ok)
  const cor = falhandoAgora ? 'var(--danger)' : dep.ultimo_ok ? 'var(--good)' : 'var(--ink-faint)'

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, flex: 1 }}>{dep.agente_nome}</span>
      <span style={{ fontSize: 10.5, color: 'var(--ink-dim)' }}>
        {falhandoAgora ? 'falhando' : haQuantoTempo(dep.ultimo_ok)}
      </span>
    </div>
  )
}

function LinhaSaude({ item, indice }: { item: ItemSaude; indice: number }) {
  const cor = COR_STATUS[item.status]
  return (
    <div
      style={{
        borderLeft: `2px solid ${cor}`,
        paddingLeft: 9,
        animation: 'consoleListaEntra .35s ease both',
        animationDelay: `${Math.min(indice, 12) * 0.04}s`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12 }}>{item.nome}</span>
        <span style={{ ...ROTULO, color: cor, flexShrink: 0 }}>{ROTULO_STATUS[item.status]}</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 2 }}>{item.detalhe}</div>
      {item.acao && (
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: 3 }}>→ {item.acao}</div>
      )}
    </div>
  )
}

function LinhaExecucao({ exec }: { exec: Execucao }) {
  const [aberto, setAberto] = useState(false)
  const hora = exec.criado_em ? new Date(exec.criado_em).toLocaleTimeString('pt-BR', { hour12: false }) : '—'

  return (
    <div style={{ borderBottom: '1px solid var(--deck-line)' }}>
      <button
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '68px 1fr 92px',
          gap: 10,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '7px 0',
          font: 'inherit',
          fontSize: 11,
          color: 'var(--ink)',
          textAlign: 'left',
          cursor: 'pointer',
          alignItems: 'baseline',
        }}
      >
        <span style={{ color: 'var(--ink-dim)', fontVariantNumeric: 'tabular-nums' }}>{hora}</span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {exec.erro && <span style={{ color: 'var(--danger)' }}>✕ </span>}
          {exec.agente_nome}
          <span style={{ color: 'var(--ink-faint)' }}>
            {' · '}
            {/* tick nulo = ação que o chefe disparou, fora do relógio do
                escritório (ver migration 010) */}
            {exec.tick === null ? ' · fora de tick' : ` · tick ${exec.tick}`}
          </span>
        </span>
        <span style={{ textAlign: 'right', color: 'var(--ink-dim)', fontVariantNumeric: 'tabular-nums' }}>
          {formatarMs(exec.duracao_ms)}
        </span>
      </button>

      {aberto && (
        <div style={{ padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {exec.erro && (
            <Trecho rotulo="erro" texto={exec.erro} cor="var(--danger)" />
          )}
          {exec.contexto_prompt && <Trecho rotulo="entrou" texto={exec.contexto_prompt} />}
          {exec.saida_bruta && <Trecho rotulo="saiu" texto={exec.saida_bruta} />}
          {!exec.erro && !exec.contexto_prompt && !exec.saida_bruta && (
            <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
              Sem prompt registrado nesta execução.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Trecho({ rotulo, texto, cor }: { rotulo: string; texto: string; cor?: string }) {
  return (
    <div>
      <div style={{ ...ROTULO, marginBottom: 3 }}>{rotulo}</div>
      <pre
        style={{
          margin: 0,
          padding: 8,
          background: 'var(--void)',
          border: '1px solid var(--deck-line)',
          borderRadius: 4,
          fontSize: 10.5,
          lineHeight: 1.55,
          color: cor ?? 'var(--ink-dim)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        {texto}
      </pre>
    </div>
  )
}
