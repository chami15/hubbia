# Pauta — secretário pessoal (desenho para aprovação)

> **Status:** P1, P2 e P3 **feitas** (2026-11-11, branch `feat/pauta`). P4 em diante: proposta, cada uma espera o próprio "pode".
> Decidido na conversa de 2026-11-11: organizar no tick **e** por botão; três frentes fixas (trabalho, faculdade,
> pessoal), outras depois; uma pergunta por vez, curta; nome **Pauta**. Ordem: banco e backend primeiro, frontend no fim.

## A dor

O chefe toca várias frentes ao mesmo tempo e esquece coisas. **Não quer lembrete**, quer clareza: jogar tudo num lugar
(um "lembra de X" ou cinco textos de contexto sobre uma API) e ter de volta tarefas curtas, um checklist para
acompanhar e uma sugestão objetiva do que fazer a seguir.

## Como funciona (em uma linha por etapa)

1. **Despejar:** o chefe escreve qualquer coisa. O texto é salvo **cru e na hora**, sem LLM.
2. **Organizar:** no tick ou no botão, a Pauta lê os textos pendentes e decide: tarefa nova ou contexto de uma existente,
   qual frente, prazo (se escrito), itens de checklist e, se faltar algo essencial, **uma** pergunta curta.
3. **Consolidar:** a tarefa que recebeu texto novo ganha o "o que já se sabe" atualizado (tópicos curtos).
4. **Sugerir:** no botão "sugestão da Pauta" de uma tarefa: o próximo passo e como fazer, em poucas linhas.
5. **Clarear a vista:** num botão geral: foco (até 3), pode esperar, talvez nem valha. Sempre sugestão, nunca ação.

Nada disso manda aviso. A Pauta não cobra; ela organiza quando é chamada (tick ou botão).

## Padrão de interação (guia §3)

**Forms + cards**, não chat. Entrada é um campo de texto livre (é só gravação), a saída é estruturada (tarefas,
checklist, cards de sugestão e pergunta). Não há conversa de ida e volta: a pergunta é um card com resposta curta.

## Fases

Cada fase é um "pode" separado, com testes e um commit por item. As fases 1 a 5 são backend; a 6 é o frontend.

| Fase | Entrega | LLM? |
|---|---|---|
| **P1** | Banco, registro cru, CRUD de tarefas e checklist, seed das frentes e do agente | não |
| **P2** | Organizar: textos pendentes → tarefas, checklist, prazo, pergunta (botão + tick) | sim, barato, em lote |
| **P3** | Consolidar o contexto de cada tarefa ("o que já se sabe") | sim, barato |
| **P4** | Sugestão da Pauta por tarefa (próximo passo e como) | sim, barato, no botão |
| **P5** | Clarear a vista (foco / pode esperar / talvez nem valha) | sim, no botão |
| **P6** | Painel no frontend + sala e personagem no prédio | não |

P1 já é útil sozinha (dá para usar como checklist por frente sem gastar nada). Cada fase seguinte só acrescenta.

## P1 — Banco (`015_pauta.sql`)

Migration nova, aditiva. Número 015 porque a `feat/relogio-do-mundo` já usa 013 e 014.

```
frentes          id, nome (UNIQUE), ordem, ativa             -- seed: trabalho, faculdade, pessoal
tarefas          id, frente_id, titulo (curto), prazo (date NULL), status (aberta|feita|arquivada),
                 termos (text[]: palavras que identificam a tarefa, ex. "SL", "hubbia"),
                 contexto (text[] NULL: "o que já se sabe", P3), origem (agente|manual),
                 criada_em, atualizada_em, ultimo_movimento_em, concluida_em NULL, oculta (bool), ocultada_em NULL
anotacoes        id, texto, texto_normalizado, tarefa_id NULL,
                 status (nova|lendo|aguardando_voce|organizada|duplicada|falhou), erro NULL,
                 recebida_em, lida_em NULL, organizada_em NULL, duplicada_de NULL
checklist_itens  id, tarefa_id, texto (curto), ordem, feito, feito_em, origem (agente|manual)
perguntas        id, tipo (destino|mesma_tarefa|livre), anotacao_id NULL, tarefa_id NULL, texto,
                 opcoes jsonb (cada opção: rótulo + o que acontece se escolhida), proposta jsonb NULL,
                 resposta NULL, status (na_fila|aberta|respondida|descartada), criada_em
sugestoes        id, tarefa_id NULL (NULL = revisão geral), tipo (proximo_passo|revisao), conteudo jsonb,
                 base_em (timestamp do último movimento considerado), status (ativa|aceita|descartada), criada_em
```

