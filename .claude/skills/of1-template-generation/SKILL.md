---
name: of1-template-generation
description: Generate 4 branded OF1 templates (1 intent × 2 layouts × 2 segments) using design tokens from the brand-governance-agent cascade.
user-invocable: false
---

# OF1 Template Generation

Generate a small, segment-aware template library for the OF1 worker. Each template is a slot-based HTML page that the worker fills with personalized content at runtime. Design tokens come from the brand-governance-agent design-token cascade — the same brand, queried under two segments, produces two visually distinct palettes for the same layout.

## Inputs

- Repo config from `/shared/of1-demo/repo-config.json`
- Brand-governance-agent credentials from environment:
  - `BGA_API_URL` — base URL of the brand-governance-agent (must point at the stage cluster; prod is rejected)
  - `BGA_IMS_ORG_ID` — IMS org id
  - `IMS_TOKEN` — IMS user token (may include `Bearer ` prefix; the script strips it)
- `DOMAIN` is read from `repo-config.json` and resolved against the cascade API via `GET /api/v1/brands/from-url`.

The skill **does not** read stardust output files or the discovery narrative. Those files may still exist (other steps write/read them); they are simply not consumed here.

## Worker Contract

The OF1 worker uses a template routing system. After `POST /api/tenants/<id>/sync`, the worker materializes templates from EDS into R2. The skill must produce these files:

### Required artifacts

| # | File | Purpose |
|---|------|---------|
| 1 | `of1/config/templates.json` | Routing config — tells the worker where to find templates |
| 2 | `templates/templates-catalog.json` | Index with `byIntent` mapping + template list |
| 3 | `templates/<name>.metadata.json` | Per-template slot contract (one per template) |
| 4 | `templates/<name>.html` | Slot-based HTML body |
| 5 | `styles/of1-base.css` | Shared utility classes (no colors/fonts — those live per-template) |
| 6 | `styles/<name>.css` | Per-template stylesheet — declares `:root` tokens, imports the base, adds layout rules |

### File details

**1. `of1/config/templates.json`** — Routing config:
```json
{
  "useRouting": true,
  "baseUrl": "https://${BRANCH}--${REPO}--${OWNER}.aem.page",
  "catalogPath": "/templates/templates-catalog.json"
}
```

**2. `templates/templates-catalog.json`** — Catalog:
```json
{
  "generatedAt": "2026-05-28T...",
  "count": 4,
  "byIntent": {
    "comparison": [
      "of1-comparison-table-global",
      "of1-comparison-table-fr-under25",
      "of1-comparison-versus-global",
      "of1-comparison-versus-fr-under25"
    ]
  },
  "templates": [
    {
      "name": "of1-comparison-table-global",
      "description": "Side-by-side comparison table — global palette.",
      "minItems": 2,
      "maxItems": 4
    }
  ]
}
```

The `description` field is critical — the LLM uses it to pick between variants for the same intent. Each description MUST disambiguate both the layout (`table` vs `versus`) and the segment (`global palette` vs `French youth palette`).

**3. `templates/<name>.metadata.json`** — Per-template metadata with slot contract:
```json
{
  "name": "of1-comparison-table-global",
  "intent": "comparison",
  "description": "Side-by-side comparison table — global palette.",
  "minItems": 2,
  "maxItems": 4,
  "stylesheet": "/styles/of1-comparison-table-global.css",
  "html": "/templates/of1-comparison-table-global.html",
  "slots": [
    { "key": "hero.eyebrow", "type": "text", "instruction": "Short kicker, ≤4 words" },
    { "key": "hero.title", "type": "text", "instruction": "Headline, ≤8 words" },
    { "key": "hero.subtitle", "type": "text", "instruction": "1-sentence framing" },
    { "key": "hero.cta-primary", "type": "link", "instruction": "Primary CTA label + href" },
    { "key": "hero.image", "type": "image", "instruction": "Hero image URL" },
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

**4. `templates/<name>.html`** — Template HTML body (just `<main>...</main>`, no DOCTYPE):
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

**5. `styles/of1-base.css`** — Shared utilities, **no token declarations**:
```css
/* Shared utilities for all of1-* templates.
   Tokens (--of1-accent, --of1-font-display, etc.) are declared by each
   per-template stylesheet so the same layout can render under different
   brand-governance segments without rebuilding the base. */

