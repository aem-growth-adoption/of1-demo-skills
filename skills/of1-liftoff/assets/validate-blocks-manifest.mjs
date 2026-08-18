#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const SLOT_TYPES = new Set(['text', 'image', 'link', 'list']);

function validate(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (typeof m.generatedAt !== 'string') errs.push('generatedAt must be a string');
  if (!m.source || typeof m.source.domain !== 'string') errs.push('source.domain must be a string');
  if (!Array.isArray(m.source?.pages) || m.source.pages.length === 0) errs.push('source.pages must be a non-empty array');
  else m.source.pages.forEach((p, i) => {
    if (typeof p.slug !== 'string') errs.push(`source.pages[${i}].slug must be a string`);
    if (typeof p.role !== 'string') errs.push(`source.pages[${i}].role must be a string`);
  });
  if (typeof m.tokensSource !== 'string') errs.push('tokensSource must be a string');
  if (!Array.isArray(m.blocks) || m.blocks.length === 0) errs.push('blocks must be a non-empty array');
  else m.blocks.forEach((b, i) => {
    if (typeof b.name !== 'string' || !b.name) errs.push(`blocks[${i}].name must be a non-empty string`);
    if (!Array.isArray(b.usedOn) || b.usedOn.length === 0) errs.push(`blocks[${i}].usedOn must be a non-empty array`);
    if (!Array.isArray(b.slotRegions)) errs.push(`blocks[${i}].slotRegions must be an array`);
    else b.slotRegions.forEach((r, j) => {
      if (typeof r.selector !== 'string' || !r.selector) errs.push(`blocks[${i}].slotRegions[${j}].selector must be a non-empty string`);
      if (!SLOT_TYPES.has(r.slotType)) errs.push(`blocks[${i}].slotRegions[${j}].slotType must be one of ${[...SLOT_TYPES].join('|')}`);
    });
  });
  return errs;
}

function main() {
  const p = process.argv[2];
  if (!p) { console.error('usage: validate-blocks-manifest.mjs <path>'); return 1; }
  let m;
  try { m = JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { console.error(`cannot read/parse ${p}: ${e.message}`); return 1; }
  const errs = validate(m);
  if (errs.length) { console.error('INVALID:\n' + errs.map(e => '  - ' + e).join('\n')); return 1; }
  console.log(`✓ blocks-manifest valid (${m.blocks.length} block(s), ${m.source.pages.length} page(s))`);
  return 0;
}
process.exit(main());
