import { ROTULO } from './estilos'

// Os gráficos do dashboard, desenhados à mão — sem biblioteca.
//
// Cabe fazer à mão aqui porque são formas simples guiadas por dado
// (barras e colunas), que é justamente onde código funciona bem — ao
// contrário de mobília isométrica, que foi o que ensinou a NÃO desenhar
// à mão neste projeto. E evita uma dependência de ~100kb + o `npm
// install` depois do pull.
//
// Só existe UMA série em todo o dashboard (dinheiro que saiu), então
// nenhuma paleta categórica entra aqui: a cor é tinta, não identidade —
// quem carrega a magnitude é o comprimento da barra. Por isso também não
// há legenda: com uma série só, o título já diz o que está plotado.

// Verde da família do Cifra, validado contra a superfície do painel
// (#14161b): dentro da faixa de luminosidade, croma acima do piso e
// contraste ≥ 3:1.
const SERIE = '#199e70'
const SUPERFICIE = '#14161b'
const GRADE = '#2b3037'
const TEXTO_2 = '#a89f8c'
const TEXTO_3 = '#8d8779'

export function moeda(valor: number, casas = 0): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

// ---------------------------------------------------------------
// Gastos por categoria — barras horizontais.
//
// Horizontais porque os nomes de categoria são palavras, e palavra
// deitada na vertical vira rótulo girado ou truncado. Em HTML/CSS e não
// SVG porque aqui o trabalho é de TEXTO (nome à esquerda, valor na
// ponta), e o navegador já sabe medir e quebrar texto.
// ---------------------------------------------------------------
export function BarrasCategoria({ dados }: { dados: { categoria: string; valor: number; percentual: number }[] }) {
  if (dados.length === 0) {
    return <VazioGrafico texto="nenhum gasto categorizado neste mês" />
  }

  const maior = Math.max(...dados.map((d) => d.valor))

  return (
    <div>
      <div style={ROTULO}>gastos por categoria</div>
      {/* gap de 6px = o respiro que separa as barras. A separação é o
          espaço, nunca uma borda desenhada em volta da marca. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {dados.map((d) => (
          <div key={d.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 108,
                flexShrink: 0,
                fontSize: 11.5,
                color: TEXTO_2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={d.categoria}
            >
              {d.categoria}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                title={`${d.categoria}: ${moeda(d.valor, 2)} (${d.percentual}%)`}
                style={{
                  // altura fina: a barra nunca preenche a faixa, sobra ar
                  height: 14,
                  width: `${Math.max((d.valor / maior) * 100, 1)}%`,
                  background: SERIE,
                  // ponta arredondada só onde o dado termina; quadrada na
                  // linha de base, que é de onde a barra cresce
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>
            {/* valor na ponta: em barras isso é a orientação, e o que
                dispensa o leitor de caçar o número no eixo */}
            <div style={{ width: 84, flexShrink: 0, textAlign: 'right', fontSize: 11.5, color: TEXTO_2 }}>
              {moeda(d.valor)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Evolução diária — colunas, uma por dia com gasto.
//
// Colunas (e não linha) porque cada dia é uma soma fechada de eventos
// discretos, não uma medida contínua sendo amostrada: ligar os pontos
// sugeriria que existe valor "entre" o dia 3 e o 4.
// ---------------------------------------------------------------
export function ColunasDiarias({ dados }: { dados: { dia: number; valor: number }[] }) {
  if (dados.length === 0) {
    return <VazioGrafico texto="nenhum gasto lançado neste mês" />
  }

  const ALTURA = 96
  const maior = Math.max(...dados.map((d) => d.valor))
  const diaMax = Math.max(...dados.map((d) => d.dia), 30)
  const noPico = dados.reduce((a, b) => (b.valor > a.valor ? b : a))

  // linhas de grade em valores redondos — carregam os números que não
  // foram rotulados diretamente
  const passo = escalaRedonda(maior)
  const linhas: number[] = []
  for (let v = passo; v <= maior; v += passo) linhas.push(v)

  // posição horizontal como fração da largura (0..1): o gráfico se
  // adapta à largura do painel sem nada precisar ser remedido
  const centroDoDia = (dia: number) => (dia - 0.5) / diaMax
  const larguraColuna = 100 / diaMax

  return (
    <div>
      <div style={ROTULO}>evolução diária</div>

      {/* Tudo em HTML/CSS, nada de SVG: um viewBox esticado pra largura
          do painel deformaria o arredondamento do topo (4px viram ~10px
          na horizontal e seguem 4px na vertical) e esticaria o texto
          junto. Aconteceu de verdade — o eixo saiu 2,5× maior. */}

      {/* faixa própria pro rótulo do pico: ele É o valor máximo, então
          a coluna dele sempre encosta no topo e um rótulo "acima da
          barra" cairia em cima dela. Reservar a linha resolve pra
          qualquer dado. */}
      <div style={{ position: 'relative', height: 14, marginTop: 8 }}>
        <span
          style={{
            position: 'absolute',
            left: `${centroDoDia(noPico.dia) * 100}%`,
            transform: 'translateX(-50%)',
            fontSize: 10,
            color: TEXTO_2,
            whiteSpace: 'nowrap',
          }}
        >
          {moeda(noPico.valor)}
        </span>
      </div>

      <div style={{ position: 'relative', height: ALTURA }}>
        {linhas.map((v) => (
          // hairline sólida, nunca tracejada: tracejo é ruído que
          // compete com o dado
          <div
            key={v}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: (v / maior) * ALTURA,
              borderTop: `1px solid ${GRADE}`,
            }}
          />
        ))}

        {dados.map((d) => (
          <div
            key={d.dia}
            title={`dia ${d.dia}: ${moeda(d.valor, 2)}`}
            style={{
              position: 'absolute',
              bottom: 0,
              left: `${centroDoDia(d.dia) * 100}%`,
              // o respiro entre colunas vizinhas sai daqui: a coluna
              // nunca ocupa a faixa inteira do dia
              width: `${larguraColuna * 0.62}%`,
              maxWidth: 24,
              transform: 'translateX(-50%)',
              height: Math.max((d.valor / maior) * ALTURA, 2),
              background: SERIE,
              // arredondado só no topo, que é onde o dado termina;
              // quadrado na base, de onde a coluna cresce
              borderRadius: '4px 4px 0 0',
            }}
          />
        ))}
      </div>

      {/* a faixa do eixo é irmã do gráfico, não algo desenhado por cima
          — assim ela sempre cabe, em vez de ser cortada */}
      <div style={{ position: 'relative', height: 16 }}>
        {[1, 10, 20, diaMax].map((dia) => (
          <span
            key={dia}
            style={{
              position: 'absolute',
              left: `${centroDoDia(dia) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 9.5,
              color: TEXTO_3,
            }}
          >
            {dia}
          </span>
        ))}
      </div>
    </div>
  )
}

// Passo de grade "redondo" (1, 2 ou 5 vezes uma potência de 10) — 250 e
// 500 se leem de relance; 237 não.
function escalaRedonda(maior: number): number {
  if (maior <= 0) return 1
  const bruto = maior / 3
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const normalizado = bruto / potencia
  const passo = normalizado >= 5 ? 5 : normalizado >= 2 ? 2 : 1
  return passo * potencia
}

function VazioGrafico({ texto }: { texto: string }) {
  return (
    <div
      style={{
        border: `1px solid ${GRADE}`,
        borderRadius: 8,
        padding: '18px 14px',
        textAlign: 'center',
        color: TEXTO_3,
        fontSize: 11.5,
        background: SUPERFICIE,
      }}
    >
      {texto}
    </div>
  )
}
