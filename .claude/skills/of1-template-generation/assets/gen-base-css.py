#!/usr/bin/env python3
"""Generate styles/of1-base.css deterministically from stardust DESIGN.json.

Same input → identical output, so multiple parallel intent agents can all run
this without producing diffs. Output covers every utility class the 25 OF1
templates rely on: layout primitives, hero shell, CTA variants, card grids,
split promos, section heads, plus responsive breakpoints.

Usage:
    python3 gen-base-css.py <repo-dir>
        Reads:  <repo-dir>/stardust/current/DESIGN.json
        Writes: <repo-dir>/styles/of1-base.css
"""

import json
import sys
from pathlib import Path


DEFAULTS = {
    "bg": "#FFFFFF",
    "fg": "#111111",
    "muted": "#666666",
    "accent": "#0066FF",
    "accent_hover": "#0050CC",
    "accent_fg": "#FFFFFF",
    "link": "#0066FF",
    "surface": "#F5F5F5",
    "surface_cream": "#FAF7F0",
    "surface_dark": "#202020",
    "border": "#E5E5E5",
    "radius": "12px",
    "shadow_card": "0 2px 8px rgba(0,0,0,0.08)",
    "max_width": "1200px",
    "font_display": "Georgia, 'Times New Roman', Times, serif",
    "font_body": "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    "font_mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}


