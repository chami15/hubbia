import { categoriaDe } from './catalogo'
import { direcaoParaAnguloY } from './moveis3d'
import type { MovelSala, SalaDados } from './sala-dados'

// ---------------------------------------------------------------------------
// SISTEMA DE ROTEAMENTO A*, COLISÃO DE MOBÍLIA, SLOTS E JIGS SOCIAIS
//
// Extraído da arquitetura de `simulation.zip` e `core.zip` do The Sims 4:
//   - `native/routing/connectivity.pyc` & `services/object_routing_service.pyc`
//   - `visualization/jig_visualizer.pyc` (Jigs Sociais: pares de posições a
//     0.72m de distância livres de colisão para conversas frente a frente)
//   - `visualization/sectional_sofa_visualizer.pyc` (Múltiplos assentos por
//     sofá/mesa para que Sims não sentem um em cima do outro)
//   - `visualization/portal_visualizer.pyc` (Portais de entrada/saída de
//     salas e da calçada/rua externa do lote)
// ---------------------------------------------------------------------------

export interface PontoRota {
  coluna: number
  linha: number
}

export interface OcupanteRota {
  id: string
  coluna: number
  linha: number
  destinoColuna?: number | null
  destinoLinha?: number | null
  movelOcupadoId?: string | null
  indiceSlotOcupado?: number
}

export interface PegadaMovel {
  id: string
  minCol: number
  maxCol: number
  minLin: number
  maxLin: number
  bloqueiaPassagem: boolean
}

export interface SlotInteracao {
  idSlot: string
  coluna: number
  linha: number
  olharColuna: number
  olharLinha: number
}

const DISTANCIA_MINIMA_SIMS = 0.58

export function obterPegadaMovel(movel: MovelSala): PegadaMovel {
  const p = movel.peca
  const cat = categoriaDe(p)

  if (movel.sobre || cat === 'chao' || p.startsWith('wall') || p.startsWith('doorway')) {
    return {
      id: movel.id,
      minCol: movel.coluna,
      maxCol: movel.coluna,
      minLin: movel.linha,
      maxLin: movel.linha,
      bloqueiaPassagem: false,
    }
  }

  let meiaLarg = 0.34
  let meiaProf = 0.34

  if (p.startsWith('desk')) {
    meiaLarg = 0.48
    meiaProf = 0.32
  } else if (p.startsWith('lounge') && !p.includes('Chair')) {
    meiaLarg = 0.68
    meiaProf = 0.36
  } else if (p.startsWith('bookcase') || cat === 'cozinha' || cat === 'mesas') {
    meiaLarg = 0.42
    meiaProf = 0.32
  } else if (p.startsWith('chair')) {
    meiaLarg = 0.25
    meiaProf = 0.25
  } else if (cat === 'verde') {
    meiaLarg = 0.24
    meiaProf = 0.24
  }

  const girado = movel.direcao === 'NW' || movel.direcao === 'SE'
  const rx = girado ? meiaProf : meiaLarg
  const rz = girado ? meiaLarg : meiaProf

  return {
    id: movel.id,
    minCol: movel.coluna - rx,
    maxCol: movel.coluna + rx,
    minLin: movel.linha - rz,
    maxLin: movel.linha + rz,
    bloqueiaPassagem: true,
  }
}

export function pontoColideComMoveis(
  coluna: number,
  linha: number,
  moveis: MovelSala[],
  ignorarMovelIds: Set<string> = new Set(),
  margemExtra = 0.08,
): boolean {
  for (const m of moveis) {
    if (ignorarMovelIds.has(m.id)) continue
    const pegada = obterPegadaMovel(m)
    if (!pegada.bloqueiaPassagem) continue
    if (
      coluna >= pegada.minCol - margemExtra &&
      coluna <= pegada.maxCol + margemExtra &&
      linha >= pegada.minLin - margemExtra &&
      linha <= pegada.maxLin + margemExtra
    ) {
      return true
    }
  }
  return false
}

export function pontoColideComOutrosSims(
  coluna: number,
  linha: number,
  posicoesOcupadas: OcupanteRota[],
  ignorarSimId = '',
  distanciaMin = DISTANCIA_MINIMA_SIMS,
): boolean {
  for (const outro of posicoesOcupadas) {
    if (outro.id === ignorarSimId) continue
    if (Math.hypot(coluna - outro.coluna, linha - outro.linha) < distanciaMin) {
      return true
    }
  }
  return false
}

