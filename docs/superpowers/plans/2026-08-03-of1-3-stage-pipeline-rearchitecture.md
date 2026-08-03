# OF1 3-Stage Pipeline Re-Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the OF1 demo pipeline into three stages — Collect (discovery), Replica (`stardust:replica`), OF1 integration (delegate to `of1-adopt-existing-site`) — eliminating three bespoke skills and the duplicated steps 6–12.

**Architecture:** Stage 1 (`of1-discover-narrative`) emits a machine-readable `keyPages` list. Stage 2 runs `stardust:replica <URL> --pages <slugs>` (bounded mode), producing an EDS site + `DESIGN.json`. Stage 3 delegates to `of1-adopt-existing-site` in a new **pipeline mode**: its content track (brand/content/suggestions, sourced from the real external domain) runs parallel to Stage 2; its site-integration track (templates, OF1 styling, CTA, config, deploy) gates on a `replica-done` signal from the parent orchestrator. Both full orchestrators (`of1-demo-orchestrator` SLICC + `of1-demo-orchestrator-cc`) shrink to Stage 0–1 then launch Stages 2 & 3 concurrently.

**Tech Stack:** Claude Code skills (Markdown `SKILL.md` + prompt orchestration), `stardust` plugin skills, SLICC sprinkle (`.shtml` + JS), bash/`jq` glue, `verify.sh` dependency checker, `workflows/of1-demo-slicc.js`.

## Global Constraints

- Work on branch `skills-v5-next` (already checked out).
- This repo has **no unit-test harness**. "Tests" are structural checks: `grep`/`rg` for required-or-forbidden content, `bash -n` syntax checks, `node --check` for JS, `verify.sh` runs, and (where possible) skill smoke-invocations. Every task ends with a concrete verification command + expected output.
- **De-dup goal:** steps 6–12 logic must live only in `of1-adopt-existing-site` after this work. No copy in the full orchestrators.
- **Standalone `of1-adopt-existing-site` behavior must not change** — new behavior is gated behind an explicit pipeline-mode signal; absent that signal it behaves exactly as today (content sourced from the replica preview URL).
- Model version strings stay exact: `claude-opus-4-8` (Opus 4.8), `claude-sonnet-5` (Sonnet 5). CC agent model params: `opus` / `sonnet`.
- Retired skills: `of1-extract-design-tokens`, `of1-build-prototypes`, `of1-convert-to-eds`. Disposition = **delete** the skill directories and remove every reference (decided here; the spec left it open).
- Commit after every task with a `feat:`/`refactor:`/`docs:`/`chore:` message ending in the Co-Authored-By trailer.

---

## File Structure

**Modified:**
- `skills/of1-discover-narrative/SKILL.md` — add `narrative.json` (`keyPages`) output.
- `skills/of1-adopt-existing-site/SKILL.md` — add pipeline mode: external `contentSource`, `replica-done` gate, content-track/site-track split, bounded `DESIGN.json` acceptance.
- `skills/of1-extract-brand-voice/SKILL.md`, `skills/of1-extract-content/SKILL.md`, `skills/of1-build-quick-suggestions/SKILL.md` — honor `OF1_CONTENT_SOURCE` (external domain) over the replica URL.
- `skills/of1-demo-orchestrator/SKILL.md` (SLICC) — collapse to 3 stages + delegate.
- `skills/of1-demo-orchestrator-cc/SKILL.md` (CC) — collapse to 3 stages + delegate.
- `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml` — 3-stage top-level UI + delegated sub-progress.
- `skills/of1-check-dependencies/scripts/verify.sh` + `SKILL.md` — drop 3 retired skills, add `stardust:replica` presence check.
- `README.md` — pipeline diagram + skills table.

**Deleted:**
- `skills/of1-extract-design-tokens/`, `skills/of1-build-prototypes/`, `skills/of1-convert-to-eds/`.
- `workflows/of1-demo-slicc.js` — SLICC workflow, superseded by the 3-stage orchestrators.

**Order rationale:** Seams first (Tasks 1–3: narrative output, content-source override, adopt-site pipeline mode) so the orchestrators (Tasks 4–6) have concrete contracts to call. Cleanup last (Tasks 7–9) once nothing references the retired skills.

---

## Task 1: Stage 1 — machine-readable `keyPages` output from discovery

**Files:**
- Modify: `skills/of1-discover-narrative/SKILL.md`

**Interfaces:**
- Produces: `$OF1_STATE_DIR/narrative.json` — shape:
  ```json
  {
    "domain": "frescopa.coffee",
    "focus": "<product line/category>",
    "persona": "<persona + journey one-liner>",
    "keyPages": [
      { "slug": "home", "url": "https://frescopa.coffee/", "description": "homepage" },
      { "slug": "shop", "url": "https://frescopa.coffee/shop", "description": "product listing" }
    ]
  }
  ```
  `slug` values are what Stage 2 passes to `stardust:replica --pages`. `home` maps to the site root.

