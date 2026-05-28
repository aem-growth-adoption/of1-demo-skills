---
name: of1-snowflake
description: Convert stardust prototypes to EDS pages using the snowflake overlay skill, then install the OF1 block.
user-invocable: false
---

# OF1 Snowflake

Convert prototype HTML pages into EDS overlay pages using the snowflake methodology. This makes the pages editable in Document Authoring (DA) while preserving the original visual design byte-for-byte.

## ⚡ Speed Priority — Target: 5 minutes

- Everything you need is in THIS file — DO NOT trial-and-error auth methods or file paths
- DO NOT attempt multiple auth strategies — follow the exact commands below
- DO NOT verify things redundantly — one check per item is enough
- Generate ALL artifacts in one pass, then push once, upload once, preview once

---

## Inputs

- `DOMAIN`: Target domain (e.g., `frescopa.coffee`)
- Prototypes in `stardust/prototypes/*.html` or `deliverables/prototype-*.html` (from step 5)
- Design tokens in `stardust/current/DESIGN.json` (from step 4)
- Repo config from `/shared/of1-demo/repo-config.json`

## Step 0: Read Config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
CONTENT_PREFIX=$(echo "$REPO_CONFIG" | jq -r '.contentPrefix // .branch')
DA_CONTENT_PATH="/mnt/da/${BRANCH}"
```

---

## ⚠️ CRITICAL: The #1 Rule — Template Gets EVERYTHING Visual

**The template HTML must contain the COMPLETE visual DOM of the prototype page.** The DA content document only stores minimal text overrides that authors might edit. Images, layout, styling — ALL stay in the template.

### What goes WHERE:

| Artifact | Contains | Does NOT contain |
|----------|----------|------------------|
| **Template HTML** (`templates/{slug}.html`) | ALL images (as `<img src="...">` with absolute URLs), ALL layout structure, ALL decorative elements, ALL SVG icons, backgrounds, everything visual | Nothing removed — it IS the prototype's `<main>` with `data-slot` markers added to editable text |
| **Template CSS** (`styles/{slug}.css`) | ALL `<style>` content from the prototype, ALL visual styles, backgrounds, gradients, colors, spacing | Nothing — include everything |
| **DA content doc** | ONLY text headings, short text paragraphs, button labels, link URLs — marked with `data-slot="name"` in the template | NO images, NO complex HTML, NO layout. DA strips images! |
| **Header fragment** (`fragments/{slug}/header.html`) | Complete header DOM from prototype including logo, nav, banner — everything before `<main>` | Nothing removed |
| **Footer fragment** (`fragments/{slug}/footer.html`) | Complete footer DOM from prototype — everything after `</main>` | Nothing removed |

### WHY: DA Strips Images

DA's HTML→Markdown→HTML round-trip **removes ALL `<img>`, `<picture>`, `<svg>`, and `<video>` elements**. If you put image references in the DA content document, they will vanish. The ONLY safe approach is:

1. **Keep all images in the template HTML** (which is served from the code bus, NOT through DA)
2. **Only put plain text in DA slots** (headings, paragraphs, button labels)
3. If an image MUST be authorable, store its URL as plain text in a DA slot, and have the template use `data-slot` on the `<img>` element — the overlay JS (`writeSlot`) handles img elements specially by reading the src from the DA cell

### Template HTML Example (CORRECT):

```html
<!-- /templates/prototype-home.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">

<main>
  <section class="hero">
    <!-- Images STAY in the template — they are NOT DA slots -->
    <img src="https://frescopa.coffee/media/hero-hands-coffee.jpg" alt="Coffee" class="hero-bg">
    <div class="hero-content">
      <p class="hero-eyebrow" data-slot="eyebrow">MYBARISTA COFFEE QUIZ...</p>
      <h1 data-slot="heading">Your perfect coffee is four questions away!</h1>
      <a href="/quiz" class="btn-primary" data-slot="cta">Start Quiz Now</a>
    </div>
  </section>

  <section class="promo-banner">
    <!-- This entire section with its image stays in the template -->
    <img src="https://frescopa.coffee/media/coffee-cup-icon.png" alt="" class="promo-icon">
    <div class="promo-text">
      <h3 data-slot="promo-heading">Fall in love with coffee. Every single day!</h3>
      <p data-slot="promo-body">With a MyBarista subscription, you get hand-selected coffees delivered right to your door each month.</p>
    </div>
    <a href="/subscription" class="btn-secondary" data-slot="promo-cta">Shop Now</a>
  </section>

  <!-- MORE SECTIONS — all with full visual DOM preserved -->
