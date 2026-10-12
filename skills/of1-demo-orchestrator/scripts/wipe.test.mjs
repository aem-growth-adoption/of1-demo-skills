import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIPE = join(dirname(fileURLToPath(import.meta.url)), 'wipe.sh');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' }).toString();

// Fake curl: logs the URL + method, returns an empty list.
function fakeBin(root) {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const p = join(bin, 'curl');
  writeFileSync(p, `#!/bin/sh\necho "$*" >> "${root}/curl.log"\necho '[]'\n`);
  chmodSync(p, 0o755);
  return bin;
}

// Hermetic fixture: bare remote + clone with stardust/ committed, state dir.
function fixture({ stardust = true, branch = 'main', recorded = 'main', setup = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wipe-')));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  const state = join(root, 'state');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(root, 'clone', '-q', remote, repo);
  git(repo, 'config', 'user.email', 't@t'); git(repo, 'config', 'user.name', 't');
  git(repo, 'checkout', '-q', '-B', branch);
  mkdirSync(join(repo, 'blocks/of1'), { recursive: true });
  mkdirSync(join(repo, 'of1/config'), { recursive: true });
  writeFileSync(join(repo, 'blocks/of1/of1.js'), 'x');
  writeFileSync(join(repo, 'of1/config/config.json'), '{}');
  writeFileSync(join(repo, 'keep.txt'), 'k');
  if (stardust) { mkdirSync(join(repo, 'stardust')); writeFileSync(join(repo, 'stardust/a'), 'a'); }
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'push', '-q', 'origin', branch);
  mkdirSync(state);
  if (setup) {
    writeFileSync(join(state, 'setup.json'), JSON.stringify({ owner: 'o', repo: 'r', branch: recorded, of1Repo: repo, tokenFromEnv: true }));
    writeFileSync(join(state, 'repo-config.json'), JSON.stringify({ repoDir: repo }));
  }
  return { root, repo, state, bin: fakeBin(root) };
}

function run(f, env = {}) {
  return spawnSync('bash', [WIPE], {
    env: { PATH: `${f.bin}:${process.env.PATH}`, HOME: process.env.HOME, OF1_DEMO_WIPE: '1', OF1_STATE_DIR: f.state, ADOBE_IMS_TOKEN: 't', ...env },
    encoding: 'utf8',
  });
}

test('refuses when OF1_DEMO_WIPE is unset', () => {
  const f = fixture();
  const r = run(f, { OF1_DEMO_WIPE: '' });
  assert.equal(r.status, 1); assert.match(r.stderr, /OF1_DEMO_WIPE/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when state dir is missing', () => {
  const f = fixture();
  const r = run(f, { OF1_STATE_DIR: join(f.root, 'nope') });
  assert.equal(r.status, 1); assert.match(r.stderr, /state dir .* not found/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when setup.json is missing', () => {
  const f = fixture({ setup: false });
  const r = run(f);
  assert.equal(r.status, 1); assert.match(r.stderr, /setup\.json not found/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses on branch mismatch', () => {
  const f = fixture({ branch: 'main', recorded: 'other' });
  const r = run(f);
  assert.equal(r.status, 1); assert.match(r.stderr, /checked-out branch/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when HEAD has no stardust/', () => {
  const f = fixture({ stardust: false });
  const r = run(f);
  assert.equal(r.status, 1); assert.match(r.stderr, /no Stage-2 output/);
  assert.ok(existsSync(join(f.repo, 'blocks/of1')));
});

test('da_delete_tree refuses a path outside /of1 and /templates', () => {
  const r = spawnSync('bash', ['-c', `source "${WIPE}"; da_delete_tree /nav`], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /refusing to delete outside/);
});

test('happy path removes blocks/of1, of1/config and issues DA deletes for /of1 and /templates', () => {
  const f = fixture();
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(f.repo, 'blocks/of1')));
  assert.ok(!existsSync(join(f.repo, 'of1/config')));
  assert.ok(!existsSync(join(f.repo, 'stardust')));
  assert.ok(existsSync(join(f.repo, 'keep.txt')));
  const log = spawnSync('cat', [join(f.root, 'curl.log')], { encoding: 'utf8' }).stdout;
  assert.match(log, /source\/o\/r\/of1/);
  assert.match(log, /source\/o\/r\/templates/);
});
