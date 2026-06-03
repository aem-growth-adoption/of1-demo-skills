---
name: of1-template-generation
description: Generate 25 branded OF1 templates (5 intents × 5 variations) for the OF1 worker — slot-based HTML pages it fills with personalized content at runtime, plus a shared design-token stylesheet, an inlined catalog, and a review gallery.
user-invocable: false
---

# OF1 Template Generation

Produce the template library for the OF1 worker: 25 slot-based HTML templates (5 intents × 5 variations), one shared design-token stylesheet, a fully-inlined catalog the worker reads at runtime, and a browseable gallery for review.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives status JSON |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/{assemble-catalog.py, fill-template.py, gallery.html}`) |

Read repo config once at the top:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
```

## Modes

Selected by `OF1_TG_MODE`. The orchestrator runs the three phases in order: `base` → `intent × 5` (parallel) → `assemble`.

| Mode | What it does | Dispatched by |
|---|---|---|
| `base` | Generate `styles/of1-template-base.css` from the prototype CSS + `DESIGN.json`. Must finish before any `intent` agent starts — intent agents read the base CSS to see the exact token surface they can reference. | Orchestrator FIRST (sequential, 1 agent) |
| `intent` | Generate 5 variations for ONE intent (`$OF1_TG_INTENT`). Reads the base CSS (already on disk), writes only `templates/of1-{intent}-*` and `styles/of1-{intent}-*`. Does NOT commit. | Orchestrator fan-out (5 agents in parallel) after `base` |
| `assemble` | Run ONCE after all 5 intent agents finish. Verifies base CSS exists, assembles the catalog, runs `fill-template.py`, installs gallery, single commit + push. | Orchestrator after all intents return |
| `all` (default) | Legacy fallback — runs `base` → 5 intents serially → assemble, inline in one agent. ~5× slower than the fan-out. | Single agent when orchestrator can't fan out |