* { box-sizing: border-box; }
main { font-family: var(--of1-font-body); color: var(--of1-fg); background: var(--of1-bg); }
.of1-section { padding: 64px 0; }
.of1-inner { max-width: var(--of1-max-width, 1200px); margin: 0 auto; padding: 0 24px; }
.of1-inner-narrow { max-width: 800px; margin: 0 auto; padding: 0 24px; }
.of1-eyebrow { font-family: var(--of1-font-mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--of1-muted); font-size: 12px; }
.of1-hero { min-height: 480px; display: flex; align-items: center; padding: 80px 0; }
.of1-hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.of1-hero-media img:not([src]), .of1-hero-media img[src=""] { display: none; }
.of1-hero-ctas { display: flex; gap: 12px; margin-top: 24px; }
.of1-cta { display: inline-block; padding: 12px 24px; border-radius: var(--of1-radius, 12px); text-decoration: none; font-weight: 600; transition: background .15s; }
.of1-cta-primary { background: var(--of1-accent); color: var(--of1-accent-fg); }
.of1-cta-primary:hover { background: var(--of1-accent-hover); }
```

**6. `styles/<name>.css`** — Per-template stylesheet. Starts with the base import, then declares **all** `--of1-*` tokens used by the base + the layout-specific rules:
```css
@import url("/styles/of1-base.css");

:root {
  --of1-bg: #F4E9DC;
  --of1-fg: #2C2C2C;
  --of1-muted: #58181D;
  --of1-accent: #A33532;
  --of1-accent-hover: #58181D;
  --of1-accent-fg: #FFFFFF;
  --of1-font-display: "Baskerville URV", "Times New Roman", serif;
  --of1-font-body: "Roboto Medium", system-ui, sans-serif;
  --of1-font-mono: "Roboto Mono", ui-monospace, monospace;
  --of1-radius: 12px;
  --of1-max-width: 1200px;
}

/* layout-specific rules below */
.of1-comparison-table-global-grid { /* ... */ }
```

## Layout × Segment matrix

This skill generates exactly **4 templates** = 1 intent × 2 layouts × 2 segments:

| Intent | Layout | Segment | Template name |
|---|---|---|---|
| comparison | table | global | `of1-comparison-table-global` |
| comparison | table | fr-under25 | `of1-comparison-table-fr-under25` |
| comparison | versus | global | `of1-comparison-versus-global` |
| comparison | versus | fr-under25 | `of1-comparison-versus-fr-under25` |

**Layout differences:**
- `table` — Hero + N-column feature table (rows = attributes, columns = options). 5–6 sections including the table.
- `versus` — Hero + two-column side-by-side "A vs B" with verdict band. 4–5 sections.

The two layouts MUST be structurally distinct (different section counts, different visual rhythm), not just restyled.

**Segment differences:**
- `global` — uses tokens fetched with `segment={}`. Frescopa baseline: brick_red, icon_gold, maroon_wordmark + secondaries.
- `fr-under25` — uses tokens fetched with `segment={"country":"FR","audience":"under-25"}`. Adds `color.brand.primary`, `color.accent` overrides over the baseline.

The HTML is identical between segments for the same layout; only the per-template CSS (specifically the `:root` block) differs.

### SLICC Environment Note:
- **Node.js is a SHIM** — do NOT use `node` or `npm` or `.mjs` files
- Use `python3 tools/fill-template.py` for generating filled previews
- Use ASCII-safe text in sample data (no accented characters like é — use plain 'e')

---

## Process

### 0. Read repo config and validate environment

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

for v in BGA_API_URL BGA_IMS_ORG_ID IMS_TOKEN; do
  if [ -z "${!v:-}" ]; then
    echo "FATAL: $v is not set" >&2
    exit 1
  fi
done

cd "$REPO_DIR"
```

