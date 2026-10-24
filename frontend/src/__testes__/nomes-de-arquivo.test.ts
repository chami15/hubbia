import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (nome === 'habblaud') return [] // arte copiada, não é nossa
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho]
  })
}

describe('regressão: dois arquivos que só diferem na caixa da letra', () => {
  // O que acontecia: `Historico.tsx` (a tela) e `historico.ts` (a lógica) na mesma pasta. No Linux (onde rodam os testes
  // e o CI) são arquivos diferentes e o `import './Historico'` achava a tela. No macOS/Windows o sistema de arquivos ignora
  // a caixa: o import pegou `historico.ts`, que não exporta `Historico`, e o painel inteiro da Vita ficou em tela branca
  // ("does not provide an export named 'Historico'"). Teste de nomes porque só quem usa outro sistema vê o erro.
  it('nenhuma pasta de src/ tem dois arquivos com o mesmo nome ignorando caixa e extensão', () => {
    const porNome = new Map<string, string[]>()
    for (const arq of arquivos(join(process.cwd(), 'src'))) {
      const dir = arq.slice(0, arq.lastIndexOf('/'))
      const base = arq.slice(arq.lastIndexOf('/') + 1)
      const chave = `${dir}/${base.replace(/\.[^.]+$/, '').toLowerCase()}`
      porNome.set(chave, [...(porNome.get(chave) ?? []), base])
    }
    const colisoes = [...porNome.entries()].filter(([, nomes]) => nomes.length > 1).map(([chave, nomes]) => `${chave.replace(process.cwd() + '/', '')}: ${nomes.join(' vs ')}`)
    expect(colisoes).toEqual([])
  })
})