Decisões:
- **Texto cru nunca é apagado nem reescrito.** A organização pode falhar ou errar; o original continua lá.
- **Uma pergunta visível por vez**: índice único parcial `WHERE status = 'aberta'` (o mesmo truque de
  `acoes_pendentes` e dos cards do Norte). As outras dúvidas esperam como `na_fila` e sobem uma a uma, conforme o chefe
  responde. A fila não gasta nada: as dúvidas já saíram da mesma chamada que organizou o lote.
- **Prioridade não é coluna.** É calculada na hora (prazo, há quanto tempo parada, frente), igual ao "estagnado" do Norte.
- **Frentes em tabela**, não `CHECK`: criar uma frente nova depois é um `INSERT`, sem migration.
- Custo não tem coluna aqui: vai para `tick_execucoes`, como todo gasto.
- **Cada fase traz a própria migration** (decidido ao implementar a P1): a 015 cria só `frentes`, `tarefas`,
  `anotacoes` e `checklist_itens`; `perguntas` nasce com a P2 e `sugestoes` com a P4. Criar tudo antes do uso travaria
  o desenho, e migration aplicada não se edita.

### "Já li esse texto?" — o ciclo de um texto (pedido do chefe)

A coluna `anotacoes.status` é o "novo ou lido". O tick e o botão **só olham `nova`**; o resto nunca volta ao LLM sozinho.

```
nova ──(tick ou botão pega)──> lendo ──> organizada        (foi para uma tarefa)
                                    ├──> aguardando_voce   (dúvida: virou pergunta, espera a resposta)
                                    ├──> duplicada         (igual a um texto que já existe)
                                    └──> falhou            (erro do LLM; só volta a `nova` se o chefe pedir)
```

- `checar` do tick é um `SELECT EXISTS (... WHERE status = 'nova')` com índice parcial: sem texto novo, **nada** acontece.
- `lida_em` marca quando a Pauta leu. O texto passa a `lendo` no mesmo `UPDATE ... RETURNING` que o pega
  (`FOR UPDATE SKIP LOCKED`): se o tick e o botão rodarem juntos, nenhum texto é lido duas vezes nem cobrado duas vezes.
- Texto escrito **dentro** de uma tarefa já nasce `organizada`: nunca passa pelo LLM.
- Responder uma pergunta **não chama o LLM**: a proposta (itens de checklist, prazo) já veio na chamada que gerou a
  dúvida e fica guardada em `perguntas.proposta`; a resposta só decide para onde ela vai.

### Quando uma tarefa acaba (pedido do chefe)

Nada é excluído de verdade; sai da vista e fica no histórico.
- **Concluir** (botão na tarefa): `feita`, com `concluida_em`. Continua na lista da frente, marcada como feita, e pode ser reaberta.
- **Deixar de lado** (botão): `arquivada`, para o que perdeu o sentido. Também reabrível.
- **Ocultar** (botão, decisão do chefe em 2026-11-11): só para tarefa `feita` ou `arquivada`. Some da lista principal e
  só volta com "exibir tarefas ocultas", **esmaecida**. É o chefe quem aperta: nada some sozinho. Reabrir uma tarefa
  oculta a desoculta. `oculta` é coluna separada do `status` de propósito: ocultar é arrumação da tela, não muda o que
  aconteceu com a tarefa.
- **Quando o último item do checklist é marcado**, a tarefa mostra "tudo feito, concluir?" com um clique. É uma conta,
  sem LLM, e a Pauta **nunca conclui sozinha**: você pode ter mais coisa a fazer que não está na lista.

