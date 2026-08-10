# OF1 demo pipeline — shared contract (one spec, both runtime dispatch files cite it)

Everything here is **runtime-independent**. The single `of1-demo-orchestrator` skill cites this
file instead of restating it, from both of its runtime dispatch references (`dispatch-cc.md`,
`dispatch-slicc.md`). Only the dispatch *mechanics* differ (scoop_scoop + sprinkle licks vs
Agent + TaskCreate) and those stay in the per-runtime files. **If a rule below is wrong, fix it
here once** — do not copy it into the dispatch files, or they will drift (that drift is what
produced the `stages`/`steps` audit bug; see the audit schema note).

## Environment variables — canonical vocabulary

One name per thing. Skills must use these names and not invent synonyms.

| Var | Set by | Read by | Notes |
|---|---|---|---|
| `OF1_STATE_DIR` | orchestrator | every step | State/IPC dir. On SLICC this is `/shared/of1-demo-orchestrator/`. |
| `OF1_DEMO_REPO` | orchestrator | every step | Absolute path to the local EDS repo clone. |
| `SKILL_DIR` | orchestrator | the dispatched step | Absolute path to the step skill's own directory (for its `assets/`). |
| `ADOBE_IMS_TOKEN` | user / environment | `of1-check-dependencies`, `of1-publish` | **Canonical DA credential** — the raw IMS token value. First choice in the token-resolution order. |
| `OF1_TOKEN_FILE` | user / environment | `of1-check-dependencies`, `of1-publish`, `download-images.mjs` | Alternative to `ADOBE_IMS_TOKEN`: a path to a JSON file `{"access_token":"..."}`. Second in the resolution order. |
| `OF1_PIPELINE_MODE` | orchestrator (Stage 3) | `of1-integration` + content-track skills | `1` when adopt-site runs inside the full pipeline (vs standalone). |
| `OF1_CONTENT_SOURCE` | orchestrator (Stage 3) | content-track skills (8a/8b/9) | The external domain to extract content from, in pipeline mode. |
| `OF1_REPLICA_DONE_FILE` | orchestrator (Stage 3) | orchestrator's site-track gate | Path to `replica-done.json` — the gate, not passed to step agents. |
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
| 2 | Replica — recreate key pages as branded EDS | `stardust:replica <URL> --pages <slugs>` |
| 3 | OF1 integration — steps 6–12 | defined by `of1-integration` |

Stage 2 and the Stage 3 **content track** (8a/8b/9) dispatch concurrently after Stage 1.
The Stage 3 **site-integration track** (6·7·10 → 6-assemble → 11 → 12) gates on Stage 2's
`replica-done.json`. **The step-6–12 graph, dependency edges, and pipeline-mode timing are
defined once in `of1-integration`** — the orchestrator reads them there on both runtimes.

## Nesting cap — the top-level orchestrator dispatches steps 6–12 itself

**On both runtimes, one dispatch level does not nest:** a Claude Code subagent has no Agent
tool, and a SLICC scoop cannot call `scoop_scoop()`. Therefore Stage 3 is **not** a single
delegation to `of1-integration` that fans out internally — the top-level orchestrator
dispatches each step 6–12 itself, reading `of1-integration` as the step-definition +
dependency reference. A single Stage-3 sub-dispatch could never spawn the sub-steps; the
pipeline would stall. (This is why there is no HARD RULE forbidding the orchestrator from
"re-implementing" 6–12 — it must own them.)

## State files — the complete inventory

These are the ONLY state files the pipeline writes. If a file is not in this table, no skill
writes it — do not promise or read one that isn't here. (This table replaces the earlier
`stage-<N>-summary.json` / `pipeline.log` entries, which were documented but never written and
have been removed; cross-session resume is not implemented, so nothing depends on them.)

| File | Written by | Read by | Purpose |
|---|---|---|---|
| `setup.json` | `of1-check-dependencies` | orchestrator | Verified paths + owner/repo/branch + token source |
| `repo-config.json` | `of1-check-dependencies` (setup) | every step | owner, repo, branch, contentPrefix, repoDir, domain, URLs |
| `narrative.json` | Stage 1 (`of1-discovery`) | orchestrator, Stages 2/3 | keyPages/focus/persona |
| `of1-discovery-output.md` | Stage 1 | `of1-build-templates`, `fill-demo-hub.mjs` | discovery narrative (markdown) |
| `replica-done.json` | Stage 2 (`stardust:replica`) | orchestrator | signals Stage 2 agent finished (NOT that output is demo-grade — see gate below) |
| `stardust/replica/progress.json` | Stage 2 (`stardust:replica`) | orchestrator (Stage 2 artifact gate) | replica's own per-page/per-breakpoint ledger — the gate reads it |
| `step-<id>-status.json` | each dispatched step | orchestrator | per-step status (grammar below) |
| `pipeline-audit.json` | orchestrator | `fill-demo-hub.mjs` | run telemetry (schema below) |

State dir: `$OF1_STATE_DIR` on Claude Code; `/shared/of1-demo-orchestrator/` on SLICC. Same file
names on both.

## Stage 2 artifact gate — replica-done ≠ demo-grade

`replica-done.json` means the Stage 2 agent **finished**, not that its output is usable. When the
source is bot-protected (Akamai/Cloudflare — apple.com is the canonical case), `stardust:replica`
cannot capture it: its source-fidelity gate records the breakpoint as `gate-blocked` with
`pixelPct: null`, substitutes **placeholder/gradient imagery** for product photography, and (in the
run that motivated this gate) still marked `pass: true`. The pipeline then deploys a chromeless,
imageless demo and reports success. `stardust:replica` is out of scope to edit, so the of1 side
enforces its own documented rule ("a gate that can't read the live source has no pass to report")
at the pipeline boundary.

