import { useState } from 'react'
import { AGENTES } from './agentes'
import { RetratoAgente, corCss } from '../agentes/RetratoAgente'
import { IconeAvancarTick, IconeConfiguracoes, IconeMensagens } from './icones'
import type { ModoParedesSims } from './moveis3d'
import type { ProjecaoSimTela } from './cena3d'
import {
  calcularCorPlumbBob,
  formatarRelogioSim,
  INFO_HUMORES,
  ROTULOS_NECESSIDADES,
  type ChaveNecessidade,
  type EstadoMundoSims,
  type VelocidadeTempo,
} from './simulacao-sims'

type AbaInspetor = 'necessidades' | 'carreira' | 'habilidades' | 'relacionamentos'

interface Props {
  mundo: EstadoMundoSims
  modo3DAtivo: boolean
  modoParedes: ModoParedesSims
  projecoes3D: Record<string, ProjecaoSimTela>
  modoConstruirAtivo: boolean
  salasAbertas: boolean
  mensagensAbertas: boolean
  configuracoesAbertas: boolean
  contagemNaoLidas: number
  dryRunAtivo: boolean
  avancandoTick: boolean
  orcamentoTexto?: string
  aoSelecionarSim: (simId: string) => void
  aoAbrirPainelAgente: (simId: string) => void
  aoMudarVelocidade: (v: VelocidadeTempo) => void
  aoAlternarAutonomia: () => void
  aoAlternarSeguirSim: () => void
  aoAlternarModo3D: () => void
  aoCiclarModoParedes: () => void
  aoGirarCamera3D: (direcao: -1 | 1) => void
  aoZoom: (fator: number) => void
  aoCentralizarCamera: () => void
  aoCancelarInteracao: (indice: number | 'atual') => void
  aoAutoResolverNecessidade: (chave: ChaveNecessidade) => void
  aoInteragirComColega: (alvoSimId: string, tipo: 'papo' | 'projeto') => void
  aoAlternarModoConstruir: () => void
  aoAlternarSalas: () => void
  aoAlternarMensagens: () => void
  aoAlternarConfiguracoes: () => void
  aoClicarAvancarTick: () => void
  aoAbrirCriadorCAS?: () => void
}

const CHAVES_NECESSIDADES: ChaveNecessidade[] = [
  'energia',
  'foco',
  'social',
  'cafeina',
  'ambiente',
  'diversao',
]

function corDaBarraNecessidade(valor: number): string {
  if (valor < 22) return '#ef4444'
  if (valor < 40) return '#f97316'
  if (valor < 58) return '#eab308'
  return '#6ec71f'
}

function PlumbBobSvg({ cor, tamanho = 16 }: { cor: string; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho * 1.35}
      viewBox="0 0 20 28"
      style={{ filter: `drop-shadow(0 0 5px ${cor}aa)`, flexShrink: 0 }}
      aria-hidden="true"
    >
      <polygon points="10,1 19,14 10,14" fill={cor} />
      <polygon points="10,1 1,14 10,14" fill={cor} opacity={0.82} />
      <polygon points="10,27 19,14 10,14" fill={cor} opacity={0.68} />
      <polygon points="10,27 1,14 10,14" fill={cor} opacity={0.52} />
      <polygon
        points="10,1 19,14 10,27 1,14"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1"
      />
    </svg>
  )
}

