#!/usr/bin/env bash
set -euo pipefail

OPENCODE_CONFIG_TEMPLATE="${OPENCODE_CONFIG_TEMPLATE:-/opt/opencode/opencode.template.json}"
OPENCODE_CONFIG_CONTENT="${OPENCODE_CONFIG_CONTENT:-}"
OPENCODE_CONFIG_GENERATOR="${OPENCODE_CONFIG_GENERATOR_SCRIPT:-/opt/opencode/src/scripts/generate-opencode-config.ts}"
OPENCODE_CONFIG_GENERATE_ON_START="${OPENCODE_CONFIG_GENERATE_ON_START:-1}"
OPENCODE_BIN="${OPENCODE_BIN:-/opt/opencode/node_modules/.bin/opencode}"
DASHBOARD_BIN="${OPENCODE_DASHBOARD_BIN:-bunx}"
DASHBOARD_PACKAGE="${OPENCODE_DASHBOARD_PACKAGE:-oh-my-opencode-dashboard@latest}"
DASHBOARD_PROXY_SCRIPT="${OPENCODE_DASHBOARD_PROXY_SCRIPT:-/opt/opencode/src/scripts/dashboard-proxy.ts}"
READINESS_HOST="${OPENCODE_READY_HOST:-127.0.0.1}"
OPENCODE_HEALTH_PATH="${OPENCODE_HEALTH_PATH:-/global/health}"
DASHBOARD_READY_PATH="${OPENCODE_DASHBOARD_READY_PATH:-/}"
DASHBOARD_PROXY_HOST="${OPENCODE_DASHBOARD_PROXY_HOST:-0.0.0.0}"
DASHBOARD_INTERNAL_HOST="${OPENCODE_DASHBOARD_INTERNAL_HOST:-127.0.0.1}"
WORKSPACE_DIR="${OPENCODE_WORKSPACE:-/workspace/project}"
DASHBOARD_PROJECT="${OPENCODE_DASHBOARD_PROJECT:-$WORKSPACE_DIR}"
DASHBOARD_AUTO_ADD_PROJECT="${OPENCODE_DASHBOARD_AUTO_ADD_PROJECT:-1}"
DASHBOARD_PROJECT_NAME="${OPENCODE_DASHBOARD_PROJECT_NAME:-$(basename "$DASHBOARD_PROJECT")}"
OPENCODE_AUTH_IMPORT_PATH="${OPENCODE_AUTH_IMPORT_PATH:-}"
OPENCODE_AUTH_FILE="${OPENCODE_AUTH_FILE:-$XDG_DATA_HOME/opencode/auth.json}"
OPENCODE_AUTH_IMPORT_MODE="${OPENCODE_AUTH_IMPORT_MODE:-always}"
OPENCODE_OMO_CONFIG_IMPORT_PATH="${OPENCODE_OMO_CONFIG_IMPORT_PATH:-}"
OPENCODE_OMO_CONFIG_FILE="${OPENCODE_OMO_CONFIG_FILE:-$OPENCODE_CONFIG_DIR/oh-my-opencode.jsonc}"
OPENCODE_OMO_CONFIG_IMPORT_MODE="${OPENCODE_OMO_CONFIG_IMPORT_MODE:-always}"

mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

sync_auth_file() {
  if [ "$OPENCODE_AUTH_IMPORT_MODE" = "off" ] || [ -z "$OPENCODE_AUTH_IMPORT_PATH" ]; then
    return 0
  fi

  if [ ! -f "$OPENCODE_AUTH_IMPORT_PATH" ]; then
    echo "WARN: auth seed file not found: $OPENCODE_AUTH_IMPORT_PATH"
    return 0
  fi

  mkdir -p "$(dirname "$OPENCODE_AUTH_FILE")"

  case "$OPENCODE_AUTH_IMPORT_MODE" in
    always)
      cp "$OPENCODE_AUTH_IMPORT_PATH" "$OPENCODE_AUTH_FILE"
      ;;
    if-missing)
      if [ ! -f "$OPENCODE_AUTH_FILE" ]; then
        cp "$OPENCODE_AUTH_IMPORT_PATH" "$OPENCODE_AUTH_FILE"
      else
        return 0
      fi
      ;;
    *)
      echo "ERROR: invalid OPENCODE_AUTH_IMPORT_MODE=$OPENCODE_AUTH_IMPORT_MODE (allowed: always|if-missing|off)"
      exit 1
      ;;
  esac

  chmod 600 "$OPENCODE_AUTH_FILE" 2>/dev/null || true
  echo "Auth sync: $OPENCODE_AUTH_IMPORT_PATH -> $OPENCODE_AUTH_FILE (mode=$OPENCODE_AUTH_IMPORT_MODE)"
}

