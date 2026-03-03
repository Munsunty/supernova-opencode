# temp_TODO.md (Archived)

*Last Updated: 2026-03-03*
*Close reason: PS-20260303-01 phase close*

Status: CLOSED
PhaseStamp: PS-20260303-01

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 상태 흐름: **Present(캐싱) → Todo(실행 분해) → In Progress(착수) → Done**
- Backlog: Todo 정리 과정에서 파생된 후순위·변경 후보를 메모한다.

## 운영 규칙

1. **Present**는 `phase_TODO.md` Present 확정 항목의 스냅샷(캐싱)이다. 원본은 `phase_TODO.md`가 관리한다.
2. **Todo**는 Present 항목을 받아 구체적으로 무엇을 해야 하는지 실행 계획을 분해·기록한 것이다.
3. 상태 전이는 **Todo → In Progress → Done** 단방향이다. In Progress 착수 시 세부 템플릿을 작성한다.
4. Todo 정리 중 발견한 후순위·범위 변경 후보는 **Backlog**에 메모하고, 확정은 `phase_TODO.md`에서 결정한다.
5. 상태 변경·판단 변경은 **Run Log**에 1줄 기록한다.

## 작업 세부 템플릿

In Progress 항목은 아래 정보를 기록한다.

- [ ] 작업 설명
  - TaskRef: `TK-P1-X2-001`
  - PhaseRef: `PH-P1-X2-001`
  - 범위: [영역/파일]
  - 목표: [구체적 동작]
  - 구현 포인트: [핵심 변경 1~3개]
  - 검증 방법: [테스트/로그/검증 명령]
  - 완료 조건: [체크 가능한 DoD]
  - 위험/예외: [예상 예외, 대응]
  - 업데이트: [timestamp - 변경 이유]

---

## Present

> `phase_TODO.md` Present 확정 항목 스냅샷

- [x] [P1][X3] permission/question auto-reply 임계값 정책 표준화 (`threshold`, `fallback`, `auto_reply_strategy`) `PhaseRef: PH-P1-X3-001`
- [x] [P1][X4] summarize → route 입출력 스키마 고정 (`schema_version`, `request_hash`, `parent_id`) `PhaseRef: PH-P1-X4-001`
- [x] [P1][X2] queue dispatch/finalize 상태 전이 로그 키 통일 (`trace_id`, `task_id`, `from`, `to`, `reason`) `PhaseRef: PH-P1-X2-001`

## Todo

## In Progress

없음

## Done

- [x] [P1][X3] permission/question auto-reply 임계값 정책 표준화 (`threshold`, `fallback`, `auto_reply_strategy`) `TaskRef: TK-P1-X3-001` `PhaseRef: PH-P1-X3-001`
  - 범위: `src/x3/policy.ts`, `src/x3/responder.ts`, `src/x3/worker.ts`
  - 목표: `permission`/`question` 경로에서 동일 정책 객체(`threshold`, `fallback`, `auto_reply_strategy`)로 자동 응답 판단
  - 완료 조건:
    - 두 경로 모두 정책 정규화/판단 모듈 공통 사용
    - invalid policy 입력은 경고 로그 후 기본값 보정
    - 로깅에 `auto_reply_strategy`가 일치
- [x] [P1][X4] summarize → route 입출력 스키마 고정 (`schema_version`, `request_hash`, `parent_id`) `TaskRef: TK-P1-X4-001` `PhaseRef: PH-P1-X4-001`
  - 범위: `src/x4/summarizer.ts`, `src/x4/router.ts`, `src/eq1/llm-client.ts`
  - 목표: summarize/route 계약에서 `schema_version`, `request_hash`, `parent_id` 고정 필드 보장
  - 완료 조건:
    - summarize 요청 객체에 3개 필드 동시 반영
    - route request/결정 출력에서 계약 필드 추적 가능
