// Os andares do prédio. Cada andar diz onde fica o seu núcleo (hall do elevador + copa): à esquerda ou à direita, e o
// hall em cima ou embaixo do corredor. Assim cada andar tem o elevador num canto diferente (pedido do chefe), e um
// andar novo é só uma entrada aqui: nenhum desenho novo, o resto (salas, grade, elevadores) sai do dado.
//
// Regras:
// - todo andar tem o mesmo desenho de salas (decisão do chefe, 2026-11-12): `maxVagas` salas fixas, sempre desenhadas
//   (as vazias aparecem como vaga). Assim os andares têm a mesma largura e ninguém muda de lugar quando alguém chega;
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
  /** Salas do andar, fixas (par: metade em cima, metade embaixo do corredor). */
  maxVagas: number
}

export const ANDARES: readonly AndarDef[] = [
  {
    id: 0, nome: 'Térreo', botao: 'T',
    nucleo: { lado: 'esquerda', hall: 'cima', modeloHall: RECEPCAO, copa: COPA },
    placa: 'hubbia', maxVagas: 6,
  },
  // o 2º andar espelha o térreo: núcleo à direita, hall embaixo (outro canto), copa própria em cima
  {
    id: 1, nome: '2º andar', botao: '2',
    nucleo: { lado: 'direita', hall: 'baixo', modeloHall: HALL, copa: COPA },
    maxVagas: 6,
  },
]

export const TERREO = ANDARES[0]

export function andarPorId(id: AndarId): AndarDef {
  return ANDARES.find((a) => a.id === id) ?? TERREO
}
