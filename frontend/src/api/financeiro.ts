// Chamadas do domínio "financeiro" — espelha backend/routers/financeiro.py.
import axios from 'axios'
import { api } from './client'
import type {
  Banco,
  DashboardFinanceiro,
  RelatorioFinanceiro,
  ResultadoImportacao,
} from '../types/financeiro'

// `banco` vai na QUERY, não no corpo: no router ele é parâmetro da
// função (Literal), não um Form — só o arquivo é multipart.
export async function importarExtrato(dados: {
  banco: Banco
  arquivo: File
}): Promise<ResultadoImportacao> {
  const forma = new FormData()
  forma.append('arquivo', dados.arquivo)
  return (
    await api.post<ResultadoImportacao>('/financeiro/extrato', forma, {
      params: { banco: dados.banco },
      // o navegador monta o multipart com o boundary; forçar o cabeçalho
      // na mão manda um sem boundary e o servidor não separa as partes
      headers: { 'Content-Type': undefined },
    })
  ).data
}

export async function obterDashboard(mes: string): Promise<DashboardFinanceiro> {
  return (await api.get<DashboardFinanceiro>('/financeiro/dashboard', { params: { mes } })).data
}

// 404 = relatório ainda não gerado pra esse mês. Estado normal, não erro:
// vira `null` como nos outros domínios, pra tela poder oferecer o botão
// de gerar em vez de mostrar alarme vermelho.
export async function obterRelatorio(mes: string): Promise<RelatorioFinanceiro | null> {
  try {
    return (await api.get<RelatorioFinanceiro>('/financeiro/relatorio', { params: { mes } })).data
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null
    throw e
  }
}

export async function gerarRelatorio(mes: string): Promise<RelatorioFinanceiro> {
  return (await api.post<RelatorioFinanceiro>('/financeiro/relatorio/gerar', null, { params: { mes } })).data
}
