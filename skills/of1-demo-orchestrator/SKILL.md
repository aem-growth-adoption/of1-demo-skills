---
name: of1-demo-orchestrator
description: Orchestrator that turns a website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, run as 3 stages — discover a narrative and focus pages, recreate those pages as a branded EDS site via the three sequential substeps of1-extract-design → of1-prototype → of1-deploy, then run OF1 integration (content, styling, deploy) as the Integrate-stage skills per of1-integration's step graph. Runs on both Claude Code and SLICC; it detects the runtime and follows the matching dispatch reference. Use when the user asks to build, demo, or one-shot an OF1 demo for a domain.
user-invocable: true
---

# OF1 Demo — Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, in
3 stages: **discovery → extract/prototype/deploy → OF1 integration**. Stage 2 is itself three
sequential substeps — 2a `of1-extract-design`, 2b `of1-prototype`, 2c `of1-deploy`. Auto-approves
by default; the user can interrupt to revise any step.

This is **one orchestrator for both runtimes.** The pipeline logic — stages, step graph,
dependency edges, status contract, audit schema — is identical everywhere and lives here plus in
`knowledge/pipeline-contract.md`. Only the *dispatch mechanics* differ (Claude Code's Agent +
TaskCreate vs SLICC's `scoop_scoop` + sprinkle), and those live in two runtime files you pick
between at the very start.

## Runtime detection — do this FIRST

Decide the runtime by which dispatch primitives exist, then read that file and follow it for all
dispatch/progress/audit mechanics:

- **SLICC** — if `scoop_scoop` / `sprinkle` tools are available → read
  `knowledge/dispatch-slicc.md`.
- **Claude Code** — if `Agent` / `TaskCreate` tools are available (and `scoop_scoop` is not) → read
  `knowledge/dispatch-cc.md`.

If somehow both or neither appear available, prefer SLICC when `scoop_scoop` is present; otherwise
use Claude Code. Everything below is runtime-agnostic and applies on both.

## ⚠️ Nesting cap — this orchestrator dispatches the Integrate skills itself

On **both** runtimes, one dispatch level does not nest: a Claude Code subagent has no `Agent` tool,
and a SLICC scoop cannot call `scoop_scoop()`. So Stage 3 is **not** a single delegation to
`of1-integration` that fans out internally — **this top-level orchestrator owns and
dispatches each OF1-integration skill directly**, reading `of1-integration` as the
skill-definition + dependency-graph reference. A single Stage-3 sub-dispatch could never spawn the
Integrate skills; the pipeline would stall.

## Entry

Invoked with a target domain — e.g. "one-shot demo for frescopa.coffee" or
"/of1-demo-orchestrator frescopa.coffee". Extract:

- `DOMAIN` — bare hostname (no protocol, no path). Required; if missing, ask once via
  `AskUserQuestion`, then proceed.
- `MODE` — `one-shot` (default) or `step` (pause for review between every step). Default to
  `one-shot` unless the user explicitly says "pause", "wait for my review", or "step by step".

## Phase 0 — Verify dependencies + repo state (inline)

### 0a. Restart a provisioned demo repo (full wipe — throwaway demo repos only)

`of1-check-dependencies` never wipes a repo — on Restart it removes only OF1-owned paths (DA
`/of1/**` + `/templates/**`, git `blocks/of1/` + `of1/config/`), because it also runs against real
customer sites. The demo pipeline instead provisions a **throwaway** repo, so a Restart here must
also clear the prior run's Stage 1/2 output (prototypes, deliverables, generated pages). That full
wipe is owned by **this orchestrator** and runs **before** dispatching `of1-check-dependencies`,
only when ALL of:

- the orchestrator is running the full demo pipeline — it marks this with `OF1_PIPELINE_MODE=1`
  (see "How to run it" below for where that must be set), AND
- an earlier demo exists (`$OF1_STATE_DIR/repo-config.json` and `$OF1_STATE_DIR/setup.json` are
  present), AND
- the user chose **Restart** — summarize the prior demo from `repo-config.json` + the
  `of1-*-status.json` files and ask once via `AskUserQuestion` (**Continue** / **Restart**).

On **Continue**, or when no earlier demo exists, skip this step entirely. When
`of1-check-dependencies` then asks Continue/Restart, forward the same choice — do not ask the user
twice. Its Restart reset then completes the clean-up — it removes the OF1-owned paths this wipe
does not cover (DA `/of1/**` and `/templates/**` recursively, git `blocks/of1/` and `of1/config/`).

**How to run it.** Run the block below as **one** shell invocation, with `OF1_PIPELINE_MODE=1` set
**in that same invocation** by the orchestrator as its pipeline-mode marker — Claude Code `Bash`
calls do not persist `export`s across calls, so an `export` in an earlier call does not reach the
guard. E.g. write the block to `$OF1_STATE_DIR/restart-wipe.sh` and run
`OF1_PIPELINE_MODE=1 OF1_STATE_DIR="$OF1_STATE_DIR" bash "$OF1_STATE_DIR/restart-wipe.sh"` (plus
`ADOBE_IMS_TOKEN`, if that is the token source) in a single call. **Never** add an
`OF1_PIPELINE_MODE=1` assignment inside the block itself — that would make the guard meaningless.
The guard aborts everything that follows. Do not drop it and do not reuse this block outside the
demo pipeline — it deletes customer-shaped content:

```bash
[ "$OF1_PIPELINE_MODE" = "1" ] || { echo "refusing full wipe outside the demo pipeline" >&2; exit 1; }

# Never let a git op block on an interactive credential prompt.
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=true GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20

SETUP=$(cat "$OF1_STATE_DIR/setup.json")
OWNER=$(echo "$SETUP" | jq -r .owner)
REPO=$(echo "$SETUP" | jq -r .repo)
BRANCH=$(echo "$SETUP" | jq -r .branch)
REPO_DIR=$(echo "$SETUP" | jq -r .of1Repo)

if [ "$(echo "$SETUP" | jq -r .tokenFromEnv)" = "true" ]; then
  DA_TOKEN="$ADOBE_IMS_TOKEN"
else
  DA_TOKEN=$(jq -r .access_token "$(echo "$SETUP" | jq -r .tokenFile)")
fi

# Clean slate — remove previous demo artifacts but preserve EDS boilerplate
# (`styles/styles.css`, `scripts/`, `blocks/{header,footer,fragment}/`, `head.html`).
cd "$REPO_DIR" || exit 1
rm -rf stardust/ deliverables/ templates/ fragments/ content/ drafts/ \
       gallery/ of1/config/ tools/ output/ screenshots/ tmp/ da/
rm -rf styles/of1-*.css styles/prototype-*.css
rm -f PRODUCT.md

# Clean prior state
rm -rf "$OF1_STATE_DIR"/of1-*-status.json
rm -f "$OF1_STATE_DIR/discovery.html"

# Stage ONLY the cleaned paths (scoped `-A -- <pathspec>`, never a bare `git add -A`/`.`
# — see common-pitfalls.md § 6; a bare add can wipe the repo on a partial SLICC tree).
# Quoted globs are expanded by git against tracked files, so they stage the deletions.
git add -A -- \
  stardust deliverables templates fragments content drafts gallery of1/config \
  tools output screenshots tmp da PRODUCT.md \
  'styles/of1-*.css' 'styles/prototype-*.css' 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "chore: clean slate for ${BRANCH}"
  git push origin "$BRANCH"
  echo "✓ Clean slate committed + pushed"
else
  echo "✓ Branch already clean"
fi

# Then clean DA content for the branch:
DA_LIST=$(curl -s --connect-timeout 10 --max-time 30 -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}" 2>/dev/null || echo "[]")

echo "$DA_LIST" | jq -r '.[] | select(.ext == "html") | .name' 2>/dev/null | while read -r name; do
  [ -n "$name" ] || continue
  curl -s --connect-timeout 10 --max-time 30 -X DELETE -H "Authorization: Bearer $DA_TOKEN" \
    "https://admin.da.live/source/${OWNER}/${REPO}/${name}.html" >/dev/null
done
echo "✓ DA content cleaned"
```

(Sourced from the former `of1-check-dependencies` §3 "Clean slate" in the **of1-skills** repo,
which no longer wipes anything outside OF1-owned paths.)

### 0b. Run `of1-check-dependencies`

Run `of1-skills:of1-check-dependencies` in your own context (CC: via the **Skill tool**, not an Agent — it's
light and may need `AskUserQuestion` for continue/restart; SLICC: inline in the cone). It verifies
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
Stage 1: of1-discovery ──┐ (narrative.json: keyPages, focus, persona)
        ┌─────────────────────────┴─────────────────────────┐
        ↓                                                    ↓
Stage 2: 2a of1-extract-design <URL>       Stage 3: OF1 integration (Integrate skills)
      → 2b of1-prototype                    THIS orchestrator dispatches each skill,
      → 2c of1-deploy                     per of1-integration's graph: content track
  → EDS site + DESIGN.json                   (brand-voice/content/suggestions) runs NOW;
  → write $OF1_STAGE2_DONE_FILE              site-integration track (templates→assemble
    (2c only, on completion)                 ∥ styling ∥ cta → publish)
                                              gates on $OF1_STAGE2_DONE_FILE
        └─────────────────────────┬─────────────────────────┘
                                  ↓  join + deploy (of1-publish) owned by THIS orchestrator
                             (deploy)
```

- **Stage 1** (discovery) runs first; read its `narrative.json` and build the comma-separated slug
  list from `keyPages[].slug`.
- **Stage 2** (2a → 2b → 2c) and the **Stage 3 content track** (`of1-extract-brand-voice`/`of1-extract-content`)
  dispatch concurrently right after Stage 1. The content track needs only the live external site.
  Stage 2's three substeps run sequentially — 2b needs 2a's `DESIGN.json`, 2c needs 2b's prototypes.
- The **Stage 3 site-integration track** gates on Stage 2's `$OF1_STAGE2_DONE_FILE` (written by 2c),
  then follows `of1-integration`'s dependency graph — the first fan-out is the extraction step (if
  `DESIGN.json` absent) → `of1-build-templates`(base) ∥ `of1-style-generative-block` ∥
  `of1-build-cta-template` (pipeline mode only); `of1-publish` runs inline at the tail once
  `of1-build-templates`(assemble) + `of1-style-generative-block` + `of1-build-quick-suggestions` +
  `of1-build-cta-template` are all done. There is no separate config review step — authored config
  lives in DA and the demo hub (`deliverables/index.html`) links each item. Do not
  re-derive the per-skill edges here (they are defined once in `of1-integration` — see the note
  below).
- **Fan out at every eligible point.** The pipeline is complete when `of1-publish` returns `done`.

The Integrate-skill graph, dependency edges, and `OF1_PIPELINE_MODE=1` timing are **defined once** in
`of1-integration` — read them there; this orchestrator is the dispatcher, not a reimplementer.

## Stage → skill mapping

| Stage | Name | Skill | Depends on |
|---|---|---|---|
| 1 | Collect | `of1-discovery` → `narrative.json` + `discovery.html` | setup |
| 2a | Extract design | `of1-extract-design` → `stardust/current/DESIGN.json` + `deliverables/brand-review.html` + `of1-extract-design-status.json` | stage 1 (keyPages) |
| 2b | Prototype | `of1-prototype` → `stardust/prototypes/prototype-*.html` + `of1-prototype-status.json` | 2a (`DESIGN.json`) |
| 2c | Deploy | `of1-deploy` → block-based EDS pages + `of1-deploy-status.json` + `$OF1_STAGE2_DONE_FILE` | 2b (prototypes) |
| 3 | OF1 integration (Integrate skills) | dispatched by THIS orchestrator per `of1-integration` (pipeline mode) | stage 1; site-track also on `$OF1_STAGE2_DONE_FILE` |

## What Stage 2 & 3 own (do not reimplement here)

- **Fidelity is owned by Stage 2's sub-skills, not the orchestrator.** `of1-prototype` runs its own
  visual-diff/fix loop against the live site; `of1-deploy` runs `stardust:deploy`'s own per-page
  delivery checks. Do not run screenshot-diff loops in the orchestrator. `of1-extract-design` **fails
  loud** (`status: "failed"`) on a blocked capture rather than shipping a placeholder — the
  orchestrator does not need a separate artifact gate for that failure mode.
- After 2c, the orchestrator does an **artifact-existence check** (the block-based EDS pages and
  `$OF1_STAGE2_DONE_FILE` exist) before dispatching Stage 3 or deploying — a lighter check than the
  old replica fidelity gate, since 2a/2b/2c already fail loud on their own problems.
- **`of1-publish` (deploy + pre-launch checklist)** runs **inline** in the orchestrator's own
  context, following `of1-integration`'s Deploy section. `of1-publish`'s checklist gates the OF1-integration stage's `done` status; it also
  regenerates the demo hub (`deliverables/index.html`) with DA edit links + a status panel.

## Iteration & completion

- If a skill fails or the user requests a revision, re-dispatch just that skill (with feedback
  appended) — see the runtime file for the exact mechanics (`revise:` lick on SLICC; re-dispatch the
  Agent on CC).
- When `of1-publish` returns `done`, all three stages are complete. On SLICC the sprinkle stays open
  as a reference with all URLs.

## Reference — shared contract & pitfalls

Runtime-independent rules are NOT restated in this file — they live in the shared knowledge dir
(cited by both dispatch files and the step skills), so nothing can drift:

- **`knowledge/dispatch-cc.md`** / **`knowledge/dispatch-slicc.md`** — the runtime-specific dispatch,
  progress-tracking, and audit-capture mechanics. Read the one matching your runtime (see detection above).
- **`knowledge/pipeline-contract.md`** — 3-stage model, nesting cap, per-step status/output contract, deliverable-URL rules, and the pipeline-audit schema. Fix any of these there once.
- **`knowledge/common-pitfalls.md`** — DA/EDS/git/image/logo rules, curl traps, DA+EDS preview auth, allowed-domain table (`[SLICC]`/`[CC]` tagged). Consult on any DA/EDS/upload issue.
- **`of1-integration/knowledge/worker-config-schemas.md`** (in the **of1-skills** repo, not here) — DA-first config: what lives in git (`of1/config/config.json`, + `cta-template.json` in pipeline mode) vs DA (`/of1/brand-voice`, `/of1/config/personas`, `/of1/config/suggestions`, …).
- **`of1-integration/knowledge/design-tokens-resolution.md`** (in the **of1-skills** repo, not here) — the one `DESIGN.json` resolver + fail-loudly rule.

## Notes

- One domain at a time. No multi-tenant parallel pipelines.
- Resume across sessions is not yet implemented.
