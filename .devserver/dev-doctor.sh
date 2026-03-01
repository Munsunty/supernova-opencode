#!/bin/bash
set -euo pipefail

DEVSERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DEVSERVER_DIR/.." && pwd)"

HOST_PORT="${X_OC_PODMAN_HOST_PORT:-4996}"
DASHBOARD_ENABLED="${X_OC_PODMAN_DASHBOARD_ENABLED:-1}"
DASHBOARD_HOST_PORT="${X_OC_PODMAN_DASHBOARD_HOST_PORT:-51234}"
DASHBOARD_INTERNAL_EXPOSE="${X_OC_PODMAN_EXPOSE_DASHBOARD_INTERNAL:-1}"
DASHBOARD_INTERNAL_HOST_PORT="${X_OC_PODMAN_DASHBOARD_INTERNAL_HOST_PORT:-51235}"
CHECK_PROVIDER_KEYS="${X_OC_DOCTOR_CHECK_PROVIDER_KEYS:-0}"

failures=0
warnings=0

pass() {
  echo "[PASS] $1"
}

warn() {
  warnings=$((warnings + 1))
  echo "[WARN] $1"
}

fail() {
  failures=$((failures + 1))
  echo "[FAIL] $1"
}

check_file() {
  local path=$1
  if [ -f "$path" ]; then
    pass "file exists: $path"
  else
    fail "missing file: $path"
  fi
}

check_port() {
  local port=$1
  if ! command -v lsof >/dev/null 2>&1; then
    warn "lsof not found; skip port check ($port)"
    return 0
  fi

  local listeners
  listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$listeners" ]; then
    pass "port available: $port"
    return 0
  fi

  warn "port in use: $port"
  echo "$listeners" | sed 's/^/       /'
}

echo "=== Podman Dev Doctor ==="
echo "PROJECT_DIR:   $PROJECT_DIR"
echo "DEVSERVER_DIR: $DEVSERVER_DIR"

echo "-- binaries --"
if command -v podman >/dev/null 2>&1; then
  pass "podman found: $(command -v podman)"
else
  fail "podman command not found"
fi

if command -v bun >/dev/null 2>&1; then
  pass "bun found: $(command -v bun)"
else
  fail "bun command not found"
fi

if command -v curl >/dev/null 2>&1; then
  pass "curl found: $(command -v curl)"
else
  fail "curl command not found"
fi

echo "-- podman runtime --"
if command -v podman >/dev/null 2>&1; then
  if podman info >/dev/null 2>&1; then
    pass "podman info OK"
  else
    fail "podman info failed"
  fi

  if [ "$(uname)" = "Darwin" ]; then
    machine_state=$(podman machine inspect --format '{{.State}}' 2>/dev/null | head -1 || true)
    machine_socket=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null | head -1 || true)

    if [ -z "$machine_state" ]; then
      fail "podman machine inspect failed"
    else
      pass "podman machine state: $machine_state"
    fi

    if [ -n "$machine_socket" ] && [ -S "$machine_socket" ]; then
      pass "podman machine socket OK: $machine_socket"
    else
      fail "podman machine socket missing/invalid: ${machine_socket:-<empty>}"
    fi
  fi
fi

echo "-- required files --"
check_file "$DEVSERVER_DIR/dev-up.sh"
check_file "$DEVSERVER_DIR/dockerfile"
check_file "$DEVSERVER_DIR/entrypoint.sh"
check_file "$DEVSERVER_DIR/package.json"
check_file "$DEVSERVER_DIR/opencode.json"

echo "-- config warnings --"
if [ ! -f "$DEVSERVER_DIR/.env" ]; then
  warn "$DEVSERVER_DIR/.env not found"
else
  pass ".env present"
  set -a
  # shellcheck disable=SC1091
  . "$DEVSERVER_DIR/.env"
  set +a
fi

if [ -z "${OPENCODE_SERVER_PASSWORD:-}" ]; then
  warn "OPENCODE_SERVER_PASSWORD not set (server unsecured)"
else
  pass "OPENCODE_SERVER_PASSWORD set"
fi

if [ "$CHECK_PROVIDER_KEYS" = "1" ]; then
  if [ -z "${CEREBRAS_API_KEY:-}" ] && [ -z "${GROQ_API_KEY:-}" ] && [ -z "${EQ1_API_KEY:-}" ]; then
    warn "No provider API key env detected (optional check)"
  else
    pass "provider API key env detected (optional check)"
  fi
else
  pass "provider key check skipped (X_OC_DOCTOR_CHECK_PROVIDER_KEYS=0)"
fi

echo "-- ports --"
check_port "$HOST_PORT"
if [ "$DASHBOARD_ENABLED" = "1" ]; then
  check_port "$DASHBOARD_HOST_PORT"
  if [ "$DASHBOARD_INTERNAL_EXPOSE" = "1" ]; then
    check_port "$DASHBOARD_INTERNAL_HOST_PORT"
  else
    pass "dashboard internal host port exposure disabled"
  fi
else
  pass "dashboard disabled; skip dashboard port check"
fi

echo "-- summary --"
echo "failures=$failures warnings=$warnings"
if [ "$failures" -gt 0 ]; then
  echo "Doctor result: FAIL"
  exit 1
fi

echo "Doctor result: PASS"
exit 0
