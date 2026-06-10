---
name: of1-branch-setup
description: Create the demo branch on the of1-demo repo, clear stale artifacts, and write the repo-config.json contract every downstream step reads.
user-invocable: false
---

# OF1 Branch Setup

**Run this exact command. Nothing else. Do NOT improvise the steps by hand.**

```bash
DOMAIN="${DOMAIN}" \
BRANCH="${BRANCH}" \
OF1_DEMO_REPO="${OF1_DEMO_REPO:-/workspace/of1-demo}" \
OF1_STATE_DIR="${OF1_STATE_DIR:-/shared/of1-demo}" \
DA_TOKEN="${DA_TOKEN:-$(oauth-token adobe 2>/dev/null || jq -r .access_token "$OF1_TOKEN_FILE" 2>/dev/null)}" \
BRANCH_MODE="${BRANCH_MODE:-fresh}" \
bash "${SKILL_DIR:-/workspace/skills/of1-branch-setup}/scripts/branch-setup.sh"
```

That's it. One command. The script handles everything: fetching, branch creation/reuse, clean slate, DA content cleanup, `repo-config.json`, `of1-endpoint.json`, commit + push.

Do NOT:
- Run git commands yourself instead of the script
- Clean files manually in a separate pass
- Write repo-config.json by hand
- Debug or inspect git status mid-way

## Inputs (set as env vars before running)

| Var | Required | Example |
|-----|----------|---------|
| `DOMAIN` | yes | `frescopa.coffee` |
| `BRANCH` | yes | `frescopa` (domain without TLD) |
| `BRANCH_MODE` | no | `fresh` (default) or `continue`. If the branch already exists: `fresh` auto-increments to `${BRANCH}-2`, `-3`, etc. `continue` reuses the existing branch. |

The orchestrator decides `BRANCH_MODE` based on user input (if the branch exists, ask the user whether to continue or start fresh).

## What the script does

1. **Gate:** checks `$OF1_STATE_DIR/setup.json` exists (step 1 must have run)
2. **Branch:** fetch + create or reuse (based on `BRANCH_MODE`)
3. **Clean slate:** removes demo artifacts only (NOT EDS boilerplate — `styles/styles.css`, `scripts/`, `blocks/{header,footer,fragment}/`, `head.html` are preserved)
4. **DA cleanup:** deletes all `.html` pages in the DA branch folder via admin.da.live API
5. **repo-config.json:** writes the downstream contract to `$OF1_STATE_DIR/`
6. **of1-endpoint.json:** writes the worker endpoint config, commits, pushes
7. **Status:** writes `$OF1_STATE_DIR/step-2-status.json`

## The downstream contract (`repo-config.json`)

Every downstream step reads this file. Required fields:

| Field | Type | Notes |
|---|---|---|
| `owner` | string | Always `aem-growth-adoption` |
| `repo` | string | Always `of1-demo` |
| `branch` | string | Demo branch name (may have suffix if fresh-start incremented) |
| `contentPrefix` | string | Same as `branch` |
| `repoDir` | string | Absolute path to the local clone |
| `domain` | string | The customer domain |

Optional (for humans): `repoUrl`, `previewUrl`, `daSource`.

Deprecated — do NOT write: `daMount`, `daContentPath`, `daApiBase`, `daListBase`. Worker-side schema in `of1-demo/knowledge/worker-config-schemas.md`.
