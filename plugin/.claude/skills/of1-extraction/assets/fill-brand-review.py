#!/usr/bin/env python3
"""
fill-brand-review.py — mechanical brand-review.html generator

Usage:
    python3 fill-brand-review.py <repo-dir> <domain>

Args:
    repo-dir  Path to the repo root (contains stardust/current/DESIGN.json)
    domain    Demo domain name displayed in the report header

Output:
    <repo-dir>/deliverables/brand-review.html
"""

import sys
import json
import os
import shutil
import re
from datetime import datetime, timezone
from pathlib import Path

# ── helpers ──────────────────────────────────────────────────────────────────

def safe_get(d, *keys, default=""):
    """Nested dict getter with a default."""
    val = d
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
    return val if val != "" else default


def hex_luminance(hex_color):
    """Return perceived luminance (0-1) for a hex color string."""
    h = hex_color.lstrip("#")
    if len(h) not in (3, 6):
        return 0.5
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    except ValueError:
        return 0.5


def text_on_color(hex_color):
    """Return a legible text color (dark or light) for a given background hex."""
    return "#1C1917" if hex_luminance(hex_color) > 0.5 else "#F5F0E8"


GOOGLE_FONT_FAMILIES = {
    # common Google Fonts — extend as needed
    "roboto", "open sans", "lato", "montserrat", "oswald", "raleway",
    "poppins", "merriweather", "ubuntu", "nunito", "inter", "playfair display",
    "source sans pro", "pt sans", "lora", "noto sans", "rubik", "work sans",
    "titillium web", "fira sans", "barlow", "josefin sans", "mukta",
    "dm sans", "mulish", "exo 2", "outfit", "quicksand", "manrope",
    "cormorant garamond", "libre baskerville", "crimson text", "EB garamond",
    "spectral", "baskerville", "garamond", "times new roman", "georgia",
    "jetbrains mono", "fira mono", "source code pro", "inconsolata",
    "space mono", "courier prime", "dm mono",
}


def first_font_name(family_string):
    """Extract the first font name from a CSS font-family string."""
    first = family_string.split(",")[0].strip().strip("'\"")
    return first


def looks_like_google_font(family_string):
    """Heuristic: is the first font likely available on Google Fonts?"""
    name = first_font_name(family_string).lower()
    return name in GOOGLE_FONT_FAMILIES


def google_font_link(family_string):
    """Generate a Google Fonts <link> tag for the given font family string."""
    name = first_font_name(family_string)
    encoded = name.replace(" ", "+")
    href = (
        f"https://fonts.googleapis.com/css2?family={encoded}"
        f":ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap"
    )
    return f'<link href="{href}" rel="stylesheet">'


# ── section generators ────────────────────────────────────────────────────────

def build_color_swatches(colors: dict) -> str:
    if not colors:
        return '<div class="empty-state">No color data extracted.</div>'

    items = []
    for name, hex_val in colors.items():
        if not hex_val:
            continue
        text_color = text_on_color(hex_val)
        items.append(
            f'<div class="swatch">'
            f'  <div class="swatch-color" style="background:{hex_val};"></div>'
            f'  <div class="swatch-info">'
            f'    <span class="swatch-name">{name}</span>'
            f'    <span class="swatch-hex">{hex_val}</span>'
            f'  </div>'
            f'</div>'
        )

    return f'<div class="swatches-grid">{"".join(items)}</div>'


def build_typography_section(typography: dict) -> tuple[str, list[str]]:
    """Returns (html, extra_font_links)."""
    if not typography:
        return '<div class="empty-state">No typography data extracted.</div>', []

    font_links = []
    cards = []

    for role in ("heading", "body"):
        t = typography.get(role, {})
        family = safe_get(t, "family", default="(not extracted)")
        weight = safe_get(t, "weight", default="400")
        style  = safe_get(t, "style",  default="normal")

        if looks_like_google_font(family):
            font_links.append(google_font_link(family))

        font_css = f'font-family:{family};font-weight:{weight};font-style:{style};'

        if role == "heading":
            preview = (
                f'<div class="typo-preview-heading" style="{font_css}">'
                f'The quick brown fox jumps'
                f'</div>'
            )
            label = "Heading Font"
        else:
            preview = (
                f'<div class="typo-preview-body" style="{font_css}">'
                f'The quick brown fox jumps over the lazy dog. '
                f'Bright vixens jump; dozy fowl quack.'
                f'</div>'
            )
            label = "Body Font"

        first_name = first_font_name(family)
        cards.append(
            f'<div class="typo-card">'
            f'  <div class="typo-label">{label}</div>'
            f'  {preview}'
            f'  <div class="typo-meta">'
            f'    <span><b>Family:</b> {first_name}</span>'
            f'    <span><b>Stack:</b>  {family}</span>'
            f'    <span><b>Weight:</b> {weight}</span>'
            f'    <span><b>Style:</b>  {style}</span>'
            f'  </div>'
            f'</div>'
        )

    html = f'<div class="typo-grid">{"".join(cards)}</div>'
    return html, font_links


