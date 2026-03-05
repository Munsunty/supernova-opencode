#!/bin/bash
# OpenCode dev environment bootstrap (Podman-only)
# - opencode + dashboard + X2 worker run inside Podman

set -euo pipefail

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PODMAN_DOCKERFILE="$DEVSERVER_DIR/dockerfile"
ENV_FILE="$DEVSERVER_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi

PROJECT_DIR_INPUT="${X_OC_PROJECT_DIR:-$DEVSERVER_DIR/..}"
if [ ! -d "$PROJECT_DIR_INPUT" ]; then
  echo "ERROR: project directory not found: $PROJECT_DIR_INPUT"
  echo "Hint: set X_OC_PROJECT_DIR to the repo root that contains .devserver"
  exit 1
fi
PROJECT_DIR="$(cd "$PROJECT_DIR_INPUT" && pwd)"

MODE="up"
if [ "${1:-}" = "--build-only" ]; then
  MODE="build-only"
elif [ "${1:-}" = "--run-only" ]; then
  MODE="run-only"
elif [ -n "${1:-}" ] && [ "${1:-}" != "--up" ]; then
  echo "ERROR: unknown option: $1"
  echo "Usage: $0 [--up|--build-only|--run-only]"
  exit 1
fi
if [ "$#" -gt 1 ]; then
  echo "ERROR: too many arguments"
  echo "Usage: $0 [--up|--build-only|--run-only]"
  exit 1
fi

USING_DOCKER_FALLBACK=0


if ! command -v podman >/dev/null 2>&1; then
  if command -v docker >/dev/null 2>&1; then
    echo "INFO: podman not found, falling back to docker"
    USING_DOCKER_FALLBACK=1
    podman() { docker "$@"; }
  else
    echo "ERROR: neither podman nor docker found"
    exit 1
  fi
fi

# macOS: detect Podman Machine socket BEFORE XDG vars are overridden,
# because podman reads machine config from XDG_DATA_HOME.
# On Linux/WSL the default socket location is used automatically.
if [ "$(uname)" = "Darwin" ]; then
  _machine_socket=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null | head -1 || true)
  if [ -n "$_machine_socket" ] && [ -S "$_machine_socket" ]; then
    export CONTAINER_HOST="unix://$_machine_socket"
  fi
fi

podman_preflight() {
  echo "Preflight: podman runtime diagnostics..."

  if [ "$USING_DOCKER_FALLBACK" = "1" ]; then
    if docker info >/dev/null 2>&1; then
      echo "Preflight: docker runtime OK (podman fallback)"
      return 0
    else
      echo "ERROR: docker daemon is not running"
      echo "Recovery: sudo systemctl start docker"
      return 1
    fi
  fi

  if ! podman info >/dev/null 2>&1; then
    echo "ERROR: podman info failed. Podman runtime is not ready."
    if [ "$(uname)" = "Darwin" ]; then
      echo "Recovery:"
      echo "  podman machine init    # first-time only"
      echo "  podman machine start"
    fi
    return 1
  fi

  if [ "$(uname)" = "Darwin" ]; then
    local machine_state machine_socket
    machine_state=$(podman machine inspect --format '{{.State}}' 2>/dev/null | head -1 || true)
    if [ -z "$machine_state" ]; then
      echo "ERROR: podman machine inspect failed (no machine found)."
      echo "Recovery:"
      echo "  podman machine init"
      echo "  podman machine start"
      return 1
    fi
    if [ "$machine_state" != "running" ] && [ "$machine_state" != "Running" ]; then
      echo "ERROR: podman machine is not running (state: $machine_state)."
      echo "Recovery:"
      echo "  podman machine start"
      return 1
    fi

    machine_socket=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null | head -1 || true)
    if [ -z "$machine_socket" ] || [ ! -S "$machine_socket" ]; then
      echo "ERROR: podman machine socket missing or invalid: ${machine_socket:-<empty>}"
      echo "Recovery:"
      echo "  podman machine stop && podman machine start"
      return 1
    fi

    export CONTAINER_HOST="unix://$machine_socket"
  fi

  echo "Preflight: podman runtime OK"
}

warn_env() {
  local message=$1
  echo "WARN: $message"
}

