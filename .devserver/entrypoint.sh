#!/usr/bin/env bash
set -euo pipefail

OPENCODE_CONFIG_CONTENT="${OPENCODE_CONFIG_CONTENT:-}"
OPENCODE_CONFIG_IMPORT_PATH="${OPENCODE_CONFIG_IMPORT_PATH:-/opt/opencode/opencode.seed.json}"
OPENCODE_CONFIG_IMPORT_MODE="${OPENCODE_CONFIG_IMPORT_MODE:-always}"
OPENCODE_BIN="${OPENCODE_BIN:-/opt/opencode/node_modules/.bin/opencode}"
DASHBOARD_BIN="${OPENCODE_DASHBOARD_BIN:-bunx}"
DASHBOARD_PACKAGE="${OPENCODE_DASHBOARD_PACKAGE:-}"
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
OPENCODE_TEMPLATES_IMPORT_PATH="${OPENCODE_TEMPLATES_IMPORT_PATH:-}"
OPENCODE_TEMPLATES_IMPORT_MODE="${OPENCODE_TEMPLATES_IMPORT_MODE:-always}"
OPENCODE_TEMPLATES_TARGET_DIR="${OPENCODE_TEMPLATES_TARGET_DIR:-$WORKSPACE_DIR/docs/templates}"
OPENCODE_TEMPLATES_FALLBACK_PATH="${OPENCODE_TEMPLATES_FALLBACK_PATH:-/opt/opencode/templates}"
OPENCODE_X1_WEBHOOK_SCRIPT="${OPENCODE_X1_WEBHOOK_SCRIPT:-/opt/opencode/src/x1/webhook.ts}"
OPENCODE_X1_WEBHOOK_HOST="${OPENCODE_X1_WEBHOOK_HOST:-0.0.0.0}"
OPENCODE_X1_WEBHOOK_PORT="${OPENCODE_X1_WEBHOOK_PORT:-5100}"
OPENCODE_X1_WEBHOOK_PATH="${OPENCODE_X1_WEBHOOK_PATH:-/webhook}"
OPENCODE_X1_WEBHOOK_SOURCE="${OPENCODE_X1_WEBHOOK_SOURCE:-x1_telegram}"
OPENCODE_X1_WEBHOOK_TASK_SOURCE="${OPENCODE_X1_WEBHOOK_TASK_SOURCE:-x1_telegram}"
OPENCODE_X1_WEBHOOK_READY_PATH="${OPENCODE_X1_WEBHOOK_READY_PATH:-/health}"
OPENCODE_X1_MODE="${OPENCODE_X1_MODE:-both}"
OPENCODE_X1_POLLER_SCRIPT="${OPENCODE_X1_POLLER_SCRIPT:-/opt/opencode/src/x1/poller.ts}"
OPENCODE_X1_POLLER_TOKEN="${OPENCODE_X1_POLLER_TOKEN:-}"
OPENCODE_X1_BOT_TOKEN="${OPENCODE_X1_BOT_TOKEN:-${OPENCODE_X1_POLLER_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}}"
OPENCODE_X1_POLLER_SOURCE="${OPENCODE_X1_POLLER_SOURCE:-${OPENCODE_X1_WEBHOOK_SOURCE:-x1_telegram}}"
OPENCODE_X1_POLLER_TASK_SOURCE="${OPENCODE_X1_POLLER_TASK_SOURCE:-${OPENCODE_X1_WEBHOOK_TASK_SOURCE:-x1_telegram}}"
OPENCODE_X1_POLLER_ALLOWED_USER_IDS="${OPENCODE_X1_POLLER_ALLOWED_USER_IDS:-}"
OPENCODE_X1_POLL_INTERVAL_MS="${OPENCODE_X1_POLL_INTERVAL_MS:-}"
OPENCODE_X1_POLL_TIMEOUT_SEC="${OPENCODE_X1_POLL_TIMEOUT_SEC:-}"
OPENCODE_X1_POLL_LIMIT="${OPENCODE_X1_POLL_LIMIT:-}"
OPENCODE_X1_API_BASE="${OPENCODE_X1_API_BASE:-}"
OPENCODE_X1_DIRECT_SCRIPT="${OPENCODE_X1_DIRECT_SCRIPT:-/opt/opencode/src/x1/direct-chatbot.ts}"
OPENCODE_X1_DIRECT_SOURCE="${OPENCODE_X1_DIRECT_SOURCE:-x1_chatbot}"
OPENCODE_X1_DIRECT_AGENT="${OPENCODE_X1_DIRECT_AGENT:-spark}"
OPENCODE_X1_DIRECT_BASE_URL="${OPENCODE_X1_DIRECT_BASE_URL:-http://127.0.0.1:${OPENCODE_PORT:-4996}}"
OPENCODE_X1_DIRECT_SESSION_MODE="${OPENCODE_X1_DIRECT_SESSION_MODE:-per-chat}"
OPENCODE_X1_DIRECT_SYSTEM="${OPENCODE_X1_DIRECT_SYSTEM:-}"
OPENCODE_X1_DIRECT_TOKEN="${OPENCODE_X1_DIRECT_TOKEN:-}"
OPENCODE_X1_DIRECT_ALLOWED_USER_IDS="${OPENCODE_X1_DIRECT_ALLOWED_USER_IDS:-${OPENCODE_X1_POLLER_ALLOWED_USER_IDS:-}}"
OPENCODE_X1_DIRECT_POLL_INTERVAL_MS="${OPENCODE_X1_DIRECT_POLL_INTERVAL_MS:-${OPENCODE_X1_POLL_INTERVAL_MS:-}}"
OPENCODE_X1_DIRECT_POLL_TIMEOUT_SEC="${OPENCODE_X1_DIRECT_POLL_TIMEOUT_SEC:-${OPENCODE_X1_POLL_TIMEOUT_SEC:-}}"
OPENCODE_X1_DIRECT_POLL_LIMIT="${OPENCODE_X1_DIRECT_POLL_LIMIT:-${OPENCODE_X1_POLL_LIMIT:-}}"
OPENCODE_X1_DIRECT_API_BASE="${OPENCODE_X1_DIRECT_API_BASE:-${OPENCODE_X1_API_BASE:-}}"
OPENCODE_X3_WORKER_SCRIPT="${OPENCODE_X3_WORKER_SCRIPT:-/opt/opencode/src/x3/worker.ts}"
OPENCODE_RUNTIME_SCRIPT="${OPENCODE_RUNTIME_SCRIPT:-/opt/opencode/src/index.ts}"
OPENCODE_BASE_URL="${OPENCODE_BASE_URL:-http://127.0.0.1:${OPENCODE_PORT:-4996}}"
OPENCODE_LOG_FILE="${OPENCODE_LOG_FILE:-/srv/opencode/data/logs/runtime.log}"
X2_TELEGRAM_REPORT="${X2_TELEGRAM_REPORT:-1}"

