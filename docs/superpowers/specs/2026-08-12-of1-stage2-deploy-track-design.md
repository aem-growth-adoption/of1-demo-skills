# OF1 Demo — Alternative Stage 2: Extract → Prototype → stardust:deploy

**Date:** 2026-08-12
**Branch:** `skills-v5-next` (edited in place)
**Status:** Design — awaiting review

## Goal

Replace the current `skills-v5-next` Stage 2 — a single `stardust:replica --pages` call
that recreates key pages pixel-perfect in one shot — with a three-substep Stage 2 modeled on
the `main` branch's pipeline:

1. **Extraction** — capture the live site's design tokens, brand surface, per-page image URLs,
   screenshots, and logo.
2. **Prototype** — generate pixel-perfect, self-contained HTML reproductions of the key pages.
3. **Deploy** — convert those prototypes into real EDS blocks + content pages via
   `stardust:deploy` (the replacement for the retired Adobe `snowflake` skill).

Stage 1 (`of1-discovery`) and Stage 3 (`of1-integration` and all its Integrate-stage skills)
stay functionally unchanged. Only Stage 2 and the contracts that touch its boundary change.

### Why

The request: an alternative to the replica-based Stage 2 that mirrors how `main` builds the EDS
site — extract, prototype, then a real block-based EDS conversion. `main` used
`of1-extraction` → `of1-prototype` → `of1-snowflake`; this design keeps steps 1 and 2 the same
in spirit and swaps the snowflake conversion for `stardust:deploy`.

## Non-goals

- No changes to Stage 1 discovery behavior.
- No changes to Stage 3's Integrate-stage skill graph, dependency edges, or the skills
  themselves (`of1-build-templates`, `of1-style-generative-block`, `of1-extract-brand-voice`,
  `of1-extract-content`, `of1-build-quick-suggestions`, `of1-build-cta-template`,
  `config-review`, `of1-publish`) — only the env-var rename and the gate-source change at the
  Stage 2 / Stage 3 boundary reach them.
- No redesign of `stardust:extract`, `stardust:prototype`, or `stardust:deploy` — those are
  upstream skills consumed as-is.
- `stardust:replica` is not deleted from the world; it is simply no longer the Stage 2 driver
  in this branch.

## Architecture

### New Stage 2 (three sequential substeps)

| Substep | New skill (v5-next vocabulary) | Wraps | Key outputs |
|---|---|---|---|
| 2a Extraction | `of1-extract-design-tokens` | `stardust:extract` against the live external domain | `stardust/current/DESIGN.json`, `DESIGN.md`, `stardust/current/pages/*.json` (real image URLs), `assets/logo.svg`, `assets/screenshots/*.png`, `deliverables/brand-review.html` |
| 2b Prototype | `of1-build-prototypes` | `stardust:prototype` (faithful-copy bridge: promote extraction outputs + minimal `direction.md`) | `stardust/prototypes/prototype-*.html` (self-contained, inline CSS), mirrored to `deliverables/prototype-*.html` for EDS hosting |
| 2c Deploy | `of1-convert-to-eds` | `stardust:deploy` (invoked once for the full prototype set) | `blocks/<name>/{name.js,name.css}`, `content/*.html`, `content/fragments/{nav,footer}.html`, `styles/styles.css`; pushes to the demo branch; writes the Stage-2 done file |

Substeps run **sequentially**: 2a → 2b → 2c (2b needs 2a's tokens/screenshots; 2c needs 2b's
prototypes). This is stricter than the current single-call Stage 2, and is the same ordering
`main` uses.

The three skills are **rewritten fresh** in v5-next conventions (thin wrappers, `assets/*.mjs`
helpers where a script is needed, status JSON per the pipeline contract), using `main`'s
`of1-extraction` / `of1-prototype` / `of1-snowflake` as structural references. Naming follows
v5-next's `of1-extract-*` / `of1-build-*` vocabulary rather than `main`'s older names.

