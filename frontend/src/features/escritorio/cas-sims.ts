import { AGENTES, type AgenteVisual } from './agentes'
import type { HabilidadeSim, TracoPersonalidade } from './simulacao-sims'

// ---------------------------------------------------------------------------
// CRIADOR DE PERSONAGEM — dados
//
// Aparência (pele, olhos, cabelo, roupa, porte, acessórios, jeito de
// andar) e traços de cada personagem, salvos no localStorage do
// navegador. Os 4 agentes têm um registro padrão; personagens novos
// criados pelo chefe são `customizado: true`.
//
// Personagem novo é só VISUAL/JOGO: não existe no backend, não tem painel
// nem participa de rodada de tick. Os 4 agentes, sim — e por isso o NOME
// deles não é editável aqui (é por ele que o backend é ligado à cena).
// ---------------------------------------------------------------------------

export type EstiloCabeloCAS =
  | 'topete_cifra'
  | 'coque_agenda'
  | 'afro_vita'
  | 'geek_norte'
  | 'executivo'
  | 'coque'
  | 'rabo_cavalo'
  | 'moderno'
  | 'longo_ondulado'
  | 'afro_puff'
  | 'curto_cacheado'

export type EstiloRoupaCAS =
  | 'trenchcoat_cifra'
  | 'cardigan_agenda'
  | 'regata_vita'
  | 'moletom_norte'
  | 'blazer_executivo'
  | 'moletom_tech'
  | 'jaqueta_esportiva'
  | 'camisa_social'

export type EstiloCaminhadaCAS =
  | 'padrao'
  | 'energizado'
  | 'confiante'
  | 'sereno'

export type PorteFisicoCAS =
  | 'esguio'
  | 'padrao'
  | 'atletico'

export type AcessorioOculosCAS =
  | 'nenhum'
  | 'gatinho_agenda'
  | 'geek_norte'
  | 'redondo'
  | 'retangular'

export type DetalheFacialCAS =
  | 'nenhum'
  | 'cifra_barba_cicatriz'
  | 'agenda_pinta_madura'
  | 'vita_sardas_diastema'
  | 'norte_olheiras'

export type PropMaoCAS =
  | 'nenhum'
  | 'caderneta_cifra'
  | 'agenda_postits'
  | 'garrafa_vita'
  | 'cafe'
  | 'livro'
  | 'tablet'

export interface AparenciaSimCAS {
  tomPele: number
  corOlhos: number
  corOlhoDireito?: number
  corOlhoEsquerdo?: number
  corCabelo: number
  estiloCabelo: EstiloCabeloCAS
  porteFisico: PorteFisicoCAS
  estiloRoupa: EstiloRoupaCAS
  corRoupaPrincipal: number
  corRoupaSecundaria: number
  corCalca: number
  corSapato: number
  oculos: AcessorioOculosCAS
  detalheFacial?: DetalheFacialCAS
  propMao?: PropMaoCAS
  headset: boolean
  estiloCaminhada: EstiloCaminhadaCAS
}

export interface RegistroSimCAS {
  id: string
  nome: string
  funcao: string
  especialidade: string
  corIdentidade: number
  customizado: boolean // true se foi criado pelo usuário no CAS
  aparencia: AparenciaSimCAS
  tracosIds: string[]
  habilidadesIniciais?: HabilidadeSim[]
}

const CHAVE_STORAGE_CAS = 'escritorio:cas:registros-v2'
const CHAVE_STORAGE_ANTIGA = 'escritorio:cas:registros-v1'

export const TONS_DE_PELE_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Porcelana', cor: 0xfbe5d6, hex: '#fbe5d6' },
  { nome: 'Pêssego Claro', cor: 0xf5cba7, hex: '#f5cba7' },
  { nome: 'Amêndoa Quente', cor: 0xf1c29b, hex: '#f1c29b' },
  { nome: 'Dourado Solar', cor: 0xe5a97c, hex: '#e5a97c' },
  { nome: 'Canela', cor: 0xc68642, hex: '#c68642' },
  { nome: 'Cacau', cor: 0x8d5524, hex: '#8d5524' },
  { nome: 'Ébano Profundo', cor: 0x523018, hex: '#523018' },
]

