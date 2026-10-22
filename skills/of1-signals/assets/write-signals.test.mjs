import test from 'node:test';
import assert from 'node:assert/strict';
import { toRows, buildSheetJson, parseSheet, write } from './write-signals.mjs';

test('toRows fills optional columns with empty strings', () => {
  const rows = toRows([{ param: 'gclid', value: 'abc', context: 'ad\ncopy' }]);
  assert.deepEqual(rows, [{ param: 'gclid', value: 'abc', source: '', context: 'ad\ncopy' }]);
});
test('toRows refuses empty input', () => { assert.throws(() => toRows([]), /empty/); });
test('toRows rejects control chars, non-strings, unknown fields, missing param/value', () => {
  assert.throws(() => toRows([{ param: 'a', value: 'b', context: 'x\ty' }]), /cannot hold/);
  assert.throws(() => toRows([{ param: 'a', value: 'b', context: 'x\r\ny' }]), /cannot hold/);
  assert.throws(() => toRows([{ param: 'a', value: 1 }]), /string/);
  assert.throws(() => toRows([{ param: 'a', value: 'b', label: 'x' }]), /unsupported/);
  assert.throws(() => toRows([{ param: 'a' }]), /required/);
  assert.throws(() => toRows([{ param: 'llm_app_ctx', value: 'x' }]), /natively/);
});
test('buildSheetJson shape and round trip via parseSheet', () => {
  const rows = toRows([{ param: 'p', value: 'v', source: 'email', context: 'c' }]);
  const sheet = buildSheetJson(rows);
  assert.equal(sheet[':type'], 'sheet');
  assert.equal(sheet.total, 1);
  assert.deepEqual(parseSheet(sheet, rows), rows);
  assert.throws(() => parseSheet({ data: [] }, rows), /expected 1/);
  assert.throws(() => parseSheet([{}], rows), /not a sheet/);
});
test('write uploads then previews on main, token only in headers', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; };
  await write({ owner: 'o', repo: 'r', rows: toRows([{ param: 'p', value: 'v' }]), token: 'T', fetchImpl });
  assert.equal(calls[0].url, 'https://admin.da.live/source/o/r/of1/config/signals.json');
  assert.equal(calls[1].url, 'https://admin.hlx.page/preview/o/r/main/of1/config/signals.json');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer T');
});
test('write fails loudly on upload error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401 });
  await assert.rejects(write({ owner: 'o', repo: 'r', rows: toRows([{ param: 'p', value: 'v' }]), token: 'T', fetchImpl }), /HTTP 401/);
});
