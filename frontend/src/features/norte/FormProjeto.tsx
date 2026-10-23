import { useState } from 'react'
import { mensagemDeErro } from '../../api/client'
import { useBranches, useCriarProjeto } from '../../hooks/useNorte'
import { AVISO_ERRO, BOTAO, BOTAO_PRINCIPAL, CAMPO, CORPO, OPCAO, ROTULO } from './estilos'

// Cadastrar projeto = colar o link + ESCOLHER a branch de uma lista, não
// digitar. As branches vêm do GitHub de verdade assim que o link é
// colado: um achado do backend é que nem todo repositório tem o conteúdo
// na default branch, então digitar às cegas cadastraria um projeto
// apontando pro lugar errado — e o erro só apareceria no scan.
//
// O cadastro faz SÓ o scan inicial (descrição, stack, arquitetura). Não
// gera card nenhum — isso é sempre um pedido explícito depois.

interface Props {
  aoCriar: (projetoId: number) => void
  aoCancelar: () => void
}

export function FormProjeto({ aoCriar, aoCancelar }: Props) {
  const [url, setUrl] = useState('')
  // só busca as branches depois que o chefe sai do campo: buscar a cada
  // tecla dispararia uma chamada ao GitHub por caractere digitado
  const [urlConfirmada, setUrlConfirmada] = useState('')
  const [nome, setNome] = useState('')
  const [branch, setBranch] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const branches = useBranches(urlConfirmada)
  const criar = useCriarProjeto()

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return setErroLocal('dê um nome pro projeto')
    if (!url.trim()) return setErroLocal('cole o link do repositório')
    setErroLocal(null)
    criar.mutate(
      // branch vazia = deixa o backend usar a default do repositório
      { nome: nome.trim(), repositorio_url: url.trim(), branch: branch || null },
      { onSuccess: (p) => aoCriar(p.id) },
    )
  }

  return (
    <form onSubmit={submeter} style={CORPO}>
      <div>
        <div style={ROTULO}>link do repositório</div>
        <input
          style={CAMPO}
          aria-label="link do repositório"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setUrlConfirmada(url.trim())}
          placeholder="https://github.com/usuario/repositorio"
          autoFocus
        />
        {branches.isFetching && (
          <div style={{ color: '#8d8779', fontSize: 11, marginTop: 5 }}>buscando branches…</div>
        )}
        {branches.isError && (
          <div style={{ ...AVISO_ERRO, marginTop: 6 }}>{mensagemDeErro(branches.error)}</div>
        )}
      </div>

      <div>
        <div style={ROTULO}>nome do projeto</div>
        <input
          style={CAMPO}
          aria-label="nome do projeto"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="como você chama esse projeto"
          maxLength={80}
        />
      </div>

      <div>
        <div style={ROTULO}>branch</div>
        <select
          style={CAMPO}
          aria-label="branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          disabled={!branches.data || branches.data.length === 0}
        >
          <option value="" style={OPCAO}>
            {branches.data ? '— usar a padrão do repositório —' : '— cole o link primeiro —'}
          </option>
          {branches.data?.map((b) => (
            <option key={b} value={b} style={OPCAO}>
              {b}
            </option>
          ))}
        </select>
        <div style={{ color: '#8d8779', fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
          são as branches reais do repositório — não dá pra apontar pra uma
          que não existe
        </div>
      </div>

      {(erroLocal || criar.isError) && (
        <div style={AVISO_ERRO}>{erroLocal ?? mensagemDeErro(criar.error)}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ ...BOTAO_PRINCIPAL, flex: 1 }} disabled={criar.isPending}>
          {/* o cadastro faz o scan do repositório, que chama LLM e demora */}
          {criar.isPending ? 'analisando o repositório…' : 'cadastrar projeto'}
        </button>
        <button type="button" style={BOTAO} onClick={aoCancelar}>
          cancelar
        </button>
      </div>
    </form>
  )
}
