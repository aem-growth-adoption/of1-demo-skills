# Dispatch mechanics — Claude Code runtime

Read this when `of1-demo-orchestrator` detects it is running in **Claude Code** (the `Agent`
and `TaskCreate` tools are available; `scoop_scoop` is not). It supplies the CC-specific *how*;
the runtime-agnostic *what* (stage model, step graph, nesting cap, audit schema) lives in
`SKILL.md` and `pipeline-contract.md`.

## Progress tracking — TaskCreate

Use **TaskCreate** with one task per stage, plus one task per OF1-integration skill under Stage 3
(the orchestrator owns the Integrate-stage skills directly — see the nesting cap):

```
0. Setup            (done if you got here — deps + repo-config.json)
1. Collect          — of1-discovery → narrative.json + demo story
2. Replica          — stardust:replica <URL> --pages <slugs> → EDS site + DESIGN.json
3. OF1 integration  — Integrate skills, dispatched by THIS orchestrator:
   extraction · of1-build-templates(base) · of1-build-templates(intent-*) ·
   of1-build-templates(assemble) · of1-style-generative-block · of1-extract-brand-voice ·
   of1-extract-content · of1-build-quick-suggestions · of1-build-cta-template ·
   of1-generate-config-review · of1-publish
```

Mark task 0 completed immediately. Mark each task `in_progress`/`completed`/`failed` around its dispatch.

## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives both later stages.
- Stage 2 (replica): `opus` — must follow a complex multi-phase skill precisely.
- Stage 3 (Integrate skills): **read the per-skill model from `of1-integration`'s model-assignment
  rule** (Opus only where output quality cascades — `of1-style-generative-block` and the extraction
  step; Sonnet for the rest). Do not maintain a second copy of that list here.

## Dispatch sequence

1. **Stage 1:** dispatch `of1-discovery` (model `opus`). Await `done`. Read `narrative.json`;
   build `SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)`.
2. **Kick off Stage 2 + the Stage 3 content track in ONE message:**
   - **Stage 2 Agent** (`opus`): invoke `stardust:replica https://<DOMAIN> --pages <SLUGS>`; on
     success write `<stateDir>/replica-done.json`. See the Stage 2 dispatch template below.
   - **Stage 3 content-track Agents** (`of1-extract-brand-voice`, `of1-extract-content`): dispatch immediately with `OF1_PIPELINE_MODE=1`,
     `OF1_CONTENT_SOURCE=<DOMAIN>` — they need only the live external site.
3. **When `replica-done.json` exists, run the Stage 2 artifact gate BEFORE dispatching the
   site-integration track.** `replica-done.json` only means the Stage 2 agent finished — it does NOT
   mean the replica is demo-grade. Run the gate against the repo:

   ```bash
   node "<orchestratorSkillDir>/assets/check-replica-artifacts.mjs" "<repoDir>"
   ```

   - **exit 0** — proceed to the site-integration track. (The gate may still print `⚠` warnings for
     documented under-bar residuals or legacy-shape pages; note them but proceed.)
   - **exit 2** — HARD STOP: replica is NOT demo-grade. Cause is one of BLOCKED-CAPTURE (bot-protected
     source, unmeasured "pass"), placeholder imagery, FIDELITY FAIL (measured pixel diff above the 10%
     bar — the adobe.com case), or VERDICT FAIL (`verdict.overall: "fail"`). Do **not** dispatch Stage 3
     or deploy. Surface the gate's escalation options to the user (retry `--headed`, content-only demo,
     or abort) and wait for a decision. See `pipeline-contract.md` § "Stage 2 artifact gate".
   - **exit 1** — replica's ledger is missing/empty; treat as a Stage 2 failure and re-dispatch it.

   Only on exit 0, dispatch the Stage 3 site-integration track. **The dependency edges and the
   pipeline-mode start gates are defined once in `of1-integration` § "Pipeline-mode timing" — follow
   that graph; do not re-derive the edges here.** (In pipeline mode the content track — `of1-extract-brand-voice`
   ∥ `of1-extract-content` → `of1-build-quick-suggestions` — was already kicked off at step 2 above,
   so the site track's first fan-out is `of1-build-templates`(base) ∥ `of1-style-generative-block` ∥
   `of1-build-cta-template`.)
4. **Fan out in parallel at every eligible point** — dispatch all currently-eligible skills in one
   message with multiple Agent blocks (e.g. `of1-build-templates`(base) ∥ `of1-style-generative-block`
   ∥ `of1-build-cta-template` once the replica is done; `of1-build-templates`(intent-*) in one
   message once base returns). When `of1-publish` returns `done`, the pipeline is complete.

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
{"stage": 2, "skill": "stardust:replica", "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
```
```

## Skill dispatch template (Integrate skills)

Each skill is a single `Agent` call. Sub-agents see none of this conversation — the prompt must be
self-contained. **Always pass `model` and `mode: "bypassPermissions"`.**

```
You are executing the **<skill> skill** (Integrate stage) of the OF1 demo pipeline for `<DOMAIN>`.

## Load the skill
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
- Prior skill outputs you need: <list specific files>

## Platform notes
- If the skill calls `upskill ...`: STOP — that means a dependency is missing; report failure.
- playwright-cli: if you write your own calls, follow `common-pitfalls.md` § 9 "playwright-cli syntax"
  (`open` not visit, `--filename` not --output, `--full-page` bare, `eval` as a function form).

## Output contract
End your last message with EXACTLY this fenced block (the orchestrator parses it) — canonical
grammar and `deliverables` rules are in `pipeline-contract.md`:

```json
{"stage": 3, "skill": "<skill>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

If status is `failed`, also write what specifically broke and what to retry.
```

**`of1-generate-config-review` (config review) and `of1-publish` (deploy) run inline in the
orchestrator's own context** (not as Agents) — follow `of1-integration`'s "Config review" and "Deploy"
sections directly, including its check-5 adaptation for the adopt flow.

## Auto-approve vs review mode

After each skill's Agent returns:
- **One-shot mode (default):** mark the task completed, continue immediately.
- **Step mode:** if the returned status is `review`, call `AskUserQuestion` with "Approve and
  continue" / "Revise — describe changes". On "Revise", re-dispatch the same skill's Agent with the
  user's feedback appended under a `## Revision feedback` section.

The user can interrupt at any time ("revise `<skill>`") — re-dispatch with their feedback.

## Failure recovery

If a skill returns `failed`:
1. Mark its task `failed` and pause (do NOT dispatch downstream skills).
2. Show the user the failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch with guidance appended.
5. On skip, only allow if no downstream skill structurally depends on it.

## Audit capture (CC-specific)

Record telemetry from each Agent result's `<usage>` block (`duration_ms`, `total_tokens`,
`tool_uses`). Track in memory across dispatches; write the audit per `pipeline-contract.md`
§ "Pipeline audit schema". `of1-generate-config-review`/`of1-publish` are inline (`model: "inline"`).

## State files (CC)

The complete state-file inventory lives in `pipeline-contract.md` § "State files". On CC they sit
under `$OF1_STATE_DIR/`. Do not write `stage-<N>-summary.json` or `pipeline.log` — those were never
real; the audit + per-step status files are the only run records.
