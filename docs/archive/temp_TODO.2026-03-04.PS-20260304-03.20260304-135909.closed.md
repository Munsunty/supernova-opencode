# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: PS-20260304-03 close (`P1` X2 완료, `P2` X1은 다음 cycle 보류)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-03` 이관(`PH-P2-X2-001` 완료, `PH-P2-X1-001` 다음 cycle 보류)
PhaseStamp: PS-20260304-03

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-03`의 `Next`에서 선별된 `PhaseRef` 수행 항목
- 제외: 다음 phase로 이월되는 항목
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
  - TaskRef: [예: `TK-...`]
  - PhaseRef: [예: `PH-...`]
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

- [ ] [P2][X1] Telegram user input → task enqueue 경로 어댑터 구현 범위 재검토 `PhaseRef: PH-P2-X1-001`
- [x] [P1][X2] OMO 우회 채널로 `agent: "spark"` + `model: "openai/GPT-5.3-Codex-Spark"` 실행 경로 검증 `PhaseRef: PH-P2-X2-001`

## Todo

- [ ] [P2][X1] Telegram user input → task enqueue 경로 어댑터 재검토 `PhaseRef: PH-P2-X1-001` `TaskRef: TK-P2-X1-001`

## In Progress

없음

## Done

- [x] [P1][X2] OMO 우회 채널로 `agent: "spark"` + `model: "openai/GPT-5.3-Codex-Spark"` 실행 경로 검증 `PhaseRef: PH-P2-X2-001` `TaskRef: TK-P2-X2-001`
  - 범위: `src/x2/worker.ts`, `src/x2/queue.ts`, `src/x2/store.ts`, `dev_code/test/x2.queue.test.ts`
  - 목표: OMO 우회 채널에서 `omo_request` 작업이 OpenCode 프롬프트를 보낼 때 `agent`/`model`이 옵션으로 전달되고 dispatch/finalize 추적이 남도록 검증한다.
  - 구현 포인트:
    - `Queue` 생성 옵션에 `bypassAgent`, `bypassModel` 전달을 추가한다.
    - `omo_request` dispatch에서만 `promptAsync` 호출 시 `agent`/`model`를 포함한다.
    - `task_state_transition` 로그에 우회 메타(`bypassAgent`, `bypassModel`)를 남긴다.
  - 검증 방법: `bun test ./.devserver/dev_code/test/x2.queue.test.ts`
  - 완료 조건:
    - `agent: "spark"`, `model: "openai/GPT-5.3-Codex-Spark"`가 prompt dispatch에 전달됨을 단위 테스트로 확인
    - `task_state_transition` 로그 payload에 우회 메타가 기록됨
  - 위험/예외: 외부 LLM 모델 권한/네트워크 이슈는 재시도 정책으로 처리
  - 업데이트: 2026-03-04T13:59:09+09:00 - X2 우회 전달 검증 테스트 추가 및 통과

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `temp_TODO.md` 신규 생성 (`PS-20260304-03` 시작)
- 2026-03-04: `PH-P2-X2-001` `bun test ./.devserver/dev_code/test/x2.queue.test.ts` 실행 (8 pass, 0 fail) — `agent: "spark"`, `model: "openai/GPT-5.3-Codex-Spark"` 전달 검증
- 2026-03-04: `PS-20260304-03` close 처리
