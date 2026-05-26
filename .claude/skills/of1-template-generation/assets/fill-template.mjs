#!/usr/bin/env node
// Fills an OF1 template HTML file with slot values from a JSON file and
// writes a standalone HTML page (with <html>/<head>/<body>) to disk.
//
// Usage:
//   node tools/fill-template.mjs templates/of1-comparison.html sample.json drafts/out.html
//
// Slot conventions (matching templates/of1-*.metadata.json):
//   text  : element has data-slot="key"           — sets innerHTML to value
//   image : <img data-slot="key">                 — sets src/alt
//   link  : <a data-slot="key">                   — sets href + label
//   list  : element has data-slot-list="key"      — replaces innerHTML with <li> per item
//
// This is intentionally regex-based (no DOM lib) so it can run in any
// minimal environment, including a Cloudflare Worker.

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const [, , templatePath, valuesPath, outPath] = process.argv;
if (!templatePath || !valuesPath || !outPath) {
  console.error('usage: fill-template.mjs <template.html> <values.json> <out.html>');
  process.exit(2);
}

const template = await readFile(templatePath, 'utf8');
const values = JSON.parse(await readFile(valuesPath, 'utf8'));

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const escapeAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

// Pre-extract item count so we can hide unused cards.
const itemCount = ['item-1', 'item-2', 'item-3'].filter(
  (k) => values[`${k}.title`] || values[`${k}.body`],
).length;

function fillSlot(html, key, value) {
  if (value == null) return html;

  const v = value;
  const reAttrInner = new RegExp(
    `(<([a-z][\\w-]*)([^>]*?)\\sdata-slot="${key.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&')}"([^>]*)>)([\\s\\S]*?)(</\\2>)`,
    'gi',
  );

  return html.replace(reAttrInner, (match, openTag, tagName, beforeAttrs, afterAttrs, inner, closeTag) => {
    const tag = tagName.toLowerCase();

    // Image slot — set src + alt on the <img> itself (self-closing handled below).
    if (tag === 'img') {
      // matched as paired — unusual; pass through.
      return match;
    }

    // Link slot — value is { href, label } or plain string.
    if (tag === 'a') {
      const href = typeof v === 'object' ? (v.href || '#') : '#';
      const label = typeof v === 'object' ? v.label : v;
      const newOpen = openTag.replace(/\shref="[^"]*"/, '') // strip existing href
        .replace(/^<a/, `<a href="${escapeAttr(href)}"`);
      return `${newOpen}${escapeHtml(label)}${closeTag}`;
    }

    // Text slot — set innerHTML. Accept either string or {html: '...'} for trusted HTML.
    const inner2 = typeof v === 'object' && v.html != null ? v.html : escapeHtml(v);
    return `${openTag}${inner2}${closeTag}`;
  });
}

function fillImgSlot(html, key, value) {
  if (value == null) return html;
  const src = typeof value === 'object' ? value.src : value;
  const alt = typeof value === 'object' ? (value.alt || '') : '';
  const re = new RegExp(
    `<img([^>]*?)\\sdata-slot="${key.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&')}"([^>]*?)>`,
    'gi',
  );
  return html.replace(re, (m, before, after) => {
    const stripped = (before + after).replace(/\s(src|alt)="[^"]*"/g, '');
    return `<img${stripped} src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" data-slot="${key}">`;
  });
}

function fillListSlot(html, key, items) {
  if (!Array.isArray(items) || items.length === 0) return html;
  const re = new RegExp(
    `(<([a-z][\\w-]*)([^>]*?)\\sdata-slot-list="${key.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&')}"([^>]*)>)([\\s\\S]*?)(</\\2>)`,
    'gi',
  );
  const li = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return html.replace(re, (match, openTag, tagName, before, after, inner, closeTag) => `${openTag}${li}${closeTag}`);
}

let out = template;

for (const [key, value] of Object.entries(values)) {
  // Try list-slot first (separate attribute), then image, then everything else.
  if (Array.isArray(value)) {
    out = fillListSlot(out, key, value);
  } else if (typeof value === 'object' && value !== null && value.src) {
    out = fillImgSlot(out, key, value);
  } else {
    // Image slot may have a plain string url; check both.
    out = fillImgSlot(out, key, value);
    out = fillSlot(out, key, value);
  }
}

// Strip any image slot that didn't get filled — leaves no <img src=""> in the
// output so browsers don't render the broken-image icon. We keep the parent
// container in the DOM (it might have a background-color treatment); CSS in
// of1-base.css collapses empty media wrappers.
out = out.replace(/<img[^>]*\sdata-slot="[^"]+"[^>]*>/gi, (m) => {
  const hasSrc = /\ssrc="[^"]+"/.test(m);
  return hasSrc ? m : '';
});

// Hide unused cards. A card is any <article data-card="N"> in the template.
// Each such article may carry a `data-card-key="<slot-key>"` attribute that
// names the slot whose presence in the values object determines whether the
// card stays visible. For backward compatibility, articles without
// data-card-key fall back to checking `item-N.title` / `item-N.body`.
const cardRegex = /<article([^>]*?\sdata-card="(\d+)"[^>]*)>/g;
out = out.replace(cardRegex, (match, attrs, idx) => {
  const keyMatch = attrs.match(/\sdata-card-key="([^"]+)"/);
  const probeKey = keyMatch ? keyMatch[1] : `item-${idx}.title`;
  const fallbackKey = keyMatch ? null : `item-${idx}.body`;
  const present = values[probeKey] != null || (fallbackKey && values[fallbackKey] != null);
  if (present) return match;
  // Avoid double-hiding if already hidden
  if (/\shidden(?:\s|$)/.test(attrs)) return match;
  return `<article${attrs} hidden>`;
});

// Mark grid with item count for CSS responsive rules.
out = out.replace('<div class="of1-cmp-grid" data-grid-items>', `<div class="of1-cmp-grid" data-grid-items data-item-count="${itemCount}">`);

// Wrap in a standalone HTML page so it can be served from drafts/ or by the worker.
const stylesheet = values['_meta']?.stylesheet || '/styles/of1-comparison.css';
const title = values['hero.title'] || 'Comparison';

const standalone = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeAttr(stylesheet)}">
</head>
<body>
${out}
</body>
</html>
`;

await writeFile(outPath, standalone);
console.log(`wrote ${outPath} (${standalone.length} bytes, ${itemCount} items)`);
