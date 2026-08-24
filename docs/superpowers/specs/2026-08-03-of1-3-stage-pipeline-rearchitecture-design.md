# OF1 Demo Pipeline — 3-Stage Re-Architecture

**Date:** 2026-08-03
**Branch:** `skills-v5-next`
**Status:** Design approved, pending spec review

## Problem

The OF1 demo pipeline is a flat sequence of 12 numbered steps duplicated across
two orchestrators (`of1-demo-orchestrator` for SLICC, `of1-demo-orchestrator-cc`
for Claude Code) — and steps 6–12 are duplicated *again* inside
`of1-adopt-existing-site`. On top of the duplication, three bespoke OF1 skills
(`of1-extract-design-tokens`, `of1-build-prototypes`, `of1-convert-to-eds`)
re-implement site extraction, prototyping, and EDS conversion with hand-rolled
"screenshot diff (3×)" fidelity loops — work now done better by the maintained
`stardust:replica` skill and its measured source-fidelity gate.

The pipeline is conceptually two things: **(1) build a replica of the demo
website, (2) build the OF1 integration on top of it.** The current structure
hides that behind 12 flat steps.

## Goals

Both of these, equally:

1. **De-duplication** — the OF1-integration logic (today steps 6–12) lives in
   exactly one place (`of1-adopt-existing-site`), consumed by both the full
   demo pipeline and standalone adoption.
2. **Conceptual clarity** — the pipeline reads as three sequential-*ish* stages.

## Target architecture — three stages

```
┌─ STAGE 1 · COLLECT ─────────────────────────────────────────────┐
│  of1-discover-narrative → demo narrative + product/persona focus │
│  + machine-readable keyPages list (the demo STORY)               │
└───────────────────────────────┬─────────────────────────────────┘
        ┌───────────────────────┴───────────────────────┐
        ↓                                                ↓
┌─ STAGE 2 · REPLICA ──────────────┐   ┌─ STAGE 3 · CONTENT track ─────────┐
│  stardust:replica <URL>          │   │  (adopt-site, pipeline mode)       │
│    --pages <narrative slugs>     │   │  8a brand voice ∥ 8b content       │
│  extract→preserve→recreate→gate→ │   │        ↓                           │
│  migrate→deploy (NO rollout)     │   │  9 suggestions                     │
│  ⇒ EDS site + DESIGN.json        │   │  (sourced from REAL external site) │
└──────────────┬───────────────────┘   └──────────────┬─────────────────────┘
               └───────────────┬───────────────────────┘
                               ↓  JOIN (replica done + content ready)
              ┌─ STAGE 3 · SITE-INTEGRATION track ──────────────┐
              │  6 templates ∥ 7 OF1 styling ∥ 10 CTA           │
              │        ↓                                         │
              │  11 config review → 12 deploy                    │
              └──────────────────────────────────────────────────┘
```

### Stage boundaries

- **Stage 1 — Collect:** `of1-discover-narrative` only. Produces the demo story
  AND a machine-readable list of key page slugs. Retires
  `of1-extract-design-tokens` — replica now owns all site extraction.
- **Stage 2 — Replica:** `stardust:replica <URL> --pages <slug,...>`. Bounded
  mode. Produces a near-pixel-perfect EDS site on the target repo/branch plus a
  synthesized (`bounded-single`) `DESIGN.json`/`PRODUCT.md`/`DESIGN.md` at the
  project root. No site-wide rollout.
- **Stage 3 — OF1 integration:** `of1-adopt-existing-site` in **pipeline mode**.
  Owns all of today's steps 6–12, split into a content track (parallel with
  Stage 2) and a site-integration track (after the join).

## Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Stage 2 uses `stardust:replica`, not the bespoke OF1 extract/prototype/convert skills. | Maintained skill with a measured source-fidelity gate (≤10% pixel, 3-iteration cap) replaces hand-rolled screenshot loops. |
| D2 | Bounded `--pages` scope, not `--prep`. | Fast, demo-focused, no site-wide rollout. Still emits a valid (`bounded-single`) `DESIGN.json`. Trade-off: skips module/block detection + site-wide voice — Stage 3 doesn't need them. |
| D3 | Stage 1 keeps discovery/narrative; it drives BOTH replica scope (`--pages`) and Stage 3 product focus. | Narrative is the one thing replica doesn't do; it earns its keep as the scoping input for both later stages. |
| D4 | Stage 3 = delegate to `of1-adopt-existing-site`, which owns steps 6–12 for both callers. | Single source of truth for the OF1 layer — the core de-dup goal. |
| D5 | In pipeline mode, Stage 3 sources brand/content/products from the **real external domain**, not the replica. | Higher fidelity real data. Standalone adopt-site is unchanged (extracts from replica). One `contentSource` override parameter. |
| D6 | Stage 2 and the Stage 3 **content track (8a/8b/9)** run in parallel. | The content track needs only the live external site + narrative — zero dependency on replica's output. Reclaims parallelism the flat 3-stage model would have lost. |
| D7 | Templates (6), OF1 styling (7), and CTA (10) run **after the join**. | Removes any need for a mid-run "design-ready" signal from replica. The join is a single clean barrier: replica fully done AND content track done. CTA technically only needs tokens, but serializing one fast JSON gen behind the join costs ~nothing and keeps the barrier simple. |
| D8 | **Adopt-site owns the whole Stage-3 parallelism** (Option 1). Top orchestrator launches replica + adopt-site concurrently; adopt-site runs its content track immediately and gates its join steps on a `replica-done` signal the parent provides. | Keeps Stage 3 whole and reuses adopt-site's existing dependency graph; adds exactly one external gate instead of re-splitting the step graph across two layers. |
| D9 | Keep two full orchestrators (SLICC + CC) for now; both shrink to Stage 0–1 + launch Stage 2 & 3. | Sprinkle UI vs TaskCreate differ meaningfully; consolidation is out of scope. |
| D10 | Progress UI: 3 top-level stages; adopt-site emits its own step-level sub-progress within Stage 3. | Clean top level, detail where delegated. |
| D11 | Work on branch `skills-v5-next`. | — |

## Integration seams (contracts to build)

1. **Stage 1 → Stage 2 (page selection).** `of1-discover-narrative` must emit a
   machine-readable artifact (e.g. `narrative.json` with `keyPages: [...]`)
   mapping to what replica's `--pages` expects. Today the narrative is prose +
   an HTML deliverable; add the structured artifact.

2. **Stage 2 → Stage 3 (site handoff).** Replica leaves an EDS site + a
   `DESIGN.json` on the branch. Adopt-site's existing Phase 0/1 already detect
   an existing EDS site + `DESIGN.json`, so the handoff is structurally
   satisfied. Confirm adopt-site accepts a `bounded-single`-provenance
   `DESIGN.json` (per replica preserve-direction §1a), not only a `--prep`
   verbatim one.

3. **Stage 3 content source (live-site override).** A single parameter passed at
   delegation (e.g. `contentSource=<external-domain>`) that adopt-site's
   brand-voice / content-metadata / suggestions steps honor instead of the
   replica preview URL. Standalone mode default is unchanged (replica URL).

4. **Replica-done gate (D8).** The top orchestrator provides adopt-site a
   `replica-done` signal (terminal state — a status file / token / path check).
   Adopt-site gates its site-integration track (6/7/10/11/12) on it, and runs
   its content track (8a/8b/9) immediately on launch.

## Orchestrator changes

- **Both orchestrators** shrink from 12-step dispatch tables to:
  Stage 0 (deps check) → Stage 1 (discovery) → launch Stage 2 (`stardust:replica
  --pages`) AND Stage 3 (`of1-adopt-existing-site`, pipeline mode) concurrently.
- **Adopt-site (pipeline mode):** launches the content track immediately; gates
  the site-integration track on `replica-done`. Standalone mode is unchanged.
- **Content source parameter** wired through the delegation.

## Retired skills

- `of1-extract-design-tokens` — superseded by replica Phase 1.
- `of1-build-prototypes` — superseded by replica Phase 3 (recreate).
- `of1-convert-to-eds` — superseded by replica Phase 5 (migrate/deploy).

Retirement = removed from the pipeline and orchestrator step tables; the
screenshot-diff loops baked into the orchestrators go with them. (Exact
disposition — delete vs archive — decided in the implementation plan.)

## Non-goals

- Consolidating the two orchestrators into one dual-runtime skill (D9).
- Changing standalone `of1-adopt-existing-site` behavior (D5).
- Influencing `stardust:replica`'s internal concurrency — treated as opaque.
- Cross-stage overlap beyond the content track ↔ replica parallelism in D6.

## Open questions for the implementation plan

- Exact schema + filename for the Stage 1 `keyPages` artifact, and how each
  orchestrator reads it into the `--pages` argument.
- Concrete form of the `replica-done` signal on each runtime (SLICC status file
  vs CC Agent return).
- Whether adopt-site needs any change to accept `bounded-single` `DESIGN.json`,
  or already handles it.
- Disposition of the three retired skills (delete vs archive).
- How the 3-stage top-level view + delegated sub-progress render in the SLICC
  sprinkle (UI work) vs CC task list.
```