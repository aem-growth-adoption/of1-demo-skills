# Common pitfalls — OF1 demo pipeline

Durable, cross-skill rules. Each step skill should reference this file rather than restating the same warnings; per-skill tables keep only entries genuinely specific to that skill's outputs.

Tagging legend: `[SLICC]` = only applies in the SLICC runtime, `[CC]` = only applies in Claude Code, no tag = applies in both.

---

## 1. DA content authoring

### 1.1 DA strips `<img>`, `<picture>`, `<svg>`, `<video>` from uploaded content
DA's HTML→Markdown→HTML round-trip removes them. Consequence: **never put images in DA content docs**. Keep all visual elements in the template HTML (served from the code bus, not DA). Only put text in DA slots. If an image must be authorable, store its URL as plain text in a DA slot and have the template read it via `data-slot` on the `<img>` element.

**Canonical reference:** `of1-snowflake` § "Template Gets EVERYTHING Visual".

### 1.2 EDS reserves the `.header` and `.footer` class names
EDS wraps the page header in `<div class="header-wrapper"><div class="header block">...</div></div>` and the footer the same way. Using `class="header"` on the prototype's `<header>` element causes CSS rules like `.header { display: flex }` to target both the EDS wrapper AND your element, breaking layout.

**Rule:** Use `class="site-header"` and `class="site-footer"` in prototype/template HTML and the matching CSS selectors.

**Canonical reference:** `of1-snowflake` § "EDS Class Name Collisions" and `of1-prototype` § post-gen fixes.

### 1.3 Required EDS block-wrapper resets
Every template CSS file MUST start with:
```css
.header-wrapper { max-width: 100% !important; padding: 0 !important; }
.header.block { display: block !important; }
.footer-wrapper { max-width: 100% !important; padding: 0 !important; }
.footer.block { display: block !important; }
```
Without these, EDS's default wrappers override the prototype's layout.

### 1.4 Announcement bars must be siblings of `<header>`, never nested inside
EDS's `.header.block { display: flex }` will render the announcement bar and nav on the same line if the bar is nested. Keep promo/announcement bars as separate `<div>` elements ABOVE the `<header>`.

### 1.5 DA content format — every cell value must be wrapped in `<p>`
The format EDS expects in DA content docs:
```html
<div><div><p>slot-name</p></div><div><p>actual value</p></div></div>
```
Missing `<p>` wrappers → EDS sees empty cells → page renders blank `<div></div>` in `<main>`. Headings keep their tags inside the value cell (`<div><h1>Title</h1></div>`) but the slot-name cell is always `<p>`.

The metadata block MUST be the LAST direct child of `<main>`. `<header></header>` and `<footer></footer>` tags MUST be present even when empty.

**Canonical reference:** `of1-snowflake` § "DA Content Format".

### 1.6 Full-bleed sections need wrapper overrides
EDS wraps each section in a `.<section-class>-wrapper` div with `max-width: 1440px` by default. Hero, banners, and any full-width section need explicit overrides in CSS:
```css
.hero-wrapper, .promo-banner-wrapper { max-width: 100% !important; padding: 0 !important; }
```

---

## 2. Image handling

### 2.1 ALL product images MUST be self-hosted on DA
Never leave external CDN URLs in `products.json` — not AEM delivery URLs, not the customer's site URLs, not third-party CDNs. External URLs break due to CORS, referrer policies, encoding, CDN token expiration, and EDS image-optimization rewriting.

**Required URL pattern after upload:**
```
https://content.da.live/{owner}/{repo}/{branch}/media/product-{id}-{n}.{ext}
```

**Canonical reference:** `of1-content-metadata` § "Pull Product Assets".

### 2.2 Minimum 2 images per product
The pre-launch checklist FAILS if any product has fewer than 2 images. If a product detail page only shows 1 image, source additional ones from category/listing pages, manufacturer press pages, or related model pages.

### 2.3 Image format — use `png` or `jpg`, never `webply`
Construct image URLs with `format=png` or `format=jpg` for browser compatibility. `format=webply` causes rendering issues across browsers.

### 2.4 Never invent or hallucinate image URLs
Only use URLs that were extracted from the live DOM via Playwright and downloaded successfully (>10KB). Inventing URLs leads to broken images and user frustration.

### 2.5 Image paths in committed HTML must be absolute from repo root
HTML deliverables served on EDS need paths like `/deliverables/assets/screenshots/home.png`, not `assets/screenshots/...`. Relative paths break because the HTML is served at `/deliverables/brand-review.html` while assets are at `/deliverables/assets/...`.

---

## 3. Brand logo

### 3.1 Always use the complete logo SVG
Logos extracted from `<symbol>` sprites can be truncated. Extract the full `innerHTML` of the symbol element, wrap in a standalone `<svg>` with the correct `viewBox`, and verify the SVG ends with `</svg>` and renders the complete wordmark before committing.

