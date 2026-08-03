---
name: of1-demo-orchestrator
description: SLICC orchestrator that turns a website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, run as 3 stages via a sprinkle UI and scoop dispatch — discover a narrative and focus pages, recreate those pages as a branded EDS replica via stardust:replica, then delegate OF1 integration (content, styling, config review, deploy) to of1-adopt-existing-site. Use when the user asks to build or demo an OF1 personalization site for a domain, or says "one shot a demo of <domain>".
user-invocable: true
---

# OF1 Demo — Orchestrator

Lightweight orchestrator that opens the demo pipeline sprinkle and dispatches step skills based on user interactions.

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

## Setup

Open the sprinkle:

```
scoop_scoop({
  name: "of1-demo-orchestrator",
  writablePaths: ["/scoops/of1-demo-orchestrator/", "/shared/sprinkles/of1-demo-orchestrator/"],
  prompt: "You own the sprinkle 'of1-demo-orchestrator'. Copy /workspace/skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml to /shared/sprinkles/of1-demo-orchestrator/of1-demo-orchestrator.shtml, then run: sprinkle open of1-demo-orchestrator. Stay ready for feed_scoop updates."
})
```

The sprinkle must be open and receiving updates throughout the demo. After each step completes, push the status to it via `sprinkle send of1-demo-orchestrator '<json>'`.

## Lick Events

The sprinkle sends licks as a single `action` string with colon-delimited fields.

### `set-domain:<domain>`
User entered the target domain. Store it for all subsequent steps.

**IMPORTANT:** Setting a new domain automatically resets ALL step states (pending, no deliverables, no summaries). The sprinkle handles this client-side — when `data.domain` differs from `state.domain`, all steps are wiped clean. This means:
- The orchestrator MUST always send `set-domain` FIRST before pushing any step statuses for a new run.
- No manual reset of individual steps is needed — the domain change handles it.
- Quick links are also cleared because they derive from step deliverables.

### `run:<domain>`
User entered a domain and started the pipeline. Dispatch Stage 1.

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

**Required model versions:**
- `claude-opus-4-8` → must resolve to Opus 4.8 (`us.anthropic.claude-opus-4-8`)
- `claude-sonnet-5` → must resolve to Sonnet 5 1M context (`us.anthropic.claude-sonnet-5`)

### Stage 1 dispatch

```
scoop_scoop({
  name: "of1-s1-discovery",
  model: "claude-opus-4-8",
  writablePaths: ["/scoops/of1-s1-discovery/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

The system prompt MUST include — in this order:

```
## STEP 1 — MANDATORY (do this FIRST, before anything else)

Run: read_file /workspace/skills/of1-discover-narrative/SKILL.md
Then follow those instructions EXACTLY. Do NOT improvise your own implementation.
If you skip this step, your output WILL be rejected by the verification gates.

## Project context

- Domain: {DOMAIN}
- Branch: {BRANCH}
- Repo: /workspace/of1-demo-orchestrator (owner and repo read from repo-config.json)
- State dir: /shared/of1-demo-orchestrator
- repo-config.json: /shared/of1-demo-orchestrator/repo-config.json (read it for all paths)

## Output contract