print_env_warnings() {
  if [ ! -f "$DEVSERVER_DIR/.env" ]; then
    warn_env "$DEVSERVER_DIR/.env not found. Provider keys/settings may be missing."
  fi

  if [ -z "${OPENCODE_SERVER_PASSWORD:-}" ]; then
    warn_env "OPENCODE_SERVER_PASSWORD is not set; server will run unsecured."
  fi

  if [ "$WARN_PROVIDER_KEYS" = "1" ] && [ -z "${CEREBRAS_API_KEY:-}" ] && [ -z "${GROQ_API_KEY:-}" ] && [ -z "${EQ1_API_KEY:-}" ]; then
    warn_env "No provider API key detected (optional warning)."
  fi
}

ensure_port_available() {
  local port=$1
  local pids

  pids=$(lsof -ti :"$port" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)
  if [ -z "$pids" ]; then
    return 0
  fi

  if [ "$FORCE_KILL_PORTS" = "1" ]; then
    echo "WARN: port $port already in use. force-kill enabled; killing pid(s): $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti :"$port" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)
    if [ -n "$pids" ]; then
      echo "ERROR: failed to clear port $port (remaining pid(s): $pids)"
      return 1
    fi
    return 0
  fi

  echo "ERROR: port $port already in use (pid(s): $pids)."
  echo "Recovery:"
  echo "  lsof -nP -iTCP:$port -sTCP:LISTEN"
  echo "  podman rm -f $CONTAINER_NAME   # if this project's previous container is stuck"
  echo "  X_OC_PODMAN_FORCE_KILL_PORTS=1 bun run dev   # enable auto-kill"
  return 1
}

echo "=== OpenCode dev-up (podman-only) ==="
echo "MODE:          $MODE"
echo "PROJECT_DIR:   $PROJECT_DIR"
echo "DEVSERVER_DIR: $DEVSERVER_DIR"
echo "====================================="

if [ ! -f "$PODMAN_DOCKERFILE" ]; then
  echo "ERROR: podman dockerfile not found: $PODMAN_DOCKERFILE"
  exit 1
fi

PROJECT_SCOPE_RAW="${X_OC_PODMAN_PROJECT_SCOPE:-$(basename "$PROJECT_DIR")}"
PROJECT_SCOPE="$(printf '%s' "$PROJECT_SCOPE_RAW" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '_' | sed -e 's/^_\\+//' -e 's/_\\+$//')"
if [ -z "$PROJECT_SCOPE" ]; then
  PROJECT_SCOPE="project"
fi
PROJECT_HASH="$(printf '%s' "$PROJECT_DIR" | cksum | awk '{print $1}')"

VOLUME_PREFIX="${X_OC_PODMAN_VOLUME_PREFIX:-homsa_opencode_${PROJECT_SCOPE}_${PROJECT_HASH}}"
VOLUME_CONFIG="${X_OC_PODMAN_VOLUME_CONFIG:-${VOLUME_PREFIX}_config}"
VOLUME_DATA="${X_OC_PODMAN_VOLUME_DATA:-${VOLUME_PREFIX}_data}"
VOLUME_CACHE="${X_OC_PODMAN_VOLUME_CACHE:-${VOLUME_PREFIX}_cache}"
DEVSERVER_MASK_VOLUME="${X_OC_PODMAN_DEVSERVER_MASK_VOLUME:-${VOLUME_PREFIX}_devserver_mask}"

