# CLAUDE.md — OpenCode Dev Server 표준화 프로젝트 
## 프로젝트명
opencode-supernova

## 프로젝트 목표

**user interaction bot + LLM middleware + [opencode] → 샌드박스 코드 에이전트.**
이 결과물이 앞으로의 프로젝트에서 Dₚ가 된다.

프로젝트 경로만 주면 opencode serve(+선택 dashboard)까지 기동되는 구조.
**개발자 = 아키텍트/PM, 에이전트 = 실무 개발팀** 구조를 실현.

```
이상적 UX:
  bun run dev
  # 끝. 격리된 환경에서 전부 기동
```

## 문서 역할 (컨텍스트 계약)

`AGENTS.md`는 실행 백로그 문서가 아니라, HOMSA 기반 구현에서 LLM이 따라야 하는 `컨텍스트 계약` 문서다.

- 이 문서는 `무엇을 고정 불변으로 볼지`와 `어떤 문서를 우선 참조할지`를 정의한다.
- 실행 항목/일일 로그는 `phase_TODO.md`와 `temp_TODO.md`에서만 관리한다.
- 운영 상태/장애 기록은 `operations.md`에서만 관리한다.
- 계약 상세와 메타데이터 스키마는 `context-contract.md`를 단일 기준으로 사용한다.

---

## 섹션별 업데이트 참고 파일 (빠른 갱신 가이드)

아래 표는 `AGENTS.md` 각 섹션을 갱신할 때 먼저 확인할 기준 파일이다.

| AGENTS.md 섹션 | 업데이트 참고 파일 (우선순위 순) | 빠른 확인 포인트 |
|---|---|---|
| 프로젝트명 / 프로젝트 목표 | `.devserver/README.md`, `.devserver/docs/phase_TODO.md`, `.devserver/docs/temp_TODO.md`, `.devserver/docs/context-contract.md` | 현재 목표/범위/제외 범위가 최신인지 |
| HOMSA 위치 정의(전체 시스템 구조~Dₚ 조건) | `.devserver/docs/HOMSA.md`, `.devserver/src/opencode-server-wrapper.ts`, `.devserver/src/x2/*.ts`, `.devserver/src/x3/*.ts`, `.devserver/src/x4/*.ts`, `.devserver/src/eq1/*.ts` | X/Eq/D/W/L/L' 정의와 실제 구현 정합성 |
| 아키텍처 결정사항 | `.devserver/dev-up.sh`, `.devserver/entrypoint.sh`, `.devserver/run-sync/opencode.json`, `.devserver/.env.example` | 확정/미확정 상태가 코드 기준과 일치하는지 |
| Queue 설계 | `.devserver/src/x2/store.ts`, `.devserver/src/x2/queue.ts`, `.devserver/src/x3/detector.ts`, `.devserver/src/x3/responder.ts` | 테이블/상태/채널 매핑이 현재 로직과 맞는지 |
| 패키지 구성 | `.devserver/docs/project-structure.md`, `.devserver/README.md` | 현재 구현 구조와 목표 구조의 차이 갱신 |
| 기동 방식 (현재 동작) | `package.json`, `.devserver/dev-up.sh`, `.devserver/dev-doctor.sh`, `.devserver/dev-smoke.sh` | 실제 실행 커맨드와 문서 예시 일치 여부 |
| 작업 우선순위 | `.devserver/docs/phase_TODO.md`, `.devserver/docs/temp_TODO.md` | phase 상태/완료 조건/현재 focus 정렬 |
| 핵심 원칙 | `.devserver/docs/HOMSA.md`, `.devserver/docs/phase_TODO.md`, `.devserver/docs/context-contract.md` | 원칙 문구와 운영 정책(가변/확정) 충돌 여부 |
| Wrapper 현황 | `.devserver/src/opencode-server-wrapper.ts`, `.devserver/dev_code/test/wrapper.test.ts`, `.devserver/docs/api.md` | 메서드 수/분류/미구현 목록 최신화 |
| Dₚ 사용 시나리오 | `.devserver/docs/isolation.md`, `.devserver/dev-up.sh`, `.devserver/opencode.json` | 격리/포트/멀티 프로젝트 시나리오 정합성 |
| 참고 문서 | `.devserver/docs/` 하위 문서 전체, `phase_TODO.md`, `temp_TODO.md` | 링크 누락/경로 오타/중복 제거 |
| 관련 프로젝트 | OpenCode/Dashboard 공식 repo README | 버전/링크/역할 설명 최신화 |
| OpenCode 격리 관련 환경변수 | `.devserver/.env.example`, `.devserver/dev-up.sh`, `.devserver/entrypoint.sh` | env 이름/기본값/설명 동기화 |
| 현재 런타임 상태 | `.devserver/docs/operations.md` | 운영 상태/차단요인/운영 이력 갱신 시점 |