export OPENCODE_X1_BOT_TOKEN
export X2_TELEGRAM_REPORT
export OPENCODE_BASE_URL
export OPENCODE_LOG_FILE

mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

sync_opencode_config_file() {
  if [ "$OPENCODE_CONFIG_IMPORT_MODE" = "off" ] || [ -z "$OPENCODE_CONFIG_IMPORT_PATH" ]; then
    return 0
  fi

  if [ ! -f "$OPENCODE_CONFIG_IMPORT_PATH" ]; then
    echo "WARN: opencode seed config not found: $OPENCODE_CONFIG_IMPORT_PATH"
    return 0
  fi

  mkdir -p "$(dirname "$OPENCODE_CONFIG")"

  case "$OPENCODE_CONFIG_IMPORT_MODE" in
    always)
      cp "$OPENCODE_CONFIG_IMPORT_PATH" "$OPENCODE_CONFIG"
      ;;
    if-missing)
      if [ ! -f "$OPENCODE_CONFIG" ]; then
        cp "$OPENCODE_CONFIG_IMPORT_PATH" "$OPENCODE_CONFIG"
      else
        return 0
      fi
      ;;
    *)
      echo "ERROR: invalid OPENCODE_CONFIG_IMPORT_MODE=$OPENCODE_CONFIG_IMPORT_MODE (allowed: always|if-missing|off)"
      exit 1
      ;;
  esac

  echo "OpenCode config sync: $OPENCODE_CONFIG_IMPORT_PATH -> $OPENCODE_CONFIG (mode=$OPENCODE_CONFIG_IMPORT_MODE)"
}

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

