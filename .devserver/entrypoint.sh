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
DASHBOARD_PROXY_PID=""
OPENCODE_PID=""
X2_PID=""

cleanup() {
  local pids=()
  if [ -n "$DASHBOARD_PID" ]; then
    pids+=("$DASHBOARD_PID")
  fi
  if [ -n "$DASHBOARD_PROXY_PID" ]; then
    pids+=("$DASHBOARD_PROXY_PID")
  fi
  if [ -n "$X2_PID" ]; then
    pids+=("$X2_PID")
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
  DASHBOARD_PUBLIC_PORT="${OPENCODE_DASHBOARD_PORT:-51234}"
  DASHBOARD_PROXY_ENABLED="${OPENCODE_DASHBOARD_PROXY_ENABLED:-1}"
  DASHBOARD_INTERNAL_PORT="$DASHBOARD_PUBLIC_PORT"
  if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
    DASHBOARD_INTERNAL_PORT="${OPENCODE_DASHBOARD_INTERNAL_PORT:-51235}"
  fi

  echo "Starting dashboard for project: $DASHBOARD_PROJECT"
  bunx oh-my-opencode-dashboard@latest --project "$DASHBOARD_PROJECT" --port "$DASHBOARD_INTERNAL_PORT" &
  DASHBOARD_PID=$!
  echo "Dashboard started (pid: $DASHBOARD_PID, bind=127.0.0.1:${DASHBOARD_INTERNAL_PORT})"

  if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
    echo "Starting dashboard proxy: 0.0.0.0:${DASHBOARD_PUBLIC_PORT} -> 127.0.0.1:${DASHBOARD_INTERNAL_PORT}"
    DASHBOARD_PUBLIC_PORT="$DASHBOARD_PUBLIC_PORT" DASHBOARD_INTERNAL_PORT="$DASHBOARD_INTERNAL_PORT" \
      bun -e '
const publicPort = Number(process.env.DASHBOARD_PUBLIC_PORT || "51234");
const internalPort = Number(process.env.DASHBOARD_INTERNAL_PORT || "51235");
if (!Number.isFinite(publicPort) || !Number.isFinite(internalPort)) {
  throw new Error("invalid dashboard port configuration");
}
Bun.serve({
  hostname: "0.0.0.0",
  port: publicPort,
  fetch(req) {
    const url = new URL(req.url);
    const target = `http://127.0.0.1:${internalPort}${url.pathname}${url.search}`;
    return fetch(new Request(target, req));
  },
});
console.log(`Dashboard proxy listening on http://0.0.0.0:${publicPort}`);
' &
    DASHBOARD_PROXY_PID=$!
    echo "Dashboard proxy started (pid: $DASHBOARD_PROXY_PID)"
  fi
fi

/opt/opencode/node_modules/.bin/opencode serve \
  --hostname "${OPENCODE_HOSTNAME:-0.0.0.0}" \
  --port "$OPENCODE_PORT" &
OPENCODE_PID=$!
echo "OpenCode started (pid: $OPENCODE_PID, port: ${OPENCODE_PORT})"

if [ "${OPENCODE_X2_ENABLED:-1}" = "1" ]; then
  X2_WORKER_SCRIPT="${OPENCODE_X2_WORKER_SCRIPT:-/opt/opencode/src/x2/worker.ts}"
  if [ -f "$X2_WORKER_SCRIPT" ]; then
    X2_BASE_URL="${OPENCODE_X2_BASE_URL:-http://127.0.0.1:${OPENCODE_PORT}}"
    echo "Starting X2 worker: $X2_WORKER_SCRIPT"
    bun run "$X2_WORKER_SCRIPT" --base-url "$X2_BASE_URL" &
    X2_PID=$!
    echo "X2 worker started (pid: $X2_PID, base_url: $X2_BASE_URL)"
  else
    echo "WARN: X2 worker script not found: $X2_WORKER_SCRIPT"
  fi
fi

WAIT_PIDS=("$OPENCODE_PID")
if [ -n "$X2_PID" ]; then
  WAIT_PIDS+=("$X2_PID")
fi
if [ -n "$DASHBOARD_PID" ]; then
  WAIT_PIDS+=("$DASHBOARD_PID")
fi
if [ -n "$DASHBOARD_PROXY_PID" ]; then
  WAIT_PIDS+=("$DASHBOARD_PROXY_PID")
fi

set +e
wait -n "${WAIT_PIDS[@]}"
STATUS=$?
set -e
exit "$STATUS"
