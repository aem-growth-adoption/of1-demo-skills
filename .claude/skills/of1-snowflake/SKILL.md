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

## Platform context

This skill runs in both SLICC and Claude Code. Resolve these symbols up-front — the rest of the skill uses them by name and assumes you've read this section.

| Symbol | SLICC default | Claude Code override |
|---|---|---|
| `$STATE_DIR` | `/shared/of1-demo` | `$OF1_STATE_DIR` (e.g. `<project>/.of1/state`) |
| `$SKILL_DIR` | `/workspace/skills/of1-snowflake` | `<plugin-dir>/of1-snowflake` (absolute path to this skill, set by orchestrator) |
| `$DA_TOKEN` | `$(oauth-token adobe)` | `$ADOBE_IMS_TOKEN`, or `$(jq -r .access_token "$OF1_TOKEN_FILE")` |
| `playwright-cli` action verbs | `visit`, `navigate` | `open` |
| `playwright-cli` output flag | `--output <path>` | `--filename <path>` |

`$REPO_DIR`, `$OWNER`, `$REPO`, `$BRANCH`, `$DOMAIN`, `$CONTENT_PREFIX` come from `"$STATE_DIR/repo-config.json"` (written by `of1-branch-setup`).

Multi-line operations:

### Platform: DA upload (single file)
- **SLICC:** `cp <local> /mnt/da/<owner>/<repo>/<branch>/<file>.html` (mount handles auth)
- **Claude Code:** `cat <local> | curl -s -X PUT -H "Authorization: Bearer $DA_TOKEN" -H "Content-Type: text/html" --data-binary @- "https://admin.da.live/source/<owner>/<repo>/<branch>/<file>.html"`

### Platform: DA list (files in a branch directory)
- **SLICC:** `ls /mnt/da/<branch>/*.html` returns local paths
- **Claude Code:** `curl -s -H "Authorization: Bearer $DA_TOKEN" "https://admin.da.live/list/<owner>/<repo>/<branch>"` returns JSON; iterate `.[] | select(.ext == "html") | .name`

### Platform: Static serve (returns a URL)
- **SLICC:** `SERVE_URL=$(serve --entry <file> <dir>)`
- **Claude Code:** `(cd <dir> && python3 -m http.server <port>) &`; `SERVE_URL="http://localhost:<port>/<file>"`

### Platform: `playwright-cli` tab targeting
- **SLICC:** pass `--tab=<id>` on the action call
- **Claude Code:** run `playwright-cli tab-select <id>` first, then call the action without `--tab`

**Note on literal commands in code blocks:** Code blocks below use the SLICC form by default. When running in Claude Code, apply the renames above as you go.

---

## Inputs

- `DOMAIN`: Target domain (e.g., `frescopa.coffee`)
- Prototypes in `stardust/prototypes/*.html` or `deliverables/prototype-*.html` (from step 5)
- Design tokens in `stardust/current/DESIGN.json` (from step 4)
- Repo config from `"$STATE_DIR/repo-config.json"`

## Step 0: Read Config

```bash
REPO_CONFIG=$(cat "$STATE_DIR/repo-config.json")
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
CONTENT_PREFIX=$(echo "$REPO_CONFIG" | jq -r '.contentPrefix // .branch')
```

Note: in SLICC the `/mnt/da/${BRANCH}` mount is also available for filesystem-style DA access; in Claude Code use the DA list/upload curl forms from Platform context.

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

## Step 2: Generate All Artifacts (USE THE TOOL)

**⚡ FAST PATH — Use `snowflake-split.py` for mechanical transformation:**

```bash
cd "$REPO_DIR"

# Run the tool for each prototype — generates templates, CSS, fragments, and DA docs automatically
for PROTO in stardust/prototypes/prototype-*.html deliverables/prototype-*.html; do
  [ -f "$PROTO" ] || continue
  python3 "$SKILL_DIR/assets/snowflake-split.py" "$PROTO" \
    --output-dir "$REPO_DIR" \
    --branch "$BRANCH" \
    --owner "$OWNER" \
    --repo "$REPO"
done
```

