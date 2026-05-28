---
name: of1-generative-block-styler
description: Generate polished CSS for the of1 generative block that makes dynamically-rendered sections look impressive in the demo
user-invocable: true
---

# Generative Block Styler

Generate a polished, brand-aligned CSS file for the of1 generative block. This makes the dynamically-generated EDS sections (hero, cards, columns, tables) look visually impressive when rendered in the conversational/demo context.

## CRITICAL RULES

1. **NEVER modify `blocks/of1/of1.js`** — the OF1 block JavaScript is shared infrastructure and must not be changed. Only the CSS (`blocks/of1/of1.css`) is customized per brand.
2. **Verify `blocks/of1/of1.js` EXISTS before starting** — if it's missing, the block won't render at all. The snowflake step (Step 6) should have installed it. If missing, copy it from the skill assets: `cp /workspace/skills/of1-snowflake/assets/of1.js blocks/of1/of1.js` and commit it.
3. **Style using the brand guidelines from stardust** — read `stardust/current/DESIGN.json`, `DESIGN.md`, and the `:root` tokens in `styles/styles.css`. The OF1 block must feel native to the brand, not like a generic overlay.
4. **Commit BOTH of1.js and of1.css** — of1.js must be deployed as-is (unmodified) alongside your styled of1.css. Always `git add blocks/of1/` to include both files. A missing JS = blank page.

## Why This Exists

The EDS blocks have CSS designed for statically-authored pages. When the LLM generates sections dynamically, the raw block CSS often looks too plain:
- No visual hierarchy between generated sections
- Cards render as flat lists without proper grid treatment
- Heroes lack the full-bleed dramatic treatment
- Tables are unstyled
- No transitions or animations on section appearance
- No cohesive visual container for the generated content

This skill bridges that gap by generating a `generative.css` (or enhancing `blocks/of1/of1.css`) that styles the generated output specifically.

## IMPORTANT: Always Start from the Canonical Base Files

The OF1 block base files live in the **skills directory**, NOT in the demo repo:

- **Base CSS**: `/workspace/skills/of1-snowflake/assets/of1-base.css`
- **Base JS**: `/workspace/skills/of1-snowflake/assets/of1.js`

**Step 8 MUST:**
1. Copy `of1.js` from skills to `blocks/of1/of1.js` AS-IS (never modify it)
2. Use `of1-base.css` as the starting template for generating `blocks/of1/of1.css`
3. Replace the generic token values in the base CSS with brand-specific values
4. Add any brand-specific visual enhancements on top

**DO NOT** use whatever `of1.css` or `of1.js` already exists in the demo repo — always start fresh from the skills assets. The demo repo files may be stale or from a previous run.

## Process

### Step 0: Install base files from skills

```bash
# Always copy the canonical of1.js — never modify it
cp /workspace/skills/of1-snowflake/assets/of1.js blocks/of1/of1.js

# Read the base CSS as your starting template
cat /workspace/skills/of1-snowflake/assets/of1-base.css
```

### Step 1: Read design context

Read the following files to understand the brand:
- `stardust/current/DESIGN.json` — design tokens (colors, fonts, spacing, radius)
- `styles/styles.css` — CSS custom properties (the actual deployed tokens)
- `/workspace/skills/of1-snowflake/assets/of1-base.css` — the base template to customize
- `templates/templates-catalog.json` — template catalog defining what the LLM generates

### Step 2: Generate brand-appropriate styles

The CSS must cover these key patterns:
- **Section-level styling** — each generated section gets proper spacing, backgrounds, max-width constraints
- **Hero treatment** — full-bleed with image background, gradient overlay, large typography
- **Card grids** — proper grid layout with hover effects, image aspect ratios, card borders/shadows
- **Comparison tables** — styled headers, alternating rows, responsive overflow
- **Columns** — proper side-by-side with responsive stacking
- **Suggestions UI** — polished follow-up chips with hover states, custom input, restart button
- **Skeleton loading** — animated placeholder while generating
- **Section animations** — fade + slide-up on section appearance
- **Debug panel** — side panel with timing waterfall (activated with ?debug)

