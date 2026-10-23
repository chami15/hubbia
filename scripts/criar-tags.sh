#!/usr/bin/env bash
# Cria (se ainda nao existirem) as tags de versao do hubbia e as publica no remoto.
#
# Existe porque as tags foram planejadas num ambiente que so consegue publicar branches (push de tag e de
# exclusao de branch recebem 403 la). Rode UMA vez, numa maquina com permissao:  bash scripts/criar-tags.sh
#
# Idempotente: tag que ja existe e pulada, nunca recriada nem movida. Nao apaga nada.
# Convencao (ver docs/mapa-de-branches.md): vX.Y.Z = marcos do projeto; 3d/vX.Y = experimento 3D;
# arquivo/<nome> = ponta de uma linha encerrada, para o historico continuar acessivel sem manter a branch.
set -euo pipefail

git fetch --all --tags --quiet

criar() { # criar <nome> <commit> <mensagem>
  if git rev-parse -q --verify "refs/tags/$1" >/dev/null; then
    echo "pulada (ja existe): $1"
  elif ! git rev-parse -q --verify "$2^{commit}" >/dev/null; then
    echo "ERRO: commit $2 nao encontrado para $1 (faca git fetch --all)" >&2
    exit 1
  else
    git tag -a "$1" "$2" -m "$3"
    echo "criada: $1 -> $2"
  fi
}

criar v0.2.0 ce6b2f8 "Sprint 0 fechada: backend com 4 agentes (Financeiro, Agenda, Saude, Norte) e motor de tick com proatividade de trabalho. 105 testes (pytest, Postgres real). Main apos o merge dos PRs 1 e 2."
criar v0.2.1 544d29b "Main com os arquivos de suporte a agentes de IA: AGENTS.md, CLAUDE.md, backend/AGENTS.md, subagentes e skills em .claude/, mapa de branches e politica de testes (bug vira teste de regressao). Sem mudanca de codigo."
criar v0.3.0 685625a "Frontend isometrico completo + Sprint 2 parcial: paineis dos 4 agentes, tick manual, mensagens, tema Console; tick_execucoes ligada, Motriz e sala de maquinas. 138 testes de backend e 127 de frontend. Ultimo estado do escritorio isometrico (PixiJS), substituido pelo predio pixel."
criar v0.4.0 75b82af "Predio pixel como frontend: arte procedural do habblaud, uma sala por agente, vagas para adicionar e dispensar agentes, estados do backend (inclui pensando) como poses. 138 testes de backend e 24 de frontend, com testes de regressao. Arquivos de suporte a IA (AGENTS.md, skills, subagentes) sincronizados com a main."
criar 3d/v0.1 a2416c3 "Experimento 3D estilo The Sims: modo simulacao (necessidades, humor, autonomia), mundo three.js, modelos Blender e personalizacao dos 4 agentes. 115 testes de backend e 169 de frontend. Sem o Motriz/tick_execucoes. Referencia do documento de aproveitamento."
criar arquivo/the-sims-3d 4559df6 "Ponta da branch feat/the-sims, antes do pente fino e dos modelos Blender. Esta inteira dentro de 3d/v0.1; a branch era redundante."
criar arquivo/mvp-review-frontend-inicial e27340d "Ponta da branch claude/agents-hub-mvp-review: frontend em construcao, todo contido na linha frontend (v0.3.0). A branch era redundante."
criar arquivo/hubblaud-prototipo 147695e "Prototipo standalone do predio pixel (Vite + TS) e estudo do habblaud, antes da integracao no frontend. O codigo integrado vive em frontend/src/features/predio na feat/predio-pixel."

git push origin --tags
echo "pronto. Confira: git ls-remote --tags origin"
