import { useMemo, useState } from 'react'
import {
  CATEGORIAS,
  categoriaDe,
  miniatura,
  PECAS,
  rotuloDe,
} from './catalogo'

// ---------------------------------------------------------------------------
// CATÁLOGO DE MOBÍLIAS "MODO CONSTRUIR / COMPRAR" ESTILO THE SIMS 4
//
// Inspirado no dock inferior de Build/Buy Mode de The Sims 4, enriquecendo
// todas as 140 peças do catálogo com:
//   - Filtros por Cômodo (Escritório, Copa & Café, Lounge, Recepção, Todos) e
//     por Categoria Funcional
//   - Preço em Simoleons (§)
//   - Atributos de Gameplay (+Foco, +Energia, +Ambiente, +Cafeína, +Diversão)
//   - Tradução amigável para português e busca instantânea
// ---------------------------------------------------------------------------

interface Props {
  aberto: boolean
  aoAlternar: () => void
  aoAdicionar: (peca: string) => void
}

interface MetadadosPecaSims {
  nomePt: string
  precoSimoleons: number
  atributos: { icone: string; texto: string; cor: string }[]
  comodos: ('escritorio' | 'copa' | 'lounge' | 'recepcao')[]
}

const COMODOS_SIMS: { id: 'todos' | 'escritorio' | 'copa' | 'lounge' | 'recepcao'; nome: string; icone: string }[] = [
  { id: 'todos', nome: 'Todo o Catálogo', icone: '📦' },
  { id: 'escritorio', nome: 'Estações & Estudo', icone: '💻' },
  { id: 'copa', nome: 'Copa & Expresso', icone: '☕' },
  { id: 'lounge', nome: 'Lounge & Conforto', icone: '🛋️' },
  { id: 'recepcao', nome: 'Decoração & Portais', icone: '🌿' },
]

const ICONES_CATEGORIA: Record<string, string> = {
  trabalho: '💻',
  assentos: '🪑',
  mesas: '🍽️',
  guardar: '📚',
  luz: '💡',
  verde: '🌿',
  chao: '🧶',
  parede: '🚪',
  eletro: '📺',
  cozinha: '☕',
  banho: '🚿',
  quarto: '🛏️',
  outros: '✨',
}

const DICIONARIO_TERMOS_PT: Record<string, string> = {
  desk: 'Mesa Executiva',
  corner: 'de Canto',
  chair: 'Cadeira',
  modern: 'Moderna',
  cushion: 'Estofada',
  rounded: 'Arredondada',
  computer: 'Computador',
  screen: 'Monitor Widescreen',
  keyboard: 'Teclado Mecânico',
  mouse: 'Mouse Sem Fio',
  laptop: 'Notebook Pro',
  bookcase: 'Estante de Livros',
  open: 'Aberta',
  closed: 'Fechada',
  wide: 'Ampla',
  doors: 'com Portas',
  low: 'Baixa',
  books: 'Pilha de Livros',
  lounge: 'Sofá / Poltrona Lounge',
  sofa: 'Sofá',
  design: 'Design',
  relax: 'Reclinável',
  long: '3 Lugares',
  ottoman: 'Pufe',
  bench: 'Banco',
  table: 'Mesa',
  coffee: 'de Centro / Café',
  glass: 'de Vidro',
  round: 'Redonda',
  square: 'Quadrada',
  cross: 'Base Cruzada',
  cloth: 'com Toalha',
  side: 'Lateral',
  drawers: 'com Gavetas',
  kitchen: 'Copa',
  coffeeMachine: 'Cafeteira Expresso',
  fridge: 'Geladeira',
  large: 'Duplex',
  small: 'Compacta',
  microwave: 'Micro-ondas',
  sink: 'Cuba / Pia',
  stove: 'Cooktop / Fogão',
  blender: 'Liquidificador',
  cabinet: 'Armário',
  upper: 'Aéreo',
  bar: 'Balcão Americano',
  plant: 'Planta Natural',
  potted: 'Vaso de Planta',
  lamp: 'Luminária',
  floor: 'de Piso',
  ceiling: 'de Teto',
  wall: 'Parede / Arandela',
  fan: 'Ventilador',
  rug: 'Tapete',
  doormat: 'Capacho',
  rectangle: 'Retangular',
  television: 'Smart TV',
  vintage: 'Retrô',
  speaker: 'Caixa Acústica Hi-Fi',
  radio: 'Rádio Vintage',
  doorway: 'Porta / Portal',
  front: 'Principal',
  window: 'Janela Panorâmica',
  slide: 'Corrediça',
  stairs: 'Escada',
  coatRack: 'Cabideiro',
  standing: 'de Chão',
  trashcan: 'Lixeira Inox',
  bed: 'Cama',
  double: 'Casal',
  single: 'Solteiro',
  bunk: 'Beliche',
  bathroom: 'Banheiro',
  mirror: 'Espelho',
  bathtub: 'Banheira',
  shower: 'Box Chuveiro',
  toilet: 'Vaso Sanitário',
}

