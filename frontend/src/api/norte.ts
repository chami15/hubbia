// Chamadas do domínio "norte" — espelha backend/routers/norte.py.
import axios from 'axios'
import { api } from './client'
import type { Card, Projeto, ResolucaoCard, TipoCard } from '../types/norte'

export async function listarProjetos(): Promise<Projeto[]> {
  return (await api.get<Projeto[]>('/norte/projetos')).data
}

// Chamado assim que o link é colado, pra oferecer as branches REAIS como
// opção — o chefe nunca digita uma branch às cegas (achado testando: nem
// todo repositório tem o conteúdo na default branch do GitHub).
export async function listarBranches(repositorio_url: string): Promise<string[]> {
  return (
    await api.get<string[]>('/norte/repositorios/branches', { params: { repositorio_url } })
  ).data
}

export async function criarProjeto(dados: {
  nome: string
  repositorio_url: string
  branch: string | null
}): Promise<Projeto> {
  return (await api.post<Projeto>('/norte/projetos', dados)).data
}

// 404 aqui é "esse projeto não tem card em aberto agora" — estado normal
// (acabou de ser cadastrado, ou o último foi resolvido e o encadeamento
// falhou), não erro. Vira `null` pela mesma razão dos endpoints da Vita.
export async function obterCardAtivo(projetoId: number): Promise<Card | null> {
  try {
    return (await api.get<Card>(`/norte/projetos/${projetoId}/cards/ativo`)).data
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null
    throw e
  }
}

export async function listarHistoricoCards(projetoId: number): Promise<Card[]> {
  return (await api.get<Card[]>(`/norte/projetos/${projetoId}/cards/historico`)).data
}

export async function gerarCard(projetoId: number): Promise<Card> {
  return (await api.post<Card>(`/norte/projetos/${projetoId}/cards/gerar`)).data
}

export async function criarCardManual(
  projetoId: number,
  dados: { tipo: TipoCard; titulo: string; descricao: string; arquivos_afetados: string[] },
): Promise<Card> {
  return (await api.post<Card>(`/norte/projetos/${projetoId}/cards/manual`, dados)).data
}

// Aceitar NÃO encadeia: o card só muda de sugerido pra aceito e continua
// sendo o card ativo. Quem encadeia é rejeitar e finalizar.
export async function aceitarCard(cardId: number): Promise<Card> {
  return (await api.post<Card>(`/norte/cards/${cardId}/aceitar`)).data
}

export async function rejeitarCard(cardId: number): Promise<ResolucaoCard> {
  return (await api.post<ResolucaoCard>(`/norte/cards/${cardId}/rejeitar`)).data
}

export async function finalizarCard(cardId: number): Promise<ResolucaoCard> {
  return (await api.post<ResolucaoCard>(`/norte/cards/${cardId}/finalizar`)).data
}
