# TODO Backlog

*Last Updated: 2026-02-26*

## 사용 규칙

- 포맷: `[우선순위][영역] 작업 설명`
- 우선순위: `P0`(즉시), `P1`(이번 Phase), `P2`(다음 Phase)
- 항목 상태는 체크박스로만 관리한다.
- 완료된 항목은 삭제하지 않고 `Done` 섹션으로 이동한다.
- 개발 중에는 관련 개별 테스트만 실행하고, Phase 종료 시점에 전체 `bun test`를 실행한다.

## In Progress

- [ ] [P2][X₃] permission/question detector loop 구현

## Next (Phase 4-5)

- [ ] [P2][X₃] evaluator(score) + responder(자동/사용자 분기) 구현
- [ ] [P2][X₄] W₄ 결과를 interaction queue 저장 경로로도 확장(X₃/X₄ 연동 대비)

## Backlog (Phase 4-5)

- [ ] [P2][X₄] summarizer/router 구현 및 report/new task 분기
- [ ] [P2][X₁] Telegram 프로토콜 연결 및 end-to-end 검증

## Done

- [x] [P0][Phase 1] `.devserver/` 격리 환경 구축 + opencode serve 가동
- [x] [P0][Phase 1] SDK wrapper(60개 메서드) 구현
- [x] [P0][Phase 1] Dashboard 기동 및 스크린샷 POC 확보
- [x] [P0][X₂] `store/queue/router/summarizer` 통합 실행 루프 연결 (`.devserver/x2/worker.ts`)
- [x] [P0][X₂] task 상태 전이 정합화(`pending → running → completed|failed`)
- [x] [P0][X₂] task 재실행 idempotency 가드(중복 실행 방지 + atomic claim)
- [x] [P1][X₂] 1cycle 관측 로그(status, duration, backlog) 출력 추가
- [x] [P1][X₂] 실패/재시도 최소 정책 + stale running 복구 경로 추가
- [x] [P0][X₂] 성공 1cycle 스모크 검증(`completed` 상태 + `result` 저장 확인)
- [x] [P1][X₂] 재시도 정책 튜닝 확정(기본: maxRetries=1, backoff=3s→최대 60s, running timeout=120s)
- [x] [P1][Eq₁] `task-types` + `llm-client` + `mock-provider` Phase 3 준비 스캐폴드 추가
- [x] [P1][Eq₁] Phase 3 준비 테스트 추가/통과(`test/eq1.llm-client.test.ts`)
- [x] [P1][Eq₁] 실제 provider adapter 추가(cerebras 1순위, groq 2순위, openai-compatible 공통)
- [x] [P1][Eq₁] X₂ queue에서 Eq₁ task type(`classify/evaluate/summarize/route`) 실행 연결
- [x] [P1][Eq₁] W₄ 결과 JSON 저장 경로 연결(`tasks.result`)
- [x] [P1][Eq₁] live key 기준 `eq1:smoke` 성공 검증(`2026-02-26`, provider=`cerebras`)
- [x] [P1][Eq₁] 실패 경로 테스트 보강(timeout/429/5xx/invalid JSON, 4xx fail-fast)
- [x] [P1][Eq₁] retry 책임 분리(provider-level 우선, task-level 중첩 차단)
- [x] [P1][Eq₁] `tasks.result` 스키마 버전 + `request_hash` 저장
- [x] [P1][Ops] logging redaction 적용 + 테스트 추가
