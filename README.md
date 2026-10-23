# Hub de Agentes Pessoais — "Escritório Vivo"

Hub pessoal de agentes de IA especializados (financeiro, agenda, saúde,
projetos pessoais) que executam tarefas reais e simulam uma dinâmica de
"colaboradores de empresa" (canal de trabalho + copa social), rodando de
forma semi-autônoma via um motor de *tick* — tudo visualizado como um
prédio em pixel art onde cada agente tem a sua sala.

## Documentação

> **Agentes de IA** (Claude Code, Codex, Cursor...): comecem por [`AGENTS.md`](AGENTS.md) — princípios, mapa de leitura e as
> instruções de cada pasta. O estado das branches está em [`docs/mapa-de-branches.md`](docs/mapa-de-branches.md).

- [`docs/produto-e-sprints.md`](docs/produto-e-sprints.md) — visão de
  produto e o registro vivo de cada sprint (o que já foi feito, o que
  falta). Comece por aqui pra saber onde o projeto está agora.
- [`docs/backlog-futuro.md`](docs/backlog-futuro.md) — ideias e pontas
  soltas adiadas deliberadamente, com o porquê de cada uma.
- [`docs/guia-criacao-de-agentes.md`](docs/guia-criacao-de-agentes.md) —
  processo pra adicionar um agente novo ao hub (padrões de interação,
  guardrails, o que testar antes de aprovar).
- [`docs/frontend-design.md`](docs/frontend-design.md) — decisões de
  UI/UX por agente e requisitos funcionais/não funcionais do frontend.
- [`docs/guia-tecnico-frontend.md`](docs/guia-tecnico-frontend.md) —
  arquitetura técnica do frontend (o prédio pixel na PARTE 0; geometria
  isométrica, que ficou como histórico, nas PARTES 3–7; o redesenho
  visual "Console").
- [`docs/estudo-habblaud.md`](docs/estudo-habblaud.md) — estudo do
  habblaud (MIT) de onde veio a arte procedural do prédio pixel.
- [`docs/mvp-hub-agentes.md`](docs/mvp-hub-agentes.md) e
  [`docs/avaliacao-mvp.md`](docs/avaliacao-mvp.md) — documento de MVP
  original e sua avaliação técnica. Registro histórico da fase de
  idealização, não refletem o estado atual do projeto.
- [`docs/prompt-design-frontend.md`](docs/prompt-design-frontend.md) —
  registro histórico do prompt usado pra gerar o primeiro esboço visual
  do escritório, anterior à decisão de ir isométrico.
- [`backend/README.md`](backend/README.md) — como subir o backend,
  credenciais necessárias por agente, estrutura de pastas.

## Status

**Backend completo**: quatro agentes de domínio (Financeiro, Agenda,
Saúde, Projetos) + motor de interação (relógio simulado, camada social
entre agentes, proatividade de trabalho), testado automatizada e
manualmente com Postgres/OpenAI reais — ver Sprint 0 em
`docs/produto-e-sprints.md`.

**Frontend em andamento**: prédio em pixel art (arte procedural do
habblaud), onde agentes entram e saem conforme o chefe escolhe, painel de
cada agente, motor de tick operável pela interface e o redesenho visual
"Console" — ver Sprint 1 em `docs/produto-e-sprints.md`. Existem outras
versões do frontend (isométrico, 3D) em outras branches: ver o mapa.

## Subir o projeto

```bash
# backend — ver backend/README.md pra credenciais e troubleshooting
cd backend
docker compose up -d
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m scripts.migrate
python -m scripts.seed
uvicorn main:app --reload

# frontend, num terminal separado
cd frontend
npm install
cp .env.example .env
npm run dev
```
