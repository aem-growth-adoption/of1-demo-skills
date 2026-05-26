---
name: block-guide-builder
description: Analyze EDS blocks in the project and generate block-guide.json for the tenant config
user-invocable: true
---

# Block Guide Builder

Analyze the EDS blocks in this project's `blocks/` directory and generate a `block-guide.json` file for the of1-gen-web-service tenant config.

## Inputs

- `DOMAIN`: Target domain (e.g., `nvidia.com`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## CRITICAL: The `example` Field

The worker's LLM prompt builder uses each block's `example` field to show the AI exactly what JSON to produce. **Without proper examples, the LLM will invent its own format and the output will break.**

Every block MUST have an `example` field containing a complete JSON object using the `rows` format:
- `rows` is an array of rows
- Each row is an array of cells
- Each cell is an array of content items
- Content items have a `type` field (h1-h6, p, image, link, ul, blockquote)

## Process

### Step 1: Discover blocks

List the `blocks/` directory. Each subdirectory is a block. For each, read:
- `<block-name>.js` — decoration logic
- `<block-name>.css` — styling

Skip structural blocks (header, footer, nav).

### Step 2: Analyze each block

For each block, determine:
- **Purpose:** What does `decorate()` do? What markup does it expect?
- **Visual layout:** Grid, carousel, full-bleed, cards, columns, etc.
- **Row/cell structure:** How are rows and cells organized in the EDS table markup?
- **Content items:** What types of content go in each cell? (headings, images, paragraphs, links)
- **Variants:** Does CSS handle variant classes?
- **When to use:** What queries/scenarios fit this block?

### Step 3: Get domain context

If `DOMAIN` was provided in your prompt (pipeline mode), use it directly and infer the site focus from `of1/config/products.json` and prior discovery output. Skip asking.

Otherwise, ask the user:
> What domain is this block guide for? (e.g., nvidia.com)
> What does the site focus on? (e.g., "GPU products for gamers", "outdoor adventures")

### Step 4: Generate block catalog page

Before presenting the block selection, generate a **block catalog page** that renders every candidate block with sample content. This gives the user a visual reference to evaluate which blocks belong in the OF1 guide.

Write the catalog to `content/{branch}/block-catalog.html` in standard EDS authoring HTML format:
- One section per block: h2 with block name, p with description, then the block markup
- Use real product images from `of1/config/products.json`
- Include the site's nav/footer metadata

Publish to DA and trigger AEM preview so the user can see all blocks rendered with the site's actual CSS.

### Step 5: Present findings and get user approval

```
## Block Analysis

**Found [N] blocks, recommending [M] for generation:**

| Block | Complexity | Use Case | Recommendation |
|-------|-----------|----------|----------------|
| hero | Low (4 rows) | Page opener | ✓ Keep |
| cards | Low (image + body) | Product grids | ✓ Keep |
| product-listing | High (5 cells) | PLP grid | ✗ Drop — too rigid |
| ... | ... | ... | ... |

**Recommended (keep):** [list with rationale]
**Excluded:** [list with reasons — too complex, redundant, hallucination-prone, promo content]

Block catalog preview: [URL]

Which blocks should OF1 use? Feel free to override my recommendations.
```

**Selection criteria for recommending blocks:**
- **Simplicity** — blocks with fewer positional rows/cells are more reliable for LLM generation
- **Redundancy** — if two blocks serve similar purposes, keep the simpler one
- **Hallucination risk** — drop blocks that require invented quotes, statistics, or time-sensitive promos
- **Intent coverage** — the final set must cover discovery, deep-dive, comparison, and recommendation intents
- **Target: 6-9 blocks** — this is the sweet spot for reliable generation

### Step 6: Generate block-guide.json

Write to `of1/config/block-guide.json`.

The block guide is a **prompt string** that tells the LLM how to output structured JSON blocks. The worker's `json-to-html.js` converts the JSON into EDS HTML at runtime — no `html_template` or `scoped_css` needed. The EDS site's own block CSS handles styling.

**Format:** A single `guide` string field containing the full prompt instructions with block examples.

The worker's `build-prompt.js` checks `blockGuide.guide` (text format) first, then falls back to `blockGuide.blocks` (structured array). The text format gives full control over the LLM instructions and is preferred.

```json
{
  "guide": "## MANDATORY: Structured JSON Block Output\n\nYou output structured JSON blocks...\n\n### hero\nFull-width hero...\n\n{\"block\":\"hero\",\"rows\":[\n  [[{\"type\":\"image\",\"src\":\"...\",\"alt\":\"...\"}]],\n  [[{\"type\":\"h2\",\"text\":\"...\"},{\"type\":\"p\",\"text\":\"...\"},{\"type\":\"link\",\"text\":\"...\",\"href\":\"...\",\"style\":\"primary\"}]]\n]}\n\n---\n\n### cards\nGrid of cards...\n\n..."
}
```

**IMPORTANT:** The key MUST be `"guide"` (not `"blockGuide"`). The worker loads this file as `tenant.blockGuide` (from `block-guide.json` in R2), then `build-prompt.js` reads `ctx.tenant.blockGuide.guide`.

The `guide` string must include:

1. **Rules section** — output format (JSON objects separated by `===`), content item types table
2. **Block definitions** — each block with name, description, rules, and a complete JSON example using the `rows` format
3. **Suggestions section** — instructions for the required trailing suggestions object

**Do NOT include `html_template` or `scoped_css`** — these are unnecessary. The worker converts the LLM's JSON output to standard EDS block HTML using `json-to-html.js`, and the site's own block CSS (already deployed) handles all styling. The LLM just needs to know the block names and row/cell structure.

### How to write the `example` field

The `example` is a **JSON string** (escaped) showing one complete block object. Follow this pattern:

1. Look at what `decorate()` expects as input (the row/cell HTML structure)
2. Map that to the `rows` array format:
   - Simple blocks (hero, text): one row, one cell, multiple content items
   - Card/grid blocks: multiple rows, one cell per row
   - Multi-column blocks: one row, multiple cells
   - Table blocks: multiple rows, multiple cells per row
3. Use realistic content matching the site's domain (not lorem ipsum)
4. Include the exact block name in the `"block"` field

### Step 7: Confirm

> Block guide written to `of1/config/block-guide.json` with [N] blocks defined.
> Each block includes a `rows`-based example for the LLM.
> Block catalog available at: [preview URL]

Write a status file with the block catalog URL as the deliverable:

```bash
mkdir -p /shared/of1-demo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
echo '{"step":9,"status":"review","deliverable":"https://main--'${REPO}'--'${OWNER}'.aem.page/block-catalog"}' > /shared/of1-demo/step-9-status.json
```

## MANDATORY: Images in Every Block

**The block guide MUST instruct the LLM to always include images.** Generated pages without images look broken and unprofessional. Add these rules to the guide's preamble:

```
CRITICAL IMAGE RULES:
- Every hero block MUST include an image row. Never generate a hero with only text.
- Every card in a card/grid block MUST include a product image.
- Every feature-column or showcase block MUST include images.
- Use images from the product data provided in context — never omit them.
- If a block's example shows an image field, the generated output MUST include an image.
- A page without images is BROKEN. Always include images.
```

Every block example in the guide that supports images MUST show an image content item (`{"type":"image","src":"...","alt":"..."}`). If the LLM sees examples without images, it will produce output without images.

## MANDATORY: Use Real Image URLs

**All image URLs in examples MUST be real, working URLs from `of1/config/products.json`.** The LLM treats example URLs as patterns to follow — if you use fake/invented URLs (e.g. `/content/dam/...` paths), the LLM will hallucinate similar broken URLs in generation.

```
CRITICAL:
- Copy-paste exact image URLs from products.json — never invent paths
- Never use /content/dam/ URLs — these are hallucinated AEM DAM paths that return 404
- If a product doesn't have an image URL, omit that product from examples
- Every image src in the guide must return HTTP 200 when fetched
```

## Tips

- **Less is more:** 5-8 well-described blocks with good examples beat 20 poorly described ones
- **Examples are mandatory:** The LLM ONLY produces correct output when it sees exact examples. A block without an `example` field will produce broken HTML.
- **Match decorate():** Trace mentally: "If the LLM outputs this example → json-to-html converts it → the block's decorate() receives it — will it work?"
- **Use real content:** Examples should use realistic content from the site, not generic placeholders. Use real image URLs from `of1/config/products.json`.
- **Every example with a visual block MUST include an image content item** — if you write an example without `{"type":"image",...}` in a block that renders images, the LLM will skip images in generation.
- **The `rows` format:** `rows[row_index][cell_index][item_index]` — that's the nested structure
- **Intent-driven layout guidance:** The worker's `build-prompt.js` tells the LLM what kind of page to generate based on detected intent:
  - `deep-dive` → "Generate a comprehensive page with all available details" — needs a block suited for rich single-item content (hero + text/columns)
  - `comparison` → "Generate a comparison table or side-by-side layout" — needs table or multi-card blocks
  - `recommendation` → "Feature the best-match product prominently" — needs a featured/teaser block + cards for alternatives
  - `discovery` → "Generate a personalized page with variety" — needs hero + card grid
  Make sure your block set covers all these scenarios.
- **Refer to nvidia-ema:** The best reference for how a complete block guide looks is at `../nvidia-ema/workers/generative-api/src/block-guide.js` — each block has a full JSON example using the rows format
