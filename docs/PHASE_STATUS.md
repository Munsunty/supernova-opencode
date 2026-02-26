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

## 현재 Phase 보드

| Phase | 대상 | 상태 | 목표 | 완료 조건 |
|-------|------|------|------|-----------|
| 1 | Dₚ 격리 + X_oc | done | 격리 환경 + wrapper 안정화 | 격리된 opencode serve 가동 + SDK wrapper |
| 2 | X₂ | in_progress | task queue 실행 루프 완성 | task 입력 시 X_oc 실행 후 결과 저장 |
| 3 | Eq₁ | planned | LLM client 구현 | W₄ 경로 LLM 호출 가능 |
| 4 | X₃ + X₄ | planned | interaction + routing 통합 | 전체 주기 1회 완주 |
| 5 | X₁ | planned | 통신 프로토콜 연결 | user → 주기 → report 전체 동작 |

## Phase 상세

### Phase 2 (현재 진행)

- 범위: `POLL_TASK/EXECUTE/COMPLETE/FAIL` 루프 + `ENQUEUE` 입력 인터페이스
- 필수 조건:
  - task 상태 전이 `pending → running → completed|failed` 정합성 확보
  - 중복 실행 시 idempotent 보장(같은 task 재실행 안정성)
  - 실행 결과 관측 가능(최소 status/log/write)
- 종료 기준: task 1건 입력으로 1cycle 완료 및 결과 저장 확인

### Phase 3

- 범위: Eq₁ LLM client + task type(`classify/evaluate/summarize/route`) 실행 채널 분리
- 종료 기준: W₄ 경로에서 LLM 호출 성공 + 결과 저장

### Phase 4

- 범위: X₃(detector/evaluator/responder), X₄(summarizer/router) 병렬 구현
- 종료 기준: permission/question 분기 + 후속 route(report/new task) 동작

### Phase 5

- 범위: X₁ 통신 프로토콜(현재 Telegram) 연결
- 종료 기준: user input부터 report 전달까지 end-to-end 완주

## 업데이트 절차

1. `docs/TODO.md`에서 항목 상태 변경
2. 본 문서의 해당 Phase 상태/차단요인 갱신
3. 필요 시 `AGENTS.md` 작업 우선순위 요약 갱신
