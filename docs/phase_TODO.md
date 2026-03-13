# phase_TODO.md

*Last Updated: 2026-03-06*

Status: OPEN
PhaseStamp: PS-20260306-01

## 목적

- phase 단위 운영 기준과 백로그를 관리한다.
- 실행 상세와 일일 로그는 `temp_TODO.md`에서 관리한다.

## 운영 규칙

- 포맷: `[우선순위][영역] 작업 설명`
- 우선순위: `P0`(즉시), `P1`(이번 phase), `P2`(후순위)
- 이 문서는 `phase 기준`만 기록한다. 실행 세부는 `temp_TODO.md`로 위임한다.
- `temp_TODO.md` 신규 생성/초기화는 `.devserver/docs/templates/temp_TODO.template.md`를 기준으로 한다.
- `PhaseStamp`는 현재 phase 인스턴스 식별자이며, 해당 phase 동안 고정한다.
- `PhaseStamp` 포맷: `PS-YYYYMMDD-NN` (예: `PS-20260303-01`)
- `Next`는 가변 영역이며, 변경 자체가 정상 동작이다.
- `Next`는 `Phase-Backlog`이며, phase 관리 단계에서만 수정한다.
- `Present`는 `Next`에서 이번 phase 수행 대상으로 선별해 확정 이동한 항목의 상태 스냅샷이다.
- `Phase-Backlog` 항목은 `PhaseRef`를 반드시 포함한다.
- `PhaseRef` 포맷: `PH-{Priority}-{Domain}-{NNN}` (예: `PH-P1-X2-001`)
- Next → Present 이동 규칙:
  - phase 시작/리뷰에서 `Next` 항목 중 이번 phase에서 실제 수행할 항목을 고른다.
  - 고른 항목은 동일 `PhaseRef`로 `Present`에 반영한다.
  - `temp_TODO.md` 단계에서는 `Next` 후보 자체를 직접 수정하지 않는다.
- `상태 기준`:
  - `Previous`: 종료 이력 확정
  - `Present`: 현재 phase 기준 확정 스냅샷
  - `Next`: 다음 진행 후보

## 데이터 정책

- `Previous`: 확정 데이터(불변, 완료 이력)
- `Present`: 확정 실행 대상(현재 phase 기준 상태)
- `Present`는 `Next`에서 선별되어 phase에서 수행되는 `PhaseRef` 집합이다.
- `Next`: 가변 데이터(후보 백로그, 우선순위/항목 변경 가능)
- `Phase-Backlog`: `phase_TODO.md`의 `Next` 항목
- `Task-Backlog`: `temp_TODO.md`의 실행 분해 항목
- `Trace`: `temp_TODO.md` 실행 항목은 정확히 1개의 `PhaseRef`를 참조한다.
- `Trace`: `temp_TODO.md`는 상단 `PhaseStamp`가 `phase_TODO.md`와 동일해야 한다.
- `Present`는 `Next`에서 선택된 `PhaseRef`의 실행 상태 요약과 직접 연결되어야 한다.

## Next → Present

- `Next`는 후보를 모아두는 영역이고, `Present`는 실제 수행을 위한 선택 집합이다.
- 동일 phase에서 `Present`는 `Next`에서 한 번 선별된 `PhaseRef`만 반영한다.
- `Present` 항목 상태(계획/진행/완료)는 `temp_TODO.md`의 `Present`와 동기화한다.

## 사용되는 단어 관리

### 용어 규칙

- 문서 내 핵심 용어는 아래 표기만 사용한다.
- 동의어 혼용 금지: 한 개념은 한 단어로만 기록한다.
- 새 용어 추가 시 먼저 이 섹션에 정의를 추가한다.

### 표준 용어

- `Phase`: 계획/실행을 묶는 운영 단위
- `Previous`: 종료되어 확정된 phase 데이터
- `Present`: 현재 phase의 확정 상태 스냅샷
- `Next`: 변동 가능한 후보 백로그
- `Backlog`: 실행 후보 목록(확정 아님)
- `Archive`: 종료 문서 보관 상태
- `X_oc`: `opencode` 실행 계층
- `eq1`: 판단/분류/요약을 담당하는 LLM middleware 계층
- `X2`: 큐/실행 사이클 계층
- `X3`: interaction 감지/판단/응답 계층
- `X4`: 요약/라우팅/후속 생성 계층
- `Spark`: 단순/명확 작업 즉시 실행 모드 [Xoc]
- `Sisyphus`: 복잡/리스크 작업 계획/검증 모드 [Xoc]

