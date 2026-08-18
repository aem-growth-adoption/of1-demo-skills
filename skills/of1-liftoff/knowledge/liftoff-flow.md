# Liftoff flow — step detail

Six ordered steps. Each writes into `$OF1_DEMO_REPO` (already `cd`'d into) unless noted. Every
sub-skill invocation in this document is **inline** — a `Skill` tool call or a direct
read-and-follow of the target `SKILL.md`, executed in `of1-liftoff`'s own context — never a
separately dispatched Agent/scoop. Neither Claude Code nor SLICC allows a dispatched skill to fan
out a further dispatch level, so this skill must do all of its sub-skill work itself.

**SLICC sub-progress:** on SLICC (sprinkle/scoop primitives present — see `SKILL.md` §
"SLICC sub-progress" for the exact push command, phase→key mapping, and statuses), push
`{"stage":2,"subStep":"<key>","status":"active","runId":"$OF1_RUN_ID"}` at the start of each step
below and `"done"` at its end: steps 1–2 → `scaffold`, step 3 → `extract`, step 4 → `skin`, step 5 →
`lift`, step 6 → `stabilize`. Read `$OF1_RUN_ID` from the env the cone passed this scoop; if unset,
omit the `runId` field rather than sending it literally. On Claude Code (no sprinkle primitive) this
is a no-op — skip it entirely, never error.

## 1. Scaffold

`of1-check-dependencies`'s `verify.sh` is explicit that its EDS-repo check is **"structural check,
not identity — any org/repo works"** (`skills/of1-check-dependencies/scripts/verify.sh:3-4`). It
guarantees `OF1_DEMO_REPO` has the right *shape* (`scripts/aem.js`/`scripts/lib-franklin.js`,
`scripts/scripts.js`, `styles/styles.css`) — it does **not** guarantee the repo actually descends
from `aem-boilerplate`. A hand-rolled or third-party-derived EDS repo can pass that check. The
product decision "every experiment starts from aem-boilerplate" is therefore `of1-liftoff`'s own
job to enforce, not something it can inherit from `of1-check-dependencies` — do not skip straight
to backfilling blocks on the strength of the six directory-name checks alone.

**Step order:**

```bash
cd "$OF1_DEMO_REPO"
```

### 1a. Empty/new repo → clone aem-boilerplate as the starting point

```bash
IS_EMPTY=false
[ -z "$(git ls-files)" ] && IS_EMPTY=true   # no tracked files at all
if [ "$IS_EMPTY" = "true" ]; then
  echo "OF1_DEMO_REPO is empty — seeding from aem-boilerplate"
  git clone --depth 1 https://github.com/adobe/aem-boilerplate.git /tmp/aem-boilerplate-seed
  rsync -a --exclude='.git' /tmp/aem-boilerplate-seed/ ./
  rm -rf /tmp/aem-boilerplate-seed
fi
```

### 1b. Existing checkout → verify BOILERPLATE PROVENANCE, not just directory shape

Directory-name presence (`blocks/columns`, `blocks/hero`, etc.) is necessary but not sufficient —
any EDS repo can have similarly-named blocks without being boilerplate-derived. Check a concrete
provenance marker instead:

```bash
PROVENANCE_OK=false
if [ -f package.json ] && [ "$(node -p "require('./package.json').name" 2>/dev/null)" = "aem-boilerplate" ]; then
  PROVENANCE_OK=true
elif [ -f fstab.yaml ] && grep -q "aem-boilerplate" fstab.yaml 2>/dev/null; then
  PROVENANCE_OK=true
elif [ -f scripts/aem.js ] && grep -q "aem-boilerplate" scripts/aem.js 2>/dev/null; then
  PROVENANCE_OK=true
fi
```

`package.json`'s `name` field being exactly `aem-boilerplate` is the primary, most reliable marker
(repos created via `create-site` or `degit`/clone from the boilerplate keep this unless explicitly
renamed). `fstab.yaml` and a boilerplate-attributed `scripts/aem.js` are secondary, weaker markers —
use them only when `package.json` itself doesn't resolve the question (e.g. `name` was legitimately
renamed post-scaffold but the file still carries a boilerplate attribution comment or `fstab.yaml`
still points at boilerplate mount config).

