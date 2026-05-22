---
name: of1-snowflake
description: Convert stardust prototypes to EDS blocks using stardust-to-snowflake, then create the OF1 page and trigger preview.
user-invocable: false
---

# OF1 Snowflake

Converts prototypes to EDS using the `stardust-to-snowflake` skill, then handles OF1-specific setup.

## Inputs

- `DOMAIN`: Target domain
- Prototypes in `stardust/prototypes/` (from previous step)
- Repo config from `/shared/of1-demo/repo-config.json` (written by step 2)

## Process

### 0. Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DA_SOURCE=$(echo "$REPO_CONFIG" | jq -r '.daSource')
```

All paths below are relative to `$REPO_DIR`. All AEM preview URLs use the pattern `https://main--${REPO}--${OWNER}.aem.page/`.

### 1. Read the stardust-to-snowflake skill (from ai-ecoverse/snowflake plugin)

```
read_file /workspace/skills/stardust-to-snowflake/SKILL.md
```

This skill is provided by the `ai-ecoverse/snowflake` plugin (installed via `claude plugins install ai-ecoverse/snowflake`). If the file doesn't exist, the setup step failed — abort and report.

Follow its conversion process but with these pre-configured values:
- **Repo**: `${OWNER}/${REPO}`
- **DA space**: `${OWNER}/${REPO}`
- **DA path**: `/` (content goes at root since each demo has its own repo)
- **Do NOT open the snowflake sprinkle** — report progress via the of1-demo sprinkle instead

### 2. Run the conversion

Follow the stardust-to-snowflake conversion steps:
- Audit prototype sections
- Name blocks semantically
- Write `styles/styles.css` with brand tokens
- Self-host fonts with metric-matched fallbacks
- Create header/footer fragments
- Generate EDS content pages
- Build block catalog

**Image rules from stardust-to-snowflake apply:**
- Hero blocks MUST have images
- Card/grid blocks MUST include real image URLs
- Use exact URLs from prototypes

### EDS DOM contract — header block

**CRITICAL**: Before writing any header CSS, read the existing `blocks/header/header.js` in the repo:

```
read_file({ "path": "${REPO_DIR}/blocks/header/header.js" })
```

EDS wraps the block in `.header.block > .nav-wrapper > nav#nav`. The JS assigns classes to nav children by index:
```js
const classes = ['brand', 'sections', 'tools'];
classes.forEach((c, i) => { nav.children[i].classList.add(`nav-${c}`); });
```

Therefore:
- The nav fragment (nav.html) MUST have **exactly 3 top-level `<div>` sections** — brand, sections, tools — no more, no less, no section-metadata divs
- CSS selectors MUST target `.header nav` (not `.header .nav` — `nav` has `id="nav"`, not `class="nav"`)
- To select nav sections: `.header .nav-brand`, `.header .nav-sections`, `.header .nav-tools`
- The `nav-sections` list items live at `.header .nav-sections .default-content-wrapper > ul > li`

### EDS DOM contract — footer block

**CRITICAL**: The boilerplate `footer.js` does nothing except dump the raw fragment into the block. It does NOT create `.footer-content`, `.footer-links-grid`, etc. — you must either:

1. **Write a custom `footer.js`** that structures the raw DA sections into the layout your CSS expects, OR
2. **Write CSS that targets the raw EDS output** — i.e. `.footer .default-content-wrapper`, `.footer .section`, etc.

Option 1 is preferred for complex footers. The footer fragment sections arrive in order: section[0], section[1], ... as direct children of the fragment. Access them via `fragment.querySelectorAll(':scope > div')`.

Never write CSS classes like `.footer-links-grid` unless your footer.js actually creates elements with those classes.

### EDS button authoring convention

EDS `decorateButtons()` converts markup to button classes:
- `<strong><a href="...">Text</a></strong>` → `a.button.primary` (filled/CTA style)
- `<em><a href="...">Text</a></em>` → `a.button.secondary` (light/outlined style)
- `<strong><em><a href="...">Text</a></em></strong>` → `a.button.accent` (dark outline)
- Plain `<a href="...">` → **no button class**, just an unstyled link

