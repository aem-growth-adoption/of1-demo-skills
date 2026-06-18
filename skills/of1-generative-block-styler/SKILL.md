---
name: of1-generative-block-styler
description: Generate polished CSS for the OF1 generative block AND set up the /of1 page end-to-end (template, fragments, page-chrome CSS, branded block CSS, DA content).
user-invocable: true
---

# Generative Block Styler

Own the `/of1` page top to bottom: install the block, generate brand-aligned CSS for both the block and the page chrome, create the passthrough template + fragments, and upload the DA content documents that make the page renderable.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-8-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill's directory (used to find the canonical `assets/of1.js` and `assets/of1.css` that get installed in `blocks/of1/`) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

```bash
DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

## CRITICAL RULES

1. **NEVER modify `blocks/of1/of1.js`** — the OF1 block JavaScript is shared infrastructure and must not be changed. Only the CSS (`blocks/of1/of1.css`) is customized per brand.
2. **This skill OWNS the block install.** Always copy `of1.js` and `of1.css` fresh from `$SKILL_DIR/assets/` to `blocks/of1/` — never reuse whatever exists in the demo repo (may be stale from a previous run).
3. **Style using brand tokens from stardust** — read `stardust/current/DESIGN.json`, `DESIGN.md`, and the `:root` tokens in `styles/styles.css`. The OF1 block must feel native to the brand, not a generic overlay.
4. **Commit BOTH `of1.js` and `of1.css`** — `of1.js` deployed as-is alongside your styled `of1.css`. Always `git add blocks/of1/` to include both. Missing JS = blank page.

## Why this skill exists

EDS block CSS is designed for statically-authored pages. When the LLM generates sections dynamically, the raw block CSS often looks too plain — no visual hierarchy between sections, cards render as flat lists, heroes lack full-bleed treatment, tables are unstyled, no transitions, no cohesive container. This skill bridges that gap by writing `blocks/of1/of1.css` (block-level styles for generated content) and `styles/of1.css` (page chrome for the `/of1` page itself).

## Always start from the canonical base files

The OF1 block source files live in this skill's own `assets/`:

- **Base JS:** `$SKILL_DIR/assets/of1.js` — copied as-is to `blocks/of1/of1.js`
- **Base CSS:** `$SKILL_DIR/assets/of1.css` — copied to `blocks/of1/of1.css`, then customized in place with brand tokens

Always start from these. Do NOT use whatever `of1.css` or `of1.js` happens to be in the demo repo.

## Process

### Step 0 — Install block files + patch the overlay engine for passthrough

```bash
cd "$OF1_DEMO_REPO"
mkdir -p blocks/of1
cp "$SKILL_DIR/assets/of1.js"  blocks/of1/of1.js
cp "$SKILL_DIR/assets/of1.css" blocks/of1/of1.css
```

`of1.js` is deployed as-is. `of1.css` is the unbranded template — Step 3 customizes it in place with the site's brand tokens.

**Then patch `scripts/scripts.js` to add passthrough support to the overlay engine.** Snowflake (step 6) installs a stock overlay engine whose `applyTemplateOverlay()` always replaces `<main>.innerHTML` with the template's content. That's wrong for the `/of1` page — its `<main>` contains the OF1 search block (an active component with running JS that would be destroyed by an innerHTML swap). The passthrough mode lets the engine load the branded chrome + the page CSS while leaving the existing `<main>` content intact.

Open `scripts/scripts.js`, find the `applyTemplateOverlay()` function, and add this check **before** the "Replace main content" line:

```javascript
// Check for passthrough mode — if the template body has [data-slot-passthrough],
// only load header/footer + page CSS but keep the original <main> content intact.
// Used by the /of1 page so the OF1 block's running JS isn't destroyed.
if (templateMain.querySelector('[data-slot-passthrough]')) {
  main.dataset.overlay = templateName;
  // Passthrough still needs standard block decoration so blocks in <main>
  // (like the OF1 block) have their decorate() function called.
  decorateMain(main);
  await loadSection(main.querySelector('.section'), waitForFirstImage);
  return true;
}
```

**Critical:** the passthrough MUST call `decorateMain(main)` and `loadSection()` before returning `true`. Without those, blocks in `<main>` never decorate and the page renders as raw unstyled DA content. "Passthrough" means "skip DOM replacement" — NOT "skip block decoration."

### Step 1 — Read design context

- `stardust/current/DESIGN.json` — design tokens (colors, fonts, spacing, radius)
- `stardust/current/DESIGN.md` — design direction
- `styles/styles.css` — CSS custom properties (the actual deployed tokens)
- `blocks/of1/of1.css` — the freshly-copied template you'll customize
- `templates/templates-catalog.json` — template catalog (what the LLM generates)

### Step 2 — Generate brand-appropriate block styles

The CSS must cover these key patterns:

- **Section-level styling** — spacing, backgrounds, max-width constraints
- **Hero treatment** — full-bleed image background, gradient overlay, large typography
- **Card grids** — proper grid layout, hover effects, image aspect ratios, card borders/shadows
- **Comparison tables** — styled headers, alternating rows, responsive overflow
- **Columns** — side-by-side with responsive stacking
- **Suggestions UI** — follow-up chips with hover states, custom input, restart button
- **Skeleton loading** — animated placeholder while generating
- **Section animations** — fade + slide-up on appearance
- **Debug panel** — side panel with timing waterfall (activated with `?debug`)

Adapt these patterns to the current brand: use the site's actual CSS custom properties (`var(--primary-color)`, `var(--text-color)`, …), match the site's aesthetic (light/dark theme, border-radius, typography), ensure generated sections feel cohesive with the rest of the site.

### Step 3 — Customize `blocks/of1/of1.css` for the brand

**This is what EDS auto-loads for the OF1 block.** All block-level styling (search UI, generated sections, cards, hero, suggestions, skeleton, debug) goes here.

⚠️ **DO NOT put block styling in `styles/of1.css`** — that file is only for page chrome (Step 5b).

Step 0 already copied the unbranded template to `blocks/of1/of1.css`. Now edit it in place:
1. Replace ALL generic token values (e.g. `#000000`, `system-ui`) with brand values from `DESIGN.json`
2. Add brand-specific visual enhancements