- [x] [P1][X2] queue dispatch/finalize 상태 전이 로그 키 통일 (`trace_id`, `task_id`, `from`, `to`, `reason`) `TaskRef: TK-P1-X2-001` `PhaseRef: PH-P1-X2-001`
  - 범위: `src/x2/queue.ts`
  - 목표: 상태 전이 이벤트에서 키 집합을 `trace_id`, `task_id`, `from`, `to`, `reason`로 통일
- [x] [P2][Docs] `eq1/X2/X3/X4` phase 로드맵 정합성 검토 `TaskRef: TK-P2-DOCS-001` `PhaseRef: PH-P2-DOCS-001`
  - 범위: `AGENTS.md`, `HOMSA.md`, `context-contract.md`, `project-structure.md`, `phase_TODO.md`, `temp_TODO.md`
  - 목표: PH-P1 완료 항목 기준으로 문서 책임/상태 용어/Backlog 허용 범위의 불일치 제거
  - 완료 조건:
    - 문서 5개 파일(phase_TODO, temp_TODO, context-contract, AGENTS, project-structure)에서 상태 용어(`Present`, `Todo`, `In Progress`, `Backlog`, `Done`, `Next`, `Previous`)가 일관되게 해석됨
    - P2 후보군(`Backlog`)은 phase_TODO의 승인된 `PhaseRef`(PH-P2-*)만 반영됨
    - Run Log에 문서 정합성 정비 이력 1건 추가
  - 업데이트: 2026-03-03 17:40:39+09:00 - 위 3개 검증 항목 통과 후 완료 처리

- [x] [P2][Metrics] readiness/task/interaction 이벤트 필드 사전 정리 및 모니터링 알람 연동 `TaskRef: TK-P2-METRICS-001` `PhaseRef: PH-P2-METRICS-001`
  - 범위: `src/x2/store.ts`, `src/x2/queue.ts`, `src/x2/worker.ts`, `src/x3/detector.ts`, `src/x3/processor.ts`, `src/x3/responder.ts`, `src/x3/worker.ts`, `src/x3/policy.ts`, `docs/SCHEMA.md`
  - 목표: readiness/task/interaction 이벤트의 핵심 필드(`trace_id`, `task_id`, `interaction_id`, `from`, `to`, `reason`)와 `status`(ready/task/interactions 건강도/상태값)를 일관된 방식으로 정리
  - 구현 포인트:
    - `metrics_events` 이벤트 테이블 스키마 확장 후 파서·삽입 정합성 강화
    - task 상태 전이 및 종료(`task_state_transition`, `task_terminal`), readiness(`readiness_check`), interaction 처리(`interaction_poll`, `interaction_state_transition`) 발행 지점을 정규화
    - x3 auto-reply 정책 파서/결정(`policy.ts`)를 도입해 결정 로그의 `auto_reply_strategy`와 경로 기준을 통일
  - 검증 방법: `bun test ./.devserver/dev_code/test/x2.store.test.ts ./.devserver/dev_code/test/x3.detector.test.ts ./.devserver/dev_code/test/x3.processor.test.ts ./.devserver/dev_code/test/x3.policy.test.ts ./.devserver/dev_code/test/x2.queue.test.ts`
  - 완료 조건:
    - `run` 경로 이벤트에서 `task_id`/`interaction_id`/`request_hash`/`parent_id`/`source` 추적이 동작
    - `status`와 전이(`from`, `to`, `reason`)가 최소 관측 포인트에서 일치
    - 모니터링 관측 문서(`SCHEMA.md`)와 구현 변경이 동기화
  - 위험/예외:
    - `trace_id`는 이벤트 생성 지점별 규칙이 달라서 운영 대시보드에서 집계 규칙을 경로별로 분리해 계산 필요
    - 외부 알람 채널 연동은 이벤트 추출/조건 매칭 스크립트 레벨에서 추가 작업 필요
  - 업데이트: 2026-03-03 17:47:06+09:00 - TODO 상태에서 착수 후 구현 반영 완료

