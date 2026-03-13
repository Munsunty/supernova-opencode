# temp_TODO.md (Archived)

Status: CLOSED (2026-03-03)
Close reason: Podman 안정화 스프린트(P0/P1) 완료 및 smoke PASS로 close-ready 충족

# temp_TODO.md

*Last Updated: 2026-03-02*

## 목적

- 기존 Feature Phase(4/5)는 잠시 pause.
- Podman 기반 개발환경을 "재현 가능 + 안정적 기동" 상태로 먼저 고정.

## 운영 규칙

- 포맷: `[우선순위][영역] 작업 설명`
- 우선순위: `P0`(즉시), `P1`(이번 안정화 스프린트), `P2`(후순위)
- 항목 상태는 체크박스(`[ ]`, `[x]`)로만 관리
- 장애 로그는 하단 `Run Log`에 매 실행마다 1줄 추가

## In Progress

- 없음 (2026-03-02 smoke PASS, close-ready)

## Next

- [ ] [P2][Ops] readiness 이벤트를 metrics_events에 저장(가시성 강화)

## Backlog

- [ ] [P2][Ops] smoke 테스트를 CI job으로 분리
- [ ] [P2][Ops] `dev:doctor`에서 `gvproxy` 포트 점유 경고 레벨 정책 정리

## Done

- [x] [P0][Decision] Feature phase pause, Podman 안정화 우선으로 전환
- [x] [P0][Podman] `dev-up.sh` 사전 진단 추가 (`podman info`, `podman machine inspect`, socket 체크 fail-fast)
- [x] [P0][Startup] 컨테이너 기동 후 readiness gate 추가 (opencode health + dashboard proxy + worker)
- [x] [P0][Recovery] readiness 실패 시 자동 teardown + 원인 요약 로그 출력
- [x] [P0][Ports] 포트 충돌 처리 개선 (기본 fail-fast, 선택적 force-kill)
- [x] [P0][Env] 필수/권장 env 검증 경고 구조화 (server auth env, provider key(optional), .env)
- [x] [P0][Entrypoint] 하드코딩 축소 (plugin/health path/readiness host/dashboard 실행 값 env 오버라이드)
- [x] [P0][Entrypoint] proxy inline 코드 분리 (`src/scripts/dashboard-proxy.ts`)
- [x] [P0][Config] workspace 경로 기반 runtime permission config 자동생성 연결
- [x] [P0][Volumes] 프로젝트 스코프 volume naming 규칙 도입 (멀티 프로젝트 충돌 방지)
- [x] [P1][Ops] `bun run dev:doctor` (사전 점검) 추가
- [x] [P1][Ops] `bun run dev:smoke` (기동→health 확인→정리) 추가
- [x] [P1][Validation] 사용자 실행 `bun run dev:smoke` PASS (readiness 확인 완료)
- [x] [P1][Docs] `.devserver/docs`에 Podman 트러블슈팅 섹션 추가
- [x] [P1][Phase] `docs/PHASE_STATUS.md`에 `blocked(infra)` 상태 반영
- [x] [P1][Doctor] `dev:doctor` 최신화 (.env 로드 + provider key 체크 optional 기본 비활성)
- [x] [P1][Tests] `.devserver/dev_code/test` 전체 통과 (77 pass)
- [x] [P2][Ops] dev-up/entrypoint 주요 env 변수 표 정리 (포트 분리/노출 정책 포함)
- [x] [P1][Auth] 컨테이너 시작 시 auth seed(`.devserver/opencode/auth.json`) 자동 동기화 추가
- [x] [P1][OmO] `.devserver/oh-my-opencode.jsonc`를 runtime config dir로 자동 동기화 추가
- [x] [P1][Workspace] `podman run -w /workspace/project`로 기본 working dir 고정
- [x] [P1][Dashboard] dashboard project auto-add 연결 (SQLite project list 초기화 대응)
- [x] [P1][Mount] `.devserver` 경로 named volume 마스킹 + seed 파일 read-only 개별 마운트 적용
- [x] [P1][Security] `.devserver/.gitignore`에 `opencode/auth*.json` 추가 (자격증명 커밋 방지)
- [x] [P1][Ops] `.devserver` 마스킹(named volume) + dashboard auto-add 회귀 확인 (`bun run dev:smoke` PASS)
- [x] [P1][Phase] 인프라 차단 해제 판단 완료(`doctor/smoke` PASS) + 문서 상태 동기화

## Run Log

- 2026-02-28: init - temp TODO 생성, Podman 안정화 스프린트 시작
- 2026-02-28: P0-1,2 적용 - preflight + startup readiness gate + 실패 시 자동 teardown 구현
- 2026-02-28: P0-3,4 적용 - 포트 정책 개선 + env 경고 + entrypoint 하드코딩 env화
- 2026-02-28: P0-5 적용 - 프로젝트 스코프/해시 기반 volume 이름 및 기본 컨테이너명 분리
- 2026-02-28: P1-ops 적용 - dev:doctor/dev:smoke 스크립트 추가 및 package.json 연결
- 2026-02-28: P1-doc 적용 - troubleshooting 문서 추가 + PHASE_STATUS blocked(infra) 반영
- 2026-02-28: hardcode 개선 - config 템플릿 파일화 + dashboard proxy inline 제거
- 2026-02-28: config 개선 - entrypoint에서 generate-opencode-config 기반 runtime config 생성 연결
- 2026-02-28: user-run smoke PASS 확인 - opencode/dashboard readiness 정상
- 2026-02-28: doctor 최신화 - .env load + provider key check optional(기본 off)
- 2026-02-28: test 안정화 - wrapper/prompt fallback + monitor log parser 보정 후 77 tests PASS
- 2026-02-28: regression 확인 - doctor 최신화 이후 dev:smoke 재실행 PASS
- 2026-03-01: auth/OmO seed sync 추가 - 컨테이너 시작 시 `.devserver` 기반 auth/oh-my-opencode 설정 자동 반영
- 2026-03-01: dashboard 개선 - project auto-add 연결로 "프로젝트 열기" 빈 목록 이슈 완화
- 2026-03-01: workspace 고정 - `-w /workspace/project` 적용으로 opencode 기본 working dir 정렬
- 2026-03-02: `.devserver` 마운트 정책 전환 - named volume 마스킹 + seed 파일 별도 read-only 마운트 적용
- 2026-03-02: 보안 보강 - `.devserver/.gitignore`에 `opencode/auth*.json` 추가
- 2026-03-02: `bun run dev:smoke` PASS - doctor PASS + readiness(opencode/dashboard) 확인, temp TODO close-ready
