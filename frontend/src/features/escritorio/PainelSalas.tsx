import { useMemo, useState } from 'react'
import {
  definirSalaAtual,
  excluirSalaNaFonte,
  existeSala,
  gravarNaFonte,
  idSalaAtual,
  idsDasSalas,
  podeGravarNaFonte,
  recarregarDeProposito,
  todasAsSalasDaFonte,
} from './persistencia'
import { gerarPaletaDeCor } from './sala'
import type { SalaDados } from './sala-dados'

// Criar e excluir sala. Só existe fora do modo de edição — trocar o
// conjunto de salas embaixo de uma edição em andamento (a dela ou de
// outra) é pedir por confusão, e a navegação entre salas (passo 5)
// também vai seguir essa mesma regra.
//
// Só aparece em dev (podeGravarNaFonte): sem servidor, não tem onde
// escrever nem apagar arquivo.

const MONO = 'var(--fonte-display), ui-monospace, SFMono-Regular, Menlo, monospace'

const CARTAO: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  top: 64,
  zIndex: 65,
  width: 240,
  fontFamily: MONO,
  fontSize: 12,
  color: '#e6e1d6',
  background: 'rgba(20, 22, 27, 0.93)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  userSelect: 'none',
}

const ROTULO: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#8d8779',
}

const BOTAO: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 5,
  color: '#e6e1d6',
  font: 'inherit',
  fontSize: 11,
  padding: '6px 8px',
  cursor: 'pointer',
}

const VERDE: React.CSSProperties = {
  ...BOTAO,
  flex: 1,
  background: 'rgba(74,222,128,0.16)',
  border: '1px solid rgba(74,222,128,0.4)',
}

const CAMPO: React.CSSProperties = {
  width: '100%',
  background: '#20232a',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 5,
  color: '#e6e1d6',
  font: 'inherit',
  fontSize: 11,
  padding: '5px 6px',
  colorScheme: 'dark',
}

const ITEM: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 6,
}

const BOTAO_X: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#c97b6e',
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
}

const ERRO: React.CSSProperties = {
  color: '#f0b7ab',
  fontSize: 11,
  lineHeight: 1.5,
}

const TAMANHO_MIN = 3
const TAMANHO_MAX = 20

