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

## Situação (2026-10-23): linha única

O backend da Sprint 2 entrou na `main` pelo [PR #3](https://github.com/chami15/hubbia/pull/3). A `feat/predio-pixel` (frontend principal, com tudo da linha isométrica menos o mundo isométrico) foi levada à `main` por PR. As linhas encerradas ficam só nas tags.

```
main ── backend (Sprint 0 e 2) + frontend com o prédio pixel + docs + suporte a IA        v0.4.0 → v0.5.0
 └─ claude/modest-wright-cmvki7 ── 3D (Sims) + Blender: laboratório, tag 3d/v0.1
```

| Branch | Decisão | Por quê |
|---|---|---|
| `main` | Linha única | back 140 ✓ · front 24 ✓ |
| `claude/modest-wright-cmvki7` | **Mantida** como laboratório 3D | Peso: `.glb` de 16,7 MB no git, bundle de 2,2 MB. As ideias dela entram na próxima sprint (`docs/aproveitamento-the-sims.md`) |

Apagadas (o histórico segue nas tags): `claude/agents-hub-mvp-review-oh6zb0`, `feat/the-sims`, `frontend` (`v0.3.0`), `test/hubblaud` (`arquivo/hubblaud-prototipo`), `feat/backend-sprint-2`, `feat/predio-pixel`.

### Auditoria `frontend` → `feat/predio-pixel` (feita)

- **Removido, de propósito** (tudo do mundo isométrico): cena, maquete, editor de salas, catálogo de móveis, portas, salas em JSON, âncoras, sprites do Kenney e os 8 testes dessas peças.
- **Intacto:** os quatro painéis dos agentes, mensagens, configurações, sala de máquinas, toasts, som, `dry_run`, `api/`, `hooks/` e `types/`.
- **Contrato:** as 45 chamadas do frontend têm rota no backend. 3 rotas o frontend não usa (`/mensagens/caixa-de-entrada`, `/norte/projetos/{id}`, `PATCH .../status`).
- **Perda real corrigida:** `pensando` e `executando` viraram o mesmo "trabalhando"; corrigido com teste de regressão (`status.test.ts`).
- **Decisão do chefe:** os retratos antigos `frontend/public/agentes/*.png` **ficam** (podem servir depois).
- **RNF02 aplicado:** a sala de máquinas mostra só o orçamento agregado; a API `/infra/*` não devolve modelo, tokens nem custo por execução.

## Como integrar (diretrizes, não decisões)

1. **Backend primeiro.** (Feito: PR #3.) Vale para o que vier: o que não depende do visual chega à `main` antes.
2. **O "mundo" é a peça trocável.** Isométrico, 3D e pixel só diferem na tela do escritório; painéis, hooks, `api/` e `types/` são comuns. O prédio pixel expõe o mundo por um contrato pequeno
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
| `v0.5.0` | `5161b26` | Linha única: prédio pixel + backend da Sprint 2 na `main` |

**Marco novo?** Crie a tag no commit certo (`git tag -a vX.Y.Z <sha> -m "o que muda e quantos testes passam"`), acrescente a linha aqui e em `scripts/criar-tags.sh`.

## Ações pendentes do chefe

Nenhuma. (`feat/predio-pixel` apagada e `v0.5.0` publicada em 2026-10-23.)

## Arquivos de suporte a agentes de IA (`AGENTS.md`, `CLAUDE.md`, `.claude/`)

Estão na `main`. Toda branch nova a partir dela os herda; as antigas recebem com `git merge origin/main`.
Específicos do prédio pixel: `frontend/AGENTS.md`, `frontend/src/features/predio/AGENTS.md`, `.claude/agents/predio-pixel.md`.
Uma linha de frontend nova (o 3D, por exemplo) precisa do **próprio** `frontend/AGENTS.md`, escrito por quem conhece aquele frontend, e dos **próprios** testes de regressão.
