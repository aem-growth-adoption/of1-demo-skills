#!/usr/bin/env python3
"""
Fill the demo-hub.html template with data from the OF1 demo pipeline.

Usage (always cd into repo first):
    cd /workspace/of1-demo && python3 /path/to/fill-demo-hub.py . www.adobe.com

Args:
    repo-dir: Path to repo root (use "." when already cd'd in)
    domain:   The demo domain name

Reads:
    /shared/of1-demo/repo-config.json
    /shared/of1-demo/step-3-output.md (first paragraph of narrative)
    of1/config/{products,personas,suggestions,templates}.json
    stardust/current/assets/logo.svg (optional)
    DA content pages (scans /mnt/da/{branch}/)

Writes: deliverables/index.html
"""

import json
import os
import sys
from html import escape
from pathlib import Path
from datetime import date

def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def load_text(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        return ''

def count_templates(repo_dir):
    """Count of1-* template HTML files."""
    tpl_dir = Path(repo_dir) / 'templates'
    if not tpl_dir.exists():
        return 0
    return len([f for f in tpl_dir.glob('of1-*.html')])

def extract_narrative(step3_output):
    """Extract the narrative paragraph from discovery output."""
    lines = step3_output.split('\n')
    in_narrative = False
    narrative_lines = []
    for line in lines:
        if '**Persona:**' in line or '**Journey:**' in line:
            in_narrative = True
            narrative_lines.append(line.replace('**Persona:**', '').replace('**Journey:**', '').strip())
        elif in_narrative and line.strip() == '':
            break
        elif in_narrative:
            narrative_lines.append(line.strip())
    return ' '.join(narrative_lines) if narrative_lines else 'Demo narrative not available.'

def extract_focus(step3_output):
    """Extract the demo focus from discovery."""
    lines = step3_output.split('\n')
    for line in lines:
        if '## Demo Focus' in line:
            idx = lines.index(line)
            if idx + 1 < len(lines):
                return lines[idx + 1].strip()
    return 'AI-Powered Experience'

def get_logo_svg(repo_dir):
    """Get brand logo SVG if available."""
    logo_path = Path(repo_dir) / 'stardust' / 'current' / 'assets' / 'logo.svg'
    if logo_path.exists():
        svg = logo_path.read_text().strip()
        # Add height constraint
        if 'height=' not in svg:
            svg = svg.replace('<svg', '<svg height="28"', 1)
        return svg
    return ''

def find_eds_pages(repo_dir, branch, owner, repo):
    """Find DA content pages for this branch.
    
    Reads from /tmp/da-pages.txt which the calling shell script must create:
        ls /mnt/da/{branch}/*.html > /tmp/da-pages.txt 2>/dev/null
    
    Falls back to scanning the .snowflake directory for project names.
    """
    preview_base = f'https://{branch}--{repo}--{owner}.aem.page/{branch}'
    pages = []
    
    # Try pre-generated page list
    pages_file = Path('/tmp/da-pages.txt')
    if pages_file.exists():
        for line in pages_file.read_text().strip().split('\n'):
            if not line.strip():
                continue
            name = Path(line.strip()).stem
            if name in ('nav', 'footer'):
                continue
            label = name.replace('-', ' ').replace('prototype ', '').title()
            pages.append({'url': f'{preview_base}/{name}', 'label': label})
    
    # Fallback: check DA content files committed to the repo
    if not pages:
        snowflake_dir = Path(repo_dir) / '.snowflake' / 'projects'
        if snowflake_dir.exists():
            for project in sorted(snowflake_dir.iterdir()):
                da_dir = project / 'da'
                if da_dir.exists():
                    for f in da_dir.glob('*.html'):
                        slug = f.stem
                        label = slug.replace('-', ' ').replace('prototype ', '').title()
                        pages.append({'url': f'{preview_base}/{slug}', 'label': label})
    
    return pages

def render_eds_pages(pages):
    """Render EDS page cards."""
    html = ''
    for p in pages:
        html += f'''      <a href="{p['url']}" class="card">
        <span class="card-badge badge-aem">AEM Preview</span>
        <div class="card-title">{escape(p['label'])}</div>
        <div class="card-desc">Live EDS page with snowflake overlay</div>
      </a>\n'''
    return html or '      <div class="card"><div class="card-title">No pages published yet</div></div>'

def render_config_summary(products, personas, suggestions, templates_json):
    """Render config summary items."""
    items = []
    
    # Products
    if products:
        product_names = [p.get('name', '?') for p in products[:4]]
        items.append(('Products', ', '.join(product_names) + ('...' if len(products) > 4 else '')))
    
    # Personas
    if personas:
        persona_names = [p.get('name', '?') for p in personas[:3]]
        items.append(('Personas', ', '.join(persona_names) + ('...' if len(personas) > 3 else '')))
    
    # Suggestions
    if isinstance(suggestions, dict):
        chips = suggestions.get('suggestions', [])
        items.append(('Suggestion Chips', str(len(chips))))
        if suggestions.get('title'):
            items.append(('Search Title', suggestions['title']))
    
    # Templates
    if isinstance(templates_json, dict):
        intents = templates_json.get('intents', [])
        if intents:
            items.append(('Intents', ', '.join(intents)))
    
    html = ''
    for label, value in items:
        html += f'''      <div class="config-item">
        <div class="config-item-label">{escape(label)}</div>
        <div class="config-item-value">{escape(str(value))}</div>
      </div>\n'''
    return html

def main():
    if len(sys.argv) < 3:
        print("Usage: fill-demo-hub.py <repo-dir> <domain>")
        sys.exit(1)
    
    repo_dir = sys.argv[1]
    domain = sys.argv[2]
    
    # Load repo config
    repo_config = load_json('/shared/of1-demo/repo-config.json')
    owner = repo_config.get('owner', 'aem-growth-adoption')
    repo = repo_config.get('repo', 'of1-demo')
    branch = repo_config.get('branch', domain.split('.')[0])
    
    preview_base = f'https://{branch}--{repo}--{owner}.aem.page'
    tenant_id = f'{branch}--{repo}--{owner}'
    
    # Load data
    products = load_json(f'{repo_dir}/of1/config/products.json')
    if isinstance(products, dict):
        products = products.get('products', [])
    personas = load_json(f'{repo_dir}/of1/config/personas.json')
    if isinstance(personas, dict):
        personas = personas.get('personas', [])
    suggestions = load_json(f'{repo_dir}/of1/config/suggestions.json')
    templates_json = load_json(f'{repo_dir}/of1/config/templates.json')
    
    step3 = load_text('/shared/of1-demo/step-3-output.md')
    narrative = extract_narrative(step3)
    focus = extract_focus(step3)
    
    num_templates = count_templates(repo_dir)
    num_suggestions = len(suggestions.get('suggestions', [])) if isinstance(suggestions, dict) else 0
    
    # EDS pages
    eds_pages = find_eds_pages(repo_dir, branch, owner, repo)
    
    # Logo
    logo_svg = get_logo_svg(repo_dir)
    
    # URLs
    of1_url = f'{preview_base}/{branch}/of1'
    gallery_url = f'{preview_base}/gallery/index.html'
    
    # Load template
    template_path = Path(__file__).parent / 'demo-hub.html'
    template = template_path.read_text()
    
    # Fill template
    html = template
    html = html.replace('{{DOMAIN}}', escape(domain))
    html = html.replace('{{DEMO_FOCUS}}', escape(focus))
    html = html.replace('{{LOGO_SVG}}', logo_svg)
    html = html.replace('{{NARRATIVE}}', escape(narrative))
    html = html.replace('{{NUM_PRODUCTS}}', str(len(products)))
    html = html.replace('{{NUM_TEMPLATES}}', str(num_templates))
    html = html.replace('{{NUM_PERSONAS}}', str(len(personas)))
    html = html.replace('{{NUM_SUGGESTIONS}}', str(num_suggestions))
    html = html.replace('{{NUM_PAGES}}', str(len(eds_pages)))
    html = html.replace('{{OF1_URL}}', of1_url)
    html = html.replace('{{GALLERY_URL}}', gallery_url)
    html = html.replace('{{PREVIEW_BASE}}', preview_base)
    html = html.replace('{{EDS_PAGES}}', render_eds_pages(eds_pages))
    html = html.replace('{{CONFIG_SUMMARY}}', render_config_summary(products, personas, suggestions, templates_json))
    html = html.replace('{{OWNER}}', owner)
    html = html.replace('{{REPO}}', repo)
    html = html.replace('{{BRANCH}}', branch)
    html = html.replace('{{TENANT_ID}}', tenant_id)
    html = html.replace('{{DATE}}', date.today().isoformat())
    
    # Write output
    out_dir = Path(repo_dir) / 'deliverables'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'index.html'
    out_path.write_text(html)
    
    print(f'✓ Demo hub written to {out_path}')
    print(f'  {len(products)} products, {num_templates} templates, {len(personas)} personas, {num_suggestions} suggestions, {len(eds_pages)} EDS pages')

if __name__ == '__main__':
    main()
