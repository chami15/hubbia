import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useRegistrarRefeicaoFoto, useRegistrarRefeicaoTexto } from '../../hooks/useSaude'
import type { NivelConfianca, RefeicaoRegistrada, TipoRefeicao } from '../../types/saude'
import { AVISO_ERRO, BOTAO, BOTAO_PRINCIPAL, CAMPO, CARTAO, CORPO, OPCAO, ROTULO } from './estilos'

// Registrar refeição tem DOIS caminhos visíveis (RF15) — foto e texto —
// porque são endpoints diferentes e experiências diferentes, não duas
// formas do mesmo campo. Ficam como abas lado a lado, ambas sempre
// visíveis: esconder um atrás do outro faria o chefe achar que só existe
// o que está na frente.

const TIPOS: { valor: TipoRefeicao; rotulo: string }[] = [
  { valor: 'cafe_da_manha', rotulo: 'café da manhã' },
  { valor: 'almoco', rotulo: 'almoço' },
  { valor: 'cafe_da_tarde', rotulo: 'café da tarde' },
  { valor: 'jantar', rotulo: 'jantar' },
  { valor: 'outro', rotulo: 'outro' },
]

const TAMANHO_MAX_MB = 8

export function FormRefeicao() {
  const [via, setVia] = useState<'texto' | 'foto'>('texto')
  const [tipo, setTipo] = useState<TipoRefeicao>('almoco')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [legenda, setLegenda] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [salva, setSalva] = useState<RefeicaoRegistrada | null>(null)

  const porTexto = useRegistrarRefeicaoTexto()
  const porFoto = useRegistrarRefeicaoFoto()
  const ocupado = porTexto.isPending || porFoto.isPending
  const erroServidor = porTexto.error ?? porFoto.error

  function limpar() {
    setDescricao('')
    setArquivo(null)
    setLegenda('')
  }

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErroLocal(null)
    setSalva(null)

    if (via === 'texto') {
      if (!descricao.trim()) return setErroLocal('descreva o que você comeu')
      porTexto.mutate(
        { tipo_refeicao: tipo, descricao: descricao.trim() },
        { onSuccess: (r) => { setSalva(r); limpar() } },
      )
      return
    }

    if (!arquivo) return setErroLocal('escolha uma foto')
    // o backend recusa acima de 8MB — checar aqui evita subir o arquivo
    // inteiro pra receber um 422 depois
    if (arquivo.size > TAMANHO_MAX_MB * 1024 * 1024) {
      return setErroLocal(`imagem grande demais (máximo ${TAMANHO_MAX_MB}MB)`)
    }
    porFoto.mutate(
      { tipo_refeicao: tipo, legenda: legenda.trim() || null, arquivo },
      { onSuccess: (r) => { setSalva(r); limpar() } },
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['texto', 'foto'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setVia(v); setErroLocal(null) }}
            style={{
              ...BOTAO,
              flex: 1,
              background: via === v ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.06)',
              borderColor: via === v ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)',
            }}
          >
            {v === 'texto' ? 'descrever por texto' : 'mandar foto'}
          </button>
        ))}
      </div>

      <div>
        <div style={ROTULO}>qual refeição</div>
        <select style={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as TipoRefeicao)}>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor} style={OPCAO}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </div>

      {via === 'texto' ? (
        <div>
          <div style={ROTULO}>o que você comeu</div>
          <textarea
            style={{ ...CAMPO, minHeight: 90, resize: 'vertical' }}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="arroz, feijão, bife grelhado e salada de alface com tomate"
          />
        </div>
      ) : (
        <>
          <div>
            <div style={ROTULO}>foto do prato</div>
            <input
              style={{ ...CAMPO, padding: 6 }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <div style={ROTULO}>legenda (opcional)</div>
            <input
              style={CAMPO}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="algo que a foto não mostra — o arroz é integral, por exemplo"
              maxLength={200}
            />
          </div>
        </>
      )}

      {(erroLocal || erroServidor) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(erroServidor)}</div>
      )}

      <button type="submit" style={BOTAO_PRINCIPAL} disabled={ocupado}>
        {/* estimar macro chama LLM e leva alguns segundos — precisa dizer
            que está vivo (RNF07) */}
        {ocupado ? 'estimando…' : 'registrar refeição'}
      </button>

      {salva && <ResultadoRefeicao refeicao={salva} />}
    </form>
  )
}

// A confiança vem do modelo e importa: uma foto ruim gera estimativa
// fraca, e mostrar isso como se fosse medido seria mentira. São três
// NÍVEIS, não uma porcentagem — inventar um "78%" a partir de "alta"
// daria ao número uma precisão que ele não tem.
const CONFIANCA: Record<NivelConfianca, { texto: string; cor: string }> = {
  alta: { texto: 'confiança alta', cor: '#8d8779' },
  media: { texto: 'confiança média — confira se algo ficou de fora', cor: '#a89f8c' },
  baixa: { texto: 'confiança baixa — trate como chute', cor: '#dbb15f' },
}

function ResultadoRefeicao({ refeicao }: { refeicao: RefeicaoRegistrada }) {
  const confianca = CONFIANCA[refeicao.confianca_estimativa]

  return (
    <div style={CARTAO}>
      <div style={{ ...ROTULO, marginBottom: 8 }}>registrado</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
        <Macro rotulo="kcal" valor={refeicao.calorias} destaque />
        <Macro rotulo="carb" valor={refeicao.carboidratos_g} sufixo="g" />
        <Macro rotulo="prot" valor={refeicao.proteinas_g} sufixo="g" />
        <Macro rotulo="gord" valor={refeicao.gorduras_g} sufixo="g" />
      </div>
      {/* nível desconhecido não vira "NaN" nem some caladinho: se um dia
          o backend mandar um quarto valor, ele aparece cru na tela */}
      <div style={{ color: confianca?.cor ?? '#dbb15f', fontSize: 10.5, marginTop: 10 }}>
        estimativa · {confianca?.texto ?? `confiança "${refeicao.confianca_estimativa}"`}
      </div>
    </div>
  )
}

function Macro({
  rotulo,
  valor,
  sufixo = '',
  destaque = false,
}: {
  rotulo: string
  valor: number
  sufixo?: string
  destaque?: boolean
}) {
  return (
    <div>
      <div style={{ ...ROTULO, marginBottom: 2 }}>{rotulo}</div>
      <div style={{ fontSize: destaque ? 17 : 14, color: destaque ? '#f97316' : '#e6e1d6' }}>
        {Math.round(valor)}
        {sufixo}
      </div>
    </div>
  )
}
