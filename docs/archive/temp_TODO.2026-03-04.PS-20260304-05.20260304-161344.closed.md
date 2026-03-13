# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-05` close (`PH-P1-X1-002`, `PH-P1-X2-002`, `PH-P1-DOCS-002` 완료)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-05` close (`PH-P1-X1-002`, `PH-P1-X2-002`, `PH-P1-DOCS-002` 완료)
PhaseStamp: PS-20260304-05

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-05`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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

- `PH-P1-X1-002` [완료] Telegram ingress 입력 최소화(사용자 본문만 prompt) + task source `#chat:<chatId>` 스코프 적용
- `PH-P1-X2-002` [완료] SSE `event.subscribe` + messageID 바인딩/`getMessage` 우선 finalize + Telegram report 송신 + Telegram source 세션 재사용
- `PH-P1-DOCS-002` [완료] `x2-summarizer`/`x4-summarizer` prompt seed + runtime agent 연결(`x2`/`x4`) + `dev-up.sh`/문서 동기화

## Todo

- 없음

## In Progress

없음

## Done

- `TK-PS05-X1-001` (`PhaseRef: PH-P1-X1-002`) Telegram ingress prompt 최소화 및 `#chat:<chatId>` source 스코프 반영, x1 ingress 테스트 PASS
- `TK-PS05-X2-001` (`PhaseRef: PH-P1-X2-002`) SSE 수집+polling 병행 finalize 경로 고도화, Telegram 결과 송신/세션 재사용 반영, x2/x1 테스트 PASS
- `TK-PS05-DOCS-001` (`PhaseRef: PH-P1-DOCS-002`) summarizer prompt seed 파일 2종 생성, `dev-up.sh` seed mount 확장, runtime/docs 동기화 및 스크립트 검증 PASS
- `TK-PS05-DOCS-002` (`PhaseRef: PH-P1-DOCS-002`) `x2` queue 동기 요약(`x2-summarizer`) + `x4` router 요약 enrichment(`x4-summarizer`) 실행 경로 연결, worker/env 옵션(`X2_SUMMARIZER_AGENT`, `X4_SUMMARIZER_AGENT`) 및 단위 테스트(`x2.queue`, `x4.router`) 검증 PASS

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `temp_TODO.md` 신규 생성 (`PS-20260304-05` 시작)
- 2026-03-04: `x1` Telegram ingress prompt를 메타 태그 포함 문자열에서 사용자 본문만 전달하도록 변경, `bun test ./.devserver/dev_code/test/x1.telegram.test.ts ./.devserver/dev_code/test/x1.webhook.test.ts` PASS (13 pass)
- 2026-03-04: `x2` finalize 응답 조회를 session 전체에서 최근 window(`limit`) 기반 조회로 변경하고 task 시작 시각 이후 assistant를 우선 매칭하도록 보정, `bun test ./.devserver/dev_code/test/x2.queue.test.ts` PASS (9 pass)
- 2026-03-04: polling 유지 상태에서 `event.subscribe` SSE 루프를 `x2/worker`에 추가하고 `message.updated` 기반 task messageID(`request/assistant`) 바인딩 + `getMessage` 우선 finalize 경로를 연결, `bun test ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x2.store.test.ts` PASS (14 pass)
- 2026-03-04: Telegram 결과 미송신/세션 분리 이슈 대응으로 `x2` TelegramReporter(sendMessage) 추가, `x1` task source를 `#chat:<chatId>` 스코프로 변경, `x2` dispatch에서 Telegram source 기준 최신 `sessionId` 재사용 로직 추가. `bun test ./.devserver/dev_code/test/x1.telegram.test.ts ./.devserver/dev_code/test/x1.webhook.test.ts ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x2.store.test.ts ./.devserver/dev_code/test/x2.router.test.ts` PASS (31 pass)
- 2026-03-04: `x2-summarizer`/`x4-summarizer` 전용 agent prompt 파일(`.devserver/agents/*.prompt.txt`) 생성, `opencode.json` prompt 경로 연결 및 `dev-up.sh` seed mount(`X_OC_PODMAN_X2_SUMMARIZER_PROMPT_SOURCE_HOST`, `X_OC_PODMAN_X4_SUMMARIZER_PROMPT_SOURCE_HOST`) 추가. 검증: `bash -n ./.devserver/dev-up.sh`, `JSON.parse(.devserver/opencode.json)`, `bun run ./.devserver/src/scripts/generate-opencode-config.ts ...` PASS
- 2026-03-04: `phase_TODO.md` Present를 `PH-P1-X1-002`, `PH-P1-X2-002`, `PH-P1-DOCS-002`로 확정 반영하고 `temp_TODO.md` Present/Done 동기화
- 2026-03-04: `PH-P1-DOCS-002` 범위 확장으로 summarizer agent 런타임 경로를 동기 호출로 연결 (`x2/queue` + `x2/worker` + `x4/router` + `x3/worker`), `dev-up.sh` env 전달(`X2_SUMMARIZER_AGENT`, `X4_SUMMARIZER_AGENT`) 반영. 검증: `bun test ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x4.router.test.ts ./.devserver/dev_code/test/x3.processor.test.ts ./.devserver/dev_code/test/x3.policy.test.ts` PASS (30 pass)
- 2026-03-04: `PS-20260304-05` close 처리 (Present 3건 완료, `temp_TODO` archive 이관 준비)
