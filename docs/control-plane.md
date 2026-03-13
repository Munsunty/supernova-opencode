# Control Plane + Dashboard

*Last Updated: 2026-03-12*

## 목적

- Telegram 없이도 `devserver`와 상호작용할 수 있는 웹 채널을 제공한다.
- 여러 `devserver`를 하나의 화면에서 관측한다.
- `X2/X3/X4/session` 상태를 프론트에서 확인할 수 있도록 한다.
- 이후 multi-agent orchestration을 얹을 수 있는 control-plane 축을 만든다.

## 참조 방향

- UI 철학은 `oh-my-opencode-dashboard`의 읽기 중심, redaction-first 대시보드에서 영감을 받는다.
- 단, 데이터 소스는 OpenCode 내부 DB 직접 조회가 아니라:
  - OpenCode HTTP API / SDK wrapper
  - 우리 `state.db`
  - 우리 `metrics_events`
  를 우선 사용한다.

## 현재 추가된 구성

- 서버: [server.ts](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/server.ts)
- registry loader: [registry.ts](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/registry.ts)
- summary/data adapter: [summary.ts](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/summary.ts)
- 정적 프론트:
  - [index.html](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/public/index.html)
  - [styles.css](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/public/styles.css)
  - [app.js](/Users/nova/Documents/project/devserver/.devserver/src/control-plane/public/app.js)

## 실행

```bash
bun run control:check
bun run control:plane
```

- 기본 주소: `http://127.0.0.1:4310`
- 기본 registry:
  - `CONTROL_PLANE_PROJECTS_FILE`가 없고 `.devserver/control-plane/projects.json`도 없으면
  - 현재 저장소를 단일 source로 자동 등록한다.
  - 이때 OpenCode base URL은 `X_OC_PODMAN_X1_DIRECT_BASE_URL`을 우선 사용하고, 없으면 `OPENCODE_BASE_URL`, 마지막 fallback은 `http://127.0.0.1:4996`이다.

멀티 프로젝트 registry 예시는 [projects.example.json](/Users/nova/Documents/project/devserver/.devserver/control-plane/projects.example.json) 를 참고한다.

## 현재 API

- `GET /api/health`
- `GET /api/projects`
- `GET /api/projects/:id/overview`
- `GET /api/projects/:id/sessions`
- `GET /api/projects/:id/sessions/:sessionId`
- `POST /api/projects/:id/channels/web/tasks`

## 현재 프론트 기능

- source 선택
- 프로젝트 health / queue / interaction / metrics 요약
- X4 recent decisions 표시
- session 목록 및 session detail 조회
- web thread 기반 X2 enqueue

## 다음 단계

1. `X4` 실결정 로그를 `metrics_events`에 정식 적재
2. web thread 응답/리포트 전송 규칙 추가
3. multi-devserver registry live reload
4. agent collaboration view
5. planner/builder/reviewer 형태의 multi-agent orchestration
