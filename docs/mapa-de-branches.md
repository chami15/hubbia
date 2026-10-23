# Mapa de branches — experimentos a integrar

> **Nenhuma branch é definitiva.** A maioria são **testes separados** que o chefe e os agentes vão mudar e integrar aos poucos.
> Este mapa diz o que cada experimento **tem de bom para colher** e como integrar sem sofrimento.
>
> Fotografia de **2026-10-23**. Pode estar velha: **o git manda**. Para refazer em dois minutos:
>
> ```bash
> git fetch --all -q
> git for-each-ref --sort=-committerdate refs/remotes --format='%(committerdate:short) %(refname:short) %(subject)'
> git merge-base --is-ancestor <A> <B> && echo "A está dentro de B"
> git rev-list --left-right --count <A>...<B>      # commits só em A / só em B
> ```
>
> Mexeu numa branch ou criou uma? **Atualize este arquivo**: propósito, base e o que vale colher.

## Genealogia

```
main ── Sprint 0 fechada + arquivos de suporte a IA                                         v0.2.0 / v0.2.1
 │
 ├─ claude/agents-hub-mvp-review-oh6zb0 ── REDUNDANTE (ancestral de `frontend`)             arquivo/mvp-review-frontend-inicial
 │
 └─ frontend ── escritório isométrico + "Console" + Sprint 2 parcial no backend             v0.3.0
     │
     ├─ feat/predio-pixel ── prédio em pixel art: frontend PRINCIPAL                        v0.4.0
     │
     └─ [12/08, 10bb203] ── feat/the-sims ── REDUNDANTE (ancestral da modest-wright)        arquivo/the-sims-3d
                               └─ claude/modest-wright-cmvki7 ── 3D (Sims) + Blender        3d/v0.1

main ── test/hubblaud ── estudo do habblaud + protótipo standalone                          arquivo/hubblaud-prototipo
```

## Situação de cada branch (revisão de 2026-10-23)

Saúde medida com Postgres real: backend `pytest`; frontend `tsc -b` + `vitest` + `vite build`. Todas passam.

| Branch | Testes | Decisão | Por quê |
|---|---|---|---|
| `main` | back 105 ✓ | Base. Falta receber o backend da Sprint 2 | Sprint 0 + arquivos de suporte a IA |
| `frontend` | back 138 ✓ · front 127 ✓ | **Linha isométrica encerrada** (tag `v0.3.0`). Manter **até** o backend da Sprint 2 chegar à `main` | O isométrico era um teste. O backend dela (`tick_execucoes`, Motriz, `/infra/*`) aplica limpo sobre a `main` e passa 138 testes. |
| `feat/predio-pixel` | back 138 ✓ · front 24 ✓ | **Frontend principal** (tag `v0.4.0`) | Tem tudo da `frontend` menos o mundo isométrico (auditado, ver abaixo). Bundle de 488 kB, sem `pixi.js` nem `three.js`. |
| `claude/modest-wright-cmvki7` | back 115 ✓ · front 169 ✓ | **Mantida** como linha 3D separada (tag `3d/v0.1`) | Laboratório do 3D imersivo. O que aproveitar dela no prédio: `docs/aproveitamento-the-sims.md`. Peso: `.glb` de 16,7 MB no git, bundle de 2,2 MB. |
| `claude/agents-hub-mvp-review-oh6zb0` | — | **Apagar** (aprovado pelo chefe) | 0 commits únicos |
| `feat/the-sims` | — | **Apagar** (aprovado pelo chefe) | 0 commits únicos |
| `test/hubblaud` | — | **Arquivar e apagar**, depois de 2 passos (abaixo) | O protótipo é versão antiga do que está integrado |

### Auditoria `frontend` → `feat/predio-pixel`

- **Removido, de propósito** (tudo do mundo isométrico): cena, maquete, editor de salas (tecla E), catálogo de móveis, menu de salas, portas, salas em JSON, âncoras, sprites do Kenney (560), plugin do Vite e os 8 testes dessas peças.
- **Intacto:** os quatro painéis dos agentes, mensagens, configurações, sala de máquinas, toasts, som, `dry_run`, `api/`, `hooks/` e `types/`.
- **Contrato:** as 45 chamadas do frontend têm rota no backend (conferido por script). 3 rotas do backend o frontend não usa (`/mensagens/caixa-de-entrada`, `/norte/projetos/{id}`, `PATCH .../status`); já era assim na `frontend`.
- **Uma perda real encontrada e corrigida:** `pensando` e `executando` tinham animação própria no escritório isométrico e no prédio viraram o mesmo "trabalhando". Corrigido com teste de regressão (`status.test.ts`).
- **Sobra:** `frontend/public/agentes/*.png` (retratos antigos, sem uso desde que o retrato virou o busto pixel). Decisão do chefe: apagar ou reaproveitar.
- **Não portado, por decisão (era do isométrico):** editor de salas. No prédio as salas são código (`salas.ts`).

### `test/hubblaud`: recomendação