This generates ALL mechanical artifacts in ~2 seconds. The scoop's job is then LIMITED to:
1. Verify the tool output looks correct (quick scan)
2. Fix any creative issues (e.g., slot names that should be different)
3. Install the OF1 block (Step 4)
4. Push code, upload DA, trigger preview (Steps 5-7)
5. Screenshot diff loop (Step 9)

**Only fall back to manual generation if the tool produces incorrect output.**

---

### Manual generation reference (if tool fails)

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

If NOT installed, read the snowflake plugin's architecture doc:
- **SLICC:** `/workspace/skills/snowflake/knowledge/architecture.md`
- **Claude Code:** `<plugin-dir>/aem-edge-delivery-services/skills/snowflake/knowledge/architecture.md` (sibling skill in the AEM EDS plugin)

---

## Step 4: Install OF1 Block AND overlay-aware header/footer JS

The OF1 page (and all other snowflake-overlay pages) need a **custom** `blocks/header/header.js` and `blocks/footer/footer.js` that read `main.dataset.overlay` and fetch the matching `/fragments/<template>/{header,footer}.html`. Without this, the EDS boilerplate `header.js` / `footer.js` fetches the stock `/nav.html` and `/footer.html` — which contain placeholder text and have no relationship to the per-template fragments. Symptom: the OF1 page shows "Brand | Link 1" + "Footer content" instead of the branded chrome.

These files are runtime-agnostic — the same JS works for every demo — so they ship as skill assets:

```bash
cd "$REPO_DIR"

# OF1 block
mkdir -p blocks/of1
cp "$SKILL_DIR/assets/of1.js"      blocks/of1/of1.js
cp "$SKILL_DIR/assets/of1-template.css" blocks/of1/of1.css

# Overlay-aware header/footer JS — REQUIRED for OF1 + every snowflake page
# (the stock EDS versions are 170+ lines and fetch /nav.html instead)
cp "$SKILL_DIR/assets/header.js" blocks/header/header.js
cp "$SKILL_DIR/assets/footer.js" blocks/footer/footer.js
```

**Verify after copy:**
```bash
# header.js should be ~20 lines, footer.js ~18 lines, NOT the 170-line boilerplate
wc -l blocks/header/header.js blocks/footer/footer.js
# Each MUST contain a fetch() call referencing /fragments/${template}/
grep -E "fragments/\\$\\{template\\}" blocks/header/header.js blocks/footer/footer.js
```

If `header.js` or `footer.js` is the long boilerplate version, the copy didn't happen — re-run the `cp` commands above before committing.

---

## Step 5: Push Code to Git (ONE push)

```bash
cd "$REPO_DIR"
git add templates/ styles/ fragments/ .snowflake/ \
        blocks/of1/ blocks/header/header.js blocks/footer/footer.js \
        scripts/
git commit -m "feat: snowflake conversion + OF1 block for ${DOMAIN}"
git push origin ${BRANCH}
```

**Why `blocks/header/header.js` and `blocks/footer/footer.js` specifically:** these two files are overwritten by Step 4 with the overlay-aware versions. They MUST be in the commit, otherwise the EDS boilerplate versions stay live on the branch and the OF1 page renders the stock nav/footer placeholders instead of the branded fragments.

---

## Step 6: Upload DA Content (USE THE TOOL)

**⚡ FAST PATH — Use `da-upload.sh` for one-command upload + preview + verify:**

```bash
bash "$SKILL_DIR/assets/da-upload.sh" \
  --branch "$BRANCH" --owner "$OWNER" --repo "$REPO" \
  "$REPO_DIR"/.snowflake/projects/*/da/*.html
```

This handles mount-first-then-API fallback (when running in SLICC) or pure-API upload (Claude Code), triggers preview, and verifies each page returns 200. If all succeed, skip to Step 9 (screenshot diff).

**Only use the manual approach below if the tool fails.**

### ⚠️ Manual approach — READ THIS BEFORE DOING ANYTHING WITH DA