---

## HOMSA 위치 정의(개발 프레임워크 문서)
./HOMSA.md

### 전체 시스템 구조

```
S = ΣΣLₙ + ΣΣaₘLₘ + ΣΣL'ₙ + ΣDₚ + ΣEq

인스턴스화:
S = X₁ + X₂ + X₃ + X₄ + X_oc + W₁..W₈ + Dₚ₁ + Dₚ₂ + Eq₁ + L'_wrapper + (L'_oc + L'_q)
```

### 서비스 대수 (Xₙ)

| Xₙ | 역할 | 계층 | 구현 | 상태 |
|-----|------|------|------|------|
| **X₁** | 통신 프로토콜 (user ↔ system) | Wrapper | Telegram Bot (교환 가능) | Telegram ingress adapter(enqueue) + direct-chatbot(X_oc 직결) |
| **X₂** | Task 실행 (Queue + Executor + Loop) | Core | SQLite queue + cron loop + retry/observability | 구현 완료 |
| **X₃** | OC Interaction (감지 + 판단 + 분기) | Core | Detector + Evaluator + Responder + policy/processor | 구현 완료 |
| **X₄** | 판단 맥락 생성 + 라우팅 | Core | Summarizer + Router + report/new-task 연계 | 구현 완료 |
| **X_oc** | 코딩 에이전트 | Core | opencode serve | 가동 중 |

### 외부 리소스 (Eq)

| Eq | 리소스 | 비고 |
|----|--------|------|
| **Eq₁** | LLM API | 별도 LLM 클라이언트 (판단/분류/요약용). 구현체 미정 |

### 자체 리소스 (Dₚ)

| Dₚ | 내용 | 위치 |
|----|------|------|
| **Dₚ₁** | 우리 시스템의 자체 리소스 | `CLAUDE.md` (판단 기준 소스), `state.db`, `opencode.json` |
| **Dₚ₂** | X_oc의 자체 리소스 | `opencode.db`, `auth.json`, `config/`, `cache/` |

### 워크플로우 (W) — 커플링 정의

| W | 경로 | Lₙ 합 | 구현체 |
|---|------|--------|--------|
| **W₁** | X₁ → X₂ | `RECEIVE` → `ENQUEUE` | user input → task 적재 |
| **W₂** | X₂ → X_oc | `EXECUTE` → X_oc.prompt | opencode wrapper (task 실행) |
| **W₃** | X₃ → X_oc | `DETECT` → X_oc.list / `AUTO_REPLY` → X_oc.reply | opencode wrapper (폴링 + 자동응답) |
| **W₄** | X₃/X₄ → Eq₁ | `EVALUATE` / `SUMMARIZE` / `ROUTE` → Eq₁ | LLM client (판단/맥락/라우팅) |
| **W₅** | X₃ ↔ X₁ | `ESCALATE` → `SEND` → `AWAIT_REPLY` → `RELAY_REPLY` | 양방향 사용자 전달 (score > 6) |
| **W₆** | X₄ → X₁ | `REPORT` → `SEND` | report 전달 |
| **W₇** | X₄ → X₂ | `CHAIN` → `ENQUEUE` | new task 적재 |
| **W₈** | X₁ → X_oc | `RECEIVE` → `DIRECT_PROMPT` → `SEND` | direct-chatbot 채널 (queue 완전 우회, `spark` agent 기본) |

