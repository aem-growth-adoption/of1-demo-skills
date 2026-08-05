#!/usr/bin/env node
// Fill the config-review.html template with data from of1/config/ JSON files.
//
// Usage (always cd into repo first):
//   node fill-config-review.mjs <repo-dir> <domain> [template-path]
//
// Args:
//   repo-dir: Path to repo root (use "." when already cd'd in)
//   domain:   The demo domain name (displayed in the report header)
//   template: Optional path to template HTML (defaults to config-review.html beside this script)
//
// Reads: of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json
// Writes: deliverables/config-review.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function htmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Escape a value destined for an HTML attribute (src/href). Config JSON is
// LLM-generated, so a stray quote must not break out of the attribute, and a
// disallowed scheme (e.g. javascript:) must not survive.
function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}

function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (s === '') return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return escapeAttr(s);
  if (/^[/#?]/.test(s) || /^data:image\//i.test(s)) return escapeAttr(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ''; // disallowed scheme — drop
  return escapeAttr(s); // bare relative path
}

// Prices are stored as numbers (14.99) but authors/LLMs may write "$14.99".
// Normalize so we never render "$$14.99" or a bare "$".
function formatPrice(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  return s.startsWith('$') ? s : `$${s}`;
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return {};
  }
}

function renderProducts(products) {
  let html = '';
  for (const p of products) {
    const name = htmlEscape(p.name ?? 'Unknown');
    const cat = htmlEscape(p.category ?? '');
    const price = p.price ?? '';
    const imgs = p.images ?? [];
    const desc = htmlEscape(p.description ?? '');
    const feats = p.features ?? [];
    const highlights = p.highlights ?? [];
    const keywords = p.keywords ?? [];
    const persona = htmlEscape(p.persona ?? '');
    const useCase = htmlEscape(p.useCase ?? '');
    const url = safeUrl(p.url ?? '');

    const thumb = imgs.length ? safeUrl(imgs[0]) : '';
    const featsHtml = feats.map((f) => `<li>${htmlEscape(f)}</li>`).join('');
    const highlightsHtml = highlights.map((h) => `<li>${htmlEscape(h)}</li>`).join('');
    const keywordsHtml = keywords
      .slice(0, 8)
      .map((k) => `<span class="kw">${htmlEscape(k)}</span>`)
      .join('');
    const imgsHtml = imgs
      .map((u) => `<img src="${safeUrl(u)}" alt="${name}" class="gallery-img" loading="lazy">`)
      .join('');

    html += `<div class="product-card">
  <div class="product-summary">
    <img src="${thumb}" alt="${name}" class="product-thumb" loading="lazy">
    <div class="product-info">
      <div class="product-name">${name}</div>
      <div class="product-meta"><span class="cat">${cat}</span><span class="price">${htmlEscape(formatPrice(price))}</span><span class="img-count">${imgs.length} img${imgs.length > 1 ? 's' : ''}</span></div>
    </div>
    <div class="expand-icon">+</div>
  </div>
  <div class="product-detail">
    <div class="product-gallery">${imgsHtml}</div>
    <div class="product-detail-content">
      <p class="product-desc">${desc}</p>
      ${feats.length ? '<h4>Features</h4><ul>' + featsHtml + '</ul>' : ''}
      ${highlights.length ? '<h4>Highlights</h4><ul>' + highlightsHtml + '</ul>' : ''}
      <div class="product-tags">
        ${keywords.length ? "<h4>Keywords</h4><div class='kw-list'>" + keywordsHtml + '</div>' : ''}
        ${persona ? `<div class='product-persona'>Persona: <strong>${persona}</strong></div>` : ''}
        ${useCase ? `<div class='product-usecase'>Use case: <strong>${useCase}</strong></div>` : ''}
      </div>
      ${url ? `<a href="${url}" class="product-link" target="_blank">View on site &rarr;</a>` : ''}
    </div>
  </div>
</div>`;
  }
  return html;
}

function renderPersonas(personas) {
  let html = '';
  for (const p of personas) {
    const name = htmlEscape(p.name ?? 'Unknown');
    const desc = htmlEscape(p.description ?? '');
    const keywords = (p.keywords ?? []).slice(0, 8).join(', ');
    html += `<div class="persona-card">
  <div class="persona-name">${name}</div>
  <div class="persona-desc">${desc}</div>
  <div class="persona-kw">Keywords: ${keywords}</div>
</div>`;
  }
  return html;
}

function renderSuggestions(suggestions) {
  let html = '';
  for (const s of suggestions) {
    if (s !== null && typeof s === 'object' && !Array.isArray(s)) {
      const label = htmlEscape(s.label ?? s.text ?? '');
      const query = htmlEscape(s.query ?? '');
      html += `<div class="suggestion-chip"><span class="sug-label">${label}</span><span class="sug-query">${query}</span></div>`;
    } else {
      html += `<div class="suggestion-chip"><span class="sug-label">${htmlEscape(String(s))}</span></div>`;
    }
  }
  return html;
}

