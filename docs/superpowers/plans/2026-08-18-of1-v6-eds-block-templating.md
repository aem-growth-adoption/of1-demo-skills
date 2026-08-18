# OF1 v6 — EDS-block templating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OF1 pipeline's expensive `stardust:replica` Stage 2 with a cheap "lift key pages onto standard EDS blocks + brand-token skinning" stage, and make templates real EDS block-table markup instead of static HTML shells — keeping the `of1-integration` backbone and the worker's fill-slots-at-runtime contract intact.

**Architecture:** Stage 1 discovery (unchanged) → Stage 2 new `of1-liftoff` skill (scaffold from `aem-boilerplate` + add Block Collection blocks + `stardust:extract` for tokens + skin `styles/styles.css` + `page-import` home & product + stabilize gate) → Stage 3 `of1-integration` backbone with a rewritten `of1-build-templates` that recomposes the stabilized blocks into per-intent block-table templates. The `blocks-manifest.json` is the contract between Stage 2 and templating. Runtime: worker fills slots and returns block markup; the `/of1` page runs EDS decoration client-side (that worker change is a separate out-of-repo track — Task 7).

**Tech Stack:** Claude Code / SLICC skills (Markdown `SKILL.md` + `knowledge/*.md`), Node ESM scripts (`.mjs`, no external deps), Adobe AEM Edge Delivery Services (aem-boilerplate + Block Collection), `stardust:extract`, Adobe `page-import` / `content-driven-development` skills.

## Global Constraints

- **Preserve the worker catalog contract verbatim.** `templates-catalog.json` fields: `useRouting, baseUrl, generatedAt, count, byIntent, templates[]`; each template entry: `name, intent, description, minItems, maxItems, stylesheet, slots, htmlContent`. `of1/config/templates.json` fields: `useRouting, baseUrl, catalogPath` (`/templates/templates-catalog.json`). Do NOT change `assemble-catalog.mjs`'s emitted shape.
- **Preserve the slot contract verbatim.** Attributes: `data-slot="key"` (text), `<a data-slot>` (link), `<img data-slot>` (image), `data-slot-list="key"` (list); card auto-hide via `data-card="N"` / `data-card-key`. Slot key pattern `<scope>.<field>`, item slots `item-1`…`item-9`. Template body is `<main>…</main>` only — no `<!DOCTYPE>/<html>/<head>/<body>`.
- **Preserve `fill-template.mjs` behavior** including the `safeHref` scheme allowlist (`http:`/`https:`/`mailto:`/`tel:`, root-relative/anchor/query, bare relative paths; all other explicit schemes → `#`).
- **DESIGN.json resolution order** (repo-root relative, after `cd "$OF1_DEMO_REPO"`): `stardust/current/DESIGN.json` → else `./DESIGN.json`; if neither and no `styles/styles.css` `:root`, **fail loudly** (`status: "failed"`/`"review"`) — never invent tokens.
- **Gate exit-code contract** (both `check-*-artifacts.mjs`): `0` = proceed, `2` = hard stop (do not dispatch Stage 3 / deploy), `1` = ledger missing/empty (treat as Stage 2 failure, re-dispatch).
- **The 5 intents** are fixed: `comparison, recommendation, deep-dive, budget, discovery` (`discovery` is the classification fallback). v6 emits **1 variation per intent** (down from 3).
- Node scripts are ESM `.mjs`, zero external dependencies, run via `node <script> <args>`.
- Commit after every task. Skills repo has no unit-test runner; **verification is fixture-based** — hand-author a fixture JSON/HTML, run the script, assert output/exit code. For prose (`SKILL.md`) tasks, verification is an explicit checklist + `grep` assertions + running the downstream script against a sample artifact the task produces.

---

### Task 1: `blocks-manifest.json` schema + validator

The manifest is the contract between Stage 2 (`of1-liftoff`) and Stage 3 (`of1-build-templates`). Lock it first.

**Files:**
- Create: `skills/of1-liftoff/assets/validate-blocks-manifest.mjs`
- Create (fixtures): `skills/of1-liftoff/assets/fixtures/manifest-valid.json`, `skills/of1-liftoff/assets/fixtures/manifest-invalid.json`
- Create (doc, filled in Task 3): the schema is documented in `skills/of1-liftoff/SKILL.md`

**Interfaces:**
- Produces: `validate-blocks-manifest.mjs` — CLI `node validate-blocks-manifest.mjs <path>`; exit `0` valid, `1` invalid (prints reasons to stderr). Manifest schema:
  ```json
  {
    "generatedAt": "<ISO8601>",
    "source": { "domain": "<str>", "pages": [ { "slug": "<str>", "role": "home|product|<str>" } ] },
    "tokensSource": "styles/styles.css",
    "blocks": [
      {
        "name": "<block dir name, e.g. hero>",
        "collection": "aem-boilerplate|aem-block-collection|block-party|custom",
        "variants": ["", "<variant class>"],
        "usedOn": ["home", "product"],
        "slotRegions": [
          { "selector": "<css selector within block>", "role": "<str>", "slotType": "text|image|link|list" }
        ]
      }
    ]
  }
  ```

- [ ] **Step 1: Write the valid fixture**

Create `skills/of1-liftoff/assets/fixtures/manifest-valid.json`:
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

- [ ] **Step 2: Write the invalid fixture** (missing `blocks`, bad `slotType`)

