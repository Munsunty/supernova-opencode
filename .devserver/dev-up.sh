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

if ! command -v podman >/dev/null 2>&1; then
  echo "ERROR: podman command not found"
  exit 1
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
DASHBOARD_ENABLED="${X_OC_PODMAN_DASHBOARD_ENABLED:-1}"
DASHBOARD_PROXY_ENABLED="${X_OC_PODMAN_DASHBOARD_PROXY_ENABLED:-1}"
EXPOSE_DASHBOARD_INTERNAL="${X_OC_PODMAN_EXPOSE_DASHBOARD_INTERNAL:-1}"
X2_ENABLED="${X_OC_PODMAN_X2_ENABLED:-1}"
FORCE_KILL_PORTS="${X_OC_PODMAN_FORCE_KILL_PORTS:-0}"
USE_TTY="${X_OC_PODMAN_TTY:-1}"
WARN_PROVIDER_KEYS="${X_OC_WARN_PROVIDER_KEYS:-0}"
EXCLUDE_DEVSERVER="${X_OC_PODMAN_EXCLUDE_DEVSERVER:-1}"
RUN_SYNC_DIR="${X_OC_PODMAN_RUN_SYNC_DIR:-$DEVSERVER_DIR/run-sync}"
AUTH_IMPORT_MODE="${X_OC_PODMAN_AUTH_IMPORT_MODE:-always}"
AUTH_IMPORT_SOURCE_HOST="${X_OC_PODMAN_AUTH_SOURCE_HOST:-$RUN_SYNC_DIR/auth.json}"
OMO_CONFIG_IMPORT_MODE="${X_OC_PODMAN_OMO_CONFIG_IMPORT_MODE:-always}"
OMO_CONFIG_SOURCE_HOST="${X_OC_PODMAN_OMO_CONFIG_SOURCE_HOST:-$RUN_SYNC_DIR/oh-my-opencode.jsonc}"

# Backward compatibility: if run-sync seed files are not present,
# use legacy locations when available.
if [ -z "${X_OC_PODMAN_AUTH_SOURCE_HOST:-}" ] && [ ! -f "$AUTH_IMPORT_SOURCE_HOST" ] && [ -f "$DEVSERVER_DIR/opencode/auth.json" ]; then
  AUTH_IMPORT_SOURCE_HOST="$DEVSERVER_DIR/opencode/auth.json"
fi
if [ -z "${X_OC_PODMAN_OMO_CONFIG_SOURCE_HOST:-}" ] && [ ! -f "$OMO_CONFIG_SOURCE_HOST" ] && [ -f "$DEVSERVER_DIR/oh-my-opencode.jsonc" ]; then
  OMO_CONFIG_SOURCE_HOST="$DEVSERVER_DIR/oh-my-opencode.jsonc"
fi

if [ "$EXCLUDE_DEVSERVER" = "1" ]; then
  AUTH_IMPORT_SOURCE_CONTAINER="${X_OC_PODMAN_AUTH_SOURCE_CONTAINER:-/run/opencode-seed/auth.json}"
  OMO_CONFIG_SOURCE_CONTAINER="${X_OC_PODMAN_OMO_CONFIG_SOURCE_CONTAINER:-/run/opencode-seed/oh-my-opencode.jsonc}"
else
  AUTH_IMPORT_SOURCE_CONTAINER="${X_OC_PODMAN_AUTH_SOURCE_CONTAINER:-/workspace/project/.devserver/run-sync/auth.json}"
  OMO_CONFIG_SOURCE_CONTAINER="${X_OC_PODMAN_OMO_CONFIG_SOURCE_CONTAINER:-/workspace/project/.devserver/run-sync/oh-my-opencode.jsonc}"
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
  -e OPENCODE_READY_TIMEOUT_MS="$READY_TIMEOUT_MS"
  -e OPENCODE_READY_INTERVAL_MS="$READY_INTERVAL_MS"
  -e OPENCODE_AUTH_IMPORT_MODE="$AUTH_IMPORT_MODE"
  -e OPENCODE_OMO_CONFIG_IMPORT_MODE="$OMO_CONFIG_IMPORT_MODE"
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
  if [ -f "$OMO_CONFIG_SOURCE_HOST" ]; then
    PODMAN_RUN_ARGS+=( -v "$OMO_CONFIG_SOURCE_HOST:/run/opencode-seed/oh-my-opencode.jsonc:${_seed_mount_opts}" )
  fi
fi
if [ -f "$AUTH_IMPORT_SOURCE_HOST" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_AUTH_IMPORT_PATH=$AUTH_IMPORT_SOURCE_CONTAINER")
else
  warn_env "auth seed not found: $AUTH_IMPORT_SOURCE_HOST"
fi
if [ -f "$OMO_CONFIG_SOURCE_HOST" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_OMO_CONFIG_IMPORT_PATH=$OMO_CONFIG_SOURCE_CONTAINER")
else
  warn_env "oh-my-opencode seed config not found: $OMO_CONFIG_SOURCE_HOST"
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
echo "SEED SOURCES:  auth=$AUTH_IMPORT_SOURCE_HOST omo=$OMO_CONFIG_SOURCE_HOST"
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
podman run "${PODMAN_RUN_ARGS[@]}" "$IMAGE_NAME"
