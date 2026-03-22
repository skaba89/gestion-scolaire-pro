# Phase 1 — Repository stabilization and industrialization

## Goals
- establish a single source of truth at repository root
- remove archived local artifacts from the tracked project
- make CI deterministic and blocking
- prepare a clean releaseable structure

## Immediate actions
1. Consolidate the real app from `.claude/worktrees/happy-archimedes` into repo root.
2. Remove committed or archived local artifacts: `.claude`, `.venv`, `node_modules`, `dist`, `dev-dist`, `.expo`, logs.
3. Rotate any secret that may have been stored in `.env` or local snapshots.
4. Replace the existing optimistic CI with the stricter CI in `.github/workflows/ci.yml`.
5. Make release generation use `scripts/prepare-release.sh`.

## Expected result
A repo that can be cloned, built, tested, and reviewed without hidden worktree dependencies.
