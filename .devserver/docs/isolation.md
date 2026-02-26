# XDG 격리 아키텍처

## 개요

이 프로젝트는 XDG Base Directory 표준을 사용하여 OpenCode 환경을 프로젝트 단위로 완전 격리한다. python의 venv와 동일한 수준의 환경 격리를 `.devserver/` 폴더 하나에 달성한다.

## 격리 메커니즘

```
글로벌 (기본)                    프로젝트 로컬 (격리)
─────────────────────────────    ─────────────────────────────────────
~/.config/opencode/         →    .devserver/config/opencode/
~/.local/share/opencode/    →    .devserver/data/opencode/
~/.cache/opencode/          →    .devserver/cache/opencode/
opencode.json (프로젝트 루트) →    .devserver/opencode.json
.opencode/ (프로젝트 루트)    →    .devserver/oh-my-opencode.jsonc
```

`dev-up.sh`가 환경변수 5개를 `.devserver/` 내부 경로로 설정하여, OpenCode가 참조하는 모든 경로가 이 폴더 안으로 수렴한다.

## 환경변수

| 환경변수 | 격리 값 | 격리 대상 |
|----------|---------|-----------|
| `XDG_CONFIG_HOME` | `.devserver/config` | 플러그인 런타임 설정 |
| `XDG_DATA_HOME` | `.devserver/data` | auth.json, opencode.db, 세션, 로그 |
| `XDG_CACHE_HOME` | `.devserver/cache` | OmO 플러그인 캐시 |
| `OPENCODE_CONFIG` | `.devserver/opencode.json` | 메인 config 파일 |
| `OPENCODE_CONFIG_DIR` | `.devserver/` | oh-my-opencode.jsonc 등 부가 설정 |

### 추가 환경변수 (선택)

| 환경변수 | 용도 |
|----------|------|
| `OPENCODE_CONFIG_CONTENT` | 인라인 config (최종 오버라이드) |
| `OPENCODE_SERVER_PASSWORD` | 서버 비밀번호 (미설정 시 unsecured 경고) |

## 격리 범위

### 격리되는 것 (전부 .devserver/ 안)

- **설정**: `opencode.json`, `oh-my-opencode.jsonc`
- **인증**: `data/opencode/auth.json`
- **데이터베이스**: `data/opencode/opencode.db` (세션, 메시지, 도구 호출)
- **로그**: `data/opencode/log/`
- **캐시**: `cache/opencode/`
- **OmO 플러그인 런타임**: `config/opencode/node_modules/`
- **바이너리**: `node_modules/.bin/opencode` (루트에 로컬 설치)

### 격리되지 않는 것

- **bun 런타임**: 시스템 공유 (`~/.bun/bin/bun`)
- **OS 수준 도구**: git, node 등

## 검증된 격리 결과

```
글로벌 DB:  ~/.local/share/opencode/opencode.db         (49MB, 세션 100개)
로컬 DB:   .devserver/data/opencode/opencode.db          (4KB, 세션 0개)
```

글로벌과 로컬이 완전히 분리됨. 로컬 서버에서 생성/수정한 세션은 글로벌 DB에 영향을 주지 않는다.

## 다중 프로젝트 격리

```
/project-a/.devserver/data/opencode/opencode.db  ← Project A 전용 (port 4996)
/project-b/.devserver/data/opencode/opencode.db  ← Project B 전용 (port 4997)
/project-c/.devserver/data/opencode/opencode.db  ← Project C 전용 (port 4998)
```

각 프로젝트가 `.devserver/` 안에 자체 DB, 인증, 설정을 가지므로 포트만 다르게 하면 동시 실행 가능.
