---
name: of1-demo
description: Orchestrate full demo preparation for any website — user-driven step pipeline via sprinkle UI
user-invocable: true
---

# OF1 Demo — Orchestrator

Lightweight orchestrator that opens the demo pipeline sprinkle and dispatches step skills based on user interactions.

## How It Works

1. The sprinkle (`of1-demo`) shows 13 steps as a pipeline
2. User enters a domain and clicks "Run" on each step
3. Each click fires a lick to the cone with `{action: "run:<step>:<skill>:<domain>"}`
4. The cone spawns a scoop to execute the step skill with appropriate context
5. Steps with review gates pause for user approval (Approve/Revise buttons in sprinkle)
6. After step 5 (Prototype), two tracks run in parallel:
   - **Track A (EDS Site):** Step 6 (Snowflake) → Steps 7 + 8 (Templates + OF1 styling) in parallel
   - **Track B (Config):** Steps 9–12 (Brand, Block guide, Suggestions, CTA) in parallel → Step 13 (Config review)
7. Step 14 (Deploy) requires Track A steps 7 + 8 done AND Track B step 13 approved

## Setup

Open the sprinkle:

```
scoop_scoop({
  name: "of1-demo",
  writablePaths: ["/scoops/of1-demo/", "/shared/sprinkles/of1-demo/"],
  prompt: "You own the sprinkle 'of1-demo'. Copy /workspace/skills/of1-demo/of1-demo.shtml to /shared/sprinkles/of1-demo/of1-demo.shtml, then run: sprinkle open of1-demo. Stay ready for feed_scoop updates."
})
```

## Lick Events

The sprinkle sends licks as a single `action` string with colon-delimited fields.

### `set-domain:<domain>`
User entered the target domain. Store it for all subsequent steps.

### `run:<step>:<skill>:<domain>`
User clicked Run on step N. Parse the step number, skill name, and domain from the colon-delimited string. Spawn a scoop to execute the skill.

**Model selection — ALL step scoops MUST use `claude-opus-4-6`:**

Pass `model: "claude-opus-4-6"` when calling `scoop_scoop()` for every step. No exceptions.

**For step 6 (Snowflake), the scoop MUST additionally be created with write access to the project repo:**
```
scoop_scoop({
  name: "of1-s6",
  model: "claude-opus-4-6",
  writablePaths: ["/scoops/of1-s6/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```
This allows the scoop to write blocks, styles, and content directly into the repo without needing the cone to copy files afterward.

```
feed_scoop("of1-demo-step-N", <system prompt with skill instructions + context>)
```

The system prompt MUST include:
- The domain
- The repo owner, repo name, and local repo path (from `/shared/of1-demo/repo-config.json`)
- How to load the skill:
  - For local skills: `read_file /workspace/skills/{skill-name}/SKILL.md`
  - For plugin skills (steps 4 & 5): instruct the scoop to invoke the Skill tool with `stardust:extract` or `stardust:prototype` — these are NOT local files
- Current working directory context (the project repo)
- Any outputs from previous steps the skill needs
- Instruction to write a completion marker on finish (NOT `sprinkle send` — the step scoop must NOT call sprinkle commands):
  Write output to `/shared/of1-demo/step-N-output.md` and a status file to `/shared/of1-demo/step-N-status.json` with content `{"step":N,"status":"done"}` (or `"review"` or `"failed"`).

**When status is `"review"`, the status JSON MUST include a `deliverable` URL** so the sprinkle renders an open button for the user. Before pushing to the sprinkle, use `serve` to host the reviewable artifact:
```bash
serve --entry <file.html> /path/to/dir
# → returns a chrome-extension://... URL
```
Then include it: `{"step":N,"status":"review","deliverable":"chrome-extension://...","summary":"..."}`.
Review steps without a deliverable URL will show the summary but no open button — always include one.

**After spawning the step scoop, YOU must immediately poll for the status file and push to the sprinkle when it appears.** Use a loop:

```bash
while [ ! -f /shared/of1-demo/step-N-status.json ]; do sleep 5; done
cat /shared/of1-demo/step-N-status.json
```

Then read the file and call `sprinkle send of1-demo '<contents>'` immediately.

Only the of1-demo scoop may call `sprinkle send`. Step scoops write files; the orchestrator reads them and pushes to the sprinkle.

**After step 5 is approved, spawn BOTH tracks in parallel:**

**Track A** — spawn step 6 (Snowflake). When step 6 completes, spawn steps 7 and 8 in parallel.

