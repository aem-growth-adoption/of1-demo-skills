import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, chmodSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIPE = join(dirname(fileURLToPath(import.meta.url)), 'wipe.sh');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' }).toString();

// Fake curl: logs the URL + method, returns an empty list.
// Listings: files named `${root}/list/<url path with / -> _>` hold JSON for that list URL.
function fakeBin(root) {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'list'));
  const p = join(bin, 'curl');
  writeFileSync(p, `#!/bin/sh
echo "$*" >> "${root}/curl.log"
case "$*" in *"-K -"*) cat >> "${root}/stdin.log";; esac
case "$*" in *"-X DELETE"*) exit 0;; esac
for a in "$@"; do u="$a"; done
f="${root}/list/$(echo "$u" | sed 's#https://admin.da.live/list/##; s#/#_#g')"
if [ -f "$f" ]; then cat "$f"; else echo '[]'; fi
`);
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

const setList = (f, path, entries) => writeFileSync(join(f.root, 'list', `o_r${path.replace(/\//g, '_')}`), JSON.stringify(entries));
const curlLog = (f) => (existsSync(join(f.root, 'curl.log')) ? readFileSync(join(f.root, 'curl.log'), 'utf8') : '');
const deletes = (f) => curlLog(f).split('\n').filter((l) => l.includes('-X DELETE')).map((l) => l.match(/https:\S+/)[0]);
const head = (f) => git(f.repo, 'rev-parse', 'HEAD').trim();

function run(f, env = {}) {
  return spawnSync('bash', [WIPE], {
    env: { PATH: `${f.bin}:${process.env.PATH}`, HOME: process.env.HOME, OF1_DEMO_WIPE: '1', OF1_STATE_DIR: f.state, ADOBE_IMS_TOKEN: 't', ...env },
    encoding: 'utf8',
  });
}

function refused(f, r, re) {
  assert.equal(r.status, 1); assert.match(r.stderr, re);
  assert.equal(curlLog(f), '');
  assert.equal(git(f.repo, 'rev-list', '--count', 'HEAD').trim(), '1');
}