export const CORES_CABELO_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Ruivo Acobreado (Cifra)', cor: 0x9a3412, hex: '#9a3412' },
  { nome: 'Platinado Prata (Agenda)', cor: 0xcbd5e1, hex: '#cbd5e1' },
  { nome: 'Verde Esmeralda (Vita)', cor: 0x047857, hex: '#047857' },
  { nome: 'Preto Ébano (Norte)', cor: 0x18181b, hex: '#18181b' },
  { nome: 'Castanho Escuro', cor: 0x271c15, hex: '#271c15' },
  { nome: 'Castanho Avelã', cor: 0x5c3317, hex: '#5c3317' },
  { nome: 'Loiro Dourado', cor: 0xd4a017, hex: '#d4a017' },
  { nome: 'Azul Cyber', cor: 0x0284c7, hex: '#0284c7' },
  { nome: 'Roxo Criativo', cor: 0x7c3aed, hex: '#7c3aed' },
]

export const CORES_OLHOS_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Castanho Escuro', cor: 0x3b2219, hex: '#3b2219' },
  { nome: 'Mel / Âmbar', cor: 0x854d0e, hex: '#854d0e' },
  { nome: 'Verde Esmeralda', cor: 0x15803d, hex: '#15803d' },
  { nome: 'Azul Oceano', cor: 0x0369a1, hex: '#0369a1' },
  { nome: 'Ciano Cyber (Norte)', cor: 0x06b6d4, hex: '#06b6d4' },
  { nome: 'Cinza Tempestade', cor: 0x475569, hex: '#475569' },
]

export const CORES_ROUPA_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Caramelo Trenchcoat', cor: 0x92400e, hex: '#92400e' },
  { nome: 'Verde Cifra', cor: 0x16a34a, hex: '#16a34a' },
  { nome: 'Cardigã Grafite', cor: 0x475569, hex: '#475569' },
  { nome: 'Azul Agenda', cor: 0x2563eb, hex: '#2563eb' },
  { nome: 'Terracota Vita', cor: 0xc2410c, hex: '#c2410c' },
  { nome: 'Oliva Jogger', cor: 0x3f6212, hex: '#3f6212' },
  { nome: 'Preto Moletom Hacker', cor: 0x18181b, hex: '#18181b' },
  { nome: 'Ciano Norte', cor: 0x0891b2, hex: '#0891b2' },
  { nome: 'Roxo Inovação', cor: 0x7c3aed, hex: '#7c3aed' },
  { nome: 'Rosa Criativo', cor: 0xdb2777, hex: '#db2777' },
  { nome: 'Dourado Executivo', cor: 0xd97706, hex: '#d97706' },
  { nome: 'Branco Gelo', cor: 0xf8fafc, hex: '#f8fafc' },
]

export const ESTILOS_CABELO_INFO: { id: EstiloCabeloCAS; nome: string; icone: string }[] = [
  { id: 'topete_cifra', nome: 'Topete Cifra (Cobre/Prata)', icone: '🦊' },
  { id: 'coque_agenda', nome: 'Coque Agenda (Lápis)', icone: '👵' },
  { id: 'afro_vita', nome: 'Afro Vita (Esmeralda/Limão)', icone: '🌿' },
  { id: 'geek_norte', nome: 'Desfiado Anime (Norte)', icone: '🖤' },
  { id: 'executivo', nome: 'Executivo Clássico', icone: '💼' },
  { id: 'coque', nome: 'Coque Elegante', icone: '👑' },
  { id: 'rabo_cavalo', nome: 'Rabo de Cavalo', icone: '🎀' },
  { id: 'moderno', nome: 'Topete Moderno', icone: '⚡' },
  { id: 'longo_ondulado', nome: 'Longo Ondulado', icone: '🌊' },
  { id: 'afro_puff', nome: 'Afro Puff', icone: '✨' },
  { id: 'curto_cacheado', nome: 'Curto Cacheado', icone: '🌀' },
]

