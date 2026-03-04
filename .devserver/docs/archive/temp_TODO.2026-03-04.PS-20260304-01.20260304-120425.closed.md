# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: PS-20260304-01 close (P2-X3/X4 완료, X1 후보는 다음 cycle 보류)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: OPEN
PhaseStamp: PS-20260304-01

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-01`의 `Next`에서 선별된 `PhaseRef` 수행 항목
- 제외: 현재 phase에서 비우선순위로 판정된 항목
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
  - TaskRef: `<fill>`
  - PhaseRef: `<fill>`
  - 범위: `<fill>`
  - 목표: `<fill>`
  - 구현 포인트: `<fill>`
  - 검증 방법: `[테스트명] 또는 로그`
  - 완료 조건: `[체크 가능한 DoD]`
  - 위험/예외: `[예상 예외, 대응]`
  - 업데이트: `[timestamp - 변경 이유]`

---

## Present

> `phase_TODO.md` Present 확정 항목 스냅샷

- [ ] [P2][X3] X3 interaction 검증 강화 (`detector`/`evaluator`/`responder` loop, 정책 경로, 자동응답/승격 경계) `PhaseRef: PH-P2-X3-001` `TaskRef: TK-P2-X3-001`
- [ ] [P2][X4] X4 summarize/router 검증 강화 (`schema_version`/`request_hash`/`parent_id`/route 결정 일관성, report/chain 연계) `PhaseRef: PH-P2-X4-001` `TaskRef: TK-P2-X4-001`

## Todo

없음

## In Progress

없음

## Done

- [x] [P2][X3] X3 interaction 검증 강화 (`detector`/`evaluator`/`responder` loop, 정책 경로, 자동응답/승격 경계) `PhaseRef: PH-P2-X3-001` `TaskRef: TK-P2-X3-001`
  - 범위: `src/x3/detector.ts`, `src/x3/evaluator.ts`, `src/x3/policy.ts`, `src/x3/processor.ts`, `src/x3/responder.ts`, `src/x3/worker.ts`, `dev_code/test/x3.detector.test.ts`, `dev_code/test/x3.policy.test.ts`, `dev_code/test/x3.processor.test.ts`
  - 목표: X3 상호작용 처리 전체 경로의 관측 가능성/임계값 일관성/자동-승격 경계를 실환경 기준으로 고정한다.
  - 구현 포인트:
    - detector/evaluator/responder 경로의 중복 처리, 유효성 실패, 상태 전이 이벤트(`pending`/`answered`/`rejected`) 순서를 테스트 기반으로 고정
    - policy 파서/판정(`threshold`, `fallback`, `auto_reply_strategy`)와 responder 분기(`auto` vs `user`)의 연동 실패 케이스 보강
    - `route`/`source` 메타(예: `auto_reply_strategy`, `request_hash`)가 payload로 안정적으로 전달되는지 검증
    - interaction worker 처리 시 실패 항목 후 다음 항목 진행 동작 회귀 포인트 추적
  - 검증 방법: `bun test ./dev_code/test/x3.detector.test.ts ./dev_code/test/x3.policy.test.ts ./dev_code/test/x3.processor.test.ts`
  - 완료 조건:
    - `interaction_processing`/`interaction_state_transition`가 auto/user/실패 경로별로 고정된 이유/상태/백로그 정보를 보장
    - `interaction_poll` 이벤트 payload가 `seen/enqueued/duplicate/invalid`를 테스트로 고정
    - threshold clamp / route/score 경계 케이스가 비정상 입력 포함 재현됨
  - 위험/예외: Eq1 응답 불안정/지연으로 flake risk, async loop에서 외부 의존성 시뮬레이션 불충분 위험
  - 사이드 이펙트: 관측 포인트 고정으로 경고 규칙이 촘촘해져 기존 임계값이 과민 반응할 가능성 존재
  - 업데이트: 2026-03-04 - In Progress 착수, 테스트 기반 검증 항목 반영

- [x] [P2][X4] X4 summarize/router 검증 강화 (`schema_version`/`request_hash`/`parent_id`/route 결정 일관성, report/chain 연계) `PhaseRef: PH-P2-X4-001` `TaskRef: TK-P2-X4-001`
  - 범위: `src/x4/summarizer.ts`, `src/x4/router.ts`, `src/x2/store.ts`, `src/x2/queue.ts`, `dev_code/test/x4.router.test.ts`, `dev_code/test/x2.store.test.ts`
  - 목표: X4 summarize/route 계약 필드의 역추적성(`schema_version`, `request_hash`, `parent_id`)과 route 액션 결정 일관성, 후속 chain/report 경로를 검증한다.
  - 구현 포인트:
    - summarize 출력(`summary`, `request_hash`, `parent_id`)와 route request payload 간 결합 테스트 추가
    - route 결정 결과(`new_task`/`report`/`skip`)와 `action` 정규화·폴백 로직이 score 입력과 일치하는지 보강
    - report/new_task task payload가 `parent_id`/`request_hash`를 보전해 생성되는지 검증
    - route call 실패 시 `skip`/`report` 폴백 경로와 경고 로그 동작을 고정
  - 검증 방법: `bun test ./dev_code/test/x4.router.test.ts ./dev_code/test/x3.processor.test.ts ./dev_code/test/x2.store.test.ts`
  - 완료 조건:
    - request/response 계약 스키마(`x4_summary.v1`, `x4_route_request.v1`, `x4_route_response.v1`) 위반이 테스트에서 즉시 감지됨
    - route fallback와 task 생성 시 `task.type`(`omo_request`, `report`) 및 `prompt`/`parent_id` 연계 보장이 고정됨
    - summarize→route→task chain에서 `request_hash`/`parent_id` 가시성이 유지됨
  - 위험/예외: 기존 테스트에서 동일 fixture를 공유할 경우 가짜 payload 해시 충돌로 false positive 가능
  - 사이드 이펙트: `x4_route_request_hash_mismatch` 경고 로그 반복 시 알림 임계값 조정 필요
  - 업데이트: 2026-03-04 - In Progress 착수, route 정규화·해시 폴백 테스트 보강 반영

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `temp_TODO.md` 생성 — phase 시작을 위한 빈 상태 캐싱 준비
- 2026-03-04: `phase_TODO.md`에서 `PH-P2-X3-001`, `PH-P2-X4-001`를 Present로 선별 반영. `X3`, `X4`는 `Todo` 분해 준비 상태로 이동, `PH-P2-X1-001`은 Next 보류 유지
- 2026-03-04: `PH-P2-X3-001`, `PH-P2-X4-001` 항목에 대해 `Todo` 분해 생성(범위/검증포인트/완료조건/위험요소 반영)
- 2026-03-04: `PH-P2-X3-001` `bun test ./.devserver/dev_code/test/x3.detector.test.ts ./.devserver/dev_code/test/x3.policy.test.ts ./.devserver/dev_code/test/x3.processor.test.ts` 실행(15 pass, 0 fail) — `interaction_poll`/`transition` 메트릭 시나리오 검증
- 2026-03-04: `PH-P2-X4-001` `bun test ./.devserver/dev_code/test/x4.router.test.ts` 실행(5 pass, 0 fail) — `x4_router` action 정규화·해시/부모ID 폴백 시나리오 검증
- 2026-03-04: `PH-P2-X3-001`, `PH-P2-X4-001` 항목 `Todo → In Progress` 이행(검증 상세 항목 고정 및 실행 착수)
- 2026-03-04: `PH-P2-X3-001` `bun test ./dev_code/test/x3.detector.test.ts ./dev_code/test/x3.policy.test.ts ./dev_code/test/x3.processor.test.ts` 재실행(15 pass, 0 fail) — `interaction_processing`/`state_transition`/정책 경계 시나리오 재확인
- 2026-03-04: `PH-P2-X4-001` `bun test ./dev_code/test/x4.router.test.ts ./dev_code/test/x2.store.test.ts` 재실행(14 pass, 0 fail) — `x4 route` 액션 정규화 및 `x2 task` 연계 경로 재확인
- 2026-03-04: `PH-P2-X3-001`, `PH-P2-X4-001` 항목 `In Progress → Done` 이행(목표/완료조건 충족 확인)
