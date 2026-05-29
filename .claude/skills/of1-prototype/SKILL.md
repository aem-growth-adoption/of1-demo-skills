---
name: of1-prototype
description: Generate pixel-perfect HTML prototypes of key pages from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Prototype

Generate pixel-perfect, self-contained HTML reproductions of key pages from the target website by invoking the `stardust:prototype` plugin. These prototypes are the source-of-truth for the snowflake overlay conversion in Step 6.

## ⚡ Speed Priority — Target: 8 minutes

- Invoke `stardust:prototype` to do the heavy lifting — do NOT reimplement prototype logic
- ONE git commit + push at the end

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

### Step 2: Invoke stardust:prototype

Use the Skill tool to invoke `stardust:prototype`. This reads the extraction output from `stardust/current/` and generates pixel-perfect HTML prototypes for each extracted page.

```
Skill: stardust:prototype
```

The plugin will:
1. Read design tokens from `stardust/current/DESIGN.json`
2. Read logo from `stardust/current/assets/logo.svg`
3. Use real images extracted from the live site (exact URLs)
4. Generate self-contained HTML files with all CSS inlined
5. Run screenshot diff loops to verify visual fidelity
6. Write prototypes to `stardust/prototypes/`

### Step 3: Verify prototype outputs

```bash
cd "$REPO_DIR"
ls stardust/prototypes/prototype-*.html && echo "Prototypes OK"
```

If any expected page is missing, check `stardust/state.json` for extraction status and re-invoke if needed.

### Step 4: Post-generation fixes (CRITICAL)

After `stardust:prototype` generates the prototypes, verify and fix these common issues:

#### 4a. Logo completeness

Check that the logo SVG in the prototype is the FULL brand logotype:
```bash
# The logo in stardust/current/assets/logo.svg should be the complete file
# downloaded directly from the site (e.g., from /icons/logo.svg or extracted from DOM)
# Verify it renders the full wordmark — not just a partial path
```

If the logo is truncated or incomplete:
1. Download the real logo SVG directly from the site: `curl -s "https://${DOMAIN}/icons/logo.svg"` (or find it via playwright)
2. Save to `stardust/current/assets/logo.svg`
3. Update both header AND footer logo in the prototypes

**Footer logo:** Must use the SAME complete SVG as the header, but with fill colors changed for the dark footer background (e.g., `fill="#F4E9DC"` instead of `fill="#58181d"`).

#### 4b. CSS class naming — avoid EDS collisions

Check the prototype HTML for these class names and rename them:

| If prototype uses | Rename to | Why |
|-------------------|-----------|-----|
| `class="header"` on `<header>` | `class="site-header"` | EDS reserves `.header` for its block wrapper |
| `class="footer"` on `<footer>` | `class="site-footer"` | EDS reserves `.footer` for its block wrapper |
| `.header {` in CSS | `.site-header {` | Same collision — CSS targets EDS wrapper too |
| `.footer {` in CSS | `.site-footer {` | Same collision |

**Why this matters:** EDS wraps content in `<div class="header-wrapper"><div class="header block">...</div></div>`. If the prototype uses `<header class="header">`, the snowflake step will inherit this collision and the nav will render incorrectly.

#### 4c. Announcement bar structure

If the site has an announcement/promo bar above the nav, ensure it's a **separate element** from the header — NOT nested inside `<header>`:

```html
<!-- ✅ CORRECT -->
<div class="announcement-bar">FREE SHIPPING FROM $35...</div>
<header class="site-header">
  <a href="/" class="header-logo"><svg>...</svg></a>
  <nav>...</nav>
</header>

<!-- ❌ WRONG — will break in EDS snowflake -->
<header class="header">
  <div class="announcement">...</div>
  <nav>...</nav>
</header>
```

### Step 5: Copy to deliverables + commit

```bash
cd "$REPO_DIR"
mkdir -p deliverables
cp stardust/prototypes/prototype-*.html deliverables/

git add deliverables/prototype-*.html stardust/prototypes/ stardust/current/assets/
git commit -m "feat: pixel-perfect HTML prototypes for ${DOMAIN}"
git push origin ${BRANCH}
```

**NOTE:** `stardust/` may be in `.gitignore`. Always commit to `deliverables/` — that's what gets served on EDS and reviewed.

---

## CRITICAL: Pixel-Perfect Copy — No Redesign, No Placeholders

The `stardust:prototype` plugin already enforces this, but for clarity:

- **Use real images** from the live site (exact URLs extracted during crawl)
- **Inline the brand logo SVG** in the nav/header
- **Match design tokens exactly** (colors, fonts, spacing)
- **No placeholder images**, colored boxes, gradient divs, or emoji
- **No redesign** — faithful reproduction only

---

## Lessons Learned

Cross-cutting rules (logo completeness, EDS class collisions, announcement-bar placement, image format/placeholders) are in `of1-demo/knowledge/common-pitfalls.md`. Prototype-specific gotchas:

| Mistake | Impact | Prevention |
|---------|--------|------------|
| Heroes set to `100vh` | Way too tall — sites typically use 200-400px | Check actual height from live site; do not assume full viewport |
| Cards with invented box-shadows | Over-designed vs. the original | Only add shadows if the live site has them; pixel-perfect copy means matching, not improving |

---

## Expected Output Structure

```
{REPO_DIR}/
├── stardust/
│   └── prototypes/                     ← Generated by stardust:prototype
│       ├── prototype-home.html
│       ├── prototype-{page2}.html
│       └── prototype-{page3}.html
└── deliverables/
    ├── prototype-home.html             ← Committed copies for review
    ├── prototype-{page2}.html
    └── prototype-{page3}.html
```

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
