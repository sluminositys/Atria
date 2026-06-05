# Atria Agent Guide

## Agent skills

### Issue tracker

Atria tracks issues and PRDs in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Atria uses the canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Atria uses a single repository-wide domain context. See `docs/agents/domain.md`.

## Development workflow

- Keep `main` releasable and use local topic branches for architectural work.
- Prefer small bilingual commits that each leave the repository buildable.
- Do not push branches unless the user explicitly asks.
- Treat the real workspace directory as the source of truth; caches must be rebuildable.
- Run type checking, tests, the production renderer build, and the Tauri bundle before release handoff.
