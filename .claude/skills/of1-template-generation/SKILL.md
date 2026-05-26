---
name: of1-template-generation
description: Generate 25 branded OF1 templates (5 intents × 5 variations) from the snowflake design system and demo narrative.
user-invocable: false
---

# OF1 Template Generation

Generate a complete template library for the OF1 worker. Each template is a slot-based HTML page that the worker fills with personalized content at runtime based on user intent.

## Inputs

- `DOMAIN`: Target domain
- Repo config from `/shared/of1-demo/repo-config.json`
- Design tokens from `stardust/current/DESIGN.json` (from step 4)
- Demo narrative from `/shared/of1-demo/step-3-output.md` (from step 3 — discovery)
- Personas from discovery output

## Architecture

The OF1 worker selects a template based on user intent and fills its `data-slot` attributes with personalized content. Templates are static HTML + CSS served via EDS.

```
templates/{name}.html          ← slot-based HTML (data-slot="key")
styles/{name}.css              ← per-template CSS (@import of1-base.css)
styles/of1-base.css            ← shared design tokens + utilities
templates/{name}.sample.json   ← sample data for preview
drafts/{name}-sample.html      ← filled preview (template + sample merged)
templates/templates-catalog.json  ← index of all templates
gallery/index.html             ← browsable UI for reviewing templates
tools/fill-template.mjs        ← merge script (template + JSON → HTML)
```

## The 5 Intents (fixed)

| Intent | Purpose | Example queries |
|--------|---------|-----------------|
| `comparison` | Compare options side by side | "X vs Y", "which is better", "differences between" |
| `recommendation` | Personalized pick or ranked list | "best for me", "what should I choose", "top picks" |
| `deep-dive` | In-depth explanation or article | "how does X work", "tell me about", "explain" |
| `budget` | Pricing, ROI, cost orientation | "how much", "pricing", "cost calculator", "ROI" |
| `discovery` | Browse, explore, get inspired | "show me", "what's available", "categories", "ideas" |

## Process

### 0. Read repo config and design tokens

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

cd "$REPO_DIR"
```

Read the design tokens:
```
read_file ${REPO_DIR}/stardust/current/DESIGN.json
```

Read the discovery output for demo narrative and personas:
```
read_file /shared/of1-demo/step-3-output.md
```

### 1. Generate `styles/of1-base.css`

Create the shared base stylesheet with brand-specific tokens derived from `DESIGN.json`:

```css
/* Shared base for all of1-* templates — tokens, hero shell, common utilities. */

:root {
  --of1-bg: {background color from DESIGN.json};
  --of1-fg: {text color};
  --of1-muted: {muted text color};
  --of1-accent: {primary/accent color};
  --of1-accent-hover: {darker accent};
  --of1-accent-fg: {text on accent — usually white};
  --of1-surface: {card/surface color — usually white};
  --of1-surface-cream: {secondary surface};
  --of1-surface-dark: {dark surface for contrast sections};
  --of1-border: {border color};
  --of1-radius: 16px;
  --of1-max-width: 1200px;
  --of1-font-display: {display font from DESIGN.json, with fallbacks};
  --of1-font-body: {body font, with fallbacks};
  --of1-font-mono: {monospace font, with fallbacks};
}
```

Then include the standard layout utilities:
- `*, *::before, *::after { box-sizing: border-box; }`
- `main` base styles (bg, color, font-family)
- `.of1-section` padding
- `.of1-inner` max-width container
- `.of1-inner-narrow` for text-heavy sections
- `.of1-eyebrow` monospace label style
- `.of1-hero` hero shell (min-height, flex center)
- `.of1-hero-grid` two-column grid (text left, media right)
- `.of1-hero-title` display font heading
- `.of1-hero-subtitle` muted subtitle
- `.of1-hero-ctas` button row
- `.of1-hero-media` image container
- `.of1-cta` button base + `.of1-cta-primary` variant
- Empty media container collapse rule (hide media wrappers with no children)

Use the Amazon Ads reference as a structural guide but apply the brand's actual colors, fonts, and proportions.

### 2. Generate 5 template variations per intent

For each of the 5 intents, generate 5 distinct layout variations. Each variation must:

**Naming convention:** `of1-{intent}-{variation-name}`

Examples:
- `of1-comparison-table`, `of1-comparison-versus`, `of1-comparison-trio`, `of1-comparison-stacked`, `of1-comparison`
- `of1-recommendation-top-list`, `of1-recommendation-single-pitch`, `of1-recommendation-persona-match`, `of1-recommendation-decision-tree`, `of1-recommendation-winner`
- `of1-deep-dive-article`, `of1-deep-dive-faq`, `of1-deep-dive-hero-sections`, `of1-deep-dive-narrative`, `of1-deep-dive-specs`
- `of1-budget-calculator`, `of1-budget-roi`, `of1-budget-save-tips`, `of1-budget-tiers`, `of1-budget-value-grid`
- `of1-discovery-browse-grid`, `of1-discovery-categories`, `of1-discovery-mood-board`, `of1-discovery-spotlight`, `of1-discovery-stories`

#### For each template, produce:

**A. `templates/{name}.html`** — The slot-based template:
- Use semantic HTML sections with BEM-like class names: `.{name}-{section} .of1-{utility}`
- Every editable element gets `data-slot="{section}.{field}"` (e.g., `hero.title`, `item-1.body`)
- Support variable item counts where appropriate (e.g., 1–5 comparison cards)
- Include `minItems` and `maxItems` metadata as comments or in the catalog
- NO `<head>`, NO `<!DOCTYPE>`, just `<main>...</main>`

**B. `styles/{name}.css`** — Per-template styles:
- First line: `@import url("/styles/of1-base.css");`
- Only add rules specific to this template's layout
- Use the template's class prefix (e.g., `.of1-budget-calculator-*`)
- Keep it tight — 30–80 lines typically

**C. `templates/{name}.sample.json`** — Sample slot data:
- Must include `_meta.stylesheet` pointing to the CSS
- Fill every slot with realistic content relevant to the brand/domain
- Use real image URLs from the site (from the extraction step)
- Links use `{ "label": "...", "href": "#" }` format
- This is what the gallery preview shows — make it look good

### 3. Generate filled previews

For each template, run the fill script to produce a preview:

```bash
mkdir -p drafts
cp /workspace/skills/of1-template-generation/assets/fill-template.mjs tools/fill-template.mjs