### 1c. Provenance cannot be established → FAIL LOUDLY, do not backfill

```bash
if [ "$PROVENANCE_OK" != "true" ]; then
  cat > "$OF1_STATE_DIR/liftoff-done.json" <<'EOF'
{"stage":2,"status":"failed"}
EOF
  echo "FAIL: OF1_DEMO_REPO does not verify as aem-boilerplate-derived (checked package.json name, fstab.yaml, scripts/aem.js). Every OF1 experiment must start from https://github.com/adobe/aem-boilerplate — point OF1_DEMO_REPO at a boilerplate-derived checkout, or let step 1a seed a fresh one into an empty repo." >&2
  exit 1
fi
```

Report the final status block as `"status": "failed"` with that same message as the summary. Do
**not** proceed to backfilling default blocks onto an arbitrary repo just because it happens to have
similarly-named directories — that would silently drop the boilerplate-provenance requirement this
step exists to enforce.

### 1d. Provenance established → backfill any missing default block

Only after 1a (seeded) or 1b+1c (verified) passes, check the six default blocks and backfill any
that are genuinely missing:

```bash
for b in columns hero cards fragment header footer; do
  if [ ! -d "blocks/$b" ]; then
    echo "missing default block: $b — backfilling from aem-boilerplate"
    mkdir -p "blocks/$b"
    curl -fsSL "https://raw.githubusercontent.com/adobe/aem-boilerplate/main/blocks/$b/$b.js"  -o "blocks/$b/$b.js"
    curl -fsSL "https://raw.githubusercontent.com/adobe/aem-boilerplate/main/blocks/$b/$b.css" -o "blocks/$b/$b.css"
  fi
done
```

`header` and `footer` may live under `blocks/header/` + `blocks/footer/` or be wired directly into
`scripts/scripts.js` depending on the boilerplate revision the repo was created from — treat their
presence check as "the repo already renders nav/footer chrome", not literally "the directory
exists"; only backfill if chrome is genuinely absent.

**DONE_WITH_CONCERNS:** the curl-from-upstream backfill path (1d) and the `package.json`/`fstab.yaml`/
`scripts/aem.js` provenance markers (1b) are reasonable defaults but unverified against every
aem-boilerplate revision in the wild — block file layout and the exact provenance-marker text have
both shifted across boilerplate versions historically. Treat a curl failure in 1d, or an ambiguous
provenance read in 1b, as "stop and report," not "silently skip/guess." This is a materially
different risk from "backfill mechanics might need a revision" — the deeper risk this step now
guards against is that the boilerplate-derived premise itself might not hold for a given repo at
all, which is why 1b/1c exist as a hard gate rather than an optional check.

## 2. Add the fixed Block Collection set

Additive set NOT already in aem-boilerplate: `accordion, tabs, carousel, quote`. (`cards`, `columns`,
`hero` are already confirmed present from step 1 — do not re-fetch them here.)

Invoke the `block-collection-and-party` skill **inline** to search for and retrieve each block's
`<name>.js`/`<name>.css` pair from the Block Collection / Block Party, then install them:

```bash
for b in accordion tabs carousel quote; do
  mkdir -p "blocks/$b"
  # use block-collection-and-party's own search/get flow (read its SKILL.md and follow it) to
  # locate and materialize blocks/$b/$b.js and blocks/$b/$b.css from the Block Collection/Block Party
done
```

Record each added block's `collection` value in `blocks-manifest.json` at step 6 — one of
`aem-boilerplate` (steps 1's default set) or `aem-block-collection` (this step's additive set), so a
reviewer can see at a glance which blocks are stock vs pulled in.

## 3. Extract — brand tokens only

```bash
# invoke stardust:extract inline against $DOMAIN
```

