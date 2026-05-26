---
name: of1-extraction
description: Extract design tokens, brand identity, and page structure from a live website for the OF1 demo pipeline.
user-invocable: false
---

# OF1 Extraction

Extract design tokens, typography, colors, logo, page structure, and screenshots from the target website. Produces `PRODUCT.md`, `design-tokens.json`, screenshots, logo SVG, and a visual brand-review HTML deliverable.

## ⚡ Speed Priority — Target: 5 minutes

- Do NOT read other skills at runtime — everything is here
- Do NOT explore the workspace looking for tools — use playwright-cli directly
- Batch ALL playwright calls (extract from multiple pages in sequence without re-reading context between them)
- Write ALL files, then ONE git commit + push at the end

---

## Inputs

- `DOMAIN`: Target domain (e.g., `frescopa.coffee`)
- Discovery output from Step 3 (demo focus, persona, key pages)
- Repo config from `/shared/of1-demo/repo-config.json`

## Expected Output Structure

```
{REPO_DIR}/
├── PRODUCT.md                              ← Brand context (register, persona, principles)
├── stardust/
│   └── current/
│       ├── design-tokens.json              ← Colors, typography, spacing, shapes
│       └── assets/
│           ├── logo.svg                    ← Full brand logo SVG
│           └── screenshots/
│               ├── {page1}.png             ← Full-page screenshot per key page
│               ├── {page2}.png
│               └── {page3}.png
└── deliverables/
    ├── brand-review.html                   ← Visual reference page (OF1 dark theme)
    └── assets/
        └── screenshots/                    ← Copies for EDS serving
            ├── {page1}.png
            ├── {page2}.png
            └── {page3}.png
```

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

### Step 2: Create PRODUCT.md

Write `${REPO_DIR}/PRODUCT.md` based on the discovery context provided in your prompt. Use this structure:

```markdown
# Product

## Register

brand

## Users

**Primary:** [main audience from discovery]
**Secondary:** [secondary audience]
**Persona (Demo):** [demo persona name, age, description, goals]
**Context:** [how users arrive, what they want]

## Product Purpose

[What the site does, what success looks like]
**Tagline:** "[site tagline]"

## Brand Personality

[Personality in 3-4 words]
[Detailed tone description — how the brand speaks, what it avoids]
**Tone:** [Conversational style]
**Emotional goals:** [What visitors should feel]

## Anti-references

- [What NOT to do — 3-4 anti-patterns with explanations]

## Design Principles

1. **[Principle]** — [explanation]
2. **[Principle]** — [explanation]
3. **[Principle]** — [explanation]
4. **[Principle]** — [explanation]
5. **[Principle]** — [explanation]
```

### Step 3: Extract design tokens (ONE playwright session)

Visit the homepage and extract everything in a single eval:

```bash
playwright-cli visit "https://${DOMAIN}" --headed
```

Then run ONE comprehensive eval that extracts colors, fonts, spacing, and structure:

```bash
playwright-cli eval "
(() => {
  const cs = getComputedStyle(document.documentElement);
  
  // Extract CSS custom properties
  const props = {};
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
          for (const prop of rule.style) {
            if (prop.startsWith('--')) props[prop] = rule.style.getPropertyValue(prop).trim();
          }
        }
      }
    } catch(e) {}
  }
  
  // Extract fonts actually used
  const fonts = new Set();
  document.querySelectorAll('h1,h2,h3,h4,p,a,button,span').forEach(el => {
    fonts.add(getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/[\"']/g, ''));
  });
  
  // Extract button styles
  const btn = document.querySelector('a.button, .button, [class*=cta], [class*=btn]');
  const btnStyles = btn ? {
    bg: getComputedStyle(btn).backgroundColor,
    color: getComputedStyle(btn).color,
    radius: getComputedStyle(btn).borderRadius,
    padding: getComputedStyle(btn).padding,
    font: getComputedStyle(btn).fontFamily,
    size: getComputedStyle(btn).fontSize,
    weight: getComputedStyle(btn).fontWeight
  } : null;
  
  // Extract heading styles
  const h1 = document.querySelector('h1');
  const headingStyles = h1 ? {
    family: getComputedStyle(h1).fontFamily,
    size: getComputedStyle(h1).fontSize,
    weight: getComputedStyle(h1).fontWeight,
    lineHeight: getComputedStyle(h1).lineHeight
  } : null;
  
  // Extract body styles
  const body = document.body;
  const bodyStyles = {
    family: getComputedStyle(body).fontFamily,
    size: getComputedStyle(body).fontSize,
    bg: getComputedStyle(body).backgroundColor,
    color: getComputedStyle(body).color
  };
  
  // Site width
  const main = document.querySelector('main') || document.querySelector('[class*=container]');
  const maxWidth = main ? getComputedStyle(main).maxWidth : 'auto';
  
  return JSON.stringify({ props, fonts: [...fonts], btnStyles, headingStyles, bodyStyles, maxWidth }, null, 2);
})()
"
```

