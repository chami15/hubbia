# Frontend — Hub de Agentes

Um prédio em pixel art onde cada agente (Cifra/financeiro, Agenda,
Vita/saúde, Norte/projetos, Motriz/sala de máquinas) tem a sua sala e
um painel próprio, mais os controles do motor de tick (relógio
simulado, mensagens, configurações, sala de máquinas) na barra do topo.
Agentes entram e saem do prédio pelo painel "prédio" (ou clicando numa
vaga). Consome só a API do `backend/` — nenhuma regra de negócio mora
aqui. A arte é procedural, extraída do habblaud (MIT): ver
`docs/estudo-habblaud.md` e a PARTE 0 de `docs/guia-tecnico-frontend.md`.

Identidade visual: redesenho "Console" — superfícies opacas (`--deck`),
cantos retos, tipografia própria — com o prédio pixel no centro. Ver `docs/frontend-design.md` (decisões de UX) e
`docs/guia-tecnico-frontend.md` (arquitetura técnica, o prédio, o
redesenho visual) na raiz do repositório.

## Como subir

Precisa do backend rodando (`../backend/README.md`) antes — o frontend
não funciona sozinho.

```bash
npm install
cp .env.example .env   # aponta VITE_API_URL pro backend; ajuste se a porta for outra
npm run dev            # abre em http://localhost:5173
```

## Comandos

```bash
npm run dev       # servidor de desenvolvimento (Vite + HMR)
npm run build     # typecheck (tsc -b) + build de produção
npm run preview   # serve o build de produção localmente
npm test          # suíte Vitest (dado/lógica do prédio — salas, vagas, simulação)
npm run lint      # oxlint
```

## Estrutura

Ver `docs/guia-tecnico-frontend.md` Parte 2 pra estrutura de pastas
comentada e as regras de arquitetura (componente nunca fala direto com
o backend, sala é dado nunca código, etc.). Resumo rápido:

```
src/
  api/          → porta única pro backend, um arquivo por domínio
  types/        → contratos TS espelhando os schemas do backend
  hooks/        → TanStack Query por domínio (= resolvers/ do backend)
  features/
    predio/     → o prédio pixel: arte (habblaud/), agentes, salas, simulação
    escritorio/ → a tela (barra do topo + prédio), configurações, sala de máquinas, avisos
    agentes/    → moldura compartilhada dos painéis, retrato pixel, componentes de barra
    financeiro/ → painel do Cifra
    agenda/     → painel da Agenda
    saude/      → painel da Vita
    norte/      → painel do Norte
```

## Agente ou sala nova

Agente novo = uma entrada em `src/features/predio/agentes.ts` (aparência,
cor, especialidade) e outra em `src/features/predio/salas.ts` (móveis e
lugares). Nenhuma imagem. As regras para a sala funcionar acima e abaixo
do corredor estão no topo de `salas.ts`; `npm test` confere se todo
lugar continua alcançável.

## Testes

`npm test` roda a suíte Vitest — cobre dado e lógica do prédio (todo
lugar de toda sala alcançável, montagem das vagas, simulação), não
pixel. Antes de dar qualquer mudança visual por pronta, teste também no
navegador de verdade (Playwright ou manual) e confira o console —
"compilou" não é "testado".
