# hubbia — instruções para agentes de IA

Hub pessoal de agentes de IA especializados que simulam colegas num escritório:
**Cifra** (financeiro), **Agenda**, **Vita** (saúde), **Norte** (projetos GitHub), **Motriz** (sala de máquinas, o único sem LLM).
Backend FastAPI + Postgres + LangChain/OpenAI, com um motor de *tick* manual. Frontend React 19 + Vite + TanStack Query.
**Uma pessoa só usa** (o "chefe"): single-user é deliberado, não esqueça de multiusuário.

> Este arquivo é lido em toda conversa: só entra o que um agente erraria sem saber. Detalhe fica em `docs/` e nos
> `AGENTS.md` de cada pasta (carregados só quando você trabalha nela). `CLAUDE.md` importa este arquivo.

## Antes de tudo (conversa nova)

1. `git fetch --all -q && git branch -a -vv` e **confira o último commit** da branch antes de comparar, basear ou dizer "feito".
   O frontend existe em versões diferentes por branch (tabela abaixo). Em dúvida sobre a base, **pergunte**.
2. Estado do projeto: rode `/retomar` (ou leia só "O que falta" da sprint atual em `docs/produto-e-sprints.md`).
3. Trabalhando numa pasta, leia o `AGENTS.md` dela, se existir: `backend/`, `frontend/`, `frontend/src/features/predio/` (estes dois últimos só existem nas branches com o prédio pixel).

## Princípios inegociáveis

1. **Debater → aprovar → implementar → testar → documentar.** Agente novo ou decisão de design: proponha, espere o "pode"
   explícito do chefe (nunca assuma). Correção pontual e refactor que ele pediu: faça direto.
2. **Custo de LLM é requisito.** LLM só onde há estimativa/síntese real; chamada estruturada única por padrão; **nunca retry
   automático**; checagem determinística *antes* de gastar; todo gasto entra em `tick_execucoes`; nada dispara LLM sozinho
   (upload, abrir tela, timer) e o tick é sempre manual.
3. **Sistema externo real** (Google Calendar etc.) só com confirmação humana (`acoes_pendentes`). Escrita só no banco próprio, não.
4. **Custo nunca aparece na UI** (modelo, tokens, `custo_usd`), mas é sempre gravado.
5. **Chat livre não é o padrão.** Cada agente usa a interação mais barata que o domínio permite (dashboard, forms, cards, chat roteado).
6. **Saída de agente sempre estruturada** (Pydantic/JSON), nunca texto solto.
7. **Segredo nunca no git:** `config.py` + `.env.example` comentado + `.gitignore`.
8. **Migration já aplicada nunca se edita**; crie a próxima, numerada.
9. **"Compilou" não é "testado".** Backend: Postgres real, mock só do LLM. Frontend: navegador de verdade com console limpo.
10. **Mesma entrega rejeitada 2–3 vezes: pare e investigue a causa-raiz** em vez de ajustar sintoma (o frontend já foi refeito 5 vezes assim).
11. **Honestidade:** diga o que testou e o que não testou. Se algo falhou, mostre a saída.

## Como trabalhar com o chefe

- Ele decide visual/UX; você cuida do técnico e **explica o porquê** das escolhas. Português do Brasil, direto, sem jargão de agência.
- Código, nomes, commits e docs em **português**. Comentários explicam o **porquê** e as alternativas rejeitadas, não o quê.
- Branch dedicada por trabalho; **não crie PR sem pedido**; não force push em branch que não é sua.
- Mudou dependência? Avise que ele precisa de `npm install` / `pip install` após o `git pull`.
- Não mexa nos mesmos arquivos que ele sem combinar (já gerou conflito resolvido pela metade).
- Terminou algo relevante? Atualize o doc que o descreve (e este arquivo, se um erro novo virou regra).

## Branches (verifique com git; pode estar desatualizado — detalhe em `docs/mapa-de-branches.md`)

| Branch | O que é |
|---|---|
| `main` | Backend completo (Sprint 0) + docs. **Sem frontend.** |
| `frontend` | `main` + escritório isométrico (PixiJS) + Sprint 2 parcial (`tick_execucoes` ligada, Motriz, sala de máquinas) |
| `feat/predio-pixel` | `frontend` com o escritório trocado pelo **prédio em pixel art** (arte do habblaud). Frontend atual |
| `feat/the-sims` → `claude/modest-wright-cmvki7` | Experimento 3D estilo The Sims do chefe. Sai da `frontend` em 12/08, **não tem** o Motriz/`tick_execucoes` |
| `test/hubblaud` | Estudo do habblaud + protótipo standalone em `prototipos/` |
| `claude/agents-hub-mvp-review-oh6zb0` | Obsoleta (ancestral da `frontend`) |

Linhas de frontend (isométrico, 3D, pixel) **conflitam entre si** em `Escritorio.tsx`. Qual segue é decisão do chefe: não misture sem perguntar.

## Mapa de leitura (leia só o que a tarefa pede)

| Se vai… | Leia |
|---|---|
| saber onde o projeto está | `docs/produto-e-sprints.md` — só "O que falta" da sprint atual |
| **criar um agente** | `docs/guia-criacao-de-agentes.md` (inteiro, é denso) e a skill `/novo-agente` |
| decidir UX de um agente / requisitos | `docs/frontend-design.md` — "Princípios transversais", a seção do agente e "Requisitos não funcionais" (RNF01–09) |
| mexer no frontend | `frontend/AGENTS.md`; `docs/guia-tecnico-frontend.md` PARTE 0, 9–11 (3–7 são histórico do isométrico) |
| propor algo "novo" | `grep -n` em `docs/backlog-futuro.md` primeiro: pode já ter sido adiado, com o porquê |
| planejar a Sprint 2 (departamentos, esteiras) | `docs/sprint-2-roteiro.md` (proposta **não aprovada**; só nas branches da linha `frontend`) |
| entender a arte pixel / habblaud | `docs/estudo-habblaud.md` |
| **ignorar** (histórico) | `docs/mvp-hub-agentes.md`, `docs/avaliacao-mvp.md`, `docs/prompt-design-frontend.md` |

## Comandos

```bash
# backend (de backend/): precisa do Postgres no ar
docker compose up -d && source .venv/bin/activate
python -m scripts.migrate && python -m scripts.seed && uvicorn main:app --reload   # API em :8000
pytest                                  # banco de teste separado: <banco>_test

# frontend (de frontend/): precisa do backend para os painéis
npm install && cp .env.example .env && npm run dev    # :5173
npm test && npm run build && npm run lint
```

## Delegação (Claude Code)

Subagentes em `.claude/agents/`: `predio-pixel` (prédio e arte pixel; só nas branches com o prédio), `backend-agente` (domínio novo no backend),
`revisor-hub` (revisa um diff contra estes princípios; só lê). Skills em `.claude/skills/`: `/retomar`, `/novo-agente`,
`/verificar-visual`. Delegue o que exige ler muito (docs longos, varrer código) e peça **resumo**, para não encher seu contexto.

## Manter estes arquivos

Regra nova só entra se um agente **errou de verdade** sem ela, em uma linha com o porquê. Tire regra que o código já impõe.
Limites: este arquivo ≤ 120 linhas; `AGENTS.md` de pasta ≤ 200. Duplicou conteúdo? Deixe em um lugar só e aponte.
