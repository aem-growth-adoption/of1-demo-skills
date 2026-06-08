---
name: of1-setup
description: Verify all OF1 demo pipeline dependencies are installed. Read-only — reports what's missing, does not install.
---

# OF1 Setup — Verify Dependencies

Read-only verifier. Reports any missing prerequisite and, on success, writes resolved paths to `$OF1_STATE_DIR/setup.json` for downstream steps.

```bash
bash "$SKILL_DIR/scripts/verify.sh"
```

Exit `0` on success, `1` on any blocker (one `✗ <reason>` line per failure). The orchestrator MUST stop on failure — every subsequent step assumes everything below is in place.

## What it checks

1. The 13 OF1 step skills are installed (`of1-discovery`, `of1-snowflake`, …)
2. The Adobe EDS skills `stardust`, `snowflake`, `impeccable` are installed
3. Shell tools: `node`, `python3`, `jq`, `git`, `curl`
4. `playwright-cli` (or the standard `playwright` binary with a shim warning)
5. The `of1-demo` content repo is a valid clone at `$OF1_DEMO_REPO`
6. An Adobe IMS / DA token is resolvable
7. `$OF1_STATE_DIR` is writable

## Env vars — the orchestrator sets these before invoking

| Var | Purpose |
|-----|---------|
| `OF1_DEMO_REPO` | **required** — absolute path to a local clone of `aem-growth-adoption/of1-demo` |
| `OF1_STATE_DIR` | shared IPC + state dir. SLICC: `/shared/of1-demo`. CC: `$PWD/.of1/state` (default). |
| `ADOBE_IMS_TOKEN` | raw token value (preferred — highest priority) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (alternative to the env value) |
| `STRICT` | `1` makes warnings fail. Default `0`. |
| `OF1_RUNTIME` | `cc` or `slicc`. Optional — the verifier auto-detects from its install path (`/workspace/skills/*` → slicc, else cc). Orchestrators may set explicitly so fix messages cite only the relevant install command. |

Token resolution order: `$ADOBE_IMS_TOKEN` → `$OF1_TOKEN_FILE` → `$PWD/.hlx/.da-token.json` → `$OF1_DEMO_REPO/.hlx/.da-token.json`.

## State files written

| File | Purpose |
|------|---------|
| `$OF1_STATE_DIR/setup.json` | resolved paths + token source. Downstream steps MUST read this for `tokenFile`, `of1Repo`, `stateDir` — do not hard-code defaults. |
| `$OF1_STATE_DIR/step-1-status.json` | `{"step":1,"status":"done"\|"failed",…}`. SLICC's sprinkle polls it; CC ignores it. |

## Why this skill does not install anything

Neither runtime can activate plugins/skills installed mid-session — CC's `/plugin install` only picks up disk changes between turns, and SLICC's `upskill --force` has the same limitation. So this is a pure read-only verifier: missing items are reported with the exact fix command (per runtime) the user runs before re-invoking the pipeline.
