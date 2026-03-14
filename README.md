# .devserver

이 디렉터리는 이 저장소에서 사용하는 OpenCode 기반 devserver 런타임 패키지입니다.

주요 역할:

- OpenCode runtime 실행
- X1/X2/X3 계층 실행
- control-plane 대시보드 실행
- 프로젝트별 격리된 컨테이너/볼륨 운영

이 문서는 아래 3가지만 빠르게 확인할 수 있게 유지합니다.

- 기본 시작방법
- 기본 세팅
- 필요한 라이브러리 및 외부 리소스

## 기본 시작방법

### 1. 호스트 준비

호스트에 아래 도구가 있어야 합니다.

- `bun`
- `podman`
- 또는 `docker` (`podman`이 없을 때 fallback)
- `lsof` 같은 기본 셸 유틸

macOS에서 `podman`을 쓰는 경우에는 `podman machine`이 먼저 떠 있어야 합니다.

### 2. 패키지 설치

```bash
cd .devserver
bun install
```

이 단계는 control-plane, smoke, 각종 TypeScript 스크립트 실행에 필요합니다.

### 3. `.env` 준비

```bash
cd .devserver
cp .env.example .env
```

최소 권장값:

- LLM provider key 1개 이상
- 처음에는 Telegram을 안 쓸 경우 `X_OC_PODMAN_X1_ENABLED=0`
- Telegram을 쓸 경우 `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`

### 4. 기본 실행

실제 기준 엔트리포인트는 `./dev-up.sh`입니다.

```bash
cd .devserver
./dev-up.sh
```

보조 모드:

```bash
cd .devserver
./dev-up.sh --build-only
./dev-up.sh --run-only
```

참고:

- 현재 이 패키지에는 `bun run dev`, `bun run dev:build`, `bun run dev:run` 스크립트가 없습니다.
- 오래된 문서나 메모에서 위 명령이 보이더라도, 현재 기준은 `./dev-up.sh`입니다.

### 5. 상태 확인

```bash
cd .devserver
./dev-doctor.sh
./dev-smoke.sh
```

자주 보는 기본 주소:

- OpenCode runtime: `http://127.0.0.1:4996`
- control-plane: `http://127.0.0.1:4310`

### 6. Control Plane 실행

control-plane은 컨테이너 안이 아니라 로컬 Bun 프로세스로 띄웁니다.

```bash
cd .devserver
bun run control:check
bun run control:plane
```

## 기본 세팅

`.env`를 기준으로 아래 항목부터 맞추면 됩니다.

### 1. LLM / Eq1

최소 하나는 있어야 합니다.

- `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`
- `GROQ_API_KEY`, `GROQ_MODEL`
- `EQ1_BASE_URL`, `EQ1_API_KEY`, `EQ1_MODEL`

관련 선택값:

- `EQ1_PROVIDER`
- `EQ1_FALLBACK_PROVIDER`
- `EQ1_INTERNAL_BASE_URL`
- `EQ1_INTERNAL_AGENT`

### 2. OpenCode 런타임 / 포트

기본 포트를 바꾸거나 외부 접근 주소를 맞출 때 봅니다.

- `X_OC_PODMAN_HOST_PORT`
- `X_OC_PODMAN_CONTAINER_OPENCODE_PORT`
- `X_OC_PODMAN_OPENCODE_PORT`
- `X_OC_PODMAN_BASE_URL`
- `OPENCODE_SERVER_PASSWORD`

### 3. X1 ingress

Telegram polling 또는 direct-chatbot을 쓸 때 봅니다.

공통:

- `TELEGRAM_BOT_TOKEN`
- `ALLOWED_USER_IDS`
- `X_OC_PODMAN_X1_ENABLED`
- `X_OC_PODMAN_X1_MODE`

poller 관련:

- `X_OC_PODMAN_X1_POLLER_SOURCE`
- `X_OC_PODMAN_X1_POLLER_TASK_SOURCE`
- `X_OC_PODMAN_X1_POLLER_POLL_INTERVAL_MS`
- `X_OC_PODMAN_X1_POLLER_POLL_TIMEOUT_SEC`
- `X_OC_PODMAN_X1_POLLER_POLL_LIMIT`

