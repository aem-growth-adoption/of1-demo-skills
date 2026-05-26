---
name: of1-prototype
description: Generate pixel-perfect HTML prototypes of key pages from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Prototype

Generate pixel-perfect, self-contained HTML reproductions of key pages from the target website. These prototypes are the source-of-truth for the snowflake overlay conversion in Step 6.

## ⚡ Speed Priority — Target: 8 minutes

- Extract ALL data from ALL pages FIRST, then write all HTML at once
- ONE git commit + push at the end
- Screenshot diff loop: max 2 iterations per page (not 3)
- Don't read other skills — everything you need is here
- Don't explore the workspace — you know where everything is

---

## Inputs

- `DOMAIN`: Target domain
- Design tokens at `${REPO_DIR}/stardust/current/design-tokens.json`
- Logo SVG at `${REPO_DIR}/stardust/current/assets/logo.svg`
- Screenshots at `${REPO_DIR}/stardust/current/assets/screenshots/`
- Key pages from discovery (typically: homepage, + 2 category/product pages)
- Repo config from `/shared/of1-demo/repo-config.json`

## Expected Output Structure

```
{REPO_DIR}/
├── stardust/
│   └── prototypes/                     ← Working files (may be gitignored)
│       ├── prototype-home.html
│       ├── prototype-{page2}.html
│       └── prototype-{page3}.html
└── deliverables/
    ├── prototype-home.html             ← Committed copies for review
    ├── prototype-{page2}.html
    └── prototype-{page3}.html
```

**NOTE:** `stardust/` may be in `.gitignore`. Always commit to `deliverables/` — that's what gets served on EDS and reviewed.

---

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

Read the design tokens:
```bash
cat ${REPO_DIR}/stardust/current/design-tokens.json
```

Read the logo:
```bash
cat ${REPO_DIR}/stardust/current/assets/logo.svg
```

### Step 2: Batch-extract ALL page data (ONE session)

Visit each page and extract images, structure, and computed styles in sequence. Do NOT close the browser between pages.

**For EACH key page:**

```bash
playwright-cli visit "https://${DOMAIN}/{path}" --headed

# Extract ALL images with src, alt, dimensions
playwright-cli eval "
Array.from(document.querySelectorAll('img')).map(i => ({
  src: i.src, alt: i.alt || '', w: i.naturalWidth, h: i.naturalHeight,
  parent: i.closest('section,div[class]')?.className || ''
}))
"

# Extract full page structure (sections, their classes, content summary)
playwright-cli eval "
Array.from(document.querySelectorAll('main > div, main > section, [class*=section]')).map(s => ({
  tag: s.tagName, classes: s.className,
  headings: Array.from(s.querySelectorAll('h1,h2,h3,h4')).map(h => h.textContent.trim()),
  links: Array.from(s.querySelectorAll('a[href]')).slice(0,5).map(a => ({text: a.textContent.trim(), href: a.href})),
  imgs: Array.from(s.querySelectorAll('img')).length,
  bg: getComputedStyle(s).backgroundColor
}))
"

# Extract nav structure
playwright-cli eval "
Array.from(document.querySelectorAll('nav a, header a')).map(a => ({
  text: a.textContent.trim(), href: a.href
}))
"
```

### Step 3: Write prototype HTML files

For each page, create a **self-contained HTML file** that:

1. **Uses real images** from the live site (exact `src` URLs extracted in Step 2)
2. **Inlines the brand logo SVG** in the nav/header
3. **Matches the design tokens** exactly (colors, fonts, spacing from design-tokens.json)
4. **Includes all CSS inline** in a `<style>` block (no external stylesheets except Google Fonts)
5. **Loads Google Fonts** if the site uses web fonts (Roboto, Baskerville, etc.)

**Critical visual rules:**
- Heroes are typically **half-height banners** (200-400px), NOT full-viewport — check the screenshot
- Product cards are usually **flat** (no box-shadow) unless the live site clearly has shadows
- Use the exact background colors from the live site sections
- Button styles must match exactly (border-radius, padding, colors, font-weight)
- Grid layouts must have the same column count as the live site

**Image URL rules:**
- Use the EXACT URLs from `playwright-cli eval` extraction
- If URLs contain `format=webply`, change to `format=png`
- Never use placeholder images, colored boxes, gradient divs, or emoji
- Never invent image URLs — only use what was extracted

**File naming:** `prototype-home.html`, `prototype-coffee.html`, `prototype-machines.html`

```bash
mkdir -p ${REPO_DIR}/stardust/prototypes
# Write each prototype file
```

### Step 4: Screenshot diff loop (max 2 iterations per page)

For each prototype:

```bash
# Serve the prototype
serve --entry prototype-home.html ${REPO_DIR}/stardust/prototypes/
# Screenshot it  
playwright-cli screenshot "chrome-extension://akjjllgokmbgpbdbmafpiefnhidlmbgf/preview${REPO_DIR}/stardust/prototypes/prototype-home.html" --full-page --output /tmp/proto-home.png
```

Or use `file://` URL:
```bash
playwright-cli screenshot "file://${REPO_DIR}/stardust/prototypes/prototype-home.html" --full-page --output /tmp/proto-home.png
```

Compare against the reference screenshot:
```bash
open --view /tmp/proto-home.png
open --view ${REPO_DIR}/stardust/current/assets/screenshots/homepage.png
```

**Fix significant diffs:**
- Missing/broken images → fix src URL
- Wrong layout (columns, grid) → fix CSS grid/flexbox
- Wrong colors → fix color values
- Missing sections → add them

**Accept minor diffs:**
- Font rendering differences
- 1-2px spacing
- Hover states
- Dynamic content (carousel position)

**Max 2 iterations** per page, then accept.

### Step 5: Copy to deliverables + commit

```bash
cd "$REPO_DIR"
mkdir -p deliverables
cp stardust/prototypes/*.html deliverables/

git add deliverables/prototype-*.html
git commit -m "feat: pixel-perfect HTML prototypes for ${DOMAIN}"
git push origin ${BRANCH}
```

---

## 🚫 Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using placeholder images (colored divs, gradients) | Extract real URLs with playwright-cli eval |
| Using emoji or generic SVG icons | Extract real icons from the live DOM |
| Making heroes full-viewport height | Check screenshot — usually 200-400px banners |
| Adding box-shadows to cards | Check if live site actually has them (most don't) |
| Re-reading design tokens or skills mid-work | Read once at the start, store in memory |
| Committing to `stardust/` (gitignored) | Commit to `deliverables/` |
| Multiple git push operations | ONE push at the end |
| 3+ screenshot iterations | Max 2 — accept minor diffs |

---

## Completion

```bash
mkdir -p /shared/of1-demo

# Serve prototypes for review
SERVE_URL=$(serve --entry prototype-home.html ${REPO_DIR}/stardust/prototypes/)

echo "{\"step\":5,\"status\":\"review\",\"deliverable\":\"${SERVE_URL}\",\"summary\":\"Generated N pixel-perfect HTML prototypes with real images, correct tokens, and matching layout.\"}" > /shared/of1-demo/step-5-status.json
```

Also write summary to `/shared/of1-demo/step-5-output.md`.

Do NOT call `sprinkle send`.
