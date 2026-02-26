# TODO Backlog

*Last Updated: 2026-02-26*

## 사용 규칙

- 포맷: `[우선순위][영역] 작업 설명`
- 우선순위: `P0`(즉시), `P1`(이번 Phase), `P2`(다음 Phase)
- 항목 상태는 체크박스로만 관리한다.
- 완료된 항목은 삭제하지 않고 `Done` 섹션으로 이동한다.

## In Progress (Phase 2 / X₂)

- [ ] [P0][X₂] `store/queue/router/summarizer` 통합 실행 루프 연결
- [ ] [P0][X₂] task 상태 전이 검증(`pending → running → completed|failed`)
- [ ] [P0][X₂] task 재실행 idempotency 가드 추가(중복 실행 안정성)
- [ ] [P1][X₂] 1cycle 관측 로그 정리(status, duration, queue length)
- [ ] [P1][X₂] 실패/재시도 정책 최소 구현(`FAIL` 처리 경로 명시)

## Next (Phase 3 / Eq₁)

- [ ] [P1][Eq₁] `llm-client.ts` 인터페이스 초안 확정(provider 교체 가능 구조)
- [ ] [P1][Eq₁] `classify/evaluate/summarize/route` task type 실행기 연결
- [ ] [P1][Eq₁] W₄ 결과 저장 포맷(JSON) 표준화

## Backlog (Phase 4-5)

- [ ] [P2][X₃] permission/question detector loop 구현
- [ ] [P2][X₃] evaluator(score) + responder(자동/사용자 분기) 구현
- [ ] [P2][X₄] summarizer/router 구현 및 report/new task 분기
- [ ] [P2][X₁] Telegram 프로토콜 연결 및 end-to-end 검증

## Done

- [x] [P0][Phase 1] `.devserver/` 격리 환경 구축 + opencode serve 가동
- [x] [P0][Phase 1] SDK wrapper(60개 메서드) 구현
- [x] [P0][Phase 1] Dashboard 기동 및 스크린샷 POC 확보
