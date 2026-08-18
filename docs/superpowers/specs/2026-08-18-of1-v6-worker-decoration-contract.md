# OF1 v6: Worker Client-Side Decoration Contract

## Overview

This document specifies the contract between the OF1 v6 orchestrator (in this repo) and the external `/of1` worker delivery page (in `of1-gen-web`). The worker now returns **undecorated block-table markup** instead of finished HTML, shifting block decoration to the browser at runtime.

---

## Runtime Architecture

### Worker Responsibility

The worker continues its existing classification and templating pipeline:

1. **Classify intent** from the incoming request (e.g., "product details", "reviews", "comparison")
2. **Route via `byIntent`** to select the matching template
3. **Fill `data-slot` placeholders** with extracted content (existing logic)
4. **Return block-table markup** as `<main>…</main>` containing slot-filled but not-yet-EDS-decorated `<div class="block" data-block-name="...">` elements. Each slot contains extracted content (text, links, media URLs, etc.); what is absent is EDS decoration (block CSS, generated wrapper classes, and JavaScript injection).

**Key change:** Return markup with content filled, NOT fully decorated or styled HTML.

### Browser (Delivery Page) Responsibility

The `/of1` delivery page must:

1. **Load EDS runtime** after receiving worker markup:
   - `aem.js` (EDS decoration engine)
   - `scripts.js` (EDS block registry)
   - `/styles/styles.css` (EDS base styles)

2. **Decorate and hydrate** the returned markup:
   - Call `decorateMain(main)` to apply EDS decoration patterns and metadata
   - Call `loadBlocks(main)` to instantiate and render each block

3. **Block assets load client-side:**
   - Block `.js` (behavior) and `.css` (styling) load from the EDS preview origin on demand
   - Each block's decoration/rendering pulls its own resources during `loadBlocks()`

---

## Subrequest Budget Implication

**Critical:** Block assets (`.js` and `.css` files) loaded during browser decoration do **NOT** count against the worker's 50-subrequest budget. This is a fundamental shift in the cost model:

- **Worker budget (50 subrequests):** Data fetching, intent classification, template selection, slot population only
- **Browser budget (unlimited):** Block decoration, asset loading (EDS JS/CSS per block)

This separation allows the worker to remain fast and scoped while giving each block full styling and behavior without fear of budget exhaustion.

---

## Interface Contract: Request/Response Shape

### Worker Input
Standard intent-classification request (unchanged from current behavior).

### Worker Response (NEW)

**Status:** 200 OK  
**Content-Type:** `text/html; charset=utf-8`  
**Body:** HTML markup adhering to:

```html
<main>
  <div class="block" data-block-name="header">
    <h1 data-slot="header.title">Apple MacBook Pro 16"</h1>
    <p data-slot="header.subtitle">Supercharged by M4 Pro</p>
    <a href="/products/mbp-16" data-slot="header.link-url">Learn More</a>
  </div>
  <div class="block" data-block-name="product-details">
    <h2 data-slot="details.heading">Specifications</h2>
    <ul>
      <li><span data-slot="details.spec-1">Up to 12-core CPU</span></li>
      <li><span data-slot="details.spec-2">Up to 20-core GPU</span></li>
    </ul>
    <p data-slot="details.price">Starting at $3,499</p>
  </div>
  <!-- Additional blocks as dictated by template -->
</main>
```

**Note:** Slot content is **present and filled** with per-request data (product name, specs, price, URLs). What is **not present** is EDS decoration: no block-specific CSS classes (e.g., no `header__hero`, no `product-details__card`), no injected `<script>` tags, and no wrapping `<style>` blocks. The browser will apply these during `decorateMain()` and `loadBlocks()`.

**Constraints:**
- Root element must be `<main>` with no extra wrappers
- Each block must be a `<div class="block" data-block-name="...">` (EDS standard)
- Block names must match entries in the shared `blocks-manifest.json` (no unknown blocks)
- **All `data-slot` placeholders must be filled** with extracted content (no empty slots; personalization data is present)
- No inline `<style>` or `<script>` (decoration happens client-side)
- No pre-applied EDS decoration classes (e.g., no `.decorated` from `decorateMain`, no block-specific utility classes)
- No injected block-specific `.js` or `.css` (loaded client-side during `loadBlocks()`)

