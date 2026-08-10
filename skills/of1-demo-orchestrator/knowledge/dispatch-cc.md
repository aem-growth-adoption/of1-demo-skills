# Dispatch mechanics — Claude Code runtime

Read this when `of1-demo-orchestrator` detects it is running in **Claude Code** (the `Agent`
and `TaskCreate` tools are available; `scoop_scoop` is not). It supplies the CC-specific *how*;
the runtime-agnostic *what* (stage model, step graph, nesting cap, audit schema) lives in
`SKILL.md` and `pipeline-contract.md`.

## Progress tracking — TaskCreate

Use **TaskCreate** with one task per stage, plus one task per OF1-integration step under Stage 3
(the orchestrator owns steps 6–12 directly — see the nesting cap):

```
0. Setup            (done if you got here — deps + repo-config.json)
1. Collect          — of1-discovery → narrative.json + demo story
2. Replica          — stardust:replica <URL> --pages <slugs> → EDS site + DESIGN.json
3. OF1 integration  — steps 6–12, dispatched by THIS orchestrator:
   3 · 6-base · 6a–6e · 6-assemble · 7 · 8a · 8b · 9 · 10 · 11 · 12
```

Mark task 0 completed immediately. Mark each task `in_progress`/`completed`/`failed` around its dispatch.

## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives both later stages.
- Stage 2 (replica): `opus` — must follow a complex multi-phase skill precisely.
- Stage 3 (steps 6–12): set the per-step model from `of1-adopt-existing-site`'s model table —
  **Opus** for step 7 (OF1 styling) and step 3 when it runs (extraction — token quality cascades);
  **Sonnet** for the rest (6-base, 6a–6e, 6-assemble, 8a, 8b, 9, 10).

## Dispatch sequence

1. **Stage 1:** dispatch `of1-discovery` (model `opus`). Await `done`. Read `narrative.json`;
   build `SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)`.
2. **Kick off Stage 2 + the Stage 3 content track in ONE message:**
   - **Stage 2 Agent** (`opus`): invoke `stardust:replica https://<DOMAIN> --pages <SLUGS>`; on
     success write `<stateDir>/replica-done.json`. See the Stage 2 dispatch template below.
   - **Stage 3 content-track Agents** (steps 8a, 8b): dispatch immediately with `OF1_PIPELINE_MODE=1`,
     `OF1_CONTENT_SOURCE=<DOMAIN>` — they need only the live external site.
3. **When `replica-done.json` exists, run the Stage 2 artifact gate BEFORE dispatching the
   site-integration track.** `replica-done.json` only means the Stage 2 agent finished — it does NOT
   mean the replica is demo-grade. Run the gate against the repo:

   ```bash
   node "<orchestratorSkillDir>/assets/check-replica-artifacts.mjs" "<repoDir>"
   ```

   - **exit 0** — proceed to the site-integration track.
   - **exit 2 (BLOCKED-CAPTURE)** — HARD STOP. The source is bot-protected (Akamai/Cloudflare) and
     replica shipped placeholder imagery + an unmeasured "pass". Do **not** dispatch Stage 3 or
     deploy. Surface the gate's escalation options to the user (retry `--headed`, content-only demo,
     or abort) and wait for a decision. See `pipeline-contract.md` § "Stage 2 artifact gate".
   - **exit 1** — replica's ledger is missing/empty; treat as a Stage 2 failure and re-dispatch it.

   Only on exit 0, dispatch the Stage 3 site-integration track per `of1-adopt-existing-site`'s
   dependency table: step 3 (if `DESIGN.json` absent) → 6-base ∥ 7 ∥ 10,
   then 6a–6e (after 6-base), then 6-assemble; step 9 after 8a+8b; step 11 (inline) after 8a+8b+9+10;
   step 12 (deploy, inline) after 6-assemble+7+11.
4. **Fan out in parallel at every eligible point** — dispatch all currently-eligible steps in one
   message with multiple Agent blocks (e.g. 6-base ∥ 7 ∥ 10 once the replica is done; 6a–6e in one
   message once 6-base returns). When step 12 returns `done`, the pipeline is complete.

## Stage 2 dispatch template (replica)

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

## Step dispatch template (steps 6–12)

Each step is a single `Agent` call. Sub-agents see none of this conversation — the prompt must be
self-contained. **Always pass `model` and `mode: "bypassPermissions"`.**

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
- playwright-cli: the step skills use modern @playwright/cli syntax. If you write your own calls,
  use `open` (not visit), `--filename` (not --output), `--full-page` as a bare boolean (no =value),
  and give `eval` a function form (`() => (…)`) — a bare expression returns silently empty.

## Output contract
End your last message with EXACTLY this fenced block (the orchestrator parses it) — canonical
grammar and `deliverables` rules are in `pipeline-contract.md`:

```json
{"step": N, "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

If status is `failed`, also write what specifically broke and what to retry.
```

**Steps 11 (config review) and 12 (deploy) run inline in the orchestrator's own context** (not as
Agents) — follow `of1-adopt-existing-site`'s "Step 11" and "Step 12" sections directly, including
its check-5 adaptation for the adopt flow.

## Auto-approve vs review mode

After each step's Agent returns:
- **One-shot mode (default):** mark the task completed, continue immediately.
- **Step mode:** if the returned status is `review`, call `AskUserQuestion` with "Approve and
  continue" / "Revise — describe changes". On "Revise", re-dispatch the same step's Agent with the
  user's feedback appended under a `## Revision feedback` section.

The user can interrupt at any time ("revise step N") — re-dispatch with their feedback.

## Failure recovery

If a step returns `failed`:
1. Mark its task `failed` and pause (do NOT dispatch downstream steps).
2. Show the user the failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch with guidance appended.
5. On skip, only allow if no downstream step structurally depends on it.

## Audit capture (CC-specific)

Record telemetry from each Agent result's `<usage>` block (`duration_ms`, `total_tokens`,
`tool_uses`). Track in memory across dispatches; write the audit per `pipeline-contract.md`
§ "Pipeline audit schema". Steps 11/12 are inline (`model: "inline"`).

## State files (CC)

The complete state-file inventory lives in `pipeline-contract.md` § "State files". On CC they sit
under `$OF1_STATE_DIR/`. Do not write `stage-<N>-summary.json` or `pipeline.log` — those were never
real; the audit + per-step status files are the only run records.