### Concurrency

Same shape as today: Stage 2 and the Stage 3 **content track**
(`of1-extract-brand-voice` ∥ `of1-extract-content` → `of1-build-quick-suggestions`) dispatch
concurrently right after Stage 1. The content track needs only the live external domain
(`OF1_CONTENT_SOURCE`), so it does not wait for any Stage 2 substep.

The Stage 3 **site-integration track** gates on the Stage 2 done file exactly as before — it
just waits for 2c instead of the replica.

### Contract preservation (why Stage 1 and Stage 3 barely move)

- **DESIGN.json location is unchanged.** 2a writes `stardust/current/DESIGN.json`, which is the
  first path the Stage 3 design-tokens resolver already checks. Stage 3 consumes it identically.
- **The site-track gate is unchanged in mechanism**, only in name and producer (below).

## Renames (decision: rename both)

| Old | New | Touched in |
|---|---|---|
| env var `OF1_REPLICA_DONE_FILE` | `OF1_STAGE2_DONE_FILE` | `pipeline-contract.md`, `dispatch-cc.md`, `dispatch-slicc.md`, `of1-integration/SKILL.md`, orchestrator `SKILL.md` |
| file `replica-done.json` | `stage2-done.json` | producer (2c `of1-convert-to-eds`), all readers/prose above |

`stage2-done.json` is written by substep 2c (`of1-convert-to-eds`) after `stardust:deploy`
succeeds and its artifacts verify — it signals "Stage 2 finished," the same role
`replica-done.json` played. Its shape stays a minimal `{"stage":2,"status":"done", ...}`.

## Fidelity gate (decision: lean on sub-skill gates only)

The current consolidated orchestrator gate — `assets/check-replica-artifacts.mjs` reading
`stardust/replica/progress.json` — is **removed**, because the extract/prototype/deploy pipeline
never produces `progress.json`. Fidelity is enforced by the sub-skills that own it:

- `stardust:prototype` runs its own visual-diff loops against the captured screenshots (2b).
- `stardust:deploy` runs its own content-diff + Local-QA gates (2c).

The orchestrator's Stage-2 responsibility shrinks to an **artifact-existence check** after 2c:
at least one block dir, one `content/*.html` per prototype, `styles/styles.css`, and the shared
nav/footer fragments exist; all pages return 200 on EDS preview.

### Preserving the demo-retro protections at the substep level

The two demo retros in memory (bot-block placeholder imagery; measured fidelity fail) were about
`stardust:replica`'s gate. In this pipeline the equivalent risk moves **upstream to extraction**
(a bot-blocked source makes `stardust:extract` capture placeholder/gradient imagery instead of
real product photography). Rather than a consolidated orchestrator gate, `of1-extract-design-tokens`
(2a) **must fail loud** when `stardust:extract` reports a blocked/degraded capture — surface the
capture warning and hard-stop Stage 2 rather than letting a placeholder-image extraction flow into
prototype and deploy. This keeps the retro protection, located where the risk now lives.
`check-replica-artifacts.mjs` and its `assets/README.md` entry are deleted.

## Files changed

**New:**
- `skills/of1-extract-design-tokens/SKILL.md` (+ any `assets/` helper, e.g. a brand-review fill script)
- `skills/of1-build-prototypes/SKILL.md`
- `skills/of1-convert-to-eds/SKILL.md`

**Modified:**
- `skills/of1-demo-orchestrator/SKILL.md` — 3-stage diagram, Stage→skill table (Stage 2 now three
  substeps), "What Stage 2 & 3 own" (replica-fidelity paragraph → sub-skill gates + extract fail-loud),
  concurrency prose, deliverable URL for Stage 2.
