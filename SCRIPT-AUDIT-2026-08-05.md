# OF1 Skills — Script Audit

> **Resolution (2026-08-05):** Findings 46, 47, 48, 49, 50, 50b, 51, 52, 53, 54, 55, 56 fixed and tested. Finding 55b (mechanical price assert in `assemble-catalog.mjs`) **deferred** as a follow-up — it's a new feature with false-positive risk that needs careful bad-fixture testing. Correction to finding 50: `p.url` (line 82) was *already* `htmlEscape`d; the real gaps were the two image-URL sites, now fixed via a `safeUrl` scheme allowlist. Correction to finding 49's proposed probe: the raw @playwright/cli binary's global `--help` exits 0 for *any* token, so `open --help` would false-pass — the shipped probe checks the shim marker, then confirms the legacy `visit` subcommand is understood. Every fix adds a loud WARN per the cross-cutting instruction. New file: `install-shim.sh`.

**Date:** 2026-08-05
**Scope:** the 8 executable scripts shipped by the `of1-demo-skills` plugin (not SKILL.md prose — that is tracked separately in `FINDINGS-2026-08-04.md`, items 1–45).
**Method:** every script read in full; defects marked **VERIFIED** were reproduced by running the script against a fixture on this machine. Defects marked **READ-ONLY** are inferred from the source and not executed.
**Machine:** macOS (darwin 25.5.0), node available, `playwright-cli` = Microsoft `@playwright/cli` at `/opt/homebrew/bin/playwright-cli`.
**Repo under test:** `of1-labs/quentin-test-skills-v5` @ `main`.

New findings are numbered **46–56**, continuing the sequence in `FINDINGS-2026-08-04.md`.

---

## 1. Executive summary

Six of eight scripts are sound. `download-images.mjs` is the best-written of the set. The two problem areas are:

1. **`fill-demo-hub.mjs` has a hard schema mismatch with the orchestrator** (finding 46). It reads `audit.steps`; both orchestrators are specified to write `audit.stages`. The audit section renders as an empty string. Confirmed: `deliverables/index.html` contains **0** occurrences of "Pipeline Audit". Every improvement observation the orchestrator was instructed to compute was silently discarded from the deliverable.

2. **`fill-template.mjs` fails silently in five distinct ways** (findings 47, 48, 52, 53, 54), one of which (54) emits structurally broken HTML.

Plus a systemic issue: **`verify.sh`'s playwright check cannot fail in the configuration that actually breaks** (finding 49), and the shim it points at was never installed and lacks the translation that would have been needed anyway (findings 49, 56).

**The unifying pattern — and the single most important takeaway for whoever fixes this:** every one of these defects fails *toward silence*. Nothing errored. No exit code was non-zero. A missing audit section, an unfilled slot, an unhidden empty table row, and a false playwright pass all present identically to success. This is the same failure mode as item 45 in the main findings doc. **Any fix in this batch should add a loud failure, not just correct the logic.**

### Verdict table

| Script | LOC | Verdict |
|---|---|---|
| `of1-extract-content/assets/download-images.mjs` | 339 | **Good.** One cosmetic issue (51). |
| `of1-build-templates/assets/assemble-catalog.mjs` | 132 | **Good.** One scope gap (55). |
| `of1-style-generative-block/assets/of1.js` | 49 | **Good.** No findings. |
| `of1-check-dependencies/scripts/verify.sh` | 285 | **One false-pass** (49). Otherwise solid. |
| `of1-generate-config-review/assets/fill-config-review.mjs` | 255 | **Works.** Two issues (50, 50b). |
| `of1-check-dependencies/scripts/playwright-cli-shim.sh` | 55 | **Not installed; incomplete** (49, 56). |
| `of1-build-templates/assets/fill-template.mjs` | 194 | **Five defects** (47, 48, 52, 53, 54). |
| `of1-publish/assets/fill-demo-hub.mjs` | 344 | 🔴 **Broken contract** (46). |

---

## 2. Scope caveat — read this before fixing `fill-template.mjs`

`fill-template.mjs` is a **local preview / development filler**. At runtime, slots are filled by the remote OF1 worker (`of1-gen-web-service.franklin-prod.workers.dev`), which is a separate codebase not in this repo and not inspected here.