**Race-safety:** intent agents write disjoint files (`of1-{intent}-*` prefixes don't collide). `styles/of1-template-base.css` is owned by the `base` agent; intent agents only read it. The catalog, gallery, and git are owned by `assemble`.

## Inputs

Available before invocation, in addition to the env above:

- Design tokens → `$OF1_DEMO_REPO/stardust/current/DESIGN.json` (from step 4)
- Demo narrative → `$OF1_STATE_DIR/step-3-output.md` (from step 3)
- Slot-marked overlay templates → `$OF1_DEMO_REPO/templates/prototype-*.html` (from step 6 / snowflake) — real examples of the `<section>` + `data-slot` pattern your 25 templates will follow
- Prototype CSS → `$OF1_DEMO_REPO/styles/prototype-*.css` (from step 6 / snowflake) — extracted styling rules (padding, radius, hover states, exact values)
- EDS-rendered screenshots → `$OF1_DEMO_REPO/deliverables/eds-prototype-*.png` (captured by orchestrator before fan-out)

Worker-side schemas: `of1-demo/knowledge/worker-config-schemas.md` § `templates.json`, § `products.json`.

## Reference — Worker Contract

The OF1 worker materializes templates from EDS into R2 after `POST /api/tenants/<id>/sync`. The skill must produce all of:

| # | File | Purpose | Mode |
|---|---|---|---|
| 1 | `of1/config/templates.json` | Routing config | `assemble` |
| 2 | `templates/templates-catalog.json` | Catalog with fully-inlined templates | `assemble` |
| 3 | `templates/<name>.html` | Slot-based HTML body | `intent` |
| 4 | `templates/<name>.metadata.json` | Per-template slot contract | `intent` |
| 5 | `templates/<name>.sample.json` | Sample slot data for gallery preview | `intent` |
| 6 | `styles/of1-template-base.css` | Shared design tokens + thin reset | `base` |
| 7 | `styles/<name>.css` | Per-template stylesheet (imports the base) | `intent` |
| 8 | `drafts/<name>-sample.html` | Filled preview (via `fill-template.py`) | `assemble` |
| 9 | `gallery/index.html` | Browsable review UI | `assemble` |

### Slot types (worker's `render-template.js`)

- `text` — sets innerHTML on `[data-slot]`
- `image` — sets `src`/`alt` on `<img data-slot>`; empty images get stripped
- `link` — sets `href`/`label` on `<a data-slot>`; value is `{ label, href }`
- `list` — replaces innerHTML of `[data-slot-list]` with `<li>` per item; value is `string[]`

### Slot key conventions

- Pattern: `<scope>.<field>` (e.g. `hero.title`, `cta.label`, `item-3.title`)
- Repeated items use `item-1` … `item-9` — the renderer auto-hides cards whose title AND body are empty

### HTML authoring rules

- `data-slot="key"` on non-img non-a element → text slot
- `<a data-slot="key">` → link slot
- `<img data-slot="key">` → image slot
- `data-slot-list="key"` → list slot
- Item cards MUST be `<article data-card="N">` for auto-hide
- `<div data-grid-items>` gets `data-item-count="N"` injected at render
- NO `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` — just `<main>…</main>`

### `metadata.json` shape

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
    { "key": "hero.title",   "type": "text",  "instruction": "Headline, ≤8 words" },
    { "key": "item-1.title", "type": "text",  "instruction": "Product name" },
    { "key": "item-1.image", "type": "image", "instruction": "Product image URL" },
    { "key": "item-1.cta",   "type": "link",  "instruction": "Link to product page" }
  ]
}
```

`description` is what the LLM uses to pick between variants of the same intent — keep it short and structurally distinctive (e.g. *"Side-by-side feature table for 2–4 options"*, not *"A comparison template"*).

`slot.instruction` is passed to the LLM as content-generation guidance — concise (e.g. *"Headline, ≤8 words"*, *"1-sentence value proposition"*).

### Catalog requirement — fully inline

⚠️ Every entry in `templates-catalog.json`'s `templates[]` array MUST include `slots`, `htmlContent`, and `stylesheet` inlined. `assemble-catalog.py` handles this — do not hand-author the catalog.

### Per-template structure (mandatory)

- Start with a hero section — always `<section class="of1-{name}-hero of1-hero">` first
- At least 4–5 sections total — hero + 3-4 content sections minimum; never just hero + one section
- Per-template CSS `@import url("/styles/of1-template-base.css")` for shared tokens

## Reference — The 5 Intents

| Intent | Purpose | Example queries |
|---|---|---|
| `comparison` | Compare options side by side | "X vs Y", "which is better", "differences between" |
| `recommendation` | Personalized pick or ranked list | "best for me", "what should I choose", "top picks" |
| `deep-dive` | In-depth explanation | "how does X work", "tell me about", "explain" |
| `budget` | Pricing, ROI, cost orientation | "how much", "pricing", "cost calculator", "ROI" |
| `discovery` | Browse, explore, get inspired | "show me", "categories", "ideas" |

`discovery` is the fallback when intent classification is uncertain.

## Reference — Component palette (extract from prototypes)

Templates render INSIDE the EDS preview — they live within the full stylesheet stack (snowflake substrate + OF1 chrome + EDS base). Inferring style only from one prototype produces templates that look subtly wrong when EDS renders them.

**Read every prototype, not just home.** Each contributes different patterns; combine the slot-marked overlay templates (`templates/prototype-*.html`), the extracted CSS (`styles/prototype-*.css`), and the EDS-rendered screenshots (`deliverables/eds-prototype-*.png`):

- `prototype-home` — hero treatment, section rhythm, full-bleed banners
- Listing pages (e.g. `prototype-adventures`, `prototype-products`) — card grids, filter chips, multi-column hover states
- Detail pages (e.g. `prototype-bali-surf-camp`, `prototype-product-detail`) — structured fact lists, tabbed content, two-column splits, pricing modules

Extract and reuse VERBATIM:

| Component | Best source | Use in |
|---|---|---|
| Hero (markup + inline styles, background, layout, text sizing) | Home | Every template's first section |
| Buttons / CTAs (classes, radius, padding, colors, hover) | All | All CTA elements |
| Card grids (grid-template, gap, card radius, shadows) | Listing | comparison, recommendation, discovery |
| Section layout (padding, max-width, background alternation) | Home + listing | Every section wrapper |
| Typography (h1–h4 sizes, weights, margins) | All | All text elements |
| Pricing / tables | Detail | budget intent |
| Fact lists / spec rows | Detail | deep-dive, comparison |
| Tabs / accordions | Detail | deep-dive |

The EDS-rendered screenshots at `deliverables/eds-prototype-*.png` are the **visual ground truth** — inspect them; the prototype CSS explains *why* the rendered versions look the way they do, and the slot-marked templates show how that visual structure maps to `data-slot` markers.

## Process — Mode: `base`

Generate `styles/of1-template-base.css` from the prototype CSS + `DESIGN.json`. This must finish before any `intent` agent starts — every per-template CSS file `@imports` this, and the intent agents read it to know the exact token surface they can reference. Get the brand tokens wrong here and every generated page inherits the bug.

Write the file directly; **don't run a script**.

**Sources of truth, priority order:**

1. Prototype CSS — `$OF1_DEMO_REPO/styles/prototype-*.css` (search `:root { … }` + custom-property declarations). Snowflake extracted these from the prototype HTML, so they're the canonical token source.
2. `DESIGN.json` — `$OF1_DEMO_REPO/stardust/current/DESIGN.json`. Tiebreaker / fill-in for tokens not in the prototypes. Schema drifts between extraction runs; tolerate variation.

Don't trust `DESIGN.json` as the sole source — the prototypes are the visually-validated ground truth.

**Required tokens** — define at minimum these custom properties on `:root`, using prototype values verbatim:

```css
:root {
  /* Colors */
  --color-bg: ...;
  --color-fg: ...;
  --color-fg-dim: ...;
  --color-accent: ...;       /* brand accent — must match prototype buttons/links */
  --color-surface: ...;
  --color-border: ...;

  /* Typography */
  --font-display: ...;       /* heading family */
  --font-body: ...;
  --weight-display: ...;
  --weight-body: ...;

  /* Scale */
  --size-h1: ...;
  --size-h2: ...;
  --size-h3: ...;
  --size-body: ...;
  --line-tight: ...;
  --line-relaxed: ...;

  /* Spacing & shape */
  --space-section: ...;      /* vertical rhythm between sections */
  --space-container: ...;    /* horizontal container padding */
  --radius: ...;             /* card / button radius — often 0 for editorial brands */
  --shadow-card: ...;        /* `none` if prototype has no shadows */
}
```

Then add a thin reset on top (box-sizing, body/h1–h6/p margin reset, body font + color from tokens). NO component styles or utility classes — those belong in per-template CSS.

**Verify before declaring done:**

```bash
for var in --color-bg --color-fg --color-accent --font-display --font-body --size-h1 --radius; do
  grep -q "${var}:" styles/of1-template-base.css || { echo "FAIL: missing $var" >&2; exit 1; }
