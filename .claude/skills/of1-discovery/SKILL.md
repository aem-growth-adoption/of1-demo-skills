---
name: of1-discovery
description: Crawl a target website and propose a demo focus and narrative for the OF1 demo.
user-invocable: false
---

# OF1 Discovery

Crawl the target site to understand what it offers, then propose a demo focus and narrative.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-3-output.md`, screenshots, and `step-3-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |

Read `$OWNER`, `$REPO`, `$BRANCH`, `$DOMAIN` from the contract `of1-branch-setup` wrote:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

`playwright-cli` calls below use the legacy verb/flag shape (`visit`, `--output`). SLICC environments run that natively; CC environments install the modern `@playwright/cli` binary plus the shim in `of1-setup/scripts/playwright-cli-shim.sh` (which translates legacy syntax to the modern binary). Either way, write code as if the legacy syntax just works.

## Process

The crawl is bounded to ~4 pages: homepage + at most 3 nav pages. Don't visit product detail pages, about pages, or sustainability pages — stick to top-level category/listing pages.

### 1. Crawl the homepage

```bash
playwright-cli visit "https://${DOMAIN}" --headed
playwright-cli screenshot --full-page --output "$OF1_STATE_DIR/discovery-home.png"
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
playwright-cli visit "https://${DOMAIN}/{path}" --headed
playwright-cli screenshot --full-page --output "$OF1_STATE_DIR/discovery-{slug}.png"
```

For each page, note:
- Page type (product listing / detail / category / about / blog)
- What products/services are featured
- Page structure (hero, grid, features, FAQ, etc.)
- Specific product names and categories

### 3. Propose demo focus

- **Demo focus**: which product line or category to feature (pick the richest/most visual one)
- **Demo narrative**: a user persona and their journey (e.g. "a coffee enthusiast researching their next espresso machine")
- **Key pages to reproduce**: 2–3 pages that best represent the site, with full URLs
- **Rationale**: why this focus works for a compelling demo

## Deliverables

### 4. Structured output for downstream steps

Write `$OF1_STATE_DIR/step-3-output.md` — consumed by steps 4, 5, and 7:

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

### 5. Discovery report HTML

Generate a self-contained HTML report at `$OF1_DEMO_REPO/deliverables/discovery.html` using the OF1 dark theme:

```css
--bg: #1C1917;
--fg: #F5F0E8;
--accent: #FF3D00;
--teal: #00E5A0;
--fg-dim: rgba(245, 240, 232, 0.55);
--border: rgba(245, 240, 232, 0.1);
--font: 'JetBrains Mono', monospace;
--heading-font: 'Cormorant Garamond', serif;
```

Include the site overview, proposed demo, key pages, page-structure analysis, and the screenshots from `$OF1_STATE_DIR/discovery-*.png` (embed as base64 or reference by absolute path). Load Google Fonts (JetBrains Mono + Cormorant Garamond) from CDN.

Commit and push:

```bash
cd "$OF1_DEMO_REPO"
mkdir -p deliverables
# ... write discovery.html ...
git add deliverables/discovery.html
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
DELIVERABLE="https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/discovery.html"
cat > "$OF1_STATE_DIR/step-3-status.json" <<EOF
{"step":3,"status":"review","deliverable":"${DELIVERABLE}","summary":"Demo focus: [focus]. Persona: [persona]. [N] key pages identified."}
EOF
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/revise flow and the eventual `done` transition.
