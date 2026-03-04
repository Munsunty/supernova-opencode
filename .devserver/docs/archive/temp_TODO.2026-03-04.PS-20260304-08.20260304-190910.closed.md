# temp_TODO.md (Archived)

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-08` close (`PH-P1-GENESIS-001` 완료, genesis bootstrap 경로/생성 smoke 완료)

# temp_TODO.md

*Last Updated: 2026-03-04*

Template-Version: v2

Status: CLOSED (2026-03-04)
Close reason: `PS-20260304-08` close (`PH-P1-GENESIS-001` 완료, genesis bootstrap 경로/생성 smoke 완료)
PhaseStamp: PS-20260304-08

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `PS-20260304-08`의 `Next`에서 선별된 `PhaseRef` 수행 항목
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

- `PH-P1-GENESIS-001` [완료] Genesis bootstrap 실행 경로를 run-sync templates 기준으로 확정하고 생성 결과(`docs/AGENTS.md`, `docs/phase_TODO.md`) 생성 smoke를 완료

## Todo

- 없음

## In Progress

없음

## Done

- `TK-PS08-GENESIS-001` (`PhaseRef: PH-P1-GENESIS-001`) Genesis bootstrap 생성 smoke를 완료하고 run-sync templates → `docs/templates` 동기화 경로를 기준으로 `docs/AGENTS.md`, `docs/phase_TODO.md` 생성 경로 동작을 확정

## Backlog

- 없음

## 제외 범위

- 없음

## Run Log

- 2026-03-04: 이전 phase(`PS-20260304-07`) close/archive 완료 (`archive/temp_TODO.2026-03-04.PS-20260304-07.20260304-190631.closed.md`)
- 2026-03-04: `PS-20260304-08` 시작, `temp_TODO.md` 신규 오픈 생성
- 2026-03-04: `PS-20260304-08` Present를 `PH-P1-GENESIS-001`로 갱신하고 `temp_TODO.md` Present/Todo 동기화
- 2026-03-04: `TK-PS08-GENESIS-001` 완료 및 `PS-20260304-08` close 처리
