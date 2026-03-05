# Podman Troubleshooting

*Last Updated: 2026-02-28*

## 빠른 점검

```bash
bun run dev:doctor
bun run dev:smoke
```

- `dev:doctor`: 의존성/Podman runtime/포트/.env 상태를 사전 점검한다.
- `dev:smoke`: `dev-up`을 백그라운드로 기동해 readiness(`opencode`, `dashboard`)를 확인한 뒤 자동 정리한다.

## 자주 발생하는 오류

### 1) `podman info failed`

- 증상: `dev-up` 시작 직후 Podman preflight 실패
- 조치:
  - `podman machine init` (최초 1회)
  - `podman machine start`
  - `bun run dev:doctor` 재실행

### 2) `podman machine inspect failed (no machine found)`

- 증상: macOS에서 머신 상태 조회 실패
- 조치:
  - `podman machine list`로 머신 존재 여부 확인
  - 없으면 `podman machine init`
  - 있으면 `podman machine stop && podman machine start`

### 3) `port <N> already in use`

- 기본 동작: 강제 kill 없이 fail-fast
- 조치:
  - 점유 프로세스 확인: `lsof -nP -iTCP:<PORT> -sTCP:LISTEN`
  - 이전 컨테이너 정리: `podman rm -f <container-name>`
  - 자동 kill 허용: `X_OC_PODMAN_FORCE_KILL_PORTS=1 bun run dev`

### 4) startup readiness timeout

- 증상: `entrypoint.sh` readiness 단계에서 실패 후 자동 teardown
- 확인:
  - `opencode`: `http://127.0.0.1:4996/global/health`
  - `dashboard`: `http://127.0.0.1:51234`
- 조치:
  - timeout 완화: `X_OC_PODMAN_READY_TIMEOUT_MS=60000 bun run dev`
  - 간격 조정: `X_OC_PODMAN_READY_INTERVAL_MS=1000 bun run dev`

## 주요 환경변수

### Host(dev-up) 계층

- `X_OC_PODMAN_HOST_PORT`: host opencode 포트 (기본 `4996`)
- `X_OC_PODMAN_DASHBOARD_HOST_PORT`: host dashboard 포트 (기본 `51234`)
- `X_OC_PODMAN_DASHBOARD_INTERNAL_HOST_PORT`: host에서 dashboard internal 포트 직접 노출 시 포트 (기본 `51235`)
- `X_OC_PODMAN_EXPOSE_DASHBOARD_INTERNAL`: dashboard internal 포트 host 노출 여부 (`0|1`, 기본 `1`)
- `X_OC_PODMAN_FORCE_KILL_PORTS`: 포트 점유 시 강제 종료 (`0|1`, 기본 `0`)
- `X_OC_PODMAN_TTY`: `podman run -it` 사용 여부 (`0|1`, 기본 `1`)
- `X_OC_PODMAN_PROJECT_SCOPE`: volume/container 이름 스코프 오버라이드
- `X_OC_PODMAN_VOLUME_PREFIX`: volume 접두사 오버라이드
- `X_OC_PODMAN_VOLUME_CONFIG|DATA|CACHE`: 개별 volume 이름 오버라이드
- `X_OC_DOCTOR_CHECK_PROVIDER_KEYS`: `dev:doctor`에서 provider key 체크 수행 여부 (`0|1`, 기본 `0`)
- `X_OC_WARN_PROVIDER_KEYS`: `dev-up` 시작 시 provider key 경고 출력 여부 (`0|1`, 기본 `0`)

### Container(entrypoint) 계층

- `X_OC_PODMAN_CONTAINER_OPENCODE_PORT`: 컨테이너 내부 opencode 포트 (기본 `4996`)
- `X_OC_PODMAN_CONTAINER_DASHBOARD_PORT`: 컨테이너 내부 dashboard proxy 포트 (기본 `51234`)
- `X_OC_PODMAN_DASHBOARD_INTERNAL_PORT`: 컨테이너 내부 dashboard 실제 바인드 포트 (기본 `51235`)
- `OPENCODE_READY_TIMEOUT_MS`, `OPENCODE_READY_INTERVAL_MS`: readiness 타이밍
- `OPENCODE_HEALTH_PATH`: opencode readiness path (기본 `/global/health`)
- `OPENCODE_READY_HOST`: readiness 호출 host (기본 `127.0.0.1`)
- `OPENCODE_CONFIG_CONTENT`: 초기 config JSON 문자열 직접 주입 (seed보다 우선)
- `OPENCODE_CONFIG_IMPORT_PATH`: OpenCode config seed 경로 (기본: `dev-up`이 `/run/opencode-seed/opencode.json`로 주입)
- `OPENCODE_CONFIG_IMPORT_MODE`: OpenCode config seed import 모드 (`always|if-missing|off`, 기본 `always`)
- `OPENCODE_DASHBOARD_BIN`, `OPENCODE_DASHBOARD_PACKAGE`: dashboard 실행 바이너리/패키지 오버라이드
- `OPENCODE_DASHBOARD_PROXY_SCRIPT`: dashboard proxy 스크립트 경로 (기본 `/opt/opencode/src/scripts/dashboard-proxy.ts`)
- `OPENCODE_DASHBOARD_READY_PATH`: dashboard readiness path (기본 `/`)

## 포트 설계 원칙

- host 포트와 container 내부 포트는 서로 달라도 된다.
- 내부 통신은 container 내부 포트 기준으로 동작하고, 외부 디버깅/접속 포트만 host 매핑으로 바꿔도 된다.
- 기본값은 `4996(opencode)`, `51234(dashboard proxy)`, `51235(dashboard internal)`이지만 모두 env로 분리 가능하다.

## 운영 권장 순서

1. `bun run dev:doctor`
2. `bun run dev:smoke`
3. `bun run dev`
