---
name: of1-prototype
description: Generate pixel-perfect HTML prototypes of key pages from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Prototype

Generate pixel-perfect, self-contained HTML reproductions of key pages from the target website. These prototypes are the source-of-truth for the snowflake overlay conversion in Step 6.

## ⚡ Speed Priority — Target: 8 minutes

- Use playwright-cli to extract real page structure, images, and styles
- ONE git commit + push at the end
- Max 2 screenshot-diff iterations per page, then move on

---

## Inputs

- `DOMAIN`: Target domain
- Extraction outputs at `stardust/current/` (DESIGN.json, logo.svg, screenshots — from step 4)
- Key pages from discovery (typically: homepage + 2 category/product pages)
- Repo config from `/shared/of1-demo/repo-config.json`

## Process

### Step 1: Read config + existing data

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
```

Read `stardust/current/DESIGN.json` for design tokens (colors, typography, spacing).

### Step 2: Extract Page Content via Playwright

For each key page, use `playwright-cli` to:
1. Navigate to the page
2. Extract the full DOM structure
3. Extract all image URLs (use `format=png` not `format=webply`)
4. Extract computed styles for key sections
5. Screenshot the page as reference

```bash
playwright-cli navigate "https://${DOMAIN}/" --tab <tab_id>
playwright-cli screenshot --tab <tab_id> /tmp/live-home.png
playwright-cli eval --tab <tab_id> "document.querySelector('main').innerHTML"
```

### Step 3: Generate Self-Contained HTML Prototypes

For each page, produce a single `.html` file with ALL CSS inlined in `<style>` tags. The prototype must be:

- **Self-contained** — opens in any browser with no external dependencies (except images from the live site and Google Fonts)
- **Pixel-perfect** — visually matches the live site screenshot
- **Complete** — every section, every image, every nav link, every footer column

#### Structure of each prototype:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Page Title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">
  <style>
    /* ALL CSS HERE — inline, complete, no external sheets */
  </style>
</head>
<body>
  <!-- Announcement bar (if site has one) -->
  <!-- Header with nav -->
  <main>
    <!-- All page sections -->
  </main>
  <!-- Footer -->
</body>
</html>
```

---

## ⚠️ CRITICAL: Logo Extraction Rules

The brand logo is the #1 source of rendering bugs in the pipeline. Follow these rules exactly:

### Extracting the Logo

1. **Download the real logo SVG directly from the site** — check these locations:
   ```javascript
   // In playwright-cli eval:
   // Check for icon/logo in the nav
   document.querySelector('[class*=logo] img, [class*=brand] img, nav img')?.src
   // Check for SVG icons folder
   document.querySelector('img[src*="logo"]')?.src
   // Check for inline SVG in nav
   document.querySelector('nav svg, header svg')?.outerHTML
   ```

2. **Save the complete SVG** to `stardust/current/assets/logo.svg` — verify it contains the FULL wordmark by checking the file renders correctly

3. **Never partially recreate an SVG** from extracted path data — always use the original complete file from the site

### Using the Logo in Prototypes

- **Header**: Inline the full SVG with the original fill colors (typically dark on light background)
- **Footer**: Inline the SAME full SVG but change `fill` attributes to cream/light color (e.g., `#F4E9DC`) for dark footer backgrounds
- **Both must include ALL parts** of the logo (icon/symbol + wordmark text + any separator elements)

### Verification

After generating the prototype, visually confirm:
- Header logo shows the complete brand name (not truncated)
- Footer logo shows the complete brand name in the correct color for dark background
- Both include any icon/symbol that's part of the logo (e.g., a coffee bean, swoosh, etc.)

---

## ⚠️ CRITICAL: CSS Class Names — Avoid EDS Reserved Names

When naming CSS classes in the prototype, **NEVER use these class names** for your own elements:

| Reserved by EDS | Use instead |
|----------------|-------------|
| `.header` | `.site-header` |
| `.footer` | `.site-footer` |
| `.section` | `.page-section` or specific names |
| `.block` | (avoid — EDS uses this internally) |
| `.fragment` | (avoid) |

**Why:** EDS wraps the page in `<div class="header-wrapper"><div class="header block">...</div></div>`. If your prototype uses `<header class="header">`, the CSS `.header { display: flex }` will target BOTH the EDS wrapper AND your element, breaking the layout.

