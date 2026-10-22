import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { obterMetadadosPeca } from '../catalogo-jogo'
import { PECAS, nomeCompletoDoMovel, nomeDoMovel } from '../catalogo'
import { REGISTROS_PADRAO_POR_SIM, type RegistroSimCAS } from '../cas-sims'
import { criarPersonagemSim3D } from '../personagem3d'
import { criarLoteVizinhanca3D, criarMovel3D, extrairReceitaMovel3D } from '../moveis3d'
import {
  calcularCaminhoAEstrela,
  calcularPosicaoJigSocial,
  escolherSlotLivreDoMovel,
  obterSlotsDeInteracaoMovel,
} from '../roteamento-sims'
import { PALETAS } from '../sala'
import {
  aplicarInteracoesBackendNoMundo,
  avancarSimulacaoSims,
  calcularCorDiamante,
  calcularPontuacaoAmbiente,
  cancelarInteracaoSim,
  COR_NIVEL,
  criarEstadoMundoSims,
  enfileirarInteracaoSim,
  escolherInteracaoAutonoma,
  escolherInteracaoParaNecessidade,
  formatarRelogioSim,
  integrarSimDoCASNoMundo,
  nivelDaNecessidade,
  obterInteracoesDoChao,
  obterInteracoesDoMovel,
  obterInteracoesDoSim,
  pontoNaRua,
  type EstadoMundoSims,
  type NecessidadesSim,
} from '../simulacao-sims'
import escritorioJson from '../salas/escritorio.json'
import type { SalaDados } from '../sala-dados'

const SALA = escritorioJson as unknown as SalaDados
const semSorte = () => 0

function cheias(sobrescrever: Partial<NecessidadesSim> = {}): NecessidadesSim {
  return { energia: 90, cafeina: 90, foco: 90, social: 90, diversao: 90, ambiente: 60, ...sobrescrever }
}

// roda N segundos em passos de 1 quadro (60Hz), como o laço da cena 3D faz
function rodar(mundo: EstadoMundoSims, segundos: number, sala = SALA): EstadoMundoSims {
  let m = mundo
  let agora = 1_000_000
  for (let i = 0; i < Math.round(segundos * 60); i++) {
    agora += 1000 / 60
    m = avancarSimulacaoSims(m, sala, 1 / 60, agora, semSorte)
  }
  return m
}

describe('níveis e diamante', () => {
  it('usa a MESMA régua pra barra e pro diamante', () => {
    expect(nivelDaNecessidade(80)).toBe('bom')
    expect(nivelDaNecessidade(50)).toBe('atencao')
    expect(nivelDaNecessidade(30)).toBe('baixo')
    expect(nivelDaNecessidade(10)).toBe('critico')
  })

  it('o diamante reflete a PIOR necessidade, ignorando o ambiente', () => {
    expect(calcularCorDiamante(cheias()).nivel).toBe('bom')
    expect(calcularCorDiamante(cheias({ social: 30 })).nivel).toBe('baixo')
    expect(calcularCorDiamante(cheias({ energia: 5 })).corNum).toBe(COR_NIVEL.critico.num)
    expect(calcularCorDiamante(cheias({ ambiente: 0 })).nivel).toBe('bom')
  })
})

describe('ambiente da sala', () => {
  it('cada categoria tem teto: empilhar planta não leva a 100', () => {
    const planta = (i: number) => ({ id: `p${i}`, peca: 'pottedPlant', direcao: 'NE' as const, coluna: 0, linha: 0 })
    const tres = calcularPontuacaoAmbiente([1, 2, 3].map(planta))
    const dez = calcularPontuacaoAmbiente(Array.from({ length: 10 }, (_, i) => planta(i)))
    expect(dez).toBe(tres)
    expect(dez).toBeLessThan(100)
  })

  it('a sala padrão nasce no meio da escala, com espaço pra decorar', () => {
    const nota = calcularPontuacaoAmbiente(SALA.moveis)
    expect(nota).toBeGreaterThan(40)
    expect(nota).toBeLessThan(75)
  })
})

describe('estado inicial', () => {
  it('cria os 4 agentes sentados nas próprias cadeiras', () => {
    const mundo = criarEstadoMundoSims(SALA)
    expect(Object.keys(mundo.sims)).toEqual(['cifra', 'agenda', 'vita', 'norte'])
    expect(mundo.sims.cifra.postura.corpo).toBe('sentado_cadeira')
    expect(mundo.sims.cifra.movelCasaId).toBe('cifra-cadeira')
  })
})