Write status to /shared/of1-demo-orchestrator/step-2-status.json (the skill's own
Completion section already documents this exact filename/shape):
{"step":2,"status":"review","deliverables":[{"url":"...","label":"..."}],"summary":"..."}
Also write /shared/of1-demo-orchestrator/narrative.json per the skill's §4b.
Do NOT call sprinkle send — only the orchestrator cone does that.
```

After Stage 1 returns, read `narrative.json` and build:

```bash
NARRATIVE=$(cat /shared/of1-demo-orchestrator/narrative.json)
SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)
DOMAIN=$(jq -r .domain <<<"$NARRATIVE")
```

### Stage 2 + Stage 3 dispatch (same orchestrator turn)

```
scoop_scoop({
  name: "of1-s2-replica",
  model: "claude-opus-4-8",
  writablePaths: ["/scoops/of1-s2-replica/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

Stage 2's prompt: invoke `stardust:replica https://<DOMAIN> --pages <SLUGS>` (bounded mode —
recreate ONLY those pages). Follow it exactly; it extracts, recreates, runs its source-fidelity
gate, migrates and deploys those pages to the branch on the repo. On success, write the done-file:

```bash
echo '{"stage":2,"status":"done"}' > /shared/of1-demo-orchestrator/replica-done.json
```

End with the same JSON status block shape as other steps (`{"step":2,...}`) — the sprinkle
renders it under the Replica stage.

```
scoop_scoop({
  name: "of1-s3-adopt",
  writablePaths: ["/scoops/of1-s3-adopt/", "/shared/", "/workspace/{REPO_NAME}/"],
  env: {
    OF1_PIPELINE_MODE: "1",
    OF1_CONTENT_SOURCE: "<DOMAIN>",
    OF1_REPLICA_DONE_FILE: "/shared/of1-demo-orchestrator/replica-done.json"
  }
})
```

Stage 3's prompt: invoke the `of1-adopt-existing-site` skill and follow it exactly. It owns its
own internal scoop fan-out for steps 6–12 (content track runs immediately; site-integration
track gates on `OF1_REPLICA_DONE_FILE` existing). Do NOT pass a `model` — adopt-site assigns
models per its own table (Opus only for OF1 styling; Sonnet for the rest).

### Handling scoop completions (event-driven, NOT polling)

When Stage 2 and Stage 3 are running in parallel, you receive a lick/notification each time one
completes. On each notification:

1. Read the completed scoop's status/deliverable output.
2. Push it to the sprinkle immediately: `sprinkle send of1-demo-orchestrator '<json>'` — do NOT
   batch Stage 2 and Stage 3 completions together.
3. Once BOTH Stage 2 and Stage 3 report done, the pipeline is complete (adopt-site owns the
   internal join + deploy inside Stage 3).

**Do NOT use `while/sleep` polling loops.** They block your turn, burn compute, and prevent you
from receiving other licks (user input, parallel scoop completions). The platform notifies you —
just yield and wait.

Only the of1-demo-orchestrator cone may call `sprinkle send`. Step scoops write files; the cone
reads them and pushes to the sprinkle.

## scoop_wait timeout policy

When using `scoop_wait` for long-running stages (Stage 2 replica, Stage 3 adopt-site), always set a generous timeout:

```
scoop_wait({ scoop_names: ["of1-s3-adopt"], timeout_ms: 1800000 })  // 30 minutes
```

**Critical:** `timeout_ms` does NOT kill the scoop. It only wakes up the cone. When the timeout fires:

1. **Do NOT immediately `drop_scoop`.** The scoop is likely still working.
2. Check if the expected output files exist (e.g. `ls stardust/current/` for Stage 2, or `ls of1/config/` for Stage 3's content track).
3. If files exist but the status file doesn't: the scoop is in its final steps (commit/push/status-write) — wait another minute or let the scoop-notify lick arrive naturally.
4. Only `drop_scoop` if the scoop has been silent for 5+ minutes AND produced no output files.

**There is no hard scoop execution timeout in SLICC.** Scoops run until they finish (or you drop them). The 30-minute `scoop_wait` is just the cone's patience threshold — set it generously and never drop a working scoop.

### `approve:<step>:<domain>`
User approved a review-gated sub-step surfaced by Stage 3. The sprinkle auto-marks it done. No action needed unless the next sub-step should auto-start (adopt-site owns that dependency logic internally).

### `revise:<step>:<domain>`
User wants changes to a Stage 3 sub-step. Ask in chat what they want different, then re-dispatch Stage 3 (or, if adopt-site exposes per-sub-step re-run, target just that sub-step) with their feedback appended to the prompt.

### `reset`
User reset the pipeline. Clean up any running scoops.

## One-Shot Mode

When the user says **"one shot"** (or "one-shot", "oneshot"), run the ENTIRE pipeline end-to-end without any user interaction. This means:

1. **Zero approval gates** — every review step (including Stage 3's internal sub-steps) is auto-approved instantly
2. **All deliverables still generated** — discovery.html, the EDS replica, config-review.html, gallery, demo hub — everything gets built and committed (Stage 3 owns its own pre-launch checklist internally)
3. **Sprinkle still updated** — push Stage 1/2/3 statuses with deliverable URLs so the user can review anything after the fact
4. **Stages 2 + 3 dispatch concurrently** — no serializing what the 3-stage model says is parallel

The pipeline should complete in one uninterrupted flow. The user will review the finished demo, not intermediate steps.

**Trigger:** User says "one shot a demo of X" or "one-shot demo for X.com" or similar.

## Auto-Approve (Default Behavior)

**By default, auto-approve all review steps and immediately proceed.** Do NOT wait for user confirmation between steps unless the user explicitly says "pause" or "wait for my review."

When a step finishes with `"status":"review"`:
1. Push the review status to the sprinkle (so the user CAN review if they want)
2. **Immediately treat it as approved** and proceed to the next step
3. If the user later clicks "Revise" in the sprinkle, handle it reactively

This means the full pipeline runs end-to-end without stopping. The user can always retroactively revise any step.

**One-shot mode and auto-approve are the same behavior** — the term "one shot" just makes the intent explicit from the start so the orchestrator never hesitates.

## Deliverable URLs — ALWAYS Include Them

When pushing ANY stage status to the sprinkle (whether `"done"` or `"review"`), ALWAYS include a `deliverable` URL. The sprinkle's Quick Links section uses these URLs. Statuses pushed without a `deliverable` field result in greyed-out quick links.

**Required deliverable URLs by stage:**

| Stage | Deliverable URL |
|------|----------------|
| 1 — Collect | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 2 — Replica | `https://{branch}--{repo}--{owner}.aem.page/home` |
| 3 — OF1 integration | adopt-site emits its own deliverable URLs per sub-step (gallery, `/of1`, config-review.html, final deploy index) — pass those through as-is; do not invent a single URL for the whole stage. |

## Stage → Skill Mapping

| Stage | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Collect | `of1-discover-narrative` | setup |
| 2 | Replica | `stardust:replica --pages` | stage 1 (keyPages) |
| 3 | OF1 integration | `of1-adopt-existing-site` (pipeline mode) | stage 1; site-track also on replica-done |

Stages 2 and 3 dispatch concurrently once Stage 1 returns `narrative.json`. Stage 3's content
track (brand voice, content metadata, suggestions) starts immediately; its site-integration
track (templates, styling, config review, deploy) gates on Stage 2's `replica-done.json`. Both
gating decisions and the internal step graph for steps 6–12 live inside `of1-adopt-existing-site`
— this orchestrator does not reimplement them.

## Repo Setup — Verify dependencies + repo state

Setup verifies prerequisites AND repo state (see the `of1-check-dependencies` skill). It does NOT create a branch — it uses whatever branch is currently checked out at `OF1_DEMO_REPO`.

This runs inline in the orchestrator's own context before Stage 1 dispatches, and outputs `/shared/of1-demo-orchestrator/repo-config.json` which all subsequent stage scoops use:
```json
{
  "owner": "<org>",
  "repo": "<repo>",
  "branch": "<current-branch>",
  "contentPrefix": "<current-branch>",
  "repoUrl": "https://github.com/<org>/<repo>",
  "previewUrl": "https://<current-branch>--<repo>--<org>.aem.page/",
  "daSource": "da://<org>/<repo>",
  "repoDir": "/workspace/of1-demo-orchestrator",
  "domain": "frescopa.coffee"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to find the git repo (`repoDir`)
- Which branch to work on (`branch`)
- The DA mount source (`daSource`)
- The EDS preview URL (`previewUrl`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs

## Pixel Fidelity — Owned by Stage 2 (stardust:replica)

The orchestrator no longer runs its own screenshot-diff loop or pixel-perfect-copy rules. Stage 2
(`stardust:replica`) owns source-fidelity validation for the recreated pages internally (its own
comparison/fix loop against the live site). The orchestrator's job is only to invoke it correctly
and wait for its result — do not reimplement its visual-fidelity checks here.

## Scoop Naming

Name stage scoops: `of1-s1-discovery`, `of1-s2-replica`, `of1-s3-adopt`. This keeps them short and
identifiable. Stage 3 (`of1-adopt-existing-site`) names its own internal sub-step scoops.

## Context Passing Between Stages

- **Setup** needs: an EDS repo checked out at `OF1_DEMO_REPO` on the branch to use. Verifies prerequisites + repo state and outputs `repo-config.json`. Does NOT create a branch.
- **Stage 1 (Collect)** needs: domain. Produces `narrative.json` (`keyPages[]`, `focus`, `persona`) and `discovery.html`.
- **Stage 2 (Replica)** needs: domain + the comma-separated slug list built from Stage 1's `keyPages[].slug`. Produces the EDS replica (pages, blocks, DESIGN.json) and, on success, `replica-done.json`.
- **Stage 3 (OF1 integration)** needs: domain, `repo-config.json`, `OF1_CONTENT_SOURCE=<domain>` (for its content track), and `OF1_REPLICA_DONE_FILE` (to gate its site-integration track on Stage 2). It reads `DESIGN.json` from Stage 2's output once the done-file exists. Everything downstream of that — templates, OF1 styling, brand voice, content metadata, suggestions, CTA template, config review, and deploy — is internal to adopt-site; this orchestrator does not pass it any other per-sub-step context.

When dispatching a stage scoop, read the relevant prior outputs and include key info in the prompt (or instruct the scoop to read specific files).

## Iteration

If a stage fails or the user requests revisions:
1. The sprinkle shows Retry/Revise button
2. User clicks it → lick with `run:<domain>` (retry Stage 1) or `revise:<step>:<domain>` (needs feedback, targets a Stage 3 sub-step)
3. Re-spawn the stage scoop with the same prompt + any user feedback
4. The scoop can read prior outputs and iterate on them

## Pipeline audit

After the pipeline finishes (or aborts), write a structured audit to `/shared/of1-demo-orchestrator/pipeline-audit.json`. This gives cost/time visibility per run and a feedback loop for iterating on skill quality.

Only the 3 top-level scoops the orchestrator itself dispatches are recorded here (Stage 1, Stage 2, Stage 3). Stage 3 (`of1-adopt-existing-site`) is a single black-box dispatch from the orchestrator's point of view — its internal sub-steps (templates, styling, brand voice, content, suggestions, CTA, config review, deploy) are owned and audited by adopt-site itself, not by this file.

### What to record per stage

For each stage scoop, record timing and status when the status file appears:

```bash
# When dispatching a stage:
STAGE_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# When the scoop's completion notification arrives:
STAGE_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STAGE_DURATION_MS=$(( $(date +%s -d "$STAGE_END") - $(date +%s -d "$STAGE_START") ))
```

If `list_scoops` output includes token counts for the scoop, capture those too. Otherwise record `null` — duration alone is valuable.

| Field | Source |
|---|---|
| `stage` | Stage number (1, 2, or 3) |
| `name` | Stage name (`discovery`, `replica`, `adopt-site`) |
| `model` | Model assigned to this dispatch |
| `startedAt` | Timestamp when `scoop_scoop()` was called |
| `completedAt` | Timestamp when the status file appeared |
| `durationMs` | Wall-clock between dispatch and status-file arrival |
| `totalTokens` | From `list_scoops` if available; otherwise `null` |
| `status` | From the stage's status JSON (`done` / `review` / `failed`) |
| `summary` | From the stage's status JSON |
| `retries` | Number of retries (0 if first-pass success) |
| `error` | If failed: the failure message. Otherwise `null` |

### Capture skill version at pipeline start

Before the first dispatch, record the git hash of the skill plugin:

```bash
SKILL_PLUGIN_DIR="/workspace/skills"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

### Audit file shape

Write `/shared/of1-demo-orchestrator/pipeline-audit.json`:

```json
{
  "domain": "<DOMAIN>",
  "skillVersion": "<git short hash>",
  "skillBranch": "<branch name>",
  "startedAt": "<ISO>",
  "completedAt": "<ISO>",
  "totalDurationMs": <wall-clock>,
  "totalTokens": <sum or null if unavailable>,
  "stageCount": <dispatches including retries>,
  "stages": [ ... ],
  "improvements": [ ... ]
}
```

### Improvements section

After writing the stage data, analyze the run and append an `improvements` array. For each stage that had issues — retries, unexpectedly long duration (>3× expected), or a `failed`/`review` status that was recovered — write a brief, actionable observation. Since Stage 3 is a black box, its "issue" can only describe what was observable from the outside (timing, retries, the returned status/summary) — not its internal sub-step behavior:

```json
{
  "improvements": [
    {
      "stage": 2,
      "issue": "Replica took 22 min (2× expected) for 5 pages — stardust:replica's source-fidelity gate rejected the first render on 2 of 5 pages, forcing a re-render pass",
      "suggestion": "Pass tighter page-selection guidance from Stage 1 (avoid pages with heavy client-side interactivity) so stardust:replica's first render is more likely to pass its fidelity gate"
    }
  ]
}
```

Rules:
- Only include stages with actual problems (retries, failures, duration >3× expected)
- Be specific: name the exact behavior that went wrong (to the extent observable — Stage 3's internals are opaque)
- Each `suggestion` should be a concrete change to a skill or dispatch prompt
- If the run was clean: `"improvements": []` — don't invent issues
- This section is for pipeline-level learning; skill-level bugs (including those inside adopt-site's internal steps) should be filed as skill edits, not left as audit notes

### When to write

1. After Stage 3's scoop returns `done` (success path)
2. If the pipeline aborts (partial audit is still useful)

Push the audit file to the sprinkle as a final event so the user can access it:
```bash
sprinkle send of1-demo-orchestrator '{"type":"audit","file":"/shared/of1-demo-orchestrator/pipeline-audit.json"}'
```

## Completion

After Stage 3's scoop returns `done`, all three stages show green. The sprinkle stays open as a reference with all URLs and status. Stage 3's internal deploy + pre-launch checklist (owned by `of1-adopt-existing-site`) is what actually gates its own `done` status — the orchestrator does not run any pre-launch checks itself.

## Reference — pitfalls & schemas

The cross-cutting DA/EDS/git/image/logo rules are NOT restated here. Each stage scoop reads its own skill (which owns those rules), and the durable versions live in:

- **`knowledge/common-pitfalls.md`** — DA content authoring, image handling, brand logo, URL patterns, curl traps, git workflow, runtime-specific traps (`[SLICC]`/`[CC]` tagged), DA+EDS preview auth, and the allowed-domain table. Consult it whenever you (or a scoop) hit a DA/EDS/upload issue.
- **`knowledge/worker-config-schemas.md`** — the JSON schemas for every `of1/config/*.json` file (brand-voice, products, personas, use-cases, features, faqs, suggestions, cta-template, templates catalog). Useful for context when a Stage 3 sub-step's output needs review; adopt-site validates these itself at its own config-review step.

## Orchestrator inline-execution notes (SLICC-specific)

This orchestrator itself no longer runs step-level inline work (config review, pre-launch checklist, screenshot diff loops) — those moved into `of1-adopt-existing-site` (Stage 3) and `stardust:replica` (Stage 2). The notes below apply only to what the cone itself still does inline: reading `narrative.json`, building the slug list, and pushing sprinkle status.

1. **`set -o pipefail` is not supported** — don't run scripts that use it. Execute commands manually.
2. **No python3 in SLICC** — for any inline JSON handling, use `run_jsh`, `node -e`, or `jq`, not `python3 << 'EOF'` heredocs.
3. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else (e.g. "approved", "running", "complete") corrupts the UI state.

For the IMS token, DA upload commands, and preview-trigger curls used by the stage skills, follow `knowledge/common-pitfalls.md` §5, §7, §8 (they carry both the `[SLICC]` and `[CC]` variants).
