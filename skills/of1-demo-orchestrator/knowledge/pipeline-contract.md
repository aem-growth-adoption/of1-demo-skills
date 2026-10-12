# OF1 demo pipeline — shared contract

Runtime: Claude Code. The `of1-demo-orchestrator` skill cites this file instead of restating it, from
`dispatch-cc.md`. **If a rule below is wrong, fix it here once** — do not copy it into the dispatch
file, or they will drift (that drift is what produced the `stages`/`steps` audit bug; see the audit
schema note).

## Environment variables — canonical vocabulary

One name per thing. Skills must use these names and not invent synonyms.

| Var | Set by | Read by | Notes |
|---|---|---|---|
| `OF1_STATE_DIR` | orchestrator | every step | State/IPC dir. |
| `OF1_DEMO_REPO` | orchestrator | every step | Absolute path to the local EDS repo clone. |
| `SKILL_DIR` | orchestrator | the dispatched Stage 1/2 step | Absolute path to the step skill's own directory (for its `assets/`). |
| `ADOBE_IMS_TOKEN` | user / environment | `of1-check-dependencies`, `of1-publish` | **Canonical DA credential** — the raw IMS token value. First choice in the token-resolution order. |
| `OF1_TOKEN_FILE` | user / environment | `of1-check-dependencies`, `of1-publish`, `download-images.mjs` | Alternative to `ADOBE_IMS_TOKEN`: a path to a JSON file `{"access_token":"..."}`. Second in the resolution order. |
| `OF1_DEMO_WIPE` | orchestrator (Phase 0a) | `scripts/wipe.sh` | `1` only on the single invocation that runs the full wipe; an intent marker, never exported elsewhere. |
| `OF1_NON_INTERACTIVE` | caller / harness | orchestrator, `of1-integration` | `1`: no `AskUserQuestion`; Phase 0a decides by whether a prior demo exists. |
| `OF1_STAGE2_DONE_FILE` | orchestrator (Stage 2) | `of1-deploy` (writes it), orchestrator's Stage 2 completion check, harness progress | Path to `stage2-done.json` (default basename) — written by 2c (`of1-deploy`) on completion. Not a gate for anything in Stage 3. |
| `STRICT` | user / environment | `of1-check-dependencies` | Optional: makes dependency warnings fatal. |

**`DA_TOKEN` is NOT an input env var.** It is a **shell local** that `of1-publish` and
`of1-check-dependencies` derive at the top of a script:
`DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"`. The full resolution
order (recorded in `setup.json` as `tokenSource`) is:
`ADOBE_IMS_TOKEN` → `OF1_TOKEN_FILE` → `$PWD/.hlx/.da-token.json` → `$OF1_DEMO_REPO/.hlx/.da-token.json`.
Never document `DA_TOKEN` as a credential to set — set `ADOBE_IMS_TOKEN` (or `OF1_TOKEN_FILE`).

## The 3-stage model

| Stage | What | Skill |
|---|---|---|
| 1 | Discovery — narrative + key pages | `of1-discovery` → `narrative.json` |
| 2a | Extract design — capture the live site's design tokens/brand surface | `of1-extract-design <URL>` (wraps `stardust:extract`) |
| 2b | Prototype — render redesigned key pages | `of1-prototype` (wraps `stardust:prototype`) |
| 2c | Deploy — convert the prototypes into a block-based EDS site | `of1-deploy` (wraps `stardust:deploy`, one invocation for the whole site) |
| 3 | OF1 integration — one inline `Skill` call | `of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template` |

All stages run sequentially: 1 → 2a → 2b → 2c → 3. Stage 3 is invoked inline in the orchestrator's
top-level context (never through an `Agent`) and is opaque to the orchestrator: it ends by writing
`$OF1_STATE_DIR/of1-integration-result.json` (`{status: done|review|failed, summary, deliverables, checks}`).
`done` finishes the pipeline; anything else fails the run. The orchestrator writes no result file of its own.

## State files — the complete inventory

These are the ONLY state files the pipeline writes. If a file is not in this table, no skill
writes it — do not promise or read one that isn't here. (This table replaces the earlier
`stage-<N>-summary.json` / `pipeline.log` entries, which were documented but never written and
have been removed; cross-session resume is not implemented, so nothing depends on them.)