done

# Accent must match prototype — spot check
grep -A1 ":root" styles/of1-template-base.css | grep accent
grep -A1 ":root" styles/prototype-*.css       | grep -i accent | head -3
# If these disagree, fix of1-template-base.css before continuing.
```

Status file (SLICC sprinkle IPC; CC ignores):

```bash
echo "{\"step\":7,\"substep\":\"base\",\"status\":\"done\",\"summary\":\"Generated styles/of1-template-base.css with brand tokens.\"}" \
  > "$OF1_STATE_DIR/step-7-base-status.json"
```

## Process — Mode: `intent`

Generate the 5 variations for one intent. Precondition: `$OF1_TG_INTENT` ∈ {`comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`}.

```bash
INTENT="${OF1_TG_INTENT:?OF1_TG_INTENT required in intent mode}"
case "$INTENT" in
  comparison|recommendation|deep-dive|budget|discovery) ;;
  *) echo "OF1_TG_INTENT must be one of: comparison recommendation deep-dive budget discovery" >&2; exit 2;;
esac
```

### Writes (only these — disjoint from other intents)

- `templates/of1-${INTENT}-{variation}.html` × 5
- `templates/of1-${INTENT}-{variation}.metadata.json` × 5
- `templates/of1-${INTENT}-{variation}.sample.json` × 5
- `styles/of1-${INTENT}-{variation}.css` × 5

### Does NOT touch

- `styles/of1-template-base.css` (owned by `assemble`)
- `templates/templates-catalog.json`, `of1/config/templates.json` (owned by `assemble`)
- `gallery/`, `drafts/`, `tools/` (owned by `assemble`)
- Any git operations

### Generate 5 structurally distinct variations

The 5 variations must differ in:
- Section count (4 vs 5 vs 6 — never fewer than 4)
- Layout pattern (grid vs stack vs split vs single-column)
- Content density (headline-only vs rich detail)
- Interaction metaphor (table vs cards vs timeline vs accordion)

Suggested variation slugs (use others if more distinctive for the site):

| Intent | Slugs |
|---|---|
| `comparison` | `table`, `versus`, `pros-cons`, `decision-tree`, `matrix` |
| `recommendation` | `hero-pick`, `ranked-list`, `personal-fit`, `curated-bundle`, `spotlight-pair` |
| `deep-dive` | `longform`, `anatomy`, `timeline`, `faq-explainer`, `feature-explorer` |
| `budget` | `price-tiers`, `cost-breakdown`, `by-tier`, `value-comparison`, `roi-story` |
| `discovery` | `gallery`, `by-category`, `curated-collections`, `magazine-mix`, `map-strip` |

### Per-variation files

For each of the 5 variations, write all 4 files.

**`templates/of1-${INTENT}-{variation}.html`** — slot-based body (just `<main>…</main>`, per HTML rules above). Example shape:

```html
<main>
<section class="of1-{name}-hero of1-hero">
  <div class="of1-{name}-hero-grid of1-hero-grid">
    <div>
      <p class="of1-eyebrow" data-slot="hero.eyebrow">Eyebrow</p>
      <h1 data-slot="hero.title">Title</h1>
      <p data-slot="hero.subtitle">Subtitle</p>
      <a class="of1-cta of1-cta-primary" data-slot="hero.cta-primary" href="#">CTA</a>
    </div>
    <div class="of1-hero-media"><img data-slot="hero.image" src="" alt=""></div>
  </div>
