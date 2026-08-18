#!/usr/bin/env node
// Stage 2 (liftoff) artifact gate — liftoff-native, NO pixel diff.
// Verifies each lifted page rendered, lints clean, no JS errors, human-approved,
// plus render-integrity: preview reached HTTP 200, no broken images, .plain.html envelope intact.
import { readFileSync } from 'node:fs';
import path from 'node:path';

function main() {
  const repoDir = process.argv[2] || '.';
  const ledgerPath = path.join(repoDir, 'stardust', 'liftoff', 'progress.json');
  let ledger;
  try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); }
  catch (e) { console.error(`✗ liftoff ledger missing/unreadable at ${ledgerPath}: ${e.message}`); return 1; }
  const pages = Array.isArray(ledger.pages) ? ledger.pages : [];
  if (pages.length === 0) { console.error('✗ liftoff ledger has no pages'); return 1; }

  const fails = [];
  for (const p of pages) {
    const id = `${p.role || '?'} ${p.slug || '?'}`;
    if (p.rendered !== true) fails.push(`${id}: did not render`);
    if (String(p.lint) === 'fail') fails.push(`${id}: lint FAIL`);
    if (Number(p.jsErrors) > 0) fails.push(`${id}: ${p.jsErrors} JS error(s)`);
    if (p.approved !== true) fails.push(`${id}: not human-approved`);
    if (p.previewOk !== true) fails.push(`${id}: preview never reached HTTP 200`);
    if (Number(p.brokenImages) > 0) fails.push(`${id}: ${p.brokenImages} broken image(s)`);
    if (Number(p.plainHtmlBytes) < 100) fails.push(`${id}: .plain.html ${p.plainHtmlBytes}B (<100, missing <main> envelope)`);
  }

  if (fails.length) {
    console.error('✗ Liftoff NOT demo-grade — HARD STOP:\n' + fails.map(f => '  - ' + f).join('\n'));
    return 2;
  }
  console.log(`✓ Liftoff artifacts are demo-grade (${pages.length} page(s) checked).`);
  return 0;
}
process.exit(main());
