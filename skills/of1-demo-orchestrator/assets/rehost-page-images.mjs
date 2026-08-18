#!/usr/bin/env node
// rehost-page-images.mjs — self-host the external <img> images on the
// replica-authored CONTENT pages (home / drivers / teams / nav / footer / …)
// onto DA media, then re-author the pages so the live site never hotlinks a
// customer CDN.
//
// WHY THIS EXISTS
// stardust:replica recreates the customer's key pages as ordinary EDS content
// pages and authors them to DA, but it leaves the <img src> pointing at the
// customer's own CDN (e.g. media.formula1.com, flagcdn.com, a CloudFront
// distribution). Those external URLs are a problem for two reasons:
//   1. The EDS content-bus fetches every <img> at preview time. A src it can't
//      fetch server-side fails the WHOLE page preview with
//      `409 error from content-bus`, so the page 404s. (Large flag-SVG coats of
//      arms from flagcdn are a repeat offender — see FLAGCDN handling below.)
//   2. Even when they render, hotlinking a customer CDN is fragile (CORS,
//      referrer, token expiry, the CDN vanishing) and is exactly what
//      of1-extract-content already forbids for PRODUCT images
//      (common-pitfalls.md §2). This closes the same gap for content pages.
//
// This is the content-page analogue of of1-extract-content's
// assets/download-images.mjs (which handles products.json only).
//
// Usage (from inside the EDS repo, i.e. $OF1_DEMO_REPO):
//   node "$SKILL_DIR/assets/rehost-page-images.mjs" \
//     --owner "$OWNER" --repo "$REPO" --branch "$BRANCH" \
//     [--content-dir content] [--workers 8] [--dry-run] [--no-reauthor] \
//     [file ...]
//
// With no explicit files it processes every *.html under --content-dir
// (default `content`). Token resolution matches download-images.mjs:
//   --token-file → $DA_TOKEN → $ADOBE_IMS_TOKEN → $OF1_TOKEN_FILE
//   → oauth-token adobe (SLICC) → .hlx/.da-token.json → ~/.aem/da-token.json
//
// Exit code: 0 when every external image was rehosted (and, unless
// --no-reauthor, every touched page re-previewed 200); 1 otherwise — so the
// caller (the orchestrator's Stage 2 replica step) can gate on it.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCb);
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const MIN_BYTES = 100; // content-page art includes tiny flag/logo assets; don't reject them
const DEFAULT_WORKERS = 8;
const PREVIEW_RETRIES = 6;
const PREVIEW_BACKOFF_MS = 4000;

