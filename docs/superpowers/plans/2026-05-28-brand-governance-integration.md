# Brand Governance Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `of1-template-generation` skill to source design input from the brand-governance-agent design-token cascade instead of stardust + the discovery narrative, producing 4 templates (1 intent × 2 variations × 2 segments) for the demo.

**Architecture:** A new helper script (`fetch-brand-tokens.sh`) handles the 5 API calls (brand resolution + 2 segments × 2 formats) and persists tokens to `/shared/of1-demo/`. The SKILL.md is rewritten end-to-end: drops stardust/narrative reads, drops the 5-scoop parallelization, drops 4 intents, and runs sequentially over 1 intent × 2 variations × 2 segments. Each per-template CSS declares its own `:root` block populated from segment tokens; the shared base CSS holds tokenless utilities only.

**Tech Stack:** Bash + curl + jq for the helper script. The skill itself is a Claude Code skill (Markdown with embedded shell snippets). No new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `.claude/skills/of1-template-generation/assets/fetch-brand-tokens.sh` | Create | Resolve brand id from domain; fetch design tokens (markdown + JSON) for two hardcoded segments; validate non-empty token doc; fail fast on missing env, prod URL, network errors, empty response. |
| `.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh` | Create | Live smoke test exercising the happy path + 3 error paths against the stage cluster. |
| `.claude/skills/of1-template-generation/SKILL.md` | Rewrite | Full rewrite of Inputs / Worker Contract / Process / Deliverables / Completion to consume the cascade API and generate exactly 4 templates. |

No changes to `fill-template.py` (slot semantics unchanged) or `gallery.html` (groups by intent; 4 templates under "comparison" will render fine).

---

## Task 1: Add `fetch-brand-tokens.sh` helper script

**Files:**
- Create: `.claude/skills/of1-template-generation/assets/fetch-brand-tokens.sh`
- Create: `.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh`

### Step 1.1: Write the smoke test script

- [ ] Create `.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh` with the following content:

```bash
#!/usr/bin/env bash
# Live smoke test for fetch-brand-tokens.sh against the stage cluster.
# Requires IMS_TOKEN to be set in the environment (Bearer prefix tolerated).
# Exits 0 if all cases pass, non-zero with descriptive output otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH="${SCRIPT_DIR}/fetch-brand-tokens.sh"

BGA_API_URL="${BGA_API_URL:-https://adobe-aem-foundation-brand-governance-agent-deploy-022a47.stage.cloud.adobe.io}"
BGA_IMS_ORG_ID="${BGA_IMS_ORG_ID:-2A530A165FFED7AE0A494011@AdobeOrg}"

if [ -z "${IMS_TOKEN:-}" ]; then
  echo "FAIL: IMS_TOKEN is not set; cannot run live smoke test" >&2
  exit 1
fi

pass=0
fail=0

assert_exit() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $label (exit=$actual)"
    pass=$((pass + 1))
  else
    echo "FAIL: $label (expected exit=$expected, got $actual)" >&2
    fail=$((fail + 1))
  fi
}

# Case 1: happy path against frescopa
TMP1=$(mktemp -d)
BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" frescopa.coffee "$TMP1" >/dev/null 2>&1
assert_exit "happy path frescopa.coffee" 0 $?

# Check artifacts exist and are non-empty
for f in brand-info.json design-tokens-global.md design-tokens-global.json design-tokens-fr-under25.md design-tokens-fr-under25.json; do
  if [ ! -s "${TMP1}/${f}" ]; then
    echo "FAIL: expected artifact ${TMP1}/${f} missing or empty" >&2
    fail=$((fail + 1))
  else
    echo "PASS: artifact ${f} exists and is non-empty"
    pass=$((pass + 1))
  fi
done

# Check JSON contains at least one color.*.hex
hex_count=$(jq '[.. | objects | select(."$type" == "color") | select(."$value".hex)] | length' "${TMP1}/design-tokens-global.json")
if [ "$hex_count" -ge 3 ]; then
  echo "PASS: global JSON has ${hex_count} colors with hex values"
  pass=$((pass + 1))
else
  echo "FAIL: expected >=3 colors in global tokens, got ${hex_count}" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP1"

# Case 2: missing IMS_TOKEN (exit code from ${VAR:?} is bash-version-dependent; just require non-zero)
TMP2=$(mktemp -d)
(unset IMS_TOKEN; BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" "$FETCH" frescopa.coffee "$TMP2" >/dev/null 2>&1)
rc=$?
if [ $rc -ne 0 ]; then
  echo "PASS: missing IMS_TOKEN fails with exit=$rc"
  pass=$((pass + 1))
else
  echo "FAIL: missing IMS_TOKEN should have failed but exited 0" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP2"

# Case 3: prod URL refused
TMP3=$(mktemp -d)
BGA_API_URL="https://something.prod.cloud.adobe.io" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" frescopa.coffee "$TMP3" >/dev/null 2>&1
assert_exit "prod URL refused" 65 $?
rm -rf "$TMP3"

# Case 4: unknown domain → 404 from brand resolution
TMP4=$(mktemp -d)
BGA_API_URL="$BGA_API_URL" BGA_IMS_ORG_ID="$BGA_IMS_ORG_ID" IMS_TOKEN="$IMS_TOKEN" \
  "$FETCH" definitely-not-a-real-domain.invalid "$TMP4" >/dev/null 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  echo "PASS: unknown domain fails with exit=$rc"
  pass=$((pass + 1))
else
  echo "FAIL: unknown domain should have failed but exited 0" >&2
  fail=$((fail + 1))
fi
rm -rf "$TMP4"

echo ""
echo "Results: ${pass} passed, ${fail} failed"
exit $fail
```