### 금지 혼용 표현

- `확정 예정`, `준확정`: 사용 금지 (확정/가변만 사용)
- `임시 확정`: 사용 금지 (논리 충돌)
- `거의 완료`: 사용 금지 (완료/미완료로만 기록)

## Previous (Confirmed)

- 2026-03-06: `PS-20260305-01` close (`PH-P1-X2-005`, `PH-P1-SPARK-001`, `PH-P1-JOSHUA-003`, `PH-P1-X4-001`, `PH-P1-X4-002` 완료, X2 joshua 단일 진입점 + spark deprecated + joshua 직접 응답 규칙 + X4 auto_relay/chatId 전파 반영, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-06.PS-20260305-01.20260306-135141.closed.md`)
- 2026-03-05: `PS-20260304-10` close (`PH-P1-BINDING-002`, `PH-P1-AGENT-001`, `PH-P1-JOSHUA-001`, `PH-P1-JOSHUA-002` 완료, aaron/caleb 바인딩 + X3 joshua_decision escalation pipeline 구축, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-05.PS-20260304-10.20260305-172824.closed.md`)
- 2026-03-05: `PH-P1-GENESIS-002` 완료 (genesis bootstrap 경로 기준 계약 확정)
- 2026-03-05: `PH-P1-PHASE-001`, `PH-P1-PHASE-002` Joshua 운영으로 흡수 (Joshua 에이전트 시스템이 template 기반 phase/temp 관리를 직접 수행하므로 별도 phase 항목 불필요)
- 2026-03-04: `PS-20260304-09` close (`Present` 없음, 다음 phase 후보 선별 대기 상태로 종료)
- 2026-03-04: `PS-20260304-08` close (`PH-P1-GENESIS-001` 완료, genesis bootstrap 경로/생성 smoke 완료)
- 2026-03-04: `PS-20260304-07` close (`PH-P1-EQ1-001`, `PH-P1-EQ1-002` 완료, `PH-P1-GENESIS-001` 다음 phase 이관)
- 2026-03-04: `PS-20260304-06` close (`PH-P1-X2-003`, `PH-P1-X2-004` 완료, X2/X4 summarizer prompt seed 반영 경로 정합화 포함)
- 2026-03-04: `PS-20260304-05` close (`PH-P1-X1-002`, `PH-P1-X2-002`, `PH-P1-DOCS-002` 완료, summarizer agent runtime 연결 반영)
- 2026-03-04: `PS-20260304-02` close (`P2` X1/X2 백로그가 미완료 상태로 다음 cycle 대상 유지)
- 2026-03-04: `PS-20260304-03` close (`P1` X2 완료, `PH-P2-X1-001` 다음 cycle로 보류)
- 2026-03-03: `PS-20260303-01` close (`P1` 3건 완료, `PH-P2-DOCS-001`, `PH-P2-METRICS-001` 완료, `PH-P2-X1-001` 다음 cycle 후순위 보류 확정)
- 2026-03-03: `PS-20260303-01` close와 동시, `eq1` provider adapter/categorized retry/result schema 확정 및 live smoke(`cerebras`) PASS
- 2026-03-03: `PS-20260303-01` close와 동시, `X2` task 상태 전이/재시도/관측 로그 정책 확정
- 2026-03-03: `PS-20260303-01` close와 동시, `X3` detector/evaluator/responder 루프 구현 완료
- 2026-03-03: `PS-20260303-01` close와 동시, `X4` summarize/router + interaction queue/report 소비 경로 연결 완료
- 2026-03-04: `PS-20260304-01` close (`P2` X3/X4 완료, PH-P2-X1-001 다음 cycle 보류)
- 2026-03-03: Podman 안정화 스프린트 close 확정 (`doctor/smoke` PASS, infra block 해제)
- 2026-03-03: 이전 `temp_TODO.md` close 및 `archive/temp_TODO.2026-03-03.closed.md` 이관 완료
- 2026-03-04: `PS-20260304-01` 종료 후 `PS-20260304-02` 시작 (shift-up). 기존 종료 이력은 `PS-20260304-01` archived 항목 유지.
- 2026-03-04: `PS-20260304-04` close (`PH-P2-X1-001` 완료, `x1` Telegram 인입 파이프라인 적용 확인)

## Present (Confirmed)
PS-20260306-01

- 없음

## Next (Variable Phase-Backlog)

주의: 이 구간은 확정 구간이 아니다.
주의: 항목 추가/삭제/우선순위 변경은 정상이다.
주의: 단, `temp_TODO.md` 단계에서는 본 구간을 직접 변경하지 않는다.