Therefore findings 47, 48, 52, 53, 54 are confirmed defects **in the local preview tool**. Whether the worker shares any of them is **unknown and untested**. Two consequences:

- These bugs degrade preview fidelity, which is what a developer or agent uses to sanity-check a template before shipping. A preview that hides a defect the worker will also produce is worse than no preview.
- If the worker *does* share the `<article>`-only assumption in finding 52, then live pages have visible empty table rows. **Someone should check the worker.** I could not.

---

## 3. 🔴 Finding 46 — `fill-demo-hub.mjs` reads `audit.steps`; the orchestrators write `audit.stages`

**Severity: high. This one silently deleted a deliverable section on every run.**

`of1-publish/assets/fill-demo-hub.mjs:66`:

```js
if (!audit || Object.keys(audit).length === 0 || !Array.isArray(audit.steps) || audit.steps.length === 0) return '';
```

`audit.steps` is never present. Both orchestrator skills specify `stages`:

- `of1-demo-orchestrator-cc/SKILL.md:227` — `"stages": [ … ]`
- `of1-demo-orchestrator/SKILL.md:401` — `"stages": [ … ]`

**VERIFIED** against the real artifact from the `frescopa.coffee` run:

```
$ python3 -c "import json; a=json.load(open('.of1/state/pipeline-audit.json')); print(list(a.keys()))"
['domain','skillVersion','skillBranch','runtime','branch','repo','note','stages','improvements']

$ grep -c "Pipeline Audit" deliverables/index.html
0
```

So `renderAudit()` returned `''`, the `{{PIPELINE_AUDIT}}` token was replaced with nothing, and the hub shipped with no audit and no improvements — with no warning on stdout. The script printed its normal success line.

**Secondary mismatch, same root cause.** Line 90 iterates `audit.steps` and line 99 reads `s.step`; the written objects use `stage`. Line 116 reads `imp.step`; the written improvements use `stage` (VERIFIED: `improvement keys: ['stage','issue','suggestion']`). So even after fixing line 66, every row would render `Step ?` and every improvement header `Step ? — …`.

### Fix

Accept both keys and **fail loudly when neither is present but the file exists**:

```js
function renderAudit(stateDir) {
  const auditPath = path.join(stateDir, 'pipeline-audit.json');
  const audit = loadJson(auditPath);
  if (!audit || Object.keys(audit).length === 0) return '';   // no audit written — fine

  const stages = Array.isArray(audit.stages) ? audit.stages
               : Array.isArray(audit.steps)  ? audit.steps
               : null;
  if (!stages || stages.length === 0) {
    console.error(`WARN: ${auditPath} exists but has no 'stages' (or legacy 'steps') array — audit section omitted from the hub.`);
    return '';
  }
  …
}
```

Then in the row loop use `s.stage ?? s.step ?? '?'`, and in the improvements loop `imp.stage ?? imp.step ?? '?'`. Label the column "Stage", matching the orchestrator's vocabulary.

**Also fix the label:** the table header says `Step` but the orchestrator's model is 3 *stages*, with sub-steps owned by `of1-adopt-existing-site`. Using "Step" here invites exactly the confusion that produced the drift.

**Regression test.** Feed `renderAudit` a `pipeline-audit.json` containing `stages` and assert the output contains `Pipeline Audit` and does **not** contain `Step ?`. Also feed it one with neither key and assert the WARN fires. Per item 45, test the assert against a deliberately-bad fixture — a check that can only pass silently is not a check.

---

## 4. `fill-template.mjs` — five defects

### Finding 47 — only double-quoted `data-slot` is matched

`fillSlot`/`fillImgSlot`/`fillListSlot` build regexes with a literal `data-slot="key"` (lines 37, 87, 100). Single-quoted attributes never match.

**VERIFIED:**

```
fixture: <p data-slot="a.b">x</p>  <p data-slot='a.c'>y</p>  <p data-slot="a.d">z</p>
values:  {"a.b":"…","a.c":"single-quoted","a.d":"<b>bold</b>"}
output:  a.b filled ✓   a.c UNTOUCHED (default retained, no warning)   a.d filled ✓
```

