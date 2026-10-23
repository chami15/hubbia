// Porta única pro backend — equivalente ao utils/query_executor.py.
// Nenhum componente/hook chama axios/fetch direto: tudo passa por
// aqui, e por isso a URL base, headers e tratamento de erro só
// existem em UM lugar.
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Transforma o erro do axios numa frase que dá pra mostrar na tela.
// Mora aqui, e não em cada painel, porque a forma do erro é assunto da
// porta pro backend — RNF03 pede mensagem clara e acionável, nunca um
// "algo deu errado" genérico nem uma tela quebrada.
//
// A ordem tenta do mais específico pro mais genérico:
//   1. `detail` do FastAPI (string ou lista de erros de validação 422)
//   2. mensagem do próprio axios (timeout, DNS, etc.)
//   3. último recurso
export function mensagemDeErro(erro: unknown): string {
  if (axios.isAxiosError(erro)) {
    if (!erro.response) {
      // sem resposta = nem chegou no servidor. O caso mais comum de
      // longe é o backend não estar rodando — vale dizer isso em vez
      // de "Network Error", que não ajuda ninguém.
      return 'Não consegui falar com o servidor. Ele está rodando?'
    }
    const detalhe = (erro.response.data as { detail?: unknown } | undefined)?.detail
    if (typeof detalhe === 'string') return detalhe
    if (Array.isArray(detalhe)) {
      const primeiro = detalhe[0] as { msg?: unknown } | undefined
      if (typeof primeiro?.msg === 'string') return primeiro.msg
    }
    return `O servidor respondeu ${erro.response.status}.`
  }
  if (erro instanceof Error) return erro.message
  return 'Erro inesperado.'
}
