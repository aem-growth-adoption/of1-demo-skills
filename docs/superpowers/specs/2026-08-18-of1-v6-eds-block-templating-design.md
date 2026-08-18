# OF1 v6 — EDS-block templating (design)

**Date:** 2026-08-18
**Branch:** `skills-v6-next`
**Status:** approved (brainstorming), pending spec review

## Problem

The v5 OF1 demo pipeline has two expensive/fragile parts:

1. **Stage 2 = `stardust:replica --pages`** synthesizes *bespoke* EDS blocks to
   pixel-match the target brand site. It runs Opus at high effort inside a
   per-page × per-breakpoint pixel-diff loop (≤10% ship bar, 20-minute
   wall-clock, re-dispatch on failure). This is the dominant cost of the
   pipeline and the most common failure point.
2. **Stage 3 `of1-build-templates`** hand-authors 15 *static* HTML shells
   (5 intents × 3 variations) whose styling is *inferred* from prototype
   screenshots + `DESIGN.json`. Because the styling is inferred rather than
   real EDS-rendered CSS, the templates "look subtly wrong when EDS renders
   them," and the grid is capped at 15 fixed layouts.

## Goal

Replace bespoke-block synthesis with **lifting the target's key pages onto
standard EDS blocks and personalizing via brand tokens**, and make templates
**real EDS block markup** instead of static HTML shells. Keep the
`of1-integration` backbone and the worker's fill-slots-at-runtime model.

Non-goals: pixel-perfect fidelity to the source (explicitly dropped);
redesigning the worker's intent classification; changing Stage 1 discovery.

## Key decisions (from brainstorming)

1. **Runtime model.** Template = authored EDS block markup (section divs +
   block-table divs) with `data-slot` cells. Worker pulls the template, fills
   slots, returns block markup to the client. The `/of1` delivery page runs
   **EDS decoration** (`decorateMain`/`loadBlocks`) on the returned markup,
   pulling each block's `.js`+`.css` from the EDS origin. Block assets load
   client-side, *not* against the worker's 50-subrequest cap. Styling is
   correct-by-construction (real block CSS + brand tokens).
2. **Block palette.** Fixed Adobe Block Collection set (hero, cards, columns,
   accordion, tabs, carousel, quote, fragment) + per-site additions only when
   a key page needs something standard blocks cannot express (Block Party pull
   or a small CDD-authored block).
3. **Stabilization gate.** Liftoff native only: `preview-import` visual compare
   + lint / no-JS-errors + human approval of the two lifted pages. No automated
   pixel-fidelity gate. `stardust:diff` is held in reserve as an advisory
   fallback if results come out bad — not wired in for v6.
