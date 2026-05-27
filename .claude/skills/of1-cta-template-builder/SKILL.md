---
name: of1-cta-template-builder
description: Extract a site's visual design system and generate a branded CTA template (cta-template.json) for the OF1 extension's personalized CTA injection
user-invocable: true
---

# CTA Template Builder

Analyze a website's visual design system (fonts, colors, button styles, spacing) and generate a branded HTML CTA template with slot placeholders. The template is used by the OF1 extension to inject a personalized call-to-action that looks native to the site.

## ⚡ Speed Priority — Target: 2 minutes

- Read DESIGN.json first for colors/fonts/button styles — avoid re-crawling what's already extracted
- Only WebFetch if DESIGN.json is missing or lacks button-specific detail
- ONE file to write

---

## Inputs

- `DOMAIN`: Target domain (e.g., `bmwusa.com`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## Process preamble (pipeline mode)

```bash
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

cd "$REPO_DIR"
mkdir -p of1/config
```

Read existing design tokens (from step 4 extraction):
```bash
cat stardust/current/DESIGN.json 2>/dev/null
```

If DESIGN.json exists, use it for colors, fonts, button styles, and border-radius. Only WebFetch the site if you need CTA-specific details not in the tokens.

## Output

`of1/config/cta-template.json`:

```json
{
  "html": "<div style=\"...\"><h2 style=\"...\">{{title}}</h2><p style=\"...\">{{description}}</p><a href=\"{{href}}\" style=\"...\">{{buttonText}}</a></div>",
  "slots": ["title", "description", "buttonText"],
  "fallback": {
    "title": "...",
    "description": "...",
    "buttonText": "..."
  }
}
```

**Important:** The `{{href}}` placeholder is NOT a slot — it's resolved at runtime by the worker to the tenant's OF1 endpoint URL with `?personalize=1`. Do NOT include `href` in the `slots` array.

## Process

### Step 1: Analyze the site's visual design

Fetch the homepage and 1-2 key pages using **WebFetch**:

```
Analyze this page's visual design system. Extract:
1. FONTS: What font-family is used for headings? For body text? (look for custom fonts, web fonts, or system fonts)
2. PRIMARY COLORS: What's the brand's primary color? Background colors? Text colors?
3. BUTTON STYLE: What do CTAs/buttons look like? Background color, text color, border-radius (rounded/pill/square?), padding, text-transform, font-weight, letter-spacing?
4. SECTION STYLING: How are content sections styled? Dark backgrounds or light? What padding/margins?
5. OVERALL THEME: Dark or light? Minimal or rich? Sharp or rounded?
6. ACCENT COLORS: Secondary colors used for highlights or interactive elements?
```

### Step 2: Determine the CTA visual treatment

Based on the design analysis, decide:

- **Background:** Usually dark (matches hero/footer tone) or matches a prominent section style
- **Heading:** Brand font, white or light color, bold weight, ~2rem size
- **Description:** Lighter/muted color, regular weight, ~1.1rem size
- **Button:** Brand's actual button style (color, border-radius, padding, text-transform)
- **Container:** Appropriate padding (3-4rem vertical, 2rem horizontal), text-align center

The CTA should look like it could be a native section on the site — not a generic overlay.

### Step 3: Build the HTML template

Create a self-contained HTML block using **inline styles only** (no external CSS dependencies). The template must include exactly these placeholders:

- `{{title}}` — personalized heading (5-10 words)
- `{{description}}` — personalized body text (1 sentence)
- `{{href}}` — resolved at runtime (do NOT include in slots)
- `{{buttonText}}` — personalized button label (2-4 words)

**Template structure:**
```html
<div style="[background, padding, text-align, margin]">
  <h2 style="[color, font-family, font-size, font-weight, margin, line-height]">{{title}}</h2>
  <p style="[color, font-family, font-size, margin, max-width, line-height]">{{description}}</p>
  <a href="{{href}}" style="[display, background, color, font-family, font-size, font-weight, padding, border-radius, text-decoration, text-transform, letter-spacing]">{{buttonText}}</a>
</div>
```

### Step 4: Write fallback content

Generate appropriate static fallback content that fits the brand:

- **title:** Generic but relevant to the site's primary offering (5-10 words)
- **description:** Invites exploration, 1 sentence
- **buttonText:** Action-oriented, 2-4 words

### Step 5: Write cta-template.json

```bash
mkdir -p of1/config
```

Write the JSON file to `of1/config/cta-template.json`. Ensure:
- HTML is on a single line (no newlines inside the `html` field)
- All double quotes inside the HTML use escaped `\"` 
- No trailing commas

### Step 6: Confirm

> CTA template written to `of1/config/cta-template.json`. 
> Visual: [describe the look — e.g., "dark background, white heading, orange pill button matching BMW brand"]

## Quality Checklist

Before writing the file, verify:

- [ ] Template uses the site's actual font family (not a generic sans-serif unless that IS the site's font)
- [ ] Button style matches the site's real button design (color, radius, text-transform)
- [ ] Background color is appropriate (typically dark, matching the site's dark sections)
- [ ] The CTA would not look out of place if screenshot alongside the actual site
- [ ] Fallback content is specific to the brand/industry, not generic
- [ ] HTML is valid, self-contained, uses only inline styles
- [ ] `slots` array contains exactly `["title", "description", "buttonText"]` (NOT href)

## Examples

**BMW (bmwusa.com):**
- Dark bg (#1c1c1c), BMWTypeNext font, blue button (#1c69d4), square corners, uppercase
- Fallback: "Discover What's Right for You" / "Get personalized recommendations..." / "Explore Now"

**NVIDIA (nvidia.com):**
- Dark bg (#1a1a1a), green top border (#76b900), green button, sharp corners, uppercase
- Fallback: "Discover Solutions for You" / "Explore GPUs, AI platforms..." / "Explore Now"

**Amazon Ads (advertising.amazon.com):**
- Squid ink bg (#232f3e), Amazon Ember font, orange pill button (#ff9900)
- Fallback: "Discover What Works for Your Brand" / "Get personalized advertising..." / "Get Started"

## Completion (pipeline mode)

When running as part of the OF1 pipeline, write your status after completing:

```bash
mkdir -p /shared/of1-demo
echo '{"step":11,"status":"done","summary":"CTA template generated: [brief visual description]"}' > /shared/of1-demo/step-11-status.json
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