test('refuses when OF1_DEMO_WIPE is unset', () => {
  const f = fixture();
  const r = run(f, { OF1_DEMO_WIPE: '' });
  refused(f, r, /OF1_DEMO_WIPE/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when state dir is missing', () => {
  const f = fixture();
  const r = run(f, { OF1_STATE_DIR: join(f.root, 'nope') });
  refused(f, r, /state dir .* not found/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when setup.json is missing', () => {
  const f = fixture({ setup: false });
  const r = run(f);
  refused(f, r, /setup\.json not found/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses on branch mismatch', () => {
  const f = fixture({ branch: 'main', recorded: 'other' });
  const r = run(f);
  refused(f, r, /checked-out branch/);
  assert.ok(existsSync(join(f.repo, 'stardust')));
});

test('refuses when HEAD has no stardust/', () => {
  const f = fixture({ stardust: false });
  const r = run(f);
  refused(f, r, /no Stage-2 output/);
  assert.ok(existsSync(join(f.repo, 'blocks/of1')));
});

test('refuses when OF1_STATE_DIR is unset', () => {
  const f = fixture();
  refused(f, run(f, { OF1_STATE_DIR: '' }), /OF1_STATE_DIR is not set/);
});

test('refuses when repo-config repoDir mismatches', () => {
  const f = fixture();
  writeFileSync(join(f.state, 'repo-config.json'), JSON.stringify({ repoDir: f.root }));
  refused(f, run(f), /does not match/);
});

test('refuses when of1Repo has no .git', () => {
  const f = fixture();
  const plain = join(f.root, 'plain'); mkdirSync(plain);
  writeFileSync(join(f.state, 'setup.json'), JSON.stringify({ owner: 'o', repo: 'r', branch: 'main', of1Repo: plain, tokenFromEnv: true }));
  refused(f, run(f), /not a git checkout/);
});

test('da_delete_tree refuses traversal and empty segments', () => {
  for (const p of ['/of1/../nav', '/of1//x', '/of1/..', '/templates/a/../../nav']) {
    const r = spawnSync('bash', ['-c', `source "${WIPE}"; da_delete_tree '${p}'`], { encoding: 'utf8' });
    assert.equal(r.status, 1, p); assert.match(r.stderr, /refusing/);
  }
});

test('da_delete_tree skips unsafe listing names and deletes only the safe one', () => {
  const f = fixture();
  setList(f, '/of1', [{ name: '..' }, { name: 'a/b', ext: 'html' }, { name: '.', ext: 'html' }, { name: 'ok', ext: 'html' }]);
  const r = spawnSync('bash', ['-c', `source "${WIPE}"; OWNER=o REPO=r DA_TOKEN=t da_delete_tree /of1`], {
    env: { PATH: `${f.bin}:${process.env.PATH}` }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /skipping unsafe/);
  assert.deepEqual(deletes(f), ['https://admin.da.live/source/o/r/of1/ok.html', 'https://admin.da.live/source/o/r/of1']);
  assert.ok(!curlLog(f).includes('..'));
});

test('da_delete_tree refuses a path outside /of1 and /templates', () => {
  const r = spawnSync('bash', ['-c', `source "${WIPE}"; da_delete_tree /nav`], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /refusing to delete outside/);
});

test('da_curl sends the token via -K - stdin, never in argv', () => {
  const f = fixture();
  setList(f, '/of1', [{ name: 'page', ext: 'html' }]);
  const r = run(f, { ADOBE_IMS_TOKEN: 'sekrit-token' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(curlLog(f).length > 0);
  assert.ok(!curlLog(f).includes('sekrit-token'));
  assert.ok(!curlLog(f).includes('Authorization'));
  for (const l of curlLog(f).split('\n').filter(Boolean)) assert.match(l, /-K -/);
  const stdin = readFileSync(join(f.root, 'stdin.log'), 'utf8');
  assert.match(stdin, /Authorization: Bearer sekrit-token/);
});

test('da_curl refuses tokens with quote, backslash or control characters', () => {
  const f = fixture();
  for (const tok of ['a"b', 'a\\b', 'a\nb']) {
    const r = spawnSync('bash', ['-c', `source "${WIPE}"; OWNER=o REPO=r DA_TOKEN="$TOK" da_delete_tree /of1`], {
      encoding: 'utf8', env: { PATH: `${f.bin}:${process.env.PATH}`, TOK: tok },
    });
    assert.match(r.stderr, /refusing DA token/);
  }
  assert.equal(curlLog(f), '');
});

test('happy path: commit, push, recursive DA delete', () => {
  const f = fixture();
  setList(f, '/of1', [{ name: 'config' }, { name: 'page', ext: 'html' }]);
  setList(f, '/of1/config', [{ name: 'personas', ext: 'json' }]);
  setList(f, '/templates', [{ name: 'home', ext: 'html' }]);
  setList(f, '', [{ name: 'index', ext: 'html' }, { name: 'of1', }]);
  const before = head(f);
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(f.repo, 'blocks/of1')));
  assert.ok(!existsSync(join(f.repo, 'of1/config')));
  assert.ok(!existsSync(join(f.repo, 'stardust')));
  assert.ok(existsSync(join(f.repo, 'keep.txt')));
  assert.notEqual(head(f), before);
  assert.equal(git(f.repo, 'log', '-1', '--format=%s').trim(), 'chore: clean slate for main');
  assert.equal(git(f.root + '/remote.git', 'rev-parse', 'main').trim(), head(f));
  const base = 'https://admin.da.live/source/o/r';
  assert.deepEqual(deletes(f), [
    `${base}/of1/config/personas.json`, `${base}/of1/config`, `${base}/of1/page.html`, `${base}/of1`,
    `${base}/templates/home.html`, `${base}/templates`, `${base}/index.html`,
  ]);
});
