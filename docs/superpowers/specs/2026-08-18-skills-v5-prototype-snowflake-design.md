# OF1 Demo — skills-v5 Prototype + Snowflake Stage 2

**Date:** 2026-08-18
**Repos:** `of1-demo-skills` (branch `skills-v5`) and `of1-labs` (container + service)
**Status:** Design — approved, awaiting implementation plan

## Goal

Make `skills-v5` a real, distinct pipeline variant. Today `skills-v5` and
`skills-v5-replica` are byte-for-byte identical branches — both run Stage 2 as a single
`stardust:replica --pages` call. This design rebuilds `skills-v5`'s Stage 2 to mirror the
`main` (v4) approach: **extract → prototype → snowflake** — three sequential substeps that
capture the site, reproduce key pages as pixel-perfect HTML prototypes, then convert those
prototypes into EDS overlay pages via the Adobe `snowflake` skill.

`skills-v5-replica` is left untouched and remains the replica-based variant. Both branches
continue to report as lab version `v5` for prompt/dispatch purposes, but the lab distinguishes
them at the step-tracking/UI layer so each shows its true Stage 2 shape.

### Why

The replica Stage 2 recreates pages pixel-perfect in one `stardust:replica` call. The
prototype+snowflake Stage 2 is the older, block-based conversion path from `main`: it produces
real EDS blocks via snowflake's overlay pattern rather than a bounded single-page replica. We
want to support both and select per-experiment by branch.

### Snowflake is available (not retired)

An earlier spec (`2026-08-12-of1-stage2-deploy-track-design.md`) assumed the Adobe `snowflake`
skill was retired and substituted `stardust:deploy`. That assumption was wrong: `snowflake`
still ships in the marketplace at
`adobe/skills → plugins/aem/edge-delivery-services/skills/snowflake/SKILL.md` (the 6-phase
overlay-pattern skill). The container installs `aem-edge-delivery-services@adobe-skills`
unpinned at build time, so it pulls a version that includes `snowflake`. This design therefore
keeps the true `snowflake` conversion, not `stardust:deploy`.

## Non-goals

- No change to Stage 1 (`of1-discovery`) behavior.
- No change to Stage 3's Integrate-stage skill graph or dependency edges — only the Stage-2
  boundary (done-file name/producer) and the extraction step's packaging change.
- No change to `skills-v5-replica`'s Stage 2. Replica stays the replica-based variant.
- No redesign of the upstream stardust or snowflake skills — they are consumed as-is.
- No change to `skillsVersion()`'s coarse `v4|v5` contract that drives the dispatch prompt.

## Architecture

### New Stage 2 on `skills-v5` (three sequential substeps)

| Substep | Skill | Wraps | Key outputs |
|---|---|---|---|
| 2a Extract | `of1-extract-design` (**new**) | `stardust:extract` against the live external domain | `stardust/current/DESIGN.json`, `DESIGN.md`, per-page image URLs, `assets/logo.svg`, screenshots, `deliverables/brand-review.html` |
| 2b Prototype | `of1-prototype` (**ported from `main`**) | `stardust:prototype` | `stardust/prototypes/prototype-*.html` (self-contained, inline CSS), mirrored to `deliverables/prototype-*.html` |
| 2c Snowflake | `of1-snowflake` (**ported from `main`**) | `aem-edge-delivery-services:snowflake`, once per prototype | EDS overlay artifacts (`templates/`, `fragments/`, `styles/`, DA body); writes the Stage-2 done file |

Substeps run strictly sequentially (2a → 2b → 2c): 2b needs 2a's tokens/screenshots, 2c needs
2b's prototypes. This mirrors `main`'s ordering.

`of1-prototype` and `of1-snowflake` are ported from `main` and adapted to `skills-v5`
conventions: the v5 status-file contract (`of1-<skill>-status.json`), the `OF1_STAGE2_DONE_FILE`
env indirection, and the v5 dispatch references. `of1-snowflake` stays a thin per-prototype
wrapper around the live `snowflake` skill (it owns the 6-phase methodology; the wrapper just
loops per prototype and overrides branch handling so artifacts land on the demo branch).

### `of1-extract-design` — a shared extraction skill (both v5 branches)

Extraction is **not** new technology in the v5 pipeline: `of1-integration` already has a
conditional extraction step that invokes `stardust:extract` directly when `DESIGN.json` is
absent. This design factors that capability into one dedicated, dispatchable skill —
`of1-extract-design` — used at two call sites:

1. **Stage 2a on `skills-v5`** — run against the live external domain, up front, so its
   `stardust/current/DESIGN.json` feeds `of1-prototype` and Stage 3.
