#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
  echo "Missing .venv. Run: bash scripts/setup.sh"
  exit 1
fi

source .venv/bin/activate

cleanup() {
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi

  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

uvicorn api:app --reload --port 8000 &
API_PID=$!

(
  cd web
  npm run dev
) &
WEB_PID=$!

echo "Backend:  http://127.0.0.1:8000"
echo "Frontend: http://localhost:4000"
echo "Press Ctrl+C to stop both."

wait