Rotas da P1 (**implementadas**, nenhuma chama LLM):

| Rota | Faz |
|---|---|
| `POST /pauta/textos` | salva o texto cru; com `tarefa_id` (escrito dentro da tarefa) já nasce `organizada`, sem LLM |
| `GET /pauta/textos/contagem` | `novas`, `aguardando_voce` e `falhas` (o painel mostra "3 esperando") |
| `GET /pauta/frentes` | as frentes ativas com a contagem de tarefas abertas e o prazo mais próximo |
| `GET /pauta/frentes/{id}/tarefas` | tarefas não ocultas: abertas (prazo mais perto primeiro), depois feitas/deixadas de lado; `?ocultas=true` inclui as ocultas, por último |
| `POST /pauta/tarefas` | criar à mão (frente, título, prazo, termos) |
| `GET /pauta/tarefas/{id}` | tarefa + checklist + até 20 textos originais + `itens_feitos`/`itens_total` + `tudo_feito` |
| `PATCH /pauta/tarefas/{id}` | título, frente, termos, prazo (`"prazo": null` tira; ausente não mexe) |
| `POST /pauta/tarefas/{id}/status` | `feita` (concluir), `arquivada` (deixar de lado), `aberta` (reabrir, desoculta); mesmo status → 409 |
| `POST /pauta/tarefas/{id}/ocultar` / `.../desocultar` | ocultar só `feita` ou `arquivada` (senão 409) |
| `POST /pauta/tarefas/{id}/checklist` | item novo, no fim da lista |
| `PATCH /pauta/checklist/{id}` / `DELETE` | marcar/desmarcar, editar, reordenar; remover |

Tetos de entrada: texto 20 mil caracteres, título 120, item 200, até 20 termos (422 acima disso).
Ficam para a P2, junto com quem os usa: `GET /pauta/perguntas/atual`, `POST /pauta/perguntas/{id}/resposta`,
`POST /pauta/textos/{id}/tentar-de-novo` e `POST /pauta/organizar`.

Agente no `seed.py`: Pauta, especialidade `pauta`, cor `#db2777`, mesa 5, extroversão 4 (organizada e reservada).
Ainda não tem personagem no prédio (P6): o frontend liga agente do banco ao personagem pela especialidade, então até lá
ela simplesmente não aparece.

## P2 — Organizar

**Quando:** botão "organizar agora" (`POST /pauta/organizar`) ou o tick, por um handler em `_HANDLERS_TRABALHO`:
`checar` = existe texto `nova`? (consulta, sem custo). Sem texto novo, nenhuma chamada.

**Antes do LLM, texto repetido igual sai de graça:** `texto_normalizado` (minúsculas, sem acento, pontuação e espaços
extras) igual ao de um texto dos últimos 60 dias → `duplicada`, ligado ao original, sem chamada.

**Uma chamada para o lote** (padrão A, modelo barato). Contexto montado antes:
- os textos pendentes (no máximo 10 por rodada, e no máximo ~12 mil caracteres no total; o resto fica para a próxima);
- as tarefas abertas, só id, frente, título e **termos** (`LIMIT 60`);
- a data de hoje (para entender "sexta que vem").

Saída estruturada, por texto: destino (`tarefa_id` existente **ou** tarefa nova com título, frente e termos),
**confiança** (`certa` ou `duvida`), até 3 candidatos quando houver dúvida, prazo opcional e até 5 itens de checklist.

### Não confundir "API do SL" com "API do hubbia" (pedido do chefe)

A regra é: **na dúvida, pergunta; nunca chuta.** Três camadas, da mais barata para a mais cara:

1. **Termos por tarefa.** Cada tarefa guarda as palavras que a identificam ("SL", "cliente X", "hubbia", "TCC"). Vão no
   contexto, então "endpoint de pedidos do SL" tem onde se apoiar. A Pauta propõe os termos ao criar a tarefa e o chefe
   pode editar.
