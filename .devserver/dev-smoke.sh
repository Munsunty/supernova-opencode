#!/bin/bash
set -euo pipefail

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DEVSERVER_DIR/.." && pwd)"

HOST_PORT="${X_OC_PODMAN_HOST_PORT:-4996}"
DASHBOARD_ENABLED="${X_OC_PODMAN_DASHBOARD_ENABLED:-1}"
DASHBOARD_HOST_PORT="${X_OC_PODMAN_DASHBOARD_HOST_PORT:-51234}"
TIMEOUT_MS="${X_OC_PODMAN_SMOKE_TIMEOUT_MS:-45000}"
INTERVAL_MS="${X_OC_PODMAN_SMOKE_INTERVAL_MS:-500}"

LOG_DIR="$DEVSERVER_DIR/data"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-smoke-$(date +%Y%m%d-%H%M%S).log"

round_up_seconds() {
  local ms=$1
  echo $(((ms + 999) / 1000))
}

wait_for_url() {
  local name=$1
  local url=$2
  local timeout_sec=$3
  local interval_ms=$4

  local deadline now
  deadline=$(( $(date +%s) + timeout_sec ))

  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[SMOKE] ready: $name ($url)"
      return 0
    fi

    now=$(date +%s)
    if [ "$now" -ge "$deadline" ]; then
      echo "[SMOKE] timeout: $name ($url)"
      return 1
    fi

    # sleep supports sub-second decimals on macOS and Linux
    sleep "0.$(printf '%03d' "$interval_ms")"
  done
}

cleanup() {
  if [ -n "${DEV_UP_PID:-}" ] && kill -0 "$DEV_UP_PID" 2>/dev/null; then
    kill "$DEV_UP_PID" 2>/dev/null || true
    wait "$DEV_UP_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "=== Podman Dev Smoke ==="
echo "PROJECT_DIR: $PROJECT_DIR"
echo "LOG_FILE:    $LOG_FILE"

echo "[SMOKE] run doctor"
"$DEVSERVER_DIR/dev-doctor.sh"

echo "[SMOKE] boot dev-up in background"
X_OC_PODMAN_TTY=0 "$DEVSERVER_DIR/dev-up.sh" >"$LOG_FILE" 2>&1 &
DEV_UP_PID=$!

timeout_sec=$(round_up_seconds "$TIMEOUT_MS")

# Early crash guard
sleep 1
if ! kill -0 "$DEV_UP_PID" 2>/dev/null; then
  echo "[SMOKE] dev-up exited early"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

if ! wait_for_url "opencode" "http://127.0.0.1:${HOST_PORT}/global/health" "$timeout_sec" "$INTERVAL_MS"; then
  tail -n 120 "$LOG_FILE" || true
  exit 1
fi

if [ "$DASHBOARD_ENABLED" = "1" ]; then
  if ! wait_for_url "dashboard" "http://127.0.0.1:${DASHBOARD_HOST_PORT}" "$timeout_sec" "$INTERVAL_MS"; then
    tail -n 120 "$LOG_FILE" || true
    exit 1
  fi
fi

if ! kill -0 "$DEV_UP_PID" 2>/dev/null; then
  echo "[SMOKE] dev-up process died after readiness"
  tail -n 120 "$LOG_FILE" || true
  exit 1
fi

echo "[SMOKE] PASS - readiness confirmed"

echo "[SMOKE] stopping dev-up"
kill "$DEV_UP_PID" 2>/dev/null || true
wait "$DEV_UP_PID" 2>/dev/null || true
DEV_UP_PID=""

echo "[SMOKE] done"
exit 0
