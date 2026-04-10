#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/release_clean"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

rsync -a \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.claude' \
  --exclude '.venv' \
  --exclude 'venv' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'dev-dist' \
  --exclude '.expo' \
  --exclude '.pytest_cache' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.docker' \
  --exclude 'seed_debug.log' \
  --exclude 'migration_error.txt' \
  --exclude 'release_clean' \
  "$ROOT_DIR/" "$OUTPUT_DIR/"

echo "Clean release prepared in: $OUTPUT_DIR"
