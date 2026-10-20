import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { criarCena, type Cena } from './cena'
import { criarCena3D, type ControladorCena3D, type ProjecaoSimTela } from './cena3d'
import type { ModoParedesSims } from './moveis3d'
import { criarEditor, type Editor, type EstadoEditor } from './edicao'
import { carregarSala, definirSalaAtual, recarregarDeProposito, todasAsSalasComRascunho } from './persistencia'
import { PALETAS } from './sala'
import { AGENTES } from './agentes'
import { rotuloDe } from './catalogo'
import { conferirConjuntoDeSalas } from './sala-conferir'
import { PainelEdicao } from './PainelEdicao'
import { CatalogoTheSims } from './CatalogoTheSims'
import { CriadorSimCAS } from './CriadorSimCAS'
import { PainelProblemas } from './PainelProblemas'
import { PainelSalas } from './PainelSalas'
import { PopupPorta } from './PopupPorta'
import { PainelDoAgente } from '../agentes/PainelDoAgente'
import { PainelMensagens } from '../agentes/PainelMensagens'
import { PainelConfiguracoes } from './PainelConfiguracoes'
import { HudTheSims } from './HudTheSims'
import { MenuPie, type EstadoMenuPie } from './MenuPie'
import {
  aplicarInteracoesBackendNoMundo,
  avancarSimulacaoSims,
  calcularCorPlumbBob,
  cancelarInteracaoSim,
  criarEstadoMundoSims,
  enfileirarInteracaoSim,
  escolherInteracaoParaNecessidade,
  integrarSimDoCASNoMundo,
  obterInteracoesDoChao,
  obterInteracoesDoMovel,
  obterInteracoesDoSim,
  type ChaveNecessidade,
  type EstadoMundoSims,
  type OpcaoPieMenu,
  type VelocidadeTempo,
} from './simulacao-sims'
import { criarControladorCamera, pontoMundoDoSim, type ControladorCamera } from './camera'
import { Toasts, useToasts } from './Toasts'
import { useAvancarMundo, type ResultadoAvancoMundo } from '../../hooks/useMundo'
import { useContagemNaoLidas } from '../../hooks/useMensagens'
import { useAgentes } from '../../hooks/useAgentes'
import { definirDryRunAtivo, dryRunEstaAtivo, lerPreviewSalva, salvarPreview } from './dry-run'
import { somAtivo, tocarSom } from './som'
import { corCss } from '../agentes/RetratoAgente'
import { mensagemDeErro } from '../../api/client'
import type { EstadoAgente } from '../../types/agente'
import type { RodadaProcessada } from '../../types/interacao'

