import { useState } from 'react'
import { useCriarEventoMundo, useEventosMundo } from '../../hooks/useEventosMundo'
import { useOrcamentoDoDia, useTickAtual } from '../../hooks/useTick'
import { mensagemDeErro } from '../../api/client'
import { BarraCapsula, Contador } from '../agentes/Barras'
import { definirSomAtivo, somAtivo } from './som'
import type { ResultadoAvancoMundo } from '../../hooks/useMundo'
import type { InteracaoAgente } from '../../types/interacao'

// Painel de configurações do módulo de interação — reúne o que antes
// eram DOIS cartões flutuantes (relógio + eventos do mundo): tick
// atual/hora simulada, orçamento, o toggle de dry_run, e o pool de
// eventos do mundo. Abre pela LATERAL ESQUERDA (decisão do chefe) —
// mensagens abre pela direita, e as duas em lados opostos evita que
// pareçam "a mesma janela reaparecendo".
//
// NÃO tem botão de avançar tick aqui dentro — esse é o ícone fixo do
// rodapé (Escritorio.tsx), que funciona mesmo com este painel fechado.
// Este painel só EXIBE o resultado do último avanço (`ultimoResultado`,
// que o pai já calculou) e deixa o chefe ligar/desligar o modo simulado.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'
const COR_TRABALHO = '#dbb15f'
const COR_SOCIAL = '#7fb8de'
const COR_NEUTRA = '#8d8779'
const COR_SIMULADO = '#dbb15f'

const BACKDROP: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(10, 12, 16, 0.55)',
  zIndex: 55,
}

// Superfície de trabalho, não instrumento flutuante — chapa opaca e
// cantos retos, igual ao resto da casa (docs/frontend-design.md).
const PAINEL: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 'min(40vw, 420px)',
  fontFamily: MONO,
  color: '#e6e1d6',
  background: 'var(--deck)',
  borderRight: '1px solid var(--deck-line)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 60,
}

const CABECALHO: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  background: 'var(--deck-2)',
  borderBottom: '1px solid var(--deck-line)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 12,
  color: '#8d8779',
}

const BOTAO_FECHAR: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e6e1d6',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
}

const SECAO: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--deck-line)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const ROTULO: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#8d8779',
}

const LINHA: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
}

const BOTAO: React.CSSProperties = {
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 6,
  color: '#e6e1d6',
  font: 'inherit',
  fontWeight: 600,
  fontSize: 11,
  padding: '6px 8px',
  cursor: 'pointer',
}

const VERDE: React.CSSProperties = { ...BOTAO, flex: 1, background: 'rgba(74,222,128,0.2)', border: '1px solid rgba(74,222,128,0.5)' }

const CAMPO: React.CSSProperties = {
  width: '100%',
  background: '#0a0b0e',
  border: '1px solid var(--deck-line)',
  borderRadius: 4,
  color: '#e6e1d6',
  font: 'inherit',
  fontSize: 11,
  padding: '5px 6px',
  colorScheme: 'dark',
}

const ERRO: React.CSSProperties = { color: '#f0b7ab', fontSize: 11, lineHeight: 1.5 }

const AVISO_SIMULADO: React.CSSProperties = {
  fontSize: 10.5,
  color: COR_SIMULADO,
  border: `1px solid ${COR_SIMULADO}55`,
  background: `${COR_SIMULADO}14`,
  borderRadius: 6,
  padding: '5px 8px',
}

// Interruptor liga/desliga — não é um checkbox (que sugere "marcar uma
// opção"), é um TOGGLE de modo, e a forma de pílula com bolinha é a
// linguagem universal pra "isto muda um comportamento até eu desligar".
function Interruptor({ ligado, onChange }: { ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={ligado}
      onClick={() => onChange(!ligado)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: ligado ? 'rgba(219,177,95,0.7)' : 'rgba(255,255,255,0.14)',
        // halo quando ligado — "modo simulado" precisa ser óbvio de
        // relance, não só uma bolinha que mudou de lado
        boxShadow: ligado ? '0 0 10px 2px rgba(219,177,95,0.45)' : 'none',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: ligado ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s',
        }}
      />
    </button>
  )
}

