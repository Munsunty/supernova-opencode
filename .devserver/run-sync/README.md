# run-sync

This directory stores runtime seed files that are injected into the container at boot.

## Files

- `auth.json` (optional, ignored): OpenCode auth seed
- `oh-my-opencode.jsonc`: OmO config seed

## Behavior

- `dev-up.sh` mounts these files read-only to `/run/opencode-seed/*` when `.devserver` masking is enabled.
- `entrypoint.sh` then syncs them into runtime paths:
  - auth: `/srv/opencode/data/opencode/auth.json`
  - OmO config: `/srv/opencode/config/oh-my-opencode.jsonc`

## Notes

- `auth.json` should not be committed.
- If `run-sync` seeds are missing, `dev-up.sh` supports legacy fallback locations.