</section>
<section class="of1-{name}-grid of1-section">
  <div class="of1-cmp-grid" data-grid-items>
    <article data-card="1">
      <img data-slot="item-1.image" src="" alt="">
      <h3 data-slot="item-1.title">Item</h3>
      <p data-slot="item-1.body">Description</p>
      <a data-slot="item-1.cta" href="#">Learn more</a>
    </article>
    <!-- repeat up to maxItems -->
  </div>
</section>
</main>
```

**`templates/of1-${INTENT}-{variation}.metadata.json`** — slot contract per `metadata.json` shape above.

**`styles/of1-${INTENT}-{variation}.css`** — per-template styles. MUST `@import` the base; rest is template-specific:

```css
@import url("/styles/of1-template-base.css");
/* template-specific rules — copy actual CSS values from the prototype,
   don't approximate. Match padding, radius, shadows, hover states. */
```

**`templates/of1-${INTENT}-{variation}.sample.json`** — sample slot data for gallery preview:

```json
{
  "_meta": { "stylesheet": "/styles/of1-{intent}-{variation}.css" },
  "hero.title": "Real brand-relevant headline",
  "hero.image": "https://real-image-url-from-site.com/...",
  ...
}
```

Sample data rules: ASCII-safe text only (no `é` etc.); real image URLs from the site's extraction; realistic but simple text.

### Validate JSON before declaring done

A single bad escape inside a JSON string corrupts the catalog without tripping the `assemble`-mode file-count checks. Validate every file you wrote:

```bash
for f in templates/of1-${INTENT}-*.metadata.json templates/of1-${INTENT}-*.sample.json; do
  python3 -c "import json; json.load(open('$f'))" || { echo "INVALID JSON: $f" >&2; exit 1; }
done
```

### Completion (intent mode)

End with a one-line summary listing the 5 file basenames. Status file (SLICC sprinkle IPC; CC ignores):

```bash
echo "{\"step\":7,\"substep\":\"intent-${INTENT}\",\"status\":\"done\",\"summary\":\"Generated 5 ${INTENT} variations.\"}" \
  > "$OF1_STATE_DIR/step-7-intent-${INTENT}-status.json"
```

## Process — Mode: `assemble`

Precondition: all 5 intent agents have completed; verify 25 of each artifact exist:

```bash
COUNT_HTML=$(ls templates/of1-*.html 2>/dev/null | wc -l)
COUNT_META=$(ls templates/of1-*.metadata.json 2>/dev/null | wc -l)
COUNT_CSS=$(ls styles/of1-*.css 2>/dev/null | grep -v 'of1-template-base.css' | wc -l)
[ "$COUNT_HTML" -ge 25 ] && [ "$COUNT_META" -ge 25 ] && [ "$COUNT_CSS" -ge 25 ] \
  || { echo "FAIL: expected 25 of each (html=$COUNT_HTML meta=$COUNT_META css=$COUNT_CSS)" >&2; exit 1; }
