import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useImportarExtrato } from '../../hooks/useFinanceiro'
import type { Banco, ResultadoImportacao } from '../../types/financeiro'
import { AVISO_ERRO, BOTAO_PRINCIPAL, CAMPO, CARTAO, CORPO, OPCAO, ROTULO } from './estilos'

// Upload de extrato: escolher o banco ANTES de enviar (cada banco tem um
// parser próprio) e mandar o arquivo. Sem prévia antes de importar — o
// retorno já diz total/novas/duplicadas, que é a informação que importa.
//
// Importar NUNCA gera relatório: isso é ação separada e deliberada, pra
// não disparar custo de LLM sem decisão explícita (RNF01).

const BANCOS: { valor: Banco; rotulo: string; formato: string }[] = [
  { valor: 'itau', rotulo: 'Itaú', formato: 'PDF' },
  { valor: 'nubank', rotulo: 'Nubank', formato: 'CSV' },
]

export function UploadExtrato({ mes }: { mes: string }) {
  const [banco, setBanco] = useState<Banco>('itau')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null)
  const importar = useImportarExtrato(mes)

  const formatoEsperado = BANCOS.find((b) => b.valor === banco)?.formato

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo) return setErroLocal('escolha o arquivo do extrato')
    setErroLocal(null)
    setFeito(null)
    importar.mutate({ banco, arquivo }, { onSuccess: (r) => { setFeito(r); setArquivo(null) } })
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      <div>
        <div style={ROTULO}>banco</div>
        <select style={CAMPO} aria-label="banco" value={banco} onChange={(e) => setBanco(e.target.value as Banco)}>
          {BANCOS.map((b) => (
            <option key={b.valor} value={b.valor} style={OPCAO}>
              {b.rotulo} ({b.formato})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div style={ROTULO}>arquivo do extrato</div>
        <input
          style={{ ...CAMPO, padding: 6 }}
          aria-label="arquivo do extrato"
          type="file"
          accept={banco === 'itau' ? '.pdf' : '.csv'}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 5 }}>
          o parser do {BANCOS.find((b) => b.valor === banco)?.rotulo} espera {formatoEsperado}
        </div>
      </div>

      {(erroLocal || importar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(importar.error)}</div>
      )}

      <button type="submit" style={BOTAO_PRINCIPAL} disabled={importar.isPending}>
        {importar.isPending ? 'importando…' : 'importar extrato'}
      </button>

      {feito && <ResultadoUpload resultado={feito} />}
    </form>
  )
}

function ResultadoUpload({ resultado }: { resultado: ResultadoImportacao }) {
  // duplicadas não é erro — é a proteção contra subir o mesmo extrato
  // duas vezes funcionando. Vale dizer isso, senão o número assusta.
  const soDuplicadas = resultado.novas === 0 && resultado.duplicadas > 0

  return (
    <div style={CARTAO}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Numero rotulo="no arquivo" valor={`${resultado.total_no_arquivo}`} />
        <Numero rotulo="novas" valor={`${resultado.novas}`} destaque />
        <Numero rotulo="duplicadas" valor={`${resultado.duplicadas}`} />
      </div>
      {resultado.periodo_inicio && resultado.periodo_fim && (
        <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 10 }}>
          período coberto: {resultado.periodo_inicio} a {resultado.periodo_fim}
        </div>
      )}
      {soDuplicadas && (
        <div style={{ color: '#a89f8c', fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
          Tudo que veio já estava lançado — esse extrato provavelmente já foi
          importado antes. Nada foi duplicado.
        </div>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <div style={{ ...ROTULO, marginBottom: 2 }}>{rotulo}</div>
      <div style={{ fontSize: destaque ? 19 : 15, color: destaque ? '#4ade80' : '#e6e1d6' }}>{valor}</div>
    </div>
  )
}
