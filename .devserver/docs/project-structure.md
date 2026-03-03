# 프로젝트 디렉토리 구조 (Phase 3 완료 기준)

*Last Updated: 2026-02-28*  
*Source of truth: repository tree + git history (`7b757e4`, `bcea588`, `23f4503`, `011c25c`)*

```
opencode-supernova/
├── package.json
├── README.md
├── AGENTS.md / HOMSA.md / docs/
├── test/
│
└── .devserver/                        ← Dₚ 패키지 루트 (격리 환경)
    ├── package.json                   ← devserver 전용 의존성(opencode-ai, OmO, SDK)
    ├── dev-up.sh                      ← 격리 실행 엔트리 (XDG env 설정 + 서버 기동)
    ├── dev-doctor.sh                  ← Podman 사전 진단 스크립트
    ├── dev-smoke.sh                   ← 기동/ready/정리 스모크 검증 스크립트
    ├── opencode.json                  ← OpenCode 메인 설정
    ├── run-sync/
    │   └── oh-my-opencode.jsonc       ← OmO seed 설정
    ├── opencode-server-wrapper.ts     ← X_oc wrapper (W₂/W₃ + L'_wrapper)
    ├── dashboard-screenshot.ts        ← dashboard 캡처 POC
    │
    ├── x2/                            ← X₂: Task 실행 채널 (Phase 2 완료)
    │   ├── store.ts
    │   ├── queue.ts
    │   ├── router.ts
    │   ├── summarizer.ts
    │   └── worker.ts
    │
    ├── eq1/                           ← Eq₁: LLM 채널 (Phase 3 완료)
    │   ├── task-types.ts
    │   ├── llm-client.ts
    │   ├── create-client.ts
    │   ├── providers/
    │   │   ├── factory.ts
    │   │   ├── cerebras.ts
    │   │   ├── groq.ts
    │   │   ├── openai-compatible.ts
    │   │   └── env.ts
    │   ├── mock-provider.ts
    │   ├── smoke.ts
    │   └── index.ts
    │
    ├── x3/                            ← X₃: detector loop (Phase 4 진행 중)
    │   ├── detector.ts
    │   └── worker.ts
    │
    ├── utils/                         ← 공용 유틸 (retry, logging)
    │   ├── retry.ts
    │   ├── logging.ts
    │   └── index.ts
    │
    ├── docs/
    │   ├── api.md
    │   ├── isolation.md
    │   ├── podman-troubleshooting.md
    │   └── project-structure.md
    │
    ├── config/opencode/               ← XDG_CONFIG_HOME
    ├── data/
    │   ├── state.db                   ← 자체 queue/interaction 상태 DB
    │   └── opencode/                  ← XDG_DATA_HOME/opencode
    │       ├── auth.json
    │       ├── opencode.db
    │       ├── log/
    │       └── storage/
    ├── cache/opencode/                ← XDG_CACHE_HOME
    ├── screenshots/
    └── node_modules/
```

---

## 모듈별 상태 요약

| 모듈 | 역할 | 상태 |
|------|------|------|
| `.devserver/x2` | task queue + worker 실행 | ✅ Phase 2 완료 |
| `.devserver/eq1` | LLM client + provider adapter + retry 경계 | ✅ Phase 3 완료 |
| `.devserver/x3` | permission/question detector | 🚧 Phase 4 진행 중 |
| `.devserver/opencode-server-wrapper.ts` | OpenCode API 경계층 | ✅ 운영 중 |

## 문서 반영 원칙

- 구조 문서는 **현재 커밋 트리와 git 로그 기준**으로 유지한다.
- 구현 상태는 `docs/PHASE_STATUS.md`와 일치해야 한다.
- 목표 구조(미래 설계)는 `AGENTS.md`/`HOMSA.md`에 두고, 본 문서는 **현행 구현**만 기록한다.
