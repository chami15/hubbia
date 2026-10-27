# hubbia — instruções para agentes de IA

Hub pessoal de agentes de IA especializados que simulam colegas num escritório:
**Cifra** (financeiro), **Agenda**, **Vita** (saúde), **Norte** (projetos GitHub), **Motriz** (sala de máquinas, o único sem LLM).
Backend FastAPI + Postgres + LangChain/OpenAI, com um motor de *tick* (manual, ou automático opt-in). Frontend React 19 + Vite + TanStack Query.
**Uma pessoa só usa** (o "chefe"): single-user é deliberado, não esqueça de multiusuário.

> Este arquivo é lido em toda conversa: só entra o que um agente erraria sem saber. Detalhe fica em `docs/` e nos
> `AGENTS.md` de cada pasta (carregados só quando você trabalha nela). `CLAUDE.md` importa este arquivo.

## Antes de tudo (conversa nova)

1. `git fetch --all -q && git branch -a -vv` e **confira o último commit** da branch antes de comparar, basear ou dizer "feito".
   Em dúvida sobre a base, **pergunte**.
2. Estado do projeto: rode `/retomar` (ou leia só "O que falta" da sprint atual em `docs/produto-e-sprints.md`).
3. Trabalhando numa pasta, leia o `AGENTS.md` dela, se existir: `backend/`, `frontend/`, `frontend/src/features/predio/`.

## Princípios inegociáveis

1. **Debater → aprovar → implementar → testar → documentar.** Agente novo ou decisão de design: proponha, espere o "pode"
   explícito do chefe (nunca assuma). Correção pontual e refactor que ele pediu: faça direto.
2. **Custo de LLM é requisito.** LLM só onde há estimativa/síntese real; chamada estruturada única por padrão; **nunca retry
   automático**; checagem determinística *antes* de gastar; todo gasto entra em `tick_execucoes`; nada dispara LLM sozinho
   (upload, abrir tela). **Única exceção, decidida pelo chefe:** o tick automático (botão "auto", desligado a cada carregamento),
   só com o app aberto, no expediente e sob limites que o **backend** garante (`resolvers/tick_automatico.py`). Fora isso o tick é manual.
3. **Sistema externo real** (Google Calendar etc.) só com confirmação humana (`acoes_pendentes`). Escrita só no banco próprio, não.
4. **Custo nunca aparece na UI** (modelo, tokens, `custo_usd`), mas é sempre gravado.
5. **Chat livre não é o padrão.** Cada agente usa a interação mais barata que o domínio permite (dashboard, forms, cards, chat roteado).
6. **Saída de agente sempre estruturada** (Pydantic/JSON), nunca texto solto.
7. **Segredo nunca no git:** `config.py` + `.env.example` comentado + `.gitignore`.
8. **Migration já aplicada nunca se edita**; crie a próxima, numerada.
9. **"Compilou" não é "testado".** Veja "Testes" abaixo.
10. **Mesma entrega rejeitada 2–3 vezes: pare e investigue a causa-raiz** em vez de ajustar sintoma (o frontend já foi refeito 5 vezes assim).
11. **Honestidade:** diga o que testou e o que não testou. Se algo falhou, mostre a saída.
12. **Bug achado = teste de regressão, escrito antes da correção** (backend e frontend). Vale para o bug que o chefe reporta e para o que você descobre no caminho. Skill `/corrigir-bug`.

## Testes (automatizados; não é opcional)

- **Lógica nova** (função, regra, endpoint, guardrail) entra **com teste na mesma mudança**. Agente novo: testes do domínio, e no prédio a sala alcançável.
- **Bug → teste:** reproduza com um teste que **falha**, corrija, veja **passar**, e prove que o teste pega o bug reintroduzindo-o por um instante.
  Nome: `test_regressao_<o_que_quebrava>` (pytest) ou `describe('regressão: <o que quebrava>')` (Vitest), com um comentário do que acontecia e por quê.
- **Nunca** pule, desabilite, `xfail` ou afrouxe um teste para ficar verde. Teste vermelho é achado, não incômodo. Instável? Conserte a causa (relógio injetável, banco isolado), não rode de novo até passar.
- Bug "só visual"? **Extraia a lógica para função pura e teste-a** (foi assim com `passagem()` e `relogio.ts`). O navegador (`/verificar-visual`) complementa, não substitui.
- Backend: Postgres real, mock só do LLM. Frontend: Vitest para lógica, navegador de verdade com console limpo para tela.
- Antes de dizer "pronto": `pytest` (backend) e `npm test && npm run build && npm run lint` (frontend). Diga o que **não** rodou.

## Como trabalhar com o chefe