2. **`of1-integration`'s conditional extraction step (both v5 branches)** — the inline
   "`stardust:extract` against the preview URL" prose is replaced by a dispatch to
   `of1-extract-design`, keeping the existing `HAS_DESIGN_JSON` gate: present → skip, absent →
   run it.

Because `of1-integration` is shared across both v5 branches, adding `of1-extract-design` and
rewiring the conditional step lands on `skills-v5-replica` as well. That is intended (DRY): on
the replica branch `stardust:replica` still produces `DESIGN.json`, so the Stage-3 extraction
skips exactly as today; on the prototype branch Stage 2a already produced `DESIGN.json`, so the
Stage-3 extraction also skips. `of1-extract-design` runs as a Stage-3 fallback only when no
`DESIGN.json` exists (e.g. an adopt/integration flow).

`of1-extract-design` carries the **fail-loud-on-bot-block** guard: if `stardust:extract`
reports a blocked/degraded capture (placeholder/gradient imagery instead of real product
photography), it hard-stops rather than letting a degraded extraction flow into prototype +
snowflake. This preserves the two demo-retro protections (bot-block placeholder imagery;
measured-fidelity fail) at the point where that risk now lives. Confirm during implementation
what `stardust:extract` actually emits on a blocked capture (exit code, a `stardust/state.json`
field, or only prose); if only prose, `of1-extract-design` must inspect the captured imagery
for placeholder/gradient markers itself.

### Concurrency

Unchanged in shape. Stage 2 and the Stage 3 **content track**
(`of1-extract-brand-voice` ∥ `of1-extract-content` → `of1-build-quick-suggestions`) dispatch
concurrently right after Stage 1; the content track needs only the live external domain, so it
waits for no Stage 2 substep. The Stage 3 **site-integration track** gates on the Stage-2 done
file — it just waits for 2c (snowflake) instead of the replica.

### Fidelity gate

The consolidated replica gate (`assets/check-replica-artifacts.mjs` reading
`stardust/replica/progress.json`) is **removed** on `skills-v5` — the prototype pipeline never
produces `progress.json`. Fidelity is enforced by the sub-skills: `stardust:prototype` runs its
own visual-diff loops against captured screenshots (2b); `snowflake` runs its own content
checks (2c). The orchestrator's Stage-2 responsibility shrinks to an artifact-existence check
after 2c (at least one block/template dir, one page per prototype, shared styles + nav/footer;
all pages 200 on EDS preview) plus the 2a extraction fail-loud.

### Done-file at the Stage 2 / Stage 3 boundary

- Env var `OF1_REPLICA_DONE_FILE` → `OF1_STAGE2_DONE_FILE` (generic; renamed on both v5
  branches so the shared `of1-integration` and dispatch files never drift).
- The **filename** the env points at differs per branch: `stage2-done.json` on `skills-v5`
  (written by 2c `of1-snowflake`), `replica-done.json` on `skills-v5-replica` (written by
  `stardust:replica`, unchanged). Env indirection absorbs the difference — Stage 3 reads
  `$OF1_STAGE2_DONE_FILE` identically on both. Shape stays `{"stage":2,"status":"done", ...}`.

## Files changed — of1-demo-skills (`skills-v5`)

**New:**
- `skills/of1-extract-design/SKILL.md` (+ `assets/` brand-review fill helper if needed)
- `skills/of1-prototype/SKILL.md` (ported from `main`, adapted to v5 conventions)
- `skills/of1-snowflake/SKILL.md` (ported from `main`, adapted to v5 conventions)

**Modified:**
- `skills/of1-demo-orchestrator/SKILL.md` — 3-stage diagram + Stage→skill table (Stage 2 = three
  substeps), "What Stage 2 & 3 own" (replica-fidelity paragraph → sub-skill gates + 2a
  fail-loud), concurrency prose, Stage-2 deliverable URLs.
- `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` — 3-stage table, state-files
  inventory (drop `replica-done.json` / `stardust/replica/progress.json`; add `stage2-done.json`
  + extract/prototype/snowflake outputs), delete the "Stage 2 artifact gate" section (replace
  with artifact-existence check + 2a fail-loud), env-var table (`OF1_STAGE2_DONE_FILE`),
  deliverable-URL table, audit `skill` examples (`stardust:replica` →
  `stardust:extract`/`stardust:prototype`/`snowflake`).
- `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` — Stage 2 = three sequential Agent
  dispatches (2a→2b→2c); env-var rename.
- `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md` — same for scoops.
- `skills/of1-demo-orchestrator/knowledge/design-tokens-resolution.md` — DESIGN.json provenance:
  drop the replica bounded-single case; now always from `stardust:extract` at `stardust/current/`.
- `skills/of1-demo-orchestrator/knowledge/common-pitfalls.md` — repoint replica-specific pointers.
- `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml` — progress UI: Stage 2 as three
  substep rows (extract / prototype / snowflake).