```

### 1. Verify the base CSS is in place

`styles/of1-template-base.css` is written by the `base` agent dispatched before the intent fan-out. Fail fast if it's missing:

```bash
[ -f styles/of1-template-base.css ] || {
  echo "FAIL: styles/of1-template-base.css missing — was the 'base' agent dispatched first?" >&2
  exit 1
}
```

### 2. Assemble the catalog (fully inlined)

```bash
python3 "$SKILL_DIR/assets/assemble-catalog.py" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```

Produces `templates/templates-catalog.json` + `of1/config/templates.json`. Fails fast if any of the 25 templates is missing HTML; warns if any intent is missing from the catalog.

### 3. Install fill-template + generate previews

```bash
mkdir -p tools drafts
cp "$SKILL_DIR/assets/fill-template.py" tools/fill-template.py

for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  SAMPLE="templates/${NAME}.sample.json"
  [ -f "$SAMPLE" ] && python3 tools/fill-template.py "$TPL" "$SAMPLE" "drafts/${NAME}-sample.html"
done
```

### 4. Install gallery

```bash
mkdir -p gallery
cp "$SKILL_DIR/assets/gallery.html" gallery/index.html
```

### 5. Single commit + push

```bash
cd "$OF1_DEMO_REPO"
git add styles/of1-template-base.css styles/of1-*.css \
        templates/of1-*.html templates/of1-*.metadata.json templates/of1-*.sample.json \
        templates/templates-catalog.json \
        of1/config/templates.json \
        drafts/of1-*-sample.html \
        tools/fill-template.py \
        gallery/index.html
git commit -m "feat: 25 OF1 templates (5 intents × 5 variations) for ${DOMAIN}"
git push origin "$BRANCH"
```

### 6. Verify gallery loads

```bash
GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
curl -s -o /dev/null -w "Gallery: HTTP %{http_code} — ${GALLERY_URL}\n" "$GALLERY_URL"
```

### Completion (assemble mode)

⚠️ **The deliverable URL MUST be the gallery page, NOT the catalog JSON.** The gallery is human-browseable; the catalog opens as raw JSON in the user's browser — broken UX.

- ✅ `https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html`
- ❌ `https://${BRANCH}--${REPO}--${OWNER}.aem.page/templates/templates-catalog.json`

```bash
# Final guard — a degraded gallery (<25 templates) is the most visible failure
# mode of this pipeline. Do not ship silently.
COUNT=$(ls templates/of1-*.html 2>/dev/null | wc -l | tr -d ' ')
[ "$COUNT" -ge 25 ] || { echo "ABORT: only ${COUNT} templates exist" >&2; exit 1; }

GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
cat > "$OF1_STATE_DIR/step-7-status.json" <<EOF
{
  "step": 7,
  "status": "review",
  "deliverables": [
    { "url": "${GALLERY_URL}", "label": "Template gallery" }
  ],
  "summary": "Assembled ${COUNT} templates from 5 parallel intent agents. Browse the gallery to review layouts and sample content."
}
EOF
```

## Process — Mode: `all` (legacy fallback)

If `OF1_TG_MODE` is unset, run all three phases inline: `base` → 5 intents serially → `assemble`. Same artifacts as the fan-out; ~5× slower wall-clock because there's no parallelism. Prefer fan-out when the orchestrator supports it.

```bash
OF1_TG_MODE=base # re-invoke this skill's base path

for INTENT in comparison recommendation deep-dive budget discovery; do
  OF1_TG_MODE=intent OF1_TG_INTENT="$INTENT" # re-invoke this skill's intent path
done

OF1_TG_MODE=assemble # re-invoke this skill's assemble path
```

## Notes

- **ASCII-safe sample text** — no accented characters in sample data (use plain `e` not `é`); some downstream tooling chokes.
- **Deliverable URL is the gallery, never the catalog JSON** — the tripwire in assemble Completion guards against this.

## Deliverables

- `of1/config/templates.json` — routing config
- `styles/of1-template-base.css` — shared design tokens
- 25 × `templates/of1-*.html` — slot-based templates
- 25 × `templates/of1-*.metadata.json` — slot contracts
- 25 × `styles/of1-*.css` — per-template stylesheets (each `@imports` the base)
- 25 × `templates/of1-*.sample.json` — sample data for gallery
- 25 × `drafts/of1-*-sample.html` — filled previews
- `templates/templates-catalog.json` — template index (fully inlined)
- `gallery/index.html` — browseable review UI
- `tools/fill-template.py` — fill script
