---
name: of1-demo-orchestrator
description: Claude Code orchestrator that turns a website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, in 3 stages — discover a narrative and focus pages, recreate those pages as a branded EDS site via the sequential substeps of1-extract-design → of1-prototype → of1-deploy, then run OF1 integration with one call to of1-skills:of1-integration. Use when the user asks to build, demo, or one-shot an OF1 demo for a domain.
user-invocable: true
---

# OF1 Demo — Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, in
3 stages: **discovery → extract/prototype/deploy → OF1 integration**. Stage 2 is itself three
sequential substeps — 2a `of1-extract-design`, 2b `of1-prototype`, 2c `of1-deploy`. Stage 3 is a
single call to `of1-skills:of1-integration`; this orchestrator treats it as an opaque dependency.
Auto-approves by default; the user can interrupt to revise any step.

Runs on **Claude Code only**. Stage 1/2 dispatch mechanics (Agent + TaskCreate) live in
`knowledge/dispatch-cc.md`; the stage model, status contract and audit schema live in
`knowledge/pipeline-contract.md`.

## Entry

Invoked with a target domain — e.g. "one-shot demo for frescopa.coffee" or
"/of1-demo-orchestrator frescopa.coffee". Extract:

- `DOMAIN` — bare hostname (no protocol, no path). Required; if missing, ask once via
  `AskUserQuestion` (or fail when `OF1_NON_INTERACTIVE=1`), then proceed.
- `MODE` — `one-shot` (default) or `step` (pause for review between every step). Default to
  `one-shot` unless the user explicitly says "pause", "wait for my review", or "step by step".

## Phase 0 — Verify dependencies + repo state (inline)

### Where `OF1_STATE_DIR` comes from

Resolve `OF1_STATE_DIR` **before** step 0a: if the caller already set it, use that; otherwise default
to `$PWD/.of1/state`. Pass the same value to step 0a's wipe, to `of1-check-dependencies` in step 0b,
to every dispatched skill and to the Stage 3 call — a mismatch means the wipe guard reads a different
`setup.json` than the one step 0b writes.

### 0a. Wipe a repo previously built by this orchestrator

`of1-check-dependencies` never wipes anything and no longer asks Continue/Restart; it runs against
real customer sites too. The full wipe of a prior demo's output is owned by **this orchestrator** and
is implemented in `scripts/wipe.sh` (Stage 1/2 output, git `blocks/of1/` + `of1/config/`, DA
`/of1/**` + `/templates/**` recursively, DA root `*.html`). Run it only when an earlier demo exists
(`$OF1_STATE_DIR/repo-config.json` and `$OF1_STATE_DIR/setup.json` are present):

- Interactive run: summarize the prior demo from `repo-config.json` + the `of1-*-status.json` files and
  ask once via `AskUserQuestion` (**Continue** / **Restart**). **Continue** skips the wipe.
- Non-interactive run (`OF1_NON_INTERACTIVE=1`): do not ask; a previous demo means wipe (fresh
  build), no previous demo means skip.
- Nothing is forwarded to `of1-check-dependencies` — it has no Continue/Restart choice.

Run the script as **one** `Bash` invocation with `OF1_DEMO_WIPE=1` set **in that same invocation**
(Claude Code `Bash` calls do not persist `export`s), plus `ADOBE_IMS_TOKEN` when it is the token source:

```bash
OF1_DEMO_WIPE=1 OF1_STATE_DIR="$OF1_STATE_DIR" bash "<this skill dir>/scripts/wipe.sh"
```

`OF1_DEMO_WIPE` is only an intent marker. The script also **fails closed** (prints a refusal, exits 1,
deletes nothing) unless the repo demonstrably is one this orchestrator built: the state dir,
`setup.json` and `repo-config.json` exist and point at the same repo, `stardust/` is tracked in `HEAD`,
and the checked-out branch is the one recorded in `setup.json`. The DA walk refuses any path outside
`/of1` and `/templates`. Do not drop these checks, never export `OF1_DEMO_WIPE` elsewhere and never
use the script outside the demo pipeline — it deletes customer-shaped content. If it exits non-zero,
surface the refusal and stop. Tests: `node --test scripts/wipe.test.mjs`.

### 0b. Run `of1-check-dependencies`

Run `of1-skills:of1-check-dependencies` in your own context (via the **Skill tool**, not an Agent — it is
light and must run in this context). It verifies
prerequisites AND repo state and writes `repo-config.json`. It does NOT create a branch — it uses
whatever branch is checked out at `OF1_DEMO_REPO`. If it fails, surface the exact error and stop.

Then read `setup.json` (`stateDir`/`of1Repo`) and `repo-config.json` (`owner`/`repo`/`branch`/`domain`)
and use them for all subsequent steps:

```json
{
  "owner": "<org>", "repo": "<repo>", "branch": "<current-branch>",
  "contentPrefix": "<current-branch>", "repoUrl": "https://github.com/<org>/<repo>",
  "previewUrl": "https://<current-branch>--<repo>--<org>.aem.page/",
  "daSource": "da://<org>/<repo>", "repoDir": "<repo path>", "domain": "frescopa.coffee"
}
```