- `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` — 3-stage model table, state-files
  inventory (drop `replica-done.json` / `stardust/replica/progress.json`; add `stage2-done.json` +
  extraction/prototype/deploy outputs), **delete the "Stage 2 artifact gate" section** and replace
  with the artifact-existence check + extract fail-loud note, env-var table
  (`OF1_STAGE2_DONE_FILE`), deliverable-URL table, audit `skill` examples (`stardust:replica` →
  `stardust:extract`/`stardust:prototype`/`stardust:deploy`).
- `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` — Stage 2 dispatch: three sequential
  Agent dispatches (2a→2b→2c) instead of one replica dispatch; env-var rename.
- `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md` — same for scoops.
- `skills/of1-demo-orchestrator/knowledge/design-tokens-resolution.md` — drop the replica
  bounded-single provenance case; DESIGN.json now always from `stardust:extract` at
  `stardust/current/`.
- `skills/of1-demo-orchestrator/knowledge/common-pitfalls.md` — repoint any replica-specific
  pitfall pointers.
- `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml` — progress UI: Stage 2 shown as three
  substeps (or one stage with three sub-rows); step names/skills.
- `skills/of1-demo-orchestrator/assets/README.md` — drop the `check-replica-artifacts.mjs` entry.
- `skills/of1-integration/SKILL.md` — pipeline-mode prose ("alongside a running `stardust:replica`"
  → "alongside Stage 2 extract→prototype→deploy"), env-var rename, DESIGN.json provenance note
  (bounded-single-from-replica → from-extract).
- `skills/of1-check-dependencies/SKILL.md` + `scripts/verify.sh` — require `stardust:deploy` (and
  keep extract/prototype); adjust the "incl. `stardust:replica`" line to name the three sub-skills
  the new Stage 2 uses; clean-slate glob already covers `stardust/`, `content/`, `blocks/`.
- `skills/of1-build-templates/SKILL.md`, `skills/of1-extract-brand-voice/SKILL.md`,
  `skills/of1-extract-content/SKILL.md`, `skills/of1-build-quick-suggestions/SKILL.md`,
  `skills/of1-style-generative-block/SKILL.md` + `assets/ensure-nav-footer.mjs`,
  `skills/of1-publish/SKILL.md` + `assets/fill-demo-hub.mjs`, `skills/of1-discovery/SKILL.md`,
  `README.md` — repo-wide sweep: rename `replica` references at the Stage-2 boundary and any
  `OF1_REPLICA_DONE_FILE` mentions; leave legitimate references intact where a skill genuinely
  still means something replica-specific (none expected after the sweep).

**Deleted:**
- `skills/of1-demo-orchestrator/assets/check-replica-artifacts.mjs`

## Verification approach

This is a docs/instructions repo — no unit-test harness. "Tests" are grep/structural assertions
per task:

- New skill files exist with correct `name:` frontmatter and reference the intended stardust
  sub-skill.
- No dangling `OF1_REPLICA_DONE_FILE` / `replica-done.json` / `check-replica-artifacts` references
  remain outside historical design docs.
- `stage2-done.json` / `OF1_STAGE2_DONE_FILE` are wired in the producer (2c) and every reader.
- `verify.sh` lists the new Stage-2 skills and passes `bash -n`.
- The orchestrator's 3-stage diagram, Stage→skill table, and dispatch files agree on the three
  substeps and their order.

## Open risks (flagged, not hidden)

- **Sequential Stage 2 is slower than the single replica call** — three dispatches instead of
  one, each with its own model turn. Accepted: it mirrors `main` and gives clearer per-substep
  review/retry points.
- **Extraction fail-loud on bot-block depends on `stardust:extract` surfacing a machine-readable
  blocked-capture signal.** During implementation, confirm what `stardust:extract` actually emits
  on a blocked capture (exit code, a field in `stardust/state.json`, or only prose) before wiring
  the hard-stop; if it only emits prose, the 2a skill must inspect the captured imagery/screenshots
  for placeholder/gradient markers itself. This is the one place the "lean on sub-skill gates"
  decision needs a concrete anchor.
