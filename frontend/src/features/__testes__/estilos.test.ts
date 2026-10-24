import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Arquivos .ts/.tsx de features/, menos a arte copiada do habblaud (não é nossa e não usa estilo React).
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (nome === 'habblaud' || nome === '__testes__') return []
    return statSync(caminho).isDirectory() ? arquivos(caminho) : /\.tsx?$/.test(nome) ? [caminho] : []
  })
}

describe('regressão: border e borderColor misturados no mesmo estilo', () => {
  // O que acontecia: `{ ...BASE, borderColor: X }` sobre uma BASE que já define `border: '1px solid Y'`.
  // `border` e `borderColor` descrevem a mesma propriedade CSS; no re-render o React não sabe qual vale e
  // avisa "Removing a style property during rerender" no console. A troca certa é `border: '1px solid X'`.
  // Teste de texto de propósito: o aviso só aparece em re-render no navegador, onde ninguém olha em CI.
  it('nenhum estilo de features/ usa borderColor', () => {
    const achados = arquivos(join(process.cwd(), 'src/features')).flatMap((arq) =>
      readFileSync(arq, 'utf8')
        .split('\n')
        .map((linha, i) => ({ arq, n: i + 1, linha }))
        .filter(({ linha }) => /\bborderColor\s*:/.test(linha) && !linha.trim().startsWith('//')),
    )
    expect(achados.map(({ arq, n }) => `${arq.replace(process.cwd() + '/', '')}:${n}`)).toEqual([])
  })
})
