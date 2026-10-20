import { useMemo, useState } from 'react'
import { CATEGORIAS, categoriaDe, miniatura, PECAS, rotuloDe } from './catalogo'
import { obterMetadadosPeca, type Comodo } from './catalogo-jogo'
import { botaoHud } from './hud-estilos'

// ---------------------------------------------------------------------------
// CATÁLOGO DO MODO CONSTRUIR
//
// As 140 peças do pack, com nome em português (catalogo.ts), filtro por cômodo e por categoria, busca, e o que a
// peça FAZ no jogo: quanto soma no ambiente (o mesmo cálculo do motor) e
// que interação ela oferece. Antes cada card trazia preço numa moeda que o
// projeto não tem e atributos ("+9 Foco") que o motor nunca aplicava.
// ---------------------------------------------------------------------------

interface Props {
  aberto: boolean
  aoAlternar: () => void
  aoAdicionar: (peca: string) => void
}

const COMODOS: { id: 'todos' | Comodo; nome: string }[] = [
  { id: 'todos', nome: 'Tudo' },
  { id: 'escritorio', nome: 'Trabalho' },
  { id: 'copa', nome: 'Copa' },
  { id: 'lounge', nome: 'Descanso' },
  { id: 'recepcao', nome: 'Decoração' },
]

export function CatalogoConstrucao({ aberto, aoAlternar, aoAdicionar }: Props) {
  const [comodoAtivo, setComodoAtivo] = useState<'todos' | Comodo>('todos')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('todas')
  const [busca, setBusca] = useState('')

  const pecasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return PECAS.filter((peca) => {
      const meta = obterMetadadosPeca(peca)
      if (comodoAtivo !== 'todos' && !meta.comodos.includes(comodoAtivo)) {
        return false
      }
      if (categoriaAtiva !== 'todas' && categoriaDe(peca) !== categoriaAtiva) {
        return false
      }
      if (termo) {
        const bateNome =
          meta.nomePt.toLowerCase().includes(termo) ||
          rotuloDe(peca).includes(termo) ||
          peca.toLowerCase().includes(termo)
        if (!bateNome) return false
      }
      return true
    })
  }, [comodoAtivo, categoriaAtiva, busca])

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 12,
        transform: 'translateX(-50%)',
        zIndex: 68,
        width: 'min(1040px, 95vw)',
        borderRadius: 'var(--radius-deck)',
        // superfície de trabalho = deck opaco (vidro é só pro HUD)
        background: 'var(--deck)',
        border: '1px solid var(--deck-line)',
        boxShadow: '0 22px 48px -12px rgba(0, 0, 0, 0.8)',
        color: 'var(--ink)',
        fontFamily: 'var(--fonte-corpo)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          padding: '9px 12px',
          borderBottom: aberto ? '1px solid var(--deck-line)' : 'none',
        }}
      >
        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontFamily: 'var(--fonte-display)', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Catálogo
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-dim)' }}>{pecasFiltradas.length} peças · clique pra colocar no meio da sala</div>
        </div>

        <div role="group" aria-label="cômodo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {COMODOS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hud-botao"
              aria-pressed={comodoAtivo === c.id}
              onClick={() => {
                setComodoAtivo(c.id)
                if (!aberto) aoAlternar()
              }}
              style={botaoHud({ ativo: comodoAtivo === c.id })}
            >
              {c.nome}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            if (!aberto) aoAlternar()
          }}
          placeholder="Buscar (sofá, café, mesa…)"
          aria-label="buscar peça"
          style={{
            width: 200,
            height: 30,
            padding: '0 10px',
            borderRadius: 9,
            border: '1px solid var(--deck-line)',
            background: 'rgba(0,0,0,0.3)',
            color: 'var(--ink)',
            fontFamily: 'var(--fonte-corpo)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button type="button" className="hud-botao" onClick={aoAlternar} style={botaoHud()}>
          {aberto ? 'Recolher ▾' : 'Abrir ▴'}
        </button>
      </div>

      {aberto && (
        <div style={{ padding: '6px 12px 12px' }}>
          <div style={{ display: 'flex', gap: 2, overflowX: 'auto', marginBottom: 8, borderBottom: '1px solid var(--deck-line)' }}>
            {[{ id: 'todas', nome: `Todas (${PECAS.length})` }, ...CATEGORIAS].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="console-aba"
                data-ativo={categoriaAtiva === cat.id}
                onClick={() => setCategoriaAtiva(cat.id)}
                style={{
                  padding: '7px 9px 8px',
                  background: 'none',
                  border: 'none',
                  color: categoriaAtiva === cat.id ? 'var(--ink)' : 'var(--ink-dim)',
                  fontFamily: 'var(--fonte-corpo)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {cat.nome}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 6,
              maxHeight: 225,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {pecasFiltradas.map((peca) => {
              const meta = obterMetadadosPeca(peca)
              return (
                <button
                  key={peca}
                  type="button"
                  className="catalogo-celula"
                  onClick={() => aoAdicionar(peca)}
                  title={`Colocar ${meta.nomePt}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 7,
                    borderRadius: 9,
                    border: '1px solid var(--deck-line)',
                    background: 'var(--deck-2)',
                    color: 'var(--ink)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <img src={miniatura(peca)} alt="" loading="lazy" style={{ maxWidth: 34, maxHeight: 34 }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {meta.nomePt}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, marginTop: 3, fontSize: 10, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                      {meta.ambiente > 0 && <span style={{ color: 'var(--good)' }}>+{meta.ambiente} ambiente</span>}
                      {meta.uso && <span>{meta.uso}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
