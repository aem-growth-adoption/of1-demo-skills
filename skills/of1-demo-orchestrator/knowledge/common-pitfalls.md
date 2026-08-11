# Common pitfalls — OF1 demo pipeline

Durable, cross-skill rules. Each step skill should reference this file rather than restating the same warnings; per-skill tables keep only entries genuinely specific to that skill's outputs.

Tagging legend: `[SLICC]` = only applies in the SLICC runtime, `[CC]` = only applies in Claude Code, no tag = applies in both.

---

## 1. DA content authoring

### 1.1 DA strips `<img>`, `<picture>`, `<svg>`, `<video>` from uploaded content
DA's HTML→Markdown→HTML round-trip removes them. Consequence: **never put images in DA content docs**. Keep all visual elements in the template HTML (served from the code bus, not DA). Only put text in DA slots. If an image must be authorable, store its URL as plain text in a DA slot and have the template read it via `data-slot` on the `<img>` element.

**Canonical reference:** `stardust:deploy` § "The ENCODE contract" (images/editorial-content rules).

### 1.2 EDS reserves the `.header` and `.footer` class names
EDS wraps the page header in `<div class="header-wrapper"><div class="header block">...</div></div>` and the footer the same way. Using `class="header"` on the prototype's `<header>` element causes CSS rules like `.header { display: flex }` to target both the EDS wrapper AND your element, breaking layout.

**Rule:** Use `class="site-header"` and `class="site-footer"` in prototype/template HTML and the matching CSS selectors.

**Canonical reference:** `stardust:replica` § recreation (CSS class naming) and `stardust:deploy` § "Naming rules" (never name a block after a reserved EDS class).

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

**Canonical reference:** `stardust:deploy` § "9. Content page scaffold".

### 1.6 Full-bleed sections need wrapper overrides
EDS wraps each section in a `.<section-class>-wrapper` div with `max-width: 1440px` by default. Hero, banners, and any full-width section need explicit overrides in CSS:
```css
.hero-wrapper, .promo-banner-wrapper { max-width: 100% !important; padding: 0 !important; }
```

---

## 2. Image handling

### 2.1 ALL product images MUST be self-hosted on DA and previewed on EDS
Never leave external CDN URLs in `products.json` — not AEM delivery URLs, not the customer's site URLs, not third-party CDNs. External URLs break due to CORS, referrer policies, encoding, CDN token expiration, and EDS image-optimization rewriting.

Uploading to DA alone is not enough — the file only exists in DA's source store until it's **previewed**, which ingests it into EDS's Media Bus. `content.da.live` is DA's authoring/source store; it is access-restricted and is NOT a public delivery endpoint — links to it will fail even though the upload succeeded.

**Required URL pattern after upload + preview:**
```
https://{branch}--{repo}--{owner}.aem.page/media/product-{id}-{n}.{ext}
```

**Canonical reference:** `of1-extract-content` § "Parallel download + upload" (`assets/download-images.mjs` handles both the upload and the preview trigger automatically).

### 2.2 Minimum 4 images per product
The pre-launch checklist FAILS if any product has fewer than 4 images (up to 8). If a product detail page shows only 1–3, source additional ones from category/listing pages, manufacturer press galleries, or related model pages. `of1-extract-content` owns this gate and asserts it before writing its status — this is the canonical threshold; keep it in sync with that skill.

### 2.3 Image format — use `png` or `jpg`, never `webply`
Construct image URLs with `format=png` or `format=jpg` for browser compatibility. `format=webply` causes rendering issues across browsers.

### 2.4 Never invent or hallucinate image URLs
Only use URLs that were extracted from the live DOM via Playwright and downloaded successfully (>10KB). Inventing URLs leads to broken images and user frustration.

### 2.5 Image paths in committed HTML must be absolute from repo root
HTML deliverables served on EDS need paths like `/deliverables/assets/screenshots/home.png`, not `assets/screenshots/...`. Relative paths break because the HTML is served at `/deliverables/config-review.html` while assets are at `/deliverables/assets/...`.

---

## 3. Brand logo

### 3.1 Always use the complete logo SVG
Logos extracted from `<symbol>` sprites can be truncated. Extract the full `innerHTML` of the symbol element, wrap in a standalone `<svg>` with the correct `viewBox`, and verify the SVG ends with `</svg>` and renders the complete wordmark before committing.

### 3.2 Footer logo must use the SAME complete SVG as the header
Only the fill color changes (e.g. `fill="#F4E9DC"` for dark footer backgrounds). Never truncate or substitute.

---

## 4. URL patterns

### 4.1 Tenant ID format
The OF1 worker tenant ID is `{branch}--{repo}--{owner}` (e.g. `wknd-3--labs-abc123--of1-labs`). Setting it to the customer domain breaks worker generation. Never use the site domain as the tenant ID.

### 4.2 Content URLs — branch is in the subdomain only
```
https://{branch}--{repo}--{owner}.aem.page/{page}
```
The branch is NOT repeated as a path prefix. Not the domain, not the repo, not any other variant.

