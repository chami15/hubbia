// Os andares do prédio. Cada andar diz onde fica o seu núcleo (hall do elevador + copa): à esquerda ou à direita, e o
// hall em cima ou embaixo do corredor. Assim cada andar tem o elevador num canto diferente (pedido do chefe), e um
// andar novo é só uma entrada aqui: nenhum desenho novo, o resto (salas, grade, elevadores) sai do dado.
//
// Regras:
// - núcleo à esquerda pode crescer (salas novas entram à direita sem mexer em ninguém); à direita, o número de salas é
//   fixo (`maxVagas`), senão o núcleo andaria a cada sala nova;
// - todo andar tem elevador (é por ele que se chega); copa é opcional. Sem copa, o almoço daquele andar é "fora"
//   (pega o elevador, como já acontecia).
import { COPA, HALL, RECEPCAO, type ModeloSala } from './salas'

export type AndarId = number

export interface AndarDef {
  id: AndarId
  /** No painel do elevador ("Térreo", "2º andar"). */
  nome: string
  /** No botão do elevador e no indicador ("T", "2"). */
  botao: string
  nucleo: {
    lado: 'esquerda' | 'direita'
    hall: 'cima' | 'baixo'
    modeloHall: ModeloSala
    /** A outra metade do núcleo. Sem ela, o andar não tem copa. */
    copa?: ModeloSala
  }
  /** Placa do hall (só o térreo tem: "hubbia" na recepção). */
  placa?: string
  maxVagas: number
}

export const ANDARES: readonly AndarDef[] = [
  {
    id: 0, nome: 'Térreo', botao: 'T',
    nucleo: { lado: 'esquerda', hall: 'cima', modeloHall: RECEPCAO, copa: COPA },
    placa: 'hubbia', maxVagas: 8,
  },
  // o 2º andar espelha o térreo: núcleo à direita, hall embaixo (outro canto), copa própria em cima
  {
    id: 1, nome: '2º andar', botao: '2',
    nucleo: { lado: 'direita', hall: 'baixo', modeloHall: HALL, copa: COPA },
    maxVagas: 4,
  },
]

export const TERREO = ANDARES[0]

export function andarPorId(id: AndarId): AndarDef {
  return ANDARES.find((a) => a.id === id) ?? TERREO
}
