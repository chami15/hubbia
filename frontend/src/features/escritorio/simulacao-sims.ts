import { AGENTES } from './agentes'
import {
  carregarRegistrosCAS,
  resolverTracosSim,
  type RegistroSimCAS,
} from './cas-sims'
import { categoriaDe, rotuloDe } from './catalogo'
import {
  calcularCaminhoAEstrela,
  calcularPosicaoJigSocial,
  encontrarPosicaoLivrePerto,
  escolherSlotLivreDoMovel,
  pontoColideComAlguemOuMovel,
  type OcupanteRota,
  type PontoRota,
} from './roteamento-sims'
import type { MovelSala, SalaDados } from './sala-dados'
import type { EstadoAgente } from '../../types/agente'
import type { InteracaoAgente } from '../../types/interacao'

// ---------------------------------------------------------------------------
// MOTOR DE SIMULAÇÃO "THE SIMS 4" PARA O HUBBIA
//
// Arquitetura extraída via engenharia reversa (REA / Ghidra) dos binários e
// arquivos de configuração de The Sims 4 (C:\Program Files\EA Games\The Sims 4):
//   - Game\Bin\Default.ini → seção [PlumbBob] (cores exatas por estado de
//     necessidade) e [UI] piemenudeadzone = 28
//   - Game\Bin\res\Camera.ini → FollowCameraParams e interpolação de zoom
//   - Game\Bin\Python\DLLs\postures\posture_specs_x64.pyd → grafo de posturas
//   - Data\Simulation\Gameplay\simulation.zip → subsistemas autonomy,
//     interactions/si_state, routing/connectivity, visualization/jig_visualizer,
//     visualization/portal_visualizer, services/rabbit_hole_service, cas/cas
// ---------------------------------------------------------------------------

export const COR_PLUMBBOB_VERDE = 0x6ec71f
export const COR_PLUMBBOB_AMARELO = 0xffff00
export const COR_PLUMBBOB_LARANJA = 0xff8000
export const COR_PLUMBBOB_VERMELHO = 0xff0000
export const COR_PLUMBBOB_BRANCO = 0xffffff

export const ZONA_MORTA_PIE_MENU_PX = 28

export type VelocidadeTempo = 0 | 1 | 2 | 3

export type ChaveNecessidade =
  | 'energia'
  | 'foco'
  | 'social'
  | 'cafeina'
  | 'ambiente'
  | 'diversao'

export interface NecessidadesSim {
  energia: number   // 0..100 (Energy)
  foco: number      // 0..100 (Focus / Mental clarity)
  social: number    // 0..100 (Social)
  cafeina: number   // 0..100 (Hunger / Coffee)
  ambiente: number  // 0..100 (Environment Score da sala)
  diversao: number  // 0..100 (Fun / Inspiration)
}

export const ROTULOS_NECESSIDADES: Record<ChaveNecessidade, { nome: string; icone: string; descricao: string }> = {
  energia: {
    nome: 'Energia',
    icone: '⚡',
    descricao: 'Disposição física e mental. Recupere tomando café ou descansando em sofás e poltronas.',
  },
  foco: {
    nome: 'Foco',
    icone: '🎯',
    descricao: 'Clareza analítica para executar tarefas do Hubbia. Sobe lendo livros ou planejando.',
  },
  social: {
    nome: 'Social',
    icone: '💬',
    descricao: 'Conexão com colegas de equipe e com o Chefe. Sobe conversando, elogiando ou discutindo projetos.',
  },
  cafeina: {
    nome: 'Cafeína & Lanche',
    icone: '☕',
    descricao: 'Combustível de escritório. Sobe preparando expresso, pegando água ou fazendo uma pausa.',
  },
  ambiente: {
    nome: 'Ambiente',
    icone: '🌿',
    descricao: 'Conforto estético calculado a partir das plantas, luzes e móveis da sala atual.',
  },
  diversao: {
    nome: 'Diversão',
    icone: '✨',
    descricao: 'Criatividade e leveza no expediente. Sobe ouvindo música, contando piadas ou admirando a decoração.',
  },
}

// ---------------------------------------------------------------------------
// POSTURE SPECS (`postures/posture_specs_x64.pyd`)
// ---------------------------------------------------------------------------
export type AspectoCorpoPostura =
  | 'em_pe'
  | 'andando'
  | 'sentado_cadeira'
  | 'sentado_sofa'
  | 'interagindo_em_pe'

export type AspectoCarregarPostura =
  | 'nada'
  | 'xicara_cafe'
  | 'livro'
  | 'tablet'

export interface EspecificacaoPostura {
  corpo: AspectoCorpoPostura
  carregando: AspectoCarregarPostura
  superficieId: string | null
  indiceSlot?: number
}

// ---------------------------------------------------------------------------
// HUMOR (EMOTIONS) E MODIFICADORES (BUFFS - `buffs/buff.pyc`)
// ---------------------------------------------------------------------------
export type HumorSim =
  | 'inspirado'
  | 'focado'
  | 'energizado'
  | 'feliz'
  | 'confiante'
  | 'tenso'
  | 'exausto'
  | 'entediado'

export interface InfoHumor {
  id: HumorSim
  titulo: string
  corHex: string
  corNum: number
  icone: string
  descricao: string
}

export const INFO_HUMORES: Record<HumorSim, InfoHumor> = {
  inspirado: {
    id: 'inspirado',
    titulo: 'Inspirado',
    corHex: '#06b6d4',
    corNum: 0x06b6d4,
    icone: '💡',
    descricao: 'Criatividade em alta! Excelente para propor soluções novas no Hubbia.',
  },
  focado: {
    id: 'focado',
    titulo: 'Focado',
    corHex: '#8b5cf6',
    corNum: 0x8b5cf6,
    icone: '🔬',
    descricao: 'Concentração máxima nas análises, código e compromissos.',
  },
  energizado: {
    id: 'energizado',
    titulo: 'Energizado',
    corHex: '#84cc16',
    corNum: 0x84cc16,
    icone: '⚡',
    descricao: 'Movimenta-se mais rápido pelo escritório e conclui tarefas com vigor.',
  },
  feliz: {
    id: 'feliz',
    titulo: 'Feliz',
    corHex: '#22c55e',
    corNum: 0x22c55e,
    icone: '😊',
    descricao: 'Necessidades equilibradas e ótimo clima no escritório.',
  },
  confiante: {
    id: 'confiante',
    titulo: 'Confiante',
    corHex: '#f59e0b',
    corNum: 0xf59e0b,
    icone: '😎',
    descricao: 'Pronto para liderar reuniões e apresentar resultados ao Chefe.',
  },
  tenso: {
    id: 'tenso',
    titulo: 'Tenso',
    corHex: '#f97316',
    corNum: 0xf97316,
    icone: '😤',
    descricao: 'Sobrecarga cognitiva ou falta de pausa. Recomenda-se relaxar ou conversar.',
  },
  exausto: {
    id: 'exausto',
    titulo: 'Exausto',
    corHex: '#ef4444',
    corNum: 0xef4444,
    icone: '😫',
    descricao: 'Energia ou cafeína críticas! Precisa urgentemente de café ou descanso.',
  },
  entediado: {
    id: 'entediado',
    titulo: 'Normal',
    corHex: '#94a3b8',
    corNum: 0x94a3b8,
    icone: '🙂',
    descricao: 'Rotina tranquila no escritório.',
  },
}

export interface ModificadorHumor {
  id: string
  titulo: string
  icone: string
  humor: HumorSim
  bonus: number
  motivo: string
}

// ---------------------------------------------------------------------------
// INTERAÇÕES E FILA (`interactions/si_state.pyc` & `pie_menu_category.pyc`)
// ---------------------------------------------------------------------------
export type CategoriaPieMenu =
  | 'trabalho'
  | 'necessidades'
  | 'social'
  | 'ambiente'
  | 'navegacao'
  | 'hubbia'

export interface OpcaoPieMenu {
  id: string
  titulo: string
  icone: string
  categoria: CategoriaPieMenu
  corDestaque?: string
  autonoma?: boolean
  duracaoSegundos: number
  posturaAlvo: AspectoCorpoPostura
  carregandoAlvo?: AspectoCarregarPostura
  efeitos: Partial<NecessidadesSim>
  habilidadeAfetada?: string
  alvoMovelId?: string
  alvoSimId?: string
  alvoPosicao?: { coluna: number; linha: number }
  balaoIcone: string
  balaoTexto: string
  acaoEspecial?:
    | 'selecionar_sim'
    | 'abrir_painel_hubbia'
    | 'trocar_sala'
    | 'chamar_todos'
    | 'sair_lote'
    | 'entrar_lote'
  salaDestino?: string
}

export interface InteracaoAtivaSim {
  idInstancia: string
  opcao: OpcaoPieMenu
  progresso: number // 0..1
  fase: 'indo' | 'executando'
}

export interface BalaoSim {
  tipo: 'pensamento' | 'fala'
  icone: string
  texto: string
  expiraEmMS: number
}

export interface HabilidadeSim {
  id: string
  nome: string
  icone: string
  nivel: number     // 1..10
  progresso: number // 0..100
}

export interface RelacionamentoSim {
  alvoId: string
  nome: string
  amizade: number  // 0..100
  sinergia: number // 0..100
  rotulo: string
}

export interface TracoPersonalidade {
  id: string
  nome: string
  icone: string
  descricao: string
}