sync_omo_config_file() {
  if [ "$OPENCODE_OMO_CONFIG_IMPORT_MODE" = "off" ] || [ -z "$OPENCODE_OMO_CONFIG_IMPORT_PATH" ]; then
    return 0
  fi

  if [ ! -f "$OPENCODE_OMO_CONFIG_IMPORT_PATH" ]; then
    echo "WARN: oh-my-opencode seed config not found: $OPENCODE_OMO_CONFIG_IMPORT_PATH"
    return 0
  fi

  mkdir -p "$(dirname "$OPENCODE_OMO_CONFIG_FILE")"

  case "$OPENCODE_OMO_CONFIG_IMPORT_MODE" in
    always)
      cp "$OPENCODE_OMO_CONFIG_IMPORT_PATH" "$OPENCODE_OMO_CONFIG_FILE"
      ;;
    if-missing)
      if [ ! -f "$OPENCODE_OMO_CONFIG_FILE" ]; then
        cp "$OPENCODE_OMO_CONFIG_IMPORT_PATH" "$OPENCODE_OMO_CONFIG_FILE"
      else
        return 0
      fi
      ;;
    *)
      echo "ERROR: invalid OPENCODE_OMO_CONFIG_IMPORT_MODE=$OPENCODE_OMO_CONFIG_IMPORT_MODE (allowed: always|if-missing|off)"
      exit 1
      ;;
  esac

  echo "OmO config sync: $OPENCODE_OMO_CONFIG_IMPORT_PATH -> $OPENCODE_OMO_CONFIG_FILE (mode=$OPENCODE_OMO_CONFIG_IMPORT_MODE)"
}

ensure_dashboard_project_tracked() {
  if [ "$DASHBOARD_AUTO_ADD_PROJECT" != "1" ]; then
    return 0
  fi

  if [ ! -d "$DASHBOARD_PROJECT" ]; then
    echo "WARN: dashboard auto-add skipped (project path missing): $DASHBOARD_PROJECT"
    return 0
  fi

  (
    cd "$DASHBOARD_PROJECT"
    "$DASHBOARD_BIN" "$DASHBOARD_PACKAGE" add --name "$DASHBOARD_PROJECT_NAME"
  ) >/dev/null 2>&1 || {
    echo "WARN: dashboard auto-add failed for $DASHBOARD_PROJECT"
    return 0
  }

  echo "Dashboard project tracked: $DASHBOARD_PROJECT (name=$DASHBOARD_PROJECT_NAME)"
}

if [ -n "$OPENCODE_CONFIG_CONTENT" ]; then
  printf '%s\n' "$OPENCODE_CONFIG_CONTENT" >"$OPENCODE_CONFIG"
elif [ "$OPENCODE_CONFIG_GENERATE_ON_START" = "1" ]; then
  if [ ! -f "$OPENCODE_CONFIG_TEMPLATE" ]; then
    echo "ERROR: OPENCODE_CONFIG_TEMPLATE not found: $OPENCODE_CONFIG_TEMPLATE"
    exit 1
  fi
  if [ ! -f "$OPENCODE_CONFIG_GENERATOR" ]; then
    echo "ERROR: OPENCODE_CONFIG_GENERATOR_SCRIPT not found: $OPENCODE_CONFIG_GENERATOR"
    exit 1
  fi

  bun run "$OPENCODE_CONFIG_GENERATOR" \
    --project-dir "$WORKSPACE_DIR" \
    --template "$OPENCODE_CONFIG_TEMPLATE" \
    --out "$OPENCODE_CONFIG"