IMAGE_NAME="${X_OC_PODMAN_IMAGE_NAME:-homsa-opencode-testbed:latest}"
CONTAINER_NAME="${X_OC_PODMAN_CONTAINER_NAME:-homsa-opencode-${PROJECT_SCOPE}-${PROJECT_HASH}}"
HOST_PORT="${X_OC_PODMAN_HOST_PORT:-4996}"
DASHBOARD_HOST_PORT="${X_OC_PODMAN_DASHBOARD_HOST_PORT:-51234}"
CONTAINER_OPENCODE_PORT="${X_OC_PODMAN_CONTAINER_OPENCODE_PORT:-4996}"
CONTAINER_DASHBOARD_PORT="${X_OC_PODMAN_CONTAINER_DASHBOARD_PORT:-51234}"
DASHBOARD_INTERNAL_PORT="${X_OC_PODMAN_DASHBOARD_INTERNAL_PORT:-51235}"
DASHBOARD_INTERNAL_HOST_PORT="${X_OC_PODMAN_DASHBOARD_INTERNAL_HOST_PORT:-51235}"
READY_TIMEOUT_MS="${X_OC_PODMAN_READY_TIMEOUT_MS:-30000}"
READY_INTERVAL_MS="${X_OC_PODMAN_READY_INTERVAL_MS:-500}"
DASHBOARD_ENABLED="${X_OC_PODMAN_DASHBOARD_ENABLED:-0}"
DASHBOARD_PROXY_ENABLED="${X_OC_PODMAN_DASHBOARD_PROXY_ENABLED:-1}"
EXPOSE_DASHBOARD_INTERNAL="${X_OC_PODMAN_EXPOSE_DASHBOARD_INTERNAL:-1}"
X2_ENABLED="${X_OC_PODMAN_X2_ENABLED:-1}"
X1_ENABLED="${X_OC_PODMAN_X1_ENABLED:-1}"
X3_ENABLED="${X_OC_PODMAN_X3_ENABLED:-1}"
X1_WEBHOOK_HOST_PORT="${X_OC_PODMAN_X1_WEBHOOK_HOST_PORT:-5100}"
CONTAINER_X1_WEBHOOK_PORT="${X_OC_PODMAN_CONTAINER_X1_WEBHOOK_PORT:-5100}"
X1_WEBHOOK_PATH="${X_OC_PODMAN_X1_WEBHOOK_PATH:-/webhook}"
X1_WEBHOOK_SOURCE="${X_OC_PODMAN_X1_WEBHOOK_SOURCE:-x1_telegram}"
X1_WEBHOOK_TASK_SOURCE="${X_OC_PODMAN_X1_WEBHOOK_TASK_SOURCE:-x1_telegram}"
X1_MODE="${X_OC_PODMAN_X1_MODE:-poller}"
X1_POLLER_TOKEN="${X_OC_PODMAN_X1_POLLER_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
X1_BOT_TOKEN="${X_OC_PODMAN_X1_BOT_TOKEN:-${X1_POLLER_TOKEN:-}}"
X1_POLLER_SOURCE="${X_OC_PODMAN_X1_POLLER_SOURCE:-$X1_WEBHOOK_SOURCE}"
X1_POLLER_TASK_SOURCE="${X_OC_PODMAN_X1_POLLER_TASK_SOURCE:-$X1_WEBHOOK_TASK_SOURCE}"
X1_POLLER_ALLOWED_USER_IDS="${X_OC_PODMAN_X1_POLLER_ALLOWED_USER_IDS:-${ALLOWED_USER_IDS:-}}"
X1_POLLER_POLL_INTERVAL_MS="${X_OC_PODMAN_X1_POLLER_POLL_INTERVAL_MS:-}"
X1_POLLER_POLL_TIMEOUT_SEC="${X_OC_PODMAN_X1_POLLER_POLL_TIMEOUT_SEC:-}"
X1_POLLER_POLL_LIMIT="${X_OC_PODMAN_X1_POLLER_POLL_LIMIT:-}"
X1_POLLER_API_BASE="${X_OC_PODMAN_X1_POLLER_API_BASE:-}"
X3_INTERVAL_MS="${X_OC_PODMAN_X3_INTERVAL_MS:-3000}"
X3_MAX_PROCESS="${X_OC_PODMAN_X3_MAX_PROCESS:-10}"
X3_BASE_URL="${X_OC_PODMAN_X3_BASE_URL:-http://127.0.0.1:${CONTAINER_OPENCODE_PORT}}"
X2_TELEGRAM_REPORT="${X_OC_PODMAN_X2_TELEGRAM_REPORT:-1}"
X2_SUMMARIZER_AGENT="${X_OC_PODMAN_X2_SUMMARIZER_AGENT:-x2-summarizer}"
X4_SUMMARIZER_AGENT="${X_OC_PODMAN_X4_SUMMARIZER_AGENT:-x4-summarizer}"
X2_AGENT_ROUTING="${X_OC_PODMAN_X2_AGENT_ROUTING:-auto}"
X2_SIMPLE_AGENT="${X_OC_PODMAN_X2_SIMPLE_AGENT:-joshua}"
X2_COMPLEX_AGENT="${X_OC_PODMAN_X2_COMPLEX_AGENT:-joshua}"
X2_BYPASS_AGENT="${X_OC_PODMAN_X2_BYPASS_AGENT:-}"
X2_BYPASS_MODEL="${X_OC_PODMAN_X2_BYPASS_MODEL:-}"
FORCE_KILL_PORTS="${X_OC_PODMAN_FORCE_KILL_PORTS:-0}"
USE_TTY="${X_OC_PODMAN_TTY:-1}"
WARN_PROVIDER_KEYS="${X_OC_WARN_PROVIDER_KEYS:-0}"
EXCLUDE_DEVSERVER="${X_OC_PODMAN_EXCLUDE_DEVSERVER:-1}"
RUN_SYNC_DIR="${X_OC_PODMAN_RUN_SYNC_DIR:-$DEVSERVER_DIR/run-sync}"
AUTH_IMPORT_MODE="${X_OC_PODMAN_AUTH_IMPORT_MODE:-always}"
AUTH_IMPORT_SOURCE_HOST="${X_OC_PODMAN_AUTH_SOURCE_HOST:-$RUN_SYNC_DIR/auth.json}"
OPENCODE_CONFIG_IMPORT_MODE="${X_OC_PODMAN_OPENCODE_CONFIG_IMPORT_MODE:-always}"
OPENCODE_CONFIG_SOURCE_HOST="${X_OC_PODMAN_OPENCODE_CONFIG_SOURCE_HOST:-$RUN_SYNC_DIR/opencode.json}"
SPARK_PROMPT_SOURCE_HOST="${X_OC_PODMAN_SPARK_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/spark.prompt.txt}"
GENESIS_PROMPT_SOURCE_HOST="${X_OC_PODMAN_GENESIS_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/genesis.prompt.txt}"
MOSES_PROMPT_SOURCE_HOST="${X_OC_PODMAN_MOSES_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/moses.prompt.txt}"
JOSHUA_PROMPT_SOURCE_HOST="${X_OC_PODMAN_JOSHUA_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/joshua.prompt.txt}"
BEZALEL_PROMPT_SOURCE_HOST="${X_OC_PODMAN_BEZALEL_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/bezalel.prompt.txt}"
OHOLIAB_PROMPT_SOURCE_HOST="${X_OC_PODMAN_OHOLIAB_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/oholiab.prompt.txt}"
AARON_PROMPT_SOURCE_HOST="${X_OC_PODMAN_AARON_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/aaron.prompt.txt}"
CALEB_PROMPT_SOURCE_HOST="${X_OC_PODMAN_CALEB_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/caleb.prompt.txt}"
EQ1_CORE_PROMPT_SOURCE_HOST="${X_OC_PODMAN_EQ1_CORE_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/eq1-core.prompt.txt}"
X2_SUMMARIZER_PROMPT_SOURCE_HOST="${X_OC_PODMAN_X2_SUMMARIZER_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/x2-summarizer.prompt.txt}"
X4_SUMMARIZER_PROMPT_SOURCE_HOST="${X_OC_PODMAN_X4_SUMMARIZER_PROMPT_SOURCE_HOST:-$DEVSERVER_DIR/agents/x4-summarizer.prompt.txt}"
DOC_TEMPLATES_SOURCE_HOST="${X_OC_PODMAN_DOC_TEMPLATES_SOURCE_HOST:-$RUN_SYNC_DIR/templates}"
DOC_TEMPLATES_IMPORT_MODE="${X_OC_PODMAN_DOC_TEMPLATES_IMPORT_MODE:-always}"
DOC_TEMPLATES_SOURCE_CONTAINER="${X_OC_PODMAN_DOC_TEMPLATES_SOURCE_CONTAINER:-/run/opencode-seed/templates}"

