---
name: of1-liftoff
description: Stage 2 replacement for stardust:replica — lift key pages onto standard EDS blocks + brand-token skinning, no pixel-diff. Scaffolds/verifies an EDS repo against aem-boilerplate, adds a fixed Block Collection set, extracts brand tokens, skins styles/styles.css, lifts home + product pages onto standard blocks via page-import, and stabilizes via a liftoff-native gate (render + lint + no-JS-errors + human approval — never a pixel diff).
user-invocable: true
---

# OF1 Liftoff — Stage 2 (block-templated recreation, no pixel-diff)

Replaces `stardust:replica` as Stage 2 of the OF1 demo pipeline. Instead of re-authoring
pixel-perfect HTML/CSS per page and gating on a measured pixel diff, `of1-liftoff` lifts each
key page onto the **standard EDS block palette** (aem-boilerplate + a fixed Block Collection
set), skins that palette with the site's real brand tokens, and gates on render/lint/JS-health
plus a human approval — never on visual fidelity. This is a deliberate scope cut from replica:
faster, cheaper, and immune to the bot-blocked-capture / placeholder-imagery failure modes that
motivated `check-replica-artifacts.mjs`.

## Env

| Var | Set by | Purpose |
|---|---|---|
| `OF1_STATE_DIR` | orchestrator | State/IPC dir. `narrative.json` lives here; this skill writes `liftoff-done.json` here on success. |
| `OF1_DEMO_REPO` | orchestrator | Absolute path to the local EDS repo clone. Already verified as a valid EDS checkout by `of1-check-dependencies` (has `scripts/aem.js` or `scripts/lib-franklin.js`, `scripts/scripts.js`, `styles/styles.css`) — there is no fallback to clone a fresh repo. |
| `SKILL_DIR` | orchestrator | Absolute path to this skill's own directory (for `assets/skin-tokens.mjs`, `assets/validate-blocks-manifest.mjs`). |
| `DOMAIN` | orchestrator | The site's domain, passed to `stardust:extract`. |

`keyPages` — read `<OF1_STATE_DIR>/narrative.json`'s `keyPages[].slug` (written by `of1-discovery`;
the homepage is always slug `home`). `narrative.json` does not carry a `role` field — derive it
yourself for this skill's purposes: `slug == "home"` → `role: "home"`; every other key page →
`role: "product"` (the only two roles this skill's manifest/ledger schemas use). If a demo has more
than one non-home key page, lift all of them, each recorded with `role: "product"`.

## Flow — 6 ordered steps

Full detail for each step is in `knowledge/liftoff-flow.md`. Summary:

1. **Scaffold** — `of1-check-dependencies`'s repo check is structural only ("any org/repo works" —
   `skills/of1-check-dependencies/scripts/verify.sh:3-4`), so it does NOT guarantee `OF1_DEMO_REPO`
   descends from `aem-boilerplate`; enforcing that is this skill's own job. If `OF1_DEMO_REPO` is
   empty, seed it by cloning `https://github.com/adobe/aem-boilerplate`. If it's an existing
   checkout, verify boilerplate PROVENANCE (`package.json` `name === "aem-boilerplate"`, or
   `fstab.yaml`/`scripts/aem.js` attribution) — not just directory-name presence. If provenance
   can't be established, FAIL LOUDLY and stop (never backfill blocks onto an arbitrary repo). Only
   once provenance is established, backfill any missing default block
   (`columns, hero, cards, fragment, header, footer`) from upstream `aem-boilerplate`.
2. **Add Block Collection set** — pull `accordion, tabs, carousel, quote` (the fixed additive set)
   from the Block Collection/Block Party into `blocks/`, inline via the `block-collection-and-party`
   skill's search/get tooling.
3. **Extract** — invoke `stardust:extract <DOMAIN>` inline (tokens-only, the cheap half of stardust)
   to produce `DESIGN.json`.
4. **Skin** — run `assets/skin-tokens.mjs` against the resolved `DESIGN.json` and
   `styles/styles.css`.
5. **Lift** — invoke `page-import` inline for the `home` page and each `product` key page, mapping
   content onto the block palette from steps 1–2; pull additional blocks (Block Party or a small
   `content-driven-development` custom block) only when the palette genuinely can't express a
   section, and record any such addition in the manifest.
6. **Stabilize** — build `blocks-manifest.json`, validate it, run the render/lint/no-JS-errors
   check plus a human-approval gate per page, write `stardust/liftoff/progress.json`, then run
   `check-liftoff-artifacts.mjs`.

## `blocks-manifest.json` schema

Written to the repo root (or wherever step 6 places it — `tokensSource` records the actual
skinned stylesheet path). It **MUST pass** `node "$SKILL_DIR/assets/validate-blocks-manifest.mjs" <path>`
before this skill reports success — do not hand-wave past a validator failure.

Fields **enforced by the validator** (`assets/validate-blocks-manifest.mjs`):

| Field | Type | Rule |
|---|---|---|
| `generatedAt` | string | required |
| `source.domain` | string | required |
| `source.pages` | array | non-empty; each entry needs `slug` (string) and `role` (string) |
| `tokensSource` | string | required |
| `blocks` | array | non-empty |
| `blocks[].name` | string | required, non-empty |
| `blocks[].usedOn` | array | required, non-empty |
| `blocks[].slotRegions` | array | required (may be empty) |
| `blocks[].slotRegions[].selector` | string | required, non-empty |
| `blocks[].slotRegions[].slotType` | string | one of `text \| image \| link \| list` |