// (magic_prefix, mime, extension)
const MAGIC = [
  { prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png', ext: 'png' },
  { prefix: [0xff, 0xd8, 0xff], mime: 'image/jpeg', ext: 'jpg' },
  { prefix: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif', ext: 'gif' },
  { prefix: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif', ext: 'gif' },
];

function detectContentType(bytes) {
  for (const { prefix, mime, ext } of MAGIC) {
    let match = true;
    for (let i = 0; i < prefix.length; i++) {
      if (bytes[i] !== prefix[i]) { match = false; break; }
    }
    if (match) return { mime, ext };
  }
  // WEBP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // SVG: <?xml prolog or a root <svg in the first bytes
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) {
    return { mime: 'image/svg+xml', ext: 'svg' };
  }
  return { mime: 'image/png', ext: 'png' }; // safe fallback
}

// flagcdn.com serves country flags as SVG. The plain tricolours are tiny, but
// the ones with a detailed coat of arms (es, mx, pt, …) are 100-150KB SVGs that
// the EDS media-bus preview rejects with a 409. flagcdn also exposes a raster
// PNG rendition at /w<width>/<code>.png — fetch that instead. We always route
// flagcdn through the raster rendition so behaviour is uniform, not size-gated.
const FLAGCDN_RE = /^https?:\/\/flagcdn\.com\/(?:\d+x\d+\/)?([a-z]{2}(?:-[a-z]+)?)\.svg$/i;
function fetchableUrl(src) {
  const m = src.match(FLAGCDN_RE);
  if (m) return `https://flagcdn.com/w320/${m[1].toLowerCase()}.png`;
  return src;
}

function parseArgs(argv) {
  const args = {
    owner: null, repo: null, branch: null, contentDir: 'content',
    tokenFile: null, workers: DEFAULT_WORKERS, dryRun: false, reauthor: true, files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--owner': args.owner = argv[++i]; break;
      case '--repo': args.repo = argv[++i]; break;
      case '--branch': args.branch = argv[++i]; break;
      case '--content-dir': args.contentDir = argv[++i]; break;
      case '--token-file': args.tokenFile = argv[++i]; break;
      case '--workers': args.workers = parseInt(argv[++i], 10) || DEFAULT_WORKERS; break;
      case '--dry-run': args.dryRun = true; break;
      case '--no-reauthor': args.reauthor = false; break;
      default:
        if (argv[i].startsWith('--')) { console.error(`Unknown argument: ${argv[i]}`); process.exit(1); }
        args.files.push(argv[i]);
    }
  }
  if (!args.owner || !args.repo || !args.branch) {
    console.error('Required: --owner, --repo, --branch');
    process.exit(1);
  }
  return args;
}

function readTokenFile(p) {
  const resolved = p.replace(/^~/, process.env.HOME || '');
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const token = data.access_token || data.token;
  if (!token) throw new Error(`Token file ${p} missing access_token / token field`);
  return token;
}

async function resolveToken(tokenFileArg) {
  if (tokenFileArg) return readTokenFile(tokenFileArg);
  if (process.env.DA_TOKEN) return process.env.DA_TOKEN;
  if (process.env.ADOBE_IMS_TOKEN) return process.env.ADOBE_IMS_TOKEN;
  if (process.env.OF1_TOKEN_FILE) return readTokenFile(process.env.OF1_TOKEN_FILE);
  try { const { stdout } = await exec('oauth-token adobe'); if (stdout.trim()) return stdout.trim(); } catch { /* SLICC shim absent */ }
  for (const c of ['.hlx/.da-token.json', `${process.env.HOME || ''}/.aem/da-token.json`]) {
    if (c && fs.existsSync(c)) return readTokenFile(c);
  }
  throw new Error(
    'Could not resolve DA token. Pass --token-file, set $DA_TOKEN/$ADOBE_IMS_TOKEN/$OF1_TOKEN_FILE, '
    + 'or place token JSON at .hlx/.da-token.json.',
  );
}

// Recursively collect *.html under dir.
function walkHtml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Map a repo file path to its DA/EDS page path (strip the content dir + .html).
// content/index.html → "index"; content/en/drivers.html → "en/drivers".
function toPagePath(file, contentDir) {
  let rel = file.replace(/\\/g, '/');
  const marker = `/${contentDir}/`;
  const idx = rel.lastIndexOf(marker);
  if (idx >= 0) rel = rel.slice(idx + marker.length);
  else if (rel.startsWith(`${contentDir}/`)) rel = rel.slice(contentDir.length + 1);
  return rel.replace(/\.html$/, '');
}

// Extract external http(s) <img src> URLs, excluding this site's own delivery hosts.
function extractUrls(html, owner, repo, branch) {
  const own = [
    `${branch}--${repo}--${owner}.aem.page`,
    `${branch}--${repo}--${owner}.aem.live`,
    'content.da.live',
  ];
  const urls = new Set();
  const re = /<img\b[^>]*?\bsrc\s*=\s*"(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (!own.some((h) => u.includes(h))) urls.add(u);
  }
  return [...urls];
}

async function downloadImage(url) {
  let resp;
  try { resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }); }
  catch (e) { return { data: null, err: `download error: ${e.message}` }; }
  if (!resp.ok) return { data: null, err: `HTTP ${resp.status}` };
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length < MIN_BYTES) return { data: null, err: `too small (${bytes.length} bytes)` };
  return { data: bytes, err: null };
}

async function daPreview(token, owner, repo, branch, pagePath) {
  const url = `https://admin.hlx.page/preview/${owner}/${repo}/${branch}/${pagePath}`;
  let last = 0;
  for (let i = 0; i < PREVIEW_RETRIES; i++) {
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-content-source-authorization': `Bearer ${token}` },
      });
    } catch (e) { return `preview error: ${e.message}`; }
    if (resp.ok) return null;
    last = resp.status;
    if (resp.status !== 409) break; // only 409 (content-bus busy/conflict) is worth retrying
    await new Promise((r) => setTimeout(r, PREVIEW_BACKOFF_MS));
  }
  return `preview HTTP ${last}`;
}