case "$X1_MODE" in
  poller|webhook|off) ;;
  *)
    echo "ERROR: invalid X_OC_PODMAN_X1_MODE=$X1_MODE (allowed: poller, webhook, off)"
    exit 1
    ;;
esac

# Backward compatibility: if run-sync seed files are not present,
# use legacy locations when available.
if [ -z "${X_OC_PODMAN_AUTH_SOURCE_HOST:-}" ] && [ ! -f "$AUTH_IMPORT_SOURCE_HOST" ] && [ -f "$DEVSERVER_DIR/opencode/auth.json" ]; then
  AUTH_IMPORT_SOURCE_HOST="$DEVSERVER_DIR/opencode/auth.json"
fi
if [ -z "${X_OC_PODMAN_OPENCODE_CONFIG_SOURCE_HOST:-}" ] && [ ! -f "$OPENCODE_CONFIG_SOURCE_HOST" ] && [ -f "$DEVSERVER_DIR/opencode.json" ]; then
  OPENCODE_CONFIG_SOURCE_HOST="$DEVSERVER_DIR/opencode.json"
fi
if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
  AUTH_IMPORT_SOURCE_CONTAINER="${X_OC_PODMAN_AUTH_SOURCE_CONTAINER:-/run/opencode-seed/auth.json}"
  OPENCODE_CONFIG_SOURCE_CONTAINER="${X_OC_PODMAN_OPENCODE_CONFIG_SOURCE_CONTAINER:-/run/opencode-seed/opencode.json}"
