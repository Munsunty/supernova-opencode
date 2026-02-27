#!/bin/bash
# OpenCode dev environment bootstrap (Podman-only)
# - opencode + dashboard + X2 worker run inside Podman

set -euo pipefail

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DEVSERVER_DIR/.." && pwd)"
PODMAN_DOCKERFILE="$DEVSERVER_DIR/dockerfile"

export XDG_CONFIG_HOME="$DEVSERVER_DIR/config"
export XDG_DATA_HOME="$DEVSERVER_DIR/data"
export XDG_CACHE_HOME="$DEVSERVER_DIR/cache"
export OPENCODE_CONFIG_DIR="$DEVSERVER_DIR"

# Load local env file for worker/provider keys.
if [ -f "$DEVSERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DEVSERVER_DIR/.env"
  set +a
fi

echo "=== OpenCode dev-up (podman-only) ==="
echo "PROJECT_DIR:   $PROJECT_DIR"
echo "DEVSERVER_DIR: $DEVSERVER_DIR"
echo "====================================="

cleanup_port() {
  local port=$1 pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Port $port in use (pid: $pid), killing..."
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
}

if ! command -v podman >/dev/null 2>&1; then
  echo "ERROR: podman command not found"
  exit 1
fi
if [ ! -f "$PODMAN_DOCKERFILE" ]; then
  echo "ERROR: podman dockerfile not found: $PODMAN_DOCKERFILE"
  exit 1
fi

cleanup_port 4996
cleanup_port 51234

IMAGE_NAME="${X_OC_PODMAN_IMAGE_NAME:-homsa-opencode-testbed:latest}"
CONTAINER_NAME="${X_OC_PODMAN_CONTAINER_NAME:-homsa-opencode-testbed}"
HOST_PORT="${X_OC_PODMAN_HOST_PORT:-4996}"
DASHBOARD_HOST_PORT="${X_OC_PODMAN_DASHBOARD_HOST_PORT:-51234}"
MOUNT_LABEL_SUFFIX="${X_OC_PODMAN_MOUNT_LABEL_SUFFIX:-Z}"
if [ -n "$MOUNT_LABEL_SUFFIX" ]; then
  MOUNT_LABEL_SUFFIX=":$MOUNT_LABEL_SUFFIX"
fi

podman build -t "$IMAGE_NAME" -f "$PODMAN_DOCKERFILE" "$DEVSERVER_DIR"
podman rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

PODMAN_RUN_ARGS=(
  --rm
  -it
  --name "$CONTAINER_NAME"
  -p "$HOST_PORT:4996"
  -p "$DASHBOARD_HOST_PORT:51234"
  -e OPENCODE_PORT=4996
  -e OPENCODE_HOSTNAME=0.0.0.0
  -e OPENCODE_WORKSPACE=/workspace/project
  -e OPENCODE_DASHBOARD_ENABLED=1
  -e OPENCODE_DASHBOARD_PORT=51234
  -e OPENCODE_DASHBOARD_PROXY_ENABLED=1
  -e OPENCODE_DASHBOARD_INTERNAL_PORT=51235
  -e OPENCODE_X2_ENABLED=1
  -e OPENCODE_X2_WORKER_SCRIPT=/opt/opencode/src/x2/worker.ts
  -e X2_DB_PATH=/srv/opencode/data/state.db
  -v "homsa_opencode_config:/srv/opencode/config$MOUNT_LABEL_SUFFIX"
  -v "homsa_opencode_data:/srv/opencode/data$MOUNT_LABEL_SUFFIX"
  -v "homsa_opencode_cache:/srv/opencode/cache$MOUNT_LABEL_SUFFIX"
  -v "$PROJECT_DIR:/workspace/project$MOUNT_LABEL_SUFFIX"
)
if [ -f "$DEVSERVER_DIR/.env" ]; then
  PODMAN_RUN_ARGS+=(--env-file "$DEVSERVER_DIR/.env")
fi
if [ -n "${OPENCODE_SERVER_PASSWORD:-}" ]; then
  PODMAN_RUN_ARGS+=(-e "OPENCODE_SERVER_PASSWORD=$OPENCODE_SERVER_PASSWORD")
fi

echo "SANDBOX:       podman (enabled)"
podman run "${PODMAN_RUN_ARGS[@]}" "$IMAGE_NAME"