### Step 4: Take screenshots (all pages in sequence)

```bash
playwright-cli screenshot "https://${DOMAIN}" --full-page --output ${REPO_DIR}/stardust/current/assets/screenshots/homepage.png

# Navigate to each key page and screenshot
playwright-cli visit "https://${DOMAIN}/coffee" --headed
playwright-cli screenshot --full-page --output ${REPO_DIR}/stardust/current/assets/screenshots/coffee.png

playwright-cli visit "https://${DOMAIN}/machines" --headed  
playwright-cli screenshot --full-page --output ${REPO_DIR}/stardust/current/assets/screenshots/machines.png
```

### Step 5: Extract logo SVG

```bash
playwright-cli visit "https://${DOMAIN}" --headed
playwright-cli eval "
(() => {
  // Try multiple logo selectors
  const selectors = [
    '.brand svg', '.logo svg', 'header svg', 'nav svg',
    'a[href=\"/\"] svg', '[class*=logo] svg', '[class*=brand] svg',
    'header img[src*=svg]', 'nav img[src*=svg]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      if (el.tagName === 'svg') return el.outerHTML;
      if (el.tagName === 'IMG') return el.src;
    }
  }
  // Try symbol sprites
  const symbols = document.querySelectorAll('symbol[id*=logo], symbol[id*=brand]');
  if (symbols.length) {
    const s = symbols[0];
    return '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"' + s.getAttribute('viewBox') + '\">' + s.innerHTML + '</svg>';
  }
  return 'NOT_FOUND';
})()
"
```

Save the result to `${REPO_DIR}/stardust/current/assets/logo.svg`. If it's a URL, download it. Verify the SVG is complete (not truncated — check it ends with `</svg>`).

### Step 6: Write design-tokens.json

Create `${REPO_DIR}/stardust/current/design-tokens.json` with this structure:

```json
{
  "domain": "{DOMAIN}",
  "extracted": "2025-01-01",
  "colors": {
    "brand": { "background": "#...", "primary": "#...", "secondary": "#...", "text": "#..." },
    "cta": { "primary": "...", "secondary": "..." },
    "neutrals": { "50": "#...", "900": "#..." },
    "semantic": { "positive": {}, "warning": {}, "alert": {} }
  },
  "typography": {
    "families": { "headings": "...", "base": "..." },
    "weights": { "regular": 400, "bold": 700 },
    "scale": { "display-1": { "size": "...", "lineHeight": "...", "weight": 400, "family": "..." } }
  },
  "spacing": { "small": "...", "medium": "...", "large": "..." },
  "shape": { "borderRadius": { "small": "...", "pill": "..." } },
  "layout": { "maxWidth": "...", "columns": 12, "gutter": "..." }
}
```

### Step 7: Generate brand-review.html

Create `${REPO_DIR}/deliverables/brand-review.html` — a self-contained HTML page using the OF1 dark theme:

```css
--bg: #1C1917; --fg: #F5F0E8; --accent: #FF3D00; --teal: #00E5A0;
font-family: 'JetBrains Mono', monospace; (body)
font-family: 'Cormorant Garamond', serif; (headings)
```

Include sections for:
- Color swatches (brand + neutrals + semantic)
- Typography samples (heading + body + button)
- Button/CTA preview
- Logo display
- Page screenshots (use absolute paths: `/deliverables/assets/screenshots/homepage.png`)
- Page structure analysis (what sections/blocks each page has)

Load Google Fonts from CDN (JetBrains Mono + Cormorant Garamond).

**Image paths MUST be absolute from repo root** (start with `/deliverables/`).

### Step 8: Copy screenshots to deliverables

```bash
mkdir -p ${REPO_DIR}/deliverables/assets/screenshots
cp ${REPO_DIR}/stardust/current/assets/screenshots/*.png ${REPO_DIR}/deliverables/assets/screenshots/
```

### Step 9: Commit and push (ONE operation)

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
git add -f stardust/current/design-tokens.json stardust/current/assets/
```

---

## Completion

```bash
mkdir -p /shared/of1-demo

PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
echo "{\"step\":4,\"status\":\"review\",\"deliverable\":\"${PREVIEW_BASE}/deliverables/brand-review.html\",\"summary\":\"Extracted design tokens, typography, colors, logo SVG, page screenshots. Brand review ready.\"}" > /shared/of1-demo/step-4-status.json
```

Also write a brief output summary to `/shared/of1-demo/step-4-output.md`.

Do NOT call `sprinkle send`.
