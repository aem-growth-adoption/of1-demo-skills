---
name: of1-prototype
description: Generate pixel-perfect HTML prototypes of key pages from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Prototype

Generate pixel-perfect, self-contained HTML reproductions of key pages from the target website by invoking the `stardust:prototype` skill. These prototypes are the source-of-truth for the snowflake overlay conversion in step 6.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-5-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |

`playwright-cli` calls below use the legacy `visit`/`--output` shape — SLICC runs that natively, CC uses the shim installed by `of1-setup`.

## Inputs

- `DOMAIN` (e.g. `frescopa.coffee`)
- Extraction outputs at `stardust/current/` (DESIGN.json, logo.svg, screenshots, per-page JSON — from step 4)
- Discovery key pages (typically homepage + 2 category/product pages)
- `repo-config.json` (from step 2)

## Process

### 1. Read repo config

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

### 2. Invoke `stardust:prototype` (DO NOT generate prototypes by hand)

This step's whole job is to delegate to `stardust:prototype`. **Do NOT hand-author HTML, do NOT shell out to playwright/curl/wget to build pages yourself** — the stardust skill owns design-token application, image insertion, layout fidelity, and the visual-diff loop. Reimplementing it here is the most common failure mode.

Invoke `stardust:prototype` via the platform's sub-skill primitive (CC: the `Skill` tool; SLICC: the equivalent):

```
Skill: stardust:prototype
```

The skill reads `stardust/current/{DESIGN.json,assets/logo.svg,pages/*.json}`, generates self-contained HTML with all CSS inlined, runs visual-diff loops against the captured screenshots, and writes prototypes to `stardust/prototypes/prototype-*.html`.

### 3. Verify outputs

```bash
cd "$OF1_DEMO_REPO"
ls stardust/prototypes/prototype-*.html >/dev/null 2>&1 \
  || { echo "FAIL: no prototypes generated"; exit 1; }
echo "✓ Prototypes present: $(ls stardust/prototypes/prototype-*.html | wc -l | tr -d ' ') page(s)"
```

If a page is missing, check `stardust/state.json` and re-invoke for that page.

### 4. Post-generation fixes

After stardust:prototype generates the prototypes, verify and fix these four common issues before committing.

#### 4a. Logo in header AND footer — MUST be inlined SVG

The brand logo MUST be inlined as a complete `<svg>` element (not an `<img src="...">`) in BOTH the header nav and the footer of every prototype. This is the #1 cause of logo rendering failures downstream — if the logo is an `<img>` tag, EDS/DA processing strips or breaks it.

**Verify after stardust:prototype runs:**

```bash
# Both header and footer must contain an inline <svg> with the full logo
for PROTO in stardust/prototypes/prototype-*.html; do
  echo "=== $(basename $PROTO) ==="
  grep -c '<svg' "$PROTO" | xargs -I{} echo "  Inline SVGs: {}"
  grep -q 'class="header-logo".*<svg\|class="nav-logo".*<svg\|logo.*<svg' "$PROTO" \
    && echo "  ✓ Header has inline SVG logo" \
    || echo "  ✗ Header logo may be missing or using <img>"
done
```

**If the logo is missing, truncated, or using `<img>` instead of inline SVG:**

1. Get the full logo SVG: `curl -s "https://${DOMAIN}/icons/logo.svg" > stardust/current/assets/logo.svg` (or extract from the DOM via playwright-cli if not at a predictable path)
2. Inline the complete SVG into the header nav (inside the brand link `<a>`)
3. Inline the SAME SVG into the footer, but with fill colors changed for the dark footer background (e.g. `fill="#F4E9DC"` instead of `fill="#58181d"`)
4. Verify the SVG has the correct `viewBox` attribute — if it renders as a tiny square, the viewBox is wrong or missing

#### 4b. CSS class naming — avoid EDS collisions

EDS wraps content in `<div class="header-wrapper"><div class="header block">…</div></div>`. If a prototype uses `<header class="header">`, snowflake (step 6) inherits the collision and the nav renders wrong. Rename:

| If prototype uses | Rename to |
|---|---|
| `class="header"` on `<header>` | `class="site-header"` |
| `class="footer"` on `<footer>` | `class="site-footer"` |
| `.header { … }` in CSS | `.site-header { … }` |
| `.footer { … }` in CSS | `.site-footer { … }` |

#### 4c. Image URLs — look up, never construct