else
  AUTH_IMPORT_SOURCE_CONTAINER="${X_OC_PODMAN_AUTH_SOURCE_CONTAINER:-/workspace/project/.devserver/run-sync/auth.json}"
  OPENCODE_CONFIG_SOURCE_CONTAINER="${X_OC_PODMAN_OPENCODE_CONFIG_SOURCE_CONTAINER:-/workspace/project/.devserver/run-sync/opencode.json}"
fi
_default_mount_label="Z"
[ "$(uname)" = "Darwin" ] && _default_mount_label=""
MOUNT_LABEL_SUFFIX="${X_OC_PODMAN_MOUNT_LABEL_SUFFIX:-$_default_mount_label}"
if [ -n "$MOUNT_LABEL_SUFFIX" ]; then
  MOUNT_LABEL_SUFFIX=":$MOUNT_LABEL_SUFFIX"
fi

podman_preflight

export XDG_CONFIG_HOME="$DEVSERVER_DIR/config"
export XDG_DATA_HOME="$DEVSERVER_DIR/data"
export XDG_CACHE_HOME="$DEVSERVER_DIR/cache"
export OPENCODE_CONFIG_DIR="$DEVSERVER_DIR"

print_env_warnings

if [ "$MODE" != "build-only" ]; then
  # remove previous managed container first to free mapped ports safely
  podman rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

  ensure_port_available "$HOST_PORT"
  if [ "$DASHBOARD_ENABLED" = "1" ]; then
    ensure_port_available "$DASHBOARD_HOST_PORT"
    if [ "$EXPOSE_DASHBOARD_INTERNAL" = "1" ]; then
      ensure_port_available "$DASHBOARD_INTERNAL_HOST_PORT"
    fi
  fi
  if [ "$X1_ENABLED" = "1" ] && [ "$X1_MODE" = "webhook" ]; then
    ensure_port_available "$X1_WEBHOOK_HOST_PORT"
  fi
fi

if [ "$MODE" != "run-only" ]; then
  podman build -t "$IMAGE_NAME" -f "$PODMAN_DOCKERFILE" "$DEVSERVER_DIR"
  if [ "$MODE" = "build-only" ]; then
    echo "Build complete: $IMAGE_NAME"
    exit 0
  fi
elif ! podman image exists "$IMAGE_NAME"; then
  echo "ERROR: image not found: $IMAGE_NAME"
  echo "Recovery:"
  echo "  bun run dev:build"
  exit 1
fi