elif [ ! -f "$OPENCODE_CONFIG" ]; then
  if [ -f "$OPENCODE_CONFIG_TEMPLATE" ]; then
    cp "$OPENCODE_CONFIG_TEMPLATE" "$OPENCODE_CONFIG"
  else
    echo "ERROR: OPENCODE_CONFIG is missing and no template/content is available."
    echo "       OPENCODE_CONFIG=$OPENCODE_CONFIG"
    echo "       OPENCODE_CONFIG_TEMPLATE=$OPENCODE_CONFIG_TEMPLATE"
    exit 1
  fi
fi

sync_omo_config_file
sync_auth_file

# Keep process cwd anchored to workspace so OpenCode/Dashboard
# derive project context from /workspace/project consistently.
if [ -d "$WORKSPACE_DIR" ]; then
  cd "$WORKSPACE_DIR"
else
  echo "WARN: workspace directory missing for cwd: $WORKSPACE_DIR"
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

DASHBOARD_ENABLED="${OPENCODE_DASHBOARD_ENABLED:-1}"
DASHBOARD_PUBLIC_PORT="${OPENCODE_DASHBOARD_PORT:-51234}"
DASHBOARD_PROXY_ENABLED="${OPENCODE_DASHBOARD_PROXY_ENABLED:-1}"
DASHBOARD_INTERNAL_PORT="$DASHBOARD_PUBLIC_PORT"
if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
  DASHBOARD_INTERNAL_PORT="${OPENCODE_DASHBOARD_INTERNAL_PORT:-51235}"
fi

X2_ENABLED="${OPENCODE_X2_ENABLED:-1}"
READY_TIMEOUT_MS="${OPENCODE_READY_TIMEOUT_MS:-30000}"
READY_INTERVAL_MS="${OPENCODE_READY_INTERVAL_MS:-500}"

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