4. **Entry point & scope.** External brand site (same as today's demo).
   Discovery picks keyPages; Stage 2 lifts the home page + one product page.
5. **Template composition.** Derive intent templates by recomposing the
   stabilized, brand-skinned blocks from the lifted pages into intent-specific
   layouts with slots. (Highest fidelity; templates render correctly because
   their blocks were already stabilized.)
6. **Repo scaffold.** Every experiment starts fresh from `aem-boilerplate`,
   then adds the fixed Block Collection set (+ per-site additions).
7. **Intent grid.** Keep the 5 intents (worker `byIntent` routing depends on
   them) but start with **1 variation each** (down from 3); expandable later.

## Architecture — three stages

### Stage 1 — Discovery (unchanged)
`of1-discovery` → `narrative.json`, keyPages (home + 1 product).

### Stage 2 — Liftoff & block stabilization (NEW — replaces `stardust:replica`)

Single dispatched skill `of1-liftoff`, orchestrating inline:

1. **Scaffold** fresh from `aem-boilerplate`; add the fixed Block Collection
   set.
2. **Extract brand** — `stardust:extract` on the live brand site → `DESIGN.json`
   (tokens only; the cheap half of stardust).
3. **Skin** — deterministic map of `DESIGN.json` tokens into `styles/styles.css`
   custom properties (type/color/spacing vars). Re-skins every standard block
   with zero block-code changes.
4. **Lift** — `page-import` maps home + product content onto the standard
   blocks (authored `.plain.html`).
5. **Per-site additions** — only if a key page needs something standard blocks
   cannot express.
6. **Stabilize gate** — liftoff native (see decision 3).

Outputs: a deployed, brand-skinned EDS site; `liftoff-done.json` (Stage-3 gate
signal, mirroring the old `replica-done.json`); `blocks-manifest.json` (the
stabilized palette).

### Stage 3 — Integration backbone (mostly unchanged; templating rewritten)

- **`of1-build-templates` (rewrite)** — input: `blocks-manifest.json` +
  lifted-page patterns + `DESIGN.json` + narrative. Output: intent templates as
  block-table markup + `data-slot` contracts, inlined into
  `templates-catalog.json` (+ `templates.json` routing — worker contract
  preserved). Drops `of1-template-base.css` inference.
- `of1-extract-brand-voice`, `of1-extract-content`, `of1-build-cta-template`,
  `of1-build-quick-suggestions`, `of1-style-generative-block`, `config-review`,
  `of1-publish` — carry over unchanged.

### Runtime (worker backbone kept, client contract extended)

Worker picks template by intent → fills slots → returns block markup. `/of1`
page runs EDS decoration on it. Requires a change in the worker/delivery code,
which lives **outside this repo** — the main external dependency and technical
risk.

## Components

| Component | Type | Responsibility |
|---|---|---|
| `of1-liftoff` | NEW skill | Stage 2: scaffold + add blocks + extract tokens + skin + page-import + stabilize; emits `liftoff-done.json` + `blocks-manifest.json` |
| Token-skinning step | NEW (inside `of1-liftoff`) | Deterministic `DESIGN.json` → `styles/styles.css` custom-property mapping |
| `blocks-manifest.json` | NEW interface | Records stabilized palette: blocks + variant classes used, each block's slot-capable regions, skinning state. Consumed by `of1-build-templates` |
| `of1-build-templates` | REWRITE | Recompose stabilized blocks into intent templates as block-table markup + slot contracts + inlined catalog |
| Worker / client decoration | MODIFY (external repo) | `/of1` runs EDS `decorateMain`/`loadBlocks` on worker-returned markup |
| `of1-demo-orchestrator` | MODIFY | Swap Stage 2 dispatch (replica → `of1-liftoff`); update `pipeline-contract.md`, `dispatch-cc.md`, artifact-check script (`replica-done` → `liftoff-done` + manifest), gate logic |

### Per-skill ledger

- **NEW:** `of1-liftoff`
- **REWRITE:** `of1-build-templates`
- **MODIFY:** `of1-demo-orchestrator`; worker/delivery (external — client-side decoration)
- **UNCHANGED:** `of1-discovery`, `of1-extract-brand-voice`, `of1-extract-content`, `of1-build-cta-template`, `of1-build-quick-suggestions`, `of1-style-generative-block`, `of1-publish`, `of1-check-dependencies`
- **RETIRED from pipeline:** `stardust:replica` dispatch (skill stays; unused by OF1)

## Data flow

```
brand URL
  └─ Stage 1 of1-discovery → narrative.json (keyPages: home, product)
       └─ Stage 2 of1-liftoff
            ├─ scaffold(aem-boilerplate) + add Block Collection set
            ├─ stardust:extract → DESIGN.json (tokens)
            ├─ skin: DESIGN.json → styles/styles.css vars
            ├─ page-import(home, product) → authored .plain.html
            ├─ [per-site block additions if needed]
            ├─ stabilize gate (preview-import compare + lint + human approve)
            └─ emit liftoff-done.json + blocks-manifest.json
                 └─ Stage 3 of1-integration backbone
                      ├─ of1-build-templates: recompose blocks → intent
                      │    templates (block-table markup + data-slots) →
                      │    templates-catalog.json + templates.json
                      ├─ brand-voice / content / cta / quick-suggestions
                      ├─ of1-style-generative-block (blocks/of1/of1.css)
                      ├─ config-review (human gate)
                      └─ of1-publish
                           └─ RUNTIME: worker fills slots → returns block
                              markup → /of1 client EDS-decorates (loads block
                              js/css from EDS origin)
```

## Risks & open items

1. **Worker/delivery change is out-of-repo.** The client-side EDS decoration of
   worker-returned block markup must be implemented in the worker/delivery
   codebase (`of1-gen-web`). v6 in this repo is blocked at runtime until that
   lands. Needs coordination; scope it as a separate tracked change.
2. **Token-only skinning ceiling.** Brand identity partly lives in
   layout/composition, not just tokens. Standard blocks + token skinning may
   read as generic for distinctive brands. Mitigation: per-site block additions
   (decision 2); escalate to `stardust:diff` advisory only if results are bad.
3. **`blocks-manifest.json` schema is the new contract** between Stage 2 and
   `of1-build-templates`. It must capture enough (blocks, variants, slot
   regions) for faithful recomposition without re-inferring styling. To be
   specified in the implementation plan.
4. **Sub-dispatch nesting.** Neither runtime lets a dispatched skill fan out
   further. `of1-liftoff` must call `page-import` / CDD steps inline (as Skill
   reads), not as nested dispatches — mirror how `of1-integration` handles this.

## Success criteria

- A demo runs end-to-end from a brand URL without any pixel-diff loop.
- Stage 2 cost is a fraction of `stardust:replica` (no Opus/high per-breakpoint
  iteration).
- Lifted home + product pages render cleanly (no JS errors, lint clean) and read
  as on-brand to a human reviewer.
- Intent templates render correctly under EDS decoration because they reuse
  already-stabilized blocks.