PODMAN_RUN_ARGS=(
  --rm
  --name "$CONTAINER_NAME"
  -w /workspace/project
  -p "$HOST_PORT:$CONTAINER_OPENCODE_PORT"
  -e OPENCODE_PORT="$CONTAINER_OPENCODE_PORT"
  -e OPENCODE_HOSTNAME=0.0.0.0
  -e OPENCODE_WORKSPACE=/workspace/project
  -e OPENCODE_DASHBOARD_PROJECT=/workspace/project
  -e OPENCODE_DASHBOARD_ENABLED="$DASHBOARD_ENABLED"
  -e OPENCODE_DASHBOARD_PORT="$CONTAINER_DASHBOARD_PORT"
  -e OPENCODE_DASHBOARD_PROXY_ENABLED="$DASHBOARD_PROXY_ENABLED"
  -e OPENCODE_DASHBOARD_INTERNAL_PORT="$DASHBOARD_INTERNAL_PORT"
  -e OPENCODE_X2_ENABLED="$X2_ENABLED"
  -e OPENCODE_X2_WORKER_SCRIPT=/opt/opencode/src/x2/worker.ts
  -e OPENCODE_X1_ENABLED="$X1_ENABLED"
  -e OPENCODE_X1_MODE="$X1_MODE"
  -e OPENCODE_X1_WEBHOOK_SCRIPT=/opt/opencode/src/x1/webhook.ts
  -e OPENCODE_X1_WEBHOOK_HOST=0.0.0.0
  -e OPENCODE_X1_WEBHOOK_PORT="$CONTAINER_X1_WEBHOOK_PORT"
  -e OPENCODE_X1_WEBHOOK_PATH="$X1_WEBHOOK_PATH"
  -e OPENCODE_X1_WEBHOOK_SOURCE="$X1_WEBHOOK_SOURCE"
  -e OPENCODE_X1_WEBHOOK_TASK_SOURCE="$X1_WEBHOOK_TASK_SOURCE"
  -e OPENCODE_X1_POLLER_SCRIPT=/opt/opencode/src/x1/poller.ts
  -e OPENCODE_X1_POLLER_SOURCE="$X1_POLLER_SOURCE"
  -e OPENCODE_X1_POLLER_TASK_SOURCE="$X1_POLLER_TASK_SOURCE"
  -e X2_TELEGRAM_REPORT="$X2_TELEGRAM_REPORT"
  -e X2_SUMMARIZER_AGENT="$X2_SUMMARIZER_AGENT"
  -e X4_SUMMARIZER_AGENT="$X4_SUMMARIZER_AGENT"
  -e X2_AGENT_ROUTING="$X2_AGENT_ROUTING"
  -e X2_AGENT_SIMPLE_AGENT="$X2_SIMPLE_AGENT"
  -e X2_AGENT_COMPLEX_AGENT="$X2_COMPLEX_AGENT"
  -e X2_AGENT_BYPASS_AGENT="$X2_BYPASS_AGENT"
  -e X2_AGENT_BYPASS_MODEL="$X2_BYPASS_MODEL"
  -e OPENCODE_X3_ENABLED="$X3_ENABLED"
  -e OPENCODE_X3_WORKER_SCRIPT=/opt/opencode/src/x3/worker.ts
  -e OPENCODE_X3_BASE_URL="$X3_BASE_URL"
  -e OPENCODE_X3_INTERVAL_MS="$X3_INTERVAL_MS"
  -e OPENCODE_X3_MAX_PROCESS="$X3_MAX_PROCESS"
  -e OPENCODE_READY_TIMEOUT_MS="$READY_TIMEOUT_MS"
  -e OPENCODE_READY_INTERVAL_MS="$READY_INTERVAL_MS"
  -e OPENCODE_CONFIG_IMPORT_MODE="$OPENCODE_CONFIG_IMPORT_MODE"
  -e OPENCODE_AUTH_IMPORT_MODE="$AUTH_IMPORT_MODE"
  -e OPENCODE_TEMPLATES_IMPORT_MODE="$DOC_TEMPLATES_IMPORT_MODE"
  -e X2_DB_PATH=/srv/opencode/data/state.db
  -v "$VOLUME_CONFIG:/srv/opencode/config$MOUNT_LABEL_SUFFIX"
  -v "$VOLUME_DATA:/srv/opencode/data$MOUNT_LABEL_SUFFIX"
  -v "$VOLUME_CACHE:/srv/opencode/cache$MOUNT_LABEL_SUFFIX"
  -v "$PROJECT_DIR:/workspace/project$MOUNT_LABEL_SUFFIX"
)
if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
  _seed_mount_opts="ro"
  if [ -n "$MOUNT_LABEL_SUFFIX" ]; then
    _seed_mount_opts="ro,${MOUNT_LABEL_SUFFIX#:}"
  fi

  PODMAN_RUN_ARGS+=( -v "$DEVSERVER_MASK_VOLUME:/workspace/project/.devserver$MOUNT_LABEL_SUFFIX" )
  if [ -f "$AUTH_IMPORT_SOURCE_HOST" ]; then
    PODMAN_RUN_ARGS+=( -v "$AUTH_IMPORT_SOURCE_HOST:/run/opencode-seed/auth.json:${_seed_mount_opts}" )
  fi
  if [ -f "$OPENCODE_CONFIG_SOURCE_HOST" ]; then
    PODMAN_RUN_ARGS+=( -v "$OPENCODE_CONFIG_SOURCE_HOST:/run/opencode-seed/opencode.json:${_seed_mount_opts}" )
  fi
fi
if [ -f "$SPARK_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$SPARK_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/spark.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$SPARK_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/spark.prompt.txt:ro" )
  fi
fi
if [ -f "$GENESIS_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$GENESIS_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/genesis.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$GENESIS_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/genesis.prompt.txt:ro" )
  fi
fi
if [ -f "$MOSES_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$MOSES_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/moses.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$MOSES_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/moses.prompt.txt:ro" )
  fi
fi
if [ -f "$JOSHUA_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$JOSHUA_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/joshua.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$JOSHUA_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/joshua.prompt.txt:ro" )
  fi
fi
if [ -f "$BEZALEL_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$BEZALEL_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/bezalel.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$BEZALEL_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/bezalel.prompt.txt:ro" )
  fi
fi
if [ -f "$OHOLIAB_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$OHOLIAB_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/oholiab.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$OHOLIAB_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/oholiab.prompt.txt:ro" )
  fi
fi
if [ -f "$AARON_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$AARON_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/aaron.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$AARON_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/aaron.prompt.txt:ro" )
  fi