**Track B** — spawn steps 9, 10, 11, 12 all at once. When all four complete, run step 13 (Config review) inline.

Poll for ALL status files concurrently. As EACH one completes, push its status to the sprinkle immediately — the user should see steps turn green/review one by one.

```bash
# Poll for all active step status files and push each as it arrives
while true; do
  ALL_DONE=true
  for STEP in 6 7 8 9 10 11 12 13; do
    STATUS_FILE="/shared/of1-demo/step-${STEP}-status.json"
    PUSHED_FILE="/shared/of1-demo/step-${STEP}-pushed"
    if [ -f "$STATUS_FILE" ] && [ ! -f "$PUSHED_FILE" ]; then
      sprinkle send of1-demo "$(cat "$STATUS_FILE")"
      touch "$PUSHED_FILE"
    fi
    if [ ! -f "$STATUS_FILE" ]; then
      ALL_DONE=false
    fi
  done
  if [ "$ALL_DONE" = true ]; then break; fi
  sleep 5
done
```

For step 9 (brand + content), the orchestrator must wait for BOTH `step-9-brand-status.json` and `step-9-content-status.json` before pushing the combined step 9 status to the sprinkle.

### `open-deliverable:<step>:<encoded-url>`
The user clicked a single deliverable button. Decode the URL and open it:
```bash
open <decoded-url>
```

### `open-deliverables:<step>:<encoded-json-array>`
The user clicked a multi-deliverable button. Decode the JSON array and open each URL:
```bash
open <url1>
open <url2>
open <url3>
```
No sprinkle update needed for either — just open the file(s).

### `approve:<step>:<domain>`
User approved step N. The sprinkle auto-marks it done. No action needed unless the next step should auto-start.

### `revise:<step>:<domain>`
User wants changes. Ask in chat what they want different, then re-run the step skill with their feedback appended to the prompt.

### `reset`
User reset the pipeline. Clean up any running scoops.

## Step → Skill Mapping

| Step | Name | Skill(s) | Review Gate | Parallel |
|------|------|-----------|-------------|----------|
| 1 | Install dependencies | `of1-setup` | No | No |
| 2 | Branch setup | `of1-branch-setup` | No | No |
| 3 | Discovery | `of1-discovery` | Yes | No |
| 4 | Extraction | `stardust:extract` | Yes | No |
| 5 | Prototype | `stardust:prototype` | Yes | No |
| 6 | Snowflake | `of1-snowflake` | Yes | No |
| 7 | Templates | `of1-template-generation` | Yes | No |
| 8 | OF1 styling | `generative-block-styler` | Yes | No |
| 9 | Brand & content | `brand-voice-extractor` + `content-metadata` | No | Yes |
| 10 | Block guide | `block-guide-builder` | No | Yes |
| 11 | Suggestions | `quick-suggestions` | No | Yes |
| 12 | CTA template | `cta-template-builder` | No | Yes |
| 13 | Config review | (orchestrator-inline) | Yes | No |
| 14 | Deploy | `of1-deploy` | Yes | No |

After step 5 (Prototype), two parallel tracks begin:

**Track A (EDS Site):** Step 6 (Snowflake) runs first, then steps 7 (Templates) and 8 (OF1 styling) run in parallel — both depend on step 6.

**Track B (Config):** Steps 9–12 (Brand & content, Block guide, Suggestions, CTA template) all run in parallel immediately after step 5. Step 13 (Config review) requires all of 9–12 to be done.

**Step 14 (Deploy)** requires steps 7 + 8 (Track A) done AND step 13 (Track B) approved.

## Step 2 — Branch Setup

This step creates a domain-specific branch on the shared `aem-growth-adoption/of1-demo` repo and sets up the output directory.

The repo is already cloned at `/workspace/of1-demo`. The step:
1. Fetches latest from origin
2. Creates a branch named after the domain (without TLD, e.g., `bmwusa` for `bmwusa.com`)
3. Creates `output/{DOMAIN}/` directory for deliverables
4. Verifies DA mount at `/mnt/da`