All 15 current templates use double quotes, so blast radius today is zero — but a hand-edited or generated template with single quotes silently keeps its placeholder copy, which is precisely how fabricated default text reaches production (see items 37 and the pricing incident).

**Fix.** Match either quote style: `data-slot=["']${escapedKey}["']`. Better, count matches and warn on any value in `values.json` that matched zero slots:

```js
const matched = new Set();
// …record key on each successful replace…
for (const key of Object.keys(values)) {
  if (!key.startsWith('_') && !matched.has(key)) {
    console.error(`WARN: no slot found for key '${key}' — value dropped`);
  }
}
```
This one addition would have caught 47, 52, and 54 at once.

### Finding 48 — the reported item count is misleading

Line 190 prints `${itemCount} items`, but `itemCount` (lines 126–129) only counts `item-N.title`/`item-N.body` keys — it is not the number of slots filled.

**VERIFIED:** a fill that populated 2 of 3 text slots reported `0 items`. So the single number a caller would use to sanity-check the fill is uninformative in exactly the common case.

**Fix.** Report both: `wrote X (N bytes, S/T slots filled, K grid items)` where `T` is the count of non-`_` keys in `values.json`. A caller (human or agent) can then see `2/3` and investigate.

### Finding 52 — card hiding only handles `<article>`; `<li>` and `<tr>` cards are never hidden

Line 151: `out.replace(/<article([^>]*?\sdata-card="(\d+)"[^>]*)>/g, …)`.

Element types actually carrying `data-card` across the 15 templates:

```
57  <article
 8  <li
 4  <tr
```

**VERIFIED** with a `<tbody>`/`<ol>` fixture where only card 1 had a value: card 2 was left fully visible in both the `<tr>` and `<li>` cases, un-hidden and showing its placeholder text.

**Real impact today.** `templates/of1-budget-cost-breakdown.html:41-45` has an intentionally-empty 4th row:

```html
<tr data-card="4">
  <td data-slot="row-4.name"></td>
  <td data-slot="row-4.price"></td>
  <td data-slot="row-4.note"></td>
</tr>
```

Under `<article>` semantics this row would be hidden when unused. As a `<tr>`, it renders as a visible empty table row. Affected templates: `of1-budget-cost-breakdown.html`, `of1-budget-roi-story.html`, `of1-deep-dive-timeline.html`.

Note also the probe key is hardcoded to `item-${idx}.title` / `item-${idx}.body` (lines 153–154), but the cost-breakdown table uses `row-N.*`. So even with the element list widened, that template needs `data-card-key="row-4.name"` on the row — the escape hatch already exists in the code and is simply unused by the templates.

**Fix.** Generalize the element match to `<(article|li|tr|div|section)` (or any element carrying `data-card`), and add `data-card-key` attributes to the `row-*` templates. `hidden` on a `<tr>` works in all modern browsers; if any target needs belt-and-braces, pair it with `[hidden] { display: none !important; }` in the base stylesheet.

**And check the worker.** If the worker shares this `<article>`-only assumption, live generated pages have visible empty rows right now.

### Finding 53 — the `of1-cmp-grid` hardcode is dead code

Lines 164–167 inject `data-item-count` only into the literal string `<div class="of1-cmp-grid" data-grid-items>`.

**VERIFIED:** 15 templates use `data-grid-items`; **0** match `class="of1-cmp-grid"`. Actual grid classes are per-template (`of1-cb-grid`, `of1-dg-cards`, `of1-hp-grid`, `of1-cmp-table`, …). Additionally, **no CSS anywhere references `data-item-count`** (grepped `styles/`).

So this transform never fires and nothing consumes its output. It is dead code that reads like a working feature — worse than absent, because a future reader will assume grid sizing is handled.

**Fix.** Either delete lines 164–167, or make it real: match any `data-grid-items` element and add the attribute, then have the base stylesheet use it (e.g. `[data-item-count="2"] { grid-template-columns: repeat(2, 1fr); }`). Deleting is the honest default until a stylesheet needs it.

### Finding 54 — nested same-tag slots emit structurally broken HTML