Conventional fields present in the fixture but **not enforced** by the validator — still write
them, since they document provenance for a human reviewer, but a missing one will not fail
validation: `blocks[].collection` (`aem-boilerplate \| aem-block-collection \| block-party \| custom`),
`blocks[].variants`, `blocks[].slotRegions[].role`.

Verbatim valid example (`assets/fixtures/manifest-valid.json`):

```json
{
  "generatedAt": "2026-08-18T00:00:00Z",
  "source": { "domain": "example.com", "pages": [ { "slug": "/", "role": "home" }, { "slug": "/product/x", "role": "product" } ] },
  "tokensSource": "styles/styles.css",
  "blocks": [
    { "name": "hero", "collection": "aem-boilerplate", "variants": [""], "usedOn": ["home", "product"],
      "slotRegions": [ { "selector": ".hero h1", "role": "headline", "slotType": "text" }, { "selector": ".hero picture img", "role": "image", "slotType": "image" } ] },
    { "name": "cards", "collection": "aem-block-collection", "variants": ["", "dark"], "usedOn": ["home"],
      "slotRegions": [ { "selector": ".cards li", "role": "item", "slotType": "text" } ] }
  ]
}
```

## Ledger schema — `stardust/liftoff/progress.json`

Read by the Stage 2 artifact gate, `of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs`
(liftoff-native — no pixel diff, ever). Shape (`assets/fixtures/liftoff-clean.json` in the
orchestrator skill is a verbatim valid example):

```json
{
  "pages": [
    { "slug": "/", "role": "home", "rendered": true, "lint": "pass", "jsErrors": 0, "approved": true },
    { "slug": "/product/x", "role": "product", "rendered": true, "lint": "pass", "jsErrors": 0, "approved": true }
  ],
  "blocksManifest": "blocks-manifest.json"
}
```

**CRITICAL PRODUCER RULE:** every page object MUST set all four of `rendered`, `lint`, `jsErrors`,
and `approved` explicitly. The gate's checks are:

```js
if (p.rendered !== true) fail;
if (String(p.lint) === 'fail') fail;
if (Number(p.jsErrors) > 0) fail;
if (p.approved !== true) fail;
```

An **omitted `jsErrors`** field passes silently: `Number(undefined)` is `NaN`, and `NaN > 0` is
`false` — the gate treats a page with unknown JS-error status as clean. Never leave `jsErrors`
(or any of the four fields) unset "because it defaults to fine" — it doesn't default to fine, it
defaults to unchecked, and the gate cannot tell the difference from your side.

## Outputs & handoff

- `stardust/liftoff/progress.json` — the ledger above.
- `blocks-manifest.json` — validated per the schema above.
- Resolvable `DESIGN.json` (see Constraints — resolution order and fail-loudly rule).
- Skinned `styles/styles.css` (via `assets/skin-tokens.mjs`).
- Lifted `.plain.html` pages for `home` + each `product` key page.
- `<OF1_STATE_DIR>/liftoff-done.json` on success:

  ```json
  { "stage": 2, "status": "done" }
  ```

  (Mirrors `replica-done.json`'s shape — signals only that this skill *finished*; the orchestrator
  still must run `check-liftoff-artifacts.mjs` before treating Stage 2 as demo-grade, exactly as it
  already does for `replica-done.json` per `of1-demo-orchestrator/knowledge/pipeline-contract.md`
  § "Stage 2 artifact gate".)

- Final status block (same grammar as every other pipeline step):

  ```json
  { "stage": 2, "skill": "of1-liftoff", "status": "done" | "failed", "summary": "...", "deliverables": [ { "url": "...", "label": "..." } ] }
  ```

## Constraints

- **No nested dispatch.** `stardust:extract`, `page-import`, `block-collection-and-party`, and
  `content-driven-development` are invoked **inline** — as a `Skill` tool call (Claude Code) or a
  direct read-and-follow of the target skill file (SLICC) — from inside this skill's own execution
  context. Never as a separately dispatched sub-agent/sub-scoop. Mirrors how `of1-integration`
  handles the same constraint: on both runtimes one dispatch level does not nest (a Claude Code
  subagent has no `Agent` tool; a SLICC scoop cannot spawn sub-scoops), so whichever level dispatched
  `of1-liftoff` cannot recover if `of1-liftoff` itself tries to fan out further — it must do all of
  its sub-skill work in its own context.
- **`DESIGN.json` resolution — fail loudly, never invent tokens.** After `cd "$OF1_DEMO_REPO"`,
  resolve in this order: `stardust/current/DESIGN.json` → `./DESIGN.json` → (if neither exists)
  fall back to the repo's own `styles/styles.css` `:root` block as the token source. If **none** of
  the three exist, STOP and report `status: "failed"` naming the missing brand spec — do not guess
  or synthesize plausible-looking tokens. (Same resolver and same fail-loudly rule as
  `of1-demo-orchestrator/knowledge/design-tokens-resolution.md`.)
- **`stardust:diff` is NOT used in v6.** It remains a valid stack-agnostic fidelity probe and is a
  reserved fallback if a future stage needs pixel/structural diffing again, but `of1-liftoff`'s own
  stabilize gate is render + lint + no-JS-errors + human approval only — do not add a pixel-diff
  step back in under this skill.
