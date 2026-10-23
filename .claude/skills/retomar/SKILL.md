---
name: retomar
description: "Retoma o trabalho numa conversa nova: mostra em que branch está, o que mudou desde o último marco e o que falta na sprint atual. Use quando o chefe perguntar \"onde paramos?\" ou ao começar uma sessão sem contexto."
---

Objetivo: orientar em poucos minutos **sem ler os docs inteiros** e sem inventar.

1. Estado do git (não confie na memória): `git fetch --all -q`, `git branch -vv`, `git status -sb`, `git log --oneline -8`.
   Para cada branch relevante veja a data e o último commit (`git for-each-ref --sort=-committerdate refs/remotes --format='%(committerdate:short) %(refname:short) %(subject)'`).
   Compare com a tabela de `AGENTS.md` / `docs/mapa-de-branches.md`; se divergir, **o git manda** e avise que o doc está velho.
2. Sprint atual: `grep -n "^### Sprint\|O que falta" docs/produto-e-sprints.md` e leia só a seção "O que falta" da sprint **em andamento**.
   Se existir `docs/sprint-2-roteiro.md` nesta branch, leia só "Decisões que dependem do chefe antes de começar" (é proposta, não aprovada).
3. Pontas soltas: `git log -5 --format='%h %s'` na branch atual e qualquer "decisão em aberto" citada nos commits ou docs tocados por eles.
4. Responda em até ~15 linhas: branch atual e de onde saiu · o que existe e funciona · o que está em andamento · o que falta · **uma pergunta** ao chefe sobre o próximo passo.
   Diga explicitamente o que você **não** conferiu (ex.: não rodou testes, não subiu o backend).