Adapt these patterns to the current brand:
- Use the site's actual CSS custom properties (`var(--primary-color)`, `var(--text-color)`, etc.)
- Match the site's aesthetic (light/dark theme, border-radius, typography)
- Ensure generated sections look cohesive with the site's existing pages

### Step 3: Write the CSS

**BLOCK CSS OUTPUT: `blocks/of1/of1.css`** — this is what EDS auto-loads for the OF1 block. All block-level styling (search UI, generated sections, cards, hero, suggestions, skeleton, debug) goes here.

**PAGE CHROME OUTPUT: `styles/of1.css`** — this is loaded by the overlay engine for the OF1 page template. It provides header/footer/body styling only (NOT block styling).

⚠️ **DO NOT put block styling in `styles/of1.css`** — it's only for page chrome (header, footer, body typography). The block CSS MUST go in `blocks/of1/of1.css`.

The process:
1. Read `/workspace/skills/of1-snowflake/assets/of1-base.css` as the template
2. Replace ALL generic token values (e.g., `#000000`, `system-ui`) with the brand's actual values from `DESIGN.json`
3. Add brand-specific visual enhancements
4. Write the COMPLETE result to `blocks/of1/of1.css`

Write the complete CSS to `blocks/of1/of1.css`, organized into these sections:

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

### Step 4: Verify block class names

The generated sections use EDS class conventions. After `decorateMain` + `loadSections`, the DOM structure is:

```html
<main>
  <div class="section of1-container">        <!-- of1 search UI -->
    <div class="of1-wrapper">
      <div class="of1 block">...</div>
    </div>
  </div>
  <div class="section hero-container">       <!-- generated hero -->
    <div class="hero-wrapper">
      <div class="hero block">...</div>
    </div>
  </div>
  <div class="section cards-container">      <!-- generated cards -->
    <div class="cards-wrapper">
      <div class="cards block">...</div>
    </div>
  </div>
  <div class="section generative-suggestions"> <!-- follow-up -->
    ...
  </div>
</main>
```

Target selectors for generated content use the `.generated-section` class added by the of1 block JS:

```css
.generated-section                         /* any generated section */
.generated-section .hero                   /* generated hero block */
.generated-section .cards                  /* generated cards block */
.generated-section .adventure-cards        /* generated adventure cards */
.generated-section .columns                /* generated columns */
.generated-section .table                  /* generated table */
```

### Step 5: Test

Start the dev server and test:
1. Open the of1 page
2. Click a suggestion chip
3. Verify: hero has full-bleed image + gradient + white text
4. Verify: cards render in a grid with proper image treatment
5. Verify: tables have styled headers and rows
6. Verify: sections animate in smoothly
7. Verify: suggestions UI is polished with hover states

### Step 5b: Write `styles/of1.css` — page-level chrome styling

**⚠️ CRITICAL:** The OF1 page loads `styles/of1.css` via the overlay engine (template name = "of1"). This file provides page-level styling for the header, footer, and body — NOT the block itself. Without it, the nav bar and footer render as unstyled links.

**Copy the header/footer CSS from the prototype styles.** Look at `styles/prototype-home.css` (or any prototype CSS file) and extract the `.site-header` and `.site-footer` rules. The OF1 page uses the same header/footer fragments as the prototype pages but loads a different page-level stylesheet.

```bash
# Extract header/footer styling from prototype CSS and write to styles/of1.css
# The file MUST include:
# 1. .site-header styling (dark translucent nav bar, white links, logo fill)
# 2. .site-footer styling (footer columns, link colors, typography)
# 3. Body/typography basics (font-family, color, background)
# 4. Any h1-h6 overrides for the page
```

**What `styles/of1.css` must contain:**

