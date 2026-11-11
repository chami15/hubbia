import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { opcoesDaMutacaoPauta } from '../usePauta'

describe('regressão: ação da Pauta que falhava deixava a tela velha', () => {
  // A mutação só recarregava os dados no onSuccess. Quando o "organizar agora" falhava (ex.: sem chave da OpenAI), o
  // backend já tinha marcado os textos como "com erro", mas a tela continuava dizendo "2 textos esperando" e o link
  // "com erro" não aparecia. Achado no navegador; agora recarrega ao terminar, dando certo ou não.
  it('recarrega tudo da Pauta depois de falhar', async () => {
    const cliente = new QueryClient()
    const recarregar = vi.spyOn(cliente, 'invalidateQueries').mockResolvedValue()
    const opcoes = opcoesDaMutacaoPauta(cliente, async () => {
      throw new Error('falhou')
    })
    await opcoes.onSettled?.(undefined, new Error('falhou'), undefined, undefined, undefined as never)
    expect(recarregar).toHaveBeenCalledWith({ queryKey: ['pauta'] })
  })

  it('e também depois de dar certo', async () => {
    const cliente = new QueryClient()
    const recarregar = vi.spyOn(cliente, 'invalidateQueries').mockResolvedValue()
    const opcoes = opcoesDaMutacaoPauta(cliente, async () => 'ok')
    await opcoes.onSettled?.('ok', null, undefined, undefined, undefined as never)
    expect(recarregar).toHaveBeenCalledWith({ queryKey: ['pauta'] })
  })
})