def build_shapes_section(shapes: dict, spacing: dict) -> str:
    parts = []

    # Shapes
    if shapes:
        shape_cards = []
        for key, props in shapes.items():
            if not isinstance(props, dict):
                continue
            radius = props.get("borderRadius", "0px")
            shape_cards.append(
                f'<div class="shape-card">'
                f'  <span class="shape-label">{key}</span>'
                f'  <div class="shape-preview-box" style="border-radius:{radius};"></div>'
                f'  <span class="shape-value">border-radius: {radius}</span>'
                f'</div>'
            )
        if shape_cards:
            parts.append(
                f'<div class="shapes-grid">{"".join(shape_cards)}</div>'
            )

    # Spacing
    if spacing:
        spacing_cards = []
        for key, val in spacing.items():
            if val:
                spacing_cards.append(
                    f'<div class="spacing-card">'
                    f'  <div class="spacing-label">{key}</div>'
                    f'  <div class="spacing-value">{val}</div>'
                    f'</div>'
                )
        if spacing_cards:
            parts.append(
                f'<h3 style="font-family:var(--font-head);font-weight:400;'
                f'font-size:1.1rem;color:var(--fg-dim);margin:28px 0 12px;">Spacing</h3>'
                f'<div class="spacing-grid">{"".join(spacing_cards)}</div>'
            )

    if not parts:
        return '<div class="empty-state">No shape or spacing data extracted.</div>'

    return "".join(parts)


def build_logo_section(logo_svg_content: str | None) -> str:
    if not logo_svg_content:
        return '<div class="logo-well"><p class="logo-not-found">Logo SVG not found.</p></div>'

    # Sanitise: strip XML declaration / doctype
    svg = re.sub(r'<\?xml[^>]*\?>', '', logo_svg_content)
    svg = re.sub(r'<!DOCTYPE[^>]*>', '', svg, flags=re.IGNORECASE)
    svg = svg.strip()

    return (
        f'<div class="logo-well">'
        f'  <div class="logo-variants">'
        f'    <div>'
        f'      <div class="logo-variant-label">On Dark</div>'
        f'      <div class="logo-on-dark logo-display">{svg}</div>'
        f'    </div>'
        f'    <div>'
        f'      <div class="logo-variant-label">On Light</div>'
        f'      <div class="logo-on-light logo-display">{svg}</div>'
        f'    </div>'
        f'  </div>'
        f'</div>'
    )


