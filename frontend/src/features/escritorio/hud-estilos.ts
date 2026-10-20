import type { CSSProperties } from 'react'

// Peças de estilo do HUD do modo simulação. Mesma linguagem do HUD
// "Console" de antes (docs/frontend-design.md): VIDRO só pro que flutua
// sobre o mundo — translúcido, com blur —, tinta `--ink` e o acento do
// mundo (`--accent`) pra "ligado". Painel de trabalho (catálogo, agente,
// configurações) continua sendo `--deck` opaco; isto aqui não é painel.
//
// Mora num .ts separado porque HudSimulacao e InspetorAgente usam os
// dois, e exportar constante de um .tsx quebra o fast refresh.

export const VIDRO: CSSProperties = {
  background: 'rgba(27, 30, 37, 0.62)',
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 40px -18px rgba(0,0,0,0.7)',
  borderRadius: 14,
  color: 'var(--ink)',
  fontFamily: 'var(--fonte-corpo)',
  userSelect: 'none',
}

// Botão padrão do HUD. `ativo` = ligado (acento); `destaque` = a ação
// principal (verde, o mesmo do avançar tick de antes).
export function botaoHud({ ativo = false, destaque = false, quadrado = false } = {}): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 30,
    minWidth: quadrado ? 30 : undefined,
    padding: quadrado ? 0 : '0 11px',
    borderRadius: 9,
    border: `1px solid ${ativo ? 'rgba(var(--accent-rgb), 0.55)' : destaque ? 'rgba(var(--good-rgb), 0.5)' : 'rgba(255,255,255,0.12)'}`,
    background: ativo ? 'rgba(var(--accent-rgb), 0.14)' : destaque ? 'rgba(var(--good-rgb), 0.14)' : 'rgba(255,255,255,0.05)',
    color: ativo ? 'var(--accent)' : destaque ? 'var(--good)' : 'var(--ink)',
    fontFamily: 'var(--fonte-corpo)',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }
}

export const SEPARADOR: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  margin: '2px 2px',
  background: 'rgba(255,255,255,0.1)',
}

// Rótulo pequeno em caixa alta (título de seção dentro do vidro).
export const ROTULO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-dim)',
}
