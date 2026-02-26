#!/bin/bash
# OpenCode 격리 환경 기동 스크립트
# 모든 격리 파일은 .devserver/ 안에 위치
#
# 기본 원칙:
# - opencode runtime config(opencode.runtime.json)를 시작 시점에 생성
# - 프로젝트 경로 기반 permission allowlist 적용 (cross-platform)
# - Linux에서는 선택적으로 bwrap 샌드박스 사용 가능 (X_OC_USE_BWRAP=1)

set -euo pipefail

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DEVSERVER_DIR/.." && pwd)"
OPENCODE_BIN="$DEVSERVER_DIR/node_modules/.bin/opencode"
RUNTIME_CONFIG="$DEVSERVER_DIR/opencode.json"

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

echo "=== OpenCode 격리 환경 기동 ==="
echo "PROJECT_DIR:  $PROJECT_DIR"
echo "DEVSERVER_DIR: $DEVSERVER_DIR"
echo "================================"

# 기존 프로세스 정리
cleanup_port() {
  local port=$1 pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Port $port in use (pid: $pid), killing..."
    kill "$pid" 2>/dev/null
    sleep 1
  fi
}

cleanup_port 4996
cleanup_port 51234

# Dashboard (백그라운드, 실패해도 opencode에 영향 없음)
bunx oh-my-opencode-dashboard@latest --project "$PROJECT_DIR" &
DASHBOARD_PID=$!
echo "Dashboard started (pid: $DASHBOARD_PID, port: 51234)"

# X2 worker (백그라운드)
bun run "$DEVSERVER_DIR/x2/worker.ts" &
X2_WORKER_PID=$!
echo "X2 worker started (pid: $X2_WORKER_PID)"

# 종료 시 백그라운드 프로세스 정리
trap "kill $DASHBOARD_PID $X2_WORKER_PID 2>/dev/null" EXIT

if [ ! -x "$OPENCODE_BIN" ]; then
  echo "ERROR: opencode binary not found: $OPENCODE_BIN"
  exit 1
fi

# runtime config 생성 (pwd/project 경로 기반)
bun run "$DEVSERVER_DIR/scripts/generate-opencode-config.ts" \
  --project-dir "$PROJECT_DIR" \
  --template "$DEVSERVER_DIR/opencode.json" \
  --out "$RUNTIME_CONFIG"

export OPENCODE_CONFIG="$RUNTIME_CONFIG"
echo "CONFIG:       $OPENCODE_CONFIG"

# Linux에서만 선택적으로 bwrap 샌드박스 사용
USE_BWRAP="${X_OC_USE_BWRAP:-0}"
if [ "$USE_BWRAP" = "1" ] && [ "$(uname -s)" = "Linux" ] && command -v bwrap >/dev/null 2>&1; then
  SANDBOX_HOME="$DEVSERVER_DIR/data/opencode/home"
  mkdir -p "$SANDBOX_HOME"

  BWRAP_ARGS=(
    --die-with-parent
    --new-session
    --unshare-pid
    --proc /proc
    --dev /dev
    --tmpfs /tmp
    --dir /run
    --dir /var
    --dir /etc
    --ro-bind /usr /usr
    --symlink usr/bin /bin
    --symlink usr/sbin /sbin
    --symlink usr/lib /lib
    --symlink usr/lib64 /lib64
  )

  CURRENT_DIR=""
  IFS='/' read -r -a PATH_PARTS <<< "$PROJECT_DIR"
  for PART in "${PATH_PARTS[@]}"; do
    [ -z "$PART" ] && continue
    CURRENT_DIR="$CURRENT_DIR/$PART"
    BWRAP_ARGS+=(--dir "$CURRENT_DIR")
  done

  for HOST_PATH in \
    /etc/hosts \
    /etc/resolv.conf \
    /etc/nsswitch.conf \
    /etc/passwd \
    /etc/group \
    /etc/localtime \
    /etc/ssl \
    /etc/ca-certificates; do
    if [ -e "$HOST_PATH" ]; then
      BWRAP_ARGS+=(--ro-bind "$HOST_PATH" "$HOST_PATH")
    fi
  done

  BWRAP_ARGS+=(--bind "$PROJECT_DIR" "$PROJECT_DIR")
  echo "SANDBOX:      bwrap (enabled)"
  exec bwrap \
    "${BWRAP_ARGS[@]}" \
    --chdir "$PROJECT_DIR" \
    --setenv HOME "$SANDBOX_HOME" \
    --setenv XDG_CONFIG_HOME "$XDG_CONFIG_HOME" \
    --setenv XDG_DATA_HOME "$XDG_DATA_HOME" \
    --setenv XDG_CACHE_HOME "$XDG_CACHE_HOME" \
    --setenv OPENCODE_CONFIG "$OPENCODE_CONFIG" \
    --setenv OPENCODE_CONFIG_DIR "$OPENCODE_CONFIG_DIR" \
    "$OPENCODE_BIN" serve --port 4996
fi

if [ "$USE_BWRAP" = "1" ]; then
  echo "SANDBOX:      bwrap requested but unavailable, falling back to permission sandbox"
else
  echo "SANDBOX:      permission sandbox (default)"
fi

exec "$OPENCODE_BIN" serve --port 4996
