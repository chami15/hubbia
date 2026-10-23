# Mapa de branches

> Fotografia de **2026-10-23**. Pode estar velha: **o git manda**. Para refazer em dois minutos:
>
> ```bash
> git fetch --all -q
> git for-each-ref --sort=-committerdate refs/remotes --format='%(committerdate:short) %(refname:short) %(subject)'
> git merge-base --is-ancestor <A> <B> && echo "A está dentro de B"
> git rev-list --left-right --count <A>...<B>      # commits só em A / só em B
> ```

## Quem é quem

```
main ── Sprint 0 fechada (backend + docs, sem frontend)                              2026-07-22
 │
 ├─ claude/agents-hub-mvp-review-oh6zb0 ── frontend em construção (obsoleta, ancestral de `frontend`)
 │
 └─ frontend ── escritório isométrico + redesenho "Console" + Sprint 2 parcial          2026-08-25
     │          (tick_execucoes ligada, Motriz, sala de máquinas, roteiro da Sprint 2)
     │
     ├─ feat/predio-pixel ── prédio em pixel art no lugar do isométrico (+ arquivos de suporte a IA)   atual
     │
     └─ [12/08, commit 10bb203] ── feat/the-sims ── modo simulação 3D (three.js), trabalho do chefe     2026-10-20
                                      └─ claude/modest-wright-cmvki7 ── + pente fino, docs e modelos Blender   2026-10-22

main ── test/hubblaud ── estudo do habblaud + protótipo standalone `prototipos/predio-pixel`            2026-10-22
```

| Branch | Frontend | Backend | Notas |
|---|---|---|---|
| `main` | — | Sprint 0 completa | Base de `frontend` e `test/hubblaud`. Receberia os arquivos de suporte a IA para valerem em toda branch nova. |
| `frontend` | Isométrico, PixiJS, modo de edição, sprites do Kenney | + `tick_execucoes` ligada, Motriz, `/infra/*` | Última linha com o backend da Sprint 2. |
| `feat/predio-pixel` | **Prédio pixel** (arte do habblaud), painéis intactos | igual à `frontend` | Frontend atual. Removeu PixiJS, editor de salas e sprites isométricos (seguem na `frontend`). |
| `feat/the-sims` | 3D estilo The Sims 4 (personagens e móveis 3D) | **sem** Motriz/`tick_execucoes` ligada | Experimento do chefe, parte da `frontend` em 12/08. |
| `claude/modest-wright-cmvki7` | 3D + modelos Blender + personalização dos 4 agentes | igual à `the-sims` | Contém tudo da `the-sims`. |
| `test/hubblaud` | só o protótipo em `prototipos/` | igual à `main` | Referência do estudo; sem alterar o frontend. |

## O que isso significa na prática

- **Linhas de frontend conflitam.** Isométrico, 3D e pixel reescrevem `Escritorio.tsx`, `index.css` e `docs/guia-tecnico-frontend.md`. Qual segue é decisão do chefe; não misture sem perguntar.
- **O 3D não tem o backend novo.** Para juntar 3D e Sprint 2 é preciso trazer os commits do Motriz (`0d91941`, `bebd563`, `685625a`) e resolver `docs/`.
- **Base de uma branch nova:** frontend com sala de máquinas → `frontend` ou `feat/predio-pixel`; só backend/docs → `main`; 3D → `claude/modest-wright-cmvki7`. Em dúvida, pergunte.
- **`docs/sprint-2-roteiro.md`** só existe na linha `frontend` (e `feat/predio-pixel`). **`docs/estudo-habblaud.md`**, em `test/hubblaud` e `feat/predio-pixel`.

## Arquivos de suporte a agentes de IA (`AGENTS.md`, `CLAUDE.md`, `.claude/`)

Foram criados na `feat/predio-pixel`, em **dois commits separados** para poderem ser levados a outras branches:

1. *commit "comum"*: `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `backend/CLAUDE.md`, `.claude/agents/{backend-agente,revisor-hub}.md`, `.claude/skills/{retomar,novo-agente,verificar-visual}`, este mapa. Vale para **qualquer branch** (o frontend específico é descrito por `frontend/AGENTS.md`, que só existe onde o frontend corresponde).
2. *commit "prédio pixel"*: `frontend/AGENTS.md`, `frontend/src/features/predio/AGENTS.md`, `.claude/agents/predio-pixel.md`.

Para levar o primeiro à `main`: `git switch -c suporte-ia origin/main && git cherry-pick <sha do commit comum>`.
Quando uma branch de outra linha (isométrica, 3D) for retomada, ela precisa do **próprio** `frontend/AGENTS.md`, escrito por quem conhece aquele frontend.
