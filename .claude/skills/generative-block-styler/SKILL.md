---
name: generative-block-styler
description: Generate polished CSS for the of1 generative block that makes dynamically-rendered sections look impressive in the demo
user-invocable: true
---

# Generative Block Styler

Generate a polished, brand-aligned CSS file for the of1 generative block. This makes the dynamically-generated EDS sections (hero, cards, columns, tables) look visually impressive when rendered in the conversational/demo context — matching the quality of hand-crafted demos like nvidia-ema.

## CRITICAL RULES

1. **NEVER modify `blocks/of1/of1.js`** — the OF1 block JavaScript is shared infrastructure and must not be changed. Only the CSS (`blocks/of1/of1.css`) is customized per brand.
2. **Style using the brand guidelines from stardust** — read `stardust/current/_brand-extraction.json`, `DESIGN.json`, and the `:root` tokens in `styles/styles.css`. The OF1 block must feel native to the brand, not like a generic overlay.

## Why This Exists

The EDS blocks have CSS designed for statically-authored pages. When the LLM generates sections dynamically, the raw block CSS often looks too plain:
- No visual hierarchy between generated sections
- Cards render as flat lists without proper grid treatment
- Heroes lack the full-bleed dramatic treatment
- Tables are unstyled
- No transitions or animations on section appearance
- No cohesive visual container for the generated content

This skill bridges that gap by generating a `generative.css` (or enhancing `blocks/of1/of1.css`) that styles the generated output specifically.

## Process

### Step 1: Read design context

Read the following files to understand the brand:
- `DESIGN.md` or `DESIGN.json` — design tokens (colors, fonts, spacing, radius)
- `styles/styles.css` — CSS custom properties (the actual deployed tokens)
- `blocks/of1/of1.css` — current of1 block styles
- `output/{domain}/block-guide.json` — which blocks the LLM generates

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

### Step 4: Write the CSS

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

### Step 5: Verify block class names

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

### Step 6: Test

Start the dev server and test:
1. Open the of1 page
2. Click a suggestion chip
3. Verify: hero has full-bleed image + gradient + white text
4. Verify: cards render in a grid with proper image treatment
5. Verify: tables have styled headers and rows
6. Verify: sections animate in smoothly
7. Verify: suggestions UI is polished with hover states

### Step 7: Commit and push

Push so the preview updates:
```bash
git add blocks/of1/of1.css
git commit -m "feat: brand-aligned OF1 generative block styling for {DOMAIN}"
git push origin main
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

This is a gate — the parallel steps (8–10) cannot start until the user approves step 7.

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
echo '{"step":7,"status":"review","deliverable":"https://main--'${REPO}'--'${OWNER}'.aem.page/of1","summary":"OF1 generative block CSS styled to match brand. Please open the OF1 page, test search chips, and review the design."}' > /shared/of1-demo/step-7-status.json
```

The user will:
1. Open the OF1 page via the deliverable link
2. Try suggestion chips to see generated content with the new styling
3. Approve or request revisions via the sprinkle UI