**Rule:** Use `.site-header` for the semantic `<header>` element and `.site-footer` for `<footer>`.

---

## ⚠️ CRITICAL: Announcement Bar / Top Banner

Many sites have an announcement bar above the main navigation. In the prototype:

1. **Make it a SEPARATE element** from the header — NOT nested inside `<header>`
2. **Structure:**
   ```html
   <div class="announcement-bar">...</div>
   <header class="site-header">...</header>
   ```
3. This ensures when the snowflake overlay renders it in EDS, the announcement bar stays on its own row above the nav.

---

## CRITICAL: Pixel-Perfect Copy — No Redesign, No Placeholders

- **Use real images** from the live site (exact URLs extracted via playwright)
- **Use the real brand SVG logo** (complete, from the site's icon folder or DOM)
- **Match design tokens exactly** (colors, fonts, spacing from DESIGN.json)
- **No placeholder images**, colored boxes, gradient divs, or emoji
- **No redesign** — faithful reproduction only
- Use `format=png` or `format=jpg` in image URLs (not `format=webply`)

---

## Screenshot Diff Loop (max 2 iterations per page)

After generating each prototype:

1. **Open the prototype** in a browser tab via `serve` or file URL
2. **Compare side-by-side** with the live site screenshot
3. **Fix significant differences:**
   - Missing images → extract the correct URL via playwright eval
   - Wrong layout → check column count, flex direction from live DOM
   - Missing sections → re-extract from the live page
   - Wrong colors → verify against DESIGN.json tokens
4. **After 2 iterations** → accept remaining minor differences and move on

---

## Lessons Learned (Prevent These Mistakes)

| Mistake | Impact | Prevention |
|---------|--------|------------|
| Partial/truncated logo SVG | Broken logo in header/footer forever | Always download the full SVG file from the site, verify it renders completely |
| Using `class="header"` | Collides with EDS `.header.block` wrapper | Always use `class="site-header"` |
| Putting announcement bar inside `<header>` | Bar and nav render on same line in EDS | Keep announcement bar as separate div ABOVE `<header>` |
| Inventing image URLs | 404s everywhere | Only use URLs extracted from the live DOM via playwright |
| Using `format=webply` in image URLs | Browser compatibility issues | Change to `format=png` |
| Heroes set to 100vh | Way too tall — site typically uses 200-400px | Check the actual height from the live site |
| Adding box-shadows to cards | Over-designed vs. original | Only add shadows if the live site has them |
| Forgetting Google Fonts link | Wrong typography | Include `<link>` to Google Fonts at top of `<head>` |
| Footer logo with wrong fill color | Invisible on dark background | Use cream/light fill (#F4E9DC or similar) for dark footer backgrounds |

---

## Expected Output Structure

```
{REPO_DIR}/
├── stardust/
│   ├── current/
│   │   ├── DESIGN.json
│   │   └── assets/logo.svg          ← Complete brand logo SVG
│   └── prototypes/                   ← Generated prototypes
│       ├── prototype-home.html
│       ├── prototype-{page2}.html
│       └── prototype-{page3}.html
└── deliverables/
    ├── prototype-home.html           ← Committed copies for EDS review
    ├── prototype-{page2}.html
    └── prototype-{page3}.html
```

---

## Completion

```bash
cd "$REPO_DIR"
mkdir -p deliverables
cp stardust/prototypes/prototype-*.html deliverables/

git add stardust/prototypes/ deliverables/prototype-*.html stardust/current/assets/
git commit -m "feat: pixel-perfect HTML prototypes for ${DOMAIN}"
git push origin ${BRANCH}

mkdir -p /shared/of1-demo

# Serve prototypes for review
SERVE_URL=$(serve --entry prototype-home.html ${REPO_DIR}/stardust/prototypes/)

echo "{\"step\":5,\"status\":\"review\",\"deliverable\":\"${SERVE_URL}\",\"summary\":\"Generated N pixel-perfect HTML prototypes with real images, correct tokens, and matching layout.\"}" > /shared/of1-demo/step-5-status.json
```

Also write summary to `/shared/of1-demo/step-5-output.md`.

Do NOT call `sprinkle send`.
