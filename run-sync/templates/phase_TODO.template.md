# phase_TODO.md

*Last Updated: YYYY-MM-DD*

Status: OPEN
PhaseStamp: PS-YYYYMMDD-NN

## 목적

* phase 단위 운영 기준과 백로그를 관리한다.
* 실행 상세와 일일 로그는 `temp_TODO.md`에서 관리한다.

## 운영 규칙

* 포맷: `[우선순위][영역] 작업 설명`
* 우선순위: `P0`(즉시), `P1`(이번 phase), `P2`(후순위)
* 이 문서는 `phase 기준`만 기록한다. 실행 세부는 `temp_TODO.md`로 위임한다.
* `temp_TODO.md` 신규 생성/초기화는 `.devserver/docs/templates/temp_TODO.template.md`를 기준으로 한다.
* `PhaseStamp`는 현재 phase 인스턴스 식별자이며, 해당 phase 동안 고정한다.
* `PhaseStamp` 포맷: `PS-YYYYMMDD-NN` (예: `PS-20260303-01`)
* `Next`는 가변 영역이며, 변경 자체가 정상 동작이다.
* `Next`는 `Phase-Backlog`이며, phase 관리 단계에서만 수정한다.
* `Present`는 `Next`에서 이번 phase 수행 대상으로 선별해 확정 이동한 항목의 상태 스냅샷이다.
* `Phase-Backlog` 항목은 `PhaseRef`를 반드시 포함한다.
* `PhaseRef` 포맷: `PH-{Priority}-{Domain}-{NNN}` (예: `PH-P1-X2-001`)
* Next → Present 이동 규칙:
* phase 시작/리뷰에서 `Next` 항목 중 이번 phase에서 실제 수행할 항목을 고른다.
* 고른 항목은 동일 `PhaseRef`로 `Present`에 반영한다.
* `temp_TODO.md` 단계에서는 `Next` 후보 자체를 직접 수정하지 않는다.


* `상태 기준`:
* `Previous`: 종료 이력 확정
* `Present`: 현재 phase 기준 확정 스냅샷
* `Next`: 다음 진행 후보



## 데이터 정책

* `Previous`: 확정 데이터(불변, 완료 이력)
* `Present`: 확정 실행 대상(현재 phase 기준 상태)
* `Present`는 `Next`에서 선별되어 phase에서 수행되는 `PhaseRef` 집합이다.
* `Next`: 가변 데이터(후보 백로그, 우선순위/항목 변경 가능)
* `Phase-Backlog`: `phase_TODO.md`의 `Next` 항목
* `Task-Backlog`: `temp_TODO.md`의 실행 분해 항목
* `Trace`: `temp_TODO.md` 실행 항목은 정확히 1개의 `PhaseRef`를 참조한다.
* `Trace`: `temp_TODO.md`는 상단 `PhaseStamp`가 `phase_TODO.md`와 동일해야 한다.
* `Present`는 `Next`에서 선택된 `PhaseRef`의 실행 상태 요약과 직접 연결되어야 한다.

## Next → Present

* `Next`는 후보를 모아두는 영역이고, `Present`는 실제 수행을 위한 선택 집합이다.
* 동일 phase에서 `Present`는 `Next`에서 한 번 선별된 `PhaseRef`만 반영한다.
* `Present` 항목 상태(계획/진행/완료)는 `temp_TODO.md`의 `Present`와 동기화한다.

## 사용되는 단어 관리

### 용어 규칙

* 문서 내 핵심 용어는 아래 표기만 사용한다.
* 동의어 혼용 금지: 한 개념은 한 단어로만 기록한다.
* 새 용어 추가 시 먼저 이 섹션에 정의를 추가한다.

### 표준 용어

* `Phase`: 계획/실행을 묶는 운영 단위
* `Previous`: 종료되어 확정된 phase 데이터
* `Present`: 현재 phase의 확정 상태 스냅샷
* `Next`: 변동 가능한 후보 백로그
* `Backlog`: 실행 후보 목록(확정 아님)
* `Archive`: 종료 문서 보관 상태
* `<fill: 시스템 구조에 따른 표준 용어 1>`: `<fill: 정의>`
* `<fill: 시스템 구조에 따른 표준 용어 2>`: `<fill: 정의>`

### 금지 혼용 표현

* `확정 예정`, `준확정`: 사용 금지 (확정/가변만 사용)
* `임시 확정`: 사용 금지 (논리 충돌)
* `거의 완료`: 사용 금지 (완료/미완료로만 기록)

## Previous (Confirmed)

* YYYY-MM-DD: `PS-YYYYMMDD-NN` close (`<fill: 완료된 PhaseRef 기록>`)

## Present (Confirmed)

`<fill: 현재 PhaseStamp, 예: PS-20260304-06>`

* `<fill: PH-P1-DOMAIN-NNN>` [상태] `<fill: 진행/완료 등 현재 상태 요약>`

## Next (Variable Phase-Backlog)

주의: 이 구간은 확정 구간이 아니다.
주의: 항목 추가/삭제/우선순위 변경은 정상이다.
주의: 단, `temp_TODO.md` 단계에서는 본 구간을 직접 변경하지 않는다.

* `<fill: [우선순위][영역] 작업 후보 1 - PhaseRef>`
* `<fill: [우선순위][영역] 작업 후보 2 - PhaseRef>`

## Detail Handoff

* `Next`는 `Phase-Backlog` 후보군/우선순위만 기록한다.
* 상세 설계, 작업 분해, 검증 포인트, 예외처리 규칙은 `temp_TODO.md`의 `Task-Backlog`/In Progress/Run Log에서만 기록한다.
* `Present`는 진행 상태만 기록한다.
* `Present` 상태 스냅샷은 `temp_TODO.md`의 `Present`와 동일 기준으로 동기화한다.
* `Task-Backlog`는 `phase_TODO.md`의 `PhaseRef` 범위를 벗어나면 안 된다.
* `Task-Backlog`는 `Next` 또는 `Present`에서 선별된 항목의 `PhaseRef`만 사용한다.
* `Task` 단계에서 신규 후보가 나오면 `temp_TODO.md` Run Log에 제안만 기록하고, 실제 반영은 `phase_TODO.md`에서 결정한다.
* `Task` 단계는 `PhaseRef` 신규 발급 권한이 없다.
* `Task` 단계는 `PhaseStamp` 변경 권한이 없다.

## Archive 규칙

* phase 종료 시 `temp_TODO.md`를 close 처리 후 archive 이동
* `phase_TODO.md`의 `Present`를 `Previous`로 확정 이관
* 다음 phase 시작 시 `Present` 갱신, `Next` 재작성
* 다음 phase 시작 시 `PhaseStamp`를 새 값으로 갱신한다.

## Archive Log

* YYYY-MM-DD: 프로젝트 초기화 및 최초 phase 셋업 완료.