function renderUsecases(useCases) {
  let html = '';
  for (const uc of useCases) {
    if (uc !== null && typeof uc === 'object' && !Array.isArray(uc)) {
      const name = htmlEscape(uc.name ?? uc.title ?? 'Unknown');
      const desc = htmlEscape(uc.description ?? '');
      const keywords = (uc.keywords ?? []).slice(0, 6).join(', ');
      html += `<div class="usecase-card">
  <div class="usecase-name">${name}</div>
  <div class="usecase-desc">${desc}</div>
  ${keywords ? "<div class='usecase-kw'>Keywords: " + keywords + '</div>' : ''}
</div>`;
    } else {
      html += `<div class="usecase-card"><div class="usecase-name">${htmlEscape(String(uc))}</div></div>`;
    }
  }
  return html;
}

function renderFeatures(features) {
  let html = '';
  for (const f of features) {
    if (f !== null && typeof f === 'object' && !Array.isArray(f)) {
      const name = htmlEscape(f.name ?? f.title ?? String(f));
      html += `<span class="feature-chip">${name}</span>`;
    } else {
      html += `<span class="feature-chip">${htmlEscape(String(f))}</span>`;
    }
  }
  return html;
}

function main() {
  if (process.argv.length < 4) {
    console.log('Usage: node fill-config-review.mjs <repo-dir> <domain> [template-path]');
    return 1;
  }

  const repoDirArg = process.argv[2];
  const domain = process.argv[3];

  let templatePath;
  if (process.argv.length > 4) {
    templatePath = process.argv[4];
  } else {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    templatePath = path.join(scriptDir, 'config-review.html');
  }

  const repoDir = path.resolve(repoDirArg);

  const template = fs.readFileSync(templatePath, 'utf8');

  const configDir = path.join(repoDir, 'of1', 'config');

  let products = loadJson(path.join(configDir, 'products.json'));
  if (products !== null && typeof products === 'object' && !Array.isArray(products)) {
    products = products.products ?? [];
  }

  const brand = loadJson(path.join(configDir, 'brand-voice.json'));

  let personas = loadJson(path.join(configDir, 'personas.json'));
  if (personas !== null && typeof personas === 'object' && !Array.isArray(personas)) {
    personas = personas.personas ?? [];
  }

  const suggestionsData = loadJson(path.join(configDir, 'suggestions.json'));
  let suggestions;
  let sugTitle;
  let sugSubtitle;
  let sugPlaceholder;
  if (suggestionsData !== null && typeof suggestionsData === 'object' && !Array.isArray(suggestionsData)) {
    suggestions = suggestionsData.suggestions ?? [];
    sugTitle = suggestionsData.title ?? '';
    sugSubtitle = suggestionsData.subtitle ?? '';
    sugPlaceholder = suggestionsData.placeholder ?? '';
  } else {
    suggestions = Array.isArray(suggestionsData) ? suggestionsData : [];
    sugTitle = sugSubtitle = sugPlaceholder = '';
  }

  let useCases = loadJson(path.join(configDir, 'use-cases.json'));
  if (useCases !== null && typeof useCases === 'object' && !Array.isArray(useCases)) {
    useCases = useCases.useCases ?? useCases['use-cases'] ?? [];
  }

  let features = loadJson(path.join(configDir, 'features.json'));
  if (features !== null && typeof features === 'object' && !Array.isArray(features)) {
    features = features.features ?? [];
  }

  const cta = loadJson(path.join(configDir, 'cta-template.json'));

  const totalImages = products.reduce((sum, p) => sum + (p.images ?? []).length, 0);

  const replacements = {
    '{{DOMAIN}}': htmlEscape(domain),
    '{{STAT_PRODUCTS}}': String(products.length),
    '{{STAT_IMAGES}}': String(totalImages),
    '{{STAT_PERSONAS}}': String(personas.length),
    '{{STAT_SUGGESTIONS}}': String(suggestions.length),
    '{{STAT_FEATURES}}': String(features.length),
    '{{STAT_USECASES}}': String(useCases.length),
    '{{PRODUCTS_HTML}}': renderProducts(products),
    '{{BRAND_PERSONALITY}}': htmlEscape(String(brand.personality ?? 'N/A')),
    '{{BRAND_TONE}}': htmlEscape(String(brand.tone ?? 'N/A')),
    '{{BRAND_VOCAB}}': htmlEscape((brand.vocabulary ?? brand.preferredWords ?? []).slice(0, 10).join(', ')),
    '{{BRAND_AVOID}}': htmlEscape((brand.avoidWords ?? brand.avoid ?? []).slice(0, 10).join(', ')),
    '{{PERSONAS_HTML}}': renderPersonas(personas),
    '{{USECASES_HTML}}': renderUsecases(useCases),
    '{{FEATURES_HTML}}': renderFeatures(features),
    '{{SUG_TITLE}}': htmlEscape(sugTitle),
    '{{SUG_SUBTITLE}}': htmlEscape(sugSubtitle),
    '{{SUG_PLACEHOLDER}}': htmlEscape(sugPlaceholder),
    '{{SUGGESTIONS_HTML}}': renderSuggestions(suggestions),
    '{{CTA_JSON}}': htmlEscape(JSON.stringify(cta, null, 2).slice(0, 2000)),
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }

  const outDir = path.join(repoDir, 'deliverables');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'config-review.html');
  fs.writeFileSync(outPath, output);

  console.log(`✓ Config review written to ${outPath}`);
  console.log(
    `  ${products.length} products, ${totalImages} images, ${personas.length} personas, ${suggestions.length} suggestions, ${features.length} features, ${useCases.length} use cases`,
  );
  return 0;
}

process.exit(main());
