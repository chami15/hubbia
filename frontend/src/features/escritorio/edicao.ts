import type { Container, FederatedPointerEvent, Sprite } from 'pixi.js'
import { Graphics } from 'pixi.js'
import { paraTela, TILE_W, TILE_H } from './iso'
import type { Cena } from './cena'
import type { MovelSala, SalaDados } from './sala-dados'
import { novoId } from './sala-dados'
import type { Direcao } from './sala'
import { AGENTES } from './agentes'
import { criarPortaEspelhada, desvincularDoOutroLado, removerEspelhos } from './porta-espelho'
import {
  consumirAvisoDeGravacao,
  definirSalaAtual,
  descartarRascunho,
  existeSala,
  gravarNaFonte,
  marcarQueGravou,
  podeGravarNaFonte,
  recarregarDeProposito,
  saidaEhIntencional,
  salaDaFonte,
  salvarRascunho,
  temRascunho,
  todasAsSalasDaFonte,
  type Camada,
} from './persistencia'

// ---------------------------------------------------------------
// MODO DE EDIÇÃO
//
// Existe porque descrever posição em palavras nunca funcionou: "um
// pouco mais pra trás" vira um vetor diferente dependendo da peça e
// de que lado o agente senta, e cada rodada de "descreve → chuto o
// delta → renderiza → tá errado" custava caro. Aqui o chefe arrasta e
// vê na hora, escolhe o móvel num catálogo, e nada disso passa por
// mim.
//
// O editor não mexe em sprite: ele fala com a Maquete, que mantém
// dado e sprite em sincronia.
// ---------------------------------------------------------------

export interface EstadoEditor {
  ativo: boolean
  selecionado: MovelSala | null
  passo: number
  camada: Camada
  sujo: boolean
  totalMoveis: number
  // se dá pra gravar direto no arquivo versionado (só em dev)
  podeGravar: boolean
  gravando: boolean
  podeDesfazer: boolean
  podeRefazer: boolean
  // confirmação passageira das ações que não têm efeito visível na
  // cena (salvar, copiar, atribuir agente) — sem isso o chefe clica e
  // não sabe se aconteceu
  mensagem: string | null
  // id da sala aberta — o painel usa isso pra tirar ELA MESMA da
  // lista de destinos possíveis de porta (sem isso o chefe poderia
  // escolher a própria sala, que a conferência recusaria de qualquer
  // jeito, só que só na hora de gravar)
  idSala: string
  // porta sob o mouse, fora do modo de edição — null quando nenhuma.
  // x/y já em coordenada de tela, pro popup em cima do sprite
  popupPorta: { texto: string; x: number; y: number } | null
}

const PASSOS = [0.01, 0.025, 0.05, 0.1, 0.25]
const COR_MARCA = 0x4ade80

// Quanto a peça colada nasce deslocada da original, por colagem. Meia
// casa é o bastante pra ela não sumir exatamente atrás da original, e
// pouco o bastante pra continuar por perto de onde se quer.
const DESLOCAMENTO_COLAGEM = 0.5

// nome legível da peça pro aviso ("chair desk" em vez de "chairDesk").
// A mesma regra de catalogo.ts, repetida aqui em vez de importada:
// edicao.ts não depende do catálogo hoje, e uma linha não justifica
// criar esse acoplamento.
function rotuloDaPeca(peca: string): string {
  return peca.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase()
}

// Movimento na tela → movimento no tabuleiro. Inversa de paraTela():
//   x = (c − l)·TILE_W/2   →   c − l = 2x/TILE_W
//   y = (c + l)·TILE_H/2   →   c + l = 2y/TILE_H
// (o termo da altura some porque aqui é diferença, não posição)
function telaParaGrade(dx: number, dy: number): { coluna: number; linha: number } {
  return {
    coluna: dx / TILE_W + dy / TILE_H,
    linha: dy / TILE_H - dx / TILE_W,
  }
}

