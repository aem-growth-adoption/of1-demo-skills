---
name: of1-demo-orchestrator-cc
description: "Claude Code ONLY orchestrator that turns a website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, run as 3 stages: discover a narrative and focus pages, recreate those pages as a branded EDS replica via stardust:replica, then delegate OF1 integration (content, styling, config review, deploy) to of1-adopt-existing-site. Use when the user asks to build or one-shot an OF1 demo for a domain while running in Claude Code. DO NOT USE IN SLICC — use of1-demo-orchestrator instead."
user-invocable: false
---

# OF1 Demo — Claude Code Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services. 3 stages: discovery, replica, and OF1 integration (delegated to `of1-adopt-existing-site`). Auto-approves by default; user can interrupt to revise any step.

**🚫 SLICC HARD GATE: This skill is ONLY for Claude Code. If you are running in SLICC, STOP IMMEDIATELY and use the `of1-demo-orchestrator` skill instead.** This skill uses Claude Code-specific primitives (Agent dispatch, TaskCreate) that do not exist in SLICC. Using it in SLICC will produce broken orchestration with no progress tracking and no scoop dispatch. There is zero reason to use this skill in SLICC.

## Entry

The user invokes you with a target domain — e.g. "one-shot demo for frescopa.coffee" or "/of1-demo-orchestrator-cc frescopa.coffee". Extract:

- `DOMAIN` — bare hostname (no protocol, no path). Required.
- `MODE` — `one-shot` (default) or `step` (pause for review between every step). Default to `one-shot` unless the user explicitly says "pause", "wait for my review", or "step by step".

If `DOMAIN` is missing, ask the user once using `AskUserQuestion`, then proceed.

## Phase 0 — Verify dependencies + repo state (inline)

Invoke the `of1-check-dependencies` skill via the **Skill tool** (not Agent — this is light and must run in your context to read the verified state, and its "Repo state" section may need `AskUserQuestion` for continue/restart). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` for `stateDir`/`of1Repo` and `<STATE_DIR>/repo-config.json` for `owner`/`repo`/`branch`/`domain`. Use these for all subsequent steps.

## Phase 1 — Initialize task list

Use **TaskCreate** with one task per stage + the concurrent tracks:

```
0. Setup            (done if you got here — deps + repo-config.json)
1. Collect          — of1-discover-narrative → narrative.json + demo story
2. Replica          — stardust:replica <URL> --pages <slugs> → EDS site + DESIGN.json
3. OF1 integration  — delegate to of1-adopt-existing-site (pipeline mode)
```

Stages 2 and 3 launch CONCURRENTLY (see Phase 2). Mark task 0 completed immediately.

## Phase 2 — Run the pipeline (3 stages)

```
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
```

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

```
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
```json
{"step": 2, "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
```
```

## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives both later stages.
- Stage 2 (replica): `opus` — the replica invocation must follow a complex multi-phase skill precisely.
- Stage 3 (adopt-site): adopt-site assigns models per its OWN model table (Opus only for OF1 styling; Sonnet for the rest). The orchestrator passes no per-step model here.

## Step dispatch template

Each step is a single `Agent` call. Sub-agents see none of this conversation — the prompt must be self-contained. **Always pass `model` and `mode: "bypassPermissions"`.**

```
You are executing **Step N (<step-name>)** of the OF1 demo pipeline for `<DOMAIN>`.

## Load the step skill
Read the skill file and follow it as written:
  Read: <absolute path to .claude/skills/<skill>/SKILL.md>

## Environment (export these at the top of your work)
export OF1_STATE_DIR="<stateDir>"
export OF1_DEMO_REPO="<of1Repo>"
export ADOBE_IMS_TOKEN="<token>"    # or: export OF1_TOKEN_FILE="<path>"
export SKILL_DIR="<absolute path to the step skill's directory>"

## Project context
- Branch: <branch>          (from repo-config.json)
- DA owner/repo: <owner>/<repo>  (from repo-config.json)
- Prior step outputs you need: <list specific files>

## Platform notes
- If the skill calls `upskill ...`: STOP — that means a dependency is missing; report failure.
- playwright-cli: the shim at of1-check-dependencies/scripts/playwright-cli-shim.sh translates
  legacy syntax (visit/--output) to the modern binary automatically. No manual renames needed.

## Output contract
End your last message with EXACTLY this fenced block (the orchestrator parses it):

```json
{"step": N, "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

If status is `failed`, also write what specifically broke and what to retry.
```

## Auto-approve vs review mode

After each step's Agent returns:

- **One-shot mode (default):** Mark task completed. Continue immediately.
- **Step mode:** If the returned status is `review`, call `AskUserQuestion` with "Approve and continue" / "Revise — describe changes".

  On "Revise", re-dispatch the same step's Agent with the user's feedback appended under a `## Revision feedback` section.

The user can interrupt at any time ("revise step N") — re-dispatch with their feedback.

## Stages 11–12 (config review + deploy)

Owned by `of1-adopt-existing-site` (its Step 11 inline + Step 12 deploy). The CC orchestrator
does not run them directly.

## State files

The orchestrator writes/reads under `<stateDir>/`:

| File | Owner | Purpose |
|------|-------|---------|
| `setup.json` | of1-check-dependencies | Verified paths + owner/repo/branch + token source |
| `repo-config.json` | Step 1 (Setup) | owner, repo, branch, contentPrefix, repoDir, domain |
| `stage-<N>-summary.json` | Orchestrator (parsed from Agent return) | Stage result, for resuming/debug |
| `pipeline.log` | Orchestrator | Append-only dispatch/return log |

You parse each Agent's final JSON block and write it to `stage-<N>-summary.json` yourself.

## Failure recovery

If a step returns `failed`:
1. Mark its task `failed` and pause (do NOT dispatch downstream steps).
2. Show the user the failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch with guidance appended.
5. On skip, only allow if no downstream step structurally depends on it.

## Pipeline audit

After every top-level Agent dispatch returns (Stage 1, Stage 2, Stage 3), record that stage's telemetry from the `<usage>` block in the Agent result. The orchestrator tracks this in memory and writes the full audit to `$OF1_STATE_DIR/pipeline-audit.json` after the pipeline finishes (or fails).

Only the 3 stages the orchestrator itself dispatches are recorded here. Stage 3 (`of1-adopt-existing-site`) is a single black-box dispatch from the orchestrator's point of view — its internal sub-steps (content, styling, config review, deploy) are owned and audited by adopt-site itself, not by this file.

### What to record per stage

| Field | Source |
|---|---|
| `stage` | Stage number (1, 2, or 3) |
| `name` | Stage name (`discovery`, `replica`, `adopt-site`) |
| `model` | Model used for this dispatch |
| `startedAt` | ISO timestamp when the Agent was dispatched |
| `durationMs` | From the `<usage>` block: `duration_ms` |
| `totalTokens` | From the `<usage>` block: `total_tokens` |
| `toolUses` | From the `<usage>` block: `tool_uses` |
| `status` | From the agent's return JSON (`done` / `review` / `failed`) |
| `summary` | From the agent's return JSON |
| `retries` | Number of retries for this stage (0 if first-pass success) |
| `error` | If failed: the failure message. Otherwise `null`. |

### When to write the audit file

Write `$OF1_STATE_DIR/pipeline-audit.json` at **two points**:
1. After Stage 3's Agent returns `done` (success path)
2. If the pipeline aborts (failure path — partial audit is still useful)

### Capture skill version at pipeline start

Before the first dispatch, record the git hash of the skill plugin so the audit is tied to a reproducible version:

```bash
SKILL_PLUGIN_DIR="<absolute path to the of1-demo-skills plugin root>"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

Include both in the audit file's top-level fields.

### Audit file shape

```json
{
  "domain": "<DOMAIN>",
  "skillVersion": "<git short hash of the skill plugin>",
  "skillBranch": "<branch name of the skill plugin>",
  "startedAt": "<ISO timestamp of first dispatch>",
  "completedAt": "<ISO timestamp of last step return>",
  "totalTokens": <sum across all stages>,
  "totalDurationMs": <wall-clock from start to finish>,
  "stageCount": <number of dispatches including retries>,
  "stages": [
    {
      "stage": 1,
      "name": "discovery",
      "model": "opus",
      "startedAt": "...",
      "durationMs": 41200,
      "totalTokens": 18400,
      "toolUses": 22,
      "status": "done",
      "summary": "narrative + 5 key pages identified",
      "retries": 0,
      "error": null
    }
  ]
}
```

### Improvements section (append after completion)

After writing the audit, analyze the run and append an `improvements` array to `pipeline-audit.json`. For each stage that had issues — retries, high token usage relative to its task complexity, unexpectedly long duration, or a `failed`/`review` status that was recovered — write a brief, actionable observation. Since Stage 3 is a black box, its "issue" can only describe what was observable from the outside (timing, retries, the returned status/summary) — not its internal sub-step behavior:

```json
{
  "improvements": [
    {
      "stage": 2,
      "issue": "Replica took 22 min (2× expected) for 5 pages — stardust:replica's source-fidelity gate rejected the first render on 2 of 5 pages, forcing a re-render pass",
      "suggestion": "Pass tighter page-selection guidance from Stage 1 (avoid pages with heavy client-side interactivity) so stardust:replica's first render is more likely to pass its fidelity gate"
    },
    {
      "stage": 3,
      "issue": "of1-adopt-existing-site returned status 'review' with concerns about generated CTA copy tone — required one round of user revision before deploy",
      "suggestion": "Have Stage 1's narrative.json carry an explicit tone/voice guideline that adopt-site's content track can consume directly, reducing review round-trips"
    }
  ]
}
```

Rules for the improvements section:
- Only include stages that had actual problems (retries, failures, token spend >2× the expected range from the model table, duration >3× expected)
- Be specific: name the exact behavior that went wrong (to the extent observable — Stage 3's internals are opaque), not generic "could be better"
- Each `suggestion` should be a concrete change to a skill or dispatch prompt — something actionable for the next pipeline run
- If the run was clean (no retries, all stages within expected bounds), write `"improvements": []` — don't invent issues
- This section is for pipeline-level learning; skill-level bugs (including those inside adopt-site's internal steps) should be filed as skill edits, not left as audit notes

## Notes

- Resuming across sessions is not yet implemented (state files exist but resume logic would need to read `stage-<N>-summary.json` and rebuild the task list).
- One domain at a time. No multi-tenant parallel pipelines.