- [x] [P2][X1] Telegram user input → task enqueue 경로 어댑터 구현 범위 재검토 `TaskRef: TK-P2-X1-001` `PhaseRef: PH-P2-X1-001`
  - 완료 조건: 본 phase에서 구현으로 전환하지 않고 close 처리, 다음 cycle에서 후보 재평가만 허용
  - 업데이트: 2026-03-03 17:55:20+09:00 - `Todo`/`Backlog` 분류 전환 없이 close 처리

## Backlog

- [ ] [P2][Ops] temp_TODO 상태 전이 규칙 drift 점검 `PhaseRef: PH-P2-DOCS-001` `TaskRef: TK-P2-DOCS-002`

## 제외 범위

- [x] [Scope][X5] 이번 라운드에서 X5 관련 구현/확장은 진행하지 않음

## Run Log

- 2026-03-03: `temp_TODO.md` 전면 재설계 — Present(캐싱)→Todo(실행 분해)→In Progress(착수)→Done 모델로 전환, 운영 규칙 5개로 축소, 불필요한 데이터 정책/Next→Present 절차 제거
- 2026-03-03: Present 3건을 Todo로 실행 분해(TK-P1-X3-001, TK-P1-X4-001, TK-P1-X2-001)하고 Backlog 후보 3건을 임시 등록
- 2026-03-03: TK-P1-X3-001 상태를 `Todo`에서 `In Progress`로 변경, 착수 템플릿 상세화
- 2026-03-03: TK-P1-X4-001 상태를 `Todo`에서 `In Progress`로 변경, 착수 템플릿 상세화
- 2026-03-03: TK-P1-X2-001 상태를 `Todo`에서 `In Progress`로 변경, 착수 템플릿 상세화
- 2026-03-03: PH-P1-X2-001 구현 완료 — `x2/queue.ts` 상태 전이 로그 payload를 `trace_id`, `task_id`, `from`, `to`, `reason` 고정 키셋으로 통일
- 2026-03-03: PH-P1-X3-001 구현 완료 — `x3/policy.ts` 정책 파서/판단 로직 표준화, `x3/responder.ts` 및 `x3/worker.ts`에 정책 적용
- 2026-03-03: PH-P1-X4-001 구현 완료 — `x4/summarizer.ts`와 `x4/router.ts`에서 `schema_version`, `request_hash`, `parent_id` 계약 필드 고정
- 2026-03-03: `TK-P2-DOCS-001` 상태를 `Todo`에서 `In Progress`로 전환해 다음 phase 문서 정합성 정비 작업 착수
- 2026-03-03 17:47:06+09:00: `TK-P2-METRICS-001` 상태를 `Todo`에서 `In Progress`로 전환해 이벤트 표준 정리 착수
- 2026-03-03 17:40:39+09:00: `TK-P2-DOCS-001` 완료 — `phase_TODO.md`, `temp_TODO.md`, `context-contract.md`, `AGENTS.md`, `project-structure.md` 간 상태/우선순위/Backlog 경계가 충돌 없이 정합성 확인됨
- 2026-03-03 17:47:06+09:00: `PH-P2-METRICS-001` 구현 완료 — readiness/task/interaction 이벤트 스키마와 감시 포인트를 정비하고, SCHEMA 문서 계약을 갱신해 모니터링 기반 정합성 확보
- 2026-03-03 17:50:12+09:00: `TK-P2-X1-001` 상태를 `Todo`에서 `Backlog`로 하향 조정해 후순위로 보류
- 2026-03-03 17:55:20+09:00: `PH-P2-X1-001` close 처리 완료 — 이번 phase 후보 이관 전 close 상태로 종료하고 다음 cycle 재평가 대상으로 보류
- 2026-03-03 17:58:00+09:00: phase close 완료 — P1 3건 완료, P2 Docs/Metrics 완료, `PH-P2-X1-001` 후순위 보류 확정 후 현재 phase 종료
