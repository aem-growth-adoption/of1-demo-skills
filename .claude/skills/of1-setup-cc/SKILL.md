---
name: of1-setup-cc
description: Verify all OF1 demo pipeline dependencies are installed in Claude Code. Fails fast with explicit instructions if anything is missing — does NOT install anything (Claude Code can't activate mid-session installs).
---

# OF1 Setup — Claude Code Verifier

Run the verifier script. It checks all prerequisites and writes the resolved paths to `<stateDir>/setup-cc.json` on success.

```bash
bash <skill-dir>/scripts/verify.sh
```

On success: exit 0 + state file written. On any blocker: exit 1 with a per-check failure line. The orchestrator MUST stop on failure.

## What it checks

1. **OF1 step skills (13)** — `.claude/skills/of1-*/SKILL.md` discoverable in project or user scope
2. **Adobe EDS skills** — `stardust`, `snowflake`, `impeccable` installed as Claude Code plugins (`~/.claude/plugins/`). Matches inside the of1-demo content repo are deliberately **ignored** — that location is legacy/being removed
3. **Shell tools** — `node`, `python3`, `jq`, `git`, `curl`
4. **Browser automation** — `playwright-cli` (SLICC-native) preferred. If absent but `playwright` is installed, warns that the OF1 step skills use SLICC-specific `playwright-cli` subcommands (`visit`, `screenshot`, `snapshot`) and need a shim/adapter before discovery/extraction/prototype can run
5. **of1-demo content repo** — clone of `aem-growth-adoption/of1-demo`. Required via `OF1_DEMO_REPO` env var. **No auto-discovery** — if unset, the orchestrator asks the user where to clone it, runs `git clone`, then sets the var
6. **DA token** — resolved in this order:
   1. `$ADOBE_IMS_TOKEN` (raw token value, highest priority)
   2. `$OF1_TOKEN_FILE` (path to a token JSON file)
   3. `$PWD/.hlx/.da-token.json`
   4. `<of1Repo>/.hlx/.da-token.json`
   File shape: `{"access_token":"..."}`
7. **State dir** — writable; defaults to `$PWD/.of1/state`

## Env overrides

| Var | Default / Purpose |
|-----|-------------------|
| `OF1_DEMO_REPO` | **required** — absolute path to a local clone of `aem-growth-adoption/of1-demo` |
| `ADOBE_IMS_TOKEN` | raw token value; if set, takes precedence over token files |
| `OF1_TOKEN_FILE` | path to a token JSON file (alternative to the value-in-env approach) |
| `OF1_STATE_DIR` | default: `$PWD/.of1/state` |
| `STRICT` | `0` (default — warnings don't fail). Set `1` to treat warnings as errors |

## State file shape (written on success)

```json
{
  "ok": true,
  "stateDir": "...",
  "of1Repo": "...",
  "tokenFile": "...",
  "tokenSource": "project:.hlx | repo:.hlx | env:OF1_TOKEN_FILE",
  "playwrightCli": "...",
  "playwrightFallback": "...",
  "warnings": 0,
  "verifiedAt": "<iso8601>"
}
```

Downstream step Agents should read this file to learn `tokenFile`, `of1Repo`, and `stateDir` — do not hard-code defaults.

## Why this skill does not install anything

Claude Code can't activate plugins/skills installed mid-session — `/plugin install` and `/reload-plugins` only pick up disk changes between turns. So this skill is a **read-only verifier**. Missing items are reported with a specific fix command for the user to run (then restart Claude Code or `/reload-plugins`).
