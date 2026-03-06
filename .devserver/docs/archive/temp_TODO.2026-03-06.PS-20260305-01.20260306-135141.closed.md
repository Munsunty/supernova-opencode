# temp_TODO.md

*Last Updated: 2026-03-06*

Template-Version: v2

Status: CLOSED
PhaseStamp: PS-20260305-01

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260305-01`의 Present 확정 `PhaseRef` 수행 항목
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

- `PH-P1-X2-005` [계획] X2 routing joshua 단일 진입점 + spark X2 경로 제거
- `PH-P1-SPARK-001` [계획] spark deprecated 처리 — X2 routing 제외, opencode.json 정리
- `PH-P1-JOSHUA-003` [계획] joshua.prompt.txt 단순 질의 직접 응답 규칙 추가
- `PH-P1-X4-001` [계획] X4 auto_relay 액션 + joshua_decision fallback + x4-summarizer Joshua 포맷
- `PH-P1-X4-002` [계획] X3/X4 escalation chatId 전파 갭 수정 (sessionId → chatId 역추적)

## Todo

### X4-001

(완료되어 Done으로 이동)

### X4-002

(완료되어 Done으로 이동)

## In Progress

없음

## Done

- [done] [P1][Agent] `run-sync/opencode.json` spark `mode` deprecated 표기 또는 X2 routing 대상 제거 `PhaseRef: PH-P1-SPARK-001` `TaskRef: TK-P1-SPARK-001-1`
- [done] [P1][Agent] `spark.prompt.txt` 역할 재정의 — X2 routing 제외, joshua 위임 역할만 명시 `PhaseRef: PH-P1-SPARK-001` `TaskRef: TK-P1-SPARK-001-2`
- [done] [P1][X2] `dev-up.sh` / `.env.example` `X2_AGENT_SIMPLE_AGENT`, `X2_AGENT_COMPLEX_AGENT` 기본값을 `joshua`로 변경 (또는 `X2_AGENT_BYPASS_AGENT=joshua` 추가) `PhaseRef: PH-P1-X2-005` `TaskRef: TK-P1-X2-005-1`
- [done] [P1][X2] `compose.yaml` X2 관련 env 기본값 동기화 `PhaseRef: PH-P1-X2-005` `TaskRef: TK-P1-X2-005-2`
- [done] [P1][Joshua] `joshua.prompt.txt` 단순 질의 직접 응답 조건 추가 (조회/상태 확인 → Caleb dispatch 없이 직접 답변) `PhaseRef: PH-P1-JOSHUA-003` `TaskRef: TK-P1-JOSHUA-003-1`
- [done] [P1][X4] `x3/responder.ts` X4Router 인터페이스에 `auto_relay` 액션 추가 `PhaseRef: PH-P1-X4-001` `TaskRef: TK-P1-X4-001-1`
- [done] [P1][X4] `x4/router.ts` `auto_relay` 액션 구현 — 기존 세션 continuation prompt 주입 + 실패 fallback `PhaseRef: PH-P1-X4-001` `TaskRef: TK-P1-X4-001-2`
- [done] [P1][X4] `x4/router.ts` `joshua_decision` fallback → `skip` 처리 `PhaseRef: PH-P1-X4-001` `TaskRef: TK-P1-X4-001-3`
- [done] [P1][X4] `x4-summarizer` 프롬프트 `JOSHUA_DECISION:` 포맷 인식 규칙 추가 `PhaseRef: PH-P1-X4-001` `TaskRef: TK-P1-X4-001-4`
- [done] [P1][X4] `x2/store.ts` `getTaskSourceBySessionId` 추가 `PhaseRef: PH-P1-X4-002` `TaskRef: TK-P1-X4-002-1`
- [done] [P1][X4] `x4/router.ts` task 생성 시 sessionId→chatId→`encodeTelegramTaskSource` 적용 `PhaseRef: PH-P1-X4-002` `TaskRef: TK-P1-X4-002-2`
- [done] [P1][X4] `x3/responder.ts` x4Router 없는 fallback report task chatId 전파 적용 `PhaseRef: PH-P1-X4-002` `TaskRef: TK-P1-X4-002-3`

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-05: 이전 phase(`PS-20260304-10`) close/archive 완료 (`archive/temp_TODO.2026-03-05.PS-20260304-10.20260305-172824.closed.md`)
- 2026-03-05: `PS-20260305-01` 시작, `temp_TODO.md` 신규 오픈 생성
- 2026-03-05: Present 확정 (X2-005, SPARK-001, JOSHUA-003, X4-001, X4-002), Task-Backlog 생성 완료
- 2026-03-05T18:42:23+0900: `PH-P1-SPARK-001` 2개 작업 In Progress 전환
- 2026-03-05T18:44:18+0900: `PH-P1-X2-005` 2개, `PH-P1-JOSHUA-003` 1개 작업 In Progress 전환
- 2026-03-05T18:48:17+0900: `PH-P1-X2-005` 2개, `PH-P1-SPARK-001` 2개, `PH-P1-JOSHUA-003` 1개 작업 Done 전환
- 2026-03-05T18:53:40+0900: `PH-P1-X4-001` 4개, `PH-P1-X4-002` 3개 작업 In Progress 전환
- 2026-03-05T18:56:59+0900: `PH-P1-X4-001` 4개, `PH-P1-X4-002` 3개 작업 Done 전환 (구현+테스트 완료)
- 2026-03-06: `PS-20260305-01` phase close 완료 (`archive/temp_TODO.2026-03-06.PS-20260305-01.20260306-135141.closed.md`)
