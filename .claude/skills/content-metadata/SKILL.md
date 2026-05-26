---
name: content-metadata
description: Scrape product data, personas, use cases, features, and FAQs from a website for the tenant config
user-invocable: true
---

# Content Metadata Populator

Crawl a website to extract product data, user personas, use cases, features, and FAQs, producing JSON files for the of1-gen-web-service tenant config.

## Inputs

- `DOMAIN`: Target domain (e.g., `nvidia.com`). If provided in your prompt context (pipeline mode), use it directly and default to full catalog. Only ask the user if not provided.

## Process

### Step 1: Understand scope

If `DOMAIN` was provided in your prompt (pipeline mode), use `https://{DOMAIN}` and default to **full catalog**. Skip asking.

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

For large catalogs (20+), batch in groups of 5 and check in with the user.

### Step 4: Infer personas and use cases

From product data, infer:

**Personas:** Distinct buyer types, trigger keywords, priorities, product mappings.

**Use cases:** Activities/goals, trigger keywords, recommended products.

### Step 5: Extract features and FAQs

**Features:** Cross-product differentiators (technology names, capability categories).

**FAQs:** From FAQ sections or inferred from comparison points and feature explanations.

### Step 6: Present summary

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

### Step 9: Pull Product Assets

Download 5 images per product from the source site and store them locally so the OF1 generation has reliable, self-hosted image URLs (no external CDN dependency, no encoding issues, no CORS/referrer problems).

**Prerequisite:** `DA_TOKEN` must be available (from the `da-auth` skill earlier in the pipeline). If DA auth is not available, stop and inform the user — DA upload is required for image hosting.

**Target:** Up to 5 images per product (use fewer if the source page has less) — prioritize:
1. Main product shot (flat lay, front view)
2. Alternate colorway(s)
3. Lifestyle/on-model shot(s)
4. Detail shots (pockets, zips, cuffs, materials)

**How to find images on a product page:**
```bash
curl -s "{PDP_URL}" | grep -oP 'https://[^"?&\s]+\.(jpg|png|webp)' | sort -u
```
Pick up to 5 unique, high-quality product images per product. If fewer are available, use what exists.

**Where to store:**
```
{REPO_DIR}/assets/products/{product-id}/1.png
{REPO_DIR}/assets/products/{product-id}/2.png
{REPO_DIR}/assets/products/{product-id}/3.png
{REPO_DIR}/assets/products/{product-id}/4.png
{REPO_DIR}/assets/products/{product-id}/5.png
```

**How to download:**
```bash
mkdir -p assets/products/{product-id}
curl -sL "{IMAGE_URL}" -o assets/products/{product-id}/1.png
```

**Verify each download:** must be > 10KB (failed downloads are 0 bytes or tiny error pages).

**Upload to DA:**

```bash
for f in assets/products/${PRODUCT_ID}/*.png; do
  FILENAME=$(basename "$f")
  cat "$f" | curl -s -X PUT "https://admin.da.live/source/${OWNER}/${REPO}/assets/products/${PRODUCT_ID}/${FILENAME}" \
    -H "Authorization: ${DA_TOKEN}" \
    -H "x-content-source-authorization: ${DA_TOKEN}" \
    -H "Content-Type: image/png" \
    --data-binary @-
done
```

**CRITICAL:** Do NOT use `--data-binary @filepath` — it sends the literal `@path` string in this environment. Always pipe via stdin: `cat file | curl ... --data-binary @-`

**Update products.json images array:**

After uploading, update each product's `images` field with local EDS URLs (include only the images that were successfully downloaded):
```
"images": [
  "${PREVIEW_BASE}/assets/products/{product-id}/1.png",
  "${PREVIEW_BASE}/assets/products/{product-id}/2.png",
  ...
]
```

Where `PREVIEW_BASE` is `https://main--{repo}--{owner}.aem.page` (from repo-config.json).

**Write a manifest:**
```json
// assets/products/manifest.json
{
  "products": {
    "{product-id}": {
      "images": ["1.png", "2.png", "3.png", "4.png", "5.png"],
      "source": "{original-pdp-url}"
    }
  }
}
```

### Step 10: Confirm

> Content metadata written to `of1/config/`. Files: products.json, personas.json, use-cases.json, features.json, faqs.json.
> Product images: [N] products, [total] assets at /assets/products/.

## Tips

- IDs must be URL-friendly slugs (lowercase, hyphens)
- Don't fabricate data — if not on the page, omit it
- Persona keywords should be words users would type, not marketing terms
- 10-30 well-described products work better than 200 sparse entries
- Product images MUST be self-hosted (git or DA) — external CDN URLs break due to encoding, CORS, or image optimization rewriting

## Completion (pipeline mode)

When running as part of the OF1 pipeline (step 8), this skill runs alongside `brand-voice-extractor`. Both must complete before step 8 is marked done. After writing all JSON files, write your half of the status:

```bash
mkdir -p /shared/of1-demo
echo '{"step":8,"status":"done","summary":"Content metadata: [N] products, [M] personas, [P] use cases, [Q] features, [R] FAQs."}' > /shared/of1-demo/step-8-content-status.json
```

The orchestrator waits for both `step-8-content-status.json` and `step-8-brand-status.json` before marking step 8 complete.

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
