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
6. Steps 8–11 (Brand & content, Block guide, Suggestions, CTA template) can run in parallel after step 7 (OF1 styling) completes

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
- Path to the relevant skill file to read: `read_file /workspace/skills/{skill-name}/SKILL.md`
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

**For parallel steps (8–11):** Spawn all parallel scoops at once, then poll for ALL their status files concurrently. As EACH one completes, push its status to the sprinkle immediately — do NOT wait for all parallel steps to finish before updating the UI. The user should see steps turn green/review one by one as they complete.

```bash
# Poll for all parallel status files and push each as it arrives
while true; do
  ALL_DONE=true
  for STEP in 8 9 10 11; do
    STATUS_FILE="/shared/of1-demo/step-${STEP}-status.json"
    PUSHED_FILE="/shared/of1-demo/step-${STEP}-pushed"
    if [ -f "$STATUS_FILE" ] && [ ! -f "$PUSHED_FILE" ]; then
      # Push immediately when a step finishes
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

For step 8 (brand + content), the orchestrator must wait for BOTH `step-8-brand-status.json` and `step-8-content-status.json` before pushing the combined step 8 status to the sprinkle.

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
| 2 | Setup AEM/DA repo | `of1-repo-setup` | Yes | No |
| 3 | Discovery | `of1-discovery` | Yes | No |
| 4 | Extraction | `extract` | Yes | No |
| 5 | Prototype | `prototype` | Yes | No |
| 6 | Snowflake | `of1-snowflake` | Yes | No |
| 7 | OF1 styling | `generative-block-styler` | Yes | No |
| 8 | Brand & content | `brand-voice-extractor` + `content-metadata` | No | Yes |
| 9 | Block guide | `block-guide-builder` | No | Yes |
| 10 | Suggestions | `quick-suggestions` | No | Yes |
| 11 | CTA template | `cta-template-builder` | No | Yes |
| 12 | Config review | (orchestrator-inline) | Yes | No |
| 13 | Deploy | `of1-deploy` | Yes | No |

Steps 8–11 can run in parallel once step 7 (OF1 styling) is done. Step 12 (Config review) requires all parallel steps to be done — the orchestrator generates a review page showing the block guide (as a subset of the block catalog), brand voice, products, suggestions, and CTA template. Step 13 (Deploy) requires step 12 approval.

## Step 2 — Setup AEM/DA Repo

**This step requires user interaction BEFORE running.** The orchestrator (cone) MUST ask the user:
1. Do you have an existing repo, or should I create a new one?
2. If creating: What GitHub owner/org? (e.g., `QuentinVecchio`, `my-company`)
3. If creating: What repo name? (e.g., `patagonia-eu-demo`)

Do NOT assume defaults for org or repo name — always ask.

Once the user provides answers, proceed with the appropriate flow:

### Flow A: User provides an existing EDS repo
The user gives a GitHub URL. Clone it, mount DA, and verify preview works.

### Flow B: Create a new repo from the OF1 boilerplate
1. Create a new repo from `https://github.com/aem-growth-adoption/of1-boilerplate` using the GitHub template API
2. Ask the user to install AEM Code Sync GitHub App (status = "review" with link to installation page)
3. After user confirms/approves, verify the preview URL works
4. Mount DA and create initial content if needed
5. Verify end-to-end: DA content → preview URL renders

The step outputs `/shared/of1-demo/repo-config.json` which all subsequent steps use to know where the repo lives:
```json
{
  "owner": "myorg",
  "repo": "mysite-demo",
  "repoUrl": "https://github.com/myorg/mysite-demo",
  "previewUrl": "https://main--mysite-demo--myorg.aem.page/",
  "daSource": "da://myorg/mysite-demo",
  "repoDir": "/workspace/mysite-demo",
  "domain": "example.com"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to clone/find the git repo (`repoDir`)
- The DA mount source (`daSource`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs

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
- **Step 2 (Setup AEM/DA repo)** needs: domain (optional), user input about repo choice. Outputs `repo-config.json`.
- **Step 3 (Discovery)** needs: domain
- **Step 4 (Extraction)** needs: domain, Discovery output (demo focus, narrative, audience). If `PRODUCT.md` does not exist at project root, the scoop MUST run `/impeccable:teach` first using the Discovery answers as context to generate it. Then proceed with extraction.
- **Step 5 (Prototype)** needs: domain, extraction outputs from step 4. The scoop prompt MUST instruct the scoop to:
  1. Extract real image URLs from the live site using `playwright-cli eval` before writing any HTML
  2. Extract real SVG icons from the live DOM (not emoji, not generic icons)
  3. Use `format=png` or `format=jpg` (not `format=webply`) for any CDN image URLs
  4. Take a screenshot of each live page and compare against the prototype before marking done
  5. Never use placeholder divs, colored boxes, or gradient shapes in place of real images
- **Step 6 (Snowflake)** needs: domain, prototypes from step 5, repo-config.json
- **Step 7 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Steps 8–11** need: domain, block names from step 6, `stardust/` data
- **Step 12 (Config review)** needs: all `output/{domain}/` files from steps 8–11 — orchestrator generates review page inline
- **Step 13 (Deploy)** needs: step 12 approved, domain, all `output/{domain}/` files, repo-config.json

When spawning a step scoop, read the relevant prior outputs and include key info in the prompt (or instruct the scoop to read specific files).

## Step 12 — Config Review (orchestrator-inline)

Once all parallel steps (8–11) are done, the orchestrator runs step 12 **inline** (no scoop needed). This is a review gate where the user validates all the config that will be deployed.

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
# Generate the review page from output/{DOMAIN}/ JSON files
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

After step 13 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.

## Shell Environment Pitfalls (SLICC-specific)

These issues cost time in previous runs. Avoid them:

1. **`set -o pipefail` is not supported** — don't run scripts that use it (`deploy-tenant.sh`). Execute commands manually or use the shell loop in the deploy skill.

2. **Python in heredocs** — always quote the delimiter (`python3 << 'EOF'`). Unquoted heredocs mangle indentation and variables.

3. **Large curl payloads fail on Cloudflare Workers (>~50KB)** — split into individual PUT requests per config key. See `of1-deploy` skill for the pattern.

4. **Step 13 (Deploy) should be done inline by the cone** — it's just a few curl calls and takes <2 minutes. Don't delegate to a scoop; the overhead of spawning + polling exceeds the actual work.

5. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else (e.g. "approved", "running", "complete") corrupts the UI state.

6. **EDS buttons** — `<strong><a>` = primary, `<em><a>` = secondary. The wrapper (`strong`/`em`) goes OUTSIDE the anchor, not inside.

7. **DA preview auth** — needs BOTH `Authorization: Bearer <token>` AND `x-content-source-authorization: Bearer <token>` headers.

8. **`--data-binary @file` breaks in scoops** — curl's `@path` expansion can fail, storing the literal string `@/workspace/...` instead of file contents. Always pipe via stdin: `cat file | curl ... --data-binary @-`.
