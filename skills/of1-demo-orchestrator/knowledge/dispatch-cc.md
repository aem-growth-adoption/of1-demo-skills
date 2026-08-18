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
2a. Extract design  — of1-extract-design <URL> → stardust/current/DESIGN.json + brand-review.html
2b. Prototype       — of1-prototype → stardust/prototypes/prototype-*.html
2c. Snowflake       — of1-snowflake → EDS overlay pages + $OF1_STAGE2_DONE_FILE
3. OF1 integration  — Integrate skills, dispatched by THIS orchestrator:
   extraction · of1-build-templates(base) · of1-build-templates(intent-*) ·
   of1-build-templates(assemble) · of1-style-generative-block · of1-extract-brand-voice ·
   of1-extract-content · of1-build-quick-suggestions · of1-build-cta-template ·
   config-review · of1-publish
```

Mark task 0 completed immediately. Mark each task `in_progress`/`completed`/`failed` around its dispatch.

## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives both later stages.
- Stage 2 (2a/2b/2c): `opus`, `effort: "high"` for 2b (`of1-prototype`) — its iterative visual-diff
  fix loop benefits from deeper per-iteration reasoning (see the Stage 2 dispatch template below
  for the wall-clock budget that goes with it). 2a (`of1-extract-design`) and 2c (`of1-snowflake`)
  run `opus` at default effort.
- Stage 3 (Integrate skills): **read the per-skill model from `of1-integration`'s model-assignment
  rule** (Opus only where output quality cascades — `of1-style-generative-block` and the extraction
  step; Sonnet for the rest). Do not maintain a second copy of that list here.

## Dispatch sequence

1. **Stage 1:** dispatch `of1-discovery` (model `opus`), exporting the standard step env
   (`OF1_STATE_DIR`, `OF1_DEMO_REPO`, and **`SKILL_DIR`** — discovery's `fill-discovery.mjs`
   needs it). Await `done`. Read `narrative.json`;
   build `SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)`.
2. **Kick off Stage 2's first substep + the Stage 3 content track in ONE message:**
   - **Stage 2a Agent** (`opus`): invoke `of1-extract-design https://<DOMAIN> --pages <SLUGS>`. Await
     `done`/`review` — on `failed` (blocked capture or other fail-loud condition), pause and follow
     "Failure recovery" below; do NOT dispatch 2b.
   - **Stage 3 content-track Agents** (`of1-extract-brand-voice`, `of1-extract-content`): dispatch immediately with `OF1_PIPELINE_MODE=1`,
     `OF1_CONTENT_SOURCE=<DOMAIN>` — they need only the live external site.
3. **On 2a `done`, dispatch Stage 2b** (`of1-prototype`, `opus`, `effort: "high"` — see the Stage 2b
   dispatch template below for the wall-clock budget). Await `done`.
4. **On 2b `done`, dispatch Stage 2c** (`of1-snowflake`, `opus`). It loops `snowflake` over every
   prototype from 2b and, on success, writes `$OF1_STAGE2_DONE_FILE`. Await `done`.
5. **When `$OF1_STAGE2_DONE_FILE` exists, run the Stage 2 artifact-existence check BEFORE
   dispatching the site-integration track.** This replaces the old replica fidelity gate — 2a/2b/2c
   each fail loud on their own problems, so this check only confirms Stage 2's outputs actually
   landed:
   - Confirm `$OF1_STAGE2_DONE_FILE` parses as `{"stage":2,"status":"done"}`.
   - Confirm the EDS overlay pages 2c reported in `of1-snowflake-status.json` exist in the repo.
   - If both hold, proceed to the site-integration track. If `$OF1_STAGE2_DONE_FILE` is missing or
     malformed, or an expected overlay page is absent, treat it as a Stage 2 failure — identify
     which substep (2a/2b/2c) didn't complete and re-dispatch it. See `pipeline-contract.md`
     § "Stage 2 completion check".

   **The dependency edges and the pipeline-mode start gates are defined once in `of1-integration`
   § "Pipeline-mode timing" — follow that graph; do not re-derive the edges here.** (In pipeline
   mode the content track — `of1-extract-brand-voice` ∥ `of1-extract-content` →
   `of1-build-quick-suggestions` — was already kicked off at step 2 above, so the site track's first
   fan-out is `of1-build-templates`(base) ∥ `of1-style-generative-block` ∥ `of1-build-cta-template`.)