Create `skills/of1-liftoff/assets/fixtures/manifest-invalid.json`:
```json
{ "generatedAt": "2026-08-18T00:00:00Z", "source": { "domain": "example.com", "pages": [] },
  "blocks": [ { "name": "hero", "usedOn": [], "slotRegions": [ { "selector": ".hero h1", "role": "headline", "slotType": "banner" } ] } ] }
```

- [ ] **Step 3: Write the validator**

Create `skills/of1-liftoff/assets/validate-blocks-manifest.mjs`:
```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const SLOT_TYPES = new Set(['text', 'image', 'link', 'list']);

function validate(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (typeof m.generatedAt !== 'string') errs.push('generatedAt must be a string');
  if (!m.source || typeof m.source.domain !== 'string') errs.push('source.domain must be a string');
  if (!Array.isArray(m.source?.pages) || m.source.pages.length === 0) errs.push('source.pages must be a non-empty array');
  else m.source.pages.forEach((p, i) => {
    if (typeof p.slug !== 'string') errs.push(`source.pages[${i}].slug must be a string`);
    if (typeof p.role !== 'string') errs.push(`source.pages[${i}].role must be a string`);
  });
  if (typeof m.tokensSource !== 'string') errs.push('tokensSource must be a string');
  if (!Array.isArray(m.blocks) || m.blocks.length === 0) errs.push('blocks must be a non-empty array');
  else m.blocks.forEach((b, i) => {
    if (typeof b.name !== 'string' || !b.name) errs.push(`blocks[${i}].name must be a non-empty string`);
    if (!Array.isArray(b.usedOn) || b.usedOn.length === 0) errs.push(`blocks[${i}].usedOn must be a non-empty array`);
    if (!Array.isArray(b.slotRegions)) errs.push(`blocks[${i}].slotRegions must be an array`);
    else b.slotRegions.forEach((r, j) => {
      if (typeof r.selector !== 'string' || !r.selector) errs.push(`blocks[${i}].slotRegions[${j}].selector must be a non-empty string`);
      if (!SLOT_TYPES.has(r.slotType)) errs.push(`blocks[${i}].slotRegions[${j}].slotType must be one of ${[...SLOT_TYPES].join('|')}`);
    });
  });
  return errs;
}

function main() {
  const p = process.argv[2];
  if (!p) { console.error('usage: validate-blocks-manifest.mjs <path>'); return 1; }
  let m;
  try { m = JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { console.error(`cannot read/parse ${p}: ${e.message}`); return 1; }
  const errs = validate(m);
  if (errs.length) { console.error('INVALID:\n' + errs.map(e => '  - ' + e).join('\n')); return 1; }
  console.log(`✓ blocks-manifest valid (${m.blocks.length} block(s), ${m.source.pages.length} page(s))`);
  return 0;
}
process.exit(main());
```

- [ ] **Step 4: Run against both fixtures**

Run: `node skills/of1-liftoff/assets/validate-blocks-manifest.mjs skills/of1-liftoff/assets/fixtures/manifest-valid.json`
Expected: exit 0, prints `✓ blocks-manifest valid (2 block(s), 2 page(s))`.

Run: `node skills/of1-liftoff/assets/validate-blocks-manifest.mjs skills/of1-liftoff/assets/fixtures/manifest-invalid.json; echo "exit=$?"`
Expected: exit 1, prints `INVALID:` with `source.pages must be a non-empty array`, `blocks[0].usedOn must be a non-empty array`, and `slotType must be one of text|image|link|list`.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add skills/of1-liftoff/assets/validate-blocks-manifest.mjs skills/of1-liftoff/assets/fixtures/
git -C <worktree> commit -m "feat(of1-liftoff): blocks-manifest schema + validator"
```

---

### Task 2: `skin-tokens.mjs` — DESIGN.json → styles/styles.css

Deterministic brand skinning: map the measured `DESIGN.json` token spec onto the EDS boilerplate's `:root` custom properties. Idempotent (managed block between markers).

**Files:**
- Create: `skills/of1-liftoff/assets/skin-tokens.mjs`
- Create (fixtures): `skills/of1-liftoff/assets/fixtures/DESIGN.sample.json`, `skills/of1-liftoff/assets/fixtures/styles.sample.css`

**Interfaces:**
- Consumes: `DESIGN.json` shape (from `stardust:extract`): `typography.heading.family`, `typography.body.family`, `colors.{primary,secondary,accent,background,surface,text,muted}`, `spacing.maxWidth` (optional), `rounded` (optional).
- Produces: `skin-tokens.mjs` — CLI `node skin-tokens.mjs <design.json> <styles.css>`; rewrites `<styles.css>` in place, inserting/replacing a block delimited by `/* OF1-TOKENS:START */` … `/* OF1-TOKENS:END */` inside (or appended after) `:root`. Exit 0 on success, 1 on failure.

- [ ] **Step 1: Write fixtures**

`skills/of1-liftoff/assets/fixtures/DESIGN.sample.json`:
```json
{ "typography": { "heading": { "family": "Poppins, sans-serif" }, "body": { "family": "Inter, sans-serif" } },
  "colors": { "primary": "#0a66ff", "secondary": "#003a99", "accent": "#ff5c00", "background": "#ffffff", "surface": "#f5f7fa", "text": "#111418", "muted": "#5b6370" },
  "spacing": { "maxWidth": "1200px" }, "rounded": "8px" }