When fixing card images that stardust:prototype left blank or wrong, pull the URL from the captured page JSON — **never construct it from a path pattern**.

Step 4 wrote one JSON file per crawled page at `stardust/current/pages/<page>.json`, each listing the `images` array with the exact URLs as they appeared in the live DOM. That's the canonical source.

```bash
# ✅ CORRECT — look up the captured URL
jq -r '.images[] | select(.alt | test("Bali"; "i")) | .src' stardust/current/pages/adventures.json

# ❌ WRONG — constructing from a guessed pattern
# "https://${DOMAIN}/content/dam/wknd/adventures/bali-surf-camp.jpg"
```

#### 4d. Announcement bar structure

If the site has a promo/announcement bar above the nav, keep it as a **separate element** from the header — NOT nested inside `<header>`:

```html
<!-- ✅ CORRECT -->
<div class="announcement-bar">FREE SHIPPING FROM $35…</div>
<header class="site-header">
  <a href="/" class="header-logo"><svg>…</svg></a>
  <nav>…</nav>
</header>

<!-- ❌ WRONG — breaks in EDS snowflake -->
<header class="header">
  <div class="announcement">…</div>
  <nav>…</nav>
</header>
```

### 5. Copy to deliverables + commit

```bash
cd "$OF1_DEMO_REPO"
mkdir -p deliverables
cp stardust/prototypes/prototype-*.html deliverables/

git add deliverables/prototype-*.html stardust/prototypes/ stardust/current/assets/
git commit -m "feat: pixel-perfect HTML prototypes for ${DOMAIN}"
git push origin "$BRANCH"
```

`stardust/` may be in `.gitignore` — always commit to `deliverables/`, that's what gets served on EDS and reviewed.

## CRITICAL: pixel-perfect copy — no redesign, no placeholders

stardust:prototype already enforces this, but for clarity:

- **Use real images** from the live site (exact URLs from the captured page JSON)
- **Inline the brand logo SVG** in BOTH the nav/header AND the footer (same SVG, different fill colors for dark footer background)
- **Match design tokens exactly** (colors, fonts, spacing)
- **No placeholder images**, colored boxes, gradient divs, or emoji
- **No redesign** — faithful reproduction only

## Notes

Cross-cutting rules (logo completeness, EDS class collisions, announcement-bar placement, image format) are also documented in `of1-demo/knowledge/common-pitfalls.md`. Prototype-specific gotchas: heroes set to `100vh` are usually way too tall (sites typically use 200–400 px — check the live site's actual height); don't invent box-shadows that aren't on the original ("pixel-perfect copy" means matching, not improving).

## Expected output structure

```
$OF1_DEMO_REPO/
├── stardust/
│   └── prototypes/                     ← Generated by stardust:prototype
│       ├── prototype-home.html
│       ├── prototype-{page2}.html
│       └── prototype-{page3}.html
└── deliverables/
    ├── prototype-home.html             ← Committed copies served via EDS
    ├── prototype-{page2}.html
    └── prototype-{page3}.html
```

## Completion

Build a `deliverables` array — one entry per prototype, so the orchestrator can render one Open button per page (e.g. Open Home, Open Adventures, Open Magazine). The static HTML files committed in step 5 are served directly from the code bus at `/deliverables/*` — no EDS preview trigger needed.

URLs MUST point at `/deliverables/prototype-*.html` (standalone HTML committed above), NOT `/${BRANCH}/prototype-*` (the EDS overlay URL produced later by step 6 — snowflake).

```bash
DELIVERABLES=$(python3 - <<PYEOF
import json
from pathlib import Path
base = "https://${BRANCH}--${REPO}--${OWNER}.aem.page"
files = sorted(Path('deliverables').glob('prototype-*.html'))
files.sort(key=lambda p: 0 if p.stem == 'prototype-home' else 1)
out = [
    {"url": f"{base}/deliverables/{p.name}",
     "label": p.stem.replace('prototype-', '').replace('-', ' ').title()}
    for p in files
]
print(json.dumps(out))
PYEOF
)

COUNT=$(ls deliverables/prototype-*.html 2>/dev/null | wc -l | tr -d ' ')

cat > "$OF1_STATE_DIR/step-5-status.json" <<EOF
{
  "step": 5,
  "status": "review",
  "deliverables": ${DELIVERABLES},
  "summary": "Generated ${COUNT} pixel-perfect HTML prototypes with real images, correct tokens, and matching layout."
}
EOF
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/done transition.