### 1. Fetch design tokens

Call the helper script. It resolves the brand from the domain and writes 5 files to `/shared/of1-demo/`:

```bash
mkdir -p /shared/of1-demo
/workspace/skills/of1-template-generation/assets/fetch-brand-tokens.sh \
  "$DOMAIN" /shared/of1-demo
```

After it succeeds you have:
- `/shared/of1-demo/brand-info.json`
- `/shared/of1-demo/design-tokens-global.md`
- `/shared/of1-demo/design-tokens-global.json`
- `/shared/of1-demo/design-tokens-fr-under25.md`
- `/shared/of1-demo/design-tokens-fr-under25.json`

If the script exits non-zero, **stop** and report the failure. Do not fall back to stardust or invented tokens.

### 2. Clear stale templates from a previous run

Remove stale templates from a previous run so the gallery doesn't show leftovers:

```bash
cd "$REPO_DIR"
# Remove tracked old templates (git rm only touches files known to git).
git rm -f --ignore-unmatch templates/of1-*.html templates/of1-*.metadata.json templates/of1-*.sample.json
git rm -f --ignore-unmatch styles/of1-*.css
git rm -f --ignore-unmatch drafts/of1-*-sample.html
# Also remove any untracked leftovers from a crashed previous run.
rm -f templates/of1-*.html templates/of1-*.metadata.json templates/of1-*.sample.json
rm -f styles/of1-*.css
rm -f drafts/of1-*-sample.html
# Re-create empty directories
mkdir -p templates styles drafts tools gallery of1/config
```

### 3. Generate `styles/of1-base.css` (utilities only)

Write the file shown in the Worker Contract section above. It MUST NOT declare any token values — only utility classes that reference `var(--of1-*)`.

### 4. Generate 4 templates (1 intent × 2 layouts × 2 segments)

For each of the 4 (layout, segment) combinations, produce 4 files:

- `templates/of1-comparison-{layout}-{segment-slug}.html`
- `templates/of1-comparison-{layout}-{segment-slug}.metadata.json`
- `templates/of1-comparison-{layout}-{segment-slug}.sample.json`
- `styles/of1-comparison-{layout}-{segment-slug}.css`

The HTML is the same for `(layout, global)` and `(layout, fr-under25)` — only the CSS differs.

**For each template:**

**A. `<name>.html`** — Layout-driven structure (table vs versus). Must follow the worker contract HTML conventions above. Must have at least 4–5 sections including a hero. NO `<!DOCTYPE>`, NO `<html>` — just `<main>...</main>`.

**B. `<name>.metadata.json`** — Slot contract pointing at the right stylesheet:
```json
{
  "name": "of1-comparison-table-global",
  "intent": "comparison",
  "description": "Side-by-side comparison table — global palette.",
  "minItems": 2,
  "maxItems": 4,
  "stylesheet": "/styles/of1-comparison-table-global.css",
  "html": "/templates/of1-comparison-table-global.html",
  "slots": [...]
}
```

Each description MUST be a single sentence that disambiguates layout AND segment. Suggested forms:
- "Side-by-side comparison table — global palette."
- "Side-by-side comparison table — French youth palette."
- "Two-option versus layout with verdict — global palette."
- "Two-option versus layout with verdict — French youth palette."

**C. `<name>.css`** — Per-template stylesheet. Compose it from the appropriate `design-tokens-<segment-slug>.json`.

Iterate over both segments (the same layout HTML feeds both):