| File | Written by | Read by | Purpose |
|---|---|---|---|
| `setup.json` | `of1-check-dependencies` | orchestrator | Verified paths + owner/repo/branch + token source |
| `repo-config.json` | `of1-check-dependencies` (setup) | every step | owner, repo, branch, contentPrefix, repoDir, domain, URLs |
| `narrative.json` | Stage 1 (`of1-discovery`) | orchestrator, Stage 2 | keyPages/focus/persona |
| `of1-discovery-output.md` | Stage 1 | Stage 3 (`of1-skills`), hub | discovery narrative (markdown) |
| `stardust/current/DESIGN.json` | Stage 2a (`of1-extract-design`, via `stardust:extract`) | orchestrator, 2b, Stage 3 | captured design tokens/brand surface |
| `deliverables/brand-review.html` | Stage 2a (`of1-extract-design`) | orchestrator, user review | brand-surface review page |
| `of1-extract-design-status.json` | Stage 2a | orchestrator | per-skill status (fails loud on a blocked capture — see below) |
| `stardust/prototypes/prototype-*.html` | Stage 2b (`of1-prototype`) | 2c, orchestrator | rendered redesign prototypes per key page |
| `of1-prototype-status.json` | Stage 2b | orchestrator | per-skill status |
| `of1-deploy-status.json` | Stage 2c (`of1-deploy`) | orchestrator | per-skill status |
| `$OF1_STAGE2_DONE_FILE` (default `stage2-done.json`) | Stage 2c (`of1-deploy`) | orchestrator, harness progress | `{"stage":2,"status":"done"}` — signals ALL of Stage 2 (2a→2b→2c) finished |
| `of1-integration-result.json` | Stage 3 (`of1-integration`) | orchestrator, caller | `{status, summary, deliverables, checks}` — ends the run |
| `<skill>-status.json` (Stage 3 skills) | `of1-skills` skills | harness progress | `of1-skills` progress contract; the orchestrator does not read them |
| `pipeline-audit.json` | orchestrator | `of1-skills` hub generation | run telemetry (schema below) |

State dir: `$OF1_STATE_DIR`.

## Stage 2 completion check — artifact existence, not a fidelity gate

Stage 2 no longer has a separate post-hoc fidelity gate. Each substep owns its own correctness
instead:

- **2a (`of1-extract-design`) fails loud.** If the live source is bot-protected or otherwise
  uncapturable, it writes `of1-extract-design-status.json` with `"status": "failed"` naming the
  blocked capture — it does not substitute placeholder imagery and report success. Treat a
  `failed` 2a exactly like any other failed step (see "Failure recovery" in `dispatch-cc.md`):
  pause, surface the message, ask the user to retry/skip/abort. Do not dispatch 2b.
- **2b (`of1-prototype`)** runs its own visual-diff/fix loop (wrapping `stardust:prototype`)
  against the live site before returning `done`.
- **2c (`of1-deploy`)** runs `stardust:deploy`'s own per-page delivery checks, and only writes
  `$OF1_STAGE2_DONE_FILE` after every page has been deployed.

**Contract:** once `$OF1_STAGE2_DONE_FILE` exists, the orchestrator does a lightweight
artifact-existence check before the Stage 3 call —
confirm the expected block-based EDS pages exist (per-page output listed in `of1-deploy-status.json`)
and that `$OF1_STAGE2_DONE_FILE`'s JSON is `{"stage":2,"status":"done"}`. There is no separate
`.mjs` gate script for this — 2a/2b/2c's own fail-loud behavior already covers the failure modes
the old replica gate existed to catch (blocked capture, unmeasured "pass", placeholder imagery).
If `$OF1_STAGE2_DONE_FILE` is missing or malformed, treat it as a Stage 2 failure and re-dispatch
the substep that didn't complete.

## Per-step status / output contract

Every dispatched Stage 1/2 step ends by writing its status and emitting the same JSON block
as its final message. Canonical shape:

```json
{"stage": <0-2>, "skill": "<of1-skill-name>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

- `stage` is the pipeline stage (0 Setup, 1 Discover, 2 Extract/Prototype/Deploy); `skill` is the exact
  of1-skill directory name.
- Status files are written to `$OF1_STATE_DIR/of1-<skill>-status.json`.
  Step skills' own "Completion" sections own the exact filename/shape; this is the grammar.
- On `failed`, also state what broke and what to retry.

## Deliverable URLs — always include them

When surfacing ANY step's status, always include a `deliverable` URL .

| Stage/step | Deliverable URL |
|---|---|
| 1 — discovery | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 2a — extract design | `https://{branch}--{repo}--{owner}.aem.page/deliverables/brand-review.html` |
| 2b/2c — prototype/deploy | each skill emits its own URLs in its status JSON (prototype previews, converted block-based EDS pages) — pass them through as-is |
| 3 — OF1 integration | the `deliverables` array of `of1-integration-result.json` (hub `deliverables/index.html`, `/of1`, …) — pass them through as-is |

## Pipeline audit schema

