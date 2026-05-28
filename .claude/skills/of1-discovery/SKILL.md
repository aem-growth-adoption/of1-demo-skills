---
name: of1-discovery
description: Crawl a target website and propose a demo focus and narrative for the OF1 demo.
user-invocable: false
---

# OF1 Discovery

Crawl the target site to understand what it offers, then propose a demo focus and narrative.

## ⚡ Speed Priority — Target: 3 minutes

- Homepage + MAX 3 nav pages (4 pages total) — do NOT over-crawl
- Take screenshots as you go (reused by extraction)
- Write structured output for downstream steps
- Do NOT visit product detail pages, about pages, or sustainability pages — stick to top-level category/listing pages

---

## Inputs

You will be given a `DOMAIN` (e.g., `bmwusa.com`).

Read the repo config from step 2:
```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
```

## Process

### 1. Crawl the homepage

Use Playwright (headed Chrome) to visit `https://{DOMAIN}`:

```bash
playwright-cli visit "https://{DOMAIN}" --headed
playwright-cli screenshot --full-page --output /tmp/discovery-home.png
```

Analyze:
- What does this site sell/offer?
- Main navigation structure and top-level categories
- Product/service lines
- Target audience
- Key CTAs and conversion paths

### 2. Crawl UP TO 3 navigation pages (MAX 4 total including homepage)

Follow top navigation links to the most visual/product-rich pages. **STOP after 3 subpages** — you do NOT need to visit every category. Pick the 2-3 most product-rich or visual pages from the main nav. For each page:

```bash
playwright-cli visit "https://{DOMAIN}/{path}" --headed
playwright-cli screenshot --full-page --output /tmp/discovery-{slug}.png
```

Note:
- Page type (product listing / detail / category / about / blog)
- What products/services are featured
- Page structure (hero, grid, features, FAQ, etc.)
- Specific product names and categories

### 3. Propose demo focus

Based on what you found, propose:
- **Demo focus**: Which product line or category to feature (pick the richest/most visual one)
- **Demo narrative**: A user persona and their journey (e.g., "a gamer researching GPUs for a new build")
- **Key pages to reproduce**: Which 2-3 pages best represent the site (include full URLs)
- **Rationale**: Why this focus works for a compelling demo

## Deliverables

### 4. Write structured output for downstream steps

Write `/shared/of1-demo/step-3-output.md` — this is consumed by steps 4, 5, and 7:

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

### 5. Generate discovery report HTML

Generate a self-contained HTML report at `deliverables/discovery.html` using the OF1 dark theme:

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

Include:
- Site overview, proposed demo, key pages, page structure analysis
- Screenshots taken during crawl (embed as base64 or reference from `/tmp/`)

Load Google Fonts (JetBrains Mono + Cormorant Garamond) from CDN.

Commit and push:
```bash
cd "$REPO_DIR"
mkdir -p deliverables
# ... write discovery.html ...
git add deliverables/discovery.html
git commit -m "docs: discovery report for {DOMAIN}"
git push origin ${BRANCH}
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

**Full report:** https://{BRANCH}--{REPO}--{OWNER}.aem.page/deliverables/discovery.html
```

Then ask the user:
- Does this focus work, or would you prefer a different product line?
- Is the persona/narrative right for your audience?
- Any pages you specifically want included or excluded?

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

```bash
mkdir -p /shared/of1-demo
echo '{"step":3,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/discovery.html","summary":"Demo focus: [focus]. Persona: [persona]. Pages: [N] key pages identified."}' > /shared/of1-demo/step-3-status.json
```

On approval (user confirms via sprinkle), the orchestrator will handle the `done` update. If you receive explicit approval in chat, write:
```bash
echo '{"step":3,"status":"done"}' > /shared/of1-demo/step-3-status.json
```