The slot regex (line 37) uses a non-greedy body `([\s\S]*?)` and back-references the opening tag name `(<\/\2>)`. With a same-tag child, it matches the *first* closing tag — the child's — and leaves the real one orphaned.

**VERIFIED:**

```
fixture: <div data-slot="a.wrap"><div class="inner">keep</div></div>
         <p>after</p>
output:  <div data-slot="a.wrap">NEW</div></div>
         <p>after</p>
                    ^^^^^^ orphaned closing tag — invalid HTML
```

No error, no warning, exit 0. Current templates happen not to nest same-tag elements inside a text slot, so this is latent rather than active — but it is a silent corruption, and template authoring is exactly the activity that would trigger it.

**Fix (pick one, in order of preference):**

1. **Parse instead of regex.** The correct fix. `node:` has no built-in DOM, but `linkedom` or `node-html-parser` is a one-dependency change and makes 47, 52, and 54 all disappear structurally. Worth it — this script is a code generator, and regex-based HTML rewriting will keep producing this class of bug.
2. **If keeping regex:** detect the hazard and refuse. After matching, scan the captured body for `<\2[\s>]`; if found, `console.error` and leave the slot untouched rather than corrupting it.

Option 2 is a 5-line change and honors the "fail loudly" principle. Option 1 is the real fix.

### Finding 55 (link slots) — no URL scheme validation, but attribute escaping is correct

**VERIFIED** that quote-escaping works — a `href` containing `"` was correctly neutralized:

```
input:  {"cta.link":{"href":"/x\" onload=\"alert(1)","label":"Go"}}
output: <a href="/x&quot; onload=&quot;alert(1)" data-slot="cta.link">Go</a>   ← no attribute injection ✓
```

However `javascript:alert(1)` passes through as a `href` value unchanged. Given inputs are pipeline-authored rather than end-user-supplied, this is **low severity, not a live vulnerability** — but since values originate from LLM-generated JSON, a scheme allowlist (`http:`, `https:`, `/`, `#`, `mailto:`) is cheap insurance. Also note text values *are* HTML-escaped correctly, and `$&` in a replacement value survives intact (verified) — the `escapeRegex` handling is right.

---

## 5. Finding 49 — `verify.sh`'s playwright check cannot fail in the configuration that breaks

`of1-check-dependencies/scripts/verify.sh:164`:

```bash
if command -v playwright-cli >/dev/null 2>&1; then
  ok "playwright-cli → $(command -v playwright-cli)"
elif command -v playwright >/dev/null 2>&1; then
  warn "playwright-cli not found; … Install the shim …"
```

**VERIFIED on this machine:**

```
$ which -a playwright-cli
/opt/homebrew/bin/playwright-cli        ← Microsoft @playwright/cli, NOT the shim
$ head -3 $(command -v playwright-cli)
#!/usr/bin/env node
/** Copyright (c) Microsoft Corporation. …
$ ls $HOME/.npm-global/bin/ | grep playwright
(nothing — playwright-cli.real absent)
```

`command -v playwright-cli` succeeds, so the check takes the `ok` branch and the `warn` branch is **unreachable in exactly the broken configuration**. The verifier reported green while the tool the step skills depend on was mis-shaped.

**Downstream consequence (this is finding 6e in the main doc, now fully explained).** The orchestrator's dispatch template tells every subagent:

> "playwright-cli: the shim … translates legacy syntax (visit/--output) to the modern binary automatically. **No manual renames needed.**"

That statement is false on this machine on two counts. The shim is not on PATH; and the shim's own header requires the manual rename it claims is unnecessary (`REAL="${REAL_PWCLI:-${HOME}/.npm-global/bin/playwright-cli.real}"`, line 16 — step 3 of its own install instructions is `mv "$(which playwright-cli)" "$(which playwright-cli).real"`).

**And installing the shim would not have fixed the failure I actually hit.** `grep -n "full" playwright-cli-shim.sh` → **no matches**. The shim has no `--fullPage` → `--full-page` translation, which was one of the two errors encountered during the run. It *would* have fixed the other (bare-expression `eval`, handled correctly at line 44).

**Fix — three parts, all needed:**