export function pontoColideComAlguemOuMovel(
  coluna: number,
  linha: number,
  sala: SalaDados,
  ocupantes: OcupanteRota[],
  ignorarSimId = '',
  ignorarMovelId: string | null = null,
): boolean {
  const ignorarSet = new Set<string>()
  if (ignorarMovelId) ignorarSet.add(ignorarMovelId)
  if (pontoColideComMoveis(coluna, linha, sala.moveis, ignorarSet, 0.04)) return true
  if (pontoColideComOutrosSims(coluna, linha, ocupantes, ignorarSimId, DISTANCIA_MINIMA_SIMS)) return true
  return false
}

export function obterSlotsDeInteracaoMovel(movel: MovelSala): SlotInteracao[] {
  const angulo = direcaoParaAnguloY(movel.direcao)
  const frenteX = Math.sin(angulo)
  const frenteZ = Math.cos(angulo)
  const direitaX = Math.cos(angulo)
  const direitaZ = -Math.sin(angulo)

  const p = movel.peca
  const cat = categoriaDe(p)

  if ((p.startsWith('lounge') && !p.includes('Chair')) || p.startsWith('bench')) {
    return [-0.45, 0, 0.45].map((offsetLateral, idx) => {
      const c = Number((movel.coluna + direitaX * offsetLateral + frenteX * 0.08).toFixed(2))
      const l = Number((movel.linha + direitaZ * offsetLateral + frenteZ * 0.08).toFixed(2))
      return {
        idSlot: `${movel.id}:assento-${idx}`,
        coluna: c,
        linha: l,
        olharColuna: c + frenteX,
        olharLinha: l + frenteZ,
      }
    })
  }

  if (cat === 'assentos' || p.startsWith('chair') || cat === 'quarto') {
    return [
      {
        idSlot: `${movel.id}:assento-0`,
        coluna: movel.coluna,
        linha: movel.linha,
        olharColuna: movel.coluna + frenteX,
        olharLinha: movel.linha + frenteZ,
      },
    ]
  }

  if (p.startsWith('doorway') || movel.leva) {
    return [
      {
        idSlot: `${movel.id}:portal-0`,
        coluna: Number(movel.coluna.toFixed(2)),
        linha: Number((movel.linha + 0.4).toFixed(2)),
        olharColuna: movel.coluna,
        olharLinha: movel.linha,
      },
    ]
  }

  const candidatos: [number, number][] = [
    [frenteX * 0.62, frenteZ * 0.62],
    [frenteX * 0.52 + direitaX * 0.48, frenteZ * 0.52 + direitaZ * 0.48],
    [frenteX * 0.52 - direitaX * 0.48, frenteZ * 0.52 - direitaZ * 0.48],
    [-frenteX * 0.62, -frenteZ * 0.62],
  ]

  return candidatos.map(([dx, dz], idx) => ({
    idSlot: `${movel.id}:em_pe-${idx}`,
    coluna: Number((movel.coluna + dx).toFixed(2)),
    linha: Number((movel.linha + dz).toFixed(2)),
    olharColuna: movel.coluna,
    olharLinha: movel.linha,
  }))
}

export function escolherSlotLivreDoMovel(
  movel: MovelSala,
  simId: string,
  ocupantes: OcupanteRota[],
): { slot: SlotInteracao; indiceSlot: number } {
  const slots = obterSlotsDeInteracaoMovel(movel)

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    const jaReservado = ocupantes.some(
      (o) =>
        o.id !== simId &&
        ((o.movelOcupadoId === movel.id && o.indiceSlotOcupado === i) ||
          Math.hypot(o.coluna - s.coluna, o.linha - s.linha) < 0.42),
    )
    if (!jaReservado) {
      return { slot: s, indiceSlot: i }
    }
  }

  return { slot: slots[0], indiceSlot: 0 }
}

