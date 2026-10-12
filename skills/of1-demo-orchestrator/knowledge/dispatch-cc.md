# Dispatch mechanics — Claude Code

Stage 1 and Stage 2 dispatch for `of1-demo-orchestrator`. The *what* (stage model, status contract,
audit schema) lives in `SKILL.md` and `pipeline-contract.md`. Stage 3 is a single inline `Skill` call
to `of1-skills:of1-integration` described in `SKILL.md`; nothing in this file dispatches it.

## Progress tracking — TaskCreate

Use **TaskCreate** with one task per stage:

```
0. Setup            (done if you got here — deps + repo-config.json)
1. Collect          — of1-discovery → narrative.json + demo story
2a. Extract design  — of1-extract-design <URL> → stardust/current/DESIGN.json + brand-review.html
2b. Prototype       — of1-prototype → stardust/prototypes/prototype-*.html
2c. Deploy          — of1-deploy → block-based EDS pages + $OF1_STAGE2_DONE_FILE
3. OF1 integration  — of1-skills:of1-integration (one inline Skill call)
```

Mark task 0 completed immediately. Mark each task `in_progress`/`completed`/`failed` around its dispatch.

## Model assignment

- Stage 1 (discovery): `opus` — narrative synthesis drives the later stages.
- Stage 2 (2a/2b/2c): `opus`, `effort: "high"` for 2b (`of1-prototype`) — its iterative visual-diff
  fix loop benefits from deeper per-iteration reasoning (see the Stage 2b dispatch template below
  for the wall-clock budget that goes with it). 2a and 2c run `opus` at default effort.

## Dispatch sequence

1. **Stage 1:** dispatch `of1-discovery` (model `opus`), exporting the standard step env
   (`OF1_STATE_DIR`, `OF1_DEMO_REPO`, and **`SKILL_DIR`** — discovery's `fill-discovery.mjs`
   needs it). Await `done`. Read `narrative.json`;
   build `SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)`.
2. **Stage 2a Agent** (`opus`): invoke `of1-extract-design https://<DOMAIN> --pages <SLUGS>`. Await
   `done`/`review` — on `failed` (blocked capture or other fail-loud condition), pause and follow
   "Failure recovery" below; do NOT dispatch 2b.
3. **On 2a `done`, dispatch Stage 2b** (`of1-prototype`, `opus`, `effort: "high"` — see the Stage 2b
   dispatch template below for the wall-clock budget). Await `done`.
4. **On 2b `done`, dispatch Stage 2c** (`of1-deploy`, `opus`). It invokes `stardust:deploy` once
   over the whole prototype set from 2b and, on success, writes `$OF1_STAGE2_DONE_FILE`. Await `done`.
5. **When `$OF1_STAGE2_DONE_FILE` exists, run the Stage 2 artifact-existence check** (see
   `pipeline-contract.md` § "Stage 2 completion check"):
   - Confirm `$OF1_STAGE2_DONE_FILE` parses as `{"stage":2,"status":"done"}`.
   - Confirm the block-based EDS pages 2c reported in `of1-deploy-status.json` exist in the repo.
   - If `$OF1_STAGE2_DONE_FILE` is missing or malformed, or an expected page is absent, treat it as a
     Stage 2 failure — identify which substep (2a/2b/2c) didn't complete and re-dispatch it.
6. Write the pipeline audit (before Stage 3), then run Stage 3 per `SKILL.md`.

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

## Auto-approve vs review mode

After each Stage 1/2 Agent returns:
- **One-shot mode (default):** mark the task completed, continue immediately.
- **Step mode** (interactive only; ignored when `OF1_NON_INTERACTIVE=1`): if the returned status is `review`, call `AskUserQuestion` with "Approve and
  continue" / "Revise — describe changes". On "Revise", re-dispatch the same skill's Agent with the
  user's feedback appended under a `## Revision feedback` section.

The user can interrupt at any time ("revise `<skill>`") — re-dispatch with their feedback.

## Failure recovery

If a skill returns `failed`:
1. Mark its task `failed` and pause (do NOT dispatch downstream stages).
2. Show the user the failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch with guidance appended.
5. On skip, only allow if no downstream skill structurally depends on it.

## Audit capture

Record telemetry from each Agent result's `<usage>` block (`duration_ms`, `total_tokens`,
`tool_uses`). Track in memory across dispatches; write the audit per `pipeline-contract.md`
§ "Pipeline audit schema" — **write it right before the Stage 3 call, not after it returns**
(`of1-integration` generates the hub and reads this file; writing it later means the hub was
already generated without it). Stage 3 is a single inline record (`model: "inline"`).

## State files

The complete state-file inventory lives in `pipeline-contract.md` § "State files". They sit
under `$OF1_STATE_DIR/`. Do not write `stage-<N>-summary.json` or `pipeline.log` — those were never
real; the audit + per-step status files are the only run records.