fi
if [ -f "$CALEB_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$CALEB_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/caleb.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$CALEB_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/caleb.prompt.txt:ro" )
  fi
fi
if [ -f "$EQ1_CORE_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$EQ1_CORE_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/eq1-core.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$EQ1_CORE_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/eq1-core.prompt.txt:ro" )
  fi
fi
if [ -f "$X2_SUMMARIZER_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$X2_SUMMARIZER_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/x2-summarizer.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$X2_SUMMARIZER_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/x2-summarizer.prompt.txt:ro" )
  fi
fi
if [ -f "$X4_SUMMARIZER_PROMPT_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$X4_SUMMARIZER_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/x4-summarizer.prompt.txt:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$X4_SUMMARIZER_PROMPT_SOURCE_HOST:/run/opencode-seed/agents/x4-summarizer.prompt.txt:ro" )
  fi
fi
if [ -d "$DOC_TEMPLATES_SOURCE_HOST" ]; then
  if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
    PODMAN_RUN_ARGS+=( -v "$DOC_TEMPLATES_SOURCE_HOST:$DOC_TEMPLATES_SOURCE_CONTAINER:${_seed_mount_opts}" )
  else
    PODMAN_RUN_ARGS+=( -v "$DOC_TEMPLATES_SOURCE_HOST:$DOC_TEMPLATES_SOURCE_CONTAINER:ro" )
  fi
