#!/usr/bin/env node
// write-signals.mjs — upload of1/config/signals as a DA sheet and preview it on main.
// Usage: node write-signals.mjs --owner O --repo R --rows <entries.json>
// Token: $DA_TOKEN, $ADOBE_IMS_TOKEN, or $OF1_TOKEN_FILE (JSON access_token/token, or raw).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const COLUMNS = ['param', 'value', 'source', 'context'];
const SHEET_PATH = 'of1/config/signals';

// Control characters other than \n cannot be held in a sheet cell; lone surrogates break JSON/UTF-8.
const BAD_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export function toRows(entries) {
  if (!Array.isArray(entries)) throw new Error('entries must be a JSON array');
  if (entries.length === 0) throw new Error('refusing to write an empty signals sheet (no entries)');
  return entries.map((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`entry ${i}: must be an object`);
    for (const k of Object.keys(e)) {
      if (!COLUMNS.includes(k)) throw new Error(`entry ${i}: unsupported field "${k}" (allowed: ${COLUMNS.join(', ')})`);
    }
    const row = {};
    for (const c of COLUMNS) {
      const v = e[c];
      if (v === undefined || v === null) { row[c] = ''; continue; }
      if (typeof v !== 'string') throw new Error(`entry ${i}: "${c}" must be a string`);
      if (BAD_CHARS.test(v)) throw new Error(`entry ${i}: "${c}" contains a character a sheet cell cannot hold (control character or lone surrogate)`);
      row[c] = v;
    }
    if (!row.param.trim() || !row.value.trim()) throw new Error(`entry ${i}: "param" and "value" are required`);
    if (row.param === 'llm_app_ctx') throw new Error(`entry ${i}: "llm_app_ctx" is handled natively by the extension; do not configure it`);
    return row;
  });
}

export function buildSheetJson(rows) {
  return { total: rows.length, limit: rows.length, offset: 0, data: rows, ':sheetname': 'data', ':type': 'sheet' };
}

// Parse a fetched <path>.json sheet back into entries; throws if not the expected shape.
export function parseSheet(json, expected) {
  const data = json?.data;
  if (!Array.isArray(data)) throw new Error('response is not a sheet (no "data" array)');
  if (expected && data.length !== expected.length) throw new Error(`expected ${expected.length} rows, got ${data.length}`);
  data.forEach((r, i) => {
    for (const c of COLUMNS) if (!(c in r)) throw new Error(`row ${i} is missing column "${c}"`);
    if (expected) for (const c of COLUMNS) if (r[c] !== expected[i][c]) throw new Error(`row ${i} column "${c}" differs from what was written`);
  });
  return data;
}

export function resolveToken(env = process.env) {
  if (env.DA_TOKEN) return env.DA_TOKEN;
  if (env.ADOBE_IMS_TOKEN) return env.ADOBE_IMS_TOKEN;
  if (env.OF1_TOKEN_FILE) {
    const raw = fs.readFileSync(env.OF1_TOKEN_FILE, 'utf8').trim();
    try { const p = JSON.parse(raw); if (p && typeof p === 'object') { const t = p.access_token || p.token; if (t) return t; throw new Error('no access_token'); } } catch (e) { if (e.message === 'no access_token') throw new Error(`Token file ${env.OF1_TOKEN_FILE} has no access_token`); }
    return raw;
  }
  throw new Error('No DA token: set DA_TOKEN, ADOBE_IMS_TOKEN or OF1_TOKEN_FILE');
}

export async function write({ owner, repo, rows, token, fetchImpl = globalThis.fetch }) {
  const boundary = '----DABoundary' + crypto.randomBytes(8).toString('hex');
  const payload = JSON.stringify(buildSheetJson(rows));
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="signals.json"\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--\r\n`);
  const auth = { Authorization: `Bearer ${token}` };
  const up = await fetchImpl(`https://admin.da.live/source/${owner}/${repo}/${SHEET_PATH}.json`, {
    method: 'POST', headers: { ...auth, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body,
  });
  if (!up.ok) throw new Error(`FAIL upload ${SHEET_PATH} HTTP ${up.status}${up.status === 401 || up.status === 403 ? ' — DA token expired or invalid' : ''}`);
  const pv = await fetchImpl(`https://admin.hlx.page/preview/${owner}/${repo}/main/${SHEET_PATH}.json`, { method: 'POST', headers: auth });
  if (!pv.ok) throw new Error(`FAIL preview ${SHEET_PATH} HTTP ${pv.status}`);
  return `✓ ${SHEET_PATH} previewed`;
}

export async function verify({ owner, repo, rows, fetchImpl = globalThis.fetch }) {
  const r = await fetchImpl(`https://main--${repo}--${owner}.aem.page/${SHEET_PATH}.json`);
  if (!r.ok) throw new Error(`FAIL verify HTTP ${r.status}`);
  parseSheet(await r.json(), rows);
  return `✓ ${rows.length} rows verified`;
}

async function main() {
  const a = process.argv.slice(2);
  const get = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const [owner, repo, file] = [get('--owner'), get('--repo'), get('--rows')];
  if (!owner || !repo || !file) throw new Error('Usage: write-signals.mjs --owner O --repo R --rows <entries.json>');
  const rows = toRows(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(await write({ owner, repo, rows, token: resolveToken() }));
  console.log(await verify({ owner, repo, rows }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((e) => { console.error(`FATAL: ${e.message}`); process.exit(1); });
}