The step outputs `/shared/of1-demo/repo-config.json` which all subsequent steps use:
```json
{
  "owner": "aem-growth-adoption",
  "repo": "of1-demo",
  "branch": "bmwusa",
  "repoUrl": "https://github.com/aem-growth-adoption/of1-demo",
  "previewUrl": "https://bmwusa--of1-demo--aem-growth-adoption.aem.page/",
  "daSource": "da://aem-growth-adoption/of1-demo",
  "repoDir": "/workspace/of1-demo",
  "domain": "bmwusa.com"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to find the git repo (`repoDir`)
- Which branch to work on (`branch`)
- The DA mount source (`daSource`)
- The EDS preview URL (`previewUrl`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs

## Screenshot Diff Loop (Steps 5 & 6)

Both the Prototype step (5) and the Snowflake step (6) MUST run a screenshot-based comparison loop before marking the step as review. This ensures visual fidelity.

### How it works

For each page, iterate up to **3 times**:

1. **Screenshot the reference** — the live site (Step 5) or the prototype (Step 6)
2. **Screenshot the output** — the prototype HTML (Step 5) or the EDS preview URL (Step 6)
3. **Compare using LLM vision** — open both screenshots and analyze differences
4. **If significant differences found:**
   - Identify which specific section/block is wrong
   - Fix only that section (targeted CSS/HTML fix, not full regeneration)
   - Re-screenshot and compare again
5. **If no significant differences** → PASS, move to next page
6. **After 3 iterations** → accept result, note remaining gaps as "known differences"

### What counts as "significant"

Fix these:
- Missing or broken images
- Layout differences (grid vs stack, wrong column count, missing columns)
- Missing entire sections or blocks
- Wrong colors or backgrounds
- Nav/footer not rendering or visually broken
- Obvious spacing issues (doubled padding, collapsed margins)

Ignore these:
- Minor font rendering differences (web font vs fallback anti-aliasing)
- Sub-pixel spacing (1-2px differences)
- Hover/animation states
- Cookie banners or overlays on the live page
- Dynamic content that changes between loads (carousel position, time-based promos)

### Step 5 specifics
- Reference = live site screenshot
- Output = prototype HTML served locally (`file://...`)
- Fix = edit the prototype HTML/CSS directly

### Step 6 specifics
- Reference = prototype screenshot (from Step 5 output)
- Output = EDS preview URL screenshot
- Fix = edit block CSS/JS, content HTML, re-push + re-preview

## CRITICAL: Pixel-Perfect Copy — No Redesign, No Placeholders

The OF1 demo pipeline produces a **pixel-perfect reproduction** of the existing site — NOT a redesign. The goal is to faithfully replicate the site's visual appearance so the OF1 personalization engine can run on top of it.

### What this means in practice:

**Do NOT:**
- Run `stardust direct`, author new `DESIGN.md`/`PRODUCT.md` target specs, or change the visual direction
- Use placeholder images, colored boxes, gradient divs, or CSS-drawn shapes in place of real images
- Use emoji, system icons, or generic SVGs in place of the site's real icons
- Invent, simplify, or redesign any visual element

**Do:**
- Use real images sourced directly from the live site via `playwright-cli eval` to extract actual `<img src>` URLs
- Use the site's real SVG icons — extract them from the live DOM (`document.querySelectorAll('img[src*=".svg"]')`, inline SVGs, or icon font codepoints)
- Match typography, colors, spacing, and layout exactly as they appear on the live site
- Use `format=png` or `format=jpg` (not `format=webply`) when constructing image URLs to ensure browser compatibility
- When the site uses private fonts (e.g. Sentinel, Gotham Narrow), use the closest system-font fallback AND note the substitution — do not invent a different typeface

**Image extraction pattern:**
```javascript
// Run in playwright-cli eval against the live page tab
Array.from(document.querySelectorAll('img'))
  .filter(i => i.naturalWidth > 200 && i.src.includes('sitedomain'))
  .map(i => ({ src: i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight }))
```

**Icon extraction pattern:**
```javascript
// Get all SVG icon URLs
Array.from(document.querySelectorAll('img')).filter(i => i.src.includes('.svg'))
  .map(i => i.src)
// Get inline SVGs near feature/icon areas
Array.from(document.querySelectorAll('[class*=icon] svg, [class*=feature] svg'))
  .map(s => s.outerHTML)
```

The prototype is considered acceptable only when a side-by-side comparison with a screenshot of the live page shows no obvious visual differences in layout, imagery, iconography, or brand identity.

## Scoop Naming

Name step scoops: `of1-s1`, `of1-s2`, ..., `of1-s13`. This keeps them short and identifiable.

## Context Passing Between Steps

Each step scoop needs context from prior steps. Key dependencies:

- **Step 1 (Install dependencies)** needs: nothing (can run without domain)
- **Step 2 (Branch setup)** needs: domain. Creates branch on `aem-growth-adoption/of1-demo` and outputs `repo-config.json`.
- **Step 3 (Discovery)** needs: domain
- **Step 4 (Extraction)** needs: domain, Discovery output (demo focus, narrative, audience). The scoop MUST invoke the `stardust:extract` skill (not a local skill — it's from the stardust plugin). If `PRODUCT.md` does not exist at project root, the scoop MUST run `/impeccable:teach` first using the Discovery answers as context to generate it. Then proceed with extraction.
  
  **CRITICAL — Deliverable post-processing for Step 4:**
  The `stardust:extract` skill generates `stardust/current/brand-review.html` with relative image paths (`assets/screenshots/...`) and may produce a truncated brand logo SVG. When copying to `deliverables/brand-review.html`, the scoop MUST:
  1. Copy `stardust/current/assets/screenshots/` to `deliverables/assets/screenshots/`
  2. Fix image paths in the HTML to use `/deliverables/assets/screenshots/` (absolute from repo root) so they resolve on the EDS preview URL
  3. Verify the brand logo SVG is complete — extract the full logo from the live site using `playwright-cli eval` and replace any truncated SVG path data
  4. Verify all images load by checking the paths exist in the committed repo
- **Step 5 (Prototype)** needs: domain, extraction outputs from step 4. The scoop MUST invoke the `stardust:prototype` skill (from the stardust plugin). The scoop prompt MUST instruct the scoop to:
  1. Extract real image URLs from the live site using `playwright-cli eval` before writing any HTML
  2. Extract real SVG icons from the live DOM (not emoji, not generic icons)
  3. Use `format=png` or `format=jpg` (not `format=webply`) for any CDN image URLs
  4. Use the real brand SVG logo (extracted in step 4) in the nav — never substitute with text
  5. Never use placeholder divs, colored boxes, or gradient shapes in place of real images
  6. **Run the Screenshot Diff Loop** (max 3 iterations per page) — see below
- **Step 6 (Snowflake)** needs: domain, prototypes from step 5, repo-config.json
- **Step 7 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Step 7 (Templates)** needs: domain, design tokens from step 4 (`DESIGN.json`), demo narrative from step 3, snowflake output from step 6
- **Step 8 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Steps 9–12 (Track B)** need: domain, `stardust/` data from step 4. They do NOT depend on the snowflake — they can start immediately after step 5.
- **Step 13 (Config review)** needs: all `of1/config/` files from steps 9–12 — orchestrator generates review page inline
- **Step 14 (Deploy)** needs: steps 7 + 8 done (Track A) AND step 13 approved (Track B), plus domain, all config files, repo-config.json

When spawning a step scoop, read the relevant prior outputs and include key info in the prompt (or instruct the scoop to read specific files).

## Step 13 — Config Review (orchestrator-inline)

Once all parallel steps (9–12) are done, the orchestrator runs step 13 **inline** (no scoop needed). This is a review gate where the user validates all the config that will be deployed.

### What to generate

Build `deliverables/config-review.html` in the repo — a self-contained HTML page (OF1 dark theme, inline styles) showing:

1. **Block Guide vs Block Catalog** — list the blocks selected for generation (from `block-guide.json`) and highlight that they are a subset of the full block catalog. Link to the block catalog preview URL for comparison.
2. **Products** — grid of products with thumbnail images, names, categories, and keyword counts (from `products.json`). Flag any products with missing images.
3. **Brand Voice** — personality, tone, vocabulary, avoid words (from `brand-voice.json`)
4. **Personas** — cards for each persona with keywords (from `personas.json`)
5. **Suggestions** — all suggestion chips with their query text (from `suggestions.json`)
6. **Use Cases** — list with keywords (from `use-cases.json`)
7. **CTA Template** — rendered preview of the CTA template with fallback content filled in (from `cta-template.json`)

### How to run

```bash
# Read repo-config.json to get owner/repo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')

cd "$REPO_DIR"
# Generate the review page from of1/config/ JSON files
mkdir -p deliverables
# ... write config-review.html ...
git add deliverables/config-review.html
git commit -m "docs: config review page for {DOMAIN}"
git push origin main
```

Then push to sprinkle:
```bash
sprinkle send of1-demo '{"step":12,"status":"review","deliverable":"https://main--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: block guide (subset of catalog), products, brand voice, CTA, suggestions."}'
```

### What the user reviews

- Are the right blocks selected? (compare against block catalog — the guide should be a subset)
- Do all products have images? Are descriptions rich enough?
- Is the brand voice accurate? Any wrong vocabulary or missing avoid-words?
- Do suggestion chips cover enough intents?
- Are persona keywords realistic search terms?

The user approves or requests revisions. On revise, ask what needs changing and re-run the relevant parallel step.

## Iteration

If a step fails or the user requests revisions:
1. The sprinkle shows Retry/Revise button
2. User clicks it → lick with `run:<step>:<skill>:<domain>` (retry) or `revise:<step>:<domain>` (needs feedback)
3. Re-spawn the step scoop with the same prompt + any user feedback
4. The scoop can read prior outputs and iterate on them

## Completion

After step 14 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.

## Shell Environment Pitfalls (SLICC-specific)

These issues cost time in previous runs. Avoid them:

1. **`set -o pipefail` is not supported** — don't run scripts that use it (`deploy-tenant.sh`). Execute commands manually or use the shell loop in the deploy skill.

2. **Python in heredocs** — always quote the delimiter (`python3 << 'EOF'`). Unquoted heredocs mangle indentation and variables.

3. **Config sync uses EDS** — configs are committed to `of1/config/` in git, then synced via `POST /api/tenants/{id}/sync`. The tenant ID is `main--{repo}--{owner}` format.

4. **Step 14 (Deploy)** — just `git push` + one POST to `/api/tenants/{id}/sync`. Can be done inline by the cone (no scoop needed).

5. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else (e.g. "approved", "running", "complete") corrupts the UI state.

6. **EDS buttons** — `<strong><a>` = primary, `<em><a>` = secondary. The wrapper (`strong`/`em`) goes OUTSIDE the anchor, not inside.

7. **DA preview auth** — needs BOTH `Authorization: Bearer <token>` AND `x-content-source-authorization: Bearer <token>` headers.

8. **`--data-binary @file` breaks in scoops** — curl's `@path` expansion can fail, storing the literal string `@/workspace/...` instead of file contents. Always pipe via stdin: `cat file | curl ... --data-binary @-`.

9. **Deliverable HTML with images** — When HTML deliverables reference images (screenshots, logos), paths must be absolute from the repo root (e.g., `/deliverables/assets/screenshots/home.png`) so they resolve on the EDS preview URL. Relative paths like `assets/screenshots/...` break because the HTML is served at `/deliverables/brand-review.html` while images are at `/deliverables/assets/screenshots/`. Always commit the image assets alongside the HTML.

10. **Logo SVG extraction** — The brand logo extracted via Playwright can be truncated if it comes from a `<symbol>` sprite. Always extract the full `innerHTML` of the symbol element and wrap it in a standalone `<svg>` with the correct `viewBox`. Verify the rendered SVG shows the complete wordmark before committing.

11. **Brand logo in prototypes** — Prototypes MUST use the real brand SVG logo (extracted in Step 4 and saved to `stardust/current/assets/logo.svg` or inline in `_brand-extraction.json`). Never substitute with text or a placeholder. The logo SVG should be inlined directly in the nav HTML of every prototype page.

12. **DA strips images from programmatic content** — DA's HTML→MD→HTML pipeline removes ALL `<img>`, `<picture>`, and `<svg>` elements from content uploaded via PUT. The solution: store image URLs as plain text in block cells, and have block JS create `<img>` elements at runtime. Every block that handles images needs a `convertTextToImages(block)` helper. See `of1-snowflake` skill § "EDS Content Authoring Constraints" for the full pattern.

13. **Full-bleed blocks need wrapper override** — EDS wraps sections in `.{block}-wrapper` with `max-width: 1440px`. Hero, banners, and other full-width blocks MUST have `.{block}-wrapper { max-width: 100% !important; padding: 0 !important; }` in `styles/styles.css`.

14. **Brand logo in EDS header** — DA strips SVGs from nav content. Commit logo to `/icons/logo.svg` and have `header.js` fetch + inject it into the brand link at runtime. Never rely on inline SVG in DA content.

15. **Static file URLs need `.html` extension** — EDS serves git-committed static HTML files at their exact path including the extension. A file at `deliverables/config-review.html` is served at `/deliverables/config-review.html` — NOT at `/deliverables/config-review` (that 404s). Always include the `.html` extension in deliverable URLs sent to the sprinkle. DA-authored content pages (like `/home`, `/block-catalog`) do NOT need the extension.