The file is organized into these sections (keep the structure; just retune the values):

```
/* ─── Container & Layout ─── */
/* ─── Search Landing UI ─── */
/* ─── Input & Submit ─── */
/* ─── Quick Suggestion Chips ─── */
/* ─── Loading Skeleton ─── */
/* ─── Generated Sections (general) ─── */
/* ─── Hero Sections ─── */
/* ─── Card Grids ─── */
/* ─── Columns ─── */
/* ─── Tables ─── */
/* ─── Text Sections ─── */
/* ─── Follow-up Suggestions ─── */
/* ─── Error State ─── */
/* ─── Debug Panel ─── */
/* ─── Animations ─── */
/* ─── Responsive ─── */
```

### Step 4 — Verify block class names

After `decorateMain` + `loadSections`, the DOM structure is:

```html
<main>
  <div class="section of1-container">        <!-- of1 search UI -->
    <div class="of1-wrapper">
      <div class="of1 block">…</div>
    </div>
  </div>
  <div class="section hero-container">       <!-- generated hero -->
    <div class="hero-wrapper">
      <div class="hero block">…</div>
    </div>
  </div>
  <div class="section cards-container">      <!-- generated cards -->
    <div class="cards-wrapper">
      <div class="cards block">…</div>
    </div>
  </div>
  <div class="section generative-suggestions"> <!-- follow-up -->
    …
  </div>
</main>
```

## EDS Block DOM Reference (after decorateMain)

**This is the actual DOM you are styling. Do NOT assume any other structure.**

EDS's `decorateMain()` always produces this three-level wrapper for every block:

```
.section.<blockname>-container > .<blockname>-wrapper > .<blockname>.block > div (rows) > div (cells)
```

### Hero
```
.section.hero-container
  > .hero-wrapper
    > .hero.block
      > div                    ← row (flexbox item)
        > div                  ← cell: h1, p, a (text content)
        > div                  ← cell: <picture><img> (NOT img directly on .hero)
```
- The `.hero` div does NOT contain the image directly — it's inside a `<picture>` inside a cell inside a row
- Text and image are sibling cells within a row div

