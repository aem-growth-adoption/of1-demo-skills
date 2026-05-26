---
name: of1-snowflake
description: Convert stardust prototypes to EDS pages using the snowflake overlay skill, then install the OF1 block.
user-invocable: false
---

# OF1 Snowflake

Thin wrapper around the `snowflake` skill (static-to-EDS overlay). Converts each prototype page, installs the OF1 generative block, and verifies.

## Inputs

- `DOMAIN`: Target domain
- Prototypes in `stardust/prototypes/` (from step 5)
- Repo config from `/shared/of1-demo/repo-config.json` (from step 2)

## Process

### 0. Read repo config

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

### 1. Load the snowflake skill

```
read_file /workspace/skills/snowflake/SKILL.md
read_file /workspace/skills/snowflake/knowledge/methodology.md
read_file /workspace/skills/snowflake/knowledge/architecture.md
```

Also load `da-content` (required dependency of snowflake):
```
read_file /workspace/skills/da-content/SKILL.md
```

### 2. Convert each prototype page

For each `*.html` file in `stardust/prototypes/`:

```bash
cd "$REPO_DIR"
for PROTO in stardust/prototypes/*.html; do
  PAGE_SLUG=$(basename "$PROTO" .html)
  echo "Converting: ${PAGE_SLUG}"
done
```

For each page, run the snowflake skill's phases 0–6 with:
- **Source URL**: `file://${REPO_DIR}/stardust/prototypes/${PAGE_SLUG}.html`
- **Target repo**: `${OWNER}/${REPO}` on branch `${BRANCH}`
- **Content prefix**: `${CONTENT_PREFIX}` (pages live under this subfolder in DA)
- **Page slug**: `${PAGE_SLUG}`
- **Run number**: sequential (001, 002, ...)

Phase 0 (substrate install) only runs once — subsequent pages skip it.

**Do NOT open the snowflake sprinkle.** Progress is tracked via the of1-demo orchestrator.

### 3. Install OF1 block

After all pages are converted, install the OF1 generative block:

```bash
cd "$REPO_DIR"
mkdir -p blocks/of1
cp /workspace/skills/of1-snowflake/assets/of1.js blocks/of1/of1.js
cp /workspace/skills/of1-snowflake/assets/of1-base.css blocks/of1/of1.css
git add blocks/of1/
```

The OF1 styling step (Step 8) rewrites `of1.css` for the brand — it depends on both files being present.

### 4. Push code to git

```bash
cd "$REPO_DIR"
git add -A
git commit -m "feat: snowflake conversion + OF1 block for ${DOMAIN}"
git push origin ${BRANCH}
```

### 5. Upload DA content via mount

**DO NOT use curl against admin.da.live** — the SLICC secret proxy blocks it.

Instead, use the DA filesystem mount which handles auth automatically:

```bash
# The DA mount at /mnt/da/ is the root of da://aem-growth-adoption/of1-demo
# Each demo uses a subfolder named after the branch (e.g., /mnt/da/frescopa/)
# This matches the URL pattern: /{branch}/{page}

mkdir -p "${DA_CONTENT_PATH}" 2>/dev/null

# Upload all page DA docs
for PROJECT_DIR in ${REPO_DIR}/.snowflake/projects/*/da/; do
  for DOC in ${PROJECT_DIR}*.html; do
    BASENAME=$(basename "$DOC")
    cp "$DOC" "${DA_CONTENT_PATH}/${BASENAME}"
    echo "Uploaded: ${DA_CONTENT_PATH}/${BASENAME}"
  done
done

# Also create OF1 page if not already in .snowflake
if [ ! -f "${DA_CONTENT_PATH}/of1.html" ]; then
  cat > "${DA_CONTENT_PATH}/of1.html" <<EOF
<html>
<body>
  <header></header>
  <main>
    <div>
      <div class="of1">
        <div><div>domain</div><div>${DOMAIN}</div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
EOF
  echo "Uploaded: ${DA_CONTENT_PATH}/of1.html"
fi
```

### 6. Trigger preview

Use `oauth-token adobe` for the IMS token (works in SLICC without browser flow):

