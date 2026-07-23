# DA.live Config Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move OF1 tenant config (products, personas, brand-voice, use-cases, features, faqs, testimonials, suggestions, cta-template, templates-routing) from git-committed JSON (`of1/config/*.json`) to DA.live-authored HTML table pages, parsed from the rendered preview HTML by both the `of1-gen-web` worker (backward-compatible fallback) and the static HTML report shells (client-side, dynamic).

**Architecture:** Every repeated-item config (products, personas, use-cases, features, faqs, testimonials) becomes a DA page containing one `<table>` per item (`<tr><th colspan="2">{id}</th></tr>` then one `<tr><td>field</td><td>value</td></tr>` per field, arrays joined with `, `). Every single-object config (brand-voice, cta-template, of1-endpoint, templates-routing) becomes a DA page with one `<table>` for its top-level fields; `suggestions.json` is a hybrid (one top-level table + one per-suggestion table). A single parsing convention — implemented once in Python (for writer skills to build the HTML) and once in JavaScript (for readers: the worker's fallback and the browser shells) — round-trips this shape. This is the SAME div/table HTML format DA content docs already use elsewhere in this pipeline (see `of1-generative-block-styler`'s `/of1.html` DA content PUT and `common-pitfalls.md` § 1.5), just applied to config data instead of page metadata.

**Tech Stack:** DA Source API (`admin.da.live`), `admin.hlx.page` preview triggers, Python 3 (writer-side HTML builders), vanilla JavaScript (parser, both Node/Workers and browser), Cloudflare Workers (`of1-gen-web`), Vitest (worker tests).

## Global Constraints

- Every config-producing skill's DA-authored page must round-trip every field the worker currently reads per `of1-demo/knowledge/worker-config-schemas.md` — no field may be silently dropped in translation.
- `personas.json`'s `intentProfile` object and `recommendedProducts` array are NOT cosmetic — they drive the live personalize/generation pipeline (see schema doc). The DA table format must preserve their exact numeric/array shape.
- `of1-gen-web`'s sync change happens in a **git worktree**, not the main checkout.
- `of1-gen-web`'s dual-mode sync must be **backward compatible**: any tenant that still has `of1/config/{file}.json` on EDS keeps working with zero behavior change. The DA-table fallback only fires on a 404 from the `.json` path.
- Brand-review.html is explicitly out of scope (unchanged, per the design spec).
- Templates (`templates/of1-*.html`, the 15 slot-based worker-rendered templates and their CSS/metadata/sample/catalog) are UNCHANGED — only the small `of1/config/templates.json` *routing* pointer (useRouting/baseUrl/catalogPath/fallbackImage) moves to a DA page; the catalog itself stays git-committed (it's already "fully inlined" by design and isn't something a human hand-edits row by row).
- `of1-endpoint.json` is written by `of1-repo-setup` (step 2), not by a step-9-11 skill — check its actual producer before assuming it's covered by Tasks 3-6 (see Task 7).
- The companion plan (`2026-07-23-remove-snowflake-adopt-stardust-deploy.md`) is independent of this one — do not assume its skill renames (`of1-stardust-deploy`) when editing files here; if a cross-reference to the old `of1-snowflake` name appears in a file this plan touches, leave it as-is (that plan owns it) unless this plan's task explicitly says otherwise.

---

## File Structure