export function calcularPosicaoJigSocial(
  origemSim: PontoRota,
  alvoSim: PontoRota,
  sala: SalaDados,
  ocupantes: OcupanteRota[],
  simId = '',
): PontoRota {
  const raioJig = 0.72
  const angBase = Math.atan2(origemSim.linha - alvoSim.linha, origemSim.coluna - alvoSim.coluna)
  const offsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]

  for (const off of offsets) {
    const a = angBase + off
    const c = limitarCol(alvoSim.coluna + Math.cos(a) * raioJig, sala.colunas)
    const l = limitarLin(alvoSim.linha + Math.sin(a) * raioJig, sala.linhas)
    if (
      !pontoColideComMoveis(c, l, sala.moveis, new Set(), 0.06) &&
      !pontoColideComOutrosSims(c, l, ocupantes, simId, 0.5)
    ) {
      return { coluna: Number(c.toFixed(2)), linha: Number(l.toFixed(2)) }
    }
  }

  return encontrarPosicaoLivrePerto(alvoSim.coluna, alvoSim.linha, sala, ocupantes, simId)
}

export function encontrarPosicaoLivrePerto(
  colunaDesejada: number,
  linhaDesejada: number,
  sala: SalaDados,
  ocupantes: OcupanteRota[],
  simId = '',
  ignorarMoveis: Set<string> = new Set(),
): PontoRota {
  const c0 = limitarCol(colunaDesejada, sala.colunas)
  const l0 = limitarLin(linhaDesejada, sala.linhas)

  if (
    !pontoColideComMoveis(c0, l0, sala.moveis, ignorarMoveis, 0.05) &&
    !pontoColideComOutrosSims(c0, l0, ocupantes, simId, DISTANCIA_MINIMA_SIMS)
  ) {
    return { coluna: Number(c0.toFixed(2)), linha: Number(l0.toFixed(2)) }
  }

  for (let raio = 0.45; raio <= 3.2; raio += 0.35) {
    const passos = 12
    for (let i = 0; i < passos; i++) {
      const a = (i * Math.PI * 2) / passos
      const c = limitarCol(c0 + Math.cos(a) * raio, sala.colunas)
      const l = limitarLin(l0 + Math.sin(a) * raio, sala.linhas)
      if (
        !pontoColideComMoveis(c, l, sala.moveis, ignorarMoveis, 0.05) &&
        !pontoColideComOutrosSims(c, l, ocupantes, simId, DISTANCIA_MINIMA_SIMS)
      ) {
        return { coluna: Number(c.toFixed(2)), linha: Number(l.toFixed(2)) }
      }
    }
  }

  return { coluna: Number(c0.toFixed(2)), linha: Number(l0.toFixed(2)) }
}

