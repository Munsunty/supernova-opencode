# SCHEMA.md

*Last Updated: 2026-03-04*

## 목적

- HOMSA 실행 계층의 데이터 계약을 단일 문서에서 관리한다.
- `queue`뿐 아니라 상태 enum, JSON 결과 스키마, 채널 매핑을 함께 정의한다.
- 구현 상세는 코드가 기준이고, 본 문서는 운영/협업 기준 계약이다.

## Source of Truth

- `.devserver/src/x2/store.ts`
- `.devserver/src/x2/queue.ts`
- `.devserver/src/x3/detector.ts`
- `.devserver/src/x3/responder.ts`
- `.devserver/src/x4/summarizer.ts`
- `.devserver/src/x4/router.ts`
- `.devserver/src/x2/worker.ts`

## 스키마 운영 규칙

- 스키마 변경은 코드와 본 문서를 같은 변경 단위로 반영한다.
- `schema_version` 필드가 있는 JSON 결과는 버전 필드를 유지한다.
- 하위 호환이 깨지는 변경은 신규 버전(`*.v2`)을 추가한다.
- enum 추가/제거 시 실행 채널 매핑 표를 반드시 갱신한다.

## SQLite 테이블 계약

### `tasks`

```sql
tasks (
  id          TEXT PRIMARY KEY,
  type                  TEXT,       -- 'classify' | 'omo_request' | 'evaluate' | 'summarize' | 'route' | 'report'
  prompt                TEXT,
  status                TEXT,       -- 'pending' | 'running' | 'completed' | 'failed'
  attempts              INTEGER,    -- dispatch/finalize retry count
  retry_at              INTEGER,    -- retry schedule epoch ms
  session_id            TEXT,       -- X_oc session id
  request_message_id    TEXT,       -- tracked user message id
  assistant_message_id  TEXT,       -- tracked assistant message id
  raw_result            TEXT,       -- assistant 원문(모니터링 전송용)
  result                TEXT,       -- 요약/구조화 결과 (사용자 요약 전송용)
  error                 TEXT,
  run_agent             TEXT,       -- 실행 경로 agent (예: spark, eq1)
  run_model             TEXT,       -- 실행 경로 model
  summary_agent         TEXT,       -- 요약 생성 agent (예: x2-summarizer, x2-local)
  summary_model         TEXT,       -- 요약 생성 model
  source                TEXT,
  started_at            INTEGER,
  completed_at          INTEGER,
  created_at            DATETIME,
  updated_at            DATETIME
)
```

### `interactions`

```sql
interactions (
  id          TEXT PRIMARY KEY,
  type        TEXT,       -- 'permission' | 'question'
  request_id  TEXT,       -- opencode request id
  session_id  TEXT,
  origin      TEXT,       -- 'managed' | 'external' | 'unknown'
  payload     TEXT,       -- request payload JSON
  status      TEXT,       -- 'pending' | 'answered' | 'rejected' | 'observed'
  answer      TEXT,       -- response payload JSON
  created_at  DATETIME,
  answered_at DATETIME
)
```

## Enum 계약

### Task Type

- `classify`
- `omo_request`
- `evaluate`
- `summarize`
- `route`
- `report`

### Task Status

- `pending`
- `running`
- `completed`
- `failed`

### Interaction Type

- `permission`
- `question`

### Interaction Status

- `pending`
- `answered`
- `rejected`
- `observed` (`external` origin에 대한 observe-only 기록)

### Metric Status

- `pending`
- `running`
- `completed`
- `failed`
- `answered`
- `rejected`
- `healthy`
- `unhealthy`

### `metrics_events`

```sql
metrics_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT,       -- readiness/task/interaction 관측 이벤트
  trace_id        TEXT,       -- 상관관계 키 (task_id / interaction_id / worker scope)
  task_id         TEXT,       -- optional task reference
  interaction_id  TEXT,       -- optional interaction reference
  request_hash    TEXT,       -- optional request_hash
  parent_id       TEXT,       -- optional parent_id
  source          TEXT,       -- 관측 발행 소스 (`x2_worker`, `x3_worker` 등)
  task_type       TEXT,       -- task enum
  from_state      TEXT,       -- 상태 전이 시작
  to_state        TEXT,       -- 상태 전이 완료
  reason          TEXT,       -- 이벤트 사유 코드
  status          TEXT,       -- metric 상태 snapshot
  duration_ms     INTEGER,    -- ms
  backlog         INTEGER,    -- backlog snapshot
  error_class     TEXT,       -- 에러 분류
  payload         TEXT,       -- JSON
  created_at      DATETIME
)
```

## 실행 채널 매핑

| type | 설명 | 실행 채널 | Workflow |
|---|---|---|---|
| `classify` | 사용자 입력 분류 | Eq1 (LLM client) | `W4 -> W1` |
| `omo_request` | 메인 코딩 프롬프트 | X_oc (opencode wrapper) | `W2` |
| `evaluate` | permission/question 중요도 판단 | Eq1 (LLM client) | `W4` |
| `summarize` | 판단 맥락 구조화 | Eq1 (LLM client) | `W4` |
| `route` | 후속 action(`new_task/report/skip`) | Eq1 (LLM client) | `W4` |
| `report` | 사용자 전달 | X1 (protocol) | `W6` |