```

`skills/of1-liftoff/assets/fixtures/styles.sample.css` (minimal aem-boilerplate-style root):
```css
:root {
  --background-color: white;
  --text-color: #131313;
  --link-color: #3b63fb;
  --heading-font-family: roboto, sans-serif;
  --body-font-family: roboto, sans-serif;
}
main { color: var(--text-color); }
```

- [ ] **Step 2: Write the failing check first** (fixture copy + assertion script)

Run (setup): `cp skills/of1-liftoff/assets/fixtures/styles.sample.css /tmp/of1-skin-test.css`
Run: `node skills/of1-liftoff/assets/skin-tokens.mjs skills/of1-liftoff/assets/fixtures/DESIGN.sample.json /tmp/of1-skin-test.css; echo "exit=$?"`
Expected before implementation: FAIL (module not found / exit 1).

- [ ] **Step 3: Write the implementation**

Create `skills/of1-liftoff/assets/skin-tokens.mjs`:
```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const START = '/* OF1-TOKENS:START */';
const END = '/* OF1-TOKENS:END */';

// DESIGN.json field -> CSS custom property. Only emit vars whose source value exists.
function tokenLines(d) {
  const out = [];
  const push = (name, val) => { if (val != null && String(val).trim() !== '') out.push(`  ${name}: ${val};`); };
  push('--heading-font-family', d.typography?.heading?.family);
  push('--body-font-family', d.typography?.body?.family);
  push('--text-color', d.colors?.text);
  push('--background-color', d.colors?.background);
  push('--link-color', d.colors?.primary);
  push('--link-hover-color', d.colors?.secondary ?? d.colors?.primary);
  push('--clr-primary', d.colors?.primary);
  push('--clr-secondary', d.colors?.secondary);
  push('--clr-accent', d.colors?.accent);
  push('--clr-surface', d.colors?.surface);
  push('--clr-muted', d.colors?.muted);
  push('--max-content-width', d.spacing?.maxWidth);
  push('--of1-rounded', d.rounded);
  return out;
}

function upsert(css, block) {
  if (css.includes(START) && css.includes(END)) {
    const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return css.replace(re, block);
  }
  // insert just after the first `:root {`
  const idx = css.indexOf(':root');
  if (idx === -1) return css + '\n:root {\n' + block + '\n}\n';
  const brace = css.indexOf('{', idx);
  return css.slice(0, brace + 1) + '\n' + block + '\n' + css.slice(brace + 1);
}

function main() {
  const [designPath, cssPath] = [process.argv[2], process.argv[3]];
  if (!designPath || !cssPath) { console.error('usage: skin-tokens.mjs <design.json> <styles.css>'); return 1; }
  let design, css;
  try { design = JSON.parse(readFileSync(designPath, 'utf8')); }
  catch (e) { console.error(`cannot read DESIGN.json ${designPath}: ${e.message}`); return 1; }
  try { css = readFileSync(cssPath, 'utf8'); }
  catch (e) { console.error(`cannot read styles.css ${cssPath}: ${e.message}`); return 1; }
  const lines = tokenLines(design);
  if (lines.length === 0) { console.error('no usable tokens found in DESIGN.json — refusing to skin (fail loudly)'); return 1; }
  const block = `${START}\n${lines.join('\n')}\n  ${END}`;
  writeFileSync(cssPath, upsert(css, block));
  console.log(`✓ skinned ${cssPath} with ${lines.length} token(s)`);
  return 0;
}
process.exit(main());
```

- [ ] **Step 4: Run + assert content and idempotency**

Run: `node skills/of1-liftoff/assets/skin-tokens.mjs skills/of1-liftoff/assets/fixtures/DESIGN.sample.json /tmp/of1-skin-test.css`
Expected: exit 0, `✓ skinned ... with 13 token(s)`.

Run: `grep -c -- '--heading-font-family: Poppins' /tmp/of1-skin-test.css`
Expected: `1`.

Run (idempotency — run again, compare): `cp /tmp/of1-skin-test.css /tmp/of1-skin-1.css; node skills/of1-liftoff/assets/skin-tokens.mjs skills/of1-liftoff/assets/fixtures/DESIGN.sample.json /tmp/of1-skin-test.css; diff /tmp/of1-skin-1.css /tmp/of1-skin-test.css && echo IDEMPOTENT`
Expected: `IDEMPOTENT` (no diff — the managed block is replaced, not duplicated).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add skills/of1-liftoff/assets/skin-tokens.mjs skills/of1-liftoff/assets/fixtures/DESIGN.sample.json skills/of1-liftoff/assets/fixtures/styles.sample.css
git -C <worktree> commit -m "feat(of1-liftoff): deterministic DESIGN.json -> styles.css token skinning"
```

---

### Task 3: `check-liftoff-artifacts.mjs` — Stage 2 gate (liftoff-native)

Analog of `check-replica-artifacts.mjs` but with NO pixel-diff. Verifies each lifted page rendered, lints clean, has no JS errors, and is human-approved. Same 0/1/2 exit contract.

**Files:**
- Create: `skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs`
- Create (fixtures): `skills/of1-demo-orchestrator/assets/fixtures/liftoff-clean.json`, `liftoff-fail.json`

**Interfaces:**
- Consumes: liftoff ledger at `<repoDir>/stardust/liftoff/progress.json`:
  ```json
  { "pages": [ { "slug": "/", "role": "home", "rendered": true, "lint": "pass", "jsErrors": 0, "approved": true, "note": "" } ],
    "blocksManifest": "blocks-manifest.json" }
  ```