// Hospeda o mundo 3D estilo The Sims 4 (Three.js WebGL com personagens 3D
// articulados, vizinhança, móveis 3D e paredes com modo Cutaway) e também
// preserva a maquete 2D isométrica (PixiJS) para comparação direta.
export function Escritorio() {
  const hospedeiro3DRef = useRef<HTMLDivElement>(null)
  const hospedeiro2DRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const cenaRef = useRef<Cena | null>(null)
  const cena3DRef = useRef<ControladorCena3D | null>(null)
  const cameraRef = useRef<ControladorCamera | null>(null)

  const [modo3DAtivo, setModo3DAtivo] = useState(true)
  const [modoParedes, setModoParedes] = useState<ModoParedesSims>('cortadas')
  const [projecoes3D, setProjecoes3D] = useState<Record<string, ProjecaoSimTela>>({})
  const [estado, setEstado] = useState<EstadoEditor | null>(null)
  const [catalogoAberto, setCatalogoAberto] = useState(true)
  const [criadorCASAberto, setCriadorCASAberto] = useState(false)
  const [salasAbertas, setSalasAbertas] = useState(false)
  const [problemas, setProblemas] = useState<string[]>([])
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null)
  const [mensagensAbertas, setMensagensAbertas] = useState(false)
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false)
  const [menuPie, setMenuPie] = useState<EstadoMenuPie | null>(null)

  const [mundoSims, setMundoSims] = useState<EstadoMundoSims>(() => {
    const { sala } = carregarSala()
    return criarEstadoMundoSims(sala)
  })
  const mundoSimsRef = useRef<EstadoMundoSims>(mundoSims)
  mundoSimsRef.current = mundoSims

  const [dryRunAtivo, setDryRunAtivoState] = useState(dryRunEstaAtivo)
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoAvancoMundo | null>(() =>
    dryRunEstaAtivo() ? lerPreviewSalva() : null,
  )
  const avancar = useAvancarMundo()
  const contagemNaoLidas = useContagemNaoLidas()
  const { toasts, notificar, fechar } = useToasts()
  const { data: agentesAoVivo } = useAgentes()
  const agentesAoVivoRef = useRef<typeof agentesAoVivo>(undefined)
  agentesAoVivoRef.current = agentesAoVivo

  const aplicarEstadosNaCena = useCallback(() => {
    const dados = agentesAoVivoRef.current
    if (!dados) return
    if (cenaRef.current) {
      const estados = new Map<string, EstadoAgente>()
      for (const local of AGENTES) {
        const aoVivo = dados.find((a) => a.nome === local.nome)
        if (aoVivo) estados.set(local.id, aoVivo.estado)
      }
      cenaRef.current.definirEstadosAgentes(estados)
    }
    setMundoSims((anterior) => {
      const novosSims = { ...anterior.sims }
      for (const local of AGENTES) {
        const aoVivo = dados.find((a) => a.nome === local.nome)
        if (aoVivo && novosSims[local.id]) {
          novosSims[local.id] = {
            ...novosSims[local.id],
            estadoBackend: aoVivo.estado,
          }
        }
      }
      return { ...anterior, sims: novosSims }
    })
  }, [])

  function aoAlternarDryRun(ativo: boolean) {
    definirDryRunAtivo(ativo)
    setDryRunAtivoState(ativo)
    setUltimoResultado(ativo ? lerPreviewSalva() : null)
  }

  function corDoAgente(nome: string): string | undefined {
    const local = AGENTES.find((a) => a.nome === nome)
    return local ? corCss(local.cor) : undefined
  }

  function notificarResultadoDaRodada(rodada: RodadaProcessada | null, avisoRodada?: string) {
    if (!rodada) {
      if (avisoRodada) notificar({ tipo: 'aviso', texto: avisoRodada })
      return
    }
    if (rodada.aviso) notificar({ tipo: 'aviso', texto: rodada.aviso })

    const chefeId = agentesAoVivoRef.current?.find((a) => a.tipo === 'chefe')?.id

    if (rodada.interacoes.length > 0) {
      setMundoSims((atual) => aplicarInteracoesBackendNoMundo(atual, rodada.interacoes))
    }

    for (const interacao of rodada.interacoes) {
      const cor = corDoAgente(interacao.agente_nome)
      if (interacao.aviso) {
        notificar({ tipo: 'aviso', titulo: interacao.agente_nome, texto: interacao.aviso, cor })
      } else if (interacao.tipo === 'trabalho' && interacao.motivo) {
        notificar({ tipo: 'info', titulo: interacao.agente_nome, texto: interacao.motivo, cor })
        if (somAtivo()) tocarSom()
      } else if (
        interacao.tipo === 'social' &&
        interacao.quer_falar &&
        interacao.mensagem &&
        interacao.destinatario_id === chefeId
      ) {
        notificar({ tipo: 'info', titulo: interacao.agente_nome, texto: interacao.mensagem, cor })
      }
    }
  }

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

  const executarOpcaoPieMenu = useCallback((opcao: OpcaoPieMenu) => {
    const mAtual = mundoSimsRef.current
    if (opcao.acaoEspecial === 'selecionar_sim' && opcao.alvoSimId) {
      setMundoSims((ant) => ({ ...ant, simAtivoId: opcao.alvoSimId! }))
      return
    }
    if (opcao.acaoEspecial === 'abrir_painel_hubbia') {
      const idPainel = opcao.alvoSimId ?? mAtual.simAtivoId
      setAgenteAberto(idPainel)
      setMensagensAbertas(false)
      setConfiguracoesAbertas(false)
      return
    }
    const salaAtual = cenaRef.current?.maquete.sala ?? carregarSala().sala
    if (opcao.acaoEspecial === 'chamar_todos' && opcao.alvoPosicao) {
      setMundoSims((ant) => {
        let novo = ant
        Object.keys(ant.sims).forEach((simId, idx) => {
          const offsetCol = opcao.alvoPosicao!.coluna + (idx % 2 === 0 ? -0.45 : 0.45)
          const offsetLin = opcao.alvoPosicao!.linha + (idx < 2 ? -0.45 : 0.45)
          novo = enfileirarInteracaoSim(
            novo,
            simId,
            {
              ...opcao,
              acaoEspecial: undefined,
              alvoPosicao: { coluna: offsetCol, linha: offsetLin },
            },
            true,
            salaAtual,
          )
        })
        return novo
      })
      return
    }

    setMundoSims((ant) => enfileirarInteracaoSim(ant, ant.simAtivoId, opcao, true, salaAtual))
  }, [])

  // Monta tanto o Motor 3D WebGL (Three.js) quanto a Maquete/Editor 2D (PixiJS)
  useEffect(() => {
    const hospedeiro3D = hospedeiro3DRef.current
    const hospedeiro2D = hospedeiro2DRef.current
    if (!hospedeiro3D || !hospedeiro2D) return

    let desmontado = false
    let app: Application | null = null

    const { sala, idSala } = carregarSala()

    // 1. Inicializa imediatamente o Mundo 3D WebGL (The Sims 4)
    const ctrl3D = criarCena3D(hospedeiro3D, sala, mundoSimsRef.current, {
      aoClicarSim: (id, telaX, telaY) => {
        const m = mundoSimsRef.current
        const alvo = m.sims[id]
        const ativo = m.sims[m.simAtivoId]
        if (alvo && ativo) {
          setMenuPie({
            x: telaX,
            y: telaY,
            tituloAlvo: `${alvo.nome} (${alvo.funcao})`,
            opcoes: obterInteracoesDoSim(alvo, ativo),
          })
        }
      },
      aoClicarMovelSimulacao: (movel, telaX, telaY) => {
        const m = mundoSimsRef.current
        const ativo = m.sims[m.simAtivoId]
        if (!ativo) return
        const moveisAtuais = cenaRef.current?.maquete.moveis ?? sala.moveis
        setMenuPie({
          x: telaX,
          y: telaY,
          tituloAlvo: rotuloDe(movel.peca),
          opcoes: obterInteracoesDoMovel(movel, moveisAtuais, ativo),
        })
      },
      aoClicarPorta: (salaDestino) => {
        definirSalaAtual(salaDestino)
        recarregarDeProposito()
      },
      aoClicarPiso: (coluna, linha, telaX, telaY) => {
        setMenuPie({
          x: telaX,
          y: telaY,
          tituloAlvo: linha > (sala.linhas || 7) - 0.5
            ? `Calçada / Vizinhança (${coluna.toFixed(1)}, ${linha.toFixed(1)})`
            : `Piso 3D (${coluna.toFixed(1)}, ${linha.toFixed(1)})`,
          opcoes: obterInteracoesDoChao(coluna, linha, sala.linhas || 7),
        })
      },
      aoSelecionarMovelConstrucao: (movelId) => {
        editorRef.current?.selecionar(movelId)
      },
      aoArrastarMovelConstrucao: (movelId, novaColuna, novaLinha) => {
        const movelAtual = cenaRef.current?.maquete.movel(movelId)
        if (!movelAtual || !cenaRef.current) return
        const dCol = novaColuna - movelAtual.coluna
        const dLin = novaLinha - movelAtual.linha
        if (Math.hypot(dCol, dLin) > 0.01) {
          cenaRef.current.maquete.mover(movelId, dCol, dLin)
          setEstado(editorRef.current?.estado() ?? null)
        }
      },
      aoDesativarSeguirCamera: () => {
        setMundoSims((ant) => (ant.seguirSimAtivo ? { ...ant, seguirSimAtivo: false } : ant))
      },
      aoAtualizarProjecoes: (projecoes) => {
        setProjecoes3D(projecoes)
      },
    })
    cena3DRef.current = ctrl3D

    // 2. Monta a Maquete/Editor 2D em paralelo (dona da persistência e undo/redo da sala)
    async function montarPixi() {
      const corFundo = typeof sala.paleta?.vazio === 'number' ? sala.paleta.vazio : PALETAS.neutra.vazio

      const aplicacao = new Application()
      await aplicacao.init({
        background: corFundo,
        resizeTo: hospedeiro2D!,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (desmontado) {
        aplicacao.destroy(true, { children: true })
        return
      }

      app = aplicacao
      hospedeiro2D!.appendChild(aplicacao.canvas)

      const mundo = new Container()
      aplicacao.stage.addChild(mundo)

      const cena = await criarCena(sala, {
        aoClicarAgente: (id, telaX, telaY) => {
          if (typeof telaX === 'number' && typeof telaY === 'number') {
            const m = mundoSimsRef.current
            const alvo = m.sims[id]
            const ativo = m.sims[m.simAtivoId]
            if (alvo && ativo) {
              setMenuPie({
                x: telaX,
                y: telaY,
                tituloAlvo: `${alvo.nome} (${alvo.funcao})`,
                opcoes: obterInteracoesDoSim(alvo, ativo),
              })
              return
            }
          }
          setAgenteAberto(id)
          setMensagensAbertas(false)
          setConfiguracoesAbertas(false)
        },
        aoClicarMovelSimulacao: (movel, telaX, telaY) => {
          const m = mundoSimsRef.current
          const ativo = m.sims[m.simAtivoId]
          if (!ativo) return
          const opcoes = obterInteracoesDoMovel(
            movel,
            cenaRef.current?.maquete.moveis ?? sala.moveis,
            ativo,
          )
          setMenuPie({
            x: telaX,
            y: telaY,
            tituloAlvo: rotuloDe(movel.peca),
            opcoes,
          })
        },
        aoClicarPiso: (coluna, linha, telaX, telaY) => {
          setMenuPie({
            x: telaX,
            y: telaY,
            tituloAlvo: `Piso (${coluna.toFixed(1)}, ${linha.toFixed(1)})`,
            opcoes: obterInteracoesDoChao(coluna, linha),
          })
        },
      })
      if (desmontado) return
      mundo.addChild(cena.raiz)
      cenaRef.current = cena
      cena.sincronizarMundoSims(mundoSimsRef.current)
      aplicarEstadosNaCena()

      const problemasConjunto = conferirConjuntoDeSalas(todasAsSalasComRascunho())
      setProblemas([...cena.problemas, ...problemasConjunto])

      const editor = criarEditor(
        cena,
        mundo,
        aplicacao.stage,
        () => {
          const atual = editorRef.current?.estado() ?? null
          setEstado(atual)
          cena.definirAgentesClicaveis(!atual?.ativo)
          if (atual?.ativo) setMenuPie(null)
          // Sincroniza qualquer edição de móvel (girar, adicionar, desfazer, excluir) com a cena 3D!
          cena3DRef.current?.sincronizarSala(
            cena.maquete.exportar(),
            atual?.selecionado?.id ?? null,
            Boolean(atual?.ativo),
          )
        },
        idSala,
      )
      editorRef.current = editor
      setEstado(editor.estado())

      cameraRef.current = criarControladorCamera(
        aplicacao,
        mundo,
        () => !(editorRef.current?.estado().ativo ?? false),
        () => {
          setMundoSims((ant) => (ant.seguirSimAtivo ? { ...ant, seguirSimAtivo: false } : ant))
        },
      )
    }

    void montarPixi()

    return () => {
      desmontado = true
      cena3DRef.current?.destruir()
      cena3DRef.current = null
      cameraRef.current?.destruir()
      cameraRef.current = null
      editorRef.current?.destruir()
      editorRef.current = null
      cenaRef.current?.destruirAnimacoes()
      cenaRef.current = null
      app?.destroy(true, { children: true })
    }
  }, [aplicarEstadosNaCena])

  // Loop de simulação The Sims (4Hz)
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (editorRef.current?.estado().ativo) return
      const salaAtual = cenaRef.current?.maquete.sala
      if (!salaAtual) return
      setMundoSims((anterior) => avancarSimulacaoSims(anterior, salaAtual, 0.25))
    }, 250)
    return () => window.clearInterval(intervalo)
  }, [])

  // Sincroniza mundo Sims com as cenas 3D e 2D e processa viagem por porta
  useEffect(() => {
    if (mundoSims.salaPendenteViagem) {
      definirSalaAtual(mundoSims.salaPendenteViagem)
      recarregarDeProposito()
      return
    }
    cena3DRef.current?.sincronizarMundoSims(mundoSims)
    cenaRef.current?.sincronizarMundoSims(mundoSims)
    if (mundoSims.seguirSimAtivo) {
      const ativo = mundoSims.sims[mundoSims.simAtivoId]
      if (ativo) {
        cameraRef.current?.definirSeguirPonto(pontoMundoDoSim(ativo.coluna, ativo.linha))
      }
    } else {
      cameraRef.current?.definirSeguirPonto(null)
    }
  }, [mundoSims])

  useEffect(() => {
    cena3DRef.current?.definirModoParedes(modoParedes)
  }, [modoParedes])

  useEffect(() => {
    aplicarEstadosNaCena()
  }, [agentesAoVivo, aplicarEstadosNaCena])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (menuPie) {
          setMenuPie(null)
          return
        }
        if (agenteAberto || mensagensAbertas || configuracoesAbertas || salasAbertas) {
          setAgenteAberto(null)
          setMensagensAbertas(false)
          setConfiguracoesAbertas(false)
          setSalasAbertas(false)
          return
        }
      }

      if (mensagensAbertas || configuracoesAbertas || agenteAberto) return

      const editor = editorRef.current
      if (!editor) return
      const alvo = e.target as HTMLElement | null
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return

      if (e.key === 'e' || e.key === 'E') {
        editor.alternar()
        return
      }

      if (!editor.estado().ativo) {
        if (e.key === '0' || e.key === ' ') {
          e.preventDefault()
          setMundoSims((ant) => ({ ...ant, velocidade: ant.velocidade === 0 ? 1 : 0 }))
          return
        }
        if (e.key === '1' || e.key === '2' || e.key === '3') {
          const v = Number(e.key) as VelocidadeTempo
          setMundoSims((ant) => ({ ...ant, velocidade: v }))
          return
        }
        if (e.key === 'q' || e.key === 'Q' || e.key === ',') {
          cena3DRef.current?.girarCameraHorizontal(-0.28)
          return
        }
        if (e.key === 'r' || e.key === 'R' || e.key === '.') {
          cena3DRef.current?.girarCameraHorizontal(0.28)
          return
        }
        if (e.key === 'w' || e.key === 'W') {
          cena3DRef.current?.deslocarCameraTeclado(0, 0.55)
          cameraRef.current?.deslocarPorTeclado(0, 42)
          return
        }
        if (e.key === 's' || e.key === 'S') {
          cena3DRef.current?.deslocarCameraTeclado(0, -0.55)
          cameraRef.current?.deslocarPorTeclado(0, -42)
          return
        }
        if (e.key === 'a' || e.key === 'A') {
          cena3DRef.current?.deslocarCameraTeclado(-0.55, 0)
          cameraRef.current?.deslocarPorTeclado(42, 0)
          return
        }
        if (e.key === 'd' || e.key === 'D') {
          cena3DRef.current?.deslocarCameraTeclado(0.55, 0)
          cameraRef.current?.deslocarPorTeclado(-42, 0)
          return
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) editor.refazer()
        else editor.desfazer()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        editor.refazer()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        editor.copiar()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        editor.colar()
        return
      }

      const setas: Record<string, [number, number]> = {
        ArrowUp: [-1, -1],
        ArrowDown: [1, 1],
        ArrowRight: [1, -1],
        ArrowLeft: [-1, 1],
      }
      const seta = setas[e.key]
      if (seta) {
        e.preventDefault()
        editor.mover(seta[0], seta[1])
        return
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          editor.ciclar(e.shiftKey ? -1 : 1)
          break
        case 'q':
        case 'Q':
          editor.girar(-1)
          break
        case 'w':
        case 'W':
          editor.girar(1)
          break
        case 'a':
        case 'A':
        case 'PageUp':
          e.preventDefault()
          editor.mudarAltura(0.02)
          break
        case 'z':
        case 'Z':
        case 'PageDown':
          e.preventDefault()
          editor.mudarAltura(-0.02)
          break
        case '[':
          editor.mudarPasso(-1)
          break
        case ']':
          editor.mudarPasso(1)
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          editor.remover()
          break
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [agenteAberto, mensagensAbertas, configuracoesAbertas, salasAbertas, menuPie])

  const chamar = useCallback((f: (e: Editor) => void) => {
    const editor = editorRef.current
    if (editor) f(editor)
  }, [])

  const simAtivo = mundoSims.sims[mundoSims.simAtivoId] ?? Object.values(mundoSims.sims)[0]
  const plumbAtivo = simAtivo
    ? calcularCorPlumbBob(simAtivo.necessidades)
    : { corHex: '#6ec71f', corNum: 0x6ec71f, nivelCritico: 'verde' as const }

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      {/* Hospedeiro 3D WebGL (The Sims 4) */}
      <div
        ref={hospedeiro3DRef}
        style={{
          width: '100%',
          height: '100%',
          display: modo3DAtivo ? 'block' : 'none',
        }}
      />

      {/* Hospedeiro 2D PixiJS (Maquete Isométrica Habbo) */}
      <div
        ref={hospedeiro2DRef}
        style={{
          width: '100%',
          height: '100%',
          display: modo3DAtivo ? 'none' : 'block',
        }}
      />

      {/* Menu Radial Pie Menu (The Sims 4) */}
      <MenuPie
        menu={menuPie}
        simAtivoId={mundoSims.simAtivoId}
        corPlumbBobHex={plumbAtivo.corHex}
        aoEscolher={executarOpcaoPieMenu}
        aoFechar={() => setMenuPie(null)}
      />

      {/* HUD Principal Estilo The Sims 4 */}
      <HudTheSims
        mundo={mundoSims}
        modo3DAtivo={modo3DAtivo}
        modoParedes={modoParedes}
        projecoes3D={projecoes3D}
        modoConstruirAtivo={Boolean(estado?.ativo)}
        salasAbertas={salasAbertas}
        mensagensAbertas={mensagensAbertas}
        configuracoesAbertas={configuracoesAbertas}
        contagemNaoLidas={contagemNaoLidas}
        dryRunAtivo={dryRunAtivo}
        avancandoTick={avancar.isPending}
        aoSelecionarSim={(simId) => {
          setMundoSims((ant) => ({ ...ant, simAtivoId: simId }))
        }}
        aoAbrirPainelAgente={(simId) => {
          setAgenteAberto(simId)
          setMensagensAbertas(false)
          setConfiguracoesAbertas(false)
        }}
        aoMudarVelocidade={(velocidade) => {
          setMundoSims((ant) => ({ ...ant, velocidade }))
        }}
        aoAlternarAutonomia={() => {
          setMundoSims((ant) => ({ ...ant, autonomiaAtiva: !ant.autonomiaAtiva }))
        }}
        aoAlternarSeguirSim={() => {
          setMundoSims((ant) => ({ ...ant, seguirSimAtivo: !ant.seguirSimAtivo }))
        }}
        aoAlternarModo3D={() => {
          setModo3DAtivo((v) => !v)
        }}
        aoCiclarModoParedes={() => {
          setModoParedes((atual) =>
            atual === 'cortadas' ? 'altas' : atual === 'altas' ? 'baixas' : 'cortadas',
          )
        }}
        aoGirarCamera3D={(direcao) => {
          cena3DRef.current?.girarCameraHorizontal(direcao * 0.38)
        }}
        aoZoom={(fator) => {
          if (modo3DAtivo) cena3DRef.current?.aplicarZoom(fator)
          else cameraRef.current?.aplicarZoom(fator)
        }}
        aoCentralizarCamera={() => {
          setMundoSims((ant) => ({ ...ant, seguirSimAtivo: false }))
          if (modo3DAtivo) cena3DRef.current?.centralizarCamera()
          else cameraRef.current?.centralizarSala(false)
        }}
        aoCancelarInteracao={(indice) => {
          setMundoSims((ant) => cancelarInteracaoSim(ant, ant.simAtivoId, indice))
        }}
        aoAutoResolverNecessidade={(chave: ChaveNecessidade) => {
          const salaAtual = cenaRef.current?.maquete.sala
          if (!salaAtual) return
          setMundoSims((ant) => {
            const s = ant.sims[ant.simAtivoId]
            if (!s) return ant
            const op = escolherInteracaoParaNecessidade(s, chave, ant, salaAtual)
            if (!op) return ant
            return enfileirarInteracaoSim(ant, ant.simAtivoId, op, true)
          })
        }}
        aoInteragirComColega={(alvoSimId, tipo) => {
          setMundoSims((ant) => {
            const s = ant.sims[ant.simAtivoId]
            const alvo = ant.sims[alvoSimId]
            if (!s || !alvo) return ant
            const opcoes = obterInteracoesDoSim(alvo, s)
            const escolhida = opcoes.find((o) =>
              tipo === 'papo' ? o.id.startsWith('social-papo-') : o.id.startsWith('social-projeto-'),
            )
            if (!escolhida) return ant
            return enfileirarInteracaoSim(ant, ant.simAtivoId, escolhida, true)
          })
        }}
        aoAlternarModoConstruir={() => chamar((e) => e.alternar())}
        aoAlternarSalas={() => setSalasAbertas((v) => !v)}
        aoAlternarMensagens={() => {
          setMensagensAbertas((v) => !v)
          setAgenteAberto(null)
          setConfiguracoesAbertas(false)
        }}
        aoAlternarConfiguracoes={() => {
          setConfiguracoesAbertas((v) => !v)
          setAgenteAberto(null)
          setMensagensAbertas(false)
        }}
        aoClicarAvancarTick={aoClicarAvancar}
        aoAbrirCriadorCAS={() => setCriadorCASAberto(true)}
      />

      {criadorCASAberto && (
        <CriadorSimCAS
          simInicialId={mundoSims.simAtivoId}
          aoSalvarSim={(registro, ehNovo) => {
            const salaAtual = cenaRef.current?.maquete.sala ?? carregarSala().sala
            setMundoSims((ant) => integrarSimDoCASNoMundo(ant, registro, salaAtual, ehNovo))
            cena3DRef.current?.atualizarAparenciaSim3D(registro.id, registro.aparencia)
            setCriadorCASAberto(false)
            notificar({
              tipo: 'info',
              titulo: registro.nome,
              texto: ehNovo
                ? `${registro.nome} chegou pela calçada e entrou para a equipe do Hubbia!`
                : `Visual 3D e traços de ${registro.nome} atualizados com sucesso!`,
            })
          }}
          aoRemoverSim={(simIdRemovido) => {
            setMundoSims((ant) => {
              const copia = { ...ant.sims }
              delete copia[simIdRemovido]
              return {
                ...ant,
                simAtivoId: 'cifra',
                sims: copia,
              }
            })
          }}
          aoFechar={() => setCriadorCASAberto(false)}
        />
      )}

      {estado && (
        <PainelEdicao
          estado={estado}
          mostrarDica={false}
          aoGirar={() => chamar((e) => e.girar(1))}
          aoDesfazer={() => chamar((e) => e.desfazer())}
          aoRefazer={() => chamar((e) => e.refazer())}
          aoApoiar={() => chamar((e) => e.apoiarNoDeBaixo())}
          aoRemover={() => chamar((e) => e.remover())}
          aoAtribuirAgente={(id) => chamar((e) => e.atribuirAgente(id))}
          aoAtribuirPorta={(idSala) => chamar((e) => e.atribuirPorta(idSala))}
          aoSalvarRascunho={() => chamar((e) => e.salvarRascunho())}
          aoGravarNaFonte={() => chamar((e) => e.gravarNaFonte())}
          aoVoltarParaFonte={() => chamar((e) => e.voltarParaFonte())}
          aoCopiarJson={() => chamar((e) => e.copiarJson())}
        />
      )}
      <PainelProblemas problemas={problemas} aoFechar={() => setProblemas([])} />
      {!estado?.ativo && salasAbertas && !agenteAberto && !mensagensAbertas && !configuracoesAbertas && (
        <PainelSalas />
      )}
      {!estado?.ativo && <PopupPorta popup={estado?.popupPorta ?? null} />}

      {agenteAberto && <PainelDoAgente agenteId={agenteAberto} aoFechar={() => setAgenteAberto(null)} />}
      {mensagensAbertas && <PainelMensagens aoFechar={() => setMensagensAbertas(false)} />}
      {configuracoesAbertas && (
        <PainelConfiguracoes
          aoFechar={() => setConfiguracoesAbertas(false)}
          dryRunAtivo={dryRunAtivo}
          aoAlternarDryRun={aoAlternarDryRun}
          ultimoResultado={ultimoResultado}
        />
      )}
      {estado?.ativo && (
        <CatalogoTheSims
          aberto={catalogoAberto}
          aoAlternar={() => setCatalogoAberto((v) => !v)}
          aoAdicionar={(peca) => chamar((e) => e.adicionar(peca))}
        />
      )}

      <Toasts toasts={toasts} aoFechar={fechar} />
    </div>
  )
}