export interface EstadoSim {
  id: string
  nome: string
  cor: number
  especialidade: string
  funcao: string
  coluna: number
  linha: number
  colunaCasa: number
  linhaCasa: number
  movelCasaId: string | null
  destinoColuna: number | null
  destinoLinha: number | null
  caminho: PontoRota[]
  foraDoLote?: boolean
  postura: EspecificacaoPostura
  necessidades: NecessidadesSim
  taxasNecessidades: Record<ChaveNecessidade, -2 | -1 | 0 | 1 | 2 | 3>
  humor: HumorSim
  modificadores: ModificadorHumor[]
  interacaoAtual: InteracaoAtivaSim | null
  filaInteracoes: OpcaoPieMenu[]
  balao: BalaoSim | null
  habilidades: HabilidadeSim[]
  relacionamentos: RelacionamentoSim[]
  tracos: TracoPersonalidade[]
  estadoBackend: EstadoAgente
  desempenhoCarreira: number // 0..100
}

export interface EstadoMundoSims {
  simAtivoId: string
  velocidade: VelocidadeTempo
  autonomiaAtiva: boolean
  seguirSimAtivo: boolean
  modoCorpoInteiro: boolean
  minutosDoDia: number // ex: 9 * 60 = 09:00
  diaDaSemana: number  // 0 = Seg .. 6 = Dom
  pontuacaoAmbienteSala: number
  salaPendenteViagem?: string | null
  sims: Record<string, EstadoSim>
}

// ---------------------------------------------------------------------------
// TRAÇOS E HABILIDADES INICIAIS POR AGENTE DO HUBBIA
// ---------------------------------------------------------------------------
const TRACOS_POR_AGENTE: Record<string, TracoPersonalidade[]> = {
  cifra: [
    { id: 'analitico', nome: 'Gênio Financeiro', icone: '📊', descricao: 'Ganha Foco analisando planilhas e saldos.' },
    { id: 'ambicioso', nome: 'Ambicioso', icone: '💎', descricao: 'Adora metas batidas e orçamentos sob controle.' },
    { id: 'perfeccionista', nome: 'Perfeccionista', icone: '🔍', descricao: 'Confere cada centavo duas vezes antes de aprovar.' },
  ],
  agenda: [
    { id: 'organizado', nome: 'Mestre do Tempo', icone: '⏰', descricao: 'Nunca atrasa um compromisso e adora rotina clara.' },
    { id: 'extrovertido', nome: 'Comunicativo', icone: '🗣️', descricao: 'Ganha Social mais rápido conversando com a equipe.' },
    { id: 'prestativo', nome: 'Prestativo', icone: '🤝', descricao: 'Sempre pronta para coordenar reuniões com o Chefe.' },
  ],
  vita: [
    { id: 'ativo', nome: 'Energia Vital', icone: '🏃', descricao: 'Valoriza pausas saudáveis, hidratação e ergonomia.' },
    { id: 'zen', nome: 'Mente Equilibrada', icone: '🧘', descricao: 'Resiste melhor ao estresse e inspira bem-estar na sala.' },
    { id: 'amigavel', nome: 'Empática', icone: '🧡', descricao: 'Cuida da saúde e rotina de todo o escritório.' },
  ],
  norte: [
    { id: 'geek', nome: 'Arquiteto de Sistemas', icone: '💻', descricao: 'Fica Inspirado e Focado programando e revisando projetos.' },
    { id: 'visionario', nome: 'Visionário', icone: '🧭', descricao: 'Enxerga o caminho crítico dos projetos de longe.' },
    { id: 'cafeinomano', nome: 'Movido a Expresso', icone: '☕', descricao: 'Transforma café diretamente em código limpo.' },
  ],
}

const HABILIDADES_INICIAIS: Record<string, HabilidadeSim[]> = {
  cifra: [
    { id: 'financas', nome: 'Engenharia Financeira', icone: '📈', nivel: 8, progresso: 45 },
    { id: 'logica', nome: 'Lógica & Auditoria', icone: '🧮', nivel: 7, progresso: 60 },
    { id: 'carisma', nome: 'Negociação', icone: '🤝', nivel: 5, progresso: 30 },
  ],
  agenda: [
    { id: 'gestao', nome: 'Gestão de Tempo', icone: '📅', nivel: 8, progresso: 70 },
    { id: 'carisma', nome: 'Comunicação & Carisma', icone: '💬', nivel: 7, progresso: 50 },
    { id: 'logica', nome: 'Planejamento Estratégico', icone: '♟️', nivel: 6, progresso: 25 },
  ],
  vita: [
    { id: 'bem_estar', nome: 'Saúde & Bem-Estar', icone: '🌿', nivel: 8, progresso: 80 },
    { id: 'culinaria', nome: 'Nutrição & Energia', icone: '🥗', nivel: 6, progresso: 40 },
    { id: 'carisma', nome: 'Empatia & Coaching', icone: '🧡', nivel: 7, progresso: 55 },
  ],
  norte: [
    { id: 'programacao', nome: 'Arquitetura & Código', icone: '💻', nivel: 9, progresso: 35 },
    { id: 'logica', nome: 'Resolução de Problemas', icone: '🧩', nivel: 8, progresso: 50 },
    { id: 'criatividade', nome: 'Inovação de Produto', icone: '🚀', nivel: 7, progresso: 65 },
  ],
}

// ---------------------------------------------------------------------------
// CÁLCULO DE COR DO PLUMBBOB (`Default.ini` [PlumbBob])
// ---------------------------------------------------------------------------
export function calcularCorPlumbBob(necessidades: NecessidadesSim): {
  corNum: number
  corHex: string
  nivelCritico: 'verde' | 'amarelo' | 'laranja' | 'vermelho'
} {
  const menor = Math.min(
    necessidades.energia,
    necessidades.foco,
    necessidades.social,
    necessidades.cafeina,
    necessidades.diversao,
  )
  if (menor < 20) {
    return { corNum: COR_PLUMBBOB_VERMELHO, corHex: '#ff0000', nivelCritico: 'vermelho' }
  }
  if (menor < 38) {
    return { corNum: COR_PLUMBBOB_LARANJA, corHex: '#ff8000', nivelCritico: 'laranja' }
  }
  if (menor < 55) {
    return { corNum: COR_PLUMBBOB_AMARELO, corHex: '#ffff00', nivelCritico: 'amarelo' }
  }
  return { corNum: COR_PLUMBBOB_VERDE, corHex: '#6ec71f', nivelCritico: 'verde' }
}

// ---------------------------------------------------------------------------
// PONTUAÇÃO DE AMBIENTE (`broadcasters/environment_score`)
// ---------------------------------------------------------------------------
export function calcularPontuacaoAmbiente(moveis: MovelSala[]): number {
  let pontos = 52
  for (const m of moveis) {
    const cat = categoriaDe(m.peca)
    if (cat === 'verde') pontos += 10
    else if (cat === 'luz') pontos += 7
    else if (cat === 'chao') pontos += 6
    else if (cat === 'assentos') pontos += 4
    else if (cat === 'eletro') pontos += 5
    else if (cat === 'guardar') pontos += 4
    else if (cat === 'trabalho' || cat === 'mesas') pontos += 2
  }
  return Math.max(25, Math.min(100, pontos))
}