**CRITICAL**: The strong/em wrapper MUST be **outside** the `<a>` tag, NOT inside it. DA content sometimes generates `<a><strong>text</strong></a>` which EDS does NOT recognize. When writing DA HTML directly, always use `<strong><a href="...">text</a></strong>`.

For blocks with custom backgrounds (dark sections like need-help), the global `.button.secondary` style (white bg) will look wrong. Add block-specific CSS overrides:
```css
.my-dark-block a.button {
  background: transparent;
  color: var(--color-white);
  border-color: rgba(255,255,255,0.5);
}
```

### 3. Generate block catalog page

Create `content/block-catalog.html` — an EDS content page that renders every custom block created during conversion with sample content. This gives a visual reference of all available blocks.

For each block in `blocks/` (excluding header, footer, nav):
- Add a section with an `<h2>` block name and a `<p>` description
- Add the block's markup with realistic sample content using real images from prototypes
- Include the site's nav/footer metadata so blocks render with proper brand styling

```html
<html>
<body>
  <header></header>
  <main>
    <!-- One section per block -->
    <div>
      <h2>hero</h2>
      <p>Full-width hero with background image and overlay text</p>
      <div class="hero">
        <!-- sample rows/cells with real content from prototypes -->
      </div>
    </div>
    <div>
      <h2>cards</h2>
      <p>Grid of product/feature cards with images</p>
      <div class="cards">
        <!-- sample rows/cells -->
      </div>
    </div>
    <!-- ... more blocks ... -->
    <div>
      <div class="metadata">
        <div><div>nav</div><div>/nav</div></div>
        <div><div>footer</div><div>/footer</div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

Use real product images and text from the prototypes — never use placeholder content.

### 4. Create OF1 content page

After conversion, create and publish `content/of1.html`:

```html
<html>
<body>
  <header></header>
  <main>
    <div>
      <div class="of1">
        <div><div>domain</div><div>{DOMAIN}</div></div>
      </div>
    </div>
    <div>
      <div class="metadata">
        <div><div>nav</div><div>/nav</div></div>
        <div><div>footer</div><div>/footer</div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

### 5. Push and publish

Push to GitHub:
```bash
cd "$REPO_DIR"
git add -A && git commit -m "Snowflake conversion for {DOMAIN}" && git push origin main
```

Upload all content pages to DA.live.

**CRITICAL: Do NOT use `--data-binary @file` syntax** — in some shell environments the `@` prefix is stored literally instead of reading the file contents. Always pipe the file into curl via stdin:

```bash
for f in content/*.html; do
  PAGE=$(basename "$f" .html)
  cat "$f" | curl -s -X PUT "https://admin.da.live/source/${OWNER}/${REPO}/${PAGE}.html" \
    -H "Authorization: ${DA_TOKEN}" \
    -H "Content-Type: text/html" \
    --data-binary @-
done
```

The `@-` tells curl to read from stdin (piped from `cat`), which avoids the file-path expansion issue entirely.

Trigger preview for each page. The admin API requires **two** Authorization headers — `Authorization` and `x-content-source-authorization` — both with the IMS token (no "Bearer" stripping; full `Bearer <token>` format):

```bash
IMS_TOKEN=$(playwright-cli eval "(function() {
  const k = Object.keys(localStorage).find(k => k.startsWith('adobeid_ims_access_token'));
  return JSON.parse(localStorage.getItem(k)).tokenValue;
})()" --tab <da-live-tab-id>)

for f in content/*.html; do
  PAGE=$(basename "$f" .html)
  curl -s -X POST \
    -H "Authorization: Bearer ${IMS_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${IMS_TOKEN}" \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/main/${PAGE}"
done
```

Get the DA live tab ID with: `playwright-cli tab-list | grep "da.live.*${OWNER}"`

### 6. Verify — visual comparison against prototypes

This step is **mandatory** before marking the step as review. You must verify each page visually to catch issues like unpublished content, broken nav, missing images, or layout regressions.