- Ele decide visual/UX; você cuida do técnico e **explica o porquê** das escolhas. Português do Brasil, direto, sem jargão de agência.
- Código, nomes, commits e docs em **português**. Comentários explicam o **porquê** e as alternativas rejeitadas, não o quê.
- Branch dedicada por trabalho; **não crie PR sem pedido**; não force push em branch que não é sua.
- Mudou dependência? Avise que ele precisa de `npm install` / `pip install` após o `git pull`.
- Não mexa nos mesmos arquivos que ele sem combinar (já gerou conflito resolvido pela metade).
- Terminou algo relevante? Atualize o doc que o descreve (e este arquivo, se um erro novo virou regra).

## Branches: experimentos que vamos integrar (nenhuma é definitiva)

Quase todas são **testes separados** que o chefe e você vão mudar e integrar aos poucos. Não trate nenhuma como "a versão certa"; o git manda (`docs/mapa-de-branches.md` tem o detalhe e **o que vale colher** de cada uma).

| Branch | Situação |
|---|---|
| `main` | **Linha única**: backend (Sprint 0 e 2) + frontend com o prédio pixel + docs + suporte a IA. |
| `claude/modest-wright-cmvki7` | Laboratório 3D estilo The Sims, linha separada (tag `3d/v0.1`). As ideias dele entram na próxima sprint: `docs/aproveitamento-the-sims.md`. |

As linhas isométrica (`v0.3.0`), do protótipo habblaud e do MVP inicial estão só nas tags `arquivo/*`/`v0.3.0`.

Tags de versão (`vX.Y.Z`, `3d/vX.Y`, `arquivo/*`) e o que falta publicar: ver o mapa.

Trabalhe como quem vai integrar:
- Mudanças **pequenas e coesas**; módulo novo em **arquivo novo** em vez de reescrever arquivo compartilhado (`Escritorio.tsx`, `index.css`, docs).
- O que não depende do visual (backend, docs, hooks, types) é o que mais precisa chegar à `main` primeiro: mantenha-o separado do frontend em commits próprios.
- Branch nova ou mexida: registre no mapa o propósito, a base e o que vale colher. Base ambígua: pergunte.
- Conflito entre linhas de frontend: **não escolha um lado sozinho**. Liste o que cada lado tem e proponha a integração ao chefe.

## Mapa de leitura (leia só o que a tarefa pede)

| Se vai… | Leia |
|---|---|
| saber onde o projeto está | `docs/produto-e-sprints.md` — só "O que falta" da sprint atual |
| **criar um agente** | `docs/guia-criacao-de-agentes.md` (inteiro, é denso) e a skill `/novo-agente` |
| decidir UX de um agente / requisitos | `docs/frontend-design.md` — "Princípios transversais", a seção do agente e "Requisitos não funcionais" (RNF01–09) |
| mexer no frontend | `frontend/AGENTS.md`; `docs/guia-tecnico-frontend.md` PARTE 0, 9–11 (3–7 são histórico do isométrico) |
| propor algo "novo" | `grep -n` em `docs/backlog-futuro.md` primeiro: pode já ter sido adiado, com o porquê |
| planejar a Sprint 2 (departamentos, esteiras) | `docs/sprint-2-roteiro.md` (proposta **não aprovada**) |
| entender a arte pixel / habblaud | `docs/estudo-habblaud.md` |
| trazer ideias do 3D (humor, relações, autonomia) | `docs/aproveitamento-the-sims.md`: critério "sem poluição, dado real" |
| **ignorar** (histórico) | `docs/mvp-hub-agentes.md`, `docs/avaliacao-mvp.md`, `docs/prompt-design-frontend.md` |

Link que não abre? Confira a branch no mapa (`docs/mapa-de-branches.md`) em vez de assumir que o doc sumiu.

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

CI (`.github/workflows/ci.yml`): todo `push` roda `pytest` (Postgres efêmero) e `npm test` + `npm run build`. Vermelho no CI é achado, não incômodo (lint não roda lá: rode local).

## Delegação (Claude Code)

Subagentes em `.claude/agents/`: `predio-pixel` (prédio e arte pixel), `backend-agente` (domínio novo no backend),
`revisor-hub` (revisa um diff contra estes princípios; só lê). Skills em `.claude/skills/`: `/retomar`, `/novo-agente`,
`/corrigir-bug`, `/verificar-visual`. Delegue o que exige ler muito (docs longos, varrer código) e peça **resumo**, para não encher seu contexto.

## Manter estes arquivos

Regra nova só entra se um agente **errou de verdade** sem ela, em uma linha com o porquê. Tire regra que o código já impõe.
Limites: este arquivo ≤ 120 linhas; `AGENTS.md` de pasta ≤ 200. Duplicou conteúdo? Deixe em um lugar só e aponte.