export function HudTheSims({
  mundo,
  modo3DAtivo,
  modoParedes,
  projecoes3D,
  modoConstruirAtivo,
  salasAbertas,
  mensagensAbertas,
  configuracoesAbertas,
  contagemNaoLidas,
  dryRunAtivo,
  avancandoTick,
  orcamentoTexto,
  aoSelecionarSim,
  aoAbrirPainelAgente,
  aoMudarVelocidade,
  aoAlternarAutonomia,
  aoAlternarSeguirSim,
  aoAlternarModo3D,
  aoCiclarModoParedes,
  aoGirarCamera3D,
  aoZoom,
  aoCentralizarCamera,
  aoCancelarInteracao,
  aoAutoResolverNecessidade,
  aoInteragirComColega,
  aoAlternarModoConstruir,
  aoAlternarSalas,
  aoAlternarMensagens,
  aoAlternarConfiguracoes,
  aoClicarAvancarTick,
  aoAbrirCriadorCAS,
}: Props) {
  const [abaAtiva, setAbaAtiva] = useState<AbaInspetor>('necessidades')
  const [inspetorAberto, setInspetorAberto] = useState(true)

  const simAtivo = mundo.sims[mundo.simAtivoId] ?? Object.values(mundo.sims)[0]
  if (!simAtivo) return null

  const listaSimsMundo = Object.values(mundo.sims)
  const agenteVisualAtivo = AGENTES.find((a) => a.id === simAtivo.id) ?? {
    id: simAtivo.id,
    nome: simAtivo.nome,
    cor: simAtivo.cor,
    arquivo: 'norte2dSemfundo.png',
    especialidade: simAtivo.especialidade,
    funcao: simAtivo.funcao,
  }
  const infoHumor = INFO_HUMORES[simAtivo.humor]
  const plumbAtivo = calcularCorPlumbBob(simAtivo.necessidades)

  const rotuloParedes =
    modoParedes === 'cortadas'
      ? '🧱 Paredes: Cortadas'
      : modoParedes === 'altas'
        ? '🏠 Paredes: Altas'
        : '📐 Paredes: Baixas'

  return (
    <>
      {/* =====================================================================
          OVERLAY DE BALÕES DE FALA / PENSAMENTO E NOMES SOBRE OS SIMS 3D
          ===================================================================== */}
      {modo3DAtivo && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 40,
            overflow: 'hidden',
          }}
        >
          {listaSimsMundo.map((s) => {
            const proj = projecoes3D[s.id]
            if (!proj || !proj.visivel) return null
            const ativo = s.id === simAtivo.id
            const hInfo = INFO_HUMORES[s.humor]
            const prog = s.interacaoAtual?.progresso ?? 0

            return (
              <div
                key={s.id}
                style={{
                  position: 'absolute',
                  left: proj.x,
                  top: proj.y,
                  transform: 'translate(-50%, -100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {/* Balão de pensamento / fala estilo The Sims 4 */}
                {s.balao && (
                  <div
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      padding: '5px 12px',
                      borderRadius: 16,
                      border: `2px solid ${s.balao.tipo === 'fala' ? '#38bdf8' : '#84cc16'}`,
                      boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.balao.icone} {s.balao.texto}
                  </div>
                )}

                {/* Etiqueta flutuante com nome, emoção e barra de progresso da ação */}
                <div
                  style={{
                    background: ativo ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.72)',
                    border: `1.5px solid ${ativo ? '#6ec71f' : corCss(s.cor)}`,
                    borderRadius: 999,
                    padding: '2px 9px',
                    color: '#f8fafc',
                    fontSize: 10.5,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                  }}
                >
                  <span>{hInfo.icone}</span>
                  <span>{s.nome}</span>
                  {s.foraDoLote && (
                    <span style={{ color: '#38bdf8', fontSize: 9.5 }}>🌳 Calçada</span>
                  )}
                  {prog > 0.02 && (
                    <span style={{ color: '#a3e635', fontSize: 9.5 }}>
                      {Math.round(prog * 100)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* =====================================================================
          TOPO DIREITO — BARRA DE MODO VIDA / CONSTRUIR, CÂMERA 3D E PAREDES
          ===================================================================== */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 66,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(16px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 14px 32px -12px rgba(0,0,0,0.65)',
          userSelect: 'none',
        }}
      >
        {/* Alternador Modo Simulação vs Modo Construir/Comprar */}
        <button
          type="button"
          onClick={aoAlternarModoConstruir}
          title="Alternar entre Modo Simulação (The Sims) e Modo Construir/Comprar (atalho: E)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            border: modoConstruirAtivo
              ? '1px solid rgba(250, 204, 21, 0.6)'
              : '1px solid rgba(110, 199, 31, 0.55)',
            background: modoConstruirAtivo
              ? 'rgba(250, 204, 21, 0.18)'
              : 'rgba(110, 199, 31, 0.2)',
            color: modoConstruirAtivo ? '#fde047' : '#a3e635',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <span>{modoConstruirAtivo ? '🔨 Modo Construir' : '💎 Modo Simulação'}</span>
        </button>

        {/* Botão Gerenciar Salas / Mundos */}
        <button
          type="button"
          onClick={aoAlternarSalas}
          title="Viajar ou Gerenciar Salas do Escritório"
          style={estiloPilulaTopo(salasAbertas)}
        >
          🏠 Salas
        </button>

        {/* Botão Estúdio Create-A-Sim (CAS 3D) */}
        {aoAbrirCriadorCAS && (
          <button
            type="button"
            onClick={aoAbrirCriadorCAS}
            title="Abrir Estúdio Create-A-Sim 3D (Criar ou Personalizar Agentes)"
            style={estiloPilulaTopo(false)}
          >
            🧬 Criar Sim
          </button>
        )}

        {/* Modo de Paredes do The Sims 4 (Cortadas / Altas / Baixas) */}
        {modo3DAtivo && (
          <button
            type="button"
            onClick={aoCiclarModoParedes}
            title="Alternar corte das paredes (Paredes Cortadas / Paredes Altas / Paredes Baixas)"
            style={estiloPilulaTopo(true)}
          >
            {rotuloParedes}
          </button>
        )}

        {/* Controles de Câmera 3D (Órbita + Zoom + Seguir Sim) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '0 4px',
            borderLeft: '1px solid rgba(255,255,255,0.12)',
            borderRight: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {modo3DAtivo && (
            <>
              <button
                type="button"
                onClick={() => aoGirarCamera3D(-1)}
                title="Girar Câmera 3D para a Esquerda (ou arraste com o botão direito do mouse)"
                style={estiloBotaoMiniTopo(false)}
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => aoGirarCamera3D(1)}
                title="Girar Câmera 3D para a Direita (ou arraste com o botão direito do mouse)"
                style={estiloBotaoMiniTopo(false)}
              >
                ↻
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => aoZoom(1 / 1.2)}
            title="Afastar Câmera (Zoom -)"
            style={estiloBotaoMiniTopo(false)}
          >
            −
          </button>
          <button
            type="button"
            onClick={aoCentralizarCamera}
            title="Centralizar Lote na Tela"
            style={estiloBotaoMiniTopo(false)}
          >
            ⌂
          </button>
          <button
            type="button"
            onClick={() => aoZoom(1.2)}
            title="Aproximar Câmera (Zoom +)"
            style={estiloBotaoMiniTopo(false)}
          >
            +
          </button>
          <button
            type="button"
            onClick={aoAlternarSeguirSim}
            title="Seguir Sim Ativo com a Câmera (FollowCamera)"
            style={estiloPilulaTopo(mundo.seguirSimAtivo)}
          >
            🎯 Seguir
          </button>
        </div>

        {/* Alternador Mundo 3D (The Sims 4) vs Maquete 2D (Habbo) */}
        <button
          type="button"
          onClick={aoAlternarModo3D}
          title="Alternar entre o Mundo 3D Real (The Sims 4) e a Maquete 2D Isométrica (Habbo)"
          style={estiloPilulaTopo(modo3DAtivo)}
        >
          {modo3DAtivo ? '🌍 Mundo 3D' : '📐 Maquete 2D'}
        </button>

        {/* Alternador de Autonomia */}
        <button
          type="button"
          onClick={aoAlternarAutonomia}
          title="Ligar/Desligar Autonomia dos Sims"
          style={estiloPilulaTopo(mundo.autonomiaAtiva)}
        >
          🤖 {mundo.autonomiaAtiva ? 'Autonomia ON' : 'Autonomia OFF'}
        </button>

        {/* Mensagens do Hubbia */}
        <button
          type="button"
          onClick={aoAlternarMensagens}
          title="Mensagens e Conversas do Chefe"
          aria-label="mensagens"
          style={{
            ...estiloBotaoMiniTopo(mensagensAbertas),
            position: 'relative',
            width: 34,
            height: 32,
          }}
        >
          <IconeMensagens />
          {contagemNaoLidas > 0 && (
            <span
              aria-label="mensagens não lidas"
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#ef4444',
                border: '2px solid #0f172a',
              }}
            />
          )}
        </button>

        {/* Configurações do Mundo Hubbia */}
        <button
          type="button"
          onClick={aoAlternarConfiguracoes}
          title="Configurações do Mundo (Relógio, Orçamento, Dry-Run, Eventos)"
          aria-label="configurações"
          style={{
            ...estiloBotaoMiniTopo(configuracoesAbertas),
            width: 34,
            height: 32,
          }}
        >
          <IconeConfiguracoes />
        </button>
      </div>

      {modoConstruirAtivo ? null : (
        <>
          {/* =================================================================
              ESQUERDA — FILA DE AÇÕES DO SIM ATIVO (`SIState` Action Queue)
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 205,
              zIndex: 62,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxWidth: 250,
              userSelect: 'none',
            }}
          >
            {simAtivo.interacaoAtual && (
              <CartaoFilaAcao
                icone={simAtivo.interacaoAtual.opcao.icone}
                titulo={simAtivo.interacaoAtual.opcao.titulo}
                subtitulo={
                  simAtivo.interacaoAtual.fase === 'indo'
                    ? 'Caminhando em 3D...'
                    : `${Math.round(simAtivo.interacaoAtual.progresso * 100)}% concluído`
                }
                progresso={simAtivo.interacaoAtual.progresso}
                cor={infoHumor.corHex}
                ativa
                aoCancelar={() => aoCancelarInteracao('atual')}
              />
            )}
            {simAtivo.filaInteracoes.map((op, idx) => (
              <CartaoFilaAcao
                key={`${op.id}-${idx}`}
                icone={op.icone}
                titulo={op.titulo}
                subtitulo={`Na fila (#${idx + 2})`}
                progresso={0}
                cor="rgba(255,255,255,0.28)"
                ativa={false}
                aoCancelar={() => aoCancelarInteracao(idx)}
              />
            ))}
          </div>

          {/* =================================================================
              CANTO INFERIOR ESQUERDO — SKEWER DE SIMS + CARTÃO DE HUMOR ATIVO
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 14,
              zIndex: 62,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              userSelect: 'none',
            }}
          >
            {/* Fileira dos Sims (Skewer) + Botão Criar Sim */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {listaSimsMundo.map((s) => {
                const ag = AGENTES.find((a) => a.id === s.id) ?? {
                  id: s.id,
                  nome: s.nome,
                  cor: s.cor,
                  arquivo: 'norte2dSemfundo.png',
                  especialidade: s.especialidade,
                  funcao: s.funcao,
                }
                const selecionado = s.id === simAtivo.id
                const plumb = calcularCorPlumbBob(s.necessidades)
                const humorAg = INFO_HUMORES[s.humor]
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => aoSelecionarSim(s.id)}
                    onDoubleClick={() => aoAbrirPainelAgente(s.id)}
                    title={`${s.nome} (${humorAg.titulo}) — Clique para controlar · Duplo clique para abrir painel`}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 9px 4px 5px',
                      borderRadius: 12,
                      background: selecionado
                        ? `linear-gradient(135deg, ${humorAg.corHex}44, rgba(15, 23, 42, 0.95))`
                        : 'rgba(15, 23, 42, 0.86)',
                      border: selecionado
                        ? `2px solid ${plumb.corHex}`
                        : '1px solid rgba(255,255,255,0.16)',
                      boxShadow: selecionado
                        ? `0 0 16px ${plumb.corHex}44, 0 8px 20px rgba(0,0,0,0.5)`
                        : '0 6px 14px rgba(0,0,0,0.45)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      transform: selecionado ? 'translateY(-2px)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <RetratoAgente agente={ag} tamanho={32} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.1 }}>{s.nome}</div>
                      <div style={{ fontSize: 9.5, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span>{s.interacaoAtual?.opcao.icone ?? humorAg.icone}</span>
                        <span>{humorAg.titulo}</span>
                      </div>
                    </div>
                    <PlumbBobSvg cor={plumb.corHex} tamanho={11} />
                  </button>
                )
              })}

              {aoAbrirCriadorCAS && (
                <button
                  type="button"
                  onClick={aoAbrirCriadorCAS}
                  title="Criar Novo Agente Sim ou Personalizar Roupas/Rosto em 3D (Create-A-Sim)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '7px 11px',
                    borderRadius: 12,
                    border: '1.5px dashed rgba(110, 199, 31, 0.65)',
                    background: 'rgba(15, 23, 42, 0.86)',
                    color: '#a3e635',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <span>🧬</span>
                  <span>+ Sim</span>
                </button>
              )}
            </div>

            {/* Cartão Principal do Sim Ativo + Emoção + Modificadores (Buffs) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 16,
                background: `linear-gradient(130deg, ${infoHumor.corHex}38 0%, rgba(15, 23, 42, 0.95) 62%)`,
                backdropFilter: 'blur(18px)',
                border: `1.5px solid ${infoHumor.corHex}88`,
                boxShadow: `0 18px 38px -12px rgba(0,0,0,0.7), 0 0 24px ${infoHumor.corHex}26`,
                minWidth: 370,
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    borderRadius: '50%',
                    padding: 3,
                    border: `2.5px solid ${infoHumor.corHex}`,
                    background: 'rgba(15,23,42,0.9)',
                  }}
                >
                  <RetratoAgente agente={agenteVisualAtivo} tamanho={54} />
                </div>
                <div style={{ position: 'absolute', top: -8, right: -4 }}>
                  <PlumbBobSvg cor={plumbAtivo.corHex} tamanho={15} />
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                    {simAtivo.nome}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: `${infoHumor.corHex}33`,
                      border: `1px solid ${infoHumor.corHex}`,
                      color: '#f8fafc',
                    }}
                  >
                    {infoHumor.icone} {infoHumor.titulo}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>
                  {simAtivo.interacaoAtual
                    ? `${simAtivo.interacaoAtual.opcao.icone} ${simAtivo.interacaoAtual.opcao.titulo}`
                    : `Postura 3D: ${rotuloPostura(simAtivo.postura.corpo)}`}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {simAtivo.modificadores.slice(0, 3).map((mod) => (
                    <span
                      key={mod.id}
                      title={`${mod.titulo}: ${mod.motivo}`}
                      style={{
                        fontSize: 10,
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.09)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        color: '#e2e8f0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{mod.icone}</span>
                      <span>{mod.titulo}</span>
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => aoAbrirPainelAgente(simAtivo.id)}
                title={`Abrir o painel de trabalho de ${simAtivo.nome} (${simAtivo.funcao})`}
                style={{
                  padding: '8px 12px',
                  borderRadius: 11,
                  border: `1.5px solid ${corCss(simAtivo.cor)}`,
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 15 }}>🗂️</span>
                <span>Painel</span>
              </button>
            </div>
          </div>

          {/* =================================================================
              CENTRO INFERIOR — RELÓGIO SIM, VELOCIDADES (0/1x/2x/3x) E TICK IA
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 14,
              transform: 'translateX(-50%)',
              zIndex: 62,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 18px 36px -12px rgba(0,0,0,0.72)',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {(
                [
                  { v: 0 as VelocidadeTempo, rotulo: '⏸', titulo: 'Pausar Simulação (0)' },
                  { v: 1 as VelocidadeTempo, rotulo: '▶ 1x', titulo: 'Velocidade Normal (1)' },
                  { v: 2 as VelocidadeTempo, rotulo: '⏩ 2x', titulo: 'Velocidade Rápida (2)' },
                  { v: 3 as VelocidadeTempo, rotulo: '⏭ 3x', titulo: 'Velocidade Ultra (3)' },
                ] as const
              ).map((item) => {
                const ativo = mundo.velocidade === item.v
                return (
                  <button
                    key={item.v}
                    type="button"
                    onClick={() => aoMudarVelocidade(item.v)}
                    title={item.titulo}
                    style={{
                      padding: '5px 9px',
                      borderRadius: 999,
                      border: ativo
                        ? '1px solid #6ec71f'
                        : '1px solid rgba(255,255,255,0.14)',
                      background: ativo ? 'rgba(110, 199, 31, 0.25)' : 'rgba(255,255,255,0.06)',
                      color: ativo ? '#a3e635' : '#e2e8f0',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {item.rotulo}
                  </button>
                )
              })}
            </div>

            <div
              style={{
                padding: '0 10px',
                borderLeft: '1px solid rgba(255,255,255,0.14)',
                borderRight: '1px solid rgba(255,255,255,0.14)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#f8fafc',
                }}
              >
                {formatarRelogioSim(mundo.minutosDoDia, mundo.diaDaSemana)}
              </div>
              <div style={{ fontSize: 10, color: '#a3e635', fontWeight: 600 }}>
                {orcamentoTexto ?? '§ 12.450'} · 🌿 Amb {mundo.pontuacaoAmbienteSala}
              </div>
            </div>

            <button
              type="button"
              onClick={aoClicarAvancarTick}
              disabled={avancandoTick}
              title={
                dryRunAtivo
                  ? 'Conferir 1 Tick de IA (Modo Simulado / Dry-Run)'
                  : 'Avançar 1 Tick de IA no Servidor Hubbia'
              }
              aria-label={dryRunAtivo ? 'conferir 1 tick (modo simulado ligado)' : 'avançar 1 tick'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(74, 222, 128, 0.55)',
                background: 'rgba(74, 222, 128, 0.18)',
                color: '#4ade80',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: avancandoTick ? 'default' : 'pointer',
                opacity: avancandoTick ? 0.6 : 1,
              }}
            >
              <IconeAvancarTick />
              <span>{avancandoTick ? 'Processando…' : dryRunAtivo ? 'Tick (Prévia)' : 'Tick IA'}</span>
            </button>
          </div>

          {/* =================================================================
              CANTO INFERIOR DIREITO — INSPETOR THE SIMS 4 (ABAS)
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              right: 16,
              bottom: 14,
              zIndex: 62,
              width: 348,
              borderRadius: 16,
              background: 'rgba(15, 23, 42, 0.93)',
              backdropFilter: 'blur(18px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 18px 40px -14px rgba(0,0,0,0.75)',
              color: '#f8fafc',
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'rgba(255,255,255,0.04)',
                borderBottom: inspetorAberto ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                {(
                  [
                    { id: 'necessidades' as AbaInspetor, icone: '😊', titulo: 'Necessidades' },
                    { id: 'carreira' as AbaInspetor, icone: '💼', titulo: 'Carreira' },
                    { id: 'habilidades' as AbaInspetor, icone: '📈', titulo: 'Habilidades' },
                    { id: 'relacionamentos' as AbaInspetor, icone: '💬', titulo: 'Relações' },
                  ] as const
                ).map((aba) => {
                  const ativa = abaAtiva === aba.id && inspetorAberto
                  return (
                    <button
                      key={aba.id}
                      type="button"
                      onClick={() => {
                        if (abaAtiva === aba.id && inspetorAberto) {
                          setInspetorAberto(false)
                        } else {
                          setAbaAtiva(aba.id)
                          setInspetorAberto(true)
                        }
                      }}
                      title={aba.titulo}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 8px',
                        borderRadius: 8,
                        border: ativa
                          ? '1px solid rgba(110, 199, 31, 0.6)'
                          : '1px solid transparent',
                        background: ativa ? 'rgba(110, 199, 31, 0.2)' : 'transparent',
                        color: ativa ? '#a3e635' : '#cbd5e1',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <span>{aba.icone}</span>
                      <span>{aba.titulo}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => setInspetorAberto((v) => !v)}
                title={inspetorAberto ? 'Recolher Inspetor' : 'Expandir Inspetor'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                {inspetorAberto ? '▾' : '▴'}
              </button>
            </div>

            {inspetorAberto && (
              <div style={{ padding: '10px 12px' }}>
                {abaAtiva === 'necessidades' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      <span>Necessidades de {simAtivo.nome}</span>
                      <span>Clique para resolver</span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      {CHAVES_NECESSIDADES.map((chave) => {
                        const meta = ROTULOS_NECESSIDADES[chave]
                        const valor = Math.round(simAtivo.necessidades[chave])
                        const taxa = simAtivo.taxasNecessidades[chave]
                        const corBarra = corDaBarraNecessidade(valor)

                        return (
                          <button
                            key={chave}
                            type="button"
                            onClick={() => aoAutoResolverNecessidade(chave)}
                            title={`${meta.nome} (${valor}/100) — ${meta.descricao} Clique para auto-resolver!`}
                            style={{
                              textAlign: 'left',
                              padding: '6px 8px',
                              borderRadius: 9,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              cursor: 'pointer',
                              color: '#f8fafc',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                marginBottom: 4,
                              }}
                            >
                              <span>
                                {meta.icone} {meta.nome}
                              </span>
                              <span style={{ fontSize: 10, color: corBarra }}>
                                {taxa > 1 ? '▸▸' : taxa === 1 ? '▸' : taxa < -1 ? '◂◂' : ''}{' '}
                                {valor}%
                              </span>
                            </div>
                            <div
                              style={{
                                height: 7,
                                borderRadius: 999,
                                background: 'rgba(0,0,0,0.45)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${valor}%`,
                                  height: '100%',
                                  borderRadius: 999,
                                  background: corBarra,
                                  transition: 'width 0.25s ease, background 0.25s ease',
                                }}
                              />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {abaAtiva === 'carreira' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 800 }}>
                          Especialista em {simAtivo.funcao}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                          Estado Servidor IA: <strong style={{ color: '#a3e635' }}>{simAtivo.estadoBackend}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => aoAbrirPainelAgente(simAtivo.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid rgba(74,222,128,0.5)',
                          background: 'rgba(74,222,128,0.18)',
                          color: '#4ade80',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir Dashboard →
                      </button>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
                        <span style={{ color: '#cbd5e1' }}>Desempenho no Expediente</span>
                        <span style={{ color: '#a3e635', fontWeight: 700 }}>
                          {Math.round(simAtivo.desempenhoCarreira)}%
                        </span>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${simAtivo.desempenhoCarreira}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #22c55e, #a3e635)',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginTop: 2 }}>
                      Traços de Personalidade
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {simAtivo.tracos.map((t) => (
                        <span
                          key={t.id}
                          title={t.descricao}
                          style={{
                            fontSize: 10.5,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.14)',
                          }}
                        >
                          {t.icone} {t.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {abaAtiva === 'habilidades' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {simAtivo.habilidades.map((hab) => (
                      <div
                        key={hab.id}
                        style={{
                          padding: '6px 9px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            {hab.icone} {hab.nome}
                          </span>
                          <span style={{ color: '#38bdf8' }}>Nível {hab.nivel}/10</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${hab.progresso}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {abaAtiva === 'relacionamentos' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {simAtivo.relacionamentos.map((rel) => (
                      <div
                        key={rel.alvoId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                            <span>{rel.nome}</span>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{rel.rotulo}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9.5, color: '#86efac' }}>
                                Amizade {Math.round(rel.amizade)}%
                              </div>
                              <div style={{ height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.45)' }}>
                                <div
                                  style={{
                                    width: `${rel.amizade}%`,
                                    height: '100%',
                                    borderRadius: 999,
                                    background: '#22c55e',
                                  }}
                                />
                              </div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9.5, color: '#c4b5fd' }}>
                                Sinergia {Math.round(rel.sinergia)}%
                              </div>
                              <div style={{ height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.45)' }}>
                                <div
                                  style={{
                                    width: `${rel.sinergia}%`,
                                    height: '100%',
                                    borderRadius: 999,
                                    background: '#8b5cf6',
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {rel.alvoId !== 'chefe' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => aoInteragirComColega(rel.alvoId, 'papo')}
                              title={`Bater papo com ${rel.nome}`}
                              style={estiloBotaoMiniTopo(false)}
                            >
                              💬
                            </button>
                            <button
                              type="button"
                              onClick={() => aoInteragirComColega(rel.alvoId, 'projeto')}
                              title={`Alinhar projeto com ${rel.nome}`}
                              style={estiloBotaoMiniTopo(false)}
                            >
                              🤝
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

function CartaoFilaAcao({
  icone,
  titulo,
  subtitulo,
  progresso,
  cor,
  ativa,
  aoCancelar,
}: {
  icone: string
  titulo: string
  subtitulo: string
  progresso: number
  cor: string
  ativa: boolean
  aoCancelar: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 11,
        background: ativa ? 'rgba(15, 23, 42, 0.92)' : 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${cor}`,
        color: '#f8fafc',
        boxShadow: '0 8px 20px -8px rgba(0,0,0,0.6)',
      }}
    >
      <span style={{ fontSize: 16 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {titulo}
        </div>
        <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{subtitulo}</div>
        {ativa && (
          <div
            style={{
              height: 3,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              marginTop: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(progresso * 100)}%`,
                height: '100%',
                background: cor,
              }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={aoCancelar}
        title="Cancelar esta ação"
        style={{
          background: 'rgba(239,68,68,0.16)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 6,
          color: '#fca5a5',
          width: 22,
          height: 22,
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

function rotuloPostura(corpo: string): string {
  switch (corpo) {
    case 'andando':
      return 'Caminhando pela sala'
    case 'sentado_cadeira':
      return 'Digitando na estação'
    case 'sentado_sofa':
      return 'Relaxando no estofado'
    case 'interagindo_em_pe':
      return 'Interagindo em pé'
    default:
      return 'Em pé'
  }
}

function estiloPilulaTopo(ativo: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 999,
    border: ativo ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(255,255,255,0.14)',
    background: ativo ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
    color: ativo ? '#7dd3fc' : '#e2e8f0',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

function estiloBotaoMiniTopo(ativo: boolean): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 8,
    border: ativo ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(255,255,255,0.14)',
    background: ativo ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
    color: ativo ? '#7dd3fc' : '#e2e8f0',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
}
