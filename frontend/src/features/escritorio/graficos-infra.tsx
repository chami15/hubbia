import { useState } from 'react'
import type { LatenciaAgente, PontoSerie } from '../../types/infra'

// Marcas de gráfico da sala de máquinas.
//
// Construídas em HTML puro (div + flex), não SVG: são barras alinhadas a
// uma linha de base, e o layout do navegador já resolve isso sem
// nenhuma conta de escala minha — que é justamente onde nascem os bugs
// de gráfico feito à mão.
//
// PALETA DE GRÁFICO ≠ PALETA DE IDENTIDADE. As cores de crachá do hub
// foram passadas pelo validador de paleta contra o fundo `--deck-2`:
// os dois azuis (Agenda #2563eb e Norte #0891b2) PASSAM em separação
// para daltonismo (ΔE 11.5 deutan) — a suspeita inicial estava errada.
// O que reprovou foi o laranja da Vita (#f97316), claro demais pra
// banda de luminosidade do fundo escuro: numa barra ele puxaria o olho
// sem merecer. `#ea580c` é o passo mais escuro da mesma matiz que passa
// em todos os seis checks, e é usado SÓ em marca de gráfico — a
// identidade da Vita no resto do app continua sendo `--vita`.
const COR_GRAFICO_AGENTE: Record<string, string> = {
  financeiro: '#16a34a',
  agenda: '#2563eb',
  saude: '#ea580c',
  norte: '#0891b2',
  infra: '#a855f7',
}

const COR_FALLBACK = '#8d8779'

function corDeAgente(especialidade: string): string {
  return COR_GRAFICO_AGENTE[especialidade] ?? COR_FALLBACK
}

export function formatarMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`
}

const ROTULO_EIXO: React.CSSProperties = {
  fontSize: 9.5,
  color: 'var(--ink-faint)',
  letterSpacing: '0.06em',
}

// ---------------------------------------------------------------------------
// Atividade por hora — colunas empilhadas (sucesso + erro)
// ---------------------------------------------------------------------------

interface AtividadeProps {
  serie: PontoSerie[]
}

export function GraficoAtividade({ serie }: AtividadeProps) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const maximo = Math.max(1, ...serie.map((p) => p.chamadas))
  const ALTURA = 110

  const ponto = ativo !== null ? serie[ativo] : null

  return (
    <div>
      {/* legenda: são DUAS séries, então identidade nunca pode depender
          só da cor (o mesmo motivo de o erro ter rótulo próprio) */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
        <ItemLegenda cor="var(--accent)" texto="concluídas" />
        <ItemLegenda cor="var(--danger)" texto="com erro" />
        <span style={{ ...ROTULO_EIXO, marginLeft: 'auto' }}>
          {ponto
            ? `${new Date(ponto.hora).getHours()}h · ${ponto.chamadas} chamada(s)${ponto.erros ? ` · ${ponto.erros} com erro` : ''}${ponto.duracao_media_ms ? ` · ${formatarMs(ponto.duracao_media_ms)} médio` : ''}`
            : `pico de ${maximo} por hora`}
        </span>
      </div>

      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: ALTURA }}
        onMouseLeave={() => setAtivo(null)}
      >
        {serie.map((p, i) => {
          const ok = p.chamadas - p.erros
          const alturaTotal = (p.chamadas / maximo) * ALTURA
          const alturaErro = p.chamadas ? (p.erros / p.chamadas) * alturaTotal : 0
          const destacado = ativo === i
          return (
            <div
              key={p.hora}
              onMouseEnter={() => setAtivo(i)}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                cursor: 'default',
                // alvo de hover maior que a marca: a coluna inteira
                // responde, não só os poucos pixels da barra
                background: destacado ? 'rgba(255,255,255,0.04)' : 'transparent',
              }}
            >
              {p.chamadas === 0 ? (
                // hora sem chamada nenhuma vira um traço na linha de
                // base, não um vazio: "não aconteceu nada" é
                // informação, e sumir mentiria sobre o formato da curva
                <div style={{ height: 2, background: 'var(--deck-line)' }} />
              ) : (
                <>
                  {p.erros > 0 && (
                    <div
                      style={{
                        height: Math.max(2, alturaErro),
                        background: 'var(--danger)',
                        borderRadius: '3px 3px 0 0',
                        // respiro entre os dois segmentos empilhados
                        marginBottom: ok > 0 ? 2 : 0,
                      }}
                    />
                  )}
                  {ok > 0 && (
                    <div
                      style={{
                        height: Math.max(2, alturaTotal - alturaErro),
                        background: 'var(--accent)',
                        opacity: destacado ? 1 : 0.85,
                        // ponta arredondada só no topo — a base fica
                        // ancorada na linha de base, reta
                        borderRadius: p.erros > 0 ? 0 : '3px 3px 0 0',
                      }}
                    />
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={ROTULO_EIXO}>{serie.length ? `${new Date(serie[0].hora).getHours()}h` : ''}</span>
        <span style={ROTULO_EIXO}>agora</span>
      </div>
    </div>
  )
}

function ItemLegenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: cor, flexShrink: 0 }} />
      {/* o texto usa cor de tinta, nunca a cor da série — quem carrega
          a identidade é a marca ao lado */}
      <span style={{ fontSize: 10.5, color: 'var(--ink-dim)' }}>{texto}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Latência por agente — barra horizontal (p95) com marca do p50
// ---------------------------------------------------------------------------

interface LatenciaProps {
  dados: LatenciaAgente[]
}

export function GraficoLatencia({ dados }: LatenciaProps) {
  if (dados.length === 0) {
    return (
      <div style={{ color: 'var(--ink-faint)', fontSize: 11.5, lineHeight: 1.6 }}>
        Nenhuma chamada com duração medida nesta janela.
      </div>
    )
  }

  const maximo = Math.max(...dados.map((d) => d.p95_ms))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* NÃO é legenda de cor: aqui a cor identifica o AGENTE, e um
          quadradinho colorido ao lado de "p50" faria o leitor procurar
          uma cor que não existe. O que precisa ser explicado é a
          GEOMETRIA — o que é o comprimento e o que é o traço. */}
      <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
        comprimento da barra = p95 (a cauda lenta) · traço vertical = p50 (o típico)
      </div>

      {dados.map((d) => {
        const cor = corDeAgente(d.especialidade)
        const larguraP95 = (d.p95_ms / maximo) * 100
        const posicaoP50 = (d.p50_ms / maximo) * 100
        return (
          <div key={d.agente_id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink)' }}>{d.agente_nome}</span>
              {/* rótulo direto: com 5 séries no máximo, o número ao lado
                  informa mais que qualquer eixo desenhado */}
              <span style={{ fontSize: 10.5, color: 'var(--ink-dim)', fontVariantNumeric: 'tabular-nums' }}>
                {formatarMs(d.p50_ms)} · <span style={{ color: 'var(--ink)' }}>{formatarMs(d.p95_ms)}</span>
              </span>
            </div>
            <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,0.045)', borderRadius: 3 }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${larguraP95}%`,
                  background: cor,
                  opacity: 0.55,
                  borderRadius: 3,
                }}
              />
              {/* o p50 é uma marca sobre a barra, não uma segunda barra:
                  são o mesmo eixo e a mesma unidade, e empilhar duas
                  barras faria parecer medidas independentes */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${posicaoP50}% - 1px)`,
                  top: -1,
                  bottom: -1,
                  width: 2,
                  background: cor,
                  // anel da cor da superfície separa a marca da barra
                  // por baixo dela
                  boxShadow: '0 0 0 2px var(--deck-2)',
                  borderRadius: 1,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
