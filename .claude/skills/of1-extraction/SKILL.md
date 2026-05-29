---
name: of1-extraction
description: Extract design tokens, brand identity, and page structure from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Extraction

Extract design tokens, typography, colors, logo, page structure, and screenshots from the target website by invoking the `stardust:extract` plugin, then commit deliverables for EDS hosting.

## ⚡ Speed Priority — Target: 5 minutes

- Invoke `stardust:extract` to do the heavy lifting — do NOT reimplement extraction logic
- ONE git commit + push at the end

---

## Inputs

- `DOMAIN`: Target domain (e.g., `frescopa.coffee`)
- Discovery output from Step 3 (demo focus, persona, key pages)
- Repo config from `/shared/of1-demo/repo-config.json`

## Process

### Step 1: Read repo config

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
```

### Step 2: Invoke stardust:extract

Use the Skill tool to invoke `stardust:extract` with the target URL. This crawls the site and produces:

- `stardust/current/PRODUCT.md` — brand context
- `stardust/current/DESIGN.md` — design direction
- `stardust/current/DESIGN.json` — design tokens (colors, typography, spacing, shapes)
- `stardust/current/assets/logo.svg` — brand logo
- `stardust/current/assets/screenshots/*.png` — full-page screenshots
- `stardust/current/brand-review.html` — visual reference page
- `stardust/state.json` — extraction state

Invoke with the key pages identified in discovery (typically homepage + 2-3 category/product pages):

```
Skill: stardust:extract
Args: https://{DOMAIN} --cap 5
```

Wait for extraction to complete. It will write all outputs under `stardust/current/`.

### Step 3: Verify extraction outputs

```bash
cd "$REPO_DIR"
ls stardust/current/DESIGN.json && echo "Design tokens OK"
ls stardust/current/DESIGN.md && echo "Design doc OK"
ls stardust/current/assets/logo.svg && echo "Logo OK"
ls stardust/current/assets/screenshots/*.png && echo "Screenshots OK"
ls stardust/current/brand-review.html && echo "Brand review OK"
```

If any critical file is missing, re-run extraction with `--refresh` for the failing page.

### Step 4: Generate brand review page (USE THE TOOL)

**⚡ FAST PATH — Use `fill-brand-review.py` to generate the review page automatically:**

```bash
cd "$REPO_DIR"

# Generate brand review from DESIGN.json + screenshots + logo (takes <1 second)
python3 /workspace/skills/of1-extraction/assets/fill-brand-review.py . "$DOMAIN"
```

This reads `stardust/current/DESIGN.json`, finds screenshots and logo, and writes `deliverables/brand-review.html` with correct absolute paths. No need to hand-write HTML.

**Only generate the brand-review.html manually if the tool doesn't produce adequate output.**

If the tool is unavailable, fall back to:
```bash
mkdir -p deliverables/assets/screenshots
cp stardust/current/brand-review.html deliverables/brand-review.html
cp stardust/current/assets/screenshots/*.png deliverables/assets/screenshots/
sed -i '' 's|assets/screenshots/|/deliverables/assets/screenshots/|g' deliverables/brand-review.html
```

### Step 5: Commit and push (ONE operation)

```bash
cd "$REPO_DIR"
git add PRODUCT.md stardust/ deliverables/
git commit -m "feat: extraction - design tokens and brand identity for ${DOMAIN}"
git push origin ${BRANCH}
```

---

## ⚠️ .gitignore Note

The `stardust/` directory may be in `.gitignore`. If `git add stardust/` shows nothing:
```bash
git add -f stardust/current/DESIGN.json stardust/current/DESIGN.md stardust/current/assets/
```

---

## Expected Output Structure

```
{REPO_DIR}/
├── PRODUCT.md                              ← Brand context (from stardust:extract)
├── stardust/
│   ├── state.json                          ← Extraction state
│   └── current/
│       ├── DESIGN.md                       ← Design direction
│       ├── DESIGN.json                     ← Colors, typography, spacing, shapes
│       ├── brand-review.html               ← Visual reference page
│       └── assets/
│           ├── logo.svg                    ← Full brand logo SVG
│           └── screenshots/
│               ├── {page1}.png             ← Full-page screenshot per key page
│               └── {page2}.png
└── deliverables/
    ├── brand-review.html                   ← Copy for EDS serving
    └── assets/
        └── screenshots/                    ← Copies for EDS serving
            ├── {page1}.png
            └── {page2}.png
```

---

## Lessons Learned

Logo SVG completeness, deliverable image paths, and image format rules are documented in `of1-demo/knowledge/common-pitfalls.md` (§ 2-3). Extraction-specific gotcha:

**Private fonts** — When the site uses private fonts (e.g. Sentinel, Gotham Narrow), use the closest system-font fallback AND note the substitution in `DESIGN.json` — do not invent a different typeface.

---

## Completion

```bash
mkdir -p /shared/of1-demo

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
echo "{\"step\":4,\"status\":\"review\",\"deliverable\":\"${PREVIEW_BASE}/deliverables/brand-review.html\",\"summary\":\"Extracted design tokens, typography, colors, logo SVG, page screenshots. Brand review ready.\"}" > /shared/of1-demo/step-4-status.json
```

Also write a brief output summary to `/shared/of1-demo/step-4-output.md`.

Do NOT call `sprinkle send`.
