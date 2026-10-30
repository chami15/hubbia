import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { criarMundo, type Mundo } from '../predio/mundo'
import { carregarVagas, salvarVagas } from '../predio/vagas'
import { AGENTES, agentePorId, corCss, type AgenteId } from '../predio/agentes'
import type { Status } from '../predio/sim'
import { PainelPredio } from '../predio/PainelPredio'
import { statusNoPredio } from '../predio/status'
import { PainelDoAgente } from '../agentes/PainelDoAgente'
import { PainelMensagens } from '../agentes/PainelMensagens'
import { PainelConfiguracoes } from './PainelConfiguracoes'
import { IconeAvancarTick, IconeConfiguracoes, IconeMensagens, IconePredio, IconeSalaDeMaquinas } from './icones'
import { PainelSalaDeMaquinas } from './PainelSalaDeMaquinas'
import { Toasts, useToasts } from './Toasts'
import { useAvancarMundo, type ResultadoAvancoMundo } from '../../hooks/useMundo'
import { useContagemNaoLidas, useMensagens } from '../../hooks/useMensagens'
import { useAgentes, useRelacionamentos } from '../../hooks/useAgentes'
import { useHumores } from '../../hooks/useHumores'
import { useTickAtual } from '../../hooks/useTick'
import { definirDryRunAtivo, dryRunEstaAtivo, lerPreviewSalva, salvarPreview } from './dry-run'
import { somAtivo, tocarSom } from './som'
import { mensagemDeErro } from '../../api/client'
import { BolhaVita } from '../saude/BolhaVita'
import { useRelogioMundo } from '../../hooks/useRelogio'
import { useTickAutomatico } from '../../hooks/useTickAutomatico'
import { horaDoDia, horaDoMundoMs, horaLocalDoNavegador } from '../predio/relogioDoMundo'
import { RelogioDoTopo } from './RelogioDoTopo'
import { personalidadeDe } from '../predio/personalidade'
import { planejarEncontros } from '../predio/encontros'
import { afinidadesDoServidor } from '../predio/relacoes'
import type { RodadaProcessada } from '../../types/interacao'

// A tela do hub: a barra do topo (marca, relógio simulado e as ações) e, embaixo, o PRÉDIO — cada agente na sua
// sala, desenhado com a arte procedural do habblaud (features/predio). Clicar num agente (ou na sala dele) abre o
// painel dele; clicar numa vaga abre o catálogo para pôr alguém ali.
//
// Os painéis vivem DENTRO da área do prédio (position absolute ali), então a barra do topo nunca some: o relógio e
// o avançar tick continuam à mão com qualquer painel aberto.

type Painel =
  | { tipo: 'agente'; id: AgenteId }
  | { tipo: 'mensagens' }
  | { tipo: 'configuracoes' }
  | { tipo: 'maquinas' }
  | { tipo: 'predio'; vaga?: number }