function formatarHoraSimulada(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// USD porque é orçamento de custo de LLM, não dinheiro do chefe (isso é
// o Cifra, e usa BRL) — moedas diferentes representando coisas
// diferentes, não é inconsistência
function formatarUsd(valor: number): string {
  return valor.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

interface Props {
  aoFechar: () => void
  dryRunAtivo: boolean
  aoAlternarDryRun: (ativo: boolean) => void
  ultimoResultado: ResultadoAvancoMundo | null
}

export function PainelConfiguracoes({ aoFechar, dryRunAtivo, aoAlternarDryRun, ultimoResultado }: Props) {
  const { data: tick, error: erroTick } = useTickAtual()
  const { data: orcamento } = useOrcamentoDoDia()
  // lazy init: lê do localStorage uma vez, na montagem (mesmo padrão do
  // dry_run em Escritorio.tsx) — quem TOCA o som lê `somAtivo()` direto
  // na hora (Escritorio.tsx), este estado é só o desenho do interruptor
  const [somLigado, setSomLigado] = useState(somAtivo)

  // Enquanto o modo simulado está ligado E já existe uma prévia, ela
  // SUBSTITUI a leitura real na tela — é o "tudo volta a como era antes"
  // quando o chefe desliga: some a prévia, volta a mostrar o que veio
  // de GET /tick/atual (que nunca foi tocado, porque dry_run não grava).
  const mostrandoSimulado = dryRunAtivo && ultimoResultado?.tick.dry_run
  const numero = mostrandoSimulado ? ultimoResultado!.tick.numero : tick?.numero
  const horaSimulada = mostrandoSimulado ? ultimoResultado!.tick.hora_simulada : tick?.hora_simulada
  const orcamentoDisponivel = mostrandoSimulado ? ultimoResultado!.tick.orcamento_disponivel_hoje : orcamento?.disponivel_hoje
  const parado = !mostrandoSimulado && (!tick || tick.numero === 0)

  return (
    <>
      <div onClick={aoFechar} style={BACKDROP} />
      <div style={PAINEL}>
        <header style={CABECALHO}>
          <span>configurações</span>
          <button style={BOTAO_FECHAR} onClick={aoFechar} aria-label="fechar configurações">
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={SECAO}>
            <div style={LINHA}>
              <div style={ROTULO}>relógio simulado</div>
              <div style={{ color: '#8d8779' }}>
                {parado ? '—' : <>tick <Contador valor={numero!} formatar={(v) => `${v}`} /></>}
              </div>
            </div>

            {erroTick ? (
              <div style={ERRO}>{mensagemDeErro(erroTick)}</div>
            ) : (
              <div style={{ fontSize: 13 }}>{parado ? 'nunca avançou' : formatarHoraSimulada(horaSimulada!)}</div>
            )}

            {orcamentoDisponivel !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LINHA}>
                  <span style={{ color: '#8d8779' }}>orçamento disponível hoje</span>
                  <Contador valor={orcamentoDisponivel} formatar={formatarUsd} />
                </div>
                {/* só dá pra desenhar a barra em modo real — a prévia
                    simulada só traz o disponível, não o total do dia */}
                {!mostrandoSimulado && orcamento && (
                  <BarraCapsula
                    pct={(orcamento.gasto_hoje / (orcamento.gasto_hoje + orcamento.disponivel_hoje)) * 100 || 0}
                    cor="var(--accent)"
                  />
                )}
              </div>
            )}

            {mostrandoSimulado && (
              <div style={AVISO_SIMULADO}>
                simulado — nada disto foi gravado. Desligue o modo simulado pra ver o estado real de novo.
              </div>
            )}
          </div>

          <div style={SECAO}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5 }}>modo simulado (dry_run)</div>
                <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 2, maxWidth: 260 }}>
                  o ícone de avançar passa a só conferir — nada é gasto nem gravado
                </div>
              </div>
              <Interruptor ligado={dryRunAtivo} onChange={aoAlternarDryRun} />
            </div>
          </div>

          <div style={SECAO}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5 }}>som de notificações</div>
                <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 2, maxWidth: 260 }}>
                  um tom sutil quando um agente faz algo por conta própria num avanço
                </div>
              </div>
              <Interruptor
                ligado={somLigado}
                onChange={(v) => {
                  setSomLigado(v)
                  definirSomAtivo(v)
                }}
              />
            </div>
          </div>

          {ultimoResultado && (
            <div style={SECAO}>
              <div style={ROTULO}>
                {ultimoResultado.tick.dry_run ? 'conferido no último clique' : 'aconteceu no último avanço'}
              </div>
              {ultimoResultado.avisoRodada && <div style={ERRO}>{ultimoResultado.avisoRodada}</div>}
              {ultimoResultado.rodada?.aviso && <div style={ERRO}>{ultimoResultado.rodada.aviso}</div>}
              {ultimoResultado.rodada && ultimoResultado.rodada.interacoes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ultimoResultado.rodada.interacoes.map((entrada) => (
                    <LinhaInteracao key={entrada.agente_id} entrada={entrada} dryRun={ultimoResultado.rodada!.dry_run} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={SECAO}>
            <EventosMundo />
          </div>
        </div>
      </div>
    </>
  )
}

function LinhaInteracao({ entrada, dryRun }: { entrada: InteracaoAgente; dryRun: boolean }) {
  const cor = entrada.tipo === 'trabalho' ? COR_TRABALHO : entrada.tipo === 'social' ? COR_SOCIAL : COR_NEUTRA

  return (
    <div style={{ borderLeft: `2px solid ${cor}`, paddingLeft: 8 }}>
      <div style={{ color: cor, fontSize: 10.5 }}>
        {entrada.agente_nome}
        {dryRun && (entrada.tipo || entrada.chance_falar !== null) ? ' · conferido' : ''}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.5, color: '#e6e1d6' }}>{textoDaLinha(entrada)}</div>
      {entrada.aviso && <div style={{ ...ERRO, marginTop: 2 }}>{entrada.aviso}</div>}
    </div>
  )
}

// O texto muda de forma conforme o que a entrada TEM: dry_run nunca gera
// `mensagem` (só decide tipo/destinatário), então "conferido" e "de
// verdade" precisam de frases diferentes mesmo pro mesmo tipo — dizer
// "avisou o chefe" sobre algo que não foi executado seria mentira.
function textoDaLinha(entrada: InteracaoAgente): string {
  if (entrada.tipo === 'trabalho') {
    return entrada.mensagem ? `avisou o chefe: "${entrada.mensagem}"` : `dispararia trabalho — ${entrada.motivo}`
  }
  if (entrada.tipo === 'social') {
    if (entrada.mensagem) return `→ ${entrada.destinatario_nome}: "${entrada.mensagem}"`
    if (entrada.destinatario_nome) return `falaria com ${entrada.destinatario_nome}`
    return 'quis falar, mas sem destinatário disponível'
  }
  return entrada.chance_falar !== null
    ? `sem ação (rolou ${Math.round(entrada.chance_falar * 100)}% de chance de puxar papo e não puxou)`
    : 'sem ação neste tick'
}

const DESCRICAO_MAX = 200

function EventosMundo() {
  const { data: eventos, isLoading, error } = useEventosMundo()
  const criar = useCriarEventoMundo()
  const [descricao, setDescricao] = useState('')

  function adicionar(e: React.FormEvent) {
    e.preventDefault()
    const texto = descricao.trim()
    if (!texto) return
    criar.mutate(texto, { onSuccess: () => setDescricao('') })
  }

  return (
    <>
      <div style={ROTULO}>eventos do mundo — pool ({eventos?.length ?? 0})</div>

      {isLoading && <div style={{ color: '#8d8779', fontSize: 11 }}>carregando…</div>}
      {error && <div style={ERRO}>{mensagemDeErro(error)}</div>}

      {eventos && eventos.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          {eventos.map((ev, i) => (
            <li
              key={ev.id}
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                color: '#e6e1d6',
                animation: 'consoleListaEntra .35s ease both',
                animationDelay: `${Math.min(i, 12) * 0.03}s`,
              }}
              title={ev.descricao}
            >
              {/* nunca usado ainda é a informação que decide a prioridade
                  do sorteio (ver sql/eventos_mundo.sql), então vale mostrar */}
              {(ev.ultimo_uso_tick ?? null) === null && <span style={{ color: '#4ade80' }}>· </span>}
              {ev.descricao}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={adicionar} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          style={CAMPO}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="ex: previsão de chuva forte pra hoje"
          maxLength={DESCRICAO_MAX}
        />
        {criar.isError && <div style={ERRO}>{mensagemDeErro(criar.error)}</div>}
        <button type="submit" style={VERDE} disabled={criar.isPending || !descricao.trim()}>
          {criar.isPending ? 'adicionando…' : '+ adicionar evento'}
        </button>
      </form>
    </>
  )
}