sync_templates_dir() {
  if [ "$OPENCODE_TEMPLATES_IMPORT_MODE" = "off" ]; then
    return 0
  fi

  local source_path=""
  if [ -n "$OPENCODE_TEMPLATES_IMPORT_PATH" ] && [ -d "$OPENCODE_TEMPLATES_IMPORT_PATH" ]; then
    source_path="$OPENCODE_TEMPLATES_IMPORT_PATH"
  elif [ -d "$OPENCODE_TEMPLATES_FALLBACK_PATH" ]; then
    source_path="$OPENCODE_TEMPLATES_FALLBACK_PATH"
  fi

  if [ -z "$source_path" ]; then
    echo "WARN: docs template seed not found (import=$OPENCODE_TEMPLATES_IMPORT_PATH fallback=$OPENCODE_TEMPLATES_FALLBACK_PATH)"
    return 0
  fi

  case "$OPENCODE_TEMPLATES_IMPORT_MODE" in
    always)
      mkdir -p "$OPENCODE_TEMPLATES_TARGET_DIR"
      cp -a "$source_path"/. "$OPENCODE_TEMPLATES_TARGET_DIR"/
      ;;
    if-missing)
      if [ -d "$OPENCODE_TEMPLATES_TARGET_DIR" ] && [ -n "$(ls -A "$OPENCODE_TEMPLATES_TARGET_DIR" 2>/dev/null)" ]; then
        return 0
      fi
      mkdir -p "$OPENCODE_TEMPLATES_TARGET_DIR"
      cp -a "$source_path"/. "$OPENCODE_TEMPLATES_TARGET_DIR"/
      ;;
    *)
      echo "ERROR: invalid OPENCODE_TEMPLATES_IMPORT_MODE=$OPENCODE_TEMPLATES_IMPORT_MODE (allowed: always|if-missing|off)"
      exit 1
      ;;
  esac

  echo "Templates sync: $source_path -> $OPENCODE_TEMPLATES_TARGET_DIR (mode=$OPENCODE_TEMPLATES_IMPORT_MODE)"
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
else
  sync_opencode_config_file
fi

if [ ! -f "$OPENCODE_CONFIG" ]; then
  echo "ERROR: OPENCODE_CONFIG is missing and no content/seed is available."
  echo "       OPENCODE_CONFIG=$OPENCODE_CONFIG"
  echo "       OPENCODE_CONFIG_IMPORT_PATH=$OPENCODE_CONFIG_IMPORT_PATH"
  echo "       OPENCODE_CONFIG_IMPORT_MODE=$OPENCODE_CONFIG_IMPORT_MODE"
  exit 1
fi

sync_auth_file
sync_templates_dir

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
RUNTIME_PID=""

DASHBOARD_ENABLED="${OPENCODE_DASHBOARD_ENABLED:-0}"
DASHBOARD_PUBLIC_PORT="${OPENCODE_DASHBOARD_PORT:-51234}"
DASHBOARD_PROXY_ENABLED="${OPENCODE_DASHBOARD_PROXY_ENABLED:-1}"
DASHBOARD_INTERNAL_PORT="$DASHBOARD_PUBLIC_PORT"
if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
  DASHBOARD_INTERNAL_PORT="${OPENCODE_DASHBOARD_INTERNAL_PORT:-51235}"
fi

X2_ENABLED="${OPENCODE_X2_ENABLED:-1}"
X1_ENABLED="${OPENCODE_X1_ENABLED:-1}"
X3_ENABLED="${OPENCODE_X3_ENABLED:-1}"
X3_INTERVAL_MS="${OPENCODE_X3_INTERVAL_MS:-3000}"
X3_MAX_PROCESS="${OPENCODE_X3_MAX_PROCESS:-10}"
READY_TIMEOUT_MS="${OPENCODE_READY_TIMEOUT_MS:-30000}"
READY_INTERVAL_MS="${OPENCODE_READY_INTERVAL_MS:-500}"

case "$OPENCODE_X1_MODE" in
  poller|webhook|direct|both|off)
    ;;
  *)
    echo "ERROR: invalid OPENCODE_X1_MODE=$OPENCODE_X1_MODE (allowed: poller, webhook, direct, both, off)"
    exit 1
    ;;
esac

if [ "$OPENCODE_X1_MODE" = "both" ] && \
   [ -n "${OPENCODE_X1_POLLER_TOKEN:-}" ] && \
   [ "$OPENCODE_X1_DIRECT_TOKEN" = "$OPENCODE_X1_POLLER_TOKEN" ]; then
  echo "WARN: X1 both mode is using the same bot token for poller and direct."
  echo "      Telegram getUpdates stream can race; set OPENCODE_X1_DIRECT_TOKEN to a different bot token if needed."
fi

