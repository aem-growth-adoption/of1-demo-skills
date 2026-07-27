# Repo Setup: cwd verification instead of clone/create

## Problem

`of1-repo-setup` currently starts by asking the user for a repo URL (bring
your own) or org+name (create new from boilerplate), then clones/creates and
manages branch creation with a `BRANCH_MODE` (`fresh`/`continue`) env var that
auto-increments branch names on collision.

In practice, the skill is always run from inside an already-checked-out EDS
repo. The clone/create flow, branch creation/suffix logic, and `BRANCH_MODE`
are unnecessary ceremony that also silently destroys in-progress demo work
when re-run (unconditional clean-slate wipe + DA content deletion).

## Goals

- Verify cwd is a valid EDS project instead of asking for a repo URL or
  creating a new repo.
- Detect whether a demo is already in progress (`repo-config.json` exists in
  `$OF1_STATE_DIR`) and, if so, show its status and ask the user to continue
  or restart — instead of silently wiping artifacts.
- Never destroy existing demo artifacts/DA content on "continue".
- Remove branch creation/checkout logic and `BRANCH_MODE` entirely — use
  whatever branch is currently checked out.

## Non-goals

- No change to downstream skills. All of them only read fields from
  `repo-config.json` (`owner`, `repo`, `branch`, `contentPrefix`, `repoDir`,
  `domain`, optionally `repoUrl`/`previewUrl`/`daSource`) — confirmed via
  grep across `skills/*/SKILL.md`. Field shapes are unchanged, so no
  downstream skill needs edits.
- No change to `.hlxignore` fix or `of1-endpoint.json` writing — kept as-is.

## Design

### 1. Entry — no repo URL / create-new questions

Remove Q1 ("existing repo or create new"), Q2 (org), Q3 (repo name) and Path B
(create repo from `adobe/aem-boilerplate` template, install Code Sync)
entirely. The skill assumes it is running inside an already-cloned EDS repo
at cwd (or `$OF1_DEMO_REPO` if the orchestrator sets it).

`OWNER`/`REPO` are derived from the git remote instead of being asked:

```bash
REMOTE_URL=$(git config --get remote.origin.url)
OWNER=$(echo "$REMOTE_URL" | sed 's|.*github.com[:/]||' | cut -d/ -f1)
REPO=$(echo "$REMOTE_URL" | sed 's|.*github.com[:/]||' | cut -d/ -f2 | sed 's/\.git$//')
```

### 2. EDS verification (gate, fail hard)

Run the existing structural checks against cwd:

```bash
[ -f scripts/aem.js ] || [ -f scripts/lib-franklin.js ] || { echo "FAIL: not an EDS repo (no scripts/aem.js) — cd into a valid EDS repo checkout and re-run" >&2; exit 1; }
[ -f scripts/scripts.js ] || { echo "FAIL: missing scripts/scripts.js" >&2; exit 1; }
[ -f styles/styles.css ] || { echo "FAIL: missing styles/styles.css" >&2; exit 1; }
```

If any check fails: stop with a clear error. No fallback to clone or create —
the user must `cd` into the right place and re-run.

### 3. Demo-in-progress detection (new)

Check `$OF1_STATE_DIR/repo-config.json`:

- **Not found** → no demo in progress. Skip straight to step 5 (branch
  reporting) using the cwd repo.
- **Found** → read it plus any `step-*-status.json` files in
  `$OF1_STATE_DIR`, summarize to the user (branch, domain, last completed
  step, current status), and ask via `AskUserQuestion`: **continue** this
  demo, or **restart** it.

### 4. Branch handling — removed entirely

No checkout, no creation, no branch-suffix logic, no `BRANCH_MODE` env var.

```bash
BRANCH=$(git branch --show-current)
```

If `BRANCH` is empty (detached HEAD) or equals `main`, print a warning
("Currently on `main`/detached HEAD — demo artifacts and DA content will be
affected on this branch/state") but proceed regardless. The user is
responsible for being on the correct branch before running this stage.

`DOMAIN` remains an input (for `of1-endpoint.json` content and labeling) but
no longer drives branch naming/creation.

### 5. Destructive cleanup — now conditional

- **Continue** → skip the clean-slate file wipe and DA content deletion
  entirely. Leave existing artifacts and DA content untouched. Proceed to
  Code Sync check / output.
- **Restart** → run the existing clean-slate wipe (`rm -rf stardust/
  deliverables/ templates/ ...`) and DA content deletion against the
  *current* branch (no new branch created), then continue.
- **No prior demo found** (fresh state, no `repo-config.json`) → run
  clean-slate + DA wipe unconditionally, same as today, since there is
  nothing to preserve.

### 6. Code Sync check — kept, simplified

Keep the existing preview-URL polling check (formerly A3) as the only
Code-Sync-related check. Path B's Code Sync install flow is deleted since
there's no more repo creation.

### 7. Output — `repo-config.json`, `.hlxignore` fix, `of1-endpoint.json`

Unchanged from current behavior, aside from `branch`/`contentPrefix` now
coming from `git branch --show-current` rather than the old branch-setup
logic.

## Removed

- Q1/Q2/Q3 (repo URL / org / repo name questions)
- Path B: create-repo-from-boilerplate + its Code Sync install flow
- `BRANCH_MODE` env var and fresh/continue branch-suffix logic
- Branch creation/checkout logic entirely

## Downstream impact

Verified via `grep -rl` across `skills/*/SKILL.md` for every `repo-config.json`
field: no skill reads `BRANCH_MODE` or depends on branch-suffix behavior —
usage is contained to `of1-repo-setup/SKILL.md`. All consumers only consume
the final `repo-config.json` field values, whose shape is unchanged. No
downstream skill edits required.