- [ ] **Step 1: Add the `narrative.json` deliverable section**

In `skills/of1-discover-narrative/SKILL.md`, after the existing "### 4. Structured output for downstream steps" block (the `step-2-output.md` section, ends ~line 108), insert a new subsection:

```markdown
### 4b. Machine-readable narrative for the orchestrator

Also write `$OF1_STATE_DIR/narrative.json` — the orchestrator reads `keyPages[].slug`
to build Stage 2's `stardust:replica --pages` argument, and `focus`/`persona` to steer
Stage 3's product focus:

​```bash
cat > "$OF1_STATE_DIR/narrative.json" <<EOF
{
  "domain": "${DOMAIN}",
  "focus": "<the demo focus you proposed above>",
  "persona": "<persona + one-line journey>",
  "keyPages": [
    { "slug": "home", "url": "https://${DOMAIN}/", "description": "homepage" }
    <, one object per additional key page — slug is the URL path segment, no leading slash>
  ]
}
EOF
​```

**Slug rules:** the homepage is always `slug: "home"`. For other pages, the slug is the
last non-empty path segment (e.g. `https://${DOMAIN}/shop/coffee` → `coffee`). Keep 2–3
key pages total — these become the ONLY pages Stage 2 recreates.
```

(Replace the `​` zero-width guards with real triple-backticks when editing — they mark the nested fences here.)

- [ ] **Step 2: Cross-reference the new output where key pages are proposed**

In the same file, in "### 3. Propose demo focus", change the "Key pages to reproduce" bullet (~line 71) to note the machine-readable mirror:

```markdown
- **Key pages to reproduce**: 2–3 pages that best represent the site, with full URLs. These are mirrored into `narrative.json` (§4b) as `keyPages[]` — Stage 2 recreates exactly these.
```

- [ ] **Step 3: Verify the section exists and is well-formed**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q 'narrative.json' skills/of1-discover-narrative/SKILL.md && echo "OK: narrative.json referenced"
grep -q 'keyPages' skills/of1-discover-narrative/SKILL.md && echo "OK: keyPages documented"
```
Expected: both `OK:` lines print.

- [ ] **Step 4: Commit**

```bash
git add skills/of1-discover-narrative/SKILL.md
git commit -m "$(printf 'feat(discovery): emit narrative.json with machine-readable keyPages\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Content-source override in the three content-track skills

**Files:**
- Modify: `skills/of1-extract-brand-voice/SKILL.md`
- Modify: `skills/of1-extract-content/SKILL.md`
- Modify: `skills/of1-build-quick-suggestions/SKILL.md`

**Interfaces:**
- Consumes: env var `OF1_CONTENT_SOURCE` — a bare external domain (e.g. `frescopa.coffee`). When set, these skills crawl/extract from `https://$OF1_CONTENT_SOURCE/...` instead of the EDS replica preview URL. When unset, behavior is unchanged (today's default).
- Produces: same output files as today (`of1/config/brand-voice.json`, `products.json` etc.).

- [ ] **Step 1: Locate the source-URL resolution in each skill**

Run (records the current wiring so the edit targets the right spot):
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for S in of1-extract-brand-voice of1-extract-content of1-build-quick-suggestions; do
  echo "=== $S ==="
  grep -nE 'preview|aem\.page|DOMAIN|https://|crawl|source' "skills/$S/SKILL.md" | head -8
done
```
Expected: each prints the lines where it decides what URL to scrape.

- [ ] **Step 2: Add the `OF1_CONTENT_SOURCE` resolution block to each skill**

In each of the three `SKILL.md` files, add a subsection near the top of its "Process" (right after the env/repo-config read block) that resolves the extraction target:

```markdown
## Source resolution — live site vs replica

The content this skill extracts comes from one of two places, decided by `OF1_CONTENT_SOURCE`:

​```bash
if [ -n "$OF1_CONTENT_SOURCE" ]; then
  # Pipeline mode: extract from the REAL external site (highest-fidelity source data)
  SOURCE_BASE="https://${OF1_CONTENT_SOURCE}"
else
  # Standalone mode (default, unchanged): extract from the built EDS replica preview
  SOURCE_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
fi
echo "Extracting from: $SOURCE_BASE"
​```

Use `$SOURCE_BASE` as the root for every crawl/scrape in the steps below. Everything else
(output files, image download, JSON shapes) is identical in both modes.
```

(Replace `​` guards with real backticks.) Then update the skill's existing crawl commands to use `$SOURCE_BASE/...` where they currently hardcode the preview URL or `$DOMAIN`.

- [ ] **Step 3: Verify all three skills honor the var**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for S in of1-extract-brand-voice of1-extract-content of1-build-quick-suggestions; do
  grep -q 'OF1_CONTENT_SOURCE' "skills/$S/SKILL.md" && echo "OK: $S honors OF1_CONTENT_SOURCE" || echo "MISSING: $S"
done
```
Expected: three `OK:` lines.

