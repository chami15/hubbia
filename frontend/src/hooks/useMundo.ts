import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as apiTick from '../api/tick'
import * as apiInteracao from '../api/interacao'
import { mensagemDeErro } from '../api/client'
import type { TickAvancado } from '../types/tick'
import type { RodadaProcessada } from '../types/interacao'

// "Avançar o mundo em 1 passo" — decisão do chefe: tick/avancar e
// interacao/tick/processar deixam de ser dois botões pra virar UM clique
// só, sempre nessa ordem (a rodada social/trabalho depende de um tick
// já existir). O `dry_run` vale pras duas chamadas juntas.

export interface ResultadoAvancoMundo {
  tick: TickAvancado
  // null só no caso raro de dar dry_run=true no PRIMEIRO clique de todos
  // (antes de qualquer tick real existir) — nesse caso tick/avancar(dry_run)
  // não persiste nada, então "processar rodada" não acha tick nenhum pra
  // usar como referência e falha. `avisoRodada` explica isso na tela em
  // vez de derrubar o avanço inteiro.
  rodada: RodadaProcessada | null
  avisoRodada?: string
}

export function useAvancarMundo() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<ResultadoAvancoMundo> => {
      const tick = await apiTick.avancarTick(dryRun)
      try {
        const rodada = await apiInteracao.processarRodada(dryRun)
        return { tick, rodada }
      } catch (erro) {
        // só pode acontecer quando dryRun=true no PRIMEIRO clique de
        // todos: tick/avancar(dry_run) não persiste nada, então não
        // existe tick REAL pra "processar rodada" usar como referência.
        // Em modo real isso nunca acontece — o avanço anterior sempre
        // deixa um tick de verdade gravado antes deste try.
        const avisoRodada = dryRun
          ? 'ainda não dá pra conferir a rodada: nenhum tick real existe pra servir de base. Desligue o modo simulado e avance uma vez de verdade primeiro.'
          : mensagemDeErro(erro)
        return { tick, rodada: null, avisoRodada }
      }
    },
    onSuccess: (_resultado, dryRun) => {
      // dry_run não gasta nem grava nada — nenhuma query real mudou
      if (dryRun) return
      void cliente.invalidateQueries({ queryKey: ['tick', 'atual'] })
      void cliente.invalidateQueries({ queryKey: ['tick', 'orcamento'] })
      void cliente.invalidateQueries({ queryKey: ['agentes'] })
      void cliente.invalidateQueries({ queryKey: ['mensagens'] })
    },
  })
}
