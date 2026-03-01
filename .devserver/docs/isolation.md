# XDG + Permission 격리 아키텍처

*Last Updated: 2026-03-02*  
*Source of truth: `.devserver/dev-up.sh`, `.devserver/entrypoint.sh`, `.devserver/dockerfile`, runtime logs*

## 개요

이 프로젝트는 Podman 기반으로 OpenCode/OmO 런타임을 프로젝트 단위로 격리한다.  
핵심 목표는 **"프로젝트 경로만 주면 독립된 Dₚ가 재현 가능하게 기동"**이며, 최근 변경으로 `.devserver` 오염 방지(마스킹)까지 기본 정책으로 포함한다.

## 격리 메커니즘

### 경로/스토리지 매핑

```
글로벌 기본 경로                  Podman 런타임 경로                     저장 백엔드
─────────────────────────────    ────────────────────────────────────    ───────────────────────────────
~/.config/opencode/         →    /srv/opencode/config                  → named volume (VOLUME_CONFIG)
~/.local/share/opencode/    →    /srv/opencode/data                    → named volume (VOLUME_DATA)
~/.cache/opencode/          →    /srv/opencode/cache                   → named volume (VOLUME_CACHE)
opencode.json               →    /srv/opencode/config/opencode.json    → 시작 시 생성 (template+generator)
oh-my-opencode config       →    /srv/opencode/config/oh-my-opencode.jsonc
                               (seed import)                           → `.devserver/oh-my-opencode.jsonc` read-only seed
auth.json                   →    /srv/opencode/data/opencode/auth.json
                               (seed import)                           → `.devserver/opencode/auth.json` read-only seed
```

### 워크스페이스 마운트 정책

- 프로젝트 루트는 `/workspace/project`로 bind mount한다.
- 컨테이너 기본 작업 경로는 `-w /workspace/project`로 고정한다.
- 기본값 `X_OC_PODMAN_EXCLUDE_DEVSERVER=1`에서 `/workspace/project/.devserver`는 named volume으로 마스킹된다.
  - 목적: 컨테이너 내부 `.devserver` 쓰기가 호스트 `.devserver`에 반영되지 않게 차단
  - 참고: 디렉터리 엔트리(`.devserver`) 자체는 루트 마운트 구조상 보일 수 있다.

## Runtime Permission 샌드박스

- 생성 파일: `/srv/opencode/config/opencode.json` (컨테이너 내부)
- 기준 경로: `/workspace/project` (entrypoint에서 generator 실행 시 주입)
- 정책:
  - `external_directory` deny-by-default, `/workspace/project/**`만 allow
  - `read/edit/glob/grep/list`도 `/workspace/project/**`만 allow
  - `/workspace/project/.devserver/**`는 별도 deny
  - `bash`는 기본 `ask`
- 템플릿/생성기:
  - 템플릿: `/opt/opencode/opencode.template.json` (`.devserver/opencode.json` 기반)
  - 생성기: `/opt/opencode/src/scripts/generate-opencode-config.ts`

## 선택 OS 샌드박스 (Linux only)

- `X_OC_USE_BWRAP=1`일 때 Linux + bwrap 환경에서만 활성화
- macOS/Windows는 permission sandbox + Podman 격리 정책으로 운영

## 주요 환경변수

### 오케스트레이션(`dev-up.sh`)

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `X_OC_PODMAN_EXCLUDE_DEVSERVER` | `1` | `/workspace/project/.devserver` 마스킹 활성화 |
| `X_OC_PODMAN_DEVSERVER_MASK_VOLUME` | `${VOLUME_PREFIX}_devserver_mask` | `.devserver` 마스크용 named volume |
| `X_OC_PODMAN_AUTH_IMPORT_MODE` | `always` | auth seed import 모드(`always/if-missing/off`) |
| `X_OC_PODMAN_OMO_CONFIG_IMPORT_MODE` | `always` | OmO config seed import 모드(`always/if-missing/off`) |
| `X_OC_PODMAN_FORCE_KILL_PORTS` | `0` | 포트 충돌 시 자동 kill 여부 |

### 런타임(`dockerfile`/`entrypoint.sh`)

| 환경변수 | 런타임 값 | 설명 |
|----------|-----------|------|
| `XDG_CONFIG_HOME` | `/srv/opencode/config` | OpenCode/OmO 설정 |
| `XDG_DATA_HOME` | `/srv/opencode/data` | auth/DB/로그/스토리지 |
| `XDG_CACHE_HOME` | `/srv/opencode/cache` | 캐시/임시 데이터 |
| `OPENCODE_CONFIG_DIR` | `/srv/opencode/config` | OmO 포함 보조 설정 루트 |
| `OPENCODE_CONFIG` | `/srv/opencode/config/opencode.json` | runtime permission config |
| `OPENCODE_SERVER_PASSWORD` | unset(default) | 설정 시 서버 접근 보호 |

## 격리 범위

### 격리되는 항목

- OpenCode/OmO 런타임 설정/데이터/캐시 (`/srv/opencode/{config,data,cache}` named volumes)
- runtime auth 파일 (`/srv/opencode/data/opencode/auth.json`)
- runtime config (`/srv/opencode/config/opencode.json`, `/srv/opencode/config/oh-my-opencode.jsonc`)
- 워크스페이스 내 `.devserver` 쓰기 경로(마스크 volume로 분리)

### 부분 공유 항목

- `/workspace/project` 소스 트리 전체(코드 변경 반영 목적)
- seed 파일 2종(`auth.json`, `oh-my-opencode.jsonc`)은 read-only mount 후 런타임 경로로 동기화

### 격리되지 않는 항목

- 시스템 bun/node/git 실행파일 자체
- OS 전역 네트워크 자원(기본 설정)
- 호스트 파일시스템 자체 (Linux bwrap 미사용 시)
- `dev-up.sh`에서 띄우는 대시보드/X₂ 워커 프로세스의 네트워크 부하 자체

## 최근 검증 (2026-03-02)

- `bun run dev:doctor` PASS
- `bun run dev:smoke` PASS
  - opencode readiness PASS
  - dashboard readiness PASS
- `.devserver` 마스킹 적용 시 컨테이너 내부 `.devserver` 목록이 host 원본과 분리됨 확인

## 멀티 프로젝트 동시 구동

프로젝트별 `project-scope + project-hash` 기반 volume prefix를 사용한다.

예시:
- `homsa_opencode_<scopeA>_<hashA>_config/data/cache/devserver_mask`
- `homsa_opencode_<scopeB>_<hashB>_config/data/cache/devserver_mask`

따라서 포트만 분리하면 프로젝트 간 런타임 상태 충돌 없이 동시 구동 가능하다.