def build_screenshots_section(screenshot_paths: list[tuple[str, str]]) -> str:
    """
    screenshot_paths: list of (web_path, caption) tuples
    web_path is the relative URL used in the <img src>.
    """
    if not screenshot_paths:
        return '<div class="empty-state">No screenshots found.</div>'

    items = []
    for web_path, caption in screenshot_paths:
        items.append(
            f'<div class="screenshot-item">'
            f'  <div class="screenshot-caption">{caption}</div>'
            f'  <img src="{web_path}" alt="Screenshot: {caption}" loading="lazy">'
            f'</div>'
        )

    return f'<div class="screenshots-list">{"".join(items)}</div>'


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: fill-brand-review.py <repo-dir> <domain>", file=sys.stderr)
        sys.exit(1)

    repo_dir = Path(sys.argv[1]).resolve()
    domain   = sys.argv[2]

    # ── Locate DESIGN.json ────────────────────────────────────────────────────
    design_path = repo_dir / "stardust" / "current" / "DESIGN.json"
    if not design_path.exists():
        # Fallback: look in deliverables
        alt = repo_dir / "deliverables" / "DESIGN.json"
        if alt.exists():
            design_path = alt
        else:
            print(f"ERROR: DESIGN.json not found at {design_path}", file=sys.stderr)
            sys.exit(1)

    with open(design_path, encoding="utf-8") as f:
        design = json.load(f)

    colors     = design.get("colors", {})
    typography = design.get("typography", {})
    shapes     = design.get("shapes", {})
    spacing    = design.get("spacing", {})

    # ── Locate logo SVG ───────────────────────────────────────────────────────
    logo_candidates = [
        repo_dir / "stardust" / "current" / "assets" / "logo.svg",
        repo_dir / "deliverables" / "assets" / "logo.svg",
        repo_dir / "stardust" / "current" / "logo.svg",
    ]
    logo_svg_content = None
    for candidate in logo_candidates:
        if candidate.exists():
            with open(candidate, encoding="utf-8") as f:
                logo_svg_content = f.read()
            break

    # ── Locate screenshots ────────────────────────────────────────────────────
    deliverables_dir    = repo_dir / "deliverables"
    screenshots_deliver = deliverables_dir / "assets" / "screenshots"
    screenshots_stardust = repo_dir / "stardust" / "current" / "assets" / "screenshots"

    # Ensure deliverables/assets/screenshots/ exists
    screenshots_deliver.mkdir(parents=True, exist_ok=True)

    # Copy from stardust if not already in deliverables
    if screenshots_stardust.exists():
        for png in sorted(screenshots_stardust.glob("*.png")):
            dest = screenshots_deliver / png.name
            if not dest.exists():
                shutil.copy2(png, dest)

    screenshot_paths = []
    if screenshots_deliver.exists():
        for png in sorted(screenshots_deliver.glob("*.png")):
            # Web path relative to repo root (works on EDS preview URL)
            web_path = f"/deliverables/assets/screenshots/{png.name}"
            caption  = png.stem.replace("-", " ").replace("_", " ").title()
            screenshot_paths.append((web_path, caption))

    # ── Build HTML fragments ──────────────────────────────────────────────────
    color_swatches_html  = build_color_swatches(colors)
    typography_html, extra_font_links = build_typography_section(typography)
    shapes_html          = build_shapes_section(shapes, spacing)
    logo_html            = build_logo_section(logo_svg_content)
    screenshots_html     = build_screenshots_section(screenshot_paths)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    extra_font_links_html = "\n  ".join(dict.fromkeys(extra_font_links))  # deduplicated

    # ── Load template ─────────────────────────────────────────────────────────
    template_candidates = [
        Path("/shared/brand-review-template.html"),
        repo_dir / "tools" / "brand-review-template.html",
        Path(__file__).parent / "brand-review-template.html",
    ]
    template_path = None
    for candidate in template_candidates:
        if candidate.exists():
            template_path = candidate
            break

    if template_path is None:
        print("ERROR: brand-review-template.html not found.", file=sys.stderr)
        sys.exit(1)

    with open(template_path, encoding="utf-8") as f:
        template = f.read()

    # ── Fill placeholders ─────────────────────────────────────────────────────
    output = template
    output = output.replace("{{DOMAIN}}",               domain)
    output = output.replace("{{TIMESTAMP}}",            timestamp)
    output = output.replace("{{EXTRA_FONT_LINKS}}",     extra_font_links_html)
    output = output.replace("{{COLOR_SWATCHES}}",       color_swatches_html)
    output = output.replace("{{TYPOGRAPHY_SECTION}}",   typography_html)
    output = output.replace("{{SHAPES_SECTION}}",       shapes_html)
    output = output.replace("{{LOGO_SECTION}}",         logo_html)
    output = output.replace("{{SCREENSHOTS_SECTION}}", screenshots_html)

    # ── Write output ──────────────────────────────────────────────────────────
    out_path = deliverables_dir / "brand-review.html"
    deliverables_dir.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"✓  Brand review written to: {out_path}")
    print(f"   Colors:       {len(colors)} extracted")
    print(f"   Fonts:        {len(typography)} extracted")
    print(f"   Logo:         {'found' if logo_svg_content else 'not found'}")
    print(f"   Screenshots:  {len(screenshot_paths)} found")


if __name__ == "__main__":
    main()
