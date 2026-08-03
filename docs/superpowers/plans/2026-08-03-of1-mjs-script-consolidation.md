# OF1 Build Scripts → Portable `.mjs` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 `.jsh`/`.py` build-script pairs (10 files) with 5 single `.mjs` files that run identically on Claude Code and SLICC via `node <tool>.mjs <args>`.

**Architecture:** Each `.mjs` is a self-contained ESM script run by `node` on both runtimes. It ports the `.py` variant verbatim in behavior, using only the runtime-common surface (standard `process.argv`, `node:*` builtins, global `fetch`) and — critically — no synchronous subprocess calls (SLICC's `child_process.execSync`/`spawnSync`/`execFileSync` throw). Per tool: port → verify → rewrite SKILL.md call sites → delete both twins.

**Tech Stack:** Node.js ESM (`.mjs`), `node:fs`/`node:path`/`node:crypto`/`node:os`/`node:child_process`, global `fetch`. No third-party npm deps.

## Global Constraints

Every ported `.mjs` MUST obey all of these — they are the cross-runtime portability contract (verified against `../slicc` `packages/webapp/src/kernel/realm/` + `shell/`):

1. **Standard argv.** Read positional args at `process.argv[2]`, `[3]`, … — NOT `[1]`. Both runtimes set `process.argv = ['node', scriptPath, ...args]` (SLICC: `jsh-executor.ts:78`, `jsh-executor.test.ts:163-166`).
2. **ESM `import` only** from `node:fs`, `node:fs/promises`, `node:path`, `node:crypto`, `node:os`, `node:url`, `child_process`, plus global `fetch`/`URL`/`TextEncoder`. NO third-party/npm/CDN imports. NO `require(`.
3. **No synchronous subprocess.** `execSync`/`spawnSync`/`execFileSync` throw in SLICC (`js-realm-helpers.ts:2052-2053`). Subprocess calls go through `promisify(execCb)` from `node:child_process` (async `exec`, which SLICC supports).
4. **Sync fs is allowed** (`readFileSync`/`writeFileSync`/`existsSync`/`mkdirSync`/`readdirSync`/`statSync`) — coherent on both runtimes.
5. **Source of truth: the `.py` variant governs behavior.** Port it faithfully. Where the `.jsh` twin diverges, `.py` wins on behavior; consult `.jsh` only for the async primitive shape (e.g. `fetch`, bounded-concurrency pool). Preserve every comment that explains a non-obvious behavior (e.g. the DA multipart-vs-PUT note, the Media Bus preview note).
6. **`node --check` must pass** and the SLICC-compat lint must find zero violations before a script's twins are deleted.

Invocation convention in all SKILL.md files: `node "$SKILL_DIR/assets/<tool>.mjs" <args>` — a single line, no per-runtime branch, no `python3`/`run_jsh`/"no python3 in SLICC" notes.

## File Structure

Created (5):
- `skills/of1-build-templates/assets/assemble-catalog.mjs`
- `skills/of1-build-templates/assets/fill-template.mjs`
- `skills/of1-extract-content/assets/download-images.mjs`
- `skills/of1-generate-config-review/assets/fill-config-review.mjs`
- `skills/of1-publish/assets/fill-demo-hub.mjs`

Deleted (10): the `.jsh` + `.py` twin of each of the above.

Modified (SKILL.md call sites + prose):
- `skills/of1-build-templates/SKILL.md`
- `skills/of1-extract-content/SKILL.md`
- `skills/of1-generate-config-review/SKILL.md`
- `skills/of1-publish/SKILL.md`
- `skills/of1-adopt-existing-site/SKILL.md`

---

### Task 1: `assemble-catalog.mjs`

**Files:**
- Create: `skills/of1-build-templates/assets/assemble-catalog.mjs`
- Modify: `skills/of1-build-templates/SKILL.md:396-402` (assemble call site), `:120` (prose), `:38` prose mention is generic ("runs `fill-template.py`") — handled in Task 2; leave `:120` `assemble-catalog.py`→`assemble-catalog.mjs`.
- Delete: `skills/of1-build-templates/assets/assemble-catalog.py`, `skills/of1-build-templates/assets/assemble-catalog.jsh`
- Test fixture: created inline in the smoke step under a temp dir.

**Interfaces:**
- Consumes: CLI `node assemble-catalog.mjs <repo-dir> <owner> <repo> <branch>`.
- Produces: `<repo-dir>/templates/templates-catalog.json` + `<repo-dir>/of1/config/templates.json`. Exit 0 on success; 1 on missing templates dir / no metadata / missing HTML; 2 on arg-count error.

**Behavior to port** (from `assemble-catalog.py`, verbatim):
- Args at `argv[2..5]` = repoDir, owner, repo, branch. `<5` positional → stderr usage, exit 2. (Note: with `process.argv`, `argv.length < 6` is the guard.)
- `baseUrl = https://${branch}--${repo}--${owner}.aem.page`.
- If `<repoDir>/templates` doesn't exist → stderr, exit 1.
- Glob `templates/of1-*.metadata.json`, **sorted**. None found → stderr, exit 1.
- For each metadata file: parse JSON; read `name`, `intent`; require `<name>.html` (collect into `missingHtml` if absent, `continue`); build entry `{name, intent, description||"", minItems||1, maxItems||4, stylesheet||"/styles/<name>.css", slots||[], htmlContent}`; push to `templates`; `byIntent[intent].push(name)`.
- If any `missingHtml` → stderr `ERROR: missing HTML for: <names>`, exit 1.
- Sort each `byIntent[intent]` array; `byIntent` object emitted with keys sorted.
- `generatedAt`: ISO-8601 UTC, no microseconds, `Z` suffix — JS: `new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')`.
- catalog = `{useRouting:true, baseUrl, generatedAt, count, byIntent(sorted), templates}`, written pretty (2-space) to `templates/templates-catalog.json`. Print `Wrote <path> with <n> fully-inlined templates`.
- Ensure `<repoDir>/of1/config` (recursive mkdir); write `templates.json` = `{useRouting:true, baseUrl, catalogPath:"/templates/templates-catalog.json"}`. Print `Wrote <path>`.
- expected intents `{comparison, recommendation, deep-dive, budget, discovery}`; print `WARNING: catalog is missing intents: [...]` to stderr for any absent (sorted).
- Print `By intent: <json 2-space>`.

**Implementation notes:** use `fs.readdirSync(templateDir).filter(f => /^of1-.*\.metadata\.json$/.test(f)).sort()`; JSON via `JSON.parse`/`JSON.stringify(obj, null, 2)`; sorted-key object via `Object.fromEntries(Object.entries(byIntent).sort((a,b)=>a[0]<b[0]?-1:1))`. No subprocess, no fetch. Exit via `process.exit(code)`.

- [ ] **Step 1: Port the script**

Write `assemble-catalog.mjs` implementing the behavior above. Header comment mirrors the `.py` docstring, updated usage line: `node assemble-catalog.mjs <repo-dir> <owner> <repo> <branch>`.

- [ ] **Step 2: Syntax check**

Run: `node --check skills/of1-build-templates/assets/assemble-catalog.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: SLICC-compat lint**

Run:
```bash
F=skills/of1-build-templates/assets/assemble-catalog.mjs
grep -nE 'execSync|spawnSync|execFileSync|\brequire\(' "$F" && echo "LINT FAIL: forbidden call" || echo "lint ok: no sync-subprocess/require"
grep -nE 'process\.argv\[1\]' "$F" && echo "LINT FAIL: argv[1] (shifted contract)" || echo "lint ok: no argv[1]"
grep -nE "from ['\"](?!node:)[^.:/]" "$F" && echo "LINT FAIL: bare npm import" || echo "lint ok: imports node:/relative only"
```
Expected: three `lint ok:` lines, no `LINT FAIL`.

- [ ] **Step 4: Real-node smoke run**

Run:
```bash
T=$(mktemp -d)
mkdir -p "$T/templates"
printf '{"name":"of1-comparison","intent":"comparison","slots":[{"key":"hero.title","type":"text"}]}' > "$T/templates/of1-comparison.metadata.json"
printf '<section data-slot="hero.title">x</section>' > "$T/templates/of1-comparison.html"
node skills/of1-build-templates/assets/assemble-catalog.mjs "$T" acme demo main
echo "--- catalog ---"; cat "$T/templates/templates-catalog.json"
echo "--- routing ---"; cat "$T/of1/config/templates.json"
node -e 'const c=require(process.argv[1]);if(c.count!==1||c.byIntent.comparison[0]!=="of1-comparison"||!c.templates[0].htmlContent.includes("data-slot")||c.baseUrl!=="https://main--demo--acme.aem.page")throw new Error("catalog shape wrong");console.log("SMOKE OK")' "$T/templates/templates-catalog.json"
rm -rf "$T"
```
Expected: catalog + routing JSON printed, a `WARNING: catalog is missing intents` line on stderr (only `comparison` present), and `SMOKE OK`.

- [ ] **Step 5: Rewrite SKILL.md call site**

In `skills/of1-build-templates/SKILL.md`, replace the assemble block (lines ~396-402):
```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/assemble-catalog.py" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/assemble-catalog.jsh" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```
with:
```bash
node "$SKILL_DIR/assets/assemble-catalog.mjs" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```
And at line ~120, change `assemble-catalog.py` → `assemble-catalog.mjs` in the prose sentence.

- [ ] **Step 6: Delete twins**

Run: `git rm skills/of1-build-templates/assets/assemble-catalog.py skills/of1-build-templates/assets/assemble-catalog.jsh`

- [ ] **Step 7: Commit**

```bash
git add -A skills/of1-build-templates/assets/assemble-catalog.mjs skills/of1-build-templates/SKILL.md
git commit -m "refactor(of1-build-templates): port assemble-catalog to portable .mjs"
```

---

### Task 2: `fill-template.mjs`

**Files:**
- Create: `skills/of1-build-templates/assets/fill-template.mjs`
- Modify: `skills/of1-build-templates/SKILL.md:406-426` (install/preview block), `:38`, `:68`, `:444`, `:513` (prose + commit `git add` + deliverables list mentions of `fill-template.py`/`tools/fill-template.py`)
- Delete: `skills/of1-build-templates/assets/fill-template.py`, `.jsh`

**Interfaces:**
- Consumes: `node fill-template.mjs <template.html> <values.json> <out.html>` (exactly 3 positional args).
- Produces: standalone HTML at `<out.html>`. Exit 2 on wrong arg count.

**Behavior to port** (from `fill-template.py`, verbatim — this is regex-heavy; match the Python regexes exactly):
- Guard: exactly 3 positional args (JS: `process.argv.length !== 5`) → stderr usage, exit 2.
- Read template + parse values JSON (utf-8).
- `escapeAttr(s)` = `String(s ?? '').replace(/"/g, '&quot;')`.
- `htmlEscape(s)` — replicate Python `html.escape` default (escapes `& < > " '`): `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `'`→`&#x27;`. Order matters — `&` first.
- `itemCount` = count of `item-1..item-6` where `values['<k>.title']` or `values['<k>.body']` is truthy.
- `fillSlot(html, key, value)`: skip if value == null. Regex (case-insensitive, dotall): `(<([a-z][\w-]*)([^>]*?)\sdata-slot="<escKey>"([^>]*)>)([\s\S]*?)(<\/\2>)`. JS lacks Python's `\2` backref in the pattern the same way but supports `\2` in a regex via backreference — build the regex with `new RegExp(..., 'gi')` and use a backreference `\\2`. In the replacer: if tag==`img` → return whole match unchanged; if tag==`a` → href/label from dict-or-string, strip existing `href="..."`, inject `href="<escAttr>"` after `<a`, inner = `htmlEscape(label)`; else text slot: if value is object with `html` key use it raw, else `htmlEscape(String(value))`; return `open+inner+close`.
- `fillImgSlot(html, key, value)`: skip if null. src/alt from dict-or-string. Regex `<img([^>]*?)\sdata-slot="<escKey>"([^>]*?)>` gi. Replacer strips existing `src=`/`alt=` from `before+after`, returns `<img<stripped> src="<escAttr src>" alt="<escAttr alt>" data-slot="<key>">`.
- `fillListSlot(html, key, items)`: skip if not a non-empty array. `li = items.map(i => '<li>'+htmlEscape(String(i))+'</li>').join('')`. Regex `(<([a-z][\w-]*)([^>]*?)\sdata-slot-list="<escKey>"([^>]*)>)([\s\S]*?)(<\/\2>)` gi, replace inner with `li`.
- Main loop over `Object.entries(values)`: skip keys starting `_`; if Array → `fillListSlot`; else if object with `src` → `fillImgSlot`; else → `fillImgSlot` then `fillSlot` (both, matching `.py`).
- Strip unfilled image slots: `out.replace(/<img[^>]*\sdata-slot="[^"]+"[^>]*>/g, m => (m.includes('src="') && !m.includes('src=""')) ? m : '')`.
- Hide unused cards: regex `<article([^>]*?\sdata-card="(\d+)"[^>]*)>` g; probe `data-card-key="..."` in attrs (fallback `item-<idx>.title`, secondary `item-<idx>.body`); present if `values[probeKey] != null` or fallback present; if not present and no ` hidden` in attrs → `<article<attrs> hidden>`.
- Mark grid: replace `<div class="of1-cmp-grid" data-grid-items>` → same + ` data-item-count="<itemCount>"`.
- `stylesheet = values._meta?.stylesheet || '/styles/of1-template-base.css'`; `title = values['hero.title'] || 'Template Preview'`.
- Wrap in the exact standalone HTML doc (DOCTYPE/html/head with `<title>htmlEscape(title)</title>`, `<link rel="stylesheet" href="escapeAttr(stylesheet)">`, body = out).
- `mkdir -p dirname(out)` (or `.`); write file; print `wrote <out> (<len> bytes, <itemCount> items)`.

**Regex caveat for the reviewer:** Python's `re.escape(key)` → JS: escape regex metachars in `key` with `key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. Python inline `(?i)` + `[\s\S]` → JS flags `gi` + `[\s\S]` (JS has no dotall-needed since `[\s\S]` used). The `\2` backreference works in JS `RegExp`.

- [ ] **Step 1: Port the script** — implement all of the above.
- [ ] **Step 2: Syntax check** — `node --check skills/of1-build-templates/assets/fill-template.mjs` → exit 0.
- [ ] **Step 3: SLICC-compat lint** — run the same 3 grep checks as Task 1 Step 3 against `fill-template.mjs`. Expected: three `lint ok:` lines.
- [ ] **Step 4: Real-node smoke run**

```bash
T=$(mktemp -d)
printf '<!--tpl--><h1 data-slot="hero.title">OLD</h1><a data-slot="cta" href="x">OLD</a><img data-slot="thumb" src="">' > "$T/tpl.html"
printf '{"hero.title":"Hello & <You>","cta":{"href":"/go","label":"Click"},"thumb":{"src":"/i.png","alt":"pic"}}' > "$T/vals.json"
node skills/of1-build-templates/assets/fill-template.mjs "$T/tpl.html" "$T/vals.json" "$T/out.html"
cat "$T/out.html"
node -e 'const h=require("fs").readFileSync(process.argv[1],"utf8");if(!h.includes("Hello &amp; &lt;You&gt;"))throw new Error("text slot/escape wrong");if(!h.includes("href=\"/go\"")||!h.includes(">Click<"))throw new Error("link slot wrong");if(!h.includes("src=\"/i.png\"")||!h.includes("alt=\"pic\""))throw new Error("img slot wrong");if(!h.includes("<!DOCTYPE html>"))throw new Error("no standalone wrap");console.log("SMOKE OK")' "$T/out.html"
rm -rf "$T"
```
Expected: filled HTML printed + `SMOKE OK`.

- [ ] **Step 5: Rewrite SKILL.md**

In `skills/of1-build-templates/SKILL.md`:
- Lines ~406-426 (install + preview block): replace the two-runtime block with a single `.mjs` version:
```bash
mkdir -p tools drafts
cp "$SKILL_DIR/assets/fill-template.mjs" tools/fill-template.mjs
for TPL in templates/of1-*.html; do
  NAME=$(basename "$TPL" .html)
  SAMPLE="templates/${NAME}.sample.json"
  [ -f "$SAMPLE" ] && node tools/fill-template.mjs "$TPL" "$SAMPLE" "drafts/${NAME}-sample.html"
done
```
- Line ~444 (`git add` list): `tools/fill-template.py` → `tools/fill-template.mjs`.
- Line ~38, ~68, ~513 prose: `fill-template.py`/`tools/fill-template.py` → `fill-template.mjs`/`tools/fill-template.mjs`.

- [ ] **Step 6: Delete twins** — `git rm skills/of1-build-templates/assets/fill-template.py skills/of1-build-templates/assets/fill-template.jsh`
- [ ] **Step 7: Commit** — `git add -A skills/of1-build-templates/... skills/of1-build-templates/SKILL.md && git commit -m "refactor(of1-build-templates): port fill-template to portable .mjs"`

---

### Task 3: `fill-config-review.mjs`

**Files:**
- Create: `skills/of1-generate-config-review/assets/fill-config-review.mjs`
- Modify: `skills/of1-generate-config-review/SKILL.md:38, 57-65`; `skills/of1-adopt-existing-site/SKILL.md:146-152` (the inline Step 11 call)
- Delete: `skills/of1-generate-config-review/assets/fill-config-review.py`, `.jsh`

**Interfaces:**
- Consumes: `node fill-config-review.mjs <repo-dir> <domain> [template-path]`. Exit 1 on `<2` positional args.
- Produces: `<repo-dir>/deliverables/config-review.html`.

**Behavior to port** (from `fill-config-review.py`, verbatim):
- `<2` positional args → print usage (stdout in `.py`), exit 1.
- `repoDir=argv[2]`, `domain=argv[3]`, `templatePath = argv[4] || <scriptDir>/config-review.html` (scriptDir via `path.dirname(fileURLToPath(import.meta.url))`).
- `repoDir = path.resolve(repoDir)`.
- `loadJson(path)` → parse, or `{}` on ENOENT / JSON error.
- Read template (utf-8).
- configDir = `<repoDir>/of1/config`. Load products (unwrap `.products` if object), brand-voice, personas (unwrap `.personas`), suggestions (dict → `.suggestions`/`.title`/`.subtitle`/`.placeholder`; else array or `[]`), use-cases (unwrap `.useCases`||`.use-cases`), features (unwrap `.features`), cta-template.
- `htmlEscape` = same as Task 2 (`html.escape` default, incl. `'`→`&#x27;`).
- `renderProducts`, `renderPersonas`, `renderSuggestions`, `renderUsecases`, `renderFeatures` — port each string-building function EXACTLY, including the f-string HTML (product card with summary/detail/gallery/features/highlights/keywords[:8]/persona/useCase/url; the `${price}` literal dollar sign; `img{"s" if len>1}` pluralization; `keywords.slice(0,8)` etc.). Preserve whitespace/newlines in the emitted HTML as-is.
- `totalImages = sum of (p.images?.length||0)`.
- Build the `replacements` map with all `{{...}}` tokens exactly as in `.py` (DOMAIN, STAT_*, PRODUCTS_HTML, BRAND_PERSONALITY/TONE/VOCAB/AVOID with the `vocabulary||preferredWords` and `avoidWords||avoid` fallbacks sliced to 10, PERSONAS/USECASES/FEATURES/SUG_*/SUGGESTIONS_HTML, CTA_JSON = `htmlEscape(JSON.stringify(cta,null,2).slice(0,2000))`).
- Replace every token in template (global replace — a token may appear once; use `split(token).join(value)` to avoid `$&` pitfalls in `String.replace`).
- `mkdir -p <repoDir>/deliverables`; write `config-review.html`; print the two `✓`/summary lines.

**Note:** `String.prototype.replace` with a string pattern replaces only the first occurrence AND interprets `$` in the replacement. Use `template.split(token).join(value)` for each token to replace all occurrences literally.

- [ ] **Step 1: Port the script.**
- [ ] **Step 2: Syntax check** — `node --check` → exit 0.
- [ ] **Step 3: SLICC-compat lint** — the 3 grep checks → three `lint ok:` lines.
- [ ] **Step 4: Real-node smoke run**

```bash
T=$(mktemp -d); mkdir -p "$T/of1/config"
printf '<h1>{{DOMAIN}}</h1><p>{{STAT_PRODUCTS}}</p>{{PRODUCTS_HTML}}<pre>{{CTA_JSON}}</pre>' > "$T/tpl.html"
printf '[{"name":"Widget & Co","category":"tools","price":"9","images":["/a.png"],"description":"<b>x</b>"}]' > "$T/of1/config/products.json"
printf '{"tone":"warm"}' > "$T/of1/config/cta-template.json"
node skills/of1-generate-config-review/assets/fill-config-review.mjs "$T" example.com "$T/tpl.html"
cat "$T/deliverables/config-review.html"
node -e 'const h=require("fs").readFileSync(process.argv[1],"utf8");if(!h.includes("<h1>example.com</h1>"))throw new Error("domain");if(!h.includes("<p>1</p>"))throw new Error("stat");if(!h.includes("Widget &amp; Co"))throw new Error("escape");if(!h.includes("&quot;tone&quot;"))throw new Error("cta json escaped");console.log("SMOKE OK")' "$T/deliverables/config-review.html"
rm -rf "$T"
```
Expected: filled HTML + `SMOKE OK`.

- [ ] **Step 5: Rewrite SKILL.md**

- `skills/of1-generate-config-review/SKILL.md`:
  - Line ~38: `...fill-config-review.py\` (or \`.jsh\` in SLICC)` → `...fill-config-review.mjs\``.
  - Lines ~59-65: replace the two-runtime block with `node "$SKILL_DIR/assets/fill-config-review.mjs" . "$DOMAIN"`.
- `skills/of1-adopt-existing-site/SKILL.md` line ~148: `python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"` → `node "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.mjs" . "$DOMAIN"`.

- [ ] **Step 6: Delete twins** — `git rm .../fill-config-review.py .../fill-config-review.jsh`
- [ ] **Step 7: Commit** — `git commit -m "refactor(of1-generate-config-review): port fill-config-review to portable .mjs"` (stage the .mjs + both SKILL.md files).

---

### Task 4: `fill-demo-hub.mjs`

**Files:**
- Create: `skills/of1-publish/assets/fill-demo-hub.mjs`
- Modify: `skills/of1-publish/SKILL.md:81-87`
- Delete: `skills/of1-publish/assets/fill-demo-hub.py`, `.jsh`

**Interfaces:**
- Consumes: `node fill-demo-hub.mjs <repo-dir> <domain>` (+ env `OF1_STATE_DIR`, default `/shared/of1-demo-orchestrator`). Exit 1 on `<2` args or missing/invalid repo-config.
- Produces: `<repo-dir>/deliverables/index.html`.

**Behavior to port** (from `fill-demo-hub.py`, verbatim — no subprocess; all fs + string building):
- `<2` positional args → usage, exit 1.
- `loadJson` / `loadText` helpers (return `{}` / `''` on missing).
- `stateDir = process.env.OF1_STATE_DIR || '/shared/of1-demo-orchestrator'`.
- Load `<stateDir>/repo-config.json` — REQUIRED. Empty → stderr error + exit 1. Missing any of owner/repo/branch → stderr error listing missing + exit 1.
- `previewBase = https://${branch}--${repo}--${owner}.aem.page`.
- Load `of1/config/{products(unwrap),personas(unwrap),suggestions,templates}.json`.
- `step3 = loadText(<stateDir>/step-3-output.md)`; `narrative = extractNarrative(step3)`, `focus = extractFocus(step3)` — port both text-scanning functions exactly (narrative: start at a line containing `**Persona:**` or `**Journey:**`, strip those markers, accumulate until blank line; focus: line after `## Demo Focus`, else `AI-Powered Experience`).
- `countTemplates` = number of `<repoDir>/templates/of1-*.html` (0 if dir absent).
- `numSuggestions` = `suggestions.suggestions?.length || 0` when object.
- `findEdsPages`: read `/tmp/da-pages.txt` if present (stem each line, skip `nav`/`footer`, label = titlecased slug with `-`→space and `prototype ` removed, url `${previewBase}/${name}`); fallback to `<repoDir>/content/*.html` sorted (same transforms). Port the `.title()` word-casing (capitalize each word).
- `getLogoSvg`: `<repoDir>/stardust/current/assets/logo.svg` if exists → trimmed; inject `height="28"` after `<svg` if no `height=` present.  (Note: `logo_svg`/`focus`/`narrative` are computed in `.py` but only some are used in replacements — replicate exactly what `.py` does: it computes them; the template replace map uses DOMAIN/NUM_PRODUCTS/OF1_URL/GALLERY_URL/PREVIEW_BASE/PROTOTYPES/EDS_PAGES/OWNER/REPO/BRANCH/DATE/PIPELINE_AUDIT. Keep computing narrative/focus/logo to preserve parity even though not all are substituted — DO NOT add new substitutions.)
- `renderPrototypes`: stardust `prototypes/*.html` → `prototype-<stem>.html` deliverable links (badge Standalone); else `deliverables/prototype-*.html`; else the "No prototypes yet" span.
- `renderEdsPages`: link pills, or the "No pages published yet" span.
- `renderAudit(stateDir)`: load `<stateDir>/pipeline-audit.json`; if absent or no `.steps` → `''`. Port the full HTML: header with `skillBranch@skillVersion`, the flex stat blocks (`totalTokens` with thousands separators via `Number.toLocaleString('en-US')`, `totalMins = totalDurationMs/60000` to 1 decimal, `stepCount`), the per-step table (dur in s to 0 decimals, tokens with separators, status color mapping done→accent/failed→orange/else dim, retry badge `↻N`), and the improvements section. Match number formatting: Python `{x:,}` → `x.toLocaleString('en-US')`; `{x:.1f}`/`{x:.0f}` → `toFixed(1)`/`toFixed(0)`.
- `date = new Date()` formatted `Month DD, YYYY` (Python `%B %d, %Y`) — build via an explicit month-name array + zero-padded day to match `%d` (zero-padded).
- Fill template with `split(token).join(value)` for each `{{...}}`. Write `<repoDir>/deliverables/index.html`; print the two summary lines.

**Date caveat:** `Date.now()`/`new Date()` are fine in real node AND in SLICC's `node` command (the Date restriction in the plan tooling applies only to Workflow scripts, not to these `.mjs` build scripts). Use `new Date()` for `{{DATE}}`, matching `.py`'s `date.today()`.

- [ ] **Step 1: Port the script.**
- [ ] **Step 2: Syntax check** — `node --check` → exit 0.
- [ ] **Step 3: SLICC-compat lint** — 3 grep checks → three `lint ok:` lines.
- [ ] **Step 4: Real-node smoke run**

```bash
T=$(mktemp -d); mkdir -p "$T/repo/of1/config" "$T/state" "$T/repo/templates"
printf '{"owner":"acme","repo":"demo","branch":"main"}' > "$T/state/repo-config.json"
printf '[{"name":"P1"},{"name":"P2"}]' > "$T/repo/of1/config/products.json"
printf '<html>{{DOMAIN}}|{{PREVIEW_BASE}}|{{NUM_PRODUCTS}}|{{DATE}}|{{EDS_PAGES}}|{{PIPELINE_AUDIT}}</html>' > "$T/tpl.html"
# put template where script expects it (beside script) OR pass none — script reads <scriptDir>/demo-hub.html.
cp "$T/tpl.html" skills/of1-publish/assets/demo-hub.html.smoketest 2>/dev/null || true
OF1_STATE_DIR="$T/state" node skills/of1-publish/assets/fill-demo-hub.mjs "$T/repo" example.com || echo "(exit $?)"
echo "--- output ---"; cat "$T/repo/deliverables/index.html" 2>/dev/null
node -e 'const h=require("fs").readFileSync(process.argv[1],"utf8");if(!h.includes("example.com"))throw new Error("domain");if(!h.includes("https://main--demo--acme.aem.page"))throw new Error("preview base");if(!h.includes(">2<")&&!h.includes("|2|"))throw new Error("num products");console.log("SMOKE OK")' "$T/repo/deliverables/index.html"
rm -rf "$T"
```
NOTE: `fill-demo-hub.mjs` reads its template from `<scriptDir>/demo-hub.html`. The real `demo-hub.html` already exists beside the script — the smoke test uses that real template (it contains all `{{...}}` tokens). Do NOT create a `.smoketest` file; instead run the smoke test against the real `demo-hub.html` by passing the repo/domain and asserting `SMOKE OK` on DOMAIN + PREVIEW_BASE substitution. Adjust the assertion to tokens the real template contains (`example.com`, the preview base). If the real template lacks a token, drop that assertion — the goal is proving substitution + no crash, not the template's content.

- [ ] **Step 5: Rewrite SKILL.md** — `skills/of1-publish/SKILL.md` lines ~82-87: replace the two-runtime block with `node "$SKILL_DIR/assets/fill-demo-hub.mjs" . "${DOMAIN}"`.
- [ ] **Step 6: Delete twins** — `git rm .../fill-demo-hub.py .../fill-demo-hub.jsh`
- [ ] **Step 7: Commit** — `git commit -m "refactor(of1-publish): port fill-demo-hub to portable .mjs"` (stage .mjs + SKILL.md).

---

### Task 5: `download-images.mjs`

This is the one script with subprocess + concurrency. `.py` governs behavior; `.jsh` (read it — `skills/of1-extract-content/assets/download-images.jsh`) already implements the SLICC-safe async shape (fetch, semaphore, multipart). The `.mjs` = `.jsh`'s async mechanics + `.py`'s completeness (notably the mount-copy path, which the `.jsh` skipped).

**Files:**
- Create: `skills/of1-extract-content/assets/download-images.mjs`
- Modify: `skills/of1-extract-content/SKILL.md:263, 265, 285, 301-315, 326, 370`
- Delete: `skills/of1-extract-content/assets/download-images.py`, `.jsh`

**Interfaces:**
- Consumes: `node download-images.mjs --input <f> --owner <o> --repo <r> --branch <b> [--output f] [--max-per-product N] [--workers N] [--update-products] [--products-json p] [--token-file p] [--mount-dir d]`.
- Produces: writes `--output` (default `image-mapping.json`); optionally rewrites `--products-json`. Exit 0 iff zero failures, else 1.

**Behavior to port** (union of `.py` behavior + `.jsh` async shape):
- **Arg parsing:** port `.jsh`'s `parseArgs` (switch over `process.argv.slice(2)` — NOTE: `.jsh` used `.slice(1)` under the shifted contract; under standard argv use `.slice(2)`). Required: input/owner/repo/branch → else stderr + exit 1. Defaults: output `image-mapping.json`, maxPerProduct 5, workers 8, productsJson `of1/config/products.json`, mountDir `/mnt/da` (the `.py` default — `.jsh` had null; use `.py`'s `/mnt/da`).
- **Constants:** `USER_AGENT` (same string), `MIN_BYTES=10000`, magic-byte table (PNG/JPEG/GIF87a/GIF89a + WEBP RIFF/WEBP) → `detectContentType(Uint8Array)`.
- **Token resolution** (port `.py` order exactly, async): `--token-file` → `$DA_TOKEN` → `$ADOBE_IMS_TOKEN` → `$OF1_TOKEN_FILE` → `oauth-token adobe` via async `exec` (ignore failure) → `.hlx/.da-token.json` → throw. `readTokenFile` reads JSON, uses `access_token||token`, throws if absent.
- **Mount detection:** `.py` uses `Path(mountDir).exists()`. Use `fs.existsSync(mountDir)` → `mountDir` or null. (This restores the mount path the `.jsh` dropped.)
- **download(url):** async `fetch` with UA header; non-ok → `{data:null, err:'HTTP <status>'}`; read `arrayBuffer`→`Uint8Array`; `< MIN_BYTES` → too-small err; else `{data,err:null}`. (`.py` also wrote a temp file; the `.mjs` keeps bytes in memory like `.jsh` — the temp file only existed to feed `shutil.copy`; for the mount path, write bytes with `fs.writeFileSync(mountPath, Buffer.from(bytes))`.)
- **triggerPreview(token,owner,repo,branch,filename):** POST `https://admin.hlx.page/preview/<o>/<r>/<b>/media/<file>` with `Authorization` + `x-content-source-authorization` bearer headers; ok→null else `preview HTTP <status>`; catch → `preview error: <msg>`. Preserve the Media Bus explanatory comment.
- **upload(bytes,contentType,token,...,filename,mountDir):**
  - If `mountDir`: `mountPath = <mountDir>/<branch>/media/<filename>`; `mkdir -p` its dir; `fs.writeFileSync(mountPath, Buffer.from(bytes))`; on success → call `triggerPreview` and return `['mount', err|null]`; on write error fall through to API. (This is `.py`'s behavior, which `.jsh` omitted — restore it.)
  - API path: build multipart/form-data body (boundary `----DABoundary`+random hex; field name `data`; filename; Content-Type). Preserve the "DA requires multipart… raw PUT silently 2xx but doesn't persist" comment. POST to `https://admin.da.live/source/<o>/<r>/media/<file>`; non-ok → err; then `triggerPreview`; return `['api', null]` or error. Build the body as a single `Uint8Array` (header bytes + data + footer bytes), same as `.jsh`.
- **processOne(task,...):** download → detect type → `filename = product-<pid>-<n>.<ext>` → upload → result objects with `product_id/n/ok/stage/err` or `product_id/n/ok/method/filename/size`.
- **Concurrency:** port `.jsh`'s `semaphore(max)` bounded pool; run all tasks via `Promise.all(tasks.map(t => run(() => processOne(...))))`. (Matches `.py`'s `ThreadPoolExecutor(workers)` observable behavior: bounded parallelism, all complete.)
- **Task build:** for each manifest item, take `urls.slice(0,maxPerProduct)`, 1-indexed `n`.
- **Output:** print processing header; per-result ok/FAIL lines (ok: `<KB>KB -> <method>  (<filename>)`, `KB = Math.floor(size/1024)`); summary `\nSummary: <ok> uploaded, <fail> failed.`; build `mapping[pid] = [urls sorted by n]` (`https://<b>--<r>--<o>.aem.page/media/<file>`); write `--output` pretty JSON; print `Mapping written to: <output>`.
- **--update-products:** if set and productsJson exists → parse, for each product with `id` in mapping set `.images`, count, write back pretty; print `Updated <n> products in <path>`; else stderr `WARN: --update-products requested but <path> not found`.
- **Exit:** `process.exit(failN === 0 ? 0 : 1)`.

- [ ] **Step 1: Port the script** — implement the union behavior above.
- [ ] **Step 2: Syntax check** — `node --check skills/of1-extract-content/assets/download-images.mjs` → exit 0.
- [ ] **Step 3: SLICC-compat lint** — the 3 grep checks → three `lint ok:` lines. (This is the script most at risk of a stray `execSync`; the lint is the guard.)
- [ ] **Step 4: Real-node smoke run** (offline — exercises arg-parse, manifest read, mapping write, and the no-token error path without network):

```bash
T=$(mktemp -d)
printf '[{"productId":"widget","urls":[]}]' > "$T/manifest.json"
# No URLs → no downloads, no token needed for the mapping-write path? Token resolves BEFORE tasks.
# Provide a dummy token so resolveToken succeeds; empty urls means zero network calls.
DA_TOKEN=dummy node skills/of1-extract-content/assets/download-images.mjs \
  --input "$T/manifest.json" --owner acme --repo demo --branch main \
  --output "$T/mapping.json" --mount-dir "$T/nope"
echo "--- mapping ---"; cat "$T/mapping.json"
node -e 'const m=require(process.argv[1]);if(typeof m!=="object")throw new Error("mapping not object");console.log("SMOKE OK")' "$T/mapping.json"
# arg-guard: missing --owner must exit non-zero
node skills/of1-extract-content/assets/download-images.mjs --input "$T/manifest.json" --repo demo --branch main 2>/dev/null && echo "GUARD FAIL" || echo "guard ok: missing-required exits nonzero"
rm -rf "$T"
```
Expected: empty-object mapping written, `SMOKE OK`, and `guard ok:` (exit 0 for the run with empty urls — zero failures → exit 0; the mapping is `{}`).

- [ ] **Step 5: Rewrite SKILL.md** — `skills/of1-extract-content/SKILL.md`:
  - Lines ~301-315: replace the two-runtime block with the single `.mjs` invocation:
    ```bash
    node "$SKILL_DIR/assets/download-images.mjs" \
      --input /tmp/image-manifest.json \
      --owner "$OWNER" --repo "$REPO" --branch "$BRANCH" \
      --output /tmp/image-mapping.json \
      --update-products
    ```
  - Line ~263: `RUNNING \`download-images.py\`` → `download-images.mjs`.
  - Line ~265: `\`download-images.py\`/\`.jsh\` does both steps` → `\`download-images.mjs\` does both steps`.
  - Line ~285: `Use \`download-images.py\`` → `download-images.mjs`.
  - Line ~326: `working files from \`download-images.py\`` → `download-images.mjs`.
  - Line ~370: `Run \`download-images.py\`` → `download-images.mjs`.
- [ ] **Step 6: Delete twins** — `git rm .../download-images.py .../download-images.jsh`
- [ ] **Step 7: Commit** — `git commit -m "refactor(of1-extract-content): port download-images to portable .mjs"` (stage .mjs + SKILL.md).

---

### Task 6: Repo-wide guard + orchestrator note

**Files:**
- Modify (if needed): `skills/of1-demo-orchestrator/SKILL.md:457` (the "No python3 in SLICC" inline-JSON note — still accurate as guidance, but verify it doesn't reference our deleted scripts).

**Interfaces:** none — this is the final consistency gate.

- [ ] **Step 1: Zero surviving twin references**

Run:
```bash
echo "=== .jsh files remaining ==="; find skills -name '*.jsh'; echo "(expect none)"
echo "=== build-script .py files remaining ==="; find skills -name '*.py' -path '*/assets/*'; echo "(expect none)"
echo "=== SKILL.md references to deleted scripts ==="
grep -rnE '(assemble-catalog|fill-template|download-images|fill-config-review|fill-demo-hub)\.(py|jsh)' skills/*/SKILL.md; echo "(expect none)"
echo "=== stray run_jsh / 'no python3 in SLICC runtime' script comments ==="
grep -rn 'run_jsh .*\.\(jsh\)\|no python3 in SLICC runtime' skills/*/SKILL.md; echo "(expect none except possibly the orchestrator's generic inline-JSON note)"
```
Expected: the three "remaining" checks empty; the last check empty OR only `of1-demo-orchestrator/SKILL.md:457` (a generic note about inline JSON, NOT a reference to a deleted script). If line 457 only says to prefer `run_jsh`/`node -e`/`jq` over `python3` heredocs for inline JSON, leave it — it's still true. If it references any deleted script, fix it.

- [ ] **Step 2: All 5 `.mjs` pass syntax**

Run: `for f in $(find skills -name '*.mjs' -path '*/assets/*'); do node --check "$f" && echo "ok: $f"; done`
Expected: 5 `ok:` lines, no errors.

- [ ] **Step 3: Aggregate SLICC-compat lint over all 5**

Run:
```bash
FAIL=0
for f in $(find skills -name '*.mjs' -path '*/assets/*'); do
  grep -qE 'execSync|spawnSync|execFileSync|\brequire\(' "$f" && { echo "FAIL $f: forbidden call"; FAIL=1; }
  grep -qE 'process\.argv\[1\]' "$f" && { echo "FAIL $f: argv[1]"; FAIL=1; }
done
[ "$FAIL" = 0 ] && echo "ALL LINT OK" || echo "LINT FAILURES ABOVE"
```
Expected: `ALL LINT OK`.

- [ ] **Step 4: Commit (if any fix was needed)**

If Step 1 required an orchestrator edit: `git add skills/of1-demo-orchestrator/SKILL.md && git commit -m "docs(of1-demo-orchestrator): drop reference to retired build script"`. Otherwise nothing to commit.

---

## Self-Review

**Spec coverage:** all 5 scripts (Tasks 1-5) + SKILL rewrites (each task's Step 5) + deletion (each Step 6) + repo-wide guard (Task 6) — matches the spec's 5-file target and deletion guard. ✅

**Placeholder scan:** every port task carries the full behavior spec drawn from the read `.py` source; smoke steps have concrete fixtures + assertions. No TBD/TODO. ✅

**Type/name consistency:** `htmlEscape` (Python `html.escape` default) is reused in Tasks 2/3/4 with the same definition; `split(token).join(value)` token-replacement is called out in Tasks 3/4 where multi-token replace happens; argv `.slice(2)` correction is explicit in Task 5. ✅

**Known caveats surfaced for reviewers:** JS `String.replace` first-match + `$&` pitfall (Tasks 3/4), `re.escape` translation + `\2` backreference (Task 2), the mount-path restoration in `download-images` (`.jsh` dropped it, `.py` has it → `.mjs` keeps it, Task 5), the `demo-hub.html` template lives beside the script (Task 4 smoke uses the real template).