export function Escritorio() {
  const hospedeiroRef = useRef<HTMLDivElement>(null)
  const [mundo, setMundo] = useState<Mundo | null>(null)
  // Suporte a deep linking para testes visuais e capturas automatizadas (ex: ?painel=maquinas ou ?painel=cifra).
  // Deixado comentado para preservar o estado padrão limpo do escritório sem intervenção na URL.
  // const [painel, setPainel] = useState<Painel | null>(() => {
  //   const params = new URLSearchParams(window.location.search)
  //   const p = params.get('painel')
  //   if (p === 'maquinas') return { tipo: 'maquinas' }
  //   if (p === 'mensagens') return { tipo: 'mensagens' }
  //   if (p === 'configuracoes') return { tipo: 'configuracoes' }
  //   if (p === 'cifra' || p === 'agenda' || p === 'vita' || p === 'norte') return { tipo: 'agente', id: p as AgenteId }
  //   return null
  // })
  const [painel, setPainel] = useState<Painel | null>(null)
  // atalho ancorado num personagem (clique direito); nunca junto com um painel
  const [atalho, setAtalho] = useState<AgenteId | null>(null)
  const areaRef = useRef<HTMLElement>(null)
  const [dryRunAtivo, setDryRunAtivoState] = useState(dryRunEstaAtivo)
  // tick automático: SEMPRE começa desligado ao carregar a página (padrão seguro); só o chefe liga. Não é lembrado entre sessões.
  const [autoLigado, setAutoLigado] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoAvancoMundo | null>(() =>
    dryRunEstaAtivo() ? lerPreviewSalva() : null,
  )
  const avancar = useAvancarMundo()
  const contagemNaoLidas = useContagemNaoLidas()
  const { toasts, notificar, fechar } = useToasts()
  const { data: agentesAoVivo } = useAgentes()
  const { data: mensagens } = useMensagens()
  const { data: tick } = useTickAtual()
  const agentesAoVivoRef = useRef<typeof agentesAoVivo>(undefined)
  agentesAoVivoRef.current = agentesAoVivo

  const abrirAgente = useCallback((id: AgenteId) => {
    // o Motriz não tem painel de agente: a sala de máquinas É o trabalho dele
    setAtalho(null)
    setPainel(id === 'motriz' ? { tipo: 'maquinas' } : { tipo: 'agente', id })
  }, [])

  // o prédio é criado uma vez; dados entram pelos métodos dele (ver efeitos abaixo)
  useEffect(() => {
    const hospedeiro = hospedeiroRef.current
    if (!hospedeiro) return
    const m = criarMundo(hospedeiro, {
      vagas: carregarVagas(),
      aoClicarAgente: abrirAgente,
      aoClicarVaga: (vaga) => {
        setAtalho(null)
        setPainel({ tipo: 'predio', vaga })
      },
      aoAtalhoAgente: (id) => {
        setPainel(null)
        setAtalho(id)
      },
      aoMudarVagas: salvarVagas,
    })
    setMundo(m)
    return () => m.destruir()
  }, [abrirAgente])

  // Hora do mundo: conta sobre o tempo real (ver relogioDoMundo.ts). O prédio recebe a hora com fração a cada segundo
  // (o céu muda aos poucos); o React só guarda a hora CHEIA, que é o que o status ("dormindo") precisa, para a tela
  // não re-renderizar a cada segundo. Sem backend, cai no relógio do navegador.
  const { data: relogioMundo } = useRelogioMundo()
  const [horaCheia, setHoraCheia] = useState(() => Math.floor(horaLocalDoNavegador()))
  useEffect(() => {
    const aplicar = () => {
      const h = relogioMundo ? horaDoDia(horaDoMundoMs(relogioMundo, Date.now()), relogioMundo.fusoMin) : horaLocalDoNavegador()
      mundo?.definirHora(h)
      setHoraCheia(Math.floor(h))
    }
    aplicar()
    const t = setInterval(aplicar, 1000)
    return () => clearInterval(t)
  }, [mundo, relogioMundo])

  // Ponte entre o dado (GET /agentes e mensagens, por id numérico e especialidade) e o prédio (id local).
  const status = useMemo(() => {
    const chefeId = agentesAoVivo?.find((a) => a.tipo === 'chefe')?.id
    const remetentesComNaoLida = new Set(
      (mensagens ?? []).filter((m) => m.destinatario_id === chefeId && !m.lida_pelo_chefe).map((m) => m.remetente_id),
    )
    const mapa = new Map<AgenteId, Status>()
    for (const local of AGENTES) {
      const aoVivo = local.especialidade ? agentesAoVivo?.find((a) => a.especialidade === local.especialidade) : undefined
      const sono = personalidadeDe(local.id).sono
      // agente conceito (sem backend): também tem dia e noite, pela personalidade
      if (!local.especialidade) mapa.set(local.id, statusNoPredio(undefined, false, horaCheia, sono))
      // backend fora do ar: fica com o status padrão do prédio
      if (!aoVivo) continue
      mapa.set(local.id, statusNoPredio(aoVivo.estado, remetentesComNaoLida.has(aoVivo.id), horaCheia, sono))
    }
    return mapa
  }, [agentesAoVivo, mensagens, horaCheia])

  useEffect(() => mundo?.definirStatus(status), [mundo, status])

  // Humor com motivo (dado real): vira postura no prédio e o pensamento ao selecionar o agente
  const humores = useHumores()
  useEffect(() => mundo?.definirHumores(humores), [mundo, humores])

  // Afinidade real entre colegas: o prédio usa para juntar amigos no almoço em duplas
  const { data: relacionamentos } = useRelacionamentos()
  useEffect(() => {
    if (!mundo || !relacionamentos || !agentesAoVivo) return
    const localDe = (idBackend: number) => {
      const aoVivo = agentesAoVivo.find((a) => a.id === idBackend)
      return aoVivo ? AGENTES.find((l) => l.especialidade === aoVivo.especialidade)?.id : undefined
    }
    mundo.definirAfinidades(afinidadesDoServidor(relacionamentos, localDe))
  }, [mundo, relacionamentos, agentesAoVivo])

  // Encontros: mensagem SOCIAL nova entre dois agentes vira visita com balão no prédio (Fase E). As que já existiam quando
  // a página abriu ficam de fora: reabrir o app não pode reencenar a conversa de ontem.
  const mensagensVistas = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!mundo || !mensagens || !agentesAoVivo) return
    if (mensagensVistas.current === null) {
      mensagensVistas.current = new Set(mensagens.map((m) => m.id))
      return
    }
    const vistas = mensagensVistas.current
    const novas = mensagens.filter((m) => !vistas.has(m.id))
    if (!novas.length) return
    for (const m of novas) vistas.add(m.id)
    const localDe = (idBackend: number) => {
      const aoVivo = agentesAoVivo.find((a) => a.id === idBackend)
      return aoVivo ? AGENTES.find((l) => l.especialidade === aoVivo.especialidade)?.id : undefined
    }
    mundo.aplicarEncontros(planejarEncontros(novas, { localDe, presentes: new Set(mundo.agentes().map((a) => a.id)), visitando: mundo.visitando() }))
  }, [mundo, mensagens, agentesAoVivo])
  // com o atalho aberto, o personagem fica parado: a bolha está ancorada nele
  useEffect(() => {
    mundo?.congelar(atalho)
    return () => mundo?.congelar(null)
  }, [mundo, atalho])
  useEffect(() => mundo?.selecionar(painel?.tipo === 'agente' ? painel.id : painel?.tipo === 'maquinas' ? 'motriz' : null), [mundo, painel])

  function aoAlternarDryRun(ativo: boolean) {
    definirDryRunAtivo(ativo)
    setDryRunAtivoState(ativo)
    setUltimoResultado(ativo ? lerPreviewSalva() : null)
  }

  // cor de identidade do agente, pro toast tingir a borda
  function corDoAgente(nome: string): string | undefined {
    const local = AGENTES.find((a) => a.nome === nome)
    return local ? corCss(local.cor) : undefined
  }

  // Traduz o resultado de uma rodada real (nunca dry_run — prévia não avisa nada) em notificações passageiras:
  // sem isso, um card gerado pelo Norte ou um alerta do Cifra passava batido até o chefe abrir o painel certo.
  function notificarResultadoDaRodada(rodada: RodadaProcessada | null, avisoRodada?: string) {
    if (!rodada) {
      if (avisoRodada) notificar({ tipo: 'aviso', texto: avisoRodada })
      return
    }
    if (rodada.aviso) notificar({ tipo: 'aviso', texto: rodada.aviso })
    const chefeId = agentesAoVivoRef.current?.find((a) => a.tipo === 'chefe')?.id
    for (const interacao of rodada.interacoes) {
      const cor = corDoAgente(interacao.agente_nome)
      if (interacao.aviso) {
        notificar({ tipo: 'aviso', titulo: interacao.agente_nome, texto: interacao.aviso, cor })
      } else if (interacao.tipo === 'trabalho' && interacao.motivo) {
        notificar({ tipo: 'info', titulo: interacao.agente_nome, texto: interacao.motivo, cor })
        // som só pra trabalho proativo — um "bipe" a cada papo social ia virar ruído
        if (somAtivo()) tocarSom()
      } else if (interacao.tipo === 'social' && interacao.quer_falar && interacao.mensagem && interacao.destinatario_id === chefeId) {
        notificar({ tipo: 'info', titulo: interacao.agente_nome, texto: interacao.mensagem, cor })
      }
    }
  }

  // o modo simulado (dry_run) é para conferir sem gastar: automático real ficaria contraditório, então fica desligado nele
  useTickAutomatico({
    ligado: autoLigado && !dryRunAtivo,
    aoRodar: (r) => notificarResultadoDaRodada(r.rodada),
    aoParar: (mensagem) => {
      setAutoLigado(false)
      notificar({ tipo: 'aviso', titulo: 'tick automático', texto: mensagem })
    },
  })

  function aoClicarAvancar() {
    avancar.mutate(dryRunAtivo, {
      onSuccess: (resultado) => {
        setUltimoResultado(resultado)
        if (dryRunAtivo) {
          salvarPreview(resultado)
          return
        }
        notificarResultadoDaRodada(resultado.rodada, resultado.avisoRodada)
      },
      onError: (erro) => notificar({ tipo: 'erro', texto: mensagemDeErro(erro) }),
    })
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // Esc fecha o painel aberto — vale até dentro de campo de texto, que é onde a mão está quando se quer fechar
      if (e.key === 'Escape' && (painel || atalho)) {
        setPainel(null)
        setAtalho(null)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [painel, atalho])

  const fecharAtalho = useCallback(() => setAtalho(null), [])
  const ancoraDoAtalho = useCallback(() => (atalho ? (mundo?.ancora(atalho) ?? null) : null), [mundo, atalho])

  const alternar = (p: Painel) => {
    setAtalho(null)
    setPainel((atual) => (atual?.tipo === p.tipo ? null : p))
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--void)', fontFamily: 'var(--fonte-display), ui-monospace, monospace', color: 'var(--ink)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 14px',
          background: 'var(--deck)',
          borderBottom: '1px solid var(--deck-line)',
          flexShrink: 0,
          zIndex: 70,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />
          <strong style={{ fontSize: 16, letterSpacing: '0.02em' }}>hubbia</strong>
        </div>

        <div title="relógio simulado do motor de tick" style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: 'var(--ink-dim)' }}>
          <RelogioDoTopo relogio={relogioMundo} />
          <span>tick {tick?.numero ?? '—'}</span>
          {dryRunAtivo && <span style={{ color: 'var(--official)' }}>· modo simulado</span>}
        </div>

        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <BotaoBarra titulo="prédio: agentes e vagas" ativo={painel?.tipo === 'predio'} onClick={() => alternar({ tipo: 'predio' })}>
            <IconePredio tamanho={18} />
          </BotaoBarra>
          <BotaoBarra titulo="mensagens" ativo={painel?.tipo === 'mensagens'} badge={contagemNaoLidas > 0} onClick={() => alternar({ tipo: 'mensagens' })}>
            <IconeMensagens tamanho={18} />
          </BotaoBarra>
          <BotaoBarra titulo="configurações" ativo={painel?.tipo === 'configuracoes'} onClick={() => alternar({ tipo: 'configuracoes' })}>
            <IconeConfiguracoes tamanho={18} />
          </BotaoBarra>
          <BotaoBarra titulo="sala de máquinas" ativo={painel?.tipo === 'maquinas'} onClick={() => alternar({ tipo: 'maquinas' })}>
            <IconeSalaDeMaquinas tamanho={18} />
          </BotaoBarra>
          <button
            onClick={() => setAutoLigado((v) => !v)}
            disabled={dryRunAtivo}
            aria-pressed={autoLigado && !dryRunAtivo}
            title={
              dryRunAtivo
                ? 'tick automático indisponível no modo simulado'
                : autoLigado
                  ? 'tick automático ligado: uma rodada de tempos em tempos, só no expediente e sob o orçamento. Clique para desligar'
                  : 'ligar o tick automático (desligado por padrão)'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 11px',
              borderRadius: 8,
              border: `1px solid ${autoLigado && !dryRunAtivo ? 'rgba(var(--accent-rgb), 0.5)' : 'var(--deck-line)'}`,
              background: autoLigado && !dryRunAtivo ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: autoLigado && !dryRunAtivo ? 'var(--accent)' : 'var(--ink)',
              font: 'inherit',
              fontSize: 12,
              cursor: dryRunAtivo ? 'default' : 'pointer',
              opacity: dryRunAtivo ? 0.45 : 1,
            }}
          >
            {autoLigado && !dryRunAtivo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'consolePing 1.8s cubic-bezier(.4,0,.6,1) infinite' }} />}
            auto
          </button>
          <button
            onClick={aoClicarAvancar}
            disabled={avancar.isPending}
            title={dryRunAtivo ? 'conferir 1 tick (modo simulado ligado)' : 'avançar 1 tick'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginLeft: 6,
              font: 'inherit',
              fontSize: 12,
              fontWeight: 700,
              color: '#0b0e14',
              background: dryRunAtivo ? 'var(--official)' : 'var(--good)',
              border: 'none',
              borderRadius: 8,
              padding: '7px 12px',
              cursor: avancar.isPending ? 'default' : 'pointer',
              opacity: avancar.isPending ? 0.6 : 1,
              animation: avancar.isPending ? undefined : 'consoleGoGlow 2.6s ease-in-out infinite',
            }}
          >
            <IconeAvancarTick tamanho={16} />
            {dryRunAtivo ? 'conferir tick' : 'avançar tick'}
          </button>
        </nav>
      </header>

      <main ref={areaRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={hospedeiroRef} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'auto', padding: 16 }} />

        {atalho === 'vita' && <BolhaVita ancora={ancoraDoAtalho} area={areaRef} aoFechar={fecharAtalho} />}

        {painel?.tipo === 'agente' && agentePorId(painel.id) && <PainelDoAgente agenteId={painel.id} aoFechar={() => setPainel(null)} />}
        {painel?.tipo === 'mensagens' && <PainelMensagens aoFechar={() => setPainel(null)} />}
        {painel?.tipo === 'configuracoes' && (
          <PainelConfiguracoes aoFechar={() => setPainel(null)} dryRunAtivo={dryRunAtivo} aoAlternarDryRun={aoAlternarDryRun} ultimoResultado={ultimoResultado} />
        )}
        {painel?.tipo === 'maquinas' && <PainelSalaDeMaquinas aoFechar={() => setPainel(null)} />}
        {painel?.tipo === 'predio' && mundo && (
          <PainelPredio mundo={mundo} vaga={painel.vaga} aoAbrir={abrirAgente} aoFechar={() => setPainel(null)} />
        )}

        <Toasts toasts={toasts} aoFechar={fechar} />
      </main>
    </div>
  )
}

function BotaoBarra({
  children,
  titulo,
  onClick,
  ativo = false,
  badge = false,
}: {
  children: React.ReactNode
  titulo: string
  onClick: () => void
  ativo?: boolean
  badge?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      style={{
        position: 'relative',
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${ativo ? 'rgba(var(--accent-rgb), 0.5)' : 'var(--deck-line)'}`,
        background: ativo ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
        color: ativo ? 'var(--accent)' : 'var(--ink)',
        cursor: 'pointer',
      }}
    >
      {children}
      {badge && (
        <span style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10 }} aria-label="mensagens não lidas">
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--danger)', border: '2px solid var(--deck)' }} />
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--danger)', animation: 'consolePing 1.8s cubic-bezier(.4,0,.6,1) infinite' }} />
        </span>
      )}
    </button>
  )
}
