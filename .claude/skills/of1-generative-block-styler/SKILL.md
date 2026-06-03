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
| `SKILL_DIR` | absolute path to this skill's directory |
| `OF1_SNOWFLAKE_ASSETS` | absolute path to `of1-snowflake/assets/` (sibling skill — provides the canonical `of1.js` and `of1-base.css`) |
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
2. **This skill OWNS the block install.** Always copy `of1.js` and `of1-base.css` fresh from `$OF1_SNOWFLAKE_ASSETS/` — never reuse whatever exists in the repo (may be stale from a previous run).
3. **Style using brand tokens from stardust** — read `stardust/current/DESIGN.json`, `DESIGN.md`, and the `:root` tokens in `styles/styles.css`. The OF1 block must feel native to the brand, not a generic overlay.
4. **Commit BOTH `of1.js` and `of1.css`** — `of1.js` deployed as-is alongside your styled `of1.css`. Always `git add blocks/of1/` to include both. Missing JS = blank page.

## Why this skill exists

EDS block CSS is designed for statically-authored pages. When the LLM generates sections dynamically, the raw block CSS often looks too plain — no visual hierarchy between sections, cards render as flat lists, heroes lack full-bleed treatment, tables are unstyled, no transitions, no cohesive container. This skill bridges that gap by writing `blocks/of1/of1.css` (block-level styles for generated content) and `styles/of1.css` (page chrome for the `/of1` page itself).

## Always start from the canonical base files

The OF1 block base files live in the snowflake skill's assets, NOT in the demo repo:

- **Base CSS:** `$OF1_SNOWFLAKE_ASSETS/of1-base.css`
- **Base JS:** `$OF1_SNOWFLAKE_ASSETS/of1.js`

Always copy/read these as the starting point. Do NOT use whatever `of1.css` or `of1.js` happens to be in the demo repo.

## Process

### Step 0 — Install block JS

```bash
cd "$OF1_DEMO_REPO"
mkdir -p blocks/of1
cp "$OF1_SNOWFLAKE_ASSETS/of1.js" blocks/of1/of1.js
```

### Step 1 — Read design context

- `stardust/current/DESIGN.json` — design tokens (colors, fonts, spacing, radius)
- `stardust/current/DESIGN.md` — design direction
- `styles/styles.css` — CSS custom properties (the actual deployed tokens)
- `$OF1_SNOWFLAKE_ASSETS/of1-base.css` — base template to customize
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

### Step 3 — Write `blocks/of1/of1.css` (block styling)

**This is what EDS auto-loads for the OF1 block.** All block-level styling (search UI, generated sections, cards, hero, suggestions, skeleton, debug) goes here.

⚠️ **DO NOT put block styling in `styles/of1.css`** — that file is only for page chrome (Step 5b).

Process:
1. Read `$OF1_SNOWFLAKE_ASSETS/of1-base.css` as the template
2. Replace ALL generic token values (e.g. `#000000`, `system-ui`) with brand values from `DESIGN.json`
3. Add brand-specific visual enhancements
4. Write the complete result to `blocks/of1/of1.css`, organized into these sections:

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

Target selectors for generated content use the `.generated-section` class added by the OF1 block JS:

```css
.generated-section                         /* any generated section */
.generated-section .hero                   /* generated hero block */
.generated-section .cards                  /* generated cards block */
.generated-section .adventure-cards        /* generated adventure cards */
.generated-section .columns                /* generated columns */
.generated-section .table                  /* generated table */
```

### Step 5 — Test locally

Start the dev server and verify:
1. Open the OF1 page
2. Click a suggestion chip
3. Hero has full-bleed image + gradient + white text
4. Cards render in a grid with proper image treatment
5. Tables have styled headers and rows
6. Sections animate in smoothly
7. Suggestions UI is polished with hover states

### Step 5b — Write `styles/of1.css` (page chrome)

**The OF1 page loads `styles/of1.css` via the overlay engine (template name = `of1`).** This provides page-level styling for the header, footer, and body — NOT the block. Without it, the nav bar and footer render as unstyled links.

Copy the header/footer CSS from the prototype styles. Open `styles/prototype-home.css` and extract the `.site-header`/`.site-footer` rules — the OF1 page uses the same fragments as the prototype pages but loads a different page-level stylesheet.

`styles/of1.css` must contain:

| Section | Purpose |
|---|---|
| Body reset | Brand font-family, color, background |
| `.site-header` | Sticky dark nav with backdrop-blur, white links |
| `.site-header nav` | Flex layout, spacing, max-width |
| `.site-header nav a` | White text, font-size, hover state |
| `.site-header .nav-logo svg` | Logo fill color |
| `.site-footer` | Footer background, columns grid, link colors |
| Typography | Heading fonts, weights, sizes |
| Responsive | Mobile nav/footer adjustments |

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

# OF1 page uses the same header/footer chrome as the prototype-home page
cp fragments/prototype-home/header.html fragments/of1/header.html
cp fragments/prototype-home/footer.html fragments/of1/footer.html
```

**Note:** the substrate (`scripts/scripts.js`) must already understand `data-slot-passthrough` — that's installed during the snowflake step (step 6). If a fresh run shows the OF1 page rendering as raw unstyled DA content, the substrate doesn't have passthrough support yet.

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
  curl -s -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    -o /dev/null \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/${SLUG}"
done
```

**Do NOT include a `<title>` tag in the DA HTML** — EDS will render it as visible content.

### Step 8 — Commit and push

```bash
cd "$OF1_DEMO_REPO"
git add blocks/of1/ styles/of1.css templates/of1.html fragments/of1/
git commit -m "feat: OF1 page + brand-aligned block styling for ${DOMAIN}"
git push origin "$BRANCH"
```

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
OF1_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/of1"
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
| Writing branded CSS to `styles/of1-base.css` or any other file | 10+ min (block appears completely unstyled) | Output MUST go to `blocks/of1/of1.css` — the ONLY file EDS auto-loads for the block |
| Leaving generic tokens (`#000000`, `system-ui`) in `of1.css` | 5+ min (block looks unbranded) | Replace ALL placeholder token values with brand values from `DESIGN.json` |
| **Forgetting `styles/of1.css` page chrome** | **OF1 nav/footer renders as raw unstyled links** | **MUST write `styles/of1.css` with header/footer CSS copied from prototype styles** |
| Using whatever `of1.js` is in the demo repo | 10+ min debugging | Always copy from `$OF1_SNOWFLAKE_ASSETS/of1.js` |
| Using whatever `of1.css` is in the demo repo as base | 5+ min stale/wrong | Always start from `$OF1_SNOWFLAKE_ASSETS/of1-base.css` |
| Modifying `of1.js` to add brand logic | Breaks block | JS is shared infrastructure — NEVER touch it, only customize CSS |
| Forgetting to commit `of1.js` alongside `of1.css` | Blank page | Always `git add blocks/of1/` to include both files |
| **Generated sections constrained to 980px max-width** | **Content has huge side padding, doesn't fill viewport** | **Generated sections MUST be full-width (`max-width: 100%` or `none`). Only inner content (cards grid, text) should have max-width.** |
| **Section padding over 60px** | **Huge vertical gaps between sections** | **Use 40–56px vertical padding max. Base template uses 56px — don't increase it.** |
| **Start over button icon misaligned** | **SVG icon floating above/below text** | **`.suggestion-restart` needs `display: inline-flex; align-items: center; gap: 6px;`** |
