---
name: of1-discovery
description: Crawl a target website and propose a demo focus and narrative for the OF1 demo.
user-invocable: true
---

# OF1 Discovery

Crawl the target site to understand what it offers, then propose a demo focus and narrative.

## Env — orchestrator exports these (see `of1-check-dependencies`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `of1-discovery-output.md`, screenshots, and `of1-discovery-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo-orchestrator` git clone |
| `SKILL_DIR` | absolute path to this skill's directory (used to find `assets/fill-discovery.mjs` + `assets/discovery-report.html`) |

Read `$OWNER`, `$REPO`, `$BRANCH`, `$DOMAIN` from the contract `of1-check-dependencies` wrote:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

`playwright-cli` calls below follow `of1-demo-orchestrator/knowledge/common-pitfalls.md` § 9 "playwright-cli syntax" (`open`, `--full-page` bare, `--filename`, `eval` as a function form). Works on both SLICC-native and CC binaries.

## Process

The crawl is bounded to ~4 pages: homepage + at most 3 nav pages. Don't visit product detail pages, about pages, FAQ pages, or sustainability pages — stick to top-level category/listing pages.

### 1. Crawl the homepage

```bash
playwright-cli open "https://${DOMAIN}"
sleep 3
playwright-cli screenshot --full-page --filename "$OF1_STATE_DIR/discovery-home.png"
playwright-cli tab-close "$(playwright-cli tab-list | grep -oE '[0-9]+' | tail -1)"
```

Analyze:
- What does this site sell/offer?
- Main navigation structure and top-level categories
- Product/service lines
- Target audience
- Key CTAs and conversion paths

### 2. Crawl UP TO 3 navigation pages (max 4 total including homepage)

Follow top-nav links to the most visual/product-rich pages. Pick the 2–3 best — you don't need every category.

```bash
playwright-cli open "https://${DOMAIN}/{path}"
sleep 3
playwright-cli screenshot --full-page --filename "$OF1_STATE_DIR/discovery-{slug}.png"
playwright-cli tab-close "$(playwright-cli tab-list | grep -oE '[0-9]+' | tail -1)"
```

For each page, note:
- Page type (product listing / detail / category / about / blog)
- What products/services are featured
- Page structure (hero, grid, features, FAQ, etc.)
- Specific product names and categories

### 3. Propose demo focus

- **Demo focus**: which product line or category to feature (pick the richest/most visual one)
- **Demo narrative**: a user persona and their journey (e.g. "a coffee enthusiast researching their next espresso machine")
- **Key pages to reproduce**: 2–3 pages that best represent the site, with full URLs. These are mirrored into `narrative.json` (§4b) as `keyPages[]` — Stage 2 recreates exactly these.
- **Rationale**: why this focus works for a compelling demo

## Deliverables

### 4. Structured output for downstream steps

Write `$OF1_STATE_DIR/of1-discovery-output.md` — read by `of1-extract-brand-voice`,
`of1-extract-content`, `of1-build-templates`, `of1-build-quick-suggestions`, and
`of1-publish` (`fill-demo-hub.mjs`):

```markdown
# Discovery: {DOMAIN}

## Demo Focus
{product line or category}

## Narrative
{persona name, description, their journey}

## Key Pages
- https://{DOMAIN}/ (homepage)
- https://{DOMAIN}/{page2} ({description})
- https://{DOMAIN}/{page3} ({description})

## Site Overview
- **Purpose:** {what the site does}
- **Product lines:** {list}
- **Audience:** {who}
- **Tone:** {brand voice first impression}

## Page Structure
### Homepage
- Hero: {description}
- Section 2: {description}
- ...

### {Page 2}
- ...
```

### 4b. Machine-readable narrative for the orchestrator

Also write `$OF1_STATE_DIR/narrative.json` — the orchestrator reads `keyPages[].slug`
to build Stage 2's `stardust:replica --pages` argument, and `focus`/`persona` to steer
Stage 3's product focus:

```bash
cat > "$OF1_STATE_DIR/narrative.json" <<EOF
{
  "domain": "${DOMAIN}",
  "focus": "<the demo focus you proposed above>",
  "persona": "<persona + one-line journey>",
  "keyPages": [
    { "slug": "home", "url": "https://${DOMAIN}/", "description": "homepage" }
    <, one object per additional key page — slug is the URL path segment, no leading slash>
  ]
}
EOF
```

**Slug rules:** the homepage is always `slug: "home"`. For other pages, the slug is the
last non-empty path segment (e.g. `https://${DOMAIN}/shop/coffee` → `coffee`). Keep 2–3
key pages total — these become the ONLY pages Stage 2 recreates.

### 5. Discovery report HTML

**Generate the report with the fill script — do NOT hand-write the HTML.** `fill-discovery.mjs` reads `of1-discovery-output.md` (Step 4) and the `discovery-*.png` screenshots from `$OF1_STATE_DIR`, copies the screenshots into `deliverables/assets/screenshots/` (referenced by absolute path — they resolve on the EDS preview and avoid base64 bloat), renders the markdown, and writes a themed self-contained `deliverables/discovery.html`.

Precondition: Step 4 wrote `of1-discovery-output.md` and Steps 1–2 captured `discovery-*.png` (both in `$OF1_STATE_DIR`).

```bash
cd "$OF1_DEMO_REPO"
OF1_STATE_DIR="$OF1_STATE_DIR" node "$SKILL_DIR/assets/fill-discovery.mjs" . "$DOMAIN"

git add deliverables/
git commit -m "docs: discovery report for ${DOMAIN}"
git push origin "$BRANCH"
```

### 6. Present in chat

```
## Site Discovery: {domain}

**Purpose:** [what the site does]
**Product lines:** [list]
**Audience:** [who]

## Proposed Demo

**Focus:** [product line/category]
**Narrative:** [persona + journey]
**Key pages:** [2-3 URLs to reproduce]
**Why:** [rationale]

**Full report:** https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/discovery.html
```

Then ask the user:
- Does this focus work, or would you prefer a different product line?
- Is the persona/narrative right for your audience?
- Any pages you specifically want included or excluded?

## Completion

```bash
REPORT_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/discovery.html"
cat > "$OF1_STATE_DIR/of1-discovery-status.json" <<EOF
{
  "stage": 1,
  "skill": "of1-discovery",
  "status": "review",
  "deliverables": [
    { "url": "${REPORT_URL}", "label": "Discovery report" }
  ],
  "summary": "Demo focus: [focus]. Persona: [persona]. [N] key pages identified."
}
EOF
```

The `deliverables` field is an array of `{url, label?}` objects so steps that produce multiple artifacts (prototypes, EDS pages) can list them all. `label` is optional but recommended.

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/revise flow and the eventual `done` transition.