```bash
DA_TOKEN=$(oauth-token adobe)

# Preview all pages — note the content path includes the branch prefix
for DOC in ${DA_CONTENT_PATH}/*.html; do
  PAGE_SLUG=$(basename "$DOC" .html)
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${CONTENT_PREFIX}/${PAGE_SLUG}")
  echo "Preview ${CONTENT_PREFIX}/${PAGE_SLUG}: ${RESP}"
done
```

All pages should return 200. If any return 404, verify the DA content was written correctly.

### 7. Verify pages render

```bash
for DOC in ${DA_CONTENT_PATH}/*.html; do
  PAGE_SLUG=$(basename "$DOC" .html)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}/${PAGE_SLUG}")
  echo "${CONTENT_PREFIX}/${PAGE_SLUG}: ${CODE}"
done
```

### 8. Screenshot diff loop (max 3 iterations per page)

**Mandatory before marking as review.**

For each converted page (not of1), compare the EDS preview against the prototype:

1. Screenshot EDS preview:
   ```bash
   playwright-cli screenshot "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}/${PAGE_SLUG}" --full-page --output /tmp/preview-${PAGE_SLUG}.png
   ```

2. Screenshot prototype:
   ```bash
   playwright-cli screenshot "file://${REPO_DIR}/stardust/prototypes/${PAGE_SLUG}.html" --full-page --output /tmp/prototype-${PAGE_SLUG}.png
   ```

3. Open both screenshots — compare visually. Focus on:
   - Missing or broken images
   - Layout differences (grid vs stack, wrong columns)
   - Missing sections
   - Wrong colors/backgrounds
   - Nav/footer not rendering

   Ignore: font anti-aliasing, sub-pixel diffs, hover states, cookie banners.

4. **No significant diffs** → PASS, next page.

5. **Diffs found** → fix the specific section (CSS/template tweak), push, re-preview, re-check. Max 3 iterations then accept.

## SLICC Environment Notes

These are CRITICAL for avoiding wasted time:

1. **DA writes go through the mount** at `/mnt/da/` — never use `curl` against `admin.da.live`
2. **DA mount path structure**: `/mnt/da/{branch}/` — NOT `/mnt/da/{repo}/`. The mount root IS the repo.
3. **`oauth-token adobe`** gives you the IMS token instantly — no npx, no browser flow, no da-auth-helper needed
4. **`admin.hlx.page`** IS in the allowed secret domains — use it for preview triggers
5. **`admin.da.live`** is NOT in the allowed domains — curl will fail with "forbidden"
6. **Content URL pattern**: `https://{branch}--{repo}--{owner}.aem.page/{branch}/{page}` — the branch appears TWICE (once in the subdomain for code bus, once in the path for content prefix)
7. **Don't explore/read skills at runtime** — all context you need is in this file. Just generate the artifacts.

## Deliverables

- Overlay templates + fragments (generated by snowflake skill)
- `blocks/of1/of1.js` + `blocks/of1/of1.css`
- OF1 content page uploaded to DA via mount
- All preview URLs return 200
- Code pushed to branch `${BRANCH}`

## Completion

```bash
mkdir -p /shared/of1-demo

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${CONTENT_PREFIX}"

DELIVERABLES="["
FIRST=true
for DOC in ${DA_CONTENT_PATH}/*.html; do
  PAGE_SLUG=$(basename "$DOC" .html)
  URL="${PREVIEW_BASE}/${PAGE_SLUG}"
  LABEL="${PAGE_SLUG}"
  if [ "$FIRST" = true ]; then
    DELIVERABLES="${DELIVERABLES}{\"url\":\"${URL}\",\"label\":\"${LABEL}\"}"
    FIRST=false
  else
    DELIVERABLES="${DELIVERABLES},{\"url\":\"${URL}\",\"label\":\"${LABEL}\"}"
  fi
done
DELIVERABLES="${DELIVERABLES}]"

echo "{\"step\":6,\"status\":\"review\",\"deliverables\":${DELIVERABLES},\"summary\":\"Snowflake overlay conversion complete. All pages published to AEM preview.\"}" > /shared/of1-demo/step-6-status.json
```

Do NOT call `sprinkle send` — only the orchestrator reads this file and pushes to the sprinkle.
