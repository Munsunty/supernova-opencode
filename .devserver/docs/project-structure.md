# 프로젝트 디렉토리 구조 (X2/X3/X4 구현 완료 기준)

*Last Updated: 2026-03-04*  
*Source of truth: repository tree (`.devserver/src/*`, `.devserver/dev_code/test/*`)*

```
opencode-supernova/
├── package.json
├── README.md
├── docs/                               ← Genesis bootstrap output/workspace docs
│   ├── AGENTS.md
│   ├── phase_TODO.md
│   └── templates/
│       ├── AGENTS.template.md
│       └── phase_TODO.template.md
└── .devserver/                         ← Dₚ 패키지 루트 (격리 환경)
    ├── package.json
    ├── dev-up.sh / dev-doctor.sh / dev-smoke.sh
    ├── opencode.json
    ├── agents/
    │   ├── spark.prompt.txt
    │   ├── genesis.prompt.txt
    │   ├── eq1-core.prompt.txt
    │   ├── x2-summarizer.prompt.txt
    │   └── x4-summarizer.prompt.txt
    ├── run-sync/
    │   ├── oh-my-opencode.jsonc
    │   └── templates/
    │       ├── AGENTS.template.md
    │       └── phase_TODO.template.md
    ├── docs/
    │   ├── AGENTS.md
    │   ├── HOMSA.md
    │   ├── SCHEMA.md
    │   ├── phase_TODO.md
    │   ├── operations.md
    │   └── project-structure.md
    ├── src/
    │   ├── opencode-server-wrapper.ts  ← X_oc wrapper (W₂/W₃ + L'_wrapper)
    │   ├── dashboard-screenshot.ts
    │   ├── scripts/
    │   │   ├── dashboard-proxy.ts
    │   │   └── generate-opencode-config.ts
    │   ├── utils/
    │   │   ├── retry.ts
    │   │   ├── logging.ts
    │   │   ├── telegram-source.ts
    │   │   └── index.ts
    │   ├── eq1/                        ← Eq₁: LLM 채널
    │   │   ├── task-types.ts
    │   │   ├── types.ts
    │   │   ├── llm-client.ts
    │   │   ├── create-client.ts
    │   │   ├── providers/
    │   │   │   ├── factory.ts
    │   │   │   ├── cerebras.ts
    │   │   │   ├── groq.ts
    │   │   │   ├── openai-compatible.ts
    │   │   │   ├── opencode-internal.ts
    │   │   │   └── env.ts
    │   │   ├── mock-provider.ts
    │   │   ├── smoke.ts
    │   │   └── index.ts
    │   ├── x2/                         ← X₂: Queue + Executor + Loop
    │   │   ├── store.ts
    │   │   ├── queue.ts
    │   │   ├── router.ts
    │   │   ├── summarizer.ts
    │   │   └── worker.ts
    │   ├── x3/                         ← X₃: Detector + Evaluator + Responder
    │   │   ├── detector.ts
    │   │   ├── evaluator.ts
    │   │   ├── policy.ts
    │   │   ├── processor.ts
    │   │   ├── responder.ts
    │   │   └── worker.ts
    │   ├── x4/                         ← X₄: Summarizer + Router
    │   │   ├── summarizer.ts
    │   │   └── router.ts
    │   └── x1/                        ← X₁: Telegram ingress 입구 어댑터
    │       ├── poller.ts
    │       ├── webhook.ts
    │       ├── telegram.ts
    │       └── server.ts
    ├── dev_code/
    │   ├── script/
    │   └── test/                        ← x1/x2/x3/x4/wrapper 검증 테스트
    ├── config/ / data/ / cache/ / screenshots/
    └── node_modules/
```

---

## 모듈별 상태 요약

| 모듈 | 역할 | 상태 |
|------|------|------|
| `.devserver/src/x2` | task queue + worker 실행, retry/observability | ✅ 구현 완료 |
| `.devserver/src/eq1` | LLM client + provider adapter + retry 경계 | ✅ 구현 완료 |
| `.devserver/src/x3` | permission/question 감지/평가/자동응답·승격 | ✅ 구현 완료 |
| `.devserver/src/x4` | interaction 요약/라우팅 + report/new-task 생성 | ✅ 구현 완료 |
| `.devserver/src/x1` | Telegram ingress 정규화 및 webhook 어댑터 | ✅ 구현 완료 |
| `.devserver/src/opencode-server-wrapper.ts` | OpenCode API 경계층 | ✅ 운영 중 |

## 문서 반영 원칙

- 구조 문서는 **현재 커밋 트리 기준**으로 유지한다.
- 구현 상태는 `phase_TODO.md`의 `Present/Previous`와 일치해야 한다.
- 목표 구조(미래 설계)는 `AGENTS.md`/`HOMSA.md`에 두고, 본 문서는 **현행 구현**만 기록한다.