export const ESTILOS_ROUPA_INFO: { id: EstiloRoupaCAS; nome: string; icone: string }[] = [
  { id: 'trenchcoat_cifra', nome: 'Sobretudo & Colete (Cifra)', icone: '🧥' },
  { id: 'cardigan_agenda', nome: 'Cardigã & Gola Boneca (Agenda)', icone: '🧶' },
  { id: 'regata_vita', nome: 'Regata & Jogger (Vita)', icone: '🎽' },
  { id: 'moletom_norte', nome: 'Moletom Oversized (Norte)', icone: '🕶️' },
  { id: 'blazer_executivo', nome: 'Blazer Executivo', icone: '👔' },
  { id: 'moletom_tech', nome: 'Moletom Tech', icone: '💻' },
  { id: 'jaqueta_esportiva', nome: 'Jaqueta Esportiva', icone: '🧥' },
  { id: 'camisa_social', nome: 'Camisa Social Slim', icone: '👕' },
]

export const ACESSORIOS_OCULOS_INFO: { id: AcessorioOculosCAS; nome: string; icone: string }[] = [
  { id: 'nenhum', nome: 'Sem Óculos', icone: '👀' },
  { id: 'gatinho_agenda', nome: 'Gatinho com Corrente (Agenda)', icone: '👓' },
  { id: 'geek_norte', nome: 'Retangular Hacker (Norte)', icone: '🕶️' },
  { id: 'redondo', nome: 'Redondo Intelectual', icone: '🧐' },
  { id: 'retangular', nome: 'Retangular Executivo', icone: '💼' },
]

export const DETALHES_FACIAIS_INFO: { id: DetalheFacialCAS; nome: string; icone: string }[] = [
  { id: 'nenhum', nome: 'Pele Limpa Natural', icone: '✨' },
  { id: 'cifra_barba_cicatriz', nome: 'Barba Cerrada & Cicatriz (Cifra)', icone: '🧔' },
  { id: 'agenda_pinta_madura', nome: 'Pinta Facial Elegante (Agenda)', icone: '💄' },
  { id: 'vita_sardas_diastema', nome: 'Sardas & Diastema (Vita)', icone: '😁' },
  { id: 'norte_olheiras', nome: 'Olheiras Dev / Hacker (Norte)', icone: '😴' },
]

export const PROPS_MAO_INFO: { id: PropMaoCAS; nome: string; icone: string }[] = [
  { id: 'nenhum', nome: 'Mãos Livres', icone: '🖐️' },
  { id: 'caderneta_cifra', nome: 'Caderneta & Caneta (Cifra)', icone: '📒' },
  { id: 'agenda_postits', nome: 'Fichário & Post-its (Agenda)', icone: '📑' },
  { id: 'garrafa_vita', nome: 'Garrafa Térmica (Vita)', icone: '🍶' },
  { id: 'cafe', nome: 'Xícara de Café', icone: '☕' },
  { id: 'livro', nome: 'Livro de Estudos', icone: '📖' },
  { id: 'tablet', nome: 'Tablet Digital', icone: '📱' },
]

export const ESTILOS_CAMINHADA_INFO: { id: EstiloCaminhadaCAS; nome: string; icone: string; descricao: string }[] = [
  { id: 'padrao', nome: 'Natural', icone: '🚶', descricao: 'Passada fluida e equilibrada.' },
  { id: 'energizado', nome: 'Saltitante', icone: '⚡', descricao: 'Passos vivos com balanço dinâmico de braços.' },
  { id: 'confiante', nome: 'Confiante', icone: '😎', descricao: 'Postura ereta, peito aberto e passada firme.' },
  { id: 'sereno', nome: 'Sereno / Zen', icone: '🧘', descricao: 'Movimento calmo, suave e sem pressa.' },
]

