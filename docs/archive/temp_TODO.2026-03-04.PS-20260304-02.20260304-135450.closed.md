# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: PS-20260304-02 close (`P2` X1/X2 백로그 전량 다음 cycle로 보류)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-02` 이관(미완료 `x1`/`x2` 백로그)
PhaseStamp: PS-20260304-02

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-02`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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
  - TaskRef: `TK-...`
  - PhaseRef: `PH-...`
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
- [ ] [P1][X2] OMO 우회 채널로 `agent: "spark"` + `model: "openai/GPT-5.3-Codex-Spark"` 실행 경로 검증 `PhaseRef: PH-P2-X2-001`

## Todo

- [ ] [P2][X1] Telegram user input → task enqueue 경로 어댑터 구현 범위 재검토 `PhaseRef: PH-P2-X1-001` `TaskRef: TK-P2-X1-001`
  - 범위: `src/x1/server.ts`, `src/x1/telegram.ts`, `dev_code/script/x1-receive.ts`, `dev_code/script/x1-webhook.ts`, `dev_code/test/x1.webhook.test.ts`, `dev_code/test/x1.telegram.test.ts`
  - 목표: Telegram 입력을 W₁(RECEIVE) 경로로 안정적으로 수신해 parse → 중복차단 → ENQUEUE까지 동일 계약으로 동작시키고 webhook/수동 경로 회귀를 차단한다.
  - 구현 포인트:
    - `telegram` 파싱, 중복 필터, 유입 로그를 하나의 처리 규격으로 정리한다.
    - `x1-receive`(payload 파일)와 `x1-webhook`(HTTP)을 성공/실패/중복 응답 형식으로 정렬한다.
    - webhook 시크릿, path 정규화, payload 유효성 검사 정책을 README/테스트와 정합한다.
  - 검증 방법: `bun test ./dev_code/test/x1.telegram.test.ts ./dev_code/test/x1.webhook.test.ts`
  - 완료 조건:
    - 테스트가 `health`, `valid`, `invalid`, `duplicate`, `unauthorized`, `secret fallback`를 모두 검증한다.
    - W₁ 경로에서 중복 입력은 ENQUEUE가 한 번만 생성된다.
    - 실패 입력은 명시적 오류 메시지와 함께 정상 종료한다.
  - 위험/예외: webhook 바인딩 미가동 시 실서버 연동은 `x1:receive` 회귀 검증으로 보완한다.
  - 업데이트: 2026-03-04T00:00:00+09:00 - Todo를 착수 준비용으로 재작성

- [ ] [P1][X2] OMO 우회 채널로 `agent: "spark"` + `model: "openai/GPT-5.3-Codex-Spark"` 실행 경로 검증 `PhaseRef: PH-P2-X2-001` `TaskRef: TK-P2-X2-001`
  - 범위: `src/x2/worker.ts`, `src/x2/queue.ts`, `src/eq1/llm-client.ts`, `.env.example`, `dev_code/test/`
  - 목표: OMO 우회 task 실행에서 `agent/model` 옵션이 wrapper 요청으로 정확 전달되고 실패 모드가 정의되는지 선검증한다.
  - 구현 포인트:
    - task create/push에서 `agent`, `model` 정규화 및 전달 경로 추적 포인트를 보강한다.
    - `openai/GPT-5.3-Codex-Spark` 지정 시 fallback 정책을 실패 분류별로 고정한다.
    - provider/네트워크 오류를 재현하는 테스트 더블을 통해 `FAIL` 전이를 검증한다.
  - 검증 방법: `bun test ./dev_code/test/x2.worker.test.ts ./dev_code/test/x2.queue.test.ts` (필요 시 신규 테스트 추가)
  - 완료 조건:
    - 위임 payload에 `agent: "spark"` + `model: "openai/GPT-5.3-Codex-Spark"`가 전달됨.
    - 지원되지 않는 모델/권한 이슈는 경고 로그와 재시도/실패 정책이 계획대로 동작.
    - W₂ 관측 포인트(`task_state_transition`, `task_terminal`) 핵심 키셋이 유지됨.
  - 위험/예외: 모델/키 권한 이슈로 인한 외부 호출 flake.
  - 업데이트: 2026-03-04T00:00:00+09:00 - Todo를 착수 준비용으로 재작성

## In Progress

없음

## Done

없음

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `temp_TODO.md` 신규 생성 (`PS-20260304-02` 시작)
- 2026-03-04: `Todo` 구간 재작성 (`PS-20260304-02`, x1/X2 착수 체크리스트 정렬)
- 2026-03-04: `temp_TODO.md` close 처리 (`PS-20260304-02` phase 종료): 2개 Present 항목 미완료 상태로 다음 cycle 대상 유지