2. **O LLM declara a confiança.** Se marcar `duvida`, o texto não é encaixado: vira pergunta.
3. **Trava em código, que não depende do LLM.** Mesmo com `certa`, vira pergunta se:
   - o texto cita um termo que aparece em tarefas de **frentes diferentes** (ex.: só "API", e há API no trabalho e no hubbia);
   - o destino escolhido não compartilha nenhum termo nem palavra com o texto;
   - a "tarefa nova" tem título muito parecido com uma aberta (ver duplicados abaixo).

A pergunta é um **formulário curto**, não texto livre: "'Mapear os endpoints de pedidos' é de qual?" com as opções
(as tarefas candidatas, "tarefa nova em Trabalho/Faculdade/Pessoal"). Um clique resolve.
**A resposta ensina:** o termo que separou os casos entra nos `termos` da tarefa escolhida, e da próxima vez a Pauta
não precisa perguntar de novo.

### A mesma coisa dita duas vezes com outras palavras (pedido do chefe)

| Caso | Como | Custo |
|---|---|---|
| Texto idêntico (ou só muda acento/pontuação) | `texto_normalizado` igual → `duplicada` | zero, antes do LLM |
| Mesma tarefa com outro nome ("ver a API do SL" e "analisar endpoints do SL") | o LLM vê os títulos e termos abertos e aponta a existente; trava em código: título novo parecido com um aberto da mesma frente (similaridade de texto, `difflib`, sem dependência nova) → pergunta "é a mesma que X?" | já incluso na chamada |
| Item de checklist repetido com outras palavras | comparado com os itens da tarefa (normalizado + similaridade); parecido demais → descartado | zero |
| Informação repetida no contexto (P3) | a consolidação recebe o contexto atual e reescreve os tópicos: o repetido se funde, não duplica | já incluso |

O texto original repetido nunca some: fica ligado à tarefa, e o `duplicada_de` mostra de qual era a cópia.

Guardrails (todos em código, não no prompt):
- `tarefa_id` tem que existir e estar aberta; frente tem que ser uma das ativas. Se não, o texto fica `falhou` com o
  motivo, e nada pela metade é gravado (transação por lote).
- Título truncado em 80 caracteres, item em 120, pergunta em 140. Lista cortada no máximo em código.
- Item igual a um que já existe na tarefa (comparação normalizada) é descartado.
- **Item que o chefe já marcou ou escreveu nunca é alterado** pela Pauta: ela só acrescenta.
- Dúvidas do lote viram perguntas `na_fila` (no máximo 5 por lote; texto além disso fica `nova` para a próxima rodada).
- **Segredos mascarados antes de sair do banco:** padrões de token e chave (`sk-...`, `ghp_...`, `Bearer ...`,
  `api_key=...`, sequências longas aleatórias) viram `[segredo]` no texto enviado ao LLM. O original fica só no banco.
- Uma tentativa só; falhou → os textos ficam `falhou` com o erro visível. O tick **não** pega `falhou`; só o botão
  "tentar de novo" do chefe devolve para `nova`.
- Limite próprio por dia para rodadas automáticas no tick (proposta: 10), além do orçamento diário geral.

### P2 como ficou (implementada)

Rotas novas (só a primeira chama LLM, e só por clique):

| Rota | Faz |
|---|---|
| `POST /pauta/organizar` | uma rodada: devolve `lidos`, `organizados`, `perguntas`, `duplicados`, `falhas`, `devolvidos`, `chamou_llm`. Sem texto novo responde na hora (mesmo sem orçamento); com texto e sem orçamento, 409 |
| `GET /pauta/perguntas/atual` | a pergunta visível (ou `null`), com o texto original já mascarado, as opções (só `indice` e `rotulo`) e quantas esperam na fila |
| `POST /pauta/perguntas/{id}/resposta` | `{"opcao": n}`: aplica sem LLM, ensina os termos e devolve a tarefa e a próxima pergunta. Já respondida → 409; opção inexistente → 422 |
| `GET /pauta/textos/falhas` | os textos que falharam, com o motivo |
| `POST /pauta/textos/{id}/tentar-de-novo` | `falhou` → `nova` (só o chefe faz isso) |