- **W 관측 규칙**: 각 W는 최소 1개의 관측 가능한 Lₙ(event/log/write)을 포함해야 한다 (1cycle 판정 가능해야 함)
- **So 안정성 규약**: 단계 전이는 idempotent하게 설계한다 (같은 입력/같은 단계 재실행 시 결과 안정)

### 연산 정의 (Lₙ enum)

W 성립 기준 최소 연산. X_oc는 wrapper 60개 메서드로 이미 존재하므로 제외.

- **Lₙ 독립성 가드레일**: 암묵적 공유 상태(전역 current user/project/session 등)를 금지한다
- 공유 상태가 필요하면 Dₚ에 명시 저장하고, 흐름 제어는 So 상태 전이로 승격한다

| Lₙ | 연산 | 소속 Xₙ | W 연결 |
|----|------|---------|--------|
| `ENQUEUE` | task 적재 | X₂ | W₁, W₇ |
| `POLL_TASK` | pending task 조회 | X₂ | - |
| `EXECUTE` | task 실행 분기 | X₂ | W₂, W₄ |
| `COMPLETE` | 결과 저장 + X₄ 전달 | X₂ | - |
| `FAIL` | 실패 처리 | X₂ | - |
| `DETECT` | permission/question 폴링 | X₃ | W₃ |
| `EVALUATE` | 중요도 판단 요청 | X₃ | W₄ |
| `AUTO_REPLY` | 자동응답 (score ≤ 6) | X₃ | W₃ |
| `ESCALATE` | 사용자 전달 (score > 6) | X₃ | W₅ |
| `RELAY_REPLY` | 사용자 응답 → X_oc 전달 | X₃ | W₅, W₃ |
| `SUMMARIZE` | 실행 결과 → 판단 맥락 생성 | X₄ | W₄ |
| `ROUTE` | 후속 판단 | X₄ | W₄ |
| `REPORT` | 사용자에게 결과 전달 | X₄ | W₆ |
| `CHAIN` | new task 적재 | X₄ | W₇ |
| `RECEIVE` | 사용자 메시지 수신 | X₁ | W₁ |
| `DIRECT_PROMPT` | 사용자 메시지 즉시 실행 (queue 우회) | X₁ | W₈ |
| `SEND` | 사용자에게 메시지 전송 | X₁ | W₅, W₆ |
| `AWAIT_REPLY` | 사용자 응답 대기 + 수신 | X₁ | W₅ |

### 보정 항 (L'ₙ)

| L'ₙ | 대상 | 구현 |
|------|------|------|
| **L'_wrapper** | X_oc 변동 흡수 | 구현체는 W₂/W₃/W₈과 동일 (opencode wrapper). 런타임에는 W(커플링 수행), opencode 업데이트 시에는 L'ₙ(변동 흡수). 보정 주체: Dₚ(개발자 + 외부 AI) |
| L'_oc | X_oc 상태 보정 | 헬스체크, 세션 정리 (미정) |
| L'_q | task 정합성 보정 | running 상태 방치 감지, 실패 재시도 (미정) |

### 전체 흐름

```
User → X₁(프로토콜) → W₁ → X₂(Queue) → W₂ → X_oc(실행)
                                                  │
        X₃(감지) ← W₃ ← permission/question ←───┤
        X₃(판단) → W₄ → Eq₁ → score             │
        X₃(분기) → score ≤ 6: W₃ → X_oc 자동응답 │
                 → score > 6: W₅ → X₁ → User     │
                   User 응답 → X₁ → W₅ → X₃ → W₃ → X_oc
                                                  │
        X₄(맥락 생성) ← W₂ ← 완료 ←──────────────┘
        X₄(라우팅) → W₄ → Eq₁ → 판단
            → W₆ → X₁ → User (report)
            → W₇ → X₂ (new task) → [다음 주기]

[옵션 direct 채널]
User → X₁(direct-chatbot) → W₈ → X_oc(prompt, agent=spark) → X₁ → User
```

