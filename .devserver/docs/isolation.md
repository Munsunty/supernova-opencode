# XDG 격리 아키텍처 (Phase 3 완료 기준)

*Last Updated: 2026-02-26*  
*Source of truth: `.devserver/dev-up.sh`, runtime paths, git history*

## 개요

이 프로젝트는 XDG Base Directory 표준을 사용해 OpenCode/OmO 런타임을 프로젝트 단위로 격리한다.  
핵심 목표는 **"프로젝트 경로만 주면 독립된 Dₚ가 기동"**이며, Phase 1~3 구현은 이 가정을 유지한다.

## 격리 메커니즘

```
글로벌 기본 경로                  프로젝트 로컬 격리 경로
─────────────────────────────    ─────────────────────────────────────
~/.config/opencode/         →    .devserver/config/opencode/
~/.local/share/opencode/    →    .devserver/data/opencode/
~/.cache/opencode/          →    .devserver/cache/opencode/
opencode.json               →    .devserver/opencode.json
.opencode/*                 →    .devserver/oh-my-opencode.jsonc
```

`dev-up.sh`는 아래 5개 환경변수를 강제로 설정해 참조 경로를 `.devserver/`로 수렴시킨다.

## 환경변수

| 환경변수 | 격리 값 | 설명 |
|----------|---------|------|
| `XDG_CONFIG_HOME` | `.devserver/config` | OpenCode/플러그인 런타임 설정 |
| `XDG_DATA_HOME` | `.devserver/data` | auth, DB, 로그, 세션 스토리지 |
| `XDG_CACHE_HOME` | `.devserver/cache` | 캐시/임시 데이터 |
| `OPENCODE_CONFIG` | `.devserver/opencode.json` | OpenCode 메인 config 지정 |
| `OPENCODE_CONFIG_DIR` | `.devserver/` | OmO 포함 보조 설정 파일 루트 |

### 선택 환경변수

| 환경변수 | 용도 |
|----------|------|
| `OPENCODE_CONFIG_CONTENT` | 인라인 설정 주입(최종 오버라이드) |
| `OPENCODE_SERVER_PASSWORD` | 서버 접근 보호 |

## 격리 범위

### 격리되는 항목

- **설정 계층**: `opencode.json`, `oh-my-opencode.jsonc`
- **OpenCode 런타임 데이터**: `.devserver/data/opencode/**`
  - `auth.json`
  - `opencode.db`
  - `log/`, `storage/`
- **시스템 상태 데이터(Dₚ₁)**: `.devserver/data/state.db`
- **플러그인/캐시**: `.devserver/config/opencode/**`, `.devserver/cache/opencode/**`
- **서버 실행 바이너리(로컬 설치분)**: `.devserver/node_modules/.bin/opencode`

### 격리되지 않는 항목

- 시스템 bun/node/git 실행파일
- OS 전역 네트워크/프로세스 자원

## Phase 3까지 검증된 영향

- Phase 2(X₂): task queue 실행 결과가 `.devserver/data/state.db`에 저장됨
- Phase 3(Eq₁): LLM 호출 결과(`tasks.result`, `schema_version`, `request_hash`)가 동일 격리 DB에 누적됨
- 따라서 실행/판단 이력이 프로젝트별 DB에 독립 저장됨(글로벌 OpenCode 데이터와 분리)

## 멀티 프로젝트 동시 구동

```
/project-a/.devserver/data/opencode/opencode.db  ← Project A
/project-b/.devserver/data/opencode/opencode.db  ← Project B
/project-c/.devserver/data/opencode/opencode.db  ← Project C
```

프로젝트별 `.devserver/`를 독립적으로 유지하고 포트만 분리하면 동시 실행 가능하다.