- Produces: `check-liftoff-artifacts.mjs` — CLI `node check-liftoff-artifacts.mjs <repoDir>`; exit `0` demo-grade, `2` hard stop, `1` ledger missing/empty.

- [ ] **Step 1: Write fixtures**

`skills/of1-demo-orchestrator/assets/fixtures/liftoff-clean.json`:
```json
{ "pages": [ { "slug": "/", "role": "home", "rendered": true, "lint": "pass", "jsErrors": 0, "approved": true },
             { "slug": "/product/x", "role": "product", "rendered": true, "lint": "pass", "jsErrors": 0, "approved": true } ],
  "blocksManifest": "blocks-manifest.json" }
```

`skills/of1-demo-orchestrator/assets/fixtures/liftoff-fail.json`:
```json
{ "pages": [ { "slug": "/", "role": "home", "rendered": true, "lint": "fail", "jsErrors": 2, "approved": false } ] }
```

- [ ] **Step 2: Write the implementation**

Create `skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs`:
```js
#!/usr/bin/env node
// Stage 2 (liftoff) artifact gate — liftoff-native, NO pixel diff.
// Verifies each lifted page rendered, lints clean, no JS errors, human-approved.
import { readFileSync } from 'node:fs';
import path from 'node:path';

function main() {
  const repoDir = process.argv[2] || '.';
  const ledgerPath = path.join(repoDir, 'stardust', 'liftoff', 'progress.json');
  let ledger;
  try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); }
  catch (e) { console.error(`✗ liftoff ledger missing/unreadable at ${ledgerPath}: ${e.message}`); return 1; }
  const pages = Array.isArray(ledger.pages) ? ledger.pages : [];
  if (pages.length === 0) { console.error('✗ liftoff ledger has no pages'); return 1; }

  const fails = [];
  for (const p of pages) {
    const id = `${p.role || '?'} ${p.slug || '?'}`;
    if (p.rendered !== true) fails.push(`${id}: did not render`);
    if (String(p.lint) === 'fail') fails.push(`${id}: lint FAIL`);
    if (Number(p.jsErrors) > 0) fails.push(`${id}: ${p.jsErrors} JS error(s)`);
    if (p.approved !== true) fails.push(`${id}: not human-approved`);
  }

  if (fails.length) {
    console.error('✗ Liftoff NOT demo-grade — HARD STOP:\n' + fails.map(f => '  - ' + f).join('\n'));
    return 2;
  }
  console.log(`✓ Liftoff artifacts are demo-grade (${pages.length} page(s) checked).`);
  return 0;
}
process.exit(main());
```

- [ ] **Step 3: Run against fixtures** (fixtures live under `stardust/liftoff/progress.json`, so point `repoDir` at a temp tree)

Run: `mkdir -p /tmp/of1-lift-clean/stardust/liftoff && cp skills/of1-demo-orchestrator/assets/fixtures/liftoff-clean.json /tmp/of1-lift-clean/stardust/liftoff/progress.json && node skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs /tmp/of1-lift-clean; echo "exit=$?"`
Expected: `✓ Liftoff artifacts are demo-grade (2 page(s) checked).`, exit 0.

Run: `mkdir -p /tmp/of1-lift-fail/stardust/liftoff && cp skills/of1-demo-orchestrator/assets/fixtures/liftoff-fail.json /tmp/of1-lift-fail/stardust/liftoff/progress.json && node skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs /tmp/of1-lift-fail; echo "exit=$?"`
Expected: `✗ Liftoff NOT demo-grade` listing lint FAIL, 2 JS error(s), not human-approved; exit 2.

Run: `node skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs /tmp/does-not-exist; echo "exit=$?"`
Expected: `✗ liftoff ledger missing/unreadable`; exit 1.

- [ ] **Step 4: Commit**

```bash
git -C <worktree> add skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs skills/of1-demo-orchestrator/assets/fixtures/
git -C <worktree> commit -m "feat(of1-demo-orchestrator): liftoff-native Stage 2 artifact gate"
```

---

### Task 4: `of1-liftoff` skill (SKILL.md + knowledge)

The Stage 2 orchestration skill dispatched in place of `stardust:replica`. It calls sub-skills **inline** (as Skill reads / read-and-follow), never as nested dispatches — mirroring how `of1-integration` handles the no-fan-out constraint.

**Files:**
- Create: `skills/of1-liftoff/SKILL.md`
- Create: `skills/of1-liftoff/knowledge/liftoff-flow.md`
- (Assets from Tasks 1–2 already created under `skills/of1-liftoff/assets/`)

**Interfaces:**
- Consumes: `narrative.json` (`keyPages[].slug`, roles); env `OF1_STATE_DIR`, `OF1_DEMO_REPO`, `SKILL_DIR`, `DOMAIN`.
- Produces (all in `OF1_DEMO_REPO`): scaffolded EDS repo (aem-boilerplate + Block Collection set), skinned `styles/styles.css`, lifted `home` + `product` `.plain.html` pages, `DESIGN.json` (resolvable per Global Constraints), `blocks-manifest.json` (validates against Task 1), and `stardust/liftoff/progress.json` (the Task 3 ledger). Writes `<OF1_STATE_DIR>/liftoff-done.json` (`{"stage":2,"status":"done"}`) on success. Final status block: `{"stage":2,"skill":"of1-liftoff","status":"done"|"failed",...}`.