export function obterMetadadosPecaSims(peca: string): MetadadosPecaSims {
  const cat = categoriaDe(peca)
  const bruto = rotuloDe(peca)
  const palavras = bruto.split(' ')
  const traduzidas = palavras.map((p) => DICIONARIO_TERMOS_PT[p] ?? p)
  const nomePt = traduzidas
    .join(' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())

  if (peca.includes('CoffeeMachine')) {
    return {
      nomePt: 'Cafeteira Expresso Duplo Pro',
      precoSimoleons: 680,
      atributos: [
        { icone: '☕', texto: '+10 Cafeína', cor: '#84cc16' },
        { icone: '⚡', texto: '+7 Energia', cor: '#22c55e' },
      ],
      comodos: ['copa', 'escritorio'],
    }
  }

  switch (cat) {
    case 'trabalho':
      return {
        nomePt,
        precoSimoleons: peca.startsWith('desk') ? 750 : peca.startsWith('chairDesk') ? 490 : 890,
        atributos: [
          { icone: '🎯', texto: '+9 Foco', cor: '#8b5cf6' },
          { icone: '💼', texto: '+Carreira IA', cor: '#38bdf8' },
        ],
        comodos: ['escritorio'],
      }
    case 'assentos':
      return {
        nomePt,
        precoSimoleons: peca.includes('Sofa') ? 920 : 420,
        atributos: [
          { icone: '⚡', texto: '+8 Conforto', cor: '#22c55e' },
          { icone: '💬', texto: '+Multi-Assento', cor: '#38bdf8' },
        ],
        comodos: ['lounge', 'recepcao'],
      }
    case 'verde':
      return {
        nomePt,
        precoSimoleons: 260,
        atributos: [
          { icone: '🌿', texto: '+10 Ambiente', cor: '#4ade80' },
          { icone: '✨', texto: '+6 Inspiração', cor: '#06b6d4' },
        ],
        comodos: ['recepcao', 'escritorio', 'lounge'],
      }
    case 'luz':
      return {
        nomePt,
        precoSimoleons: 310,
        atributos: [
          { icone: '💡', texto: '+7 Ambiente', cor: '#facc15' },
          { icone: '🎯', texto: '+4 Foco', cor: '#8b5cf6' },
        ],
        comodos: ['escritorio', 'lounge', 'recepcao'],
      }
    case 'guardar':
      return {
        nomePt,
        precoSimoleons: 540,
        atributos: [
          { icone: '📚', texto: '+9 Habilidades', cor: '#8b5cf6' },
          { icone: '🌿', texto: '+4 Ambiente', cor: '#4ade80' },
        ],
        comodos: ['escritorio', 'lounge'],
      }
    case 'cozinha':
      return {
        nomePt,
        precoSimoleons: peca.includes('Fridge') ? 1150 : 520,
        atributos: [
          { icone: '🥗', texto: '+9 Lanche/Café', cor: '#84cc16' },
          { icone: '💬', texto: '+5 Social', cor: '#38bdf8' },
        ],
        comodos: ['copa'],
      }
    case 'eletro':
      return {
        nomePt,
        precoSimoleons: 980,
        atributos: [
          { icone: '✨', texto: '+10 Diversão', cor: '#f472b6' },
          { icone: '💬', texto: '+6 Social', cor: '#38bdf8' },
        ],
        comodos: ['lounge', 'recepcao'],
      }
    case 'parede':
      return {
        nomePt,
        precoSimoleons: 380,
        atributos: [
          { icone: '🚪', texto: 'Portal / Arquitetura', cor: '#4ade80' },
        ],
        comodos: ['recepcao', 'escritorio'],
      }
    case 'mesas':
      return {
        nomePt,
        precoSimoleons: 480,
        atributos: [
          { icone: '🤝', texto: '+Reuniões', cor: '#38bdf8' },
          { icone: '🌿', texto: '+3 Ambiente', cor: '#4ade80' },
        ],
        comodos: ['escritorio', 'lounge', 'copa'],
      }
    case 'chao':
      return {
        nomePt,
        precoSimoleons: 290,
        atributos: [
          { icone: '🌿', texto: '+6 Ambiente', cor: '#4ade80' },
        ],
        comodos: ['recepcao', 'lounge', 'escritorio'],
      }
    default:
      return {
        nomePt,
        precoSimoleons: 350,
        atributos: [
          { icone: '✨', texto: '+5 Ambiente', cor: '#94a3b8' },
        ],
        comodos: ['lounge', 'recepcao'],
      }
  }
}

export function CatalogoTheSims({ aberto, aoAlternar, aoAdicionar }: Props) {
  const [comodoAtivo, setComodoAtivo] = useState<'todos' | 'escritorio' | 'copa' | 'lounge' | 'recepcao'>('todos')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('todas')
  const [busca, setBusca] = useState('')

  const pecasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return PECAS.filter((peca) => {
      const meta = obterMetadadosPecaSims(peca)
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
        borderRadius: 18,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px) saturate(160%)',
        border: '1.5px solid rgba(250, 204, 21, 0.45)',
        boxShadow: '0 22px 48px -12px rgba(0, 0, 0, 0.8)',
        color: '#f8fafc',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Barra superior do Catálogo Build/Buy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '9px 14px',
          background: 'linear-gradient(90deg, rgba(250, 204, 21, 0.14), rgba(15, 23, 42, 0.9))',
          borderBottom: aberto ? '1px solid rgba(255,255,255,0.12)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🛋️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fef08a' }}>
              Catálogo Construir & Comprar (The Sims 4)
            </div>
            <div style={{ fontSize: 10.5, color: '#cbd5e1' }}>
              {pecasFiltradas.length} mobílias 3D disponíveis · Clique para posicionar no lote
            </div>
          </div>
        </div>

        {/* Seletor rápido por Cômodo */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {COMODOS_SIMS.map((c) => {
            const ativo = comodoAtivo === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setComodoAtivo(c.id)
                  if (!aberto) aoAlternar()
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: ativo ? '1px solid #facc15' : '1px solid rgba(255,255,255,0.14)',
                  background: ativo ? 'rgba(250, 204, 21, 0.22)' : 'rgba(255,255,255,0.05)',
                  color: ativo ? '#fef08a' : '#e2e8f0',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {c.icone} {c.nome}
              </button>
            )
          })}
        </div>

        {/* Busca + Botão recolher/expandir */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              if (!aberto) aoAlternar()
            }}
            placeholder="🔍 Buscar móvel (ex: sofá, café, mesa)..."
            style={{
              width: 220,
              padding: '5px 10px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.35)',
              color: '#f8fafc',
              fontSize: 11.5,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={aoAlternar}
            style={{
              padding: '5px 11px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.08)',
              color: '#f8fafc',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {aberto ? '▾ Recolher' : '▴ Abrir Catálogo'}
          </button>
        </div>
      </div>

      {aberto && (
        <div style={{ padding: '10px 14px 12px' }}>
          {/* Abas de Categorias Funcionais */}
          <div
            style={{
              display: 'flex',
              gap: 5,
              overflowX: 'auto',
              paddingBottom: 8,
              marginBottom: 8,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setCategoriaAtiva('todas')}
              style={estiloAbaCat(categoriaAtiva === 'todas')}
            >
              ✨ Todas ({PECAS.length})
            </button>
            {CATEGORIAS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaAtiva(cat.id)}
                style={estiloAbaCat(categoriaAtiva === cat.id)}
              >
                {ICONES_CATEGORIA[cat.id] ?? '📦'} {cat.nome}
              </button>
            ))}
          </div>

          {/* Grade de Cartões de Mobília estilo The Sims 4 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))',
              gap: 8,
              maxHeight: 225,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {pecasFiltradas.map((peca) => {
              const meta = obterMetadadosPecaSims(peca)
              return (
                <button
                  key={peca}
                  type="button"
                  onClick={() => aoAdicionar(peca)}
                  title={`Comprar e posicionar ${meta.nomePt} (§ ${meta.precoSimoleons})`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(30, 41, 59, 0.72)',
                    color: '#f8fafc',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.14s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={miniatura(peca)}
                        alt={meta.nomePt}
                        loading="lazy"
                        style={{
                          maxWidth: 36,
                          maxHeight: 36,
                          imageRendering: 'auto',
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          color: '#f8fafc',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {meta.nomePt}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#facc15', marginTop: 2 }}>
                        § {meta.precoSimoleons}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {meta.atributos.map((atr, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: `${atr.cor}22`,
                          border: `1px solid ${atr.cor}66`,
                          color: atr.cor,
                        }}
                      >
                        {atr.icone} {atr.texto}
                      </span>
                    ))}
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

function estiloAbaCat(ativa: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 8,
    border: ativa ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
    background: ativa ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
    color: ativa ? '#7dd3fc' : '#cbd5e1',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }
}
