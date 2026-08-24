#!/usr/bin/env node
// fill-discovery.mjs — build deliverables/discovery.html from the discovery
// artifacts, so the report is generated deterministically (like fill-demo-hub.mjs)
// instead of hand-authored per run.
//
// Reads:
//   - $OF1_STATE_DIR/of1-discovery-output.md   (the structured discovery report)
//   - $OF1_STATE_DIR/discovery-*.png           (full-page screenshots)
//   - assets/discovery-report.html             (the themed template, beside this script)
// Writes:
//   - <repo-dir>/deliverables/discovery.html
//   - <repo-dir>/deliverables/assets/screenshots/discovery-*.png  (copied; referenced
//     by absolute path — no base64 bloat, and absolute paths resolve on the EDS preview)
//
// Usage (cd into the repo first, or pass it):
//   OF1_STATE_DIR=... node fill-discovery.mjs <repo-dir> <domain>

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

// Inline formatting: **bold** and bare/linked URLs. Operates on already-escaped text.
function renderInline(escaped) {
  let out = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Autolink http(s) URLs (they were escaped, so & is &amp; — fine inside href).
  out = out.replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return out;
}

// Minimal, dependency-free Markdown → HTML for the discovery report's known
// shape: #/##/### headings, - bullet lists, **bold**, links, and paragraphs.
function renderMarkdown(md) {
  const lines = md.split('\n');
  const html = [];
  let inList = false;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${renderInline(htmlEscape(para.join(' ')))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) { html.push('</ul>'); inList = false; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);

    if (heading) {
      flushPara(); closeList();
      // Drop the document's own H1 title — the page template already renders
      // "Discovery: {DOMAIN}". Keep ## as h2 and ###+ as h3.
      if (heading[1].length === 1) continue;
      const level = heading[1].length === 2 ? 2 : 3;
      html.push(`<h${level}>${renderInline(htmlEscape(heading[2]))}</h${level}>`);
    } else if (bullet) {
      flushPara();
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${renderInline(htmlEscape(bullet[1]))}</li>`);
    } else if (line.trim() === '') {
      flushPara(); closeList();
    } else {
      if (inList) closeList();
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  return html.join('\n');
}

function main(argv) {
  if (argv.length < 4) {
    console.error('usage: OF1_STATE_DIR=... node fill-discovery.mjs <repo-dir> <domain>');
    return 2;
  }
  const repoDir = path.resolve(argv[2]);
  const domain = argv[3];
  const stateDir = process.env.OF1_STATE_DIR;
  if (!stateDir) {
    console.error('OF1_STATE_DIR not set — needed to find of1-discovery-output.md and screenshots');
    return 1;
  }

  const mdPath = path.join(stateDir, 'of1-discovery-output.md');
  if (!fs.existsSync(mdPath)) {
    console.error(`FAIL: ${mdPath} not found — run discovery Step 4 (write of1-discovery-output.md) first.`);
    return 1;
  }
  const md = fs.readFileSync(mdPath, 'utf8');

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const template = fs.readFileSync(path.join(scriptDir, 'discovery-report.html'), 'utf8');

  // Copy screenshots into the served deliverables tree and reference by absolute path.
  const shotsSrcDir = stateDir;
  const shots = fs
    .readdirSync(shotsSrcDir)
    .filter((f) => /^discovery-.*\.png$/.test(f))
    .sort((a, b) => (a === 'discovery-home.png' ? -1 : b === 'discovery-home.png' ? 1 : a.localeCompare(b)));

  const shotsOutDir = path.join(repoDir, 'deliverables', 'assets', 'screenshots');
  fs.mkdirSync(shotsOutDir, { recursive: true });

  const shotsHtml = shots
    .map((f) => {
      fs.copyFileSync(path.join(shotsSrcDir, f), path.join(shotsOutDir, f));
      const label = f.replace(/^discovery-/, '').replace(/\.png$/, '').replace(/-/g, ' ');
      return `  <div class="shot"><figure><img src="/deliverables/assets/screenshots/${f}" alt="${htmlEscape(label)} screenshot" loading="lazy"><figcaption>${htmlEscape(label)}</figcaption></figure></div>`;
    })
    .join('\n');

  const reportHtml = renderMarkdown(md);

  const out = template
    .split('{{DOMAIN}}').join(htmlEscape(domain))
    .split('{{SCREENSHOTS_HTML}}').join(shotsHtml || '<p class="sub">No screenshots captured.</p>')
    .split('{{REPORT_HTML}}').join(reportHtml);

  const outDir = path.join(repoDir, 'deliverables');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'discovery.html');
  fs.writeFileSync(outPath, out);

  console.log(`✓ Discovery report written to ${outPath} (${shots.length} screenshot(s))`);
  return 0;
}

process.exit(main(process.argv));
