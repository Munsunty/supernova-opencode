# temp_TODO.md

*Last Updated: 2026-03-05*

Template-Version: v2

Status: CLOSED
PhaseStamp: PS-20260304-10

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-10`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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

- `PH-P1-BINDING-002` [완료] `aaron` prompt seed `dev-up.sh` 전체 바인딩
- `PH-P1-AGENT-001` [완료] `caleb` explore subagent 추가
- `PH-P1-JOSHUA-001` [완료] `joshua.prompt.txt` 개선: Aaron QA gate + Caleb dispatch rule
- `PH-P1-JOSHUA-002` [완료] eq1-core 기반 Joshua escalation X3 pattern 적용

## Todo

## In Progress

없음

## Done

### BINDING-002

- [x] [done] [P1][Binding] `dev-up.sh`에 `AARON_PROMPT_SOURCE_HOST` 변수 추가 `PhaseRef: PH-P1-BINDING-002` `TaskRef: TK-P1-BINDING-002-1`
- [x] [done] [P1][Binding] `dev-up.sh`에 aaron mount block 추가 (EXCLUDE_DEVSERVER 분기 포함) `PhaseRef: PH-P1-BINDING-002` `TaskRef: TK-P1-BINDING-002-2`
- [x] [done] [P1][Binding] `dev-up.sh`에 aaron warn_env block 추가 + SEED SOURCES echo 라인 갱신 `PhaseRef: PH-P1-BINDING-002` `TaskRef: TK-P1-BINDING-002-3`
- [x] [done] [P1][Binding] `.env.example` + `run-sync/README.md` aaron 항목 동기화 `PhaseRef: PH-P1-BINDING-002` `TaskRef: TK-P1-BINDING-002-4`

### AGENT-001

- [x] [done] [P1][Agent] `caleb.prompt.txt` 작성 (read-only explore, Joshua 보조 정찰 역할) `PhaseRef: PH-P1-AGENT-001` `TaskRef: TK-P1-AGENT-001-1`
- [x] [done] [P1][Agent] `run-sync/opencode.json`에 `caleb` subagent 등록 (mode: subagent, write/edit/ask: false, bash: true) `PhaseRef: PH-P1-AGENT-001` `TaskRef: TK-P1-AGENT-001-2`
- [x] [done] [P1][Agent] `run-sync/opencode.json` joshua permission에 `caleb: allow` 추가 `PhaseRef: PH-P1-AGENT-001` `TaskRef: TK-P1-AGENT-001-3`
- [x] [done] [P1][Agent] `dev-up.sh`에 caleb 바인딩 추가 (BINDING-002와 동일 패턴) `PhaseRef: PH-P1-AGENT-001` `TaskRef: TK-P1-AGENT-001-4`

### JOSHUA-001

- [x] [done] [P1][Joshua] `joshua.prompt.txt` Aaron QA gate rule 추가 (코더 [done] 후 `task(aaron)` dispatch → [verified] → [closed]) `PhaseRef: PH-P1-JOSHUA-001` `TaskRef: TK-P1-JOSHUA-001-1`
- [x] [done] [P1][Joshua] `joshua.prompt.txt` Caleb explore dispatch rule 추가 (task 복잡도 불명확 시 `task(caleb)` → 결과 기반 Bezalel/Oholiab 결정) `PhaseRef: PH-P1-JOSHUA-001` `TaskRef: TK-P1-JOSHUA-001-2`
- [x] [done] [P1][Joshua] `joshua.prompt.txt` Constraint #5 dispatch 목록 갱신 (`bezalel`, `oholiab`, `aaron`, `caleb`) `PhaseRef: PH-P1-JOSHUA-001` `TaskRef: TK-P1-JOSHUA-001-3`

### JOSHUA-002

- [x] [done] [P1][Joshua] `store.ts` `InteractionType`에 `joshua_decision` 추가 `PhaseRef: PH-P1-JOSHUA-002` `TaskRef: TK-P1-JOSHUA-002-1`
- [x] [done] [P1][Joshua] `detector.ts` `isJoshuaDecision()` 감지 + `JOSHUA_DECISION:` marker 기반 `effectiveType` 재분류 `PhaseRef: PH-P1-JOSHUA-002` `TaskRef: TK-P1-JOSHUA-002-2`
- [x] [done] [P1][Joshua] `evaluator.ts` `pickRoute()` `interactionType` 파라미터 추가, joshua_decision threshold=3 적용 `PhaseRef: PH-P1-JOSHUA-002` `TaskRef: TK-P1-JOSHUA-002-3`
- [x] [done] [P1][Joshua] `joshua.prompt.txt` Section 4 Escalation Output Format (`JOSHUA_DECISION:` structured format) 추가 `PhaseRef: PH-P1-JOSHUA-002` `TaskRef: TK-P1-JOSHUA-002-4`

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: 이전 phase(`PS-20260304-09`) close/archive 완료 (`archive/temp_TODO.2026-03-04.PS-20260304-09.20260304-191056.closed.md`)
- 2026-03-04: `PS-20260304-10` 시작, `temp_TODO.md` 신규 오픈 생성
- 2026-03-05: X3 interaction origin 분리 반영 (`managed`/`external`/`unknown`) 및 사용자 직접 OpenCode 사용 건을 `observed`(observe-only)로 기록하도록 조정
- 2026-03-05: X3 로그 레벨 튜닝 반영 (`detector_poll_done`, `detector_tick_done`, `detector_once_done`에서 duplicate/observed-only 반복 상태는 DEBUG로 하향)
- 2026-03-05: 다음 phase 후보 제안 — X3 운영 로그 정책 문서화 및 실제 daemon 로그 샘플 기준 INFO/WARN/DEBUG 운영 가이드 확정(phase 관리 단계에서 결정 필요)
- 2026-03-05: `moses`/`joshua`/`bezalel` agent prompt seed 바인딩 추가 (`dev-up.sh` mount/env/warn/출력, `.env.example` override, run-sync/README/project-structure 동기화)
- 2026-03-05: Present 확정 (BINDING-002 → AGENT-001 → JOSHUA-001 → JOSHUA-002), Task-Backlog 생성 완료
- 2026-03-05: BINDING-002 완료 (dev-up.sh aaron 바인딩 + .env.example + run-sync/README 동기화)
- 2026-03-05: AGENT-001 완료 (caleb.prompt.txt 작성 + opencode.json 등록 + dev-up.sh 바인딩)
- 2026-03-05: JOSHUA-001 완료 (joshua.prompt.txt Aaron QA gate + Caleb dispatch rule + Constraint #5 갱신)
- 2026-03-05: JOSHUA-002 완료 (store.ts joshua_decision type + detector.ts JOSHUA_DECISION: marker 감지 + evaluator.ts threshold=3 경로)
- 2026-03-05: `PS-20260304-10` phase close 완료 (전체 Done, archived: `archive/temp_TODO.2026-03-05.PS-20260304-10.20260305-172824.closed.md`)
