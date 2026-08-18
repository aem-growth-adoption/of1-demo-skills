# Liftoff flow — step detail

Six ordered steps. Each writes into `$OF1_DEMO_REPO` (already `cd`'d into) unless noted. Every
sub-skill invocation in this document is **inline** — a `Skill` tool call or a direct
read-and-follow of the target `SKILL.md`, executed in `of1-liftoff`'s own context — never a
separately dispatched Agent/scoop. Neither Claude Code nor SLICC allows a dispatched skill to fan
out a further dispatch level, so this skill must do all of its sub-skill work itself.

## 1. Scaffold

`OF1_DEMO_REPO` is already a validated EDS checkout by the time this skill runs —
`of1-check-dependencies`'s `verify.sh` fails hard (no fallback clone) unless `scripts/aem.js` or
`scripts/lib-franklin.js`, `scripts/scripts.js`, and `styles/styles.css` already exist. So "scaffold"
here means **verify, then backfill gaps** — never clone a fresh repo over an existing checkout.

```bash
cd "$OF1_DEMO_REPO"
for b in columns hero cards fragment header footer; do
  if [ ! -d "blocks/$b" ]; then
    echo "missing default block: $b — backfilling from aem-boilerplate"
    # fetch just this block's js/css from the upstream aem-boilerplate repo
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

**DONE_WITH_CONCERNS:** the curl-from-upstream backfill path is a reasonable default but unverified
against every aem-boilerplate revision in the wild (block file layout has shifted across boilerplate
versions). In the common case — a repo already created via `create-site` or an earlier OF1 demo —
this branch never executes; only exercise it if a genuinely bare/partial checkout shows up, and treat
a curl failure as "stop and report", not "silently skip the block."

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

**Stabilize gate — render + lint + no-JS-errors + human approval, never a pixel diff:**

1. Run `page-import`'s own `preview-import` flow per lifted page: does it render locally, does lint
   pass (repo's own `npm run lint` / block-collection conventions), are there any console/JS errors
   on load.
2. Write one entry per page into `stardust/liftoff/progress.json` (schema in `SKILL.md` §
   "Ledger schema") — **every one of `rendered`, `lint`, `jsErrors`, `approved` must be set
   explicitly**; an omitted `jsErrors` silently reads as zero to the gate (see the CRITICAL
   PRODUCER RULE in `SKILL.md`), so never skip a field because a check didn't run — record the
   check as failed/unknown instead of leaving the field out.
3. Emit a human-approval gate (config-review style: surface each lifted page for the user to look
   at, then set that page's `approved: true` in the ledger once accepted — do not set `approved`
   before an actual human look, and do not default it to `true`).
4. Only after every page's ledger entry has all four fields set and `approved: true`, run:

   ```bash
   node "<orchestratorSkillDir>/assets/check-liftoff-artifacts.mjs" "$OF1_DEMO_REPO"
   ```

   Exit 0 → write `liftoff-done.json` and report the final status block as `done`. Non-zero → do
   not write `liftoff-done.json`; report `failed` with the gate's own error lines as the summary.