### Dₚ 조건 (충족해야 할 것)

- **Lₙ에 대해 독립**: 어떤 프로젝트든 동일하게 작동
- **자체 완결**: 바이너리, config, auth, 스토리지 전부 패키지 안에
- **참조만으로 작동**: 프로젝트 경로만 주면 기동
- **내부 정합성**: 구성요소 간 설정이 일관됨

---

## 아키텍처 결정사항

### 확정

1. **1 프로젝트 = 1 패키지 (완전 격리)**
   - python venv와 동일한 수준의 환경 격리
   - 바이너리, config, auth, 스토리지 전부 프로젝트 로컬

2. **opencode는 serve 모드로 상주**
   - `opencode serve --port <N>` 으로 headless HTTP 서버 기동
   - MCP 서버 콜드 부트 제거 (매번 spawn 대비 성능 이점)
   - Bot/외부 도구는 SDK(`@opencode-ai/sdk`) 또는 HTTP API로 통신
   - stdout 파싱 불필요

3. **sandbox 격리 방법** (`.devserver/dev-up.sh`로 구현)
   ```bash
   # .devserver/ 안에 의존성 설치
   cd /project-a/.devserver && bun install

   # dev-up.sh가 설정하는 환경변수:
   XDG_CONFIG_HOME=.devserver/config \
   XDG_DATA_HOME=.devserver/data \
   XDG_CACHE_HOME=.devserver/cache \
   OPENCODE_CONFIG=.devserver/opencode.json \
   OPENCODE_CONFIG_DIR=.devserver/ \
   .devserver/node_modules/.bin/opencode serve --port 4996
   ```

4. **계정 정보 격리**
   - OpenCode 인증 정보: `$XDG_DATA_HOME/opencode/auth.json`
   - XDG_DATA_HOME을 프로젝트 로컬로 지정하면 자동 격리
   - 기존 auth.json 복사로 즉시 세팅 가능
   - 또는 프로젝트 루트 `.env` 파일로 API 키 주입

5. **Telegram Bot은 프로젝트당 1:1**
   - 프로젝트 A → Bot A, 프로젝트 B → Bot B
   - 개별 채팅 또는 그룹 채팅에서 @mention으로 구분
   - Bot(X₁)은 나중에 붙임 — Dₚ 안정화 이후

6. **모듈 분리 (Wrapper 1 + Core 4)**
   - Wrapper: X₁ — 통신 프로토콜 (user ↔ system, 양방향 채널 추상화)
   - Core: X₂ — Task 실행 (Queue + Executor + Loop)
   - Core: X₃ — OC Interaction (감지 + 판단 + 분기)
   - Core: X₄ — 판단 맥락 생성 + 라우팅 (Summarizer + Router)
   - Core: X_oc — 코딩 에이전트 (opencode serve, wrapper 통해 접근)

7. **자체 DB는 직접, 남의 DB는 API로**
   - opencode.db 직접 조회 금지, wrapper API 통해서만 접근
   - 자체 state.db (task + interaction 테이블)는 직접 관리

8. **opencode 호출과 LLM 호출은 분리된 실행 채널**
   - opencode 호출: X₂ → W₂ → X_oc (코딩 에이전트 실행)
   - LLM 호출: X₃/X₄ → W₄ → Eq₁ (판단/분류/요약)
   - 둘은 근본적으로 다른 실행 경로 — queue의 type으로 구분
   - 기본 경로는 queue 기반(W₁/W₂/W₇). 단, X₁ direct-chatbot은 W₈로 queue를 우회할 수 있음

