import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { criarCena, type Cena } from './cena'
import { criarEditor, type Editor, type EstadoEditor } from './edicao'
import { carregarSala, definirSalaAtual, recarregarDeProposito, todasAsSalasComRascunho } from './persistencia'
import { PALETAS } from './sala'
import { AGENTES } from './agentes'
import { rotuloDe } from './catalogo'
import { conferirConjuntoDeSalas } from './sala-conferir'
import { PainelEdicao } from './PainelEdicao'
import { PainelCatalogo } from './PainelCatalogo'
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

// Hospeda o mundo isométrico estilo The Sims 4 no Hubbia.
// React cuida do ciclo de vida do canvas, do HUD The Sims, do Pie Menu
// radial e dos painéis de domínio; cena.ts / maquete.ts cuidam da
// renderização PixiJS v8 e simulacao-sims.ts roda a inteligência de
// autonomia, necessidades (commodities), posturas e emoções.
export function Escritorio() {
  const hospedeiroRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const cenaRef = useRef<Cena | null>(null)
  const cameraRef = useRef<ControladorCamera | null>(null)

  const [estado, setEstado] = useState<EstadoEditor | null>(null)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const [salasAbertas, setSalasAbertas] = useState(false)
  const [problemas, setProblemas] = useState<string[]>([])
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null)
  const [mensagensAbertas, setMensagensAbertas] = useState(false)
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false)
  const [menuPie, setMenuPie] = useState<EstadoMenuPie | null>(null)

  // Inicializa o estado do mundo Sims a partir da sala atual
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
    if (!dados || !cenaRef.current) return
    const estados = new Map<string, EstadoAgente>()
    for (const local of AGENTES) {
      const aoVivo = dados.find((a) => a.nome === local.nome)
      if (aoVivo) estados.set(local.id, aoVivo.estado)
    }
    cenaRef.current.definirEstadosAgentes(estados)
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

  // Executa uma opção escolhida no Pie Menu Radial
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
    if (opcao.acaoEspecial === 'trocar_sala' && opcao.salaDestino) {
      definirSalaAtual(opcao.salaDestino)
      recarregarDeProposito()
      return
    }
    if (opcao.acaoEspecial === 'chamar_todos' && opcao.alvoPosicao) {
      setMundoSims((ant) => {
        let novo = ant
        AGENTES.forEach((ag, idx) => {
          const offsetCol = opcao.alvoPosicao!.coluna + (idx % 2 === 0 ? -0.35 : 0.35)
          const offsetLin = opcao.alvoPosicao!.linha + (idx < 2 ? -0.35 : 0.35)
          novo = enfileirarInteracaoSim(
            novo,
            ag.id,
            {
              ...opcao,
              acaoEspecial: undefined,
              alvoPosicao: { coluna: offsetCol, linha: offsetLin },
            },
            true,
          )
        })
        return novo
      })
      return
    }

    setMundoSims((ant) => enfileirarInteracaoSim(ant, ant.simAtivoId, opcao))
  }, [])

  // Montagem do PixiJS, Cena, Editor e Câmera The Sims 4
  useEffect(() => {
    const hospedeiro = hospedeiroRef.current
    if (!hospedeiro) return

    let desmontado = false
    let app: Application | null = null

    async function montar() {
      const { sala, idSala } = carregarSala()
      const corFundo = typeof sala.paleta?.vazio === 'number' ? sala.paleta.vazio : PALETAS.neutra.vazio

      const aplicacao = new Application()
      await aplicacao.init({
        background: corFundo,
        resizeTo: hospedeiro!,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (desmontado) {
        aplicacao.destroy(true, { children: true })
        return
      }

      app = aplicacao
      hospedeiro!.appendChild(aplicacao.canvas)

      const mundo = new Container()
      aplicacao.stage.addChild(mundo)

      const cena = await criarCena(sala, {
        aoClicarAgente: (id, telaX, telaY) => {
          // Se as coordenadas de tela vieram do clique na cena, abre o Pie Menu radial
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
        },
        idSala,
      )
      editorRef.current = editor
      setEstado(editor.estado())

      // Controlador de câmera com pan, zoom suave e modo Seguir Sim (Camera.ini)
      cameraRef.current = criarControladorCamera(
        aplicacao,
        mundo,
        () => !(editorRef.current?.estado().ativo ?? false),
        () => {
          setMundoSims((ant) => (ant.seguirSimAtivo ? { ...ant, seguirSimAtivo: false } : ant))
        },
      )
    }

    void montar()

    return () => {
      desmontado = true
      cameraRef.current?.destruir()
      cameraRef.current = null
      editorRef.current?.destruir()
      editorRef.current = null
      cenaRef.current?.destruirAnimacoes()
      cenaRef.current = null
      app?.destroy(true, { children: true })
    }
  }, [aplicarEstadosNaCena])

  // Loop de simulação The Sims (roda a 4Hz para atualizar motivos, caminhada e autonomia)
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (editorRef.current?.estado().ativo) return
      const salaAtual = cenaRef.current?.maquete.sala
      if (!salaAtual) return
      setMundoSims((anterior) => avancarSimulacaoSims(anterior, salaAtual, 0.25))
    }, 250)
    return () => window.clearInterval(intervalo)
  }, [])

  // Sincroniza estado do mundo Sims com a cena PixiJS e com a câmera FollowSim
  useEffect(() => {
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

      // Atalhos do Modo Simulação (The Sims 4):
      // 0/Espaço = Pausar, 1/2/3 = Velocidades, WASD = Mover Câmera
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
        if (e.key === 'w' || e.key === 'W') {
          cameraRef.current?.deslocarPorTeclado(0, 42)
          return
        }
        if (e.key === 's' || e.key === 'S') {
          cameraRef.current?.deslocarPorTeclado(0, -42)
          return
        }
        if (e.key === 'a' || e.key === 'A') {
          cameraRef.current?.deslocarPorTeclado(42, 0)
          return
        }
        if (e.key === 'd' || e.key === 'D') {
          cameraRef.current?.deslocarPorTeclado(-42, 0)
          return
        }
        return
      }

      // Atalhos do Modo Construir/Edição
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
      <div ref={hospedeiroRef} style={{ width: '100%', height: '100%' }} />

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
        aoAlternarCorpoInteiro={() => {
          setMundoSims((ant) => ({ ...ant, modoCorpoInteiro: !ant.modoCorpoInteiro }))
        }}
        aoZoom={(fator) => {
          cameraRef.current?.aplicarZoom(fator)
        }}
        aoCentralizarCamera={() => {
          setMundoSims((ant) => ({ ...ant, seguirSimAtivo: false }))
          cameraRef.current?.centralizarSala(false)
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
      />

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
        <PainelCatalogo
          aberto={catalogoAberto}
          aoAlternar={() => setCatalogoAberto((v) => !v)}
          aoAdicionar={(peca) => chamar((e) => e.adicionar(peca))}
        />
      )}

      <Toasts toasts={toasts} aoFechar={fechar} />
    </div>
  )
}