cleanup() {
  local pids=()
  if [ -n "$DASHBOARD_PID" ]; then
    pids+=("$DASHBOARD_PID")
  fi
  if [ -n "$DASHBOARD_PROXY_PID" ]; then
    pids+=("$DASHBOARD_PROXY_PID")
  fi
  if [ -n "$RUNTIME_PID" ]; then
    pids+=("$RUNTIME_PID")
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
    if ! ensure_pid_alive "dashboard" "$DASHBOARD_PID"; then
      return 1
    fi
    if [ "$DASHBOARD_PROXY_ENABLED" = "1" ]; then
      if ! ensure_pid_alive "dashboard_proxy" "$DASHBOARD_PROXY_PID"; then
        return 1
      fi
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

  if [ -n "$RUNTIME_PID" ]; then
    if ! ensure_pid_alive "runtime_supervisor" "$RUNTIME_PID"; then
      return 1
    fi
    echo "Ready: runtime supervisor"
  fi

  if [ "$X1_ENABLED" = "1" ] && [ "$OPENCODE_X1_MODE" = "webhook" ]; then
    if ! wait_http_ready "x1_webhook" "http://${READINESS_HOST}:${OPENCODE_X1_WEBHOOK_PORT}${OPENCODE_X1_WEBHOOK_READY_PATH}"; then
      echo "ERROR: x1 webhook readiness failed"
      return 1
    fi
    echo "Ready: x1 webhook"
  fi

  echo "Startup readiness check passed"
}

trap cleanup EXIT INT TERM

if [ "$DASHBOARD_ENABLED" = "1" ]; then
  if [ -z "$DASHBOARD_PACKAGE" ]; then
    echo "ERROR: dashboard enabled but OPENCODE_DASHBOARD_PACKAGE is not set"
    exit 1
  fi
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

if [ ! -f "$OPENCODE_RUNTIME_SCRIPT" ]; then
  echo "ERROR: runtime supervisor script not found: $OPENCODE_RUNTIME_SCRIPT"
  exit 1
fi

# Export runtime orchestration env so /opt/opencode/src/index.ts can spawn child workers.
export OPENCODE_X2_ENABLED OPENCODE_X2_WORKER_SCRIPT OPENCODE_BASE_URL
export OPENCODE_X1_ENABLED OPENCODE_X1_MODE OPENCODE_X1_WEBHOOK_SCRIPT OPENCODE_X1_WEBHOOK_HOST OPENCODE_X1_WEBHOOK_PORT OPENCODE_X1_WEBHOOK_PATH OPENCODE_X1_WEBHOOK_SOURCE OPENCODE_X1_WEBHOOK_TASK_SOURCE OPENCODE_X1_WEBHOOK_READY_PATH OPENCODE_X1_POLLER_SCRIPT OPENCODE_X1_POLLER_TOKEN OPENCODE_X1_POLLER_SOURCE OPENCODE_X1_POLLER_TASK_SOURCE OPENCODE_X1_POLLER_ALLOWED_USER_IDS OPENCODE_X1_POLL_INTERVAL_MS OPENCODE_X1_POLL_TIMEOUT_SEC OPENCODE_X1_POLL_LIMIT OPENCODE_X1_API_BASE OPENCODE_X1_DIRECT_SCRIPT OPENCODE_X1_DIRECT_SOURCE OPENCODE_X1_DIRECT_AGENT OPENCODE_X1_DIRECT_BASE_URL OPENCODE_X1_DIRECT_SESSION_MODE OPENCODE_X1_DIRECT_SYSTEM OPENCODE_X1_DIRECT_TOKEN OPENCODE_X1_DIRECT_ALLOWED_USER_IDS OPENCODE_X1_DIRECT_POLL_INTERVAL_MS OPENCODE_X1_DIRECT_POLL_TIMEOUT_SEC OPENCODE_X1_DIRECT_POLL_LIMIT OPENCODE_X1_DIRECT_API_BASE
export OPENCODE_X3_ENABLED OPENCODE_X3_WORKER_SCRIPT OPENCODE_X3_INTERVAL_MS OPENCODE_X3_MAX_PROCESS
export X2_DB_PATH X1_WEBHOOK_SECRET

echo "Starting runtime supervisor: $OPENCODE_RUNTIME_SCRIPT"
bun run "$OPENCODE_RUNTIME_SCRIPT" &
RUNTIME_PID=$!
echo "Runtime supervisor started (pid: $RUNTIME_PID)"

if ! run_readiness_checks; then
  echo "ERROR: startup readiness failed. tearing down processes."
  exit 1
fi

WAIT_PIDS=("$OPENCODE_PID")
if [ -n "$RUNTIME_PID" ]; then
  WAIT_PIDS+=("$RUNTIME_PID")
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