- `skills/of1-demo-orchestrator/assets/README.md` — drop the `check-replica-artifacts.mjs` entry.
- `skills/of1-integration/SKILL.md` — conditional extraction step: inline `stardust:extract`
  prose → dispatch `of1-extract-design`; pipeline-mode prose ("alongside `stardust:replica`" →
  "alongside Stage 2 extract→prototype→snowflake"); env-var rename; DESIGN.json provenance note.
- `skills/of1-check-dependencies/SKILL.md` (+ `scripts/verify.sh`) — require the `snowflake`
  skill (and `stardust:extract`/`stardust:prototype`); name the three new Stage-2 skills.
- Repo-wide sweep — rename `replica`/`OF1_REPLICA_DONE_FILE` references at the Stage-2 boundary
  in the Stage-3 skills, `README.md`, etc.; leave genuinely replica-specific references intact.

**Deleted (on `skills-v5`):**
- `skills/of1-demo-orchestrator/assets/check-replica-artifacts.mjs`

## Files changed — of1-labs

**Version discrimination (both build roots — kept in sync manually):**
- `service/src/lib/pipeline-map.ts` — keep `skillsVersion() → "v4"|"v5"` (drives the dispatch
  prompt; unchanged). Add `pipelineVariant(skillsBranch) → "v4" | "v5-replica" | "v5-prototype"`
  (`/^skills-v5$/` or an explicit prototype match → `v5-prototype`; other `skills-v5*` →
  `v5-replica`; else `v4`). Add the v5-prototype `PIPELINE_SKILLS` / step list.
- `container/src/step-tracker.ts` — widen `SkillsVersion` (or add a parallel variant type) to
  carry the prototype variant. Add v5-prototype maps: task-step map, skill-id map
  (`of1-extract-design`, `of1-prototype`, `of1-snowflake`), status-file map, and a predecessor
  DAG with Stage 2 as three distinct steps (extract → prototype → snowflake). Leave the v5
  (replica) maps untouched. Update `maxStep`/`terminalStep`/`validSteps` for the new variant.

**Dashboard:**
- `service/app/routes/of1/pipelineLayout.ts` — add the v5-prototype layout (three Stage-2 rows);
  select layout by `pipelineVariant`.
- `service/app/routes/of1/StepTracker.tsx` — resolve layout via `pipelineVariant(skillsBranch)`.
- `service/app/routes/of1/CreateModal.tsx` — relabel the `skills-v5` option
  (e.g. "skills-v5 (prototype + snowflake)"); keep `skills-v5-replica` and `skills-v4 (legacy)`.

## Verification

Docs/instructions repo — grep/structural assertions:
- The three new/ported skill files exist with correct `name:` frontmatter and reference the
  intended upstream skill (`stardust:extract` / `stardust:prototype` / `snowflake`).
- No dangling `OF1_REPLICA_DONE_FILE` / `replica-done.json` / `check-replica-artifacts`
  references remain on `skills-v5` outside historical design docs.
- `stage2-done.json` / `OF1_STAGE2_DONE_FILE` are wired in the producer (2c) and every reader.
- Orchestrator 3-stage diagram, Stage→skill table, and dispatch files agree on the three
  substeps and their order.
- `verify.sh` lists the new Stage-2 skills and passes `bash -n`.

Lab — unit tests:
- Extend `container/tests/step-tracker.test.ts` with v5-prototype cases: `of1-extract-design` /
  `of1-prototype` / `of1-snowflake` map to their steps; predecessor auto-complete works across
  the three Stage-2 substeps; `terminalStep` for the prototype variant is correct; invalid step
  numbers are rejected per the variant's valid-step set.
- `pipelineVariant()` unit coverage: `skills-v5` → `v5-prototype`, `skills-v5-replica` →
  `v5-replica`, `main`/unset → `v4`.

## Open risks

- **Sequential Stage 2 is slower than the single replica call** — three dispatches, each with
  its own model turn. Accepted: mirrors `main` and gives clearer per-substep review/retry points.
- **Extraction fail-loud depends on `stardust:extract` surfacing a machine-readable
  blocked-capture signal.** Confirm the actual signal during implementation before wiring the
  hard-stop (see the `of1-extract-design` section).
- **Two build roots kept in sync by hand.** `container/src/step-tracker.ts` and
  `service/src/lib/pipeline-map.ts` have no shared import; the v5-prototype maps must be added to
  both. The existing code already carries this caveat for v4/v5.
- **`snowflake` is installed unpinned** in the container. If a future
  `aem-edge-delivery-services@adobe-skills` release drops `snowflake`, the prototype variant
  breaks at build time. Out of scope here, but worth a pin or a dependency check if it recurs.