**6a. Check all preview URLs return 200:**

```bash
for f in content/*.html; do
  PAGE=$(basename "$f" .html)
  URL="https://main--${REPO}--${OWNER}.aem.page/${PAGE}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "${PAGE}: HTTP ${HTTP_CODE}"
  if [ "$HTTP_CODE" != "200" ]; then
    echo "  ERROR: ${PAGE} not published — re-trigger preview"
  fi
done
```

If any page returns non-200, re-trigger its preview and wait before continuing.

**6b. Screenshot each preview page and compare against the prototype:**

For each content page (except of1.html):

```bash
# Take screenshot of the live preview
playwright-cli screenshot "https://main--${REPO}--${OWNER}.aem.page/${PAGE}" --full-page --output /tmp/preview-${PAGE}.png

# Take screenshot of the corresponding prototype
playwright-cli screenshot "file://$(pwd)/stardust/prototypes/${PAGE}.html" --full-page --output /tmp/prototype-${PAGE}.png
```

Then visually compare each pair. Check for:
- **Nav loading** — header must render with logo + nav links (not blank or collapsed)
- **Footer loading** — footer sections must render (not missing entirely)
- **Hero images** — hero section must show the real image (not empty/broken)
- **Card/grid images** — product images must load (not 404 broken icons)
- **Typography** — headings and body text must render in the correct font (not system fallback everywhere)
- **Layout** — sections must match the prototype's visual structure (no stacking where grid expected)
- **Content completeness** — all text content from the prototype must appear on the preview
- **Block catalog** — every block in `block-catalog.html` must render correctly with sample content visible (not broken/unstyled)

**6c. Report issues:**

If any page has visual regressions:
1. Note what's wrong (e.g., "nav not loading — nav.html may not be published")
2. Fix the issue (re-publish content, fix CSS selectors, etc.)
3. Re-screenshot and verify the fix

**6d. Confirm all pages pass:**

```bash
# Verify images in authored content
for f in content/*.html; do
  PAGE=$(basename "$f" .html)
  [ "$PAGE" = "of1" ] && continue
  IMG_COUNT=$(grep -c '<img\|<picture' "$f" 2>/dev/null || echo "0")
  echo "${PAGE}: ${IMG_COUNT} images"
  if [ "$IMG_COUNT" = "0" ]; then
    echo "  WARNING: ${PAGE} has no images — check prototype"
  fi
done
```

Only proceed to the Completion section once ALL pages pass visual verification.

## Deliverables

- Custom blocks in `blocks/` (each with `.js` + `.css`)
- `styles/styles.css` with brand tokens
- `styles/fonts/*.woff2`
- Content pages under `content/`
- `content/of1.html` — OF1 search page
- Code pushed to GitHub, content deployed to DA.live
- All preview URLs return 200

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

Build the deliverables array from all generated content pages:

```bash
mkdir -p /shared/of1-demo

# Build a JSON array of all preview URLs (exclude of1 — it's reviewed in step 7)
DELIVERABLES="["
FIRST=true
for f in content/*.html; do
  PAGE=$(basename "$f" .html)
  [ "$PAGE" = "of1" ] && continue
  URL="https://main--${REPO}--${OWNER}.aem.page/${PAGE}"
  if [ "$FIRST" = true ]; then
    DELIVERABLES="${DELIVERABLES}{\"url\":\"${URL}\",\"label\":\"${PAGE}\"}"
    FIRST=false
  else
    DELIVERABLES="${DELIVERABLES},{\"url\":\"${URL}\",\"label\":\"${PAGE}\"}"
  fi
done
DELIVERABLES="${DELIVERABLES}]"

echo "{\"step\":6,\"status\":\"review\",\"deliverables\":${DELIVERABLES},\"summary\":\"Snowflake conversion complete. All pages published to AEM preview.\"}" > /shared/of1-demo/step-6-status.json
```

This uses the `deliverables` array (not singular `deliverable`) so the sprinkle renders an "Open all" button that opens every preview page.
