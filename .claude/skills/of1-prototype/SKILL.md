---
name: of1-prototype
description: Generate pixel-perfect HTML prototypes of key pages from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Prototype

Generate pixel-perfect, self-contained HTML reproductions of key pages from the target website by invoking the `stardust:prototype` plugin. These prototypes are the source-of-truth for the snowflake overlay conversion in Step 6.

## ⚡ Speed Priority — Target: 8 minutes

- Invoke `stardust:prototype` to do the heavy lifting — do NOT reimplement prototype logic
- ONE git commit + push at the end

---

## Platform context

This skill runs in both SLICC and Claude Code. Resolve these symbols up-front — the rest of the skill uses them by name and assumes you've read this section.

| Symbol | SLICC default | Claude Code override |
|---|---|---|
| `$STATE_DIR` | `/shared/of1-demo` | `$OF1_STATE_DIR` (e.g. `<project>/.of1/state`) |
| `$DA_TOKEN` | `$(oauth-token adobe)` | `$ADOBE_IMS_TOKEN`, or `$(jq -r .access_token "$OF1_TOKEN_FILE")` |
| `playwright-cli` action verbs | `visit`, `navigate` | `open` |
| `playwright-cli` output flag | `--output <path>` | `--filename <path>` |
| `playwright-cli eval` | `eval "<expr>"` | `eval "() => (<expr>)"` |

Multi-line operations:

### Platform: DA upload (single file)
- **SLICC:** `cat <local> > /mnt/da/<owner>/<repo>/<branch>/<path>`
- **Claude Code:** `curl -X PUT -H "Authorization: Bearer $DA_TOKEN" -H "Content-Type: text/html" --data-binary @<local> "https://admin.da.live/source/<owner>/<repo>/<branch>/<path>"`

### Platform: Static serve (returns a URL the user can open)
- **SLICC:** `SERVE_URL=$(serve --entry <file> <dir>)` — returns a public URL
- **Claude Code:** `(cd <dir> && python3 -m http.server <port>) &` then `SERVE_URL="http://localhost:<port>/<file>"` — local only

### Platform: `playwright-cli` tab targeting
- **SLICC:** pass `--tab=<id>` on the action call
- **Claude Code:** run `playwright-cli tab-select <id>` first, then call the action without `--tab`

Where this skill body says `serve <file>` or `upload <local> to DA at <branch-path>`, use the platform's form above.

**Note on literal commands in code blocks:** Code blocks below use SLICC forms by default (`playwright-cli visit`, `--output`, etc.). When running in Claude Code, apply the renames above as you go — the alternative would be cluttering every snippet with both forms.

---

## Inputs

- `DOMAIN`: Target domain
- Extraction outputs at `stardust/current/` (DESIGN.json, logo.svg, screenshots — from step 4)
- Key pages from discovery (typically: homepage + 2 category/product pages)
- Repo config from `$STATE_DIR/repo-config.json`

## Process

### Step 1: Read config + existing data

```bash
REPO_CONFIG=$(cat "$STATE_DIR/repo-config.json")
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')
```

### Step 2: Invoke stardust:prototype

Use the Skill tool to invoke `stardust:prototype`. This reads the extraction output from `stardust/current/` and generates pixel-perfect HTML prototypes for each extracted page.

```
Skill: stardust:prototype
```

The plugin will:
1. Read design tokens from `stardust/current/DESIGN.json`
2. Read logo from `stardust/current/assets/logo.svg`
3. Use real images extracted from the live site (exact URLs)
4. Generate self-contained HTML files with all CSS inlined
5. Run screenshot diff loops to verify visual fidelity
6. Write prototypes to `stardust/prototypes/`

### Step 3: Verify prototype outputs

```bash
cd "$REPO_DIR"
ls stardust/prototypes/prototype-*.html && echo "Prototypes OK"
```

If any expected page is missing, check `stardust/state.json` for extraction status and re-invoke if needed.

### Step 4: Post-generation fixes (CRITICAL)

After `stardust:prototype` generates the prototypes, verify and fix these common issues:

#### 4a. Logo completeness

Check that the logo SVG in the prototype is the FULL brand logotype:
```bash
# The logo in stardust/current/assets/logo.svg should be the complete file
# downloaded directly from the site (e.g., from /icons/logo.svg or extracted from DOM)
# Verify it renders the full wordmark — not just a partial path
```

If the logo is truncated or incomplete:
1. Download the real logo SVG directly from the site: `curl -s "https://${DOMAIN}/icons/logo.svg"` (or find it via playwright)
2. Save to `stardust/current/assets/logo.svg`
3. Update both header AND footer logo in the prototypes

**Footer logo:** Must use the SAME complete SVG as the header, but with fill colors changed for the dark footer background (e.g., `fill="#F4E9DC"` instead of `fill="#58181d"`).

#### 4b. CSS class naming — avoid EDS collisions

Check the prototype HTML for these class names and rename them:

| If prototype uses | Rename to | Why |
|-------------------|-----------|-----|
| `class="header"` on `<header>` | `class="site-header"` | EDS reserves `.header` for its block wrapper |
| `class="footer"` on `<footer>` | `class="site-footer"` | EDS reserves `.footer` for its block wrapper |
| `.header {` in CSS | `.site-header {` | Same collision — CSS targets EDS wrapper too |
| `.footer {` in CSS | `.site-footer {` | Same collision |

**Why this matters:** EDS wraps content in `<div class="header-wrapper"><div class="header block">...</div></div>`. If the prototype uses `<header class="header">`, the snowflake step will inherit this collision and the nav will render incorrectly.

#### 4c. Image URLs — never construct, always look up

When fixing card images or any image that `stardust:prototype` left blank or wrong, **pull the URL from the captured page JSON** — never construct it from a path pattern.