- [ ] Make it executable:

```bash
chmod +x /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3/.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh
```

### Step 1.2: Run the smoke test to verify it fails (script-missing)

- [ ] Run:

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
./.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh
```

Expected: Script reports FAIL across cases because `fetch-brand-tokens.sh` does not exist yet (curl/jq commands inside it cannot run). Final line reads `Results: <some> passed, <some> failed` with `failed > 0`.

### Step 1.3: Implement `fetch-brand-tokens.sh`

- [ ] Create `.claude/skills/of1-template-generation/assets/fetch-brand-tokens.sh` with the following content:

```bash
#!/usr/bin/env bash
# Fetch design tokens from brand-governance-agent for the of1 template generator.
#
# Reads from env:
#   BGA_API_URL       — base URL of brand-governance-agent
#   BGA_IMS_ORG_ID    — IMS org id
#   IMS_TOKEN         — IMS user token (may include "Bearer " prefix)
#
# Usage:
#   fetch-brand-tokens.sh <domain> <output-dir>
#
# Resolves the brand id from <domain>, then fetches design tokens for two
# segments (global, fr-under25) in both markdown and JSON formats. Writes:
#   <output-dir>/brand-info.json
#   <output-dir>/design-tokens-global.md
#   <output-dir>/design-tokens-global.json
#   <output-dir>/design-tokens-fr-under25.md
#   <output-dir>/design-tokens-fr-under25.json
#
# Exits 64 on usage error, 65 on prod URL refused, 1 on any other failure.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <domain> <output-dir>" >&2
  exit 64
fi

DOMAIN="$1"
OUTPUT_DIR="$2"

: "${BGA_API_URL:?BGA_API_URL is not set}"
: "${BGA_IMS_ORG_ID:?BGA_IMS_ORG_ID is not set}"
: "${IMS_TOKEN:?IMS_TOKEN is not set}"

case "$BGA_API_URL" in
  *prod.cloud.adobe.io*)
    echo "Refusing to run against prod URL ($BGA_API_URL) until cascade-db ships to prod." >&2
    exit 65
    ;;
esac

mkdir -p "$OUTPUT_DIR"

TOKEN="${IMS_TOKEN#Bearer }"
TOKEN="${TOKEN# }"
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
API_KEY_HEADER="x-api-key: exc_app"
ORG_HEADER="x-gw-ims-org-id: ${BGA_IMS_ORG_ID}"

