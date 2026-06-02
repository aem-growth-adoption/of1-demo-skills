---
name: of1-template-generation
description: Generate 25 branded OF1 templates (5 intents × 5 variations) from the snowflake design system and demo narrative.
user-invocable: false
---

# OF1 Template Generation

Generate a complete template library for the OF1 worker. Each template is a slot-based HTML page that the worker fills with personalized content at runtime based on user intent.

## ⚠️ This step generates 25 NEW templates — it does NOT reuse Step 6 output

Step 6 (snowflake) produces **page** templates like `templates/prototype-home.html`, `prototype-adventures.html`, etc. — these are full-page reskins of the live site. They are NOT the templates this step generates.

This step generates the **OF1 worker template library** at `templates/of1-*.html` (e.g., `of1-comparison-table.html`, `of1-recommendation-cards.html`). These are slot-based partials the OF1 worker fills with personalized content at runtime.

**Both file sets coexist in `templates/`.** Do NOT build the gallery from `prototype-*.html`. The gallery MUST be driven by `templates/templates-catalog.json`, which only references `of1-*` templates.

**Hard rule:** if you finish this step with fewer than 25 files matching `templates/of1-*.html`, the step is NOT done. Do not write a `"review"` status. See Step 8 (Validate) below — it is mandatory and must pass before completion.

## Inputs

- `DOMAIN`: Target domain
- Repo config from `/shared/of1-demo/repo-config.json`
- Design tokens from `${REPO_DIR}/stardust/current/DESIGN.json` (from step 4)
- Demo narrative from `/shared/of1-demo/step-3-output.md` (from step 3 — discovery)

## Schema Reference

Read `/workspace/skills/of1-demo/knowledge/worker-config-schemas.md` for the exact format of:
- § `templates.json` — routing config, catalog shape, slot definitions, intent taxonomy
- § `products.json` — image allowlist (templates must only reference product images)

## Worker Contract

The OF1 worker uses a template routing system. After `POST /api/tenants/<id>/sync`, the worker materializes templates from EDS into R2. The skill must produce these files:

### Required artifacts

| # | File | Purpose |
|---|------|---------|
| 1 | `of1/config/templates.json` | Routing config — tells the worker where to find templates |
| 2 | `templates/templates-catalog.json` | Index with `byIntent` mapping + template list |
| 3 | `templates/<name>.metadata.json` | Per-template slot contract (one per template) |
| 4 | `templates/<name>.html` | Slot-based HTML body |
| 5 | `styles/of1-base.css` | Shared design tokens + utilities |
| 6 | `styles/<name>.css` | Per-template stylesheet (optional, imports base) |

### File details

**1. `of1/config/templates.json`** — Routing config:
```json
{
  "useRouting": true,
  "baseUrl": "https://${BRANCH}--${REPO}--${OWNER}.aem.page",
  "catalogPath": "/templates/templates-catalog.json"
}
```

**2. `templates/templates-catalog.json`** — Catalog with FULLY INLINED templates:

⚠️ **CRITICAL: Every entry in `templates[]` MUST include `slots`, `htmlContent`, and `stylesheet` inlined.** If you only include name/description/minItems/maxItems, the worker will try to fetch each template's metadata and HTML separately, exceeding the 50-subrequest limit and crashing with a 1101 error.

```json
{
  "useRouting": true,
  "baseUrl": "https://{branch}--of1-demo--aem-growth-adoption.aem.page",
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
      "minItems": 2,
      "maxItems": 4,
      "stylesheet": "/styles/of1-comparison-table.css",
      "slots": [
        { "key": "hero.title", "type": "text", "instruction": "Headline, 5-8 words" },
        { "key": "hero.subtitle", "type": "text", "instruction": "1-sentence framing" },
        { "key": "item-1.title", "type": "text", "instruction": "Product name" }
      ],
      "htmlContent": "<main>\n  <section class=\"hero\">...</section>\n  <section class=\"comparison\">...</section>\n</main>"
    }
  ]
}
```

**Required fields per template entry:**
| Field | Type | Source |
|-------|------|--------|
| `name` | string | Template name |
| `intent` | string | One of: comparison, recommendation, deep-dive, budget, discovery |
| `description` | string | Short distinctive description for LLM routing |
| `minItems` | number | Minimum products/items this template handles |
| `maxItems` | number | Maximum products/items |
| `stylesheet` | string | Path to per-template CSS (e.g., `/styles/of1-comparison-table.css`) |
| `slots` | array | Full slot definitions from metadata (key, type, instruction) |
| `htmlContent` | string | The ENTIRE template HTML file content as a JSON-escaped string |