def _darken(hex_color, factor=0.92):
    """Return a slightly darker hex color for hover states. Deterministic."""
    s = hex_color.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return hex_color
    try:
        r, g, b = (int(s[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return hex_color
    r, g, b = (max(0, min(255, int(v * factor))) for v in (r, g, b))
    return f"#{r:02X}{g:02X}{b:02X}"


def resolve_tokens(design):
    colors = design.get("colors") or {}
    typography = design.get("typography") or {}
    spacing = design.get("spacing") or {}
    rounded = design.get("rounded") or {}
    shadows = design.get("shadows") or {}
    components = design.get("components") or {}
    button = components.get("button") or {}

    primary_bg = button.get("primaryBg") or colors.get("primary") or DEFAULTS["accent"]
    primary_fg = button.get("primaryText") or colors.get("background") or DEFAULTS["accent_fg"]
    fg = colors.get("text") or DEFAULTS["fg"]

    radius_raw = rounded.get("default", DEFAULTS["radius"])
    radius = "0" if radius_raw in (None, "", "0", "0px") else str(radius_raw)

    display = typography.get("display") or {}
    body = typography.get("body") or {}

    return {
        "bg": colors.get("background") or DEFAULTS["bg"],
        "fg": fg,
        "muted": colors.get("muted") or colors.get("textSecondary") or DEFAULTS["muted"],
        "accent": primary_bg,
        "accent_hover": _darken(primary_bg),
        "accent_fg": primary_fg,
        "link": colors.get("accent") or colors.get("primary") or DEFAULTS["link"],
        "surface": colors.get("surface") or DEFAULTS["surface"],
        "surface_cream": colors.get("surfaceCream") or colors.get("surface") or DEFAULTS["surface_cream"],
        "surface_dark": colors.get("surfaceDark") or fg,
        "border": colors.get("border") or DEFAULTS["border"],
        "radius": radius,
        "shadow_card": shadows.get("card") or DEFAULTS["shadow_card"],
        "max_width": spacing.get("containerMaxWidth") or DEFAULTS["max_width"],
        "font_display": display.get("stack") or DEFAULTS["font_display"],
        "font_body": body.get("stack") or DEFAULTS["font_body"],
        "font_mono": DEFAULTS["font_mono"],
        "font_imports": _font_imports(typography),
    }


def _font_imports(typography):
    """Return @import url(...) lines for Google Fonts referenced in DESIGN.json."""
    urls = []
    for key in ("display", "body"):
        section = typography.get(key) or {}
        url = section.get("googleFontsUrl")
        if url and url not in urls:
            urls.append(url)
    if not urls:
        return ""
    return "\n".join(f'@import url("{u}");' for u in urls) + "\n\n"


CSS_TEMPLATE = """/* of1-base.css — shared tokens + utilities for all of1-* templates.
   Generated deterministically by gen-base-css.py from stardust DESIGN.json.
   Do not hand-edit; re-run the script with an updated DESIGN.json. */

{font_imports}:root {{
  --of1-bg: {bg};
  --of1-fg: {fg};
  --of1-muted: {muted};
  --of1-accent: {accent};
  --of1-accent-hover: {accent_hover};
  --of1-accent-fg: {accent_fg};
  --of1-link: {link};
  --of1-surface: {surface};
  --of1-surface-cream: {surface_cream};
  --of1-surface-dark: {surface_dark};
  --of1-border: {border};
  --of1-radius: {radius};
  --of1-radius-pill: 9999px;
  --of1-shadow-card: {shadow_card};
  --of1-max-width: {max_width};
  --of1-font-display: {font_display};
  --of1-font-body: {font_body};
  --of1-font-mono: {font_mono};
}}

* {{ box-sizing: border-box; }}

main {{
  font-family: var(--of1-font-body);
  font-size: 16px;
  line-height: 1.5;
  color: var(--of1-fg);
  background: var(--of1-bg);
  -webkit-font-smoothing: antialiased;
}}

main img {{ max-width: 100%; display: block; }}
main a {{ color: inherit; text-decoration: none; }}
main h1, main h2, main h3, main h4 {{
  font-family: var(--of1-font-display);
  font-weight: 400;
  margin: 0;
  line-height: 1.2;
  color: var(--of1-fg);
}}
main p {{ margin: 0 0 1em 0; }}
main ul {{ padding: 0; margin: 0 0 1em 1.2em; }}
main ul li {{ margin-bottom: 8px; }}

/* Layout primitives */
.of1-section {{ padding: 64px 0; }}
.of1-section-tight {{ padding: 48px 0; }}

.of1-section-dark {{
  background: var(--of1-surface-dark);
  color: #fff;
}}
.of1-section-dark h1,
.of1-section-dark h2,
.of1-section-dark h3,
.of1-section-dark h4 {{ color: #fff; }}
.of1-section-dark p {{ color: rgba(255,255,255,0.85); }}

.of1-section-cream {{ background: var(--of1-surface); }}

.of1-inner {{
  max-width: var(--of1-max-width);
  margin: 0 auto;
  padding: 0 32px;
}}

.of1-inner-narrow {{
  max-width: 880px;
  margin: 0 auto;
  padding: 0 32px;
}}

/* Uppercase eyebrow / kicker */
.of1-eyebrow {{
  font-family: var(--of1-font-body);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--of1-muted);
  margin: 0 0 12px;
  display: block;
}}

/* Hero shell — used by every template */
.of1-hero {{
  background: var(--of1-surface);
  padding: 0;
  position: relative;
}}

.of1-hero-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
  min-height: 460px;
  max-width: var(--of1-max-width);
  margin: 0 auto;
}}

.of1-hero-text {{
  padding: 72px 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}

.of1-hero-text h1 {{
  font-size: 48px;
  margin: 0 0 18px;
  line-height: 1.1;
}}

.of1-hero-text p {{
  font-size: 17px;
  color: var(--of1-fg);
  max-width: 480px;
  margin-bottom: 28px;
  line-height: 1.6;
}}

.of1-hero-media {{
  min-height: 460px;
  background: #e8e8e8;
  overflow: hidden;
}}

.of1-hero-media img {{
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}}

/* Collapse empty image holders */
.of1-hero-media:has(> img[src=""]),
.of1-hero-media:not(:has(img)) {{ display: none; }}
.of1-hero:has(.of1-hero-media:empty) .of1-hero-grid,
.of1-hero:has(.of1-hero-media:not(:has(img))) .of1-hero-grid {{ grid-template-columns: 1fr; }}

.of1-hero-ctas {{
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}}

/* CTA primary */
.of1-cta {{
  display: inline-block;
  background: var(--of1-accent);
  color: var(--of1-accent-fg);
  padding: 14px 28px;
  border-radius: var(--of1-radius);
  font-family: var(--of1-font-body);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.2s ease;
}}
.of1-cta:hover {{ background: var(--of1-accent-hover); }}

.of1-cta-primary {{
  background: var(--of1-accent);
  color: var(--of1-accent-fg);
}}

.of1-cta-secondary {{
  background: transparent;
  border: 1px solid var(--of1-fg);
  color: var(--of1-fg);
}}
.of1-cta-secondary:hover {{ background: var(--of1-fg); color: #fff; }}

.of1-cta-link {{
  background: transparent;
  padding: 14px 0;
  color: var(--of1-fg);
  border-bottom: 2px solid var(--of1-accent);
}}
.of1-cta-link:hover {{ background: transparent; color: var(--of1-fg); }}

/* Card grid — 4-col with auto-fit by data-item-count */
.of1-cmp-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
}}
.of1-cmp-grid[data-item-count="1"] {{ grid-template-columns: minmax(0, 720px); justify-content: center; }}
.of1-cmp-grid[data-item-count="2"] {{ grid-template-columns: repeat(2, 1fr); }}
.of1-cmp-grid[data-item-count="3"] {{ grid-template-columns: repeat(3, 1fr); }}

/* Generic card */
.of1-card {{
  display: block;
  background: transparent;
}}
.of1-card img {{
  aspect-ratio: 4 / 3;
  width: 100%;
  object-fit: cover;
  margin-bottom: 14px;
}}
.of1-card h3 {{
  font-family: var(--of1-font-body);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--of1-fg);
  line-height: 1.4;
  margin: 0 0 8px;
}}
.of1-card p {{
  font-size: 14px;
  color: var(--of1-muted);
  line-height: 1.5;
  margin: 0 0 14px;
}}
.of1-card a {{
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--of1-fg);
  border-bottom: 2px solid var(--of1-accent);
  padding-bottom: 2px;
}}

/* Split promo — image left + text right (or reversed) */
.of1-split {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
  background: var(--of1-surface);
}}
.of1-split-media {{ min-height: 420px; }}
.of1-split-media img {{ width: 100%; height: 100%; object-fit: cover; }}
.of1-split-text {{
  padding: 64px 56px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}}
.of1-split-text h2 {{ font-size: 38px; margin: 0 0 18px; line-height: 1.15; }}
.of1-split-text p {{ font-size: 16px; max-width: 460px; margin-bottom: 24px; line-height: 1.6; }}

/* Section heading utility */
.of1-section-head {{ margin-bottom: 36px; }}
.of1-section-head h2 {{ font-size: 32px; margin: 0; }}
.of1-section-head p {{ font-size: 16px; color: var(--of1-muted); max-width: 640px; margin-top: 14px; }}

/* Auto-hidden cards from the worker's render */
article[hidden] {{ display: none !important; }}

/* Responsive */
@media (max-width: 960px) {{
  .of1-hero-grid, .of1-split {{ grid-template-columns: 1fr; }}
  .of1-cmp-grid,
  .of1-cmp-grid[data-item-count="3"],
  .of1-cmp-grid[data-item-count="4"] {{ grid-template-columns: repeat(2, 1fr); }}
  .of1-hero-text {{ padding: 48px 32px; }}
  .of1-hero-text h1 {{ font-size: 36px; }}
  .of1-split-text {{ padding: 48px 32px; }}
}}
@media (max-width: 640px) {{
  .of1-cmp-grid,
  .of1-cmp-grid[data-item-count="2"],
  .of1-cmp-grid[data-item-count="3"],
  .of1-cmp-grid[data-item-count="4"] {{ grid-template-columns: 1fr; }}
  .of1-inner, .of1-inner-narrow {{ padding: 0 20px; }}
  .of1-section {{ padding: 48px 0; }}
}}
"""


def main(argv):
    if len(argv) < 2:
        print("usage: gen-base-css.py <repo-dir>", file=sys.stderr)
        return 2
    repo_dir = Path(argv[1]).resolve()
    design_path = repo_dir / "stardust" / "current" / "DESIGN.json"
    out_path = repo_dir / "styles" / "of1-base.css"

    if not design_path.exists():
        print(f"DESIGN.json not found at {design_path}", file=sys.stderr)
        return 1

    with design_path.open() as f:
        design = json.load(f)

    tokens = resolve_tokens(design)
    css = CSS_TEMPLATE.format(**tokens)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        with out_path.open() as f:
            if f.read() == css:
                print(f"of1-base.css unchanged ({out_path})")
                return 0
    with out_path.open("w") as f:
        f.write(css)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
