import { describe, expect, it } from 'vitest'
import { AGENTES } from '../agentes'
import { mulberry32 } from '../habblaud/shared/hash'
import { PERSONALIDADES, PERSONALIDADE_PADRAO, horaDeDormir, personalidadeDe, type Personalidade } from '../personalidade'
import { escolherAtividade, type Feito, type Opcao } from '../rotina'
import { SALAS } from '../salas'

const sala: Opcao[] = [
  { id: 'a', rotulo: 'Lendo', fora: false },
  { id: 'b', rotulo: 'Alongando', fora: false },
  { id: 'c', rotulo: 'Bebedouro', fora: false },
]
const copa: Opcao[] = [
  { id: 'cafe', rotulo: 'Tirando um café', fora: true },
  { id: 'sofa', rotulo: 'Sofá da copa', fora: true },
]
const p = (o: Partial<Personalidade> = {}): Personalidade => ({ ...PERSONALIDADE_PADRAO, ...o })

describe('escolherAtividade', () => {
  it('nunca repete o lugar das duas últimas atividades', () => {
    const rnd = mulberry32(1)
    for (let i = 0; i < 500; i++) {
      const recentes: Feito[] = [{ id: 'a', fora: false }, { id: 'b', fora: false }]
      expect(escolherAtividade(p(), sala, recentes, rnd)?.id).toBe('c')
    }
  })

  it('regressão: o agente não vai à copa várias vezes seguidas (no máximo uma saída a cada três atividades)', () => {
    // O que acontecia: cada pausa sorteava "fora" com 40% de chance, sem memória; dava 3 idas à copa em 5 minutos.
    const rnd = mulberry32(7)
    const quemAdoraSair = p({ saiDaSala: 1 })
    const feitos: Feito[] = []
    for (let i = 0; i < 300; i++) {
      const o = escolherAtividade(quemAdoraSair, [...sala, ...copa], feitos, rnd)!
      feitos.push({ id: o.id, fora: o.fora })
    }
    for (let i = 2; i < feitos.length; i++) {
      const janela = feitos.slice(i - 2, i + 1)
      expect(janela.filter((f) => f.fora).length).toBeLessThanOrEqual(1)
    }
  })

  it('favorito sai mais: peso 3 contra peso 1 dá umas três vezes mais', () => {
    const rnd = mulberry32(3)
    const cont: Record<string, number> = {}
    for (let i = 0; i < 6000; i++) {
      const o = escolherAtividade(p({ saiDaSala: 0, favoritos: { Alongando: 3 } }), sala, [], rnd)!
      cont[o.id] = (cont[o.id] ?? 0) + 1
    }
    const razao = cont.b / ((cont.a + cont.c) / 2)
    expect(razao).toBeGreaterThan(2.5)
    expect(razao).toBeLessThan(3.5)
  })

  it('quem não gosta de sair não sai; quem gosta sai quando pode', () => {
    const rnd = mulberry32(5)
    for (let i = 0; i < 300; i++) expect(escolherAtividade(p({ saiDaSala: 0 }), [...sala, ...copa], [], rnd)!.fora).toBe(false)
    expect(escolherAtividade(p({ saiDaSala: 1 }), [...sala, ...copa], [], () => 0)!.fora).toBe(true)
  })

  it('sala com poucas opções aceita repetir, mas nunca a última', () => {
    const duas = sala.slice(0, 2)
    const o = escolherAtividade(p(), duas, [{ id: 'a', fora: false }, { id: 'b', fora: false }], mulberry32(9))
    expect(o?.id).toBe('a')
  })

  it('sem opção nenhuma, não escolhe nada (fica onde está)', () => {
    expect(escolherAtividade(p(), [], [], mulberry32(1))).toBeUndefined()
  })
})

describe('horaDeDormir', () => {
  it('janela que atravessa a meia-noite', () => {
    const dia = p({ sono: [22, 6] })
    expect([21, 22, 23, 0, 3, 5.9, 6, 12].map((h) => horaDeDormir(dia, h))).toEqual([false, true, true, true, true, true, false, false])
  })
  it('noturno: dorme das 2h às 9h', () => {
    const noturno = p({ sono: [2, 9] })
    expect([1, 2, 8, 9, 23].map((h) => horaDeDormir(noturno, h))).toEqual([false, true, true, false, false])
  })
})

describe('personalidades', () => {
  it('todo agente do prédio tem a sua (agente novo sem personalidade cai no padrão sem avisar)', () => {
    for (const a of AGENTES) expect(PERSONALIDADES[a.id], a.id).toBeDefined()
  })

  it('todo favorito existe na sala do agente (rótulo digitado errado seria ignorado em silêncio)', () => {
    for (const [id, pers] of Object.entries(PERSONALIDADES)) {
      const rotulos = new Set((SALAS[id]?.lugares ?? []).map((l) => l.rotulo))
      for (const r of Object.keys(pers.favoritos)) expect(rotulos.has(r), `${id}: "${r}"`).toBe(true)
    }
  })

  it('Norte e Motriz são noturnos: acordados à meia-noite, quando os outros já dormem', () => {
    expect(horaDeDormir(personalidadeDe('norte'), 0)).toBe(false)
    expect(horaDeDormir(personalidadeDe('motriz'), 0)).toBe(false)
    expect(horaDeDormir(personalidadeDe('cifra'), 0)).toBe(true)
  })

  it('agente desconhecido cai no padrão', () => {
    expect(personalidadeDe('nao_existe')).toBe(PERSONALIDADE_PADRAO)
  })
})