- [ ] **Step 1: Write `SKILL.md`**

Create `skills/of1-liftoff/SKILL.md` with frontmatter (`name: of1-liftoff`, description covering "Stage 2 replacement for stardust:replica — lift key pages onto standard EDS blocks + brand-token skinning, no pixel-diff") and these ordered sections:

1. **Env** — table: `OF1_STATE_DIR`, `OF1_DEMO_REPO`, `SKILL_DIR`, `DOMAIN`, and `keyPages` read from `<OF1_STATE_DIR>/narrative.json`.
2. **Flow** — the 6 ordered steps (scaffold → add blocks → extract → skin → lift → stabilize), each pointing at `knowledge/liftoff-flow.md` for detail.
3. **`blocks-manifest.json` schema** — the full schema block from Task 1 (verbatim), stating it MUST pass `assets/validate-blocks-manifest.mjs`.
4. **Ledger schema** — `stardust/liftoff/progress.json` shape from Task 3, stating the gate `check-liftoff-artifacts.mjs` reads it.
5. **Outputs & handoff** — `liftoff-done.json`, resolvable `DESIGN.json`, `blocks-manifest.json`; the final status block shape.
6. **Constraints** — sub-skills called inline (no nested dispatch); fail loudly if tokens unresolved; `stardust:diff` is NOT used in v6 (reserved fallback).

- [ ] **Step 2: Write `knowledge/liftoff-flow.md`** — the step detail

Create `skills/of1-liftoff/knowledge/liftoff-flow.md` documenting each step concretely:
- **Scaffold:** clone/init from `aem-boilerplate` into `OF1_DEMO_REPO` (or verify boilerplate present); note aem-boilerplate ships `columns, hero, cards, fragment, header, footer`.
- **Add Block Collection set:** copy `blocks/<name>/<name>.{js,css}` for the fixed set NOT already in boilerplate — `accordion, tabs, carousel, quote` (+ `cards`/`columns`/`hero` confirmed present) — using the `block-collection-and-party` search/get scripts. Record each added block's `collection` in the manifest.
- **Extract:** invoke `stardust:extract <DOMAIN>` inline → `DESIGN.json` (tokens only; the cheap half). Resolve path per Global Constraints.
- **Skin:** run `node "$SKILL_DIR/assets/skin-tokens.mjs" <resolved DESIGN.json> styles/styles.css`.
- **Lift:** invoke `page-import` inline for home + product (`keyPages` roles). Produces authored `.plain.html` mapping content onto the block palette. If a page needs a block the palette can't express, add it (Block Party pull or a small `content-driven-development` block) and record it in the manifest with `collection: block-party|custom`.
- **Build the manifest:** after liftoff, enumerate blocks actually used on each page + their variant classes + slot-capable regions → write `blocks-manifest.json`; run the validator; fail loudly on invalid.
- **Stabilize gate:** run `page-import`'s `preview-import` visual compare + lint + no-JS-errors; record per-page results into `stardust/liftoff/progress.json`; emit a human-approval gate (config-review style) that sets `approved: true` per page once accepted. Then run `check-liftoff-artifacts.mjs`.

- [ ] **Step 3: Verify manifest + ledger examples in the doc are machine-valid**

Extract the manifest example from `SKILL.md` into a temp file and validate; extract the ledger example and run the gate. (Guards against the doc drifting from the schema.)

Run: `node skills/of1-liftoff/assets/validate-blocks-manifest.mjs skills/of1-liftoff/assets/fixtures/manifest-valid.json && echo DOC-MANIFEST-OK`
Expected: `DOC-MANIFEST-OK` (the SKILL.md schema block must match `manifest-valid.json`; if you changed field names, update the fixture + validator together).

- [ ] **Step 4: Verify no nested-dispatch language**

Run: `grep -niE 'dispatch|sub-?agent|Task tool' skills/of1-liftoff/SKILL.md skills/of1-liftoff/knowledge/liftoff-flow.md`
Expected: any hit is in the context of "call inline, do NOT dispatch". Fix wording if it instructs fanning out.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add skills/of1-liftoff/SKILL.md skills/of1-liftoff/knowledge/
git -C <worktree> commit -m "feat(of1-liftoff): Stage 2 liftoff skill (scaffold + skin + page-import + stabilize)"
```

---

### Task 5: Rewrite `of1-build-templates` to emit EDS block-table markup

Preserve the catalog + slot + `fill-template.mjs` contracts (Global Constraints). Change only: `base` mode stops generating `of1-template-base.css` and instead loads/validates the manifest; `intent` mode authors block-table markup composed from manifest blocks; per-template stylesheets drop; the gallery preview must run EDS decoration.

**Files:**
- Modify: `skills/of1-build-templates/SKILL.md` (Inputs 43-54; Modes 30-41; metadata example 105-127; Deliverables 502-513; Worker-Contract table 67-81)
- Modify: `skills/of1-build-templates/assets/gallery.html` (EDS decoration for preview)
- Create: `skills/of1-build-templates/assets/fixtures/of1-comparison-table.html` + `.metadata.json` + `.sample.json` (a worked block-table example)
- Unchanged (assert, do not edit): `assets/assemble-catalog.mjs`, `assets/fill-template.mjs`

**Interfaces:**
- Consumes: `blocks-manifest.json` (Task 1), resolved `DESIGN.json`, `narrative.json`.
- Produces: per intent, 1 template as `templates/of1-<intent>-<name>.html` (block-table markup, `<main>` only) + `templates/of1-<intent>-<name>.metadata.json` (slots verbatim contract) + `.sample.json`. `assemble` still emits `templates/templates-catalog.json` + `of1/config/templates.json` unchanged.

- [ ] **Step 1: Write a worked block-table example fixture**

Create `skills/of1-build-templates/assets/fixtures/of1-comparison-table.html` — EDS block-table markup, `<main>` only, `data-slot` cells inside real block divs (hero + columns/table + cards). Example skeleton:
```html
<main>
  <div>
    <div class="hero">
      <div><h1 data-slot="hero.title">Compare options</h1></div>
    </div>
    <div class="columns comparison">
      <div>
        <div data-card="1" data-card-key="item-1.name"><h3 data-slot="item-1.name">Option A</h3><a data-slot="item-1.cta" href="#">Learn more</a></div>
        <div data-card="2" data-card-key="item-2.name"><h3 data-slot="item-2.name">Option B</h3><a data-slot="item-2.cta" href="#">Learn more</a></div>
      </div>
    </div>
  </div>
