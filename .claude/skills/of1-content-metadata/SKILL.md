---
name: of1-content-metadata
description: Scrape product data, personas, use cases, features, and FAQs from a website for the tenant config
user-invocable: true
---

# Content Metadata Populator

Crawl a website to extract product data, user personas, use cases, features, and FAQs, producing JSON files for the of1-gen-web-service tenant config.

## ⚡ Speed Priority — Target: 5 minutes

- In pipeline mode, skip user confirmation — just write the files
- Cap at 10-20 products (focused on the demo category from discovery)
- Use discovery output to focus on the right product line

---

## Inputs

- `DOMAIN`: Target domain (e.g., `nvidia.com`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## Schema Reference

Read `/workspace/skills/of1-demo/knowledge/worker-config-schemas.md` for the exact output format of each file:
- § `products.json` — field requirements, vectorized fields, image allowlist
- § `personas.json` — keyword matching behaviour
- § `use-cases.json` — same shape as personas
- § `features.json` — vectorized, needs id/name/description
- § `faqs.json` — vectorized, needs id/question/answer

## Process

### Step 0: Read context (pipeline mode)

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

cd "$REPO_DIR"
mkdir -p of1/config
```

If discovery output exists, read it to focus on the right product category:
```bash
cat /shared/of1-demo/step-3-output.md 2>/dev/null
```

### Step 1: Understand scope

If `DOMAIN` was provided in your prompt (pipeline mode), use `https://{DOMAIN}` and focus on the **demo category** from discovery (10-20 products). Skip asking.

Otherwise, ask the user:
> What should I index? Options:
> 1. **Full catalog** — All products/items on the site
> 2. **Specific category** — Only certain product lines
> 3. **Curated list** — You provide specific URLs
>
> What's the site URL?

### Step 2: Discover catalog

Fetch main product listing pages with **WebFetch**:

```
List every product/item on this page with:
- Name
- URL (full link to detail page)
- Category
- Price (if visible)
- Short description

Also list category/subcategory navigation links.
```

### Step 3: Extract product data

For each product detail page, use **WebFetch**:

```
Extract all product information:
- Full product name
- Price and currency
- Category/subcategory
- Key features (bullet points)
- Description (1-2 sentences)
- Technical specifications
- Use cases mentioned
- Target audience
- Image URLs (primary product image)
- Related products
- Tags/labels
```

For large catalogs (20+) in standalone mode, batch in groups of 5 and check in with the user. In pipeline mode, cap at 20 products from the demo focus category.

### Step 4: Infer personas and use cases

From product data, infer:

**Personas:** Distinct buyer types, trigger keywords, priorities, product mappings.

**Use cases:** Activities/goals, trigger keywords, recommended products.

### Step 5: Extract features and FAQs

**Features:** Cross-product differentiators (technology names, capability categories).

**FAQs:** From FAQ sections or inferred from comparison points and feature explanations.

### Step 6: Present summary (standalone mode only)

**Skip this step in pipeline mode** — go directly to Step 7.

In standalone mode, present and wait for confirmation:

```
## Content Metadata Summary

**Products:** [N] items across [M] categories
**Personas:** [N] identified
**Use Cases:** [N] identified
**Features:** [N] extracted
**FAQs:** [N] questions

Proceed with generating all files?
```

### Step 7: Generate JSON files

Determine domain from URL. Write to `of1/config/`.

The worker's pipeline steps consume these files as follows:
- `rag-products.js` scores products by matching query words against `name`, `category`, `description`, and `keywords`
- `persona-match.js` matches queries (or user interests in personalize mode) against persona `keywords`
- `use-case-match.js` matches queries (or interests) against use-case `keywords`
- `rag-content.js` matches queries against feature `name`/`description` and FAQ `question`/`answer`
- `build-prompt.js` passes matched product data to the LLM — for deep-dive intent it sends ALL fields including `highlights`, `itinerary`, `whatToBring`, etc.

**products.json:**
```json
[
  {
    "id": "product-slug",
    "name": "Product Name",
    "category": "category",
    "price": 999,
    "currency": "USD",
    "images": ["https://site.com/hero.jpg", "https://site.com/detail.jpg"],
    "url": "https://site.com/products/slug",
    "description": "Detailed description (2-3 sentences). This is sent to the LLM.",
    "features": ["Feature 1", "Feature 2"],
    "highlights": ["Key selling point 1", "Key selling point 2"],
    "duration": "5 days",
    "difficulty": "Beginner",
    "groupSize": "2-8",
    "itinerary": ["Day 1: ...", "Day 2: ..."],
    "whatToBring": ["Item 1", "Item 2"],
    "persona": "persona-id",
    "useCase": "use-case-id",
    "keywords": ["search term 1", "search term 2", "synonym", "related phrase"]
  }
]
```

**CRITICAL fields for the worker:**
- `persona` (string): ID of the primary persona this product is for — used by `persona-match.js` to boost RAG scoring
- `useCase` (string): ID of the primary use-case — used by `use-case-match.js` for RAG boosting
- `keywords` (array of 8-12 strings): Search terms a user might type to find this product — used by `rag-products.js` for direct keyword matching (each match adds +2 to score)
- `images` (array): Self-hosted image URLs (uploaded to DA or committed to git at `/assets/products/{id}/{n}.png`). These MUST be local EDS URLs, never external CDN URLs — external URLs break due to encoding issues, CORS, and EDS image optimization rewriting.
- `description` (string): Must be rich enough for the LLM to generate detailed content in deep-dive mode

Without `persona`, `useCase`, and `keywords`, the worker cannot match user queries to the right products and will return irrelevant content.

**personas.json:**
```json
[
  {
    "id": "persona-slug",
    "name": "Persona Name",
    "description": "Who this represents and what they're looking for",
    "keywords": ["trigger", "words", "that", "this", "persona", "would", "type", "in", "search", "bar"],
    "priorities": ["what", "they", "value"],
    "recommendedProducts": ["product-id-1", "product-id-2"]
  }
]
```

**CRITICAL:** `keywords` (array of 10-12 strings) are matched against the user's query by `persona-match.js`. In personalize mode, they're matched against the user's browsing interests. Without keywords, persona matching fails silently and defaults to the first persona.

**use-cases.json:**
```json
[
  {
    "id": "use-case-slug",
    "name": "Use Case Name",
    "description": "What this involves and who it's for",
    "keywords": ["trigger", "keywords", "phrases", "user", "would", "search", "for"],
    "recommendedProducts": ["product-id-1"],
    "relatedPersonas": ["persona-id-1"]
  }
]
```

**CRITICAL:** `keywords` (array of 8-12 strings) are matched against queries by `use-case-match.js`. Without them, use-case matching never triggers.

**features.json:**
```json
[
  {
    "id": "feature-slug",
    "name": "Feature Name",
    "description": "What it does and why it matters. Searched by rag-content.js against the query.",
    "productIds": ["product-1"],
    "category": "feature-category"
  }
]
```

**faqs.json:**
```json
[
  {
    "id": "faq-slug",
    "question": "The question a user might ask?",
    "answer": "The full answer. Both question and answer are searched by rag-content.js.",
    "relatedProducts": ["product-id"],
    "category": "faq-category"
  }
]
```

### Step 8: Cross-reference check

Verify all ID references are consistent across files. Fix mismatches.

### Step 9: Pull Product Assets — MUST SELF-HOST ON DA

**CRITICAL RULE: ALL product images MUST be downloaded and uploaded to DA.** Never leave external CDN URLs in products.json — not AEM delivery URLs, not the customer's site URLs, not any third-party CDN. External URLs break due to CORS, referrer policies, encoding issues, CDN token expiration, and EDS image optimization rewriting.

**Target:** Up to 5 images per product (use fewer if the source page has less) — prioritize:
1. Main product shot (hero/front view)
2. Alternate angle or colorway
3. Lifestyle/in-use shot
4. Detail/close-up shot
5. Package or accessory shot

**How to find images on a product page:**

Use playwright-cli to visit each product detail page and extract ALL product images:

```bash
playwright-cli eval --tab <TAB_ID> "
Array.from(document.querySelectorAll('img'))
  .filter(i => i.naturalWidth > 200 && !i.src.includes('icon') && !i.src.includes('logo'))
  .map(i => ({ src: i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight }))
"
```

Pick up to 5 unique, high-quality product images per product.

**Download ALL images to DA (mount preferred, API fallback):**

```bash
DA_TOKEN=$(oauth-token adobe)

# Create the media folder in DA
mkdir -p /mnt/da/${BRANCH}/media 2>/dev/null

# Download each image — use a clean filename based on product ID
for PRODUCT_ID in <product-ids>; do
  for N in 1 2 3 4 5; do
    IMAGE_URL="${EXTRACTED_URLS[$PRODUCT_ID][$N]}"
    [ -z "$IMAGE_URL" ] && continue
    
    FILENAME="product-${PRODUCT_ID}-${N}.png"
    
    # Download from source
    curl -sL "${IMAGE_URL}" -o "/tmp/${FILENAME}"
    
    # Verify download (must be > 10KB)
    SIZE=$(wc -c < "/tmp/${FILENAME}" 2>/dev/null || echo 0)
    if [ "$SIZE" -lt 10000 ]; then
      echo "⚠️ Skipping ${FILENAME} — download too small (${SIZE} bytes)"
      continue
    fi
    
    # Upload to DA — try mount first, then API
    if cp "/tmp/${FILENAME}" "/mnt/da/${BRANCH}/media/${FILENAME}" 2>/dev/null; then
      echo "✓ mount: ${FILENAME}"
    else
      # Fallback: upload via admin.da.live API
      curl -s -X PUT \
        -H "Authorization: Bearer ${DA_TOKEN}" \
        -H "Content-Type: image/png" \
        --data-binary "@/tmp/${FILENAME}" \
        "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/media/${FILENAME}"
      echo "✓ API: ${FILENAME}"
    fi
  done
done
```

**The DA content URL for products.json:**

After downloading to DA, the image is accessible at:
```
https://content.da.live/{OWNER}/{REPO}/{BRANCH}/media/product-{PRODUCT_ID}-1.png
```

**Update products.json images array with DA URLs:**

```json
"images": [
  "https://content.da.live/aem-growth-adoption/of1-demo/${BRANCH}/media/product-house-blend-1.png",
  "https://content.da.live/aem-growth-adoption/of1-demo/${BRANCH}/media/product-house-blend-2.png"
]
```

**Verify at least one image per product is accessible:**
```bash
# Spot-check first image of each product
curl -s -o /dev/null -w "%{http_code}" "https://content.da.live/${OWNER}/${REPO}/${BRANCH}/media/product-${PRODUCT_ID}-1.png"
# Must return 200
```

**IMPORTANT:** Never use invented/fabricated image URLs. Only use URLs extracted from the live site that actually downloaded successfully (> 10KB).

## DO NOT — Image Hosting

- **DO NOT** leave `delivery-p*.adobeaemcloud.com` URLs in products.json — download to DA
- **DO NOT** leave `{customer-domain}/...` URLs in products.json — download to DA
- **DO NOT** leave any external CDN URL in products.json — ALWAYS download to DA
- **DO NOT** skip this step thinking "the URLs work fine" — they break in production
- **DO NOT** use the git repo `/assets/` folder for images — use the DA mount at `/mnt/da/`


### Step 10: Confirm

> Content metadata written to `of1/config/`. Files: products.json, personas.json, use-cases.json, features.json, faqs.json.
> Product images: [N] products, [total] assets at /assets/products/.

## Common Mistakes That Waste Time

| Mistake | Time Cost | Fix |
|---------|-----------|-----|
| Leaving customer CDN image URLs in products.json | 10+ min debugging broken images later | ALWAYS download to DA and use `content.da.live` URLs |
| Leaving `delivery-p*.adobeaemcloud.com` URLs as-is | 10+ min — breaks in OF1 generation | Download to `/mnt/da/{branch}/media/` and use DA URLs |
| Using `frescopa.coffee/products/...` URLs directly | breaks when customer site changes | Download to DA — self-host everything |
| Inventing/hallucinating image URLs | broken images, user frustration | Only use URLs extracted via playwright that return 200 |
| Not verifying downloads (0 byte files) | silent failures | Check each file is > 10KB after download |
| Using git `/assets/` folder for images | large repo, slow clones | Use DA mount at `/mnt/da/{branch}/media/` or admin.da.live API |
| Forgetting to verify DA URLs are accessible | 5 min debugging | `curl -s -o /dev/null -w "%{http_code}" "https://content.da.live/..."` must return 200 |
| DA mount permission denied | 5 min exploring workarounds | Use `admin.da.live` API as fallback — it IS allowed now |
| Using `--data-binary @/path/file` for binary uploads | silent failure | Use `--data-binary "@/tmp/file"` (quoted path with @) for binary; for text use `cat file \| curl --data-binary @-` |

## Tips

- IDs must be URL-friendly slugs (lowercase, hyphens)
- Don't fabricate data — if not on the page, omit it
- Persona keywords should be words users would type, not marketing terms
- 10-30 well-described products work better than 200 sparse entries
- Product images MUST be self-hosted on DA — external CDN URLs ALWAYS break eventually

## Completion (pipeline mode)

When running as part of the OF1 pipeline (step 9), this skill runs alongside `brand-voice-extractor`. Both must complete before step 9 is marked done. After writing all JSON files, write your half of the status:

```bash
mkdir -p /shared/of1-demo
echo '{"step":9,"status":"done","summary":"Content metadata: [N] products, [M] personas, [P] use cases, [Q] features, [R] FAQs."}' > /shared/of1-demo/step-9-content-status.json
```

The orchestrator waits for both `step-9-content-status.json` and `step-9-brand-status.json` before marking step 9 complete.

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
