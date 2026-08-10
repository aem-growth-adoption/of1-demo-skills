---
name: of1-demo-orchestrator
description: Orchestrator that turns a website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, run as 3 stages — discover a narrative and focus pages, recreate those pages as a branded EDS replica via stardust:replica, then run OF1 integration (content, styling, config review, deploy) as the Integrate-stage skills per of1-integration's step graph. Runs on both Claude Code and SLICC; it detects the runtime and follows the matching dispatch reference. Use when the user asks to build, demo, or one-shot an OF1 demo for a domain.
user-invocable: true
---

# OF1 Demo — Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services, in
3 stages: **discovery → replica → OF1 integration**. Auto-approves by default; the user can
interrupt to revise any step.

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

Run `of1-check-dependencies` in your own context (CC: via the **Skill tool**, not an Agent — it's
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
Stage 2: stardust:replica <URL>            Stage 3: OF1 integration (Integrate skills)
  --pages <slugs>                            THIS orchestrator dispatches each skill,
  → EDS site + DESIGN.json                    per adopt-site's graph: content track
  → write replica-done.json                   (brand-voice/content/suggestions) runs NOW;
                                              site-integration track (templates·styling·cta
                                              → assemble → config-review → publish)
                                              gates on replica-done.json
        └─────────────────────────┬─────────────────────────┘
                                  ↓  join + deploy (of1-publish) owned by THIS orchestrator
                             (deploy)
```

- **Stage 1** (discovery) runs first; read its `narrative.json` and build the comma-separated slug
  list from `keyPages[].slug`.
- **Stage 2** (replica) and the **Stage 3 content track** (`of1-extract-brand-voice`/`of1-extract-content`)
  dispatch concurrently right after Stage 1. The content track needs only the live external site.
- The **Stage 3 site-integration track** gates on Stage 2's `replica-done.json`, then fans out per
  `of1-integration`'s dependency table: the extraction step (if `DESIGN.json` absent) →
  `of1-build-templates`(base) ∥ `of1-style-generative-block` ∥ `of1-build-cta-template` →
  `of1-build-templates`(intent-*) → `of1-build-templates`(assemble);
  `of1-build-quick-suggestions` after `of1-extract-brand-voice`+`of1-extract-content`;
  `of1-generate-config-review` (inline) after
  `of1-extract-brand-voice`+`of1-extract-content`+`of1-build-quick-suggestions`+`of1-build-cta-template`;
  `of1-publish` (deploy, inline) after
  `of1-build-templates`(assemble)+`of1-style-generative-block`+`of1-generate-config-review`.
- **Fan out at every eligible point.** The pipeline is complete when `of1-publish` returns `done`.

The Integrate-skill graph, dependency edges, and `OF1_PIPELINE_MODE=1` timing are **defined once** in
`of1-integration` — read them there; this orchestrator is the dispatcher, not a reimplementer.

## Stage → skill mapping

| Stage | Name | Skill | Depends on |
|---|---|---|---|
| 1 | Collect | `of1-discovery` → `narrative.json` + `discovery.html` | setup |
| 2 | Replica | `stardust:replica --pages` → EDS replica + `DESIGN.json` + `replica-done.json` | stage 1 (keyPages) |
| 3 | OF1 integration (Integrate skills) | dispatched by THIS orchestrator per `of1-integration` (pipeline mode) | stage 1; site-track also on replica-done |

## What Stage 2 & 3 own (do not reimplement here)

- **Pixel fidelity** is owned by Stage 2 (`stardust:replica`) — it runs its own source-fidelity
  comparison/fix loop against the live site. Do not run screenshot-diff loops in the orchestrator.
- **`of1-generate-config-review` (config review) and `of1-publish` (deploy + pre-launch checklist)**
  run **inline** in the orchestrator's own context, following `of1-integration`'s Step 11/Step 12
  sections (including its check-5 adaptation for the adopt flow). `of1-publish`'s checklist gates the
  OF1-integration stage's `done` status.

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
- **`knowledge/worker-config-schemas.md`** — JSON schemas for every `of1/config/*.json`.
- **`knowledge/design-tokens-resolution.md`** — the one `DESIGN.json` resolver + fail-loudly rule.

## Notes

- One domain at a time. No multi-tenant parallel pipelines.
- Resume across sessions is not yet implemented.