`stardust:extract <DOMAIN>` is the tokens-only, cheap half of the full stardust pipeline: it crawls
the live site and writes `stardust/current/DESIGN.json` (plus `PRODUCT.md`, `DESIGN.md`, and
per-page inventory) — do not invoke the full `stardust:direct`/`stardust:prototype` chain, this
skill only needs the design spec.

Resolve the path afterward using the same order Constraints documents:

```bash
DESIGN_JSON=""
if   [ -f stardust/current/DESIGN.json ]; then DESIGN_JSON="stardust/current/DESIGN.json"
elif [ -f ./DESIGN.json ];               then DESIGN_JSON="./DESIGN.json"
fi
if [ -z "$DESIGN_JSON" ] && [ ! -f styles/styles.css ]; then
  echo "FAIL: no DESIGN.json and no styles/styles.css — no brand-token source. Stopping." >&2
  exit 1
fi
```

## 4. Skin

```bash
cd "$OF1_DEMO_REPO"
node "$SKILL_DIR/assets/skin-tokens.mjs" "$DESIGN_JSON" styles/styles.css
```

If `DESIGN_JSON` is empty (extract genuinely produced nothing usable and only `styles/styles.css`
exists), skip this step — the repo's own deployed `:root` tokens are already the brand truth; there
is nothing to skin them with. Do not fabricate a `DESIGN.json` just to satisfy the script's
argument list. `skin-tokens.mjs` itself fails loudly ("no usable tokens found in DESIGN.json —
refusing to skin") if the file it's given has none — treat that exit code as a hard stop, not a
warning to paper over.

Skipping skinning on this path is safe downstream: Stage 3 (`of1-build-templates`, `base` mode and
its `assemble` step-1 recheck) explicitly accepts the repo's existing `styles/styles.css` `:root`
(core vars `--heading-font-family`/`--text-color`/`--background-color`) as the token source when no
`OF1-TOKENS` marker was written, so no `DESIGN.json` fallback is needed there either.

**Font loading is not implied by the token write.** `skin-tokens.mjs` only sets `:root` custom
properties (e.g. `--heading-font-family`, `--text-font-family`) — it does NOT load the actual
web-font files those properties name. If the brand's real fonts aren't already available in the
repo (system fonts, or fonts the boilerplate already bundles), the `--*-font-family` vars resolve
to an unavailable family and the browser silently falls back to its default serif/sans-serif.
Loading the font files themselves is a separate action this step must also take when the DESIGN
tokens name a non-system font: add the font `<link>`s to `head.html` (Google Fonts or similar CDN)
or add `@font-face` rules to `styles/styles.css`/a dedicated fonts partial. Do not treat skinning as
complete after just the token write — verify the named font families are actually loadable.

## 5. Lift — home + product pages

For `home` and every key page whose derived role is `product` (see SKILL.md § Env), invoke
`page-import` **inline**:

```bash
# for each key page (home, product-*):
#   invoke page-import inline against https://$DOMAIN/<slug's source path>
#   it scrapes, analyzes structure, and maps content onto the local block palette
#   (steps 1-2's blocks/), writing an authored .plain.html for local preview
```

`page-import` maps content onto whatever blocks are available in `blocks/` — after steps 1–2 that's
`columns, hero, cards, fragment, header, footer, accordion, tabs, carousel, quote`. Most pages should
map cleanly onto that palette. When a page genuinely needs a shape none of those blocks can express:

1. First try the Block Party via `block-collection-and-party` (inline) — same mechanism as step 2.
2. If nothing in the Block Party fits either, author a small custom block through the
   `content-driven-development` skill (inline) — the process this repo's own build system expects for
   any new/modified block, so the custom block ships with the same lint/test discipline as a stock
   one.

Whichever path you took, record it in `blocks-manifest.json` with `collection: "block-party"` or
`collection: "custom"` respectively.

**Brand logo — use the EDS icon system, never a text-bearing SVG `<img>`.** When lifting the header/
footer chrome, the brand logo must be authored as an icon-shape SVG served from the code bus through
the standard EDS icon system (`<span class="icon icon-{name}">`, resolved by `scripts/scripts.js`'s
icon-decoration pass to `icons/{name}.svg`) placed next to real text (the brand name as an actual
text node, not baked into the SVG). Do NOT drop in a single SVG `<img>` that bakes the wordmark as
paths/text inside the SVG itself — that's invisible to text-based fidelity/SEO checks, doesn't
recolor via CSS tokens, and breaks the icon system's caching/sprite conventions.

## 6. Build the manifest, then stabilize

**Build `blocks-manifest.json`:** after lifting, enumerate — per page — which blocks actually got
used, their variant classes, and which regions of each block are slot-capable (the parts a later
personalization pass could safely swap: headline text, hero image, CTA link, list items). Write it
per the schema in `SKILL.md` § "`blocks-manifest.json` schema", then validate:

```bash
node "$SKILL_DIR/assets/validate-blocks-manifest.mjs" blocks-manifest.json
```

Fail loudly (stop, do not report success) on any validator error — fix the manifest, not the
validator.

**Stabilize gate — render + lint + no-JS-errors + render-integrity + human approval, never a pixel
diff:**

1. Run `page-import`'s own `preview-import` flow per lifted page: does it render locally, does lint
   pass (repo's own `npm run lint` / block-collection conventions), are there any console/JS errors
   on load.
2. **Render-integrity checks**, per lifted page, after lifting and before human approval:
   1. **Preview polling:** load the page's EDS preview URL and bounded-poll until it returns HTTP
      200 (fail the page if it never reaches 200 within the bound). Record `previewOk: true|false`.
   2. **Broken-image / media warming:** enumerate the rendered page's `<img>`s, warm each (fetch/
      request) until it returns 200, and count any that never load as `brokenImages: <int>`. Verify
      a real image by activation + screenshot, NOT `naturalWidth` alone — `naturalWidth` can be
      truthy for a broken-image placeholder or a same-size error response, so it does not prove the
      real asset loaded.
   3. **Envelope assertion:** assert the delivered DA `.plain.html` for the page is >= 100 bytes (a
      smaller file signals a missing `<main>` envelope — the page didn't actually get content).
      Record `plainHtmlBytes: <int>`.

   The page's existing `rendered` field stays as-is; these are additional signals layered on top,
   not a replacement.
3. Write one entry per page into `stardust/liftoff/progress.json` (schema in `SKILL.md` §
   "Ledger schema") — **every one of `rendered`, `lint`, `jsErrors`, `approved`, `previewOk`,
   `brokenImages`, `plainHtmlBytes` must be set explicitly**; an omitted `jsErrors`,
   `brokenImages`, or `plainHtmlBytes` silently reads as passing to the gate (see the CRITICAL
   PRODUCER RULE in `SKILL.md`) — `previewOk` is the one field where omission fails instead. Never
   skip a field because a check didn't run — record the check as failed/unknown instead of leaving
   the field out.
4. Emit a human-approval gate (config-review style: surface each lifted page for the user to look
   at, then set that page's `approved: true` in the ledger once accepted — do not set `approved`
   before an actual human look, and do not default it to `true`).
5. Only after every page's ledger entry has all seven fields set and `approved: true`, self-verify
   against the ledger you just wrote — `of1-liftoff` has no env var resolving the orchestrator's
   asset dir (`SKILL_DIR` here points at `of1-liftoff`'s own dir, not the orchestrator's), so do not
   invent a path to the orchestrator's `check-liftoff-artifacts.mjs`. Instead, read back
   `stardust/liftoff/progress.json` and confirm every page entry has `rendered: true`, `lint: "pass"`,
   `jsErrors: 0`, `approved: true`, `previewOk: true`, `brokenImages: 0`, and `plainHtmlBytes >= 100`.
   All pages passing → write `liftoff-done.json` and report the final status block as `done`. Any
   page missing or failing a field → do not write `liftoff-done.json`; report `failed` naming the
   offending page(s) and field(s) as the summary. The orchestrator re-runs
   `check-liftoff-artifacts.mjs` itself once `liftoff-done.json` appears — that is the authoritative
   gate call; this self-check only prevents `of1-liftoff` from claiming success on an incomplete
   ledger.