export function calcularCaminhoAEstrela(
  origem: PontoRota,
  destino: PontoRota,
  sala: SalaDados,
  ocupantes: OcupanteRota[] = [],
  simId = '',
  alvoMovelId: string | null = null,
): PontoRota[] {
  const PASSO = 0.5
  const maxC = Math.max(4, sala.colunas)
  const maxL = Math.max(4, sala.linhas)

  if (destino.linha > maxL - 0.3 || origem.linha > maxL - 0.3) {
    return [destino]
  }

  const ignorarMovelIds = new Set<string>()
  if (alvoMovelId) ignorarMovelIds.add(alvoMovelId)

  const paraIndice = (c: number, l: number) => ({
    ix: Math.round(Math.max(0, Math.min(maxC - 0.5, c)) / PASSO),
    iz: Math.round(Math.max(0, Math.min(maxL - 0.5, l)) / PASSO),
  })
  const paraCoord = (ix: number, iz: number): PontoRota => ({
    coluna: Number((ix * PASSO).toFixed(2)),
    linha: Number((iz * PASSO).toFixed(2)),
  })

  const ini = paraIndice(origem.coluna, origem.linha)
  const fim = paraIndice(destino.coluna, destino.linha)
  if (ini.ix === fim.ix && ini.iz === fim.iz) return [destino]

  const largG = Math.round(maxC / PASSO) + 1
  const altG = Math.round(maxL / PASSO) + 1
  const chave = (ix: number, iz: number) => `${ix},${iz}`

  function celulaLivre(ix: number, iz: number): boolean {
    if (ix < 0 || iz < 0 || ix >= largG || iz >= altG) return false
    if ((ix === ini.ix && iz === ini.iz) || (ix === fim.ix && iz === fim.iz)) return true
    const pt = paraCoord(ix, iz)
    if (pontoColideComMoveis(pt.coluna, pt.linha, sala.moveis, ignorarMovelIds, 0.08)) {
      return false
    }
    if (pontoColideComOutrosSims(pt.coluna, pt.linha, ocupantes, simId, 0.42)) {
      return false
    }
    return true
  }

  const abertos: { ix: number; iz: number; g: number; f: number }[] = [
    {
      ix: ini.ix,
      iz: ini.iz,
      g: 0,
      f: Math.hypot(fim.ix - ini.ix, fim.iz - ini.iz),
    },
  ]
  const veioDe = new Map<string, { ix: number; iz: number }>()
  const melhorG = new Map<string, number>([[chave(ini.ix, ini.iz), 0]])
  const fechados = new Set<string>()

  const direcoes = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ]

  let iteracoes = 0
  while (abertos.length > 0 && iteracoes < 360) {
    iteracoes++
    abertos.sort((a, b) => a.f - b.f)
    const atual = abertos.shift()!
    const kAtual = chave(atual.ix, atual.iz)

    if (atual.ix === fim.ix && atual.iz === fim.iz) {
      const caminho: PontoRota[] = [destino]
      let cursor: { ix: number; iz: number } | undefined = atual
      while (cursor) {
        const k = chave(cursor.ix, cursor.iz)
        const ant = veioDe.get(k)
        if (!ant) break
        if (!(cursor.ix === fim.ix && cursor.iz === fim.iz)) {
          caminho.unshift(paraCoord(cursor.ix, cursor.iz))
        }
        cursor = ant
      }
      return simplificarCaminho(caminho, sala.moveis, ignorarMovelIds)
    }

    fechados.add(kAtual)

    for (const [dx, dz, custo] of direcoes) {
      const nx = atual.ix + dx
      const nz = atual.iz + dz
      const kViz = chave(nx, nz)
      if (fechados.has(kViz)) continue
      if (!celulaLivre(nx, nz)) continue

      if (dx !== 0 && dz !== 0) {
        if (!celulaLivre(atual.ix + dx, atual.iz) || !celulaLivre(atual.ix, atual.iz + dz)) {
          continue
        }
      }

      const gTentativa = atual.g + custo
      if (gTentativa < (melhorG.get(kViz) ?? Infinity)) {
        veioDe.set(kViz, { ix: atual.ix, iz: atual.iz })
        melhorG.set(kViz, gTentativa)
        const h = Math.hypot(fim.ix - nx, fim.iz - nz)
        const existente = abertos.find((n) => n.ix === nx && n.iz === nz)
        if (existente) {
          existente.g = gTentativa
          existente.f = gTentativa + h
        } else {
          abertos.push({ ix: nx, iz: nz, g: gTentativa, f: gTentativa + h })
        }
      }
    }
  }

  return [destino]
}

function simplificarCaminho(
  caminho: PontoRota[],
  moveis: MovelSala[],
  ignorarMovelIds: Set<string>,
): PontoRota[] {
  if (caminho.length <= 2) return caminho
  const resultado: PontoRota[] = [caminho[0]]
  let i = 0
  while (i < caminho.length - 1) {
    let proximo = i + 1
    for (let j = caminho.length - 1; j > i + 1; j--) {
      if (linhaDeVisaoLivre(caminho[i], caminho[j], moveis, ignorarMovelIds)) {
        proximo = j
        break
      }
    }
    resultado.push(caminho[proximo])
    i = proximo
  }
  return resultado
}

function linhaDeVisaoLivre(
  a: PontoRota,
  b: PontoRota,
  moveis: MovelSala[],
  ignorarMovelIds: Set<string>,
): boolean {
  const dist = Math.hypot(b.coluna - a.coluna, b.linha - a.linha)
  const passos = Math.max(2, Math.ceil(dist / 0.25))
  for (let s = 1; s < passos; s++) {
    const t = s / passos
    const c = a.coluna + (b.coluna - a.coluna) * t
    const l = a.linha + (b.linha - a.linha) * t
    if (pontoColideComMoveis(c, l, moveis, ignorarMovelIds, 0.06)) return false
  }
  return true
}

function limitarCol(c: number, colunas: number): number {
  return Math.max(0.25, Math.min(Math.max(1, colunas - 0.75), c))
}

function limitarLin(l: number, linhas: number): number {
  return Math.max(0.25, Math.min(Math.max(1, linhas - 0.75), l))
}
