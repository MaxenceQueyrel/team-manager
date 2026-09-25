#!/usr/bin/env bash
# Runs the frontend Playwright suite against its own isolated stack, so it can
# run alongside the dev app (make run-backend / make run-frontend) without
# sharing any state with it:
#   - a throwaway tmpfs Postgres on :5433 (infra/docker-compose.e2e.yml)
#   - a backend on :8001, backed by a scratch copy of backend/data
#   - a frontend dev server on :3001, started by Playwright's webServer
#     (see frontend/playwright.config.ts)
#
# Usage: scripts/test-e2e.sh [headed|ui]
#   (no arg)  run headless, no UI (default)
#   headed    run with the browser window visible
#   ui        launch Playwright's interactive UI mode
set -euo pipefail

case "${1:-}" in
  "")     BUN_SCRIPT="e2e" ;;
  headed) BUN_SCRIPT="e2e:headed" ;;
  ui)     BUN_SCRIPT="e2e:ui" ;;
  *)
    echo "usage: $0 [headed|ui]" >&2
    exit 1
    ;;
esac

if curl -sf http://localhost:8001/health >/dev/null 2>&1; then
  echo "error: port 8001 is already in use (a leftover e2e backend?). Stop it first." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.e2e.yml")
E2E_DATA_DIR="$(mktemp -d)"
BACKEND_PID=""

cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  rm -rf "$E2E_DATA_DIR"
}
trap cleanup EXIT

cp "$ROOT_DIR"/backend/data/*.json "$E2E_DATA_DIR"/

"${COMPOSE[@]}" up -d --wait

export DATABASE_URL="postgresql+psycopg://team_manager:team_manager@localhost:5433/team_manager"
export DATA_DIR="$E2E_DATA_DIR"
export CORS_ORIGINS="http://localhost:3001"

cd "$ROOT_DIR/backend"
uv run alembic upgrade head
uv run uvicorn api.main:app --port 8001 &
BACKEND_PID=$!

for _ in $(seq 1 30); do
  curl -sf http://localhost:8001/health >/dev/null 2>&1 && break
  sleep 1
done

cd "$ROOT_DIR/frontend"
bunx playwright install chromium
bun run "$BUN_SCRIPT"