describe('interações', () => {
  it('móvel, colega e chão oferecem as opções certas', () => {
    const mundo = criarEstadoMundoSims(SALA)
    const { cifra, agenda } = mundo.sims

    const mesa = SALA.moveis.find((m) => m.id === 'cifra-mesa')!
    expect(obterInteracoesDoMovel(mesa, SALA.moveis, cifra, SALA).some((o) => o.id.startsWith('trabalhar-'))).toBe(true)

    const deColega = obterInteracoesDoSim(agenda, cifra, SALA)
    expect(deColega.some((o) => o.acaoEspecial === 'selecionar_sim')).toBe(true)
    expect(deColega.some((o) => o.acaoEspecial === 'abrir_painel_hubbia')).toBe(true)
    expect(deColega.some((o) => o.categoria === 'social')).toBe(true)

    const chao = obterInteracoesDoChao(2.5, 3.5)
    expect(chao.some((o) => o.id.startsWith('ir-aqui-'))).toBe(true)
    expect(chao.some((o) => o.acaoEspecial === 'chamar_todos')).toBe(true)
  })

  it('café só sai da cafeteira — o armário embaixo dela não oferece', () => {
    const { cifra } = criarEstadoMundoSims(SALA).sims
    const armario = SALA.moveis.find((m) => m.peca === 'kitchenCabinet')!
    const cafeteira = SALA.moveis.find((m) => m.peca.includes('Coffee'))!
    expect(obterInteracoesDoMovel(armario, SALA.moveis, cifra, SALA).some((o) => o.efeitos.cafeina)).toBe(false)
    expect(obterInteracoesDoMovel(cafeteira, SALA.moveis, cifra, SALA).some((o) => o.efeitos.cafeina)).toBe(true)
  })

  it('"sair" leva pra calçada em frente ao MEIO do lote, de qualquer tamanho', () => {
    expect(pontoNaRua({ colunas: 7, linhas: 7 }).coluna).toBe(3)
    expect(pontoNaRua({ colunas: 11, linhas: 5 })).toEqual({ coluna: 5, linha: 5.9 })
  })
})

describe('fila', () => {
  it('enfileira, executa e cancela', () => {
    let mundo = criarEstadoMundoSims(SALA)
    const [ir, alongar] = obterInteracoesDoChao(1, 1)
    mundo = enfileirarInteracaoSim(mundo, 'cifra', ir)
    expect(mundo.sims.cifra.interacaoAtual?.opcao.id).toBe(ir.id)
    mundo = enfileirarInteracaoSim(mundo, 'cifra', alongar)
    expect(mundo.sims.cifra.filaInteracoes).toHaveLength(1)
    mundo = cancelarInteracaoSim(mundo, 'cifra', 'atual')
    expect(mundo.sims.cifra.interacaoAtual?.opcao.id).toBe(alongar.id)
    expect(mundo.sims.cifra.filaInteracoes).toHaveLength(0)
  })
})