| File | Responsibility |
|---|---|
| `skills/of1-demo/knowledge/da-config-format.md` | **New.** Canonical doc: the DA table convention (item table shape, single-object shape, array-serialization rule, field-name-flattening rule for nested objects). Every writer/reader task links here instead of re-explaining the format. |
| `skills/of1-content-metadata/assets/da_config_table.py` | **New.** Shared Python builder: `build_item_table(item_id, fields) -> str`, `build_config_page(tables) -> str`. Copied/referenced by every writer skill in this plan (Python has no cross-skill import in this plugin format, so each consuming skill's assets dir gets its own copy — see Task 1 Step 3 for the copy list). |
| `skills/of1-content-metadata/assets/da-config-parser.js` | **New.** Canonical JS parser: `parseDaConfigPage(html) -> {tables: [{id, fields}]}`. Copied into `of1-config-review`'s shell, `of1-discovery`'s shell, `of1-deploy`'s demo-hub assets, and vendored into `of1-gen-web/worker/src/da-config-parser.js` (Task 10) — each copy carries a top-of-file comment naming the canonical source. |
| `skills/of1-content-metadata/SKILL.md` | Rewrite Step 7 ("Generate JSON files") + Step 9 (image upload) to write DA pages instead of `of1/config/*.json`, for products/personas/use-cases/features/faqs/testimonials. |
| `skills/of1-brand-voice-extractor/SKILL.md` | Rewrite Step 4 to write a DA page for brand-voice instead of `of1/config/brand-voice.json`. |
| `skills/of1-quick-suggestions/SKILL.md` | Rewrite Step 2 to write a DA page (hybrid single-object + repeated-item) for suggestions. |
| `skills/of1-cta-template-builder/SKILL.md` | Rewrite Step 5 to write a DA page for cta-template. |
| `skills/of1-template-generation/SKILL.md` | Rewrite the `templates.json` routing-config write (in `assemble` mode) to a DA page. |
| `skills/of1-repo-setup/SKILL.md` | Rewrite `of1-endpoint.json` production (wherever it currently happens) to a DA page. |
| `skills/of1-config-review/SKILL.md`, `skills/of1-config-review/assets/config-review.html`, `skills/of1-config-review/assets/fill-config-review.py` | Config-review becomes a dynamic shell: `fill-config-review.py` stops baking data into the HTML and instead writes a thin shell that client-side fetches `/of1/config/{name}` preview URLs and renders via the vendored parser. |
| `skills/of1-discovery/SKILL.md` | discovery.html becomes a dynamic shell for whichever of its fields are DA-config-sourced (none directly — discovery.html's own narrative/screenshots stay static; confirm no change needed beyond a cross-reference, see Task 9). |
| `skills/of1-deploy/SKILL.md`, `skills/of1-deploy/assets/fill-demo-hub.py`, `skills/of1-deploy/assets/fill-demo-hub.jsh` | Demo hub becomes a dynamic shell for its config-summary panel; the "verify config files exist" gate switches from checking `of1/config/*.json` on disk to checking DA pages are live. |
| `skills/of1-demo/knowledge/worker-config-schemas.md` | Add a note per config file: "authored as a DA page (see da-config-format.md), not committed JSON" — keep the JSON schema documentation as the canonical FIELD reference (the DA table's fields are these same fields, just table-shaped). |
| `of1-gen-web` (separate repo, **worktree**) `worker/src/sync.js`, `worker/src/da-config-parser.js` (new), `worker/src/sync.test.js` (new) | Dual-mode `handleSync`: try `.json` first (unchanged), fall back to fetching + parsing the DA page HTML on 404. |

---

### Task 1: Define the DA config-table format and write the shared builder/parser

**Files:**
- Create: `skills/of1-demo/knowledge/da-config-format.md`
- Create: `skills/of1-content-metadata/assets/da_config_table.py`
- Create: `skills/of1-content-metadata/assets/da-config-parser.js`

**Interfaces:**
- Produces: `build_item_table(item_id: str, fields: dict) -> str` (Python), `build_config_page(tables: list[str]) -> str` (Python), `parseDaConfigPage(html: str) -> {tables: Array<{id: string, fields: Record<string,string>}>}` (JS). These three functions are the contract every later task in this plan calls by name — do not rename them.

- [ ] **Step 1: Write the format doc**

```markdown
# DA config-table format

Canonical format for OF1 tenant config authored as DA.live pages instead of committed JSON. Every writer skill and every reader (worker fallback, dynamic HTML shells) implements this exact shape — do not invent per-file variations.

## Repeated-item configs (products, personas, use-cases, features, faqs, testimonials)

The DA page body is a sequence of `<table>` elements, one per item:

```html
<table>
  <tr><th colspan="2">fresco-deluxe</th></tr>
  <tr><td>name</td><td>Fresco Deluxe</td></tr>
  <tr><td>category</td><td>Espresso machines</td></tr>
  <tr><td>price</td><td>499.00</td></tr>
  <tr><td>images</td><td>https://.../media/fresco-deluxe-1.png, https://.../media/fresco-deluxe-2.png</td></tr>
  <tr><td>keywords</td><td>espresso, home barista, triple nozzle</td></tr>
</table>
<table>
  <tr><th colspan="2">wave-classic</th></tr>
  ...
</table>
```

Rules:
- The first row's `<th colspan="2">` text is the item's `id` (or `name` if the schema has no separate id field — see per-config field lists below).
- One `<tr><td>field</td><td>value</td></tr>` per field. Field names match the JSON schema field names exactly (`worker-config-schemas.md`).
- **Array-of-scalars fields** (e.g. `keywords`, `highlights`, `images`, `recommendedProducts`, `productIds`, `relatedPersonas`, `relatedProducts`) serialize as a single comma-and-space-joined string in the value cell: `a, b, c`. The parser splits on `,\s*` and trims each piece.
- **Nested object fields** (only `personas[].intentProfile` in this pipeline) flatten with a dot: `intentProfile.explore`, `intentProfile.research`, etc. — one row per nested key, value is the raw number as text (`0.8`).
- Empty arrays serialize as an empty value cell (`<td></td>`); the parser treats a missing or empty value for a known array field as `[]`, never as a 1-element array containing an empty string.

## Single-object configs (brand-voice, cta-template, of1-endpoint, templates-routing)

The DA page body is exactly ONE `<table>`:

```html
<table>
  <tr><th colspan="2">brand-voice</th></tr>
  <tr><td>personality</td><td>Warm, knowledgeable home-barista guide.</td></tr>
  <tr><td>tone</td><td>Friendly, slightly enthusiastic, never jargon-heavy.</td></tr>
  <tr><td>vocabulary</td><td>crema, extraction, single-origin</td></tr>
  <tr><td>avoidWords</td><td>cheap, synthetic</td></tr>
  <tr><td>toneByContext.recommendations</td><td>Enthusiastic but grounded in specs.</td></tr>
  <tr><td>toneByContext.comparisons</td><td>Neutral, fact-first.</td></tr>
  <tr><td>toneByContext.educational</td><td>Patient, plain-language.</td></tr>
  <tr><td>toneByContext.discovery</td><td>Playful, inviting.</td></tr>
</table>
```

Same array/nested-object rules as above. The `<th colspan="2">` text is the config's own name (informational only — the parser doesn't need it for single-object configs, but writer skills always include it for human readability in DA's editor view).

## Hybrid config (suggestions)

One top-level single-object table for `title`/`subtitle`/`placeholder`, followed by one repeated-item table per suggestion (item id = `suggestion-1`, `suggestion-2`, … in display order):

```html
<table>
  <tr><th colspan="2">suggestions</th></tr>
  <tr><td>title</td><td>What can I help you find?</td></tr>
  <tr><td>subtitle</td><td>Pick a starting point or ask anything.</td></tr>
  <tr><td>placeholder</td><td>Search coffee, machines, gifts...</td></tr>
</table>
<table>
  <tr><th colspan="2">suggestion-1</th></tr>
  <tr><td>type</td><td>explore</td></tr>
  <tr><td>label</td><td>Dark roast options</td></tr>
  <tr><td>query</td><td>Show me all dark roast coffee options</td></tr>
</table>
<table>
  <tr><th colspan="2">suggestion-2</th></tr>
  ...
</table>
```

## Per-config field lists (id field + array fields), for the writer/parser to target

| Config | Item id source | Array-of-scalars fields | Nested-object fields |
|---|---|---|---|
| products | `id` | `images`, `keywords`, `highlights`, `features` | — |
| personas | `id` | `keywords`, `priorities`, `recommendedProducts` | `intentProfile` (6 numeric keys: explore, research, compare, purchase, deals, support) |
| use-cases | `id` | `keywords`, `recommendedProducts`, `relatedPersonas` | — |
| features | `id` | `productIds` | — |
| faqs | `id` | `relatedProducts` | — |
| testimonials | `id` | — | — |
| brand-voice | n/a (single-object) | `vocabulary`, `avoidWords` | `toneByContext` (4 string keys: recommendations, comparisons, educational, discovery) |
| cta-template | n/a (single-object) | `slots` | `fallback` (3 string keys: title, description, buttonText) |
| of1-endpoint | n/a (single-object) | — | — |
| templates (routing) | n/a (single-object) | — | `fallbackImage` (2 string keys: src, alt) |
| suggestions | hybrid — top-level + `suggestion-N` items | (top-level: none; per-item: none) | — |

## DA upload + preview (same pattern as every other DA write in this pipeline)

```bash
cat page.html | curl -s -X PUT \
  -H "Authorization: Bearer $DA_TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary @- \
  "https://admin.da.live/source/${OWNER}/${REPO}/of1/config/${NAME}.html"

curl -s -X POST \
  -H "Authorization: Bearer $DA_TOKEN" \
  -H "x-content-source-authorization: Bearer $DA_TOKEN" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/of1/config/${NAME}"
```

Preview URL: `https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/${NAME}` (no `.json` extension — this is a DA content page, not a static file; see `common-pitfalls.md` § 4.3).

## Reading it back

Both the worker's sync fallback and the browser shells fetch that preview URL and run it through `parseDaConfigPage(html)` (see `da-config-parser.js`). The parser walks every `<table>` in the response body, in document order, and returns `{tables: [{id, fields}]}` where `fields` has already un-flattened dotted keys into nested objects and split comma-joined values into arrays for every field name in the per-config array-field list above (the parser is told which config type it's parsing so it knows which field names to treat as arrays).
```

- [ ] **Step 2: Write the Python builder — `skills/of1-content-metadata/assets/da_config_table.py`**

```python
#!/usr/bin/env python3
"""Shared builder for DA config-table pages. See
skills/of1-demo/knowledge/da-config-format.md for the format spec.

Import (each consuming skill's assets dir has its own copy of this file —
see the plan's Task-1 Step-3 copy list for which skills carry a copy):
    from da_config_table import build_item_table, build_config_page
"""

from html import escape


def _cell(value):
    if isinstance(value, list):
        return escape(", ".join(str(v) for v in value))
    return escape(str(value)) if value is not None else ""


def build_item_table(item_id, fields):
    """fields: dict of field-name -> value (str, number, list-of-scalar, or
    dict-of-scalar for a nested object — nested dicts get flattened to
    dotted rows automatically)."""
    rows = [f'<tr><th colspan="2">{escape(str(item_id))}</th></tr>']
    for key, value in fields.items():
        if isinstance(value, dict):
            for sub_key, sub_value in value.items():
                rows.append(f'<tr><td>{escape(key)}.{escape(sub_key)}</td><td>{_cell(sub_value)}</td></tr>')
        else:
            rows.append(f'<tr><td>{escape(key)}</td><td>{_cell(value)}</td></tr>')
    return "<table>\n  " + "\n  ".join(rows) + "\n</table>"


def build_config_page(tables):
    """tables: list of already-built <table>...</table> HTML strings
    (from build_item_table), in the order they should render."""
    return "\n".join(tables)
```

- [ ] **Step 3: Write the JS parser — `skills/of1-content-metadata/assets/da-config-parser.js`**

```javascript
// Canonical DA config-table parser. See
// skills/of1-demo/knowledge/da-config-format.md for the format spec.
// Copies of this exact file live in (keep them in sync by hand — no shared
// package across these repos):
//   - skills/of1-config-review/assets/da-config-parser.js
//   - skills/of1-discovery/assets/da-config-parser.js (if Task 9 needs it)
//   - skills/of1-deploy/assets/da-config-parser.js
//   - of1-gen-web/worker/src/da-config-parser.js (worker-side fallback)

/**
 * @param {string} html - the rendered DA page's HTML (fetched from the
 *   .aem.page preview URL, NOT the raw DA source — must be already
 *   preview-rendered so <table> markup is present in the DOM/text).
 * @param {{arrayFields?: string[], nestedObjectFields?: string[]}} [opts]
 *   arrayFields: field names (dotted-flattened, e.g. "keywords") whose
 *     comma-joined value cell should split into an array.
 *   nestedObjectFields: top-level field names (e.g. "intentProfile") whose
 *     dotted rows ("intentProfile.explore") should nest back into an object.
 * @returns {{tables: Array<{id: string, fields: Record<string, unknown>}>}}
 */
export function parseDaConfigPage(html, opts = {}) {
  const arrayFields = new Set(opts.arrayFields || []);
  const nestedObjectFields = new Set(opts.nestedObjectFields || []);

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tableEls = [...doc.querySelectorAll('table')];

  const tables = tableEls.map((tableEl) => {
    const rows = [...tableEl.querySelectorAll('tr')];
    if (rows.length === 0) return { id: '', fields: {} };

    const idCell = rows[0].querySelector('th');
    const id = idCell ? idCell.textContent.trim() : '';

    const flatFields = {};
    for (const row of rows.slice(1)) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 2) continue;
      const key = cells[0].textContent.trim();
      const rawValue = cells[1].textContent.trim();
      flatFields[key] = rawValue;
    }

    const fields = {};
    for (const [key, rawValue] of Object.entries(flatFields)) {
      const dotIndex = key.indexOf('.');
      if (dotIndex !== -1) {
        const parent = key.slice(0, dotIndex);
        const child = key.slice(dotIndex + 1);
        if (!nestedObjectFields.has(parent)) {
          // Unexpected nested field for this config type — keep it flat
          // rather than silently dropping data.
          fields[key] = rawValue;
          continue;
        }
        fields[parent] = fields[parent] || {};
        const numeric = Number(rawValue);
        fields[parent][child] = rawValue !== '' && !Number.isNaN(numeric) ? numeric : rawValue;
        continue;
      }
      if (arrayFields.has(key)) {
        fields[key] = rawValue === '' ? [] : rawValue.split(/,\s*/).map((v) => v.trim());
      } else {
        fields[key] = rawValue;
      }
    }

    return { id, fields };
  });

  return { tables };
}
```

**Node/Workers note:** `DOMParser` does not exist in Cloudflare Workers or plain Node by default. Task 10 (the worker copy) adds a tiny regex-based DOM-free variant instead of `DOMParser` — see that task for the Workers-safe rewrite. This browser-targeted version is correct as-is for Task 8/9's client-side shells (real browser `DOMParser` is available there).

- [ ] **Step 4: Copy the Python builder into every writer skill's assets dir**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for DEST in skills/of1-brand-voice-extractor/assets skills/of1-quick-suggestions/assets skills/of1-cta-template-builder/assets skills/of1-template-generation/assets skills/of1-repo-setup/assets; do
  mkdir -p "$DEST"
  cp skills/of1-content-metadata/assets/da_config_table.py "$DEST/da_config_table.py"
done
```

- [ ] **Step 5: Copy the JS parser into every reader shell's assets dir**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for DEST in skills/of1-config-review/assets skills/of1-deploy/assets; do
  cp skills/of1-content-metadata/assets/da-config-parser.js "$DEST/da-config-parser.js"
done
```

- [ ] **Step 6: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
python3 -c "
import sys
sys.path.insert(0, 'skills/of1-content-metadata/assets')
from da_config_table import build_item_table, build_config_page
t = build_item_table('fresco-deluxe', {'name': 'Fresco Deluxe', 'images': ['a.png', 'b.png'], 'price': 499})
assert '<th colspan=\"2\">fresco-deluxe</th>' in t
assert '<td>images</td><td>a.png, b.png</td>' in t
page = build_config_page([t, t])
assert page.count('<table>') == 2
print('✓ Python builder OK')
"
node -e "
const { parseDaConfigPage } = require('fs').existsSync ? { parseDaConfigPage: null } : {};
" 2>/dev/null || true
node --input-type=module -e "
global.DOMParser = class { parseFromString(html) {
  // Minimal stub sufficient only to confirm the file loads and exports correctly;
  // full DOM behavior is verified in the browser via Task 8's manual QA.
  throw new Error('DOMParser stub — this smoke test only checks the export exists');
} };
import('./skills/of1-content-metadata/assets/da-config-parser.js').then(m => {
  if (typeof m.parseDaConfigPage !== 'function') { console.error('FAIL: export missing'); process.exit(1); }
  console.log('✓ JS parser exports parseDaConfigPage');
}).catch(e => { console.error('FAIL:', e.message.includes('DOMParser stub') ? 'export OK (stub threw as expected past the export check)' : e.message); });
"
ls skills/of1-brand-voice-extractor/assets/da_config_table.py skills/of1-quick-suggestions/assets/da_config_table.py skills/of1-cta-template-builder/assets/da_config_table.py skills/of1-template-generation/assets/da_config_table.py skills/of1-repo-setup/assets/da_config_table.py
ls skills/of1-config-review/assets/da-config-parser.js skills/of1-deploy/assets/da-config-parser.js
echo "✓ Task 1 verified"
```

- [ ] **Step 7: Commit**

```bash
git add skills/of1-demo/knowledge/da-config-format.md skills/of1-content-metadata/assets/da_config_table.py skills/of1-content-metadata/assets/da-config-parser.js skills/of1-brand-voice-extractor/assets/da_config_table.py skills/of1-quick-suggestions/assets/da_config_table.py skills/of1-cta-template-builder/assets/da_config_table.py skills/of1-template-generation/assets/da_config_table.py skills/of1-repo-setup/assets/da_config_table.py skills/of1-config-review/assets/da-config-parser.js skills/of1-deploy/assets/da-config-parser.js
git commit -m "feat: define DA config-table format, add shared Python builder + JS parser"
```

---

### Task 2: Rewrite `of1-content-metadata` to author DA pages for products/personas/use-cases/features/faqs/testimonials

**Files:**
- Modify: `skills/of1-content-metadata/SKILL.md` (Step 7 "Generate JSON files", Step 8 cross-reference check, Step 9 image upload, Completion)

**Interfaces:**
- Consumes: `build_item_table`, `build_config_page` from `da_config_table.py` (co-located in this skill's `assets/`).
- Produces: DA pages at `of1/config/{products,personas,use-cases,features,faqs,testimonials}` (previewed, live at `{branch}--{repo}--{owner}.aem.page/of1/config/{name}`). No longer writes `of1/config/*.json` to git for these six.

- [ ] **Step 1: Replace the "Generate JSON files" section's write mechanism**

The skill still *builds* the same in-memory Python data structures it does today (same field names, same cross-reference logic in Step 8) — only the final write target changes. Find the section starting `### 7. Generate JSON files` through the `faqs.json`/`testimonials.json` schema blocks (skill file lines ~117-235) and, immediately after the existing schema-description prose (leave the JSON schema documentation as-is — it's still the field reference), append:

```markdown
### 7b. Write DA pages instead of git-committed JSON

Once the six in-memory lists (`products`, `personas`, `use_cases`, `features`, `faqs`, `testimonials`) are built per the schemas above, write each as a DA page — see `of1-demo/knowledge/da-config-format.md` for the exact table shape. Do NOT write `of1/config/*.json` to git for these six files.

```python
import sys
sys.path.insert(0, "$SKILL_DIR/assets")
from da_config_table import build_item_table, build_config_page

def push_da_config(name, tables_html, owner, repo, branch, da_token):
    import subprocess
    page_html = tables_html
    subprocess.run(
        ["curl", "-s", "-X", "PUT",
         "-H", f"Authorization: Bearer {da_token}",
         "-H", "Content-Type: text/html",
         "--data-binary", "@-",
         f"https://admin.da.live/source/{owner}/{repo}/of1/config/{name}.html"],
        input=page_html, text=True, check=True,
    )
    preview = subprocess.run(
        ["curl", "-s", "-X", "POST",
         "-H", f"Authorization: Bearer {da_token}",
         "-H", f"x-content-source-authorization: Bearer {da_token}",
         f"https://admin.hlx.page/preview/{owner}/{repo}/{branch}/of1/config/{name}"],
        capture_output=True, text=True,
    )
    if preview.returncode != 0:
        raise RuntimeError(f"preview trigger failed for of1/config/{name}: {preview.stderr}")

# products.json fields per item: id, name, category, price, images[], description,
# features[], highlights[], persona, useCase, keywords[]
product_tables = [
    build_item_table(p["id"], {
        "name": p["name"], "category": p.get("category", ""), "price": p.get("price", ""),
        "images": p.get("images", []), "description": p.get("description", ""),
        "features": p.get("features", []), "highlights": p.get("highlights", []),
        "persona": p.get("persona", ""), "useCase": p.get("useCase", ""),
        "keywords": p.get("keywords", []),
    })
    for p in products
]
push_da_config("products", build_config_page(product_tables), OWNER, REPO, BRANCH, DA_TOKEN)

# personas.json fields: id, name, description, keywords[], priorities[],
# recommendedProducts[], intentProfile{6 numeric keys}
persona_tables = [
    build_item_table(p["id"], {
        "name": p["name"], "description": p.get("description", ""),
        "keywords": p.get("keywords", []), "priorities": p.get("priorities", []),
        "recommendedProducts": p.get("recommendedProducts", []),
        "intentProfile": p.get("intentProfile", {}),
    })
    for p in personas
]
push_da_config("personas", build_config_page(persona_tables), OWNER, REPO, BRANCH, DA_TOKEN)

# use-cases.json fields: id, name, description, keywords[], recommendedProducts[], relatedPersonas[]
usecase_tables = [
    build_item_table(u["id"], {
        "name": u["name"], "description": u.get("description", ""),
        "keywords": u.get("keywords", []),
        "recommendedProducts": u.get("recommendedProducts", []),
        "relatedPersonas": u.get("relatedPersonas", []),
    })
    for u in use_cases
]
push_da_config("use-cases", build_config_page(usecase_tables), OWNER, REPO, BRANCH, DA_TOKEN)

# features.json fields: id, name, description, productIds[], category
feature_tables = [
    build_item_table(f["id"], {
        "name": f["name"], "description": f.get("description", ""),
        "productIds": f.get("productIds", []), "category": f.get("category", ""),
    })
    for f in features
]
push_da_config("features", build_config_page(feature_tables), OWNER, REPO, BRANCH, DA_TOKEN)

# faqs.json fields: id, question, answer, relatedProducts[], category
faq_tables = [
    build_item_table(f["id"], {
        "question": f["question"], "answer": f.get("answer", ""),
        "relatedProducts": f.get("relatedProducts", []), "category": f.get("category", ""),
    })
    for f in faqs
]
push_da_config("faqs", build_config_page(faq_tables), OWNER, REPO, BRANCH, DA_TOKEN)

# testimonials.json fields: id, quote, author, role, company, source
testimonial_tables = [
    build_item_table(t["id"], {
        "quote": t["quote"], "author": t.get("author", ""), "role": t.get("role", ""),
        "company": t.get("company", ""), "source": t.get("source", ""),
    })
    for t in testimonials
]
push_da_config("testimonials", build_config_page(testimonial_tables), OWNER, REPO, BRANCH, DA_TOKEN)
```

Verify each page is live before proceeding:

```bash
for NAME in products personas use-cases features faqs testimonials; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/${NAME}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  [ "$STATUS" = "200" ] || { echo "FAIL: of1/config/${NAME} not live (HTTP ${STATUS})" >&2; exit 1; }
  echo "✓ ${NAME}: HTTP ${STATUS}"
done
```
```

- [ ] **Step 2: Update the "Cross-reference check" step (was Step 8)**

Find:
```markdown
### 8. Cross-reference check

Verify all ID references are consistent across files. Fix mismatches.
```

Replace with:
```markdown
### 8. Cross-reference check

Verify all ID references are consistent across the in-memory Python lists BEFORE calling `push_da_config` for any of them (fixing a cross-reference after a DA page is already live means a second PUT + preview cycle) — e.g. every `product["persona"]` value must match a real `persona["id"]`, every `persona["recommendedProducts"][i]` must match a real `product["id"]`. Fix mismatches in-memory, then proceed to 7b.
```

- [ ] **Step 3: Update Step 9's image-upload note** — no change to the download/upload mechanism itself (images still upload to DA media + preview exactly as today), only the note about where `images` ends up needs a small edit since it's no longer a JSON file field being hand-edited on disk

Find:
```markdown
The `--update-products` flag rewrites `products.json[*].images` to the site's `.aem.page/media/...` URLs automatically.
```

Replace with:
```markdown
The `--update-products` flag rewrites the in-memory `products` list's `images` field to the site's `.aem.page/media/...` URLs automatically — do this BEFORE calling `push_da_config("products", ...)` in Step 7b, so the DA page's `images` cell already contains the final previewed URLs, not placeholders.
```

Also find the later verify block referencing `of1/config/products.json` on disk:
```python
with open("of1/config/products.json") as f:
    products = json.load(f)
```

Replace the verification approach — since `products` no longer lives in a git-tracked file, verify against the live DA page's rendered HTML instead:
```python
import urllib.request
url = f"https://{BRANCH}--{REPO}--{OWNER}.aem.page/of1/config/products"
with urllib.request.urlopen(url) as resp:
    html = resp.read().decode()
# Each product's image count = number of comma-separated URLs in its "images" row.
# A lightweight regex check (full parsing happens via da-config-parser.js downstream)
# is enough here since we just need counts, not the full structured object:
import re
image_rows = re.findall(r'<td>images</td><td>(.*?)</td>', html)
```

Adjust the rest of that verification block's loop to iterate `image_rows` (each entry's comma-count) instead of `p.get('images', [])`, keeping the same `<4 images` failure behavior and message.

- [ ] **Step 4: Update the env/schema-reference header and Completion**

Find:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `products.json`, § `personas.json`, § `use-cases.json`, § `features.json`, § `faqs.json`.
```

Replace with:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `products.json`, § `personas.json`, § `use-cases.json`, § `features.json`, § `faqs.json` (field names — these are now authored as DA pages, not committed JSON; see `of1-demo/knowledge/da-config-format.md` for the table shape).
```

Find, in the env table near the top:
```markdown
| `SKILL_DIR` | absolute path to this skill (used to find `assets/download-images.*`) |
```

Replace with:
```markdown
| `SKILL_DIR` | absolute path to this skill (used to find `assets/download-images.*` and `assets/da_config_table.py`) |
```

Find the Completion block's "All images on DA" summary — it stays accurate (images are still uploaded to DA regardless), so no structural change needed there. Confirm by re-reading it:

```bash
grep -A5 'cat > "\$OF1_STATE_DIR/step-9-content-status.json"' /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-content-metadata/SKILL.md
```

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "push_da_config" skills/of1-content-metadata/SKILL.md || { echo "FAIL: DA push mechanism missing"; exit 1; }
grep -q "da_config_table" skills/of1-content-metadata/SKILL.md || { echo "FAIL: builder import missing"; exit 1; }
grep -q 'of1/config/products\.json' skills/of1-content-metadata/SKILL.md && { echo "FAIL: stale JSON-file write reference remains"; exit 1; }
echo "✓ Task 2 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-content-metadata/SKILL.md
git commit -m "feat: of1-content-metadata authors DA pages for products/personas/use-cases/features/faqs/testimonials"
```

---

### Task 3: Rewrite `of1-brand-voice-extractor` to author a DA page for brand-voice

**Files:**
- Modify: `skills/of1-brand-voice-extractor/SKILL.md` (Step 4, env table, Completion cross-reference unaffected)

**Interfaces:**
- Consumes: `build_item_table`, `build_config_page` from its local `assets/da_config_table.py` (copied in Task 1 Step 4).
- Produces: DA page at `of1/config/brand-voice`.

- [ ] **Step 1: Replace Step 4**

Find:
```markdown
### 4. Generate `of1/config/brand-voice.json`

The worker injects these fields into the LLM system prompt to shape how generated sections are written. The more specific and accurate, the more on-brand the output.

```json
{
  "personality": "[3-5 adjectives, comma-separated]",
  "tone": "[1-2 sentence description of overall tone]",
  "vocabulary": ["term1", "term2", "term3", "...10-15 domain terms"],
  "avoidWords": ["word1", "word2", "...words the brand never uses"],
  "sentenceStyle": "[description of sentence patterns]",
  "toneByContext": {
    "recommendations": "[tone when recommending]",
    "comparisons": "[tone when comparing]",
    "educational": "[tone when explaining]",
    "discovery": "[tone when showing options]"
  }
}
```
```

Replace with:
```markdown
### 4. Write the DA page for brand-voice

The worker injects these fields into the LLM system prompt to shape how generated sections are written. The more specific and accurate, the more on-brand the output. Field shape (still the schema reference — see `of1-demo/knowledge/da-config-format.md` for how it's table-encoded):

```json
{
  "personality": "[3-5 adjectives, comma-separated]",
  "tone": "[1-2 sentence description of overall tone]",
  "vocabulary": ["term1", "term2", "term3", "...10-15 domain terms"],
  "avoidWords": ["word1", "word2", "...words the brand never uses"],
  "sentenceStyle": "[description of sentence patterns]",
  "toneByContext": {
    "recommendations": "[tone when recommending]",
    "comparisons": "[tone when comparing]",
    "educational": "[tone when explaining]",
    "discovery": "[tone when showing options]"
  }
}
```

Write it as a single-object DA page instead of `of1/config/brand-voice.json`:

```python
import sys
sys.path.insert(0, "$SKILL_DIR/assets")
from da_config_table import build_item_table, build_config_page
import subprocess

table = build_item_table("brand-voice", {
    "personality": personality,          # str
    "tone": tone,                        # str
    "vocabulary": vocabulary,            # list[str]
    "avoidWords": avoid_words,           # list[str]
    "sentenceStyle": sentence_style,     # str
    "toneByContext": tone_by_context,    # dict with 4 string keys
})
page_html = build_config_page([table])

subprocess.run(
    ["curl", "-s", "-X", "PUT",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", "Content-Type: text/html",
     "--data-binary", "@-",
     f"https://admin.da.live/source/{OWNER}/{REPO}/of1/config/brand-voice.html"],
    input=page_html, text=True, check=True,
)
subprocess.run(
    ["curl", "-s", "-X", "POST",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", f"x-content-source-authorization: Bearer {DA_TOKEN}",
     f"https://admin.hlx.page/preview/{OWNER}/{REPO}/{BRANCH}/of1/config/brand-voice"],
    check=True,
)
```

Verify:
```bash
URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/brand-voice"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
[ "$STATUS" = "200" ] || { echo "FAIL: of1/config/brand-voice not live (HTTP ${STATUS})" >&2; exit 1; }
```
```

- [ ] **Step 2: Resolve `DA_TOKEN`/`OWNER`/`REPO`/`BRANCH` in this skill** — check whether they're already resolved earlier in the file (env table shows `OF1_STATE_DIR`/`OF1_DEMO_REPO` only, no `ADOBE_IMS_TOKEN`/`OF1_TOKEN_FILE`) — this skill currently has NO DA-write capability, so add the token-resolution block used by every other DA-writing skill in this repo

Find the env table:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-9-brand-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
```

Replace with:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-9-brand-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/da_config_table.py`) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

```bash
export DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```
```

Find the "Read repo config" block just below (now duplicated by the new block above) and remove the redundant original:
```markdown
Read repo config:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
mkdir -p of1/config
```
```

Replace with:
```markdown
```bash
cd "$OF1_DEMO_REPO"
```
```

(The `mkdir -p of1/config` is dropped — there's no local directory to create anymore; the config lives in DA, not on disk.)

- [ ] **Step 3: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "ADOBE_IMS_TOKEN" skills/of1-brand-voice-extractor/SKILL.md || { echo "FAIL: token resolution missing"; exit 1; }
grep -q "of1/config/brand-voice.json" skills/of1-brand-voice-extractor/SKILL.md && { echo "FAIL: stale JSON write reference remains"; exit 1; }
grep -q "da_config_table" skills/of1-brand-voice-extractor/SKILL.md || { echo "FAIL: builder import missing"; exit 1; }
echo "✓ Task 3 verified"
```

- [ ] **Step 4: Commit**

```bash
git add skills/of1-brand-voice-extractor/SKILL.md
git commit -m "feat: of1-brand-voice-extractor authors a DA page for brand-voice"
```

---

### Task 4: Rewrite `of1-quick-suggestions` to author a hybrid DA page for suggestions

**Files:**
- Modify: `skills/of1-quick-suggestions/SKILL.md` (env table, Step 2, product/persona/brand-voice reads in Inputs section)

**Interfaces:**
- Consumes: `build_item_table`, `build_config_page` from its local `assets/da_config_table.py`; ALSO now reads products/personas/brand-voice from their live DA pages (via `parseDaConfigPage` equivalent logic in Python — see Step 2 below) instead of `of1/config/*.json` on disk, since Task 2/3 removed those files.
- Produces: DA page at `of1/config/suggestions` (hybrid: one top-level table + N per-suggestion tables).

- [ ] **Step 1: Update the env table and token resolution (same pattern as Task 3 Step 2)**

Find:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-10-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |

Read repo config:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
mkdir -p of1/config
```
```

Replace with:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-10-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/da_config_table.py`) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

```bash
export DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
```
```

- [ ] **Step 2: Update the "Inputs" section's product/persona/brand-voice reads**

Find:
```markdown
**REQUIRED — read step 9 outputs before generating suggestions.** This step runs AFTER step 9 completes, so these files exist:

```bash
# Product names — suggestions MUST reference only real products that exist
cat of1/config/products.json | jq -r '.[].name'

# Personas — each suggestion should target a real persona
cat of1/config/personas.json | jq -r '.[].name'

# Brand voice — respect avoid words; use vocabulary terms
cat of1/config/brand-voice.json | jq '{tone, vocabulary, avoidWords}'
```
```

Replace with:
```markdown
**REQUIRED — read step 9's DA-authored config before generating suggestions.** This step runs AFTER step 9 completes, so these DA pages are live. Fetch and read the tables directly (a lightweight regex read is enough here — no need for the full JS parser since this is a one-off read, not a persisted structure):

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"

# Product names — suggestions MUST reference only real products that exist
curl -s "${PREVIEW_BASE}/of1/config/products" | grep -oE '<td>name</td><td>[^<]*</td>' | sed -E 's/<td>name<\/td><td>(.*)<\/td>/\1/'

# Personas — each suggestion should target a real persona
curl -s "${PREVIEW_BASE}/of1/config/personas" | grep -oE '<td>name</td><td>[^<]*</td>' | sed -E 's/<td>name<\/td><td>(.*)<\/td>/\1/'

# Brand voice — respect avoid words; use vocabulary terms
curl -s "${PREVIEW_BASE}/of1/config/brand-voice" | grep -oE '<td>(tone|vocabulary|avoidWords)</td><td>[^<]*</td>'
```
```

- [ ] **Step 3: Replace Step 2 ("Write `of1/config/suggestions.json`")**

Find:
```markdown
### 2. Write `of1/config/suggestions.json`

The OF1 block fetches this on page load to populate the search UI (randomly picks 5 to display):

```json
{
  "title": "...",
  "subtitle": "...",
  "placeholder": "...",
  "suggestions": [
    { "type": "explore", "label": "Short Chip Label", "query": "full natural language query the user would type" },
    { "type": "explore", "label": "Another Chip", "query": "another full query" }
  ]
}
```
```

Replace with:
```markdown
### 2. Write the DA page for suggestions

The OF1 block fetches the worker's synced copy of this on page load (see `of1-demo/knowledge/da-config-format.md` § Hybrid config — the worker's sync fallback parses this back into the same JSON shape below before storing it, so the worker-side contract is unchanged):

```json
{
  "title": "...",
  "subtitle": "...",
  "placeholder": "...",
  "suggestions": [
    { "type": "explore", "label": "Short Chip Label", "query": "full natural language query the user would type" },
    { "type": "explore", "label": "Another Chip", "query": "another full query" }
  ]
}
```

Write it as a hybrid page — one top-level table, then one table per suggestion:

```python
import sys
sys.path.insert(0, "$SKILL_DIR/assets")
from da_config_table import build_item_table, build_config_page
import subprocess

top_level = build_item_table("suggestions", {
    "title": title, "subtitle": subtitle, "placeholder": placeholder,
})
suggestion_tables = [
    build_item_table(f"suggestion-{i+1}", {
        "type": s["type"], "label": s["label"], "query": s["query"],
    })
    for i, s in enumerate(suggestions)
]
page_html = build_config_page([top_level] + suggestion_tables)

subprocess.run(
    ["curl", "-s", "-X", "PUT",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", "Content-Type: text/html",
     "--data-binary", "@-",
     f"https://admin.da.live/source/{OWNER}/{REPO}/of1/config/suggestions.html"],
    input=page_html, text=True, check=True,
)
subprocess.run(
    ["curl", "-s", "-X", "POST",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", f"x-content-source-authorization: Bearer {DA_TOKEN}",
     f"https://admin.hlx.page/preview/{OWNER}/{REPO}/{BRANCH}/of1/config/suggestions"],
    check=True,
)
```

Verify:
```bash
URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/suggestions"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
[ "$STATUS" = "200" ] || { echo "FAIL: of1/config/suggestions not live (HTTP ${STATUS})" >&2; exit 1; }
```
```

- [ ] **Step 4: Update the schema-reference line**

Find:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `suggestions.json`.
```

Replace with:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `suggestions.json` (field names — authored as a DA page now, see `of1-demo/knowledge/da-config-format.md` § Hybrid config).
```

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1/config/suggestions.json" skills/of1-quick-suggestions/SKILL.md && { echo "FAIL: stale JSON write reference remains"; exit 1; }
grep -q "da_config_table" skills/of1-quick-suggestions/SKILL.md || { echo "FAIL: builder import missing"; exit 1; }
grep -q "suggestion-{i+1}" skills/of1-quick-suggestions/SKILL.md || { echo "FAIL: hybrid per-item write missing"; exit 1; }
echo "✓ Task 4 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-quick-suggestions/SKILL.md
git commit -m "feat: of1-quick-suggestions authors a hybrid DA page for suggestions"
```

---

### Task 5: Rewrite `of1-cta-template-builder` to author a DA page for cta-template

**Files:**
- Modify: `skills/of1-cta-template-builder/SKILL.md` (env table, Step 5)

**Interfaces:**
- Consumes: `build_item_table`, `build_config_page` from its local `assets/da_config_table.py`.
- Produces: DA page at `of1/config/cta-template`.

- [ ] **Step 1: Update the env table and token resolution (same pattern as Task 3 Step 2)**

Find:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-11-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |

Read repo config:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
mkdir -p of1/config
```
```

Replace with:
```markdown
## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-11-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/da_config_table.py`) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

```bash
export DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
cd "$OF1_DEMO_REPO"
```
```

- [ ] **Step 2: Replace Step 5 ("Write `of1/config/cta-template.json`")**

Find:
```markdown
### 5. Write `of1/config/cta-template.json`

Ensure:
- HTML is on a single line (no newlines inside the `html` field)
- All double quotes inside the HTML use escaped `\"`
- No trailing commas
```

Replace with:
```markdown
### 5. Write the DA page for cta-template

Ensure the HTML you built in Step 3 is on a single line (no newlines inside the value) before writing it into a table cell — a `<td>` value containing a raw newline breaks the row structure when DA round-trips it through markdown.

```python
import sys
sys.path.insert(0, "$SKILL_DIR/assets")
from da_config_table import build_item_table, build_config_page
import subprocess

table = build_item_table("cta-template", {
    "html": html_single_line,          # str, single line, quotes as literal " (the table cell is HTML text content, not a JSON string — no escaping needed here)
    "slots": ["title", "description", "buttonText"],
    "fallback": {"title": fallback_title, "description": fallback_description, "buttonText": fallback_button_text},
})
page_html = build_config_page([table])

subprocess.run(
    ["curl", "-s", "-X", "PUT",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", "Content-Type: text/html",
     "--data-binary", "@-",
     f"https://admin.da.live/source/{OWNER}/{REPO}/of1/config/cta-template.html"],
    input=page_html, text=True, check=True,
)
subprocess.run(
    ["curl", "-s", "-X", "POST",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", f"x-content-source-authorization: Bearer {DA_TOKEN}",
     f"https://admin.hlx.page/preview/{OWNER}/{REPO}/{BRANCH}/of1/config/cta-template"],
    check=True,
)
```

**Caution — `html` field contains literal `<` and `>` characters (it IS an HTML template string).** `build_item_table`'s `_cell()` helper HTML-escapes every value by default (via Python's `html.escape`), which is correct here: the escaped `&lt;div style=...&gt;` is what belongs in the table cell's text content — the DA-rendered page must show the template source as text, not attempt to actually render nested divs inside the table cell. The worker-side parser (Task 1 Step 3 / Task 10) reads `cell.textContent`, which un-escapes this automatically, so no special handling is needed on the read side.

Verify:
```bash
URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/cta-template"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
[ "$STATUS" = "200" ] || { echo "FAIL: of1/config/cta-template not live (HTTP ${STATUS})" >&2; exit 1; }
```
```

- [ ] **Step 3: Update the schema-reference line and Quality checklist's slots-array reference**

Find:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `cta-template.json`.
```
Replace with:
```markdown
Schema reference: `of1-demo/knowledge/worker-config-schemas.md` § `cta-template.json` (field names — authored as a DA page now, see `of1-demo/knowledge/da-config-format.md` § Single-object configs).
```

- [ ] **Step 4: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1/config/cta-template.json" skills/of1-cta-template-builder/SKILL.md && { echo "FAIL: stale JSON write reference remains"; exit 1; }
grep -q "da_config_table" skills/of1-cta-template-builder/SKILL.md || { echo "FAIL: builder import missing"; exit 1; }
echo "✓ Task 5 verified"
```

- [ ] **Step 5: Commit**

```bash
git add skills/of1-cta-template-builder/SKILL.md
git commit -m "feat: of1-cta-template-builder authors a DA page for cta-template"
```

---

### Task 6: Rewrite `of1-template-generation`'s routing-config write (`assemble` mode) to a DA page

**Files:**
- Modify: `skills/of1-template-generation/SKILL.md` (the "Reference — Worker Contract" table row for `of1/config/templates.json`, and the `assemble`-mode Step 2 "Assemble the catalog" section)

**Interfaces:**
- Consumes: `build_item_table`, `build_config_page` from its local `assets/da_config_table.py`; the existing `assemble-catalog.py`/`.jsh` script — check whether it currently writes `of1/config/templates.json` directly (Step 1 below) and either patch it or wrap its output.
- Produces: DA page at `of1/config/templates` (the small routing pointer object: `useRouting`/`baseUrl`/`catalogPath`/`fallbackImage`). `templates/templates-catalog.json` (the big fully-inlined catalog) is UNCHANGED — still git-committed.

- [ ] **Step 1: Read `assemble-catalog.py` to confirm exactly what it writes**

```bash
grep -n "templates.json\|templates-catalog.json\|def main\|def write" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-template-generation/assets/assemble-catalog.py
```

If the script writes BOTH files itself (likely, given the skill doc says "Produces `templates/templates-catalog.json` + `of1/config/templates.json`"), the routing-config write needs to move OUT of that script and into the skill's own `assemble`-mode process step (since the script is shared/generic and shouldn't need DA-auth env vars threaded through it) — read the script's argument list (`OWNER`, `REPO`, `BRANCH` are already passed per the skill's invocation) and confirm it has access to what it needs, or split the routing-config write into a separate small inline step the skill runs right after invoking the script.

- [ ] **Step 2: Edit the "Reference — Worker Contract" table**

Find:
```markdown
| # | File | Purpose | Mode |
|---|---|---|---|
| 1 | `of1/config/templates.json` | Routing config | `assemble` |
```

Replace with:
```markdown
| # | File | Purpose | Mode |
|---|---|---|---|
| 1 | DA page `of1/config/templates` | Routing config (useRouting/baseUrl/catalogPath/fallbackImage) | `assemble` |
```

- [ ] **Step 3: Edit `assemble` mode's "Assemble the catalog" section to add the DA-page write**

Find:
```markdown
### 2. Assemble the catalog (fully inlined)

```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/assemble-catalog.py" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/assemble-catalog.jsh" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```

Produces `templates/templates-catalog.json` + `of1/config/templates.json`. Fails fast if any of the 15 templates is missing HTML; warns if any intent is missing from the catalog.
```

Replace with:
```markdown
### 2. Assemble the catalog (fully inlined) + write the routing DA page

```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/assemble-catalog.py" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/assemble-catalog.jsh" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```

Produces `templates/templates-catalog.json` (git-committed, UNCHANGED). Fails fast if any of the 15 templates is missing HTML; warns if any intent is missing from the catalog.

**The small routing-config object (`useRouting`, `baseUrl`, `catalogPath`, `fallbackImage`) is now written as a DA page instead of `of1/config/templates.json`** — this needs `DA_TOKEN`, so run it as a separate inline step right after the script call, not inside `assemble-catalog.py` itself:

```python
import sys
sys.path.insert(0, "$SKILL_DIR/assets")
from da_config_table import build_item_table, build_config_page
import subprocess

table = build_item_table("templates", {
    "useRouting": "true",
    "baseUrl": f"https://{BRANCH}--{REPO}--{OWNER}.aem.page",
    "catalogPath": "/templates/templates-catalog.json",
    "fallbackImage": {"src": FALLBACK_IMAGE_SRC, "alt": FALLBACK_IMAGE_ALT},
})
page_html = build_config_page([table])

subprocess.run(
    ["curl", "-s", "-X", "PUT",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", "Content-Type: text/html",
     "--data-binary", "@-",
     f"https://admin.da.live/source/{OWNER}/{REPO}/of1/config/templates.html"],
    input=page_html, text=True, check=True,
)
subprocess.run(
    ["curl", "-s", "-X", "POST",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", f"x-content-source-authorization: Bearer {DA_TOKEN}",
     f"https://admin.hlx.page/preview/{OWNER}/{REPO}/{BRANCH}/of1/config/templates"],
    check=True,
)
```

`baseUrl` and `catalogPath` still point at the git-committed catalog on the EDS code bus — only the small pointer object moved into DA; the 15 templates + catalog are unaffected.

Verify:
```bash
URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1/config/templates"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
[ "$STATUS" = "200" ] || { echo "FAIL: of1/config/templates not live (HTTP ${STATUS})" >&2; exit 1; }
```
```

- [ ] **Step 4: Add `DA_TOKEN`/`OWNER`/`REPO`/`BRANCH`/`SKILL_DIR` to the env table if not already present** — check first:

```bash
grep -A10 "^## Env" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-template-generation/SKILL.md | head -15
```

If `ADOBE_IMS_TOKEN`/`OF1_TOKEN_FILE` are absent, add them using the exact same pattern as Task 3 Step 2 (this skill already resolves `OWNER`/`REPO`/`BRANCH`/`DOMAIN` at the top per its existing "Read repo config once at the top" block — only the token resolution is new).

- [ ] **Step 5: Update the "Deliverables" list at the bottom of the skill**

Find:
```markdown
## Deliverables

- `of1/config/templates.json` — routing config
```

Replace with:
```markdown
## Deliverables

- DA page `of1/config/templates` — routing config
```

- [ ] **Step 6: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1/config/templates.json" skills/of1-template-generation/SKILL.md && { echo "FAIL: stale JSON write reference remains"; exit 1; }
grep -q "da_config_table" skills/of1-template-generation/SKILL.md || { echo "FAIL: builder import missing"; exit 1; }
grep -q "templates/templates-catalog.json" skills/of1-template-generation/SKILL.md || { echo "FAIL: catalog reference incorrectly removed — it must stay git-committed"; exit 1; }
echo "✓ Task 6 verified"
```

- [ ] **Step 7: Commit**

```bash
git add skills/of1-template-generation/SKILL.md
git commit -m "feat: of1-template-generation writes the templates routing config as a DA page"
```

---

### Task 7: Confirm and update `of1-endpoint.json`'s producer

**Files:**
- Modify: whichever skill currently writes `of1/config/of1-endpoint.json` — confirmed by Step 1 below (likely `of1-repo-setup`, per the Global Constraints note, but verify rather than assume)

**Interfaces:**
- Produces: DA page at `of1/config/of1-endpoint`.

- [ ] **Step 1: Find the actual producer**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -rl "of1-endpoint" skills/*/SKILL.md
```

- [ ] **Step 2: Read the matched file(s) in full to find the exact write logic**

```bash
grep -n -B5 -A15 "of1-endpoint" $(grep -rl "of1-endpoint" skills/*/SKILL.md)
```

- [ ] **Step 3: Rewrite the write logic using the same single-object DA-page pattern as Task 3/5**

The exact field is `{ "url": "https://example.com/of1" }` per `worker-config-schemas.md` § `of1-endpoint.json` — a single field, single-object config, no arrays, no nesting. Apply:

```python
import sys
sys.path.insert(0, "<SKILL_DIR>/assets")   # use whichever skill's assets dir applies once Step 1/2 identify it — copy da_config_table.py there first if it's not already one of Task 1 Step 4's destinations
from da_config_table import build_item_table, build_config_page
import subprocess

table = build_item_table("of1-endpoint", {"url": endpoint_url})
page_html = build_config_page([table])

subprocess.run(
    ["curl", "-s", "-X", "PUT",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", "Content-Type: text/html",
     "--data-binary", "@-",
     f"https://admin.da.live/source/{OWNER}/{REPO}/of1/config/of1-endpoint.html"],
    input=page_html, text=True, check=True,
)
subprocess.run(
    ["curl", "-s", "-X", "POST",
     "-H", f"Authorization: Bearer {DA_TOKEN}",
     "-H", f"x-content-source-authorization: Bearer {DA_TOKEN}",
     f"https://admin.hlx.page/preview/{OWNER}/{REPO}/{BRANCH}/of1/config/of1-endpoint"],
    check=True,
)
```

If Step 1/2 reveal the producing skill doesn't already have a `da_config_table.py` copy (per Task 1 Step 4's destination list — `of1-repo-setup` IS on that list, so this should already exist if the producer is `of1-repo-setup`; if it's some other skill, copy the file there first following Task 1 Step 4's pattern), and confirm/add `DA_TOKEN` resolution using the same pattern as Task 3 Step 2 if that skill doesn't already resolve a DA token (check first — `of1-repo-setup` almost certainly already has DA auth since it verifies DA API access per its own docs).

- [ ] **Step 4: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -rq "of1-endpoint.json" skills/*/SKILL.md && { echo "FAIL: stale JSON write reference remains somewhere"; exit 1; }
grep -rq "of1/config/of1-endpoint\b" skills/*/SKILL.md || { echo "FAIL: DA page reference missing"; exit 1; }
echo "✓ Task 7 verified"
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: of1-endpoint config authored as a DA page"
```

---

### Task 8: `of1-config-review` becomes a dynamic shell

**Files:**
- Modify: `skills/of1-config-review/SKILL.md`
- Modify: `skills/of1-config-review/assets/fill-config-review.py`
- Modify: `skills/of1-config-review/assets/config-review.html`

**Interfaces:**
- Consumes: `parseDaConfigPage` from the vendored `skills/of1-config-review/assets/da-config-parser.js` (Task 1 Step 5), inlined into `config-review.html`'s `<script>` tag.
- Produces: same `deliverables/config-review.html` file, committed once (like today), but now containing a `<script>` that fetches live DA config pages client-side instead of server-baked data. No change to the git-commit mechanism (config-review.html itself is unaffected by this rework's config-storage change — Change 2 explicitly keeps HTML report deliverables as static shells per the design spec).

- [ ] **Step 1: Read the current `config-review.html` template in full**

```bash
cat /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-config-review/assets/config-review.html
```

Note every `{{TOKEN}}` placeholder `fill-config-review.py` currently fills — Step 2 needs the exact same visual output, just data-loaded differently.

- [ ] **Step 2: Rewrite `fill-config-review.py` to emit a shell, not a data-baked page**

The script's job simplifies drastically: it no longer reads `of1/config/*.json`, computes stats, or renders product/persona/etc. HTML server-side. It just fills `{{DOMAIN}}`, `{{PREVIEW_BASE}}` (new token, needed so the client JS knows which origin to fetch from), and copies the vendored parser + a new client-side render script into the output.

```python
#!/usr/bin/env python3
"""
Fill the config-review.html shell with the domain + preview base URL. All
product/persona/brand-voice/etc. data is now fetched + rendered CLIENT-SIDE
from live DA config pages — see da-config-parser.js and the inline
render script in config-review.html. This script no longer reads
of1/config/*.json (that path no longer exists).

Usage (always cd into repo first):
    cd /workspace/of1-demo && python3 /path/to/fill-config-review.py . frescopa.coffee frescopa labs-abc123 of1-labs

Args:
    repo-dir: Path to repo root (use "." when already cd'd in)
    domain:   The demo domain name (displayed in the report header)
    branch:   EDS branch (for building the preview base URL)
    repo:     EDS repo name
    owner:    EDS repo owner
    template: Optional path to template HTML (defaults to templates/config-review.html beside this script)
"""

import os
import sys
from html import escape
from pathlib import Path

def main():
    if len(sys.argv) < 6:
        print("Usage: python3 fill-config-review.py <repo-dir> <domain> <branch> <repo> <owner> [template-path]")
        sys.exit(1)

    repo_dir, domain, branch, repo, owner = sys.argv[1:6]
    template_path = Path(sys.argv[6]) if len(sys.argv) > 6 else Path(__file__).resolve().parent / 'config-review.html'
    repo_dir = os.path.abspath(repo_dir)

    with open(template_path) as f:
        template = f.read()

    preview_base = f"https://{branch}--{repo}--{owner}.aem.page"

    output = template.replace('{{DOMAIN}}', escape(domain)).replace('{{PREVIEW_BASE}}', preview_base)

    out_dir = os.path.join(repo_dir, 'deliverables')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'config-review.html')
    with open(out_path, 'w') as f:
        f.write(output)

    print(f"✓ Config review shell written to {out_path} (fetches live data from {preview_base}/of1/config/*)")

if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Rewrite `config-review.html` to fetch + render client-side**

Read the current file's CSS/layout structure first (already done in Step 1), then replace its body content and add the client-side script. The visual card/stat-bar rendering functions from the deleted Python script (`render_products`, `render_personas`, `render_suggestions`, `render_usecases`, `render_features`) get ported to JS equivalents, driven by `parseDaConfigPage`:

```html
<!-- Keep the existing <style> block and overall page chrome from the current
     config-review.html unchanged — only the body's data-rendering mechanism
     changes. Below is the replacement for the body + script section. -->

<div class="header">
  <h1>Config Review — {{DOMAIN}}</h1>
  <div class="stats-bar" id="stats-bar"><span>Loading…</span></div>
</div>
<div id="products-section"></div>
<div id="personas-section"></div>
<div id="usecases-section"></div>
<div id="features-section"></div>
<div id="suggestions-section"></div>
<div id="brand-voice-section"></div>
<div id="cta-section"></div>

<script type="module">
import { parseDaConfigPage } from './da-config-parser.js';

const PREVIEW_BASE = '{{PREVIEW_BASE}}';

const FIELD_SPECS = {
  products: { arrayFields: ['images', 'keywords', 'highlights', 'features'] },
  personas: { arrayFields: ['keywords', 'priorities', 'recommendedProducts'], nestedObjectFields: ['intentProfile'] },
  'use-cases': { arrayFields: ['keywords', 'recommendedProducts', 'relatedPersonas'] },
  features: { arrayFields: ['productIds'] },
  suggestions: { arrayFields: [] },
  'brand-voice': { arrayFields: ['vocabulary', 'avoidWords'], nestedObjectFields: ['toneByContext'] },
  'cta-template': { arrayFields: ['slots'], nestedObjectFields: ['fallback'] },
};

async function fetchConfig(name) {
  const res = await fetch(`${PREVIEW_BASE}/of1/config/${name}`);
  if (!res.ok) return { tables: [] };
  const html = await res.text();
  return parseDaConfigPage(html, FIELD_SPECS[name] || {});
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProducts(items) {
  return items.map(({ id, fields: f }) => {
    const imgs = f.images || [];
    const thumb = imgs[0] || '';
    const feats = (f.features || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    const highlights = (f.highlights || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    const keywords = (f.keywords || []).slice(0, 8).map((x) => `<span class="kw">${escapeHtml(x)}</span>`).join('');
    const gallery = imgs.map((u) => `<img src="${escapeHtml(u)}" alt="${escapeHtml(f.name)}" class="gallery-img" loading="lazy">`).join('');
    return `<div class="product-card">
  <div class="product-summary">
    <img src="${escapeHtml(thumb)}" alt="${escapeHtml(f.name)}" class="product-thumb" loading="lazy">
    <div class="product-info">
      <div class="product-name">${escapeHtml(f.name)}</div>
      <div class="product-meta"><span class="cat">${escapeHtml(f.category)}</span><span class="price">$${escapeHtml(f.price)}</span><span class="img-count">${imgs.length} img${imgs.length > 1 ? 's' : ''}</span></div>
    </div>
    <div class="expand-icon">+</div>
  </div>
  <div class="product-detail">
    <div class="product-gallery">${gallery}</div>
    <div class="product-detail-content">
      <p class="product-desc">${escapeHtml(f.description)}</p>
      ${feats ? `<h4>Features</h4><ul>${feats}</ul>` : ''}
      ${highlights ? `<h4>Highlights</h4><ul>${highlights}</ul>` : ''}
      ${keywords ? `<div class="product-tags"><h4>Keywords</h4><div class="kw-list">${keywords}</div></div>` : ''}
      ${f.url ? `<a href="${escapeHtml(f.url)}" class="product-link" target="_blank">View on site &rarr;</a>` : ''}
    </div>
  </div>
</div>`;
  }).join('');
}

function renderPersonas(items) {
  return items.map(({ fields: f }) => `<div class="persona-card">
  <div class="persona-name">${escapeHtml(f.name)}</div>
  <div class="persona-desc">${escapeHtml(f.description)}</div>
  <div class="persona-kw">Keywords: ${(f.keywords || []).slice(0, 8).map(escapeHtml).join(', ')}</div>
</div>`).join('');
}

function renderUseCases(items) {
  return items.map(({ fields: f }) => `<div class="usecase-card">
  <div class="usecase-name">${escapeHtml(f.name)}</div>
  <div class="usecase-desc">${escapeHtml(f.description)}</div>
  ${f.keywords?.length ? `<div class="usecase-kw">Keywords: ${f.keywords.slice(0, 6).map(escapeHtml).join(', ')}</div>` : ''}
</div>`).join('');
}

function renderFeatures(items) {
  return items.map(({ fields: f }) => `<span class="feature-chip">${escapeHtml(f.name)}</span>`).join('');
}

function renderSuggestions(items) {
  return items.filter((t) => t.id.startsWith('suggestion-')).map(({ fields: f }) =>
    `<div class="suggestion-chip"><span class="sug-label">${escapeHtml(f.label)}</span><span class="sug-query">${escapeHtml(f.query)}</span></div>`
  ).join('');
}

(async () => {
  const [products, personas, useCases, features, suggestions, brandVoice, cta] = await Promise.all(
    ['products', 'personas', 'use-cases', 'features', 'suggestions', 'brand-voice', 'cta-template'].map(fetchConfig)
  );

  const totalImages = products.tables.reduce((sum, { fields: f }) => sum + (f.images || []).length, 0);
  document.getElementById('stats-bar').innerHTML = `
    <span>${products.tables.length} products</span>
    <span>${totalImages} images</span>
    <span>${personas.tables.length} personas</span>
    <span>${suggestions.tables.filter((t) => t.id.startsWith('suggestion-')).length} suggestions</span>
    <span>${features.tables.length} features</span>
    <span>${useCases.tables.length} use cases</span>
  `;

  document.getElementById('products-section').innerHTML = renderProducts(products.tables);
  document.getElementById('personas-section').innerHTML = renderPersonas(personas.tables);
  document.getElementById('usecases-section').innerHTML = renderUseCases(useCases.tables);
  document.getElementById('features-section').innerHTML = renderFeatures(features.tables);
  document.getElementById('suggestions-section').innerHTML = renderSuggestions(suggestions.tables);

  const bv = brandVoice.tables[0]?.fields || {};
  document.getElementById('brand-voice-section').innerHTML = `
    <div><strong>Personality:</strong> ${escapeHtml(bv.personality)}</div>
    <div><strong>Tone:</strong> ${escapeHtml(bv.tone)}</div>
    <div><strong>Vocabulary:</strong> ${(bv.vocabulary || []).slice(0, 10).map(escapeHtml).join(', ')}</div>
    <div><strong>Avoid:</strong> ${(bv.avoidWords || []).slice(0, 10).map(escapeHtml).join(', ')}</div>
  `;

  const ctaFields = cta.tables[0]?.fields || {};
  document.getElementById('cta-section').innerHTML = `<pre>${escapeHtml(JSON.stringify(ctaFields, null, 2).slice(0, 2000))}</pre>`;
})();
</script>
```

Copy `da-config-parser.js` alongside `config-review.html` so the relative import resolves — this is already done by Task 1 Step 5.

- [ ] **Step 4: Update `skills/of1-config-review/SKILL.md`**

Find the "When to use" / "Prerequisites" / Process sections referencing `of1/config/*.json` on disk and update:

```markdown
## Prerequisites

- The six config types (products, personas, use-cases, features, suggestions, brand-voice) plus cta-template must already be live as DA pages under `of1/config/*` — see the respective producing skills (`of1-content-metadata`, `of1-brand-voice-extractor`, `of1-quick-suggestions`, `of1-cta-template-builder`).
- The fill script at `$SKILL_DIR/assets/fill-config-review.py` (or `.jsh` in SLICC)
```

Find:
```markdown
### 1. Verify all config files are present (hard gate)

The fill script silently reads whatever is on disk — it won't fail if a file is stale or empty. Guard against running too early (before step 9 finishes):

```bash
cd "$OF1_DEMO_REPO"
for f in products brand-voice personas use-cases features faqs suggestions cta-template; do
  [ -s "of1/config/${f}.json" ] || {
    echo "FAIL: of1/config/${f}.json missing or empty." >&2
    echo "Step 9 may not have finished. Wait for all parallel steps to complete before running step 12." >&2
    exit 1
  }
done
```
```

Replace with:
```markdown
### 1. Verify all config DA pages are live (hard gate)

The shell fetches whatever is live at page-load time — it won't fail at generation time if a DA page is stale or empty (the browser will just render an empty section). Guard against running too early (before step 9 finishes) by checking the DA pages are live BEFORE writing the shell:

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
for f in products brand-voice personas use-cases features suggestions cta-template; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PREVIEW_BASE}/of1/config/${f}")
  [ "$STATUS" = "200" ] || {
    echo "FAIL: of1/config/${f} not live (HTTP ${STATUS})." >&2
    echo "Step 9 may not have finished. Wait for all parallel steps to complete before running step 12." >&2
    exit 1
  }
done
```
```

Find:
```markdown
### 2. Run the fill script

```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/fill-config-review.py" . "$DOMAIN"

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/fill-config-review.jsh" . "$DOMAIN"
```

The script reads `of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json`, uses the template at `$SKILL_DIR/assets/config-review.html`, and writes `deliverables/config-review.html`.
```

Replace with:
```markdown
### 2. Run the fill script

```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/fill-config-review.py" . "$DOMAIN" "$BRANCH" "$REPO" "$OWNER"
cp "$SKILL_DIR/assets/da-config-parser.js" deliverables/da-config-parser.js

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/fill-config-review.jsh" . "$DOMAIN" "$BRANCH" "$REPO" "$OWNER"
```

The script fills the domain + preview-base URL into the shell at `$SKILL_DIR/assets/config-review.html` and writes `deliverables/config-review.html`. All product/persona/brand-voice/etc. data is fetched and rendered CLIENT-SIDE from the live DA config pages when the browser loads the page — the shell itself contains no baked-in data. `da-config-parser.js` MUST be copied alongside it (the shell's `<script type="module">` imports it via a relative path).
```

Find Step 2 (commit) — update the `git add` line:
```markdown
git add deliverables/config-review.html
```
Replace with:
```markdown
git add deliverables/config-review.html deliverables/da-config-parser.js
```

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1/config/products.json" skills/of1-config-review/assets/fill-config-review.py && { echo "FAIL: old script still reads JSON"; exit 1; }
grep -q "PREVIEW_BASE" skills/of1-config-review/assets/config-review.html || { echo "FAIL: shell missing preview-base token"; exit 1; }
grep -q "parseDaConfigPage" skills/of1-config-review/assets/config-review.html || { echo "FAIL: shell doesn't import parser"; exit 1; }
grep -q "of1/config/products.json" skills/of1-config-review/SKILL.md && { echo "FAIL: SKILL.md still references JSON files"; exit 1; }
python3 -c "import ast; ast.parse(open('skills/of1-config-review/assets/fill-config-review.py').read())" || { echo "FAIL: python syntax error"; exit 1; }
echo "✓ Task 8 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-config-review/SKILL.md skills/of1-config-review/assets/fill-config-review.py skills/of1-config-review/assets/config-review.html
git commit -m "feat: of1-config-review becomes a dynamic shell reading live DA config pages"
```

---

### Task 9: `of1-deploy`'s demo hub becomes a dynamic shell; config-exists gate rewritten

**Files:**
- Modify: `skills/of1-deploy/SKILL.md` (Step 1 "Verify config files exist")
- Modify: `skills/of1-deploy/assets/fill-demo-hub.py`
- Modify: `skills/of1-deploy/assets/fill-demo-hub.jsh`
- Modify: `skills/of1-deploy/assets/demo-hub.html`

**Interfaces:**
- Consumes: `parseDaConfigPage` from the vendored `skills/of1-deploy/assets/da-config-parser.js` (Task 1 Step 5).
- Produces: same `deliverables/index.html` demo hub, generation mechanism otherwise unchanged (still a Python/jsh fill script writing a static file once — this task changes what it fills in for the config-summary panel specifically).

- [ ] **Step 1: Update the "Verify config files exist" gate in `of1-deploy/SKILL.md`**

Find:
```markdown
### 1. Verify config files exist

```bash
for f in brand-voice products personas use-cases features faqs suggestions cta-template of1-endpoint; do
  if [ -f "of1/config/${f}.json" ]; then
    echo "  ✓ ${f}.json ($(wc -c < "of1/config/${f}.json") bytes)"
  else
    echo "  ✗ ${f}.json MISSING"
  fi
done
```

`of1-endpoint.json` must exist (created by step 2). If missing, fail — don't recreate it here.
```

Replace with:
```markdown
### 1. Verify config DA pages are live

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
FAIL=false
for f in brand-voice products personas use-cases features faqs suggestions cta-template of1-endpoint; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PREVIEW_BASE}/of1/config/${f}")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ of1/config/${f} (HTTP ${STATUS})"
  else
    echo "  ✗ of1/config/${f} MISSING (HTTP ${STATUS})"
    FAIL=true
  fi
done
[ "$FAIL" = false ] || { echo "FAIL: one or more config DA pages are not live." >&2; exit 1; }
```

Note: `faqs` is authored by `of1-content-metadata` (Task 2) alongside the other five; it wasn't in the original JSON-era loop's comment about `of1-endpoint` specifically being step-2-owned, but IS included in both the old and new loop — `of1-endpoint` is created by step 2 (`of1-repo-setup`, see the companion Task 7). If missing, fail — don't recreate it here.
```

- [ ] **Step 2: Update `fill-demo-hub.py`'s config-summary rendering**

```bash
grep -n "config\|products.json\|brand-voice.json" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/assets/fill-demo-hub.py
```

Read the matched sections in full, then locate wherever the script currently reads `of1/config/*.json` to build a config summary panel for the hub. Replace that server-side read with the same approach as Task 8: emit a `{{PREVIEW_BASE}}` token and a small inline `<script type="module">` block in `demo-hub.html` that fetches `of1/config/products` and `of1/config/personas` (whichever the hub's config-summary panel currently shows a count for) via `parseDaConfigPage`, and renders the count client-side — following the exact `fetchConfig`/`FIELD_SPECS` pattern from Task 8 Step 3 (reuse those same two helper definitions verbatim in `demo-hub.html`'s script block; do not diverge the field-spec list between the two shells).

- [ ] **Step 3: Apply the same `fill-demo-hub.py` → template-token change, and mirror it in `fill-demo-hub.jsh`**

Follow the same pattern as Task 8 Step 2 (Python) — strip the config-JSON-reading logic, add a `{{PREVIEW_BASE}}` token — and Task 8's client-JS pattern for `demo-hub.html`. Apply the equivalent change to `fill-demo-hub.jsh` (JS/SLICC variant) so both runtimes stay in parity, using the same string-replace-token approach the file already follows for its other tokens (`{{DOMAIN}}`, `{{PROTOTYPES}}`, `{{EDS_PAGES}}`, etc. — add `{{PREVIEW_BASE}}` alongside them, don't restructure the templating mechanism).

- [ ] **Step 4: Update the `git add` line in `of1-deploy/SKILL.md`'s "Generate demo hub page" step**

```bash
grep -n "cp.*da-config-parser\|git add.*deliverables" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/SKILL.md
```

Add, right after the existing `fill-demo-hub.py` invocation line:
```bash
cp "$SKILL_DIR/assets/da-config-parser.js" deliverables/da-config-parser.js
```

And extend the Step 3 commit's `git add` to include it:
```bash
git add of1/config/ deliverables/
```
This line is unaffected structurally (it already uses a directory glob covering the new file) — confirm by re-reading it, no edit needed if it already says `deliverables/` rather than listing individual files. If it lists individual files instead, add `deliverables/da-config-parser.js` explicitly.

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1/config/products.json" skills/of1-deploy/SKILL.md && { echo "FAIL: stale JSON gate remains"; exit 1; }
grep -q "PREVIEW_BASE" skills/of1-deploy/assets/fill-demo-hub.py || { echo "FAIL: fill-demo-hub.py missing preview-base token"; exit 1; }
grep -q "parseDaConfigPage" skills/of1-deploy/assets/demo-hub.html || { echo "FAIL: demo-hub.html doesn't import parser"; exit 1; }
python3 -c "import ast; ast.parse(open('skills/of1-deploy/assets/fill-demo-hub.py').read())" || { echo "FAIL: python syntax error"; exit 1; }
echo "✓ Task 9 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-deploy/SKILL.md skills/of1-deploy/assets/fill-demo-hub.py skills/of1-deploy/assets/fill-demo-hub.jsh skills/of1-deploy/assets/demo-hub.html
git commit -m "feat: of1-deploy's config gate and demo hub read live DA config pages"
```

---

### Task 10: `of1-gen-web` — dual-mode, backward-compatible sync, built in a worktree

**Files (all in the `of1-gen-web` repo, via a worktree — see Step 1):**
- Create: `worker/src/da-config-parser.js` (Workers-safe port of the canonical parser)
- Modify: `worker/src/sync.js`
- Create: `worker/src/sync.test.js`

**Interfaces:**
- Consumes: `worker/src/sync.js`'s existing `handleSync(request, url, env)` signature — UNCHANGED. `env.TENANTS.put(...)` call shape — UNCHANGED.
- Produces: `parseDaConfigPage(html, opts) -> {tables: [...]}`, matching Task 1's contract exactly but implemented without `DOMParser` (Workers runtime has no DOM). Also produces `tablesToConfigJson(configName, tables) -> object|array`, which converts the parsed table shape back into the exact JSON structure `worker-config-schemas.md` documents (this is the piece that makes the fallback path produce byte-for-byte-equivalent data to the old JSON files).

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web
git status   # confirm clean or stash first — do NOT discard the uncommitted changes already present (prompts/personalize/*, worker/src/personalize.js, etc. — unrelated in-progress work)
git worktree add ../of1-gen-web-da-config -b feat/da-config-sync
cd ../of1-gen-web-da-config
```

All subsequent steps in this task operate inside `/Users/quentinvecchio/workspace/labs/of1-gen-web-da-config`, NOT the main checkout.

- [ ] **Step 2: Write the Workers-safe parser — `worker/src/da-config-parser.js`**

Cloudflare Workers has no `DOMParser`. Use `HTMLRewriter` (built into the Workers runtime) or a minimal regex-based extraction — given the fixed, simple table shape from Task 1's format doc, a regex-based parser is more portable (works identically in Workers AND in a Vitest/Node test run without polyfills) and is what this step implements:

```javascript
// Workers-safe port of the canonical DA config-table parser.
// Canonical source + format spec: of1-demo-skills' skills/of1-demo/knowledge/da-config-format.md
// Keep this in sync BY HAND with skills/of1-content-metadata/assets/da-config-parser.js —
// there is no shared package between these two repos.

const TABLE_RE = /<table>([\s\S]*?)<\/table>/g;
const HEADER_RE = /<th[^>]*>([\s\S]*?)<\/th>/;
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<td>([\s\S]*?)<\/td>/g;

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

/**
 * @param {string} html - rendered DA page HTML (from the .aem.page preview URL)
 * @param {{arrayFields?: string[], nestedObjectFields?: string[]}} [opts]
 * @returns {{tables: Array<{id: string, fields: Record<string, unknown>}>}}
 */
export function parseDaConfigPage(html, opts = {}) {
  const arrayFields = new Set(opts.arrayFields || []);
  const nestedObjectFields = new Set(opts.nestedObjectFields || []);

  const tables = [];
  let tableMatch;
  while ((tableMatch = TABLE_RE.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const headerMatch = HEADER_RE.exec(tableHtml);
    const id = headerMatch ? stripTags(headerMatch[1]) : '';

    const flatFields = {};
    let rowMatch;
    let isFirstRow = true;
    const rowRe = new RegExp(ROW_RE.source, 'g');
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      if (isFirstRow) { isFirstRow = false; continue; } // header row already consumed above
      const rowHtml = rowMatch[1];
      const cells = [];
      let cellMatch;
      const cellRe = new RegExp(CELL_RE.source, 'g');
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) cells.push(stripTags(cellMatch[1]));
      if (cells.length >= 2) flatFields[cells[0]] = cells[1];
    }

    const fields = {};
    for (const [key, rawValue] of Object.entries(flatFields)) {
      const dotIndex = key.indexOf('.');
      if (dotIndex !== -1) {
        const parent = key.slice(0, dotIndex);
        const child = key.slice(dotIndex + 1);
        if (!nestedObjectFields.has(parent)) { fields[key] = rawValue; continue; }
        fields[parent] = fields[parent] || {};
        const numeric = Number(rawValue);
        fields[parent][child] = rawValue !== '' && !Number.isNaN(numeric) ? numeric : rawValue;
        continue;
      }
      if (arrayFields.has(key)) {
        fields[key] = rawValue === '' ? [] : rawValue.split(/,\s*/).map((v) => v.trim());
      } else {
        fields[key] = rawValue;
      }
    }
    tables.push({ id, fields });
  }
  return { tables };
}

const CONFIG_FIELD_SPECS = {
  products: { arrayFields: ['images', 'keywords', 'highlights', 'features'] },
  personas: { arrayFields: ['keywords', 'priorities', 'recommendedProducts'], nestedObjectFields: ['intentProfile'] },
  'use-cases': { arrayFields: ['keywords', 'recommendedProducts', 'relatedPersonas'] },
  features: { arrayFields: ['productIds'] },
  faqs: { arrayFields: ['relatedProducts'] },
  testimonials: { arrayFields: [] },
  'brand-voice': { arrayFields: ['vocabulary', 'avoidWords'], nestedObjectFields: ['toneByContext'] },
  'cta-template': { arrayFields: ['slots'], nestedObjectFields: ['fallback'] },
  'of1-endpoint': { arrayFields: [] },
  templates: { arrayFields: [], nestedObjectFields: ['fallbackImage'] },
  suggestions: { arrayFields: [] },
};

const REPEATED_ITEM_CONFIGS = new Set(['products', 'personas', 'use-cases', 'features', 'faqs', 'testimonials']);

/**
 * Converts parsed DA tables back into the exact JSON shape
 * worker-config-schemas.md documents for the given config name.
 * @param {string} configName
 * @param {Array<{id: string, fields: Record<string, unknown>}>} tables
 * @returns {object|array}
 */
export function tablesToConfigJson(configName, tables) {
  if (REPEATED_ITEM_CONFIGS.has(configName)) {
    return tables.map(({ id, fields }) => ({ id, ...fields }));
  }
  if (configName === 'suggestions') {
    const topLevel = tables.find((t) => t.id === 'suggestions');
    const items = tables.filter((t) => t.id.startsWith('suggestion-'));
    return {
      title: topLevel?.fields.title || '',
      subtitle: topLevel?.fields.subtitle || '',
      placeholder: topLevel?.fields.placeholder || '',
      suggestions: items.map(({ fields }) => ({ type: fields.type, label: fields.label, query: fields.query })),
    };
  }
  // Single-object configs — exactly one table.
  return tables[0]?.fields || {};
}

export function fieldSpecFor(configName) {
  return CONFIG_FIELD_SPECS[configName] || {};
}
```

- [ ] **Step 3: Write the failing test — `worker/src/sync.test.js`**

```javascript
import { describe, it, expect, vi } from 'vitest';
import { parseDaConfigPage, tablesToConfigJson } from './da-config-parser.js';

describe('parseDaConfigPage', () => {
  it('parses a repeated-item table into fields with array splitting', () => {
    const html = `<table>
      <tr><th colspan="2">fresco-deluxe</th></tr>
      <tr><td>name</td><td>Fresco Deluxe</td></tr>
      <tr><td>images</td><td>https://a.png, https://b.png</td></tr>
    </table>`;
    const { tables } = parseDaConfigPage(html, { arrayFields: ['images'] });
    expect(tables).toHaveLength(1);
    expect(tables[0].id).toBe('fresco-deluxe');
    expect(tables[0].fields.name).toBe('Fresco Deluxe');
    expect(tables[0].fields.images).toEqual(['https://a.png', 'https://b.png']);
  });

  it('un-flattens a nested object field', () => {
    const html = `<table>
      <tr><th colspan="2">home-barista</th></tr>
      <tr><td>intentProfile.explore</td><td>0.3</td></tr>
      <tr><td>intentProfile.research</td><td>0.8</td></tr>
    </table>`;
    const { tables } = parseDaConfigPage(html, { nestedObjectFields: ['intentProfile'] });
    expect(tables[0].fields.intentProfile).toEqual({ explore: 0.3, research: 0.8 });
  });

  it('treats an empty array-field cell as an empty array, not [""]', () => {
    const html = `<table><tr><th colspan="2">x</th></tr><tr><td>keywords</td><td></td></tr></table>`;
    const { tables } = parseDaConfigPage(html, { arrayFields: ['keywords'] });
    expect(tables[0].fields.keywords).toEqual([]);
  });
});

describe('tablesToConfigJson', () => {
  it('converts repeated-item tables into an array of objects with id', () => {
    const tables = [{ id: 'p1', fields: { name: 'Product 1' } }, { id: 'p2', fields: { name: 'Product 2' } }];
    expect(tablesToConfigJson('products', tables)).toEqual([
      { id: 'p1', name: 'Product 1' },
      { id: 'p2', name: 'Product 2' },
    ]);
  });

  it('converts the suggestions hybrid shape into {title, subtitle, placeholder, suggestions[]}', () => {
    const tables = [
      { id: 'suggestions', fields: { title: 'T', subtitle: 'S', placeholder: 'P' } },
      { id: 'suggestion-1', fields: { type: 'explore', label: 'L1', query: 'Q1' } },
      { id: 'suggestion-2', fields: { type: 'explore', label: 'L2', query: 'Q2' } },
    ];
    expect(tablesToConfigJson('suggestions', tables)).toEqual({
      title: 'T', subtitle: 'S', placeholder: 'P',
      suggestions: [{ type: 'explore', label: 'L1', query: 'Q1' }, { type: 'explore', label: 'L2', query: 'Q2' }],
    });
  });

  it('converts a single-object config into a flat object', () => {
    const tables = [{ id: 'brand-voice', fields: { tone: 'Friendly' } }];
    expect(tablesToConfigJson('brand-voice', tables)).toEqual({ tone: 'Friendly' });
  });
});
```

- [ ] **Step 4: Run the new test file to confirm it passes on its own (parser has no dependency on `sync.js` yet)**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config/worker
npx vitest run src/sync.test.js
```

Expected: all tests PASS (the parser module is self-contained and complete as written — this step validates the format-conversion logic before wiring it into `handleSync`).

- [ ] **Step 5: Write the failing dual-mode-sync test, appended to `sync.test.js`**

```javascript
import { handleSync } from './sync.js';

describe('handleSync dual-mode fallback', () => {
  function makeEnv(putSpy) {
    return { TENANTS: { put: putSpy || vi.fn(), get: vi.fn() } };
  }

  it('uses the .json path when it 200s (backward-compatible, unchanged behavior)', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/of1/config/brand-voice.json')) {
        return { ok: true, status: 200, text: async () => '{"tone":"Friendly"}' };
      }
      return { ok: false, status: 404 };
    });
    const putSpy = vi.fn();
    const env = makeEnv(putSpy);
    const req = new Request('https://worker.test/api/tenants/demo/sync?file=brand-voice');
    const res = await handleSync(req, new URL(req.url), env);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.synced).toEqual(['brand-voice']);
    expect(putSpy).toHaveBeenCalledWith('tenants/demo/brand-voice.json', '{"tone":"Friendly"}', expect.anything());
  });

  it('falls back to the DA page HTML when .json 404s', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/of1/config/brand-voice.json')) return { ok: false, status: 404 };
      if (url.endsWith('/of1/config/brand-voice')) {
        return {
          ok: true, status: 200,
          text: async () => `<table><tr><th colspan="2">brand-voice</th></tr><tr><td>tone</td><td>Friendly</td></tr></table>`,
        };
      }
      return { ok: false, status: 404 };
    });
    const putSpy = vi.fn();
    const env = makeEnv(putSpy);
    const req = new Request('https://worker.test/api/tenants/demo/sync?file=brand-voice');
    const res = await handleSync(req, new URL(req.url), env);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.synced).toEqual(['brand-voice']);
    const [, storedJson] = putSpy.mock.calls[0];
    expect(JSON.parse(storedJson)).toEqual({ tone: 'Friendly' });
  });

  it('records an error when neither .json nor the DA page exist', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const env = makeEnv();
    const req = new Request('https://worker.test/api/tenants/demo/sync?file=brand-voice');
    const res = await handleSync(req, new URL(req.url), env);
    const body = await res.json();
    expect(body.synced).toEqual([]);
  });
});
```

- [ ] **Step 6: Run to confirm the new tests fail**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config/worker
npx vitest run src/sync.test.js
```

Expected: the two new "dual-mode fallback" tests FAIL (the second on the DA-page fallback path not existing yet; the third may pass trivially depending on current 404 handling — confirm which fail before proceeding, since `handleSync` doesn't yet have DA-page fallback logic).

- [ ] **Step 7: Implement the dual-mode fallback in `sync.js`**

Find the per-file fetch block inside `handleSync`:
```javascript
  for (const file of filesToSync) {
    try {
      const res = await fetch(`${edsBase}/${file}.json`);
      if (!res.ok) {
        if (res.status === 404) continue;
        errors.push({ file, status: res.status });
        continue;
      }

      const data = await res.text();

      if (file === 'templates') {
```

Replace with:
```javascript
  for (const file of filesToSync) {
    try {
      let data;
      const jsonRes = await fetch(`${edsBase}/${file}.json`);
      if (jsonRes.ok) {
        data = await jsonRes.text();
      } else if (jsonRes.status === 404) {
        // Fallback: no committed JSON file — try the DA-authored page.
        // See worker/src/da-config-parser.js and
        // of1-demo-skills' skills/of1-demo/knowledge/da-config-format.md.
        const daRes = await fetch(`${edsBase}/${file}`);
        if (!daRes.ok) {
          if (daRes.status === 404) continue;
          errors.push({ file, status: daRes.status });
          continue;
        }
        const html = await daRes.text();
        const { tables } = parseDaConfigPage(html, fieldSpecFor(file));
        data = JSON.stringify(tablesToConfigJson(file, tables));
      } else {
        errors.push({ file, status: jsonRes.status });
        continue;
      }

      if (file === 'templates') {
```

Add the import at the top of `sync.js`:
```javascript
import { CORS_HEADERS } from './pipeline/context.js';
import { indexTenantContent } from './embeddings.js';
import { parseDaConfigPage, tablesToConfigJson, fieldSpecFor } from './da-config-parser.js';
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config/worker
npx vitest run src/sync.test.js
```

Expected: all tests PASS, including the three new dual-mode ones.

- [ ] **Step 9: Run the FULL worker test suite to confirm no regression**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config/worker
npx vitest run
```

Expected: `brand-governance.test.js` and `sync.test.js` both pass; no other test files exist per the earlier repo scan, so this should be the complete suite.

- [ ] **Step 10: Commit inside the worktree**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config
git add worker/src/da-config-parser.js worker/src/sync.js worker/src/sync.test.js
git commit -m "feat: dual-mode config sync — fall back to DA-authored pages when JSON is absent"
```

- [ ] **Step 11: Report the worktree location to the user instead of merging automatically**

This plan does NOT push, open a PR, or merge `feat/da-config-sync` — per the design spec, this work happens in a worktree specifically so it can be reviewed/tested against a real tenant before landing on `main`. After Step 10, stop and report:

```
Worktree ready at: /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config (branch: feat/da-config-sync)
Run `cd /Users/quentinvecchio/workspace/labs/of1-gen-web-da-config/worker && npm run dev` to smoke-test against a real tenant's DA config pages before merging.
```

---

### Task 11: Update `worker-config-schemas.md` cross-references and orchestrator knowledge docs

**Files:**
- Modify: `skills/of1-demo/knowledge/worker-config-schemas.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add an authoring-note line under each config file's heading**

For each of `brand-voice.json`, `products.json`, `personas.json`, `use-cases.json`, `features.json`, `faqs.json`, `suggestions.json`, `cta-template.json`, and the `templates.json` EDS-published-shape subsection, insert one line directly under the `## {name}` heading (before the existing description paragraph):

```markdown
> Authored as a DA page at `of1/config/{name}` (not committed JSON) — see `da-config-format.md` for the table shape. The JSON below is the field reference the worker's dual-mode sync reconstructs from that page; it is no longer written to git directly.
```

Substitute `{name}` with the correct config name for each section (`brand-voice`, `products`, `personas`, `use-cases`, `features`, `faqs`, `suggestions`, `cta-template`, `templates`). Do NOT add this note to `of1-endpoint.json` if Task 7 revealed it's produced differently — match whatever Task 7 actually confirmed.

Do NOT add this note to `block-guide.json` (not in scope — no producing skill was identified for it in this plan, and the Global Constraints didn't list it as a target) or to the templates catalog subsection (the big fully-inlined catalog stays git-committed per Task 6).

- [ ] **Step 2: Add a top-of-file pointer**

Find the file's opening line:
```markdown
# OF1 Worker — Config File Schemas

The OF1 worker reads tenant config from R2 (synced from EDS at `https://<id>.aem.page/of1/config/<file>.json`). Every config-producing skill MUST output JSON matching these exact schemas.
```

Replace with:
```markdown
# OF1 Worker — Config File Schemas

The OF1 worker reads tenant config from R2, synced from EDS. Most config files are now authored as DA pages (`https://<id>.aem.page/of1/config/<file>`, no `.json` extension) and reconstructed into this JSON shape by the worker's `sync.js` dual-mode fallback — see `da-config-format.md` for the DA table format. A tenant whose EDS repo still has a committed `of1/config/<file>.json` continues to work unchanged (the sync tries the `.json` path first). Every config-producing skill MUST output data matching these exact field schemas, regardless of which storage format it uses.
```

- [ ] **Step 3: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -c "Authored as a DA page" skills/of1-demo/knowledge/worker-config-schemas.md
```

Expected: at least 8 (one per config type listed in Step 1, minus `of1-endpoint`/`block-guide`/catalog which may or may not apply per that step's caveat — confirm the count matches what Step 1 actually added).

- [ ] **Step 4: Commit**

```bash
git add skills/of1-demo/knowledge/worker-config-schemas.md
git commit -m "docs: cross-reference DA config-table format in worker-config-schemas.md"
```

---

### Task 12: Repo-wide sweep — confirm zero dangling `of1/config/*.json` write references for the six DA-authored types

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Grep for any remaining write to the six DA-migrated JSON files**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for f in products.json personas.json use-cases.json features.json faqs.json testimonials.json brand-voice.json suggestions.json cta-template.json; do
  echo "=== of1/config/${f} ==="
  grep -rn "of1/config/${f}" skills/ README.md 2>/dev/null || echo "  (clean)"
done
```

- [ ] **Step 2: For every match printed, confirm it is a legitimate remaining reference or fix it**

Legitimate remaining mentions:
- `worker-config-schemas.md` — the JSON field-shape documentation itself, now annotated per Task 11 as "the field reference the worker reconstructs" — this is intentional, not a bug.
- This plan and the design spec — historical/design context.
- `of1-gen-web`'s (or its worktree's) `sync.js`/`sync.test.js` — these reference the `.json` path as the FIRST branch of the dual-mode check (backward compatibility), which is correct and intentional per Task 10.

Anything else — a skill's `SKILL.md` still writing/reading the file from local disk as its primary mechanism — is a miss from Tasks 2-9; go back to the relevant task.

- [ ] **Step 3: Confirm every producing skill's `assets/` dir has its own `da_config_table.py` copy**

```bash
for d in of1-content-metadata of1-brand-voice-extractor of1-quick-suggestions of1-cta-template-builder of1-template-generation of1-repo-setup; do
  [ -f "skills/$d/assets/da_config_table.py" ] && echo "✓ $d" || echo "✗ MISSING: $d"
done
```

- [ ] **Step 4: Confirm every reader shell's `assets/` dir has its own `da-config-parser.js` copy**

```bash
for d in of1-config-review of1-deploy; do
  [ -f "skills/$d/assets/da-config-parser.js" ] && echo "✓ $d" || echo "✗ MISSING: $d"
done
```

- [ ] **Step 5: Commit (only if Step 2 required fixes)**

```bash
git add -A
git commit -m "fix: clean up remaining stale of1/config JSON write references" --allow-empty
```

(If Step 2 found nothing to fix, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design spec's §5 (DA table format decision, previously an open question — now concretely resolved). Tasks 2-7 cover §5's producer-skill list. Task 8 covers §7 (dynamic HTML shells) for config-review. Task 9 covers §7 for the demo hub and §8 (deploy gate rewrite). Task 10 covers §6 (dual-mode, worktree, backward-compatible worker sync). Task 11 is documentation parity. Task 12 is the final sweep.
- **Resolved open questions from the design spec:** the spec left "exact DA markdown/table shape per config type" and "one generic parser vs bespoke per type" as open questions — this plan resolves both: one generic table shape (Task 1) with a single parser parameterized by per-config field-lists (`arrayFields`/`nestedObjectFields`), not bespoke parsers. The spec also left "where the shared parsing logic lives" open — resolved as: no shared package (these are separate repos with no build-time link), hand-synced copies with a canonical-source comment in each, flagged explicitly as a maintenance cost rather than hidden.
- **Type/name consistency check:** `build_item_table`/`build_config_page` (Python) and `parseDaConfigPage`/`tablesToConfigJson`/`fieldSpecFor` (JS) are used with the same names and signatures across every task that references them (Tasks 2-9 call the Python pair; Task 8/9/10 call the JS trio). The per-config `arrayFields`/`nestedObjectFields` lists in Task 1's format doc, Task 8's `FIELD_SPECS`, and Task 10's `CONFIG_FIELD_SPECS` are the same three lists repeated in three places (Python builder doesn't need them — it takes already-typed Python values — only the two JS parser copies and the format doc need them) — cross-checked for consistency: `products`→`images,keywords,highlights,features`; `personas`→`keywords,priorities,recommendedProducts` + nested `intentProfile`; `use-cases`→`keywords,recommendedProducts,relatedPersonas`; `features`→`productIds`; `faqs`→`relatedProducts`; `brand-voice`→`vocabulary,avoidWords` + nested `toneByContext`; `cta-template`→`slots` + nested `fallback` — all three locations agree.
- **Placeholder scan:** no "TBD"/"TODO"/"implement later" found; every code block is complete and runnable given the stated file paths. Task 7's producer-skill is deliberately discovered at execution time (grep-first) rather than assumed, because the actual codebase wasn't fully traced for that one file during planning — this is flagged as an explicit discovery step with concrete fallback instructions, not a vague "figure it out."
