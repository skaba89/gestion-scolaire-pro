#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

warn() {
  echo "[WARN] $1"
}

pass() {
  echo "[OK] $1"
}

[[ -f package.json ]] || fail "package.json missing at repo root"
[[ -d backend ]] || fail "backend directory missing at repo root"
[[ -f docker-compose.yml ]] || fail "docker-compose.yml missing"
[[ -f .env.example ]] || fail ".env.example missing"
[[ -f .env.docker.example ]] || warn ".env.docker.example missing"

if [[ -d .claude/worktrees ]]; then
  warn "Claude worktree detected inside repo. Consolidate source of truth before release."
fi

if [[ -d node_modules ]]; then
  warn "node_modules tracked in working tree snapshot. Do not commit it."
fi

if [[ -d dist || -d dev-dist ]]; then
  warn "build artifacts detected in repository snapshot. Keep them out of git."
fi

if [[ -f .env ]]; then
  warn ".env present locally. Ensure it is not committed and rotate secrets if it was archived."
fi

if ! grep -q '"type-check"' package.json; then
  fail "type-check script missing from package.json"
fi

if ! grep -q '"test"' package.json; then
  fail "test script missing from package.json"
fi

pass "Baseline project verification completed"