1. **Probe behavior, not presence.** Presence of a name proves nothing about its shape:
   ```bash
   if command -v playwright-cli >/dev/null 2>&1; then
     if playwright-cli open --help >/dev/null 2>&1; then
       ok "playwright-cli (shim-compatible) → $(command -v playwright-cli)"
     else
       warn "playwright-cli at $(command -v playwright-cli) does not accept 'open' — likely the unshimmed @playwright/cli binary. Install the shim (scripts/playwright-cli-shim.sh) or step skills calling visit/screenshot/snapshot will fail."
     fi
   ```
   Adjust the probe to whichever subcommand actually distinguishes the two on your target versions — the point is that it must *execute* something.
2. **Add `--fullPage` translation to the shim.** In the arg-rewrite loop: `--fullPage|--full-page) NEW_ARGS+=("--full-page") ;;` and `--fullPage=*|--full-page=*) NEW_ARGS+=("--full-page") ;;` — dropping the `=value`, since the modern binary rejects `=value` on booleans.
3. **Fix the orchestrator's dispatch prompt.** Remove "No manual renames needed." Replace with the actual state: the shim requires installation, and if `playwright-cli` is the unshimmed Microsoft binary, use modern syntax directly — `open` not `visit`, `--filename` not `--output`, `--full-page` with no value, and `eval` requires a function form (`() => (…)`); a bare expression returns silently empty.

---

## 6. Finding 56 — the shim's install instructions don't match reality

`playwright-cli-shim.sh:5-10` instructs:

```
3. mv "$(which playwright-cli)" "$(which playwright-cli).real"
4. ln -s <repo>/.claude/skills/of1-check-dependencies/scripts/playwright-cli-shim.sh /usr/local/bin/playwright-cli
```

Three problems on a homebrew macOS box:
- Line 16 hardcodes `$HOME/.npm-global/bin/playwright-cli.real`, but step 3's `$(which playwright-cli)` resolves to `/opt/homebrew/bin/`. Following the instructions verbatim leaves the fallback on line 17 (`command -v playwright-cli.real`) as the only thing that saves it — and that only works if `/opt/homebrew/bin` is on PATH, which it is, so it happens to work. Fragile by accident, not by design.
- `/usr/local/bin` precedes `/opt/homebrew/bin` on some setups and follows it on others. If it follows, the symlink is shadowed and the shim silently never runs — the same silent-failure signature as everything else in this report.
- The path `<repo>/.claude/skills/…` is the pre-plugin layout. Installed via plugin, the script lives under the marketplace `installLocation`.

**Fix.** Ship an idempotent `install-shim.sh` that resolves the real binary with `command -v`, renames in place next to wherever it actually found it, symlinks the shim into the *same* directory, and verifies afterward by executing `playwright-cli open --help`. Then have `verify.sh` point at that script by absolute path in its warn message.

---

## 7. `fill-config-review.mjs` — two issues

### Finding 50 — URLs interpolated into attributes without escaping

Every text field goes through `htmlEscape`, but URLs do not:

- line 59 — `<img src="${u}" …>` (`u` from `p.images`)
- line 64 — `<img src="${thumb}" …>`
- line 82 — `<a href="${url}" …>` (`p.url`)

A `"` in any config-derived URL breaks out of the attribute. `escapeAttr` already exists in a sibling script; there's no reason these three sites are bare. Given config JSON is LLM-generated, this is a plausible-not-theoretical path.

**Fix.** Add the same `escapeAttr` helper and wrap all three. Consider a scheme allowlist as in finding 55.

### Finding 50b — hardcoded `$` prefix collides with the numeric/string price ambiguity

Line 67: `<span class="price">$${price}</span>`, where `price = p.price ?? ''`.

`of1/config/products.json` stores prices as **numbers** (`"price": 14.99`), so this renders `$14.99` correctly today. But if any config stores the string `"$14.99"` — which is how a template author or LLM would naturally write it — this renders **`$$14.99`**. It also renders a bare `$` when `price` is absent.

This is the same numeric-vs-string price ambiguity that produced false positives in my own earlier provenance checker (item 45). It is worth fixing everywhere it appears, because the two representations are both in circulation.

**Fix.**