9. **opencode = X_oc (서비스 대수)**
   - 단순 외부 리소스(Eq)가 아닌 독립 서비스 대수
   - 버전 관리 존재: opencode
   - 자체 Dₚ₂ 보유: opencode.db, auth.json, config, cache
   - wrapper = W₂/W₃ (커플링) + L'_wrapper (변동 흡수 경계층)

10. **LLM 호출은 loop성 task chain으로 처리**
    - 양방향 통신을 단방향 순차 처리로 변환
    - 각 task 완료 시 다음 task를 parent_id로 연결
    - task chain 자체가 conversation history 역할
    - 실시간 상호작용 불필요 (사용자 인터렉션은 실시간성을 요구하지 않음)

11. **SSE 불필요, cron 폴링**
   - 안정성 우선, SSE는 끊김 리스크
   - X₂ loop과 X₃ loop 각각 독립 폴링

12. **적재와 실행의 분리**
    - queue는 데이터 (SQLite), executor/loop는 실행

13. **판단 기준과 판단 맥락의 분리**
    - **판단 기준** = CLAUDE.md (Dₚ₁). 불변. 매 판단마다 context에 주입
    - **판단 맥락** = task chain (summarizer가 생성). task별 생성, 후속 판단자에게 전달
    - 기준은 이전 판단 이력에 의해 변하지 않음 — 이력 기반이면 초기 오판이 고착화됨
    - 맥락은 현재 task의 실행 결과에서 구조화하여 생성

14. **X₁ 채널은 기본 `both`(poller + direct)로 운영**
    - 기본값 `X_OC_PODMAN_X1_MODE=both`에서 queue 경로(W₁)와 direct 경로(W₈)를 동시에 실행
    - `X_OC_PODMAN_X1_DIRECT_TOKEN`이 비어 있으면 direct는 자동 비활성화되고 poller만 실행
    - `X_OC_PODMAN_X1_MODE=direct` 시 Telegram 입력이 queue를 거치지 않고 X_oc로 직결됨
    - 기본 agent는 `spark` (`X_OC_PODMAN_X1_DIRECT_AGENT`로 변경 가능)
    - 필요 시 `poller`/`webhook` 단독 모드로 축소 가능

### 확정 진행 중 (구현으로 방향 결정됨)

1. **Dₚ 내부 DB 구조** → **분리 유지**
   - `opencode.db`: OpenCode 네이티브 (세션, 메시지, 도구 호출) — `.devserver/data/opencode/opencode.db`
   - `state.db`: 자체 상태 (Task 대기열 + Interaction 대기열) — `.devserver/data/state.db`
   - opencode 정보는 SDK wrapper API로만 접근 (state.db에서 opencode.db 직접 참조 안 함)
   - Task에 `session_id` 필드로 opencode 세션과 연결 (id 참조만, FK 없음)

2. **대기열 정책** → **SQLite Solid Queue 스타일**
   - type별 독립 실행, 같은 type 안에서만 순차 보장
   - cron 폴링 방식으로 pending task 순차 처리

3. **Permission/Question 처리** → **X₃/X₄ 모듈로 구현 완료**
   - 감지: W₃ (`wrapper.listPermissions()` / `wrapper.listQuestions()`) 폴링
   - 판단: W₄ → Eq₁ (별도 LLM client)으로 중요도 판단 (score 1-10)
   - 분기: score ≤ 6 → W₃ → X_oc 자동응답
          score > 6 → X₄ route → report/new_task 생성 (X₁ 연계는 후속 범위)

4. **X₁ direct-chatbot 채널** → **구현 완료**
   - 엔트리포인트: `.devserver/src/x1/direct-chatbot.ts`
   - 모드: `X_OC_PODMAN_X1_MODE=both` 기본 (또는 `direct`, `poller`, `webhook`)
   - 경로: Telegram poll → X_oc prompt(`spark`) → Telegram reply (queue/state.db 비의존)

### 미확정

