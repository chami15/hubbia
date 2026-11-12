// O elevador na tela, em pixel art: o painel de botões (abre ao clicar num elevador do prédio ou no indicador),
// as portas que fecham e abrem na troca de andar, e o indicador do andar atual no canto (com aviso quando alguém
// em outro andar precisa de você). A lógica da troca está em trocaDeAndar.ts / useElevador.ts.
import { useEffect } from 'react'
import type { AndarId } from './andares'
import { andarPorId } from './andares'
import type { ResumoAndar } from './mundo'
import { TEMPOS, sentido, type Troca } from './trocaDeAndar'
import './elevador.css'

const ACO = '#8b96a8'
const ACO_ESCURO = '#4a5363'
const ACO_CLARO = '#c3cad6'
const VISOR = '#14100a'
const AMBAR = '#f5c542'
const FONTE = 'var(--fonte-pixel)'

/** Mostrador do elevador: fundo escuro, número em âmbar, como os de verdade. */
function Mostrador({ texto, grande }: { texto: string; grande?: boolean }) {
  return (
    <div style={{ background: VISOR, border: `2px solid ${ACO_ESCURO}`, padding: grande ? '8px 18px' : '4px 10px', color: AMBAR, fontFamily: FONTE, fontSize: grande ? 34 : 18, letterSpacing: '0.08em', textShadow: `0 0 6px ${AMBAR}88`, lineHeight: 1, textAlign: 'center' }}>
      {texto}
    </div>
  )
}

/** O painel de botões do elevador: um botão por andar, o atual aceso, aviso de quem precisa de você. */
export function PainelElevador({ andares, atual, aoEscolher, aoFechar }: {
  andares: ResumoAndar[]
  atual: AndarId
  aoEscolher: (andar: AndarId) => void
  aoFechar: () => void
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  // de cima para baixo, como num painel de elevador
  const ordem = [...andares].sort((a, b) => b.id - a.id)
  return (
    <>
      <div onClick={aoFechar} style={{ position: 'absolute', inset: 0, background: 'rgba(8, 9, 12, 0.45)', zIndex: 56 }} />
      <div role="dialog" aria-label="painel do elevador"
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 57,
          background: ACO, padding: 4, boxShadow: `6px 6px 0 #0b0c10`, fontFamily: FONTE,
        }}>
        <div style={{ border: `2px solid ${ACO_CLARO}`, borderRightColor: ACO_ESCURO, borderBottomColor: ACO_ESCURO, padding: '14px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 190 }}>
          <Mostrador texto={andarPorId(atual).botao} grande />
          <div style={{ fontSize: 12, color: '#1c212b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>escolha o andar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            {ordem.map((a) => {
              const aqui = a.id === atual
              return (
                <button key={a.id} type="button" className="elevador-botao" disabled={aqui} onClick={() => aoEscolher(a.id)}
                  aria-label={`${a.nome}${a.precisaDeVoce ? `, ${a.precisaDeVoce} precisando de você` : ''}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '38px 1fr auto', alignItems: 'center', gap: 10, width: '100%',
                    background: 'transparent', border: 0, padding: 0, cursor: aqui ? 'default' : 'pointer', fontFamily: FONTE, textAlign: 'left',
                  }}>
                  <span style={{
                    width: 34, height: 34, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 700,
                    background: aqui ? AMBAR : ACO_ESCURO, color: aqui ? VISOR : ACO_CLARO,
                    border: `2px solid ${aqui ? '#fff3b0' : '#2b313c'}`, boxShadow: aqui ? `0 0 10px ${AMBAR}` : '2px 2px 0 #2b313c',
                  }}>
                    {a.botao}
                  </span>
                  <span style={{ fontSize: 14, color: '#141820' }}>
                    {a.nome}
                    <span style={{ display: 'block', fontSize: 11, color: '#2b313c' }}>
                      {aqui ? 'você está aqui' : a.agentes === 0 ? 'vazio' : `${a.agentes} agente${a.agentes > 1 ? 's' : ''}`}
                    </span>
                  </span>
                  {a.precisaDeVoce > 0 && (
                    <span title="alguém neste andar precisa de você"
                      style={{ background: 'var(--danger)', color: '#fff', fontSize: 12, padding: '2px 6px', border: '2px solid #0b0c10', animation: 'elevador-pisca 0.8s steps(1) infinite' }}>
                      !
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

/** As portas que fecham por cima do prédio, mostram para onde vai e abrem no andar novo. */
export function PortasDoElevador({ troca }: { troca: Troca }) {
  const fechadas = troca.fase === 'fechado'
  const anim = (lado: 'esq' | 'dir') =>
    troca.fase === 'fechando' ? `elevador-fecha-${lado} ${TEMPOS.fechar}ms steps(8) forwards`
      : troca.fase === 'abrindo' ? `elevador-abre-${lado} ${TEMPOS.abrir}ms steps(8) forwards` : 'none'
  const porta = (lado: 'esq' | 'dir'): React.CSSProperties => ({
    position: 'absolute', top: 0, bottom: 0, width: '50%', [lado === 'esq' ? 'left' : 'right']: 0,
    // aço escovado em pixel: listras verticais duras, sem degradê suave
    background: `repeating-linear-gradient(90deg, ${ACO} 0 6px, #97a2b4 6px 8px, ${ACO} 8px 14px, #7e889a 14px 16px)`,
    borderRight: lado === 'esq' ? `4px solid ${ACO_ESCURO}` : undefined,
    borderLeft: lado === 'dir' ? `4px solid ${ACO_CLARO}` : undefined,
    animation: anim(lado),
    transform: fechadas ? 'translateX(0)' : undefined,
  })
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 58, overflow: 'hidden', pointerEvents: 'all' }}>
      {/* key: a animação recomeça a cada fase */}
      <div key={`e-${troca.fase}`} style={porta('esq')} />
      <div key={`d-${troca.fase}`} style={porta('dir')} />
      {fechadas && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Mostrador texto={`${sentido(troca)} ${andarPorId(troca.para).botao}`} grande />
          <div style={{ fontFamily: FONTE, fontSize: 16, color: '#141820', background: ACO_CLARO, padding: '3px 10px', border: `2px solid ${ACO_ESCURO}` }}>
            {andarPorId(troca.para).nome}
          </div>
        </div>
      )}
    </div>
  )
}

/** No canto do prédio: em que andar você está, e um aviso se alguém em outro andar precisa de você. Abre o painel. */
export function IndicadorDeAndar({ andares, atual, aoAbrir }: { andares: ResumoAndar[]; atual: AndarId; aoAbrir: () => void }) {
  const chamando = andares.filter((a) => a.id !== atual && a.precisaDeVoce > 0)
  return (
    <button type="button" className="elevador-botao" onClick={aoAbrir}
      title={chamando.length ? `precisam de você no ${chamando.map((a) => a.nome.toLowerCase()).join(' e no ')}` : 'trocar de andar'}
      style={{
        position: 'absolute', left: 16, bottom: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8,
        background: ACO, border: `2px solid ${ACO_ESCURO}`, padding: '5px 8px', cursor: 'pointer', boxShadow: '3px 3px 0 #0b0c10', fontFamily: FONTE,
      }}>
      <Mostrador texto={andarPorId(atual).botao} />
      <span style={{ fontSize: 13, color: '#141820' }}>{andarPorId(atual).nome}</span>
      {chamando.length > 0 && (
        <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 12, padding: '1px 6px', border: '2px solid #0b0c10', animation: 'elevador-pisca 0.8s steps(1) infinite' }}>
          ! {chamando.map((a) => a.botao).join(' ')}
        </span>
      )}
    </button>
  )
}