```js
function formatPrice(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  return s.startsWith('$') ? s : `$${s}`;
}
```
and emit `<span class="price">${htmlEscape(formatPrice(p.price))}</span>`.

---

## 8. Finding 51 — `download-images.mjs` mount fallback can double-write

`of1-extract-content/assets/download-images.mjs:182-193`:

```js
if (mountDir) {
  try {
    fs.mkdirSync(…); fs.writeFileSync(mountPath, …);
    const err = await triggerPreview(…);
    return ['mount', err || null];
  } catch (e) {
    // fall through to API
  }
}
```

The `try` encloses `triggerPreview`. If the write succeeds but `triggerPreview` *throws*, control falls through to the multipart API path and re-uploads a file already written. Harmless (idempotent destination) but wasteful, and the comment "fall through to API" misdescribes what happens — a reader will assume fallthrough implies the write failed.

Note `triggerPreview` already catches its own errors and returns a string, so this is currently unreachable in practice. It becomes reachable the moment someone edits `triggerPreview`.

**Fix.** Narrow the `try` to the filesystem write only:

```js
if (mountDir) {
  let wrote = false;
  try {
    fs.mkdirSync(path.dirname(mountPath), { recursive: true });
    fs.writeFileSync(mountPath, Buffer.from(data));
    wrote = true;
  } catch (e) { /* mount unavailable — fall through to API */ }
  if (wrote) return ['mount', await triggerPreview(…) || null];
}
```

### Everything else in this script is good — do not "improve" it

Flagging explicitly so a fixing agent doesn't regress it. These are all correct and load-bearing:

- **Magic-byte content sniffing** (lines 48–69) — prevents JPEGs being uploaded as PNGs. The WEBP RIFF check is right.
- **Multipart with field name `data`** (lines 195–198) — the comment records that a raw PUT *returns 2xx but does not persist the file*. That is a hard-won fact.
- **`triggerPreview`** (lines 161–180) — without the Media Bus preview, files exist only in DA's source store and the `aem.page/media/` path 404s. Also load-bearing.
- **Bounded semaphore** (lines 246–262) — correct dependency-free concurrency limiter.
- **`MIN_BYTES = 10000`** — rejects error pages served with a 200.

---

## 9. `assemble-catalog.mjs` — good, with one scope gap

Solid: validates `name`/`intent` as required fields (exit 1), fails hard on missing HTML rather than emitting a partial catalog, warns on missing intents, idempotent, and correctly writes both artifacts — `templates/templates-catalog.json` (fully inlined `htmlContent`, plus `count`/`byIntent`/`generatedAt`) and `of1/config/templates.json` (the pointer config).

### Finding 55b — validates structure, never content

This is the gap the fabricated-pricing incident went through. The catalog embeds `htmlContent` verbatim; nothing inspects it. Invented prices (`$29.99 / month`, `$1,825`, `$0.50 / cup`) passed validation and shipped to the CDN inside the catalog, and because the catalog is a **build artifact**, fixing a template without re-running `assemble-catalog.mjs` leaves the CDN serving the stale copy (item 37).

**Fix — add a mechanical content assert.** Extract every `$N.NN` (and `$N,NNN`) from each template's `htmlContent`, cross-reference against prices in `of1/config/products.json`, and fail on any figure with no source. Two requirements learned the hard way:

- **Handle both number and string price representations** — `products.json` stores `14.99`, templates render `$14.99`. A string-only extractor produces false positives; that exact bug wasted a cycle (item 45).
- **Test the assert against a deliberately-bad fixture** before trusting it. Add a template containing `$999.99`, confirm the assert fails, then remove it. An assert that can only pass is not an assert.

This is the highest-leverage single addition in this whole report: it converts the class of defect that reached production into a build failure.

---

## 10. `of1.js` — good, no findings

49 lines, clean. Domain resolution (lines 24–34) handles the `meta[name="domain"]` override, `--`-containing preview hostnames, `.aem.page`/`.aem.live` suffix stripping, and a bare-host fallback in sensible priority order. `decorateAndLoad` correctly reuses `decorateMain` + `loadSections` from the project's own scripts rather than reimplementing decoration. Dynamic SDK import with `webpackIgnore` is appropriate. Nothing to change.