---

## Subrequest Budget Examples

*Note: The counts below are illustrative, not measured from production data. Actual subrequest cost depends on template complexity and data-fetch fanout.*

### Before (v5, full HTML rendering in worker)

- Fetch product data: 3 subrequests
- Fetch reviews: 2 subrequests
- Render HTML + inline block styles/scripts: **~10 subrequests** (processing, block CSS/JS inlining)
- **Total: ~15 subrequests**, leaves ~35 for growth

### After (v6, markup + client decoration)

- Fetch product data: 3 subrequests
- Fetch reviews: 2 subrequests
- Return slot-filled markup: **0 subrequests** (no asset bundling)
- **Worker total: ~5 subrequests**, leaves ~45 for growth
- **Browser loading block CSS/JS: unlimited**, happens after page load

---

## Implementation Checklist for `of1-gen-web`

When updating the worker to satisfy this contract, verify:

### Output Format
- [ ] Worker returns a `<main>…</main>` block-table structure, NOT a complete rendered document
- [ ] All `data-slot` placeholders are **filled with content** (no empty divs; personalization data is present)
- [ ] Each block is a `<div class="block" data-block-name="...">` with **no EDS decoration classes** (e.g., no `.decorated`, no block-specific styling classes added by `decorateMain`)
- [ ] No `<style>` blocks or inline styles in worker response; no injected block `.css`
- [ ] No `<script>` blocks in worker response; no injected block `.js`
- [ ] Response HTTP status is 200 with `Content-Type: text/html; charset=utf-8`

### Delivery Page Integration (`/of1` route)
- [ ] Load EDS runtime (`aem.js`, `scripts.js`, `styles.css`) **after** receiving worker markup
- [ ] Call `decorateMain(main)` on the returned `<main>` element to apply EDS decoration
- [ ] Call `loadBlocks(main)` to instantiate and render all blocks
- [ ] Handle block load order (blocks decorate and request their own assets asynchronously)

### Block Asset Loading
- [ ] Confirm each block's `.js` and `.css` load from the **preview EDS origin** (not from worker origin)
- [ ] Verify block assets do NOT count toward the 50-subrequest worker budget (use browser dev tools to inspect Network tab)
- [ ] Test with a high-asset-count template (e.g., 5+ blocks) to ensure no budget exhaustion

### Testing
- [ ] Unit test: Worker returns slot-filled, undecorated markup with correct block structure and no EDS classes/scripts/styles
- [ ] Integration test: `/of1` page loads markup, decorates with `decorateMain()`, renders blocks with `loadBlocks()`, and matches visual baseline
- [ ] Content verification: Inspect returned markup and confirm all critical slots are filled (e.g., title, price, links); verify no empty placeholders slip through
- [ ] Performance: Measure total block load time (worker + browser decoration) and confirm it stays under acceptable thresholds (e.g., FCP target unchanged)
- [ ] Edge case: Worker outage or slow response should not block EDS runtime load (use a timeout for worker fetch)

---

## Backward Compatibility Notes

- **For v5 and earlier:** This contract does NOT apply. Existing v5 workers return finished HTML and continue to work with v5 delivery pages.
- **For v6:** Once this contract is in effect, v5 workers cannot serve v6 delivery pages (markup structure incompatible). Coordinate rollout to ensure v6 delivery and v6 worker ship together.

---

## Related Artifacts

- **OF1 v6 Implementation Plan:** `docs/superpowers/plans/2026-08-18-of1-v6-eds-block-templating.md`
- **OF1 v6 Design Spec:** `docs/superpowers/specs/2026-08-18-of1-v6-eds-block-templating-design.md`
- **Block Manifest Schema:** Documented in `skills/of1-liftoff/SKILL.md` with validator at `skills/of1-liftoff/assets/validate-blocks-manifest.mjs`
- **Orchestrator Rewiring:** `.superpowers/sdd/2026-08-18-of1-v6-eds-block-templating/task-6-*.md`

---

**Document Version:** 1.0  
**Date:** 2026-08-18  
**Status:** Ready for external implementation (of1-gen-web)
