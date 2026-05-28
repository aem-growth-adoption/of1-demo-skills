---
name: of1-deploy
description: Commit config to git, sync to OF1 worker via EDS, generate demo hub, and verify generation works.
user-invocable: false
---

# OF1 Deploy

Commit config files, trigger sync to the OF1 worker, generate the demo hub, and verify.

## Inputs

- `DOMAIN`: Target domain
- Repo config from `/shared/of1-demo/repo-config.json`
- All config files in `of1/config/` (products.json, personas.json, use-cases.json, features.json, faqs.json, brand-voice.json, suggestions.json, cta-template.json)

## Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
TENANT_ID="${BRANCH}--${REPO}--${OWNER}"
WORKER_URL="https://of1-gen-web-service.franklin-prod.workers.dev"
```

## How Config Sync Works

The OF1 worker now syncs config from the EDS repo directly:

1. Config JSON files are committed to the git repo at `/of1/config/*.json`
2. EDS serves them as static files at `${PREVIEW_BASE}/of1/config/{file}.json`
3. Calling `POST ${WORKER_URL}/api/tenants/${TENANT_ID}/sync` tells the worker to fetch each config from EDS and store in R2
4. The worker auto-indexes vectors for products, features, and faqs

**Tenant ID format:** `{branch}--{repo}--{owner}` (e.g., `bmwusa--of1-demo--aem-growth-adoption`)

## Process

### 1. Verify config files exist

```bash
cd "$REPO_DIR"
echo "Config files:"
for f in brand-voice products personas use-cases features faqs suggestions cta-template of1-endpoint; do
  if [ -f "of1/config/${f}.json" ]; then
    echo "  ✓ ${f}.json ($(wc -c < "of1/config/${f}.json") bytes)"
  else
    echo "  ✗ ${f}.json MISSING"
  fi
done
```

### 2. Verify of1-endpoint config exists

This should already exist from step 2 (branch-setup). Verify and update if needed:

```bash
if [ ! -f of1/config/of1-endpoint.json ]; then
  cat > of1/config/of1-endpoint.json << EOF
{
  "url": "${PREVIEW_BASE}/${BRANCH}/of1"
}
EOF
fi
```

### 3. Build deliverables directory

Create `deliverables/` and collect all standalone HTML deliverables:

```bash
mkdir -p deliverables

# Copy standalone HTML files
cp stardust/current/brand-review.html deliverables/brand-review.html 2>/dev/null || true
cp stardust/prototypes/*.html deliverables/ 2>/dev/null || true
```

### 4. Generate demo hub page

Build `deliverables/index.html` — a single entry point linking to all deliverables. Self-contained HTML with inline styles.

**Required sections:**
- **Discovery & Extraction** — link to brand-review.html, discovery.html
- **Prototypes** — links to each prototype-*.html file
- **EDS Pages** — links to AEM preview URLs (absolute: `${PREVIEW_BASE}/`)
- **OF1 Generative** — links to OF1 page, block catalog (AEM), and config review (relative)

Use badges to distinguish link types:
- `AEM Preview` (green) — for DA-published content pages
- `Standalone` (orange) — for self-contained HTML in deliverables/
- `Config` (blue) — for config review page

### 5. Commit and push everything

```bash
git add of1/config/ deliverables/
git commit -m "feat: deploy config and demo hub for ${DOMAIN}"
git push origin ${BRANCH}
```

After push, config files are immediately available at:
`${PREVIEW_BASE}/of1/config/{file}.json`

### 6. Sync config to the OF1 worker

```bash
# Sync all config files to the worker
RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/tenants/${TENANT_ID}/sync")
echo "$RESPONSE" | jq '.'

# Verify sync succeeded
OK=$(echo "$RESPONSE" | jq -r '.ok')
SYNCED=$(echo "$RESPONSE" | jq -r '.synced | length')
ERRORS=$(echo "$RESPONSE" | jq -r '.errors | length')
VECTORS=$(echo "$RESPONSE" | jq -r '.vectors.indexed')

echo "Sync result: ok=$OK, synced=$SYNCED files, errors=$ERRORS, vectors=$VECTORS"

if [ "$OK" != "true" ]; then
  echo "ERROR: Sync failed!"
  echo "$RESPONSE" | jq '.errors'
fi
```

If specific files need re-syncing:
```bash
# Sync just one file
curl -s -X POST "${WORKER_URL}/api/tenants/${TENANT_ID}/sync?file=products" | jq '.'
```

### 6b. Verify tenant is ready

After sync, check the tenant status. **ALL config flags must be true and `ready` must be true:**

```bash
STATUS=$(curl -s "${WORKER_URL}/api/tenants/${TENANT_ID}/status")
READY=$(echo "$STATUS" | jq -r '.ready')
echo "Tenant ready: $READY"

if [ "$READY" != "true" ]; then
  echo "ERROR: Tenant is NOT ready!"
  echo "$STATUS" | jq '.config'
  # Check which configs are missing
  echo "$STATUS" | jq '.config | to_entries[] | select(.value == false) | .key'
  echo ""
  echo "Fix: ensure all required config files exist in of1/config/ and re-sync"
fi
```

**Required for `ready: true`:**
- `hasOf1Endpoint` — needs `of1/config/of1-endpoint.json` (created in Step 2 branch setup)
- `hasProducts` — needs `of1/config/products.json`
- `hasBrandVoice` — needs `of1/config/brand-voice.json`
- `hasSuggestions` — needs `of1/config/suggestions.json`
- `hasTemplates` — needs `of1/config/templates.json` + inlined catalog

If `hasOf1Endpoint` is false, create it:
```bash
cat > of1/config/of1-endpoint.json <<EOF
{
  "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/of1"
}
EOF
git add of1/config/of1-endpoint.json
git commit -m "feat: of1-endpoint config"
git push origin ${BRANCH}
# Re-sync
curl -s -X POST "${WORKER_URL}/api/tenants/${TENANT_ID}/sync" | jq '.ok'
```

### 7. Test generation

```bash
curl -s -X POST "${WORKER_URL}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"${TENANT_ID}\",\"query\":\"show me your best products\",\"followUp\":false,\"context\":{\"browsing\":[],\"conversationHistory\":[]}}" > /tmp/gen-test.txt

echo "Generation test:"
head -50 /tmp/gen-test.txt
```

Verify:
- Sections are generated (not empty)
- All image URLs return 200 (no hallucinated paths)
- Only blocks from the approved block guide are used
- Suggestions appear at the end

## Pre-Launch Checklist (MANDATORY)

Before marking the demo as done, run this checklist. ALL items must pass. If any fail, fix the issue and re-check.

### Check 1: OF1 page loads and looks good

Open the OF1 page in Playwright and verify it renders correctly:

```bash
playwright-cli open "${PREVIEW_BASE}/${BRANCH}/of1"
sleep 6
playwright-cli screenshot --tab <tab_id> --output /tmp/check-of1.png
open --view /tmp/check-of1.png
```

**Pass criteria:**
- Page shows the branded search UI (title, subtitle, input, suggestion chips)
- No raw unstyled content visible (no plain divs/tables)
- Header nav is styled (dark translucent bar with white links, not raw blue links)
- Footer is styled (columns, proper link colors)
- No 404 errors in the console

**If it fails:** The passthrough template isn't decorating blocks — check `scripts.js` has `decorateMain(main)` in the passthrough branch. Or `styles/of1.css` is missing header/footer chrome.

### Check 2: OF1 nav/footer matches prototype-home exactly

Open both pages side by side and compare the header and footer:

```bash
playwright-cli open "${PREVIEW_BASE}/${BRANCH}/prototype-home"
sleep 6
playwright-cli screenshot --tab <home_tab_id> --output /tmp/check-home.png

# Compare headers visually
open --view /tmp/check-of1.png
open --view /tmp/check-home.png
```

**Pass criteria:**
- Nav bar background color/opacity is identical
- Nav link font-size, color, and spacing match
- Logo renders the same (same SVG, same fill color)
- Footer column layout, typography, and colors match
- No visible difference in header/footer between the two pages

**If it fails:** `styles/of1.css` has different header/footer rules than `styles/prototype-home.css`. Fix by extracting the `.site-header` and `.site-footer` rules from prototype-home.css into styles/of1.css.

### Check 3: Products have multiple images

Read the products config and verify image coverage:

```bash
python3 << 'EOF'
import json

with open('of1/config/products.json') as f:
    products = json.load(f)

all_good = True
for p in products:
    name = p.get('name', 'Unknown')
    images = p.get('images', [])
    thumbnail = p.get('thumbnail', '')
    total = len(images) + (1 if thumbnail and thumbnail not in images else 0)
    status = "✓" if total >= 2 else "✗"
    if total < 2:
        all_good = False
    print(f"  {status} {name}: {total} images")

if all_good:
    print("\n✓ All products have at least 2 images")
else:
    print("\n✗ FAIL: Some products have fewer than 2 images — fix content-metadata")
EOF
```

**Pass criteria:**
- Every product has at least 2 images (thumbnail + at least 1 gallery image)
- Image URLs return 200 (spot-check 3-4 URLs with curl)

**If it fails:** Re-run Step 9 with instructions to download more product images to DA.

### Check 4: Sprinkle quick links all work

Verify all quick link URLs return 200:

```bash
LINKS=(
  "${PREVIEW_BASE}/deliverables/discovery.html"
  "${PREVIEW_BASE}/deliverables/brand-review.html"
  "${PREVIEW_BASE}/${BRANCH}/prototype-home"
  "${PREVIEW_BASE}/gallery/index.html"
  "${PREVIEW_BASE}/${BRANCH}/of1"
  "${PREVIEW_BASE}/deliverables/config-review.html"
  "${PREVIEW_BASE}/deliverables/index.html"
)

ALL_OK=true
for URL in "${LINKS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ $STATUS $URL"
  else
    echo "  ✗ $STATUS $URL"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = "true" ]; then
  echo "\n✓ All quick links accessible"
else
  echo "\n✗ FAIL: Some links return non-200 — check git push and preview triggers"
fi
```

**Pass criteria:**
- All URLs return HTTP 200
- The sprinkle must have deliverable URLs pushed for steps 2, 3, 4, 5, 6, 7, 8, 12, 13

**If it fails:** Re-push step statuses with correct deliverable URLs. Trigger preview for any missing pages.

---

### Checklist Summary

Only mark Step 13 as `"done"` if ALL 4 checks pass:

| # | Check | Pass? |
|---|-------|-------|
| 1 | OF1 page loads with styled search UI | |
| 2 | OF1 nav/footer matches prototype-home | |
| 3 | All products have ≥2 images | |
| 4 | All quick link URLs return 200 | |

If any check fails, fix the issue (commit + push + re-preview if needed), then re-run the failed check.

---

## Deliverables

- `of1/config/*.json` — All config files committed to git
- `deliverables/index.html` — **Demo Hub** (entry point to everything)
- `deliverables/brand-review.html` — Brand extraction review
- `deliverables/prototype-*.html` — Pixel-perfect HTML prototypes
- Config synced to worker via EDS → R2
- Test generation verified
- Pre-launch checklist passed (all 4 checks ✓)

## Completion

Present final report with the hub URL:

```
## Demo Ready: {DOMAIN}

**Demo Hub:** ${PREVIEW_BASE}/deliverables/index.html

All deliverables:
- OF1 page: ${PREVIEW_BASE}/${BRANCH}/of1
- Block catalog: ${PREVIEW_BASE}/block-catalog
- EDS site: ${PREVIEW_BASE}/
- Config: ${PREVIEW_BASE}/of1/config/
- DA.live: https://da.live/#/${OWNER}/${REPO}
- Worker tenant: ${TENANT_ID} (synced + verified)

Pre-launch checklist: 4/4 passed ✓
```

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":13,"status":"done","deliverable":"'${PREVIEW_BASE}'/deliverables/index.html","summary":"Deployed + all 4 pre-launch checks passed."}' > /shared/of1-demo/step-13-status.json
```