wait_http_ready() {
  local name=$1
  local url=$2

  READY_NAME="$name" READY_URL="$url" READY_TIMEOUT_MS="$READY_TIMEOUT_MS" READY_INTERVAL_MS="$READY_INTERVAL_MS" \
    bun -e '
const name = process.env.READY_NAME ?? "service";
const url = process.env.READY_URL ?? "";
const timeoutMs = Number(process.env.READY_TIMEOUT_MS ?? "30000");
const intervalMs = Number(process.env.READY_INTERVAL_MS ?? "500");

if (!url) {
  console.error(`[readiness] ${name}: missing URL`);
  process.exit(1);
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
  console.error(`[readiness] ${name}: invalid timeout ${timeoutMs}`);
  process.exit(1);
}
if (!Number.isFinite(intervalMs) || intervalMs < 100) {
  console.error(`[readiness] ${name}: invalid interval ${intervalMs}`);
  process.exit(1);
}

let lastError = "unknown";
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      process.exit(0);
    }
    lastError = `http_${res.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  await Bun.sleep(intervalMs);
}

console.error(`[readiness] ${name}: timeout ${timeoutMs}ms (${lastError})`);
process.exit(1);
'
}

ensure_pid_alive() {
  local name=$1
  local pid=$2

  if [ -z "$pid" ]; then
    echo "ERROR: readiness failed ($name): pid is empty"
    return 1
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "ERROR: readiness failed ($name): process exited (pid=$pid)"
    return 1
  fi
  return 0
}

run_readiness_checks() {
  echo "Startup readiness check (timeout=${READY_TIMEOUT_MS}ms, interval=${READY_INTERVAL_MS}ms)"

  ensure_pid_alive "opencode" "$OPENCODE_PID"
  if ! wait_http_ready "opencode" "http://${READINESS_HOST}:${OPENCODE_PORT}${OPENCODE_HEALTH_PATH}"; then
    echo "ERROR: OpenCode health check failed"
    return 1
  fi
  echo "Ready: opencode"

  if [ "$DASHBOARD_ENABLED" = "1" ]; then
    ensure_pid_alive "dashboard" "$DASHBOARD_PID"
    if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
      ensure_pid_alive "dashboard_proxy" "$DASHBOARD_PROXY_PID"
      if ! wait_http_ready "dashboard_proxy" "http://${READINESS_HOST}:${DASHBOARD_PUBLIC_PORT}${DASHBOARD_READY_PATH}"; then
        echo "ERROR: dashboard proxy readiness failed"
        return 1
      fi
      echo "Ready: dashboard proxy"
    else
      if ! wait_http_ready "dashboard" "http://${READINESS_HOST}:${DASHBOARD_INTERNAL_PORT}${DASHBOARD_READY_PATH}"; then
        echo "ERROR: dashboard readiness failed"
        return 1
      fi
      echo "Ready: dashboard"
    fi
  fi

  if [ "$X2_ENABLED" = "1" ]; then
    ensure_pid_alive "x2_worker" "$X2_PID"
    echo "Ready: x2 worker process"
  fi

  echo "Startup readiness check passed"
}

trap cleanup EXIT INT TERM

if [ "$DASHBOARD_ENABLED" = "1" ]; then
  ensure_dashboard_project_tracked
  echo "Starting dashboard for project: $DASHBOARD_PROJECT"
  "$DASHBOARD_BIN" "$DASHBOARD_PACKAGE" --project "$DASHBOARD_PROJECT" --port "$DASHBOARD_INTERNAL_PORT" &
  DASHBOARD_PID=$!
  echo "Dashboard started (pid: $DASHBOARD_PID, bind=${DASHBOARD_INTERNAL_HOST}:${DASHBOARD_INTERNAL_PORT})"

  if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
    echo "Starting dashboard proxy: ${DASHBOARD_PROXY_HOST}:${DASHBOARD_PUBLIC_PORT} -> ${DASHBOARD_INTERNAL_HOST}:${DASHBOARD_INTERNAL_PORT}"
    if [ ! -f "$DASHBOARD_PROXY_SCRIPT" ]; then
      echo "ERROR: dashboard proxy script not found: $DASHBOARD_PROXY_SCRIPT"
      exit 1
    fi

    DASHBOARD_PUBLIC_PORT="$DASHBOARD_PUBLIC_PORT" \
      DASHBOARD_INTERNAL_PORT="$DASHBOARD_INTERNAL_PORT" \
      DASHBOARD_PROXY_HOST="$DASHBOARD_PROXY_HOST" \
      DASHBOARD_INTERNAL_HOST="$DASHBOARD_INTERNAL_HOST" \
      bun run "$DASHBOARD_PROXY_SCRIPT" &
    DASHBOARD_PROXY_PID=$!
    echo "Dashboard proxy started (pid: $DASHBOARD_PROXY_PID)"
  fi
fi

if [ ! -x "$OPENCODE_BIN" ]; then
  echo "ERROR: opencode binary not executable: $OPENCODE_BIN"
  exit 1
fi

"$OPENCODE_BIN" serve \
  --hostname "${OPENCODE_HOSTNAME:-0.0.0.0}" \
  --port "$OPENCODE_PORT" &
OPENCODE_PID=$!
echo "OpenCode started (pid: $OPENCODE_PID, port: ${OPENCODE_PORT})"

if [ "$X2_ENABLED" = "1" ]; then
  X2_WORKER_SCRIPT="${OPENCODE_X2_WORKER_SCRIPT:-/opt/opencode/src/x2/worker.ts}"
  if [ ! -f "$X2_WORKER_SCRIPT" ]; then
    echo "ERROR: X2 worker script not found: $X2_WORKER_SCRIPT"
    exit 1
  fi

  X2_BASE_URL="${OPENCODE_X2_BASE_URL:-http://127.0.0.1:${OPENCODE_PORT}}"
  echo "Starting X2 worker: $X2_WORKER_SCRIPT"
  bun run "$X2_WORKER_SCRIPT" --base-url "$X2_BASE_URL" &
  X2_PID=$!
  echo "X2 worker started (pid: $X2_PID, base_url: $X2_BASE_URL)"
fi

if ! run_readiness_checks; then
  echo "ERROR: startup readiness failed. tearing down processes."
  exit 1
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