async function daPut(token, owner, repo, resourcePath, bytes, contentType) {
  // DA binary/text uploads require multipart/form-data with field name "data".
  // A raw PUT returns 2xx but does not persist the file.
  const boundary = '----DABoundary' + crypto.randomBytes(8).toString('hex');
  const filename = resourcePath.split('/').pop();
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const body = new Uint8Array(headerBytes.length + bytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(bytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + bytes.length);
  const url = `https://admin.da.live/source/${owner}/${repo}/${resourcePath}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
  } catch (e) { return `upload error: ${e.message}`; }
  return resp.ok ? null : `HTTP ${resp.status}`;
}

function semaphore(max) {
  let active = 0; const queue = [];
  return function run(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        active++;
        try { resolve(await fn()); } catch (e) { reject(e); }
        finally { active--; if (queue.length) queue.shift()(); }
      };
      if (active < max) execute(); else queue.push(execute);
    });
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = args.dryRun ? null : await resolveToken(args.tokenFile);

  const files = args.files.length ? args.files : walkHtml(args.contentDir);
  if (!files.length) {
    console.log(`No HTML files found under ${args.contentDir}/ — nothing to rehost.`);
    process.exit(0);
  }

  // 1. Collect unique external URLs across all files.
  const perFile = new Map();
  const allUrls = new Set();
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    const urls = extractUrls(html, args.owner, args.repo, args.branch);
    perFile.set(f, { html, urls });
    urls.forEach((u) => allUrls.add(u));
  }
  const urlList = [...allUrls];
  console.log(`${files.length} page(s), ${urlList.length} unique external image URL(s)`);
  if (args.dryRun) {
    urlList.forEach((u) => console.log(`  would rehost: ${u}${fetchableUrl(u) !== u ? `  (via ${fetchableUrl(u)})` : ''}`));
    process.exit(0);
  }

  // 2. Download + upload + preview each unique URL. Filename is keyed to the
  //    ORIGINAL src so the rewrite step can find it and identical srcs dedupe.
  const run = semaphore(args.workers);
  const mapping = {}; // originalSrc -> delivery url
  const results = await Promise.all(urlList.map((src) => run(async () => {
    const { data, err: dlErr } = await downloadImage(fetchableUrl(src));
    if (dlErr) return { src, ok: false, stage: 'download', err: dlErr };
    const { mime, ext } = detectContentType(data);
    const filename = `page-${crypto.createHash('sha1').update(src).digest('hex').slice(0, 16)}.${ext}`;
    const upErr = await daPut(token, args.owner, args.repo, `media/${filename}`, data, mime);
    if (upErr) return { src, ok: false, stage: 'upload', err: upErr };
    const pvErr = await daPreview(token, args.owner, args.repo, args.branch, `media/${filename}`);
    if (pvErr) return { src, ok: false, stage: 'preview', err: pvErr };
    mapping[src] = `https://${args.branch}--${args.repo}--${args.owner}.aem.page/media/${filename}`;
    return { src, ok: true, filename, size: data.length };
  })));

  let okN = 0; const failed = [];
  for (const r of results) {
    if (r.ok) { okN++; console.log(`  ok ${Math.max(1, Math.floor(r.size / 1024))}KB  ${r.filename}  <- ${r.src}`); }
    else { failed.push(r); console.log(`  FAIL ${r.stage} ${r.err}  <- ${r.src}`); }
  }
  console.log(`\nImages: ${okN} rehosted, ${failed.length} failed`);

  // 3. Rewrite srcs in each file, then re-author the touched pages to DA.
  let reauthorFail = 0;
  for (const [f, { html }] of perFile) {
    let out = html; let n = 0;
    for (const [src, dst] of Object.entries(mapping)) {
      const before = out;
      out = out.split(`"${src}"`).join(`"${dst}"`);
      if (out !== before) n++;
    }
    if (n === 0) continue;
    fs.writeFileSync(f, out);
    const pagePath = toPagePath(f, args.contentDir);
    console.log(`  rewrote ${n} src(s) in ${f}  (page /${pagePath})`);
    if (!args.reauthor) continue;
    const putErr = await daPut(token, args.owner, args.repo, `${pagePath}.html`, new TextEncoder().encode(out), 'text/html');
    if (putErr) { reauthorFail++; console.log(`  FAIL re-author PUT ${putErr}  /${pagePath}`); continue; }
    const pvErr = await daPreview(token, args.owner, args.repo, args.branch, pagePath);
    if (pvErr) { reauthorFail++; console.log(`  FAIL re-author preview ${pvErr}  /${pagePath}`); }
    else console.log(`  re-authored /${pagePath}`);
  }

  const bad = failed.length + reauthorFail;
  if (bad) console.error(`\nrehost-page-images: ${bad} failure(s) — content pages still reference external CDN images.`);
  else console.log('\nrehost-page-images: all content-page images self-hosted on DA.');
  process.exit(bad === 0 ? 0 : 1);
}

await main();
