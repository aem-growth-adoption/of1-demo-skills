---
name: of1-discovery
description: Crawl a target website and propose a demo focus and narrative for the OF1 demo.
user-invocable: false
---

# OF1 Discovery

Crawl the target site to understand what it offers, then propose a demo focus and narrative.

## Inputs

You will be given a `DOMAIN` (e.g., `bmwusa.com`).

Read the repo config from step 2:
```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
```

## Process

### 1. Crawl the homepage

Use Playwright (headed Chrome) to visit `https://{DOMAIN}`:

```bash
playwright-cli visit "https://{DOMAIN}" --headed
```

Analyze:
- What does this site sell/offer?
- Main navigation structure and top-level categories
- Product/service lines
- Target audience
- Key CTAs and conversion paths

### 2. Crawl 3-5 navigation pages (NO MORE)

Follow the top 3-5 navigation links that look most product/content rich. Skip About, Contact, Privacy, Legal pages. For each page note:
- Page type (product listing / detail / category / about / blog)
- What products/services are featured
- Page structure (hero, grid, features, FAQ, etc.)
- Specific product names and categories

**⚡ Speed rule:** Stop after 5 pages MAX. You need enough to propose a demo focus, not an exhaustive site map. The homepage + 3 category pages is usually sufficient.

### 3. Propose demo focus

Based on what you found, propose:
- **Demo focus**: Which product line or category to feature (pick the richest/most visual one)
- **Demo narrative**: A user persona and their journey (e.g., "a gamer researching GPUs for a new build")
- **Key pages to reproduce**: Which 2-3 pages best represent the site
- **Rationale**: Why this focus works for a compelling demo

## Deliverable

### 4. Generate discovery report HTML

Generate a self-contained HTML report at `deliverables/discovery.html` using the OF1 dark theme (same aesthetic as the sprinkle UI):

```css
/* Use these design tokens inline in the HTML */
--bg: #1C1917;
--fg: #F5F0E8;
--accent: #FF3D00;
--teal: #00E5A0;
--fg-dim: rgba(245, 240, 232, 0.55);
--border: rgba(245, 240, 232, 0.1);
--font: 'JetBrains Mono', monospace;
--heading-font: 'Cormorant Garamond', serif;
```

The report must include:
- **Header** — "Site Discovery: {DOMAIN}" with of1 branding
- **Site Overview** — purpose, product lines, audience, navigation structure
- **Proposed Demo** — focus, narrative, persona, rationale
- **Key Pages** — 2-3 URLs to reproduce, with screenshots if captured during crawl
- **Page Structure Analysis** — what blocks/sections were observed on each page

Use cards, pills, and visual hierarchy similar to the sprinkle panel. Load Google Fonts (JetBrains Mono + Cormorant Garamond) from CDN.

Commit and push to make it available via EDS static hosting:
```bash
cd "$REPO_DIR"
BRANCH=$(cat /shared/of1-demo/repo-config.json | jq -r '.branch')
mkdir -p deliverables
# ... write discovery.html ...
git add deliverables/discovery.html
git commit -m "docs: discovery report for {DOMAIN}"
git push origin ${BRANCH}
```

The report is then available at:
`https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/discovery.html`

### 5. Present in chat

Also present the proposal in chat as a structured summary:

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

**Full report:** https://main--{REPO}--{OWNER}.aem.page/deliverables/discovery.html
```

Then ask the user:
- Does this focus work, or would you prefer a different product line?
- Is the persona/narrative right for your audience?
- Any pages you specifically want included or excluded?

## Completion

Write a status file — do NOT call `sprinkle send` directly (only the of1-demo orchestrator scoop may do that):

After presenting findings, write:
```bash
mkdir -p /shared/of1-demo
BRANCH=$(cat /shared/of1-demo/repo-config.json | jq -r '.branch')
echo '{"step":3,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/discovery.html","summary":"Demo focus: [focus]. Persona: [persona]. Pages: [N] key pages identified."}' > /shared/of1-demo/step-3-status.json
```

On approval (user confirms via sprinkle), the orchestrator will handle the `done` update. If you receive explicit approval in chat, write:
```bash
echo '{"step":3,"status":"done"}' > /shared/of1-demo/step-3-status.json
```
