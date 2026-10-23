// Placeholder de carregamento pros painéis de agente — usado tanto pelo
// Suspense (chunk do painel ainda baixando, ver PainelDoAgente.tsx)
// quanto pelo isLoading de cada painel (dado ainda não chegou). Blocos
// no tom do "deck" com o mesmo sheen que já passa nas barras
// (Barras.tsx) — silhueta do conteúdo, não um spinner genérico.

function Bloco({ altura, flex }: { altura: number; flex?: number }) {
  return (
    <div
      style={{
        flex,
        height: altura,
        borderRadius: 'var(--radius-deck)',
        background: 'var(--deck-2)',
        border: '1px solid var(--deck-line)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.06) 46%, transparent 62%)',
          backgroundSize: '200% 100%',
          animation: 'consoleSheen 1.6s ease-in-out infinite',
        }}
      />
    </div>
  )
}

export function EsqueletoPainel() {
  return (
    <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Bloco altura={52} />
      <div style={{ display: 'flex', gap: 12 }}>
        <Bloco altura={88} flex={1} />
        <Bloco altura={88} flex={1} />
      </div>
      <Bloco altura={130} />
      <Bloco altura={70} />
    </div>
  )
}