1. **판단 분류 — 누가 하나?**

   | 판단 지점 | 입력 | 판단 내용 | 실행 채널 | 담당 |
   |-----------|------|----------|-----------|------|
   | X₁ 인입 | 사용자 메시지 | task 분류 (잡담/명령/task) | Eq₁ | 미정 |
   | X₂ 완료 | task result | 성공/실패/재시도 | Eq₁ | 미정 |
   | X₂ 후속 | task result | 후속 task 필요 여부 | Eq₁ | 미정 |
   | X₃ permission | permission 내용 | 자동/사용자 | Eq₁ | evaluator(LLM) |
   | X₃ question | question 내용 | 자동/사용자 | Eq₁ | evaluator(LLM) |
   | X₄ 보고 | 판단 맥락 | report/new task/skip | Eq₁ | 미정 |

2. **세션 생명주기**: task마다 새 세션? 이어가기? router 판단용 세션은 별도?

3. **동시성 제어**: X₂ loop과 X₃ loop 동시 wrapper 호출 시 충돌?

4. **Dashboard 연동 방식**
   - Dashboard 스크린샷 POC는 구현됨 (puppeteer-core)
   - Bot에서 스크린샷 vs API fetch vs opencode.db 직접 읽기 중 선택 필요

5. **L'ₙ (보조 워커) 위치 및 구현**
   - 쉬고 있는 프로젝트 감지, 서버 점검 등
   - 메인 실행과의 충돌/격리 방식 미정

6. **LLM context management (사용자 연구 후 결정 예정)**
   - Eq₁ (LLM client) 호출 시 context를 어떻게 관리할 것인가
   - task chain이 conversation history 역할 → 별도 conversation 테이블 불필요 가능성
   - 그러나 chain 내에서 context window 관리, 요약/압축 전략은 미정
   - **사용자가 추가 연구 후 결정 예정** (2026-02-26)

7. **LLM client 구현체 선택**
   - 별도 LLM 클라이언트 사용 확정, 구현체는 미정
   - 다양한 옵션 가능 (provider, model 교환 가능하게 설계)

---

## Queue 설계 (확정)

Queue 스키마 상세는 단일 문서로 위임한다.

- `./SCHEMA.md`

본 섹션은 원칙만 유지한다.

- queue는 `tasks`와 `interactions`를 분리한다.
- 실행 채널(`X_oc`, `Eq1`, `X1`)은 분리한다.
- `W5`는 interaction queue 경로로 처리한다.
- `W8`(X₁ direct)는 queue 설계 범위 밖의 별도 운영 채널로 취급한다.

---

## 패키지 구성

패키지 구성 상세(현재 트리/모듈 상태/목표 구조)는 아래 문서를 단일 기준으로 관리한다.

- `./docs/project-structure.md`

이 섹션에는 중복 트리 전문을 두지 않고, 아키텍처 관점의 요약만 유지한다.

- 현재 구현 기준 루트: `.devserver/` (Dₚ 패키지)
- 핵심 모듈: `eq1`, `x2`, `x3`, `x4`, `opencode-server-wrapper`
- 구조 변경 시 반영 순서: `project-structure.md` 갱신 → 본 문서(AGENTS.md) 요약 동기화

---

## 기동 방식 (현재 동작)

```bash
# 프로젝트 디렉토리에서 개발 서버 기동
cd /project-x
bun run dev          # → .devserver/dev-up.sh 실행
# → XDG 환경변수 5개를 .devserver/ 내부 경로로 설정
# → opencode serve --port 4996 기동 (포그라운드)
# → src/index.ts(supervisor)에서 X1/X2/X3 프로세스 동시 기동/관리
# → X1은 기본 both 모드(poller + direct), 단 direct token 비어 있으면 poller만 기동

# X1 direct-chatbot 채널(Queue 완전 우회) 사용 시
X_OC_PODMAN_X1_MODE=direct bun run dev
# (선택) queue worker도 끄려면:
# X_OC_PODMAN_X2_ENABLED=0 X_OC_PODMAN_X1_MODE=direct bun run dev
```

