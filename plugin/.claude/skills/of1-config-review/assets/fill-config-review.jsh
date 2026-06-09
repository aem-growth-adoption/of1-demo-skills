// fill-config-review.jsh — Fill the config-review.html template with data from of1/config/ JSON files.
//
// Usage:
//   fill-config-review.jsh <repo-dir> <domain> [template-path]
//
// Reads: of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json
// Writes: deliverables/config-review.html

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadJson(path) {
  try {
    const content = await fs.readFile(path);
    return JSON.parse(content);
  } catch (e) {
    return {};
  }
}

function renderProducts(products) {
  let html = '';
  for (const p of products) {
    const name = escapeHtml(p.name || 'Unknown');
    const cat = escapeHtml(p.category || '');
    const price = p.price || '';
    const imgs = p.images || [];
    const desc = escapeHtml(p.description || '');
    const feats = p.features || [];
    const highlights = p.highlights || [];
    const keywords = p.keywords || [];
    const persona = escapeHtml(p.persona || '');
    const useCase = escapeHtml(p.useCase || '');
    const url = escapeHtml(p.url || '');

    const thumb = imgs[0] || '';
    const featsHtml = feats.map(f => `<li>${escapeHtml(f)}</li>`).join('');
    const highlightsHtml = highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('');
    const keywordsHtml = keywords.slice(0, 8).map(k => `<span class="kw">${escapeHtml(k)}</span>`).join('');
    const imgsHtml = imgs.map(u => `<img src="${u}" alt="${name}" class="gallery-img" loading="lazy">`).join('');

    html += `<div class="product-card">
  <div class="product-summary">
    <img src="${thumb}" alt="${name}" class="product-thumb" loading="lazy">
    <div class="product-info">
      <div class="product-name">${name}</div>
      <div class="product-meta"><span class="cat">${cat}</span><span class="price">$${price}</span><span class="img-count">${imgs.length} img${imgs.length > 1 ? 's' : ''}</span></div>
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
    const name = escapeHtml(p.name || 'Unknown');
    const desc = escapeHtml(p.description || '');
    const keywords = (p.keywords || []).slice(0, 8).join(', ');
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
    if (typeof s === 'object' && s !== null) {
      const label = escapeHtml(s.label || s.text || '');
      const query = escapeHtml(s.query || '');
      html += `<div class="suggestion-chip"><span class="sug-label">${label}</span><span class="sug-query">${query}</span></div>`;
    } else {
      html += `<div class="suggestion-chip"><span class="sug-label">${escapeHtml(String(s))}</span></div>`;
    }
  }
  return html;
}

function renderUsecases(useCases) {
  let html = '';
  for (const uc of useCases) {
    if (typeof uc === 'object' && uc !== null) {
      const name = escapeHtml(uc.name || uc.title || 'Unknown');
      const desc = escapeHtml(uc.description || '');
      const keywords = (uc.keywords || []).slice(0, 6).join(', ');
      html += `<div class="usecase-card">
  <div class="usecase-name">${name}</div>
  <div class="usecase-desc">${desc}</div>
  ${keywords ? "<div class='usecase-kw'>Keywords: " + keywords + '</div>' : ''}
</div>`;
    } else {
      html += `<div class="usecase-card"><div class="usecase-name">${escapeHtml(String(uc))}</div></div>`;
    }
  }
  return html;
}

function renderFeatures(features) {
  let html = '';
  for (const f of features) {
    if (typeof f === 'object' && f !== null) {
      const name = escapeHtml(f.name || f.title || String(f));
      html += `<span class="feature-chip">${name}</span>`;
    } else {
      html += `<span class="feature-chip">${escapeHtml(String(f))}</span>`;
    }
  }
  return html;
}

async function main() {
  if (process.argv.length < 3) {
    echo('Usage: fill-config-review.jsh <repo-dir> <domain> [template-path]');
    process.exit(1);
  }

  const repoDir = process.argv[1];
  const domain = process.argv[2];

  // Template path
  let templatePath;
  if (process.argv.length > 3) {
    templatePath = process.argv[3];
  } else {
    const scriptDir = process.argv[0].replace(/\/[^/]+$/, '');
    templatePath = `${scriptDir}/config-review.html`;
  }

  // Load template
  let template;
  try {
    template = await fs.readFile(templatePath);
  } catch (e) {
    console.error(`ERROR: Cannot read template at ${templatePath}`);
    process.exit(1);
  }

  // Load all config files
  const configDir = `${repoDir}/of1/config`;
  let products = await loadJson(`${configDir}/products.json`);
  if (products && !Array.isArray(products)) products = products.products || [];

  const brand = await loadJson(`${configDir}/brand-voice.json`);

  let personas = await loadJson(`${configDir}/personas.json`);
  if (personas && !Array.isArray(personas)) personas = personas.personas || [];

  let suggestionsData = await loadJson(`${configDir}/suggestions.json`);
  let suggestions, sugTitle, sugSubtitle, sugPlaceholder;
  if (typeof suggestionsData === 'object' && !Array.isArray(suggestionsData)) {
    suggestions = suggestionsData.suggestions || [];
    sugTitle = suggestionsData.title || '';
    sugSubtitle = suggestionsData.subtitle || '';
    sugPlaceholder = suggestionsData.placeholder || '';
  } else {
    suggestions = Array.isArray(suggestionsData) ? suggestionsData : [];
    sugTitle = sugSubtitle = sugPlaceholder = '';
  }

  let useCases = await loadJson(`${configDir}/use-cases.json`);
  if (useCases && !Array.isArray(useCases)) useCases = useCases.useCases || useCases['use-cases'] || [];

  let features = await loadJson(`${configDir}/features.json`);
  if (features && !Array.isArray(features)) features = features.features || [];

  const cta = await loadJson(`${configDir}/cta-template.json`);

  // Calculate stats
  const totalImages = products.reduce((sum, p) => sum + (p.images || []).length, 0);

  // Build replacements
  const replacements = {
    '{{DOMAIN}}': escapeHtml(domain),
    '{{STAT_PRODUCTS}}': String(products.length),
    '{{STAT_IMAGES}}': String(totalImages),
    '{{STAT_PERSONAS}}': String(personas.length),
    '{{STAT_SUGGESTIONS}}': String(suggestions.length),
    '{{STAT_FEATURES}}': String(features.length),
    '{{STAT_USECASES}}': String(useCases.length),
    '{{PRODUCTS_HTML}}': renderProducts(products),
    '{{BRAND_PERSONALITY}}': escapeHtml(String(brand.personality || 'N/A')),
    '{{BRAND_TONE}}': escapeHtml(String(brand.tone || 'N/A')),
    '{{BRAND_VOCAB}}': escapeHtml((brand.vocabulary || brand.preferredWords || []).slice(0, 10).join(', ')),
    '{{BRAND_AVOID}}': escapeHtml((brand.avoidWords || brand.avoid || []).slice(0, 10).join(', ')),
    '{{PERSONAS_HTML}}': renderPersonas(personas),
    '{{USECASES_HTML}}': renderUsecases(useCases),
    '{{FEATURES_HTML}}': renderFeatures(features),
    '{{SUG_TITLE}}': escapeHtml(sugTitle),
    '{{SUG_SUBTITLE}}': escapeHtml(sugSubtitle),
    '{{SUG_PLACEHOLDER}}': escapeHtml(sugPlaceholder),
    '{{SUGGESTIONS_HTML}}': renderSuggestions(suggestions),
    '{{CTA_JSON}}': escapeHtml(JSON.stringify(cta, null, 2).slice(0, 2000)),
  };

  // Fill template
  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }

  // Write output
  const outPath = `${repoDir}/deliverables/config-review.html`;
  await fs.writeFile(outPath, output);

  echo(`✓ Config review written to ${outPath}`);
  echo(`  ${products.length} products, ${totalImages} images, ${personas.length} personas, ${suggestions.length} suggestions, ${features.length} features, ${useCases.length} use cases`);
}

await main();
