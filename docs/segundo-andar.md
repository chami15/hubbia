# Segundo andar (andares no prédio)

> **Status:** feito (2026-11-12, branch `feat/andares`). Pedido e decisões do chefe na conversa de 2026-11-11/12.

## O que o chefe pediu

- Um andar por vez na tela; o hall do elevador **em um canto diferente** em cada andar; copa não é obrigatória
  em todo andar (o 2º tem a sua).
- Seletor "como se estivesse entrando num elevador": clicar no elevador abre uma tela menor para escolher o andar,
  com animação na troca.
- Agentes vão a outros andares pelo elevador para falar com alguém: vão até o elevador, entram, a porta fecha e eles
  aparecem no outro andar.
- O 2º andar começa **vazio**, esperando o agente de investimentos (`docs/investimentos-proposta.md`).
- Mesma disposição nos dois andares: **6 salas em cada** (3 em cima, 3 embaixo; antes o térreo crescia de 2 em 2 e o 2º tinha 4).
  Lista salva com mais salas (o térreo já aceitou 8): quem sobra vai para a primeira vaga livre de outro andar, ninguém some.
- Código pronto para **mais andares**, sem bug nas transições.
- Pergunta do chefe: os outros andares param quando não estão na tela? **Não**: todos os andares rodam o tempo todo
  (`edificio.ts`); só o desenho é do andar visível. Se parassem, a visita que vem de outro andar congelaria no meio do
  caminho e o almoço sairia fora de hora. Custo desprezível (contas de posição, sem LLM, sem desenho).

## Como ficou

| Peça | Papel |
|---|---|
| `andares.ts` | **Mesma disposição em todo andar** (decisão do chefe, 2026-11-12): 6 salas fixas, sempre desenhadas (as livres viram vaga), mesma largura. Térreo: núcleo à esquerda, recepção em cima, copa embaixo. 2º andar: núcleo à **direita**, hall **embaixo**, copa em cima. |
| `predio.ts` | `montarPredio(vagas, andar)` monta qualquer andar; os elevadores saem do modelo do hall (não mais duas posições fixas). |
| `sim.ts` | `viajar` / `receberViajante`: viagem pelo elevador levando a visita junto; fora do próprio andar, o agente só visita e volta. Andar sem copa almoça fora. |
| `edificio.ts` | Uma simulação por andar, todas vivas; entrega quem chega de elevador (tempo proporcional à distância); vagas e obras por andar. |
| `mundo.ts` | Só a câmera: desenha o andar visível; clique no elevador avisa a tela. |
| `Elevador.tsx` + `useElevador.ts` + `trocaDeAndar.ts` | Painel do elevador (visor âmbar, um botão por andar, aviso de quem precisa de você), portas de aço que fecham com o mostrador "▲ 2" e abrem no andar novo, indicador de andar no canto. |
| `vagas.ts` | Vagas por andar no navegador; o formato antigo (só o térreo) é convertido sem perder a arrumação. |

Abrir pelo painel do prédio um agente que está em outro andar leva até ele pelo elevador.

## Testes (o que protege as transições)

- `andares.test.ts`: toda sala em toda vaga de todo andar; elevadores alcançáveis; hall em canto diferente; largura
  fixa com núcleo à direita; porta nunca embaixo de item de parede.
- `viagem.test.ts`: nunca em dois lugares; chega na porta do elevador (sem teleporte); conversa e volta para a mesa;
  anfitrião espera; dispensado no outro andar ou na volta vai embora sem passar por casa; andar sem copa almoça fora.
- `edificio.test.ts`: andar escondido não congela; visita entre andares; status chega a quem está no elevador;
  dispensar dentro do elevador; vagas por andar.
- `trocaDeAndar.test.ts`: o andar só troca com as portas fechadas; clique no meio é ignorado.
- `vagas.test.ts`: conversão do formato antigo (regressão), repetidos entre andares, lixo.

Não coberto por teste automático: a visita entre andares **no navegador** a partir de uma mensagem social real (a
lógica está testada; ver com o backend no ar).
