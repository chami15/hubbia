import { AGENTES } from './agentes'
import { AvatarAgente } from './AvatarAgente'
import { IconeAvancarTick, IconeConfiguracoes, IconeMensagens } from './icones'
import { botaoHud, ROTULO, SEPARADOR, VIDRO } from './hud-estilos'
import { InspetorAgente } from './InspetorAgente'
import type { ModoParedesSims } from './moveis3d'
import {
  calcularCorDiamante,
  formatarRelogioSim,
  INFO_HUMORES,
  type AspectoCorpoPostura,
  type ChaveNecessidade,
  type EstadoMundoSims,
  type EstadoSim,
  type VelocidadeTempo,
} from './simulacao-sims'

// ---------------------------------------------------------------------------
// HUD DO MODO SIMULAÇÃO
//
//   sobre a cena ........ etiqueta de cada personagem (nome + balão),
//                         movida pela cena 3D todo quadro (EtiquetasDaCena)
//   topo, direita ....... modo (simulação/construir), salas, criar
//                         personagem, paredes, câmera, 3D/2D, autonomia,
//                         mensagens e configurações
//   baixo, esquerda ..... fila de ações + seletor + cartão do selecionado
//   baixo, centro ....... tempo (pausa/velocidade), relógio e avançar tick
//   baixo, direita ...... inspetor (InspetorAgente.tsx)
//
// No modo construir só o topo fica — o resto do espaço é do catálogo e do
// painel de edição.
// ---------------------------------------------------------------------------

interface Props {
  mundo: EstadoMundoSims
  modo3D: boolean
  modoParedes: ModoParedesSims
  construindo: boolean
  salasAbertas: boolean
  mensagensAbertas: boolean
  configuracoesAbertas: boolean
  contagemNaoLidas: number
  dryRunAtivo: boolean
  avancandoTick: boolean
  registrarEtiqueta: (id: string, el: HTMLElement | null) => void
  aoSelecionar: (id: string) => void
  aoAbrirPainelAgente: (id: string) => void
  aoMudarVelocidade: (v: VelocidadeTempo) => void
  aoAlternarAutonomia: () => void
  aoAlternarSeguir: () => void
  aoAlternarModo3D: () => void
  aoCiclarParedes: () => void
  aoGirarCamera: (direcao: -1 | 1) => void
  aoZoom: (fator: number) => void
  aoCentralizar: () => void
  aoCancelar: (indice: number | 'atual') => void
  aoResolverNecessidade: (chave: ChaveNecessidade) => void
  aoInteragirComColega: (alvoId: string, tipo: 'papo' | 'projeto') => void
  aoAlternarConstruir: () => void
  aoAlternarSalas: () => void
  aoAbrirCriador: () => void
  aoAlternarMensagens: () => void
  aoAlternarConfiguracoes: () => void
  aoAvancarTick: () => void
}

const VELOCIDADES: { v: VelocidadeTempo; rotulo: string; titulo: string }[] = [
  { v: 0, rotulo: '❚❚', titulo: 'Pausar (espaço ou 0)' },
  { v: 1, rotulo: '▶', titulo: 'Velocidade normal (1)' },
  { v: 2, rotulo: '▶▶', titulo: 'Rápido (2)' },
  { v: 3, rotulo: '▶▶▶', titulo: 'Muito rápido (3)' },
]

const ROTULO_PAREDES: Record<ModoParedesSims, string> = {
  cortadas: 'Paredes cortadas',
  altas: 'Paredes altas',
  baixas: 'Paredes baixas',
}

const ROTULO_POSTURA: Record<AspectoCorpoPostura, string> = {
  em_pe: 'Parado',
  andando: 'Andando',
  sentado_cadeira: 'Na mesa',
  sentado_sofa: 'No sofá',
  interagindo_em_pe: 'Ocupado',
}

export function HudSimulacao(props: Props) {
  const { mundo, construindo, modo3D } = props
  const ativo = mundo.sims[mundo.simAtivoId] ?? Object.values(mundo.sims)[0]

  return (
    <>
      {modo3D && <EtiquetasDaCena mundo={mundo} registrar={props.registrarEtiqueta} />}
      <BarraTopo {...props} />
      {!construindo && ativo && (
        <>
          <FilaDeAcoes agente={ativo} aoCancelar={props.aoCancelar} />
          <SeletorEAgente {...props} ativo={ativo} />
          <ControleTempo {...props} />
          <InspetorAgente
            agente={ativo}
            aoResolverNecessidade={props.aoResolverNecessidade}
            aoInteragirComColega={props.aoInteragirComColega}
            aoAbrirPainel={() => props.aoAbrirPainelAgente(ativo.id)}
          />
        </>
      )}
    </>
  )
}

