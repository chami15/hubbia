import { AGENTES } from './agentes'
import {
  carregarRegistrosCAS,
  resolverTracosSim,
  type RegistroSimCAS,
} from './cas-sims'
import { categoriaDe, nomeDoMovel } from './catalogo'
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
// MOTOR DO MODO SIMULAÇÃO
//
// Camada de jogo por cima do escritório: necessidades, humor, habilidades,
// relações, fila de ações e autonomia de cada agente. Nada disso vai pro
// backend — o único fio com o servidor é o estado real do agente
// (`estadoBackend`) e o balão que uma rodada de tick provoca.
//
// `avancarSimulacaoSims` é PURA (devolve o mundo seguinte sem tocar no
// anterior) e é chamada TODO QUADRO pelo laço da cena 3D (ver
// Escritorio.tsx). Por isso nada aqui dentro arredonda: com passo de 1
// quadro a queda de uma necessidade é ~0.005, e arredondar pra uma casa
// engolia o decaimento inteiro. Arredondar é assunto de tela.
//
// Rota, colisão e encaixe nos móveis moram em roteamento-sims.ts; a
// aparência e os traços editáveis, em cas-sims.ts.
// ---------------------------------------------------------------------------

// Faixas de uma necessidade — UMA régua só, usada pela cor do diamante,
// pela barra do inspetor e pelo balão de reclamação (antes a barra tinha
// limites próprios e ficava amarela com o diamante ainda verde).
export type NivelNecessidade = 'bom' | 'atencao' | 'baixo' | 'critico'

export const LIMITES_NIVEL = { critico: 20, baixo: 38, atencao: 55 } as const

export function nivelDaNecessidade(valor: number): NivelNecessidade {
  if (valor < LIMITES_NIVEL.critico) return 'critico'
  if (valor < LIMITES_NIVEL.baixo) return 'baixo'
  if (valor < LIMITES_NIVEL.atencao) return 'atencao'
  return 'bom'
}

// Cores do diamante e das barras, da paleta "Console" (index.css): verde
// é o --good, vermelho o --danger; amarelo/laranja são os tons quentes que
// ainda leem bem em cima do fundo escuro e do céu do mundo 3D.
export const COR_NIVEL: Record<NivelNecessidade, { num: number; hex: string }> = {
  bom: { num: 0x4ade80, hex: '#4ade80' },
  atencao: { num: 0xfacc15, hex: '#facc15' },
  baixo: { num: 0xfb923c, hex: '#fb923c' },
  critico: { num: 0xef4444, hex: '#ef4444' },
}

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
    descricao: 'Disposição pro expediente. Volta com café, sofá ou um alongamento.',
  },
  foco: {
    nome: 'Foco',
    icone: '🎯',
    descricao: 'Clareza pra trabalhar. Sobe lendo, planejando ou depois de uma pausa.',
  },
  social: {
    nome: 'Social',
    icone: '💬',
    descricao: 'Contato com os colegas. Sobe conversando ou alinhando projeto.',
  },
  cafeina: {
    nome: 'Café',
    icone: '☕',
    descricao: 'Combustível de escritório. Volta com um expresso ou um lanche.',
  },
  ambiente: {
    nome: 'Ambiente',
    icone: '🌿',
    descricao: 'Vem da sala: plantas, luz e móveis contam ponto. Muda no modo construir.',
  },
  diversao: {
    nome: 'Diversão',
    icone: '✨',
    descricao: 'Leveza no dia. Sobe com música, piada ou um descanso.',
  },
}

// ---------------------------------------------------------------------------
// POSTURA — o que o corpo está fazendo, o que está na mão e onde está apoiado
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
// HUMOR E MODIFICADORES — o resumo das necessidades num estado só, com motivo
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

