// fill-brand-review.jsh — mechanical brand-review.html generator
//
// Usage:
//   fill-brand-review.jsh <repo-dir> <domain>
//
// Output:
//   <repo-dir>/deliverables/brand-review.html

function safeGet(obj, ...keys) {
  let val = obj;
  for (const k of keys) {
    if (typeof val !== 'object' || val === null) return '';
    val = val[k];
    if (val === undefined) return '';
  }
  return val || '';
}

function hexLuminance(hexColor) {
  let h = (hexColor || '').replace(/^#/, '');
  if (h.length !== 3 && h.length !== 6) return 0.5;
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  try {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  } catch (e) { return 0.5; }
}

function textOnColor(hexColor) {
  return hexLuminance(hexColor) > 0.5 ? '#1C1917' : '#F5F0E8';
}

const GOOGLE_FONT_FAMILIES = new Set([
  'roboto', 'open sans', 'lato', 'montserrat', 'oswald', 'raleway',
  'poppins', 'merriweather', 'ubuntu', 'nunito', 'inter', 'playfair display',
  'source sans pro', 'pt sans', 'lora', 'noto sans', 'rubik', 'work sans',
  'titillium web', 'fira sans', 'barlow', 'josefin sans', 'mukta',
  'dm sans', 'mulish', 'exo 2', 'outfit', 'quicksand', 'manrope',
  'cormorant garamond', 'libre baskerville', 'crimson text', 'eb garamond',
  'spectral', 'baskerville', 'garamond', 'times new roman', 'georgia',
  'jetbrains mono', 'fira mono', 'source code pro', 'inconsolata',
  'space mono', 'courier prime', 'dm mono',
]);

function firstFontName(familyString) {
  return (familyString || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

function looksLikeGoogleFont(familyString) {
  return GOOGLE_FONT_FAMILIES.has(firstFontName(familyString).toLowerCase());
}

function googleFontLink(familyString) {
  const name = firstFontName(familyString);
  const encoded = name.replace(/ /g, '+');
  const href = `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap`;
  return `<link href="${href}" rel="stylesheet">`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Section generators

function buildColorSwatches(colors) {
  if (!colors || Object.keys(colors).length === 0) {
    return '<div class="empty-state">No color data extracted.</div>';
  }
  const items = [];
  for (const [name, hexVal] of Object.entries(colors)) {
    if (!hexVal) continue;
    items.push(
      `<div class="swatch">` +
      `  <div class="swatch-color" style="background:${hexVal};"></div>` +
      `  <div class="swatch-info">` +
      `    <span class="swatch-name">${name}</span>` +
      `    <span class="swatch-hex">${hexVal}</span>` +
      `  </div>` +
      `</div>`
    );
  }
  return `<div class="swatches-grid">${items.join('')}</div>`;
}

function buildTypographySection(typography) {
  if (!typography || Object.keys(typography).length === 0) {
    return { html: '<div class="empty-state">No typography data extracted.</div>', fontLinks: [] };
  }
  const fontLinks = [];
  const cards = [];

  for (const role of ['heading', 'body']) {
    const t = typography[role] || {};
    const family = safeGet(t, 'family') || '(not extracted)';
    const weight = safeGet(t, 'weight') || '400';
    const style = safeGet(t, 'style') || 'normal';

    if (looksLikeGoogleFont(family)) {
      fontLinks.push(googleFontLink(family));
    }

    const fontCss = `font-family:${family};font-weight:${weight};font-style:${style};`;
    let preview, label;
    if (role === 'heading') {
      preview = `<div class="typo-preview-heading" style="${fontCss}">The quick brown fox jumps</div>`;
      label = 'Heading Font';
    } else {
      preview = `<div class="typo-preview-body" style="${fontCss}">The quick brown fox jumps over the lazy dog. Bright vixens jump; dozy fowl quack.</div>`;
      label = 'Body Font';
    }

    const firstName = firstFontName(family);
    cards.push(
      `<div class="typo-card">` +
      `  <div class="typo-label">${label}</div>` +
      `  ${preview}` +
      `  <div class="typo-meta">` +
      `    <span><b>Family:</b> ${firstName}</span>` +
      `    <span><b>Stack:</b>  ${family}</span>` +
      `    <span><b>Weight:</b> ${weight}</span>` +
      `    <span><b>Style:</b>  ${style}</span>` +
      `  </div>` +
      `</div>`
    );
  }

  return { html: `<div class="typo-grid">${cards.join('')}</div>`, fontLinks };
}

function buildShapesSection(shapes, spacing) {
  const parts = [];

  if (shapes && Object.keys(shapes).length > 0) {
    const shapeCards = [];
    for (const [key, props] of Object.entries(shapes)) {
      if (typeof props !== 'object' || props === null) continue;
      const radius = props.borderRadius || '0px';
      shapeCards.push(
        `<div class="shape-card">` +
        `  <span class="shape-label">${key}</span>` +
        `  <div class="shape-preview-box" style="border-radius:${radius};"></div>` +
        `  <span class="shape-value">border-radius: ${radius}</span>` +
        `</div>`
      );
    }
    if (shapeCards.length > 0) {
      parts.push(`<div class="shapes-grid">${shapeCards.join('')}</div>`);
    }
  }

  if (spacing && Object.keys(spacing).length > 0) {
    const spacingCards = [];
    for (const [key, val] of Object.entries(spacing)) {
      if (val) {
        spacingCards.push(
          `<div class="spacing-card">` +
          `  <div class="spacing-label">${key}</div>` +
          `  <div class="spacing-value">${val}</div>` +
          `</div>`
        );
      }
    }
    if (spacingCards.length > 0) {
      parts.push(
        `<h3 style="font-family:var(--font-head);font-weight:400;font-size:1.1rem;color:var(--fg-dim);margin:28px 0 12px;">Spacing</h3>` +
        `<div class="spacing-grid">${spacingCards.join('')}</div>`
      );
    }
  }

  if (parts.length === 0) {
    return '<div class="empty-state">No shape or spacing data extracted.</div>';
  }
  return parts.join('');
}

function buildLogoSection(logoSvgContent) {
  if (!logoSvgContent) {
    return '<div class="logo-well"><p class="logo-not-found">Logo SVG not found.</p></div>';
  }
  let svg = logoSvgContent.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();
  return (
    `<div class="logo-well">` +
    `  <div class="logo-variants">` +
    `    <div>` +
    `      <div class="logo-variant-label">On Dark</div>` +
    `      <div class="logo-on-dark logo-display">${svg}</div>` +
    `    </div>` +
    `    <div>` +
    `      <div class="logo-variant-label">On Light</div>` +
    `      <div class="logo-on-light logo-display">${svg}</div>` +
    `    </div>` +
    `  </div>` +
    `</div>`
  );
}

function buildScreenshotsSection(screenshotPaths) {
  if (!screenshotPaths || screenshotPaths.length === 0) {
    return '<div class="empty-state">No screenshots found.</div>';
  }
  const items = screenshotPaths.map(([webPath, caption]) =>
    `<div class="screenshot-item">` +
    `  <div class="screenshot-caption">${caption}</div>` +
    `  <img src="${webPath}" alt="Screenshot: ${caption}" loading="lazy">` +
    `</div>`
  );
  return `<div class="screenshots-list">${items.join('')}</div>`;
}

async function tryReadFile(path) {
  try { return await fs.readFile(path); } catch (e) { return null; }
}

async function fileExists(path) {
  try { await fs.readFile(path); return true; } catch (e) { return false; }
}

async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: fill-brand-review.jsh <repo-dir> <domain>');
    process.exit(1);
  }

  const repoDir = process.argv[1];
  const domain = process.argv[2];

  // Locate DESIGN.json
  let designPath = `${repoDir}/stardust/current/DESIGN.json`;
  let designContent = await tryReadFile(designPath);
  if (!designContent) {
    designPath = `${repoDir}/deliverables/DESIGN.json`;
    designContent = await tryReadFile(designPath);
  }
  if (!designContent) {
    console.error(`ERROR: DESIGN.json not found at ${repoDir}/stardust/current/DESIGN.json`);
    process.exit(1);
  }

  const design = JSON.parse(designContent);
  const colors = design.colors || {};
  const typography = design.typography || {};
  const shapes = design.shapes || {};
  const spacing = design.spacing || {};

  // Locate logo SVG
  const logoCandidates = [
    `${repoDir}/stardust/current/assets/logo.svg`,
    `${repoDir}/deliverables/assets/logo.svg`,
    `${repoDir}/stardust/current/logo.svg`,
  ];
  let logoSvgContent = null;
  for (const candidate of logoCandidates) {
    const content = await tryReadFile(candidate);
    if (content) { logoSvgContent = content; break; }
  }

  // Locate screenshots — list via shell since VFS has no readdir
  let screenshotPaths = [];
  try {
    const lsResult = await exec(`ls ${repoDir}/deliverables/assets/screenshots/*.png 2>/dev/null || ls ${repoDir}/stardust/current/assets/screenshots/*.png 2>/dev/null || true`);
    const files = lsResult.trim().split('\n').filter(Boolean).sort();
    for (const filePath of files) {
      const name = filePath.split('/').pop();
      const stem = name.replace('.png', '');
      const webPath = `/deliverables/assets/screenshots/${name}`;
      const caption = stem.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      screenshotPaths.push([webPath, caption]);
    }
  } catch (e) { /* no screenshots */ }

  // Build HTML fragments
  const colorSwatchesHtml = buildColorSwatches(colors);
  const { html: typographyHtml, fontLinks: extraFontLinks } = buildTypographySection(typography);
  const shapesHtml = buildShapesSection(shapes, spacing);
  const logoHtml = buildLogoSection(logoSvgContent);
  const screenshotsHtml = buildScreenshotsSection(screenshotPaths);

  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
  const extraFontLinksHtml = [...new Set(extraFontLinks)].join('\n  ');

  // Load template
  const templateCandidates = [
    '/shared/brand-review-template.html',
    `${repoDir}/tools/brand-review-template.html`,
  ];
  // Also check same directory as this script — use a known path
  const scriptDir = process.argv[0].replace(/\/[^/]+$/, '');
  templateCandidates.push(`${scriptDir}/brand-review-template.html`);

  let template = null;
  for (const candidate of templateCandidates) {
    const content = await tryReadFile(candidate);
    if (content) { template = content; break; }
  }
  if (!template) {
    console.error('ERROR: brand-review-template.html not found.');
    process.exit(1);
  }

  // Fill placeholders
  let output = template;
  output = output.replace(/\{\{DOMAIN\}\}/g, domain);
  output = output.replace(/\{\{TIMESTAMP\}\}/g, timestamp);
  output = output.replace(/\{\{EXTRA_FONT_LINKS\}\}/g, extraFontLinksHtml);
  output = output.replace(/\{\{COLOR_SWATCHES\}\}/g, colorSwatchesHtml);
  output = output.replace(/\{\{TYPOGRAPHY_SECTION\}\}/g, typographyHtml);
  output = output.replace(/\{\{SHAPES_SECTION\}\}/g, shapesHtml);
  output = output.replace(/\{\{LOGO_SECTION\}\}/g, logoHtml);
  output = output.replace(/\{\{SCREENSHOTS_SECTION\}\}/g, screenshotsHtml);

  // Write output
  const outPath = `${repoDir}/deliverables/brand-review.html`;
  await fs.writeFile(outPath, output);

  echo(`✓  Brand review written to: ${outPath}`);
  echo(`   Colors:       ${Object.keys(colors).length} extracted`);
  echo(`   Fonts:        ${Object.keys(typography).length} extracted`);
  echo(`   Logo:         ${logoSvgContent ? 'found' : 'not found'}`);
  echo(`   Screenshots:  ${screenshotPaths.length} found`);
}

await main();
