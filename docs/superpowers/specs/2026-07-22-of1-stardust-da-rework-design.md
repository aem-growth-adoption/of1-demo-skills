# OF1 pipeline rework: stardust:deploy + DA.live-authored config

## Context

The OF1 demo pipeline (`of1-demo-skills`) currently:
1. Converts step-5 static HTML prototypes into EDS pages via `of1-snowflake`, a thin wrapper around the Adobe `snowflake` skill. Snowflake does **page-level overlay conversion** — it preserves the prototype's DOM byte-for-byte and injects `data-slot`/`data-slot-passthrough` markers, producing `templates/<slug>.html`, `styles/<slug>.css`, `fragments/<slug>/{header,footer}.html`.
2. Stores all "deliverables" (discovery.html, config-review.html, demo hub index.html, template gallery, prototypes, brand-review.html) and all tenant config (`of1/config/*.json` — products, personas, brand-voice, use-cases, features, faqs, suggestions, cta-template, templates) as static files git-committed into the `of1-demo` EDS repo, served from the EDS code bus.

Two changes are wanted:
1. **Replace `of1-snowflake` with `stardust:deploy`** — a more thorough, more efficient conversion methodology that produces real EDS blocks (one block per prototype `<section>`, content authored in DA tables, `decorate()` functions) instead of a DOM-preserving overlay.
2. **Move tenant config data to DA.live authoring** (markdown/table pages, human-editable) instead of git-committed JSON — except `brand-review.html`, which stays as-is for now. The worker (`of1-gen-web`) will read the rendered DA page HTML directly instead of `of1/config/*.json`.

## Goals

- Swap the EDS-conversion engine from `snowflake` to `stardust:deploy` with minimal disruption to the rest of the pipeline.
- Make product/persona/brand-voice/etc. config editable directly in DA.live as markdown, with the worker consuming the rendered preview HTML.
- Keep the human-facing HTML report deliverables (discovery, config-review, demo hub, gallery) as static shells, but have them render dynamically from live DA content instead of baked-in data.
- Improve pipeline parallelism now that snowflake's page-level dependency chain is gone.
- Ship `of1-gen-web`'s sync change in a **git worktree**, and make it **backward compatible** — existing tenants/demos that still ship `of1/config/*.json` must keep working unmodified.

## Non-goals

- `brand-review.html` storage/format is unchanged.
- No change to the OF1 worker's `/api/generate`, `/api/personalize`, `/api/suggest` runtime behavior or response shape.
- No change to the 15-template slot-based system's runtime rendering (`render-template.js`, `data-slot` for LLM-generated content) — that's a separate mechanism from stardust:deploy's block-authoring and is unaffected.
- Not deciding today whether a single generic "DA table → JSON" parser suffices for all config types, or whether each needs a bespoke parser — left to the implementation plan.

## Architecture changes

### 1. `of1-snowflake` → `of1-stardust-deploy`

`of1-snowflake` is deleted. A new skill (name TBD in the plan, e.g. `of1-stardust-deploy`) takes its place as step 6:

- Thin wrapper around the `stardust:deploy` skill, same spirit as the old wrapper: stardust:deploy owns the conversion methodology (naming, block extraction, foundation CSS, font self-hosting, button conventions, fragments, DA upload, verification gates); this skill supplies OF1-specific inputs (repo config, branch override) and enforces the "land on the existing demo branch, not a `stardust-deploy-NNN` feature branch" override, mirroring the branch-override table the old skill used for snowflake.
- Output shape changes from `templates/<slug>.html` + `styles/<slug>.css` + `fragments/<slug>/{header,footer}.html` (per-prototype, DOM-preserving) to `blocks/<name>/{name.js,name.css}` (one per distinct prototype section, deduped/variant-shared per stardust:deploy's rules), `content/<page>.html` (one EDS content page per prototype page, DA-sourced), `fragments/{nav,footer}.html` (shared, not per-page), and `styles/styles.css` (foundation — tokens, reset, button system, fonts).
- The artifact-verification hard gate is rewritten against the new shape: assert `blocks/*/*.js`, `blocks/*/*.css`, `content/*.html`, `fragments/nav.html`, `fragments/footer.html` all exist, and that every converted page 200s on EDS preview (same idea as today, new paths).

### 2. Pipeline parallelism: 7 no longer depends on 6; 8 still does

Today: `5 → 6(snowflake) → {7, 8} parallel`. Both 7 and 8 depend on step 6 because they read EDS-rendered screenshots / snowflake fragments as their visual reference.

New: `5 → {6(stardust:deploy), 7(templates)} parallel → 8` (8 still gated on 6):

- **Step 7 (`of1-template-generation`)** no longer needs `templates/prototype-*.html`, `styles/prototype-*.css`, or `deliverables/eds-prototype-*.png` (EDS-rendered screenshots). It reads the step-5 prototype's own HTML + inline `<style>` directly and screenshots the prototype file itself (no EDS render required) as its "component palette" / visual ground truth. This makes it independent of step 6 entirely — it can run concurrently with stardust:deploy.
- **Step 8 (`of1-generative-block-styler`)** keeps its dependency on step 6, specifically for `fragments/nav.html` and `fragments/footer.html` (renamed from the old per-prototype `fragments/prototype-home/{header,footer}.html` path) — these must be byte-identical to what the rest of the site uses, so it's not worth re-deriving them from the prototype independently. Step 8 no longer depends on step 7.
- Step 6 and step 7 are dispatched concurrently once step 5 completes. Step 8 is dispatched once step 6 completes, independent of step 7's completion.
- Track B (9, 10, 11 → 12) and the final gate on {7, 8, 12} before step 13 are otherwise unchanged.

### 3. Step 8 absorbs the `/of1` page's overlay ownership (snowflake's old job)

Because there's no more `snowflake`-installed generic overlay engine + `data-slot-passthrough` patch to lean on, `of1-generative-block-styler` (step 8) now owns the entire `/of1` page conversion itself, end to end:

- Builds its own minimal DOM-preserving template/fragment pair for `/of1` directly from the step-5 prototype HTML (the OF1 search block's `<main>` content must stay live-DOM, never converted into an authored EDS block — that's exactly the constraint the old passthrough patch existed for).
- Still patches `scripts/scripts.js` for the passthrough behavior itself (Step 0 of the existing skill) — that patch is independent of who produces the base overlay engine, since stardust:deploy's runtime is the AuthorKit-style runtime the passthrough patch was already designed to sit on top of.
- Reads `fragments/nav.html` / `fragments/footer.html` from stardust:deploy's step-6 output (see above) instead of the old `fragments/prototype-home/{header,footer}.html`.
- Everything else about step 8 (block CSS, page-chrome CSS, DA content upload for `/of1`, `/nav`, `/footer` placeholder pages, verification) is unchanged in spirit; only the fragment source path changes.

### 4. Deploy step (`of1-deploy`) gate updates

- Check 2 (nav/footer parity) and the artifact paths it inspects update to the new `fragments/nav.html` / `fragments/footer.html` names.
- Check 5 (deliverable URLs return 200) drops any URL that was specific to the old snowflake per-slug overlay pages, replaced with the new `content/<page>.html`-derived EDS page URLs.
- The "verify config files exist" gate (today: `[ -f of1/config/{file}.json ]`) is rewritten — see below.

### 5. Config data moves to DA.live-authored markdown

Config producers change their write target from `of1/config/*.json` (git-committed JSON) to a DA-authored markdown page per config type, PUT via the DA Source API and previewed — the same auth pattern (`DA_TOKEN`, `Authorization` + `x-content-source-authorization` headers) already used today for image uploads.

Affected skills and their config type(s):

| Skill | Config type(s) |
|---|---|
| `of1-content-metadata` | products, personas, use-cases, features, faqs, testimonials |
| `of1-brand-voice-extractor` | brand-voice |
| `of1-cta-template-builder` | cta-template |
| `of1-quick-suggestions` | suggestions |
| `of1-template-generation` (assemble mode) | `templates.json` routing config (the small routing/catalog-pointer file, NOT the 15 slot-based HTML templates themselves, which are unaffected — those remain git-committed template HTML/CSS/metadata/catalog, a separate mechanism from tenant config) |

Each config type's markdown page is authored as tables/sections per item (schema-equivalent to today's JSON array-of-objects shape — e.g. one table row per product, one section per persona), PUT to `admin.da.live/source/{owner}/{repo}/of1/config/{name}.html`, then previewed so it's reachable at `{branch}--{repo}--{owner}.aem.page/of1/config/{name}`.

The exact per-config-type markdown/table shape (and whether a single generic "DA table → structured data" parser suffices vs. bespoke-per-type) is left to the implementation plan — it must preserve every field the worker currently reads from the JSON schemas (`of1-demo/knowledge/worker-config-schemas.md`), including cross-references between config types (product↔persona↔use-case IDs) and the `intentProfile` object on personas.

### 6. `of1-gen-web` sync: dual-mode, worktree, backward compatible

Work happens in a **git worktree** off the `of1-gen-web` repo (not the main checkout).

`worker/src/sync.js`'s `handleSync` / the per-file fetch loop changes to try the old path first, then fall back:

