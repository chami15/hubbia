// Reexporta os estilos comuns dos painéis, fixando o acento do Norte
// (o mesmo ciano do anel do crachá dele) como botão principal.
import { botaoPrincipal } from '../agentes/estilos'

export * from '../agentes/estilos'

export const COR_NORTE = '#0891b2'
export const BOTAO_PRINCIPAL = botaoPrincipal(COR_NORTE)
