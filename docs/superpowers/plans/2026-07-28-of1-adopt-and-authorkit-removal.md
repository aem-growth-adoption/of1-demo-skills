# of1-adopt + AuthorKit-removal cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two skills that still assume the AuthorKit runtime `stardust:deploy` removed upstream, teach two shared step skills to detect existing artifacts instead of hard-requiring an external-domain crawl, and add a new `of1-adopt` skill that runs OF1 on top of an existing EDS/Stardust site — on both Claude Code and SLICC, with no sprinkle/scoop UI push.

**Architecture:** All changes are documentation-only edits to `SKILL.md` files (this repo ships instructions, not executable code — every "test" is a bash verification gate or a manual render check, matching the existing convention). Five files change (`of1-stardust-deploy`, `of1-generative-block-styler`, `of1-extraction`, `of1-template-generation`) or get created (`of1-adopt/SKILL.md`, `skills/docs/extending-an-of1-demo.md`), plus the plugin manifest and README get one new entrypoint each.

**Tech Stack:** Markdown skill files (Claude Code / SLICC dual-runtime instructions), bash verification gates, `jq`/`curl`/`playwright-cli` for runtime checks. No compiled code, no test runner — "tests" in this plan are the same kind of pass/fail bash gate every existing skill already uses.

## Global Constraints

