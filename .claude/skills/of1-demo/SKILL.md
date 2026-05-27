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
   - **Track B (Config):** Steps 9–11 (Brand & content, Suggestions, CTA) in parallel → Step 12 (Config review)
7. Step 13 (Deploy) requires Track A steps 7 + 8 done AND Track B step 12 approved

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
- The domain and branch name
- The repo owner, repo name, and local repo path (from `/shared/of1-demo/repo-config.json`)
- **DA auth instructions** — ALWAYS include this block in every scoop prompt that touches DA:
  ```
  ## DA Auth (CRITICAL — do not deviate)
  - Write DA content via mount: cp file /mnt/da/{branch}/page.html
  - Get IMS token: DA_TOKEN=$(oauth-token adobe)
  - Trigger preview: curl -X POST -H "Authorization: Bearer $DA_TOKEN" -H "x-content-source-authorization: Bearer $DA_TOKEN" https://admin.hlx.page/preview/...
  - DO NOT use curl against admin.da.live (blocked)
  - DO NOT use npx/da-auth-helper (doesn't exist)
  - DO NOT look for ~/.aem/da-token.json (doesn't exist)
  - Content path: /mnt/da/{branch}/page.html (NOT /mnt/da/{repo}/page.html)
  ```
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

## Parallelism — CRITICAL for Speed

The pipeline has TWO parallel tracks that MUST run concurrently. **Do NOT serialize steps that can run in parallel.**

### When to spawn what:

| Trigger | Spawn immediately |
|---------|-------------------|
| Step 5 (Prototype) approved | **Track A:** Step 6 (Snowflake) AND **Track B:** Steps 9, 10, 11 (all three at once) |
| Step 6 (Snowflake) approved | Steps 7 AND 8 in parallel (both depend on step 6 only) |
| Steps 9-11 ALL complete | Step 12 (Config review) — run inline by the cone |
| Steps 7 + 8 done AND Step 12 approved | Step 13 (Deploy) |

### Dependency graph:
```
Steps 1→2→3→4→5 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
         ↓               ↓
    Step 6          Steps 9,10,11
    (Snowflake)     (all parallel)
         ↓               ↓
    Steps 7+8       Step 12
    (parallel)      (config review)
         ↓               ↓
         └───────┬───────┘
                 ↓
            Step 13 (Deploy)
```

### Key rules:
1. **Track B does NOT wait for Step 6** — it starts immediately after Step 5 is approved
2. **Steps 7 and 8 run in parallel** — don't wait for one to finish before starting the other
3. **Steps 9, 10, 11 ALL run at once** — spawn all 3 scoops simultaneously
4. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle

### Polling pattern for parallel steps:

```bash
# Poll for all active step status files and push each as it arrives
while true; do
  ALL_DONE=true
  for STEP in 6 7 8 9 10 11; do
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

### Handling scoop completion without status file:

Sometimes a scoop completes its work but forgets to write the status file (it shows "ready" in list_scoops but no `/shared/of1-demo/step-N-status.json` exists). When this happens:
1. Check if the scoop's output files exist (e.g., `ls /workspace/of1-demo/of1/config/`)
2. If the work IS done, write the status file manually
3. Push to sprinkle

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

| Step | Name | Skill(s) | Review | Track | Depends on |
|------|------|-----------|--------|-------|------------|
| 1 | Install dependencies | `of1-setup` | No | — | nothing |
| 2 | Branch setup | `of1-branch-setup` | No | — | step 1 |
| 3 | Discovery | `of1-discovery` | Yes | — | step 2 |
| 4 | Extraction | `of1-extraction` | Yes | — | step 3 |
| 5 | Prototype | `of1-prototype` | Yes | — | step 4 |
| 6 | Snowflake | `of1-snowflake` | Yes | A | step 5 |
| 7 | Templates | `of1-template-generation` | Yes | A | step 6 |
| 8 | OF1 styling | `generative-block-styler` | Yes | A | step 6 |
| 9 | Brand & content | `brand-voice-extractor` + `content-metadata` | No | B | step 5 |
| 10 | Suggestions | `quick-suggestions` | No | B | step 5 |
| 11 | CTA template | `cta-template-builder` | No | B | step 5 |
| 12 | Config review | (orchestrator-inline) | Yes | B | steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Yes | — | steps 7+8+12 |

### Track Summary

**Track A (EDS Site):** Step 6 → Steps 7 + 8 (parallel after step 6 approved)

**Track B (Config):** Steps 9 + 10 + 11 (ALL parallel, start immediately after step 5) → Step 12 (Config review)

**Both tracks start after Step 5 is approved.** Track B does NOT wait for Step 6.

**Step 13 (Deploy)** requires Track A (steps 7+8 done) AND Track B (step 12 approved).

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
- **Step 4 (Extraction)** needs: domain, Discovery output (demo focus, narrative, audience). The scoop reads `/workspace/skills/of1-extraction/SKILL.md` which has the complete recipe. It creates PRODUCT.md, extracts design tokens via playwright, takes screenshots, extracts logo, and builds brand-review.html. No external plugin needed.
- **Step 5 (Prototype)** needs: domain, extraction outputs from step 4 (design-tokens.json, logo.svg, screenshots). The scoop reads `/workspace/skills/of1-prototype/SKILL.md` which has the complete recipe. It batch-extracts real images from all pages, writes pixel-perfect HTML prototypes, runs screenshot diff loop (max 2 iterations), and commits to deliverables/.
- **Step 6 (Snowflake)** needs: domain, prototypes from step 5, repo-config.json
- **Step 7 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Step 7 (Templates)** needs: domain, design tokens from step 4 (`DESIGN.json`), demo narrative from step 3, snowflake output from step 6
- **Step 8 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Steps 9–12 (Track B)** need: domain, `stardust/` data from step 4. They do NOT depend on the snowflake — they can start immediately after step 5.
- **Step 12 (Config review)** needs: all `of1/config/` files from steps 9-11 — orchestrator generates review page inline
- **Step 13 (Deploy)** needs: steps 7 + 8 done (Track A) AND step 12 approved (Track B), plus domain, all config files, repo-config.json

When spawning a step scoop, read the relevant prior outputs and include key info in the prompt (or instruct the scoop to read specific files).

## Step 12 — Config Review (orchestrator-inline)

Once all parallel steps (9–11) are done, the orchestrator runs step 12 **inline** (no scoop needed). This is a review gate where the user validates all the config that will be deployed.

### What it shows

The config-review.html page displays:

1. **Products** — expandable cards with thumbnail images, names, categories, prices, image gallery, features, keywords
2. **Brand Voice** — personality, tone, vocabulary, avoid words
3. **Personas** — cards for each persona with keywords
4. **Use Cases** — list with descriptions and keywords
5. **Features** — chip list of all features
6. **Suggestions** — title/subtitle/placeholder + all suggestion chips with query text
7. **CTA Template** — JSON preview of the template

### How to run

Uses a **pre-built HTML template** + Python fill script. No LLM generation needed — just run the script:

```bash
# Read repo-config.json to get owner/repo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

# IMPORTANT: Must cd into repo dir first (VFS constraint)
cd "$REPO_DIR"

# Run the fill script — reads of1/config/*.json, writes deliverables/config-review.html
python3 /workspace/of1-demo-skills/.claude/skills/of1-demo/fill-config-review.py . "$DOMAIN"

# Commit and push
git add deliverables/config-review.html
git commit -m "docs: config review page for ${DOMAIN}"
git push origin "$BRANCH"
```

Then push to sprinkle:
```bash
sprinkle send of1-demo '{"step":12,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: products, brand voice, personas, CTA, suggestions."}'
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

After step 13 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.

## Shell Environment Pitfalls (SLICC-specific)

These issues cost time in previous runs. Avoid them:

1. **`set -o pipefail` is not supported** — don't run scripts that use it (`deploy-tenant.sh`). Execute commands manually or use the shell loop in the deploy skill.

2. **Python in heredocs** — always quote the delimiter (`python3 << 'EOF'`). Unquoted heredocs mangle indentation and variables.

3. **Config sync uses EDS** — configs are committed to `of1/config/` in git, then synced via `POST /api/tenants/{id}/sync`. The tenant ID is `{branch}--{repo}--{owner}` format.

4. **Step 13 (Deploy)** — just `git push` + one POST to `/api/tenants/{id}/sync`. Can be done inline by the cone (no scoop needed).

5. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else (e.g. "approved", "running", "complete") corrupts the UI state.

6. **EDS buttons** — `<strong><a>` = primary, `<em><a>` = secondary. The wrapper (`strong`/`em`) goes OUTSIDE the anchor, not inside.

7. **DA preview auth** — use `oauth-token adobe` to get the IMS token. For preview triggers, pass BOTH `Authorization: Bearer <token>` AND `x-content-source-authorization: Bearer <token>` headers to `admin.hlx.page`.

8. **`--data-binary @file` breaks in scoops** — curl's `@path` expansion can fail, storing the literal string `@/workspace/...` instead of file contents. Always pipe via stdin: `cat file | curl ... --data-binary @-`.

