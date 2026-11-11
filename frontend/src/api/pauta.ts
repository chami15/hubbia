// Chamadas do domínio "pauta" — espelha backend/routers/pauta.py. Só organizar, sugestão e revisão gastam LLM, e só
// são chamadas por clique (RNF01): nenhuma leitura (GET) daqui custa nada.
import { api } from './client'
import type {
  ContagemTextos, Frente, ItemChecklist, Pergunta, ResumoRodada, Revisao, Sugestao, Tarefa, TarefaResumo, TextoFalhou, Topico,
} from '../types/pauta'

export const listarFrentes = async (): Promise<Frente[]> => (await api.get<Frente[]>('/pauta/frentes')).data

export const listarTarefas = async (frenteId: number, ocultas: boolean): Promise<TarefaResumo[]> =>
  (await api.get<TarefaResumo[]>(`/pauta/frentes/${frenteId}/tarefas`, { params: { ocultas } })).data

export const obterTarefa = async (id: number): Promise<Tarefa> => (await api.get<Tarefa>(`/pauta/tarefas/${id}`)).data

export const criarTarefa = async (dados: { frente_id: number; titulo: string; prazo?: string | null }): Promise<Tarefa> =>
  (await api.post<Tarefa>('/pauta/tarefas', dados)).data

export const atualizarTarefa = async (id: number, dados: { titulo?: string; prazo?: string | null; frente_id?: number }): Promise<Tarefa> =>
  (await api.patch<Tarefa>(`/pauta/tarefas/${id}`, dados)).data

export const mudarStatus = async (id: number, status: 'aberta' | 'feita' | 'arquivada'): Promise<Tarefa> =>
  (await api.post<Tarefa>(`/pauta/tarefas/${id}/status`, { status })).data

export const ocultar = async (id: number, oculta: boolean): Promise<Tarefa> =>
  (await api.post<Tarefa>(`/pauta/tarefas/${id}/${oculta ? 'ocultar' : 'desocultar'}`)).data

export const registrarTexto = async (texto: string, tarefaId?: number) =>
  (await api.post('/pauta/textos', { texto, tarefa_id: tarefaId ?? null })).data

export const contarTextos = async (): Promise<ContagemTextos> => (await api.get<ContagemTextos>('/pauta/textos/contagem')).data

export const listarFalhas = async (): Promise<TextoFalhou[]> => (await api.get<TextoFalhou[]>('/pauta/textos/falhas')).data

export const tentarDeNovo = async (id: number) => (await api.post(`/pauta/textos/${id}/tentar-de-novo`)).data

export const adicionarItem = async (tarefaId: number, texto: string): Promise<ItemChecklist> =>
  (await api.post<ItemChecklist>(`/pauta/tarefas/${tarefaId}/checklist`, { texto })).data

export const atualizarItem = async (id: number, dados: { feito?: boolean; texto?: string }): Promise<ItemChecklist> =>
  (await api.patch<ItemChecklist>(`/pauta/checklist/${id}`, dados)).data

export const removerItem = async (id: number): Promise<void> => {
  await api.delete(`/pauta/checklist/${id}`)
}

export const organizar = async (): Promise<ResumoRodada> => (await api.post<ResumoRodada>('/pauta/organizar')).data

export const perguntaAtual = async (): Promise<Pergunta | null> => (await api.get<Pergunta | null>('/pauta/perguntas/atual')).data

export const responder = async (id: number, opcao: number) =>
  (await api.post(`/pauta/perguntas/${id}/resposta`, { opcao })).data

export const atualizarContexto = async (tarefaId: number): Promise<Topico[]> =>
  (await api.post<Topico[]>(`/pauta/tarefas/${tarefaId}/contexto`)).data

export const sugerir = async (tarefaId: number): Promise<{ sugestao: Sugestao; nova: boolean }> =>
  (await api.post(`/pauta/tarefas/${tarefaId}/sugestao`)).data

export const resolverSugestao = async (id: number, aceitar: boolean): Promise<Tarefa> =>
  (await api.post<Tarefa>(`/pauta/sugestoes/${id}/${aceitar ? 'aceitar' : 'descartar'}`)).data

export const obterRevisao = async (): Promise<Revisao | null> => (await api.get<Revisao | null>('/pauta/revisao')).data

export const clarear = async (): Promise<{ revisao: Revisao; nova: boolean }> => (await api.post('/pauta/revisao')).data

export const resolverItemRevisao = async (id: number, aceitar: boolean): Promise<Revisao | null> =>
  (await api.post<Revisao | null>(`/pauta/revisao/itens/${id}/${aceitar ? 'aceitar' : 'descartar'}`)).data