direct 관련:

- `X_OC_PODMAN_X1_DIRECT_TOKEN`
- `X_OC_PODMAN_X1_DIRECT_AGENT`
- `X_OC_PODMAN_X1_DIRECT_BASE_URL`
- `X_OC_PODMAN_X1_DIRECT_ALLOWED_USER_IDS`

Telegram을 당장 쓰지 않으면:

- `X_OC_PODMAN_X1_ENABLED=0`

### 4. X2 / X4 agent 설정

- `X_OC_PODMAN_X2_AGENT_ROUTING`
- `X_OC_PODMAN_X2_SIMPLE_AGENT`
- `X_OC_PODMAN_X2_COMPLEX_AGENT`
- `X_OC_PODMAN_X2_BYPASS_AGENT`
- `X_OC_PODMAN_X2_BYPASS_MODEL`
- `X_OC_PODMAN_X2_SUMMARIZER_AGENT`
- `X_OC_PODMAN_X4_SUMMARIZER_AGENT`
- `X2_SUMMARIZER_AGENT`
- `X4_SUMMARIZER_AGENT`

### 5. Control Plane

- `CONTROL_PLANE_PROJECTS_FILE`
- `CONTROL_PLANE_OPENCODE_BASE_URL`
- `CONTROL_PLANE_HOST`
- `CONTROL_PLANE_PORT`

### 6. 실행 위치 규칙

스크립트는 현재 shell 위치가 아니라 `.devserver` 디렉터리 기준으로 경로를 해석합니다.

- 기본 프로젝트 루트: `.devserver`의 부모 디렉터리
- 필요 시 `X_OC_PROJECT_DIR`로 override 가능

예:

```bash
/path/to/project/.devserver/dev-up.sh
```

### 7. 런타임 데이터 위치

주요 디렉터리:

- `config/`: OpenCode config/XDG config
- `data/`: auth, state DB, logs
- `cache/`: runtime cache
- `agents/`: agent prompt seed
- `run-sync/`: 컨테이너 시작 시 import하는 seed 파일
- `src/`: control-plane 및 worker 스크립트

## 필요한 라이브러리 및 외부 리소스

### 호스트 도구

호스트에서 직접 필요합니다.

- `bun`
- `podman` 또는 `docker`
- `bash`
- `lsof`

### Bun 패키지

`package.json` 기준 런타임/도구 의존성:

- `opencode-ai`
- `@opencode-ai/sdk`
- `@opencode-ai/plugin`
- `puppeteer-core`
- `@types/bun` (`devDependencies`)

### 컨테이너 / 런타임 자원

실행 시 아래 파일과 리소스를 사용합니다.

- `dockerfile`: Bun 기반 OpenCode 이미지 빌드 정의
- `compose.yaml`: 보조 compose 정의
- `entrypoint.sh`: 컨테이너 내부 프로세스 기동
- `run-sync/opencode.json`: OpenCode config seed
- `run-sync/templates`: 문서 템플릿 seed
- Podman/Docker volume: `config`, `data`, `cache`

베이스 이미지는 현재 `docker.io/oven/bun:1.3.10-debian`입니다.

### 외부 리소스

#### 필수

- LLM provider API key
  - 예: Cerebras, Groq, 또는 OpenAI-compatible provider

#### 선택

- Telegram Bot API
  - `TELEGRAM_BOT_TOKEN`
  - `ALLOWED_USER_IDS`
- Dashboard package
  - `X_OC_PODMAN_DASHBOARD_ENABLED=1`
  - `OPENCODE_DASHBOARD_PACKAGE`

### 자주 쓰는 명령

```bash
cd .devserver

# 런타임 기동
./dev-up.sh

# 진단
./dev-doctor.sh
./dev-smoke.sh
bun run eq1:smoke

# control-plane
bun run control:check
bun run control:plane

# OpenCode 관련 패키지 업데이트
bun run update
```