### Cards
```
.section.cards-container
  > .cards-wrapper
    > .cards.block             ← THIS is the grid container
      > div                    ← one per card (row)
        > div                  ← cell content (picture, h3, p, a)
```
- `.cards` itself is the grid container — NOT `.cards > div`
- Each direct child `> div` of `.cards` is one card

### Columns
```
.section.columns-container
  > .columns-wrapper
    > .columns.block
      > div                    ← single row
        > div + div            ← column cells (2+ siblings)
```

### Table
```
.section.table-container
  > .table-wrapper
    > .table.block
      > div                    ← header row (div-based, NOT <th>)
        > div + div + div      ← cells (NOT <td>)
      > div                    ← data row
        > div + div + div      ← cells
```
- **NO `<table>`, `<th>`, `<td>` elements** — everything is div-based
- First `> div` child = header row; subsequent `> div` children = data rows

### Common selector mistakes to avoid

| Wrong selector | Why it fails | Correct selector |
|---|---|---|
| `.cards > div` as grid | That targets individual cards, not the grid | `.cards` is the grid |
| `.cards > div > div` for cards | That's cell content inside a card | `.cards > div` for each card |
| `table`, `th`, `td` | EDS uses divs, not HTML table elements | `.table > div` for rows, `.table > div > div` for cells |
| `.hero img` positioned absolute | img is inside `<picture>` inside a cell div | `.hero picture` positioned absolute |
| `[class*="-wrapper"] { max-width: 100% }` | Kills content constraint on cards/columns/table wrappers | Only override `.hero-wrapper` for full-bleed |

---

Target selectors for generated content use the `.generated-section` class added by the OF1 block JS:

```css
.generated-section                         /* any generated section */
.generated-section .hero                   /* generated hero block */
.generated-section .cards                  /* generated cards block */
.generated-section .adventure-cards        /* generated adventure cards */
.generated-section .columns                /* generated columns */
.generated-section .table                  /* generated table */
```

### Step 5 — Write `styles/of1.css` (page chrome)

**The OF1 page loads `styles/of1.css` via the overlay engine (template name = `of1`).** This provides page-level styling for the header, footer, body, and ALL elements that appear outside `<main>` — NOT the block. Without it, the nav bar, announcement bar, and footer render as unstyled links.

**Start from a COPY of the entire `styles/prototype-home.css`, then strip only the `<main>`-content rules.** This inverted approach guarantees nothing is missed — announcement bars, nav actions, logo fills, footer columns, responsive overrides all come along for free.

```bash
cd "$OF1_DEMO_REPO"
cp styles/prototype-home.css styles/of1.css
```