</main>
```

### DA Content Document Example (CORRECT — minimal text only):

```html
<html>
<body>
<header></header>
<main>
  <div>
    <div class="hero">
      <div><div>eyebrow</div><div>MYBARISTA COFFEE QUIZ...</div></div>
      <div><div>heading</div><div><h1>Your perfect coffee is four questions away!</h1></div></div>
      <div><div>cta</div><div><a href="/quiz">Start Quiz Now</a></div></div>
    </div>
  </div>
  <div>
    <div class="promo-banner">
      <div><div>promo-heading</div><div><h3>Fall in love with coffee. Every single day!</h3></div></div>
      <div><div>promo-body</div><div>With a MyBarista subscription, you get hand-selected coffees delivered right to your door each month.</div></div>
      <div><div>promo-cta</div><div><a href="/subscription">Shop Now</a></div></div>
    </div>
  </div>
  <div>
    <div class="metadata">
      <div><div>template</div><div>prototype-home</div></div>
    </div>
  </div>
</main>
<footer></footer>
</body>
</html>
```

### WRONG Approach (What Causes Visual Degradation):

```html
<!-- ❌ WRONG — Putting images in DA content (they get stripped!) -->
<div class="hero">
  <div><div>background</div><div><img src="https://frescopa.coffee/media/hero.jpg"></div></div>
  <!-- ↑ THIS IMAGE WILL BE STRIPPED BY DA! -->
</div>

<!-- ❌ WRONG — Template with images removed (template should have them!) -->
<section class="hero">
  <div data-slot="background"></div>  <!-- Empty! Image was supposed to come from DA but DA stripped it -->
  <h1 data-slot="heading">...</h1>
</section>
```

---

## ⚠️ CRITICAL: EDS Class Name Collisions

EDS wraps the page header in `<div class="header-wrapper"><div class="header block">...</div></div>` and the footer in `<div class="footer-wrapper"><div class="footer block">...</div></div>`.

**If your fragment HTML uses `<header class="header">`, the CSS rule `.header { display: flex }` will target BOTH the EDS wrapper AND your element — breaking the layout.**

### Rules:

1. **NEVER use `class="header"` on the `<header>` element** — use `class="site-header"` instead
2. **NEVER use `class="footer"` on the `<footer>` element** — use `class="site-footer"` instead
3. **Always include these CSS resets** at the top of every template CSS file:

```css
/* EDS block wrapper resets — REQUIRED */
.header-wrapper { max-width: 100% !important; padding: 0 !important; }
.header.block { display: block !important; }
.footer-wrapper { max-width: 100% !important; padding: 0 !important; }
.footer.block { display: block !important; }
```

4. **Announcement bars** must be a SEPARATE element from the header, not nested inside `<header>`:

```html
<!-- ✅ CORRECT — announcement bar is its own div above header -->
<div class="announcement-bar">FREE SHIPPING...</div>
<header class="site-header">
  <a href="/" class="header-logo">...</a>
  <nav>...</nav>
</header>

<!-- ❌ WRONG — will render on one line because EDS .header.block applies flex -->
<header class="header">
  <div class="announcement-bar">...</div>
  <nav>...</nav>