- 없음

## Detail Handoff

- `Next`는 `Phase-Backlog` 후보군/우선순위만 기록한다.
- 상세 설계, 작업 분해, 검증 포인트, 예외처리 규칙은 `temp_TODO.md`의 `Task-Backlog`/In Progress/Run Log에서만 기록한다.
- `Present`는 진행 상태만 기록한다.
- `Present` 상태 스냅샷은 `temp_TODO.md`의 `Present`와 동일 기준으로 동기화한다.
- `Task-Backlog`는 `phase_TODO.md`의 `PhaseRef` 범위를 벗어나면 안 된다.
- `Task-Backlog`는 `Next` 또는 `Present`에서 선별된 항목의 `PhaseRef`만 사용한다.
- `Task` 단계에서 신규 후보가 나오면 `temp_TODO.md` Run Log에 제안만 기록하고, 실제 반영은 `phase_TODO.md`에서 결정한다.
- `Task` 단계는 `PhaseRef` 신규 발급 권한이 없다.
- `Task` 단계는 `PhaseStamp` 변경 권한이 없다.

## Archive 규칙

- phase 종료 시 `temp_TODO.md`를 close 처리 후 archive 이동
- `phase_TODO.md`의 `Present`를 `Previous`로 확정 이관
- 다음 phase 시작 시 `Present` 갱신, `Next` 재작성
- 다음 phase 시작 시 `PhaseStamp`를 새 값으로 갱신한다.

## Archive Log

