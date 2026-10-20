import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { criarPersonagemSim3D } from '../personagem3d'
import { criarLoteVizinhanca3D, criarMovel3D } from '../moveis3d'
import { PALETAS } from '../sala'
import {
  avancarSimulacaoSims,
  calcularCorPlumbBob,
  calcularPontuacaoAmbiente,
  cancelarInteracaoSim,
  COR_PLUMBBOB_AMARELO,
  COR_PLUMBBOB_LARANJA,
  COR_PLUMBBOB_VERDE,
  COR_PLUMBBOB_VERMELHO,
  criarEstadoMundoSims,
  enfileirarInteracaoSim,
  escolherInteracaoAutonoma,
  escolherInteracaoParaNecessidade,
  formatarRelogioSim,
  obterInteracoesDoChao,
  obterInteracoesDoMovel,
  obterInteracoesDoSim,
  ZONA_MORTA_PIE_MENU_PX,
} from '../simulacao-sims'
import escritorioJson from '../salas/escritorio.json'
import type { SalaDados } from '../sala-dados'

const SALA_TESTE = escritorioJson as unknown as SalaDados

describe('simulacao-sims (motor The Sims 4)', () => {
  it('mantém as constantes oficiais de Default.ini (PlumbBob e Pie Menu)', () => {
    expect(COR_PLUMBBOB_VERDE).toBe(0x6ec71f)
    expect(COR_PLUMBBOB_AMARELO).toBe(0xffff00)
    expect(COR_PLUMBBOB_LARANJA).toBe(0xff8000)
    expect(COR_PLUMBBOB_VERMELHO).toBe(0xff0000)
    expect(ZONA_MORTA_PIE_MENU_PX).toBe(28)
  })

  it('calcula a cor do PlumbBob conforme a menor necessidade do Sim', () => {
    expect(
      calcularCorPlumbBob({
        energia: 80,
        foco: 75,
        social: 90,
        cafeina: 70,
        ambiente: 80,
        diversao: 65,
      }).nivelCritico,
    ).toBe('verde')

    expect(
      calcularCorPlumbBob({
        energia: 48,
        foco: 75,
        social: 90,
        cafeina: 70,
        ambiente: 80,
        diversao: 65,
      }).nivelCritico,
    ).toBe('amarelo')

    expect(
      calcularCorPlumbBob({
        energia: 80,
        foco: 75,
        social: 25,
        cafeina: 70,
        ambiente: 80,
        diversao: 65,
      }).nivelCritico,
    ).toBe('laranja')

    expect(
      calcularCorPlumbBob({
        energia: 12,
        foco: 75,
        social: 90,
        cafeina: 70,
        ambiente: 80,
        diversao: 65,
      }).nivelCritico,
    ).toBe('vermelho')
  })

  it('inicializa os 4 Sims do Hubbia sentados nas suas respectivas estações', () => {
    const mundo = criarEstadoMundoSims(SALA_TESTE)
    expect(Object.keys(mundo.sims)).toEqual(['cifra', 'agenda', 'vita', 'norte'])
    expect(mundo.sims.cifra.postura.corpo).toBe('sentado_cadeira')
    expect(mundo.sims.cifra.movelCasaId).toBe('cifra-cadeira')
    expect(mundo.pontuacaoAmbienteSala).toBeGreaterThanOrEqual(52)
  })

  it('gera interações de Pie Menu para móveis, outros Sims e chão', () => {
    const mundo = criarEstadoMundoSims(SALA_TESTE)
    const cifra = mundo.sims.cifra
    const agenda = mundo.sims.agenda

    const mesa = SALA_TESTE.moveis.find((m) => m.id === 'cifra-mesa')!
    const opcoesMesa = obterInteracoesDoMovel(mesa, SALA_TESTE.moveis, cifra)
    expect(opcoesMesa.some((o) => o.id.startsWith('trabalhar-'))).toBe(true)

    const opcoesColega = obterInteracoesDoSim(agenda, cifra)
    expect(opcoesColega.some((o) => o.acaoEspecial === 'selecionar_sim')).toBe(true)
    expect(opcoesColega.some((o) => o.acaoEspecial === 'abrir_painel_hubbia')).toBe(true)
    expect(opcoesColega.some((o) => o.categoria === 'social')).toBe(true)

    const opcoesChao = obterInteracoesDoChao(2.5, 3.5)
    expect(opcoesChao.some((o) => o.id.startsWith('ir-aqui-'))).toBe(true)
    expect(opcoesChao.some((o) => o.acaoEspecial === 'chamar_todos')).toBe(true)
  })

  it('enfileira, executa e cancela interações na fila (SIState)', () => {
    let mundo = criarEstadoMundoSims(SALA_TESTE)
    const opcoesChao = obterInteracoesDoChao(1, 1)
    mundo = enfileirarInteracaoSim(mundo, 'cifra', opcoesChao[0])
    expect(mundo.sims.cifra.interacaoAtual?.opcao.id).toBe(opcoesChao[0].id)

    mundo = enfileirarInteracaoSim(mundo, 'cifra', opcoesChao[1])
    expect(mundo.sims.cifra.filaInteracoes).toHaveLength(1)

    mundo = cancelarInteracaoSim(mundo, 'cifra', 'atual')
    expect(mundo.sims.cifra.interacaoAtual?.opcao.id).toBe(opcoesChao[1].id)
    expect(mundo.sims.cifra.filaInteracoes).toHaveLength(0)
  })

  it('avança a simulação no tempo, move Sims e aciona a autonomia quando ocioso', () => {
    let mundo = criarEstadoMundoSims(SALA_TESTE)
    const minAntes = mundo.minutosDoDia
    mundo = avancarSimulacaoSims(mundo, SALA_TESTE, 0.25)
    expect(mundo.minutosDoDia).toBeGreaterThan(minAntes)
    // Com autonomia ligada, todos os Sims ganham uma interação autônoma
    expect(mundo.sims.cifra.interacaoAtual).not.toBeNull()
  })

  it('escolhe interações autônomas para resolver necessidades baixas', () => {
    const mundo = criarEstadoMundoSims(SALA_TESTE)
    const cifra = mundo.sims.cifra
    cifra.necessidades.cafeina = 15
    const op = escolherInteracaoAutonoma(cifra, mundo, SALA_TESTE)
    expect(op).not.toBeNull()
    expect(op?.efeitos.cafeina).toBeGreaterThan(0)

    const opSocial = escolherInteracaoParaNecessidade(cifra, 'social', mundo, SALA_TESTE)
    expect(opSocial).not.toBeNull()
    expect(opSocial?.efeitos.social).toBeGreaterThan(0)
  })

  it('formata o relógio Sim e calcula pontuação de ambiente', () => {
    expect(formatarRelogioSim(9 * 60 + 5, 0)).toBe('Seg 09:05')
    expect(calcularPontuacaoAmbiente(SALA_TESTE.moveis)).toBeGreaterThan(50)
  })

  it('constrói o personagem Sim 3D com esqueleto articulado e anima posturas', () => {
    const mundo = criarEstadoMundoSims(SALA_TESTE)
    const p3d = criarPersonagemSim3D('cifra', 0x16a34a)

    // Confere ossos/articulações principais e PlumbBob 3D
    expect(p3d.articulacoes.cabeca).toBeDefined()
    expect(p3d.articulacoes.ombroEsq).toBeDefined()
    expect(p3d.articulacoes.coxaEsq).toBeDefined()
    expect(p3d.articulacoes.plumbBobMesh).toBeDefined()

    // Anima sentado na cadeira digitando
    p3d.atualizar(mundo.sims.cifra, true, 1.5, 0.016, { x: 3.5, z: 2.4 })
    expect(p3d.articulacoes.coxaEsq.rotation.x).toBeLessThan(-1)

    // Anima andando pela sala
    mundo.sims.cifra.postura.corpo = 'andando'
    p3d.atualizar(mundo.sims.cifra, true, 2.0, 0.016, { x: 3.8, z: 2.7 })
    expect(p3d.articulacoes.pelve.position.y).toBeGreaterThan(0.55)

    p3d.destruir()
  })

  it('constrói o lote de vizinhança 3D com modo de paredes Cutaway e móveis 3D', () => {
    const lote = criarLoteVizinhanca3D(7, 7, PALETAS.neutra)
    expect(lote.paredes).toHaveLength(4)

    // No modo 'cortadas', paredes voltadas para a câmera abaixam e as do fundo ficam altas
    lote.atualizarModoParedes('cortadas', new THREE.Vector3(10, 8, 10), new THREE.Vector3(3, 0, 3))
    const altasVisiveis = lote.paredes.filter((p) => p.malhaAlta.visible).length
    expect(altasVisiveis).toBe(2)

    for (const m of SALA_TESTE.moveis) {
      const m3d = criarMovel3D(m)
      expect(m3d.children.length).toBeGreaterThan(0)
    }
  })
})