### 3.2 Footer logo must use the SAME complete SVG as the header
Only the fill color changes (e.g. `fill="#F4E9DC"` for dark footer backgrounds). Never truncate or substitute.

---

## 4. URL patterns

### 4.1 Tenant ID format
The OF1 worker tenant ID is `{branch}--{repo}--{owner}` (e.g. `wknd-3--of1-demo--aem-growth-adoption`). Setting it to the customer domain breaks worker generation. Never use the site domain as the tenant ID.

### 4.2 Content URLs use the branch as the path prefix
```
https://{branch}--of1-demo--aem-growth-adoption.aem.page/{branch}/{page}
                                                          ^^^^^^^^
                                                          content prefix = branch name
```
Not the domain, not the repo, not any other variant.

### 4.3 Static files served from git keep their `.html` extension
A file committed at `deliverables/config-review.html` is served at `/deliverables/config-review.html` — NOT at `/deliverables/config-review` (that 404s). DA-authored content pages (like `/of1`, `/prototype-home`) do NOT need the extension.

---

## 5. Curl pitfalls

### 5.1 `--data-binary @/path/file` can silently fail
Curl's `@<path>` expansion can fail under sandboxed shells (notably SLICC scoops), uploading the literal string `@/workspace/...` instead of the file contents. Always pipe via stdin:
```bash
cat file | curl ... --data-binary @-
```

### 5.2 Use `-d "$VAR"` only for short strings
For binary or multi-KB content, always pipe via stdin. For short JSON or headers, `-d "$VAR"` is fine.

---

## 6. Git workflow

### 6.1 One commit + one push per step
Multiple pushes per step waste 2-3 minutes each on preview triggers. Generate all artifacts first, then `git add . && git commit && git push origin $BRANCH` once.

### 6.2 Some pipeline artifacts live in `.gitignore`
`stardust/` is sometimes ignored. If `git add stardust/` shows nothing, use `git add -f stardust/current/...`.

---

## 7. Runtime-specific traps

### 7.1 `[SLICC]` Node.js is a SHIM — do not use it
SLICC's `node` and `npm` binaries are stubs. Don't use `.mjs` files, don't write `npm` scripts, don't run `npx`. Use Python (`python3`) for all scripting.

### 7.2 `[SLICC]` These auth approaches DO NOT exist
- `npx da-auth-helper` — the package isn't installed
- `~/.aem/da-token.json` — the file doesn't exist
- Use `oauth-token adobe` to get the IMS token; that's the only working path.

### 7.3 `[SLICC]` `set -o pipefail` is not supported
Don't run scripts that use it. Execute commands manually instead.

### 7.4 `[SLICC]` Python heredocs must use quoted delimiters
`python3 << 'EOF'` — quoted. Unquoted heredocs mangle indentation and shell-expand `$variables` you didn't intend.

### 7.5 `[CC]` The DA mount at `/mnt/da/` does NOT exist
Claude Code has no SLICC-style VFS mount. ALL DA writes must use `admin.da.live` API:
```bash
cat file | curl -s -X PUT \
  -H "Authorization: Bearer $DA_TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary @- \
  "https://admin.da.live/source/$OWNER/$REPO/$BRANCH/page.html"
```

### 7.6 `[CC]` IMS token comes from a file, not a command
There is no `oauth-token` binary. The token is at `$PWD/.hlx/.da-token.json` (project-local) or `$OF1_DEMO_REPO/.hlx/.da-token.json` (repo-local). Read with:
```bash
DA_TOKEN=$(jq -r .access_token .hlx/.da-token.json)
```
Or pick it up from `$ADOBE_IMS_TOKEN` env var if exported.

---

## 8. DA + EDS preview

### 8.1 Triggering preview requires both auth headers
Pass BOTH `Authorization: Bearer <token>` AND `x-content-source-authorization: Bearer <token>` to `admin.hlx.page`:
```bash
curl -X POST \
  -H "Authorization: Bearer $DA_TOKEN" \
  -H "x-content-source-authorization: Bearer $DA_TOKEN" \
  "https://admin.hlx.page/preview/$OWNER/$REPO/$BRANCH/$BRANCH/$PAGE_SLUG"
```

### 8.2 Allowed domains for outbound `curl`
| Domain | Use for |
|---|---|
| `admin.hlx.page` | preview/publish triggers |
| `admin.da.live` | read/write DA content (PUT/GET) |
| `content.da.live` | read-only content delivery (e.g. uploaded images) |
| `*.aem.page` | EDS preview URLs |

---

## How to use this file

When a step skill warns about one of these issues, it should link here instead of restating. Per-skill "Common Mistakes" tables keep only rows that are **specific to that skill's outputs** — generic warnings (DA strips images, EDS class collisions, curl pitfalls, runtime traps) all belong in this doc.