// ---------------------------------------------------------------------------
// CÁLCULO DE HUMOR E MODIFICADORES (`sims/multi_motive_buff_tracker.pyc`)
// ---------------------------------------------------------------------------
export function recalcularHumorEModificadores(sim: EstadoSim): {
  humor: HumorSim
  modificadores: ModificadorHumor[]
} {
  const mods: ModificadorHumor[] = []
  const n = sim.necessidades

  if (sim.foraDoLote) {
    mods.push({
      id: 'passeio-externo',
      titulo: 'Ar Fresco na Vizinhança',
      icone: '🌳',
      humor: 'inspirado',
      bonus: 3,
      motivo: 'Caminhando pela calçada/jardim fora do escritório.',
    })
  }

  if (n.energia < 25) {
    mods.push({
      id: 'sem-energia',
      titulo: 'Bateria Arriada',
      icone: '🪫',
      humor: 'exausto',
      bonus: 3,
      motivo: 'Energia muito baixa — sente-se num sofá ou tome um expresso.',
    })
  } else if (n.energia > 80 && n.cafeina > 75) {
    mods.push({
      id: 'cafeina-alta',
      titulo: 'Expresso Duplo na Veia',
      icone: '⚡',
      humor: 'energizado',
      bonus: 2,
      motivo: 'Cheio de disposição e cafeína!',
    })
  }

  if (n.cafeina < 25) {
    mods.push({
      id: 'fome-cafe',
      titulo: 'Abstinência de Café',
      icone: '☕',
      humor: 'tenso',
      bonus: 2,
      motivo: 'Precisa de uma pausa para café ou lanche.',
    })
  }

  if (n.foco > 78) {
    mods.push({
      id: 'fluxo-mental',
      titulo: 'Estado de Flow',
      icone: '🔬',
      humor: 'focado',
      bonus: 2,
      motivo: 'Mente afiada e pronta para decisões complexas no Hubbia.',
    })
  } else if (n.foco < 30 || n.diversao < 28) {
    mods.push({
      id: 'sobrecarga',
      titulo: 'Fadiga Cognitiva',
      icone: '🌀',
      humor: 'tenso',
      bonus: 2,
      motivo: 'Muitas tarefas seguidas sem diversão ou leitura.',
    })
  }

  if (n.ambiente >= 75) {
    mods.push({
      id: 'escritorio-decorado',
      titulo: 'Escritório Inspirador',
      icone: '🌿',
      humor: 'inspirado',
      bonus: 2,
      motivo: 'Plantas e iluminação da sala estimulam novas ideias.',
    })
  }

  if (n.social >= 78) {
    mods.push({
      id: 'sinergia-equipe',
      titulo: 'Sinergia de Equipe',
      icone: '🤝',
      humor: 'confiante',
      bonus: 2,
      motivo: 'Boas conversas e alinhamento com os colegas do Hubbia.',
    })
  } else if (n.social < 28) {
    mods.push({
      id: 'isolado',
      titulo: 'Trabalhando no Isolamento',
      icone: '😶',
      humor: 'entediado',
      bonus: 1,
      motivo: 'Faz tempo que não troca ideia com nenhum colega.',
    })
  }

  if (sim.estadoBackend === 'executando' || sim.estadoBackend === 'pensando') {
    mods.push({
      id: 'ia-ativa',
      titulo: 'Processando IA ao Vivo',
      icone: '🧠',
      humor: 'focado',
      bonus: 3,
      motivo: 'O agente está processando raciocínio no servidor Hubbia.',
    })
  } else if (sim.estadoBackend === 'falando') {
    mods.push({
      id: 'ia-falando',
      titulo: 'Em Diálogo com o Chefe',
      icone: '💬',
      humor: 'confiante',
      bonus: 3,
      motivo: 'Comunicando resultados diretamente no Hubbia.',
    })
  }

  if (mods.length === 0) {
    mods.push({
      id: 'equilibrado',
      titulo: 'Expediente Equilibrado',
      icone: '😊',
      humor: 'feliz',
      bonus: 1,
      motivo: 'Todas as necessidades estão em bom nível.',
    })
  }

  const placar = new Map<HumorSim, number>()
  for (const m of mods) {
    placar.set(m.humor, (placar.get(m.humor) ?? 0) + m.bonus)
  }

  if (n.energia < 22) {
    return { humor: 'exausto', modificadores: mods }
  }

  let melhorHumor: HumorSim = 'feliz'
  let maior = -1
  for (const [h, pts] of placar.entries()) {
    if (pts > maior) {
      maior = pts
      melhorHumor = h
    }
  }

  return { humor: melhorHumor, modificadores: mods }
}