The `description` field is critical — the LLM uses it to pick between variants for the same intent. Make descriptions short and distinctive.

**3. `templates/<name>.metadata.json`** — Per-template metadata with slot contract:
```json
{
  "name": "of1-comparison-table",
  "intent": "comparison",
  "description": "Side-by-side feature table for 2–4 options.",
  "minItems": 2,
  "maxItems": 4,
  "stylesheet": "/styles/of1-comparison-table.css",
  "html": "/templates/of1-comparison-table.html",
  "slots": [
    { "key": "hero.title", "type": "text", "instruction": "Headline, ≤8 words" },
    { "key": "hero.subtitle", "type": "text", "instruction": "1-sentence framing" },
    { "key": "hero.cta-primary", "type": "link", "instruction": "Primary CTA label + href" },
    { "key": "item-1.title", "type": "text", "instruction": "Product/option name" },
    { "key": "item-1.body", "type": "text", "instruction": "1–2 sentence description" },
    { "key": "item-1.image", "type": "image", "instruction": "Product image URL" },
    { "key": "item-1.cta", "type": "link", "instruction": "Link to product page" }
  ]
}
```

**Slot types** (from the worker's render-template.js):
- `text` — sets innerHTML on the matching `[data-slot]` element
- `image` — sets src + alt on `<img data-slot="key">`. Empty images get stripped.
- `link` — sets href + label on `<a data-slot="key">`. Value is `{ label, href }`.
- `list` — replaces innerHTML of `[data-slot-list="key"]` with `<li>` per item. Value is array of strings.

**Slot key conventions:**
- Pattern: `<scope>.<field>` (e.g., `hero.title`, `cta.label`, `item-3.title`)
- For repeated items: `item-1` … `item-9` — the renderer auto-hides cards whose title and body are empty

**Slot instructions** are passed to the LLM — write them as concise guidance for content generation (e.g., "Headline, ≤8 words", "Use the matched product's image URL", "1-sentence value proposition").

**4. `templates/<name>.html`** — Template HTML body:
```html
<main>
<section class="of1-{name}-hero of1-hero">
  <div class="of1-{name}-hero-grid of1-hero-grid">
    <div class="of1-{name}-hero-text">
      <p class="of1-eyebrow" data-slot="hero.eyebrow">Eyebrow</p>
      <h1 data-slot="hero.title">Title</h1>
      <p data-slot="hero.subtitle">Subtitle</p>
      <div class="of1-hero-ctas">
        <a class="of1-cta of1-cta-primary" data-slot="hero.cta-primary" href="#">CTA</a>
      </div>
    </div>
    <div class="of1-hero-media">
      <img data-slot="hero.image" src="" alt="">
    </div>
  </div>
</section>

<section class="of1-{name}-grid of1-section">
  <div class="of1-inner">
    <div class="of1-cmp-grid" data-grid-items>
      <article data-card="1">
        <img data-slot="item-1.image" src="" alt="">
        <h3 data-slot="item-1.title">Item</h3>
        <p data-slot="item-1.body">Description</p>
        <a data-slot="item-1.cta" href="#">Learn more</a>
      </article>
      <!-- repeat up to maxItems -->
    </div>
  </div>
</section>
</main>
```

**HTML authoring conventions:**
- `data-slot="key"` on a non-img non-a element → text slot
- `<a data-slot="key">` → link slot
- `<img data-slot="key">` → image slot
- `data-slot-list="key"` → list slot
- Item cards MUST be `<article data-card="N">` for auto-hide to work
- `<div class="of1-cmp-grid" data-grid-items>` gets `data-item-count="N"` injected at render time
- NO `<!DOCTYPE>`, NO `<html>/<head>/<body>` — just `<main>...</main>`

## The 5 Intents (fixed)

| Intent | Purpose | Example queries |
|--------|---------|-----------------|
| `comparison` | Compare options side by side | "X vs Y", "which is better", "differences between" |
| `recommendation` | Personalized pick or ranked list | "best for me", "what should I choose", "top picks" |
| `deep-dive` | In-depth explanation or article | "how does X work", "tell me about", "explain" |
| `budget` | Pricing, ROI, cost orientation | "how much", "pricing", "cost calculator", "ROI" |
| `discovery` | Browse, explore, get inspired | "show me", "what's available", "categories", "ideas" |

`discovery` is the fallback intent when classification is uncertain.

## ⚡ Parallelization Note

The orchestrator MAY parallelize this across 5 scoops (one per intent). If running as a single scoop, generate all 25 templates sequentially. Either way, the artifacts are the same.

### Environment constraints:
- **Node.js is a SHIM** — do NOT use `node` or `npm` or `.mjs` files
- Use `python3 tools/fill-template.py` for generating filled previews
- Use ASCII-safe text in sample data (no accented characters like é — use plain 'e')

---

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
```bash
cat ${REPO_DIR}/stardust/current/DESIGN.json
```

Read the discovery output for demo narrative:
```bash
cat /shared/of1-demo/step-3-output.md
```

### 0b. Extract component palette from prototype

**This is critical for visual fidelity.** Read the prototype HTML to extract real component patterns from the site. These patterns become the building blocks for templates — instead of inventing generic HTML, templates reuse the actual visual components.

```bash
# Find the prototype (could be in stardust/current/prototypes/ or deliverables/)
PROTOTYPE=$(ls ${REPO_DIR}/stardust/current/prototypes/home.html ${REPO_DIR}/deliverables/prototype-home.html 2>/dev/null | head -1)

if [ -n "$PROTOTYPE" ]; then
  echo "Found prototype: $PROTOTYPE"
  cat "$PROTOTYPE"
fi
```

From the prototype HTML, identify and catalog these reusable components:

| Component | What to extract | Use in templates |
|-----------|----------------|------------------|
| **Hero** | Full hero section markup + inline styles (background, layout, text sizing) | Every template starts with a hero |
| **Buttons/CTAs** | Exact button HTML (classes, border-radius, padding, colors, hover states) | All CTA elements in templates |
| **Cards** | Card grid structure (grid-template-columns, gap, card border-radius, shadows) | Comparison, recommendation templates |
| **Navigation links** | Link styling (color, font-weight, text-decoration, hover effects) | In-template navigation |
| **Section layout** | Section padding, max-width, background alternation patterns | Every section wrapper |
| **Typography** | Heading hierarchy (h1-h4 actual sizes, weights, colors, margins) | All text elements |
| **Pricing/tables** | Table/pricing card structure if present | Budget intent templates |
| **Icon patterns** | How icons are used (inline SVG? img? size? spacing with text?) | Feature lists, cards |

**Output:** Build a mental "component palette" — the exact HTML+CSS snippets from the prototype that you will reuse verbatim in templates. When generating templates:
- Buttons must use the SAME markup pattern as the prototype (same classes, same structure)
- Cards must use the SAME grid and card structure
- Heroes must follow the SAME layout approach (flexbox/grid, alignment, spacing)
- Links must use the SAME styling (not generic blue underline if the site uses pill buttons)
- Section backgrounds must follow the SAME alternation pattern

**Example:** If the prototype has:
```html
<a href="#" class="btn-primary" style="background:#3b63fb; border-radius:25px; padding:12px 24px; color:#fff; font-weight:700;">Get Started</a>
```
Then EVERY CTA in EVERY template must use that exact pattern — not a generic `<button>` or an unstyled `<a>`.

### 1. Generate `styles/of1-base.css`

Create the shared base stylesheet with brand-specific tokens derived from `DESIGN.json`:

```css
/* Shared base for all of1-* templates */

:root {
  --of1-bg: {background from DESIGN.json};
  --of1-fg: {text color};
  --of1-muted: {muted text};
  --of1-accent: {primary/accent color};
  --of1-accent-hover: {darker accent};
  --of1-accent-fg: {text on accent};
  --of1-surface: {card surface};
  --of1-surface-cream: {secondary surface};
  --of1-surface-dark: {dark surface};
  --of1-border: {border color};
  --of1-radius: 16px;
  --of1-max-width: 1200px;
  --of1-font-display: {display font + fallbacks};
  --of1-font-body: {body font + fallbacks};
  --of1-font-mono: {mono font + fallbacks};
}
```

Then include standard utilities: box-sizing reset, `main` base styles, `.of1-section`, `.of1-inner`, `.of1-inner-narrow`, `.of1-eyebrow`, `.of1-hero` shell (min-height, flex center), `.of1-hero-grid` (two-column), `.of1-hero-title/subtitle/ctas/media`, `.of1-cta` button styles, empty media container collapse rule.

### 2. Generate 5 template variations per intent (25 total)

For each intent, generate 5 structurally distinct layouts.

**CRITICAL: Use the component palette from step 0b.** Every template MUST:
- Use the exact same button/CTA markup as the prototype (same classes, same inline styles)
- Use the same card grid structure (same grid gaps, border-radius, shadows)
- Use the same heading sizes and weights (don't invent new typography)
- Use the same section padding and max-width patterns
- Use the same link styling (if the site uses pill-shaped links, templates do too)
- Match the exact color usage patterns (when does the site use dark bg vs light bg?)

Templates should feel like they were designed by the same team that built the site — not like generic content slotted into brand colors.

**Naming:** `of1-{intent}-{variation}` (kebab-case)

For each template, produce ALL THREE files:

**A. `templates/{name}.html`** — Slot-based template body (just `<main>...</main>`)

**B. `templates/{name}.metadata.json`** — Slot contract for the worker:
```json
{
  "name": "{name}",
  "intent": "{intent}",
  "description": "{distinctive short description for LLM picker}",
  "minItems": N,
  "maxItems": M,
  "stylesheet": "/styles/{name}.css",
  "html": "/templates/{name}.html",
  "slots": [
    { "key": "hero.title", "type": "text", "instruction": "..." },
    ...
  ]
}
```

**C. `styles/{name}.css`** — Per-template styles:
```css
@import url("/styles/of1-base.css");
/* template-specific rules only — copy actual CSS values from the prototype,
   don't approximate. If the prototype hero has padding: 80px 0, use that exact value.
   If cards have box-shadow: 0 4px 12px rgba(0,0,0,0.08), use that exact shadow. */
```

**CSS rules MUST mirror the prototype's actual styling:**
- Copy exact padding values, border-radius, shadows from the prototype CSS
- Use the same hover effects (transform: translateY(-2px)? opacity change? color shift?)
- Match the exact font-size/line-height/letter-spacing for each heading level
- Use the same gradient directions and stops if gradients appear in the prototype

### 3. Generate sample data and previews

For each template, also produce:

**D. `templates/{name}.sample.json`** — Sample slot data for gallery preview:
```json
{
  "_meta": { "stylesheet": "/styles/{name}.css" },
  "hero.title": "Real brand-relevant headline",
  "hero.image": "https://real-image-url-from-site.com/...",
  ...
}
```

**⚠️ Sample data rules:**
- Use ASCII-safe text only (no accented characters like é, ñ — use plain equivalents)
- Use real image URLs from the site extraction
- Keep text realistic but simple

**E. `drafts/{name}-sample.html`** — Filled preview (generated by fill-template.py)

```bash
mkdir -p tools drafts
cp /workspace/skills/of1-template-generation/assets/fill-template.py tools/fill-template.py

for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  SAMPLE="templates/${NAME}.sample.json"
  if [ -f "$SAMPLE" ]; then
    python3 tools/fill-template.py "$TPL" "$SAMPLE" "drafts/${NAME}-sample.html"
  fi
done
```

**DO NOT use `node` or `fill-template.mjs`** — Node.js is a shim in SLICC and doesn't support ESM imports.

### 4. Generate the catalog (MUST be fully inlined)

Build `templates/templates-catalog.json` with ALL template data inlined. Use a Python script to read each `.metadata.json` and `.html` file and assemble the catalog:

```python
python3 << 'EOF'
import json, os, glob
from datetime import datetime

templates = []
by_intent = {}
template_dir = 'templates'

for meta_file in sorted(glob.glob(f'{template_dir}/of1-*.metadata.json')):
    with open(meta_file) as f:
        meta = json.load(f)
    name = meta['name']
    intent = meta['intent']
    
    # Read HTML content
    html_file = f'{template_dir}/{name}.html'
    with open(html_file) as f:
        html_content = f.read()
    
    # Build inlined entry (ALL fields required)
    entry = {
        "name": name,
        "intent": intent,
        "description": meta.get("description", ""),
        "minItems": meta.get("minItems", 1),
        "maxItems": meta.get("maxItems", 4),
        "stylesheet": meta.get("stylesheet", f"/styles/{name}.css"),
        "slots": meta.get("slots", []),
        "htmlContent": html_content
    }
    templates.append(entry)
    by_intent.setdefault(intent, []).append(name)

catalog = {
    "useRouting": True,
    "baseUrl": f"https://{os.environ.get('BRANCH', 'main')}--of1-demo--aem-growth-adoption.aem.page",
    "generatedAt": datetime.utcnow().isoformat(),
    "count": len(templates),
    "byIntent": by_intent,
    "templates": templates
}

with open('templates/templates-catalog.json', 'w') as f:
    json.dump(catalog, f, indent=2)

print(f"Wrote catalog with {len(templates)} fully inlined templates")
EOF
```

⚠️ **DO NOT generate a catalog with only name/description/minItems/maxItems** — the worker WILL crash (50-subrequest limit exceeded). Every entry MUST have `slots`, `htmlContent`, and `stylesheet` inlined.

### 5. Generate the routing config

```bash
mkdir -p of1/config
cat > of1/config/templates.json <<EOF
{
  "useRouting": true,
  "baseUrl": "https://${BRANCH}--${REPO}--${OWNER}.aem.page",
  "catalogPath": "/templates/templates-catalog.json"
}
EOF
```

### 6. Install gallery page

```bash
mkdir -p gallery
cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
```

### 7. Commit and push

```bash
cd "$REPO_DIR"
git add styles/of1-base.css styles/of1-*.css templates/*.html templates/*.json drafts/ tools/fill-template.py gallery/ of1/config/templates.json
git commit -m "feat: generate 25 OF1 templates (5 intents × 5 variations) for ${DOMAIN}"
git push origin ${BRANCH}
```

### 8. Validate output (MANDATORY — must pass before writing status)

Run this check inline. If ANY assertion fails, fix the missing artifacts and re-run — do NOT write the completion status.

```bash
cd "$REPO_DIR"

python3 << 'EOF'
import json, glob, sys
from pathlib import Path

errors = []

# 1. Exactly 25 of1-* templates
html_files = sorted(glob.glob('templates/of1-*.html'))
meta_files = sorted(glob.glob('templates/of1-*.metadata.json'))
css_files  = sorted(glob.glob('styles/of1-*.css'))
if len(html_files) < 25:
    errors.append(f"Only {len(html_files)} of1-*.html templates (need 25)")
if len(meta_files) < 25:
    errors.append(f"Only {len(meta_files)} of1-*.metadata.json files (need 25)")

# 2. Each html has matching metadata + css
for h in html_files:
    name = Path(h).stem
    if not Path(f'templates/{name}.metadata.json').exists():
        errors.append(f"{name}: missing .metadata.json")
    if not Path(f'styles/{name}.css').exists():
        errors.append(f"{name}: missing styles/{name}.css")

# 3. Catalog exists, has count==25, every entry has slots+htmlContent inlined
catalog_path = 'templates/templates-catalog.json'
if not Path(catalog_path).exists():
    errors.append("templates/templates-catalog.json is missing")
else:
    catalog = json.loads(Path(catalog_path).read_text())
    if catalog.get('count', 0) < 25:
        errors.append(f"Catalog count is {catalog.get('count')} (need 25)")
    for t in catalog.get('templates', []):
        if not t.get('slots'):
            errors.append(f"Catalog entry {t.get('name')}: missing slots[]")
        if not t.get('htmlContent'):
            errors.append(f"Catalog entry {t.get('name')}: missing htmlContent")

# 4. All 5 intents represented
intents_needed = {'comparison', 'recommendation', 'deep-dive', 'budget', 'discovery'}
intents_have = set()
for m in meta_files:
    intents_have.add(json.loads(Path(m).read_text()).get('intent'))
missing_intents = intents_needed - intents_have
if missing_intents:
    errors.append(f"Missing intents: {missing_intents}")

# 5. of1/config/templates.json (routing config) exists
if not Path('of1/config/templates.json').exists():
    errors.append("of1/config/templates.json (routing config) is missing")

if errors:
    print("VALIDATION FAILED:", file=sys.stderr)
    for e in errors:
        print(f"  ✗ {e}", file=sys.stderr)
    sys.exit(1)
print(f"✓ {len(html_files)} templates, all 5 intents, catalog inlined")
EOF
```

If this script exits non-zero, the step is **not complete**. Go back and generate the missing artifacts. Do not proceed to the next sub-step.

### 9. Verify gallery loads

```bash
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GALLERY_URL")
echo "Gallery: HTTP ${HTTP_CODE} — ${GALLERY_URL}"
```

## Design Guidelines

### Template structure (MANDATORY)

Every template MUST:
- **Start with a hero section** — always the first block (`<section class="of1-{name}-hero of1-hero">`)
- **Have at least 4-5 sections/blocks** — hero + 3-4 content sections minimum. Never just a hero + one section.

This ensures generated pages feel complete and substantial, not thin landing stubs.

### Template variety

Each intent's 5 variations must be **structurally distinct**:
- Different section counts (4 vs 5 vs 6 sections — never fewer than 4)
- Different layout patterns (grid vs stack vs split vs single-column)
- Different content density (headline-only vs rich detail)
- Different interaction metaphors (table vs cards vs timeline vs accordion)

### Description quality

The `description` field in metadata.json is what the LLM uses to select between templates for the same intent. Make them:
- Short (1 sentence max)
- Distinctive from siblings
- Focused on the structural/visual pattern, not the content

Good: "Side-by-side feature table for 2–4 options"
Bad: "A comparison template"

### Slot instruction quality

Slot instructions guide the LLM's content generation. Make them:
- Concise (≤10 words)
- Specific about constraints ("≤8 words", "1-sentence", "URL from matched product")
- Clear about the semantic role ("Primary CTA label + href", "Value proposition")

### CSS rules

- Every per-template CSS starts with `@import url("/styles/of1-base.css");`
- Use CSS custom properties from the base for all colors/fonts
- Template-specific classes use the full name prefix: `.of1-{name}-{element}`
- Also apply generic utility classes: `.of1-hero`, `.of1-section`, `.of1-cta`
- Keep CSS concise (30–80 lines per template)

### Sample data quality

- Use realistic content that matches the brand/domain
- Include real image URLs from the extraction step
- CTAs should have plausible labels
- Text length should be realistic

## Deliverables

- `of1/config/templates.json` — routing config
- `styles/of1-base.css` — shared design tokens
- 25 × `templates/of1-*.html` — slot-based templates
- 25 × `templates/of1-*.metadata.json` — slot contracts for the worker
- 25 × `styles/of1-*.css` — per-template stylesheets
- 25 × `templates/of1-*.sample.json` — sample data for gallery
- 25 × `drafts/of1-*-sample.html` — filled previews
- `templates/templates-catalog.json` — template index
- `gallery/index.html` — browsable review UI
- `tools/fill-template.py` — fill script

## Completion

**Only write the status file if Step 8 (Validate) passed.** Re-run the validator one more time inline before writing the JSON — this is the final guard against shipping a degraded gallery.

### ⚠️ The deliverable URL MUST be the gallery page — NOT the catalog JSON

The gallery is a human-browsable HTML page at `/gallery/index.html`. It fetches `/templates/templates-catalog.json` internally, but that JSON file is NOT the deliverable. Sending `/templates/templates-catalog.json` to the sprinkle opens a raw JSON blob in the user's browser — broken UX.

- ✅ Correct: `https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html`
- ❌ Wrong:   `https://${BRANCH}--${REPO}--${OWNER}.aem.page/templates/templates-catalog.json`

Trigger an EDS preview for `/gallery/index.html` after pushing so it returns 200 before sending the status.

```bash
mkdir -p /shared/of1-demo

# Final guard — count templates one more time
COUNT=$(ls templates/of1-*.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -lt 25 ]; then
  echo "ABORT: only ${COUNT} of1-* templates exist — do NOT mark step 7 done" >&2
  exit 1
fi

# Trigger preview so the gallery URL returns 200
DA_TOKEN=$(oauth-token adobe)
curl -s -o /dev/null -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/gallery/index"

GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"

# Sanity check the URL is the gallery page and not the catalog JSON
case "$GALLERY_URL" in
  *gallery/index.html) ;;
  *)
    echo "ABORT: deliverable URL must end with /gallery/index.html, got: ${GALLERY_URL}" >&2
    exit 1
    ;;
esac

echo "{\"step\":7,\"status\":\"review\",\"deliverable\":\"${GALLERY_URL}\",\"summary\":\"Generated ${COUNT} OF1 templates (5 intents × 5 variations). Browse the gallery to review layouts and sample content.\"}" > /shared/of1-demo/step-7-status.json
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