</header>
```

### When creating the header fragment:

- Rename `<header class="header">` → `<header class="site-header">`
- Rename `.header {` → `.site-header {` in all CSS
- Keep any announcement/promo bar as a sibling div ABOVE the `<header>`

---

## Step 1: Understand the Overlay Engine

The substrate (`scripts.js`) is already installed in this repo. It does:

1. Reads `<meta name="template">` from the DA content → e.g., `prototype-home`
2. Fetches `/templates/prototype-home.html` (the full visual shell)
3. Reads slot data from the DA content blocks (`readBlockSlots()`)
4. Writes slot values into matching `[data-slot="name"]` elements in the template (`applySlotsToTemplate()`)
5. Replaces `main.innerHTML` with the populated template
6. Loads `/styles/prototype-home.css`
7. Header/footer blocks load `/fragments/prototype-home/header.html` and `footer.html`

**The visual result should be IDENTICAL to the prototype because the template IS the prototype.**

---

## Step 2: Generate All Artifacts

For each prototype in `stardust/prototypes/*.html` (or `deliverables/prototype-*.html`):

### 2a. Read and Parse the Prototype

Read the full prototype HTML. Parse it into:
- **Before `<main>`**: everything from `<body>` start to `<main>` → header fragment
- **`<main>` content**: the visual body → template HTML
- **After `</main>`**: everything after main to `</body>` → footer fragment
- **All `<style>` blocks** (anywhere in the document): → template CSS
- **All `<link>` tags** (Google Fonts, etc.): → prepended to template HTML

### 2b. Create Template HTML

The template is the prototype's `<main>` content with `data-slot` attributes added to editable text elements.

**Rules for adding `data-slot`:**
- Add `data-slot="unique-name"` to `<h1>`, `<h2>`, `<h3>`, `<h4>` headings that contain human-readable text
- Add `data-slot="unique-name"` to `<p>` elements with substantial body text (more than just a class name)
- Add `data-slot="unique-name"` to `<a>` elements that are visible buttons/CTAs
- Do NOT add data-slot to decorative elements, icons, images, or structural markup
- Do NOT remove ANY element from the prototype — the template keeps everything
- Each slot name must be unique within its section (use descriptive names: `heading`, `subheading`, `body`, `cta`, `price`, etc.)

**Image handling in the template:**
- ALL `<img>` elements keep their `src` attributes pointing to the live site URLs (absolute)
- ALL background-image CSS stays in the stylesheet
- ALL SVG icons stay inline
- If the prototype uses relative image paths, convert them to absolute URLs pointing to the live site

```bash
mkdir -p ${REPO_DIR}/templates
# Write templates/{slug}.html — the FULL <main> content with data-slot markers
# Prepend any <link> tags (fonts) before <main>
```

### 2c. Create Template CSS

Extract ALL `<style>` blocks from the prototype into a single CSS file. This includes:
- All layout CSS (grid, flexbox, positioning)
- All colors, backgrounds, gradients
- All typography (font-family, font-size, etc.)
- All spacing (margin, padding)
- All responsive media queries
- All animations/transitions

**Add `@import` or `@font-face` for any Google Fonts** the prototype uses.

**CRITICAL: CSS MUST start with these EDS reset rules:**
```css
/* EDS block wrapper resets — REQUIRED at top of every template CSS */
.header-wrapper { max-width: 100% !important; padding: 0 !important; }
.header.block { display: block !important; }
.footer-wrapper { max-width: 100% !important; padding: 0 !important; }
.footer.block { display: block !important; }
```

**CRITICAL: Add full-bleed wrapper overrides.** For any section that should be full-width (hero, banners, full-bleed images):
```css
.hero-wrapper,
.promo-banner-wrapper,
.store-locator-wrapper {
  max-width: 100% !important;
  padding: 0 !important;
}
```

EDS wraps each section in a `.<section-class>-wrapper` div with `max-width: 1440px` by default. Without the override, full-bleed sections get constrained.

**CRITICAL: Rename `.header` to `.site-header` in all CSS rules:**
```css
/* ❌ WRONG — collides with EDS .header.block */
.header { display: flex; align-items: center; ... }

/* ✅ CORRECT — unique class, no collision */
.site-header { display: flex; align-items: center; ... }
```

```bash
mkdir -p ${REPO_DIR}/styles
# Write styles/{slug}.css
```

### 2d. Create Header/Footer Fragments

The header fragment is everything in the prototype before `<main>` (nav bar, announcement banners, etc.).
The footer fragment is everything after `</main>` (footer links, copyright, etc.).

**Keep the FULL DOM and styling.** Do not simplify or redesign. The fragments should render identically to the prototype's header/footer.

**CRITICAL RENAMING:**
- Change `<header class="header">` → `<header class="site-header">` in the fragment
- Change `<footer class="footer">` → `<footer class="site-footer">` if applicable
- Keep announcement bars as a SEPARATE div above `<header>`, not inside it

**Logo in footer:** The footer logo SVG must be the SAME complete SVG as the header logo, but with fill colors changed for dark background (e.g., `fill="#F4E9DC"` instead of `fill="#58181d"`). Never use a truncated or partial SVG.

If the header/footer have their own `<style>` tags, include those styles in the fragment HTML (as inline `<style>`) OR in the template CSS file.

```bash
mkdir -p ${REPO_DIR}/fragments/{slug}
# Write fragments/{slug}/header.html — complete header DOM (with .site-header class)
# Write fragments/{slug}/footer.html — complete footer DOM
```

### 2e. Create DA Content Documents

The DA content document is MINIMAL — it only contains text that authors might edit, structured as slot name/value pairs in block divs.

**What to include as DA slots:**
- Main headings (h1, h2, h3) — slot them
- Body paragraphs with meaningful text — slot them
- Button/CTA text and links — slot them
- Prices (if text) — slot them

**What to EXCLUDE from DA slots (keep only in template):**
- Images (DA strips them!)
- SVG icons
- Decorative text (decorative labels that shouldn't change)
- Layout-only elements
- Navigation links (those stay in the header fragment)
- Footer content (stays in footer fragment)

```bash
mkdir -p ${REPO_DIR}/.snowflake/projects/1-{slug}/da
# Write .snowflake/projects/1-{slug}/da/{slug}.html
```

The DA content doc MUST have a metadata section at the end:
```html
<div>
  <div class="metadata">
    <div><div>template</div><div>{slug}</div></div>
  </div>
</div>
```

---

## Step 3: Verify Substrate is Installed

```bash
grep -q "applyTemplateOverlay\|loadTemplate\|overlay" ${REPO_DIR}/scripts/scripts.js 2>/dev/null && echo "SUBSTRATE OK" || echo "NEEDS INSTALL"
```

If already installed (which it should be in the of1-demo repo), skip to Step 4.

If NOT installed, read `/workspace/skills/snowflake/knowledge/architecture.md` for the full substrate code.

---

## Step 4: Install OF1 Block

```bash
cd "$REPO_DIR"
mkdir -p blocks/of1
cp /workspace/skills/of1-snowflake/assets/of1.js blocks/of1/of1.js
cp /workspace/skills/of1-snowflake/assets/of1-base.css blocks/of1/of1.css
```

---

## Step 5: Push Code to Git (ONE push)

```bash
cd "$REPO_DIR"
git add templates/ styles/ fragments/ .snowflake/ blocks/of1/ scripts/
git commit -m "feat: snowflake conversion + OF1 block for ${DOMAIN}"
git push origin ${BRANCH}
```

---

## Step 6: Upload DA Content via Mount

### ⚠️ CRITICAL — READ THIS BEFORE DOING ANYTHING WITH DA

| Action | Method | Notes |
|--------|--------|-------|
| Write content to DA | `cp file /mnt/da/{BRANCH}/page.html` | Mount handles auth automatically |
| Get IMS token | `oauth-token adobe` | Instant, no browser flow needed |
| Trigger preview | `curl -X POST admin.hlx.page/preview/...` | Include both auth headers |
| ~~Upload via API~~ | ~~`curl admin.da.live`~~ | **BLOCKED — will fail with "forbidden"** |
| ~~Use da-auth-helper~~ | ~~`npx da-auth-helper`~~ | **DOESN'T EXIST in this env** |
| ~~Read ~/.aem/da-token.json~~ | ~~`cat ~/.aem/...`~~ | **FILE DOESN'T EXIST** |

### Upload content:

```bash
# The mount at /mnt/da/ = root of da://aem-growth-adoption/of1-demo
# Content for this demo lives in /mnt/da/{BRANCH}/ subfolder
# IMPORTANT: Use ${BRANCH} (e.g., "frescopa-2"), NOT the domain name!

mkdir -p "${DA_CONTENT_PATH}" 2>/dev/null

# Upload all DA docs
for PROJECT_DIR in ${REPO_DIR}/.snowflake/projects/*/da/; do
  for DOC in ${PROJECT_DIR}*.html; do
    [ -f "$DOC" ] || continue
    BASENAME=$(basename "$DOC")
    cp "$DOC" "${DA_CONTENT_PATH}/${BASENAME}"
    echo "✓ ${DA_CONTENT_PATH}/${BASENAME}"
  done
done

# Create OF1 page
cat > "${DA_CONTENT_PATH}/of1.html" <<EOF
<html>
<body>
  <header></header>
  <main>
    <div>
      <div class="of1">
        <div><div>domain</div><div>${BRANCH}--${REPO}--${OWNER}</div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
EOF
echo "✓ ${DA_CONTENT_PATH}/of1.html"
```

---

## Step 7: Trigger Preview

```bash
DA_TOKEN=$(oauth-token adobe)

for DOC in ${DA_CONTENT_PATH}/*.html; do
  [ -f "$DOC" ] || continue
  PAGE_SLUG=$(basename "$DOC" .html)
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/${PAGE_SLUG}")
  echo "Preview ${BRANCH}/${PAGE_SLUG}: ${RESP}"
done
```

Note: The content prefix in the preview URL is `${BRANCH}` (same as the branch name), NOT the domain.

---

## Step 8: Verify Pages Render

```bash
for DOC in ${DA_CONTENT_PATH}/*.html; do
  [ -f "$DOC" ] || continue
  PAGE_SLUG=$(basename "$DOC" .html)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/${PAGE_SLUG}")
  echo "${BRANCH}/${PAGE_SLUG}: ${CODE}"
done
```

Expected: all return `200`.

---

## Step 9: Screenshot Diff Loop (max 3 iterations per page)

For each content page (skip of1), compare EDS preview against the prototype:

1. **Open the EDS preview page in a browser tab:**
   ```bash
   playwright-cli navigate "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/${PAGE_SLUG}" --tab <tab_id>
   ```

2. **Screenshot both:**
   ```bash
   playwright-cli screenshot --tab <eds_tab_id> /tmp/preview-${PAGE_SLUG}.png
   # For the prototype, open the file or use serve:
   serve --entry ${PAGE_SLUG}.html ${REPO_DIR}/stardust/prototypes
   playwright-cli screenshot --tab <proto_tab_id> /tmp/proto-${PAGE_SLUG}.png
   ```

3. **Compare visually** — open both screenshots side by side:
   ```bash
   open --view /tmp/preview-${PAGE_SLUG}.png
   open --view /tmp/proto-${PAGE_SLUG}.png
   ```

4. **Fix or accept:**
   - **Missing images** → Image URL in template is wrong or template doesn't have the image. Fix the template HTML and re-push.
   - **Wrong layout** → CSS is missing full-bleed overrides or section structure was altered. Fix the CSS.
   - **Missing sections** → DA content is missing a section block, or the template `<section>` class doesn't match. Verify the section class names match between template and DA doc.
   - **Unstyled footer/header** → Fragment HTML is incomplete or missing styles. Add styles to the fragment or template CSS.
   - **After 3 iterations** → accept with note about remaining differences

### Common Fixes:

| Problem | Cause | Fix |
|---------|-------|-----|
| Images missing | Image was put in DA instead of template | Move image back to template HTML |
| Hero is narrow (not full-width) | Missing wrapper override | Add `.hero-wrapper { max-width: 100% !important; padding: 0 !important; }` to CSS |
| Footer is unstyled list | Footer fragment missing CSS | Add footer styles to template CSS or as inline `<style>` in footer fragment |
| Background colors missing | CSS wasn't fully extracted from prototype | Re-extract ALL styles including section backgrounds |
| Font is wrong/fallback | Google Fonts `<link>` not in template | Add `<link>` tags at top of template HTML (before `<main>`) |
| Section missing entirely | Section class in template doesn't match DA block name | Ensure class names match exactly |

---

## 🚫 Common Mistakes That Waste Time

| Mistake | Time wasted | Correct approach |
|---------|-------------|------------------|
| Putting images in DA content | 10+ min (images vanish, debug why) | Keep ALL images in template HTML |
| Stripping visual elements from template | 10+ min (page looks bare) | Template = FULL prototype `<main>`, nothing removed |
| Using `class="header"` on `<header>` element | 10+ min (nav/banner on same line) | Use `class="site-header"` — EDS reserves `.header` |
| Missing EDS block reset CSS rules | 10+ min (header/footer broken layout) | Add `.header.block { display: block !important; }` at top of CSS |
| Announcement bar nested inside `<header>` | 5+ min (renders on same line as nav) | Keep announcement bar as separate div ABOVE `<header>` |
| Footer logo SVG truncated/partial | Broken logo forever | Use the SAME complete SVG as header, change fill colors for dark bg |
| Trying `curl` to `admin.da.live` | 3-5 min | Use `/mnt/da/` mount |
| Running `npx da-auth-helper` | 2-3 min | Use `oauth-token adobe` |
| Writing to `/mnt/da/{domain}/` instead of `/mnt/da/{BRANCH}/` | 5 min debugging | DA path uses BRANCH name (e.g., `frescopa-2`), not domain |
| Using URL path `/{page}` without branch prefix | 2 min debugging 404s | URL path is `/${BRANCH}/${page}` |
| Not including full-bleed wrapper overrides in CSS | 5 min debugging narrow sections | Add `.<section>-wrapper { max-width: 100% !important; }` |
| Not including Google Fonts links in template | 3 min debugging wrong fonts | Add `<link>` tags at top of template HTML |
| Multiple git pushes | 2-3 min | ONE push after all artifacts are created |
| Using node/npm | 1 min | Node is a shim. Don't use npm/npx |
| Setting OF1 domain to site domain | 5+ min debugging | Use tenant ID: `${BRANCH}--${REPO}--${OWNER}` |
| Simplifying/redesigning the footer | 5+ min debugging unstyled footer | Keep the EXACT footer DOM from prototype |

---

## Deliverables

- `templates/*.html` — one per page (FULL visual DOM with data-slot markers)
- `styles/*.css` — one per page (ALL CSS from prototype + wrapper overrides)
- `fragments/{slug}/header.html` + `footer.html` — one pair per page (complete DOM)
- `.snowflake/projects/*/da/*.html` — DA content docs (minimal text-only slots)
- `blocks/of1/of1.js` + `blocks/of1/of1.css` — OF1 generative block
- `scripts/scripts.js` — substrate (overlay engine, should already exist)
- All pages return 200 on EDS preview
- Code pushed to branch `${BRANCH}`
- DA content uploaded via mount to `/mnt/da/${BRANCH}/`

---

## Completion

```bash
mkdir -p /shared/of1-demo

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}"

DELIVERABLES="["
FIRST=true
for DOC in ${DA_CONTENT_PATH}/*.html; do
  [ -f "$DOC" ] || continue
  PAGE_SLUG=$(basename "$DOC" .html)
  URL="${PREVIEW_BASE}/${PAGE_SLUG}"
  if [ "$FIRST" = true ]; then
    DELIVERABLES="${DELIVERABLES}{\"url\":\"${URL}\",\"label\":\"${PAGE_SLUG}\"}"
    FIRST=false
  else
    DELIVERABLES="${DELIVERABLES},{\"url\":\"${URL}\",\"label\":\"${PAGE_SLUG}\"}"
  fi
done
DELIVERABLES="${DELIVERABLES}]"

echo "{\"step\":6,\"status\":\"review\",\"deliverables\":${DELIVERABLES},\"summary\":\"Snowflake overlay conversion complete. All pages published to AEM preview.\"}" > /shared/of1-demo/step-6-status.json
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