---

## 구현 위치 (HOMSA MVP 기준)

HOMSA 적용 절차 (`HOMSA.md § 14`) 완료 상태:

| 단계 | 내용 | 상태 |
|------|------|------|
| Xₙ 식별 | X₁~X₄, X_oc | ✅ |
| Lₙ 정의 | 18개 연산 enum | ✅ |
| W 정의 | W₁~W₈ (W₈ optional) | ✅ |
| Dₚ 설계 | `.devserver/` 격리 + state.db 스키마 | ✅ |
| Eq 식별 | Eq₁ (LLM client) | ✅ |
| L'ₙ 설계 | L'_wrapper 구현 완료 / L'_oc, L'_q 미정 | 일부 |
| So 설계 | 미정 | - |

MVP 진행 상태 (`HOMSA.md § 14.1`):

| MVP | 1cycle 정의 | 상태 |
|-----|------------|------|
| **MVP-0** | test input → X₂ → X_oc → X₃/X₄ → state.db | 진행 중 |
| **MVP-1** | X₁(Telegram) → 주기 → X₁(report) | 진행 중 |

현재 구현: X₁ ✅ · X_oc ✅ · X₂ ✅ · Eq₁ ✅ · X₃ ✅ · X₄ ✅

---

## 핵심 원칙

1. **ε 최소화**: 구성요소 간 커플링을 최소화. 각 요소는 독립적으로 교환 가능
2. **Lₙ에 대한 독립**: 프로젝트 코드(Lₙ)와 개발 서버(Dₚ)는 분리
3. **군 사이 FK 없음**: 모듈 간 id 참조만. 정합성은 So와 L'ₙ이 관리
4. **스케일 불변**: 프로젝트 1개든 N개든 동일한 패키지 구조 반복
5. **자체 DB는 직접, 남의 DB는 API로**: opencode.db 직접 조회 금지
6. **opencode 호출 ≠ LLM 호출**: 두 실행 채널은 근본적으로 다름. X_oc는 코딩 에이전트, Eq₁은 판단/분류/요약
7. **기본 호출은 queue 경유, direct 채널은 예외**: W₁/W₂/W₇은 queue를 통해 순서/이력을 보장하고, W₈은 실시간 응답용 운영 옵션으로 분리한다
8. **LLM 호출은 loop성 task chain**: 양방향 → 단방향 순차 변환, task chain이 판단 맥락 제공
9. **판단 기준 ≠ 판단 맥락**: 기준 = CLAUDE.md (Dₚ₁, 불변), 맥락 = task chain (summarizer 생성, task별). 기준은 이력에 의해 변하지 않음
10. **npm 패키지 배포**: 바이너리 번들링 불가(opencode는 Go 바이너리), Docker는 옵션
11. **테스트 운영 규칙**: 개발 중에는 관련 개별 테스트를 우선 실행하고, Phase 종료 직전에만 전체 `bun test`를 실행
12. **공용 유틸 우선**: 재시도/로깅 같은 횡단 관심사는 `.devserver/utils` 공용 함수로 통일하고, 모듈별 중복 구현을 금지

---

## Wrapper 현황 (60개 메서드, 구현 완료)

`.devserver/src/opencode-server-wrapper.ts`
- **HOMSA 위치**: W₂/W₃/W₈ (커플링) + L'_wrapper (보정 항)
- **커플링 역할**: Xₙ ↔ X_oc 간 통신 수행
- **보정 역할**: opencode 버전 변동을 흡수하여 나머지 S에 ε이 전파되지 않게 하는 경계층