- [ ] **Step 4: Commit**

```bash
git add skills/of1-extract-brand-voice/SKILL.md skills/of1-extract-content/SKILL.md skills/of1-build-quick-suggestions/SKILL.md
git commit -m "$(printf 'feat(content-track): honor OF1_CONTENT_SOURCE to extract from the live site\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Pipeline mode in `of1-adopt-existing-site`

**Files:**
- Modify: `skills/of1-adopt-existing-site/SKILL.md`

**Interfaces:**
- Consumes (all optional; absent ⇒ standalone mode, unchanged):
  - `OF1_PIPELINE_MODE=1` — signals invocation from the full demo pipeline.
  - `OF1_CONTENT_SOURCE=<external-domain>` — passed through to the content-track skills (Task 2).
  - `OF1_REPLICA_DONE_FILE=<path>` — a file whose existence means Stage 2 (replica) has fully finished. The site-integration track blocks until it exists.
- Produces: same steps-6–12 deliverables as today.

- [ ] **Step 1: Document the pipeline-mode inputs**

In `skills/of1-adopt-existing-site/SKILL.md`, after "## Entry" (~line 13), add:

```markdown
## Invocation mode

Two modes, decided by `OF1_PIPELINE_MODE`:

- **Standalone (default, `OF1_PIPELINE_MODE` unset):** everything below behaves exactly as
  documented today. Content is extracted from the existing EDS site's own preview URL.
