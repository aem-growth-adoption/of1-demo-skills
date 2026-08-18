---
name: of1-build-templates
description: Generate 5 branded OF1 templates (5 intents × 1 variation) for the OF1 worker — slot-based EDS block-table HTML pages it fills with personalized content at runtime, plus a fully-inlined catalog and a review gallery that decorates previews with the site's real blocks.
user-invocable: true
---

# OF1 Template Generation

Produce the template library for the OF1 worker: 5 slot-based EDS block-table HTML templates (5 intents × 1 variation), composed from `blocks-manifest.json`'s block catalog and the site's own `styles/styles.css`, a fully-inlined catalog the worker reads at runtime, and a browseable gallery for review.

## Env — orchestrator exports these (see `of1-check-dependencies`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives status JSON |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo-orchestrator` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/{assemble-catalog.*, fill-template.*, gallery.html}`) |

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

Selected by `OF1_TG_MODE`. The orchestrator runs the three phases in order: `base` → `intent × 5` (parallel, each generating 1 template) → `assemble`.

| Mode | What it does | Dispatched by |
|---|---|---|
| `base` | Resolve `DESIGN.json`, read + validate `blocks-manifest.json` (via `of1-liftoff/assets/validate-blocks-manifest.mjs`), and confirm `styles/styles.css` already carries the OF1-TOKENS block (fail loudly if absent). Writes no CSS — the manifest + the site's own stylesheet ARE the token surface. Must finish before any `intent` agent starts. | Orchestrator FIRST (sequential, 1 agent) |
| `intent` | Generate the ONE template for ONE intent (`$OF1_TG_INTENT`) as EDS block-table markup composed from `blocks-manifest.json` blocks. Writes only `templates/of1-{intent}-*`. Does NOT commit. | Orchestrator fan-out (5 agents in parallel) after `base` |
| `assemble` | Run ONCE after all 5 intent agents finish. Verifies the manifest was validated, assembles the catalog, runs `fill-template.mjs`, installs gallery, single commit + push. | Orchestrator after all intents return |
| `all` (default) | Fallback — runs `base` → 5 intents serially → assemble, inline in one agent. ~3× slower than the fan-out. | Single agent when orchestrator can't fan out |

