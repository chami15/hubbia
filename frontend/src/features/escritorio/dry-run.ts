import type { ResultadoAvancoMundo } from '../../hooks/useMundo'

// Persistência do MODO dry_run — mesmo espírito do rascunho de sala
// (persistencia.ts): "salva só localmente, pra voltar de onde parou".
// Aqui não tem quase nada a "voltar": dry_run nunca grava nada no
// servidor, então desligar o modo é só apagar a prévia que estava sendo
// mostrada — o estado real nunca foi tocado.
//
// Ativo e prévia moram em chaves separadas por uma razão: o toggle pode
// estar ligado sem nenhuma prévia ainda (o chefe ligou mas não clicou em
// avançar), e as duas precisam sobreviver a um F5 enquanto o modo
// estiver ligado.

const CHAVE_ATIVO = 'escritorio:dry-run:ativo'
const CHAVE_PREVIEW = 'escritorio:dry-run:preview'

export function dryRunEstaAtivo(): boolean {
  return localStorage.getItem(CHAVE_ATIVO) === '1'
}

// Ligar não mexe em prévia nenhuma (começa "limpo"). Desligar apaga a
// prévia junto — é o "volta a como era antes" que o chefe pediu.
export function definirDryRunAtivo(ativo: boolean): void {
  if (ativo) {
    localStorage.setItem(CHAVE_ATIVO, '1')
  } else {
    localStorage.removeItem(CHAVE_ATIVO)
    localStorage.removeItem(CHAVE_PREVIEW)
  }
}

export function lerPreviewSalva(): ResultadoAvancoMundo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_PREVIEW)
    return bruto ? (JSON.parse(bruto) as ResultadoAvancoMundo) : null
  } catch {
    return null
  }
}

export function salvarPreview(resultado: ResultadoAvancoMundo): void {
  localStorage.setItem(CHAVE_PREVIEW, JSON.stringify(resultado))
}