1. `fetch(${edsBase}/${file}.json)` — **unchanged**, exactly as today. If 200, use it as-is. This keeps every existing/unmodified demo working with zero changes.
2. On 404, `fetch(${edsBase}/${file})` (no `.json` — the DA-authored page's rendered HTML) and parse the structured data out of the table DOM into the same shape the JSON file would have had, before writing to KV via the same `env.TENANTS.put(...)` call.

This is transparent to everything downstream of `handleSync` (KV shape, `/api/generate`, `/api/tenants/{id}/status` — all unchanged) — only the *source* of the data changes, per file, auto-detected.

### 7. HTML report deliverables become dynamic shells

`discovery.html`, `config-review.html`, the demo hub (`deliverables/index.html`), and the template gallery (`gallery/index.html`) keep their current generation mechanism (committed once as static HTML+CSS+JS, same visual treatment, same dark-theme/self-contained style as today — matching how `brand-review.html` is already handled).

What changes: instead of baking config data into the HTML at generation time, each shell's JS does a client-side `fetch()` of the live config preview URLs (e.g. `{branch}--{repo}--{owner}.aem.page/of1/config/products`) and renders the dashboard from the fetched HTML/DOM at page-load time. Editing a config's DA page and hitting reload shows the change with no pipeline re-run.

This requires the same DA-table parsing logic as the worker's fallback path (§6) to exist in-browser (client-side JS) as well — likely a small shared parsing convention (e.g. one parser module/pattern per config type) reused by both `of1-gen-web`'s fallback and the deliverable shells' client JS, rather than writing the parser twice. Left to the implementation plan.

### 8. `of1-deploy` config-check gate

The "verify config files exist" hard gate (today: loop over `of1/config/{file}.json` and check the file is non-empty on disk) is rewritten to check the DA pages are live instead: for each config type, curl the `{branch}--{repo}--{owner}.aem.page/of1/config/{file}` preview URL and assert 200 + presence of an expected table/section marker in the response. The KV-sync call to the worker (`POST /api/tenants/{id}/sync`) is unchanged — the worker's own dual-mode fallback (§6) handles sourcing the right data.

## Skill-by-skill pass order

Applied in pipeline call order:

1. `of1-repo-setup` — no structural change.
2. `of1-discovery` — discovery.html becomes a dynamic shell (§7); everything else unchanged.
3. `of1-extraction` — no change (brand-review.html explicitly excluded from this rework).
4. `of1-prototype` — no change; still the sole upstream input to both step 6 and step 7.
5. `of1-snowflake` **deleted**, replaced by a new stardust:deploy-wrapping step (§1). Runs in parallel with step 7 (§2).
6. `of1-template-generation` — repoint its "component palette" reads from step 6's old snowflake output to step 5's prototype directly (§2); no longer gated on step 6.
7. `of1-generative-block-styler` — absorb `/of1` page overlay ownership (§3); repoint fragment reads to stardust:deploy's `fragments/nav.html`/`footer.html`; still gated on step 6, not on step 7.
8. `of1-brand-voice-extractor`, `of1-content-metadata`, `of1-quick-suggestions`, `of1-cta-template-builder` — switch config writes from JSON-to-git to DA-markdown-authored pages (§5).
9. `of1-config-review` — becomes a dynamic shell (§7); the gate that used to check `of1/config/*.json` presence checks DA pages are live instead.
10. `of1-deploy` — update Check 2 / Check 5 artifact paths (§4), rewrite the config-exists gate (§8), demo hub (`fill-demo-hub.py`) becomes a dynamic shell (§7).
11. `of1-gen-web` (separate repo, in a worktree) — dual-mode `sync.js` (§6), backward compatible with existing JSON-based tenants.

## Open questions for the implementation plan

- Exact DA markdown/table shape per config type (products, personas, brand-voice, use-cases, features, faqs, testimonials, suggestions, cta-template, templates-routing) — must round-trip every field in `worker-config-schemas.md` including cross-references and `intentProfile`.
- Whether one generic "DA table → structured data" parser covers all config types, or each needs a bespoke parser (products' pricing/images differ structurally from brand-voice's tone/vocabulary fields, for instance).
- Where the shared parsing logic lives so it isn't duplicated between `of1-gen-web`'s worker-side fallback (§6) and the deliverable shells' client-side JS (§7) — a small shared JS module seems likely but the concrete packaging (npm package? copied file? inlined snippet?) isn't decided.
- Naming for the new step-6 skill (working name `of1-stardust-deploy` used above).
- `stardust:deploy`'s block-based output uses different naming/DOM conventions per section than snowflake's overlay did — step 7 and step 8's existing "EDS Block DOM Reference" documentation (wrapper classes, cards/hero/table shapes) needs re-verification against stardust:deploy's actual output before being trusted as-is.
