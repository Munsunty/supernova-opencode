# .devserver

This directory contains the Podman-based OpenCode runtime for this project.

## Commands

- Start dev server: `bun run dev`
- Build only: `bun run dev:build`
- Run only (uses existing image): `bun run dev:run`
- Start directly: `.devserver/dev-up.sh`
- Run doctor checks: `.devserver/dev-doctor.sh`
- Run smoke checks: `.devserver/dev-smoke.sh`
- Telegram ingress: 기본은 `poller` 모드 (`TELEGRAM_BOT_TOKEN` + `ALLOWED_USER_IDS`로 Telegram `getUpdates` 폴링)
- Telegram egress: X2 worker가 Telegram task source(`...#chat:<chatId>`)를 감지하면 `sendMessage`로 결과를 전송 (`OPENCODE_X1_BOT_TOKEN` 또는 `OPENCODE_X1_POLLER_TOKEN` 필요)
- Summarizer agents: `X2` 결과 요약은 `x2-summarizer`, `X4` 라우팅 요약 보강은 `x4-summarizer`를 기본 사용 (`X2_SUMMARIZER_AGENT`, `X4_SUMMARIZER_AGENT`로 제어)
- Telegram ingress tests: `bun run x1:receive` (수동 payload 적재), `bun run x1:webhook` (Webhook 전용 테스트)

`bun run dev` is a convenience entrypoint. Actual orchestration lives in `dev-up.sh`.

## Execution Location Rule

Scripts are location-independent. They resolve paths from the script directory (`.devserver`), not from current shell working directory.

- Default project root: parent of `.devserver` (`..`)
- Optional override: `X_OC_PROJECT_DIR`

Example:

```bash
/Users/raccoondog/project/supernova-opencode/.devserver/dev-up.sh
```

## Main Directories

- `config/`: runtime config (`XDG_CONFIG_HOME`)
- `data/`: auth, DB, logs (`XDG_DATA_HOME`)
- `cache/`: runtime cache (`XDG_CACHE_HOME`)
- `opencode/`: legacy seed location (fallback only)
- `agents/`: opencode agent prompt seeds (`spark`, `x2-summarizer`, `x4-summarizer`)
- `run-sync/`: seed files synced into runtime at container start
- `src/`: helper scripts and workers
- `docs/`: devserver operation docs

## Runtime Files

- `dockerfile`: image build definition
- `entrypoint.sh`: in-container process entrypoint
- `opencode.json`: template config (runtime allowlist is injected at start)
- `run-sync/oh-my-opencode.jsonc`: OmO seed config
- `agents/*.prompt.txt`: agent prompt seed files mounted to `/run/opencode-seed/agents/*`

## .env

Use `.env.example` as the source template.

- Eq1 provider keys/models
- Telegram polling mode (`OPENCODE_X1_MODE=poller`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, `POLLING_INTERVAL_MS`, ...)
- Summarizer agent names (`X2_SUMMARIZER_AGENT`, `X4_SUMMARIZER_AGENT`, `X_OC_PODMAN_X2_SUMMARIZER_AGENT`, `X_OC_PODMAN_X4_SUMMARIZER_AGENT`)
- Agent prompt seed overrides (`X_OC_PODMAN_SPARK_PROMPT_SOURCE_HOST`, `X_OC_PODMAN_X2_SUMMARIZER_PROMPT_SOURCE_HOST`, `X_OC_PODMAN_X4_SUMMARIZER_PROMPT_SOURCE_HOST`)
- ports and readiness/smoke timings
- `.devserver` masking and port-collision behavior
- optional doctor warning policies

Set `OPENCODE_SERVER_PASSWORD` only when your security policy requires it.
