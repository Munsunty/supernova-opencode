# Operations Log

*Last Updated: 2026-03-03*

## 운영 상태

현재 운영 상태 갱신 기준:
- `.devserver/dev-doctor.sh`
- `.devserver/package.json`
- `GET /global/health` (OpenCode health endpoint)

| 항목 | 상태 |
|------|------|
| Podman doctor | PASS (`failures=0`, `warnings=4`) |
| OpenCode 서버 | 가동 중 (`127.0.0.1:4996`, healthy, v1.2.15) |
| Dashboard 포트 | `51234` 사용 중 |
| Dashboard internal 포트 | `51235` 사용 중 |
| 런타임 패키지(설정 기준) | `opencode-ai:^1.2.15`, `@opencode-ai/plugin:1.2.15`, `@opencode-ai/sdk:^1.2.15`, `oh-my-opencode:^3.10.0` |
| 보안 주의 | `OPENCODE_SERVER_PASSWORD` 미설정 (doctor 경고) |
| `.devserver/**` 접근 제한 | `opencode.json` permission에서 deny 설정 유지 |

## Phase 운영 메모

- `phase_TODO.md`의 `Previous`/`Present`/`Next`로 phase 단위 상태를 관리한다.
- 세션/DB 세부값은 동적 값으로 간주하고, 필요 시 API/DB 시점 조회를 우선한다.
- 운영 상태/백로그 변경은 `phase_TODO.md` + `temp_TODO.md` 규칙에 따라 갱신한다.

## 기록 규칙

- 장애/차단 요인/상태 로그는 운영 문서(`operations.md`)에서 관리한다.
- `phase_TODO.md`는 백로그/진행 상태 중심으로 유지한다.
