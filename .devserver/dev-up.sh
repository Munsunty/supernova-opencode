#!/bin/bash
# OpenCode 격리 환경 기동 스크립트
# 모든 격리 파일은 .devserver/ 안에 위치

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DEVSERVER_DIR/.." && pwd)"

export XDG_CONFIG_HOME="$DEVSERVER_DIR/config"
export XDG_DATA_HOME="$DEVSERVER_DIR/data"
export XDG_CACHE_HOME="$DEVSERVER_DIR/cache"
export OPENCODE_CONFIG="$DEVSERVER_DIR/opencode.json"
export OPENCODE_CONFIG_DIR="$DEVSERVER_DIR"

echo "=== OpenCode 격리 환경 기동 ==="
echo "PROJECT_DIR:  $PROJECT_DIR"
echo "DEVSERVER_DIR: $DEVSERVER_DIR"
echo "CONFIG:       $OPENCODE_CONFIG"
echo "================================"

# 기존 프로세스 정리
cleanup_port() {
  local port=$1 pid
  pid=$(lsof -ti :"$port" 2>/dev/null)
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

# 종료 시 Dashboard도 같이 정리
trap "kill $DASHBOARD_PID 2>/dev/null" EXIT

# OpenCode 서버 (포그라운드)
exec "$DEVSERVER_DIR/node_modules/.bin/opencode" serve --port 4996
