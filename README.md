# supernova-opencode (homsa)

## Status

**현재 사용 금지 (Work In Progress)**

이 프로젝트는 Phase 진행 중인 개발 상태이며, 일반 사용/운영 환경 사용을 금지합니다.
구조 검토와 내부 개발 용도로만 다뤄주세요.

## Current Snapshot (2026-03-04)

- Phase 1 완료: Dₚ 격리 + `X_oc` wrapper
- Phase 2 완료: `X2` queue/worker loop
- Phase 3 완료: `Eq1` LLM 실행 채널
- Phase 4 핵심 통합 완료: `X3` detector/evaluator/responder + `X4` summarize/router
- 현재 운영 Phase: `PS-20260304-06` (상세는 `.devserver/docs/phase_TODO.md`)

## Current Capability

- `X1` Telegram ingress: 사용자 본문만 prompt 전달, source를 `#chat:<chatId>` 스코프로 관리
- `X2` 실행 안정화:
  - `event.subscribe`(SSE) + polling 병행
  - `messageId` 바인딩 + `getMessage` 우선 finalize
  - Telegram source 기준 세션 재사용
- 결과 전송:
  - Telegram `monitor/raw` 메시지: 기본 결과를 항상 전송
  - Telegram `summary/meta` 메시지: 요약 + 실행/요약 `agent`/`model` 메타 포함
- summarizer agent 런타임 연결:
  - `x2-summarizer` (결과 요약)
  - `x4-summarizer` (라우팅용 요약 enrichment)

## Docs

- `.devserver/docs/AGENTS.md`
- `.devserver/docs/HOMSA.md`
- `.devserver/docs/phase_TODO.md`
- `.devserver/docs/temp_TODO.md`
- `.devserver/docs/SCHEMA.md`
- `.devserver/docs/project-structure.md`
- `.devserver/docs/isolation.md`
- `.devserver/docs/operations.md`

## Related Projects

- OpenCode: https://github.com/anomalyco/opencode
- Oh My OpenCode (OmO): https://github.com/code-yeongyu/oh-my-opencode
- OmO Dashboard: https://github.com/WilliamJudge94/oh-my-opencode-dashboard