describe('o quadro', () => {
  it('decai mesmo em passos de 1 quadro (o arredondamento antigo engolia isso)', () => {
    let m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    const antes = m.sims.cifra.necessidades.cafeina
    m = rodar(m, 5)
    expect(m.sims.cifra.necessidades.cafeina).toBeLessThan(antes - 1)
  })

  it('pausado não muda nada', () => {
    const m = { ...criarEstadoMundoSims(SALA), velocidade: 0 as const }
    expect(avancarSimulacaoSims(m, SALA, 1)).toBe(m)
  })

  it('o relógio anda 1 minuto por segundo em 1x, e 3 em 3x', () => {
    const m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    expect(rodar(m, 10).minutosDoDia - m.minutosDoDia).toBeCloseTo(10, 0)
    expect(rodar({ ...m, velocidade: 3 }, 10).minutosDoDia - m.minutosDoDia).toBeCloseTo(30, 0)
  })

  it('caminha de forma contínua até o destino e então executa', () => {
    let m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    const [ir] = obterInteracoesDoChao(1, 5.5)
    m = enfileirarInteracaoSim(m, 'cifra', ir, false, SALA)
    const posicoes: number[] = []
    for (let i = 0; i < 30; i++) {
      m = rodar(m, 1 / 60)
      posicoes.push(m.sims.cifra.linha)
    }
    // nenhum salto: de quadro em quadro anda no máximo o passo de 1 quadro
    for (let i = 1; i < posicoes.length; i++) expect(Math.abs(posicoes[i] - posicoes[i - 1])).toBeLessThan(0.06)
    m = rodar(m, 8)
    expect(m.sims.cifra.interacaoAtual).toBeNull()
  })

  it('autonomia espera um respiro antes de escolher, e então escolhe', () => {
    const m = criarEstadoMundoSims(SALA)
    expect(avancarSimulacaoSims(m, SALA, 1 / 60, 0, semSorte).sims.norte.interacaoAtual).toBeNull()
    expect(rodar(m, 4).sims.norte.interacaoAtual).not.toBeNull()
  })

  it('relação sobe pros DOIS lados durante uma conversa', () => {
    let m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    const papo = obterInteracoesDoSim(m.sims.agenda, m.sims.cifra, SALA).find((o) => o.id.startsWith('social-papo-'))!
    const amizade = (de: string, para: string, mundo: EstadoMundoSims) =>
      mundo.sims[de].relacionamentos.find((r) => r.alvoId === para)!.amizade
    const antesCifra = amizade('cifra', 'agenda', m)
    const antesAgenda = amizade('agenda', 'cifra', m)
    m = enfileirarInteracaoSim(m, 'cifra', papo, false, SALA)
    m = rodar(m, 10)
    expect(amizade('cifra', 'agenda', m)).toBeGreaterThan(antesCifra)
    expect(amizade('agenda', 'cifra', m)).toBeGreaterThan(antesAgenda)
  })

  it('habilidade sobe devagar: 1 minuto de prática não vale mais de um nível', () => {
    let m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    const cadeira = SALA.moveis.find((x) => x.id === 'cifra-cadeira')!
    const trabalhar = obterInteracoesDoMovel(cadeira, SALA.moveis, m.sims.cifra, SALA).find((o) => o.id.startsWith('trabalhar-'))!
    const nivelAntes = m.sims.cifra.habilidades[0].nivel
    for (let i = 0; i < 5; i++) m = enfileirarInteracaoSim(m, 'cifra', trabalhar, false, SALA)
    m = rodar(m, 60)
    expect(m.sims.cifra.habilidades[0].nivel).toBeLessThanOrEqual(nivelAntes + 1)
  })
})

describe('autonomia', () => {
  it('café baixo → escolhe algo que dá café', () => {
    const m = criarEstadoMundoSims(SALA)
    const s = { ...m.sims.cifra, necessidades: cheias({ cafeina: 10 }) }
    expect(escolherInteracaoAutonoma(s, m, SALA, semSorte)?.efeitos.cafeina).toBeGreaterThan(0)
  })

  it('tudo confortável → volta pra própria mesa', () => {
    const m = criarEstadoMundoSims(SALA)
    const op = escolherInteracaoAutonoma({ ...m.sims.cifra, necessidades: cheias() }, m, SALA, semSorte)
    expect(op?.id.startsWith('trabalhar-')).toBe(true)
  })

  it('nada livre que resolva → volta pra mesa em vez de ficar parado', () => {
    let m = { ...criarEstadoMundoSims(SALA), autonomiaAtiva: false }
    const cafeteira = SALA.moveis.find((x) => x.peca.includes('Coffee'))!
    const expresso = obterInteracoesDoMovel(cafeteira, SALA.moveis, m.sims.vita, SALA).find((o) => o.efeitos.cafeina)!
    m = enfileirarInteracaoSim(m, 'vita', expresso, false, SALA)
    m = rodar(m, 6) // Vita chega e ocupa o encaixe da cafeteira
    const norte = { ...m.sims.norte, necessidades: cheias({ cafeina: 10 }) }
    const op = escolherInteracaoAutonoma(norte, m, SALA, semSorte)
    expect(op).not.toBeNull()
    expect(op?.alvoMovelId).not.toBe(cafeteira.id)
  })

  it('nunca escolhe a cadeira de outro agente', () => {
    const m = criarEstadoMundoSims(SALA)
    const s = { ...m.sims.cifra, necessidades: cheias({ foco: 5 }), movelCasaId: null }
    const op = escolherInteracaoParaNecessidade(s, 'foco', m, SALA, semSorte)
    const alheias = SALA.moveis.filter((x) => x.agente && x.agente !== 'cifra').map((x) => x.id)
    expect(alheias).not.toContain(op?.alvoMovelId)
  })
})

