# .devserver

This directory contains the Podman-based OpenCode runtime for this project.

## Commands

- Start dev server: `bun run dev`
- Build only: `bun run dev:build`
- Run only (uses existing image): `bun run dev:run`
- Start directly: `.devserver/dev-up.sh`
- Run doctor checks: `.devserver/dev-doctor.sh`
- Run smoke checks: `.devserver/dev-smoke.sh`

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
- `run-sync/`: seed files synced into runtime at container start
- `src/`: helper scripts and workers
- `docs/`: devserver operation docs

## Runtime Files

- `dockerfile`: image build definition
- `entrypoint.sh`: in-container process entrypoint
- `opencode.json`: template config (runtime allowlist is injected at start)
- `run-sync/oh-my-opencode.jsonc`: OmO seed config

## .env

Use `.env.example` as the source template.

- Eq1 provider keys/models
- ports and readiness/smoke timings
- `.devserver` masking and port-collision behavior
- optional doctor warning policies

Set `OPENCODE_SERVER_PASSWORD` only when your security policy requires it.
