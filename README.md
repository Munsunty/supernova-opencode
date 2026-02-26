# supernova-opencode (homsa)

## Status

**현재 사용 금지 (Work In Progress)**

이 프로젝트는 Phase 진행 중인 개발 상태이며, 일반 사용/운영 환경 사용을 금지합니다.
구조 검토와 내부 개발 용도로만 다뤄주세요.

## Current Phase

- Phase 1~3 완료
  - Phase 1: Dₚ 격리 + X_oc(wrapper) 완료
  - Phase 2: X₂ task queue/worker loop 완료
  - Phase 3: Eq₁ LLM client 실행 채널 완료
- Phase 4 진행 중 (X₃ + X₄ 통합)
- 운영/서비스 배포 전

## Recent Milestones (docs + git 기준)

- `7b757e4` — `feat(x2): finalize Phase 2 queue/worker flow`
- `bcea588` — `feat(eq1): complete phase 3 execution path`
- `23f4503` — `phase3: harden eq1 failure-paths, retry boundaries, and logging redaction`
- `011c25c` — `phase4: add x3 detector loop and interaction queue scaffold`

상세 상태와 완료 조건은 `docs/PHASE_STATUS.md`를 기준으로 관리합니다.

## Docs

- `AGENTS.md`
- `HOMSA.md`
- `docs/PHASE_STATUS.md`
- `docs/TODO.md`
- `.devserver/docs/project-structure.md`
- `.devserver/docs/isolation.md`

## Related Projects

- OpenCode: https://github.com/anomalyco/opencode
- Oh My OpenCode (OmO): https://github.com/code-yeongyu/oh-my-opencode
- OmO Dashboard: https://github.com/WilliamJudge94/oh-my-opencode-dashboard
