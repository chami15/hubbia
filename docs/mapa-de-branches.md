# Mapa de branches — experimentos a integrar

> **Nenhuma branch é definitiva.** A maioria são **testes separados** que o chefe e os agentes vão mudar e integrar uns nos outros com o tempo.
> Este mapa não diz qual "ganha": diz o que cada experimento **tem de bom para colher** e como integrar sem sofrimento.
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
main ── Sprint 0 fechada (backend + docs, sem frontend)                                      2026-07-22
 │
 ├─ claude/agents-hub-mvp-review-oh6zb0 ── frontend em construção (obsoleta, ancestral de `frontend`)
 │
 └─ frontend ── escritório isométrico + "Console" + Sprint 2 parcial no backend              2026-08-25
     │
     ├─ feat/predio-pixel ── prédio em pixel art no lugar do isométrico                      2026-10-23
     │
     └─ [12/08, 10bb203] ── feat/the-sims ── modo simulação 3D (three.js), do chefe          2026-10-20
                               └─ claude/modest-wright-cmvki7 ── + pente fino e modelos Blender   2026-10-22

main ── test/hubblaud ── estudo do habblaud + protótipo standalone em `prototipos/`          2026-10-22
```

## O que cada experimento tem para colher

| Branch | O que vale colher | Observação |
|---|---|---|
| `main` | Backend completo da Sprint 0 | É onde o que não depende de visual deve chegar primeiro. |
| `frontend` | **Backend da Sprint 2:** `tick_execucoes` ligada (`0d91941`), Motriz (`bebd563`), `/infra/*` e observabilidade (`685625a`), roteiro da Sprint 2 · **Frontend:** painéis dos agentes, "Console", toasts, mensagens, sala de máquinas · editor de salas (modo edição) | O backend aqui **não depende** do escritório isométrico: pode ir à `main` sem o frontend. |
| `feat/predio-pixel` | Prédio em pixel art: arte procedural (habblaud), salas como dado, vagas (adicionar/dispensar agente), simulação com A\*, obra e elevador · testes de regressão do prédio · arquivos de suporte a IA | Troca só o "mundo"; os painéis ficaram como na `frontend`. |
| `feat/the-sims` | Modo simulação estilo The Sims 4: PlumbBob, menu radial, necessidades e autonomia dos agentes · mundo 3D WebGL (personagens articulados, móveis, vizinhança, paredes *cutaway*) · roteamento A\*, criador de personagem 3D, catálogo Build/Buy, portais | Parte da `frontend` em 12/08: **sem** Motriz/`tick_execucoes`. |
| `claude/modest-wright-cmvki7` | Tudo da `the-sims` + pente fino (laço por quadro, padrão Console) + modelos Blender e personalização dos 4 agentes + docs do modo simulação | É a ponta mais nova do 3D. |
| `test/hubblaud` | Estudo do habblaud (o que é extraível) e protótipo standalone do prédio | Referência; o que importa já está na `feat/predio-pixel`. |

## Como integrar (diretrizes, não decisões)

1. **Backend primeiro.** Os commits do Motriz/`tick_execucoes` (`0d91941`, `bebd563`, `685625a`) não tocam em frontend: levá-los à `main` destrava as outras linhas. Faça em branch própria e com `pytest` verde.
2. **O "mundo" é a peça trocável.** Isométrico, 3D e pixel só diferem na tela do escritório; painéis, hooks, `api/` e `types/` são comuns. Hoje a `feat/predio-pixel` expõe o mundo por um contrato pequeno
   (`criarMundo(hospedeiro, opcoes)` → `adicionar`, `dispensar`, `definirStatus`, `definirHora`, `selecionar`, `agentes`, `vagas`, `destruir`, em `features/predio/mundo.ts`).
   **Sugestão para o chefe decidir:** se o 3D e o isométrico falarem esse mesmo contrato, dá para alternar entre mundos sem reescrever `Escritorio.tsx` a cada integração.
3. **Conflito prevê-se.** As três linhas reescrevem `Escritorio.tsx`, `index.css` e `docs/guia-tecnico-frontend.md`. Quem integra: liste o que cada lado tem, proponha, e **espere o chefe escolher**; não resolva "ficando com um lado".
4. **Integre em passos pequenos**, cada um com a suíte verde (`pytest`, `npm test`, `npm run build`, `npm run lint`) e **os testes de regressão de cada linha preservados**. Teste que some na integração é bug esperando para voltar.
5. **Modelos 3D e imagens** (Blender, texturas) são binários grandes: confira o `.gitignore` e a licença antes de levá-los para outra branch.
6. **Base de uma branch nova:** só backend/docs → `main`; frontend com sala de máquinas → `frontend` ou `feat/predio-pixel`; 3D → `claude/modest-wright-cmvki7`. Em dúvida, pergunte.

## Arquivos de suporte a agentes de IA (`AGENTS.md`, `CLAUDE.md`, `.claude/`)

Estão **na `main`** (commits `dc033ff` e `8219f32`, vindos da `feat/predio-pixel`): `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `.claude/agents/{backend-agente,revisor-hub}.md`, `.claude/skills/*` e este mapa.
Toda branch **nova** a partir da `main` já os herda. As branches antigas recebem com `git merge origin/main` (ou cherry-pick), e podem ter cópias antigas dos mesmos arquivos: ao integrar, fique com a versão da `main` e reaplique só o que for específico do frontend daquela linha.

Específicos do prédio pixel, **só na `feat/predio-pixel`**: `frontend/AGENTS.md`, `frontend/src/features/predio/AGENTS.md`, `.claude/agents/predio-pixel.md`.
Cada linha de frontend (isométrico, 3D) precisa do **próprio** `frontend/AGENTS.md`, escrito por quem conhece aquele frontend, e dos **próprios** testes de regressão.
