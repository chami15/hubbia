import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  BIBLIOTECA_TRACOS_CAS,
  carregarRegistrosCAS,
  CORES_CABELO_CAS,
  CORES_OLHOS_CAS,
  CORES_ROUPA_CAS,
  ESTILOS_CABELO_INFO,
  ESTILOS_CAMINHADA_INFO,
  ESTILOS_ROUPA_INFO,
  removerSimCustomizadoCAS,
  salvarRegistroCAS,
  TONS_DE_PELE_CAS,
  type AparenciaSimCAS,
  type RegistroSimCAS,
} from './cas-sims'
import { criarPersonagemSim3D, type PersonagemSim3D } from './personagem3d'
import type { AspectoCarregarPostura, AspectoCorpoPostura, EstadoSim } from './simulacao-sims'

// ---------------------------------------------------------------------------
// ESTÚDIO CREATE-A-SIM (CAS) 3D — CRIAÇÃO E PERSONALIZAÇÃO DE SIMS / AGENTES
//
// Inspirado em `cas/cas.pyc` e no estúdio 3D de criação de personagens de
// The Sims 4:
//   - Plataforma giratória 3D interativa (Three.js) com iluminação de estúdio,
//     zoom de rosto/corpo inteiro e teste ao vivo de animações
//   - Edição completa dos 4 Sims nativos (Cifra, Agenda, Vita, Norte)
//   - Criação de novos Agentes/Sims customizados que chegam caminhando pela
//     calçada/portal da rua e entram para a equipe do Hubbia!
// ---------------------------------------------------------------------------

interface Props {
  simInicialId: string
  aoSalvarSim: (registro: RegistroSimCAS, ehNovo: boolean) => void
  aoRemoverSim?: (simId: string) => void
  aoFechar: () => void
}

type AbaCAS = 'identidade' | 'genetica' | 'cabelo' | 'roupas'