- 2026-03-05: `PS-20260304-10` Next 백로그 갱신 (`PH-P1-GENESIS-002`, `PH-P1-PHASE-001`, `PH-P1-PHASE-002`)
- 2026-03-05: `PS-20260304-10` Next 문구 정렬 (genesis 갱신 경로 + template 기반 phase 운영 + temp 기반 개발 실행 기준)
- 2026-03-04: `PS-20260303-01` close 정식 반영 및 `PS-20260304-01` phase 시작, `Present` reset/`Next` 갱신
- 2026-03-04: `PS-20260304-01` Next→Present 이관(`PH-P2-X3-001`, `PH-P2-X4-001`) 반영. `X1`은 Next 백로그로 보류 유지
- 2026-03-03: `PH-P2-X1-001`는 다음 cycle 후보로 후순위 보류 결정
- 2026-03-04: `PH-P2-X3-001`, `PH-P2-X4-001` 실행 완료 반영 (`temp_TODO.md` Done 반영 확인)
- 2026-03-04: `PS-20260304-01` phase close 완료 (`temp_TODO.md` archived: `temp_TODO.2026-03-04.PS-20260304-01.20260304-120425.closed.md`)
- 2026-03-04: `PS-20260304-02` phase close 완료 (`temp_TODO.md` archived: `temp_TODO.2026-03-04.PS-20260304-02.20260304-135450.closed.md`)
- 2026-03-04: `PS-20260304-03` phase close 완료 (`temp_TODO.md` archived: `temp_TODO.2026-03-04.PS-20260304-03.20260304-135909.closed.md`)
- 2026-03-04: `PS-20260304-04` phase 시작 (`PS-20260304-03` 종료 상태 반영, `Present` reset/`Next` 갱신)
- 2026-03-04: `PS-20260304-04` phase close 완료 (`PH-P2-X1-001` 완료, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-04.20260304-140019.closed.md`)
- 2026-03-04: `PS-20260304-05` phase 시작 (`PS-20260304-04` 종료 상태를 이전으로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-05` Present 갱신 (`PH-P1-X1-002`, `PH-P1-X2-002`, `PH-P1-DOCS-002`) 및 `temp_TODO.md` 스냅샷/Done 동기화
- 2026-03-04: `PS-20260304-05` `PH-P1-DOCS-002` 범위 확장 완료 (`x2-summarizer`/`x4-summarizer` runtime agent 연결 + worker/env 옵션 + 테스트 PASS)
- 2026-03-04: `PS-20260304-05` phase close 완료 (`temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-05.20260304-161344.closed.md`)
- 2026-03-04: `PS-20260304-06` phase 시작 (`PS-20260304-05` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-06` `PH-P1-X2-004` 완료 반영 (`x2` eq1-first auto routing + fallback + `dev-up/.env.example` runtime 설정 연결 + 단위 테스트 PASS)
- 2026-03-04: `PS-20260304-06` phase close 완료 (`PH-P1-X2-003`, `PH-P1-X2-004` 완료, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-06.20260304-173706.closed.md`)
- 2026-03-04: `PS-20260304-07` phase 시작 (`PS-20260304-06` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-07` Present 갱신 (`PH-P1-EQ1-001`, `PH-P1-EQ1-002`) 및 `temp_TODO.md` 스냅샷 동기화
- 2026-03-04: `PS-20260304-07` `PH-P1-EQ1-002` 구현 진행 — internal provider(`opencode_internal`) + fallback chain(`opencode_internal_fallback`) + Eq1Client fallback 경계 + 단위 테스트 PASS, runtime smoke 단계로 전환
- 2026-03-04: `PS-20260304-07` `PH-P1-EQ1-002` 완료 반영 (runtime smoke 항목은 사용자 요청으로 생략, 코드/단위테스트 완료 기준으로 확정)
- 2026-03-04: `PS-20260304-07` phase close 완료 (`PH-P1-EQ1-001`, `PH-P1-EQ1-002` 완료, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-07.20260304-190631.closed.md`)
- 2026-03-04: `PS-20260304-08` phase 시작 (`PS-20260304-07` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-08` Present 갱신 (`PH-P1-GENESIS-001`) 및 `temp_TODO.md` 스냅샷 동기화
- 2026-03-04: `PS-20260304-08` phase close 완료 (`PH-P1-GENESIS-001` 완료, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-08.20260304-190910.closed.md`)
- 2026-03-04: `PS-20260304-09` phase 시작 (`PS-20260304-08` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-09` Present 갱신 없음 (다음 후보 선별 대기)
- 2026-03-04: `PS-20260304-09` phase close 완료 (`Present` 없음, `temp_TODO.md` archived: `archive/temp_TODO.2026-03-04.PS-20260304-09.20260304-191056.closed.md`)
- 2026-03-04: `PS-20260304-10` phase 시작 (`PS-20260304-09` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-04: `PS-20260304-10` Present 갱신 없음 (다음 후보 선별 대기)
- 2026-03-05: `PS-20260304-10` Next 4개 추가 (`PH-P1-BINDING-002`, `PH-P1-AGENT-001`, `PH-P1-JOSHUA-001`, `PH-P1-JOSHUA-002`) — aaron 바인딩, caleb 추가, joshua QA/explore/escalation 개선 설계 확정
- 2026-03-05: `PS-20260304-10` Present 확정 (`PH-P1-BINDING-002` → `PH-P1-AGENT-001` → `PH-P1-JOSHUA-001` → `PH-P1-JOSHUA-002` 순차 실행), `GENESIS-002`/`PHASE-001`/`PHASE-002` Next 제거
- 2026-03-05: `PS-20260304-10` Present 전체 완료 (BINDING-002/AGENT-001/JOSHUA-001/JOSHUA-002 모두 [완료])
- 2026-03-05: `PS-20260304-10` phase close 완료 (`temp_TODO.md` archived: `archive/temp_TODO.2026-03-05.PS-20260304-10.20260305-172824.closed.md`)
- 2026-03-05: `PS-20260305-01` phase 시작 (`PS-20260304-10` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-05: `PS-20260305-01` Present 갱신 없음 (다음 후보 선별 대기)
- 2026-03-05: `PS-20260305-01` Next 3개 추가 (`PH-P1-X2-005`, `PH-P1-SPARK-001`, `PH-P1-JOSHUA-003`) — X2 joshua 단일 진입점 + spark 정리 + joshua 직접 응답 규칙
- 2026-03-05: `PS-20260305-01` Next 2개 추가 (`PH-P1-X4-001`, `PH-P1-X4-002`) — X4 auto_relay 경로 + escalation Telegram chatId 전파 갭 수정
- 2026-03-05: `PS-20260305-01` Present 확정 (X2-005, SPARK-001, JOSHUA-003, X4-001, X4-002) Next → 없음
- 2026-03-06: `PS-20260305-01` Present 전체 완료 (X2-005, SPARK-001, JOSHUA-003, X4-001, X4-002 모두 [완료])
- 2026-03-06: `PS-20260305-01` phase close 완료 (`temp_TODO.md` archived: `archive/temp_TODO.2026-03-06.PS-20260305-01.20260306-135141.closed.md`)
- 2026-03-06: `PS-20260306-01` phase 시작 (`PS-20260305-01` 종료 상태를 Previous로 고정, `temp_TODO.md` 신규 오픈 생성)
- 2026-03-06: `PS-20260306-01` Present 갱신 없음 (다음 후보 선별 대기)