---

## 11. Recommended fix order

Ordered by (impact × confidence) ÷ effort. Items 1–3 are small, verified, and high-value.

| # | Finding | Effort | Why first |
|---|---|---|---|
| 1 | **46** — `stages`/`steps` mismatch in `fill-demo-hub.mjs` | ~10 lines | Verified broken on a real run; restores an entire lost deliverable section |
| 2 | **49** — behavioral playwright probe + shim `--full-page` + fix orchestrator prose | ~15 lines | Verified false-pass; unblocks every screenshot-using step skill |
| 3 | **55b** — mechanical price assert in `assemble-catalog.mjs` | ~30 lines | Converts the defect class that actually reached production into a build failure |
| 4 | **47 + 48 + 52** — quote-agnostic slots, unmatched-key WARN, generalize card hiding to `li`/`tr` | ~25 lines | One shared root cause (silent no-match); 52 has a live rendering impact |
| 5 | **54** — nested same-tag slot corruption | 5 lines (guard) or a dep (parser) | Guard now; consider `linkedom` when `fill-template.mjs` is next touched |
| 6 | **50 + 50b** — escape URL attributes, `formatPrice` helper | ~15 lines | Straightforward hardening |
| 7 | **53** — delete or implement the `of1-cmp-grid` hardcode | 4 lines to delete | Dead code that reads as a feature |
| 8 | **56** — `install-shim.sh` + corrected instructions | ~25 lines | Makes fix #2 reproducible on other machines |
| 9 | **51** — narrow the `try` in `upload()` | 5 lines | Latent only; fix while nearby |
| 10 | **55** — `href` scheme allowlist | ~10 lines | Low severity given input provenance |

### Cross-cutting instruction for whoever fixes these

**Do not just correct the logic — add the loud failure.** Every defect here was silent. Specifically:

- `fill-template.mjs` must warn on any `values.json` key that matched zero slots. This single addition catches 47, 52, and 54.
- `fill-demo-hub.mjs` must warn when `pipeline-audit.json` exists but yields no renderable stages.
- `verify.sh` must probe behavior, never mere presence of a name on PATH.
- Every new assert must be tested against a deliberately-bad fixture before it is trusted.

### Verification checklist

- [ ] `renderAudit` against the real `.of1/state/pipeline-audit.json` → output contains `Pipeline Audit`, contains no `Step ?`
- [ ] `renderAudit` against `{}` → returns `''` silently; against `{"stages":[]}` → WARN fires
- [ ] `verify.sh` with the unshimmed `/opt/homebrew/bin/playwright-cli` on PATH → **warns** (currently passes)
- [ ] `verify.sh` with the shim installed → passes
- [ ] `playwright-cli screenshot --fullPage` via shim → real binary receives `--full-page` with no `=value`
- [ ] `fill-template.mjs` on a single-quoted `data-slot` → warns
- [ ] `fill-template.mjs` on `of1-budget-cost-breakdown.html` with rows 1–3 filled → row 4 is hidden, not a visible empty row
- [ ] `fill-template.mjs` on a nested same-tag slot → refuses with an error, no orphaned `</div>`
- [ ] `assemble-catalog.mjs` on a template containing `$999.99` → exits non-zero
- [ ] `assemble-catalog.mjs` on the current 15 templates → exits 0 (no false positives from numeric prices)

---

## 12. Open item requiring someone with worker access

**Does the OF1 worker share `fill-template.mjs`'s `<article>`-only card-hiding assumption (finding 52)?**

If yes, live generated pages using `of1-budget-cost-breakdown.html`, `of1-budget-roi-story.html`, or `of1-deep-dive-timeline.html` are rendering visible empty `<tr>`/`<li>` rows right now. The worker is a separate deployed codebase (`of1-gen-web-service.franklin-prod.workers.dev`) and was not inspectable from here — this is unverified either way, not a claim.

Related and already filed as item 39 in the main findings doc: the worker emitted "free shipping" in 1 of 6 identical calls from a phrase present in no config and no template (0/5 on retry). Template correctness does not bound runtime LLM copy — worth keeping in view when reasoning about anything the worker renders.