**Race-safety:** intent agents write disjoint files (`of1-{intent}-*` prefixes don't collide). `blocks-manifest.json` and `styles/styles.css` are read-only inputs validated by the `base` agent; intent agents only read them. The catalog, gallery, and git are owned by `assemble`.

## Inputs

Available before invocation, in addition to the env above:

- **Block catalog (required) → `blocks-manifest.json`** — produced by `of1-liftoff` (Task 1); lists every EDS block available on the lifted site, the pages it's `usedOn`, and its `slotRegions` (`selector` + `slotType`). This is the palette `intent` mode composes templates from — validate it via `of1-liftoff/assets/validate-blocks-manifest.mjs` before authoring. Authoritative shape: `skills/of1-liftoff/assets/fixtures/manifest-valid.json`.
- **Sample/preview realism (optional, best-effort) → `$OF1_DEMO_REPO/of1/config/products.json`** — real products, prices, and counts to make the `sample.json` gallery previews look close to reality. This is produced by the **parallel** `of1-extract-content` skill and **may not be on disk yet** when you run — treat it as nice-to-have, **never a blocker**. When present, it's a **bare JSON array** (`[ {…}, {…} ]`), NOT `{"products": […]}` — so `jq '.[] | .price'` works and `jq '.products…'` errors. Per-item keys: `id, name, title, category, description, price, currency, keywords, highlights, features, images, url, persona, useCase`. `price` may be a string (`"499.00"`) or a number (`14.99`). See the Sample-data section below.
- Design tokens → `DESIGN.json` (from the replica/extraction stage) — resolve its path via `of1-demo-orchestrator/knowledge/design-tokens-resolution.md` (`$OF1_DEMO_REPO/stardust/current/DESIGN.json` OR `$OF1_DEMO_REPO/DESIGN.json`)
- Demo narrative → `$OF1_STATE_DIR/of1-discovery-output.md` (from `of1-discovery`)
- The repo's own `styles/styles.css` — the OF1-TOKENS block + the block CSS this templating step relies on; `base` mode confirms it's present, `intent` mode never duplicates its tokens into a per-template stylesheet.

Worker-side schemas: `of1-demo-orchestrator/knowledge/worker-config-schemas.md` § `templates.json`, § `products.json`.

## Sample data — realistic gallery previews (best-effort)

The templates you author are slot-based **shells**. At runtime the OF1 worker fills every slot with real, per-request content (from the live catalog + RAG) — so the values baked into `sample.json` never reach a customer. Their only job is to make the **review gallery** render a close-to-reality preview for the user approving the demo.

Because of that, sample data is **nice-to-have realism, not a correctness gate**:

- **Always generate all 5 templates**, every intent included. Missing preview data is never a reason to skip or block a template — a shell with placeholder values is still a valid, deployable template.
- **When `of1/config/products.json` is on disk, prefer its real values** (names, prices, categories) for `sample.json` so the gallery looks like the real store. `price` may be a string or a number — read it type-agnostically.
- **When it isn't there yet** (it's written by the parallel `of1-extract-content` skill and ordering isn't guaranteed), use plausible placeholder values. Don't wait on it, don't fail on it.
- This applies equally to the `budget` intent — generate its pricing template regardless; use real prices for the preview if available, placeholders otherwise.

## Reference — Worker Contract

The OF1 worker materializes templates from EDS into R2 after `POST /api/tenants/<id>/sync`. The skill must produce all of:

| # | File | Purpose | Mode |
|---|---|---|---|
| 1 | `of1/config/templates.json` | Routing config | `assemble` |
| 2 | `templates/templates-catalog.json` | Catalog with fully-inlined templates | `assemble` |
| 3 | `templates/<name>.html` | EDS block-table body (`<main>` only) | `intent` |
| 4 | `templates/<name>.metadata.json` | Per-template slot contract (`stylesheet: /styles/styles.css`) | `intent` |
| 5 | `templates/<name>.sample.json` | Sample slot data for gallery preview | `intent` |
| 6 | `drafts/<name>-sample.html` | Filled preview (via `fill-template.mjs`) | `assemble` |
| 7 | `gallery/index.html` | Browsable review UI that runs EDS decoration on the filled preview | `assemble` |

No template writes CSS. Every template's `metadata.stylesheet` points at the repo's own `/styles/styles.css` — block styling is loaded by the client's normal EDS decoration (`loadBlocks`/`decorateBlock`), the same as any other EDS page. `base` mode's only CSS-adjacent job is confirming `styles/styles.css` already has the OF1-TOKENS block; it never writes a stylesheet.

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
- Item cards carry `data-card="N"` for auto-hide — works on `<article>`, `<li>`, `<tr>`, `<section>`, or `<div>`. A card is hidden when `item-N.title` AND `item-N.body` are both absent; for non-`item-N` slot keys (e.g. table rows using `row-N.*`), add `data-card-key="row-N.name"` so the renderer probes the right value.
- NO `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` — just `<main>…</main>`
- **Block-table markup, not free-form HTML** — the `<main>` body is composed from real EDS blocks (the `<div>` wrapper structure EDS's block loader expects: section `<div>` > block `<div class="block-name variant">` > row `<div>` > cell `<div>`), selected from `blocks-manifest.json`. Put `data-slot`/`data-slot-list`/`data-card` markers on the actual content cells inside those block divs (see `assets/fixtures/of1-comparison-table.html` for a worked example) — never invent a parallel non-block markup shape.
- **Interactive components MUST include inline JS** — templates have no external JS runtime beyond the EDS block decoration itself. If using tabs, accordions, carousels, or toggles that aren't covered by an existing block's own JS, include a `<script>` tag at the end of `<main>` with the minimal JS needed to make them work (e.g., click handlers to show/hide panels). Keep scripts short (<30 lines), vanilla JS, no dependencies. The first tab/panel MUST be visible by default (no JS needed for initial render).

### `metadata.json` shape

See the worked example at `assets/fixtures/of1-comparison-table.metadata.json`:

```json
{
  "name": "of1-comparison-table",
  "intent": "comparison",
  "description": "Side-by-side comparison built from hero + columns blocks.",
  "minItems": 2,
  "maxItems": 4,
  "stylesheet": "/styles/styles.css",
  "html": "/templates/of1-comparison-table.html",
  "slots": [
    { "key": "hero.title",  "type": "text", "instruction": "Headline, ≤8 words" },
    { "key": "item-1.name", "type": "text", "instruction": "Option name" },
    { "key": "item-1.cta",  "type": "link", "instruction": "Link to option page" },
    { "key": "item-2.name", "type": "text", "instruction": "Option name" },
    { "key": "item-2.cta",  "type": "link", "instruction": "Link to option page" }
  ]
}
```

`stylesheet` is ALWAYS `/styles/styles.css` — there is no per-template CSS file anymore. The client's normal EDS decoration (`loadBlocks`) loads each block's real CSS from the repo's `blocks/` collection; the template only needs to emit correct block-table markup.

`description` is what the LLM uses to pick between templates of different intents — keep it short and structurally distinctive (e.g. *"Side-by-side comparison built from hero + columns blocks"*, not *"A comparison template"*).

`slot.instruction` is passed to the LLM as content-generation guidance — concise (e.g. *"Headline, ≤8 words"*, *"1-sentence value proposition"*).

### Catalog requirement — fully inline

⚠️ Every entry in `templates-catalog.json`'s `templates[]` array MUST include `slots`, `htmlContent`, and `stylesheet` inlined. `assemble-catalog.mjs` handles this — do not hand-author the catalog.

### Per-template structure (mandatory)

- Start with a hero block — the first top-level `<div>` in `<main>` wraps a `.hero` (or the manifest's equivalent hero-role block)
- At least 2-3 blocks total per template — hero + 1-2 content blocks minimum, composed from blocks actually present in `blocks-manifest.json` for the intent's target pages
- No per-template CSS — `metadata.stylesheet` is always `/styles/styles.css`; block styling comes from the site's own `blocks/<name>/<name>.css` via EDS decoration

## Reference — The 5 Intents

| Intent | Purpose | Example queries |
|---|---|---|
| `comparison` | Compare options side by side | "X vs Y", "which is better", "differences between" |
| `recommendation` | Personalized pick or ranked list | "best for me", "what should I choose", "top picks" |
| `deep-dive` | In-depth explanation | "how does X work", "tell me about", "explain" |
| `budget` | Pricing, ROI, cost orientation | "how much", "pricing", "cost calculator", "ROI" |
| `discovery` | Browse, explore, get inspired | "show me", "categories", "ideas" |

`discovery` is the fallback when intent classification is uncertain.

## Reference — Component palette (select from `blocks-manifest.json`)

Templates render INSIDE the live EDS page — the browser's normal block decoration (`loadBlocks`) applies each block's real CSS from `blocks/<name>/<name>.css`, so a template's job is picking the right EXISTING blocks and marking their content cells with `data-slot`, not inventing or restyling markup.

For each intent, read `blocks-manifest.json`'s `blocks[]` and pick blocks whose `usedOn` covers a page role relevant to that intent:

| Intent | Look for blocks used on… | Typical block shapes |
|---|---|---|
| `comparison` | listing/product pages | `columns`, `cards`, `table` |
| `recommendation` | home/listing pages | `hero`, `cards`, `carousel` |
| `deep-dive` | detail pages | `hero`, `columns` (fact lists), `accordion`/`tabs` |
| `budget` | detail/pricing pages | `table`, `columns`, `cards` (pricing tiers) |
| `discovery` | home/listing pages | `hero`, `cards`, `carousel` |

Every template still opens with a hero-role block. Use `blocks-manifest.json`'s `slotRegions` (`selector` + `slotType`) as a starting point for where to place `data-slot` markers inside each chosen block's cells — the manifest tells you WHERE content naturally lives in that block; you still choose which slot KEY (`hero.title`, `item-1.name`, …) each region maps to per the slot-key conventions above.

## Process — Mode: `base`

`base` no longer generates a stylesheet. Its job is validating that the two inputs `intent` mode depends on are actually usable, before any `intent` agent starts:

1. **Resolve `DESIGN.json`** per the shared rule — `of1-demo-orchestrator/knowledge/design-tokens-resolution.md` (`$OF1_DEMO_REPO/stardust/current/DESIGN.json` OR `$OF1_DEMO_REPO/DESIGN.json`). Used by `intent` mode only as narrative/brand context (copy, tone) — never as a CSS source; there is no template CSS to write.
2. **Read + validate `blocks-manifest.json`** — the block palette `intent` mode composes templates from:

```bash
cd "$OF1_DEMO_REPO"
MANIFEST="$(find . -maxdepth 3 -name blocks-manifest.json | head -1)"
[ -n "$MANIFEST" ] || { echo "FAIL: blocks-manifest.json not found — was of1-liftoff run?" >&2; exit 1; }
node "$(dirname "$SKILL_DIR")/of1-liftoff/assets/validate-blocks-manifest.mjs" "$MANIFEST" || {
  echo "FAIL: blocks-manifest.json failed validation" >&2; exit 1;
}
```

3. **Confirm `styles/styles.css` already carries a usable token source** — fail loudly if neither holds; `intent` mode never writes CSS, so if no tokens are already on the page, nothing will define them. Two paths are valid: (a) the normal skinned path, where `styles.css` carries the `OF1-TOKENS` marker block; or (b) `of1-liftoff`'s documented fallback, where extraction yielded no usable `DESIGN.json` and skinning was skipped, leaving the repo's own `:root` as the authoritative brand tokens — accept that when the core vars (`--heading-font-family`, `--text-color`, `--background-color`) are already defined:

```bash
if grep -q 'OF1-TOKENS' styles/styles.css; then
  : # marker present — normal skinned path
elif grep -q -- '--heading-font-family' styles/styles.css \
  && grep -q -- '--text-color' styles/styles.css \
  && grep -q -- '--background-color' styles/styles.css; then
  echo "NOTE: no OF1-TOKENS marker — skinning was skipped upstream (of1-liftoff fallback); using styles/styles.css's own :root as the token source."
else
  echo "FAIL: styles/styles.css has neither the OF1-TOKENS block nor the core :root brand vars (--heading-font-family, --text-color, --background-color) — resolve before running intent agents" >&2
  exit 1
fi
```

`base` writes no files. It only gates the fan-out: if either check fails, the orchestrator should not dispatch `intent` agents.

Status file (SLICC sprinkle IPC; CC ignores):

```bash
echo "{\"stage\":3,\"skill\":\"of1-build-templates\",\"phase\":\"base\",\"status\":\"done\",\"summary\":\"Validated blocks-manifest.json and OF1-TOKENS presence in styles/styles.css.\"}" \
  > "$OF1_STATE_DIR/of1-build-templates-base-status.json"
```

## Process — Mode: `intent`

Generate the ONE template for one intent — **1 variation per intent, down from 3.** Precondition: `$OF1_TG_INTENT` ∈ {`comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`}.

```bash
INTENT="${OF1_TG_INTENT:?OF1_TG_INTENT required in intent mode}"
case "$INTENT" in
  comparison|recommendation|deep-dive|budget|discovery) ;;
  *) echo "OF1_TG_INTENT must be one of: comparison recommendation deep-dive budget discovery" >&2; exit 2;;
esac
```

### Writes (only these — disjoint from other intents)

- `templates/of1-${INTENT}-{name}.html` (1)
- `templates/of1-${INTENT}-{name}.metadata.json` (1)
- `templates/of1-${INTENT}-{name}.sample.json` (1)

No CSS file — there is no `styles/of1-*.css` to write anymore.

### Does NOT touch

- `blocks-manifest.json`, `styles/styles.css` (read-only inputs, validated by the `base` agent)
- `templates/templates-catalog.json`, `of1/config/templates.json` (owned by `assemble`)
- `gallery/`, `drafts/`, `tools/` (owned by `assemble`)
- Any git operations

### Compose ONE block-table template from `blocks-manifest.json`

Read `blocks-manifest.json`, pick 2-3 blocks whose `usedOn` fits the intent (see the Component-palette table above), and author `<main>` as the real block-table markup for those blocks — section `<div>` > block `<div class="block-name variant">` > row `<div>` > cell `<div>` — with `data-slot`/`data-slot-list`/`data-card` markers on the content cells (per the manifest's `slotRegions` as a starting point). This is NOT free-form HTML with `of1-*` utility classes; it must be markup EDS's own block loader (`loadBlocks`) will decorate correctly when the client applies `blocks/<name>/<name>.css`.

Suggested `{name}` per intent (use another block-derived name if more distinctive for the site's actual manifest):

| Intent | Suggested `{name}` |
|---|---|
| `comparison` | `table` (see worked fixture `assets/fixtures/of1-comparison-table.*`) |
| `recommendation` | `picks` |
| `deep-dive` | `explainer` |
| `budget` | `pricing` |
| `discovery` | `gallery` |

### The one file set

Write all 3 files for the single `of1-${INTENT}-{name}`:

**`templates/of1-${INTENT}-{name}.html`** — `<main>…</main>` only, block-table markup as above. Worked example: `assets/fixtures/of1-comparison-table.html`.

**`templates/of1-${INTENT}-{name}.metadata.json`** — slot contract per `metadata.json` shape above. `stylesheet` is ALWAYS `/styles/styles.css`. Worked example: `assets/fixtures/of1-comparison-table.metadata.json`.

**`templates/of1-${INTENT}-{name}.sample.json`** — sample slot data for gallery preview. Worked example: `assets/fixtures/of1-comparison-table.sample.json`:

```json
{
  "_meta": { "stylesheet": "/styles/styles.css" },
  "hero.title": "Real brand-relevant headline",
  "hero.image": "https://real-image-url-from-site.com/...",
  ...
}
```

**Sample data rules:**
- **ASCII-safe text only** — no accented characters (`é`, `ñ`), no emoji (`🏄`, `⛷️`). Some downstream tooling chokes on non-ASCII. If you're tempted to use an emoji for an icon slot, use a short text label instead.
- **Image URLs** — **prefer the URLs already in `of1/config/products.json` when it's on disk** (its `images[]` are the real, self-hosted `.aem.page/media/...` URLs `of1-extract-content` uploaded + previewed — the same ones the worker will emit at runtime, so the gallery preview matches production). Fall back to the live site's real image URLs when `products.json` isn't present yet or lacks an image for that slot. Either way: do NOT invent URLs from memory, do NOT use AEM author/publish URLs (`author-p*.adobeaemcloud.com`), do NOT use EDS `hlx.page` content-dam paths.
- **Realistic but simple text** — brand-relevant, short, no placeholder "lorem ipsum."

### Validate JSON before declaring done

A single bad escape inside a JSON string corrupts the catalog without tripping the `assemble`-mode file-count checks. Validate every file you wrote:

```bash
for f in templates/of1-${INTENT}-*.metadata.json templates/of1-${INTENT}-*.sample.json; do
  python3 -c "import json; json.load(open('$f'))" || { echo "INVALID JSON: $f" >&2; exit 1; }
done
```

### Completion (intent mode)

End with a one-line summary naming the template basename. Status file (SLICC sprinkle IPC; CC ignores):

```bash
echo "{\"stage\":3,\"skill\":\"of1-build-templates\",\"phase\":\"intent-${INTENT}\",\"status\":\"done\",\"summary\":\"Generated 1 ${INTENT} block-table template.\"}" \
  > "$OF1_STATE_DIR/of1-build-templates-intent-${INTENT}-status.json"
```

## Process — Mode: `assemble`

Precondition: all 5 intent agents have completed; verify 5 of each artifact exist (1 per intent, no CSS):

```bash
COUNT_HTML=$(ls templates/of1-*.html 2>/dev/null | wc -l)
COUNT_META=$(ls templates/of1-*.metadata.json 2>/dev/null | wc -l)
[ "$COUNT_HTML" -ge 5 ] && [ "$COUNT_META" -ge 5 ] \
  || { echo "FAIL: expected 5 of each (html=$COUNT_HTML meta=$COUNT_META)" >&2; exit 1; }
```

### 1. Verify `base` mode's gate already passed

`base` mode (run before the intent fan-out) validated `blocks-manifest.json` and confirmed `styles/styles.css` carries a usable token source. Re-check before assembling, in case `assemble` runs in a fresh context — same two accepted paths as `base` mode step 3 (marker OR core `:root` vars):

```bash
if grep -q 'OF1-TOKENS' styles/styles.css; then
  : # marker present — normal skinned path
elif grep -q -- '--heading-font-family' styles/styles.css \
  && grep -q -- '--text-color' styles/styles.css \
  && grep -q -- '--background-color' styles/styles.css; then
  echo "NOTE: no OF1-TOKENS marker — skinning was skipped upstream (of1-liftoff fallback); using styles/styles.css's own :root as the token source."
else
  echo "FAIL: styles/styles.css has neither the OF1-TOKENS block nor the core :root brand vars (--heading-font-family, --text-color, --background-color)" >&2
  exit 1
fi
```

### 2. Assemble the catalog (fully inlined)

```bash
node "$SKILL_DIR/assets/assemble-catalog.mjs" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```

Produces `templates/templates-catalog.json` + `of1/config/templates.json`. Fails fast if any of the 5 templates is missing HTML; warns if any intent is missing from the catalog. Unchanged from the pre-EDS-block version — the catalog shape doesn't care whether `htmlContent` is block-table markup or a static shell.

### 3. Install fill-template + generate previews

```bash
mkdir -p tools drafts
cp "$SKILL_DIR/assets/fill-template.mjs" tools/fill-template.mjs
for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  SAMPLE="templates/${NAME}.sample.json"
  [ -f "$SAMPLE" ] && node tools/fill-template.mjs "$TPL" "$SAMPLE" "drafts/${NAME}-sample.html"
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
git add templates/of1-*.html templates/of1-*.metadata.json templates/of1-*.sample.json \
        templates/templates-catalog.json \
        of1/config/templates.json \
        drafts/of1-*-sample.html \
        tools/fill-template.mjs \
        gallery/index.html
git commit -m "feat: 5 OF1 EDS block-table templates (5 intents × 1 variation) for ${DOMAIN}"
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
# Final guard — a degraded gallery (<5 templates) is the most visible failure
# mode of this pipeline. Do not ship silently.
COUNT=$(ls templates/of1-*.html 2>/dev/null | wc -l | tr -d ' ')
[ "$COUNT" -ge 5 ] || { echo "ABORT: only ${COUNT} templates exist" >&2; exit 1; }

GALLERY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/gallery/index.html"
cat > "$OF1_STATE_DIR/of1-build-templates-status.json" <<EOF
{
  "stage": 3,
  "skill": "of1-build-templates",
  "status": "review",
  "deliverables": [
    { "url": "${GALLERY_URL}", "label": "Template gallery" }
  ],
  "summary": "Assembled ${COUNT} EDS block-table templates from 5 parallel intent agents. Browse the gallery to review layouts and sample content."
}
EOF
```

## Process — Mode: `all` (fallback)

If `OF1_TG_MODE` is unset, run all three phases inline: `base` → 5 intents serially → `assemble`. Same artifacts as the fan-out; ~3× slower wall-clock because there's no parallelism (fan-out collapses the five serial intent phases into ~one). Prefer fan-out when the orchestrator supports it.

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
- 5 × `templates/of1-*.html` — EDS block-table templates (1 per intent), `<main>` only, `metadata.stylesheet` always `/styles/styles.css`
- 5 × `templates/of1-*.metadata.json` — slot contracts
- 5 × `templates/of1-*.sample.json` — sample data for gallery
- 5 × `drafts/of1-*-sample.html` — filled previews
- `templates/templates-catalog.json` — template index (fully inlined; unchanged shape)
- `gallery/index.html` — browseable review UI that runs EDS decoration (`loadBlocks`) on each filled preview so it renders with the site's real block CSS
- `tools/fill-template.mjs` — fill script

No `styles/of1-template-base.css`, no per-template `styles/of1-*.css` — block styling comes entirely from the repo's own `styles/styles.css` + `blocks/*/*.css`, loaded by normal EDS decoration.
