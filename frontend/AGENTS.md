# Frontend — instruções para agentes de IA

React 19 + Vite + TypeScript + TanStack Query + axios. A tela é o **prédio em pixel art** (`src/features/predio/`, tem `AGENTS.md` próprio) com a
barra do topo e os painéis dos agentes por cima. Consome só a API do `backend/`: **nenhuma regra de negócio mora aqui**.
Esta versão do frontend existe só na branch `feat/predio-pixel`; outras branches têm o escritório isométrico ou o 3D (veja `docs/mapa-de-branches.md`).

## Camadas

```
componente → hook (src/hooks, TanStack Query) → api (src/api, axios) → backend
types/   espelha os schemas do backend (um contrato só, importado por quem precisar)
```

- Componente **nunca** chama axios. Erro de rede vira frase em um lugar só: `mensagemDeErro()` em `api/client.ts` (RNF03).
- Hook por domínio (`useFinanceiro`, `useNorte`...). Mutação invalida a query que ela muda. Chaves de query ficam no hook.
- O agente do backend tem id **numérico**; o personagem tem id string (`cifra`). A única ponte é `especialidade`
  (`features/predio/agentes.ts`). Nunca compare os dois ids. `especialidade: null` = agente conceito, sem backend.
- `especialidade` é **chave de junção** (tem que bater com o banco); `funcao` é **texto de tela**. Não misture.

## Estilo (identidade "Console")

- Estilo **inline** (`React.CSSProperties`) + variáveis de `src/index.css`. Tailwind está instalado mas **não é o método usado**; não introduza classes utilitárias.
- Tokens: `--void` (fundo do mundo), `--deck` / `--deck-2` / `--deck-line` (painéis), `--ink` / `--ink-dim` / `--ink-faint`, `--accent`, `--good`, `--official`, `--info`,
  `--danger`, `--cifra|agenda|vita|norte` (+ `-rgb`), `--fonte-display`, `--fonte-corpo`, `--radius-deck: 7px`. Cor nova? Vire token, não hexadecimal solto.
- Painel de trabalho = **superfície opaca** (`--deck`) com cantos retos. Vidro translúcido só em HUD flutuante. Cada agente tem tratamento próprio, não um verniz genérico.
- Reuse antes de criar: barras e `Contador` em `features/agentes/Barras.tsx`, estilos em `features/<agente>/estilos.ts` e `features/agentes/estilos.ts`,
  esqueleto em `EsqueletoPainel.tsx`, avisos em `Toasts.tsx` (`useToasts`), ícones SVG de linha em `features/escritorio/icones.tsx`.
- Animação só com `transform`/`opacity` (nunca `width`/`left`); respeite `prefers-reduced-motion` (já tratado em `index.css`).

## Painéis de agente

- Um por vez, abre **dentro** da área do prédio (`position: absolute`, backdrop `zIndex` 55, painel 60), então a barra do topo nunca some.
  Largura vem do tipo de conteúdo: `estreito` (chat/menu/card) ou `largo` (dashboard/formulário), em `LARGURA_POR_AGENTE` de `PainelDoAgente.tsx`.
- Cada painel é `lazy` (chunk próprio) com `Suspense` só em volta do conteúdo; a moldura (`PainelAgente`) aparece na hora.
- Padrão de interação por agente já decidido em `docs/frontend-design.md`: Cifra dashboard, Agenda chat, Vita menu de forms, Norte um card por vez. Não vire chat.
- RNF que mais mordem: **RNF01** nada dispara LLM sozinho (só botão/envio deliberado); **RNF02** nunca mostrar modelo/tokens/custo; **RNF07** ação com LLM mostra "processando".
- Ação em sistema externo precisa de estado visual próprio (pendente/confirmada/rejeitada/expirada), não só texto "confirma?".

## Armadilhas já pagas

- `tsconfig`: `erasableSyntaxOnly` (sem `enum`, `namespace` nem *parameter properties* no construtor), `verbatimModuleSyntax` (`import type` para tipos),
  `noUnusedLocals/Parameters`. `npm run build` (= `tsc -b`) quebra com qualquer um.
- `StrictMode` roda efeito duas vezes em dev: efeito que dispara requisição com efeito visível precisa de `ref` de guarda.
- Esc fecha painel e vale **até dentro de campo de texto**; outros atalhos ficam mudos com painel aberto e dentro de `input/textarea/select`.
- `localStorage` sempre em `try/catch` (aba anônima lança). É estado de tela, nunca dado que precise sobreviver.
- Teste com Playwright: ancore `page.route` no host do backend (`http://localhost:8000/**`). `**/agenda/**` intercepta os módulos que o Vite serve e derruba o app.
- Dependência nova ou removida: avise o chefe do `npm install`.

## Testes e verificação

- `npm test` (Vitest) cobre **dado e lógica**, não pixel. Arquivos em `__testes__/` (o `tsconfig.test.json` só enxerga essa pasta).
- Mudança visual: **abra no navegador e olhe o resultado** (skill `/verificar-visual`), console limpo. "Compilou" não é "testado".
- Pronto = `npm run build` + `npm test` + `npm run lint` sem erro novo + conferido no navegador.

### Bug → teste de regressão (obrigatório)

1. Reproduza com um teste Vitest que **falha** pelo motivo certo, em `__testes__/`, como `describe('regressão: <o que quebrava>')`, com comentário do que acontecia e por quê.
2. Corrija o mínimo; teste verde e `npm test` inteiro.
3. **Prove que o teste pega o bug:** reintroduza o defeito por um instante e veja falhar (foi assim com as regressões de `features/predio/__testes__/`).
4. **Bug "só visual" ou de DOM?** Extraia a lógica para função pura com dependências injetáveis e teste-a: o relógio com aba escondida virou `relogio.ts` (relógio falso nos testes);
   o agente atravessando parede virou `passagem()` + `aEstrela` testados. Só se for impossível extrair, documente como armadilha **e** adicione o passo à checagem do `/verificar-visual`.
5. Bug que um agente de IA cometeria de novo? Além do teste, vira uma linha em "Armadilhas já pagas".