6. **Fan out in parallel at every eligible point** — dispatch all currently-eligible skills in one
   message with multiple Agent blocks (e.g. `of1-build-templates`(base) ∥ `of1-style-generative-block`
   ∥ `of1-build-cta-template` once Stage 2 is done; `of1-build-templates`(intent-*) in one
   message once base returns). When `of1-publish` returns `done`, the pipeline is complete.

## Stage 2b dispatch template (prototype)

Dispatch with `model: "opus"` and `effort: "high"` — this is careful, deliberate visual-delta
reasoning and CSS-precision fixing, not fast pattern-matching; more thinking per iteration should
converge in fewer iterations rather than needing to repeat sloppy guesses.

```
You are executing Stage 2b (Prototype) of the OF1 demo pipeline for `<DOMAIN>`.

Read the skill file and follow it as written:
  Read: <absolute path to .claude/skills/of1-prototype/SKILL.md>

It wraps `stardust:prototype` for each key page from Stage 1's `narrative.json`, running its own
visual-diff/fix loop against the live site.

## Wall-clock budget — on top of the visual-diff loop's own iteration cap

The visual-diff loop's iteration cap is an *attempt* cap, not a time cap — it can still spend a
very long time if convergence is slow. Layer this additional stop condition on top of it, evaluated
**at the top of each iteration, never mid-probe** (so the single-live-navigation-per-instrument
invariant stays intact):

- Track elapsed wall-clock time since this Agent started.
- If a single page's diff loop has spent more than **20 minutes** without the visual diff trending
  down between the last two iterations, treat this exactly as if you'd exhausted the iteration cap:
  stop immediately and log the residual using the skill's own residual-logging convention — do not
  invent a new stop mechanism or a new file.
- This is a backstop for slow convergence, not a replacement for the skill's own discipline — if its
  normal iteration cap resolves faster, that takes precedence and this never triggers.

## Maps and other third-party embeds — do not attempt to recreate

A live Google/Apple/Bing Maps embed (store locators, "find a location" widgets, directions
iframes) never renders in headless capture (it errors or stays blank), so the visual-diff loop can
never actually measure it, and no amount of CSS portation or re-authoring will make it converge —
this burned ~40 minutes on a single demo (frescopa.coffee, 2026-08-14) chasing a Maps hydration
band. The same applies to other third-party JS widgets that only render with live network/API
access the prototype has no path to reproduce (chat widgets, live inventory/booking widgets, ad iframes).

For any section whose content is one of these, skip the normal recreation procedure for that
section entirely — do not re-author it, do not CSS-port it, do not iterate the diff loop against
it. Replace it with a fixed-height static `<div>` sized to the source's layout geometry (same
section height/margins so surrounding sections don't reflow), styled with the page's own
background/border tokens so it reads as an intentional placeholder, not a bug. Log it as a
documented residual the same way a CSS portation is logged (note: "third-party embed, not
recreated — replaced with static placeholder") so it reads as an intentional residual rather than
an unexplained gap. Exclude that section's pixels from the diff measurement if the instrument
supports region exclusion; otherwise document the expected hot band in the same residual note so
it isn't mistaken for a real defect.

End with the JSON status block:
```json
{"stage": 2, "skill": "of1-prototype", "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
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

**`config-review` (config review) and `of1-publish` (deploy) run inline in the
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
§ "Pipeline audit schema" — **write it right before dispatching `of1-publish`, not after it
returns** (its own step 3 reads this file to render the hub's audit section; writing it later
means the hub was already generated without it). `config-review`/`of1-publish` are inline
(`model: "inline"`).

## State files (CC)

The complete state-file inventory lives in `pipeline-contract.md` § "State files". On CC they sit
under `$OF1_STATE_DIR/`. Do not write `stage-<N>-summary.json` or `pipeline.log` — those were never
real; the audit + per-step status files are the only run records.