**Contract:** after `replica-done.json` appears and **before** dispatching the Stage 3
site-integration track or deploying, the orchestrator runs:

```bash
node "<orchestratorSkillDir>/assets/check-replica-artifacts.mjs" "<repoDir>"
```

It reads `stardust/replica/progress.json` and exits:

| Exit | Meaning | Orchestrator action |
|---|---|---|
| 0 | All breakpoints measured; no placeholder imagery | Proceed to Stage 3 |
| 2 | **BLOCKED-CAPTURE** — unmeasured gate marked pass, and/or placeholder/gradient imagery | **HARD STOP.** Do not dispatch Stage 3 or deploy. Escalate to the user: retry `--headed`, run a content-only demo, or abort. |
| 1 | `progress.json` missing/empty | Treat as Stage 2 failure; re-dispatch replica |

This gate is the ONLY thing standing between a bot-blocked source and a shipped-but-broken demo —
never skip it, never treat `replica-done.json` alone as permission to proceed.

## Per-step status / output contract

Every dispatched step ends by writing its status, and (on CC) emitting the same JSON block
as its final message. Canonical shape:

```json
{"step": "<id>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

- `<id>` is the exact step id from the graph (`1`, `2`, `6-base`, `6a`…`6e`, `6-assemble`,
  `7`, `8a`, `8b`, `9`, `10`, `11`, `12`).
- Status files are written to `$OF1_STATE_DIR/step-<id>-status.json` (SLICC: `/shared/of1-demo-orchestrator/`).
  Step skills' own "Completion" sections own the exact filename/shape; this is the grammar.
- On `failed`, also state what broke and what to retry.
- **Only the orchestrator pushes to the sprinkle / user-facing UI.** Step dispatches write files.

## Deliverable URLs — always include them

When surfacing ANY step's status, always include a `deliverable` URL (the UI's quick links
derive from these; a missing URL greys them out).

| Stage/step | Deliverable URL |
|---|---|
| 1 — discovery | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 2 — replica | `https://{branch}--{repo}--{owner}.aem.page/home` |
| 3 — steps 6–12 | each step emits its own URLs in its status JSON (gallery, `/of1`, `config-review.html`, final deploy index) — pass them through as-is; do NOT invent one URL for the whole stage |

## Pipeline audit schema

Write `$OF1_STATE_DIR/pipeline-audit.json` after the pipeline finishes (step 12 `done`) or
aborts (partial audit is still useful). Because the orchestrator dispatches every step 6–12
itself, **record each step individually** — there is no black-box Stage 3.

### Per-step record fields

| Field | Source |
|---|---|
| `stage` | Stage/step id (`1`, `2`, or a Stage 3 step id: `6-base`, `6a`…`6e`, `6-assemble`, `7`, `8a`, `8b`, `9`, `10`, `11`, `12`) |
| `name` | Human label (`discovery`, `replica`, `templates-base`, `styling`, `content`, `deploy`, …) |
| `model` | Model used for this dispatch (`inline` for steps 11/12, which run in the orchestrator's own context) |
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
is canonical** — the orchestrator emits it on both runtimes and it renders correctly. Do not rename it; if you
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
      "stage": "1", "name": "discovery", "model": "opus",
      "startedAt": "...", "durationMs": 41200, "totalTokens": 18400, "toolUses": 22,
      "status": "done", "summary": "narrative + 5 key pages identified",
      "retries": 0, "error": null
    }
  ],
  "improvements": [ ... ]
}
```

Each entry in `stages[]` is a per-**step** record (its own `stage` field carries the step id);
the array key stays `stages` for reader compatibility even though it now holds steps 1–12.

Capture the skill version before the first dispatch:

```bash
SKILL_PLUGIN_DIR="<absolute path to the of1-demo-skills plugin root>"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

### Improvements array

After writing the step data, append an `improvements` array. For each step that had problems —
retries, token spend >2× the expected range, duration >3× expected, or a recovered
`failed`/`review` — write one actionable observation naming the **specific step id**:

```json
{
  "improvements": [
    {
      "stage": "2",
      "issue": "Replica took 22 min (2× expected) for 5 pages — stardust:replica's source-fidelity gate rejected the first render on 2 of 5 pages",
      "suggestion": "Pass tighter page-selection guidance from Stage 1 (avoid heavy client-side pages) so the first render is likelier to pass the fidelity gate"
    },
    {
      "stage": "10",
      "issue": "step 10 (CTA template) returned 'review' over CTA copy tone — one revision round before deploy",
      "suggestion": "Have Stage 1's narrative.json carry an explicit tone/voice guideline the content track consumes"
    }
  ]
}
```

Rules: only include steps with real problems; be specific and cite the step id; each
`suggestion` is a concrete change to a skill or dispatch prompt; a clean run writes
`"improvements": []` (don't invent issues); skill-level bugs get filed as skill edits, not
left as audit notes.

## Shared knowledge references

The orchestrator (both runtime dispatch files) and the step skills rely on:
- `knowledge/common-pitfalls.md` — DA/EDS/git/image/logo rules, curl traps, DA+EDS preview auth, allowed-domain table (carries `[SLICC]`/`[CC]` variants).
- `knowledge/worker-config-schemas.md` — JSON schemas for every `of1/config/*.json`.
- `knowledge/design-tokens-resolution.md` — the one `DESIGN.json` resolver + fail-loudly rule.
