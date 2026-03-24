#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_PATH="${1:-$ROOT_DIR/.claude/worktrees/happy-archimedes}"

if [[ ! -d "$WORKTREE_PATH" ]]; then
  echo "Worktree not found: $WORKTREE_PATH" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'dev-dist' \
  --exclude '.expo' \
  --exclude '.pytest_cache' \
  --exclude '__pycache__' \
  "$WORKTREE_PATH/" "$ROOT_DIR/"

echo "Consolidated worktree into repo root from: $WORKTREE_PATH"
