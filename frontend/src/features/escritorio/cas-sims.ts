import { AGENTES, type AgenteVisual } from './agentes'
import type { HabilidadeSim, TracoPersonalidade } from './simulacao-sims'

// ---------------------------------------------------------------------------
// CREATE-A-SIM (CAS) — ESTÚDIO DE CRIAÇÃO E PERSONALIZAÇÃO DE SIMS / AGENTES
//
// Extraído da engenharia reversa de `Data\Simulation\Gameplay\simulation.zip`:
//   - `cas/cas.pyc` e `sims/sim_info.pyc` (partes corporais, genética, roupas)
//   - `traits/traits.pyc` (traços de personalidade que afetam autonomia e humor)
//   - `routing/walkstyle/walkstyle_behavior.pyc` (estilos de caminhada)
// ---------------------------------------------------------------------------

export type EstiloCabeloCAS =
  | 'executivo'
  | 'coque'
  | 'rabo_cavalo'
  | 'moderno'
  | 'longo_ondulado'
  | 'afro_puff'
  | 'curto_cacheado'

export type EstiloRoupaCAS =
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

export interface AparenciaSimCAS {
  tomPele: number
  corOlhos: number
  corCabelo: number
  estiloCabelo: EstiloCabeloCAS
  porteFisico: PorteFisicoCAS
  estiloRoupa: EstiloRoupaCAS
  corRoupaPrincipal: number
  corRoupaSecundaria: number
  corCalca: number
  corSapato: number
  oculos: 'nenhum' | 'redondo' | 'retangular'
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

const CHAVE_STORAGE_CAS = 'escritorio:cas:registros-v1'

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
  { nome: 'Preto Ébano', cor: 0x18181b, hex: '#18181b' },
  { nome: 'Castanho Escuro', cor: 0x271c15, hex: '#271c15' },
  { nome: 'Castanho Avelã', cor: 0x5c3317, hex: '#5c3317' },
  { nome: 'Ruivo Acobreado', cor: 0x9a3412, hex: '#9a3412' },
  { nome: 'Loiro Dourado', cor: 0xd4a017, hex: '#d4a017' },
  { nome: 'Platinado Prata', cor: 0xcbd5e1, hex: '#cbd5e1' },
  { nome: 'Azul Cyber', cor: 0x0284c7, hex: '#0284c7' },
  { nome: 'Roxo Criativo', cor: 0x7c3aed, hex: '#7c3aed' },
]

export const CORES_OLHOS_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Castanho Escuro', cor: 0x3b2219, hex: '#3b2219' },
  { nome: 'Mel / Âmbar', cor: 0x854d0e, hex: '#854d0e' },
  { nome: 'Verde Esmeralda', cor: 0x15803d, hex: '#15803d' },
  { nome: 'Azul Oceano', cor: 0x0369a1, hex: '#0369a1' },
  { nome: 'Cinza Tempestade', cor: 0x475569, hex: '#475569' },
]

export const CORES_ROUPA_CAS: { nome: string; cor: number; hex: string }[] = [
  { nome: 'Verde Cifra', cor: 0x16a34a, hex: '#16a34a' },
  { nome: 'Azul Agenda', cor: 0x2563eb, hex: '#2563eb' },
  { nome: 'Coral Vita', cor: 0xf97316, hex: '#f97316' },
  { nome: 'Ciano Norte', cor: 0x0891b2, hex: '#0891b2' },
  { nome: 'Roxo Inovação', cor: 0x7c3aed, hex: '#7c3aed' },
  { nome: 'Rosa Criativo', cor: 0xdb2777, hex: '#db2777' },
  { nome: 'Dourado Executivo', cor: 0xd97706, hex: '#d97706' },
  { nome: 'Grafite Minimalista', cor: 0x334155, hex: '#334155' },
  { nome: 'Branco Gelo', cor: 0xf8fafc, hex: '#f8fafc' },
  { nome: 'Preto Ônix', cor: 0x0f172a, hex: '#0f172a' },
]

export const ESTILOS_CABELO_INFO: { id: EstiloCabeloCAS; nome: string; icone: string }[] = [
  { id: 'executivo', nome: 'Executivo Clássico', icone: '💼' },
  { id: 'coque', nome: 'Coque Elegante', icone: '👑' },
  { id: 'rabo_cavalo', nome: 'Rabo de Cavalo', icone: '🎀' },
  { id: 'moderno', nome: 'Topete Moderno', icone: '⚡' },
  { id: 'longo_ondulado', nome: 'Longo Ondulado', icone: '🌊' },
  { id: 'afro_puff', nome: 'Afro Puff', icone: '✨' },
  { id: 'curto_cacheado', nome: 'Curto Cacheado', icone: '🌀' },
]

export const ESTILOS_ROUPA_INFO: { id: EstiloRoupaCAS; nome: string; icone: string }[] = [
  { id: 'blazer_executivo', nome: 'Blazer Executivo', icone: '👔' },
  { id: 'moletom_tech', nome: 'Moletom Tech', icone: '💻' },
  { id: 'jaqueta_esportiva', nome: 'Jaqueta Esportiva', icone: '🧥' },
  { id: 'camisa_social', nome: 'Camisa Social Slim', icone: '👕' },
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
      corCabelo: 0x271c15,
      estiloCabelo: 'executivo',
      porteFisico: 'padrao',
      estiloRoupa: 'blazer_executivo',
      corRoupaPrincipal: 0x16a34a,
      corRoupaSecundaria: 0xf8fafc,
      corCalca: 0x1e293b,
      corSapato: 0x0f172a,
      oculos: 'retangular',
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
      corCabelo: 0x5c3317,
      estiloCabelo: 'coque',
      porteFisico: 'esguio',
      estiloRoupa: 'blazer_executivo',
      corRoupaPrincipal: 0x2563eb,
      corRoupaSecundaria: 0xe0f2fe,
      corCalca: 0x334155,
      corSapato: 0x1e293b,
      oculos: 'nenhum',
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
      corCabelo: 0x3b1f12,
      estiloCabelo: 'rabo_cavalo',
      porteFisico: 'atletico',
      estiloRoupa: 'jaqueta_esportiva',
      corRoupaPrincipal: 0xf97316,
      corRoupaSecundaria: 0xffedd5,
      corCalca: 0x1f2937,
      corSapato: 0xf8fafc,
      oculos: 'nenhum',
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
      tomPele: 0xebbd96,
      corOlhos: 0x3b2219,
      corCabelo: 0x18181b,
      estiloCabelo: 'moderno',
      porteFisico: 'padrao',
      estiloRoupa: 'moletom_tech',
      corRoupaPrincipal: 0x0891b2,
      corRoupaSecundaria: 0x0f172a,
      corCalca: 0x1e293b,
      corSapato: 0x0f172a,
      oculos: 'nenhum',
      headset: true,
      estiloCaminhada: 'padrao',
    },
    tracosIds: ['geek', 'visionario', 'cafeinomano'],
  },
}

export function carregarRegistrosCAS(): Record<string, RegistroSimCAS> {
  const base: Record<string, RegistroSimCAS> = JSON.parse(
    JSON.stringify(REGISTROS_PADRAO_POR_SIM),
  )
  try {
    const salvo = localStorage.getItem(CHAVE_STORAGE_CAS)
    if (!salvo) return base
    const parseado = JSON.parse(salvo) as Record<string, RegistroSimCAS>
    for (const [id, reg] of Object.entries(parseado)) {
      if (reg && reg.id && reg.aparencia) {
        base[id] = reg
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