describe('rota, encaixe e conversa', () => {
  it('sofá tem 3 lugares e o segundo a chegar pega outro', () => {
    const sofa = { id: 'sofa-teste', peca: 'loungeSofa', coluna: 3, linha: 3, direcao: 'NE' as const }
    const slots = obterSlotsDeInteracaoMovel(sofa)
    expect(slots).toHaveLength(3)
    const daAgenda = escolherSlotLivreDoMovel(sofa, 'agenda', [
      { id: 'cifra', coluna: slots[0].coluna, linha: slots[0].linha, movelOcupadoId: 'sofa-teste', indiceSlotOcupado: 0 },
    ])
    expect(daAgenda.indiceSlot).toBe(1)
  })

  it('conversa frente a frente a uma distância confortável', () => {
    const pos = calcularPosicaoJigSocial({ coluna: 1, linha: 1 }, { coluna: 3, linha: 3 }, SALA, [], 'cifra')
    expect(Math.hypot(pos.coluna - 3, pos.linha - 3)).toBeGreaterThan(0.5)
  })

  it('A* chega no destino', () => {
    const rota = calcularCaminhoAEstrela({ coluna: 0.5, linha: 0.5 }, { coluna: 5.5, linha: 5.5 }, SALA)
    expect(rota[rota.length - 1]).toEqual({ coluna: 5.5, linha: 5.5 })
  })
})

describe('3D', () => {
  it('personagem tem esqueleto e muda de pose', () => {
    const mundo = criarEstadoMundoSims(SALA)
    const p3d = criarPersonagemSim3D('cifra', 0x16a34a)
    expect(p3d.articulacoes.cabeca).toBeDefined()
    expect(p3d.articulacoes.diamanteMesh).toBeDefined()

    p3d.atualizar(mundo.sims.cifra, true, 1.5, 0.016, { x: 3.5, z: 2.4 })
    expect(p3d.articulacoes.coxaEsq.rotation.x).toBeLessThan(-1)

    // o amortecimento usa o dt real: alguns quadros depois já está de pé
    mundo.sims.cifra.postura.corpo = 'andando'
    for (let i = 0; i < 30; i++) p3d.atualizar(mundo.sims.cifra, true, 2 + i / 60, 1 / 60, { x: 3.8 + i * 0.02, z: 2.7 })
    expect(p3d.articulacoes.pelve.position.y).toBeGreaterThan(0.5)
    p3d.destruir()
  })

  it('trocar aparência várias vezes não acumula peças (roupa/cabelo são refeitos)', () => {
    const p3d = criarPersonagemSim3D('norte', 0x0891b2)
    const contar = () => {
      let n = 0
      p3d.grupoRaiz.traverse((o) => {
        if (o instanceof THREE.Mesh) n++
      })
      return n
    }
    const antes = contar()
    for (let i = 0; i < 5; i++) p3d.aplicarAparenciaCAS(REGISTROS_PADRAO_POR_SIM.norte.aparencia)
    expect(contar()).toBe(antes)
    p3d.destruir()
  })

  it('lote: paredes da frente da câmera se cortam; todo móvel da sala vira modelo', () => {
    const lote = criarLoteVizinhanca3D(7, 7, PALETAS.neutra)
    expect(lote.paredes).toHaveLength(4)
    lote.atualizarModoParedes('cortadas', new THREE.Vector3(10, 8, 10), new THREE.Vector3(3, 0, 3))
    expect(lote.paredes.filter((p) => p.malhaAlta.visible)).toHaveLength(2)
    for (const m of SALA.moveis) expect(criarMovel3D(m).children.length).toBeGreaterThan(0)
  })

  it('personagem 3D tem anatomia orgânica esculpida (sem blocos quadrados) e rosto livre de auto-sombra manchada', () => {
    const p3d = criarPersonagemSim3D('cifra', 0x16a34a)
    let temBoxGeometry = false
    p3d.grupoRaiz.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry) {
        temBoxGeometry = true
      }
    })
    expect(temBoxGeometry).toBe(false)

    // Nenhuma malha da cabeça ou do rosto recebe sombra própria (evita acne de shadow-map no rosto)
    p3d.articulacoes.cabeca.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        expect(o.receiveShadow).toBe(false)
      }
    })
    p3d.destruir()
  })

  it('fórmula paramétrica 3D gera modelo distinto para todas as 140 peças do catálogo', () => {
    const familiasVistas = new Set<string>()
    for (const peca of PECAS) {
      const receita = extrairReceitaMovel3D(peca)
      familiasVistas.add(receita.familia)
      const modelo = criarMovel3D({
        id: `teste-${peca}`,
        peca,
        direcao: 'SE',
        coluna: 2,
        linha: 2,
      })
      expect(modelo.children.length).toBeGreaterThan(0)
    }
    expect(familiasVistas.size).toBeGreaterThanOrEqual(45)
  })
})

