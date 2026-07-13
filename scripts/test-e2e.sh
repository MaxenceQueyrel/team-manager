#!/usr/bin/env bash
# Runs the frontend Playwright suite against a real backend, backed by a
# scratch copy of backend/data so e2e runs never mutate the checked-in
# sample data. The frontend dev server itself is started by Playwright's
# webServer (see frontend/playwright.config.ts).
set -euo pipefail

if curl -sf http://localhost:8000/api/v1/roles/ >/dev/null 2>&1; then
  echo "error: something is already listening on port 8000 (e.g. 'make run-backend')." >&2
  echo "Stop it first — otherwise e2e tests would run against its real backend/data/*.json." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_DATA_DIR="$(mktemp -d)"
cp "$ROOT_DIR"/backend/data/*.json "$E2E_DATA_DIR"/

cd "$ROOT_DIR/backend"
DATA_DIR="$E2E_DATA_DIR" CORS_ORIGINS="http://localhost:3000" \
  uv run uvicorn api.main:app --port 8000 &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
  rm -rf "$E2E_DATA_DIR"
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  curl -sf http://localhost:8000/api/v1/roles/ >/dev/null 2>&1 && break
  sleep 1
done

cd "$ROOT_DIR/frontend"
bun run test:e2e
