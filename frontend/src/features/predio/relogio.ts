// Relógio do prédio, em ms desde que o mundo nasceu, que PARA enquanto a aba está escondida.
//
// Existe como módulo (e não inline em mundo.ts) porque o bug que ele evita não dava pra provar de dentro do
// DOM: `requestAnimationFrame` não roda com a aba escondida, então ao voltar o relógio de parede tinha andado
// minutos de uma vez e os agentes "teleportavam" (cada passo da simulação é limitado, mas obras e prazos usam
// esse mesmo tempo). `agora` é injetável justamente pro teste usar um relógio falso.
export interface Relogio {
  /** ms de mundo (sem contar o tempo parado). */
  agora: () => number
  pausar: () => void
  retomar: () => void
}

export function criarRelogio(parede: () => number = () => performance.now()): Relogio {
  const inicio = parede()
  let pausadoEm: number | null = null
  let parado = 0
  return {
    agora: () => (pausadoEm ?? parede()) - inicio - parado,
    pausar: () => {
      if (pausadoEm === null) pausadoEm = parede()
    },
    retomar: () => {
      if (pausadoEm === null) return
      parado += parede() - pausadoEm
      pausadoEm = null
    },
  }
}
