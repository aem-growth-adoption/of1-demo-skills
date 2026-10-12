import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// The automation harness reads `pipeline-version` to pick its progress map; it must always
// equal the plugin version so a release cannot ship with a stale declaration.
test('pipeline-version equals the plugin version', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.equal(read('pipeline-version').trim(), plugin);
});