// Etiqueta de cada personagem sobre a cena 3D. O React só decide o
// CONTEÚDO (nome, humor, balão, progresso); a POSIÇÃO é escrita pela cena
// 3D direto no `style.transform`, todo quadro (ver posicionarEtiquetas em
// cena3d.ts). Por isso começam escondidas e em (0,0).
function EtiquetasDaCena({ mundo, registrar }: { mundo: EstadoMundoSims; registrar: Props['registrarEtiqueta'] }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden' }}>
      {Object.values(mundo.sims).map((s) => {
        const ativo = s.id === mundo.simAtivoId
        const cor = calcularCorDiamante(s.necessidades).corHex
        const progresso = s.interacaoAtual?.fase === 'indo' ? 0 : (s.interacaoAtual?.progresso ?? 0)
        return (
          <div
            key={s.id}
            ref={(el) => registrar(s.id, el)}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              visibility: 'hidden',
              willChange: 'transform',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--fonte-corpo)',
            }}
          >
            {s.balao && (
              <div
                style={{
                  position: 'relative',
                  maxWidth: 220,
                  padding: '5px 11px',
                  borderRadius: 12,
                  background: '#f7f4ee',
                  color: 'var(--deck)',
                  border: `1.5px solid ${s.balao.tipo === 'fala' ? 'var(--info)' : 'var(--good)'}`,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  textAlign: 'center',
                  // até 2 linhas: mensagem de rodada costuma ser maior que uma
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  animation: 'consoleListaEntra .18s ease both',
                }}
              >
                {s.balao.icone} {s.balao.texto}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 9px',
                borderRadius: 999,
                background: ativo ? 'rgba(20,22,27,0.92)' : 'rgba(20,22,27,0.7)',
                border: `1px solid ${ativo ? cor : 'rgba(255,255,255,0.18)'}`,
                color: 'var(--ink)',
                fontSize: 10.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{INFO_HUMORES[s.humor].icone}</span>
              <span>{s.nome}</span>
              {s.foraDoLote && <span style={{ color: 'var(--info)', fontWeight: 600 }}>lá fora</span>}
              {progresso > 0.02 && (
                <span style={{ color: 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(progresso * 100)}%</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BarraTopo({
  mundo,
  modo3D,
  modoParedes,
  construindo,
  salasAbertas,
  mensagensAbertas,
  configuracoesAbertas,
  contagemNaoLidas,
  aoAlternarConstruir,
  aoAlternarSalas,
  aoAbrirCriador,
  aoCiclarParedes,
  aoGirarCamera,
  aoZoom,
  aoCentralizar,
  aoAlternarSeguir,
  aoAlternarModo3D,
  aoAlternarAutonomia,
  aoAlternarMensagens,
  aoAlternarConfiguracoes,
}: Props) {
  return (
    <div
      style={{
        ...VIDRO,
        position: 'absolute',
        top: 14,
        right: 16,
        zIndex: 66,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        maxWidth: 'calc(100vw - 32px)',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      }}
    >
      {/* modo: controle segmentado, não um botão que troca de nome —
          deixa visível qual é o outro modo e que E alterna */}
      <div role="group" aria-label="modo" style={{ display: 'flex', padding: 2, borderRadius: 10, background: 'rgba(0,0,0,0.25)' }}>
        {[
          { construir: false, rotulo: 'Simulação' },
          { construir: true, rotulo: 'Construir' },
        ].map((m) => {
          const ligado = m.construir === construindo
          return (
            <button
              key={m.rotulo}
              type="button"
              className="hud-botao"
              aria-pressed={ligado}
              onClick={ligado ? undefined : aoAlternarConstruir}
              title="Alternar modo (E)"
              style={{
                ...botaoHud({ ativo: ligado }),
                height: 26,
                border: ligado ? botaoHud({ ativo: true }).border : '1px solid transparent',
                background: ligado ? botaoHud({ ativo: true }).background : 'transparent',
                color: ligado ? 'var(--accent)' : 'var(--ink-dim)',
                cursor: ligado ? 'default' : 'pointer',
              }}
            >
              {m.rotulo}
            </button>
          )
        })}
      </div>

      <button type="button" className="hud-botao" onClick={aoAlternarSalas} aria-pressed={salasAbertas} style={botaoHud({ ativo: salasAbertas })}>
        Salas
      </button>
      <button
        type="button"
        className="hud-botao"
        onClick={aoAbrirCriador}
        title="Mudar a aparência de um agente ou criar um personagem novo"
        style={botaoHud()}
      >
        Personagens
      </button>

      <div style={SEPARADOR} />

      {modo3D && (
        <>
          <button
            type="button"
            className="hud-botao"
            onClick={aoCiclarParedes}
            title="Cortadas (somem as da frente da câmera) → altas → baixas"
            style={botaoHud()}
          >
            {ROTULO_PAREDES[modoParedes]}
          </button>
          <button type="button" className="hud-botao" onClick={() => aoGirarCamera(-1)} title="Girar câmera (Q, ou arraste com o botão direito)" aria-label="girar câmera para a esquerda" style={botaoHud({ quadrado: true })}>
            ↺
          </button>
          <button type="button" className="hud-botao" onClick={() => aoGirarCamera(1)} title="Girar câmera (R, ou arraste com o botão direito)" aria-label="girar câmera para a direita" style={botaoHud({ quadrado: true })}>
            ↻
          </button>
        </>
      )}
      <button type="button" className="hud-botao" onClick={() => aoZoom(1 / 1.2)} title="Afastar" aria-label="afastar" style={botaoHud({ quadrado: true })}>
        −
      </button>
      <button type="button" className="hud-botao" onClick={aoCentralizar} title="Enquadrar o lote" aria-label="enquadrar o lote" style={botaoHud({ quadrado: true })}>
        ⌂
      </button>
      <button type="button" className="hud-botao" onClick={() => aoZoom(1.2)} title="Aproximar" aria-label="aproximar" style={botaoHud({ quadrado: true })}>
        +
      </button>
      {!construindo && (
        <button
          type="button"
          className="hud-botao"
          onClick={aoAlternarSeguir}
          aria-pressed={mundo.seguirSimAtivo}
          title="A câmera acompanha o personagem selecionado (arrastar solta)"
          style={botaoHud({ ativo: mundo.seguirSimAtivo })}
        >
          Seguir
        </button>
      )}

      <div style={SEPARADOR} />

      <button
        type="button"
        className="hud-botao"
        onClick={aoAlternarModo3D}
        title="Trocar entre o mundo 3D e a maquete 2D isométrica"
        style={botaoHud()}
      >
        {modo3D ? '3D' : '2D'}
      </button>
      {!construindo && (
        <button
          type="button"
          className="hud-botao"
          onClick={aoAlternarAutonomia}
          aria-pressed={mundo.autonomiaAtiva}
          title="Com autonomia, cada personagem escolhe sozinho o que fazer quando fica livre"
          style={botaoHud({ ativo: mundo.autonomiaAtiva })}
        >
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: '50%', background: mundo.autonomiaAtiva ? 'var(--accent)' : 'var(--ink-faint)' }}
          />
          Autonomia
        </button>
      )}

      <div style={SEPARADOR} />

      <button
        type="button"
        className="hud-botao"
        onClick={aoAlternarMensagens}
        title="Mensagens"
        aria-label="mensagens"
        aria-pressed={mensagensAbertas}
        style={{ ...botaoHud({ ativo: mensagensAbertas, quadrado: true }), position: 'relative', width: 34 }}
      >
        <IconeMensagens tamanho={18} />
        {contagemNaoLidas > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10 }} aria-label="mensagens não lidas">
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--danger)', border: '2px solid rgba(27,30,37,0.9)' }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--danger)', animation: 'consolePing 1.8s cubic-bezier(.4,0,.6,1) infinite' }} />
          </span>
        )}
      </button>
      <button
        type="button"
        className="hud-botao"
        onClick={aoAlternarConfiguracoes}
        title="Configurações (relógio do servidor, orçamento, modo simulado, eventos)"
        aria-label="configurações"
        aria-pressed={configuracoesAbertas}
        style={{ ...botaoHud({ ativo: configuracoesAbertas, quadrado: true }), width: 34 }}
      >
        <IconeConfiguracoes tamanho={18} />
      </button>
    </div>
  )
}