// Nome vira id de arquivo: minúsculo, sem acento, só letras/números/
// hífen — o mesmo formato que a rota /__salas/<id> exige.
export function slugificar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function PainelSalas() {
  const podeGravar = podeGravarNaFonte()
  const atual = useMemo(() => idSalaAtual(), [])
  const salas = useMemo(() => {
    const todas = todasAsSalasDaFonte()
    return idsDasSalas().map((id) => ({
      id,
      nome: todas[id].nome,
      ocupada: todas[id].moveis.some((m) => m.agente),
    }))
  }, [])

  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [colunas, setColunas] = useState(6)
  const [linhas, setLinhas] = useState(6)
  const [cor, setCor] = useState('#4a7c59')
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  // trocar de sala não precisa do servidor de dev (é só localStorage +
  // reload) — funciona até num site publicado. Só criar/excluir
  // precisa (escreve arquivo), por isso só essa parte é condicional.
  function trocar(id: string) {
    if (id === atual) return
    definirSalaAtual(id)
    recarregarDeProposito()
  }

  function validar(): string | null {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) return 'dê um nome pra sala'
    const id = slugificar(nomeLimpo)
    if (!id) return 'esse nome não vira um nome de arquivo válido — usa letras e números'
    if (existeSala(id)) return `já existe uma sala com esse nome de arquivo (${id})`
    if (salas.some((s) => s.nome.trim().toLowerCase() === nomeLimpo.toLowerCase())) {
      return 'já existe uma sala com esse nome'
    }
    if (!Number.isFinite(colunas) || colunas < TAMANHO_MIN || colunas > TAMANHO_MAX) {
      return `colunas tem que estar entre ${TAMANHO_MIN} e ${TAMANHO_MAX}`
    }
    if (!Number.isFinite(linhas) || linhas < TAMANHO_MIN || linhas > TAMANHO_MAX) {
      return `linhas tem que estar entre ${TAMANHO_MIN} e ${TAMANHO_MAX}`
    }
    return null
  }

  async function criar() {
    const problema = validar()
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)
    setCriando(true)
    const nomeLimpo = nome.trim()
    const id = slugificar(nomeLimpo)
    const corNumero = parseInt(cor.slice(1), 16)
    const sala: SalaDados = {
      nome: nomeLimpo,
      colunas,
      linhas,
      paleta: gerarPaletaDeCor(nomeLimpo, corNumero),
      moveis: [],
    }
    try {
      await gravarNaFonte(id, sala)
      definirSalaAtual(id)
      recarregarDeProposito()
    } catch (e) {
      setCriando(false)
      setErro(e instanceof Error ? e.message : 'falha ao criar a sala')
    }
  }

  async function excluir(id: string, nomeSala: string) {
    if (!window.confirm(`excluir a sala "${nomeSala}"? O arquivo some — dá pra recuperar pelo git.`)) {
      return
    }
    setExcluindo(id)
    setErro(null)
    try {
      await excluirSalaNaFonte(id)
      recarregarDeProposito()
    } catch (e) {
      setExcluindo(null)
      setErro(e instanceof Error ? e.message : 'falha ao excluir')
    }
  }

  return (
    <div style={CARTAO}>
      <div style={ROTULO}>salas</div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {salas.map((s) => (
          <li key={s.id} style={ITEM}>
            <button
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: '#e6e1d6',
                textAlign: 'left',
                opacity: s.id === atual ? 1 : 0.7,
                cursor: s.id === atual ? 'default' : 'pointer',
                textDecoration: s.id === atual ? 'none' : 'underline',
                textDecorationColor: 'rgba(230,225,214,0.3)',
              }}
              disabled={s.id === atual}
              onClick={() => trocar(s.id)}
              title={s.id === atual ? undefined : `ir para "${s.nome}"`}
            >
              {s.nome}
              {s.id === atual && ' · atual'}
            </button>
            {podeGravar && (
              <button
                style={{ ...BOTAO_X, opacity: s.id === atual || s.ocupada || excluindo === s.id ? 0.35 : 1 }}
                disabled={s.id === atual || s.ocupada || excluindo === s.id}
                title={
                  s.id === atual
                    ? 'saia desta sala antes de excluir'
                    : s.ocupada
                      ? 'tem agente dentro — desvincule antes de excluir'
                      : 'excluir sala'
                }
                onClick={() => excluir(s.id, s.nome)}
                aria-label={`excluir sala ${s.nome}`}
              >
                {excluindo === s.id ? '…' : '×'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {erro && <div style={ERRO}>{erro}</div>}

      {podeGravar && (aberto ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void criar()
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div>
            <div style={ROTULO}>nome</div>
            <input
              style={{ ...CAMPO, marginTop: 4 }}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="sala de reunião"
              maxLength={60}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={ROTULO}>colunas</div>
              <input
                style={{ ...CAMPO, marginTop: 4 }}
                type="number"
                min={TAMANHO_MIN}
                max={TAMANHO_MAX}
                value={colunas}
                onChange={(e) => setColunas(e.target.valueAsNumber)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={ROTULO}>linhas</div>
              <input
                style={{ ...CAMPO, marginTop: 4 }}
                type="number"
                min={TAMANHO_MIN}
                max={TAMANHO_MAX}
                value={linhas}
                onChange={(e) => setLinhas(e.target.valueAsNumber)}
              />
            </div>
          </div>

          <div>
            <div style={ROTULO}>cor</div>
            <input
              style={{ ...CAMPO, marginTop: 4, padding: 2, height: 28 }}
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" style={VERDE} disabled={criando}>
              {criando ? 'criando…' : 'criar'}
            </button>
            <button
              type="button"
              style={BOTAO}
              onClick={() => {
                setAberto(false)
                setErro(null)
              }}
            >
              cancelar
            </button>
          </div>
        </form>
      ) : (
        <button style={BOTAO} onClick={() => setAberto(true)}>
          + criar sala
        </button>
      ))}
    </div>
  )
}