9. **Deliverable HTML with images** — When HTML deliverables reference images (screenshots, logos), paths must be absolute from the repo root (e.g., `/deliverables/assets/screenshots/home.png`) so they resolve on the EDS preview URL. Relative paths like `assets/screenshots/...` break because the HTML is served at `/deliverables/brand-review.html` while images are at `/deliverables/assets/screenshots/`. Always commit the image assets alongside the HTML.

10. **Logo SVG extraction** — The brand logo extracted via Playwright can be truncated if it comes from a `<symbol>` sprite. Always extract the full `innerHTML` of the symbol element and wrap it in a standalone `<svg>` with the correct `viewBox`. Verify the rendered SVG shows the complete wordmark before committing.

11. **Brand logo in prototypes** — Prototypes MUST use the real brand SVG logo (extracted in Step 4 and saved to `stardust/current/assets/logo.svg` or inline in `_brand-extraction.json`). Never substitute with text or a placeholder. The logo SVG should be inlined directly in the nav HTML of every prototype page.

12. **DA strips images from programmatic content** — DA's HTML→MD→HTML pipeline removes ALL `<img>`, `<picture>`, and `<svg>` elements from content uploaded via PUT. The solution: store image URLs as plain text in block cells, and have block JS create `<img>` elements at runtime. Every block that handles images needs a `convertTextToImages(block)` helper. See `of1-snowflake` skill § "EDS Content Authoring Constraints" for the full pattern.

13. **Full-bleed blocks need wrapper override** — EDS wraps sections in `.{block}-wrapper` with `max-width: 1440px`. Hero, banners, and other full-width blocks MUST have `.{block}-wrapper { max-width: 100% !important; padding: 0 !important; }` in `styles/styles.css`.

14. **Brand logo in EDS header** — DA strips SVGs from nav content. Commit logo to `/icons/logo.svg` and have `header.js` fetch + inject it into the brand link at runtime. Never rely on inline SVG in DA content.

15. **Static file URLs need `.html` extension** — EDS serves git-committed static HTML files at their exact path including the extension. A file at `deliverables/config-review.html` is served at `/deliverables/config-review.html` — NOT at `/deliverables/config-review` (that 404s). Always include the `.html` extension in deliverable URLs sent to the sprinkle. DA-authored content pages (like `/home`, `/block-catalog`) do NOT need the extension.

## DA Authentication & Content Upload (SLICC-specific)

**This is the #1 time waster in previous runs. Follow these rules exactly:**

### Getting the IMS token
```bash
DA_TOKEN=$(oauth-token adobe)
```
That's it. No npx, no da-auth-helper, no browser flow, no manual paste. Works instantly.

### Writing DA content — USE THE MOUNT, NOT curl

The DA mount at `/mnt/da/` handles auth automatically. It is mounted at the REPO root level (`da://aem-growth-adoption/of1-demo`).

**Path structure:**
```
/mnt/da/                    ← repo root (da://aem-growth-adoption/of1-demo)
/mnt/da/{branch}/           ← content subfolder for this demo (e.g., /mnt/da/frescopa/)
/mnt/da/{branch}/page.html  ← a DA content page
```

**To upload a page:**
```bash
cp /path/to/content.html /mnt/da/${BRANCH}/page-name.html
```

**DO NOT:**
- Use `curl` against `admin.da.live` — it's blocked by the SLICC secret proxy
- Use `npx da-auth-helper` — it doesn't work in this environment
- Try to extract tokens from `~/.aem/da-token.json` — it doesn't exist
- Spend time exploring auth options — the mount is the answer

### Triggering preview — USE admin.hlx.page

`admin.hlx.page` IS in the allowed secret domains. Use it for preview triggers:

```bash
DA_TOKEN=$(oauth-token adobe)
curl -s -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${CONTENT_PREFIX}/${PAGE_SLUG}"
```

### Content URL pattern

The of1-demo repo uses per-demo subfolders. Content URLs include the branch as a PATH prefix:
```
https://{branch}--of1-demo--aem-growth-adoption.aem.page/{branch}/{page}
                                                          ^^^^^^^^
                                                          content prefix (= branch name)
```

Example: `https://frescopa--of1-demo--aem-growth-adoption.aem.page/frescopa/prototype-home`

### Summary of allowed domains for curl with oauth.adobe.token

| Domain | Allowed | Use for |
|--------|---------|---------|
| `admin.hlx.page` | ✅ Yes | Preview/publish triggers |
| `content.da.live` | ✅ Yes | (read-only content delivery) |
| `admin.da.live` | ❌ No | Use mount instead |
| `*.adobelogin.com` | ✅ Yes | (IMS auth, handled by oauth-token) |