api_get() {
  local path="$1"
  local out="$2"
  local status
  status=$(curl -s -o "$out" -w "%{http_code}" \
    -H "$AUTH_HEADER" -H "$API_KEY_HEADER" -H "$ORG_HEADER" \
    "${BGA_API_URL}${path}")
  if [ "$status" != "200" ]; then
    echo "GET ${path} returned HTTP ${status}" >&2
    cat "$out" >&2 || true
    return 1
  fi
}

api_get "/api/v1/brands/from-url?url=https://${DOMAIN}" "${OUTPUT_DIR}/brand-info.json"
BRAND_ID=$(jq -r '.data.id // empty' "${OUTPUT_DIR}/brand-info.json")
if [ -z "$BRAND_ID" ]; then
  echo "Could not resolve brand id for domain ${DOMAIN}" >&2
  exit 1
fi
echo "Resolved brand: ${BRAND_ID}"

fetch_segment() {
  local slug="$1"
  local segment_json="$2"
  local encoded
  encoded=$(jq -rn --arg s "$segment_json" '$s|@uri')

  api_get "/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.md?segment=${encoded}" \
    "${OUTPUT_DIR}/design-tokens-${slug}.md"
  api_get "/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.json?segment=${encoded}" \
    "${OUTPUT_DIR}/design-tokens-${slug}.json"

  local color_count
  color_count=$(jq '[.. | objects | select(."$type" == "color") | select(."$value".hex)] | length' \
    "${OUTPUT_DIR}/design-tokens-${slug}.json")
  if [ "$color_count" = "0" ]; then
    echo "Segment ${slug} returned no color tokens" >&2
    exit 1
  fi
  echo "Segment ${slug}: ${color_count} color tokens"
}

fetch_segment "global" "{}"
fetch_segment "fr-under25" '{"country":"FR","audience":"under-25"}'

echo "Done: tokens written to ${OUTPUT_DIR}"
```

- [ ] Make it executable:

```bash
chmod +x /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3/.claude/skills/of1-template-generation/assets/fetch-brand-tokens.sh
```

### Step 1.4: Run the smoke test to verify it passes

- [ ] Run (requires `IMS_TOKEN` set in your shell):

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
./.claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh
```

Expected: All cases report PASS. Final line reads `Results: <N> passed, 0 failed` and exit code is 0.

Common failure modes if it doesn't pass:
- `IMS_TOKEN` expired → refresh and retry
- Stage cluster down → check `BGA_API_URL` is reachable with a plain curl
- Frescopa brand removed from stage → confirm with `curl ${BGA_API_URL}/api/v1/brands/from-url?url=https://frescopa.coffee` (with headers)

### Step 1.5: Commit

- [ ] Run:

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
git add .claude/skills/of1-template-generation/assets/fetch-brand-tokens.sh \
        .claude/skills/of1-template-generation/assets/test-fetch-brand-tokens.sh
git commit -m "feat(of1-template-generation): add fetch-brand-tokens.sh helper

Resolves brand id from domain and fetches design tokens (markdown + JSON)
for two hardcoded segments (global, fr-under25) from the brand-governance
agent stage cluster. Includes live smoke test.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Expected: One commit lands; `git log --oneline -1` shows the new commit.

---

## Task 2: Rewrite `SKILL.md` end-to-end

**Files:**
- Modify: `.claude/skills/of1-template-generation/SKILL.md` (full rewrite)

This is one atomic rewrite because every section is affected and partial states would leave the skill self-contradictory (e.g., process still describing scoops while the deliverables list 4 templates).

### Step 2.1: Replace `SKILL.md` with the new content

- [ ] Use the Write tool to replace `.claude/skills/of1-template-generation/SKILL.md` with the following content (verbatim):

````markdown
---
name: of1-template-generation
description: Generate 4 branded OF1 templates (1 intent × 2 variations × 2 segments) using design tokens from the brand-governance-agent cascade.
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

The skill **does not** read `stardust/current/design-tokens.json` or `/shared/of1-demo/step-3-output.md`. Those files may still exist (other steps write/read them); they are simply not consumed here.

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

The previous version of this skill generated 25 templates. Remove them so the gallery doesn't show leftovers from earlier runs:

```bash
cd "$REPO_DIR"
git rm -f --ignore-unmatch templates/of1-*.html templates/of1-*.metadata.json templates/of1-*.sample.json
git rm -f --ignore-unmatch styles/of1-*.css
git rm -f --ignore-unmatch drafts/of1-*-sample.html
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

**C. `<name>.css`** — Per-template stylesheet. Compose it from the appropriate `design-tokens-<segment-slug>.json`:

```bash
SEGMENT_JSON=/shared/of1-demo/design-tokens-${SEGMENT_SLUG}.json

# Extract values you need with jq. Examples:
ACCENT_HEX=$(jq -r '.. | objects | select(."$type"=="color") | select(."$value".hex) | ."$value".hex' "$SEGMENT_JSON" | head -1)
HEADING_FAMILY=$(jq -r '.typography.heading.h1."$value".fontFamily // "serif"' "$SEGMENT_JSON")
BODY_FAMILY=$(jq -r '.typography.body.default."$value".fontFamily // "system-ui"' "$SEGMENT_JSON")
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
````

### Step 2.2: Sanity-check the rewrite for stale references

- [ ] Run:

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
grep -nE 'stardust/current|design-tokens\.json|step-3-output|DESIGN\.json|5 intents|5 variations|25 templates|scoop' .claude/skills/of1-template-generation/SKILL.md || echo "OK: no stale references"
```

Expected: prints `OK: no stale references`. If anything else prints, edit the SKILL.md to remove the offending lines, then re-run this check.

- [ ] Verify the catalog example, the matrix table, and the bash loop all agree on the same 4 template names:

```bash
grep -oE 'of1-comparison-(table|versus)-(global|fr-under25)' .claude/skills/of1-template-generation/SKILL.md | sort -u
```

Expected: exactly these 4 lines:
```
of1-comparison-table-fr-under25
of1-comparison-table-global
of1-comparison-versus-fr-under25
of1-comparison-versus-global
```

### Step 2.3: Commit

- [ ] Run:

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
git add .claude/skills/of1-template-generation/SKILL.md
git commit -m "feat(of1-template-generation): rewrite to consume brand-governance cascade

Drops stardust + step-3 narrative as inputs. Produces 4 templates
(1 intent × 2 layouts × 2 segments) sourcing all tokens from the brand-
governance design-token cascade. Per-template CSS owns its :root block;
base CSS holds only tokenless utilities.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Expected: One commit lands.

---

## Task 3: End-to-end validation checklist

This task is **manual** — there is no automated harness for running a Claude Code skill end-to-end. The validation is performed by running the actual demo against frescopa.

### Step 3.1: Set up the demo environment

- [ ] Ensure `IMS_TOKEN`, `BGA_API_URL`, and `BGA_IMS_ORG_ID` are set in the shell from which Claude Code will be launched:

```bash
export BGA_API_URL="https://adobe-aem-foundation-brand-governance-agent-deploy-022a47.stage.cloud.adobe.io"
export BGA_IMS_ORG_ID="2A530A165FFED7AE0A494011@AdobeOrg"
# IMS_TOKEN already set by the user, with or without "Bearer " prefix
```

- [ ] Confirm the variables are visible:

```bash
echo "BGA_API_URL=${BGA_API_URL:-MISSING}"
echo "BGA_IMS_ORG_ID=${BGA_IMS_ORG_ID:-MISSING}"
echo "IMS_TOKEN=${IMS_TOKEN:+set (${#IMS_TOKEN} chars)}"
```

Expected: All three print a non-MISSING value.

### Step 3.2: Run the demo through step 7

- [ ] Launch the demo from the skills repo:

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills-v3
# Trigger /of1-demo (or whatever entrypoint the user normally uses).
# Run it against frescopa.coffee through step 7 (templates).
```

If the demo has already been run for a previous frescopa attempt, you may need to reset the sprinkle / branch state before re-triggering step 7. Use the existing demo skill's reset path; do NOT manually delete things from the of1-demo repo working tree.

### Step 3.3: Inspect the generated repo state

- [ ] After step 7 reports `status: review`, navigate to the demo's `repoDir` (read from `/shared/of1-demo/repo-config.json` → `.repoDir`) and verify:

```bash
REPO_DIR=$(jq -r '.repoDir' /shared/of1-demo/repo-config.json)
cd "$REPO_DIR"

# Exactly 4 templates
ls templates/of1-comparison-*.html | wc -l    # expect 4
ls templates/of1-comparison-*.metadata.json | wc -l  # expect 4
ls templates/of1-comparison-*.sample.json | wc -l  # expect 4
ls styles/of1-comparison-*.css | wc -l         # expect 4
ls drafts/of1-comparison-*-sample.html | wc -l # expect 4

# No leftovers from the old 25-template generation
ls templates/of1-recommendation-* 2>/dev/null  # expect: no match
ls templates/of1-discovery-* 2>/dev/null       # expect: no match
ls templates/of1-budget-* 2>/dev/null          # expect: no match
ls templates/of1-deep-dive-* 2>/dev/null       # expect: no match

# Catalog has count: 4
jq '.count, (.templates | length), (.byIntent.comparison | length)' templates/templates-catalog.json
# expect: 4, 4, 4
```

### Step 3.4: Inspect the per-template CSS for segment-specific tokens

- [ ] Verify each per-template CSS has its own `:root` block with real hex values, and that the `global` vs `fr-under25` CSS differ:

```bash
# Both should declare :root with hex values
grep -c "^:root" "$REPO_DIR/styles/of1-comparison-table-global.css"     # expect: 1
grep -c "^:root" "$REPO_DIR/styles/of1-comparison-table-fr-under25.css" # expect: 1

# At least one hex value must differ between segments
diff <(grep -oE '#[0-9A-Fa-f]{6}' "$REPO_DIR/styles/of1-comparison-table-global.css" | sort -u) \
     <(grep -oE '#[0-9A-Fa-f]{6}' "$REPO_DIR/styles/of1-comparison-table-fr-under25.css" | sort -u) \
  | head
```

Expected: the `diff` output shows at least one line of difference (the segments have different palettes).

### Step 3.5: Open the gallery and visually verify

- [ ] Read the gallery URL from `/shared/of1-demo/step-7-status.json` and open it in a browser:

```bash
GALLERY_URL=$(jq -r '.deliverable' /shared/of1-demo/step-7-status.json)
echo "$GALLERY_URL"
# Open this URL in a browser
```

- [ ] In the browser, confirm:
  - All 4 templates render without errors
  - The two `global` templates use the baseline palette (brick_red / icon_gold / maroon_wordmark + cream/charcoal)
  - The two `fr-under25` templates visibly use the FR + under-25 cascade overrides (notably `color.brand.primary` and `color.accent` — should look warmer/brighter than global)
  - The same layout (`table` or `versus`) under two different segments shows the SAME structure with DIFFERENT colors — this is the demo's centerpiece

### Step 3.6: If something fails

- [ ] Capture the failure mode and re-open Task 1 or Task 2 to fix:
  - If `fetch-brand-tokens.sh` fails at runtime → re-run `test-fetch-brand-tokens.sh` to isolate (Task 1)
  - If templates are generated but with wrong / missing colors → check the jq extraction in Process Step 4 (Task 2)
  - If stale 25-template files linger → check the `git rm -f --ignore-unmatch` block in Process Step 2 (Task 2)
  - If the gallery URL 404s → check that `gallery/index.html` was committed (Process Step 8 in Task 2)

---

## Notes for the implementer

- The skill itself is interpreted by Claude Code at runtime — there are no unit tests for it. Quality assurance comes from the helper script's smoke test (Task 1) and the manual e2e walkthrough (Task 3).
- The `fetch-brand-tokens.sh` script is the only piece of code in this work with a real test harness. Resist the urge to inline its logic into SKILL.md — keeping it as a separate script means it can be re-tested independently when the API changes.
- `IMS_TOKEN` rotation is a recurring failure mode. Surface "GET ... returned HTTP 401" clearly in the script's stderr (the current implementation does — verify if you modify it).
- The two segments are hardcoded for this demo. If you ever generalize to N segments, the loop in Process Step 4 already handles arbitrary segment counts cleanly; the catalog/byIntent block is the main thing that grows.
