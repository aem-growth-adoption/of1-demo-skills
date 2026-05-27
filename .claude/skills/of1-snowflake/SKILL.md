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
DA_CONTENT_PATH=$(echo "$REPO_CONFIG" | jq -r '.daContentPath // "/mnt/da/"+.branch')
```

---

## Step 1: Understand the Snowflake Overlay

The overlay methodology is summarized below. If you need deeper reference, read `/workspace/skills/snowflake/SKILL.md` and its `knowledge/` subfolder — but this summary should be sufficient:

### How Snowflake Overlay Works (Quick Reference)

The overlay engine keeps the prototype's exact DOM and CSS. Content (text, images) becomes editable in DA without changing the visual output.

**Artifacts per page:**
| File | Location | Purpose |
|------|----------|---------|
| Template HTML | `templates/{slug}.html` | The prototype's `<main>` content as static shell |
| Template CSS | `styles/{slug}.css` | All `<style>` content from the prototype |
| Header fragment | `fragments/{slug}/header.html` | `<header>` + anything before `<main>` |
| Footer fragment | `fragments/{slug}/footer.html` | `<footer>` + anything after `</main>` |
| DA content doc | `.snowflake/projects/{N}-{slug}/da/{slug}.html` | Editable content in DA block format |

**DA content doc format** — each section becomes a block with slot name/value rows:
```html
<html>
<body>
<header></header>
<main>
  <div>
    <div class="section-class-name">
      <div><div>slot-name</div><div>slot value (text, links, image URLs)</div></div>
      <div><div>another-slot</div><div>another value</div></div>
    </div>
  </div>
  <!-- more sections... -->
  <div>
    <div class="metadata">
      <div><div>template</div><div>{slug}</div></div>
    </div>
  </div>