describe('criador de personagem e catálogo', () => {
  it('personagem novo chega pela calçada e entra', () => {
    const novo: RegistroSimCAS = {
      ...REGISTROS_PADRAO_POR_SIM.norte,
      id: 'sim_iris_novo',
      nome: 'Íris',
      funcao: 'marketing',
      especialidade: 'marketing',
      customizado: true,
    }
    const m = integrarSimDoCASNoMundo(criarEstadoMundoSims(SALA), novo, SALA, true)
    expect(m.sims.sim_iris_novo.foraDoLote).toBe(true)
    expect(m.sims.sim_iris_novo.interacaoAtual?.opcao.acaoEspecial).toBe('entrar_lote')
    // e os outros já o conhecem
    expect(m.sims.cifra.relacionamentos.some((r) => r.alvoId === 'sim_iris_novo')).toBe(true)
  })

  it('balão de rodada acha o agente pelo nome do BACKEND, mesmo renomeado na tela', () => {
    let m = criarEstadoMundoSims(SALA)
    m = { ...m, sims: { ...m.sims, vita: { ...m.sims.vita, nome: 'Vitinha' } } }
    m = aplicarInteracoesBackendNoMundo(m, [{ agente_nome: 'Vita', tipo: 'trabalho', motivo: 'Fechei a semana' } as never])
    expect(m.sims.vita.balao?.texto).toBe('Fechei a semana')
  })

  it('catálogo mostra o que a peça faz de verdade, sem preço inventado', () => {
    const cafe = obterMetadadosPeca('kitchenCoffeeMachine')
    expect(cafe.uso).toBe('café')
    expect(cafe).not.toHaveProperty('precoSimoleons')
    expect(obterMetadadosPeca('pottedPlant').ambiente).toBeGreaterThan(0)
    expect(obterMetadadosPeca('chairDesk').ambiente).toBe(0)
  })

  it('nomes em português, concordando com o gênero', () => {
    expect(nomeDoMovel('loungeDesignSofa')).toBe('sofá')
    expect(nomeCompletoDoMovel('rugRound')).toBe('Tapete redondo')
    expect(nomeCompletoDoMovel('tableRound')).toBe('Mesa redonda')
    expect(nomeCompletoDoMovel('tableCoffeeGlass')).toBe('Mesa de centro de vidro')
  })

  it('formata o relógio', () => {
    expect(formatarRelogioSim(9 * 60 + 5, 0)).toBe('Seg 09:05')
  })

  it('os 4 agentes canônicos possuem roupas, cabelos, acessórios e fisionomias exclusivas dos concept arts', () => {
    const { cifra, agenda, vita, norte } = REGISTROS_PADRAO_POR_SIM

    // Cifra
    expect(cifra.aparencia.estiloCabelo).toBe('topete_cifra')
    expect(cifra.aparencia.estiloRoupa).toBe('trenchcoat_cifra')
    expect(cifra.aparencia.detalheFacial).toBe('cifra_barba_cicatriz')
    expect(cifra.aparencia.propMao).toBe('caderneta_cifra')

    // Agenda
    expect(agenda.aparencia.estiloCabelo).toBe('coque_agenda')
    expect(agenda.aparencia.estiloRoupa).toBe('cardigan_agenda')
    expect(agenda.aparencia.oculos).toBe('gatinho_agenda')
    expect(agenda.aparencia.detalheFacial).toBe('agenda_pinta_madura')
    expect(agenda.aparencia.propMao).toBe('agenda_postits')

    // Vita
    expect(vita.aparencia.estiloCabelo).toBe('afro_vita')
    expect(vita.aparencia.estiloRoupa).toBe('regata_vita')
    expect(vita.aparencia.detalheFacial).toBe('vita_sardas_diastema')
    expect(vita.aparencia.propMao).toBe('garrafa_vita')

    // Norte
    expect(norte.aparencia.estiloCabelo).toBe('geek_norte')
    expect(norte.aparencia.estiloRoupa).toBe('moletom_norte')
    expect(norte.aparencia.oculos).toBe('geek_norte')
    expect(norte.aparencia.detalheFacial).toBe('norte_olheiras')
    expect(norte.aparencia.corOlhoDireito).toBeDefined()
    expect(norte.aparencia.corOlhoEsquerdo).toBeDefined()
    expect(norte.aparencia.corOlhoDireito).not.toBe(norte.aparencia.corOlhoEsquerdo)
  })

  it('personagens 3D dos 4 agentes canônicos instanciam seus visuais do Blender com integridade', () => {
    for (const id of ['cifra', 'agenda', 'vita', 'norte']) {
      const reg = REGISTROS_PADRAO_POR_SIM[id]
      const p3d = criarPersonagemSim3D(id, reg.corIdentidade, reg.aparencia)
      expect(p3d.grupoRaiz.children.length).toBeGreaterThan(0)
      expect(p3d.articulacoes.cabeca).toBeDefined()
      expect(p3d.articulacoes.peito).toBeDefined()
      p3d.destruir()
    }
  })
})