// ---------------------------------------------------------------------------
// GERADOR DE AFFORDANCES (INTERAÇÕES DO PIE MENU E AUTONOMIA)
// Usa os slots reais de interação (`roteamento-sims.ts`) para nunca jogar
// vários Sims no mesmo ponto nem dentro da mobília!
// ---------------------------------------------------------------------------
export function obterInteracoesDoMovel(
  movel: MovelSala,
  todosMoveis: MovelSala[],
  simAtivo: EstadoSim,
): OpcaoPieMenu[] {
  const opcoes: OpcaoPieMenu[] = []
  const cat = categoriaDe(movel.peca)
  const rotulo = rotuloDe(movel.peca)

  // Porta / Portal: caminhar até a porta, abri-la e viajar ou passear na rua!
  if (movel.leva || movel.peca.startsWith('doorway')) {
    if (movel.leva) {
      opcoes.push({
        id: `porta-ir-${movel.id}`,
        titulo: `Entrar em: ${movel.leva}`,
        icone: '🚪',
        categoria: 'navegacao',
        corDestaque: '#4ade80',
        duracaoSegundos: 1.5,
        posturaAlvo: 'em_pe',
        efeitos: {},
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🚪',
        balaoTexto: `Atravessando porta para ${movel.leva}...`,
        acaoEspecial: 'trocar_sala',
        salaDestino: movel.leva,
      })
    }

    opcoes.push(
      {
        id: `porta-sair-rua-${movel.id}`,
        titulo: 'Sair para Compromisso Externo (Rua)',
        icone: '🚕',
        categoria: 'navegacao',
        corDestaque: '#38bdf8',
        duracaoSegundos: 9,
        posturaAlvo: 'interagindo_em_pe',
        carregandoAlvo: 'tablet',
        efeitos: { social: 28, foco: 22, diversao: 18 },
        alvoPosicao: { coluna: 3, linha: 7.9 },
        balaoIcone: '🚕',
        balaoTexto: 'Saindo pela calçada para compromisso externo!',
        acaoEspecial: 'sair_lote',
      },
      {
        id: `porta-entrar-lote-${movel.id}`,
        titulo: 'Entrar de Volta no Escritório',
        icone: '🏢',
        categoria: 'navegacao',
        duracaoSegundos: 2,
        posturaAlvo: 'em_pe',
        efeitos: { ambiente: 12 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🏢',
        balaoTexto: 'De volta ao escritório!',
        acaoEspecial: 'entrar_lote',
      },
    )
  }

  // Estações de trabalho (cadeiras de escritório, mesas, computadores, notebooks)
  if (
    movel.peca.startsWith('chairDesk') ||
    movel.peca.startsWith('desk') ||
    movel.peca.startsWith('computer') ||
    movel.peca.startsWith('laptop')
  ) {
    const cadeira = encontrarAssentoDaEstacao(movel, todosMoveis)
    const alvoAssento = cadeira ?? movel
    const habPrincipal = simAtivo.habilidades[0]?.id ?? 'logica'

    opcoes.push(
      {
        id: `trabalhar-${movel.id}`,
        titulo: `Trabalhar em ${simAtivo.funcao}`,
        icone: '💻',
        categoria: 'trabalho',
        corDestaque: '#8b5cf6',
        autonoma: true,
        duracaoSegundos: 12,
        posturaAlvo: 'sentado_cadeira',
        carregandoAlvo: 'nada',
        efeitos: { foco: 16, diversao: -6, energia: -8, cafeina: -6 },
        habilidadeAfetada: habPrincipal,
        alvoMovelId: alvoAssento.id,
        alvoPosicao: { coluna: alvoAssento.coluna, linha: alvoAssento.linha },
        balaoIcone: '💻',
        balaoTexto: `Trabalhando em ${simAtivo.funcao}`,
      },
      {
        id: `otimizar-ia-${movel.id}`,
        titulo: 'Planejar Estratégia (Foco)',
        icone: '🔬',
        categoria: 'trabalho',
        corDestaque: '#06b6d4',
        autonoma: true,
        duracaoSegundos: 9,
        posturaAlvo: 'sentado_cadeira',
        carregandoAlvo: 'tablet',
        efeitos: { foco: 26, energia: -5 },
        habilidadeAfetada: 'logica',
        alvoMovelId: alvoAssento.id,
        alvoPosicao: { coluna: alvoAssento.coluna, linha: alvoAssento.linha },
        balaoIcone: '📊',
        balaoTexto: 'Revisando metas e indicadores!',
      },
      {
        id: `navegar-diversao-${movel.id}`,
        titulo: 'Ver Memes & Relaxar na Rede',
        icone: '🕹️',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 7,
        posturaAlvo: 'sentado_cadeira',
        efeitos: { diversao: 28, foco: 5, energia: -2 },
        alvoMovelId: alvoAssento.id,
        alvoPosicao: { coluna: alvoAssento.coluna, linha: alvoAssento.linha },
        balaoIcone: '😄',
        balaoTexto: 'Haha, olha esse vídeo!',
      },
    )
  }

  // Cozinha / Cafeteira / Geladeira
  if (cat === 'cozinha' || movel.peca.includes('Coffee') || movel.peca.includes('Fridge')) {
    opcoes.push(
      {
        id: `cafe-expresso-${movel.id}`,
        titulo: 'Preparar Expresso Duplo',
        icone: '☕',
        categoria: 'necessidades',
        corDestaque: '#84cc16',
        autonoma: true,
        duracaoSegundos: 7,
        posturaAlvo: 'interagindo_em_pe',
        carregandoAlvo: 'xicara_cafe',
        efeitos: { cafeina: 45, energia: 24, diversao: 8 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '☕',
        balaoTexto: 'Nada como um expresso fresquinho!',
      },
      {
        id: `lanche-rapido-${movel.id}`,
        titulo: 'Fazer Lanche Saudável',
        icone: '🥪',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 8,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { cafeina: 40, energia: 16, social: 6 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🥗',
        balaoTexto: 'Recarregando as energias!',
      },
    )
  }

  // Sofás, poltronas e cadeiras de descanso/reunião
  if ((cat === 'assentos' && !movel.peca.startsWith('chairDesk')) || cat === 'quarto') {
    opcoes.push(
      {
        id: `descansar-sofa-${movel.id}`,
        titulo: 'Relaxar & Recuperar Energia',
        icone: '🛋️',
        categoria: 'necessidades',
        corDestaque: '#22c55e',
        autonoma: true,
        duracaoSegundos: 10,
        posturaAlvo: 'sentado_sofa',
        efeitos: { energia: 36, diversao: 18, foco: 10 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '😌',
        balaoTexto: 'Pausa merecida no estofado...',
      },
      {
        id: `cochilo-sofa-${movel.id}`,
        titulo: 'Tirar Cochilo Revigorante',
        icone: '💤',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 13,
        posturaAlvo: 'sentado_sofa',
        efeitos: { energia: 52, foco: 14 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '💤',
        balaoTexto: 'Zzz... recarregando 100%!',
      },
    )
  }

  // Estantes e livros
  if (cat === 'guardar' || movel.peca.startsWith('book')) {
    opcoes.push({
      id: `ler-livro-${movel.id}`,
      titulo: 'Ler Livro da Especialidade',
      icone: '📚',
      categoria: 'trabalho',
      corDestaque: '#8b5cf6',
      autonoma: true,
      duracaoSegundos: 9,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'livro',
      efeitos: { foco: 32, diversao: 16 },
      habilidadeAfetada: simAtivo.habilidades[0]?.id ?? 'logica',
      alvoMovelId: movel.id,
      alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
      balaoIcone: '📖',
      balaoTexto: 'Estudando novos conceitos!',
    })
  }

  // Plantas e decoração
  if (cat === 'verde') {
    opcoes.push(
      {
        id: `admirar-planta-${movel.id}`,
        titulo: 'Admirar Planta & Respirar',
        icone: '🌿',
        categoria: 'ambiente',
        corDestaque: '#06b6d4',
        autonoma: true,
        duracaoSegundos: 6,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { diversao: 24, foco: 18, energia: 10 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🌿',
        balaoTexto: 'Que paz olhar o verde do escritório!',
      },
      {
        id: `cuidar-planta-${movel.id}`,
        titulo: 'Cuidar da Planta (Biofilia)',
        icone: '💧',
        categoria: 'ambiente',
        autonoma: true,
        duracaoSegundos: 7,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { diversao: 20, ambiente: 10, foco: 12 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🌱',
        balaoTexto: 'Cuidando do jardim do escritório!',
      },
    )
  }

  // Eletrônicos (TV, rádio, caixa de som)
  if (cat === 'eletro') {
    opcoes.push({
      id: `curtir-som-${movel.id}`,
      titulo: 'Curtir Música / Mídia',
      icone: '🎵',
      categoria: 'necessidades',
      autonoma: true,
      duracaoSegundos: 8,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { diversao: 35, social: 10, energia: 6 },
      alvoMovelId: movel.id,
      alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
      balaoIcone: '🎵',
      balaoTexto: 'Esse som deixa o escritório incrível!',
    })
  }

  // Mesas de reunião / centro
  if (cat === 'mesas') {
    opcoes.push({
      id: `reuniao-mesa-${movel.id}`,
      titulo: 'Revisar Pauta na Mesa',
      icone: '📋',
      categoria: 'trabalho',
      autonoma: true,
      duracaoSegundos: 8,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'tablet',
      efeitos: { foco: 22, social: 14 },
      alvoMovelId: movel.id,
      alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
      balaoIcone: '📋',
      balaoTexto: 'Organizando a pauta da equipe!',
    })
  }

  // Opção universal em qualquer móvel: Examinar
  opcoes.push({
    id: `examinar-${movel.id}`,
    titulo: `Examinar ${rotulo}`,
    icone: '🔍',
    categoria: 'ambiente',
    duracaoSegundos: 4,
    posturaAlvo: 'em_pe',
    efeitos: { diversao: 8, foco: 6 },
    alvoMovelId: movel.id,
    alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
    balaoIcone: '✨',
    balaoTexto: `Ótimo acabamento em ${rotulo}!`,
  })

  return opcoes
}

export function obterInteracoesDoSim(
  alvoSim: EstadoSim,
  simAtivo: EstadoSim,
): OpcaoPieMenu[] {
  const mesmoSim = alvoSim.id === simAtivo.id

  if (mesmoSim) {
    return [
      {
        id: `abrir-painel-${alvoSim.id}`,
        titulo: `Abrir Painel (${alvoSim.nome})`,
        icone: '🗂️',
        categoria: 'hubbia',
        corDestaque: '#4ade80',
        duracaoSegundos: 1,
        posturaAlvo: simAtivo.postura.corpo,
        efeitos: {},
        balaoIcone: '🗂️',
        balaoTexto: `Abrindo painel de ${alvoSim.nome}`,
        acaoEspecial: 'abrir_painel_hubbia',
        alvoSimId: alvoSim.id,
      },
      {
        id: `pausa-cafe-proprio-${alvoSim.id}`,
        titulo: 'Tomar Expresso Rápido',
        icone: '☕',
        categoria: 'necessidades',
        corDestaque: '#84cc16',
        autonoma: true,
        duracaoSegundos: 6,
        posturaAlvo: 'interagindo_em_pe',
        carregandoAlvo: 'xicara_cafe',
        efeitos: { cafeina: 42, energia: 28, diversao: 10 },
        balaoIcone: '☕',
        balaoTexto: 'Pausa rápida pro expresso!',
      },
      {
        id: `alongar-proprio-${alvoSim.id}`,
        titulo: 'Alongamento Ergonômico',
        icone: '🧘',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 5,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { energia: 26, diversao: 16, foco: 12 },
        balaoIcone: '🧘',
        balaoTexto: 'Alongando as costas e respirando fundo!',
      },
      {
        id: `passear-rua-${alvoSim.id}`,
        titulo: 'Sair para Tomar Ar na Calçada',
        icone: '🌳',
        categoria: 'navegacao',
        corDestaque: '#38bdf8',
        duracaoSegundos: 8,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { diversao: 28, energia: 18, ambiente: 20 },
        alvoPosicao: { coluna: 3, linha: 7.8 },
        balaoIcone: '🌳',
        balaoTexto: 'Saindo para respirar ar puro na calçada!',
        acaoEspecial: 'sair_lote',
      },
      ...(simAtivo.foraDoLote
        ? [
            {
              id: `voltar-escritorio-${alvoSim.id}`,
              titulo: 'Entrar de Volta no Escritório',
              icone: '🏢',
              categoria: 'navegacao' as const,
              corDestaque: '#4ade80',
              duracaoSegundos: 2,
              posturaAlvo: 'em_pe' as const,
              efeitos: { foco: 12 },
              alvoPosicao: { coluna: simAtivo.colunaCasa, linha: simAtivo.linhaCasa },
              balaoIcone: '🏢',
              balaoTexto: 'Voltando para dentro do escritório!',
              acaoEspecial: 'entrar_lote' as const,
            },
          ]
        : []),
    ]
  }

  return [
    {
      id: `selecionar-sim-${alvoSim.id}`,
      titulo: `Controlar ${alvoSim.nome}`,
      icone: '💎',
      categoria: 'hubbia',
      corDestaque: '#6ec71f',
      duracaoSegundos: 1,
      posturaAlvo: 'em_pe',
      efeitos: {},
      alvoSimId: alvoSim.id,
      balaoIcone: '💎',
      balaoTexto: `${alvoSim.nome} ativo!`,
      acaoEspecial: 'selecionar_sim',
    },
    {
      id: `abrir-painel-${alvoSim.id}`,
      titulo: `Abrir Painel de ${alvoSim.nome}`,
      icone: '🗂️',
      categoria: 'hubbia',
      corDestaque: '#38bdf8',
      duracaoSegundos: 1,
      posturaAlvo: simAtivo.postura.corpo,
      efeitos: {},
      alvoSimId: alvoSim.id,
      balaoIcone: '🗂️',
      balaoTexto: `Consultando ${alvoSim.nome}`,
      acaoEspecial: 'abrir_painel_hubbia',
    },
    {
      id: `social-papo-${alvoSim.id}`,
      titulo: `Bater Papo com ${alvoSim.nome}`,
      icone: '💬',
      categoria: 'social',
      autonoma: true,
      duracaoSegundos: 7,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 32, diversao: 18 },
      habilidadeAfetada: 'carisma',
      alvoSimId: alvoSim.id,
      balaoIcone: '💬',
      balaoTexto: `Trocando ideia com ${alvoSim.nome}!`,
    },
    {
      id: `social-projeto-${alvoSim.id}`,
      titulo: `Alinhar Projeto com ${alvoSim.nome}`,
      icone: '🤝',
      categoria: 'trabalho',
      corDestaque: '#8b5cf6',
      autonoma: true,
      duracaoSegundos: 8,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'tablet',
      efeitos: { social: 26, foco: 22 },
      habilidadeAfetada: 'carisma',
      alvoSimId: alvoSim.id,
      balaoIcone: '📈',
      balaoTexto: `Sincronizando dados com ${alvoSim.nome}!`,
    },
    {
      id: `social-piada-${alvoSim.id}`,
      titulo: 'Contar Piada de Escritório',
      icone: '😄',
      categoria: 'social',
      autonoma: true,
      duracaoSegundos: 6,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 24, diversao: 32, energia: 6 },
      habilidadeAfetada: 'carisma',
      alvoSimId: alvoSim.id,
      balaoIcone: '😂',
      balaoTexto: `Rindo muito com ${alvoSim.nome}!`,
    },
    {
      id: `social-cafe-${alvoSim.id}`,
      titulo: `Tomar Café com ${alvoSim.nome}`,
      icone: '☕',
      categoria: 'necessidades',
      corDestaque: '#84cc16',
      autonoma: true,
      duracaoSegundos: 8,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'xicara_cafe',
      efeitos: { cafeina: 36, social: 28, energia: 20 },
      alvoSimId: alvoSim.id,
      balaoIcone: '☕',
      balaoTexto: `Hora do café com ${alvoSim.nome}!`,
    },
  ]
}

export function obterInteracoesDoChao(coluna: number, linha: number, linhasSala = 7): OpcaoPieMenu[] {
  const c = Number(coluna.toFixed(2))
  const l = Number(linha.toFixed(2))
  const clicouForaDoLote = l > linhasSala - 0.5

  const opcoes: OpcaoPieMenu[] = [
    {
      id: `ir-aqui-${c}-${l}`,
      titulo: clicouForaDoLote ? 'Passear até a Calçada / Jardim' : 'Ir até Aqui',
      icone: clicouForaDoLote ? '🌳' : '👣',
      categoria: 'navegacao',
      corDestaque: '#6ec71f',
      duracaoSegundos: 1,
      posturaAlvo: 'em_pe',
      efeitos: clicouForaDoLote ? { diversao: 12, ambiente: 10 } : {},
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: clicouForaDoLote ? '🌳' : '👣',
      balaoTexto: clicouForaDoLote ? 'Saindo para a calçada...' : 'Caminhando...',
      acaoEspecial: clicouForaDoLote ? 'sair_lote' : 'entrar_lote',
    },
    {
      id: `pausa-cafe-chao-${c}-${l}`,
      titulo: 'Pausa para Expresso Aqui',
      icone: '☕',
      categoria: 'necessidades',
      duracaoSegundos: 6,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'xicara_cafe',
      efeitos: { cafeina: 38, energia: 22, diversao: 10 },
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: '☕',
      balaoTexto: 'Apreciando um café fresquinho!',
    },
    {
      id: `alongar-chao-${c}-${l}`,
      titulo: 'Alongar & Energizar Aqui',
      icone: '🧘',
      categoria: 'necessidades',
      duracaoSegundos: 5,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { energia: 25, diversao: 18, foco: 10 },
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: '🧘',
      balaoTexto: 'Renovando a postura e a energia!',
    },
    {
      id: `chamar-todos-${c}-${l}`,
      titulo: 'Reunir Equipe Aqui',
      icone: '📣',
      categoria: 'social',
      corDestaque: '#38bdf8',
      duracaoSegundos: 4,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 25, foco: 15 },
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: '📣',
      balaoTexto: 'Pessoal, reunião relâmpago aqui!',
      acaoEspecial: 'chamar_todos',
    },
    {
      id: `sair-compromisso-${c}-${l}`,
      titulo: 'Sair para Compromisso Externo (Rua)',
      icone: '🚕',
      categoria: 'navegacao',
      corDestaque: '#38bdf8',
      duracaoSegundos: 9,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'tablet',
      efeitos: { social: 28, foco: 20, diversao: 15 },
      alvoPosicao: { coluna: 3, linha: linhasSala + 1.1 },
      balaoIcone: '🚕',
      balaoTexto: 'Indo até a rua para compromisso externo!',
      acaoEspecial: 'sair_lote',
    },
  ]

  return opcoes
}

function encontrarAssentoDaEstacao(movel: MovelSala, todosMoveis: MovelSala[]): MovelSala | null {
  if (movel.peca.startsWith('chair')) return movel
  let melhor: MovelSala | null = null
  let menorDist = Infinity
  for (const outro of todosMoveis) {
    if (!outro.peca.startsWith('chair')) continue
    const d = Math.hypot(outro.coluna - movel.coluna, outro.linha - movel.linha)
    if (d < 1.3 && d < menorDist) {
      menorDist = d
      melhor = outro
    }
  }
  return melhor
}

function construirOcupantesRota(sims: Record<string, EstadoSim>): OcupanteRota[] {
  return Object.values(sims).map((s) => ({
    id: s.id,
    coluna: s.coluna,
    linha: s.linha,
    destinoColuna: s.destinoColuna,
    destinoLinha: s.destinoLinha,
    movelOcupadoId: s.interacaoAtual?.opcao.alvoMovelId ?? s.postura.superficieId,
    indiceSlotOcupado: s.postura.indiceSlot,
  }))
}

// ---------------------------------------------------------------------------
// CRIAÇÃO DO ESTADO INICIAL DO MUNDO SIMS + INTEGRAÇÃO COM CAS
// ---------------------------------------------------------------------------
export function criarEstadoMundoSims(sala: SalaDados): EstadoMundoSims {
  const pontuacaoAmbienteSala = calcularPontuacaoAmbiente(sala.moveis)
  const registrosCAS = carregarRegistrosCAS()
  const sims: Record<string, EstadoSim> = {}
  const ocupantesAtuais: OcupanteRota[] = []

  // 1. Sims originais do Hubbia (com customizações salvas no CAS se houver)
  AGENTES.forEach((agente, idx) => {
    const reg = registrosCAS[agente.id]
    const movelAssento = sala.moveis.find((m) => m.agente === agente.id) ?? null
    const posPadrao = movelAssento
      ? { coluna: movelAssento.coluna, linha: movelAssento.linha }
      : encontrarPosicaoLivrePerto(1.5 + idx * 1.2, 2.5, sala, ocupantesAtuais)

    ocupantesAtuais.push({
      id: agente.id,
      coluna: posPadrao.coluna,
      linha: posPadrao.linha,
      destinoColuna: null,
      destinoLinha: null,
      movelOcupadoId: movelAssento?.id ?? null,
      indiceSlotOcupado: 0,
    })

    const relacionamentos: RelacionamentoSim[] = [
      {
        alvoId: 'chefe',
        nome: 'Chefe (Você)',
        amizade: 82,
        sinergia: 88,
        rotulo: 'Parceiro Estratégico',
      },
      ...AGENTES.filter((outro) => outro.id !== agente.id).map((outro, rIdx) => ({
        alvoId: outro.id,
        nome: outro.nome,
        amizade: 68 + ((idx + rIdx) % 3) * 8,
        sinergia: 74 + ((idx * 2 + rIdx) % 3) * 7,
        rotulo: 'Colega de Equipe',
      })),
    ]

    const necessidades: NecessidadesSim = {
      energia: 78 - idx * 5,
      foco: 82 - (idx % 2) * 6,
      social: 72 + (idx % 3) * 5,
      cafeina: 74 - idx * 4,
      ambiente: pontuacaoAmbienteSala,
      diversao: 75 - (idx % 2) * 5,
    }

    const tracos = reg?.tracosIds?.length
      ? resolverTracosSim(reg.tracosIds)
      : (TRACOS_POR_AGENTE[agente.id] ?? [])

    const sim: EstadoSim = {
      id: agente.id,
      nome: reg?.nome || agente.nome,
      cor: reg?.corIdentidade || agente.cor,
      especialidade: reg?.especialidade || agente.especialidade,
      funcao: reg?.funcao || agente.funcao,
      coluna: posPadrao.coluna,
      linha: posPadrao.linha,
      colunaCasa: posPadrao.coluna,
      linhaCasa: posPadrao.linha,
      movelCasaId: movelAssento?.id ?? null,
      destinoColuna: null,
      destinoLinha: null,
      caminho: [],
      foraDoLote: false,
      postura: {
        corpo: movelAssento ? 'sentado_cadeira' : 'em_pe',
        carregando: 'nada',
        superficieId: movelAssento?.id ?? null,
        indiceSlot: 0,
      },
      necessidades,
      taxasNecessidades: {
        energia: 0,
        foco: 0,
        social: 0,
        cafeina: 0,
        ambiente: 0,
        diversao: 0,
      },
      humor: 'focado',
      modificadores: [],
      interacaoAtual: null,
      filaInteracoes: [],
      balao: null,
      habilidades: HABILIDADES_INICIAIS[agente.id]
        ? JSON.parse(JSON.stringify(HABILIDADES_INICIAIS[agente.id]))
        : [],
      relacionamentos,
      tracos,
      estadoBackend: 'idle',
      desempenhoCarreira: 76 + idx * 4,
    }

    const { humor, modificadores } = recalcularHumorEModificadores(sim)
    sim.humor = humor
    sim.modificadores = modificadores
    sims[agente.id] = sim
  })

  // 2. Sims/Agentes extras criados pelo usuário no Create-A-Sim (CAS)
  let mundoInicial: EstadoMundoSims = {
    simAtivoId: AGENTES[0].id,
    velocidade: 1,
    autonomiaAtiva: true,
    seguirSimAtivo: false,
    modoCorpoInteiro: true,
    minutosDoDia: 9 * 60 + 30,
    diaDaSemana: 0,
    pontuacaoAmbienteSala,
    salaPendenteViagem: null,
    sims,
  }

  for (const reg of Object.values(registrosCAS)) {
    if (reg.customizado) {
      mundoInicial = integrarSimDoCASNoMundo(mundoInicial, reg, sala, false)
    }
  }

  return mundoInicial
}

// Integra ou atualiza um Sim criado/editado no Create-A-Sim (CAS) dentro do mundo vivo!
// Se for um Sim recém-criado (`chegarPelaRua = true`), ele nasce no Portal da Rua e
// caminha para dentro do escritório cumprimentando a equipe!
export function integrarSimDoCASNoMundo(
  mundo: EstadoMundoSims,
  registro: RegistroSimCAS,
  sala: SalaDados,
  chegarPelaRua = true,
): EstadoMundoSims {
  const existente = mundo.sims[registro.id]
  const tracos = resolverTracosSim(registro.tracosIds)

  if (existente) {
    const atualizado: EstadoSim = {
      ...existente,
      nome: registro.nome,
      funcao: registro.funcao,
      especialidade: registro.especialidade,
      cor: registro.corIdentidade,
      tracos: tracos.length > 0 ? tracos : existente.tracos,
    }
    return {
      ...mundo,
      simAtivoId: registro.id,
      sims: {
        ...mundo.sims,
        [registro.id]: atualizado,
      },
    }
  }

  // Novo Sim criado no CAS! Encontra um ponto livre no escritório como casa
  const ocupantes = construirOcupantesRota(mundo.sims)
  const centroX = Math.floor((sala.colunas || 7) / 2)
  const centroZ = Math.floor((sala.linhas || 7) / 2)
  const posCasa = encontrarPosicaoLivrePerto(centroX, centroZ, sala, ocupantes, registro.id)

  // Ponto de chegada no portal da calçada em frente ao lote
  const posChegadaRua = {
    coluna: Number(centroX.toFixed(2)),
    linha: Number(((sala.linhas || 7) + 1.1).toFixed(2)),
  }
  const posInicial = chegarPelaRua ? posChegadaRua : posCasa

  const novoSim: EstadoSim = {
    id: registro.id,
    nome: registro.nome,
    cor: registro.corIdentidade,
    especialidade: registro.especialidade,
    funcao: registro.funcao,
    coluna: posInicial.coluna,
    linha: posInicial.linha,
    colunaCasa: posCasa.coluna,
    linhaCasa: posCasa.linha,
    movelCasaId: null,
    destinoColuna: null,
    destinoLinha: null,
    caminho: [],
    foraDoLote: chegarPelaRua,
    postura: {
      corpo: 'em_pe',
      carregando: 'nada',
      superficieId: null,
    },
    necessidades: {
      energia: 88,
      foco: 85,
      social: 80,
      cafeina: 82,
      ambiente: mundo.pontuacaoAmbienteSala,
      diversao: 85,
    },
    taxasNecessidades: {
      energia: 0,
      foco: 0,
      social: 0,
      cafeina: 0,
      ambiente: 0,
      diversao: 0,
    },
    humor: 'inspirado',
    modificadores: [],
    interacaoAtual: null,
    filaInteracoes: [],
    balao: {
      tipo: 'fala',
      icone: '👋',
      texto: `Olá equipe! ${registro.nome} chegando no Hubbia!`,
      expiraEmMS: Date.now() + 7000,
    },
    habilidades: registro.habilidadesIniciais ?? [
      { id: 'especialidade', nome: `Domínio em ${registro.funcao}`, icone: '🚀', nivel: 6, progresso: 50 },
      { id: 'logica', nome: 'Lógica & Análise', icone: '🧩', nivel: 5, progresso: 40 },
      { id: 'carisma', nome: 'Comunicação & Sinergia', icone: '💬', nivel: 5, progresso: 60 },
    ],
    relacionamentos: [
      {
        alvoId: 'chefe',
        nome: 'Chefe (Você)',
        amizade: 80,
        sinergia: 85,
        rotulo: 'Líder do Hubbia',
      },
      ...Object.values(mundo.sims).map((outro) => ({
        alvoId: outro.id,
        nome: outro.nome,
        amizade: 70,
        sinergia: 75,
        rotulo: 'Colega de Equipe',
      })),
    ],
    tracos,
    estadoBackend: 'idle',
    desempenhoCarreira: 80,
  }

  const { humor, modificadores } = recalcularHumorEModificadores(novoSim)
  novoSim.humor = humor
  novoSim.modificadores = modificadores

  // Adiciona o novo Sim nos relacionamentos dos colegas existentes
  const simsAtualizados: Record<string, EstadoSim> = {}
  for (const [id, s] of Object.entries(mundo.sims)) {
    const jaTem = s.relacionamentos.some((r) => r.alvoId === novoSim.id)
    simsAtualizados[id] = jaTem
      ? s
      : {
          ...s,
          relacionamentos: [
            ...s.relacionamentos,
            {
              alvoId: novoSim.id,
              nome: novoSim.nome,
              amizade: 70,
              sinergia: 75,
              rotulo: 'Novo Colega',
            },
          ],
        }
  }
  simsAtualizados[novoSim.id] = novoSim

  let novoMundo: EstadoMundoSims = {
    ...mundo,
    simAtivoId: novoSim.id,
    sims: simsAtualizados,
  }

  if (chegarPelaRua) {
    novoMundo = enfileirarInteracaoSim(
      novoMundo,
      novoSim.id,
      {
        id: `chegada-lote-${novoSim.id}`,
        titulo: 'Entrar no Escritório (Chegada)',
        icone: '🏢',
        categoria: 'navegacao',
        corDestaque: '#4ade80',
        duracaoSegundos: 2,
        posturaAlvo: 'em_pe',
        efeitos: { social: 10 },
        alvoPosicao: posCasa,
        balaoIcone: '👋',
        balaoTexto: `Prazer em conhecer todos! Sou ${novoSim.nome}!`,
        acaoEspecial: 'entrar_lote',
      },
      true,
      sala,
    )
  }

  return novoMundo
}

// ---------------------------------------------------------------------------
// AUTONOMIA (`autonomy/autonomy_modes.pyc` & `PostureScoring`)
// ---------------------------------------------------------------------------
export function escolherInteracaoAutonoma(
  sim: EstadoSim,
  mundo: EstadoMundoSims,
  sala: SalaDados,
): OpcaoPieMenu | null {
  // Se o Sim estava fora do lote e terminou o compromisso externo, volta para dentro!
  if (sim.foraDoLote) {
    return {
      id: `auto-voltar-lote-${sim.id}`,
      titulo: 'Retornar ao Escritório',
      icone: '🏢',
      categoria: 'navegacao',
      autonoma: true,
      duracaoSegundos: 2,
      posturaAlvo: 'em_pe',
      efeitos: {},
      alvoPosicao: { coluna: sim.colunaCasa, linha: sim.linhaCasa },
      balaoIcone: '🏢',
      balaoTexto: 'Voltando do compromisso externo!',
      acaoEspecial: 'entrar_lote',
    }
  }

  const n = sim.necessidades
  const entradas: { chave: ChaveNecessidade; valor: number }[] = [
    { chave: 'energia', valor: n.energia },
    { chave: 'cafeina', valor: n.cafeina },
    { chave: 'social', valor: n.social },
    { chave: 'diversao', valor: n.diversao },
    { chave: 'foco', valor: n.foco },
  ]
  entradas.sort((a, b) => a.valor - b.valor)
  const maisBaixa = entradas[0]

  if (maisBaixa.valor > 62 && sim.movelCasaId) {
    const movelCasa = sala.moveis.find((m) => m.id === sim.movelCasaId)
    if (movelCasa) {
      const opcoesCasa = obterInteracoesDoMovel(movelCasa, sala.moveis, sim)
      const trabalhar = opcoesCasa.find((o) => o.id.startsWith('trabalhar-'))
      if (trabalhar) return trabalhar
    }
  }

  return escolherInteracaoParaNecessidade(sim, maisBaixa.chave, mundo, sala)
}

export function escolherInteracaoParaNecessidade(
  sim: EstadoSim,
  necessidade: ChaveNecessidade,
  mundo: EstadoMundoSims,
  sala: SalaDados,
): OpcaoPieMenu | null {
  const candidatas: OpcaoPieMenu[] = []

  for (const m of sala.moveis) {
    for (const op of obterInteracoesDoMovel(m, sala.moveis, sim)) {
      if (op.autonoma) candidatas.push(op)
    }
  }

  for (const outro of Object.values(mundo.sims)) {
    for (const op of obterInteracoesDoSim(outro, sim)) {
      if (op.autonoma) candidatas.push(op)
    }
  }

  const ocupantes = construirOcupantesRota(mundo.sims)
  let melhor: OpcaoPieMenu | null = null
  let maiorNota = -Infinity

  for (const op of candidatas) {
    const ganhoAlvo = op.efeitos[necessidade] ?? 0
    if (ganhoAlvo <= 0 && necessidade !== 'ambiente') continue

    if (op.alvoMovelId) {
      const movel = sala.moveis.find((m) => m.id === op.alvoMovelId)
      if (!movel) continue
      if (movel.agente && movel.agente !== sim.id) continue

      // Penaliza fortemente se todos os slots do móvel já estão ocupados por outros Sims
      const escolhaSlot = escolherSlotLivreDoMovel(movel, sim.id, ocupantes)
      const ocupadoPorOutro = ocupantes.some(
        (o) =>
          o.id !== sim.id &&
          Math.hypot(o.coluna - escolhaSlot.slot.coluna, o.linha - escolhaSlot.slot.linha) < 0.45,
      )
      if (ocupadoPorOutro) continue
    }

    let nota = ganhoAlvo * 2.5
    if (op.alvoMovelId && op.alvoMovelId === sim.movelCasaId) {
      nota += 18
    }
    nota += Math.random() * 8

    if (nota > maiorNota) {
      maiorNota = nota
      melhor = op
    }
  }

  return melhor
}

// ---------------------------------------------------------------------------
// FILA DE INTERAÇÕES (`SIState`) + ROTEAMENTO A* E RESERVA DE SLOTS
// ---------------------------------------------------------------------------
export function enfileirarInteracaoSim(
  mundo: EstadoMundoSims,
  simId: string,
  opcao: OpcaoPieMenu,
  prioridadeImediata = false,
  salaOpcional?: SalaDados,
): EstadoMundoSims {
  const sim = mundo.sims[simId]
  if (!sim) return mundo

  const fila = [...sim.filaInteracoes]
  if (prioridadeImediata || !sim.interacaoAtual) {
    const preparada = prepararInteracaoComRota(sim, opcao, mundo, salaOpcional)
    return {
      ...mundo,
      sims: {
        ...mundo.sims,
        [simId]: {
          ...sim,
          interacaoAtual: preparada.instancia,
          caminho: preparada.caminho,
          destinoColuna: preparada.destino.coluna,
          destinoLinha: preparada.destino.linha,
          postura: {
            ...sim.postura,
            indiceSlot: preparada.indiceSlot,
          },
          filaInteracoes: prioridadeImediata ? fila.slice(0, 3) : fila,
          balao: {
            tipo: 'pensamento',
            icone: opcao.balaoIcone,
            texto: opcao.balaoTexto,
            expiraEmMS: Date.now() + 4500,
          },
        },
      },
    }
  }

  if (fila.length >= 4) return mundo
  fila.push(opcao)

  return {
    ...mundo,
    sims: {
      ...mundo.sims,
      [simId]: {
        ...sim,
        filaInteracoes: fila,
      },
    },
  }
}

export function cancelarInteracaoSim(
  mundo: EstadoMundoSims,
  simId: string,
  indiceFila: number | 'atual',
): EstadoMundoSims {
  const sim = mundo.sims[simId]
  if (!sim) return mundo

  if (indiceFila === 'atual') {
    const [proxima, ...resto] = sim.filaInteracoes
    const proxPrep = proxima ? prepararInteracaoComRota(sim, proxima, mundo) : null
    return {
      ...mundo,
      sims: {
        ...mundo.sims,
        [simId]: {
          ...sim,
          interacaoAtual: proxPrep ? proxPrep.instancia : null,
          filaInteracoes: resto,
          caminho: proxPrep ? proxPrep.caminho : [],
          destinoColuna: proxPrep ? proxPrep.destino.coluna : null,
          destinoLinha: proxPrep ? proxPrep.destino.linha : null,
          postura: {
            ...sim.postura,
            corpo: sim.postura.superficieId ? 'sentado_cadeira' : 'em_pe',
            carregando: 'nada',
          },
        },
      },
    }
  }

  const novaFila = sim.filaInteracoes.filter((_, idx) => idx !== indiceFila)
  return {
    ...mundo,
    sims: {
      ...mundo.sims,
      [simId]: {
        ...sim,
        filaInteracoes: novaFila,
      },
    },
  }
}

function prepararInteracaoComRota(
  sim: EstadoSim,
  opcao: OpcaoPieMenu,
  mundo: EstadoMundoSims,
  sala?: SalaDados,
): {
  instancia: InteracaoAtivaSim
  caminho: PontoRota[]
  destino: PontoRota
  indiceSlot?: number
} {
  const ocupantes = construirOcupantesRota(mundo.sims)
  let destino: PontoRota = opcao.alvoPosicao ?? { coluna: sim.coluna, linha: sim.linha }
  let indiceSlot: number | undefined

  if (sala) {
    if (opcao.alvoMovelId) {
      const movel = sala.moveis.find((m) => m.id === opcao.alvoMovelId)
      if (movel) {
        const resSlot = escolherSlotLivreDoMovel(movel, sim.id, ocupantes)
        destino = { coluna: resSlot.slot.coluna, linha: resSlot.slot.linha }
        indiceSlot = resSlot.indiceSlot
      }
    } else if (opcao.alvoSimId && mundo.sims[opcao.alvoSimId]) {
      const alvoSim = mundo.sims[opcao.alvoSimId]
      destino = calcularPosicaoJigSocial(
        { coluna: sim.coluna, linha: sim.linha },
        { coluna: alvoSim.coluna, linha: alvoSim.linha },
        sala,
        ocupantes,
        sim.id,
      )
    } else if (opcao.alvoPosicao && opcao.acaoEspecial !== 'sair_lote') {
      destino = encontrarPosicaoLivrePerto(
        opcao.alvoPosicao.coluna,
        opcao.alvoPosicao.linha,
        sala,
        ocupantes,
        sim.id,
      )
    }
  }

  const dist = Math.hypot(destino.coluna - sim.coluna, destino.linha - sim.linha)
  const caminho =
    sala && dist > 0.14
      ? calcularCaminhoAEstrela(
          { coluna: sim.coluna, linha: sim.linha },
          destino,
          sala,
          ocupantes,
          sim.id,
          opcao.alvoMovelId ?? null,
        )
      : dist > 0.14
        ? [destino]
        : []

  const opcaoComDestino: OpcaoPieMenu = {
    ...opcao,
    alvoPosicao: destino,
  }

  return {
    instancia: {
      idInstancia: `${opcao.id}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      opcao: opcaoComDestino,
      progresso: 0,
      fase: dist > 0.14 ? 'indo' : 'executando',
    },
    caminho,
    destino,
    indiceSlot,
  }
}

// ---------------------------------------------------------------------------
// PONTE COM RODADA DO BACKEND HUBBIA (`notificarResultadoDaRodada`)
// ---------------------------------------------------------------------------
export function aplicarInteracoesBackendNoMundo(
  mundo: EstadoMundoSims,
  interacoes: InteracaoAgente[],
): EstadoMundoSims {
  const novoMundo = { ...mundo, sims: { ...mundo.sims } }

  for (const inter of interacoes) {
    const simEncontrado = Object.values(novoMundo.sims).find(
      (s) => s.nome.toLowerCase() === inter.agente_nome.toLowerCase(),
    )
    if (!simEncontrado) continue

    const textoCurto =
      (inter.mensagem || inter.motivo || inter.aviso || `${simEncontrado.nome} concluiu ação da rodada`).slice(0, 68)
    const icone = inter.tipo === 'social' ? '💬' : inter.aviso ? '⚠️' : '⚡'

    novoMundo.sims[simEncontrado.id] = {
      ...simEncontrado,
      desempenhoCarreira: Math.min(100, simEncontrado.desempenhoCarreira + 3),
      balao: {
        tipo: inter.tipo === 'social' ? 'fala' : 'pensamento',
        icone,
        texto: textoCurto,
        expiraEmMS: Date.now() + 8500,
      },
    }
  }

  return novoMundo
}

// ---------------------------------------------------------------------------
// PASSO DE SIMULAÇÃO POR TICK DE QUADRO (`time_service.pyc` + `routing`)
// ---------------------------------------------------------------------------
export function avancarSimulacaoSims(
  mundo: EstadoMundoSims,
  sala: SalaDados,
  deltaSegundosReais: number,
  agoraMS = Date.now(),
): EstadoMundoSims {
  if (mundo.velocidade === 0 || deltaSegundosReais <= 0) return mundo

  const multiplicador = mundo.velocidade === 1 ? 1 : mundo.velocidade === 2 ? 2.25 : 4.2
  const dt = Math.min(deltaSegundosReais, 0.25) * multiplicador

  let minutosDoDia = mundo.minutosDoDia + dt * 0.85
  let diaDaSemana = mundo.diaDaSemana
  if (minutosDoDia >= 24 * 60) {
    minutosDoDia -= 24 * 60
    diaDaSemana = (diaDaSemana + 1) % 7
  }

  const pontuacaoAmbienteSala = calcularPontuacaoAmbiente(sala.moveis)
  const novosSims: Record<string, EstadoSim> = {}
  let salaPendenteViagem: string | null = mundo.salaPendenteViagem ?? null

  for (const [id, simOriginal] of Object.entries(mundo.sims)) {
    const sim: EstadoSim = {
      ...simOriginal,
      caminho: [...(simOriginal.caminho ?? [])],
      necessidades: { ...simOriginal.necessidades, ambiente: pontuacaoAmbienteSala },
      taxasNecessidades: {
        energia: -1,
        foco: 0,
        social: -1,
        cafeina: -1,
        ambiente: 0,
        diversao: -1,
      },
      postura: { ...simOriginal.postura },
    }

    if (sim.balao && agoraMS > sim.balao.expiraEmMS) {
      sim.balao = null
    }

    const movelAssento = sala.moveis.find((m) => m.agente === id)
    if (movelAssento) {
      sim.colunaCasa = movelAssento.coluna
      sim.linhaCasa = movelAssento.linha
      sim.movelCasaId = movelAssento.id
    }

    // Decaimento natural das necessidades
    sim.necessidades.energia = limitar0a100(sim.necessidades.energia - dt * 0.32)
    sim.necessidades.cafeina = limitar0a100(sim.necessidades.cafeina - dt * 0.38)
    sim.necessidades.social = limitar0a100(sim.necessidades.social - dt * 0.26)
    sim.necessidades.diversao = limitar0a100(sim.necessidades.diversao - dt * 0.28)
    sim.necessidades.foco = limitar0a100(sim.necessidades.foco - dt * 0.18)

    if (sim.interacaoAtual) {
      const inter = { ...sim.interacaoAtual }
      const op = inter.opcao

      // Se o alvo é outro Sim, recalcula a posição do Social Jig caso ele tenha se movido
      const ocupantesAtuais = construirOcupantesRota({ ...mundo.sims, ...novosSims })
      let alvoPos = op.alvoPosicao
      if (op.alvoSimId && mundo.sims[op.alvoSimId]) {
        const outroAlvo = novosSims[op.alvoSimId] ?? mundo.sims[op.alvoSimId]
        alvoPos = calcularPosicaoJigSocial(
          { coluna: sim.coluna, linha: sim.linha },
          { coluna: outroAlvo.coluna, linha: outroAlvo.linha },
          sala,
          ocupantesAtuais,
          sim.id,
        )
      } else if (op.alvoMovelId) {
        const movelAlvo = sala.moveis.find((m) => m.id === op.alvoMovelId)
        if (movelAlvo) {
          const slotRes = escolherSlotLivreDoMovel(movelAlvo, sim.id, ocupantesAtuais)
          alvoPos = { coluna: slotRes.slot.coluna, linha: slotRes.slot.linha }
          sim.postura.indiceSlot = slotRes.indiceSlot
        }
      }

      if (inter.fase === 'indo' && alvoPos) {
        // Garante que existe caminho A* calculado contornando as mobílias
        if (
          sim.caminho.length === 0 ||
          Math.hypot(
            sim.caminho[sim.caminho.length - 1].coluna - alvoPos.coluna,
            sim.caminho[sim.caminho.length - 1].linha - alvoPos.linha,
          ) > 0.35
        ) {
          sim.caminho = calcularCaminhoAEstrela(
            { coluna: sim.coluna, linha: sim.linha },
            alvoPos,
            sala,
            ocupantesAtuais,
            sim.id,
            op.alvoMovelId ?? null,
          )
        }

        const velocidadeCaminhada =
          sim.humor === 'energizado' ? 2.15 : sim.humor === 'exausto' ? 1.1 : 1.62
        let passoRestante = velocidadeCaminhada * dt

        while (passoRestante > 0.001 && sim.caminho.length > 0) {
          const proxPonto = sim.caminho[0]
          const dx = proxPonto.coluna - sim.coluna
          const dy = proxPonto.linha - sim.linha
          const dist = Math.hypot(dx, dy)

          if (dist <= passoRestante) {
            sim.coluna = proxPonto.coluna
            sim.linha = proxPonto.linha
            passoRestante -= dist
            sim.caminho.shift()
          } else {
            sim.coluna = Number((sim.coluna + (dx / dist) * passoRestante).toFixed(3))
            sim.linha = Number((sim.linha + (dy / dist) * passoRestante).toFixed(3))
            passoRestante = 0
          }
        }

        const distFinal = Math.hypot(alvoPos.coluna - sim.coluna, alvoPos.linha - sim.linha)
        if (distFinal < 0.1 || sim.caminho.length === 0) {
          sim.coluna = alvoPos.coluna
          sim.linha = alvoPos.linha
          sim.destinoColuna = null
          sim.destinoLinha = null
          sim.caminho = []
          inter.fase = 'executando'

          if (op.acaoEspecial === 'sair_lote') {
            sim.foraDoLote = true
          } else if (op.acaoEspecial === 'entrar_lote') {
            sim.foraDoLote = false
          } else if (op.acaoEspecial === 'trocar_sala' && op.salaDestino) {
            salaPendenteViagem = op.salaDestino
          }

          sim.postura = {
            ...sim.postura,
            corpo: op.posturaAlvo,
            carregando: op.carregandoAlvo ?? 'nada',
            superficieId: op.alvoMovelId ?? null,
          }
          sim.balao = {
            tipo: op.categoria === 'social' ? 'fala' : 'pensamento',
            icone: op.balaoIcone,
            texto: op.balaoTexto,
            expiraEmMS: agoraMS + 5500,
          }
        } else {
          sim.destinoColuna = alvoPos.coluna
          sim.destinoLinha = alvoPos.linha
          sim.postura = {
            ...sim.postura,
            corpo: 'andando',
            carregando: op.carregandoAlvo ?? 'nada',
            superficieId: null,
          }
        }
        sim.interacaoAtual = inter
      } else {
        // Executando a interação
        const duracao = Math.max(1, op.duracaoSegundos)
        const fracao = dt / duracao
        inter.progresso = Math.min(1, inter.progresso + fracao)
        sim.postura = {
          ...sim.postura,
          corpo: op.posturaAlvo,
          carregando: op.carregandoAlvo ?? 'nada',
          superficieId: op.alvoMovelId ?? sim.postura.superficieId,
        }

        for (const [chave, totalDelta] of Object.entries(op.efeitos) as [ChaveNecessidade, number][]) {
          if (!totalDelta) continue
          sim.necessidades[chave] = limitar0a100(sim.necessidades[chave] + totalDelta * fracao)
          sim.taxasNecessidades[chave] = totalDelta > 20 ? 3 : totalDelta > 8 ? 2 : totalDelta > 0 ? 1 : -2
        }

        if (op.habilidadeAfetada) {
          sim.habilidades = sim.habilidades.map((h) => {
            if (h.id !== op.habilidadeAfetada) return h
            let novoProg = h.progresso + dt * 3.8
            let novoNivel = h.nivel
            if (novoProg >= 100 && novoNivel < 10) {
              novoProg -= 100
              novoNivel += 1
            }
            return { ...h, nivel: novoNivel, progresso: Math.min(100, Number(novoProg.toFixed(1))) }
          })
        }

        if (op.alvoSimId && op.alvoSimId !== sim.id) {
          sim.relacionamentos = sim.relacionamentos.map((r) =>
            r.alvoId === op.alvoSimId
              ? {
                  ...r,
                  amizade: limitar0a100(r.amizade + dt * 1.5),
                  sinergia: limitar0a100(r.sinergia + dt * 1.2),
                }
              : r,
          )
        }

        if (op.categoria === 'trabalho') {
          sim.desempenhoCarreira = limitar0a100(sim.desempenhoCarreira + dt * 0.45)
        }

        if (inter.progresso >= 1) {
          const [proxima, ...resto] = sim.filaInteracoes
          sim.filaInteracoes = resto
          if (proxima) {
            const prep = prepararInteracaoComRota(sim, proxima, { ...mundo, sims: { ...mundo.sims, ...novosSims } }, sala)
            sim.interacaoAtual = prep.instancia
            sim.caminho = prep.caminho
            sim.destinoColuna = prep.destino.coluna
            sim.destinoLinha = prep.destino.linha
          } else {
            sim.interacaoAtual = null
            sim.postura.carregando = 'nada'
          }
        } else {
          sim.interacaoAtual = inter
        }
      }
    } else if (mundo.autonomiaAtiva) {
      const autonoma = escolherInteracaoAutonoma(sim, { ...mundo, sims: { ...mundo.sims, ...novosSims } }, sala)
      if (autonoma) {
        const prep = prepararInteracaoComRota(sim, autonoma, { ...mundo, sims: { ...mundo.sims, ...novosSims } }, sala)
        sim.interacaoAtual = prep.instancia
        sim.caminho = prep.caminho
        sim.destinoColuna = prep.destino.coluna
        sim.destinoLinha = prep.destino.linha
        sim.postura.indiceSlot = prep.indiceSlot
        sim.balao = {
          tipo: 'pensamento',
          icone: autonoma.balaoIcone,
          texto: autonoma.balaoTexto,
          expiraEmMS: agoraMS + 4200,
        }
      }
    }

    // Verificação contínua de Espaço Pessoal e anti-colisão com móveis quando em pé:
    // Se um Sim em pé acabar muito perto de outro Sim ou de um móvel recém-movido,
    // afasta-se suavemente para manter o espaço pessoal (`jig_visualizer.pyc`)!
    if (sim.postura.corpo === 'em_pe' && !sim.foraDoLote) {
      const ocupantesTemp = construirOcupantesRota({ ...mundo.sims, ...novosSims })
      if (
        pontoColideComAlguemOuMovel(
          sim.coluna,
          sim.linha,
          sala,
          ocupantesTemp,
          sim.id,
          sim.postura.superficieId,
        )
      ) {
        const livre = encontrarPosicaoLivrePerto(sim.coluna, sim.linha, sala, ocupantesTemp, sim.id)
        sim.coluna = Number((sim.coluna + (livre.coluna - sim.coluna) * 0.35).toFixed(3))
        sim.linha = Number((sim.linha + (livre.linha - sim.linha) * 0.35).toFixed(3))
      }
    }

    if (!sim.balao) {
      if (sim.necessidades.energia < 22) {
        sim.balao = {
          tipo: 'pensamento',
          icone: '🪫',
          texto: 'Preciso descansar urgente!',
          expiraEmMS: agoraMS + 4000,
        }
      } else if (sim.necessidades.cafeina < 22) {
        sim.balao = {
          tipo: 'pensamento',
          icone: '☕',
          texto: 'Cadê meu café?!',
          expiraEmMS: agoraMS + 4000,
        }
      }
    }

    const { humor, modificadores } = recalcularHumorEModificadores(sim)
    sim.humor = humor
    sim.modificadores = modificadores
    novosSims[id] = sim
  }

  return {
    ...mundo,
    minutosDoDia,
    diaDaSemana,
    pontuacaoAmbienteSala,
    salaPendenteViagem,
    sims: novosSims,
  }
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function formatarRelogioSim(minutosDoDia: number, diaDaSemana: number): string {
  const total = Math.floor(minutosDoDia) % (24 * 60)
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  const dia = DIAS_SEMANA[diaDaSemana % 7] ?? 'Seg'
  return `${dia} ${h}:${m}`
}

function limitar0a100(v: number): number {
  return Math.max(0, Math.min(100, Number(v.toFixed(1))))
}