O protótipo é subconjunto do que está na `feat/predio-pixel` (sem Motriz, relógio, `status.ts` nem testes) e o estudo é idêntico. Só duas coisas valem antes de arquivar:

1. **Portar a vitrine da arte** (`prototipos/predio-pixel/src/catalogo.ts`): página de desenvolvimento com agentes, 20 poses, itens, 46 móveis, ícones, telas, pisos, paredes e as salas. É a única peça do protótipo que não existe no frontend, e serve de checagem visual ao criar sala ou agente.
2. **Levar `docs/estudo-habblaud.md` à `main`** (documentação; a `main` ainda não tem).

Depois: tag `arquivo/hubblaud-prototipo` (já planejada) e apagar a branch.

## Como integrar (diretrizes, não decisões)

1. **Backend primeiro.** O backend da Sprint 2 (`0d91941`, `bebd563`, `685625a` e o que a `frontend` mudou em `backend/`) aplica limpo na `main` com 138 testes verdes. Branch própria, PR.
2. **O "mundo" é a peça trocável.** Isométrico, 3D e pixel só diferem na tela do escritório; painéis, hooks, `api/` e `types/` são comuns. A `feat/predio-pixel` expõe o mundo por um contrato pequeno
   (`criarMundo(hospedeiro, opcoes)` → `adicionar`, `dispensar`, `definirStatus`, `definirHora`, `selecionar`, `agentes`, `vagas`, `destruir`; `features/predio/mundo.ts`).
   **Sugestão:** se o 3D falar esse mesmo contrato, dá para alternar entre mundos sem reescrever `Escritorio.tsx`.
3. **Conflito prevê-se.** As linhas reescrevem `Escritorio.tsx`, `index.css` e `docs/guia-tecnico-frontend.md`. Quem integra lista o que cada lado tem e **espera o chefe escolher**.
4. **Passos pequenos**, cada um com a suíte verde (`pytest`, `npm test`, `npm run build`, `npm run lint`) e **os testes de regressão de cada linha preservados**.
5. **Binários grandes** (Blender, texturas): confira `.gitignore` e licença antes de levar a outra branch; o `.glb` de 16,7 MB pede Git LFS ou release.

## Tags de versão

Anotadas, em português, no estilo da `v0.1beta` (a primeira, backend testado). Convenção: `vX.Y.Z` marcos do projeto · `3d/vX.Y` experimento 3D · `arquivo/<nome>` ponta de uma linha encerrada (mantém o histórico acessível sem manter a branch).

| Tag | Commit | O que marca |
|---|---|---|
| `v0.1beta` | `9d7ef0a` | Primeira versão do backend testada (já publicada) |
| `v0.2.0` | `ce6b2f8` | Sprint 0 fechada: 4 agentes + motor de tick, 105 testes |
| `v0.2.1` | `544d29b` | `main` com os arquivos de suporte a IA |
| `v0.3.0` | `685625a` | Frontend isométrico completo + Sprint 2 parcial (Motriz, `tick_execucoes`) |
| `v0.4.0` | `75b82af` | Prédio pixel como frontend, com testes de regressão |
| `3d/v0.1` | `a2416c3` | Experimento 3D: modo simulação + modelos Blender |
| `arquivo/the-sims-3d` | `4559df6` | Ponta da `feat/the-sims` |
| `arquivo/mvp-review-frontend-inicial` | `e27340d` | Ponta da `claude/agents-hub-mvp-review` |
| `arquivo/hubblaud-prototipo` | `147695e` | Ponta da `test/hubblaud` |

**Marco novo?** Crie a tag no commit certo (`git tag -a vX.Y.Z <sha> -m "o que muda e quantos testes passam"`), acrescente a linha aqui e em `scripts/criar-tags.sh`.

## Ações pendentes do chefe

O ambiente onde o agente trabalha só publica **branches**: push de **tag** e **exclusão de branch** recebem `403`. Rode na sua máquina:

```bash
git fetch --all --prune
bash scripts/criar-tags.sh                       # cria as 8 tags que faltam e publica (idempotente, não apaga nada)
git push origin --delete claude/agents-hub-mvp-review-oh6zb0 feat/the-sims   # sem perda: 0 commits únicos, e as tags arquivo/* guardam as pontas
```

## Arquivos de suporte a agentes de IA (`AGENTS.md`, `CLAUDE.md`, `.claude/`)

Estão na `main` (`v0.2.1`) e foram sincronizados na `feat/predio-pixel` por merge. Toda branch nova a partir da `main` os herda; as antigas recebem com `git merge origin/main`.
Específicos do prédio pixel, só na `feat/predio-pixel`: `frontend/AGENTS.md`, `frontend/src/features/predio/AGENTS.md`, `.claude/agents/predio-pixel.md`.
Cada linha de frontend (isométrico, 3D) precisa do **próprio** `frontend/AGENTS.md`, escrito por quem conhece aquele frontend, e dos **próprios** testes de regressão.
