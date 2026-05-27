#!/usr/bin/env python3
"""
Fill the config-review.html template with data from of1/config/ JSON files.

Usage (always cd into repo first):
    cd /workspace/of1-demo && python3 /path/to/fill-config-review.py . frescopa.coffee

Args:
    repo-dir: Path to repo root (use "." when already cd'd in)
    domain:   The demo domain name (displayed in the report header)
    template: Optional path to template HTML (defaults to templates/config-review.html beside this script)

Reads: of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json
Writes: deliverables/config-review.html
"""

import json
import os
import sys
from html import escape
from pathlib import Path

def load_json(path):
    """Load JSON file, return empty dict/list on failure."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def render_products(products):
    """Render product cards HTML."""
    html = ''
    for p in products:
        name = escape(p.get('name', 'Unknown'))
        cat = escape(p.get('category', ''))
        price = p.get('price', '')
        imgs = p.get('images', [])
        desc = escape(p.get('description', ''))
        feats = p.get('features', [])
        highlights = p.get('highlights', [])
        keywords = p.get('keywords', [])
        persona = escape(p.get('persona', ''))
        use_case = escape(p.get('useCase', ''))
        url = escape(p.get('url', ''))

        thumb = imgs[0] if imgs else ''
        feats_html = ''.join(f'<li>{escape(f)}</li>' for f in feats)
        highlights_html = ''.join(f'<li>{escape(h)}</li>' for h in highlights)
        keywords_html = ''.join(f'<span class="kw">{escape(k)}</span>' for k in keywords[:8])
        imgs_html = ''.join(f'<img src="{u}" alt="{name}" class="gallery-img" loading="lazy">' for u in imgs)

        html += f'''<div class="product-card">
  <div class="product-summary">
    <img src="{thumb}" alt="{name}" class="product-thumb" loading="lazy">
    <div class="product-info">
      <div class="product-name">{name}</div>
      <div class="product-meta"><span class="cat">{cat}</span><span class="price">${price}</span><span class="img-count">{len(imgs)} img{"s" if len(imgs)>1 else ""}</span></div>
    </div>
    <div class="expand-icon">+</div>
  </div>
  <div class="product-detail">
    <div class="product-gallery">{imgs_html}</div>
    <div class="product-detail-content">
      <p class="product-desc">{desc}</p>
      {"<h4>Features</h4><ul>" + feats_html + "</ul>" if feats else ""}
      {"<h4>Highlights</h4><ul>" + highlights_html + "</ul>" if highlights else ""}
      <div class="product-tags">
        {"<h4>Keywords</h4><div class='kw-list'>" + keywords_html + "</div>" if keywords else ""}
        {f"<div class='product-persona'>Persona: <strong>{persona}</strong></div>" if persona else ""}
        {f"<div class='product-usecase'>Use case: <strong>{use_case}</strong></div>" if use_case else ""}
      </div>
      {f'<a href="{url}" class="product-link" target="_blank">View on site &rarr;</a>' if url else ""}
    </div>
  </div>
</div>'''
    return html

def render_personas(personas):
    """Render persona cards HTML."""
    html = ''
    for p in personas:
        name = escape(p.get('name', 'Unknown'))
        desc = escape(p.get('description', ''))
        keywords = ', '.join(p.get('keywords', [])[:8])
        html += f'''<div class="persona-card">
  <div class="persona-name">{name}</div>
  <div class="persona-desc">{desc}</div>
  <div class="persona-kw">Keywords: {keywords}</div>
</div>'''
    return html

def render_suggestions(suggestions):
    """Render suggestion chips HTML."""
    html = ''
    for s in suggestions:
        if isinstance(s, dict):
            label = escape(s.get('label', s.get('text', '')))
            query = escape(s.get('query', ''))
            html += f'<div class="suggestion-chip"><span class="sug-label">{label}</span><span class="sug-query">{query}</span></div>'
        else:
            html += f'<div class="suggestion-chip"><span class="sug-label">{escape(str(s))}</span></div>'
    return html

def render_usecases(use_cases):
    """Render use case cards HTML."""
    html = ''
    for uc in use_cases:
        if isinstance(uc, dict):
            name = escape(uc.get('name', uc.get('title', 'Unknown')))
            desc = escape(uc.get('description', ''))
            keywords = ', '.join(uc.get('keywords', [])[:6])
            html += f'''<div class="usecase-card">
  <div class="usecase-name">{name}</div>
  <div class="usecase-desc">{desc}</div>
  {"<div class='usecase-kw'>Keywords: " + keywords + "</div>" if keywords else ""}
</div>'''
        else:
            html += f'<div class="usecase-card"><div class="usecase-name">{escape(str(uc))}</div></div>'
    return html

def render_features(features):
    """Render feature chips HTML."""
    html = ''
    for f in features:
        if isinstance(f, dict):
            name = escape(f.get('name', f.get('title', str(f))))
            html += f'<span class="feature-chip">{name}</span>'
        else:
            html += f'<span class="feature-chip">{escape(str(f))}</span>'
    return html

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 fill-config-review.py <repo-dir> <domain> [template-path]")
        sys.exit(1)

    repo_dir = sys.argv[1]
    domain = sys.argv[2]
    
    # Template path — default to same directory as this script
    if len(sys.argv) > 3:
        template_path = sys.argv[3]
    else:
        script_dir = Path(__file__).resolve().parent
        template_path = script_dir / 'templates' / 'config-review.html'

    # NOTE: Always invoke this script from within the repo dir (cd $REPO_DIR first).
    # The VFS cannot os.chdir() across mount boundaries.
    repo_dir = os.path.abspath(repo_dir)

    # Load template
    with open(template_path) as f:
        template = f.read()

    # Load all config files
    config_dir = os.path.join(repo_dir, 'of1', 'config')
    products = load_json(os.path.join(config_dir, 'products.json'))
    if isinstance(products, dict):
        products = products.get('products', [])
    
    brand = load_json(os.path.join(config_dir, 'brand-voice.json'))
    personas = load_json(os.path.join(config_dir, 'personas.json'))
    if isinstance(personas, dict):
        personas = personas.get('personas', [])
    
    suggestions_data = load_json(os.path.join(config_dir, 'suggestions.json'))
    if isinstance(suggestions_data, dict):
        suggestions = suggestions_data.get('suggestions', [])
        sug_title = suggestions_data.get('title', '')
        sug_subtitle = suggestions_data.get('subtitle', '')
        sug_placeholder = suggestions_data.get('placeholder', '')
    else:
        suggestions = suggestions_data if isinstance(suggestions_data, list) else []
        sug_title = sug_subtitle = sug_placeholder = ''

    use_cases = load_json(os.path.join(config_dir, 'use-cases.json'))
    if isinstance(use_cases, dict):
        use_cases = use_cases.get('useCases', use_cases.get('use-cases', []))
    
    features = load_json(os.path.join(config_dir, 'features.json'))
    if isinstance(features, dict):
        features = features.get('features', [])
    
    cta = load_json(os.path.join(config_dir, 'cta-template.json'))

    # Calculate stats
    total_images = sum(len(p.get('images', [])) for p in products)

    # Build replacements
    replacements = {
        '{{DOMAIN}}': escape(domain),
        '{{STAT_PRODUCTS}}': str(len(products)),
        '{{STAT_IMAGES}}': str(total_images),
        '{{STAT_PERSONAS}}': str(len(personas)),
        '{{STAT_SUGGESTIONS}}': str(len(suggestions)),
        '{{STAT_FEATURES}}': str(len(features)),
        '{{STAT_USECASES}}': str(len(use_cases)),
        '{{PRODUCTS_HTML}}': render_products(products),
        '{{BRAND_PERSONALITY}}': escape(str(brand.get('personality', 'N/A'))),
        '{{BRAND_TONE}}': escape(str(brand.get('tone', 'N/A'))),
        '{{BRAND_VOCAB}}': escape(', '.join(brand.get('vocabulary', brand.get('preferredWords', []))[:10])),
        '{{BRAND_AVOID}}': escape(', '.join(brand.get('avoidWords', brand.get('avoid', []))[:10])),
        '{{PERSONAS_HTML}}': render_personas(personas),
        '{{USECASES_HTML}}': render_usecases(use_cases),
        '{{FEATURES_HTML}}': render_features(features),
        '{{SUG_TITLE}}': escape(sug_title),
        '{{SUG_SUBTITLE}}': escape(sug_subtitle),
        '{{SUG_PLACEHOLDER}}': escape(sug_placeholder),
        '{{SUGGESTIONS_HTML}}': render_suggestions(suggestions),
        '{{CTA_JSON}}': escape(json.dumps(cta, indent=2)[:2000]),
    }

    # Fill template
    output = template
    for token, value in replacements.items():
        output = output.replace(token, value)

    # Write output
    out_dir = os.path.join(repo_dir, 'deliverables')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'config-review.html')
    with open(out_path, 'w') as f:
        f.write(output)

    print(f"✓ Config review written to {out_path}")
    print(f"  {len(products)} products, {total_images} images, {len(personas)} personas, {len(suggestions)} suggestions, {len(features)} features, {len(use_cases)} use cases")

if __name__ == '__main__':
    main()