</main>
```

Create `skills/of1-build-templates/assets/fixtures/of1-comparison-table.metadata.json`:
```json
{ "name": "of1-comparison-table", "intent": "comparison",
  "description": "Side-by-side comparison built from hero + columns blocks.",
  "minItems": 2, "maxItems": 4, "stylesheet": "/styles/styles.css",
  "slots": [ { "key": "hero.title", "type": "text", "instruction": "Headline, <=8 words" },
             { "key": "item-1.name", "type": "text", "instruction": "Option name" },
             { "key": "item-1.cta", "type": "link", "instruction": "Link to option page" },
             { "key": "item-2.name", "type": "text", "instruction": "Option name" },
             { "key": "item-2.cta", "type": "link", "instruction": "Link to option page" } ] }
```

Create `skills/of1-build-templates/assets/fixtures/of1-comparison-table.sample.json`:
```json
{ "_meta": { "stylesheet": "/styles/styles.css" }, "hero.title": "Compare our plans",
  "item-1.name": "Starter", "item-1.cta": { "label": "See Starter", "href": "/plans/starter" },
  "item-2.name": "Pro", "item-2.cta": { "label": "See Pro", "href": "/plans/pro" } }
```

- [ ] **Step 2: Verify the example survives the UNCHANGED catalog + fill contracts** (this is the core regression test proving the rewrite keeps the worker contract)

Run (catalog): stage the fixture into a temp templates dir and assemble:
```
mkdir -p /tmp/of1-tpl/templates && cp skills/of1-build-templates/assets/fixtures/of1-comparison-table.* /tmp/of1-tpl/templates/
cd /tmp/of1-tpl && OWNER=o REPO=r BRANCH=b node <worktree>/skills/of1-build-templates/assets/assemble-catalog.mjs; echo "exit=$?"
```
Expected: exit 0 (or the documented warn about missing 4 other intents), `templates/templates-catalog.json` written; `node -e "const c=require('/tmp/of1-tpl/templates/templates-catalog.json'); console.log(c.templates[0].name, c.templates[0].slots.length, c.byIntent.comparison)"` prints `of1-comparison-table 5 [ 'of1-comparison-table' ]`.

Run (fill): `node <worktree>/skills/of1-build-templates/assets/fill-template.mjs skills/of1-build-templates/assets/fixtures/of1-comparison-table.html skills/of1-build-templates/assets/fixtures/of1-comparison-table.sample.json /tmp/filled.html && grep -q 'Compare our plans' /tmp/filled.html && grep -q 'href="/plans/starter"' /tmp/filled.html && echo FILL-OK`
Expected: `FILL-OK` — text + link slots filled in block-table markup with no code change to `fill-template.mjs`. (Confirm the exact `fill-template.mjs` CLI arg order first by reading its `main()`; adjust the invocation to match.)

- [ ] **Step 3: Rewrite `base` mode in `SKILL.md`**

Edit `skills/of1-build-templates/SKILL.md` Modes table (lines 30-41) + the base-mode section: `base` no longer generates `styles/of1-template-base.css`. Instead it (a) resolves `DESIGN.json` per the shared rule, (b) reads + validates `blocks-manifest.json` via `of1-liftoff/assets/validate-blocks-manifest.mjs`, (c) confirms `styles/styles.css` has the OF1-TOKENS block (fail loudly if absent). It writes no CSS. Update Inputs (43-54) to list `blocks-manifest.json` as a required input and remove the prototype-CSS / `of1-template-base.css` inputs.

- [ ] **Step 4: Rewrite `intent` mode authoring rules in `SKILL.md`**

Edit the intent-mode section: for the given `$OF1_TG_INTENT`, compose ONE template (1 variation) as block-table markup by selecting blocks from `blocks-manifest.json` `usedOn` the lifted pages, arranging them for the intent, and marking `data-slot` cells inside block divs. Body is `<main>…</main>` only. Set `metadata.stylesheet` to `/styles/styles.css` (client loads block CSS via decoration — no per-template stylesheet). Update the metadata example (lines 105-127) to the Step-1 fixture form. State the 1-variation-per-intent rule (was 3). Remove all references to writing `styles/of1-*.css` and to `@import of1-template-base.css`.

- [ ] **Step 5: Update Deliverables + Worker-Contract table in `SKILL.md`**

Edit lines 67-81 + 502-513: drop `styles/of1-template-base.css` and the 15 `styles/of1-*.css`; template/metadata/sample counts become 5 (1 per intent), not 15; `templates-catalog.json` + `of1/config/templates.json` unchanged. Keep the gallery deliverable + the "deliverable URL MUST be the gallery" rule.

- [ ] **Step 6: Update `gallery.html` to decorate blocks (EDS preview)**

Edit `skills/of1-build-templates/assets/gallery.html` so each preview iframe/panel loads the EDS runtime (`/scripts/aem.js` + `/scripts/scripts.js` + `/styles/styles.css` from the repo's preview origin) and runs `decorateMain`/`loadBlocks` on the filled block-table markup, so previews render with real block styling. Verification is manual (open the gallery against a preview URL) — document that in the step; add a comment block in `gallery.html` describing the decoration wiring.

- [ ] **Step 7: Assert `assemble-catalog.mjs` and `fill-template.mjs` were NOT modified**

Run: `git -C <worktree> diff --name-only -- skills/of1-build-templates/assets/assemble-catalog.mjs skills/of1-build-templates/assets/fill-template.mjs`
Expected: empty (no output) — these files must remain byte-identical; the contract is preserved by construction.

- [ ] **Step 8: Commit**

```bash
git -C <worktree> add skills/of1-build-templates/SKILL.md skills/of1-build-templates/assets/gallery.html skills/of1-build-templates/assets/fixtures/
git -C <worktree> commit -m "feat(of1-build-templates): emit EDS block-table templates; drop static shell + base CSS"
```

---

### Task 6: Rewire `of1-demo-orchestrator` from replica → liftoff

Swap every Stage 2 reference per the edit-site inventory. Rename the done-file, env var, gate script, and dispatch template; adjust model/effort (no pixel loop) and stage labels; keep the `keyPages`/`DESIGN.json` data dependencies.

**Files:**
- Modify: `skills/of1-demo-orchestrator/SKILL.md` (lines 3, 10, 79-84, 91-97, 110-111, 115-116, 123)
- Modify: `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` (lines 21-23, 38, 42, 70-71, 78-112, 123, 139, 170-171, 236-239)
- Modify: `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` (lines 16, 29-31, 43-44, 47-62, 66-69, 75-136)
- Modify: `skills/of1-demo-orchestrator/knowledge/design-tokens-resolution.md` (lines 6, 10)

**Interfaces:**
- Consumes: Stage 1 `narrative.json` `keyPages[].slug`; Task 4 `of1-liftoff`; Task 3 `check-liftoff-artifacts.mjs`.
- Produces: rewired 3-stage contract where Stage 2 = `of1-liftoff`, done-file `liftoff-done.json`, env `OF1_LIFTOFF_DONE_FILE`, gate `check-liftoff-artifacts.mjs`.

- [ ] **Step 1: Rewrite the Stage 2 dispatch template** (`dispatch-cc.md:75-136`)

Replace the "Stage 2 dispatch template (replica)" with a liftoff template: invoke `Skill: of1-liftoff` with `Arguments: <DOMAIN>` (pages come from `narrative.json` `keyPages`, read inside the skill). Set model/effort appropriate to composition rather than pixel-precision (recommend `sonnet`, `effort: "medium"`; note explicitly that the opus/high pixel-diff rationale no longer applies). On success write `<stateDir>/liftoff-done.json` (`{"stage":2,"status":"done"}`). Final status block `skill` becomes `of1-liftoff`. Remove all `stardust/replica/progress.json` / pixel-diff / 20-min-wall-clock / iteration-cap language.

- [ ] **Step 2: Rewrite the Stage 2 artifact-gate block** (`dispatch-cc.md:47-62`)

Point the gate at `check-liftoff-artifacts.mjs "<repoDir>"`; keep the 0/2/1 exit→action mapping verbatim (proceed / hard-stop / re-dispatch).

- [ ] **Step 3: Update `dispatch-cc.md` labels + model table** (lines 16, 29-31, 43-44)

TaskCreate label → `2. Liftoff — of1-liftoff <URL> → EDS blocks + DESIGN.json + blocks-manifest`. Model assignment line → liftoff / sonnet / medium. Stage 2 Agent line → invoke `of1-liftoff`, write `liftoff-done.json`.

- [ ] **Step 4: Update `pipeline-contract.md`** (lines 21-23, 38, 42, 70-71, 78-112, 123, 139, 170-171, 236-239)

Env var `OF1_REPLICA_DONE_FILE` → `OF1_LIFTOFF_DONE_FILE` (path to `liftoff-done.json`). 3-stage table Stage 2 row → `of1-liftoff <URL>`. State-files table: replace `replica-done.json` row (written by Stage 2 `of1-liftoff`) and replace `stardust/replica/progress.json` row with `stardust/liftoff/progress.json` (read by the liftoff gate). Rewrite the "Stage 2 artifact gate" section to reference `liftoff-done.json`, `stardust/liftoff/progress.json`, and `check-liftoff-artifacts.mjs`; keep the exit-code table. Update stage-label text ("2 Liftoff"), deliverable-URL table row 2 → "liftoff", and audit-record examples (`skill: of1-liftoff`).

- [ ] **Step 5: Update `SKILL.md` + `design-tokens-resolution.md`** 

`SKILL.md`: description (line 3), "discovery → liftoff → OF1 integration" (line 10), ASCII diagram (79-84 → `Stage 2: of1-liftoff <URL>` → `write liftoff-done.json`), Stage 2 prose (91-97 — slug list still from `keyPages[].slug`, now consumed by `of1-liftoff`), mapping table row (110-111), fidelity-ownership line (115-116 — reword: pixel fidelity is NOT chased; liftoff verifies correctness + human approval). `design-tokens-resolution.md` lines 6, 10: replace "stardust:replica writes/produces the design spec" with "stardust:extract (run inside of1-liftoff) writes the design spec"; keep both DESIGN.json locations valid (extract full → `stardust/current/DESIGN.json`).

- [ ] **Step 6: Verify no dangling replica references remain**

Run: `grep -rniE 'replica|replica-done|OF1_REPLICA_DONE_FILE|check-replica-artifacts|stardust/replica' skills/of1-demo-orchestrator/`
Expected: no hits **except** an intentional historical note (if any) explicitly marked as "was replica in v5". Every operative reference must now be liftoff. Also `grep -rn 'stardust:replica' skills/` → only in the retired-skill note, not in orchestrator wiring.

- [ ] **Step 7: Verify the gate wiring is coherent end-to-end**

Run: `mkdir -p /tmp/of1-wire/stardust/liftoff && cp skills/of1-demo-orchestrator/assets/fixtures/liftoff-clean.json /tmp/of1-wire/stardust/liftoff/progress.json && node skills/of1-demo-orchestrator/assets/check-liftoff-artifacts.mjs /tmp/of1-wire; echo "exit=$?"`
Expected: exit 0 — confirms the script named in the rewired contract exists and passes on a clean ledger.

- [ ] **Step 8: Commit**

```bash
git -C <worktree> add skills/of1-demo-orchestrator/
git -C <worktree> commit -m "refactor(of1-demo-orchestrator): rewire Stage 2 from stardust:replica to of1-liftoff"
```

---

### Task 7: Worker/delivery client-side EDS decoration (EXTERNAL — separate track, documented only)

**Out of scope for this repo/plan.** The `/of1` delivery worker lives in the external `of1-gen-web` repo. This task records the contract so the change can be tracked and implemented there; v6 in this repo does not depend on it to build/commit, only to run end-to-end at demo time.

**Files:**
- Create: `docs/superpowers/specs/2026-08-18-of1-v6-worker-decoration-contract.md` (contract note only; no code in this repo)

**Interfaces (contract the worker must satisfy):**
- Worker still: classifies intent → routes via `byIntent` → picks template → fills `data-slot`s (existing logic) → returns **block-table markup** (`<main>…</main>`), NOT finished rendered HTML.
- `/of1` delivery page must load the EDS runtime (`aem.js` + `scripts.js` + `/styles/styles.css`) and run `decorateMain(main)` + `loadBlocks(main)` on the returned markup, so each block pulls its `.js`+`.css` from the EDS origin client-side. Block assets do NOT count against the worker's 50-subrequest cap.

- [ ] **Step 1: Write the contract note** capturing the above interfaces, the subrequest-budget implication, and a checklist for the `of1-gen-web` implementer (return markup not HTML; wire decoration on `/of1`; confirm block CSS/JS load from preview origin).

- [ ] **Step 2: Commit**

```bash
git -C <worktree> add docs/superpowers/specs/2026-08-18-of1-v6-worker-decoration-contract.md
git -C <worktree> commit -m "docs(of1-v6): worker client-side decoration contract (external track)"
```

---

## Self-Review

**Spec coverage:**
- Runtime model (worker fills slots, client decorates) → Task 5 (block-table output) + Task 7 (worker contract). ✓
- Block palette (fixed set + per-site additions) → Task 4 flow (scaffold + add Block Collection + per-site additions). ✓
- Stabilization gate (liftoff-native, no pixel diff) → Task 3 gate + Task 4 stabilize step. ✓
- External entry, lift home + product → Task 4 flow. ✓
- Template composition from lifted-page patterns → Task 5 intent-mode (select manifest blocks `usedOn` pages). ✓
- Repo scaffold from aem-boilerplate → Task 4 scaffold step. ✓
- 5 intents × 1 variation → Task 5 Steps 4-5. ✓
- Token skinning DESIGN.json → styles.css → Task 2. ✓
- `blocks-manifest.json` contract → Task 1. ✓
- Orchestrator rewiring (all edit sites) → Task 6. ✓
- Worker change scoped separate → Task 7. ✓

**Placeholder scan:** No "TBD"/"handle edge cases" — every script step has full code; every prose step lists exact sections/lines and grep assertions. The one intentional manual verification (gallery decoration, Task 5 Step 6) is explicitly called out as manual with a documented reason.

**Type/name consistency:** `blocks-manifest.json` schema identical in Task 1 (validator), Task 4 (SKILL.md), Task 5 (consumer). Ledger `stardust/liftoff/progress.json` + fields (`rendered/lint/jsErrors/approved`) identical in Task 3 (gate) and Task 4 (producer). Done-file `liftoff-done.json` and env `OF1_LIFTOFF_DONE_FILE` consistent across Tasks 4 and 6. Catalog/slot field names quoted verbatim from the current code (Global Constraints).

**Known judgment call for the implementer:** whether `base` mode is retained-but-repurposed (chosen here, to avoid churning the `OF1_TG_MODE` base→intent→assemble graph the orchestrator drives) vs dropped. If dropping, Task 5 Step 3 and the orchestrator mode-sequence must both change — larger blast radius; not recommended for v6.