</main>
<footer></footer>
</body>
</html>
```

**How the overlay engine resolves content:**
1. DA serves the content doc → EDS pipeline decorates each `<div class="block-name">` as a block
2. `scripts.js` (substrate) reads `<meta name="template">` → fetches `/templates/{slug}.html`
3. Template HTML is injected into the page as the visual shell
4. Block JS reads slot values from the DA content and injects them into the template's DOM nodes
5. `/styles/{slug}.css` is loaded for visual styling
6. Header/footer fragments are loaded into `<header>`/`<footer>`

---

## Step 2: Generate All Artifacts

For each prototype in `stardust/prototypes/*.html`:

### 2a. Analyze the prototype HTML

Read each prototype. Identify:
- Everything before `<main>` → header fragment
- The `<main>` content → template (the visual shell)
- Everything after `</main>` → footer fragment
- All `<style>` blocks → template CSS
- Editable content (text, images, links) → DA content doc with slot names

### 2b. Create template HTML

Extract `<main>` inner content. Replace editable text/images with data attributes or CSS classes that the overlay JS will populate from DA slots.

```bash
mkdir -p ${REPO_DIR}/templates
# Write templates/{slug}.html for each page
```

### 2c. Create template CSS

Extract all `<style>` content from the prototype. Add Google Fonts `@import` if the prototype uses them.

```bash
mkdir -p ${REPO_DIR}/styles
# Write styles/{slug}.css for each page
```

### 2d. Create header/footer fragments

```bash
mkdir -p ${REPO_DIR}/fragments/{slug}
# Write fragments/{slug}/header.html
# Write fragments/{slug}/footer.html
```

### 2e. Create DA content documents

```bash
mkdir -p ${REPO_DIR}/.snowflake/projects/{N}-{slug}/da
# Write .snowflake/projects/{N}-{slug}/da/{slug}.html
```

The DA content doc MUST include a metadata section at the end with `template` = slug name.

---

## Step 3: Install the Substrate (scripts.js)

The substrate is the overlay engine that loads templates, fragments, and wires up DA content.

Check if already installed:
```bash
grep -q "loadTemplate\|snowflake\|overlay" ${REPO_DIR}/scripts/scripts.js 2>/dev/null && echo "SUBSTRATE OK" || echo "NEEDS INSTALL"
```

If not installed, read and install from:
```bash
cat /workspace/skills/snowflake/knowledge/architecture.md
# Follow substrate installation instructions
```

The substrate's `scripts.js` must:
- Export `decorateMain`
- Load template HTML when `<meta name="template">` is present
- Load template CSS
- Load header/footer fragments
- Decorate blocks (which read DA slot values)

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
| Write content to DA | `cp file /mnt/da/{branch}/page.html` | Mount handles auth automatically |
| Get IMS token | `oauth-token adobe` | Instant, no browser flow needed |
| Trigger preview | `curl -X POST admin.hlx.page/preview/...` | Include both auth headers |
| ~~Upload via API~~ | ~~`curl admin.da.live`~~ | **BLOCKED — will fail with "forbidden"** |
| ~~Use da-auth-helper~~ | ~~`npx da-auth-helper`~~ | **DOESN'T EXIST in this env** |
| ~~Read ~/.aem/da-token.json~~ | ~~`cat ~/.aem/...`~~ | **FILE DOESN'T EXIST** |

### Upload content:

```bash
# The mount at /mnt/da/ = root of da://aem-growth-adoption/of1-demo
# Content for this demo lives in /mnt/da/{branch}/ subfolder
# This maps to URL path /{branch}/{page} on the EDS preview

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
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${CONTENT_PREFIX}/${PAGE_SLUG}")
  echo "Preview ${CONTENT_PREFIX}/${PAGE_SLUG}: ${RESP}"
done
```

Expected: all return `200`. If you get `404`:
- Verify the file exists: `cat ${DA_CONTENT_PATH}/page.html | head -3`
- Verify the content format is correct (has `<html><body><main>...</main></body></html>`)
- Wait 2-3 seconds and retry (DA write propagation)

---

## Step 8: Verify Pages Render

```bash
for DOC in ${DA_CONTENT_PATH}/*.html; do
  [ -f "$DOC" ] || continue
  PAGE_SLUG=$(basename "$DOC" .html)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}/${PAGE_SLUG}")
  echo "${CONTENT_PREFIX}/${PAGE_SLUG}: ${CODE}"
done
```

Expected: all return `200`.

---

## Step 9: Screenshot Diff Loop (max 3 iterations per page)

For each content page (skip of1), compare EDS preview against the prototype:

1. **Screenshot both:**
   ```bash
   playwright-cli screenshot "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}/${PAGE_SLUG}" --full-page --output /tmp/preview-${PAGE_SLUG}.png
   playwright-cli screenshot "file://${REPO_DIR}/stardust/prototypes/${PAGE_SLUG}.html" --full-page --output /tmp/proto-${PAGE_SLUG}.png
   ```

2. **Compare visually** — open both with `open --view`:
   ```bash
   open --view /tmp/preview-${PAGE_SLUG}.png
   open --view /tmp/proto-${PAGE_SLUG}.png
   ```

3. **Fix or accept:**
   - Significant diffs (broken layout, missing images, wrong colors) → fix template/CSS, push, re-preview
   - Minor diffs (font rendering, 1-2px spacing) → accept
   - After 3 iterations → accept with note

---

## 🚫 Common Mistakes That Waste Time

| Mistake | Time wasted | Correct approach |
|---------|-------------|------------------|
| Trying `curl` to `admin.da.live` | 3-5 min | Use `/mnt/da/` mount |
| Running `npx da-auth-helper` | 2-3 min | Use `oauth-token adobe` |
| Reading `~/.aem/da-token.json` | 1 min | Doesn't exist. Use `oauth-token adobe` |
| Writing to `/mnt/da/of1-demo/page.html` | 3 min debugging 404s | Write to `/mnt/da/{branch}/page.html` |
| Using URL path `/{page}` without prefix | 2 min debugging 404s | URL path is `/{branch}/{page}` |
| Reading snowflake skill docs at runtime | 3-5 min | All context is in THIS file |
| Multiple git pushes | 2-3 min | ONE push after all artifacts are created |
| Checking node/npm availability | 1 min | Node is a shim. Don't use npm/npx |
| Installing substrate via npm script | 2 min | Copy files directly |
| Setting OF1 block domain to `frescopa.coffee` | 5+ min debugging missing suggestions | Use tenant ID: `${BRANCH}--${REPO}--${OWNER}` |

---

## Deliverables

- `templates/*.html` — one per page
- `styles/*.css` — one per page
- `fragments/{slug}/header.html` + `footer.html` — one pair per page
- `.snowflake/projects/*/da/*.html` — DA content docs
- `blocks/of1/of1.js` + `blocks/of1/of1.css` — OF1 generative block
- `scripts/scripts.js` — substrate (overlay engine)
- All pages return 200 on EDS preview
- Code pushed to branch `${BRANCH}`
- DA content uploaded via mount to `/mnt/da/${CONTENT_PREFIX}/`

---

## Completion

```bash
mkdir -p /shared/of1-demo

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}"

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