Decisões tomadas ao implementar:
- **Leitura que caiu no meio** (texto preso em `lendo` há mais de 10 min) vira `falhou`, não `nova`: voltar sozinho
  seria retentativa automática.
- **Em dúvida, nada é validado como destino**: o LLM costuma não apontar tarefa quando está em dúvida, e isso não pode
  virar falha (era um bug, coberto por `test_regressao_duvida_sem_tarefa_apontada_...`).
- **No tick, a Pauta não manda mensagem ao chefe** (o handler devolve `None`): o resultado aparece no painel.
  O teto do dia conta todas as chamadas da Pauta, inclusive as do botão; o botão continua funcionando depois do teto
  (só o orçamento geral o bloqueia).
- Tipos de pergunta: `destino` e `mesma_tarefa` (o `livre` do desenho saiu: toda dúvida até aqui tem opções).
- Partes frágeis com teste próprio: `tests/test_pauta_regras.py` (segredo, repetido, ambiguidade, sem banco) e
  `tests/test_pauta_organizar.py` (fluxo com Postgres real, LLM simulado). Inclui a regressão dos itens que só mudam
  o número ("Ler capítulo 3" x "Ler capítulo 4").
- `utils/transacao.py`: várias queries em uma transação (tudo ou nada), usado para gravar o lote e a resposta.

## P3 — Consolidar o contexto

