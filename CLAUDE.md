@AGENTS.md

## Claude Code

- **Plan mode** para agente novo ou decisão de design: o processo do projeto é debater e esperar a aprovação do chefe antes de codar.
- **Docs longos** (`guia-tecnico-frontend.md` tem ~1000 linhas, `frontend-design.md` ~730): não leia inteiro. Use `grep -n "^#"` para achar a
  seção, ou peça a um subagente `Explore` um resumo daquela seção.
- **Subagentes** (`.claude/agents/`) e **skills** (`.claude/skills/`) estão listados em `AGENTS.md`. Para trabalho de prédio pixel use
  `predio-pixel`; para um diff pronto para revisar, `revisor-hub`.
- Preferências pessoais da máquina (permissões, hooks) vão em `.claude/settings.local.json`, que o git ignora.
