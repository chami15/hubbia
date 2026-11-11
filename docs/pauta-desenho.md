# Pauta — secretário pessoal (desenho para aprovação)

> **Status:** proposta, **sem "pode"** ainda. Nada de código antes da aprovação da fase.
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
                 contexto (text[] NULL: "o que já se sabe", P3), origem (agente|manual),
                 criada_em, atualizada_em, ultimo_movimento_em
anotacoes        id, texto, tarefa_id NULL, status (pendente|organizada|falhou), erro NULL,
                 recebida_em, organizada_em NULL
checklist_itens  id, tarefa_id, texto (curto), ordem, feito, feito_em, origem (agente|manual)
perguntas        id, tarefa_id NULL, anotacao_id NULL, texto, opcoes text[] NULL, resposta NULL,
                 status (aberta|respondida|descartada), criada_em
sugestoes        id, tarefa_id NULL (NULL = revisão geral), tipo (proximo_passo|revisao), conteudo jsonb,
                 base_em (timestamp do último movimento considerado), status (ativa|aceita|descartada), criada_em
```

Decisões:
- **Texto cru nunca é apagado nem reescrito.** A organização pode falhar ou errar; o original continua lá.
- **Uma pergunta aberta por vez, no total**: índice único parcial `WHERE status = 'aberta'` (o mesmo truque de
  `acoes_pendentes` e dos cards do Norte). O resolver checa antes; o índice é só a rede de segurança.
- **Prioridade não é coluna.** É calculada na hora (prazo, há quanto tempo parada, frente), igual ao "estagnado" do Norte.
- **Frentes em tabela**, não `CHECK`: criar uma frente nova depois é um `INSERT`, sem migration.
- Custo não tem coluna aqui: vai para `tick_execucoes`, como todo gasto.

Rotas (todas sem LLM em P1):

| Rota | Faz |
|---|---|
| `POST /pauta/anotacoes` | salva o texto cru (opcional `tarefa_id`: escrito dentro da tarefa já nasce organizado, **sem LLM**) |
| `GET /pauta/frentes` | as frentes com a contagem de tarefas abertas |
| `GET /pauta/frentes/{id}/tarefas` | tarefas abertas da frente, na ordem calculada |
| `GET /pauta/tarefas/{id}` | tarefa + checklist + contexto + textos originais (`LIMIT`) + sugestão ativa |
| `POST /pauta/tarefas` / `PATCH /pauta/tarefas/{id}` | criar à mão; renomear, mudar frente ou prazo, concluir, arquivar, reabrir |
| `POST /pauta/tarefas/{id}/checklist` / `PATCH /pauta/checklist/{id}` | item novo; marcar, editar, reordenar, remover |
| `GET /pauta/pendentes` | quantos textos esperam organização (o painel mostra "3 esperando") |

Agente no `seed.py`: nome Pauta, especialidade `pauta`, extroversão a decidir (proponho 4: organizada e reservada).

## P2 — Organizar

**Quando:** botão "organizar agora" (`POST /pauta/organizar`) ou o tick, por um handler em `_HANDLERS_TRABALHO`:
`checar` = existe texto pendente? (consulta, sem custo). Sem pendente, nenhuma chamada.

**Uma chamada para o lote** (padrão A, modelo barato). Contexto montado antes:
- os textos pendentes (no máximo 10 por rodada, e no máximo ~12 mil caracteres no total; o resto fica para a próxima);
- as tarefas abertas, só id, frente e título (`LIMIT 60`);
- a data de hoje (para entender "sexta que vem").

Saída estruturada, por texto: destino (`tarefa_id` existente **ou** tarefa nova com título e frente), prazo opcional,
até 5 itens de checklist novos, e no máximo uma pergunta para o lote.

Guardrails (todos em código, não no prompt):
- `tarefa_id` tem que existir e estar aberta; frente tem que ser uma das ativas. Se não, o texto fica `falhou` com o
  motivo, e nada pela metade é gravado (transação por lote).
- Título truncado em 80 caracteres, item em 120, pergunta em 140. Lista cortada no máximo em código.
- Item igual a um que já existe na tarefa (comparação normalizada) é descartado.
- **Item que o chefe já marcou ou escreveu nunca é alterado** pela Pauta: ela só acrescenta.
- Já existe pergunta aberta? A nova é descartada, sem erro.
- **Segredos mascarados antes de sair do banco:** padrões de token e chave (`sk-...`, `ghp_...`, `Bearer ...`,
  `api_key=...`, sequências longas aleatórias) viram `[segredo]` no texto enviado ao LLM. O original fica só no banco.
- Uma tentativa só; falhou → os textos voltam a `pendente` com o erro visível, e o chefe decide tentar de novo.
- Limite próprio por dia para rodadas automáticas no tick (proposta: 10), além do orçamento diário geral.

## P3 — Consolidar o contexto

Para cada tarefa que recebeu texto novo na rodada (no máximo 3 por rodada): uma chamada com **o contexto atual +
só os textos novos** (nunca o histórico inteiro). Saída: até 6 tópicos curtos ("Endpoint /pedidos: lista com paginação,
útil para a tabela X"). Cada tópico guarda de quais textos veio, para o chefe conferir se nada foi inventado.

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

- **P1:** CRUD com Postgres real; texto escrito dentro da tarefa não fica pendente; tabelas novas em `conftest._TABELAS`.
- **P2:** sem pendente → LLM não é chamado (`call_count == 0`); `tarefa_id` inventado → `falhou` e nada gravado; item
  repetido descartado; item do chefe intacto; segunda pergunta descartada; segredo mascarado no prompt; falha → volta a
  pendente; gasto em `tick_execucoes`; tick respeita o limite diário.
- **P3–P5:** saída truncada em código; sem mudança → sem chamada; contexto com `LIMIT`.
- **P6:** Vitest para a lógica de ordenação/navegação; navegador com console limpo.

## Fora de escopo agora (vai para o backlog com o porquê)

Anexos e áudio; criar evento na Agenda a partir de um prazo (sistema externo, exige `acoes_pendentes`); subtarefas em
vários níveis; busca semântica (a busca de texto do Postgres basta no começo); frentes criadas pelo chefe na tela
(a tabela já permite, a tela vem depois); qualquer notificação.

## Custo esperado

Modelo barato em todas as chamadas. Um lote de 10 textos é da ordem de milhares de tokens: fração de centavo de dólar.
O que mais pesa é o uso real; por isso o lote, o limite diário no tick e a checagem "nada mudou → não chama".