function FilaDeAcoes({ agente, aoCancelar }: { agente: EstadoSim; aoCancelar: Props['aoCancelar'] }) {
  if (!agente.interacaoAtual && agente.filaInteracoes.length === 0) return null
  const humor = INFO_HUMORES[agente.humor]

  return (
    <div style={{ position: 'absolute', left: 16, bottom: 190, zIndex: 62, display: 'flex', flexDirection: 'column', gap: 5, width: 270 }}>
      {agente.interacaoAtual && (
        <CartaoAcao
          icone={agente.interacaoAtual.opcao.icone}
          titulo={agente.interacaoAtual.opcao.titulo}
          detalhe={agente.interacaoAtual.fase === 'indo' ? 'a caminho' : `${Math.round(agente.interacaoAtual.progresso * 100)}%`}
          progresso={agente.interacaoAtual.fase === 'executando' ? agente.interacaoAtual.progresso : null}
          cor={humor.corHex}
          aoCancelar={() => aoCancelar('atual')}
        />
      )}
      {agente.filaInteracoes.map((op, i) => (
        <CartaoAcao
          key={`${op.id}-${i}`}
          icone={op.icone}
          titulo={op.titulo}
          detalhe={`${i + 2}º na fila`}
          progresso={null}
          aoCancelar={() => aoCancelar(i)}
        />
      ))}
    </div>
  )
}

