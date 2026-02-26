# 프로젝트 디렉토리 구조

```
opencode-supernova/
├── package.json               ← npm 의존성 (opencode-ai, oh-my-opencode, @opencode-ai/sdk)
├── bun.lock
├── .gitignore
├── CLAUDE.md                  ← 프로젝트 정의 문서
├── HOMSA.md                   ← 아키텍처 프레임워크 문서
│
├── .devserver/                ← Dₚ 전부 여기 (격리 환경 일체)
│   ├── dev-up.sh              ← 격리 환경 기동 스크립트
│   ├── opencode.json          ← OpenCode 메인 설정
│   ├── oh-my-opencode.jsonc   ← OmO 플러그인 설정 (에이전트, 카테고리)
│   ├── config/opencode/       ← XDG_CONFIG_HOME (런타임 자동 생성)
│   ├── data/opencode/         ← XDG_DATA_HOME
│   │   ├── auth.json          ← 인증 정보 (OAuth 토큰)
│   │   ├── opencode.db        ← 세션/메시지 DB (SQLite)
│   │   ├── log/               ← 실행 로그
│   │   └── bin/               ← 런타임 바이너리
│   └── cache/opencode/        ← XDG_CACHE_HOME
│
├── node_modules/              ← 의존성 (로컬 설치)
│   └── .bin/opencode          ← 로컬 OpenCode 바이너리
│
└── docs/                      ← 프로젝트 문서
```

---

## 루트 파일

### package.json

bun으로 관리하는 npm 의존성. 핵심 패키지:
- `opencode-ai` — OpenCode 바이너리 + 코어
- `oh-my-opencode` — OmO 미들웨어 플러그인
- `@opencode-ai/sdk` — OpenCode HTTP API 클라이언트

### CLAUDE.md

프로젝트 목표, HOMSA 위치 정의, 아키텍처 결정사항, 패키지 구성, 작업 우선순위를 담은 프로젝트 정의 문서.

### HOMSA.md

Hamiltonian Optimal Microservice Architecture 프레임워크 전체 문서. 시스템 설계의 수학적 기반.

---

## .devserver/

**격리 환경의 모든 것이 이 폴더 안에 있다.** 설정, 데이터, 캐시, 기동 스크립트 전부 포함.

### dev-up.sh

격리 환경 기동 스크립트. XDG 환경변수와 `OPENCODE_CONFIG`를 `.devserver/` 내부 경로로 설정한 뒤 `opencode serve`를 실행한다.

```bash
.devserver/dev-up.sh
# → http://127.0.0.1:4996 에서 OpenCode 서버 기동
```

### opencode.json

OpenCode 메인 설정. `OPENCODE_CONFIG` 환경변수로 이 파일을 직접 지정한다.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-opencode@latest"],
  "server": { "port": 4996, "hostname": "127.0.0.1" }
}
```

설정 가능 항목: 모델, 에이전트, 도구 권한, 서버, MCP, 플러그인, 포매터, 커맨드 등.

### oh-my-opencode.jsonc

OmO 플러그인 설정. `OPENCODE_CONFIG_DIR`로 이 디렉토리를 지정하여 OpenCode가 읽는다.

- **agents**: Sisyphus(오케스트레이터), Hephaestus(코딩), Oracle(분석) 등 에이전트별 모델
- **categories**: ultrabrain, deep, quick 등 작업 복잡도별 모델 매핑

### config/opencode/ (XDG_CONFIG_HOME)

`XDG_CONFIG_HOME`으로 지정되는 디렉토리. OmO 플러그인이 런타임에 `package.json`, `node_modules/`를 자동 생성한다. 직접 수정할 필요 없음.

### data/opencode/ (XDG_DATA_HOME)

`XDG_DATA_HOME`으로 지정되는 디렉토리. 런타임 데이터 전부 여기에 저장.

| 파일 | 설명 |
|------|------|
| `auth.json` | OAuth 인증 토큰. 글로벌에서 복사하여 격리 달성 |
| `opencode.db` | SQLite DB — 세션, 메시지, 도구 호출 기록 |
| `log/` | serve 실행 로그 (타임스탬프 기반 파일명) |
| `bin/` | 런타임 보조 바이너리 |

### cache/opencode/ (XDG_CACHE_HOME)

`XDG_CACHE_HOME`으로 지정되는 디렉토리. OmO 플러그인 캐시, 임시 파일. 삭제해도 재생성됨.

---

## node_modules/

bun으로 설치한 의존성. `.bin/opencode`가 로컬 OpenCode 바이너리이며, 글로벌 `~/.opencode/bin/opencode`와 독립적으로 동작한다.