export function CriadorSimCAS({
  simInicialId,
  aoSalvarSim,
  aoRemoverSim,
  aoFechar,
}: Props) {
  const [registros, setRegistros] = useState<Record<string, RegistroSimCAS>>(() =>
    carregarRegistrosCAS(),
  )
  const [idSelecionado, setIdSelecionado] = useState<string>(
    registros[simInicialId] ? simInicialId : 'cifra',
  )
  const [modoNovoSim, setModoNovoSim] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<AbaCAS>('identidade')

  // Estado editável do Sim no estúdio
  const registroBase = registros[idSelecionado] ?? Object.values(registros)[0]
  const [nome, setNome] = useState(registroBase.nome)
  const [funcao, setFuncao] = useState(registroBase.funcao)
  const [especialidade, setEspecialidade] = useState(registroBase.especialidade)
  const [corIdentidade, setCorIdentidade] = useState(registroBase.corIdentidade)
  const [aparencia, setAparencia] = useState<AparenciaSimCAS>(registroBase.aparencia)
  const [tracosIds, setTracosIds] = useState<string[]>(registroBase.tracosIds)

  // Controles do palco 3D de pré-visualização
  const [posePreview, setPosePreview] = useState<{
    corpo: AspectoCorpoPostura
    carregando: AspectoCarregarPostura
    falando?: boolean
  }>({ corpo: 'em_pe', carregando: 'nada' })
  const [zoomRosto, setZoomRosto] = useState(false)
  const anguloPlataformaRef = useRef(0)

  const palco3DRef = useRef<HTMLDivElement>(null)
  const personagemPreviewRef = useRef<PersonagemSim3D | null>(null)
  const posePreviewRef = useRef(posePreview)
  posePreviewRef.current = posePreview
  const zoomRostoRef = useRef(zoomRosto)
  zoomRostoRef.current = zoomRosto

  function selecionarSimExistente(id: string) {
    const reg = registros[id]
    if (!reg) return
    setModoNovoSim(false)
    setIdSelecionado(id)
    setNome(reg.nome)
    setFuncao(reg.funcao)
    setEspecialidade(reg.especialidade)
    setCorIdentidade(reg.corIdentidade)
    setAparencia({ ...reg.aparencia })
    setTracosIds([...reg.tracosIds])
  }

  function iniciarCriacaoNovoSim() {
    setModoNovoSim(true)
    setNome(' Íris')
    setFuncao('Marketing & Growth')
    setEspecialidade('marketing')
    setCorIdentidade(0x7c3aed)
    setAparencia({
      tomPele: 0xf1c29b,
      corOlhos: 0x15803d,
      corCabelo: 0x9a3412,
      estiloCabelo: 'longo_ondulado',
      porteFisico: 'padrao',
      estiloRoupa: 'blazer_executivo',
      corRoupaPrincipal: 0x7c3aed,
      corRoupaSecundaria: 0xf8fafc,
      corCalca: 0x1e293b,
      corSapato: 0x0f172a,
      oculos: 'redondo',
      headset: false,
      estiloCaminhada: 'confiante',
    })
    setTracosIds(['visionario', 'extrovertido', 'ambicioso'])
    setAbaAtiva('identidade')
  }

  function sortearVisualAleatorio() {
    const item = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
    const corPrincipal = item(CORES_ROUPA_CAS).cor
    setCorIdentidade(corPrincipal)
    setAparencia({
      tomPele: item(TONS_DE_PELE_CAS).cor,
      corOlhos: item(CORES_OLHOS_CAS).cor,
      corCabelo: item(CORES_CABELO_CAS).cor,
      estiloCabelo: item(ESTILOS_CABELO_INFO).id,
      porteFisico: item(['esguio', 'padrao', 'atletico'] as const),
      estiloRoupa: item(ESTILOS_ROUPA_INFO).id,
      corRoupaPrincipal: corPrincipal,
      corRoupaSecundaria: item(CORES_ROUPA_CAS).cor,
      corCalca: item([0x1e293b, 0x334155, 0x0f172a, 0x475569]),
      corSapato: item([0x0f172a, 0xf8fafc, 0x334155]),
      oculos: item(['nenhum', 'nenhum', 'redondo', 'retangular'] as const),
      headset: Math.random() > 0.65,
      estiloCaminhada: item(ESTILOS_CAMINHADA_INFO).id,
    })
  }

  function alternarTraco(idTraco: string) {
    setTracosIds((atuais) => {
      if (atuais.includes(idTraco)) {
        return atuais.length > 1 ? atuais.filter((t) => t !== idTraco) : atuais
      }
      if (atuais.length >= 3) {
        return [...atuais.slice(1), idTraco]
      }
      return [...atuais, idTraco]
    })
  }

  // Monta o Palco 3D Turntable do Create-A-Sim
  useEffect(() => {
    const container = palco3DRef.current
    if (!container) return

    const cena = new THREE.Scene()
    cena.background = new THREE.Color(0x0f172a)

    const w = container.clientWidth || 340
    const h = container.clientHeight || 480
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 30)
    camera.position.set(0, 1.05, 2.75)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    // Iluminação de estúdio de 3 pontos (Key + Fill + Rim Light)
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.0)
    cena.add(hemi)

    const luzPrincipal = new THREE.DirectionalLight(0xfffbeb, 1.6)
    luzPrincipal.position.set(2.5, 4, 3)
    luzPrincipal.castShadow = true
    cena.add(luzPrincipal)

    const luzRecorte = new THREE.DirectionalLight(0x38bdf8, 0.85)
    luzRecorte.position.set(-2.5, 2.5, -2)
    cena.add(luzRecorte)

    // Pedestal circular luminoso estilo Create-A-Sim
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.08, 36),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.3 }),
    )
    pedestal.position.y = -0.04
    pedestal.receiveShadow = true
    cena.add(pedestal)

    const anelLuz = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.61, 36),
      new THREE.MeshBasicMaterial({ color: 0x6ec71f, side: THREE.DoubleSide }),
    )
    anelLuz.rotation.x = -Math.PI / 2
    anelLuz.position.y = 0.004
    cena.add(anelLuz)

    const p3d = criarPersonagemSim3D('preview-cas', corIdentidade, aparencia)
    personagemPreviewRef.current = p3d
    cena.add(p3d.grupoRaiz)

    let arrastando = false
    let ultimoX = 0
    function onDown(e: PointerEvent) {
      arrastando = true
      ultimoX = e.clientX
    }
    function onMove(e: PointerEvent) {
      if (!arrastando) return
      const dx = e.clientX - ultimoX
      ultimoX = e.clientX
      anguloPlataformaRef.current += dx * 0.012
    }
    function onUp() {
      arrastando = false
    }

    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    let raf = 0
    let ultimoMS = performance.now()
    function loop(agoraMS: number) {
      raf = window.requestAnimationFrame(loop)
      const dt = Math.min(0.08, (agoraMS - ultimoMS) / 1000)
      ultimoMS = agoraMS
      const t = agoraMS / 1000

      // Zoom suave entre Corpo Inteiro e Rosto (Close-up)
      const zAlvo = zoomRostoRef.current ? 1.25 : 2.65
      const yAlvo = zoomRostoRef.current ? 1.22 : 0.86
      camera.position.z += (zAlvo - camera.position.z) * 0.14
      camera.position.y += (yAlvo - camera.position.y) * 0.14
      camera.lookAt(0, zoomRostoRef.current ? 1.18 : 0.78, 0)

      const pose = posePreviewRef.current
      const simFalso = {
        id: 'preview',
        humor: 'feliz',
        estadoBackend: pose.falando ? 'falando' : 'idle',
        necessidades: { energia: 90, foco: 90, social: 90, cafeina: 90, ambiente: 90, diversao: 90 },
        postura: {
          corpo: pose.corpo,
          carregando: pose.carregando,
          superficieId: null,
        },
      } as unknown as EstadoSim

      p3d.atualizar(
        simFalso,
        true,
        t,
        dt,
        { x: 0, z: 0 },
        {
          x: Math.sin(anguloPlataformaRef.current),
          z: Math.cos(anguloPlataformaRef.current),
        },
      )

      renderer.render(cena, camera)
    }
    raf = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(raf)
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      p3d.destruir()
      renderer.dispose()
      dom.remove()
    }
  }, [])

  // Atualiza aparência ao vivo no boneco 3D sempre que qualquer opção muda
  useEffect(() => {
    personagemPreviewRef.current?.aplicarAparenciaCAS(aparencia)
  }, [aparencia])

  function salvarEConcluir() {
    const nomeLimpo = nome.trim() || 'Novo Agente'
    const idFinal = modoNovoSim
      ? `sim_${nomeLimpo.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-4)}`
      : idSelecionado

    const registroFinal: RegistroSimCAS = {
      id: idFinal,
      nome: nomeLimpo,
      funcao: funcao.trim() || 'Especialista',
      especialidade: especialidade.trim() || 'projetos',
      corIdentidade,
      customizado: modoNovoSim ? true : Boolean(registros[idSelecionado]?.customizado),
      aparencia,
      tracosIds,
    }

    const todosAtualizados = salvarRegistroCAS(registroFinal)
    setRegistros(todosAtualizados)
    aoSalvarSim(registroFinal, modoNovoSim)
  }

  function excluirSimAtual() {
    if (!registros[idSelecionado]?.customizado) return
    const atualizados = removerSimCustomizadoCAS(idSelecionado)
    setRegistros(atualizados)
    aoRemoverSim?.(idSelecionado)
    selecionarSimExistente('cifra')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 'min(1080px, 96vw)',
          height: 'min(690px, 92dvh)',
          borderRadius: 22,
          background: 'rgba(15, 23, 42, 0.97)',
          border: '1.5px solid rgba(110, 199, 31, 0.5)',
          boxShadow: '0 28px 64px rgba(0,0,0,0.85)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* TOPO DO ESTÚDIO CREATE-A-SIM */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'linear-gradient(90deg, rgba(110, 199, 31, 0.18), rgba(15, 23, 42, 0.95))',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧬</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#a3e635' }}>
                Criar um Sim / Agente (Create-A-Sim 3D)
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                Personalize genética, cortes de cabelo, roupas, estilo de caminhada e traços ou crie um novo Agente para o Hubbia
              </div>
            </div>
          </div>

          {/* Seletor de Sims Existentes + Botão Criar Novo Sim */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {Object.values(registros).map((reg) => {
              const ativo = !modoNovoSim && idSelecionado === reg.id
              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => selecionarSimExistente(reg.id)}
                  style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: ativo ? '1.5px solid #6ec71f' : '1px solid rgba(255,255,255,0.16)',
                    background: ativo ? 'rgba(110, 199, 31, 0.24)' : 'rgba(255,255,255,0.06)',
                    color: ativo ? '#a3e635' : '#e2e8f0',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {reg.nome}
                </button>
              )
            })}

            <button
              type="button"
              onClick={iniciarCriacaoNovoSim}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: modoNovoSim ? '1.5px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.5)',
                background: modoNovoSim ? 'rgba(56, 189, 248, 0.28)' : 'rgba(56, 189, 248, 0.14)',
                color: '#7dd3fc',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              + Novo Agente Sim
            </button>

            <button
              type="button"
              onClick={aoFechar}
              style={{
                marginLeft: 8,
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: '#f8fafc',
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* CORPO PRINCIPAL: PALCO 3D (ESQUERDA) + CUSTOMIZAÇÃO (DIREITA) */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', minHeight: 0 }}>
          {/* COLUNA ESQUERDA: PALCO 3D INTERATIVO */}
          <div
            style={{
              position: 'relative',
              borderRight: '1px solid rgba(255,255,255,0.1)',
              background: 'radial-gradient(circle at 50% 35%, #1e293b 0%, #090d16 100%)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div ref={palco3DRef} style={{ flex: 1, width: '100%', cursor: 'grab' }} />

            {/* Controles de Rotação, Zoom e Teste de Pose sobre o Palco 3D */}
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(15, 23, 42, 0.92)',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => {
                    anguloPlataformaRef.current -= 0.45
                  }}
                  style={estiloBotaoPalco(false)}
                >
                  ↺ Girar
                </button>
                <button
                  type="button"
                  onClick={() => setZoomRosto((v) => !v)}
                  style={estiloBotaoPalco(zoomRosto)}
                >
                  {zoomRosto ? '🧍 Ver Corpo' : '🔍 Zoom Rosto'}
                </button>
                <button
                  type="button"
                  onClick={sortearVisualAleatorio}
                  style={estiloBotaoPalco(false)}
                >
                  🎲 Sortear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    anguloPlataformaRef.current += 0.45
                  }}
                  style={estiloBotaoPalco(false)}
                >
                  Girar ↻
                </button>
              </div>

              {/* Botões para testar a fluidez das animações no próprio CAS */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  { rotulo: '🧍 Em Pé', corpo: 'em_pe' as const, carregando: 'nada' as const },
                  { rotulo: '🚶 Andar', corpo: 'andando' as const, carregando: 'nada' as const },
                  { rotulo: '💻 Digitar', corpo: 'sentado_cadeira' as const, carregando: 'nada' as const },
                  { rotulo: '☕ Café', corpo: 'interagindo_em_pe' as const, carregando: 'xicara_cafe' as const },
                  { rotulo: '💬 Conversar', corpo: 'interagindo_em_pe' as const, carregando: 'nada' as const, falando: true },
                ].map((p) => {
                  const ativo =
                    posePreview.corpo === p.corpo &&
                    posePreview.carregando === p.carregando &&
                    Boolean(posePreview.falando) === Boolean(p.falando)
                  return (
                    <button
                      key={p.rotulo}
                      type="button"
                      onClick={() =>
                        setPosePreview({
                          corpo: p.corpo,
                          carregando: p.carregando,
                          falando: p.falando,
                        })
                      }
                      style={{
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: ativo ? '1px solid #6ec71f' : '1px solid rgba(255,255,255,0.14)',
                        background: ativo ? 'rgba(110, 199, 31, 0.22)' : 'rgba(255,255,255,0.05)',
                        color: ativo ? '#a3e635' : '#cbd5e1',
                        fontSize: 10.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {p.rotulo}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: ABAS DE PERSONALIZAÇÃO */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Abas do CAS */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '10px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {(
                [
                  { id: 'identidade' as AbaCAS, icone: '💎', titulo: 'Identidade, Traços & Caminhada' },
                  { id: 'genetica' as AbaCAS, icone: '🧬', titulo: 'Pele, Olhos & Porte Físico' },
                  { id: 'cabelo' as AbaCAS, icone: '💇', titulo: 'Cabelo, Óculos & Headset' },
                  { id: 'roupas' as AbaCAS, icone: '👔', titulo: 'Roupas & Cores' },
                ] as const
              ).map((aba) => {
                const ativa = abaAtiva === aba.id
                return (
                  <button
                    key={aba.id}
                    type="button"
                    onClick={() => setAbaAtiva(aba.id)}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 10,
                      border: ativa ? '1px solid #6ec71f' : '1px solid rgba(255,255,255,0.12)',
                      background: ativa ? 'rgba(110, 199, 31, 0.22)' : 'rgba(255,255,255,0.04)',
                      color: ativa ? '#a3e635' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {aba.icone} {aba.titulo}
                  </button>
                )
              })}
            </div>

            {/* Conteúdo rolável da aba ativa */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {abaAtiva === 'identidade' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={estiloLabel()}>Nome do Sim / Agente</label>
                      <input
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        style={estiloInput()}
                        placeholder="Ex: Íris, Orion, Cifra..."
                      />
                    </div>
                    <div>
                      <label style={estiloLabel()}>Cargo / Área no Hubbia</label>
                      <input
                        type="text"
                        value={funcao}
                        onChange={(e) => setFuncao(e.target.value)}
                        style={estiloInput()}
                        placeholder="Ex: Finanças, Marketing, IA & Dados..."
                      />
                    </div>
                  </div>

                  {/* Estilo de Caminhada (`walkstyle_behavior.pyc`) */}
                  <div>
                    <div style={estiloLabel()}>Estilo de Caminhada 3D (Walkstyle)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {ESTILOS_CAMINHADA_INFO.map((est) => {
                        const ativo = aparencia.estiloCaminhada === est.id
                        return (
                          <button
                            key={est.id}
                            type="button"
                            onClick={() => {
                              setAparencia((a) => ({ ...a, estiloCaminhada: est.id }))
                              setPosePreview({ corpo: 'andando', carregando: 'nada' })
                            }}
                            style={estiloCardOpcao(ativo)}
                          >
                            <div style={{ fontSize: 18 }}>{est.icone}</div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>{est.nome}</div>
                            <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>{est.descricao}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Biblioteca de Traços de Personalidade (`traits.pyc`) */}
                  <div>
                    <div style={estiloLabel()}>
                      Traços de Personalidade ({tracosIds.length}/3 selecionados)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {BIBLIOTECA_TRACOS_CAS.map((traco) => {
                        const selecionado = tracosIds.includes(traco.id)
                        return (
                          <button
                            key={traco.id}
                            type="button"
                            onClick={() => alternarTraco(traco.id)}
                            style={estiloCardOpcao(selecionado)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 16 }}>{traco.icone}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{traco.nome}</span>
                            </div>
                            <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 3 }}>
                              {traco.descricao}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {abaAtiva === 'genetica' && (
                <>
                  <div>
                    <div style={estiloLabel()}>Tom de Pele</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {TONS_DE_PELE_CAS.map((tom) => (
                        <button
                          key={tom.nome}
                          type="button"
                          onClick={() => setAparencia((a) => ({ ...a, tomPele: tom.cor }))}
                          style={estiloCirculoCor(tom.hex, aparencia.tomPele === tom.cor, tom.nome)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Cor da Íris dos Olhos</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CORES_OLHOS_CAS.map((olho) => (
                        <button
                          key={olho.nome}
                          type="button"
                          onClick={() => {
                            setAparencia((a) => ({ ...a, corOlhos: olho.cor }))
                            setZoomRosto(true)
                          }}
                          style={estiloCirculoCor(olho.hex, aparencia.corOlhos === olho.cor, olho.nome)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Porte Físico</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {(
                        [
                          { id: 'esguio', nome: 'Esguio', icone: '🏃' },
                          { id: 'padrao', nome: 'Equilibrado', icone: '🧍' },
                          { id: 'atletico', nome: 'Atlético / Ombros Largos', icone: '💪' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setAparencia((a) => ({ ...a, porteFisico: p.id }))
                            setZoomRosto(false)
                          }}
                          style={estiloCardOpcao(aparencia.porteFisico === p.id)}
                        >
                          <span style={{ fontSize: 18 }}>{p.icone}</span>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{p.nome}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {abaAtiva === 'cabelo' && (
                <>
                  <div>
                    <div style={estiloLabel()}>Estilo de Cabelo 3D</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {ESTILOS_CABELO_INFO.map((cab) => (
                        <button
                          key={cab.id}
                          type="button"
                          onClick={() => {
                            setAparencia((a) => ({ ...a, estiloCabelo: cab.id }))
                            setZoomRosto(true)
                          }}
                          style={estiloCardOpcao(aparencia.estiloCabelo === cab.id)}
                        >
                          <span style={{ fontSize: 18 }}>{cab.icone}</span>
                          <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>{cab.nome}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Cor do Cabelo</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CORES_CABELO_CAS.map((c) => (
                        <button
                          key={c.nome}
                          type="button"
                          onClick={() => setAparencia((a) => ({ ...a, corCabelo: c.cor }))}
                          style={estiloCirculoCor(c.hex, aparencia.corCabelo === c.cor, c.nome)}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <div style={estiloLabel()}>Óculos 3D</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(
                          [
                            { id: 'nenhum', nome: 'Sem Óculos' },
                            { id: 'redondo', nome: 'Redondo Intelectual' },
                            { id: 'retangular', nome: 'Executivo' },
                          ] as const
                        ).map((oc) => (
                          <button
                            key={oc.id}
                            type="button"
                            onClick={() => {
                              setAparencia((a) => ({ ...a, oculos: oc.id }))
                              setZoomRosto(true)
                            }}
                            style={estiloCardOpcao(aparencia.oculos === oc.id)}
                          >
                            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{oc.nome}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={estiloLabel()}>Acessório Tech</div>
                      <button
                        type="button"
                        onClick={() => {
                          setAparencia((a) => ({ ...a, headset: !a.headset }))
                          setZoomRosto(true)
                        }}
                        style={estiloCardOpcao(aparencia.headset)}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          🎧 {aparencia.headset ? 'Headset Ativado' : 'Sem Headset'}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {abaAtiva === 'roupas' && (
                <>
                  <div>
                    <div style={estiloLabel()}>Modelo de Roupa Superior</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {ESTILOS_ROUPA_INFO.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setAparencia((a) => ({ ...a, estiloRoupa: r.id }))
                            setZoomRosto(false)
                          }}
                          style={estiloCardOpcao(aparencia.estiloRoupa === r.id)}
                        >
                          <span style={{ fontSize: 18 }}>{r.icone}</span>
                          <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>{r.nome}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Cor Principal da Roupa & Identidade</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CORES_ROUPA_CAS.map((c) => (
                        <button
                          key={c.nome}
                          type="button"
                          onClick={() => {
                            setAparencia((a) => ({ ...a, corRoupaPrincipal: c.cor }))
                            setCorIdentidade(c.cor)
                          }}
                          style={estiloCirculoCor(c.hex, aparencia.corRoupaPrincipal === c.cor, c.nome)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Cor da Camisa Interna / Detalhe</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CORES_ROUPA_CAS.map((c) => (
                        <button
                          key={c.nome}
                          type="button"
                          onClick={() => setAparencia((a) => ({ ...a, corRoupaSecundaria: c.cor }))}
                          style={estiloCirculoCor(c.hex, aparencia.corRoupaSecundaria === c.cor, c.nome)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={estiloLabel()}>Cor da Calça</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CORES_ROUPA_CAS.map((c) => (
                        <button
                          key={c.nome}
                          type="button"
                          onClick={() => setAparencia((a) => ({ ...a, corCalca: c.cor }))}
                          style={estiloCirculoCor(c.hex, aparencia.corCalca === c.cor, c.nome)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* RODAPÉ DE AÇÃO DO CAS */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(15, 23, 42, 0.96)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {!modoNovoSim && registros[idSelecionado]?.customizado && (
                  <button
                    type="button"
                    onClick={excluirSimAtual}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(239,68,68,0.5)',
                      background: 'rgba(239,68,68,0.15)',
                      color: '#fca5a5',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Remover Agente Customizado
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={aoFechar}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvarEConcluir}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 10,
                    border: '1.5px solid #6ec71f',
                    background: 'linear-gradient(135deg, #6ec71f, #22c55e)',
                    color: '#052e16',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 8px 22px rgba(110, 199, 31, 0.35)',
                  }}
                >
                  {modoNovoSim
                    ? '✓ Criar Sim & Enviar para o Escritório'
                    : '✓ Salvar Aparência no Escritório'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function estiloLabel(): React.CSSProperties {
  return {
    display: 'block',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#94a3b8',
    marginBottom: 6,
  }
}

function estiloInput(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.35)',
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
  }
}

function estiloCardOpcao(ativo: boolean): React.CSSProperties {
  return {
    padding: '9px 10px',
    borderRadius: 11,
    border: ativo ? '1.5px solid #6ec71f' : '1px solid rgba(255,255,255,0.12)',
    background: ativo ? 'rgba(110, 199, 31, 0.2)' : 'rgba(255,255,255,0.04)',
    color: '#f8fafc',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function estiloCirculoCor(hex: string, ativo: boolean, _titulo?: string): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: hex,
    border: ativo ? '3px solid #6ec71f' : '2px solid rgba(255,255,255,0.3)',
    boxShadow: ativo ? '0 0 12px rgba(110, 199, 31, 0.7)' : 'none',
    cursor: 'pointer',
  }
}

function estiloBotaoPalco(ativo: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '5px 8px',
    borderRadius: 8,
    border: ativo ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.14)',
    background: ativo ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.06)',
    color: ativo ? '#7dd3fc' : '#e2e8f0',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  }
}
