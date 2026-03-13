# context-contract.md

*Last Updated: 2026-03-03*

Status: ACTIVE

## 목적

- `HOMSA.md` 기반 프로젝트에서 `AGENTS.md`를 일관되게 생성/갱신하기 위한 컨텍스트 계약을 정의한다.
- LLM 세션마다 참조 우선순위와 문서 책임 경계를 고정해 해석 편차를 줄인다.

## 계약 범위

- 대상 문서:
  - `.devserver/docs/HOMSA.md`
  - `.devserver/docs/HOMSA-META.md`
  - `.devserver/docs/AGENTS.md`
  - `.devserver/docs/phase_TODO.md`
  - `.devserver/docs/temp_TODO.md`
  - `.devserver/docs/operations.md`
  - `.devserver/docs/SCHEMA.md`

## Source of Truth 우선순위

1. 프레임워크 불변: `HOMSA.md`
2. 메타 결정/제약: `HOMSA-META.md`
3. 인스턴스 계약: `AGENTS.md`
4. 현재 실행 상태: `phase_TODO.md`, `temp_TODO.md`, `operations.md`
5. 구현 상세 스키마: `SCHEMA.md`

충돌 시 하위 문서를 상위 기준에 맞춰 갱신한다.

## 문서 책임 경계

- `AGENTS.md`: 원칙, 구조, 채널 분리, 불변 계약
- `phase_TODO.md`: phase 단위 `Previous/Present/Next`
- `temp_TODO.md`: 현재 작업 분해, 검증 계획, Run Log
- `operations.md`: 운영 상태, 장애, 차단 요인
- `HOMSA-META.md`: 적용 과정의 맹점, 보정 결정, 전환 논리

## 필수 메타데이터 스키마

`AGENTS.md` 생성/갱신 전 아래 필드를 최소 확보한다.

```yaml
contract_version: "v1"
project:
  name: ""
  mission: ""
  dp_outcome: ""
phase:
  stamp_id: ""
scope:
  include: []
  exclude: []
algebra:
  x_services: []
  eq_resources: []
  workflows: []
  operations_ln: []
  perturbations_lprime: []
channels:
  x_oc: ""
  eq1: ""
  x1: ""
invariants:
  - "idempotent state transition"
  - "queue-first execution"
  - "no direct opencode.db query"
documents:
  agents: ".devserver/docs/AGENTS.md"
  homsa: ".devserver/docs/HOMSA.md"
  homsa_meta: ".devserver/docs/HOMSA-META.md"
  phase_todo: ".devserver/docs/phase_TODO.md"
  temp_todo: ".devserver/docs/temp_TODO.md"
  operations: ".devserver/docs/operations.md"
  schema: ".devserver/docs/SCHEMA.md"
verification:
  observable_signals: []
  smoke_commands: []
  test_policy: "module tests first, full test at phase close"
```

## AGENTS 생성 규칙

- `HOMSA.md`의 기호 체계를 `AGENTS.md`의 `X/Eq/W/L/L'` 섹션으로 직접 매핑한다.
- `HOMSA-META.md`의 제약/맹점을 `AGENTS.md`의 `확정 진행 중` 또는 `미확정`으로 분류한다.
- 실행 중 변하는 값(백로그, 점수 임계값 튜닝, 운영 로그)은 `AGENTS.md`에 고정값으로 두지 않는다.
- 런타임 스냅샷은 `operations.md` 링크로만 위임한다.

## 세션 시작 체크리스트 (LLM)

1. `HOMSA.md`에서 불변 구조 확인
2. `HOMSA-META.md`에서 미해결 제약 확인
3. `AGENTS.md`의 참조 경로 무결성 확인
4. `phase_TODO.md`/`temp_TODO.md`로 현재 작업 범위 확인
5. 충돌/누락 항목을 먼저 문서에 반영한 뒤 구현 시작

## 변경 관리

- 계약 변경은 `context-contract.md`와 `AGENTS.md`를 같은 커밋에서 갱신한다.
- phase 종료 시 `phase_TODO.md`와 `temp_TODO.md` 정리 후, 계약상 경로/역할 변화가 있으면 본 문서를 갱신한다.
