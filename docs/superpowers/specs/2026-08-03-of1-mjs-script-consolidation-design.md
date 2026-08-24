# OF1 Build Scripts — Consolidate `.jsh`/`.py` Pairs to Portable `.mjs`

**Date:** 2026-08-03
**Branch:** `skills-v5-next`
**Status:** Design approved, pending spec review

## Problem

Five OF1 build-time tools each ship **twice** — a `.py` variant (Claude Code,
which has `python3`) and a `.jsh` variant (SLICC, whose runtime has no
`python3` and historically ran JS via the `run_jsh` command). That is 10 files
kept in lockstep by hand, and they have already drifted: `download-images` is
296 lines (`.jsh`) vs 351 (`.py`), `fill-demo-hub` 313 vs 338,
`assemble-catalog` 124 vs 115. Every bugfix must be applied twice or silently
diverges.

The scripts are:

| Tool | Skill | Purpose |
|---|---|---|
| `assemble-catalog` | of1-build-templates | Reads every `templates/of1-*.metadata.json` + `.html` → `templates/templates-catalog.json` + `of1/config/templates.json` |
| `fill-template` | of1-build-templates | Fills an OF1 template HTML with slot values from a JSON sample |
| `download-images` | of1-extract-content | Parallel product-image download + upload to DA (8 workers, content-type sniffing) |
| `fill-config-review` | of1-generate-config-review | Fills `config-review.html` from `of1/config/*.json` |
| `fill-demo-hub` | of1-publish | Fills `demo-hub.html` from pipeline outputs |

## Goal

Replace the 10 `.jsh`/`.py` files with **5 single `.mjs` files** — one per
tool — that run identically on both Claude Code and SLICC via
`node <tool>.mjs <args>`. One file per tool, one maintenance path.

## Runtime landscape (why one `.mjs` works on both)

Findings from reading the SLICC runtime at `../slicc`
(`packages/webapp/src/…`):

| Concern | Claude Code | SLICC (`node` command → worker realm) |
|---|---|---|
| Invocation | `node script.mjs args` (real node v23.11.0) | `node script.mjs args` (supplemental `node` command, `packages/webapp/src/shell/supplemental-commands/node-command.ts`) |
| `process.argv` | `['node', script, ...args]` | **identical** — verified `jsh-executor.ts:78` (`argv = ['node', scriptPath, ...args]`) + `jsh-executor.test.ts:163-166` |
| ESM `import` | native | supported — `node:fs`, `node:fs/promises`, `node:path`, `node:crypto`, `child_process`, `url`, `zlib`, `buffer`, `util`, `os`, `stream` all resolve (`realm-module-system.ts:235-253`); ESM `.jsh` e2e proves top-level `import` runs (`esm-schemes-jsh-e2e.test.ts`) |
| global `fetch` | global | realm-provided global (`js-realm-shared.ts:280`) |
| sync fs (`readFileSync`/`writeFileSync`/`existsSync`/`mkdirSync`/`readdirSync`/`statSync`) | ✅ | ✅ VFS-backed, coherent (`realm-fs-bridge.ts` synchronous surface) |
| **`execSync` / `spawnSync` / `execFileSync`** | ✅ | **THROWS** — `createNodeChildProcess` returns `cpUnavailable(...)` for all three (`js-realm-helpers.ts:2052-2053`, :1766-1767) |
| async `child_process.exec` / `spawn` | ✅ | ✅ callback + buffered form over the realm exec bridge (`js-realm-helpers.ts:1886+`) |

## The portability contract

Every ported `.mjs` MUST obey all four:

1. **Standard argv** — read positional args at `process.argv[2]`, `[3]`, …
   (The legacy `.jsh` files read `argv[1]` under the old `run_jsh` shifted
   contract; that contract is retired — `node` sets standard argv.)
2. **ESM `import`** only from the builtins listed above (`node:*`,
   `child_process`) plus global `fetch`/`URL`. No third-party npm imports; no
   CDN.
3. **No synchronous subprocess.** `execSync`/`spawnSync`/`execFileSync` throw
   in SLICC. Any subprocess call goes through one promisified async helper
   (`promisify(child_process.exec)` or a small `spawn` wrapper).
4. Synchronous fs (`readFileSync`/`writeFileSync`/`existsSync`/`mkdirSync`) is
   permitted — coherent on both runtimes.

## Source of truth: port `.py` verbatim