export interface Editor {
  estado: () => EstadoEditor
  alternar: () => void
  selecionar: (id: string | null) => void
  ciclar: (passos: number) => void
  mover: (coluna: number, linha: number) => void
  girar: (passos: number) => void
  mudarAltura: (delta: number) => void
  mudarPasso: (passos: number) => void
  desfazer: () => void
  refazer: () => void
  adicionar: (peca: string) => void
  copiar: () => void
  colar: () => void
  remover: () => void
  atribuirAgente: (agenteId: string | null) => void
  atribuirPorta: (salaDestino: string | null) => void
  apoiarNoDeBaixo: () => void
  salvarRascunho: () => void
  gravarNaFonte: () => void
  voltarParaFonte: () => void
  copiarJson: () => void
  destruir: () => void
}

export function criarEditor(
  cena: Cena,
  mundo: Container,
  palco: Container,
  aoMudar: () => void,
  idSala: string,
): Editor {
  const maquete = cena.maquete
  let ativo = false
  let selecionadoId: string | null = null
  let indicePasso = 2
  let camada: Camada = temRascunho(idSala) ? 'rascunho' : 'fonte'
  let sujo = false
  let arrastando: string | null = null
  let ultimoPonto: { x: number; y: number } | null = null
  let mensagem: string | null = null
  let timerMensagem: number | undefined
  let gravando = false
  let popupPorta: { texto: string; x: number; y: number } | null = null
  // área de transferência do editor — só desta sessão, e de propósito:
  // guardar em localStorage faria uma peça copiada semanas atrás
  // reaparecer sem contexto. Sobrevive à troca de sala? Não — e isso é
  // uma limitação conhecida, não um esquecimento (ver o guia).
  let copiado: MovelSala | null = null
  let colagens = 0
  // Espelhos que ESTA sessão criou em outras salas. "Descartar e voltar
  // à fonte" apaga o rascunho desta sala — e sem esta lista a metade da
  // porta que nasceu do outro lado sobreviveria ao descarte, virando
  // uma porta órfã numa sala que o chefe nem abriu.
  const espelhosCriados: { sala: string; id: string }[] = []

  // --- Desfazer ---------------------------------------------------
  // Guarda o estado ANTES de cada gesto. Um instantâneo da sala é
  // pequeno (algumas dezenas de móveis), então cópia integral é mais
  // simples e mais confiável que registrar operações inversas.
  const LIMITE_PILHA = 60
  // Uma rajada (segurar a seta, arrastar) tem que virar UM desfazer, e
  // não cem. Ações do mesmo tipo dentro desta janela reaproveitam o
  // instantâneo do início da rajada.
  const JANELA_AGRUPAR = 600
  const pilha: SalaDados[] = []
  // O refazer só existe enquanto ninguém fez nada novo: assim que o
  // chefe edita depois de desfazer, o futuro que estava guardado
  // deixou de fazer sentido e é descartado.
  let pilhaRefazer: SalaDados[] = []
  let ultimoTipo = ''
  let ultimoInstante = 0

  function lembrar(tipo: string) {
    const agora = Date.now()
    pilhaRefazer = []
    if (tipo === ultimoTipo && agora - ultimoInstante < JANELA_AGRUPAR) {
      ultimoInstante = agora
      return
    }
    pilha.push(maquete.exportar())
    if (pilha.length > LIMITE_PILHA) pilha.shift()
    ultimoTipo = tipo
    ultimoInstante = agora
  }

  // Desfazer e refazer são o mesmo movimento em sentidos opostos:
  // tira de uma pilha, guarda o estado atual na outra, restaura.
  function viajar(de: SalaDados[], para: SalaDados[], rotulo: string) {
    const destino = de.pop()
    if (!destino) {
      avisar(`não há o que ${rotulo}`)
      notificar()
      return
    }
    para.push(maquete.exportar())
    // a rajada acabou: o próximo gesto captura de novo
    ultimoTipo = ''
    void maquete.restaurar(destino).then(() => {
      for (const m of maquete.moveis) ligarClique(m.id)
      aplicarInteratividade()
      // a peça selecionada pode ter deixado de existir
      if (selecionadoId && !maquete.movel(selecionadoId)) selecionadoId = null
      avisar(rotulo === 'desfazer' ? 'desfeito' : 'refeito')
      notificar()
    })
  }

  // Referência pra saber se há mudança pendente. Comparar o estado
  // atual com ela mantém o "· alterado" do HUD honesto inclusive
  // depois de desfazer tudo de volta ao ponto de partida.
  //
  // A referência é a FONTE (o .json versionado), não o estado em que a
  // tela abriu. Desde que o rascunho é salvo sozinho, "alterado" só é
  // útil se significar "existe trabalho que ainda NÃO está no arquivo
  // do projeto" — que é a pergunta que importa na hora de fechar a aba.
  // Abrir uma sala que já tinha rascunho pendente por isso já mostra
  // "alterado" de cara, e isso é a informação certa.
  let referencia = JSON.stringify(salaDaFonte(idSala))

  function estaSujo(): boolean {
    return JSON.stringify(maquete.exportar()) !== referencia
  }

  // --- Rascunho automático -------------------------------------------
  //
  // Trocar de sala recarrega a página, e o que estava só na memória
  // evaporava — foi assim que se perdeu trabalho de verdade em teste.
  // Agora toda mudança agenda uma gravação no rascunho local.
  //
  // Com espera porque `notificar()` roda a cada pixel de arraste:
  // gravar em cada um seria escrever no localStorage centenas de vezes
  // por gesto, sem nenhum ganho.
  const ESPERA_AUTO_RASCUNHO = 600
  let timerAutoRascunho: number | undefined
  // "descartar e voltar à fonte" apaga o rascunho e recarrega. Sem esta
  // trava, a gravação de última hora do beforeunload ressuscitaria
  // exatamente o que o chefe mandou jogar fora.
  let descartado = false

  function guardarRascunhoAgora() {
    window.clearTimeout(timerAutoRascunho)
    if (descartado) return
    if (!estaSujo()) return
    salvarRascunho(idSala, maquete.exportar())
    camada = 'rascunho'
  }

  function agendarAutoRascunho() {
    window.clearTimeout(timerAutoRascunho)
    timerAutoRascunho = window.setTimeout(() => {
      const antes = camada
      guardarRascunhoAgora()
      // só repinta o HUD se a camada mudou — evitar um render por
      // gravação, que aconteceria a cada pausa de digitação
      if (camada !== antes) aoMudar()
    }, ESPERA_AUTO_RASCUNHO)
  }

  // Última chance antes da página morrer. Vale pra QUALQUER saída
  // (trocar de sala, fechar aba, recarregar), então cobre também o
  // trabalho dos últimos milissegundos que a espera acima ainda não
  // gravou. localStorage é síncrono, então dá tempo.
  function aoSair(e: BeforeUnloadEvent) {
    guardarRascunhoAgora()
    // avisa só quando a saída NÃO foi pedida por nós: trocar de sala e
    // gravar na fonte recarregam de propósito e não podem virar um
    // "tem certeza?" a cada clique
    if (estaSujo() && !saidaEhIntencional()) e.preventDefault()
  }

  window.addEventListener('beforeunload', aoSair)

  // losango no chão marcando a peça selecionada — o mesmo formato do
  // tile, pra leitura na perspectiva ficar óbvia
  const marca = new Graphics()
  marca.visible = false
  marca.zIndex = 1_000_000
  maquete.camada.addChild(marca)

  function selecionado(): MovelSala | null {
    return selecionadoId ? (maquete.movel(selecionadoId) ?? null) : null
  }

  const DURACAO_MENSAGEM = 2200

  function avisar(texto: string) {
    mensagem = texto
    window.clearTimeout(timerMensagem)
    timerMensagem = window.setTimeout(() => {
      mensagem = null
      aoMudar()
    }, DURACAO_MENSAGEM)
  }

  function redesenharMarca() {
    marca.clear()
    const m = selecionado()
    if (!ativo || !m) {
      marca.visible = false
      return
    }
    const { x, y } = paraTela(m.coluna, m.linha)
    const hw = TILE_W / 2
    const hh = TILE_H / 2
    marca.poly([x, y - hh, x + hw, y, x, y + hh, x - hw, y])
    marca.stroke({ width: 3, color: COR_MARCA, alpha: 0.95 })
    marca.circle(x, y, 5).fill({ color: COR_MARCA, alpha: 0.95 })
    // uma haste até a peça, que pode estar levantada (em cima da mesa)
    if (m.altura) {
      const topo = paraTela(m.coluna, m.linha, m.altura)
      marca.moveTo(x, y).lineTo(topo.x, topo.y)
      marca.stroke({ width: 2, color: COR_MARCA, alpha: 0.6 })
    }
    marca.visible = true
  }

  function notificar() {
    sujo = estaSujo()
    agendarAutoRascunho()
    redesenharMarca()
    cena.redesenharAgentes()
    aoMudar()
  }

  // Só é "botão" clicável quando leva pra uma sala que existe de
  // verdade — sem isso a peça é decoração comum, do jeito que
  // qualquer outro móvel é. Também não conta a própria sala: isso a
  // conferência recusaria de qualquer jeito, só que só na hora de
  // gravar — mais barato nunca deixar o botão nascer.
  function portaValida(m: MovelSala): boolean {
    return typeof m.leva === 'string' && m.leva !== idSala && existeSala(m.leva)
  }

  function mostrarPopup(m: MovelSala, sprite: Sprite) {
    if (!m.leva) return
    const destino = todasAsSalasDaFonte()[m.leva]
    if (!destino) return
    const pos = sprite.getGlobalPosition()
    popupPorta = { texto: `→ ${destino.nome}`, x: pos.x, y: pos.y }
    aoMudar()
  }

  function esconderPopup() {
    if (!popupPorta) return
    popupPorta = null
    aoMudar()
  }

  // Troca de sala é um teleporte simbólico, não uma câmera andando —
  // recarregar é o jeito mais simples e mais confiável de garantir que
  // tudo (Pixi, editor, painéis) reinicia coerente com a sala nova.
  function irPara(destino: string) {
    // grava antes de sair: a troca de sala é o caminho por onde o
    // trabalho não salvo sumia
    guardarRascunhoAgora()
    definirSalaAtual(destino)
    recarregarDeProposito()
  }

  // Toda peça é clicável nos dois modos, mas o clique quer dizer coisa
  // diferente: em edição, arrastar; fora dela, porta válida navega e o
  // resto abre o menu radial do modo simulação (cena.ts). Nunca as duas
  // coisas ao mesmo tempo — em edição, toda peça se comporta como móvel
  // comum, mesmo as que têm `leva`, senão um clique pra mover viraria
  // sem querer um clique pra sair da sala.
  //
  // (Antes, fora da edição, só porta ficava 'static' — e o menu radial
  // de móvel só funcionava depois de entrar e sair da edição uma vez.)
  function aplicarInteratividade() {
    for (const m of maquete.moveis) {
      const sprite = maquete.spriteDe(m.id)
      if (sprite) prepararSprite(sprite)
    }
  }

  function prepararSprite(sprite: NonNullable<ReturnType<typeof maquete.spriteDe>>) {
    sprite.eventMode = 'static'
    sprite.cursor = ativo ? 'move' : 'pointer'
  }

  // Liga o clique de um sprite. Chamado de novo a cada peça
  // adicionada, senão a peça nova nasceria sem poder ser selecionada.
  // Os handlers ficam ligados pra sempre e decidem sozinhos se agem,
  // olhando `ativo` na hora — o mesmo padrão do pointerdown de
  // arrastar, que já fazia isso antes da porta existir.
  function ligarClique(id: string) {
    const sprite = maquete.spriteDe(id)
    if (!sprite) return
    sprite.on('pointerdown', (e: FederatedPointerEvent) => {
      if (!ativo) return
      e.stopPropagation()
      // um instantâneo pro arraste inteiro: os pointermove seguintes
      // não capturam nada, senão cada pixel viraria um desfazer
      lembrar(`arrastar:${id}`)
      selecionadoId = id
      arrastando = id
      ultimoPonto = mundo.toLocal(e.global)
      notificar()
    })
    sprite.on('pointerover', () => {
      if (ativo) return
      const m = maquete.movel(id)
      if (m && portaValida(m)) mostrarPopup(m, sprite)
    })
    sprite.on('pointerout', () => {
      if (ativo) return
      esconderPopup()
    })
    sprite.on('pointertap', () => {
      if (ativo) return
      const m = maquete.movel(id)
      if (m && portaValida(m)) irPara(m.leva!)
    })
  }

  for (const m of maquete.moveis) ligarClique(m.id)
  // sem isto, a sala abriria com toda peça no estado padrão do Pixi —
  // nem porta clicável, nem móvel arrastável — até o chefe apertar E
  // uma vez. A sala já nasce em modo de visualização (ativo = false),
  // então é ISSO que precisa estar correto desde o primeiro frame.
  aplicarInteratividade()

  // se a página recarregou logo após uma gravação, mostra a
  // confirmação que ficou pendente do outro lado
  if (consumirAvisoDeGravacao()) avisar('gravado no arquivo da sala')

  function aoMoverPonteiro(e: FederatedPointerEvent) {
    if (!ativo || !arrastando || !ultimoPonto) return
    const agora = mundo.toLocal(e.global)
    const passo = telaParaGrade(agora.x - ultimoPonto.x, agora.y - ultimoPonto.y)
    maquete.mover(arrastando, passo.coluna, passo.linha)
    ultimoPonto = agora
    notificar()
  }

  function aoSoltar() {
    arrastando = null
    ultimoPonto = null
  }

  palco.eventMode = 'static'
  palco.on('pointermove', aoMoverPonteiro)
  palco.on('pointerup', aoSoltar)
  palco.on('pointerupoutside', aoSoltar)

  // Onde colocar uma peça nova: no centro da sala, que é sempre
  // visível — nascer numa quina faria o chefe caçar a peça.
  function centroDaSala(): { coluna: number; linha: number } {
    return {
      coluna: (maquete.sala.colunas - 1) / 2,
      linha: (maquete.sala.linhas - 1) / 2,
    }
  }

  return {
    estado: () => ({
      ativo,
      selecionado: selecionado(),
      passo: PASSOS[indicePasso],
      camada,
      sujo,
      totalMoveis: maquete.moveis.length,
      podeGravar: podeGravarNaFonte(),
      gravando,
      podeDesfazer: pilha.length > 0,
      podeRefazer: pilhaRefazer.length > 0,
      mensagem,
      idSala,
      popupPorta,
    }),

    alternar() {
      ativo = !ativo
      arrastando = null
      aplicarInteratividade()
      notificar()
    },

    selecionar(id) {
      selecionadoId = id
      notificar()
    },

    ciclar(passos) {
      const lista = maquete.moveis
      if (lista.length === 0) return
      const atual = lista.findIndex((m) => m.id === selecionadoId)
      const proximo = (atual + passos + lista.length) % lista.length
      selecionadoId = lista[proximo].id
      notificar()
    },

    mover(coluna, linha) {
      if (!selecionadoId) return
      lembrar(`mover:${selecionadoId}`)
      const p = PASSOS[indicePasso]
      maquete.mover(selecionadoId, coluna * p, linha * p)
      notificar()
    },

    girar(passos) {
      if (!selecionadoId) return
      lembrar(`girar:${selecionadoId}`)
      void maquete.girar(selecionadoId, passos).then(() => notificar())
    },

    mudarAltura(delta) {
      if (!selecionadoId) return
      lembrar(`altura:${selecionadoId}`)
      maquete.mudarAltura(selecionadoId, delta)
      notificar()
    },

    // Volta ao estado anterior sem sair da edição — que é o ponto:
    // errar e corrigir na hora, sem perder o contexto.
    desfazer() {
      viajar(pilha, pilhaRefazer, 'desfazer')
    },

    refazer() {
      viajar(pilhaRefazer, pilha, 'refazer')
    },

    mudarPasso(passos) {
      indicePasso = Math.max(0, Math.min(PASSOS.length - 1, indicePasso + passos))
      notificar()
    },

    adicionar(peca) {
      lembrar(`adicionar:${Date.now()}`)
      const existentes = new Set(maquete.moveis.map((m) => m.id))
      const novo: MovelSala = {
        id: novoId(peca, existentes),
        peca,
        direcao: 'NE' as Direcao,
        ...centroDaSala(),
      }
      void maquete.adicionar(novo).then(() => {
        ligarClique(novo.id)
        const sprite = maquete.spriteDe(novo.id)
        if (sprite) prepararSprite(sprite)
        selecionadoId = novo.id
        notificar()
      })
    },

    copiar() {
      const m = selecionado()
      if (!m) {
        avisar('nada selecionado pra copiar')
        notificar()
        return
      }
      // guarda uma CÓPIA do dado, não a referência: senão continuar
      // arrastando a peça original mudaria o que vai ser colado
      copiado = JSON.parse(JSON.stringify(m)) as MovelSala
      colagens = 0
      avisar(`${rotuloDaPeca(m.peca)} copiada`)
      notificar()
    },

    colar() {
      if (!copiado) {
        avisar('nada copiado ainda')
        notificar()
        return
      }
      lembrar(`colar:${Date.now()}`)
      colagens++
      const existentes = new Set(maquete.moveis.map((m) => m.id))
      // O agente e a porta NÃO vêm junto de propósito:
      //   - agente é exclusivo no conjunto todo de salas; colar
      //     duplicaria alguém que só pode estar num lugar
      //   - uma porta colada nasceria sem espelho do outro lado, ou
      //     seja, um vínculo quebrado que ninguém pediu
      // O resto (direção, altura, apoio) vem, porque é o que faz a
      // cópia ser útil — dois monitores na mesma mesa, por exemplo.
      const { agente: _semAgente, leva: _semPorta, ...resto } = copiado
      const novo: MovelSala = {
        ...resto,
        id: novoId(copiado.peca, existentes),
        // desloca um pouco, e mais a cada colagem seguida: colar três
        // vezes tem que dar três peças visíveis, não uma pilha
        coluna: Number((copiado.coluna + DESLOCAMENTO_COLAGEM * colagens).toFixed(3)),
        linha: Number((copiado.linha + DESLOCAMENTO_COLAGEM * colagens).toFixed(3)),
      }
      void maquete.adicionar(novo).then(() => {
        ligarClique(novo.id)
        const sprite = maquete.spriteDe(novo.id)
        if (sprite) prepararSprite(sprite)
        // já seleciona a cópia: quase sempre o próximo gesto é arrastar
        // ela pro lugar
        selecionadoId = novo.id
        avisar('peça colada')
        notificar()
      })
    },

    remover() {
      if (!selecionadoId) return
      const m = selecionado()
      if (m?.leva) {
        // apagar a peça apagaria a porta junto, e quem estivesse na
        // outra sala perderia o caminho de volta sem perceber
        avisar('esta peça é uma porta — desvincule antes de excluir')
        notificar()
        return
      }
      lembrar(`remover:${selecionadoId}`)
      maquete.remover(selecionadoId)
      selecionadoId = null
      avisar('peça removida')
      notificar()
    },

    atribuirAgente(agenteId) {
      if (!selecionadoId) return
      lembrar(`agente:${selecionadoId}`)
      maquete.atribuirAgente(selecionadoId, agenteId)
      const nome = AGENTES.find((a) => a.id === agenteId)?.nome
      avisar(nome ? `${nome} atribuído a esta peça` : 'agente removido da peça')
      notificar()
    },

    atribuirPorta(salaDestino) {
      if (!selecionadoId) return
      const antes = selecionado()
      if (!antes || antes.leva === salaDestino) return
      // guardado antes da troca: é a sala pra onde esta peça levava até
      // agora, e é lá que mora a outra metade da porta
      const destinoAnterior = antes.leva
      lembrar(`porta:${selecionadoId}`)
      maquete.atribuirPorta(selecionadoId, salaDestino)

      if (salaDestino) {
        const atual = maquete.movel(selecionadoId)
        if (atual) {
          const id = criarPortaEspelhada(idSala, maquete.sala, atual, salaDestino)
          espelhosCriados.push({ sala: salaDestino, id })
        }
        const nome = todasAsSalasDaFonte()[salaDestino]?.nome ?? salaDestino
        avisar(`porta criada — confira em "${nome}"`)
        notificar()
        return
      }

      // Desvincular tem que sair dos DOIS lados: uma passagem de mão
      // única (a outra porta ainda apontando pra cá) é justamente o que
      // não se quer.
      const nomeAnterior = destinoAnterior
        ? (todasAsSalasDaFonte()[destinoAnterior]?.nome ?? destinoAnterior)
        : undefined
      const doOutroLado = destinoAnterior ? desvincularDoOutroLado(idSala, destinoAnterior) : 'nenhum'
      if (doOutroLado === 'ambiguo') {
        // mais de uma porta voltando pra cá: escolher uma no chute
        // desvincularia a errada, então não se escolhe — se diz.
        avisar(`porta desfeita aqui — há mais de uma porta de "${nomeAnterior}" pra cá, desfaça a outra lá`)
      } else if (doOutroLado === 'desfeito') {
        avisar(`porta desfeita dos dois lados`)
      } else {
        avisar('porta desfeita')
      }
      notificar()
    },

    // Apoia a peça selecionada no móvel mais próximo que esteja
    // abaixo dela — é o que faz o abajur ficar "em cima da mesa" e
    // não sumir atrás dela.
    apoiarNoDeBaixo() {
      const m = selecionado()
      if (!m) return
      lembrar(`apoiar:${m.id}`)
      if (m.sobre) {
        maquete.apoiarEm(m.id, null)
        notificar()
        return
      }
      let melhor: MovelSala | null = null
      let menor = Infinity
      for (const outro of maquete.moveis) {
        if (outro.id === m.id || outro.sobre) continue
        const d = Math.hypot(outro.coluna - m.coluna, outro.linha - m.linha)
        // meia casa de tolerância: tem que estar mesmo por cima
        if (d < menor && d < 0.5) {
          menor = d
          melhor = outro
        }
      }
      if (melhor && !maquete.apoiarEm(m.id, melhor.id)) {
        avisar('não dá: isso criaria um apoio circular')
      }
      notificar()
    },

    salvarRascunho() {
      salvarRascunho(idSala, maquete.exportar())
      camada = 'rascunho'
      // NÃO zera o "alterado": rascunho é local, o arquivo do projeto
      // continua sem essas mudanças. Quem zera é gravar na fonte.
      // (o botão continua existindo pra guardar na hora, sem esperar
      // os 600ms do automático)
      // sai da edição: salvar é o fim de uma sessão de trabalho, e
      // deixar o modo ligado esconde a maquete atrás dos painéis
      ativo = false
      arrastando = null
      selecionadoId = null
      aplicarInteratividade()
      avisar('rascunho salvo')
      notificar()
    },

    // Grava no arquivo versionado. Depois disso o Vite vê o arquivo
    // mudar e recarrega a página sozinho — por isso o aviso fica na
    // sessão, pra reaparecer do outro lado.
    gravarNaFonte() {
      if (gravando) return
      gravando = true
      avisar('gravando…')
      notificar()
      void gravarNaFonte(idSala, maquete.exportar())
        .then(() => {
          marcarQueGravou()
          camada = 'fonte'
          referencia = JSON.stringify(maquete.exportar())
          sujo = false
          gravando = false
          ativo = false
          arrastando = null
          selecionadoId = null
          aplicarInteratividade()
          avisar('gravado no arquivo da sala')
          notificar()
        })
        .catch((e: unknown) => {
          gravando = false
          avisar(`falhou: ${e instanceof Error ? e.message : 'erro ao gravar'}`)
          notificar()
        })
    },

    voltarParaFonte() {
      // trava o auto-rascunho: sem isso, o que está na tela seria
      // regravado no caminho da saída e ressuscitaria justamente o que
      // o chefe acabou de mandar descartar
      descartado = true
      window.clearTimeout(timerAutoRascunho)
      descartarRascunho(idSala)
      // e as metades que esta sessão plantou nas OUTRAS salas vão junto
      // — senão sobra uma porta apontando pra cá que não tem mais par
      removerEspelhos(espelhosCriados)
      camada = 'fonte'
      sujo = false
      // recarrega: é mais simples e mais confiável que desfazer
      // móvel por móvel, e o chefe já confirmou que quer descartar
      recarregarDeProposito()
    },

    copiarJson() {
      const texto = JSON.stringify(maquete.exportar(), null, 2)
      void navigator.clipboard
        ?.writeText(texto)
        .then(() => {
          avisar('JSON copiado')
          notificar()
        })
        .catch(() => {
          avisar('não consegui copiar — veja o console')
          console.log(texto)
          notificar()
        })
    },

    destruir() {
      window.clearTimeout(timerMensagem)
      window.clearTimeout(timerAutoRascunho)
      window.removeEventListener('beforeunload', aoSair)
      palco.off('pointermove', aoMoverPonteiro)
      palco.off('pointerup', aoSoltar)
      palco.off('pointerupoutside', aoSoltar)
      marca.destroy()
    },
  }
}
