# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-07` close (`PH-P1-EQ1-001`, `PH-P1-EQ1-002` 완료, `PH-P1-GENESIS-001` 다음 phase 이관)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-07` close (`PH-P1-EQ1-001`, `PH-P1-EQ1-002` 완료, `PH-P1-GENESIS-001` 다음 phase 이관)
PhaseStamp: PS-20260304-07

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-07`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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

- `PH-P1-EQ1-001` [완료] `eq1-core` 전용 agent 데이터 정의(프롬프트 분리, spark 동일 모델, tools off) 및 seed/runtime 설정 경로(`opencode.json`, `dev-up.sh`, `.env.example`) 반영
- `PH-P1-EQ1-002` [완료] `eq1` 호출 경로를 internal `eq1-core` 우선 + external provider fallback 체인으로 전환하고 X2/X3/X4 공통 사용 경로/테스트를 정합화 (코드/단위테스트 완료, runtime smoke는 사용자 요청으로 생략)

## Todo

- 없음

## In Progress

없음

## Done

- `TK-PS07-EQ1-000` (`PhaseRef: PH-P1-EQ1-001`) `eq1-core` 전용 프롬프트 파일 추가, `opencode.json` agent 등록(모델 `openai/gpt-5.3-codex-spark`, tools off), `dev-up.sh` seed mount 및 `.env.example` 경로 변수(`X_OC_PODMAN_EQ1_CORE_PROMPT_SOURCE_HOST`) 반영, 구조 문서(`project-structure.md`) 동기화
- `TK-PS07-EQ1-001` (`PhaseRef: PH-P1-EQ1-002`) Eq1 provider factory에 internal primary + external fallback 체인(`opencode_internal_fallback`)을 추가하고 env 스키마(`EQ1_INTERNAL_*`, `EQ1_FALLBACK_PROVIDER`)를 확장, `opencode_internal` provider 구현/등록, `createEq1ClientFromEnv` primary+fallback 주입 구조 반영
- `TK-PS07-EQ1-002` (`PhaseRef: PH-P1-EQ1-002`) Eq1Client에서 primary provider 실패/비정상 JSON 응답 시 fallback provider를 자동 활성화하는 실행 경계를 구현(`eq1_fallback_activated` 로그 포함)
- `TK-PS07-EQ1-003` (`PhaseRef: PH-P1-EQ1-002`) Eq1 단위 테스트(팩토리/클라이언트)에 internal+fallback 경로를 추가하고 회귀 검증 PASS (`eq1.provider.factory`, `eq1.llm-client`, `eq1.openai-provider`, `x2.queue`, `x3.processor`, `x4.router`)
- `TK-PS07-EQ1-004` (`PhaseRef: PH-P1-EQ1-002`) runtime smoke 항목은 사용자 요청으로 생략 처리하고, 코드/단위테스트 완료 상태를 phase 완료 근거로 확정

## Backlog

- `[제안][GENESIS]` `PH-P1-GENESIS-001` 후보 — Genesis bootstrap 생성 smoke(`docs/AGENTS.md`, `docs/phase_TODO.md`)를 다음 phase 선별 대상으로 유지

## 제외 범위

- 없음

## Run Log

- 2026-03-04: `PH-P1-EQ1-001/002` 완료 이후 다음 phase 후보로 Genesis bootstrap(`PH-P1-GENESIS-001`)를 제안하고 `phase_TODO.md` Next에 반영
- 2026-03-04: 템플릿 소스 경로 전환 — docs template source-of-truth를 `.devserver/docs/templates`에서 `.devserver/run-sync/templates`로 변경하고 `dev-up.sh` 기본값/`dockerfile` fallback copy/`genesis.prompt.txt` 안내 문구를 동기화
- 2026-03-04: genesis bootstrap 보강 — `dev-up.sh`에 templates seed mount(`X_OC_PODMAN_DOC_TEMPLATES_SOURCE_HOST`)와 import mode 전달(`X_OC_PODMAN_DOC_TEMPLATES_IMPORT_MODE`)을 추가하고, `entrypoint.sh`에서 `docs/templates`로 동기화(`always|if-missing|off`)하도록 확장, `dockerfile`에 templates fallback copy(`/opt/opencode/templates`) 반영
- 2026-03-04: `genesis` bootstrap 경로 정합화 — `genesis.prompt.txt`의 문서 생성 지시 경로를 `.devserver/docs/*`에서 `docs/*`로 변경하고 템플릿을 `docs/templates/`에 복제(런타임 writable workspace 경로 기준)
- 2026-03-04: bootstrap 보정 — `genesis` agent prompt seed를 `dev-up.sh` 런타임 mount 경로(`/run/opencode-seed/agents/genesis.prompt.txt`)에 연결하고 `.env.example`/`project-structure.md`를 동기화
- 2026-03-04: 사용자 요청으로 runtime smoke 검증 생략(`TK-PS07-EQ1-004` In Progress → Done), `PH-P1-EQ1-002`를 코드/테스트 완료 기준으로 완료 처리
- 2026-03-04: `TK-PS07-EQ1-001`/`002`/`003` 구현 완료 — `opencode_internal` provider + `opencode_internal_fallback` chain + Eq1Client fallback 실행 경계 반영, 검증: `bun test ./.devserver/dev_code/test/eq1.provider.factory.test.ts ./.devserver/dev_code/test/eq1.llm-client.test.ts ./.devserver/dev_code/test/eq1.openai-provider.test.ts` PASS (19 pass), `bun test ./.devserver/dev_code/test/x2.queue.test.ts ./.devserver/dev_code/test/x3.processor.test.ts ./.devserver/dev_code/test/x4.router.test.ts` PASS (28 pass)
- 2026-03-04: `TK-PS07-EQ1-004` Todo 생성과 동시에 In Progress shift-up (runtime smoke/운영 로그 검증 착수)
- 2026-03-04: `TK-PS07-EQ1-001` Todo → In Progress shift-up (factory/환경변수/primary+fallback 체인 구현 착수)
- 2026-03-04: `PS-20260304-07` Present를 `PH-P1-EQ1-001`, `PH-P1-EQ1-002`로 갱신하고 `temp_TODO.md` Present/Todo/Done 동기화
- 2026-03-04: 이전 phase(`PS-20260304-06`) close/archive 완료 (`archive/temp_TODO.2026-03-04.PS-20260304-06.20260304-173706.closed.md`)
- 2026-03-04: `PS-20260304-07` 시작, `temp_TODO.md` 신규 오픈 생성
