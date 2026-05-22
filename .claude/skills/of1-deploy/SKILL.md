---
name: of1-deploy
description: Generate config preview, deploy tenant config to the OF1 worker, and verify generation works.
user-invocable: false
---

# OF1 Deploy

Generate deliverables hub, deploy all tenant config to the worker, and verify.

## Inputs

- `DOMAIN`: Target domain
- Repo config from `/shared/of1-demo/repo-config.json`
- All config files in `output/{DOMAIN}/` (products.json, personas.json, use-cases.json, features.json, faqs.json, brand-voice.json, block-guide.json, suggestions.json)

## Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
PREVIEW_BASE="https://main--${REPO}--${OWNER}.aem.page"
```

## Static HTML Hosting on EDS

**Key pattern:** Files committed to the git repo (outside DA content paths) are served as raw static HTML by AEM Edge Delivery Services. This means self-contained HTML pages with inline styles work perfectly — they bypass the EDS content pipeline.

```
# Files at this repo path:
deliverables/index.html
deliverables/brand-review.html
deliverables/prototype-home.html

# Are served at:
${PREVIEW_BASE}/deliverables/index.html
${PREVIEW_BASE}/deliverables/brand-review.html
${PREVIEW_BASE}/deliverables/prototype-home.html
```

Use relative links between files in the same directory. Use absolute URLs for AEM content pages (DA-published pages at `/of1`, `/block-catalog`, etc.).

## Process

### 1. Build deliverables directory

Create `deliverables/` and collect all standalone HTML deliverables:

```bash
cd "$REPO_DIR"
mkdir -p deliverables

# Copy standalone HTML files
cp stardust/current/brand-review.html deliverables/brand-review.html
cp stardust/prototypes/*.html deliverables/   # rename to prototype-{slug}.html
cp content/of1-review.html deliverables/of1-review.html 2>/dev/null || true
```

### 2. Generate OF1 config review page

Build `deliverables/of1-review.html` — a self-contained HTML page (inline styles, no external deps) that displays ALL worker config for user approval:

**Required sections:**
- **Search UI** — title, subtitle, placeholder, all suggestion chips (from suggestions.json)
- **Products** — grid of all products with thumbnail images, price, truncated description, feature list, image count (from products.json)
- **Block Set** — visual tags for each block in block-guide.json + intent-to-block mapping table
- **Brand Voice** — personality, tone, vocabulary (use), avoid words (from brand-voice.json)
- **Personas** — cards for each persona with name and description (from personas.json)

**Image validation:** Every product image URL must be real and loadable. If any return 404, flag them.

### 3. Generate demo hub page

Build `deliverables/index.html` — a single entry point linking to all deliverables. Self-contained HTML with inline styles.

**Required sections:**
- **Discovery & Extraction** — link to brand-review.html
- **Prototypes** — links to each prototype-*.html file
- **EDS Pages** — links to AEM preview URLs (absolute: `${PREVIEW_BASE}/`)
- **OF1 Generative** — links to OF1 page, block catalog (AEM), and config review (relative)

Use badges to distinguish link types:
- `AEM Preview` (green) — for DA-published content pages
- `Standalone` (orange) — for self-contained HTML in deliverables/
- `Config` (blue) — for config review page

### 4. Commit and push to trigger EDS serving

```bash
git add deliverables/
git commit -m "feat: add demo hub and deliverables for {DOMAIN}"
git push origin main
```

After push, files are immediately available at:
`${PREVIEW_BASE}/deliverables/index.html`

**Present the hub URL to the user for review.** This is a gate — do not deploy to the worker until they approve.

### 5. Deploy tenant config

Upload each config file individually to avoid 500s on large payloads:

```bash
WORKER_URL="https://of1-gen-web-service.franklin-prod.workers.dev"
for key_file in "brandVoice:brand-voice" "blockGuide:block-guide" "products:products" "personas:personas" "useCases:use-cases" "features:features" "faqs:faqs" "suggestions:suggestions"; do
  KEY="${key_file%%:*}"
  FILE="${key_file##*:}"
  FILEPATH="output/${DOMAIN}/${FILE}.json"
  if [ -f "$FILEPATH" ]; then
    PAYLOAD="{\"${KEY}\":$(cat "$FILEPATH")}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      "${WORKER_URL}/api/admin/tenants/${DOMAIN}/config")
    echo "${KEY} -> HTTP ${HTTP_CODE}"
  fi
done
```

### 6. Deploy CTA template

```bash
CTA_FILE="output/${DOMAIN}/cta-template.json"
if [ -f "$CTA_FILE" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "Content-Type: application/json" \
    -d @"$CTA_FILE" \
    "${WORKER_URL}/api/admin/tenants/${DOMAIN}/cta-template")
  echo "cta-template -> HTTP ${HTTP_CODE}"
fi
```

### 7. Register OF1 endpoint

```bash
curl -s -X PUT "${WORKER_URL}/api/admin/tenants/${DOMAIN}/of1-endpoint" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${PREVIEW_BASE}/of1\"}"
```

### 8. Test generation

```bash
curl -s -X POST "${WORKER_URL}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"${DOMAIN}\",\"query\":\"show me your best products\",\"followUp\":false,\"context\":{\"browsing\":[],\"conversationHistory\":[]}}" > /tmp/gen-test.txt
```

Verify:
- Sections are generated (not empty)
- All image URLs return 200 (no /content/dam/ hallucinations)
- Only blocks from the approved block guide are used
- Suggestions appear at the end

## Deliverables

- `deliverables/index.html` — **Demo Hub** (entry point to everything)
- `deliverables/brand-review.html` — Brand extraction review
- `deliverables/prototype-*.html` — Pixel-perfect HTML prototypes
- `deliverables/of1-review.html` — Config review dashboard
- `content/block-catalog.html` — Block catalog (DA/AEM published)
- Tenant config deployed to worker
- OF1 endpoint registered
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
- Config review: ${PREVIEW_BASE}/deliverables/of1-review.html
- DA.live: https://da.live/#/${OWNER}/${REPO}
- Worker tenant: deployed + verified
```

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":13,"status":"done","deliverable":"'${PREVIEW_BASE}'/deliverables/index.html"}' > /shared/of1-demo/step-13-status.json
```