for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  SAMPLE="templates/${NAME}.sample.json"
  if [ -f "$SAMPLE" ]; then
    node tools/fill-template.mjs "$TPL" "$SAMPLE" "drafts/${NAME}-sample.html"
  fi
done
```

### 4. Generate `templates/templates-catalog.json`

Build the catalog index:

```json
{
  "generatedAt": "2026-05-26T...",
  "count": 25,
  "byIntent": {
    "comparison": ["of1-comparison-table", "of1-comparison-versus", ...],
    "recommendation": [...],
    "deep-dive": [...],
    "budget": [...],
    "discovery": [...]
  },
  "templates": [
    {
      "name": "of1-comparison-table",
      "intent": "comparison",
      "description": "Side-by-side feature table for 2–4 options.",
      "html": "/templates/of1-comparison-table.html",
      "stylesheet": "/styles/of1-comparison-table.css",
      "minItems": 2,
      "maxItems": 4,
      "requiredSlots": ["hero.title", "item-1.title", "item-2.title"],
      "allSlots": ["hero.eyebrow", "hero.title", "hero.subtitle", ...]
    },
    ...
  ]
}
```

### 5. Install gallery page

```bash
mkdir -p gallery
cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
```

The gallery reads `templates/templates-catalog.json` and renders template previews from `drafts/{name}-sample.html` in an iframe. No modifications needed — it's generic.

### 6. Commit and push

```bash
cd "$REPO_DIR"
git add styles/of1-base.css templates/ styles/of1-*.css drafts/ tools/ gallery/ templates/templates-catalog.json
git commit -m "feat: generate 25 OF1 templates (5 intents × 5 variations) for ${DOMAIN}"
git push origin ${BRANCH}
```

### 7. Verify gallery loads

```bash
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GALLERY_URL")
echo "Gallery: HTTP ${HTTP_CODE} — ${GALLERY_URL}"
```

If not 200, wait a few seconds and retry (CDN propagation).

## Design Guidelines

### Template variety

Each intent's 5 variations must be **structurally distinct** — not just different content in the same layout:
- Different section counts (2 vs 4 sections)
- Different layout patterns (grid vs stack vs split vs single-column)
- Different content density (headline-only vs rich detail)
- Different interaction patterns (table vs cards vs timeline vs accordion)

### Slot naming conventions

- `hero.title`, `hero.subtitle`, `hero.eyebrow`, `hero.image`, `hero.cta-primary`, `hero.cta-secondary`
- `item-N.title`, `item-N.body`, `item-N.image`, `item-N.cta` (for repeated items)
- `summary.title`, `summary.body`, `summary.cta`
- `section-name.field` for unique sections (e.g., `calc.title`, `result.value`)

### CSS rules

- Every template CSS starts with `@import url("/styles/of1-base.css");`
- Use CSS custom properties from the base for all colors/fonts
- Template-specific classes use the full template name prefix: `.of1-{intent}-{variation}-{element}`
- Also include the generic utility class: `.of1-{intent}-{variation}-hero .of1-hero`
- Keep CSS concise — leverage the base utilities

### Sample data quality

- Use realistic content that matches the brand/domain
- Include real image URLs (from `stardust/current/` or the live site)
- CTAs should have plausible labels ("Learn more", "Get started", "Compare plans")
- Text length should be realistic (not lorem ipsum)

## Deliverables

- `styles/of1-base.css` — shared design tokens
- 25 × `templates/of1-*.html` — slot-based templates
- 25 × `styles/of1-*.css` — per-template stylesheets
- 25 × `templates/of1-*.sample.json` — sample data
- 25 × `drafts/of1-*-sample.html` — filled previews
- `templates/templates-catalog.json` — template index
- `gallery/index.html` — browsable review UI
- `tools/fill-template.mjs` — fill script

## Completion

```bash
mkdir -p /shared/of1-demo
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
echo "{\"step\":7,\"status\":\"review\",\"deliverable\":\"${GALLERY_URL}\",\"summary\":\"Generated 25 templates (5 intents × 5 variations). Browse the gallery to review layouts and sample content.\"}" > /shared/of1-demo/step-7-status.json
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