```bash
for SEGMENT_SLUG in global fr-under25; do
  SEGMENT_JSON=/shared/of1-demo/design-tokens-${SEGMENT_SLUG}.json

  # Extract using the named paths from the mapping convention below. Each jq
  # expression returns "" if the token is missing; the CSS generator must
  # substitute the documented fallback.
  BG=$(jq -r '.color.secondary.cream."$value".hex // empty'           "$SEGMENT_JSON")
  FG=$(jq -r '.color.secondary.charcoal."$value".hex // empty'        "$SEGMENT_JSON")
  MUTED=$(jq -r '.color.brand.maroon_wordmark."$value".hex // empty'  "$SEGMENT_JSON")
  # Accent prefers color.brand.primary (present in fr-under25), falls back to
  # color.brand.brick_red (always present at baseline).
  ACCENT=$(jq -r '.color.brand.primary."$value".hex // .color.brand.brick_red."$value".hex // empty' "$SEGMENT_JSON")
  ACCENT_HOVER=$(jq -r '.color.brand.maroon_wordmark."$value".hex // empty' "$SEGMENT_JSON")
  HEADING_FAMILY=$(jq -r '.typography.heading.h1."$value".fontFamily // "serif"'         "$SEGMENT_JSON")
  BODY_FAMILY=$(jq -r '.typography.body.default."$value".fontFamily // "system-ui"'      "$SEGMENT_JSON")

  # Use these values when writing styles/of1-comparison-<layout>-${SEGMENT_SLUG}.css
  # (see :root requirements and mapping convention below). Substitute documented
  # fallbacks if any extracted value is empty.
done
```

The CSS MUST:
- Start with `@import url("/styles/of1-base.css");`
- Declare every `--of1-*` token referenced by the base utilities (`--of1-bg`, `--of1-fg`, `--of1-muted`, `--of1-accent`, `--of1-accent-hover`, `--of1-accent-fg`, `--of1-font-display`, `--of1-font-body`, `--of1-font-mono`, `--of1-radius`, `--of1-max-width`) in a `:root` block.
- Use real hex values pulled from the segment's JSON — no placeholders, no `var(--something-else)` indirection inside the `:root` block.
- Add layout-specific rules using `.of1-{name}-*` class prefixes for everything that varies per layout.

