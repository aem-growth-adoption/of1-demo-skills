# Fold repo-setup into of1-setup; drop it as a separate pipeline step

## Problem

`of1-repo-setup` currently starts by asking the user for a repo URL (bring
your own) or org+name (create new from boilerplate), then clones/creates and
manages branch creation with a `BRANCH_MODE` (`fresh`/`continue`) env var that
auto-increments branch names on collision.

In practice, the skill is always run from inside an already-checked-out EDS
repo. The clone/create flow, branch creation/suffix logic, and `BRANCH_MODE`
are unnecessary ceremony that also silently destroys in-progress demo work
when re-run (unconditional clean-slate wipe + DA content deletion).

Since verifying the repo and preparing state is dependency-verification work
in spirit, it belongs in `of1-setup` (Step 1) rather than as its own pipeline
step. This removes an entire step from the 13-step pipeline.

## Goals

- Merge all of `of1-repo-setup`'s surviving responsibilities into
  `of1-setup`: verify cwd is a valid EDS project, detect an in-progress demo,
  ask continue/restart, and write `repo-config.json`.
- Delete `of1-repo-setup` as a standalone skill/step.
- Never destroy existing demo artifacts/DA content on "continue".
- Remove branch creation/checkout logic and `BRANCH_MODE` entirely — use
  whatever branch is currently checked out.
- Renumber the pipeline from 13 steps to 12 and rewire dependencies in
  `of1-demo` and `of1-demo-cc` so Step 3 (old numbering) becomes the new
  entry point after setup.

## Non-goals

- No change to any step-3-onward skill's *behavior*. All of them only read
  fields from `repo-config.json` (`owner`, `repo`, `branch`, `contentPrefix`,
  `repoDir`, `domain`, optionally `repoUrl`/`previewUrl`/`daSource`) —
  confirmed via grep across `skills/*/SKILL.md`. Field shapes are unchanged;
  only step numbers referencing them shift.
- No change to `.hlxignore` fix or `of1-endpoint.json` writing — kept as-is,
  just relocated into `of1-setup`.

## Design

### 1. `of1-setup` absorbs repo verification + config output

`verify.sh` currently checks `OF1_DEMO_REPO` is *a* valid git clone (of
`aem-growth-adoption/of1-demo` specifically — see current check 4). That
repo-identity check is replaced/extended with the full EDS-verification +
demo-detection + config-output flow described below. `of1-setup` no longer
assumes a fixed upstream repo identity; any EDS repo checked out at cwd (or
`$OF1_DEMO_REPO`) is valid.

`OWNER`/`REPO` are derived from the git remote instead of being asked:

```bash
REMOTE_URL=$(git config --get remote.origin.url)
OWNER=$(echo "$REMOTE_URL" | sed 's|.*github.com[:/]||' | cut -d/ -f1)
REPO=$(echo "$REMOTE_URL" | sed 's|.*github.com[:/]||' | cut -d/ -f2 | sed 's/\.git$//')
```

### 2. EDS structural verification (gate, fail hard)

Run the existing structural checks against cwd:

```bash
[ -f scripts/aem.js ] || [ -f scripts/lib-franklin.js ] || { echo "FAIL: not an EDS repo (no scripts/aem.js) — cd into a valid EDS repo checkout and re-run" >&2; exit 1; }
[ -f scripts/scripts.js ] || { echo "FAIL: missing scripts/scripts.js" >&2; exit 1; }
[ -f styles/styles.css ] || { echo "FAIL: missing styles/styles.css" >&2; exit 1; }
```

If any check fails: stop with a clear error (same failure mode as any other
`of1-setup` check — report and STOP, no fallback to clone or create).

### 3. Demo-in-progress detection (new)

Check `$OF1_STATE_DIR/repo-config.json`:

- **Not found** → no demo in progress. Skip straight to config output using
  the cwd repo.
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
responsible for being on the correct branch before running setup.

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

Keep the existing preview-URL polling check as the only Code-Sync-related
check. The old create-repo Code Sync install flow is deleted since there's no
more repo creation.

### 7. Output — `repo-config.json`, `.hlxignore` fix, `of1-endpoint.json`

Unchanged from current behavior, aside from `branch`/`contentPrefix` now
coming from `git branch --show-current`. `of1-setup` writes both
`setup.json` (existing) and `repo-config.json` (absorbed) on success.

### 8. Delete `of1-repo-setup`

Remove `skills/of1-repo-setup/` entirely. All its surviving logic now lives
in `skills/of1-setup/`.

### 9. Renumber the pipeline (13 steps → 12)

In both `of1-demo` and `of1-demo-cc`:

- Old Step 1 (Install dependencies) + old Step 2 (Repo setup) merge into new
  **Step 1 (Setup)** — dependency checks + EDS/demo verification +
  `repo-config.json` output, all in one dispatch.
- Old Steps 3–13 shift down by one: old 3→2, 4→3, 5→4, 6→5, 7→6 (with
  7a–7e/7-base/7-assemble sub-steps renumbered to 6a–6e/6-base/6-assemble),
  8→7, 9(a/b)→8(a/b), 10→9, 11→10, 12→11, 13→12.
- Every dependency-graph table, per-step model-assignment table, state-file
  table (`step-<N>-status.json` names), and the step-dispatch template's
  example step numbers must use the new numbering.
- The pipeline-audit `steps` array's `step` field and the `name` field
  (`"repo-setup"` at old step 2) are removed since setup+repo-setup collapse
  into step 1's audit entry.

## Removed

- `skills/of1-repo-setup/` (entire skill)
- Q1/Q2/Q3 (repo URL / org / repo name questions)
- Create-repo-from-boilerplate path + its Code Sync install flow
- `BRANCH_MODE` env var and fresh/continue branch-suffix logic
- Branch creation/checkout logic entirely
- Step 2 as a distinct pipeline step (folded into Step 1)

## Downstream impact

Verified via `grep -rl` across `skills/*/SKILL.md` for every `repo-config.json`
field: no skill reads `BRANCH_MODE` or depends on branch-suffix behavior —
usage was contained to `of1-repo-setup/SKILL.md`. All consumers only consume
the final `repo-config.json` field values, whose shape is unchanged.

Skills requiring edits:
- `of1-setup` — absorb the logic (sections 1–7 above).
- `of1-repo-setup` — delete.
- `of1-demo` — renumber steps, dependency graph, model table, state-file
  table, per-step needs list.
- `of1-demo-cc` — same renumbering, plus its step-dispatch template and
  pipeline-audit shape.

No edits needed for any of the 11 remaining per-domain step skills (discovery,
extraction, prototype, snowflake, template-generation, generative-block-styler,
brand-voice-extractor, content-metadata, quick-suggestions,
cta-template-builder, config-review, deploy) — they consume `repo-config.json`
by field name, not by step number.
