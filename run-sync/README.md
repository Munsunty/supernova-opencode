# run-sync

This directory stores runtime seed files that are injected into the container at boot.

## Files

- `opencode.json`: OpenCode runtime config seed
- `auth.json` (optional, ignored): OpenCode auth seed
- Agent prompt seeds are sourced from `.devserver/agents/*.prompt.txt` by default:
  - `spark.prompt.txt`
  - `genesis.prompt.txt`
  - `moses.prompt.txt`
  - `joshua.prompt.txt`
  - `bezalel.prompt.txt`
  - `oholiab.prompt.txt`
  - `aaron.prompt.txt`
  - `caleb.prompt.txt`
  - `eq1-core.prompt.txt`
  - `x2-summarizer.prompt.txt`
  - `x4-summarizer.prompt.txt`
  - mount target: `/run/opencode-seed/agents/*.prompt.txt`

## Behavior

- `dev-up.sh` mounts run-sync seeds and agent prompt seeds read-only to `/run/opencode-seed/*` when `.devserver` masking is enabled.
- `entrypoint.sh` then syncs them into runtime paths:
  - opencode config: `/srv/opencode/config/opencode.json`
  - auth: `/srv/opencode/data/opencode/auth.json`
  - prompts: `/run/opencode-seed/agents/*.prompt.txt` (container prompt source)

## Prompt Source Overrides

- `X_OC_PODMAN_SPARK_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_GENESIS_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_MOSES_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_JOSHUA_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_BEZALEL_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_OHOLIAB_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_AARON_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_CALEB_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_EQ1_CORE_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_X2_SUMMARIZER_PROMPT_SOURCE_HOST`
- `X_OC_PODMAN_X4_SUMMARIZER_PROMPT_SOURCE_HOST`

## Notes

- `auth.json` should not be committed.
- If `run-sync` seeds are missing, `dev-up.sh` supports legacy fallback locations.