## JSON 결과 스키마 계약

### `eq1_result.v1` (stored in `tasks.result`)

최소 필드:

- `schema_version` (`eq1_result.v1`)
- `request_hash`
- `type`
- `provider`
- `model`
- `attempts`
- `usage`
- `latencyMs`
- `output`

### `x3_interaction_result.v1` (stored in `interactions.answer`)

최소 필드:

- `schema_version` (`x3_interaction_result.v1`)
- `kind` (`permission` | `question`)
- `requestId`
- `decision` (`auto` | `escalate` | `reject`)
- `reason`
- `reply` (nullable)

### `x4_summary.v1` (stored in `route` request summary)

- `schema_version` (`x4_summary.v1`)
- `interaction.id`
- `interaction.type`
- `request_id`
- `session_id`
- `evaluation.score`
- `evaluation.reason`
- `evaluation.route`
- `evaluation.reply`
- `payload`
- `request_hash`
- `parent_id`

### `x4_route_request.v1` (route input envelope)

- `schema_version` (`x4_route_request.v1`)
- `request_hash`
- `parent_id`
- `summary` (contains `x4_summary.v1`)

### `x4_route_response.v1` (route output contract)

- `schema_version` (`x4_route_response.v1`)
- `request_hash`
- `parent_id`
- `action` (`report` | `new_task` | `skip`)
- `reason`
- `prompt` (nullable)

### `readiness_check` (`metrics_events.event_type = readiness_check`)

- `trace_id`: `x2_worker_readiness_<epoch_ms>`
- `source`: `x2_worker`
- `status`: `healthy` | `unhealthy`
- `reason`:
  - `readiness_check_started`
  - `opencode_health_retry`
  - `opencode_health_succeeded`
  - `opencode_health_failed`
- `payload.phase`: `check_started` | `retry` | `check_succeeded` | `check_failed`
- `payload.attempt`, `payload.maxAttempts`, `payload.nextDelayMs`, `payload.error` (옵션)

### `inbound_received` (`metrics_events.event_type = inbound_received`)

- `trace_id`: `event_id`
- `source`: `x1` source label (`x1_telegram` 등)
- `status`: 없음
- `reason`: `accepted`
- `payload.event_id`: 이벤트 id
- `payload.task_id`: 생성된 task id
- `payload.event_text_preview`: 메시지 앞부분 미리보기
- `payload.channel`: ingress 채널 (`telegram`, ...)

### `inbound_invalid` (`metrics_events.event_type = inbound_invalid`)

- `trace_id`: `event_id`
- `source`: `x1` source label
- `status`: 없음
- `reason`: invalid reason 문자열
- `payload.event_id`: 이벤트 id
- `payload.reason`: 검증 실패 사유
- `payload.channel`: ingress 채널

### `inbound_duplicate` (`metrics_events.event_type = inbound_duplicate`)

- `trace_id`: `event_id`
- `source`: `x1` source label
- `status`: 없음
- `reason`: `event exists`
- `payload.event_id`: 이벤트 id
- `payload.reason`: 중복 판정 상세
- `payload.channel`: ingress 채널

### `task_state_transition` (`metrics_events.event_type = task_state_transition`)

- `trace_id`: task.id
- `task_id`: task.id
- `task_type`: `omo_request` | `report` | `classify` | `evaluate` | `summarize` | `route`
- `source`: task.source
- `from_state` → `to_state`: 작업 상태 전이
- `reason`: `claimed_for_dispatch` 등 실제 전이 사유
- `status`: `to_state`

### `task_terminal` (`metrics_events.event_type = task_terminal`)

- `trace_id`: task.id
- `task_id`: task.id
- `status`: `completed` | `failed`
- `duration_ms`: 완료 소요 시간 (ms)
- `error_class`: 에러 분류
- `backlog`: 이벤트 시점 `pending` 건수

### `interaction_poll` (`metrics_events.event_type = interaction_poll`)

- `trace_id`: `x3_detector_<epoch_ms>`
- `source`: `x3_worker`
- `status`: `healthy` | `unhealthy`
- `reason`: `poll_done`
- `payload`: `seen`, `enqueued`, `duplicate`, `invalid`

### `interaction_state_transition` (`metrics_events.event_type = interaction_state_transition`)

- `trace_id`: interaction.id
- `interaction_id`: interaction.id
- `from_state` → `to_state`: `pending`에서 `answered`/`rejected`로의 변화
- `reason`:
  - `interaction_escalated`
  - `interaction_auto_replied`
  - `interaction_auto_reply_failed`
- `status`: `to_state`
- `payload`: 처리 경로(`route`), 점수(`score`), 에러 정보(`error`)

## Notes

- `W5` (`ESCALATE -> RELAY_REPLY`)는 `tasks`가 아니라 `interactions` 경로로 처리한다.
- 채널별 순차 보장은 유지하되, 채널 간 실행은 독립 가능하다.
- 상태전이 상세(`Q`, `Δ`)는 HOMSA 문서와 본 문서를 함께 기준으로 해석한다.
