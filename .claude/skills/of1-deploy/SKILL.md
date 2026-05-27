---
name: of1-deploy
description: Generate config preview, deploy tenant config to the OF1 worker, and verify generation works.
user-invocable: false
---

# OF1 Deploy

Generate deliverables hub, deploy all tenant config to the worker, and verify.

## Inputs

- `DOMAIN`: Target domain
- `BRANCH`: Git branch name
- All config files in `output/{DOMAIN}/` (products.json, personas.json, use-cases.json, features.json, faqs.json, brand-voice.json, block-guide.json, suggestions.json)

## Static HTML Hosting on EDS

**Key pattern:** Files committed to the git repo (outside DA content paths) are served as raw static HTML by AEM Edge Delivery Services. This means self-contained HTML pages with inline styles work perfectly — they bypass the EDS content pipeline.

```
# Files at this repo path:
deliverables/{BRANCH}/index.html
deliverables/{BRANCH}/brand-review.html
deliverables/{BRANCH}/prototype-home.html

# Are served at:
https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/index.html
https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/brand-review.html
https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/prototype-home.html
```

Use relative links between files in the same directory. Use absolute URLs for AEM content pages (DA-published pages at `/{BRANCH}/of1`, `/{BRANCH}/block-catalog`, etc.).

## Process

### 1. Build deliverables directory

Create `deliverables/{BRANCH}/` and collect all standalone HTML deliverables:

```bash
mkdir -p deliverables/{BRANCH}

# Copy standalone HTML files
cp stardust/current/brand-review.html deliverables/{BRANCH}/brand-review.html
cp stardust/prototypes/*.html deliverables/{BRANCH}/   # rename to prototype-{slug}.html
cp content/{BRANCH}/of1-review.html deliverables/{BRANCH}/of1-review.html
```

### 2. Generate OF1 config review page

Build `deliverables/{BRANCH}/of1-review.html` — a self-contained HTML page (inline styles, no external deps) that displays ALL worker config for user approval:

**Required sections:**
- **Search UI** — title, subtitle, placeholder, all suggestion chips (from suggestions.json)
- **Products** — grid of all products with thumbnail images, price, truncated description, feature list, image count (from products.json)
- **Block Set** — visual tags for each block in block-guide.json + intent-to-block mapping table
- **Brand Voice** — personality, tone, vocabulary (use), avoid words (from brand-voice.json)
- **Personas** — cards for each persona with name and description (from personas.json)

**Image validation:** Every product image URL must be real and loadable. If any return 404, flag them.

### 3. Generate demo hub page

Build `deliverables/{BRANCH}/index.html` — a single entry point linking to all deliverables. Self-contained HTML with inline styles.

**Required sections:**
- **Discovery & Extraction** — link to brand-review.html
- **Prototypes** — links to each prototype-*.html file
- **EDS Pages** — links to AEM preview URLs (absolute: `https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/{BRANCH}/`)
- **OF1 Generative** — links to OF1 page, block catalog (AEM), and config review (relative)

Use badges to distinguish link types:
- `AEM Preview` (green) — for DA-published content pages
- `Standalone` (orange) — for self-contained HTML in deliverables/
- `Config` (blue) — for config review page

### 4. Commit and push to trigger EDS serving

```bash
git add deliverables/{BRANCH}/
git commit -m "feat: add demo hub and deliverables for {DOMAIN}"
git push origin {BRANCH}
```

After push, files are immediately available at:
`https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/index.html`

**Present the hub URL to the user for review.** This is a gate — do not deploy to the worker until they approve.

### 5. Deploy tenant config

Upload each config file individually to avoid 500s on large payloads:

```bash
WORKER_URL="https://of1-gen-web-service.franklin-prod.workers.dev"
for key_file in "brandVoice:brand-voice" "blockGuide:block-guide" "products:products" "personas:personas" "useCases:use-cases" "features:features" "faqs:faqs" "suggestions:suggestions" "brandGovernance:brand-governance"; do
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
  -d "{\"url\": \"https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/${BRANCH}/of1\"}"
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

- `deliverables/{BRANCH}/index.html` — **Demo Hub** (entry point to everything)
- `deliverables/{BRANCH}/brand-review.html` — Brand extraction review
- `deliverables/{BRANCH}/prototype-*.html` — Pixel-perfect HTML prototypes
- `deliverables/{BRANCH}/of1-review.html` — Config review dashboard
- `content/{BRANCH}/block-catalog.html` — Block catalog (DA/AEM published)
- Tenant config deployed to worker
- OF1 endpoint registered
- Test generation verified

## Completion

Present final report with the hub URL:

```
## Demo Ready: {DOMAIN}

**Demo Hub:** https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/index.html

All deliverables:
- OF1 page: https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/{BRANCH}/of1
- Block catalog: https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/{BRANCH}/block-catalog
- EDS site: https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/{BRANCH}/
- Config review: https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/of1-review.html
- DA.live: https://da.live/#/aem-growth-adoption/of1-demo/{BRANCH}
- Worker tenant: deployed + verified
```

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":12,"status":"done","deliverable":"https://{BRANCH}--of1-demo--aem-growth-adoption.aem.page/deliverables/{BRANCH}/index.html"}' > /shared/of1-demo/step-12-status.json
```
