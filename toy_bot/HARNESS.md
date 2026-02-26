# toy_bot Harness

## 목적
- toy_bot은 **Telegram bot 테스트 구현체**를 만들어 X_oc 결과물 패턴을 실측하고 X4 보정 기준을 만든다.
- 이 구현은 운영용 X1이 아니라 실측용 harness다.

## 작업 경계
- 모든 생성/수정은 `toy_bot/` 내부에서만 수행한다.
- `.devserver/**` 경로는 읽기/수정/탐색하지 않는다.
- 루트의 기존 서비스 코드와 설정은 변경하지 않는다.

## 구현 대상 (명시)
- Telegram polling 기반 toy bot을 구현한다.
- 최소 기능:
  - `/start` 응답
  - 텍스트 입력 1건을 받아 X_oc 요청용 payload로 기록
  - 처리 결과를 `toy_bot/artifacts/`에 로그로 남김
- 비밀키는 `.env`로만 주입하고 코드/문서에 하드코딩하지 않는다.
  - TELEGRAM_BOT_TOKEN 
  - ALLOWED_USER_IDS

## 1차 실측 목표
- Bun + TypeScript 기반의 최소 실행 가능한 Telegram toy bot을 만든다.
- 아래 3가지 케이스를 각각 1회 이상 재현해 산출물을 남긴다.
  - success path
  - failed path
  - retry/재시도 path(모의 가능)

## 산출물
- `toy_bot/src/**`: toy 프로그램 코드
- `toy_bot/test/**`: 케이스 검증 테스트
- `toy_bot/artifacts/**`: 실행 로그/요약
- `toy_bot/REPORT.md`: status, duration, backlog(관측 시점 값) 기록

## 완료 조건
- 변경 파일이 `toy_bot/` 내부로 제한된다.
- 실행 명령과 테스트 명령이 `toy_bot/` 기준으로 재현 가능하다.
- 다음 루프에서 사용할 TODO 3개를 `toy_bot/REPORT.md`에 남긴다.