// Cores da paleta Console (as mesmas tintas do resto do app).
export const INFO_HUMORES: Record<HumorSim, InfoHumor> = {
  inspirado: {
    id: 'inspirado',
    titulo: 'Inspirado',
    corHex: '#5eead4',
    corNum: 0x5eead4,
    icone: '💡',
    descricao: 'Cabeça cheia de ideia — bom momento pra propor coisa nova.',
  },
  focado: {
    id: 'focado',
    titulo: 'Focado',
    corHex: '#a78bfa',
    corNum: 0xa78bfa,
    icone: '🔬',
    descricao: 'Concentrado no trabalho.',
  },
  energizado: {
    id: 'energizado',
    titulo: 'Energizado',
    corHex: '#a3e635',
    corNum: 0xa3e635,
    icone: '⚡',
    descricao: 'Anda mais rápido pela sala.',
  },
  feliz: {
    id: 'feliz',
    titulo: 'Feliz',
    corHex: '#4ade80',
    corNum: 0x4ade80,
    icone: '😊',
    descricao: 'Necessidades em dia, clima bom.',
  },
  confiante: {
    id: 'confiante',
    titulo: 'Confiante',
    corHex: '#dbb15f',
    corNum: 0xdbb15f,
    icone: '😎',
    descricao: 'Bem alinhado com a equipe.',
  },
  tenso: {
    id: 'tenso',
    titulo: 'Tenso',
    corHex: '#fb923c',
    corNum: 0xfb923c,
    icone: '😤',
    descricao: 'Precisa de uma pausa ou de café.',
  },
  exausto: {
    id: 'exausto',
    titulo: 'Exausto',
    corHex: '#ef4444',
    corNum: 0xef4444,
    icone: '😫',
    descricao: 'Sem energia. Anda devagar até descansar.',
  },
  entediado: {
    id: 'entediado',
    titulo: 'Entediado',
    corHex: '#8d8779',
    corNum: 0x8d8779,
    icone: '🙂',
    descricao: 'Faz tempo que não fala com ninguém.',
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
// INTERAÇÕES (menu radial e autonomia) E FILA
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
  // segundos (já com velocidade) até a autonomia reavaliar — ver RESPIRO
  respiroSegundos?: number
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
// DIAMANTE (o indicador sobre a cabeça) — reflete a PIOR necessidade.
// Ambiente fica de fora: é da sala, não do agente.
// ---------------------------------------------------------------------------
export function calcularCorDiamante(necessidades: NecessidadesSim): {
  corNum: number
  corHex: string
  nivel: NivelNecessidade
} {
  const menor = Math.min(
    necessidades.energia,
    necessidades.foco,
    necessidades.social,
    necessidades.cafeina,
    necessidades.diversao,
  )
  const nivel = nivelDaNecessidade(menor)
  return { corNum: COR_NIVEL[nivel].num, corHex: COR_NIVEL[nivel].hex, nivel }
}

// ---------------------------------------------------------------------------
// AMBIENTE — nota da sala a partir da mobília. Cada categoria conta até um
// teto: a 4ª planta já não muda nada, o que incentiva VARIAR a decoração
// em vez de empilhar o mesmo vaso. (Antes cada móvel somava sem limite e a
// sala padrão já nascia com 100.)
// ---------------------------------------------------------------------------
const PONTOS_AMBIENTE: Record<string, { pontos: number; teto: number }> = {
  verde: { pontos: 8, teto: 3 },
  luz: { pontos: 6, teto: 3 },
  assentos: { pontos: 4, teto: 3 },
  chao: { pontos: 5, teto: 2 },
  eletro: { pontos: 4, teto: 2 },
  guardar: { pontos: 3, teto: 2 },
}
const AMBIENTE_BASE = 40

// Quanto UMA peça soma no ambiente (o catálogo mostra isso). 0 = não conta.
export function pontosDeAmbienteDaPeca(peca: string): number {
  if (peca.startsWith('chairDesk')) return 0
  return PONTOS_AMBIENTE[categoriaDe(peca)]?.pontos ?? 0
}

export function calcularPontuacaoAmbiente(moveis: MovelSala[]): number {
  const contagem = new Map<string, number>()
  for (const m of moveis) {
    // cadeira de escritório é "trabalho", não conforto
    if (m.peca.startsWith('chairDesk')) continue
    const cat = categoriaDe(m.peca)
    if (PONTOS_AMBIENTE[cat]) contagem.set(cat, (contagem.get(cat) ?? 0) + 1)
  }
  let pontos = AMBIENTE_BASE
  for (const [cat, n] of contagem) {
    const regra = PONTOS_AMBIENTE[cat]
    pontos += regra.pontos * Math.min(n, regra.teto)
  }
  return Math.min(100, pontos)
}

// ---------------------------------------------------------------------------
// HUMOR — cada condição vira um modificador com peso; vence o que somar mais
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
      titulo: 'Ar fresco',
      icone: '🌳',
      humor: 'inspirado',
      bonus: 3,
      motivo: 'Está lá fora, na calçada.',
    })
  }

  if (n.energia < 25) {
    mods.push({
      id: 'sem-energia',
      titulo: 'Sem bateria',
      icone: '🪫',
      humor: 'exausto',
      bonus: 3,
      motivo: 'Energia muito baixa.',
    })
  } else if (n.energia > 80 && n.cafeina > 75) {
    mods.push({
      id: 'cafeina-alta',
      titulo: 'Cafeinado',
      icone: '⚡',
      humor: 'energizado',
      bonus: 2,
      motivo: 'Energia e café lá em cima.',
    })
  }

  if (n.cafeina < 25) {
    mods.push({
      id: 'fome-cafe',
      titulo: 'Sem café',
      icone: '☕',
      humor: 'tenso',
      bonus: 2,
      motivo: 'Precisa de uma pausa pro café.',
    })
  }

  if (n.foco > 78) {
    mods.push({
      id: 'fluxo-mental',
      titulo: 'Em flow',
      icone: '🔬',
      humor: 'focado',
      bonus: 2,
      motivo: 'Concentração alta.',
    })
  } else if (n.foco < 30 || n.diversao < 28) {
    mods.push({
      id: 'sobrecarga',
      titulo: 'Cabeça cansada',
      icone: '🌀',
      humor: 'tenso',
      bonus: 2,
      motivo: 'Muito trabalho seguido sem pausa.',
    })
  }

  if (n.ambiente >= 75) {
    mods.push({
      id: 'escritorio-decorado',
      titulo: 'Sala inspiradora',
      icone: '🌿',
      humor: 'inspirado',
      bonus: 2,
      motivo: 'A decoração da sala ajuda.',
    })
  }

  if (n.social >= 78) {
    mods.push({
      id: 'sinergia-equipe',
      titulo: 'Equipe afinada',
      icone: '🤝',
      humor: 'confiante',
      bonus: 2,
      motivo: 'Conversou bastante com os colegas.',
    })
  } else if (n.social < 28) {
    mods.push({
      id: 'isolado',
      titulo: 'Isolado',
      icone: '😶',
      humor: 'entediado',
      bonus: 1,
      motivo: 'Faz tempo que não fala com ninguém.',
    })
  }

  if (sim.estadoBackend === 'executando' || sim.estadoBackend === 'pensando') {
    mods.push({
      id: 'ia-ativa',
      titulo: 'Processando',
      icone: '🧠',
      humor: 'focado',
      bonus: 3,
      motivo: 'O agente está rodando no servidor.',
    })
  } else if (sim.estadoBackend === 'falando') {
    mods.push({
      id: 'ia-falando',
      titulo: 'Em conversa',
      icone: '💬',
      humor: 'confiante',
      bonus: 3,
      motivo: 'O agente está conversando agora.',
    })
  }

  if (mods.length === 0) {
    mods.push({
      id: 'equilibrado',
      titulo: 'Dia equilibrado',
      icone: '😊',
      humor: 'feliz',
      bonus: 1,
      motivo: 'Necessidades em dia.',
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
// Ponto da calçada em frente ao lote, pra onde "sair" leva. A calçada fica
// na frente do meio do lote, uma faixa depois da última linha (moveis3d.ts).
export function pontoNaRua(dim: DimensoesLote = DIMENSOES_PADRAO): { coluna: number; linha: number } {
  return { coluna: (dim.colunas - 1) / 2, linha: dim.linhas + 0.9 }
}

export interface DimensoesLote {
  colunas: number
  linhas: number
}
const DIMENSOES_PADRAO: DimensoesLote = { colunas: 7, linhas: 7 }

export function obterInteracoesDoMovel(
  movel: MovelSala,
  todosMoveis: MovelSala[],
  simAtivo: EstadoSim,
  dim: DimensoesLote = DIMENSOES_PADRAO,
): OpcaoPieMenu[] {
  const opcoes: OpcaoPieMenu[] = []
  const cat = categoriaDe(movel.peca)
  const rotulo = nomeDoMovel(movel.peca)

  // Porta / Portal: caminhar até a porta, abri-la e viajar ou passear na rua!
  if (movel.leva || movel.peca.startsWith('doorway')) {
    if (movel.leva) {
      opcoes.push({
        id: `porta-ir-${movel.id}`,
        titulo: `Ir para ${movel.leva}`,
        icone: '🚪',
        categoria: 'navegacao',
        corDestaque: '#4ade80',
        duracaoSegundos: 1.5,
        posturaAlvo: 'em_pe',
        efeitos: {},
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🚪',
        balaoTexto: `Indo para ${movel.leva}`,
        acaoEspecial: 'trocar_sala',
        salaDestino: movel.leva,
      })
    }

    opcoes.push(
      {
        id: `porta-sair-rua-${movel.id}`,
        titulo: 'Sair pra um compromisso',
        icone: '🚕',
        categoria: 'navegacao',
        corDestaque: '#38bdf8',
        duracaoSegundos: 9,
        posturaAlvo: 'interagindo_em_pe',
        carregandoAlvo: 'tablet',
        efeitos: { social: 28, foco: 22, diversao: 18 },
        alvoPosicao: pontoNaRua(dim),
        balaoIcone: '🚕',
        balaoTexto: 'Já volto',
        acaoEspecial: 'sair_lote',
      },
      {
        id: `porta-entrar-lote-${movel.id}`,
        titulo: 'Voltar pro escritório',
        icone: '🏢',
        categoria: 'navegacao',
        duracaoSegundos: 2,
        posturaAlvo: 'em_pe',
        efeitos: { ambiente: 12 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🏢',
        balaoTexto: 'De volta',
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
        balaoTexto: `Mexendo em ${simAtivo.funcao}`,
      },
      {
        id: `otimizar-ia-${movel.id}`,
        titulo: 'Planejar a semana',
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
        balaoTexto: 'Revisando prioridades',
      },
      {
        id: `navegar-diversao-${movel.id}`,
        titulo: 'Dar uma pausa na tela',
        icone: '🕹️',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 7,
        posturaAlvo: 'sentado_cadeira',
        efeitos: { diversao: 28, foco: 5, energia: -2 },
        alvoMovelId: alvoAssento.id,
        alvoPosicao: { coluna: alvoAssento.coluna, linha: alvoAssento.linha },
        balaoIcone: '😄',
        balaoTexto: 'Só um vídeo rápido…',
      },
    )
  }

  // Café sai da cafeteira; lanche, da geladeira/micro-ondas/torradeira.
  // Armário de cozinha não oferece nada: a cafeteira costuma ficar EM CIMA
  // dele, e os dois oferecendo expresso mandavam dois agentes pro mesmo
  // ponto.
  if (movel.peca.includes('Coffee')) {
    opcoes.push({
        id: `cafe-expresso-${movel.id}`,
        titulo: 'Fazer um expresso',
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
        balaoTexto: 'Expresso saindo',
    })
  }
  if (/Fridge|Microwave|toaster/.test(movel.peca)) {
    opcoes.push({
        id: `lanche-rapido-${movel.id}`,
        titulo: 'Fazer um lanche',
        icone: '🥪',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 8,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { cafeina: 40, energia: 16, social: 6 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🥗',
        balaoTexto: 'Recarregando',
    })
  }

  // Sofás, poltronas e cadeiras de descanso/reunião
  if ((cat === 'assentos' && !movel.peca.startsWith('chairDesk')) || cat === 'quarto') {
    opcoes.push(
      {
        id: `descansar-sofa-${movel.id}`,
        titulo: 'Descansar',
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
        balaoTexto: 'Pausa merecida',
      },
      {
        id: `cochilo-sofa-${movel.id}`,
        titulo: 'Tirar um cochilo',
        icone: '💤',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 13,
        posturaAlvo: 'sentado_sofa',
        efeitos: { energia: 52, foco: 14 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '💤',
        balaoTexto: 'Zzz…',
      },
    )
  }

  // Estantes e livros
  if (cat === 'guardar' || movel.peca.startsWith('book')) {
    opcoes.push({
      id: `ler-livro-${movel.id}`,
      titulo: 'Ler sobre a área',
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
      balaoTexto: 'Estudando',
    })
  }

  // Plantas e decoração
  if (cat === 'verde') {
    opcoes.push(
      {
        id: `admirar-planta-${movel.id}`,
        titulo: 'Respirar perto da planta',
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
        balaoTexto: 'Que paz',
      },
      {
        id: `cuidar-planta-${movel.id}`,
        titulo: 'Regar a planta',
        icone: '💧',
        categoria: 'ambiente',
        autonoma: true,
        duracaoSegundos: 7,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { diversao: 20, ambiente: 10, foco: 12 },
        alvoMovelId: movel.id,
        alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
        balaoIcone: '🌱',
        balaoTexto: 'Cuidando do verde',
      },
    )
  }

  // Eletrônicos (TV, rádio, caixa de som)
  if (cat === 'eletro') {
    opcoes.push({
      id: `curtir-som-${movel.id}`,
      titulo: 'Colocar uma música',
      icone: '🎵',
      categoria: 'necessidades',
      autonoma: true,
      duracaoSegundos: 8,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { diversao: 35, social: 10, energia: 6 },
      alvoMovelId: movel.id,
      alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
      balaoIcone: '🎵',
      balaoTexto: 'Essa é boa',
    })
  }

  // Mesas de reunião / centro
  if (cat === 'mesas') {
    opcoes.push({
      id: `reuniao-mesa-${movel.id}`,
      titulo: 'Revisar a pauta',
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
      balaoTexto: 'Organizando a pauta',
    })
  }

  // Opção universal em qualquer móvel: Examinar
  opcoes.push({
    id: `examinar-${movel.id}`,
    titulo: `Ver ${rotulo}`,
    icone: '🔍',
    categoria: 'ambiente',
    duracaoSegundos: 4,
    posturaAlvo: 'em_pe',
    efeitos: { diversao: 8, foco: 6 },
    alvoMovelId: movel.id,
    alvoPosicao: { coluna: movel.coluna, linha: movel.linha },
    balaoIcone: '✨',
    balaoTexto: `Olhando ${rotulo}`,
  })

  return opcoes
}

export function obterInteracoesDoSim(
  alvoSim: EstadoSim,
  simAtivo: EstadoSim,
  dim: DimensoesLote = DIMENSOES_PADRAO,
): OpcaoPieMenu[] {
  const mesmoSim = alvoSim.id === simAtivo.id

  if (mesmoSim) {
    return [
      {
        id: `abrir-painel-${alvoSim.id}`,
        titulo: 'Abrir painel',
        icone: '🗂️',
        categoria: 'hubbia',
        corDestaque: '#4ade80',
        duracaoSegundos: 1,
        posturaAlvo: simAtivo.postura.corpo,
        efeitos: {},
        balaoIcone: '🗂️',
        balaoTexto: alvoSim.nome,
        acaoEspecial: 'abrir_painel_hubbia',
        alvoSimId: alvoSim.id,
      },
      {
        id: `pausa-cafe-proprio-${alvoSim.id}`,
        titulo: 'Tomar um café',
        icone: '☕',
        categoria: 'necessidades',
        corDestaque: '#84cc16',
        autonoma: true,
        duracaoSegundos: 6,
        posturaAlvo: 'interagindo_em_pe',
        carregandoAlvo: 'xicara_cafe',
        efeitos: { cafeina: 42, energia: 28, diversao: 10 },
        balaoIcone: '☕',
        balaoTexto: 'Pausa pro café',
      },
      {
        id: `alongar-proprio-${alvoSim.id}`,
        titulo: 'Alongar',
        icone: '🧘',
        categoria: 'necessidades',
        autonoma: true,
        duracaoSegundos: 5,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { energia: 26, diversao: 16, foco: 12 },
        balaoIcone: '🧘',
        balaoTexto: 'Esticando as costas',
      },
      {
        id: `passear-rua-${alvoSim.id}`,
        titulo: 'Tomar um ar lá fora',
        icone: '🌳',
        categoria: 'navegacao',
        corDestaque: '#38bdf8',
        duracaoSegundos: 8,
        posturaAlvo: 'interagindo_em_pe',
        efeitos: { diversao: 28, energia: 18, ambiente: 20 },
        alvoPosicao: pontoNaRua(dim),
        balaoIcone: '🌳',
        balaoTexto: 'Vou tomar um ar',
        acaoEspecial: 'sair_lote',
      },
      ...(simAtivo.foraDoLote
        ? [
            {
              id: `voltar-escritorio-${alvoSim.id}`,
              titulo: 'Voltar pro escritório',
              icone: '🏢',
              categoria: 'navegacao' as const,
              corDestaque: '#4ade80',
              duracaoSegundos: 2,
              posturaAlvo: 'em_pe' as const,
              efeitos: { foco: 12 },
              alvoPosicao: { coluna: simAtivo.colunaCasa, linha: simAtivo.linhaCasa },
              balaoIcone: '🏢',
              balaoTexto: 'Voltando',
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
      balaoTexto: alvoSim.nome,
      acaoEspecial: 'selecionar_sim',
    },
    {
      id: `abrir-painel-${alvoSim.id}`,
      titulo: `Abrir painel de ${alvoSim.nome}`,
      icone: '🗂️',
      categoria: 'hubbia',
      corDestaque: '#38bdf8',
      duracaoSegundos: 1,
      posturaAlvo: simAtivo.postura.corpo,
      efeitos: {},
      alvoSimId: alvoSim.id,
      balaoIcone: '🗂️',
      balaoTexto: alvoSim.nome,
      acaoEspecial: 'abrir_painel_hubbia',
    },
    {
      id: `social-papo-${alvoSim.id}`,
      titulo: `Conversar com ${alvoSim.nome}`,
      icone: '💬',
      categoria: 'social',
      autonoma: true,
      duracaoSegundos: 7,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 32, diversao: 18 },
      habilidadeAfetada: 'carisma',
      alvoSimId: alvoSim.id,
      balaoIcone: '💬',
      balaoTexto: `Papo com ${alvoSim.nome}`,
    },
    {
      id: `social-projeto-${alvoSim.id}`,
      titulo: `Alinhar projeto com ${alvoSim.nome}`,
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
      balaoTexto: `Alinhando com ${alvoSim.nome}`,
    },
    {
      id: `social-piada-${alvoSim.id}`,
      titulo: 'Contar uma piada',
      icone: '😄',
      categoria: 'social',
      autonoma: true,
      duracaoSegundos: 6,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 24, diversao: 32, energia: 6 },
      habilidadeAfetada: 'carisma',
      alvoSimId: alvoSim.id,
      balaoIcone: '😂',
      balaoTexto: `Rindo com ${alvoSim.nome}`,
    },
    {
      id: `social-cafe-${alvoSim.id}`,
      titulo: `Tomar café com ${alvoSim.nome}`,
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
      balaoTexto: `Café com ${alvoSim.nome}`,
    },
  ]
}

export function obterInteracoesDoChao(
  coluna: number,
  linha: number,
  linhasSala = 7,
  colunasSala = 7,
): OpcaoPieMenu[] {
  const c = Number(coluna.toFixed(2))
  const l = Number(linha.toFixed(2))
  const clicouForaDoLote = l > linhasSala - 0.5

  const opcoes: OpcaoPieMenu[] = [
    {
      id: `ir-aqui-${c}-${l}`,
      titulo: clicouForaDoLote ? 'Passear até ali' : 'Ir até aqui',
      icone: clicouForaDoLote ? '🌳' : '👣',
      categoria: 'navegacao',
      corDestaque: '#6ec71f',
      duracaoSegundos: 1,
      posturaAlvo: 'em_pe',
      efeitos: clicouForaDoLote ? { diversao: 12, ambiente: 10 } : {},
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: clicouForaDoLote ? '🌳' : '👣',
      balaoTexto: clicouForaDoLote ? 'Dando uma volta' : 'Indo',
      acaoEspecial: clicouForaDoLote ? 'sair_lote' : 'entrar_lote',
    },
    {
      id: `alongar-chao-${c}-${l}`,
      titulo: 'Alongar aqui',
      icone: '🧘',
      categoria: 'necessidades',
      duracaoSegundos: 5,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { energia: 25, diversao: 18, foco: 10 },
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: '🧘',
      balaoTexto: 'Esticando as costas',
    },
    {
      id: `chamar-todos-${c}-${l}`,
      titulo: 'Reunir a equipe aqui',
      icone: '📣',
      categoria: 'social',
      corDestaque: '#38bdf8',
      duracaoSegundos: 4,
      posturaAlvo: 'interagindo_em_pe',
      efeitos: { social: 25, foco: 15 },
      alvoPosicao: { coluna: c, linha: l },
      balaoIcone: '📣',
      balaoTexto: 'Reunião rápida',
      acaoEspecial: 'chamar_todos',
    },
    {
      id: `sair-compromisso-${c}-${l}`,
      titulo: 'Sair pra um compromisso',
      icone: '🚕',
      categoria: 'navegacao',
      corDestaque: '#38bdf8',
      duracaoSegundos: 9,
      posturaAlvo: 'interagindo_em_pe',
      carregandoAlvo: 'tablet',
      efeitos: { social: 28, foco: 20, diversao: 15 },
      alvoPosicao: pontoNaRua({ colunas: colunasSala, linhas: linhasSala }),
      balaoIcone: '🚕',
      balaoTexto: 'Já volto',
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

  // 1. Os 4 agentes (com a aparência/traços salvos no criador, se houver)
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
        nome: 'Você',
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
      // primeira decisão escalonada — senão os quatro levantariam juntos
      respiroSegundos: 0.5 + idx * 0.7,
    }

    const { humor, modificadores } = recalcularHumorEModificadores(sim)
    sim.humor = humor
    sim.modificadores = modificadores
    sims[agente.id] = sim
  })

  // 2. Personagens extras criados no criador de personagem
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

// Integra ou atualiza um personagem criado/editado no criador dentro do mundo.
// Recém-criado (`chegarPelaRua = true`) nasce na calçada e caminha pra dentro.
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
      texto: `Oi, pessoal! Sou ${registro.nome}`,
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
        nome: 'Você',
        amizade: 80,
        sinergia: 85,
        rotulo: 'Chefe',
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
        titulo: 'Chegar no escritório',
        icone: '🏢',
        categoria: 'navegacao',
        corDestaque: '#4ade80',
        duracaoSegundos: 2,
        posturaAlvo: 'em_pe',
        efeitos: { social: 10 },
        alvoPosicao: posCasa,
        balaoIcone: '👋',
        balaoTexto: 'Prazer, pessoal',
        acaoEspecial: 'entrar_lote',
      },
      true,
      sala,
    )
  }

  return novoMundo
}

// ---------------------------------------------------------------------------
// AUTONOMIA — agente livre escolhe sozinho, da mesma lista do menu radial
// ---------------------------------------------------------------------------
// Se a menor necessidade está acima disso e o agente tem cadeira, ele volta
// pra mesa trabalhar em vez de "resolver" uma necessidade cheia.
const CONFORTAVEL = 62

export function escolherInteracaoAutonoma(
  sim: EstadoSim,
  mundo: EstadoMundoSims,
  sala: SalaDados,
  sorte: () => number = Math.random,
): OpcaoPieMenu | null {
  // Se o Sim estava fora do lote e terminou o compromisso externo, volta para dentro!
  if (sim.foraDoLote) {
    return {
      id: `auto-voltar-lote-${sim.id}`,
      titulo: 'Voltar pro escritório',
      icone: '🏢',
      categoria: 'navegacao',
      autonoma: true,
      duracaoSegundos: 2,
      posturaAlvo: 'em_pe',
      efeitos: {},
      alvoPosicao: { coluna: sim.colunaCasa, linha: sim.linhaCasa },
      balaoIcone: '🏢',
      balaoTexto: 'Voltando',
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

  const movelCasa = sim.movelCasaId ? sala.moveis.find((m) => m.id === sim.movelCasaId) : undefined
  const trabalhar = movelCasa
    ? obterInteracoesDoMovel(movelCasa, sala.moveis, sim, sala).find((o) => o.id.startsWith('trabalhar-'))
    : undefined

  if (maisBaixa.valor > CONFORTAVEL && trabalhar) return trabalhar
  // nada livre que resolva (a única cafeteira ocupada, por exemplo): volta
  // pra mesa em vez de ficar parado esperando
  return escolherInteracaoParaNecessidade(sim, maisBaixa.chave, mundo, sala, sorte) ?? trabalhar ?? null
}

export function escolherInteracaoParaNecessidade(
  sim: EstadoSim,
  necessidade: ChaveNecessidade,
  mundo: EstadoMundoSims,
  sala: SalaDados,
  sorte: () => number = Math.random,
): OpcaoPieMenu | null {
  const candidatas: OpcaoPieMenu[] = []

  for (const m of sala.moveis) {
    for (const op of obterInteracoesDoMovel(m, sala.moveis, sim, sala)) {
      if (op.autonoma) candidatas.push(op)
    }
  }

  for (const outro of Object.values(mundo.sims)) {
    // colega lá fora não está disponível pra conversa
    if (outro.id !== sim.id && outro.foraDoLote) continue
    for (const op of obterInteracoesDoSim(outro, sim, sala)) {
      if (op.autonoma) candidatas.push(op)
    }
  }

  const ocupantes = construirOcupantesRota(mundo.sims)
  let melhor: OpcaoPieMenu | null = null
  let maiorNota = -Infinity

  for (const op of candidatas) {
    const ganhoAlvo = op.efeitos[necessidade] ?? 0
    if (ganhoAlvo <= 0) continue

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

    // perto ganha de longe; a própria mesa ganha bônus; e um pouco de
    // sorte pra ninguém repetir o mesmo gesto sempre
    const alvo = op.alvoPosicao ?? (op.alvoSimId ? mundo.sims[op.alvoSimId] : undefined)
    const distancia = alvo ? Math.hypot(alvo.coluna - sim.coluna, alvo.linha - sim.linha) : 0
    let nota = ganhoAlvo * 2.5 - distancia * 3
    if (op.alvoMovelId && op.alvoMovelId === sim.movelCasaId) {
      nota += 18
    }
    nota += sorte() * 8

    if (nota > maiorNota) {
      maiorNota = nota
      melhor = op
    }
  }

  return melhor
}

// ---------------------------------------------------------------------------
// FILA DE INTERAÇÕES + ROTA A* E RESERVA DE ENCAIXE NO MÓVEL
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
// PONTE COM A RODADA DO BACKEND — quem falou/trabalhou ganha um balão
// ---------------------------------------------------------------------------
export function aplicarInteracoesBackendNoMundo(
  mundo: EstadoMundoSims,
  interacoes: InteracaoAgente[],
): EstadoMundoSims {
  const novoMundo = { ...mundo, sims: { ...mundo.sims } }

  for (const inter of interacoes) {
    // O backend identifica o agente pelo NOME original (AGENTES); o nome
    // exibido pode ter sido trocado no criador, então ele é só o plano B.
    const nomeBackend = inter.agente_nome.toLowerCase()
    const idOriginal = AGENTES.find((a) => a.nome.toLowerCase() === nomeBackend)?.id
    const simEncontrado =
      (idOriginal && novoMundo.sims[idOriginal]) ||
      Object.values(novoMundo.sims).find((s) => s.nome.toLowerCase() === nomeBackend)
    if (!simEncontrado) continue

    // o balão quebra em linhas e corta sozinho — aqui vai o texto inteiro
    const textoCurto = inter.mensagem || inter.motivo || inter.aviso || 'Terminei uma tarefa'
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
// O QUADRO — chamado todo frame pelo laço da cena 3D
// ---------------------------------------------------------------------------

// 1 segundo real em velocidade 1 = 1 minuto no relógio do escritório; as
// velocidades 2 e 3 multiplicam por 2 e 3 (o que o botão diz).
const MINUTOS_POR_SEGUNDO = 1
// Teto do passo: aba em segundo plano volta com um dt enorme, e sem isso
// todo mundo "teletransportaria" até o destino num quadro só.
const DT_MAXIMO = 0.1
// Queda por segundo, em velocidade 1. Café cai mais rápido que foco: é o
// que faz a ida à cafeteira ser o ritmo natural do dia.
const DECAIMENTO = { energia: 0.3, cafeina: 0.36, social: 0.24, diversao: 0.26, foco: 0.16 } as const
// Pontos de habilidade por segundo de prática: ~3 min por nível em
// velocidade 1. Antes era 3.8/s e o nível 8 virava 10 em menos de 1 min.
const GANHO_HABILIDADE = 0.55
// Relação por segundo de interação social — pros DOIS lados.
const GANHO_AMIZADE = 1.2
const GANHO_SINERGIA = 1
const GANHO_DESEMPENHO = 0.4
// Segundos parado entre uma ação e outra. Sem isso o agente emendava uma
// na outra no mesmo quadro (parece robô), e a autonomia — que testa todos
// os móveis e calcula encaixe — rodava 60x por segundo quando nada servia.
const RESPIRO = { min: 1.2, max: 3.5 }

export function avancarSimulacaoSims(
  mundo: EstadoMundoSims,
  sala: SalaDados,
  deltaSegundosReais: number,
  agoraMS = Date.now(),
  sorte: () => number = Math.random,
): EstadoMundoSims {
  if (mundo.velocidade === 0 || deltaSegundosReais <= 0) return mundo

  const dt = Math.min(deltaSegundosReais, DT_MAXIMO) * mundo.velocidade

  let minutosDoDia = mundo.minutosDoDia + dt * MINUTOS_POR_SEGUNDO
  let diaDaSemana = mundo.diaDaSemana
  if (minutosDoDia >= 24 * 60) {
    minutosDoDia -= 24 * 60
    diaDaSemana = (diaDaSemana + 1) % 7
  }

  const pontuacaoAmbienteSala = calcularPontuacaoAmbiente(sala.moveis)
  const novosSims: Record<string, EstadoSim> = {}
  let salaPendenteViagem: string | null = mundo.salaPendenteViagem ?? null
  // ganho de relação do LADO DE LÁ (quem recebeu o papo), aplicado depois
  // do laço — mexer no outro agente no meio dele leria meio mundo velho,
  // meio novo
  const relacaoRecebida: { de: string; para: string }[] = []

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

    for (const chave of Object.keys(DECAIMENTO) as (keyof typeof DECAIMENTO)[]) {
      sim.necessidades[chave] = limitar0a100(sim.necessidades[chave] - dt * DECAIMENTO[chave])
    }

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
            sim.coluna += (dx / dist) * passoRestante
            sim.linha += (dy / dist) * passoRestante
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
          sim.habilidades = sim.habilidades.map((h) => (h.id === op.habilidadeAfetada ? praticar(h, dt) : h))
        }

        if (op.alvoSimId && op.alvoSimId !== sim.id) {
          sim.relacionamentos = sim.relacionamentos.map((r) => (r.alvoId === op.alvoSimId ? aproximar(r, dt) : r))
          relacaoRecebida.push({ de: sim.id, para: op.alvoSimId })
        }

        if (op.categoria === 'trabalho') {
          sim.desempenhoCarreira = limitar0a100(sim.desempenhoCarreira + dt * GANHO_DESEMPENHO)
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
            sim.respiroSegundos = RESPIRO.min + sorte() * (RESPIRO.max - RESPIRO.min)
            // sentado continua sentado; em pé larga o que tinha na mão
            sim.postura = {
              ...sim.postura,
              corpo: sim.postura.corpo === 'interagindo_em_pe' ? 'em_pe' : sim.postura.corpo,
              carregando: 'nada',
            }
          }
        } else {
          sim.interacaoAtual = inter
        }
      }
    } else if (mundo.autonomiaAtiva && (sim.respiroSegundos = Math.max(0, (sim.respiroSegundos ?? 0) - dt)) === 0) {
      const autonoma = escolherInteracaoAutonoma(sim, { ...mundo, sims: { ...mundo.sims, ...novosSims } }, sala, sorte)
      if (!autonoma) sim.respiroSegundos = RESPIRO.max
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
    // afasta-se suavemente para manter o espaço pessoal.
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
        // passo proporcional ao tempo (era 35% POR CHAMADA — com o motor
        // rodando todo quadro, viraria um tranco)
        const k = 1 - Math.exp(-6 * dt)
        sim.coluna += (livre.coluna - sim.coluna) * k
        sim.linha += (livre.linha - sim.linha) * k
      }
    }

    if (!sim.balao) {
      if (nivelDaNecessidade(sim.necessidades.energia) === 'critico') {
        sim.balao = {
          tipo: 'pensamento',
          icone: '🪫',
          texto: 'Preciso descansar',
          expiraEmMS: agoraMS + 4000,
        }
      } else if (nivelDaNecessidade(sim.necessidades.cafeina) === 'critico') {
        sim.balao = {
          tipo: 'pensamento',
          icone: '☕',
          texto: 'Cadê o café?',
          expiraEmMS: agoraMS + 4000,
        }
      }
    }

    const { humor, modificadores } = recalcularHumorEModificadores(sim)
    sim.humor = humor
    sim.modificadores = modificadores
    novosSims[id] = sim
  }

  for (const { de, para } of relacaoRecebida) {
    const alvo = novosSims[para]
    if (alvo) alvo.relacionamentos = alvo.relacionamentos.map((r) => (r.alvoId === de ? aproximar(r, dt) : r))
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

function praticar(h: HabilidadeSim, dt: number): HabilidadeSim {
  if (h.nivel >= 10) return { ...h, progresso: 100 }
  let progresso = h.progresso + dt * GANHO_HABILIDADE
  let nivel = h.nivel
  if (progresso >= 100) {
    progresso -= 100
    nivel += 1
  }
  return { ...h, nivel, progresso: nivel >= 10 ? 100 : progresso }
}

function aproximar(r: RelacionamentoSim, dt: number): RelacionamentoSim {
  return {
    ...r,
    amizade: limitar0a100(r.amizade + dt * GANHO_AMIZADE),
    sinergia: limitar0a100(r.sinergia + dt * GANHO_SINERGIA),
  }
}

// Sem arredondar (ver o cabeçalho do arquivo).
function limitar0a100(v: number): number {
  return Math.max(0, Math.min(100, v))
}