Write `$OF1_STATE_DIR/pipeline-audit.json` **before the Stage 3 call** with every record known up
to that point (stages 0-2). `of1-integration` generates the demo hub and reads this file to render
its "Pipeline Audit" section; if the audit is written only after Stage 3 returns, the hub has
already been generated without it and the section silently omits itself. Stage 3 is a single
opaque record: after the call returns, append one `stage: 3, skill: of1-integration` record to the
JSON (the hub is left as generated). If the pipeline aborts earlier, write whatever partial audit
exists.

### Per-step record fields

| Field | Source |
|---|---|
| `stage` | Stage number (`0`, `1`, `2`, or `3`) |
| `skill` | `of1-discovery`, `of1-extract-design`/`of1-prototype`/`of1-deploy` (stage 2's substeps), or `of1-integration` (stage 3) |
| `name` | Human label (`discovery`, `extract-design`, `prototype`, `deploy`, `integration`) |
| `model` | Model used for this dispatch (`inline` for `of1-integration`, which runs in the orchestrator's own context) |
| `startedAt` | ISO timestamp when dispatched |
| `durationMs` | Wall-clock for this dispatch |
| `totalTokens` | Token spend if available, else `null` |
| `toolUses` | Tool-use count if available, else `null` |
| `status` | `done` / `review` / `failed` |
| `summary` | From the step's status JSON |
| `retries` | Retry count (0 if first-pass success) |
| `error` | Failure message if failed, else `null` |

### File shape

**The top-level array key is `stages`, and the count is `stageCount`.** This is the exact
spec that drifted before (`fill-demo-hub.mjs` once read only `steps` while the orchestrators
wrote `stages`). The reader was hardened to accept `steps` as a legacy alias, but **`stages`
is canonical** — the orchestrator emits it and it renders correctly. Do not rename it; if you
ever must, change this file and both citers together, never one side.

```json
{
  "domain": "<DOMAIN>",
  "skillVersion": "<git short hash of the of1-demo-skills plugin>",
  "skillBranch": "<branch name of the plugin>",
  "startedAt": "<ISO of first dispatch>",
  "completedAt": "<ISO of last step return>",
  "totalTokens": <sum across all records, or null>,
  "totalDurationMs": <wall-clock start→finish>,
  "stageCount": <number of dispatches including retries>,
  "stages": [
    {
      "stage": 1, "skill": "of1-discovery", "name": "discovery", "model": "opus",
      "startedAt": "...", "durationMs": 41200, "totalTokens": 18400, "toolUses": 22,
      "status": "done", "summary": "narrative + 5 key pages identified",
      "retries": 0, "error": null
    }
  ],
  "improvements": [ ... ]
}
```

Each entry in `stages[]` is a per-**skill dispatch** record (its own `stage`/`skill` fields
carry the identity); the array key stays `stages` for reader compatibility.

Capture the skill version before the first dispatch:

```bash
SKILL_PLUGIN_DIR="<absolute path to the of1-demo-skills plugin root>"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

### Improvements array

After writing the step data, append an `improvements` array. For each step that had problems —
retries, token spend >2× the expected range, duration >3× expected, or a recovered
`failed`/`review` — write one actionable observation naming the **specific stage and skill**:

```json
{
  "improvements": [
    {
      "stage": 2,
      "skill": "of1-prototype",
      "issue": "Prototype took 22 min (2× expected) for 5 pages — of1-prototype's visual-diff loop rejected the first render on 2 of 5 pages",
      "suggestion": "Pass tighter page-selection guidance from Stage 1 (avoid heavy client-side pages) so the first render is likelier to pass the visual-diff loop"
    },
    {
      "stage": 3,
      "skill": "of1-integration",
      "issue": "of1-integration returned 'review' (5/6 checks passed)",
      "suggestion": "Inspect of1-integration-result.json `checks` and fix the failing prerequisite in Stage 2 output"
    }
  ]
}
```

Rules: only include steps with real problems; be specific and cite the stage/skill; each
`suggestion` is a concrete change to a skill or dispatch prompt; a clean run writes
`"improvements": []` (don't invent issues); skill-level bugs get filed as skill edits, not
left as audit notes.

## Shared knowledge references

The orchestrator and the Stage 1/2 step skills rely on:
- `knowledge/common-pitfalls.md` — DA/EDS/git/image/logo rules, curl traps, DA+EDS preview auth, allowed-domain table.
- `of1-integration/knowledge/worker-config-schemas.md` (in the **of1-skills** repo) — DA-first config: what lives in git (`of1/config/config.json`, + `cta-template.json` with `cta-template`) vs DA (`/of1/brand-voice`, `/of1/config/personas`, `/of1/config/suggestions`, …).
- `of1-integration/knowledge/design-tokens-resolution.md` (in the **of1-skills** repo) — the one `DESIGN.json` resolver + fail-loudly rule.
