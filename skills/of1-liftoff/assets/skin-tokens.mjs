#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const START = '/* OF1-TOKENS:START */';
const END = '/* OF1-TOKENS:END */';

// DESIGN.json field -> CSS custom property. Only emit vars whose source value exists.
function tokenLines(d) {
  const out = [];
  const push = (name, val) => { if (val != null && String(val).trim() !== '') out.push(`  ${name}: ${val};`); };
  push('--heading-font-family', d.typography?.heading?.family);
  push('--body-font-family', d.typography?.body?.family);
  push('--text-color', d.colors?.text);
  push('--background-color', d.colors?.background);
  push('--link-color', d.colors?.primary);
  push('--link-hover-color', d.colors?.secondary ?? d.colors?.primary);
  push('--clr-primary', d.colors?.primary);
  push('--clr-secondary', d.colors?.secondary);
  push('--clr-accent', d.colors?.accent);
  push('--clr-surface', d.colors?.surface);
  push('--clr-muted', d.colors?.muted);
  push('--max-content-width', d.spacing?.maxWidth);
  push('--of1-rounded', d.rounded);
  return out;
}

function upsert(css, block) {
  if (css.includes(START) && css.includes(END)) {
    const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return css.replace(re, block);
  }
  // insert just after the first `:root {`
  const idx = css.indexOf(':root');
  if (idx === -1) return css + '\n:root {\n' + block + '\n}\n';
  const brace = css.indexOf('{', idx);
  return css.slice(0, brace + 1) + '\n' + block + '\n' + css.slice(brace + 1);
}

function main() {
  const [designPath, cssPath] = [process.argv[2], process.argv[3]];
  if (!designPath || !cssPath) { console.error('usage: skin-tokens.mjs <design.json> <styles.css>'); return 1; }
  let design, css;
  try { design = JSON.parse(readFileSync(designPath, 'utf8')); }
  catch (e) { console.error(`cannot read DESIGN.json ${designPath}: ${e.message}`); return 1; }
  try { css = readFileSync(cssPath, 'utf8'); }
  catch (e) { console.error(`cannot read styles.css ${cssPath}: ${e.message}`); return 1; }
  const lines = tokenLines(design);
  if (lines.length === 0) { console.error('no usable tokens found in DESIGN.json — refusing to skin (fail loudly)'); return 1; }
  const block = `${START}\n${lines.join('\n')}\n  ${END}`;
  writeFileSync(cssPath, upsert(css, block));
  console.log(`✓ skinned ${cssPath} with ${lines.length} token(s)`);
  return 0;
}
process.exit(main());
