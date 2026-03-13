# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-06` close (`PH-P1-X2-003`, `PH-P1-X2-004` 완료, X2/X4 summarizer prompt seed 반영 경로 정합화 포함)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-06` close (`PH-P1-X2-003`, `PH-P1-X2-004` 완료, X2/X4 summarizer prompt seed 반영 경로 정합화 포함)
PhaseStamp: PS-20260304-06

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-06`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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

- `PH-P1-X2-003` [완료] Telegram 결과 송신 `monitor(raw)` + `summary(meta)` 2단 전송, summary에 실행/요약 `agent`/`model` 포함
- `PH-P1-X2-004` [완료] `X2` OMO agent auto-routing 적용: `eq1` 분류 우선 + fallback(단순=`spark`, 복잡/리스크=`sisyphus`)

## Todo

- 없음

## In Progress

없음

## Done

- `TK-PS06-X2-001` (`PhaseRef: PH-P1-X2-003`) `x2` task 결과를 Telegram으로 `raw` 메시지(항상) + `summary/meta` 메시지(조건부) 분리 전송하도록 reporter/queue/store 경로 확장. `raw_result`, 실행/요약 `agent/model` 메타를 task에 저장하고 summary 메시지에 메타 노출
- `TK-PS06-X2-002` (`PhaseRef: PH-P1-X2-004`) `x2/queue`에 `eq1` 분류 기반 agent 자동 라우팅(`simple`→`spark`, `complex/risk`→`sisyphus`)을 우선 적용하고 실패/비정상 응답 시 fallback 규칙(휴리스틱)으로 보완, `x2/worker`에 routing/simple/complex CLI·env 옵션 추가, `dev-up.sh`/`.env.example`에 런타임 전달 경로 반영, 라우팅 단위 테스트 추가
- `TK-PS06-X2-003` (`PhaseRef: PH-P1-X2-004`) `opencode-agent`의 `buildX2SummarizePrompt`/`buildX4SummarizePrompt`가 `.devserver/agents` seed 프롬프트를 실제로 반영하도록 파일 로드 경로(`/run/opencode-seed/agents` 우선, fallback 경로 포함) 추가, X2/X4 호출부를 `opencodeAgent.X2_*`/`X4_*`/`message_meta` 네이밍으로 일치시켜 런타임/테스트 참조 정합성 복구

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `PS-20260304-06` 시작, `temp_TODO.md` 신규 오픈 생성
- 2026-03-04: 이전 phase(`PS-20260304-05`) close/archive 완료 (`archive/temp_TODO.2026-03-04.PS-20260304-05.20260304-161344.closed.md`)
- 2026-03-04: `PH-P1-X2-003` 수행 — `x2/store`에 `raw_result`, `run_agent/model`, `summary_agent/model` 컬럼 추가, `x2/queue` finalize에서 원문/요약 메타 분리 저장, `x2/router` Telegram 송신을 `monitor/raw` + `summary/meta` 2단 전송으로 변경. 검증: `bun test ./.devserver/dev_code/test/x2.store.test.ts ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x2.router.test.ts ./.devserver/dev_code/test/x3.processor.test.ts ./.devserver/dev_code/test/x3.policy.test.ts ./.devserver/dev_code/test/x4.router.test.ts` PASS (36 pass)
- 2026-03-04: `PH-P1-X2-004` 수행 — `x2/queue`를 `eq1` 분류 우선 라우팅으로 전환(비정상 응답 시 fallback), `x2/worker` routing/simple/complex 설정 연결, `dev-up.sh`/`.env.example`에 `X2_OMO_*` 전달 키 추가. 검증: `bun test ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x2.router.test.ts ./.devserver/dev_code/test/x2.store.test.ts` PASS
- 2026-03-04: `PH-P1-X2-004` 후속 보정 — `opencode-agent`에서 X2/X4 summarizer 프롬프트를 하드코딩 대신 seed 파일(`x2-summarizer.prompt.txt`, `x4-summarizer.prompt.txt`) 기반으로 로드하도록 수정, `x2/queue`·`x2/worker`·`x4/router`·`x2.queue.test`의 `opencodeAgent` 호출명을 `X2_dispatcher`/`X2_summarize`/`X4_summarize`/`message_meta`로 정합화. 검증: `bun test ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x4.router.test.ts` PASS (23 pass)