Para cada tarefa que recebeu texto novo na rodada (no máximo 3 por rodada): uma chamada com **o contexto atual +
só os textos novos** (nunca o histórico inteiro). Saída: até 6 tópicos curtos ("Endpoint /pedidos: lista com paginação,
útil para a tabela X"). Cada tópico guarda de quais textos veio, para o chefe conferir se nada foi inventado.

### P3 como ficou (implementada)

- **Tópicos em tabela própria** (`contexto_topicos`, migration 017), cada um com `fontes` (os ids dos textos de onde
  saiu). A coluna `tarefas.contexto` da 015 ficou sem uso: não guardava a origem. `GET /pauta/tarefas/{id}` devolve os
  tópicos em `contexto`.
- **Quando roda:** o "organizar agora" e o tick fazem as duas coisas (organizar e depois atualizar o contexto). Botão
  próprio na tarefa: `POST /pauta/tarefas/{id}/contexto` (sem texto novo, devolve o atual sem gastar).
- **O que vai para o LLM:** o título, os tópicos atuais e **só os textos novos** daquela tarefa (`anotacoes.consolidada_em`
  é o "já entrou no contexto?"), até 8 mil caracteres; o resto fica para a próxima rodada. Até 3 tarefas por rodada.
- **Não gasta com:** lembrete curto (menos de 80 caracteres) que a P2 já virou título ou item. Texto escrito dentro da
  tarefa pelo chefe sempre entra, mesmo curto.
- **Validação em código:** tópico sem fonte real (ou com fonte inventada) é descartado; repetido se funde somando as
  fontes; até 6 tópicos de 140 caracteres. Resposta vazia quando já havia contexto: mantém o anterior e marca erro.
- **Falha não volta sozinha:** o texto fica com `consolidacao_erro` e o tick não tenta de novo. Volta junto quando
  chegar outro texto para a mesma tarefa, ou pelo botão "atualizar".
- **Duas rodadas ao mesmo tempo** (tick e botão) não consolidam a mesma tarefa: reserva por tarefa
  (`consolidando_desde`), que expira em 10 min se a rodada cair.
- O teto do dia (`PAUTA_RODADAS_POR_DIA`) conta organizar e consolidar juntos; o tick para nele, o botão não.

## P4 — Sugestão da Pauta (por tarefa)

Botão dentro da tarefa. Saída curta e fixa:
- **próximo passo** (uma frase, até 100 caracteres);
- **como** (até 3 passos, cada um com até 90 caracteres);
- **por que agora** (uma frase).

Checagem antes de gastar: se nada mudou na tarefa desde a última sugestão (`base_em`), devolve a mesma, sem chamada.
O chefe pode aceitar (vira item no topo do checklist) ou descartar.

## P5 — Clarear a vista

Botão geral. Primeiro a conta determinística (prazo, tempo parada, tamanho do checklist pendente); depois uma chamada
com as tarefas abertas resumidas (título, frente, prazo, dias parada, progresso; `LIMIT 40`). Saída:
- **foco:** até 3, cada um com o porquê em uma frase;
- **pode esperar:** até 5;
- **talvez nem valha:** até 3, com a ação sugerida (arquivar, juntar com outra, adiar).

Tudo é sugestão: cada item tem "aceitar" ou "descartar". Juntar duas tarefas só acontece depois do clique.

## P6 — Painel (e por que não dropdown nem tela nova)

**Navegação em níveis dentro do próprio painel**, com um "voltar" e o caminho no topo (`Trabalho › Avaliar a API`):

```
nível 1  as 3 frentes, cada uma com o número de tarefas abertas      [campo "despejar" sempre no topo]
nível 2  tarefas da frente: uma linha cada (título, prazo, progresso 2/5)
nível 3  a tarefa: checklist (marcar, adicionar), "o que já se sabe", botão "sugestão da Pauta",
         textos originais recolhidos no fim
```

- **Por que não uma tela nova:** no hub o painel abre por cima do prédio e a barra do topo nunca some. Tela nova quebraria
  esse padrão (e esconderia os agentes trabalhando).
- **Por que não dropdown/acordeão:** com checklist, contexto e sugestão, a tarefa aberta empurra as outras para fora da
  tela e a lista vira uma sopa. Um nível por vez mantém tudo curto, que é o que o chefe pediu.
- A pergunta aberta aparece como **uma linha** acima de tudo, com resposta em um clique (opções) ou poucas palavras.
- Painel **largo** (tem formulário e listas). Detalhe visual fica para quando a P6 começar, com mock antes de codar.

No prédio: sala própria com quadro de post-its, arquivo e mesa com pastas; o personagem aparece "trabalhando" enquanto
organiza. Segue a receita do `AGENTS.md` do prédio.

## Testes por fase

- **P1:** CRUD com Postgres real; texto escrito dentro da tarefa já nasce `organizada`; concluir/deixar de lado/reabrir;
  "tudo feito, concluir?" aparece só com o checklist inteiro marcado; ocultar só feita/arquivada, oculta fora da lista
  padrão e de volta com `ocultas=true`, reabrir desoculta; tabelas novas em `conftest._TABELAS`.
- **P2:** sem texto `nova` → LLM não é chamado (`call_count == 0`); texto repetido → `duplicada` sem chamada; tick e
  botão ao mesmo tempo não leem o mesmo texto; `tarefa_id` inventado → `falhou` e nada gravado; termo em duas frentes →
  pergunta mesmo com confiança `certa`; título parecido → pergunta "é a mesma?"; responder não chama o LLM e grava o termo;
  item repetido descartado; item do chefe intacto; só uma pergunta `aberta`; segredo mascarado no prompt; `falhou` não
  volta sozinho; gasto em `tick_execucoes`; tick respeita o limite diário.
- **P3–P5:** saída truncada em código; sem mudança → sem chamada; contexto com `LIMIT`.
- **P6:** Vitest para a lógica de ordenação/navegação; navegador com console limpo.

## Fora de escopo agora (vai para o backlog com o porquê)

Anexos e áudio; criar evento na Agenda a partir de um prazo (sistema externo, exige `acoes_pendentes`); subtarefas em
vários níveis; busca semântica (a busca de texto do Postgres basta no começo); frentes criadas pelo chefe na tela
(a tabela já permite, a tela vem depois); qualquer notificação.

## Custo esperado

Modelo barato em todas as chamadas. Um lote de 10 textos é da ordem de milhares de tokens: fração de centavo de dólar.
O que mais pesa é o uso real; por isso o lote, o limite diário no tick e a checagem "nada mudou → não chama".
