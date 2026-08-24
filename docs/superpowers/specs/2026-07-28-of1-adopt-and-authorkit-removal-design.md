# of1-adopt: OF1 on an existing EDS/Stardust site, plus AuthorKit cleanup

## Context

`of1-demo-skills` today serves exactly one use case well: turning a brand-new
external domain into a full OF1 demo, end to end, via `of1-demo`/`of1-demo-cc`
(12 sequential/fanned-out steps: setup → discovery → extraction → prototype →
stardust-deploy → templates ∥ styling ∥ (brand-voice ∥ content-metadata ∥
cta-template → suggestions) → config-review → deploy).

Two other real use cases exist but have no first-class path today:

1. **Existing EDS/Stardust site → introduce OF1.** The site's blocks, content
   pages, and design tokens already exist. Nothing should crawl an external
   domain or pixel-clone anything — the pipeline should reuse what's on disk
   and only produce the OF1-specific layer (templates, `/of1` page, tenant
   config).
2. **Existing OF1 project → iterate** (refresh products/personas/voice/
   suggestions/CTA/signals). No orchestrator needed — the relevant config
   skill is already standalone-invocable and self-locates repo state. This
   case just needs to be documented, not built.

Investigating (1) surfaced a second, unrelated problem: `stardust:deploy`
(the `adobe/skills` plugin this repo depends on) **removed its AuthorKit
runtime** upstream (PR #274, `ca8ef38`, "make vanilla aem-boilerplate the
runtime; remove AuthorKit") and now targets vanilla `aem-boilerplate` only —
no overlay engine, no static chrome fragments, no `bootstrap-authorkit.mjs`.
Two of our skills (`of1-stardust-deploy`, `of1-generative-block-styler`)
still assume the AuthorKit shape and are broken against current
`stardust:deploy` output. This must be fixed before `of1-adopt` can be built
on top of them, since `of1-adopt` reuses both.

## Goals

- Fix `of1-stardust-deploy` and `of1-generative-block-styler` to match
  current (post-AuthorKit) `stardust:deploy` output.
- Add `of1-adopt`: one new skill, runnable on both Claude Code and SLICC with
  the same step graph, no sprinkle/scoop UI push in either runtime.
- Teach the shared steps it reuses (`of1-extraction`, `of1-template-generation`)
  to detect what already exists in the repo and adapt their input source,
  instead of hard-requiring Track A's external-domain-crawl / pixel-clone
  chain (Approach A, previously agreed).
- Document the third use case (iterate on an existing OF1 project) as direct
  skill invocation — no new orchestrator.

## Non-goals

- No changes to `of1-demo` / `of1-demo-cc` (full e2e orchestrators stay as
  the main entry point for brand-new demos).
- No SLICC sprinkle UI for `of1-adopt` — this is an explicit product
  decision, not a limitation to work around.
- Not rebuilding `of1-brand-voice-extractor`, `of1-content-metadata`,
  `of1-quick-suggestions`, `of1-cta-template-builder`, `of1-config-review`,
  or `of1-deploy` — they already source from `stardust/current/` + live
  crawl and need no changes for either new use case.
- Not deciding today whether `styles/of1.css` (page-chrome CSS) is still a
  separate file worth generating once the overlay engine is gone — flagged
  as an open question for the implementation plan (see below).

## Architecture changes

### 1. `of1-stardust-deploy` — drop AuthorKit assumptions

Current skill still says: *"if the repo is vanilla `aem-boilerplate` rather
than AuthorKit, run the Runtime bootstrap first (`bootstrap-authorkit.mjs`)"*
and gates its own artifact-verification on finding chrome fragments at
either `content/fragments/{nav,footer}.html` or `fragments/{header,footer}.html`
(both AuthorKit-era paths).

Change:
- Remove all AuthorKit/bootstrap language — vanilla `aem-boilerplate` is now
  `stardust:deploy`'s only supported target; there is nothing to bootstrap.
- Update the artifact-verification gate to match current `stardust:deploy`
  output: `content/nav.html` + `content/footer.html` (authored DA docs,
  ENCODE side) and `blocks/header` + `blocks/footer` (presentation, DECODE
  side) — not "shared chrome fragments" copied to a special path.
- Update the runtime-detection-probe passthrough language: `stardust:deploy`
  now writes `stardust/runtime-contract.json` with `"runtime": "vanilla-eds"`
  always; this skill can read/pass that through rather than re-guessing.

### 2. `of1-generative-block-styler` — `/of1` becomes an ordinary page

The old design existed because AuthorKit's overlay engine
(`applyTemplateOverlay()`) unconditionally replaced `<main>.innerHTML` when
applying a page template — which would destroy the live `of1` block and its
running JS. The skill patched `scripts/scripts.js` with a passthrough
exception (`data-slot-passthrough`) specifically to stop that from
happening on the `/of1` page.

Vanilla `aem-boilerplate` has no such overlay engine — a content page's
`<main>` is just whatever the DA document says, full stop. Nothing ever
tries to replace it. Separately, the OF1 personalization behavior (fetching
the of1-web-gen SDK, streaming generated sections) happens entirely inside
`of1.js`'s own `decorate()` function at runtime — it is unaffected by how
the page itself is authored. There is no remaining reason to special-case
`/of1` as a page.

Change:
- **Remove:** Step 0's `scripts/scripts.js` patch, `templates/of1.html`,
  `data-overlay`/`data-slot-passthrough`, the `fragments/of1/{header,footer}.html`
  copy-and-path-guessing logic, and the "discover stardust:deploy's fragment
  path" fallback loop.
- **Replace with:** author `content/of1.html` as an ordinary DA body
  fragment, following `stardust:deploy`'s own "Content page scaffold"
  contract (§9) — `<header></header>` + `<main>` containing a `metadata`
  block (Title/Description) + one section with the `of1` block table +
  `<footer></footer>`. The stock `header`/`footer` blocks pick up `/nav`
  and `/footer` automatically, exactly like any other page on the site — no
  placeholder `/nav`/`/footer` docs need to be invented by this skill either,
  since the site already has real ones.
- **Keep unchanged:** the `blocks/of1/of1.js` + `of1.css` install (Steps
  0's file-copy part, minus the patch), the block-level CSS generation
  (Steps 1–5 body: hero/cards/tables/skeleton styling for
  dynamically-generated sections), and the render-verification steps (9b),
  just checked against a normal page URL instead of an overlay-templated one.
- **Open question for the implementation plan:** with no overlay engine,
  `/of1` inherits the site's normal `styles/styles.css` automatically like
  every other page. Decide whether a separate `styles/of1.css` page-chrome
  file is still warranted (e.g. for `/of1`-specific chrome tweaks) or can be
  dropped entirely in favor of just using the site's existing stylesheet.

### 3. Shared steps learn to detect existing artifacts (Approach A)

Two steps `of1-adopt` reuses currently hard-assume Track A's pixel-clone
chain as their *only* input source. Each gets a small "detect what already
exists" branch added — no new skill files, no duplicated logic:

**`of1-extraction`:**
- Today: always delegates to `stardust:extract` against an **external
  domain** URL.
- New: if `stardust/current/DESIGN.json` already exists in the repo, skip
  the step entirely (nothing to extract — reuse what's there). Otherwise,
  run `stardust:extract` against the site's **own live EDS preview URL**
  (`https://{branch}--{repo}--{owner}.aem.page/`) instead of an external
  domain — same delegation, different target argument.

**`of1-template-generation`:**
- Today: `deliverables/prototype-*.html` (Track A's pixel-clone HTML) is
  documented as "the sole visual/structural reference."
- New: if `deliverables/prototype-*.html` doesn't exist, fall back to
  `stardust/current/DESIGN.json` + live screenshots of the site's own
  rendered EDS pages (captured the same way the orchestrator already
  captures EDS reference screenshots for Track A) + the repo's real
  `styles/styles.css` tokens. The `base`/`intent`/`assemble` fan-out modes
  and file contracts are unaffected — only the input-source resolution at
  the top of the skill changes.

No other shared step needs a Track-B-aware branch:
`of1-brand-voice-extractor`, `of1-content-metadata`, `of1-quick-suggestions`,
and `of1-cta-template-builder` already read from `stardust/current/` +
live crawl regardless of how that data was produced.

### 4. `of1-adopt` — new skill, one file, dual-runtime

A single `skills/of1-adopt/SKILL.md`, structured like the atomic step
skills' existing "Claude Code: use the Skill tool / SLICC: read and follow"
dual-runtime blocks — not split into `of1-adopt` + `of1-adopt-cc` the way
`of1-demo`/`of1-demo-cc` are. One shared step graph and dependency table;
a short "Dispatch" section branches the actual invocation mechanism:

- **Claude Code:** `Agent` tool dispatch + `TaskCreate` for progress
  tracking, same JSON-status-block contract (`{"step":N,"status":...}`)
  `of1-demo-cc` already uses.
- **SLICC:** `scoop_scoop` dispatch, status files under the shared state
  dir, event-driven completion handling (no polling loops) — but **no
  `sprinkle_send` calls at all**. There is no sprinkle UI for this skill on
  either runtime.

Step graph (no discovery, no prototype, no stardust-deploy stage — the
site and its blocks already exist):

```
1 (setup) → 2 (artifact detection, inline)
              │
       [DESIGN.json exists?]
         no → 3 (extraction, own-site mode)
         yes → skip to 4/6
              │
      ┌───────┴────────┐
      ↓                ↓
  Track A          Track B
  4 (templates:    6a (brand-voice) ∥ 6b (content-metadata) ∥ 7 (CTA template)
  base→5×intent→          ↓
  assemble)        8 (suggestions — needs 6a + 6b)
      ↓                ↓
  5 (OF1 styling)      │
      └───────┬────────┘
               ↓
      9 (config review, inline — needs 6a + 6b + 7 + 8)
               ↓
      10 (deploy — needs 4 + 5 + 9)
```

- Track A (4→5) and Track B (6a ∥ 6b ∥ 7 → 8) both start as soon as step 3
  finishes (or is skipped) — same concurrency rule `of1-demo-cc` already
  uses between its steps 6-12, just renumbered and shorter.
- Step 4 keeps its own internal fan-out (`base` sequential → 5 `intent`
  agents parallel → `assemble` sequential) exactly as it already works for
  Track A — this skill's extension (§3) only changes *what* the `base`
  phase reads as visual reference, not the fan-out mechanics.
- Step 5 depends only on step 1 (block/CSS install) + benefits from step 4's
  output existing for consistency, but per the current
  `of1-generative-block-styler` dependency table, it doesn't structurally
  block on step 4 — confirm this against the fixed skill (§2) when writing
  the plan.
- Model assignment per step: same rule of thumb as `of1-demo-cc` — Opus only
  where output quality cascades downstream (extraction's tokens when it
  runs, OF1 styling's multi-step DA authoring); Sonnet for everything else
  (config skills, template fan-out, deploy).

### 5. Documentation: extending an existing OF1 demo

New doc, `skills/docs/extending-an-of1-demo.md` (sibling of the existing
`skills/docs/superpowers/` docs). No orchestrator; direct skill invocation:

| Want to change... | Call | Then |
|---|---|---|
| Products, personas, use cases, FAQs | `of1-content-metadata` | `of1-config-review` → `of1-deploy` |
| Brand tone/voice | `of1-brand-voice-extractor` | same |
| Suggestion chips / search copy | `of1-quick-suggestions` | same |
| CTA visual template | `of1-cta-template-builder` | same |
| Fake acquisition signals (demo narrative) | `of1-signals` | no redeploy — extension-only config, never synced |

Each config skill already self-locates `repo-config.json`/repo state, so no
setup step is required before invoking one directly. Always finish with
`of1-config-review` (regenerate the review page) then `of1-deploy` (commit +
sync), except `of1-signals`.

## Testing/verification approach

- `of1-stardust-deploy` and `of1-generative-block-styler` fixes: verify by
  running each against a repo already converted by the current (post-#274)
  `stardust:deploy` — confirm the artifact-verification gates pass without
  any AuthorKit-path fallback ever triggering, and that `/of1` renders
  correctly as a normal page (header/footer load `/nav`/`/footer`
  automatically, `of1` block decorates and streams generated content).
- `of1-extraction`'s own-site mode: verify against a repo with no
  `stardust/current/DESIGN.json`, confirm it crawls the EDS preview URL (not
  an external domain) and produces the same `DESIGN.json`/screenshot shape
  Track A produces.
- `of1-template-generation`'s fallback: verify against a repo with no
  `deliverables/prototype-*.html`, confirm the `base` phase reads
  `DESIGN.json` + live screenshots and produces the same template/CSS
  contract the assemble phase expects.
- `of1-adopt` end to end: run against (a) a repo with `DESIGN.json` already
  present (step 3 should be skipped) and (b) a repo without it (step 3
  should run in own-site mode) — confirm both converge on the same
  downstream artifacts and the config-review deliverable is correct in both
  cases. Run once on Claude Code (Agent dispatch) and once on SLICC (scoop
  dispatch) to confirm the dual-runtime dispatch section is correct on both.