Step 4 (extraction) writes one JSON file per crawled page at `stardust/current/pages/<page>.json`. Each file lists the `images` array with the exact URLs as they appeared in the live DOM. That is the canonical source.

```bash
# ✅ CORRECT — look up the captured URL
jq -r '.images[] | select(.alt | test("Bali"; "i")) | .src' stardust/current/pages/adventures.json

# ❌ WRONG — constructing from a guessed pattern
# "https://${DOMAIN}/content/dam/wknd/adventures/bali-surf-camp.jpg"
```

Reason: live sites often use CDN paths, content-fragment hashes, or per-page redirects that a generated pattern will miss. A wknd.site run had 6 cards with constructed-but-wrong URLs (all 404s) — the fix was a single `jq` lookup against the captured page JSON.

#### 4d. Announcement bar structure

If the site has an announcement/promo bar above the nav, ensure it's a **separate element** from the header — NOT nested inside `<header>`:

```html
<!-- ✅ CORRECT -->
<div class="announcement-bar">FREE SHIPPING FROM $35...</div>
<header class="site-header">
  <a href="/" class="header-logo"><svg>...</svg></a>
  <nav>...</nav>
</header>

<!-- ❌ WRONG — will break in EDS snowflake -->
<header class="header">
  <div class="announcement">...</div>
  <nav>...</nav>
</header>
```

### Step 5: Copy to deliverables + commit

```bash
cd "$REPO_DIR"
mkdir -p deliverables
cp stardust/prototypes/prototype-*.html deliverables/

git add deliverables/prototype-*.html stardust/prototypes/ stardust/current/assets/
git commit -m "feat: pixel-perfect HTML prototypes for ${DOMAIN}"
git push origin ${BRANCH}
```

**NOTE:** `stardust/` may be in `.gitignore`. Always commit to `deliverables/` — that's what gets served on EDS and reviewed.

---

## CRITICAL: Pixel-Perfect Copy — No Redesign, No Placeholders

The `stardust:prototype` plugin already enforces this, but for clarity:

- **Use real images** from the live site (exact URLs extracted during crawl)
- **Inline the brand logo SVG** in the nav/header
- **Match design tokens exactly** (colors, fonts, spacing)
- **No placeholder images**, colored boxes, gradient divs, or emoji
- **No redesign** — faithful reproduction only

---

## Lessons Learned

Cross-cutting rules (logo completeness, EDS class collisions, announcement-bar placement, image format/placeholders) are in `of1-demo/knowledge/common-pitfalls.md`. Prototype-specific gotchas:

| Mistake | Impact | Prevention |
|---------|--------|------------|
| Heroes set to `100vh` | Way too tall — sites typically use 200-400px | Check actual height from live site; do not assume full viewport |
| Cards with invented box-shadows | Over-designed vs. the original | Only add shadows if the live site has them; pixel-perfect copy means matching, not improving |

---

## Expected Output Structure

```
{REPO_DIR}/
├── stardust/
│   └── prototypes/                     ← Generated by stardust:prototype
│       ├── prototype-home.html
│       ├── prototype-{page2}.html
│       └── prototype-{page3}.html
└── deliverables/
    ├── prototype-home.html             ← Committed copies for review
    ├── prototype-{page2}.html
    └── prototype-{page3}.html
```

---

## Completion

```bash
mkdir -p "$STATE_DIR"

# Trigger EDS preview for each committed prototype so the hosted URLs return 200
# (sprinkle / orchestrator open these as <a target="_blank">; the URLs must be reachable).
# Uses $DA_TOKEN from Platform context (SLICC: oauth-token adobe; Claude Code: $ADOBE_IMS_TOKEN).
for f in deliverables/prototype-*.html; do
  [ -f "$f" ] || continue
  SLUG="deliverables/$(basename "$f" .html)"
  curl -s -X POST \
    -H "Authorization: Bearer ${DA_TOKEN}" \
    -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
    -o /dev/null \
    "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${SLUG}"
done

# Build a deliverables array — one entry per prototype, so the sprinkle (or
# Claude Code orchestrator, once it learns the protocol) can render one Open
# button per page (e.g. Open Home, Open Adventures, Open Magazine).
# IMPORTANT: deliverable URLs MUST point at /deliverables/prototype-*.html
# (the standalone HTML committed in step 5), NOT /${BRANCH}/prototype-*
# (which is the EDS overlay URL produced later by step 6 — snowflake).
# Heredoc is UNQUOTED so bash expands ${BRANCH}/${REPO}/${OWNER} inline; no
# os.environ lookup needed (and BRANCH/REPO/OWNER aren't exported here).
DELIVERABLES=$(python3 - <<PYEOF
import json
from pathlib import Path
base = "https://${BRANCH}--${REPO}--${OWNER}.aem.page"
out = []
files = sorted(Path('deliverables').glob('prototype-*.html'))
files.sort(key=lambda p: 0 if p.stem == 'prototype-home' else 1)
for p in files:
    label = p.stem.replace('prototype-', '').replace('-', ' ').title()
    out.append({"url": f"{base}/deliverables/{p.name}", "label": label})
print(json.dumps(out))
PYEOF
)

cat > "$STATE_DIR/step-5-status.json" <<EOF
{"step":5,"status":"review","deliverables":${DELIVERABLES},"summary":"Generated $(ls deliverables/prototype-*.html 2>/dev/null | wc -l | tr -d ' ') pixel-perfect HTML prototypes with real images, correct tokens, and matching layout."}
EOF
```

Also write summary to `$STATE_DIR/step-5-output.md`.

In Claude Code the orchestrator's `Agent` return is the source of truth — the status file is optional. Do NOT call `sprinkle send`.
