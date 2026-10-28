// Encontros (Fase E): quando chega uma mensagem SOCIAL real entre dois agentes, o remetente vai até o outro e um balão
// em pixel art mostra o que ele disse. É dado real (a mensagem que o tick gerou), não enfeite: nada de balão inventado.
// Aqui fica só a parte pura (testável): texto para a fonte pixel, quebra em linhas, quem visita quem, onde o balão cabe.
import type { Mensagem } from '../../types/mensagens'
import type { AgenteId } from './agentes'

/** O que a fonte 3x5 (habblaud/art/pixelfont.ts) desenha. Fora disso o caractere vira espaço em branco. */
const NA_FONTE = /[a-z0-9 _\-#.()/:,><+áàâãéêíóôõúç]/

/** Deixa o texto desenhável: minúsculas, "?"/"!" viram ".", acento que a fonte não tem cai para a letra base. */
export function limparParaFonte(texto: string): string {
  const saida: string[] = []
  for (const bruto of texto.toLowerCase().replace(/[!?]+/g, '.').replace(/;/g, ',').replace(/\s+/g, ' ')) {
    if (NA_FONTE.test(bruto)) saida.push(bruto)
    else {
      const base = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (base.length === 1 && NA_FONTE.test(base)) saida.push(base)
    }
  }
  return saida.join('').replace(/ +/g, ' ').trim()
}

/** Quebra em até `maxLinhas` linhas de até `porLinha` caracteres; o que sobrar vira "...". */
export function textoParaBalao(texto: string, porLinha = 24, maxLinhas = 3): string[] {
  const palavras = limparParaFonte(texto).split(' ').filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (let p of palavras) {
    while (p.length > porLinha) {
      // palavra maior que a linha: corta no meio
      if (atual) linhas.push(atual)
      linhas.push(p.slice(0, porLinha))
      p = p.slice(porLinha)
      atual = ''
    }
    const tentativa = atual ? `${atual} ${p}` : p
    if (tentativa.length <= porLinha) atual = tentativa
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  if (linhas.length <= maxLinhas) return linhas
  const cortadas = linhas.slice(0, maxLinhas)
  const ultima = cortadas[maxLinhas - 1]
  cortadas[maxLinhas - 1] = (ultima.length > porLinha - 3 ? ultima.slice(0, porLinha - 3).trimEnd() : ultima) + '...'
  return cortadas
}

export type Encontro = { tipo: 'visita'; de: AgenteId; para: AgenteId; linhas: string[] } | { tipo: 'fala'; de: AgenteId; linhas: string[] }

/**
 * O que fazer com mensagens que acabaram de chegar. Só SOCIAL entre dois agentes presentes (com o chefe não: ele não está
 * no prédio, e mensagem para ele já acende o alerta). Resposta para quem está visitando você vira só um balão, sem andar.
 * Um agente faz uma visita por vez: a segunda mensagem dele no mesmo lote é ignorada.
 */
export function planejarEncontros(
  novas: readonly Mensagem[],
  ctx: { localDe: (idBackend: number) => AgenteId | undefined; presentes: ReadonlySet<AgenteId>; visitando: ReadonlyMap<AgenteId, AgenteId> },
): Encontro[] {
  const visitando = new Map(ctx.visitando)
  const planejados: Encontro[] = []
  for (const m of [...novas].sort((a, b) => a.id - b.id)) {
    if (m.tipo !== 'social' || m.destinatario_id === null) continue
    const de = ctx.localDe(m.remetente_id)
    const para = ctx.localDe(m.destinatario_id)
    if (!de || !para || de === para || !ctx.presentes.has(de) || !ctx.presentes.has(para)) continue
    const linhas = textoParaBalao(m.conteudo)
    if (!linhas.length) continue
    if (visitando.get(para) === de) planejados.push({ tipo: 'fala', de, linhas })
    else if (!visitando.has(de)) {
      planejados.push({ tipo: 'visita', de, para, linhas })
      visitando.set(de, para)
    }
  }
  return planejados
}

/** Altura de uma linha do balão: 5 px da letra + 3 acima (acentos) + 1 de folga; a cedilha cabe na folga de baixo. */
export const ALTURA_LINHA = 9
const PAD = 3

/** Onde desenhar o balão (px do canvas 1x): acima da cabeça, centrado, sem sair do prédio; a cauda aponta para quem fala. */
export function layoutBalao(linhas: readonly string[], x: number, topo: number, larguraPredio: number) {
  const w = Math.max(...linhas.map((l) => Math.max(0, l.length * 4 - 1))) + PAD * 2
  const h = linhas.length * ALTURA_LINHA + PAD * 2 - 1
  const x0 = Math.round(Math.min(Math.max(x - w / 2, 2), larguraPredio - w - 2))
  const y0 = Math.round(topo - 5 - h)
  const caudaX = Math.round(Math.min(Math.max(x, x0 + 4), x0 + w - 5))
  return { x0, y0, w, h, caudaX }
}
