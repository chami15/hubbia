# Hub de Agentes Pessoais — "Escritório Vivo"

Hub pessoal de agentes de IA especializados (financeiro, agenda, etc.) que executam
tarefas reais e simulam uma dinâmica de "colaboradores de empresa" (canal de trabalho +
copa social), rodando de forma semi-autônoma via um motor de *tick*.

## Documentação

- [`docs/mvp-hub-agentes.md`](docs/mvp-hub-agentes.md) — documento de MVP (visão, arquitetura, schema, fases).
- [`docs/avaliacao-mvp.md`](docs/avaliacao-mvp.md) — avaliação técnica do MVP (viabilidade, stack, dificuldade, controle).
- [`docs/produto-e-sprints.md`](docs/produto-e-sprints.md) — produto e histórico de sprints (documento vivo).
- [`docs/guia-tecnico-frontend.md`](docs/guia-tecnico-frontend.md) — decisões técnicas do frontend.
- [`docs/backlog-futuro.md`](docs/backlog-futuro.md) — ideias adiadas de propósito, com o porquê.

## Status

- **Backend** (`backend/`): 4 agentes (Cifra, Agenda, Vita, Norte) + motor de tick
  (relógio simulado, camada social, proatividade) — Sprint 0 encerrada.
- **Frontend** (`frontend/`): React + Vite + three.js + PixiJS. Mundo 3D do
  escritório com o modo simulação (necessidades, autonomia, rota, menu
  radial, criador de personagem), maquete 2D com editor de salas, painéis
  dos 4 agentes e mensagens.
