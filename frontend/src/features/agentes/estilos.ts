// Estilos compartilhados pelos painéis de agente. Existem num arquivo só
// porque já são vários formulários em dois domínios: repetir o objeto de
// estilo em cada um garantiria que uma hora ficassem sutilmente
// diferentes entre si (RNF05 pede consistência visual entre os painéis).
//
// O que NÃO mora aqui é a cor de acento — ela é de cada agente (a mesma
// do anel do crachá), e vem por `botaoPrincipal(cor)`.
//
// Redesenho "Console" (docs/frontend-design.md): painel de agente é
// SUPERFÍCIE DE TRABALHO, não instrumento flutuante — por isso usa
// `--deck` (chapa opaca) e cantos retos (`--radius-deck`), nunca o
// vidro translúcido que só o HUD usa (Escritorio.tsx).

export const CAMPO: React.CSSProperties = {
  width: '100%',
  background: '#0a0b0e',
  border: '1px solid var(--deck-line)',
  borderRadius: 4,
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 12,
  padding: '7px 9px',
  boxSizing: 'border-box',
  // sem isto a lista de um <select> abre com fundo branco do sistema,
  // ilegível com texto claro
  colorScheme: 'dark',
}

export const OPCAO: React.CSSProperties = {
  background: '#20232a',
  color: 'var(--ink)',
}

export const ROTULO: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--ink-dim)',
  marginBottom: 4,
}

// Fundo opaco de verdade (não mais rgba translúcido) e cantos de 6px
// (não mais pill) — "algo mais sólido", decisão explícita do chefe.
export const BOTAO: React.CSSProperties = {
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 6,
  color: 'var(--ink)',
  font: 'inherit',
  fontWeight: 600,
  fontSize: 12,
  padding: '8px 12px',
  cursor: 'pointer',
}

// O botão de ação principal usa a cor do agente dono do painel — é o
// que faz o painel se ler como continuação do crachá que foi clicado.
// Fundo bem mais opaco que antes (15% → mistura sólida com o deck),
// mesma razão do BOTAO acima.
//
// `border` inteiro de novo (não só `borderColor` por cima do `border`
// de BOTAO): misturar a forma curta com a longa pro mesmo valor é
// exatamente o que o React avisa pra não fazer (falso positivo de
// "removendo borderColor" a cada re-render, porque as duas properties
// batem pela ordem de declaração do objeto, não pela intenção).
export function botaoPrincipal(cor: string): React.CSSProperties {
  return { ...BOTAO, background: `${cor}30`, border: `1px solid ${cor}90` }
}

export const CARTAO: React.CSSProperties = {
  background: 'var(--deck-2)',
  border: '1px solid var(--deck-line)',
  borderRadius: 'var(--radius-deck)',
  padding: 12,
}

export const AVISO_ERRO: React.CSSProperties = {
  background: '#f0b7ab',
  color: '#3b1512',
  borderRadius: 4,
  padding: '9px 11px',
  fontSize: 11.5,
  lineHeight: 1.5,
}

export const AVISO_OK: React.CSSProperties = {
  background: 'rgba(74,222,128,0.15)',
  border: '1px solid rgba(74,222,128,0.4)',
  color: '#bbf7d0',
  borderRadius: 4,
  padding: '9px 11px',
  fontSize: 11.5,
  lineHeight: 1.5,
}

export const CORPO: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

// Texto de prosa (descrição, corpo de mensagem) usa a fonte de CORPO
// (Manrope, placeholder de Supreme — ver index.css), não a de display:
// parágrafo inteiro em fonte de exibição cansa a leitura. Uso pontual,
// spread só onde o texto é mais que um rótulo/valor curto.
export const TEXTO_PROSA: React.CSSProperties = {
  fontFamily: 'var(--fonte-corpo)',
  fontWeight: 500,
}
