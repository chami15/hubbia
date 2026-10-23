---
name: verificar-visual
description: "Abre o frontend num Chromium de verdade com a API simulada, tira screenshots e lista erros do console, para provar que uma mudança visual funciona. Use depois de qualquer alteração de tela, antes de dizer \"pronto\"."
argument-hint: "[o que conferir]"
---

"Compilou" não é "testado": em mudança visual você só terminou quando **olhou o resultado**.

## Passo a passo
1. Suba o Vite de `frontend/` em segundo plano numa porta própria: `npx vite --port 5182 --strictPort > /tmp/vite.log 2>&1 &`.
   Pare depois com `kill $(lsof -ti tcp:5182)`. **Nunca `pkill -f vite`** (já derrubou o shell).
2. Playwright: `PW_DIR=<pasta>`; se não houver, `npm i --prefix <pasta> playwright-core`. Chromium: o script acha `$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers` na nuvem) ou use `CHROMIUM=/caminho`.
3. Rode (de qualquer pasta; esta aqui é o script, copie o mock e edite):
   ```bash
   PW_DIR=/tmp/pw node .claude/skills/verificar-visual/capturar.mjs \
     --url http://localhost:5182/ --saida /tmp/tela.png --espera 9000 \
     --mock .claude/skills/verificar-visual/mock-api.exemplo.json --viewport 1700x950
   ```
   Cliques e esperas: `--passos meus-passos.mjs` (exporta `export default async (page) => { ... }`; pode chamar `page.screenshot` quantas vezes quiser).
4. **Abra o PNG com a ferramenta Read e olhe.** Confira o que a tarefa pedia (layout, sobreposição, estados), não só "apareceu algo". Leia a lista de erros do console que o script imprime.
5. Mudou interação? Clique de verdade (`page.mouse.click`, `getByRole`) e fotografe antes e depois.

## Cuidados
- A API é simulada com `page.route` **ancorada no host do backend** (`--api`, padrão `http://localhost:8000`). Rota larga como `**/agenda/**` derruba os módulos do Vite.
- Chromium headless roda a ~2 fps: para ver agentes andando espere 8–12 s; obra e elevador levam ~2,6 s.
- Viewport grande (2300×1100) para ver o prédio inteiro. Status do prédio vem de `/agentes` e `/mensagens`: edite o mock para forçar cada estado.
- Rota sem mock devolve 404 com `detail: "mock"`: um 404 no console é esperado até você mockar aquele endpoint.