### 4.3 Static files served from git keep their `.html` extension
A file committed at `deliverables/config-review.html` is served at `/deliverables/config-review.html` — NOT at `/deliverables/config-review` (that 404s). DA-authored content pages (like `/of1`, `/prototype-home`) do NOT need the extension.

---

## 5. Curl pitfalls

### 5.1 `--data-binary` silently fails in SLICC scoops
Under SLICC's sandboxed shell, BOTH `--data-binary @/path/file` AND `cat file | curl --data-binary @-` (stdin) store the literal string instead of the file contents — the upload appears to succeed but the file is corrupt. Reliable methods by content type:
- **`[SLICC]` short HTML/JSON** — put the content in a shell variable and use `-d "$VAR"`.
- **`[SLICC]` binary (images)** — use a multipart POST: `-F "data=@/path/file;type=image/png"`.
- **`[CC]` any content** — `cat file | curl --data-binary @-` (stdin) works.

Always verify by reading the content back (`curl -s -H "Authorization: Bearer $DA_TOKEN" "https://admin.da.live/source/..."`) and checking it contains the expected bytes.

### 5.2 Use `-d "$VAR"` only for short strings
For short JSON or headers, `-d "$VAR"` is fine in both runtimes. For binary/multi-KB content, follow 5.1 per runtime.

---

## 6. Git workflow

### 6.1 One commit + one push per step
Multiple pushes per step waste 2-3 minutes each on preview triggers. Generate all artifacts first, then commit + push once.

⚠️ **NEVER use `git add .` or `git add -A` in a scoop.** SLICC scoops may have an incomplete working tree — `git add .` creates a commit containing ONLY the local files, effectively deleting everything else on push. Always add specific paths:

```bash
# ✅ CORRECT — only stages the files this step produced
git add templates/ styles/ fragments/ of1/config/

# ❌ WRONG — can destroy the entire repo if working tree is incomplete
git add .
git add -A
```

### 6.2 Some pipeline artifacts live in `.gitignore`
`stardust/` is sometimes ignored. If `git add stardust/` shows nothing, use `git add -f stardust/current/...`.

---

## 7. Runtime-specific traps

### 7.1 `[SLICC]` `node` works, but only the portable surface — and NO synchronous subprocess
The pipeline's build scripts are single `.mjs` files run via `node "$SKILL_DIR/assets/<tool>.mjs" <args>` on **both** runtimes (the `.py`/`.jsh` twins were retired — see `docs/superpowers/specs/2026-08-03-of1-mjs-script-consolidation-design.md`). SLICC's `node` runs these fine **provided** they stay on the cross-runtime surface:
- **No synchronous subprocess** — `child_process.execSync`/`spawnSync`/`execFileSync` throw on SLICC. Use `node:*` builtins, `process.argv`, and global `fetch` only.
- Don't write `npm` scripts or run `npx`; invoke the `.mjs` directly with `node`.
- SLICC init runs `ipk add esbuild-wasm` (see of1-labs `of1-prompt.ts`) so the scripts' deps resolve.

Ad-hoc scripting inline in a step is still fine in either `python3` or `node`; the point is the *shipped* build tools are `.mjs` and portable.

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
  "https://admin.da.live/source/$OWNER/$REPO/page.html"
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
  "https://admin.hlx.page/preview/$OWNER/$REPO/$BRANCH/$PAGE_SLUG"
```

### 8.2 Allowed domains for outbound `curl`
| Domain | Use for |
|---|---|
| `admin.hlx.page` | preview/publish triggers |
| `admin.da.live` | read/write DA content (PUT/GET) |
| `*.aem.page` | EDS preview URLs (also the correct place to link uploaded images once previewed) |

`content.da.live` is DA's authoring/source store — it is access-restricted, not a public delivery endpoint. Never link images there; use the `*.aem.page` URL after triggering a preview.

---

## 9. playwright-cli syntax (both runtimes)

The step skills call the modern `@playwright/cli` binary, which is present on both the SLICC-native
and CC images. When a skill (or a sub-agent writing its own calls) drives it, use this surface:

- **`open <url>`** to navigate — NOT `visit`.
- **`screenshot --full-page --filename <path>`** — `--full-page` is a bare boolean (no `=value`);
  the output flag is `--filename`, NOT `--output`.
- **`eval`** takes a function form (`() => (…)`); a bare expression returns silently empty.

`of1-check-dependencies` probes for the `open` subcommand and warns if the binary is present but
missing it. (Note: `--output` IS a valid flag on the shipped `.mjs` build tools like
`download-images.mjs` — that is a different tool, not playwright-cli.)

**Canonical reference:** this section. Step skills should link here rather than restating the syntax.

---

## How to use this file

When a step skill warns about one of these issues, it should link here instead of restating. Per-skill "Common Mistakes" tables keep only rows that are **specific to that skill's outputs** — generic warnings (DA strips images, EDS class collisions, curl pitfalls, runtime traps) all belong in this doc.
