---
name: corrigir-bug
description: "Corrige um bug com teste de regressão obrigatório (backend ou frontend): reproduz com um teste que falha, corrige, prova que o teste pega o bug e registra a armadilha. Use sempre que o chefe reportar um bug ou você encontrar um no caminho."
argument-hint: "[o que está errado]"
---

Regra do projeto: **bug achado = teste de regressão, escrito antes da correção.** Sem o teste, o bug volta.

## Passo a passo

1. **Entenda e delimite.** Qual o comportamento esperado, qual o observado, onde (backend, frontend, os dois)? Reproduza de verdade (rodando, não deduzindo). Se não reproduz, diga e peça o que falta.
2. **Escreva o teste que falha, antes de tocar na correção.**
   - Backend: `tests/test_<dominio>.py`, `test_regressao_<o_que_quebrava>` (Postgres real; mock só do LLM). Receitas por tipo de bug em `backend/AGENTS.md`.
   - Frontend: `__testes__/`, `describe('regressão: <o que quebrava>')` (Vitest). Bug visual/DOM: **extraia a lógica para função pura** com dependência injetável e teste isso (veja `relogio.ts` e `passagem()`).
   - Comentário no teste: o que acontecia e por quê.
3. **Rode e veja falhar pelo motivo certo** (a mensagem de falha deve descrever o bug, não um erro de digitação do teste).
4. **Corrija o mínimo.** Sem refactor de carona; sem "melhorias" que ninguém pediu.
5. **Veja passar** e rode a suíte inteira (`pytest`, ou `npm test && npm run build && npm run lint`).
6. **Prove que o teste pega o bug:** reintroduza o defeito por um instante, confirme que o teste falha, volte. (É o que separa teste útil de teste decorativo.)
7. **Tela mudou?** Confira no navegador com `/verificar-visual`: o teste não substitui o olho.
8. **Registre.** Armadilha que outro agente repetiria vira uma linha na tabela/lista "Armadilhas já pagas" do `AGENTS.md` da pasta (com o nome do teste que a guarda).
9. **Relate em poucas linhas:** o bug, a causa, o teste (nome e arquivo), a evidência vermelho→verde, e o que **não** foi coberto.

## Nunca
Pular, desabilitar, `xfail`ar ou afrouxar um teste para passar. Corrigir sem teste "porque é óbvio". Dizer "corrigido" só porque compilou.