For DA upload, use the platform's DA upload form from Platform context. Don't try alternative auth strategies — `npx da-auth-helper` and `~/.aem/da-token.json` are myths in both runtimes.

### Upload content:

```bash
# Resolve DA_TOKEN from Platform context.
# Upload all DA docs via the platform's DA upload form.

for PROJECT_DIR in "$REPO_DIR"/.snowflake/projects/*/da/; do
  for DOC in "$PROJECT_DIR"*.html; do
    [ -f "$DOC" ] || continue
    BASENAME=$(basename "$DOC")
    cat "$DOC" | curl -s -X PUT \
      -H "Authorization: Bearer ${DA_TOKEN}" \
      -H "Content-Type: text/html" \
      --data-binary @- \
      "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${BASENAME}"
    echo "✓ uploaded: ${BASENAME}"
  done
done

# SLICC-only fast path: if /mnt/da is mounted, `cp` is faster than curl PUT for many files.
# Skip this block in Claude Code.
if [ -d "/mnt/da/${BRANCH}" ]; then
  for PROJECT_DIR in "$REPO_DIR"/.snowflake/projects/*/da/; do
    cp -f "$PROJECT_DIR"*.html "/mnt/da/${BRANCH}/" 2>/dev/null
  done
fi

# Create OF1 page (uses the curl PUT form — works in both runtimes)
cat <<EOF | curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  --data-binary @- \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/of1.html"
<html>
<body>
  <header></header>
  <main>
    <div>
      <div class="of1">
        <div><div><p>domain</p></div><div><p>${BRANCH}--${REPO}--${OWNER}</p></div></div>
      </div>
    </div>
    <div>
      <div class="metadata">
        <div><div><p>template</p></div><div><p>prototype-home</p></div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
EOF
echo "✓ of1.html"
```

### ⚠️ DA Content Format — EXACT bytes EDS expects

**THIS IS THE #1 SOURCE OF BUGS.** EDS expects a very specific HTML structure in DA content. Copy this format EXACTLY:

```html
<html>
<body>
  <header></header>
  <main>
    <div>
      <div class="hero">
        <div><div><p>heading</p></div><div><h1>Your perfect coffee is four questions away!</h1></div></div>
        <div><div><p>subheading</p></div><div><p>Take our quick quiz to find your ideal roast profile.</p></div></div>
        <div><div><p>cta</p></div><div><p><a href="/quiz">Start Quiz Now</a></p></div></div>
      </div>
    </div>
    <div>
      <div class="promo-banner">
        <div><div><p>heading</p></div><div><h3>Fall in love with coffee. Every single day!</h3></div></div>
        <div><div><p>body</p></div><div><p>Hand-selected coffees delivered right to your door each month.</p></div></div>
      </div>
    </div>
    <div>
      <div class="metadata">
        <div><div><p>template</p></div><div><p>prototype-home</p></div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

**FORMAT RULES (violating ANY of these breaks the page):**
1. Every cell text MUST be wrapped in `<p>` tags: `<div><p>slot-name</p></div>`
2. Headings keep their tags inside the `<p>` wrapper: `<div><h1>text</h1></div>` — BUT the slot name cell is always `<p>`
3. Links go inside `<p>`: `<div><p><a href="...">text</a></p></div>`
4. The metadata block MUST be the LAST section (last `<div>` child of `<main>`)
5. `<header></header>` and `<footer></footer>` tags MUST be present (even if empty)
6. Each section is one `<div>` directly inside `<main>` containing one block-class div
7. **NEVER use `--data-binary @/path/to/file`** — always pipe via `cat file | curl ... --data-binary @-`

**What happens if you get the format wrong:**
- Missing `<p>` wrappers → EDS sees empty cells → page renders with empty `<div></div>` in main
- Missing metadata block → no `<meta name="template">` in output → overlay engine never activates
- Wrong structure → EDS can't parse blocks → page shows nothing

---

## Step 7: Trigger Preview

Build the list of page slugs using the platform's DA list form, then trigger preview for each.

**SLICC** (mount):
```bash
PAGE_SLUGS=$(ls /mnt/da/${BRANCH}/*.html 2>/dev/null | xargs -n1 basename | sed 's/\.html$//')
```

**Claude Code** (DA list API):
```bash
PAGE_SLUGS=$(curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/list/${OWNER}/${REPO}/${BRANCH}" \
  | jq -r '.[] | select(.ext == "html") | .name')
```

Then in both runtimes:

```bash
for PAGE_SLUG in $PAGE_SLUGS; do
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
for PAGE_SLUG in $PAGE_SLUGS; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/${PAGE_SLUG}")
  echo "${BRANCH}/${PAGE_SLUG}: ${CODE}"
done
```

Expected: all return `200`.

---

## Step 9: Screenshot Diff Loop (max 3 iterations per page)

For each content page (skip of1), compare EDS preview against the prototype:

1. **Open the EDS preview page in a browser tab** (apply playwright-cli tab-targeting per Platform context):
   ```bash
   playwright-cli navigate "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/${PAGE_SLUG}" --tab <tab_id>
   ```

2. **Screenshot both:**
   ```bash
   playwright-cli screenshot --tab <eds_tab_id> --output /tmp/preview-${PAGE_SLUG}.png
   # For the prototype, serve it using the platform's static-serve form, then screenshot:
   #   (Platform context → "Static serve")
   playwright-cli screenshot --tab <proto_tab_id> --output /tmp/proto-${PAGE_SLUG}.png
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

Cross-cutting rules (DA strips images, EDS class collisions, `<p>` wrappers, full-bleed wrapper overrides, curl pitfalls, branch-vs-domain path patterns, tenant ID format, SLICC Node.js shim, one-commit-per-step) all live in `of1-demo/knowledge/common-pitfalls.md`. Read it before troubleshooting.

Snowflake-specific pitfalls (the ones unique to the prototype → EDS transform):

| Mistake | Time wasted | Correct approach |
|---------|-------------|------------------|
| Stripping visual elements from the template | 10+ min (page looks bare) | Template = FULL prototype `<main>`, nothing removed. Only ADD `data-slot` markers; never DELETE elements. |
| Missing Google Fonts `<link>` tags in template | 3+ min debugging wrong fonts | Prepend the prototype's `<link>` tags (fonts, preconnect) to the top of the template HTML, before `<main>` |
| Simplifying/redesigning the footer fragment | 5+ min debugging unstyled footer | Keep the EXACT footer DOM from the prototype — including any inline `<style>` blocks |

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
- DA content uploaded to `da://${OWNER}/${REPO}/${BRANCH}/` (mount in SLICC, admin.da.live API in Claude Code)

---

## OF1 Page Setup (REQUIRED)

After converting the prototype pages, you MUST also set up the OF1 block page with a "passthrough" template that loads the branded header/footer without replacing the main content.

### 1. Create the OF1 passthrough template

```bash
# Create of1 template (passthrough — keeps OF1 block, only provides header/footer)
mkdir -p ${REPO_DIR}/templates
cat > ${REPO_DIR}/templates/of1.html << 'TMPL'
<main data-overlay="of1">
  <div class="of1-container" data-slot-passthrough="true">
  </div>
</main>
TMPL

# Copy header/footer fragments from the first prototype template
FIRST_TEMPLATE=$(ls ${REPO_DIR}/fragments/ | head -1)
mkdir -p ${REPO_DIR}/fragments/of1
cp ${REPO_DIR}/fragments/${FIRST_TEMPLATE}/header.html ${REPO_DIR}/fragments/of1/header.html
cp ${REPO_DIR}/fragments/${FIRST_TEMPLATE}/footer.html ${REPO_DIR}/fragments/of1/footer.html

# Create a minimal styles/of1.css with ONLY header/footer/body chrome
# (Step 8 will overwrite this with a proper branded version including page chrome)
# For now, copy prototype CSS so the OF1 page renders correctly even before Step 8 runs
cp ${REPO_DIR}/styles/prototype-home.css ${REPO_DIR}/styles/of1.css
```

### 2. Add passthrough support to scripts.js

In the `applyTemplateOverlay` function, add this check BEFORE the "Replace main content" line:

```javascript
  // Check for passthrough mode — if template has data-slot-passthrough,
  // only load header/footer but keep original main content (for OF1 block pages)
  if (templateMain.querySelector('[data-slot-passthrough]')) {
    main.dataset.overlay = templateName;
    // CRITICAL: Passthrough still needs standard block decoration so the OF1 block JS runs
    decorateMain(main);
    await loadSection(main.querySelector('.section'), waitForFirstImage);
    return true;
  }
```

**⚠️ CRITICAL:** The passthrough MUST call `decorateMain(main)` and `loadSection()` before returning `true`. Without this, blocks in `<main>` (like the OF1 block) will never have their `decorate()` function called, and the page renders as raw unstyled DA content. Passthrough means "skip DOM replacement" — NOT "skip block decoration."

This ensures the overlay engine loads the branded header/footer fragments, decorates blocks normally, but does NOT replace `<main>` content when the template is marked as passthrough.

### 3. Create OF1 DA content

```bash
# DA_TOKEN comes from Platform context.

OF1_HTML='<html><body><header></header><main><div><table><tr><th colspan="2">of1</th></tr><tr><td><p>api-endpoint</p></td><td><p>https://of1-gen-web-service.franklin-prod.workers.dev</p></td></tr><tr><td><p>domain</p></td><td><p>'${BRANCH}'--'${REPO}'--'${OWNER}'</p></td></tr></table></div><div><table><tr><th colspan="2">Metadata</th></tr><tr><td><p>template</p></td><td><p>of1</p></td></tr><tr><td><p>nav</p></td><td><p>/'${BRANCH}'/nav</p></td></tr><tr><td><p>footer</p></td><td><p>/'${BRANCH}'/footer</p></td></tr></table></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$OF1_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/of1.html"

# Preview the OF1 page
curl -s -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/of1"
```

**IMPORTANT:** Do NOT include a `<title>` tag in the DA HTML — EDS will render it as visible content.

### 4. Create nav/footer DA content

Create basic nav and footer DA pages so the default EDS header/footer blocks don't 404:

```bash
NAV_HTML='<html><body><header></header><main><div><p><a href="/">Brand</a></p></div><div><ul><li><a href="#">Link 1</a></li></ul></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$NAV_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/nav.html"

FOOTER_HTML='<html><body><header></header><main><div><p>Footer content</p></div></main><footer></footer></body></html>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$FOOTER_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/footer.html"

# Preview both
curl -s -X POST -H "Authorization: Bearer ${DA_TOKEN}" -H "x-content-source-authorization: Bearer ${DA_TOKEN}" "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/nav"
curl -s -X POST -H "Authorization: Bearer ${DA_TOKEN}" -H "x-content-source-authorization: Bearer ${DA_TOKEN}" "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/footer"
```

---

## Completion

```bash
mkdir -p "$STATE_DIR"

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}"

# Build the deliverables list by iterating $PAGE_SLUGS (set in Step 7 from the platform's DA list form).
DELIVERABLES="["
FIRST=true
for PAGE_SLUG in $PAGE_SLUGS; do
  URL="${PREVIEW_BASE}/${PAGE_SLUG}"
  if [ "$FIRST" = true ]; then
    DELIVERABLES="${DELIVERABLES}{\"url\":\"${URL}\",\"label\":\"${PAGE_SLUG}\"}"
    FIRST=false
  else
    DELIVERABLES="${DELIVERABLES},{\"url\":\"${URL}\",\"label\":\"${PAGE_SLUG}\"}"
  fi
done
DELIVERABLES="${DELIVERABLES}]"

echo "{\"step\":6,\"status\":\"review\",\"deliverables\":${DELIVERABLES},\"summary\":\"Snowflake overlay conversion complete. All pages published to AEM preview.\"}" > "$STATE_DIR/step-6-status.json"
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