function CartaoAcao({
  icone,
  titulo,
  detalhe,
  progresso,
  cor,
  aoCancelar,
}: {
  icone: string
  titulo: string
  detalhe: string
  progresso: number | null
  cor?: string
  aoCancelar: () => void
}) {
  const emAndamento = Boolean(cor)
  return (
    <div
      style={{
        ...VIDRO,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '6px 8px 6px 10px',
        borderRadius: 11,
        borderLeft: emAndamento ? `3px solid ${cor}` : VIDRO.border,
        opacity: emAndamento ? 1 : 0.78,
        animation: 'consoleListaEntra .18s ease both',
      }}
    >
      <span style={{ fontSize: 15 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-dim)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {detalhe}
          </span>
        </div>
        {progresso !== null && (
          <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.1)', marginTop: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(progresso * 100)}%`, height: '100%', background: cor, transition: 'width 0.18s linear' }} />
          </div>
        )}
      </div>
      <button
        type="button"
        className="hud-botao"
        onClick={aoCancelar}
        title="Cancelar"
        aria-label={`cancelar ${titulo}`}
        style={{ ...botaoHud({ quadrado: true }), height: 22, minWidth: 22, borderRadius: 6, color: 'var(--ink-dim)' }}
      >
        ×
      </button>
    </div>
  )
}