The `.py` variant governs **behavior** — port it faithfully, translating
idioms: `json`→`JSON`, `pathlib.Path`→`node:path` + `node:fs`,
`html.escape`→a small local helper, `re`→JS `RegExp`, `glob`→`fs.readdirSync`
filter, `datetime`→`Date`.

Four of the five are pure (`assemble-catalog`, `fill-template`,
`fill-config-review`, `fill-demo-hub` import only `json/os/sys/pathlib/
html/re/glob/datetime`) — a direct transliteration.

`download-images` is the one with real subprocess + concurrency work. Its
`.py` uses `subprocess.run` (git/aem/mount ops), `ThreadPoolExecutor(8)`,
`urllib`, `shutil`, `tempfile`. Port rule: `.py` governs the **observable
behavior** (same steps, same 8-way bound, same content-type sniff, same DA
upload + EDS preview), but the **SLICC-safe mechanics** come from how the
existing `.jsh` already implements them — async `exec()` instead of
`subprocess.run`, a bounded-concurrency `Promise` pool instead of
`ThreadPoolExecutor`, global `fetch` instead of `urllib`, `node:os.tmpdir()`
instead of `tempfile`. Where `.jsh` and `.py` genuinely conflict on behavior,
`.py` wins; the `.jsh` is consulted only for the async primitive shape.

## File layout

Each `.mjs` lives beside the twins it replaces, same basename:

- `skills/of1-build-templates/assets/assemble-catalog.mjs`
- `skills/of1-build-templates/assets/fill-template.mjs`
- `skills/of1-extract-content/assets/download-images.mjs`
- `skills/of1-generate-config-review/assets/fill-config-review.mjs`
- `skills/of1-publish/assets/fill-demo-hub.mjs`

## Verification (no test harness → structural)

Per script, three gates:

1. **`node --check <tool>.mjs`** — syntax.
2. **SLICC-compat lint** — grep proves: no `execSync`/`spawnSync`/
   `execFileSync`; no `require(`; imports only from the allowed builtin set;
   positional args read at `process.argv[2+]`, not `[1]`.
3. **Real-node smoke run** — execute the `.mjs` against a small fixture and
   assert the expected output file/shape. Fixtures are minimal and created in
   a temp dir inside the test step, not committed.

No cross-repo SLICC run — the compat lint + the contract table above are the
SLICC guarantee.

## SKILL.md rewrites

Five skills reference these scripts. Each dual-invocation block collapses to a
single line, and the `.py`/`.jsh`/"no python3 in SLICC" notes are removed:

```bash
# before (two blocks)
python3 "$SKILL_DIR/assets/assemble-catalog.py" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/assemble-catalog.jsh" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"

# after (one line, both runtimes)
node "$SKILL_DIR/assets/assemble-catalog.mjs" "$OF1_DEMO_REPO" "$OWNER" "$REPO" "$BRANCH"
```

Skills to update:

- `of1-build-templates/SKILL.md` — `assemble-catalog`, `fill-template` (multiple
  call sites incl. the `cp … tools/…` copy pattern and the deliverables list)
- `of1-extract-content/SKILL.md` — `download-images` (call site + the two
  `download-images.py`/`.jsh` prose references)
- `of1-publish/SKILL.md` — `fill-demo-hub`
- `of1-generate-config-review/SKILL.md` — `fill-config-review`
- `of1-adopt-existing-site/SKILL.md` — its Step 11 inline `fill-config-review`
  call

## Deletion

Once a tool's `.mjs` is verified AND every SKILL.md reference to its `.py`/
`.jsh` is updated, delete both twins in the same task. Net: 10 → 5. A final
guard grep across the repo confirms zero surviving `\.jsh\b` /
`assets/.*\.py\b` references before the branch is considered done.

## Non-goals

- `verify.sh`, `playwright-cli-shim.sh` — already runtime-agnostic bash;
  untouched.
- `of1-style-generative-block/assets/of1.js` — a shipped EDS **block** asset,
  not a build-time tool; untouched.
- Retiring the `run_jsh` command in SLICC itself — out of scope; we simply
  stop depending on it by invoking `node` instead.
- Consolidating the two orchestrators (separate re-architecture, already done).

## Open questions

None — layout (beside twins), source of truth (`.py` verbatim), verification
(static + real-node smoke), and drift resolution (`.py` wins behavior)
are all decided.
