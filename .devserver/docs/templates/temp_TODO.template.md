# temp_TODO.md

*Last Updated: YYYY-MM-DD*

Template-Version: v2

Status: OPEN
PhaseStamp: PS-YYYYMMDD-NN

## 목적

- `phase_TODO.md`가 Present로 확정한 항목의 실행을 관리한다.
- 대상: `<fill>`
- 제외: `<fill>`
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
  - TaskRef: [예: `TK-P1-X2-001`]
  - PhaseRef: [예: `PH-P1-X2-001`]
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

- `<phase_TODO.md Present 항목을 그대로 캐싱>`

## Todo

- [ ] [P1][<Domain>] <Present 항목을 실행 분해한 구체적 작업> `PhaseRef: PH-P1-<DOMAIN>-NNN` `TaskRef: TK-P1-<DOMAIN>-NNN`

## In Progress

없음

## Done

없음

## Backlog

- [ ] [P2][<Domain>] <Todo 정리 중 파생된 후순위 항목> `PhaseRef: PH-P2-<DOMAIN>-NNN` `TaskRef: TK-P2-<DOMAIN>-NNN`

## 제외 범위

- [x] [Scope][<Domain>] <이번 라운드 제외 범위>

## Run Log

- YYYY-MM-DD: 템플릿에서 생성