**Color mapping convention (frescopa-flavored, generalize as needed):**
- `--of1-bg` ← `color.secondary.cream` if present, else lightest hex from `color.secondary.*`, else `#F7F7F7`
- `--of1-fg` ← `color.secondary.charcoal` if present, else darkest hex, else `#1D1D1D`
- `--of1-muted` ← `color.brand.maroon_wordmark` if present, else second-darkest, else `#5E6670`
- `--of1-accent` ← `color.brand.primary` if present (fr-under25 has this; global doesn't), else `color.brand.brick_red`, else first hex from `color.brand.*`
- `--of1-accent-hover` ← `color.brand.maroon_wordmark` if present, else darker shade
- `--of1-accent-fg` ← `#FFFFFF`
- `--of1-font-display` ← `typography.heading.h1.$value.fontFamily` + serif/sans fallbacks
- `--of1-font-body` ← `typography.body.default.$value.fontFamily` + system-ui fallback
- `--of1-font-mono` ← `ui-monospace, monospace` (no mono in the cascade today)

**D. `<name>.sample.json`** — Sample slot data:
```json
{
  "_meta": { "stylesheet": "/styles/of1-comparison-table-global.css" },
  "hero.title": "Find your daily ritual",
  "hero.subtitle": "Compare two single-origin roasts at a glance.",
  "hero.cta-primary": { "label": "Shop both", "href": "https://frescopa.coffee/shop" },
  "item-1.title": "Aurora Blend",
  ...
}
```

**Sample data rules:**
- Use ASCII-safe text only (no accented characters like é, ñ — use plain equivalents)
- Use real image URLs from the brand or `https://placehold.co/600x400` as fallback
- Keep text realistic but simple

### 5. Generate filled previews

```bash
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

### 6. Generate the catalog

```bash
cat > templates/templates-catalog.json <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "count": 4,
  "byIntent": {
    "comparison": [
      "of1-comparison-table-global",
      "of1-comparison-table-fr-under25",
      "of1-comparison-versus-global",
      "of1-comparison-versus-fr-under25"
    ]
  },
  "templates": [
    { "name": "of1-comparison-table-global",      "description": "Side-by-side comparison table — global palette.",        "minItems": 2, "maxItems": 4 },
    { "name": "of1-comparison-table-fr-under25",  "description": "Side-by-side comparison table — French youth palette.",  "minItems": 2, "maxItems": 4 },
    { "name": "of1-comparison-versus-global",     "description": "Two-option versus layout with verdict — global palette.","minItems": 2, "maxItems": 2 },
    { "name": "of1-comparison-versus-fr-under25", "description": "Two-option versus layout with verdict — French youth palette.","minItems": 2, "maxItems": 2 }
  ]
}
EOF
```

### 7. Generate the routing config

```bash
cat > of1/config/templates.json <<EOF
{
  "useRouting": true,
  "baseUrl": "https://${BRANCH}--${REPO}--${OWNER}.aem.page",
  "catalogPath": "/templates/templates-catalog.json"
}
EOF
```

### 8. Install gallery page

```bash
cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
```

### 9. Commit and push

```bash
cd "$REPO_DIR"
git add styles/of1-base.css styles/of1-*.css templates/ drafts/ tools/ gallery/ of1/config/templates.json
git commit -m "feat: generate 4 OF1 comparison templates (2 segments) for ${DOMAIN}"
git push origin ${BRANCH}
```

### 10. Verify gallery loads

```bash
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GALLERY_URL")
echo "Gallery: HTTP ${HTTP_CODE} — ${GALLERY_URL}"
```

## Design Guidelines

### Template structure (MANDATORY)

Every template MUST:
- **Start with a hero section** — always the first block (`<section class="of1-{name}-hero of1-hero">`)
- **Have at least 4–5 sections/blocks** — hero + 3-4 content sections minimum.

### Layout variety

The two layouts (`table` vs `versus`) must be **structurally distinct**:
- Different section counts (5–6 vs 4–5)
- Different layout patterns (table grid vs side-by-side split)
- Different content density

### Description quality

Catalog descriptions are 1 sentence, MUST mention both layout and segment, and MUST be distinct across all four templates.

### CSS rules

- Every per-template CSS starts with `@import url("/styles/of1-base.css");`
- Every per-template CSS declares the full set of `--of1-*` tokens in its own `:root`
- Use real hex values from the segment's JSON — no placeholders
- Template-specific classes use the full name prefix: `.of1-{name}-{element}`
- Keep CSS concise (60–120 lines per template)

### Sample data quality

- Use realistic content that matches the brand/domain
- Include real image URLs where possible
- CTAs should have plausible labels
- Text length should be realistic

## Deliverables

- `of1/config/templates.json` — routing config
- `styles/of1-base.css` — shared utilities (no tokens)
- 4 × `templates/of1-comparison-*.html`
- 4 × `templates/of1-comparison-*.metadata.json`
- 4 × `styles/of1-comparison-*.css` (each with its own `:root` block)
- 4 × `templates/of1-comparison-*.sample.json`
- 4 × `drafts/of1-comparison-*-sample.html`
- `templates/templates-catalog.json` — template index
- `gallery/index.html` — browsable review UI
- `tools/fill-template.py` — fill script
- `/shared/of1-demo/design-tokens-{global,fr-under25}.{md,json}` and `brand-info.json` — cached cascade responses (not committed to the demo repo)

## Completion

```bash
mkdir -p /shared/of1-demo
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
echo "{\"step\":7,\"status\":\"review\",\"deliverable\":\"${GALLERY_URL}\",\"summary\":\"Generated 4 templates (1 intent × 2 layouts × 2 brand-governance segments). Browse the gallery to compare the same layout under different segment palettes.\"}" > /shared/of1-demo/step-7-status.json
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