export const BIBLIOTECA_TRACOS_CAS: TracoPersonalidade[] = [
  { id: 'analitico', nome: 'Gênio Financeiro', icone: '📊', descricao: 'Ganha Foco analisando planilhas e indicadores.' },
  { id: 'ambicioso', nome: 'Ambicioso', icone: '💎', descricao: 'Adora metas batidas e evolução rápida de carreira.' },
  { id: 'perfeccionista', nome: 'Perfeccionista', icone: '🔍', descricao: 'Revisa cada detalhe com precisão cirúrgica.' },
  { id: 'organizado', nome: 'Mestre do Tempo', icone: '⏰', descricao: 'Coordena agendas e reuniões sem atrasos.' },
  { id: 'extrovertido', nome: 'Comunicativo', icone: '🗣️', descricao: 'Ganha Social mais rápido conversando com colegas.' },
  { id: 'prestativo', nome: 'Prestativo', icone: '🤝', descricao: 'Adora colaborar em projetos da equipe.' },
  { id: 'ativo', nome: 'Energia Vital', icone: '🏃', descricao: 'Mantém a disposição alta e valoriza ergonomia.' },
  { id: 'zen', nome: 'Mente Equilibrada', icone: '🧘', descricao: 'Resiste ao estresse e espalha calma na sala.' },
  { id: 'amigavel', nome: 'Empático', icone: '🧡', descricao: 'Cria amizade e sinergia com facilidade.' },
  { id: 'geek', nome: 'Arquiteto de Sistemas', icone: '💻', descricao: 'Fica Inspirado e Focado programando.' },
  { id: 'visionario', nome: 'Visionário', icone: '🧭', descricao: 'Enxerga oportunidades de produto de longe.' },
  { id: 'cafeinomano', nome: 'Movido a Expresso', icone: '☕', descricao: 'Aproveita o dobro de energia de cada xícara de café.' },
]

export const REGISTROS_PADRAO_POR_SIM: Record<string, RegistroSimCAS> = {
  cifra: {
    id: 'cifra',
    nome: 'Cifra',
    funcao: 'Finanças',
    especialidade: 'financas',
    corIdentidade: 0x22c55e,
    customizado: false,
    aparencia: {
      tomPele: 0xf1c29b,
      corOlhos: 0x15803d,
      corCabelo: 0x9a3412,
      estiloCabelo: 'topete_cifra',
      porteFisico: 'padrao',
      estiloRoupa: 'trenchcoat_cifra',
      corRoupaPrincipal: 0x92400e,
      corRoupaSecundaria: 0x16a34a,
      corCalca: 0x1e293b,
      corSapato: 0x3f2e22,
      oculos: 'nenhum',
      detalheFacial: 'cifra_barba_cicatriz',
      propMao: 'caderneta_cifra',
      headset: false,
      estiloCaminhada: 'confiante',
    },
    tracosIds: ['analitico', 'ambicioso', 'perfeccionista'],
  },
  agenda: {
    id: 'agenda',
    nome: 'Agenda',
    funcao: 'Compromissos',
    especialidade: 'compromissos',
    corIdentidade: 0x3b82f6,
    customizado: false,
    aparencia: {
      tomPele: 0xf5cba7,
      corOlhos: 0x0369a1,
      corCabelo: 0xcbd5e1,
      estiloCabelo: 'coque_agenda',
      porteFisico: 'esguio',
      estiloRoupa: 'cardigan_agenda',
      corRoupaPrincipal: 0x475569,
      corRoupaSecundaria: 0xf8fafc,
      corCalca: 0x0f172a,
      corSapato: 0x0f172a,
      oculos: 'gatinho_agenda',
      detalheFacial: 'agenda_pinta_madura',
      propMao: 'agenda_postits',
      headset: false,
      estiloCaminhada: 'padrao',
    },
    tracosIds: ['organizado', 'extrovertido', 'prestativo'],
  },
  vita: {
    id: 'vita',
    nome: 'Vita',
    funcao: 'Saúde',
    especialidade: 'saude',
    corIdentidade: 0xf97316,
    customizado: false,
    aparencia: {
      tomPele: 0xe5a97c,
      corOlhos: 0x854d0e,
      corCabelo: 0x047857,
      estiloCabelo: 'afro_vita',
      porteFisico: 'atletico',
      estiloRoupa: 'regata_vita',
      corRoupaPrincipal: 0xc2410c,
      corRoupaSecundaria: 0xffedd5,
      corCalca: 0x3f6212,
      corSapato: 0x78350f,
      oculos: 'nenhum',
      detalheFacial: 'vita_sardas_diastema',
      propMao: 'garrafa_vita',
      headset: false,
      estiloCaminhada: 'energizado',
    },
    tracosIds: ['ativo', 'zen', 'amigavel'],
  },
  norte: {
    id: 'norte',
    nome: 'Norte',
    funcao: 'Projetos',
    especialidade: 'projetos',
    corIdentidade: 0x06b6d4,
    customizado: false,
    aparencia: {
      tomPele: 0xfbe5d6,
      corOlhos: 0x0891b2,
      corOlhoDireito: 0x3b2219,
      corOlhoEsquerdo: 0x06b6d4,
      corCabelo: 0x18181b,
      estiloCabelo: 'geek_norte',
      porteFisico: 'padrao',
      estiloRoupa: 'moletom_norte',
      corRoupaPrincipal: 0x18181b,
      corRoupaSecundaria: 0x0891b2,
      corCalca: 0x0f172a,
      corSapato: 0x0284c7,
      oculos: 'geek_norte',
      detalheFacial: 'norte_olheiras',
      propMao: 'nenhum',
      headset: true,
      estiloCaminhada: 'sereno',
    },
    tracosIds: ['geek', 'visionario', 'cafeinomano'],
  },
}

