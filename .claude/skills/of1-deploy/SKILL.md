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

## Deliverables

- `of1/config/*.json` — All config files committed to git
- `deliverables/index.html` — **Demo Hub** (entry point to everything)
- `deliverables/brand-review.html` — Brand extraction review
- `deliverables/prototype-*.html` — Pixel-perfect HTML prototypes
- Config synced to worker via EDS → R2
- Test generation verified

## Completion

Present final report with the hub URL:

```
## Demo Ready: {DOMAIN}

**Demo Hub:** ${PREVIEW_BASE}/deliverables/index.html

All deliverables:
- OF1 page: ${PREVIEW_BASE}/of1
- Block catalog: ${PREVIEW_BASE}/block-catalog
- EDS site: ${PREVIEW_BASE}/
- Config: ${PREVIEW_BASE}/of1/config/
- DA.live: https://da.live/#/${OWNER}/${REPO}
- Worker tenant: ${TENANT_ID} (synced + verified)
```

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":13,"status":"done","deliverable":"'${PREVIEW_BASE}'/deliverables/index.html"}' > /shared/of1-demo/step-13-status.json
```
