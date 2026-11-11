// Nível 1: as três frentes (cartões com ícone pixel) e a porta para "clarear a vista".
import { useFrentes } from '../../hooks/usePauta'
import { nomeDaFrente, prazoEmPalavras } from './logica'
import { Botao, Caixa, Icone, Rotulo } from './pixel'
import { FONTE, iconeDaFrente } from './estilos'

const COR_PRAZO = { vencido: 'var(--danger)', perto: 'var(--pauta)', normal: 'var(--ink-dim)' } as const

export function Frentes({ aoAbrir, aoClarear }: { aoAbrir: (frenteId: number) => void; aoClarear: () => void }) {
  const { data: frentes, isLoading } = useFrentes()
  if (isLoading) return <Rotulo>carregando…</Rotulo>
  const hoje = new Date()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Rotulo>Frentes</Rotulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {frentes?.map((f) => {
          const prazo = prazoEmPalavras(f.prazo_mais_proximo, hoje)
          return (
            <Caixa key={f.id} cor="var(--pauta)" onClick={() => aoAbrir(f.id)} titulo={`abrir ${f.nome}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <Icone nome={iconeDaFrente(f.nome)} escala={4} />
              <div style={{ fontFamily: FONTE, fontSize: 18, fontWeight: 700 }}>{nomeDaFrente(f.nome)}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
                {f.abertas === 0 ? 'nada aberto' : `${f.abertas} aberta${f.abertas > 1 ? 's' : ''}`}
              </div>
              {prazo && <div style={{ fontSize: 12, color: COR_PRAZO[prazo.tom] }}>próximo prazo: {prazo.texto}</div>}
            </Caixa>
          )
        })}
      </div>
      <div>
        <Botao onClick={aoClarear} titulo="Foco, o que pode esperar e o que talvez nem valha">
          <Icone nome="estrela" escala={1.5} /> clarear a vista
        </Botao>
      </div>
    </div>
  )
}