| 분류 | 메서드 수 | 주요 메서드 |
|------|----------|------------|
| 실행 | 6 | run, prompt, promptAsync, promptJSON, waitForIdle, shell |
| 세션 | 17 | CRUD, abort, fork, share, summarize, revert, diff, todos |
| 메시지 | 3 | getMessages, getMessage, command |
| Permission | 3 | listPermissions, replyPermission, respondPermission |
| Question | 3 | listQuestions, replyQuestion, rejectQuestion |
| 이벤트 | 2 | subscribe, subscribeGlobal |
| 파일/검색 | 6 | searchText, searchFiles, searchSymbols, readFile, listFiles, getFileStatus |
| 설정 | 3 | getConfig, updateConfig, getProviders |
| Provider | 4 | listProviders, getProviderAuthMethods, OAuth authorize/callback |
| Auth | 1 | setAuth |
| Agent/Tool | 3 | listAgents, listToolIds, listTools |
| PTY | 5 | list, create, get, update, remove |
| MCP | 8 | status, add, connect, disconnect, auth 관련 |
| 기타 | 6 | health, dispose, LSP, formatter, commands, VCS, path, projects |

미구현 (15개): Part 조작(2), Global config(3), Worktree(4), Experimental(2), Skills/TUI/Project(4)

---

## Dₚ 사용 시나리오 (예시)

이 프로젝트의 결과물(Dₚ)을 사용하는 쪽의 구성 예시:

```
User (Telegram)
  ├── @bot-a → Project A의 Dₚ (opencode:4096 + dashboard:51234)
  ├── @bot-b → Project B의 Dₚ (opencode:4097 + dashboard:51235)
  └── @bot-c → Project C의 Dₚ (opencode:4098 + dashboard:51236)
```

각 Dₚ는 완전 격리. 프로젝트를 추가하면 Dₚ를 하나 더 생성할 뿐.
멀티 프로젝트 동시 기동은 Dₚ의 스케일 불변 속성에 의한 결과이지, 이 프로젝트의 목표가 아니다.

---

## 참고 문서

- `./context-contract.md` — HOMSA 기반 AGENTS 생성/갱신용 컨텍스트 계약
- `./HOMSA.md` — 프레임워크 기준 문서 (v1.2.1)
- `./HOMSA-META.md` — HOMSA 적용 메타 결정/맹점 기록
- `./phase_TODO.md` — phase 단위 상태/완료 조건
- `./temp_TODO.md` — 현재 실행 phase 작업/로그 문서
- `./operations.md` — 운영 상태/차단요인 기록
- `./SCHEMA.md` — queue/interaction 스키마 원칙
- `./api.md` — OpenCode HTTP API 레퍼런스
- `./isolation.md` — 격리 아키텍처 설명
- `./project-structure.md` — 디렉토리 구조 설명

---

## 관련 프로젝트

- **OpenCode**: https://github.com/anomalyco/opencode — 코딩 에이전트 CLI/서버
- **Dashboard**: 운영 환경에서 선택적으로 활성화되는 읽기 전용 모니터링 UI
- **HOMSA**: Hamiltonian Optimal Microservice Architecture — 아키텍처 프레임워크

---

## 참고: OpenCode 격리 관련 환경변수

| 환경변수 | 용도 | 격리 대상 |
|----------|------|-----------|
| `XDG_CONFIG_HOME` | config 디렉토리 | `opencode.json`, 글로벌 설정 |
| `XDG_DATA_HOME` | 데이터 디렉토리 | `auth.json`, `opencode.db`, 세션 스토리지 |
| `XDG_CACHE_HOME` | 캐시 디렉토리 | node_modules, 런타임 캐시 |
| `OPENCODE_CONFIG` | 커스텀 config 파일 경로 | 특정 config 파일 지정 |
| `OPENCODE_CONFIG_DIR` | 커스텀 config 디렉토리 | agents, commands, plugins 등 |

---

## 현재 런타임 상태

운영 상태 스냅샷은 별도 운영 문서로 관리한다.

- [`docs/operations.md`](/home/nova/project/homsa/.devserver/docs/operations.md)

---

*Created: 2026-02-25*
*Updated: 2026-03-06*
*HOMSA v1.2.1 기반*
*운영 상태는 docs/operations.md, 백로그는 phase_TODO.md + temp_TODO.md 기준으로 갱신*