- **Pipeline (`OF1_PIPELINE_MODE=1`):** invoked by the full demo orchestrator alongside a
  running `stardust:replica`. Two differences only:
  1. The content track (8a/8b/9) extracts from the real external domain — the orchestrator
     passes `OF1_CONTENT_SOURCE=<domain>`, which the content-track skills honor (see each
     skill's "Source resolution" section). Adopt-site just forwards the env var to those dispatches.
  2. The site-integration track (6, 7, 10, 11, 12) does not start until Stage 2 has finished.
     The orchestrator passes `OF1_REPLICA_DONE_FILE=<path>`; adopt-site waits for that file to
     exist before dispatching the site-integration track. The content track (8a/8b → 9) runs
     immediately, in parallel with the still-running replica.
```

- [ ] **Step 2: Add the two-track split to the step graph**

In the "## Step graph" section (~line 33), replace the single fan-out description with the content-track / site-track split. Add this note directly under the existing ASCII graph:

```markdown
### Pipeline-mode timing (OF1_PIPELINE_MODE=1)

The step graph's DEPENDENCIES are unchanged; only the START GATE differs:

- **Content track — dispatch immediately on entry** (parallel with replica): 8a, 8b → 9.
  These need only the live external site (`OF1_CONTENT_SOURCE`) + the narrative focus.
- **Site-integration track — dispatch only after `OF1_REPLICA_DONE_FILE` exists**:
  6-base → 6a–6e → 6-assemble ∥ 7 ∥ 10, then 11 (needs 8a+8b+9+10), then 12.

​```bash
# Site-integration gate (pipeline mode only)
if [ -n "$OF1_PIPELINE_MODE" ]; then
  echo "Waiting for replica to finish: $OF1_REPLICA_DONE_FILE"
  # Event-driven on SLICC (scoop-notify) / sequential await on CC. Do NOT sleep-poll on SLICC.
  until [ -f "$OF1_REPLICA_DONE_FILE" ]; do :; done   # CC inline fallback only
fi
​```

In standalone mode there is no replica and no gate — all five siblings (6-base, 7, 8a, 8b, 10)
dispatch together exactly as the table below already says.
```

(Replace `​` guards with real backticks.)

- [ ] **Step 3: Confirm bounded `DESIGN.json` acceptance**

In "## Phase 1 — Artifact detection", extend the `HAS_DESIGN_JSON` note (~line 30) to accept replica's bounded-single spec:

```markdown
`DESIGN.json` may carry `_provenance.mode: bounded-single` when produced by `stardust:replica`
in bounded (`--pages`) mode — this is fully valid input. Adopt-site consumes the tokens the same
way regardless of provenance; do NOT reject or re-extract on a bounded-single spec.
```

- [ ] **Step 4: Forward the env vars in both Dispatch sections**

In the "### Claude Code" dispatch bullet that lists exported env vars (~line 84) and the "### SLICC" bullet (~line 92), add `OF1_CONTENT_SOURCE` and `OF1_REPLICA_DONE_FILE` to the list of vars each dispatched step must receive. Add one line to each:

```markdown
- In pipeline mode also export `OF1_CONTENT_SOURCE` (to 8a/8b/9 dispatches) and pass
  `OF1_REPLICA_DONE_FILE` to the orchestrator's own site-track gate (not to the step agents).
```

- [ ] **Step 5: Verify**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for T in OF1_PIPELINE_MODE OF1_CONTENT_SOURCE OF1_REPLICA_DONE_FILE bounded-single; do
  grep -q "$T" skills/of1-adopt-existing-site/SKILL.md && echo "OK: $T" || echo "MISSING: $T"
done
```
Expected: four `OK:` lines.

- [ ] **Step 6: Commit**

```bash
git add skills/of1-adopt-existing-site/SKILL.md
git commit -m "$(printf 'feat(adopt-site): add pipeline mode (live content source + replica-done gate)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Rewrite the CC orchestrator to 3 stages

**Files:**
- Modify: `skills/of1-demo-orchestrator-cc/SKILL.md`

**Interfaces:**
- Consumes: `narrative.json` (Task 1), `of1-adopt-existing-site` pipeline mode (Task 3).
- Produces: a `replica-done` file at `<stateDir>/replica-done.json` when Stage 2's Agent returns `done`.

- [ ] **Step 1: Replace the 12-step task list with 3 stages**

In `skills/of1-demo-orchestrator-cc/SKILL.md`, replace "## Phase 1 — Initialize task list" (the 12-item block, ~lines 29–48) with:

```markdown
## Phase 1 — Initialize task list

Use **TaskCreate** with one task per stage + the concurrent tracks:

​```
0. Setup            (done if you got here — deps + repo-config.json)
1. Collect          — of1-discover-narrative → narrative.json + demo story
2. Replica          — stardust:replica <URL> --pages <slugs> → EDS site + DESIGN.json
3. OF1 integration  — delegate to of1-adopt-existing-site (pipeline mode)
​```

Stages 2 and 3 launch CONCURRENTLY (see Phase 2). Mark task 0 completed immediately.
```

- [ ] **Step 2: Replace the dependency graph + dispatch table (Phase 2)**

Replace the entire "## Phase 2 — Run the pipeline" dependency-graph + trigger-table block (~lines 51–124, through "### Step 8 split") with:

```markdown
## Phase 2 — Run the pipeline (3 stages)

​```
Stage 1: of1-discover-narrative ──┐ (narrative.json: keyPages, focus, persona)
        ┌─────────────────────────┴─────────────────────────┐
        ↓                                                    ↓
Stage 2: stardust:replica <URL>            Stage 3: of1-adopt-existing-site
  --pages <slugs>  (Agent, opus)             (pipeline mode) — owns steps 6–12,
  → EDS site + DESIGN.json                    runs its content track NOW, gates
  → write replica-done.json                   site-integration on replica-done.json
        └─────────────────────────┬─────────────────────────┘
                                  ↓  join handled INSIDE adopt-site
                             (deploy)
​```

**Dispatch sequence:**

1. **Stage 1:** dispatch `of1-discover-narrative` (model `opus`). Await `done`. Read
   `narrative.json`; build `SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)`.
2. **Stages 2 + 3 in ONE message (two Agent blocks):**
   - **Stage 2 Agent** (model `opus`): instruct it to invoke `stardust:replica https://<DOMAIN> --pages <SLUGS>`
     and, on success, write `<stateDir>/replica-done.json`. See the Stage 2 dispatch template below.
   - **Stage 3 Agent**: invoke `of1-adopt-existing-site` with `OF1_PIPELINE_MODE=1`,
     `OF1_CONTENT_SOURCE=<DOMAIN>`, `OF1_REPLICA_DONE_FILE=<stateDir>/replica-done.json`.
     Adopt-site runs its content track immediately and gates the rest on the done-file.
3. When both Agents return `done`, the pipeline is complete (adopt-site owns the join + deploy).

**HARD RULE:** do NOT re-implement steps 6–12 here. Stage 3 is a single delegation to
`of1-adopt-existing-site`. The only step logic the orchestrator owns is Stage 1 dispatch and
the Stage 2 replica invocation.

### Stage 2 dispatch template (replica)

​```
You are executing Stage 2 (Replica) of the OF1 demo pipeline for `<DOMAIN>`.

Invoke the stardust replica skill:
  Skill: stardust:replica
Arguments: https://<DOMAIN> --pages <SLUGS>
(bounded mode — recreate ONLY those pages; no site-wide rollout)

Follow stardust:replica exactly. It extracts, recreates, runs its source-fidelity gate,
migrates and deploys those pages to the branch <BRANCH> on repo <OWNER>/<REPO>.

On success, write the done-file so Stage 3's site-integration track can proceed:
  echo '{"stage":2,"status":"done"}' > <stateDir>/replica-done.json

End with the JSON status block:
​```json
{"step": 2, "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
​```
​```
```

(Replace `​` guards with real backticks.)

- [ ] **Step 3: Update model-assignment + fan-out sections**

Delete the per-step model table rows for steps 2–5 that referenced the retired skills, and replace "## Model assignment per step" with a 3-stage note:

```markdown
## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives both later stages.
- Stage 2 (replica): `opus` — the replica invocation must follow a complex multi-phase skill precisely.
- Stage 3 (adopt-site): adopt-site assigns models per its OWN model table (Opus only for OF1 styling; Sonnet for the rest). The orchestrator passes no per-step model here.
```

Delete the now-obsolete "### Step 6 fan-out detail", "### Pre-fan-out: capture visual references", and "### Step 8 split" subsections — that logic now lives inside `of1-adopt-existing-site`.

- [ ] **Step 4: Remove the inline Step 11 / Step 12 sections**

Delete "## Step 11 — Config review (inline, no Agent)" and "## Step 12 — Deploy (inline)" — both now belong to adopt-site. Replace with:

```markdown
## Stages 11–12 (config review + deploy)

Owned by `of1-adopt-existing-site` (its Step 11 inline + Step 12 deploy). The CC orchestrator
does not run them directly.
```

- [ ] **Step 5: Verify no retired-skill references + syntax sanity**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -nE 'of1-extract-design-tokens|of1-build-prototypes|of1-convert-to-eds' skills/of1-demo-orchestrator-cc/SKILL.md && echo "FAIL: still references retired skills" || echo "OK: no retired-skill references"
grep -q 'stardust:replica' skills/of1-demo-orchestrator-cc/SKILL.md && echo "OK: invokes replica"
grep -q 'OF1_REPLICA_DONE_FILE' skills/of1-demo-orchestrator-cc/SKILL.md && echo "OK: passes done-file"
```
Expected: `OK: no retired-skill references`, `OK: invokes replica`, `OK: passes done-file`.

- [ ] **Step 6: Commit**

```bash
git add skills/of1-demo-orchestrator-cc/SKILL.md
git commit -m "$(printf 'refactor(orchestrator-cc): collapse to 3 stages + delegate stage 3 to adopt-site\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Rewrite the SLICC orchestrator to 3 stages

**Files:**
- Modify: `skills/of1-demo-orchestrator/SKILL.md`

**Interfaces:**
- Consumes: `narrative.json` (Task 1), adopt-site pipeline mode (Task 3).
- Produces: `/shared/of1-demo-orchestrator/replica-done.json` when the Stage 2 scoop finishes.

- [ ] **Step 1: Replace "How It Works" with the 3-stage model**

In `skills/of1-demo-orchestrator/SKILL.md`, replace the "## How It Works" numbered list (~lines 11–21) with:

```markdown
## How It Works

1. The sprinkle shows THREE stages: Collect, Replica, OF1 integration.
2. User enters a domain and runs the pipeline.
3. Stage 1 (`of1-discover-narrative`) scoop → `narrative.json` (keyPages/focus/persona).
4. Stages 2 and 3 launch as scoops CONCURRENTLY:
   - Stage 2: `stardust:replica <URL> --pages <slugs>` → EDS site + DESIGN.json → writes
     `/shared/of1-demo-orchestrator/replica-done.json` on completion.
   - Stage 3: `of1-adopt-existing-site` with `OF1_PIPELINE_MODE=1`, `OF1_CONTENT_SOURCE=<domain>`,
     `OF1_REPLICA_DONE_FILE=/shared/of1-demo-orchestrator/replica-done.json`. Adopt-site owns
     steps 6–12 and their parallelism; it runs its content track immediately and gates the
     site-integration track on the done-file.
5. Stage 3 emits its own step-level sub-progress; the sprinkle renders it under the OF1-integration stage.
```

- [ ] **Step 2: Replace the dependency graph, model table, and per-step fan-out**

Delete the SLICC-specific step-6 fan-out, step-8 split, "Parallelism — CRITICAL", and "When to spawn what" sections that duplicate the old 12-step orchestration (they now live in adopt-site). Replace the whole block from "## Lick Events → run:" fan-out through "### Step 8 split detail" with a Stage-2/Stage-3 dispatch section mirroring the CC orchestrator's Phase 2, using `scoop_scoop()`:

```markdown
## Dispatch (3 stages)

- **Stage 1:** one scoop `of1-s1-discovery` (model `claude-opus-4-8`) → await → read `narrative.json`,
  build the comma-separated slug list.
- **Stages 2 + 3 in the same turn (two scoops):**
  - `of1-s2-replica` (model `claude-opus-4-8`, writablePaths incl. the repo + `/shared/`): invoke
    `stardust:replica https://<DOMAIN> --pages <SLUGS>`; on success write
    `/shared/of1-demo-orchestrator/replica-done.json`.
  - `of1-s3-adopt` (writablePaths incl. repo + `/shared/`, env: `OF1_PIPELINE_MODE=1`,
    `OF1_CONTENT_SOURCE=<DOMAIN>`, `OF1_REPLICA_DONE_FILE=/shared/of1-demo-orchestrator/replica-done.json`):
    invoke `of1-adopt-existing-site`. It manages its own internal scoop fan-out for steps 6–12.
- Handle completions event-driven (no sleep-poll). Push each stage's status to the sprinkle as it arrives.

**HARD RULE:** do NOT re-implement steps 6–12 here — Stage 3 is a single delegation to adopt-site.
```

- [ ] **Step 3: Update the "Step → Skill Mapping" and "Deliverable URLs" tables**

Replace the 12-row Step→Skill table with a 3-stage table:

```markdown
## Stage → Skill Mapping

| Stage | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Collect | `of1-discover-narrative` | setup |
| 2 | Replica | `stardust:replica --pages` | stage 1 (keyPages) |
| 3 | OF1 integration | `of1-adopt-existing-site` (pipeline mode) | stage 1; site-track also on replica-done |
```

Keep the deliverable-URL table but drop rows for retired steps (prototype/brand-review); adopt-site emits its own deliverable URLs for its sub-steps.

- [ ] **Step 4: Verify**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -nE 'of1-extract-design-tokens|of1-build-prototypes|of1-convert-to-eds' skills/of1-demo-orchestrator/SKILL.md && echo "FAIL: retired refs remain" || echo "OK: no retired refs"
grep -q 'stardust:replica' skills/of1-demo-orchestrator/SKILL.md && echo "OK: invokes replica"
grep -q 'replica-done.json' skills/of1-demo-orchestrator/SKILL.md && echo "OK: done-file wired"
```
Expected: `OK: no retired refs`, `OK: invokes replica`, `OK: done-file wired`.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-demo-orchestrator/SKILL.md
git commit -m "$(printf 'refactor(orchestrator-slicc): collapse to 3 stages + delegate stage 3 to adopt-site\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Update the SLICC sprinkle UI to 3 top-level stages

**Files:**
- Modify: `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml`

**Interfaces:**
- Consumes: `sprinkle send` status messages. Top level = 3 stages; Stage 3 renders adopt-site's sub-step statuses beneath it.

- [ ] **Step 1: Read the current STEPS definition and render loop**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n 'STEPS\s*=\|var STEPS\|const STEPS\|function render\|state.steps' skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml | head
```
Expected: lines showing the `STEPS` array + render functions (around lines 797–1050 per prior inspection).

- [ ] **Step 2: Redefine `STEPS` as 3 stages with nested sub-steps**

Replace the `STEPS` array definition with a 3-stage structure. Each stage has an optional `subSteps` list; Stage 3's sub-steps are adopt-site's (templates, styling, brand, content, suggestions, CTA, config, deploy):

```javascript
var STEPS = [
  { id: 1, name: 'Collect',         key: 'collect' },
  { id: 2, name: 'Replica',         key: 'replica' },
  { id: 3, name: 'OF1 integration', key: 'of1',
    subSteps: [
      { key: 'brand',    name: 'Brand voice' },
      { key: 'content',  name: 'Content' },
      { key: 'suggest',  name: 'Suggestions' },
      { key: 'templates',name: 'Templates' },
      { key: 'styling',  name: 'OF1 styling' },
      { key: 'cta',      name: 'CTA' },
      { key: 'config',   name: 'Config review' },
      { key: 'deploy',   name: 'Deploy' }
    ] }
];
```

- [ ] **Step 3: Update the render + status-apply logic**

Update the render loop to draw 3 stage rows, and when a status message carries a `subStep` key
matching Stage 3, render it under Stage 3 instead of as a top-level row. Change the status-apply
handler (the block near the old `data.step` numeric handler) to accept either `{stage, status}`
(top-level) or `{stage:3, subStep:"templates", status}` (sub-progress). Remove the old two-track
parallel-layout rendering (linear steps + tracks) — the 3-stage model doesn't use it.

Minimal apply logic:
```javascript
if (typeof data.stage === 'number') {
  var s = state.steps[data.stage - 1];
  if (data.subStep && s.subSteps) {
    var ss = s.subSteps.find(function(x){ return x.key === data.subStep; });
    if (ss) ss.status = data.status;
  } else {
    s.status = data.status;
    if (data.deliverables) s.deliverables = data.deliverables;
  }
  renderSteps();
}
```

- [ ] **Step 4: Verify the sprinkle is still valid HTML/JS**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
# Extract the main <script> and syntax-check it
node -e "const fs=require('fs');const h=fs.readFileSync('skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');require('vm').compileFunction(m);console.log('OK: sprinkle JS parses')"
grep -q "OF1 integration" skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml && echo "OK: 3-stage labels present"
```
Expected: `OK: sprinkle JS parses` and `OK: 3-stage labels present`. (If `compileFunction` rejects browser globals, fall back to `bash -n`-style manual review — the check is that there is no syntax error in the extracted script.)

- [ ] **Step 5: Commit**

```bash
git add skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml
git commit -m "$(printf 'feat(sprinkle): 3-stage top-level UI with adopt-site sub-progress under stage 3\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: Update dependency checker (`verify.sh` + SKILL.md)

**Files:**
- Modify: `skills/of1-check-dependencies/scripts/verify.sh`
- Modify: `skills/of1-check-dependencies/SKILL.md`

**Interfaces:**
- Produces: a passing dependency check that requires the 9 surviving OF1 skills + `stardust` (incl. `replica`) + `impeccable`.

- [ ] **Step 1: Update `REQUIRED_SKILLS` in verify.sh**

In `skills/of1-check-dependencies/scripts/verify.sh`, replace the `REQUIRED_SKILLS` array (lines 56–61) — remove the three retired skills:

```bash
REQUIRED_SKILLS=(
  of1-discover-narrative of1-build-templates of1-style-generative-block
  of1-extract-brand-voice of1-extract-content of1-build-quick-suggestions
  of1-build-cta-template of1-generate-config-review of1-publish
  of1-adopt-existing-site
)
```

Update the success message on line 88 from `"All 12 OF1 step skills present"` to `"All 10 OF1 skills present"`.

- [ ] **Step 2: Add a `stardust:replica` presence check**

The existing check verifies the `stardust` plugin is installed. After it, add an assertion that the `replica` skill specifically resolves (it's newer than some cached stardust versions):

```bash
# ---------- stardust:replica (Stage 2 depends on it) ----------
if find "${SKILL_ROOTS[@]}" -path "*/skills/replica/SKILL.md" 2>/dev/null | grep -q .; then
  ok "stardust:replica present"
else
  fail "stardust:replica skill not found — Stage 2 requires it. Update the stardust plugin: $(fix_cmd '/plugin update stardust' 'upskill adobe/skills --path plugins/stardust --all')"
fi
```

- [ ] **Step 3: Update the SKILL.md skill-count references + cleanup list**

In `skills/of1-check-dependencies/SKILL.md`: change "The 12 OF1 step skills" (line 36) to "The 10 OF1 skills"; update the example list to drop the retired names and add `of1-adopt-existing-site`; add `stardust:replica` to the stardust bullet (line 37). Leave the `rm -rf` cleanup block (line 113) as-is — it removes generated artifacts (`stardust/`, `deliverables/`, etc.), not skills.

- [ ] **Step 4: Verify verify.sh runs and reflects the new set**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
bash -n skills/of1-check-dependencies/scripts/verify.sh && echo "OK: verify.sh syntax"
grep -q 'of1-extract-design-tokens\|of1-build-prototypes\|of1-convert-to-eds' skills/of1-check-dependencies/scripts/verify.sh && echo "FAIL: retired skills still required" || echo "OK: retired skills removed"
grep -q 'replica' skills/of1-check-dependencies/scripts/verify.sh && echo "OK: replica checked"
```
Expected: `OK: verify.sh syntax`, `OK: retired skills removed`, `OK: replica checked`.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-check-dependencies/scripts/verify.sh skills/of1-check-dependencies/SKILL.md
git commit -m "$(printf 'chore(check-deps): drop 3 retired skills, require stardust:replica\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: Delete the SLICC workflow file

**Files:**
- Delete: `workflows/of1-demo-slicc.js`

**Interfaces:**
- Removes the SLICC workflow file entirely — the 12-step logic it encoded is superseded by the 3-stage orchestrators (Tasks 4/5). Dropping it now (rather than rewriting) avoids maintaining a third copy of the pipeline while the orchestrators are the source of truth. Can be re-added later against the new 3-stage model if a headless/cron workflow is needed.

- [ ] **Step 1: Confirm nothing references the workflow**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -rn 'of1-demo-slicc' --include='*.md' --include='*.js' --include='*.sh' --include='*.shtml' \
  . | grep -v 'docs/superpowers/' | grep -v 'workflows/of1-demo-slicc.js'
```
Expected: **no output** (only the file itself + historical docs mention it).

- [ ] **Step 2: Delete the workflow file**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
git rm workflows/of1-demo-slicc.js
# remove the workflows/ dir too if now empty
rmdir workflows 2>/dev/null || true
```

- [ ] **Step 3: Verify it's gone**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
ls workflows/of1-demo-slicc.js 2>/dev/null && echo "FAIL: still present" || echo "OK: workflow deleted"
```
Expected: `OK: workflow deleted`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(printf 'chore: drop SLICC workflow — superseded by 3-stage orchestrators\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: Delete retired skills + update README

**Files:**
- Delete: `skills/of1-extract-design-tokens/`, `skills/of1-build-prototypes/`, `skills/of1-convert-to-eds/`
- Modify: `README.md`

- [ ] **Step 1: Confirm nothing still references the three skills**

Run (must come back clean before deleting):
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -rnE 'of1-extract-design-tokens|of1-build-prototypes|of1-convert-to-eds' \
  --include='*.md' --include='*.js' --include='*.sh' --include='*.shtml' \
  . | grep -v 'docs/superpowers/' | grep -v '^Binary'
```
Expected: **no output** (docs/superpowers specs/plans may mention them historically — those are fine). If any live reference remains, fix it before continuing.

- [ ] **Step 2: Delete the three skill directories**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
git rm -r skills/of1-extract-design-tokens skills/of1-build-prototypes skills/of1-convert-to-eds
```

- [ ] **Step 3: Rewrite the README pipeline flow + skills table**

In `README.md`, replace the "## Pipeline Flow" ASCII diagram + the step table (lines 5–39) with the 3-stage diagram, and remove the three retired skills from the "## Skills" table (lines 41–60). Add:

```markdown
## Pipeline Flow

```
Stage 1 · Collect        of1-discover-narrative → narrative.json (keyPages, focus)
                                   │
        ┌──────────────────────────┴──────────────────────────┐
Stage 2 · Replica                              Stage 3 · OF1 integration
stardust:replica --pages                       of1-adopt-existing-site (pipeline mode)
→ EDS site + DESIGN.json                        content track ∥ replica; site track after
        └──────────────────────────┬──────────────────────────┘
                              (adopt-site owns deploy)
```

| Stage | Skill | Notes |
|-------|-------|-------|
| 1 Collect | `of1-discover-narrative` | Emits `narrative.json` (keyPages drive Stage 2) |
| 2 Replica | `stardust:replica --pages` | Bounded same-design migration; no site-wide rollout |
| 3 OF1 integration | `of1-adopt-existing-site` | Pipeline mode: live content source + replica-done gate |
```

Update the Prerequisites section's `stardust` line to note `stardust:replica` is required.

- [ ] **Step 4: Verify the repo is consistent**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
ls skills/ | grep -E 'extract-design-tokens|build-prototypes|convert-to-eds' && echo "FAIL: dirs remain" || echo "OK: dirs deleted"
grep -rnE 'of1-extract-design-tokens|of1-build-prototypes|of1-convert-to-eds' README.md && echo "FAIL: README refs" || echo "OK: README clean"
bash skills/of1-check-dependencies/scripts/verify.sh 2>&1 | grep -iE 'OF1 skills|replica' | head
```
Expected: `OK: dirs deleted`, `OK: README clean`, and the verify output showing the new skill-count + replica lines (a full pass depends on a real repo/token env, so just confirm those two lines look right).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(printf 'chore: delete retired extract/prototype/convert skills; README to 3 stages\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:**
- D1 (replica in Stage 2) → Tasks 4, 5, 8. ✓
- D2 (bounded `--pages`) → Tasks 4/5 dispatch templates + Task 3 Step 3 (bounded DESIGN.json). ✓
- D3 (narrative drives scope + focus) → Task 1 (`keyPages`, `focus`, `persona`). ✓
- D4 (delegate to adopt-site) → Tasks 3, 4, 5. ✓
- D5 (live content source in pipeline mode) → Task 2 + Task 3. ✓
- D6 (content track parallel with replica) → Task 3 Step 2 + Tasks 4/5 concurrent dispatch. ✓
- D7 (templates/styling/CTA after join) → Task 3 Step 2 site-integration gate. ✓
- D8 (adopt-site owns parallelism; replica-done gate) → Task 3 + Tasks 4/5 done-file. ✓
- D9 (keep two orchestrators) → Tasks 4 & 5 separately. ✓
- D10 (3-stage UI + sub-progress) → Task 6. ✓
- D11 (branch) → Global Constraints. ✓
- Seams 1–4 → Tasks 1, 3, 2, (3+4+5) respectively. ✓
- Retired skills → Tasks 7 (deps), 9 (delete + README). Workflow dropped → Task 8. ✓

**Placeholder scan:** No "TBD/TODO". The `​`-guarded fences are an authoring device explicitly explained in each task ("replace with real backticks") because the plan itself is Markdown containing nested Markdown code blocks. Verification commands are concrete. ✓

**Type/name consistency:** `narrative.json` keys (`keyPages`, `slug`, `focus`, `persona`), env vars (`OF1_PIPELINE_MODE`, `OF1_CONTENT_SOURCE`, `OF1_REPLICA_DONE_FILE`, `OF1_CONTENT_SOURCE`), and the done-file path (`<stateDir>/replica-done.json` CC, `/shared/of1-demo-orchestrator/replica-done.json` SLICC) are used consistently across Tasks 1–8. ✓

**Note for the implementer:** several tasks edit prose-heavy `SKILL.md` files whose exact line numbers may have drifted; the verification `grep`s are the source of truth for "done," not the cited line numbers. Read the target section before editing.
```