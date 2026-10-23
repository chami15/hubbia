// Reexporta os estilos comuns dos painéis, fixando o acento do Cifra
// (o mesmo verde do anel do crachá dele) como botão principal.
import { botaoPrincipal } from '../agentes/estilos'

export * from '../agentes/estilos'

export const BOTAO_PRINCIPAL = botaoPrincipal('#16a34a')
