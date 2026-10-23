---
name: novo-agente
description: "Conduz a criação de um agente novo de ponta a ponta no hubbia (desenho aprovado, backend, painel, personagem e sala no prédio pixel, testes, docs). Use quando o chefe quiser adicionar um agente ou domínio novo."
argument-hint: "[nome e ideia do agente]"
---

O processo é **debater → aprovar → implementar → testar → documentar** e a ordem importa. Referência completa: `docs/guia-criacao-de-agentes.md` (leia inteiro uma vez).

## 1. Debate (você e o chefe, na conversa principal; use plan mode)
Não escreva código. Traga **propostas com contraproposta**, cobrindo: dado (tabelas) · **padrão de interação** (dashboard / forms / cards / chat roteado / chat com tools; chat livre só com justificativa forte) ·
onde entra LLM e onde é determinístico (padrão A por padrão) · ação em sistema externo? (confirmação humana obrigatória) · **o guardrail do domínio** ("o que impede de gastar dinheiro ou gerar lixo?") ·
proatividade no tick (`custa_llm`?) · o que fica **fora** agora (vai para `docs/backlog-futuro.md`, com o porquê) · visual: personagem, cor, sala.
Termine com um resumo curto e peça o **"pode" explícito**. Sem ele, pare aqui.

## 2. Backend (delegue ao subagente `backend-agente`, passando o desenho aprovado)
Migration, SQL, agente de LLM, resolver, router, seed, `main.py`, `_HANDLERS_TRABALHO`, `conftest._TABELAS`, testes. Exija a saída do `pytest`.

## 3. Frontend
- Painel do agente: hook + api + `types/` + componente lazy em `frontend/src/features/<dominio>/`, ligado em `PainelDoAgente.tsx`. Siga `frontend/AGENTS.md` (padrão "Console", RNF01/02/07).
- Personagem e sala: delegue ao subagente `predio-pixel` (`agentes.ts` + `salas.ts`; a `especialidade` tem de bater com o seed).

## 4. Prova
Bug achado no caminho: use `/corrigir-bug` (teste de regressão antes da correção).
`pytest` · `npm test && npm run build && npm run lint` · navegador com `/verificar-visual` · depois `revisor-hub` sobre o diff. Só então diga "pronto", listando o que **não** foi testado.

## 5. Documente
`docs/backlog-futuro.md` (o que ficou para depois) · `docs/frontend-design.md` (padrão de interação do agente) · `docs/produto-e-sprints.md` se mudou o panorama · tabela de agentes em `AGENTS.md` se o time de agentes mudou.
