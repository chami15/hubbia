import { categoriaDe, nomeCompletoDoMovel } from './catalogo'
import { extrairReceitaMovel3D, type FamiliaMovel3D } from './moveis3d'
import { pontosDeAmbienteDaPeca } from './simulacao-sims'

// O que cada peça do catálogo FAZ no modo simulação e sua família de
// modelagem 3D — separado do componente (CatalogoConstrucao.tsx) pra ser
// testável e pra exportar função de um .tsx não quebrar o fast refresh.

export type Comodo = 'escritorio' | 'copa' | 'lounge' | 'recepcao'

export interface MetadadosPeca {
  nomePt: string
  // o que dá pra fazer com a peça no modo simulação (simulacao-sims.ts)
  uso: string | null
  ambiente: number
  comodos: Comodo[]
  familia3d: FamiliaMovel3D
}

const COMODOS_DA_CATEGORIA: Record<string, Comodo[]> = {
  trabalho: ['escritorio'],
  assentos: ['lounge', 'recepcao'],
  verde: ['recepcao', 'escritorio', 'lounge'],
  luz: ['escritorio', 'lounge', 'recepcao'],
  guardar: ['escritorio', 'lounge'],
  cozinha: ['copa'],
  banho: ['copa', 'lounge'],
  quarto: ['lounge'],
  eletro: ['lounge', 'recepcao'],
  parede: ['recepcao', 'escritorio'],
  mesas: ['escritorio', 'lounge', 'copa'],
  chao: ['recepcao', 'lounge', 'escritorio'],
}

// Espelha as regras de obterInteracoesDoMovel — se uma interação nova
// entrar lá, o rótulo entra aqui.
function usoDaPeca(peca: string, cat: string): string | null {
  if (peca.includes('Coffee')) return 'café'
  if (peca.includes('Blender')) return 'vitamina'
  if (/Fridge|Microwave|toaster|Stove|Bar/.test(peca)) return 'lanche'
  if (peca === 'kitchenSink') return 'limpar'
  if (peca === 'bathroomMirror') return 'ensaiar discurso'
  if (cat === 'banho') return 'refrescar'
  if (/^(chairDesk|desk|computer|laptop)/.test(peca)) return 'trabalhar'
  if (peca.startsWith('doorway')) return 'sair / entrar'
  if (cat === 'assentos' || cat === 'quarto') return 'descansar'
  if (cat === 'guardar' || peca.startsWith('book')) return 'ler'
  if (cat === 'verde') return 'respirar, regar'
  if (cat === 'eletro') return 'música'
  if (cat === 'mesas') return 'reunião'
  return null
}

export function obterMetadadosPeca(peca: string): MetadadosPeca {
  const cat = categoriaDe(peca)
  const receita = extrairReceitaMovel3D(peca)
  return {
    nomePt: nomeCompletoDoMovel(peca),
    uso: usoDaPeca(peca, cat),
    ambiente: pontosDeAmbienteDaPeca(peca),
    comodos: COMODOS_DA_CATEGORIA[cat] ?? ['lounge', 'recepcao'],
    familia3d: receita.familia,
  }
}