function SeletorEAgente({ mundo, ativo, aoSelecionar, aoAbrirPainelAgente, aoAbrirCriador }: Props & { ativo: EstadoSim }) {
  const humor = INFO_HUMORES[ativo.humor]
  const diamante = calcularCorDiamante(ativo.necessidades)
  const todos = Object.values(mundo.sims)
  // personagem criado no criador não tem painel de domínio (não existe no
  // backend) — o botão "Painel" só aparece pros 4 agentes
  const temPainel = AGENTES.some((a) => a.id === ativo.id)

  return (
    <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 62, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(460px, calc(50vw - 200px))', minWidth: 340 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(todos.length, 4)}, minmax(0, 1fr)) 34px`, gap: 6 }}>
        {todos.map((s) => {
          const selecionado = s.id === ativo.id
          const cor = calcularCorDiamante(s.necessidades).corHex
          return (
            <button
              key={s.id}
              type="button"
              className="hud-botao"
              onClick={() => aoSelecionar(s.id)}
              onDoubleClick={() => aoAbrirPainelAgente(s.id)}
              aria-pressed={selecionado}
              title={`${s.nome} · ${INFO_HUMORES[s.humor].titulo} — clique seleciona, duplo clique abre o painel`}
              style={{
                ...VIDRO,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 8px 5px 5px',
                borderRadius: 11,
                border: selecionado ? `1px solid ${cor}` : VIDRO.border,
                // a cor do diamante de cada um, sempre à vista — dá pra ver
                // quem está mal sem selecionar ninguém
                borderBottom: `2px solid ${cor}`,
                boxShadow: selecionado ? `0 0 14px ${cor}33, ${VIDRO.boxShadow}` : VIDRO.boxShadow,
                cursor: 'pointer',
              }}
            >
              <AvatarAgente id={s.id} nome={s.nome} cor={s.cor} tamanho={26} anel={2} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.nome}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          className="hud-botao"
          onClick={aoAbrirCriador}
          title="Criar um personagem novo"
          aria-label="criar personagem"
          style={{ ...VIDRO, borderRadius: 11, border: '1px dashed rgba(var(--accent-rgb), 0.5)', color: 'var(--accent)', fontSize: 16, cursor: 'pointer' }}
        >
          +
        </button>
      </div>

      <div style={{ ...VIDRO, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderLeft: `3px solid ${humor.corHex}` }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <AvatarAgente id={ativo.id} nome={ativo.nome} cor={ativo.cor} tamanho={50} />
          <div style={{ position: 'absolute', top: -9, right: -3 }}>
            <Diamante cor={diamante.corHex} tamanho={13} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--fonte-display)', fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ativo.nome}</span>
            <span
              title={humor.descricao}
              style={{ ...ROTULO, color: humor.corHex, padding: '2px 7px', borderRadius: 999, border: `1px solid ${humor.corHex}66`, background: `${humor.corHex}1a`, whiteSpace: 'nowrap' }}
            >
              {humor.icone} {humor.titulo}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ativo.interacaoAtual
              ? `${ativo.interacaoAtual.opcao.icone} ${ativo.interacaoAtual.opcao.titulo}`
              : ativo.foraDoLote
                ? 'Lá fora'
                : ROTULO_POSTURA[ativo.postura.corpo]}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {ativo.modificadores.slice(0, 3).map((m) => (
              <span
                key={m.id}
                title={m.motivo}
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--deck-line)',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.icone} {m.titulo}
              </span>
            ))}
          </div>
        </div>

        {temPainel && (
          <button
            type="button"
            className="hud-botao"
            onClick={() => aoAbrirPainelAgente(ativo.id)}
            title={`Abrir o painel de ${ativo.nome} (${ativo.funcao})`}
            style={{ ...botaoHud(), flexShrink: 0 }}
          >
            Painel
          </button>
        )}
      </div>
    </div>
  )
}

function ControleTempo({ mundo, dryRunAtivo, avancandoTick, aoMudarVelocidade, aoAvancarTick }: Props) {
  return (
    <div
      style={{
        ...VIDRO,
        position: 'absolute',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 62,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 6,
      }}
    >
      <div role="group" aria-label="velocidade" style={{ display: 'flex', gap: 3 }}>
        {VELOCIDADES.map((item) => (
          <button
            key={item.v}
            type="button"
            className="hud-botao"
            onClick={() => aoMudarVelocidade(item.v)}
            aria-pressed={mundo.velocidade === item.v}
            title={item.titulo}
            aria-label={item.titulo}
            style={{ ...botaoHud({ ativo: mundo.velocidade === item.v, quadrado: true }), width: 36, fontSize: 10, letterSpacing: '-0.12em' }}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div style={{ textAlign: 'center', minWidth: 92 }}>
        <div style={{ fontFamily: 'var(--fonte-display)', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', opacity: mundo.velocidade === 0 ? 0.55 : 1 }}>
          {formatarRelogioSim(mundo.minutosDoDia, mundo.diaDaSemana)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-dim)' }} title="Nota da sala, vem da decoração (modo construir)">
          🌿 ambiente {Math.round(mundo.pontuacaoAmbienteSala)}
        </div>
      </div>

      <div style={SEPARADOR} />

      {/* O tick do BACKEND — a rodada de verdade (social + proatividade).
          Diferente da velocidade ao lado, que só mexe no jogo local. */}
      <button
        type="button"
        className="hud-botao"
        onClick={aoAvancarTick}
        disabled={avancandoTick}
        title={dryRunAtivo ? 'Conferir uma rodada (modo simulado: não gasta nem grava)' : 'Rodar uma rodada dos agentes no servidor'}
        aria-label={dryRunAtivo ? 'conferir 1 tick (modo simulado ligado)' : 'avançar 1 tick'}
        style={{
          ...botaoHud({ destaque: true }),
          height: 34,
          padding: '0 14px',
          opacity: avancandoTick ? 0.6 : 1,
          cursor: avancandoTick ? 'default' : 'pointer',
          animation: avancandoTick ? undefined : 'consoleGoGlow 2.6s ease-in-out infinite',
        }}
      >
        <IconeAvancarTick tamanho={18} />
        {avancandoTick ? 'Rodando…' : dryRunAtivo ? 'Conferir tick' : 'Avançar tick'}
      </button>
    </div>
  )
}

function Diamante({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho * 1.4} viewBox="0 0 20 28" aria-hidden="true" style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${cor}99)` }}>
      <polygon points="10,1 19,14 10,14" fill={cor} />
      <polygon points="10,1 1,14 10,14" fill={cor} opacity={0.8} />
      <polygon points="10,27 19,14 10,14" fill={cor} opacity={0.65} />
      <polygon points="10,27 1,14 10,14" fill={cor} opacity={0.5} />
    </svg>
  )
}
