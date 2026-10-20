import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { criarCena, type Cena } from './cena'
import { criarCena3D, type ControladorCena3D } from './cena3d'
import type { ModoParedesSims } from './moveis3d'
import { criarEditor, type Editor, type EstadoEditor } from './edicao'
import { carregarSala, definirSalaAtual, recarregarDeProposito, todasAsSalasComRascunho } from './persistencia'
import { PALETAS } from './sala'
import { AGENTES } from './agentes'
import { nomeDoMovel } from './catalogo'
import { conferirConjuntoDeSalas } from './sala-conferir'
import type { SalaDados } from './sala-dados'
import { PainelEdicao } from './PainelEdicao'
import { CatalogoConstrucao } from './CatalogoConstrucao'
import { CriadorPersonagem } from './CriadorPersonagem'
import { PainelProblemas } from './PainelProblemas'
import { PainelSalas } from './PainelSalas'
import { PopupPorta } from './PopupPorta'
import { PainelDoAgente } from '../agentes/PainelDoAgente'
import { PainelMensagens } from '../agentes/PainelMensagens'
import { PainelConfiguracoes } from './PainelConfiguracoes'
import { HudSimulacao } from './HudSimulacao'
import { MenuRadial, type EstadoMenuRadial } from './MenuRadial'
import {
  aplicarInteracoesBackendNoMundo,
  avancarSimulacaoSims,
  calcularCorDiamante,
  cancelarInteracaoSim,
  criarEstadoMundoSims,
  enfileirarInteracaoSim,
  escolherInteracaoParaNecessidade,
  integrarSimDoCASNoMundo,
  obterInteracoesDoChao,
  obterInteracoesDoMovel,
  obterInteracoesDoSim,
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

// De quanto em quanto tempo o HUD (React) recebe uma foto nova do mundo.
// A cena lê o mundo TODO quadro direto da ref; o HUD só mostra número e
// barra, e 60 renders/s de um HUD inteiro custariam mais que a cena.
const INTERVALO_HUD_MS = 140
// Maior passo que o motor aceita (ver DT_MAXIMO em simulacao-sims.ts).
const PASSO_MAXIMO_MOTOR = 0.1

// Qual painel lateral está aberto. Um por vez, sempre: abrir outro troca o
// conteúdo, nunca empilha (eram três useState que cada botão tinha que
// lembrar de zerar).
type Painel = { tipo: 'agente'; id: string } | { tipo: 'mensagens' } | { tipo: 'configuracoes' } | null

// Só os 4 agentes têm painel de domínio — personagem criado no criador
// não existe no backend.
const temPainel = (id: string) => AGENTES.some((a) => a.id === id)

// Hospeda o mundo 3D (three.js, o modo principal) e a maquete 2D isométrica
// (PixiJS). A 2D fica montada mesmo escondida: é dona do editor de salas
// (persistência, desfazer) e o 3D espelha o que ela edita.
//
// O MUNDO SIMULADO mora numa ref e é avançado TODO QUADRO dentro do laço
// da cena 3D (`aoQuadro`) — que continua rodando, sem desenhar, quando a
// 2D está na tela. React só recebe fotos (INTERVALO_HUD_MS).
export function Escritorio() {
  const hospedeiro3DRef = useRef<HTMLDivElement>(null)
  const hospedeiro2DRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const cenaRef = useRef<Cena | null>(null)
  const cena3DRef = useRef<ControladorCena3D | null>(null)
  const cameraRef = useRef<ControladorCamera | null>(null)
  const etiquetasRef = useRef(new Map<string, HTMLElement>())

  const [modo3D, setModo3D] = useState(true)
  const [modoParedes, setModoParedes] = useState<ModoParedesSims>('cortadas')
  const [estado, setEstado] = useState<EstadoEditor | null>(null)
  const [catalogoAberto, setCatalogoAberto] = useState(true)
  const [criadorAberto, setCriadorAberto] = useState(false)
  const [salasAbertas, setSalasAbertas] = useState(false)
  const [problemas, setProblemas] = useState<string[]>([])
  const [painel, setPainel] = useState<Painel>(null)
  const [menu, setMenu] = useState<EstadoMenuRadial | null>(null)

  const mundoRef = useRef<EstadoMundoSims | null>(null)
  const [mundo, setMundo] = useState<EstadoMundoSims>(() => {
    const inicial = criarEstadoMundoSims(carregarSala().sala)
    mundoRef.current = inicial
    return inicial
  })

  // Toda ação do chefe passa por aqui: muda a ref e publica na hora (sem
  // esperar a próxima foto), pro clique responder no mesmo instante.
  const atualizarMundo = useCallback((f: (m: EstadoMundoSims) => EstadoMundoSims) => {
    const atual = mundoRef.current
    if (!atual) return
    const proximo = f(atual)
    if (proximo === atual) return
    mundoRef.current = proximo
    setMundo(proximo)
  }, [])

  // a sala viva é a da maquete (o editor mexe nela); antes dela montar,
  // a carregada do disco
  const salaAtual = useCallback((): SalaDados => cenaRef.current?.maquete.sala ?? carregarSala().sala, [])

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

  // Estado REAL de cada agente (backend) → anel do crachá na 2D +
  // modificador de humor na simulação. Ligação pelo nome original.
  const aplicarEstadosAoVivo = useCallback(() => {
    const dados = agentesAoVivoRef.current
    if (!Array.isArray(dados)) return
    const estados = new Map<string, EstadoAgente>()
    for (const local of AGENTES) {
      const aoVivo = dados.find((a) => a.nome === local.nome)
      if (aoVivo) estados.set(local.id, aoVivo.estado)
    }
    cenaRef.current?.definirEstadosAgentes(estados)
    atualizarMundo((m) => {
      let mudou = false
      const sims = { ...m.sims }
      for (const [id, estadoBackend] of estados) {
        if (sims[id] && sims[id].estadoBackend !== estadoBackend) {
          sims[id] = { ...sims[id], estadoBackend }
          mudou = true
        }
      }
      return mudou ? { ...m, sims } : m
    })
  }, [atualizarMundo])

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
      atualizarMundo((m) => aplicarInteracoesBackendNoMundo(m, rodada.interacoes))
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

  const abrirPainelAgente = useCallback((id: string) => {
    if (temPainel(id)) setPainel({ tipo: 'agente', id })
  }, [])

  const alternarPainel = useCallback((alvo: Exclude<Painel, null>) => {
    setPainel((atual) => (atual?.tipo === alvo.tipo ? null : alvo))
  }, [])

  const executarOpcao = useCallback(
    (opcao: OpcaoPieMenu) => {
      const sala = salaAtual()
      if (opcao.acaoEspecial === 'selecionar_sim' && opcao.alvoSimId) {
        atualizarMundo((m) => ({ ...m, simAtivoId: opcao.alvoSimId! }))
        return
      }
      if (opcao.acaoEspecial === 'abrir_painel_hubbia') {
        abrirPainelAgente(opcao.alvoSimId ?? mundoRef.current!.simAtivoId)
        return
      }
      if (opcao.acaoEspecial === 'chamar_todos' && opcao.alvoPosicao) {
        // todo mundo pro ponto, cada um num canto de um quadradinho em volta
        // dele (o encaixe livre final quem acha é o roteamento)
        const centro = opcao.alvoPosicao
        atualizarMundo((m) => {
          let novo = m
          Object.keys(m.sims).forEach((id, i) => {
            const alvoPosicao = { coluna: centro.coluna + (i % 2 === 0 ? -0.45 : 0.45), linha: centro.linha + (i < 2 ? -0.45 : 0.45) }
            novo = enfileirarInteracaoSim(novo, id, { ...opcao, acaoEspecial: undefined, alvoPosicao }, true, sala)
          })
          return novo
        })
        return
      }
      atualizarMundo((m) => enfileirarInteracaoSim(m, m.simAtivoId, opcao, true, sala))
    },
    [atualizarMundo, abrirPainelAgente, salaAtual],
  )

  // Menus que o clique na cena abre — iguais pra 3D e 2D.
  const abrirMenuDoSim = useCallback((id: string, x: number, y: number) => {
    const m = mundoRef.current!
    const alvo = m.sims[id]
    const ativo = m.sims[m.simAtivoId]
    if (!alvo || !ativo) return
    setMenu({ x, y, titulo: alvo.nome, opcoes: obterInteracoesDoSim(alvo, ativo, salaAtual()) })
  }, [salaAtual])

  const abrirMenuDoMovel = useCallback((movelId: string, x: number, y: number) => {
    const m = mundoRef.current!
    const ativo = m.sims[m.simAtivoId]
    const sala = salaAtual()
    const movel = sala.moveis.find((mv) => mv.id === movelId)
    if (!ativo || !movel) return
    setMenu({ x, y, titulo: nomeDoMovel(movel.peca), opcoes: obterInteracoesDoMovel(movel, sala.moveis, ativo, sala) })
  }, [salaAtual])

  const abrirMenuDoChao = useCallback((coluna: number, linha: number, x: number, y: number) => {
    const sala = salaAtual()
    const foraDoLote = linha > sala.linhas - 0.5
    setMenu({ x, y, titulo: foraDoLote ? 'Calçada' : 'Piso', opcoes: obterInteracoesDoChao(coluna, linha, sala.linhas, sala.colunas) })
  }, [salaAtual])

  useEffect(() => {
    const hospedeiro3D = hospedeiro3DRef.current
    const hospedeiro2D = hospedeiro2DRef.current
    if (!hospedeiro3D || !hospedeiro2D) return

    let desmontado = false
    let app: Application | null = null
    const { sala, idSala } = carregarSala()
    let desdeUltimaFoto = 0

    // O laço do motor: roda dentro do requestAnimationFrame da cena 3D.
    function aoQuadro(dt: number): EstadoMundoSims {
      let m = mundoRef.current!
      // no modo construir o tempo para — mover a cadeira de alguém com a
      // pessoa andando até ela daria destino velho
      const salaViva = cenaRef.current?.maquete.sala
      if (salaViva && !editorRef.current?.estado().ativo) {
        // em subpassos de até 0.1s: o motor limita o passo (senão rota e
        // colisão "atravessariam" coisas), e em máquina lenta o jogo não
        // pode ficar mais lento que o relógio de verdade
        for (let resta = dt; resta > 1e-4; resta -= PASSO_MAXIMO_MOTOR) {
          m = avancarSimulacaoSims(m, salaViva, Math.min(PASSO_MAXIMO_MOTOR, resta))
        }
        mundoRef.current = m
      }
      if (m.salaPendenteViagem) {
        definirSalaAtual(m.salaPendenteViagem)
        recarregarDeProposito()
        mundoRef.current = { ...m, salaPendenteViagem: null }
      }

      cenaRef.current?.sincronizarMundoSims(m)
      const seguido = m.seguirSimAtivo ? m.sims[m.simAtivoId] : undefined
      cameraRef.current?.definirSeguirPonto(seguido ? pontoMundoDoSim(seguido.coluna, seguido.linha) : null)

      desdeUltimaFoto += dt * 1000
      if (desdeUltimaFoto >= INTERVALO_HUD_MS) {
        desdeUltimaFoto = 0
        setMundo((anterior) => (anterior === m ? anterior : m))
      }
      return m
    }

    cena3DRef.current = criarCena3D(hospedeiro3D, sala, mundoRef.current!, {
      aoQuadro,
      etiquetas: () => etiquetasRef.current,
      aoClicarSim: abrirMenuDoSim,
      aoClicarMovelSimulacao: (movel, x, y) => abrirMenuDoMovel(movel.id, x, y),
      aoClicarPorta: (salaDestino) => {
        definirSalaAtual(salaDestino)
        recarregarDeProposito()
      },
      aoClicarPiso: abrirMenuDoChao,
      aoSelecionarMovelConstrucao: (movelId) => editorRef.current?.selecionar(movelId),
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
      aoDesativarSeguirCamera: () => atualizarMundo((m) => (m.seguirSimAtivo ? { ...m, seguirSimAtivo: false } : m)),
    })

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

      const mundoPixi = new Container()
      aplicacao.stage.addChild(mundoPixi)

      // clique que na verdade foi o fim de um arraste de câmera não é clique
      const foiArraste = () => cameraRef.current?.acabouDeArrastar() ?? false

      const cena = await criarCena(sala, {
        aoClicarAgente: (id, x, y) => {
          if (foiArraste()) return
          if (typeof x === 'number' && typeof y === 'number') abrirMenuDoSim(id, x, y)
          else abrirPainelAgente(id)
        },
        aoClicarMovelSimulacao: (movel, x, y) => {
          if (!foiArraste()) abrirMenuDoMovel(movel.id, x, y)
        },
        aoClicarPiso: (coluna, linha, x, y) => {
          if (!foiArraste()) abrirMenuDoChao(coluna, linha, x, y)
        },
      })
      if (desmontado) return
      mundoPixi.addChild(cena.raiz)
      cenaRef.current = cena
      cena.sincronizarMundoSims(mundoRef.current!)
      aplicarEstadosAoVivo()

      setProblemas([...cena.problemas, ...conferirConjuntoDeSalas(todasAsSalasComRascunho())])

      const editor = criarEditor(
        cena,
        mundoPixi,
        aplicacao.stage,
        () => {
          const atual = editorRef.current?.estado() ?? null
          setEstado(atual)
          cena.definirAgentesClicaveis(!atual?.ativo)
          if (atual?.ativo) setMenu(null)
          // toda edição de móvel (girar, adicionar, desfazer, excluir) vai
          // pro 3D também — a maquete é a dona da sala
          cena3DRef.current?.sincronizarSala(cena.maquete.exportar(), atual?.selecionado?.id ?? null, Boolean(atual?.ativo))
        },
        idSala,
      )
      editorRef.current = editor
      setEstado(editor.estado())

      cameraRef.current = criarControladorCamera(
        aplicacao,
        mundoPixi,
        () => !(editorRef.current?.estado().ativo ?? false),
        () => atualizarMundo((m) => (m.seguirSimAtivo ? { ...m, seguirSimAtivo: false } : m)),
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
  }, [aplicarEstadosAoVivo, atualizarMundo, abrirMenuDoSim, abrirMenuDoMovel, abrirMenuDoChao, abrirPainelAgente])

  useEffect(() => {
    cena3DRef.current?.definirModoParedes(modoParedes)
  }, [modoParedes])

  useEffect(() => {
    cena3DRef.current?.definirVisivel(modo3D)
  }, [modo3D])

  useEffect(() => {
    aplicarEstadosAoVivo()
  }, [agentesAoVivo, aplicarEstadosAoVivo])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (menu) setMenu(null)
        else if (painel || salasAbertas) {
          setPainel(null)
          setSalasAbertas(false)
        }
        return
      }

      if (painel || criadorAberto) return
      const editor = editorRef.current
      if (!editor) return
      const alvo = e.target as HTMLElement | null
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return

      if (e.key === 'e' || e.key === 'E') {
        editor.alternar()
        return
      }

      // Modo simulação: espaço/0 pausa, 1-3 velocidade, WASD câmera,
      // Q/R (ou , .) giram a câmera 3D.
      if (!editor.estado().ativo) {
        const tecla = e.key.toLowerCase()
        if (tecla === ' ' || tecla === '0') {
          // espaço com foco num botão do HUD também "clicaria" nele
          e.preventDefault()
          atualizarMundo((m) => ({ ...m, velocidade: m.velocidade === 0 ? 1 : 0 }))
          return
        }
        if (tecla === '1' || tecla === '2' || tecla === '3') {
          atualizarMundo((m) => ({ ...m, velocidade: Number(tecla) as VelocidadeTempo }))
          return
        }
        if (tecla === 'q' || tecla === ',') {
          cena3DRef.current?.girarCameraHorizontal(-0.28)
          return
        }
        if (tecla === 'r' || tecla === '.') {
          cena3DRef.current?.girarCameraHorizontal(0.28)
          return
        }
        const deslocamento: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] }
        const d = deslocamento[tecla]
        if (d) {
          if (modo3D) cena3DRef.current?.deslocarCameraTeclado(d[0] * 0.55, d[1] * 0.55)
          else cameraRef.current?.deslocarPorTeclado(-d[0] * 42, d[1] * 42)
        }
        return
      }

      // Modo construir
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
  }, [painel, salasAbertas, menu, criadorAberto, modo3D, atualizarMundo])

  const chamar = useCallback((f: (e: Editor) => void) => {
    const editor = editorRef.current
    if (editor) f(editor)
  }, [])

  const registrarEtiqueta = useCallback((id: string, el: HTMLElement | null) => {
    if (el) etiquetasRef.current.set(id, el)
    else etiquetasRef.current.delete(id)
  }, [])

  const ativo = mundo.sims[mundo.simAtivoId] ?? Object.values(mundo.sims)[0]
  const construindo = Boolean(estado?.ativo)

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <div ref={hospedeiro3DRef} style={{ width: '100%', height: '100%', display: modo3D ? 'block' : 'none' }} />
      <div ref={hospedeiro2DRef} style={{ width: '100%', height: '100%', display: modo3D ? 'none' : 'block' }} />

      {ativo && (
        <MenuRadial
          menu={menu}
          agenteAtivo={ativo}
          corDiamante={calcularCorDiamante(ativo.necessidades).corHex}
          aoEscolher={executarOpcao}
          aoFechar={() => setMenu(null)}
        />
      )}

      <HudSimulacao
        mundo={mundo}
        modo3D={modo3D}
        modoParedes={modoParedes}
        construindo={construindo}
        salasAbertas={salasAbertas}
        mensagensAbertas={painel?.tipo === 'mensagens'}
        configuracoesAbertas={painel?.tipo === 'configuracoes'}
        contagemNaoLidas={contagemNaoLidas}
        dryRunAtivo={dryRunAtivo}
        avancandoTick={avancar.isPending}
        registrarEtiqueta={registrarEtiqueta}
        aoSelecionar={(id) => atualizarMundo((m) => ({ ...m, simAtivoId: id }))}
        aoAbrirPainelAgente={abrirPainelAgente}
        aoMudarVelocidade={(velocidade) => atualizarMundo((m) => ({ ...m, velocidade }))}
        aoAlternarAutonomia={() => atualizarMundo((m) => ({ ...m, autonomiaAtiva: !m.autonomiaAtiva }))}
        aoAlternarSeguir={() => atualizarMundo((m) => ({ ...m, seguirSimAtivo: !m.seguirSimAtivo }))}
        aoAlternarModo3D={() => setModo3D((v) => !v)}
        aoCiclarParedes={() => setModoParedes((a) => (a === 'cortadas' ? 'altas' : a === 'altas' ? 'baixas' : 'cortadas'))}
        aoGirarCamera={(direcao) => cena3DRef.current?.girarCameraHorizontal(direcao * 0.38)}
        aoZoom={(fator) => (modo3D ? cena3DRef.current?.aplicarZoom(fator) : cameraRef.current?.aplicarZoom(fator))}
        aoCentralizar={() => {
          atualizarMundo((m) => ({ ...m, seguirSimAtivo: false }))
          if (modo3D) cena3DRef.current?.centralizarCamera()
          else cameraRef.current?.centralizarSala(false)
        }}
        aoCancelar={(indice) => atualizarMundo((m) => cancelarInteracaoSim(m, m.simAtivoId, indice))}
        aoResolverNecessidade={(chave) => {
          const sala = salaAtual()
          atualizarMundo((m) => {
            const s = m.sims[m.simAtivoId]
            const op = s && escolherInteracaoParaNecessidade(s, chave, m, sala)
            return op ? enfileirarInteracaoSim(m, s.id, op, true, sala) : m
          })
        }}
        aoInteragirComColega={(alvoId, tipo) => {
          const sala = salaAtual()
          atualizarMundo((m) => {
            const s = m.sims[m.simAtivoId]
            const alvo = m.sims[alvoId]
            if (!s || !alvo) return m
            const prefixo = tipo === 'papo' ? 'social-papo-' : 'social-projeto-'
            const op = obterInteracoesDoSim(alvo, s, sala).find((o) => o.id.startsWith(prefixo))
            return op ? enfileirarInteracaoSim(m, s.id, op, true, sala) : m
          })
        }}
        aoAlternarConstruir={() => chamar((e) => e.alternar())}
        aoAlternarSalas={() => setSalasAbertas((v) => !v)}
        aoAbrirCriador={() => setCriadorAberto(true)}
        aoAlternarMensagens={() => alternarPainel({ tipo: 'mensagens' })}
        aoAlternarConfiguracoes={() => alternarPainel({ tipo: 'configuracoes' })}
        aoAvancarTick={aoClicarAvancar}
      />

      {criadorAberto && (
        <CriadorPersonagem
          simInicialId={mundo.simAtivoId}
          aoSalvarSim={(registro, ehNovo) => {
            atualizarMundo((m) => integrarSimDoCASNoMundo(m, registro, salaAtual(), ehNovo))
            cena3DRef.current?.atualizarAparenciaSim3D(registro.id, registro.aparencia)
            setCriadorAberto(false)
            notificar({
              tipo: 'info',
              titulo: registro.nome,
              texto: ehNovo ? `${registro.nome} chegou pela calçada.` : `Aparência de ${registro.nome} atualizada.`,
            })
          }}
          aoRemoverSim={(idRemovido) => {
            atualizarMundo((m) => {
              const sims = { ...m.sims }
              delete sims[idRemovido]
              // tira também das relações dos outros
              for (const [id, s] of Object.entries(sims)) {
                sims[id] = { ...s, relacionamentos: s.relacionamentos.filter((r) => r.alvoId !== idRemovido) }
              }
              const simAtivoId = m.simAtivoId === idRemovido ? AGENTES[0].id : m.simAtivoId
              return { ...m, simAtivoId, sims }
            })
          }}
          aoFechar={() => setCriadorAberto(false)}
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
      {/* trocar de sala no meio de uma conversa não faz sentido — o menu de
          salas some com qualquer painel aberto, e no modo construir */}
      {!construindo && salasAbertas && !painel && <PainelSalas />}
      {!construindo && <PopupPorta popup={estado?.popupPorta ?? null} />}

      {painel?.tipo === 'agente' && <PainelDoAgente agenteId={painel.id} aoFechar={() => setPainel(null)} />}
      {painel?.tipo === 'mensagens' && <PainelMensagens aoFechar={() => setPainel(null)} />}
      {painel?.tipo === 'configuracoes' && (
        <PainelConfiguracoes
          aoFechar={() => setPainel(null)}
          dryRunAtivo={dryRunAtivo}
          aoAlternarDryRun={aoAlternarDryRun}
          ultimoResultado={ultimoResultado}
        />
      )}
      {construindo && (
        <CatalogoConstrucao
          aberto={catalogoAberto}
          aoAlternar={() => setCatalogoAberto((v) => !v)}
          aoAdicionar={(peca) => chamar((e) => e.adicionar(peca))}
        />
      )}

      <Toasts toasts={toasts} aoFechar={fechar} />
    </div>
  )
}