export function carregarRegistrosCAS(): Record<string, RegistroSimCAS> {
  const base: Record<string, RegistroSimCAS> = JSON.parse(
    JSON.stringify(REGISTROS_PADRAO_POR_SIM),
  )
  try {
    const salvoV2 = localStorage.getItem(CHAVE_STORAGE_CAS)
    if (salvoV2) {
      const parseado = JSON.parse(salvoV2) as Record<string, RegistroSimCAS>
      for (const [id, reg] of Object.entries(parseado)) {
        if (reg && reg.id && reg.aparencia) {
          base[id] = reg
        }
      }
      return base
    }

    // Migração de v1 para novos padrões
    const salvoV1 = localStorage.getItem(CHAVE_STORAGE_ANTIGA)
    if (salvoV1) {
      const parseado = JSON.parse(salvoV1) as Record<string, RegistroSimCAS>
      for (const [id, reg] of Object.entries(parseado)) {
        if (reg && reg.id && reg.aparencia) {
          if (reg.customizado) {
            base[id] = reg
          }
        }
      }
    }
  } catch {
    // Ignora falhas de leitura do localStorage
  }
  return base
}

export function salvarRegistroCAS(registro: RegistroSimCAS): Record<string, RegistroSimCAS> {
  const todos = carregarRegistrosCAS()
  todos[registro.id] = registro
  try {
    localStorage.setItem(CHAVE_STORAGE_CAS, JSON.stringify(todos))
  } catch {
    // Ignora quota
  }
  return todos
}

export function removerSimCustomizadoCAS(simId: string): Record<string, RegistroSimCAS> {
  const todos = carregarRegistrosCAS()
  if (todos[simId]?.customizado) {
    delete todos[simId]
    try {
      localStorage.setItem(CHAVE_STORAGE_CAS, JSON.stringify(todos))
    } catch {
      // Ignora
    }
  }
  return todos
}

export function obterAparenciaSim(simId: string, corPadrao = 0x3b82f6): AparenciaSimCAS {
  const todos = carregarRegistrosCAS()
  if (todos[simId]) return todos[simId].aparencia
  return {
    tomPele: 0xf1c29b,
    corOlhos: 0x3b2219,
    corCabelo: 0x271c15,
    estiloCabelo: 'executivo',
    porteFisico: 'padrao',
    estiloRoupa: 'blazer_executivo',
    corRoupaPrincipal: corPadrao,
    corRoupaSecundaria: 0xf8fafc,
    corCalca: 0x1e293b,
    corSapato: 0x0f172a,
    oculos: 'nenhum',
    detalheFacial: 'nenhum',
    propMao: 'nenhum',
    headset: false,
    estiloCaminhada: 'padrao',
  }
}

export function resolverTracosSim(tracosIds: string[]): TracoPersonalidade[] {
  return tracosIds
    .map((id) => BIBLIOTECA_TRACOS_CAS.find((t) => t.id === id))
    .filter((t): t is TracoPersonalidade => Boolean(t))
}

export function obterListaAgentesVisuaisCompleta(): AgenteVisual[] {
  const todos = carregarRegistrosCAS()
  const lista: AgenteVisual[] = [...AGENTES]
  for (const reg of Object.values(todos)) {
    if (reg.customizado && !lista.some((a) => a.id === reg.id)) {
      lista.push({
        id: reg.id,
        nome: reg.nome,
        cor: reg.corIdentidade,
        arquivo: 'norte2dSemfundo.png',
        especialidade: reg.especialidade,
        funcao: reg.funcao,
      })
    }
  }
  return lista
}
