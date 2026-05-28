#!/usr/bin/env python3
"""
snowflake-split.py — Mechanically transform a prototype HTML file into all
EDS snowflake overlay artifacts.

Usage:
    python3 snowflake-split.py <prototype.html> \
        --output-dir /workspace/of1-demo \
        --branch frescopa-2 \
        --owner aem-growth-adoption \
        --repo of1-demo

Output files (given prototype-home.html):
    templates/prototype-home.html
    styles/prototype-home.css
    fragments/prototype-home/header.html
    fragments/prototype-home/footer.html
    .snowflake/projects/1-prototype-home/da/prototype-home.html
"""

import argparse
import os
import re
import sys
from html.parser import HTMLParser


# ---------------------------------------------------------------------------
# Tiny HTML helpers (stdlib only — no lxml, no BeautifulSoup)
# ---------------------------------------------------------------------------

def read_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()

def write_output(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✓  {path}")


# ---------------------------------------------------------------------------
# Low-level regex helpers
# ---------------------------------------------------------------------------

def extract_between(html, start_pattern, end_pattern, flags=re.DOTALL | re.IGNORECASE):
    """Return the content between two regex patterns (non-greedy)."""
    m = re.search(start_pattern + r"(.*?)" + end_pattern, html, flags)
    return m.group(1) if m else ""

def find_tag_and_content(html, tag, attrs_pattern=""):
    """
    Return (full_match, inner_content) for the FIRST occurrence of <tag ...>...</tag>.
    attrs_pattern is an optional regex fragment matched after the tag name.
    """
    pattern = rf"(<{tag}{attrs_pattern}[^>]*>)(.*?)(</{tag}>)"
    m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(0), m.group(2)
    return None, None

def get_attr(tag_html, attr):
    """Extract an attribute value from a tag string."""
    m = re.search(rf'{attr}=["\']([^"\']*)["\']', tag_html, re.IGNORECASE)
    return m.group(1) if m else ""

def get_class(tag_html):
    return get_attr(tag_html, "class")

def strip_outer_tag(html, tag):
    """Remove the outermost opening and closing tag, return inner content."""
    inner = re.sub(rf"^\s*<{tag}[^>]*>", "", html, count=1, flags=re.IGNORECASE)
    inner = re.sub(rf"</{tag}>\s*$", "", inner, count=1, flags=re.IGNORECASE)
    return inner.strip()


# ---------------------------------------------------------------------------
# Extract <style> blocks
# ---------------------------------------------------------------------------

def extract_styles(html):
    """Return concatenated content of all <style> blocks."""
    parts = re.findall(r"<style[^>]*>(.*?)</style>", html, re.DOTALL | re.IGNORECASE)
    return "\n\n".join(p.strip() for p in parts)


# ---------------------------------------------------------------------------
# Extract Google Fonts <link> tags from <head>
# ---------------------------------------------------------------------------

def extract_google_font_links(html):
    """Return all <link> tags referencing fonts.googleapis.com."""
    links = re.findall(
        r'<link[^>]*fonts\.googleapis\.com[^>]*/?>',
        html, re.IGNORECASE
    )
    return "\n".join(links)


# ---------------------------------------------------------------------------
# Structural dissection
# ---------------------------------------------------------------------------

def find_header_block(html):
    """
    Return everything from <body> (exclusive) up to and including </header>
    (or up to the first <section> if no </header>).
    Includes announcement bars, the <header> element, etc.
    """
    # Find start of body content (after <body ...>)
    body_start_m = re.search(r"<body[^>]*>", html, re.IGNORECASE)
    if not body_start_m:
        return ""
    body_content = html[body_start_m.end():]

    # Find end of </header>
    header_end_m = re.search(r"</header>", body_content, re.IGNORECASE)
    if header_end_m:
        return body_content[:header_end_m.end()].strip()

    # Fallback: everything before the first <section
    section_start_m = re.search(r"<section[\s>]", body_content, re.IGNORECASE)
    if section_start_m:
        return body_content[:section_start_m.start()].strip()

    return ""


def find_footer_block(html):
    """Return the <footer>...</footer> block."""
    m = re.search(r"(<footer[^>]*>.*?</footer>)", html, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""


def find_content_sections(html):
    """
    Return the HTML between </header> (or <body>) and <footer> as raw text.
    This is the material that goes into <main>.
    """
    # Strip everything up through </header>
    after_header_m = re.search(r"</header>", html, re.IGNORECASE)
    if after_header_m:
        after_header = html[after_header_m.end():]
    else:
        # No header tag — try after <body>
        body_m = re.search(r"<body[^>]*>", html, re.IGNORECASE)
        after_header = html[body_m.end():] if body_m else html

    # Strip from <footer onward
    footer_m = re.search(r"<footer[\s>]", after_header, re.IGNORECASE)
    if footer_m:
        content = after_header[:footer_m.start()]
    else:
        content = after_header

    # If the content has a <main> tag, unwrap it
    main_m = re.search(r"<main[^>]*>(.*?)</main>", content, re.DOTALL | re.IGNORECASE)
    if main_m:
        content = main_m.group(1)

    return content.strip()


# ---------------------------------------------------------------------------
# Section class extraction
# ---------------------------------------------------------------------------

def extract_section_classes(content_html):
    """
    Return a list of CSS class names for every top-level <section> element.
    """
    classes = []
    for m in re.finditer(r"<section([^>]*)>", content_html, re.IGNORECASE):
        cls = get_attr(m.group(1), "class")
        if cls:
            # Take only the first class as the canonical section name
            classes.append(cls.split()[0])
    return classes


# ---------------------------------------------------------------------------
# data-slot injection
# ---------------------------------------------------------------------------

def slugify_class(cls):
    """Convert a CSS class like 'teaser-content' to a slug-safe string."""
    return re.sub(r"[^a-z0-9-]", "-", cls.lower()).strip("-")


class SlotInjector:
    """
    Walk through the content HTML and inject data-slot attributes on
    eligible heading, paragraph, and anchor elements.
    """

    def __init__(self, content_html):
        self.html = content_html
        self._counters = {}  # track duplicates per (section, type)

    def _slot_name(self, section_cls, element_type):
        key = (section_cls, element_type)
        count = self._counters.get(key, 0)
        self._counters[key] = count + 1
        base = f"{slugify_class(section_cls)}-{element_type}"
        return base if count == 0 else f"{base}-{count + 1}"

    def _inject_slot_on_tag(self, tag_html, slot_name):
        """Add data-slot="..." to an opening tag."""
        # Insert before the closing > of the opening tag
        return re.sub(r"(\s*/?>)", f' data-slot="{slot_name}"\\1', tag_html, count=1)

    def _text_content(self, html_fragment):
        """Strip all tags and return plain text."""
        return re.sub(r"<[^>]+>", "", html_fragment).strip()

    def inject(self):
        """Return the HTML with data-slot attributes injected."""
        result = self.html
        # Process section by section so we can use section class in slot names
        def process_section(m):
            section_open = m.group(1)   # <section ...>
            section_body = m.group(2)   # inner content
            section_close = m.group(3)  # </section>

            section_cls_raw = get_attr(section_open, "class") or "section"
            section_cls = section_cls_raw.split()[0]  # first class only

            processed_body = self._process_section_body(section_body, section_cls)
            return section_open + processed_body + section_close

        result = re.sub(
            r"(<section[^>]*>)(.*?)(</section>)",
            process_section,
            result,
            flags=re.DOTALL | re.IGNORECASE,
        )
        return result

    def _process_section_body(self, body, section_cls):
        """Inject data-slot on headings, paragraphs, and CTAs within a section."""
        # Reset per-section counters
        # (We keep a global _counters dict keyed by (section_cls, type) —
        #  this naturally handles multiple sections with different classes.)

        def replace_heading(m):
            full = m.group(0)
            tag = m.group(1)   # h1, h2, h3, h4
            attrs = m.group(2)
            inner = m.group(3)
            text = self._text_content(inner)
            if not text:
                return full
            slot = self._slot_name(section_cls, "heading")
            new_open = f"<{tag}{attrs}"
            if "data-slot" not in attrs:
                new_open += f' data-slot="{slot}"'
            new_open += ">"
            return new_open + inner + f"</{tag}>"

        body = re.sub(
            r"<(h[1-4])([^>]*)>(.*?)</h[1-4]>",
            replace_heading,
            body,
            flags=re.DOTALL | re.IGNORECASE,
        )

        def replace_para(m):
            full = m.group(0)
            attrs = m.group(1)
            inner = m.group(2)
            text = self._text_content(inner)
            if len(text) <= 20:
                return full  # too short — likely a label, skip
            slot = self._slot_name(section_cls, "body")
            new_open = f"<p{attrs}"
            if "data-slot" not in attrs:
                new_open += f' data-slot="{slot}"'
            new_open += ">"
            return new_open + inner + "</p>"

        body = re.sub(
            r"<p([^>]*)>(.*?)</p>",
            replace_para,
            body,
            flags=re.DOTALL | re.IGNORECASE,
        )

        def replace_cta(m):
            full = m.group(0)
            attrs = m.group(1)
            inner = m.group(2)
            cls = get_attr(attrs, "class")
            # Only tag anchors that look like CTAs
            if not re.search(r"(cta|btn|button|link)", cls, re.IGNORECASE):
                return full
            text = self._text_content(inner)
            if not text:
                return full
            slot = self._slot_name(section_cls, "cta")
            new_open = f"<a{attrs}"
            if "data-slot" not in attrs:
                new_open += f' data-slot="{slot}"'
            new_open += ">"
            return new_open + inner + "</a>"

        body = re.sub(
            r"<a([^>]*)>(.*?)</a>",
            replace_cta,
            body,
            flags=re.DOTALL | re.IGNORECASE,
        )

        return body


# ---------------------------------------------------------------------------
# Slot extraction (for DA document)
# ---------------------------------------------------------------------------

def extract_slots_from_template(template_html):
    """
    Parse the template HTML and return a dict:
        { section_class: [ {slot, tag, text, href}, ... ], ... }
    Only elements with data-slot attributes are included.
    Images are excluded.
    """
    sections = {}
    current_section = None

    # Find sections
    for sec_m in re.finditer(
        r"<section([^>]*)>(.*?)</section>",
        template_html,
        re.DOTALL | re.IGNORECASE,
    ):
        sec_attrs = sec_m.group(1)
        sec_body = sec_m.group(2)
        cls = get_attr(sec_attrs, "class") or "section"
        current_section = cls.split()[0]
        slots = []

        # Find all elements with data-slot
        for el_m in re.finditer(
            r"<(h[1-6]|p|a)([^>]*data-slot=[^>]*)>(.*?)</\1>",
            sec_body,
            re.DOTALL | re.IGNORECASE,
        ):
            tag = el_m.group(1).lower()
            el_attrs = el_m.group(2)
            inner = el_m.group(3)
            slot_name = get_attr(el_attrs, "data-slot")
            href = get_attr(el_attrs, "href") if tag == "a" else ""
            text = re.sub(r"<[^>]+>", "", inner).strip()

            if not slot_name or not text:
                continue

            slots.append({
                "slot": slot_name,
                "tag": tag,
                "text": text,
                "href": href,
            })

        if slots:
            sections[current_section] = slots

    return sections


# ---------------------------------------------------------------------------
# CSS rename helpers
# ---------------------------------------------------------------------------

def rename_header_footer_css(css):
    """
    Rename .header → .site-header and .footer → .site-footer in CSS selectors.
    Careful to only rename standalone .header / .footer, not e.g. .header-nav.
    """
    # .header followed by non-word (space, comma, { , :, ., etc.) or end of string
    css = re.sub(r"\.header(?=[^-\w]|$)", ".site-header", css)
    css = re.sub(r"\.footer(?=[^-\w]|$)", ".site-footer", css)
    return css


# ---------------------------------------------------------------------------
# Rename class="header" → class="site-header" in HTML
# ---------------------------------------------------------------------------

def rename_header_footer_html(html):
    """
    In the header/footer fragment HTML, rename class="header" → "site-header"
    and class="footer" → "site-footer" to avoid EDS collision.
    Only renames exact matches (not compound classes like "header-nav").
    """
    def replace_class(m):
        cls = m.group(1)
        parts = cls.split()
        new_parts = []
        for p in parts:
            if p == "header":
                new_parts.append("site-header")
            elif p == "footer":
                new_parts.append("site-footer")
            else:
                new_parts.append(p)
        return f'class="{" ".join(new_parts)}"'

    return re.sub(r'class="([^"]*)"', replace_class, html)


# ---------------------------------------------------------------------------
# Build output 1: templates/{slug}.html
# ---------------------------------------------------------------------------

def build_template(content_html, slug, google_fonts):
    injector = SlotInjector(content_html)
    slotted = injector.inject()

    lines = []
    if google_fonts:
        lines.append(google_fonts)
        lines.append("")
    lines.append("<main>")
    lines.append(slotted)
    lines.append("</main>")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Build output 2: styles/{slug}.css
# ---------------------------------------------------------------------------

def build_css(raw_css, section_classes):
    eds_resets = """\
/* EDS block wrapper resets */
.header-wrapper { max-width: 100% !important; padding: 0 !important; }
.header.block { display: block !important; }
.footer-wrapper { max-width: 100% !important; padding: 0 !important; }
.footer.block { display: block !important; }
"""
    wrapper_overrides = "\n".join(
        f".{cls}-wrapper {{ max-width: 100% !important; padding: 0 !important; }}"
        for cls in section_classes
    )

    renamed_css = rename_header_footer_css(raw_css)

    parts = [eds_resets, wrapper_overrides, "", renamed_css]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Build output 3: fragments/{slug}/header.html
# ---------------------------------------------------------------------------

def build_header_fragment(header_block_html):
    return rename_header_footer_html(header_block_html)


# ---------------------------------------------------------------------------
# Build output 4: fragments/{slug}/footer.html
# ---------------------------------------------------------------------------

def build_footer_fragment(footer_block_html):
    return rename_header_footer_html(footer_block_html)


# ---------------------------------------------------------------------------
# Build output 5: .snowflake/projects/1-{slug}/da/{slug}.html
# ---------------------------------------------------------------------------

def build_da_document(slots_by_section, slug):
    """
    Build the minimal DA content document from extracted slot data.
    """
    lines = [
        "<html>",
        "<body>",
        "  <header></header>",
        "  <main>",
    ]

    for section_cls, slots in slots_by_section.items():
        lines.append("    <div>")
        lines.append(f'      <div class="{section_cls}">')
        for s in slots:
            tag = s["tag"]
            text = _escape_html(s["text"])
            slot = s["slot"]
            href = s["href"]

            # Left cell: slot name
            left = f"<p>{slot}</p>"

            # Right cell: content
            if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                right = f"<{tag}>{text}</{tag}>"
            elif tag == "a" and href:
                right = f'<p><a href="{href}">{text}</a></p>'
            else:
                right = f"<p>{text}</p>"

            lines.append(
                f"        <div><div>{left}</div><div>{right}</div></div>"
            )

        lines.append("      </div>")
        lines.append("    </div>")

    # Metadata block (always last)
    lines += [
        "    <div>",
        '      <div class="metadata">',
        f'        <div><div><p>template</p></div><div><p>{slug}</p></div></div>',
        "      </div>",
        "    </div>",
        "  </main>",
        "  <footer></footer>",
        "</body>",
        "</html>",
    ]
    return "\n".join(lines)


def _escape_html(text):
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def derive_slug(filename):
    """'prototype-home.html' → 'prototype-home'"""
    base = os.path.basename(filename)
    return re.sub(r"\.html?$", "", base, flags=re.IGNORECASE)


def main():
    parser = argparse.ArgumentParser(
        description="Split a prototype HTML into EDS snowflake overlay artifacts."
    )
    parser.add_argument("prototype", help="Path to the prototype HTML file")
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Root output directory (e.g. /workspace/of1-demo)",
    )
    parser.add_argument("--branch", default="", help="EDS branch name (informational)")
    parser.add_argument("--owner", default="", help="GitHub owner (informational)")
    parser.add_argument("--repo", default="", help="GitHub repo (informational)")
    args = parser.parse_args()

    src = args.prototype
    out = args.output_dir.rstrip("/")

    if not os.path.isfile(src):
        print(f"ERROR: file not found: {src}", file=sys.stderr)
        sys.exit(1)

    html = read_file(src)
    slug = derive_slug(src)

    print(f"\n🔪  Splitting {src!r}  →  slug={slug!r}")
    print(f"    output-dir : {out}")
    if args.branch:
        print(f"    branch     : {args.branch}")
    print()

    # ── Structural dissection ────────────────────────────────────────────────
    google_fonts    = extract_google_font_links(html)
    raw_css         = extract_styles(html)
    header_block    = find_header_block(html)
    footer_block    = find_footer_block(html)
    content_html    = find_content_sections(html)
    section_classes = extract_section_classes(content_html)

    print(f"    sections found : {section_classes}")
    print()

    # ── Output 1 : template ──────────────────────────────────────────────────
    template_html = build_template(content_html, slug, google_fonts)
    write_output(f"{out}/templates/{slug}.html", template_html)

    # ── Output 2 : CSS ───────────────────────────────────────────────────────
    css = build_css(raw_css, section_classes)
    write_output(f"{out}/styles/{slug}.css", css)

    # ── Output 3 : header fragment ───────────────────────────────────────────
    header_frag = build_header_fragment(header_block)
    write_output(f"{out}/fragments/{slug}/header.html", header_frag)

    # ── Output 4 : footer fragment ───────────────────────────────────────────
    footer_frag = build_footer_fragment(footer_block)
    write_output(f"{out}/fragments/{slug}/footer.html", footer_frag)

    # ── Output 5 : DA document ───────────────────────────────────────────────
    # Re-parse slots from the already-injected template
    slots_by_section = extract_slots_from_template(template_html)
    da_html = build_da_document(slots_by_section, slug)
    da_path = f"{out}/.snowflake/projects/1-{slug}/da/{slug}.html"
    write_output(da_path, da_html)

    # ── Summary ──────────────────────────────────────────────────────────────
    total_slots = sum(len(v) for v in slots_by_section.items() if isinstance(v, list))
    # Recount properly
    total_slots = sum(len(slots) for slots in slots_by_section.values())

    print()
    print("═" * 60)
    print(f"  Done!  slug={slug}")
    print(f"  Sections  : {len(section_classes)}  ({', '.join(section_classes)})")
    print(f"  Slots     : {total_slots} total across all sections")
    print(f"  DA rows   : {total_slots} content + 1 metadata")
    print("═" * 60)
    print()


if __name__ == "__main__":
    main()