Then edit `styles/of1.css` and **remove only** the rules that style elements INSIDE `<main>` (hero sections, card grids, product listings, feature blocks, etc. — anything with class names from the prototype's `<main>` content). Keep everything else:

- `:root` tokens
- `*` / body resets
- `.announcement-bar` (or any promo bar above the nav)
- `.site-header` and all descendants (nav, logo, links, actions)
- `.site-footer` and all descendants
- Typography (h1–h6, p)
- All responsive `@media` rules for the above
- Any utility classes used by header/footer fragments

⚠️ **Do NOT cherry-pick rules to include.** Start from the full file and remove what you know is `<main>`-only. If in doubt, keep it — extra rules for elements not in the DOM are harmless; missing rules produce visible regressions (raw unstyled announcement bar, unstyled nav icons, etc.).

### Step 6 — Create the `/of1` page template + fragments

The `/of1` page uses a **passthrough** template: the overlay engine loads the branded header/footer + the page-chrome CSS, but does NOT replace `<main>` content (the OF1 block stays untouched).

```bash
cd "$OF1_DEMO_REPO"

mkdir -p templates fragments/of1

# Passthrough template — keeps the OF1 block, only swaps in header/footer + page chrome
cat > templates/of1.html <<'TMPL'
<main data-overlay="of1">
  <div class="of1-container" data-slot-passthrough="true">
  </div>
</main>
TMPL

# OF1 page uses the same header/footer chrome as the prototype-home page.
# These files MUST exist — step 6 (snowflake) commits them to git.
# If they're missing, step 6 did not run correctly.
[ -f fragments/prototype-home/header.html ] || {
  echo "FAIL: fragments/prototype-home/header.html not found in git." >&2
  echo "Step 6 (snowflake) did not commit fragments. Re-run step 6." >&2
  exit 1
}
cp fragments/prototype-home/header.html fragments/of1/header.html
cp fragments/prototype-home/footer.html fragments/of1/footer.html
```

The passthrough behavior for the `<main data-overlay="of1">` + `[data-slot-passthrough]` template above is implemented by the `scripts/scripts.js` patch installed in Step 0 — verify that patch is in place before pushing.

### Step 7 — Upload OF1 DA content (and nav/footer placeholders)

The `/of1` page itself is a DA document that points the overlay engine at the `of1` template. The default EDS header/footer blocks also expect `/nav` and `/footer` content to exist — without them, those blocks 404 even though our overlay-aware fragments are the ones actually used. Create all three.

```bash
# /of1 — content page that triggers template=of1
OF1_HTML='<html><body><header></header><main><div><table><tr><th colspan="2">of1</th></tr><tr><td><p>api-endpoint</p></td><td><p>https://of1-gen-web-service.franklin-prod.workers.dev</p></td></tr><tr><td><p>domain</p></td><td><p>'${BRANCH}'--'${REPO}'--'${OWNER}'</p></td></tr></table></div><div><table><tr><th colspan="2">Metadata</th></tr><tr><td><p>template</p></td><td><p>of1</p></td></tr><tr><td><p>nav</p></td><td><p>/'${BRANCH}'/nav</p></td></tr><tr><td><p>footer</p></td><td><p>/'${BRANCH}'/footer</p></td></tr></table></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$OF1_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/of1.html"

# /nav and /footer placeholders so the default EDS blocks don't 404
NAV_HTML='<html><body><header></header><main><div><p><a href="/">Brand</a></p></div><div><ul><li><a href="#">Link 1</a></li></ul></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$NAV_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/nav.html"

FOOTER_HTML='<html><body><header></header><main><div><p>Footer content</p></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$FOOTER_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/footer.html"

# Trigger preview so the URLs are live
for SLUG in of1 nav footer; do
  PREVIEW_RESP=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${SLUG}")
  PREVIEW_STATUS=$(echo "$PREVIEW_RESP" | tail -1)
  if [ "$PREVIEW_STATUS" -lt 200 ] || [ "$PREVIEW_STATUS" -ge 300 ]; then
    echo "FAIL: preview trigger for /${SLUG} returned HTTP ${PREVIEW_STATUS}" >&2
    echo "Response: $(echo "$PREVIEW_RESP" | sed '$d')" >&2
    exit 1
  fi
done
```

**Do NOT include a `<title>` tag in the DA HTML** — EDS will render it as visible content.

### Step 7b — Gate: verify DA content is live and renders correctly

**Do NOT proceed to Step 8 until this gate passes.** The preview triggers above can silently fail (401, stale cache, missing auth headers). Verify the pages actually exist and return valid HTML.

```bash
# Verify each page returns 200 and contains expected content
OF1_PREVIEW="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
NAV_PREVIEW="https://${BRANCH}--${REPO}--${OWNER}.aem.page/nav"
FOOTER_PREVIEW="https://${BRANCH}--${REPO}--${OWNER}.aem.page/footer"

echo "Verifying DA content is live..."

# Check /of1 page exists and has the template metadata
OF1_BODY=$(curl -s -w "\n%{http_code}" "$OF1_PREVIEW")
OF1_STATUS=$(echo "$OF1_BODY" | tail -1)
OF1_HTML=$(echo "$OF1_BODY" | sed '$d')

if [ "$OF1_STATUS" != "200" ]; then
  echo "FAIL: /of1 page returned HTTP ${OF1_STATUS} — preview trigger likely failed (auth issue?)" >&2
  echo "Re-run the preview trigger with both Authorization and x-content-source-authorization headers." >&2
  exit 1
fi

# Verify the template meta is present (proves DA content was processed correctly)
if ! echo "$OF1_HTML" | grep -q 'template.*of1\|meta.*template'; then
  echo "WARN: /of1 page returned 200 but template metadata not found in HTML." >&2
  echo "The DA content may be stale. Re-triggering preview..." >&2
  curl -s -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/of1"
  sleep 3
  # Re-check
  OF1_RECHECK=$(curl -s "$OF1_PREVIEW")
  if ! echo "$OF1_RECHECK" | grep -q 'template.*of1\|meta.*template'; then
    echo "FAIL: /of1 page still missing template metadata after re-trigger." >&2
    exit 1
  fi
fi

# Check nav and footer exist
for SLUG in nav footer; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${SLUG}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  if [ "$STATUS" != "200" ]; then
    echo "FAIL: /${SLUG} returned HTTP ${STATUS} — content not live" >&2
    exit 1
  fi
done

echo "✓ All DA content verified live: /of1 (with template=of1), /nav, /footer"
```

Common failures at this gate:

| Symptom | Cause | Fix |
|---|---|---|
| 401 on preview trigger | Missing `x-content-source-authorization` header or expired token | Re-authenticate DA token and re-run |
| 200 but no template metadata | DA content uploaded but preview not triggered (stale cache) | Re-trigger preview with both auth headers |
| 404 on /of1 | PUT to DA source failed silently | Check the PUT response; verify `admin.da.live/source/...` path matches repo config |
| 404 on /nav or /footer | Preview trigger ran before PUT completed | Re-run PUTs then re-trigger |

### Step 8 — Commit and push

```bash
cd "$OF1_DEMO_REPO"
git add blocks/of1/ styles/of1.css templates/of1.html fragments/of1/
git commit -m "feat: OF1 page + brand-aligned block styling for ${DOMAIN}"
git push origin "$BRANCH"
```

### Step 9 — Verify the live `/of1` page renders correctly

After the push, EDS picks up the code change automatically. Open the live OF1 page in a browser and verify the three things that have to be right before handing back to the user:

```bash
OF1_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
playwright-cli open "$OF1_URL" --headed
sleep 4  # EDS pulls fragments + lazy CSS

# Confirm the branded chrome and the block are all in the DOM
playwright-cli eval "document.querySelector('header.site-header') ? 'header OK' : 'HEADER MISSING'"
playwright-cli eval "document.querySelector('footer.site-footer') ? 'footer OK' : 'FOOTER MISSING'"
playwright-cli eval "document.querySelector('.of1')             ? 'of1 block OK' : 'OF1 BLOCK MISSING'"

# Capture a screenshot for visual review
playwright-cli screenshot --fullPage=true --filename "$OF1_STATE_DIR/of1-render-check.png"
```

Open the screenshot — the branded nav should be at the top, the branded footer at the bottom, and the OF1 search UI (title, input, suggestion chips) in the middle.

### Step 9b — Verify generated content styling

The page chrome rendering (Step 9) is necessary but not sufficient. You MUST also verify that generated blocks render with proper layout — not just raw text.

1. Trigger a test query by clicking a suggestion chip or entering a query
2. Wait for generated content to appear (sections stream in)
3. Screenshot the result and verify:
   - **Cards** render as a grid (not a vertical list of unstyled divs)
   - **Hero** shows image as background with text overlay (not image then text stacked)
   - **Table** renders with visible header row and aligned columns (not a blob of text)
   - **Columns** sit side-by-side (not stacked vertically on desktop)
4. If any block renders as unstyled/broken, inspect the DOM and compare selectors in `of1.css` against the actual EDS DOM structure documented in Step 4

```bash
# Click first suggestion chip to trigger generation
playwright-cli click ".of1-chip:first-child"
sleep 8  # wait for LLM to generate + render

# Screenshot the generated result
playwright-cli screenshot --fullPage=true --filename "$OF1_STATE_DIR/of1-generated-check.png"

# Spot-check that blocks decorated correctly
playwright-cli eval "document.querySelector('.generated-section .cards') ? 'cards OK' : 'CARDS MISSING'"
playwright-cli eval "document.querySelector('.generated-section .hero') ? 'hero OK' : 'HERO MISSING'"
```

If selectors don't match, the CSS is targeting the wrong DOM structure. Refer to the EDS Block DOM Reference in Step 4 and fix `blocks/of1/of1.css` accordingly.

Common failures:

| Symptom | Likely cause |
|---|---|
| `HEADER MISSING` / `FOOTER MISSING` | `fragments/of1/{header,footer}.html` didn't get pushed, or `scripts/scripts.js` is missing passthrough support (Step 6 of the snowflake skill) |
| `OF1 BLOCK MISSING` | `blocks/of1/of1.js` wasn't pushed, OR the DA content document at `/of1.html` is missing the `template=of1` metadata, OR the `of1` block class isn't on the right element |
| Screenshot shows unstyled links / system font | `styles/of1.css` didn't get pushed, or the overlay engine didn't pick it up (check `<meta name="template">` in the rendered HTML) |

Fix any failures and re-push before Completion.

## Key principles

- **Generated content must look as good as hand-crafted pages** — this is a demo, impressions matter
- **Use the brand's actual tokens** — don't hardcode colors; use `var(--primary-color)`
- **Style generated sections specifically** — don't break existing static page styling
- **Full-bleed heroes** — dramatic, not constrained to max-width
- **Card images are critical** — the LLM outputs image URLs; they must render at proper aspect ratios in a grid
- **Responsive by default** — grids collapse, heroes scale, tables scroll
- **Animations add polish** — fade-in + slide-up on each section as it streams in

## Completion — HARD STOP for user review

After pushing, mark the step as `review` and **STOP**. Do not proceed. The user must open the OF1 page, test the search UI, click suggestion chips, and visually approve the styling before the pipeline continues.

This is a gate — step 13 (Deploy) cannot start until both step 7 (Templates) and step 8 (this step) are approved.

```bash
OF1_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
cat > "$OF1_STATE_DIR/step-8-status.json" <<EOF
{
  "step": 8,
  "status": "review",
  "deliverables": [
    { "url": "${OF1_URL}", "label": "OF1 page" }
  ],
  "summary": "OF1 page is live with brand-aligned block + page-chrome styling. Open it, try the search chips, and review the design."
}
EOF
```

The user will:
1. Open the OF1 page via the deliverable link
2. Try suggestion chips to see generated content with the new styling
3. Approve or request revisions

## Common mistakes that waste time

Cross-cutting rules (SLICC Node.js shim, EDS class collisions) live in `of1-demo/knowledge/common-pitfalls.md`. The pitfalls below are specific to OF1-block styling — read all before writing CSS.

| Mistake | Time cost | Fix |
|---|---|---|
| Writing branded CSS to `styles/of1-template-base.css` or any other file | 10+ min (block appears completely unstyled) | Output MUST go to `blocks/of1/of1.css` — the ONLY file EDS auto-loads for the block |
| Leaving generic tokens (`#000000`, `system-ui`) in `of1.css` | 5+ min (block looks unbranded) | Replace ALL placeholder token values with brand values from `DESIGN.json` |
| **Forgetting `styles/of1.css` page chrome** | **OF1 nav/footer renders as raw unstyled links** | **MUST write `styles/of1.css` with header/footer CSS copied from prototype styles** |
| Using whatever `of1.js` is in the demo repo | 10+ min debugging | Always copy fresh from `$SKILL_DIR/assets/of1.js` |
| Using whatever `of1.css` is in the demo repo as base | 5+ min stale/wrong | Always copy fresh from `$SKILL_DIR/assets/of1.css` and customize in place |
| Modifying `of1.js` to add brand logic | Breaks block | JS is shared infrastructure — NEVER touch it, only customize CSS |
| Forgetting to commit `of1.js` alongside `of1.css` | Blank page | Always `git add blocks/of1/` to include both files |
| **Generated sections constrained to 980px max-width** | **Content has huge side padding, doesn't fill viewport** | **Generated sections MUST be full-width (`max-width: 100%` or `none`). Only inner content (cards grid, text) should have max-width.** |
| **Section padding over 60px** | **Huge vertical gaps between sections** | **Use 40–56px vertical padding max. Base template uses 56px — don't increase it.** |
| **Start over button icon misaligned** | **SVG icon floating above/below text** | **`.suggestion-restart` needs `display: inline-flex; align-items: center; gap: 6px;`** |