| Section | Purpose |
|---------|---------|
| Body reset | Brand font-family, color, background |
| `.site-header` | Sticky dark nav with backdrop-blur, white links |
| `.site-header nav` | Flex layout, spacing, max-width |
| `.site-header nav a` | White text, font-size, hover state |
| `.site-header .nav-logo svg` | Logo fill color |
| `.site-footer` | Footer background, columns grid, link colors |
| Typography | Heading fonts, weights, sizes |
| Responsive | Mobile nav/footer adjustments |

**The easiest approach:** Read `styles/prototype-home.css`, find all rules targeting `.site-header` and `.site-footer` (and their children), and write them into `styles/of1.css` with the addition of body/typography overrides.

### Step 6: Commit and push

Push so the preview updates:
```bash
git add blocks/of1/ styles/of1.css
git commit -m "feat: brand-aligned OF1 generative block styling for {DOMAIN}"
git push origin ${BRANCH}
```

## Key Principles

- **The generated content must look as good as hand-crafted pages** — this is a demo, impressions matter
- **Use the brand's actual tokens** — don't hardcode colors, use `var(--primary-color)` etc.
- **Style generated sections specifically** — don't break existing static page styling
- **Full-bleed heroes** — they should be dramatic, not constrained to max-width
- **Card images are critical** — the LLM outputs image URLs, they must render at proper aspect ratios in a grid
- **Responsive by default** — grids collapse, heroes scale, tables scroll
- **Animations add polish** — fade-in + slide-up on each section as it streams in

## Completion — HARD STOP for user review

After pushing, mark the step as `review` and **STOP**. Do NOT proceed to any further steps. The user must open the OF1 page, test the search UI, click suggestion chips, and visually approve the styling before continuing.

This is a gate — step 13 (Deploy) cannot start until both step 7 (Templates) and step 8 (this step) are approved.

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
echo '{"step":8,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/of1","summary":"OF1 generative block CSS styled to match brand. Please open the OF1 page, test search chips, and review the design."}' > /shared/of1-demo/step-8-status.json
```

The user will:
1. Open the OF1 page via the deliverable link
2. Try suggestion chips to see generated content with the new styling
3. Approve or request revisions via the sprinkle UI

## Common Mistakes That Waste Time

| Mistake | Time Cost | Fix |
|---------|-----------|-----|
| Writing branded CSS to `styles/of1-base.css` or any other file | 10+ min (block appears completely unstyled) | Output MUST go to `blocks/of1/of1.css` — the ONLY file EDS auto-loads for the block |
| Leaving generic tokens (`#000000`, `system-ui`) in of1.css | 5+ min (block looks unbranded) | Replace ALL placeholder token values with brand values from DESIGN.json |
| **Forgetting `styles/of1.css` page chrome** | **OF1 nav/footer renders as raw unstyled links** | **MUST write `styles/of1.css` with header/footer CSS copied from prototype styles** |
| Using existing `of1.js` from the demo repo | 10+ min debugging | Always copy from `/workspace/skills/of1-snowflake/assets/of1.js` |
| Using existing `of1.css` from the demo repo as base | 5+ min stale/wrong | Always start from `/workspace/skills/of1-snowflake/assets/of1-base.css` |
| Modifying `of1.js` to add brand logic | breaks block | JS is shared infrastructure — NEVER touch it, only customize CSS |
| Forgetting to commit `of1.js` alongside `of1.css` | blank page | Always `git add blocks/of1/` to include both files |
| **Generated sections constrained to 980px max-width** | **Content has huge side padding, doesn't fill viewport** | **Generated sections MUST be full-width (`max-width: 100%` or `none`). Only inner content (cards grid, text) should have max-width. Heroes/sections themselves go edge-to-edge.** |
| **Section padding over 60px** | **Huge vertical gaps between generated sections** | **Use 40-56px vertical padding max. The base template uses 56px — don't increase it.** |
| **Start over button icon misaligned** | **SVG icon floating above/below text** | **`.suggestion-restart` needs `display: inline-flex; align-items: center; gap: 6px;`** |
| Using Node.js for scripting | instant failure | Node is a shim in SLICC — use Python |