Every step reads this file for `repoDir`, `branch`, `daSource`, `previewUrl`, and the owner/repo
for branch URLs.

## The 3-stage model

```
Stage 1: of1-discovery  (narrative.json: keyPages, focus, persona)
   ↓
Stage 2: 2a of1-extract-design <URL> → 2b of1-prototype → 2c of1-deploy
   → EDS site + DESIGN.json; 2c writes $OF1_STAGE2_DONE_FILE (stage2-done.json) on completion
   ↓
Stage 3: ONE inline call: of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template
   → $OF1_STATE_DIR/of1-integration-result.json
```

The stages are strictly sequential. Stage 2's substeps are sequential too — 2b needs 2a's
`DESIGN.json`, 2c needs 2b's prototypes.

- **Stage 1** (discovery) runs first; read its `narrative.json` and build the comma-separated slug
  list from `keyPages[].slug`.
- **Stage 2** dispatch is described in `knowledge/dispatch-cc.md`.
- **Stage 3** is one call, described below. The orchestrator does not dispatch, order or inspect the
  individual skills `of1-integration` runs.

## Stage → skill mapping

| Stage | Name | Skill | Depends on |
|---|---|---|---|
| 1 | Collect | `of1-discovery` → `narrative.json` + `discovery.html` | setup |
| 2a | Extract design | `of1-extract-design` → `stardust/current/DESIGN.json` + `deliverables/brand-review.html` + `of1-extract-design-status.json` | stage 1 (keyPages) |
| 2b | Prototype | `of1-prototype` → `stardust/prototypes/prototype-*.html` + `of1-prototype-status.json` | 2a (`DESIGN.json`) |
| 2c | Deploy | `of1-deploy` → block-based EDS pages + `of1-deploy-status.json` + `$OF1_STAGE2_DONE_FILE` | 2b (prototypes) |
| 3 | OF1 integration | `of1-skills:of1-integration` (one `Skill` call) → `of1-integration-result.json` | 2c |

## What Stage 2 owns (do not reimplement here)

- **Fidelity is owned by Stage 2's sub-skills, not the orchestrator.** `of1-prototype` runs its own
  visual-diff/fix loop against the live site; `of1-deploy` runs `stardust:deploy`'s own per-page
  delivery checks. Do not run screenshot-diff loops in the orchestrator. `of1-extract-design` **fails
  loud** (`status: "failed"`) on a blocked capture rather than shipping a placeholder.
- After 2c, the orchestrator does an **artifact-existence check** (the block-based EDS pages and
  `$OF1_STAGE2_DONE_FILE` exist) before Stage 3 — see `pipeline-contract.md` § "Stage 2 completion check".

## Stage 3 — OF1 integration (one call)

Once the Stage 2 artifact check passes, invoke the integration driver **inline with the `Skill` tool in
this top-level context** — never through an `Agent` (the driver dispatches subagents itself, and a
subagent cannot dispatch subagents):

```
Skill: of1-skills:of1-integration
arguments: content-source=<DOMAIN> non-interactive cta-template
```

Make sure `OF1_STATE_DIR`, `OF1_DEMO_REPO` and the DA token (`ADOBE_IMS_TOKEN` or `OF1_TOKEN_FILE`) are
in the environment the driver sees (the same values used for Phase 0). Write the pipeline audit
(`pipeline-contract.md` § "Pipeline audit schema") **before** this call.

When the call returns, read `$OF1_STATE_DIR/of1-integration-result.json`
(`status`, `summary`, `deliverables`, `checks`):

- `done` — the pipeline is complete. Report the summary, the deliverables (hub link
  `<preview>/deliverables/index.html`) and `checks`.
- anything else (`review`, `failed`, or a missing/unparseable file) — report the status and summary and
  **fail the run**. Do not retry the individual `of1-skills` skills from here.

The orchestrator writes **no result file** of its own; a calling harness says in its own prompt where
to write its result.

## Iteration & completion

- If a Stage 1/2 skill fails or the user requests a revision, re-dispatch just that skill (with feedback
  appended) — see `knowledge/dispatch-cc.md`. For Stage 3, re-run the single call.
- The pipeline is complete when `of1-integration-result.json` says `done`.

## Reference — shared contract & pitfalls

- **`knowledge/dispatch-cc.md`** — Stage 1/2 dispatch, progress tracking and audit-capture mechanics.
- **`knowledge/pipeline-contract.md`** — 3-stage model, per-step status/output contract, env vars, state files and the pipeline-audit schema.
- **`knowledge/common-pitfalls.md`** — DA/EDS/git/image/logo rules, curl traps, DA+EDS preview auth, allowed-domain table. Consult on any DA/EDS/upload issue.

## Notes

- One domain at a time. No multi-tenant parallel pipelines.
- Resume across sessions is not yet implemented.