- Every skill file must keep the existing dual-runtime pattern: a "Claude Code: use the `Skill`/`Agent` tool" block and a "SLICC: read the skill and follow it directly" block, wherever a sub-skill (`stardust:deploy`, `stardust:extract`) is invoked.
- Never hand-roll what a delegated skill (`stardust:deploy`, `stardust:extract`) already owns — per the existing skills' own rule ("Do NOT reimplement stardust:deploy's steps by hand").
- `of1-adopt` must have **zero** `sprinkle_send` / sprinkle-UI calls on either runtime — this is an explicit product decision from the design spec, not an oversight to fix later.
- All git operations follow the existing convention: `git add` specific paths only, never `git add .`/`git add -A` inside a step (per `of1-demo/knowledge/common-pitfalls.md`'s "NEVER use git add . in a scoop" rule already baked into every existing skill) — the plan doesn't touch that file but every new git snippet in this plan follows it.
- Status JSON contracts (`{"step":N,"status":"done"|"review"|"failed",...}`) must match the existing shape byte-for-byte where a skill already has one, so the orchestrator's Agent-return parsing (CC) and status-file polling (SLICC) keep working unchanged.
- Reference: design spec at `docs/superpowers/specs/2026-07-28-of1-adopt-and-authorkit-removal-design.md` — every task below implements one numbered section of that spec.

---

## File Structure

| File | Change | Spec section |
|---|---|---|
| `skills/of1-stardust-deploy/SKILL.md` | Modify — drop AuthorKit bootstrap language, fix artifact-verification gate paths | §1 |
| `skills/of1-generative-block-styler/SKILL.md` | Modify — remove overlay/passthrough machinery, author `/of1` as a normal page | §2 |
| `skills/of1-extraction/SKILL.md` | Modify — add own-site-mode branch | §3 |
| `skills/of1-template-generation/SKILL.md` | Modify — add own-site fallback for the `base` phase's visual reference | §3 |
| `skills/of1-adopt/SKILL.md` | Create — new orchestrator, dual-runtime, no sprinkle | §4 |
| `skills/docs/extending-an-of1-demo.md` | Create — direct-invocation reference doc | §5 |
| `.claude-plugin/plugin.json` | Modify — add `of1-adopt` to entrypoints | (packaging) |
| `README.md` | Modify — add `of1-adopt` row + pipeline note | (packaging) |

No files are split — each existing skill stays a single `SKILL.md`, consistent with the repo's established one-file-per-skill pattern. `of1-adopt/SKILL.md` is new but follows the same single-file shape as every other step skill.

---

## Task 1: Fix `of1-stardust-deploy` — drop AuthorKit assumptions

**Files:**
- Modify: `skills/of1-stardust-deploy/SKILL.md:9,11,49,76,91-133`

**Interfaces:**
- Consumes: nothing new — same `OF1_STATE_DIR`, `OF1_DEMO_REPO`, `ADOBE_IMS_TOKEN`/`OF1_TOKEN_FILE` env vars this skill already reads.
- Produces: same `step-5-status.json` contract (`{"step":5,"status":"review","deliverables":[...],"summary":"..."}`) — unchanged shape, so `of1-demo-cc`/`of1-demo` keep working. `of1-generative-block-styler` (Task 2) and `of1-adopt` (Task 4) will look for `content/nav.html` + `content/footer.html` + `blocks/header` + `blocks/footer` as this step's chrome output — that's the new contract this task establishes.

- [ ] **Step 1: Update the skill's summary line (line 9) to describe current output shape**

Replace:
```markdown
Pure delegation to the `stardust:deploy` skill (`stardust` plugin). Convert every prototype committed by step 4 into real EDS blocks + content pages — one block per distinct prototype `<section>` (deduped via stardust's variant-class rule where sections repeat with the same treatment), one EDS content page per prototype page, shared `content/fragments/{nav,footer}.html` chrome, and a `styles/styles.css` foundation (tokens, reset, button system, self-hosted fonts) — then push to the demo branch.
```

With:
```markdown
Pure delegation to the `stardust:deploy` skill (`stardust` plugin). Convert every prototype committed by step 4 into real EDS blocks + content pages — one block per distinct prototype `<section>` (deduped via stardust's variant-class rule where sections repeat with the same treatment), one EDS content page per prototype page, authored `content/nav.html` + `content/footer.html` documents rendered by the standard `blocks/header` + `blocks/footer` blocks, and a `styles/styles.css` foundation (tokens, reset, button system, self-hosted fonts) — then push to the demo branch.
```

- [ ] **Step 2: Update line 11's `/of1` page note (still accurate, just reword the "overlay" framing)**

Replace:
```markdown
The `/of1` personalization page is NOT converted here — its DOM-preserving passthrough overlay is owned entirely by step 7 (`of1-generative-block-styler`), since the OF1 search block must stay live-DOM and can never be authored as a static EDS block.
```

With:
```markdown
The `/of1` personalization page is NOT converted here — it's authored as an ordinary EDS content page by step 7 (`of1-generative-block-styler`), since the OF1 search block must stay live-DOM and can never be authored as a static block itself.
```

- [ ] **Step 3: Replace the AuthorKit bootstrap row in the input table (line 76)**

Find (in the "Supply these values upfront" table, § "2. Invoke the `stardust:deploy` skill"):
```markdown
| Runtime | run the Runtime-detection probe (stardust:deploy § "Runtime-detection probe") — if the repo is vanilla `aem-boilerplate` rather than AuthorKit, run the Runtime bootstrap first (`bootstrap-authorkit.mjs`) |
```

Replace with:
```markdown
| Runtime | run the Runtime-detection probe (stardust:deploy § "Runtime-detection probe") — writes `stardust/runtime-contract.json` with `"runtime": "vanilla-eds"`. `stardust:deploy` targets vanilla `aem-boilerplate` only; there is no bootstrap step. |
```

- [ ] **Step 4: Rewrite § "3. Verify critical artifacts exist" to match current `stardust:deploy` output paths**

Find the whole section starting at `### 3. Verify critical artifacts exist (hard gate)` through the end of its closing ` ``` ` block (original lines 91-133). Replace the intro paragraph and the fragment-path-guessing block with:

```markdown
### 3. Verify critical artifacts exist (hard gate)

**Step 6 (template generation) and step 7 (OF1 styling) both depend on this step's output** — step 7 specifically needs `content/nav.html` and `content/footer.html` (the authored chrome documents `blocks/header`/`blocks/footer` render).

```bash
cd "$OF1_DEMO_REPO"
FAIL=false

# At least one block + one content page must exist
BLOCK_COUNT=$(find blocks -mindepth 1 -maxdepth 1 -type d 2>/dev/null | grep -v '^blocks/of1$' | grep -v '^blocks/fragment$' | grep -v '^blocks/section-metadata$' | grep -v '^blocks/header$' | grep -v '^blocks/footer$' | wc -l | tr -d ' ')
[ "$BLOCK_COUNT" -ge 1 ] || { echo "✗ MISSING: no blocks/ directories were created" >&2; FAIL=true; }

for SLUG in $PROTOTYPES; do
  PAGE_SLUG="${SLUG#prototype-}"
  [ -f "content/${PAGE_SLUG}.html" ] || { echo "✗ MISSING: content/${PAGE_SLUG}.html" >&2; FAIL=true; }
done

[ -f styles/styles.css ] || { echo "✗ MISSING: styles/styles.css" >&2; FAIL=true; }

# Chrome — authored nav/footer documents + the blocks that render them
[ -f content/nav.html ] || { echo "✗ MISSING: content/nav.html" >&2; FAIL=true; }
[ -f content/footer.html ] || { echo "✗ MISSING: content/footer.html" >&2; FAIL=true; }
[ -d blocks/header ] || { echo "✗ MISSING: blocks/header" >&2; FAIL=true; }
[ -d blocks/footer ] || { echo "✗ MISSING: blocks/footer" >&2; FAIL=true; }

if [ "$FAIL" = true ]; then
  echo "" >&2
  echo "FAIL: stardust:deploy was NOT invoked correctly — critical artifacts missing." >&2
  echo "Read /workspace/skills/deploy/SKILL.md (or the Skill tool's stardust:deploy)" >&2
  echo "and re-invoke. Do not hand-author blocks/content pages to work around this." >&2
  exit 1
fi
echo "✓ Blocks, content pages, foundation CSS, and nav/footer chrome present"
```
```

- [ ] **Step 5: Verify the file reads cleanly end to end**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n -i "authorkit\|content/fragments\|fragments/header\|fragments/footer" skills/of1-stardust-deploy/SKILL.md
```
Expected: no output (all AuthorKit/fragment-path references removed).

- [ ] **Step 6: Commit**

```bash
git add skills/of1-stardust-deploy/SKILL.md
git commit -m "fix: of1-stardust-deploy matches current (post-AuthorKit) stardust:deploy output"
```

---

## Task 2: Fix `of1-generative-block-styler` — `/of1` becomes an ordinary page

**Files:**
- Modify: `skills/of1-generative-block-styler/SKILL.md` (frontmatter description; §"Why this skill exists"; Step 0; Step 5; Step 6; Step 7; Step 7b; Step 8; Step 9; common-mistakes table)

**Interfaces:**
- Consumes: `content/nav.html`/`content/footer.html` existing in the repo (Task 1's new contract) — this skill no longer copies them anywhere, it relies on the standard `blocks/header`/`blocks/footer` picking them up automatically, same as any other page.
- Produces: same `step-7-status.json` contract (`{"step":7,"status":"review","deliverables":[{"url":...,"label":"OF1 page"}],"summary":"..."}`) — unchanged shape.

- [ ] **Step 1: Update frontmatter description and intro (lines 3, 9)**

Replace:
```markdown
description: Generate polished CSS for the OF1 generative block AND set up the /of1 page end-to-end (template, fragments, page-chrome CSS, branded block CSS, DA content).
```
with:
```markdown
description: Generate polished CSS for the OF1 generative block AND set up the /of1 page end-to-end (block install, branded block CSS, DA content) as an ordinary EDS content page.
```

Replace:
```markdown
Own the `/of1` page top to bottom: install the block, generate brand-aligned CSS for both the block and the page chrome, create the passthrough template + fragments, and upload the DA content documents that make the page renderable.
```
with:
```markdown
Own the `/of1` page top to bottom: install the block, generate brand-aligned CSS for it, and upload the DA content document that makes the page renderable. `/of1` is authored exactly like any other EDS content page — the site's existing header/footer blocks and `styles/styles.css` apply automatically; there is no page-template or overlay mechanism to work around.
```

- [ ] **Step 2: Rewrite Step 0 to drop the `scripts.js` patch**

Find the section from `### Step 0 — Install block files + patch the overlay engine for passthrough` through the end of its code block and "Critical" note (original lines 56-85). Replace with:

```markdown
### Step 0 — Install block files

```bash
cd "$OF1_DEMO_REPO"
mkdir -p blocks/of1
cp "$SKILL_DIR/assets/of1.js"  blocks/of1/of1.js
cp "$SKILL_DIR/assets/of1.css" blocks/of1/of1.css
```

`of1.js` is deployed as-is. `of1.css` is the unbranded template — Step 3 customizes it in place with the site's brand tokens.

No runtime patching is needed. `/of1` is authored as an ordinary content page (Step 6): the site's `blocks/header`/`blocks/footer` load `/nav`/`/footer` automatically like on every other page, and the `of1` block decorates normally like any other block in `<main>`. There is no page-template/overlay engine in vanilla `aem-boilerplate` that would otherwise replace `<main>`'s content.
```

- [ ] **Step 3: Remove Step 5's "page chrome" framing — chrome now comes from the site automatically**

Find the section from `### Step 5 — Write \`styles/of1.css\` (page chrome)` through the end of its code block and the "Do NOT cherry-pick" warning (original lines 247-274). Replace the whole section with:

```markdown
### Step 5 — (Removed) Page chrome is automatic

There is no separate page-chrome CSS step. `/of1` loads the site's own `styles/styles.css` exactly like every other page — the header/footer blocks render the branded nav/footer using the site's real `content/nav.html`/`content/footer.html`. Nothing needs to be duplicated or re-derived here.
```

- [ ] **Step 4: Rewrite Step 6 to author `/of1` as a normal content page (no template/fragments)**

Find the section from `### Step 6 — Create the \`/of1\` page template + fragments` through the end of its code block (original lines 276-319). Replace with:

```markdown
### Step 6 — (Folded into Step 7) No template or fragment copying needed

`/of1` needs no `templates/`, `fragments/`, or `data-overlay`/`data-slot-passthrough` machinery. It is authored directly as a DA content document in Step 7 below, using the site's real `/nav` and `/footer` — the same paths every other page on the site already uses.
```

- [ ] **Step 5: Rewrite Step 7 to author `/of1.html` as an ordinary body-fragment DA document, no `/nav`/`/footer` placeholders**

Find the section from `### Step 7 — Upload OF1 DA content (and nav/footer placeholders)` through the end of its bash block (original lines 323-367). Replace with:

```markdown
### Step 7 — Upload OF1 DA content

The `/of1` page is an ordinary EDS content page: a `metadata` block (Title/Description) plus a section containing the `of1` block table. The site's existing `blocks/header`/`blocks/footer` pick up its real `/nav` and `/footer` documents automatically — no placeholder nav/footer pages need to be created here, since the site already has real ones from step 5 (`of1-stardust-deploy`).

```bash
OF1_HTML='<body><header></header><main><div><div class="metadata"><div><div>Title</div><div>'${DOMAIN}' — Ask Anything</div></div><div><div>Description</div><div>Search and get personalized results.</div></div></div></div><div><div class="of1"><table><tr><th colspan="2">of1</th></tr><tr><td><p>api-endpoint</p></td><td><p>https://of1-gen-web-service.franklin-prod.workers.dev</p></td></tr><tr><td><p>domain</p></td><td><p>'${BRANCH}'--'${REPO}'--'${OWNER}'</p></td></tr></table></div></div></main><footer></footer></body>'

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$OF1_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/of1.html"

# Trigger preview so the URL is live
PREVIEW_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/of1")
PREVIEW_STATUS=$(echo "$PREVIEW_RESP" | tail -1)
if [ "$PREVIEW_STATUS" -lt 200 ] || [ "$PREVIEW_STATUS" -ge 300 ]; then
  echo "FAIL: preview trigger for /of1 returned HTTP ${PREVIEW_STATUS}" >&2
  echo "Response: $(echo "$PREVIEW_RESP" | sed '$d')" >&2
  exit 1
fi
```

**Do NOT include a `<title>` tag in the DA HTML** — EDS will render it as visible content.
```

- [ ] **Step 6: Rewrite Step 7b's gate to drop the "template metadata" checks (no template concept anymore) and drop the /nav /footer checks (already verified by Task 1's step-5 gate)**

Find the section from `### Step 7b — Gate: verify DA content is live and renders correctly` through the end of its bash block and the "Common failures" table (original lines 371-431). Replace with:

```markdown
### Step 7b — Gate: verify DA content is live and renders correctly

**Do NOT proceed to Step 8 until this gate passes.** The preview trigger above can silently fail (401, stale cache, missing auth headers). Verify the page actually exists and returns valid HTML.

```bash
OF1_PREVIEW="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"

OF1_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$OF1_PREVIEW")
if [ "$OF1_STATUS" != "200" ]; then
  echo "FAIL: /of1 page returned HTTP ${OF1_STATUS} — preview trigger likely failed (auth issue?)" >&2
  echo "Re-run the preview trigger with both Authorization and x-content-source-authorization headers." >&2
  exit 1
fi

echo "✓ /of1 content is live"
```

Common failures at this gate:

| Symptom | Cause | Fix |
|---|---|---|
| 401 on preview trigger | Missing `x-content-source-authorization` header or expired token | Re-authenticate DA token and re-run |
| 404 on /of1 | PUT to DA source failed silently | Check the PUT response; verify `admin.da.live/source/...` path matches repo config |
```

- [ ] **Step 7: Update Step 8's commit command — drop `templates/of1.html` and `fragments/of1/`**

Find:
```bash
cd "$OF1_DEMO_REPO"
git add blocks/of1/ styles/of1.css templates/of1.html fragments/of1/
git commit -m "feat: OF1 page + brand-aligned block styling for ${DOMAIN}"
git push origin "$BRANCH"
```

Replace with:
```bash
cd "$OF1_DEMO_REPO"
git add blocks/of1/
git commit -m "feat: OF1 page + brand-aligned block styling for ${DOMAIN}"
git push origin "$BRANCH"
```

- [ ] **Step 8: Update Step 9's render checks — use the site's real chrome selectors, not `.site-header`/`.site-footer` guesses; drop the overlay-specific framing**

Find the section from `### Step 9 — Verify the live \`/of1\` page renders correctly` through the end of its bash block (original lines 442-460). Replace the `playwright-cli eval` lines with:

```bash
OF1_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/of1"
playwright-cli open "$OF1_URL"
sleep 4  # EDS loads header/footer blocks + lazy CSS

# Confirm the branded chrome and the block are all in the DOM
playwright-cli eval "document.querySelector('header .header') ? 'header OK' : 'HEADER MISSING'"
playwright-cli eval "document.querySelector('footer .footer') ? 'footer OK' : 'FOOTER MISSING'"
playwright-cli eval "document.querySelector('.of1')            ? 'of1 block OK' : 'OF1 BLOCK MISSING'"

# Capture a screenshot for visual review
playwright-cli screenshot --fullPage=true --filename "$OF1_STATE_DIR/of1-render-check.png"
```

(`header .header` / `footer .footer` match vanilla `aem-boilerplate`'s `decorateBlock` convention — confirm against the target's own `runtime-contract.json` `blockWrapperClass` field if it drifts.)

- [ ] **Step 9: Update the "Common failures" table in Step 9b (original lines 490-496) — remove the AuthorKit/overlay-engine explanations**

Replace:
```markdown
| Symptom | Likely cause |
|---|---|
| `HEADER MISSING` / `FOOTER MISSING` | `fragments/of1/{header,footer}.html` didn't get pushed, or `scripts/scripts.js` is missing passthrough support (Step 5, `of1-stardust-deploy`, installs the AuthorKit runtime this patch sits on top of) |
| `OF1 BLOCK MISSING` | `blocks/of1/of1.js` wasn't pushed, OR the DA content document at `/of1.html` is missing the `template=of1` metadata, OR the `of1` block class isn't on the right element |
| Screenshot shows unstyled links / system font | `styles/of1.css` didn't get pushed, or the overlay engine didn't pick it up (check `<meta name="template">` in the rendered HTML) |
```

With:
```markdown
| Symptom | Likely cause |
|---|---|
| `HEADER MISSING` / `FOOTER MISSING` | `content/nav.html`/`content/footer.html` weren't pushed by step 5 (`of1-stardust-deploy`) — re-run step 5's artifact-verification gate |
| `OF1 BLOCK MISSING` | `blocks/of1/of1.js` wasn't pushed, or the `of1` block table's `th` cell doesn't read exactly `of1` |
| Screenshot shows unstyled links / system font | `styles/styles.css` (the site's own foundation CSS) didn't get pushed by step 5, or the preview hasn't picked up the latest push yet |
```

- [ ] **Step 10: Fix the "Common mistakes that waste time" table entry referencing `styles/of1.css` (original line 543)**

Replace:
```markdown
| **Forgetting `styles/of1.css` page chrome** | **OF1 nav/footer renders as raw unstyled links** | **MUST write `styles/of1.css` with header/footer CSS copied from prototype styles** |
```
with:
```markdown
| Assuming `/of1` needs its own page-chrome CSS file | Wasted effort — `styles/of1.css` doesn't exist anymore | `/of1` inherits `styles/styles.css` automatically like any other page; nothing to write here |
```

- [ ] **Step 11: Verify no dangling references remain**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n -i "authorkit\|overlay\|passthrough\|data-slot-passthrough\|templates/of1.html\|fragments/of1\|styles/of1.css" skills/of1-generative-block-styler/SKILL.md
```
Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add skills/of1-generative-block-styler/SKILL.md
git commit -m "fix: /of1 page authored as an ordinary EDS page, no overlay/passthrough"
```

---

## Task 3: `of1-extraction` — own-site mode

**Files:**
- Modify: `skills/of1-extraction/SKILL.md` (§"Process", step 1)

**Interfaces:**
- Consumes: `repo-config.json` fields already read (`owner`, `repo`, `branch`, `domain`) plus a new check for `$OF1_DEMO_REPO/stardust/current/DESIGN.json`.
- Produces: same `step-3-status.json` contract when it runs; when skipped, still writes a `step-3-status.json` with `"status":"done"` (not `"review"`) and a note that it was skipped — so `of1-adopt`'s dependency tracking (Task 4) can treat "skipped" and "ran" identically as "done".

- [ ] **Step 1: Add a "0. Detect existing extraction" step before the current § "1. Invoke `stardust:extract`"**

Insert, right after the "## Process" heading and before `### 1. Invoke \`stardust:extract\` (DO NOT crawl by hand)`:

```markdown
### 0. Detect existing extraction — skip if already present

If `stardust/current/DESIGN.json` already exists in the repo, there is nothing to extract — reuse it and skip straight to Completion:

```bash
cd "$OF1_DEMO_REPO"
if [ -f stardust/current/DESIGN.json ]; then
  echo "✓ stardust/current/DESIGN.json already exists — skipping extraction"
  cat > "$OF1_STATE_DIR/step-3-status.json" <<EOF
{
  "step": 3,
  "status": "done",
  "summary": "Skipped — stardust/current/DESIGN.json already present in the repo."
}
EOF
  exit 0
fi
```

If it does NOT exist, continue to Step 1 below. Two sub-cases:

- **`$DOMAIN` is a real external domain** (the site being cloned is different from the current EDS repo) — proceed exactly as documented (crawl `https://${DOMAIN}`).
- **The current EDS repo IS the target** (no external domain to crawl — the goal is introducing OF1 onto an existing EDS/Stardust site with no prior stardust extraction) — crawl the repo's own live preview URL instead:

```bash
EXTRACT_TARGET="https://${DOMAIN}"
if [ "${OF1_EXTRACT_OWN_SITE:-0}" = "1" ]; then
  EXTRACT_TARGET="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
  echo "Own-site mode: extracting from ${EXTRACT_TARGET} instead of an external domain"
fi
```

`OF1_EXTRACT_OWN_SITE=1` is set by the `of1-adopt` orchestrator (never by `of1-demo`/`of1-demo-cc`, which always crawl an external domain).
```

- [ ] **Step 2: Update § "1. Invoke `stardust:extract`" to use `$EXTRACT_TARGET` instead of hardcoding `$DOMAIN`**

Find:
```markdown
- **Claude Code:** use the `Skill` tool:
  ```
  Skill: stardust:extract
  Args:  https://${DOMAIN} --cap 3
  ```
```

Replace with:
```markdown
- **Claude Code:** use the `Skill` tool:
  ```
  Skill: stardust:extract
  Args:  ${EXTRACT_TARGET} --cap 3
  ```
```

(`$EXTRACT_TARGET` is set by Step 0 above — defaults to `https://${DOMAIN}` unless `OF1_EXTRACT_OWN_SITE=1`.)

- [ ] **Step 3: Verify the file is internally consistent**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n 'EXTRACT_TARGET\|OF1_EXTRACT_OWN_SITE' skills/of1-extraction/SKILL.md
```
Expected: 3 matches (the Step 0 assignment, the own-site branch, and the Step 1 usage).

- [ ] **Step 4: Commit**

```bash
git add skills/of1-extraction/SKILL.md
git commit -m "feat: of1-extraction skips or targets own site when DESIGN.json is missing"
```

---

## Task 4: `of1-template-generation` — own-site fallback for the `base` phase

**Files:**
- Modify: `skills/of1-template-generation/SKILL.md` (§"Inputs"; § "Process — Mode: `base`")

**Interfaces:**
- Consumes: same env vars; adds a check for `$OF1_DEMO_REPO/deliverables/prototype-*.html` existing.
- Produces: same `styles/of1-template-base.css` contract — the intent/assemble phases (Tasks unrelated) never change, since they only read this file's presence, not its provenance.

- [ ] **Step 1: Update § "Inputs" to document the fallback**

Find:
```markdown
- Pixel-perfect prototypes → `$OF1_DEMO_REPO/deliverables/prototype-*.html` (from step 4) — self-contained HTML with inline `<style>`; this is the sole visual/structural reference, read directly (no step 5 dependency)
- Prototype screenshots → captured by the orchestrator directly from the static `deliverables/prototype-*.html` files (see "Pre-fan-out" in the orchestrator skill) — no EDS render or step 5 output required
```

Replace with:
```markdown
- Pixel-perfect prototypes → `$OF1_DEMO_REPO/deliverables/prototype-*.html` (from step 4), when they exist — self-contained HTML with inline `<style>`; the primary visual/structural reference, read directly (no step 5 dependency)
- Prototype screenshots → captured by the orchestrator directly from the static `deliverables/prototype-*.html` files (see "Pre-fan-out" in the orchestrator skill), when prototypes exist
- **Fallback (no prototypes — e.g. `of1-adopt` running against an existing EDS site):** `$OF1_DEMO_REPO/stardust/current/DESIGN.json` + live screenshots of the site's own rendered EDS pages (captured by the `of1-adopt` orchestrator the same way Track A captures EDS reference screenshots) + the repo's real `styles/styles.css` tokens
```

- [ ] **Step 2: Update § "Process — Mode: `base`"'s "Sources of truth" list to branch on prototype existence**

Find:
```markdown
**Sources of truth, priority order:**

1. Prototype inline CSS — the `<style>` block inside `$OF1_DEMO_REPO/deliverables/prototype-*.html` (search `:root { … }` + custom-property declarations). This is the canonical token source — extract it directly, no intermediate conversion step produces it.
2. `DESIGN.json` — `$OF1_DEMO_REPO/stardust/current/DESIGN.json`. Tiebreaker / fill-in for tokens not in the prototypes. Schema drifts between extraction runs; tolerate variation.

Don't trust `DESIGN.json` as the sole source — the prototypes are the visually-validated ground truth.
```

Replace with:
```markdown
**Sources of truth, priority order:**

```bash
cd "$OF1_DEMO_REPO"
HAS_PROTOTYPES=false
ls deliverables/prototype-*.html >/dev/null 2>&1 && HAS_PROTOTYPES=true
```

- **If prototypes exist (`$HAS_PROTOTYPES = true`, the normal Track A case):**
  1. Prototype inline CSS — the `<style>` block inside `deliverables/prototype-*.html` (search `:root { … }` + custom-property declarations). This is the canonical token source — extract it directly, no intermediate conversion step produces it.
  2. `DESIGN.json` — `stardust/current/DESIGN.json`. Tiebreaker / fill-in for tokens not in the prototypes. Schema drifts between extraction runs; tolerate variation.

  Don't trust `DESIGN.json` as the sole source — the prototypes are the visually-validated ground truth.

- **If no prototypes exist** (running against an existing EDS site — e.g. via `of1-adopt`):
  1. `styles/styles.css` — the repo's real, deployed `:root` tokens. This is the canonical source in this case; the site is already live, so its own stylesheet IS the ground truth.
  2. `stardust/current/DESIGN.json` — tiebreaker / fill-in for tokens not in `styles.css`.
  3. Live screenshots of the site's own rendered pages (captured by the orchestrator) — visual reference for section rhythm, card grids, and typography scale that a token file alone doesn't capture.
```

- [ ] **Step 3: Update the "Verify before declaring done" spot-check to branch on the same flag**

Find:
```bash
# Accent must match prototype — spot check
grep -A1 ":root" styles/of1-template-base.css | grep accent
grep -A1 ":root" deliverables/prototype-*.html | grep -i accent | head -3
# If these disagree, fix of1-template-base.css before continuing.
```

Replace with:
```bash
# Accent must match the source of truth — spot check
grep -A1 ":root" styles/of1-template-base.css | grep accent
if [ "$HAS_PROTOTYPES" = "true" ]; then
  grep -A1 ":root" deliverables/prototype-*.html | grep -i accent | head -3
else
  grep -A1 ":root" styles/styles.css | grep -i accent | head -3
fi
# If these disagree, fix of1-template-base.css before continuing.
```

- [ ] **Step 4: Verify the file is internally consistent**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n 'HAS_PROTOTYPES' skills/of1-template-generation/SKILL.md
```
Expected: 3 matches (the assignment and both conditional branches).

- [ ] **Step 5: Commit**

```bash
git add skills/of1-template-generation/SKILL.md
git commit -m "feat: of1-template-generation base phase falls back to styles.css when no prototypes exist"
```

---

## Task 5: `of1-adopt` — new orchestrator skill

**Files:**
- Create: `skills/of1-adopt/SKILL.md`

**Interfaces:**
- Consumes: `of1-setup` (Task-unrelated, reused as-is), `of1-extraction` (Task 3's new `OF1_EXTRACT_OWN_SITE=1` mode), `of1-template-generation` (Task 4's fallback, same `base`/`intent`/`assemble` modes and env vars as Track A), `of1-generative-block-styler` (Task 2's fixed version), `of1-brand-voice-extractor`, `of1-content-metadata`, `of1-quick-suggestions`, `of1-cta-template-builder`, `of1-config-review`, `of1-deploy` — all reused unchanged.
- Produces: `$OF1_STATE_DIR/step-<N>-status.json` files with the same `{"step":N,"status":...}` shape every other pipeline step already uses, plus a final report to the user. No sprinkle/scoop UI event is ever sent.

- [ ] **Step 1: Write the skill frontmatter, entry, and Phase 0 (setup)**

Create `skills/of1-adopt/SKILL.md` starting with:

```markdown
---
name: of1-adopt
description: "Introduce OF1 onto an existing EDS/Stardust site — reuses whatever design tokens/blocks/pages already exist instead of crawling an external domain or pixel-cloning. Works on both Claude Code and SLICC; no sprinkle/scoop UI."
user-invocable: true
---

# OF1 Adopt — Introduce OF1 on an Existing EDS/Stardust Site

For sites that already have EDS blocks, content pages, and (usually) Stardust design tokens. Produces only the OF1-specific layer: templates, the `/of1` page, and tenant config. Runs identically in spirit on Claude Code and SLICC — the dispatch mechanism differs (see "## Dispatch" below), but there is **no sprinkle UI and no `sprinkle_send` call on either runtime.**

## Entry

The user invokes you pointed at an existing EDS repo — e.g. "adopt OF1 onto this site" or "/of1-adopt" from inside the repo. No domain crawl is needed; the site itself is the source of truth. If the repo isn't obvious from context, ask once via `AskUserQuestion` for the local path.

## Phase 0 — Verify dependencies + repo state (inline)

Invoke the `of1-setup` skill exactly as `of1-demo-cc`/`of1-demo` do (Skill tool on Claude Code; read + follow inline on SLICC — not Agent/scoop dispatch, this step is light and must run in your own context to read the verified state). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` for `stateDir`/`of1Repo` and `<STATE_DIR>/repo-config.json` for `owner`/`repo`/`branch`/`domain`. Use these for all subsequent steps.
```

- [ ] **Step 2: Write Phase 1 (artifact detection) and the step graph**

Append:

```markdown
## Phase 1 — Artifact detection (inline)

```bash
cd "$OF1_DEMO_REPO"
HAS_DESIGN_JSON=false
[ -f stardust/current/DESIGN.json ] && HAS_DESIGN_JSON=true
echo "DESIGN.json present: $HAS_DESIGN_JSON"
```

If `HAS_DESIGN_JSON=false`, Step 3 (extraction) runs in own-site mode (`OF1_EXTRACT_OWN_SITE=1`). If `true`, Step 3 is skipped entirely — `of1-extraction` itself detects this (see its own § "0. Detect existing extraction") and writes `step-3-status.json` with `"status":"done"` either way, so downstream dependency checks don't need to special-case the skip.

## Step graph

```
1 (setup) → 2 (artifact detection, inline)
              │
       [DESIGN.json exists?]
         no → 3 (extraction, own-site mode)
         yes → skip to 4/6 (of1-extraction itself no-ops and reports done)
              │
      ┌───────┴────────┐
      ↓                ↓
  Track A          Track B
  4 (templates:    6a (brand-voice) ∥ 6b (content-metadata) ∥ 7 (CTA template)
  base→5×intent→          ↓
  assemble)        8 (suggestions — needs 6a + 6b)
      ↓                ↓
  5 (OF1 styling)      │
      └───────┬────────┘
               ↓
      9 (config review, inline — needs 6a + 6b + 7 + 8)
               ↓
      10 (deploy — needs 4 + 5 + 9)
```

Track A (4→5) and Track B (6a ∥ 6b ∥ 7 → 8) both dispatch as soon as step 3 returns `done` (whether it ran or was skipped) — they run concurrently, same rule `of1-demo-cc` already uses between its Track A/Track B steps.

| Trigger (ALL must be done) | Dispatch in one message |
|---|---|
| Step 1 done | Step 2 (inline, immediate) |
| Step 2 done | Step 3 |
| Step 3 done (ran or skipped) | Step 4-base AND Steps 6a, 6b, 7 (4 dispatches in one message) |
| Step 4-base done | Steps 4a–4e (5 intent dispatches in one message) |
| Steps 4a–4e all done | Step 4-assemble (1 dispatch, sequential) |
| Steps 6a + 6b done | Step 8 (needs products.json + brand-voice.json) |
| Steps 6a + 6b + 7 + 8 ALL done | Step 9 (inline — do NOT run until all four are confirmed done) |
| Steps 4-assemble + 5 + 9 ALL done | Step 10 |

**Step 5 (OF1 styling) does NOT wait for step 4** — per `of1-generative-block-styler`'s own dependency table (fixed in Task 2), it only needs step 1's block install context and the repo's existing chrome (`content/nav.html`/`content/footer.html`, already present since this is an existing EDS site) — dispatch it alongside step 4-base.

**Common mistakes to avoid** (same class of mistake `of1-demo-cc` already warns about):
- Do NOT run Step 9 before ALL of 6a, 6b, 7, 8 return `done`.
- Do NOT run Step 8 before BOTH 6a and 6b return — it needs products.json + brand-voice.json.
- Do NOT dispatch step 4-intent agents before step 4-base returns — they read its output.
```

- [ ] **Step 3: Write the "## Dispatch" section — the only runtime-branching part of the skill**

Append:

```markdown
## Dispatch

Same step-graph, same dependency rules on both runtimes. Only the invocation mechanism differs. **Neither runtime ever calls a sprinkle/scoop UI push (`sprinkle_send`) — there is no sprinkle for this skill.**

### Claude Code

- Use **TaskCreate** with one task per step (1, 3, 4-base, 4a–4e, 4-assemble, 5, 6a, 6b, 7, 8, 9, 10). Mark task 1 completed immediately; mark each task `in_progress`/`completed`/`failed` around its dispatch.
- Each step (except 2 and 9, which are inline) is a single `Agent` dispatch. Sub-agents see none of this conversation — the prompt must be self-contained: read the target step skill's `SKILL.md`, export the same env vars `of1-demo-cc` exports (`OF1_STATE_DIR`, `OF1_DEMO_REPO`, `ADOBE_IMS_TOKEN`/`OF1_TOKEN_FILE`, `SKILL_DIR`), state the branch/owner/repo, list which prior-step output files it needs, and require the same JSON status block: `{"step":N,"status":"done"|"review"|"failed","summary":"...","deliverables":[...]}`.
- **Parallelism is mandatory** at each fan-out point — dispatch all eligible Agents in a single message with multiple Agent tool-use blocks.
- Model assignment: same rule of thumb as `of1-demo-cc` — Opus only where output quality cascades downstream. Since this pipeline skips discovery/prototype entirely, the only Opus-worthy step is 5 (OF1 styling — multi-step DA authoring) and 3 when it actually runs (extraction — design-token quality cascades). Everything else (`sonnet`): 4-base, 4a–4e, 4-assemble, 6a, 6b, 7, 8, 10.
- Auto-approve by default (mirrors `of1-demo-cc`'s one-shot mode) — mark each `review`-status task completed and continue immediately, unless the user explicitly asked to pause between steps.

### SLICC

- Dispatch each step as a `scoop_scoop()` call with `writablePaths` covering `/scoops/<name>/`, `/shared/`, and the project repo path — same pattern `of1-demo` already uses per step.
- Each scoop writes its own `/shared/of1-demo/step-N-status.json` on completion, exactly like every step skill already documents in its own "Completion" section — **do not** additionally push to a sprinkle. There is nothing listening for `sprinkle_send` on this skill.
- Handle completions event-driven, not via polling: end your turn after dispatching, and react when a scoop-completion notification arrives — read its status file, check if it unblocks the next dispatch per the table above, and dispatch the next batch.
- Model assignment: same as the Claude Code column above, using `claude-opus-4-6`/`claude-sonnet-5` model strings per `of1-demo`'s own convention.

## Step 9 — Config review (inline, no dispatch on either runtime)

Identical to `of1-demo-cc`'s Step 11 / `of1-demo`'s Step 11 — run the `of1-config-review` skill's fill script directly:

```bash
cd "$OF1_DEMO_REPO"
python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

(`$SKILL_DIR_CONFIG_REVIEW` = absolute path to the `of1-config-review` skill directory.)

## Step 10 — Deploy (inline)

After step 9 is approved AND steps 4-assemble + 5 are both done, run the `of1-deploy` skill inline (read it and follow it directly — same as `of1-demo-cc`'s Step 12). Its pre-launch checklist (6 checks) must all pass before marking done.
```

- [ ] **Step 4: Verify the new file has no leftover placeholder text and matches the design spec's graph**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -n -i "TBD\|TODO\|to be determined\|placeholder" skills/of1-adopt/SKILL.md
grep -n "sprinkle_send" skills/of1-adopt/SKILL.md
```
Expected: first command has no output (no placeholders); second command has no output (no sprinkle calls anywhere in the file).

- [ ] **Step 5: Commit**

```bash
git add skills/of1-adopt/SKILL.md
git commit -m "feat: add of1-adopt — introduce OF1 on an existing EDS/Stardust site"
```

---

## Task 6: Documentation for extending an existing OF1 demo

**Files:**
- Create: `skills/docs/extending-an-of1-demo.md`

**Interfaces:**
- Consumes: nothing — pure reference doc.
- Produces: nothing consumed by other skills; this is a human-facing pointer doc.

- [ ] **Step 1: Write the doc**

Create `skills/docs/extending-an-of1-demo.md`:

```markdown
# Extending an Existing OF1 Demo

You have a working OF1 demo (built via `of1-demo`/`of1-demo-cc` or `of1-adopt`) and want to change one thing — refresh the product catalog, tweak the brand voice, add suggestion chips, restyle the CTA, or simulate a different acquisition channel. **No orchestrator is needed** — every config-producing skill below is standalone-invocable and self-locates the repo/state it needs from `repo-config.json`, the same way it does inside the pipeline.

| Want to change... | Call | Then |
|---|---|---|
| Products, personas, use cases, FAQs, testimonials | `of1-content-metadata` | `of1-config-review` → `of1-deploy` |
| Brand tone/voice | `of1-brand-voice-extractor` | `of1-config-review` → `of1-deploy` |
| Suggestion chips / search UI copy | `of1-quick-suggestions` | `of1-config-review` → `of1-deploy` |
| CTA visual template | `of1-cta-template-builder` | `of1-config-review` → `of1-deploy` |
| Fake acquisition signals (email/ads/LLM referral simulation) | `of1-signals` | **No redeploy** — extension-only config, never synced to the OF1 worker |

## Why no orchestrator

Each config skill already reads `repo-config.json` (owner/repo/branch/domain) from the repo it's invoked in and writes directly to `of1/config/*.json` — the same contract the full pipeline's Track B steps use. There's no setup phase to re-run and no dependency graph to manage for a single-file change.

## Always finish with config-review + deploy

After any config change, regenerate the review page and redeploy so the change actually reaches the OF1 worker:

1. **`of1-config-review`** — regenerates `deliverables/config-review.html` from whatever's currently in `of1/config/`.
2. **`of1-deploy`** — commits, pushes, syncs the OF1 worker (`POST /api/tenants/<id>/sync`), and re-runs the pre-launch checklist.

**Exception: `of1-signals`.** `signals.json` is read directly by the OF1 **preview extension**, not the OF1 worker — it's never synced, so no `of1-deploy` step is needed after editing it. Just push the file and the extension picks it up on next load.
```

- [ ] **Step 2: Verify the doc renders as valid markdown and matches the skill names actually in the repo**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
for s in of1-content-metadata of1-brand-voice-extractor of1-quick-suggestions of1-cta-template-builder of1-signals of1-config-review of1-deploy; do
  [ -d "skills/$s" ] && echo "✓ $s exists" || echo "✗ MISSING: $s"
done
```
Expected: all seven print `✓ ... exists`.

- [ ] **Step 3: Commit**

```bash
git add skills/docs/extending-an-of1-demo.md
git commit -m "docs: add extending-an-of1-demo — direct skill invocation for config-only changes"
```

---

## Task 7: Wire `of1-adopt` into the plugin manifest and README

**Files:**
- Modify: `.claude-plugin/plugin.json:6-23`
- Modify: `README.md` (Skills table)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed programmatically — `plugin.json`'s `entrypoints.skills` array is read by the Claude Code plugin loader to know which skills to register.

- [ ] **Step 1: Add `of1-adopt` to `plugin.json`'s entrypoints array and update the description**

In `.claude-plugin/plugin.json`, find:
```json
  "description": "Turn any website into an OF1 generative-search demo on Adobe Edge Delivery Services. Ships an orchestrator plus 12 step skills, plus a standalone signals.json authoring skill.",
```
Replace with:
```json
  "description": "Turn any website into an OF1 generative-search demo on Adobe Edge Delivery Services, or introduce OF1 onto an existing EDS/Stardust site. Ships two orchestrators plus 12 step skills, plus a standalone signals.json authoring skill.",
```

Find:
```json
      "of1-deploy",
      "of1-signals"
```
Replace with:
```json
      "of1-deploy",
      "of1-signals",
      "of1-adopt"
```

- [ ] **Step 2: Add an `of1-adopt` row to README's Skills table**

In `README.md`, find:
```markdown
| `of1-signals` | Standalone (not a pipeline step) — author `signals.json`, the OF1 **preview extension's** own config for simulating how a demo visitor arrived (fake email/ads/LLM referrals) |
```

Add directly after it:
```markdown
| `of1-adopt` | Standalone orchestrator (not part of the `of1-demo` pipeline) — introduce OF1 onto an existing EDS/Stardust site, reusing whatever design tokens/blocks/pages already exist instead of crawling an external domain. Works on both Claude Code and SLICC with no sprinkle/scoop UI. |
```

- [ ] **Step 3: Verify the manifest is valid JSON**

Run:
```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
python3 -c "import json; json.load(open('.claude-plugin/plugin.json'))" && echo "✓ valid JSON"
```
Expected: `✓ valid JSON`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "chore: register of1-adopt in the plugin manifest and README"
```

---

## Verification checklist (run after all tasks complete)

- [ ] **No AuthorKit references remain anywhere in the repo:**
  ```bash
  grep -rn -i "authorkit" skills/ | grep -v "\.git"
  ```
  Expected: no output.

- [ ] **All 14 entrypoint skills referenced in `plugin.json` exist as directories:**
  ```bash
  python3 -c "
  import json
  data = json.load(open('.claude-plugin/plugin.json'))
  import os
  for s in data['entrypoints']['skills']:
      print(('✓' if os.path.isdir(f'skills/{s}') else '✗ MISSING'), s)
  "
  ```
  Expected: every line starts with `✓`.

- [ ] **`of1-adopt` has zero sprinkle/scoop-UI push calls:**
  ```bash
  grep -c "sprinkle_send" skills/of1-adopt/SKILL.md
  ```
  Expected: `0`.
