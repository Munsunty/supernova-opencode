# Phase Status Board

*Last Updated: 2026-02-26*

## 목적

- Phase별 진행 상태를 단일 보드에서 관리한다.
- 완료 조건(Definition of Done)과 현재 차단 요인을 분리해 기록한다.
- 실행 항목(TODO)은 `docs/TODO.md`와 연결해 운영한다.

## 운영 규칙

1. 상태는 `planned | in_progress | blocked | done` 중 하나만 사용한다.
2. 상태 변경 시 같은 커밋에서 `docs/TODO.md`도 함께 갱신한다.
3. `done` 전환은 해당 Phase의 완료 조건을 모두 충족했을 때만 허용한다.
4. 각 Phase는 최소 1개의 관측 가능한 신호(status/log/write)를 남겨야 한다.
5. So 단계 전이는 idempotent 원칙(동일 입력 재실행 안정성)을 유지한다.
6. 개발 중 검증은 관련 개별 테스트를 우선 수행하고, Phase 종료 직전에만 전체 `bun test`를 실행한다.

## 현재 Phase 보드

| Phase | 대상 | 상태 | 목표 | 완료 조건 |
|-------|------|------|------|-----------|
| 1 | Dₚ 격리 + X_oc | done | 격리 환경 + wrapper 안정화 | 격리된 opencode serve 가동 + SDK wrapper |
| 2 | X₂ | done | task queue 실행 루프 완성 | task 입력 시 X_oc 실행 후 결과 저장 |
| 3 | Eq₁ | done | LLM client 구현 | W₄ 경로 호출 + 실패 경로 검증 + 결과 스키마 기록 |
| 4 | X₃ + X₄ | in_progress | interaction + routing 통합 | 전체 주기 1회 완주 |
| 5 | X₁ | planned | 통신 프로토콜 연결 | user → 주기 → report 전체 동작 |

## Phase 상세

### Phase 2 (완료)

- 범위: `POLL_TASK/EXECUTE/COMPLETE/FAIL` 루프 + `ENQUEUE` 입력 인터페이스
- 구현 완료:
  - `store/queue/router/summarizer` 통합 루프 (`.devserver/x2/worker.ts`)
  - 상태 전이 정합화 (`pending → running → completed|failed`)
  - 중복 실행 방지(idempotent 가드 + pending atomic claim)
  - 관측 로그 추가(`status`, `duration_ms`, `backlog`)
  - 실패/재시도 최소 정책 + stale running 복구 처리
  - 성공 1cycle 스모크 검증 완료 (`completed` + `result` 저장)
  - 재시도 정책 확정 (`maxRetries=1`, `retry backoff=3s -> 60s cap`, `running timeout=120s`)
  - Phase 종료 직전 전체 `bun test` 통과
- 상태: Phase 2 종료, Phase 3(Eq₁) 착수 가능

### Phase 3

- 범위: Eq₁ LLM client + task type(`classify/evaluate/summarize/route`) 실행 채널 분리
- 준비 완료:
  - Eq₁ task type 상수/검증 유틸 추가 (`.devserver/eq1/task-types.ts`)
  - Eq₁ provider 인터페이스 + client 스캐폴드 추가 (`.devserver/eq1/llm-client.ts`)
  - 공용 유틸 연동 (`.devserver/utils/retry.ts`, `.devserver/utils/logging.ts`)
  - Phase 3 준비 테스트 추가/통과 (`test/eq1.llm-client.test.ts`)
- 구현 완료:
  - provider adapter 연결 (cerebras 1순위, groq 2순위, openai-compatible 공통)
  - X₂ task schema 확장(`tasks.type`) 및 Eq₁ task 실행 경로 연결
  - Eq₁ 실행 결과를 `tasks.result` JSON으로 저장 (`schema_version=eq1_result.v1`, `request_hash`)
  - Eq₁ 재시도 책임 분리: provider-level retry 사용, task-level retry 중첩 차단
  - logging redaction 적용(키/토큰/프롬프트 계열 필드 마스킹)
  - worker enqueue 시 task type 지정 가능(`--type`)
- 검증 완료:
  - live key 기준 `eq1:smoke` 성공 (`2026-02-26`, provider=`cerebras`, attempts=1)
  - 실패 경로 검증 통과: timeout, 429, 5xx, invalid JSON
  - retry fail-fast 검증 통과: 4xx는 재시도하지 않음
  - Phase 종료 직전 전체 `bun test` 통과
- 종료 기준:
  - W₄ 경로에서 LLM 호출 성공 + 결과 저장
  - 실패 경로 4종(timeout/429/5xx/invalid JSON) 테스트 통과
  - Eq₁ retry 중첩 방지(provider/task 책임 분리) 적용
  - `tasks.result` 스키마 버전/요청 해시 필드 기록
  - 로그 redaction 정책 적용

### Phase 4

- 범위: X₃(detector/evaluator/responder), X₄(summarizer/router) 병렬 구현
- 진행 현황:
  - X₃ detector loop 1차 구현 완료 (`.devserver/x3/detector.ts`, `.devserver/x3/worker.ts`)
  - interaction queue 저장 경로 추가 (`.devserver/x2/store.ts`, `interactions` 테이블)
  - X₃ evaluator/responder 구현 완료 (`.devserver/x3/evaluator.ts`, `.devserver/x3/responder.ts`, `.devserver/x3/processor.ts`)
  - detector/processor 검증 테스트 추가/통과 (`test/x3.detector.test.ts`, `test/x3.processor.test.ts`)
- 종료 기준: permission/question 분기 + 후속 route(report/new task) 동작

### Phase 5

- 범위: X₁ 통신 프로토콜(현재 Telegram) 연결
- 종료 기준: user input부터 report 전달까지 end-to-end 완주

## 업데이트 절차

1. `docs/TODO.md`에서 항목 상태 변경
2. 본 문서의 해당 Phase 상태/차단요인 갱신
3. 필요 시 `AGENTS.md` 작업 우선순위 요약 갱신
