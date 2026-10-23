// Chamadas do domínio "saude" — espelha backend/routers/saude.py.
import axios from 'axios'
import { api } from './client'
import type {
  DashboardSaude,
  DiaFicha,
  PerfilEnviado,
  PerfilSaude,
  PlanoDieta,
  QualidadeSono,
  RefeicaoRegistrada,
  RelatorioSemanal,
  TipoAtividade,
  TipoRefeicao,
} from '../types/saude'

// Três endpoints devolvem 404 quando o dado ainda NÃO EXISTE — perfil não
// preenchido, plano nunca gerado, relatório da semana não gerado. Isso não
// é falha: é uma resposta legítima que a tela precisa saber diferenciar de
// "deu erro". Traduzir pra `null` aqui evita que cada painel tenha que
// inspecionar status HTTP, e evita o pior: um 404 esperado virando um
// alerta vermelho de erro (que ensinaria a ignorar alertas).
async function nuloSe404<T>(chamada: () => Promise<T>): Promise<T | null> {
  try {
    return await chamada()
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null
    throw e
  }
}

export function obterPerfil(): Promise<PerfilSaude | null> {
  return nuloSe404(async () => (await api.get<PerfilSaude>('/saude/perfil')).data)
}

export async function salvarPerfil(perfil: PerfilEnviado): Promise<PerfilSaude> {
  return (await api.post<PerfilSaude>('/saude/perfil', perfil)).data
}

export async function obterDashboard(): Promise<DashboardSaude> {
  return (await api.get<DashboardSaude>('/saude/dashboard')).data
}

export async function registrarPeso(peso_kg: number): Promise<unknown> {
  return (await api.post('/saude/peso', { peso_kg })).data
}

export async function registrarHidratacao(quantidade_ml: number): Promise<unknown> {
  return (await api.post('/saude/hidratacao', { quantidade_ml })).data
}

export async function registrarSono(dados: {
  horas: number
  qualidade: QualidadeSono | null
}): Promise<unknown> {
  return (await api.post('/saude/sono', dados)).data
}

export async function registrarAtividade(dados: {
  tipo: TipoAtividade
  duracao_min: number
  observacao: string | null
}): Promise<unknown> {
  return (await api.post('/saude/atividade', dados)).data
}

export async function registrarRefeicaoTexto(dados: {
  tipo_refeicao: TipoRefeicao
  descricao: string
}): Promise<RefeicaoRegistrada> {
  return (await api.post<RefeicaoRegistrada>('/saude/refeicao/texto', dados)).data
}

export async function registrarRefeicaoFoto(dados: {
  tipo_refeicao: TipoRefeicao
  legenda: string | null
  arquivo: File
}): Promise<RefeicaoRegistrada> {
  const forma = new FormData()
  forma.append('tipo_refeicao', dados.tipo_refeicao)
  forma.append('arquivo', dados.arquivo)
  if (dados.legenda) forma.append('legenda', dados.legenda)
  // Content-Type undefined de propósito: o cliente tem JSON como padrão,
  // e aqui quem precisa montar o cabeçalho é o navegador — só ele sabe o
  // `boundary` do multipart. Forçar 'multipart/form-data' na mão manda um
  // cabeçalho sem boundary e o servidor não consegue separar as partes.
  return (
    await api.post<RefeicaoRegistrada>('/saude/refeicao/foto', forma, {
      headers: { 'Content-Type': undefined },
    })
  ).data
}

export async function obterFichaTreino(): Promise<DiaFicha[]> {
  return (await api.get<DiaFicha[]>('/saude/ficha-treino')).data
}

export async function salvarFichaTreino(dias: DiaFicha[]): Promise<DiaFicha[]> {
  return (await api.put<DiaFicha[]>('/saude/ficha-treino', { dias })).data
}

export function obterPlanoDieta(): Promise<PlanoDieta | null> {
  return nuloSe404(async () => (await api.get<PlanoDieta>('/saude/plano-dieta/atual')).data)
}

export async function gerarPlanoDieta(): Promise<PlanoDieta> {
  return (await api.post<PlanoDieta>('/saude/plano-dieta/gerar')).data
}

export function obterRelatorioSemanal(): Promise<RelatorioSemanal | null> {
  return nuloSe404(async () => (await api.get<RelatorioSemanal>('/saude/relatorio/semana-atual')).data)
}

export async function gerarRelatorioSemanal(): Promise<RelatorioSemanal> {
  return (await api.post<RelatorioSemanal>('/saude/relatorio/gerar')).data
}
