#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

if [ ! -f "$OPENCODE_CONFIG" ]; then
  cat >"$OPENCODE_CONFIG" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oh-my-opencode@3.8.5"
  ]
}
JSON
fi

echo "=== OpenCode Podman Testbed ==="
echo "Config: $OPENCODE_CONFIG"
echo "Data:   $XDG_DATA_HOME"
echo "Cache:  $XDG_CACHE_HOME"
if [ -n "${OPENCODE_WORKSPACE:-}" ]; then
  echo "Workspace: $OPENCODE_WORKSPACE"
fi
echo "================================"

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

DASHBOARD_PID=""
OPENCODE_PID=""

cleanup() {
  local pids=()
  if [ -n "$DASHBOARD_PID" ]; then
    pids+=("$DASHBOARD_PID")
  fi
  if [ -n "$OPENCODE_PID" ]; then
    pids+=("$OPENCODE_PID")
  fi
  if [ "${#pids[@]}" -gt 0 ]; then
    kill "${pids[@]}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [ "${OPENCODE_DASHBOARD_ENABLED:-1}" = "1" ]; then
  DASHBOARD_PROJECT="${OPENCODE_DASHBOARD_PROJECT:-${OPENCODE_WORKSPACE:-/workspace/project}}"
  echo "Starting dashboard for project: $DASHBOARD_PROJECT"
  bunx oh-my-opencode-dashboard@latest --project "$DASHBOARD_PROJECT" &
  DASHBOARD_PID=$!
  echo "Dashboard started (pid: $DASHBOARD_PID, port: ${OPENCODE_DASHBOARD_PORT:-51234})"
fi

/opt/opencode/node_modules/.bin/opencode serve \
  --hostname "${OPENCODE_HOSTNAME:-0.0.0.0}" \
  --port "$OPENCODE_PORT" &
OPENCODE_PID=$!

wait "$OPENCODE_PID"