fi
if [ -f "$AUTH_IMPORT_SOURCE_HOST" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_AUTH_IMPORT_PATH=$AUTH_IMPORT_SOURCE_CONTAINER")
else
  warn_env "auth seed not found: $AUTH_IMPORT_SOURCE_HOST"
fi
if [ -f "$OPENCODE_CONFIG_SOURCE_HOST" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_CONFIG_IMPORT_PATH=$OPENCODE_CONFIG_SOURCE_CONTAINER")
else
  warn_env "opencode seed config not found: $OPENCODE_CONFIG_SOURCE_HOST"
fi
if [ -d "$DOC_TEMPLATES_SOURCE_HOST" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_TEMPLATES_IMPORT_PATH=$DOC_TEMPLATES_SOURCE_CONTAINER")
else
  warn_env "docs templates seed not found: $DOC_TEMPLATES_SOURCE_HOST"
fi
if [ -n "$X1_POLLER_TOKEN" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_POLLER_TOKEN=$X1_POLLER_TOKEN")
fi
if [ -n "$X1_BOT_TOKEN" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_BOT_TOKEN=$X1_BOT_TOKEN")
fi
if [ -n "$X1_POLLER_ALLOWED_USER_IDS" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_POLLER_ALLOWED_USER_IDS=$X1_POLLER_ALLOWED_USER_IDS")
fi
if [ -n "$X1_POLLER_POLL_INTERVAL_MS" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_POLL_INTERVAL_MS=$X1_POLLER_POLL_INTERVAL_MS")
fi
if [ -n "$X1_POLLER_POLL_TIMEOUT_SEC" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_POLL_TIMEOUT_SEC=$X1_POLLER_POLL_TIMEOUT_SEC")
fi
if [ -n "$X1_POLLER_POLL_LIMIT" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_POLL_LIMIT=$X1_POLLER_POLL_LIMIT")
fi
if [ -n "$X1_POLLER_API_BASE" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_X1_API_BASE=$X1_POLLER_API_BASE")
fi
if [ ! -f "$SPARK_PROMPT_SOURCE_HOST" ]; then
  warn_env "spark prompt seed not found: $SPARK_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$GENESIS_PROMPT_SOURCE_HOST" ]; then
  warn_env "genesis prompt seed not found: $GENESIS_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$MOSES_PROMPT_SOURCE_HOST" ]; then
  warn_env "moses prompt seed not found: $MOSES_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$JOSHUA_PROMPT_SOURCE_HOST" ]; then
  warn_env "joshua prompt seed not found: $JOSHUA_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$BEZALEL_PROMPT_SOURCE_HOST" ]; then
  warn_env "bezalel prompt seed not found: $BEZALEL_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$OHOLIAB_PROMPT_SOURCE_HOST" ]; then
  warn_env "oholiab prompt seed not found: $OHOLIAB_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$AARON_PROMPT_SOURCE_HOST" ]; then
  warn_env "aaron prompt seed not found: $AARON_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$CALEB_PROMPT_SOURCE_HOST" ]; then
  warn_env "caleb prompt seed not found: $CALEB_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$EQ1_CORE_PROMPT_SOURCE_HOST" ]; then
  warn_env "eq1-core prompt seed not found: $EQ1_CORE_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$X2_SUMMARIZER_PROMPT_SOURCE_HOST" ]; then
  warn_env "x2 summarizer prompt seed not found: $X2_SUMMARIZER_PROMPT_SOURCE_HOST"
fi
if [ ! -f "$X4_SUMMARIZER_PROMPT_SOURCE_HOST" ]; then
  warn_env "x4 summarizer prompt seed not found: $X4_SUMMARIZER_PROMPT_SOURCE_HOST"
fi
if [ "$USE_TTY" = "1" ]; then
  PODMAN_RUN_ARGS+=( -it )
fi
if [ "$DASHBOARD_ENABLED" = "1" ]; then
  PODMAN_RUN_ARGS+=( -p "$DASHBOARD_HOST_PORT:$CONTAINER_DASHBOARD_PORT" )
  if [ "$EXPOSE_DASHBOARD_INTERNAL" = "1" ]; then
    PODMAN_RUN_ARGS+=( -p "$DASHBOARD_INTERNAL_HOST_PORT:$DASHBOARD_INTERNAL_PORT" )
  fi
fi
if [ "$X1_ENABLED" = "1" ]; then
  if [ "$X1_MODE" = "webhook" ]; then
    PODMAN_RUN_ARGS+=( -p "$X1_WEBHOOK_HOST_PORT:$CONTAINER_X1_WEBHOOK_PORT" )
  fi
fi
if [ -f "$ENV_FILE" ]; then
  PODMAN_RUN_ARGS+=(--env-file "$ENV_FILE")
fi
if [ -n "${OPENCODE_SERVER_PASSWORD:-}" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_SERVER_PASSWORD=$OPENCODE_SERVER_PASSWORD")
fi

echo "SANDBOX:       podman (enabled)"
echo "CONTAINER:     $CONTAINER_NAME"
echo "VOLUMES:       config=$VOLUME_CONFIG data=$VOLUME_DATA cache=$VOLUME_CACHE"
echo "RUN-SYNC DIR:  $RUN_SYNC_DIR"
echo "SEED SOURCES:  opencode=$OPENCODE_CONFIG_SOURCE_HOST auth=$AUTH_IMPORT_SOURCE_HOST spark=$SPARK_PROMPT_SOURCE_HOST genesis=$GENESIS_PROMPT_SOURCE_HOST moses=$MOSES_PROMPT_SOURCE_HOST joshua=$JOSHUA_PROMPT_SOURCE_HOST bezalel=$BEZALEL_PROMPT_SOURCE_HOST oholiab=$OHOLIAB_PROMPT_SOURCE_HOST aaron=$AARON_PROMPT_SOURCE_HOST caleb=$CALEB_PROMPT_SOURCE_HOST eq1=$EQ1_CORE_PROMPT_SOURCE_HOST x2=$X2_SUMMARIZER_PROMPT_SOURCE_HOST x4=$X4_SUMMARIZER_PROMPT_SOURCE_HOST templates=$DOC_TEMPLATES_SOURCE_HOST"
echo "SUMMARIZER AGENTS: x2=$X2_SUMMARIZER_AGENT x4=$X4_SUMMARIZER_AGENT"
if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
  echo "WORKSPACE:     /workspace/project (.devserver excluded)"
  echo "MASK VOLUME:   $DEVSERVER_MASK_VOLUME -> /workspace/project/.devserver"
fi
echo "PORT MAP:      host:$HOST_PORT -> xoc:$CONTAINER_OPENCODE_PORT"
if [ "$DASHBOARD_ENABLED" = "1" ]; then
  echo "PORT MAP:      host:$DASHBOARD_HOST_PORT -> dashboard_proxy:$CONTAINER_DASHBOARD_PORT"
  if [ "$EXPOSE_DASHBOARD_INTERNAL" = "1" ]; then
    echo "PORT MAP:      host:$DASHBOARD_INTERNAL_HOST_PORT -> dashboard_internal:$DASHBOARD_INTERNAL_PORT"
  fi
fi
if [ "$X1_ENABLED" = "1" ]; then
  if [ "$X1_MODE" = "webhook" ]; then
    echo "PORT MAP:      host:$X1_WEBHOOK_HOST_PORT -> x1_webhook:$CONTAINER_X1_WEBHOOK_PORT"
  else
    echo "X1 mode:      $X1_MODE"
  fi
fi
podman run "${PODMAN_RUN_ARGS[@]}" "$IMAGE_NAME"
