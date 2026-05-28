# Brand Governance Integration — `of1-template-generation` Design

## Context

The OF1 demo's step 7 (`of1-template-generation`) currently sources its design
input from two places:

1. `stardust/current/design-tokens.json` (written by step 6 — snowflake)
2. `/shared/of1-demo/step-3-output.md` (written by step 3 — discovery)

These get stitched into an LLM prompt that generates 25 templates (5 intents ×
5 variations) per demo. The output looks fine, but the design rationale is
opaque: there is no traceable link between a brand's authored guidelines and
the colors/typography that end up in the rendered template.

The brand-governance-agent service exposes a per-brand design-token cascade
that solves this. For each brand, it returns a structured token document
(`color.brand.*`, `color.secondary.*`, `typography.heading.*`,
`typography.body.*`) composed from segment rows: a Global baseline plus
narrower rows keyed by `country`, `audience`, and `medium`. The cascade is
authored by the brand owner; the API returns the resolved doc for any
requested segment.

Using this API as the single design input replaces both stardust and the
discovery narrative for step 7. It also unlocks a demo-friendly angle:
generate the same template twice with different segments and show the same
layout adopting different palettes.

## Goals

- Replace `stardust/current/design-tokens.json` and
  `/shared/of1-demo/step-3-output.md` as inputs to step 7 with the
  brand-governance design-token cascade.
- Generate **4 templates** for the demo: 1 intent (`comparison`) × 2
  variations × 2 segments (Global, FR + under-25).
- Surface the cascade composition in the gallery so the demo can show
  segment-driven token differences side by side.

## Non-goals

- No screenshot-based validation, no `/evaluate/image` calls, no regeneration
  loop. Tokens are injected into the generation prompt and we trust the
  output. This was a deliberate simplification after the previous brainstorm.
- No changes to step 6 (`of1-snowflake`) or step 8
  (`of1-generative-block-styler`). The snowflake output keeps existing
  consumers; only step 7's input source changes.
- No worker-side changes. The catalog still maps `byIntent` to template names;
  the worker is segment-agnostic.
- No brand-checks integration. The 14 COPY/IMAGES-scoped checks on the brand
  are not consumed by this step — only design tokens are.

## Configuration

Three environment variables, set by the operator before running the demo:

| Variable | Purpose | Example |
|---|---|---|
| `BGA_API_URL` | Brand-governance-agent base URL | `https://adobe-aem-foundation-brand-governance-agent-deploy-022a47.stage.cloud.adobe.io` |
| `BGA_IMS_ORG_ID` | IMS org for the request | `2A530A165FFED7AE0A494011@AdobeOrg` |
| `IMS_TOKEN` | User access token (the env var already includes `Bearer ` prefix; the skill must strip it with `${IMS_TOKEN#Bearer }` before composing the header) | `Bearer eyJ...` |

The brand id is resolved at runtime from `DOMAIN` (already in
`/shared/of1-demo/repo-config.json`) via the
`GET /api/v1/brands/from-url?url=https://<DOMAIN>` endpoint. Fail fast if
the brand resolves to anything other than HTTP 200.

The `x-api-key` header is hardcoded to `exc_app` (the value the brand-
governance team provided for user-token auth on the stage cluster).

## Segments

Two segments are hardcoded for the demo:

| Slug | Segment JSON | URL-encoded |
|---|---|---|
| `global` | `{}` | `%7B%7D` |
| `fr-under25` | `{"country":"FR","audience":"under-25"}` | `%7B%22country%22%3A%22FR%22%2C%22audience%22%3A%22under-25%22%7D` |

These are picked because both compose meaningfully against the seeded
frescopa cascade rows — `global` yields the baseline 3 brand + 4 secondary
colors, `fr-under25` overlays `color.brand.primary=#FF8B5C` (under-25 row),
`color.accent=#FFD166` (under-25 row), and country-FR maroon adjustments.

## API calls

Per skill run, five GET requests to the cascade (one to resolve the brand,
two markdown fetches, two JSON fetches):

```
GET ${BGA_API_URL}/api/v1/brands/from-url?url=https://${DOMAIN}
GET ${BGA_API_URL}/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.md?segment=%7B%7D
GET ${BGA_API_URL}/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.md?segment=%7B%22country%22%3A%22FR%22%2C%22audience%22%3A%22under-25%22%7D
GET ${BGA_API_URL}/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.json?segment=%7B%7D
GET ${BGA_API_URL}/api/v1/brands/${BRAND_ID}/contexts/computed/design_token.json?segment=%7B%22country%22%3A%22FR%22%2C%22audience%22%3A%22under-25%22%7D
```

Required headers on every call:

```
Authorization: Bearer ${IMS_TOKEN#Bearer }
x-api-key: exc_app
x-gw-ims-org-id: ${BGA_IMS_ORG_ID}
```

All four calls run sequentially in the orchestrator. The total payload is
under 4 KB so latency is dominated by IMS validation, not transfer.

The markdown variant feeds the LLM prompt (compact, readable). The JSON
variant feeds the deterministic CSS generation for the base stylesheet (so
hex values come from a typed `$value.hex` field, not regex-parsed markdown).

## Deliverables

Per skill run, the following files are written to `$REPO_DIR`:

```
of1/config/templates.json                                   # routing config
templates/templates-catalog.json                            # catalog with 4 entries
templates/of1-comparison-table-global.html
templates/of1-comparison-table-global.metadata.json
templates/of1-comparison-table-global.sample.json
styles/of1-comparison-table-global.css
drafts/of1-comparison-table-global-sample.html
templates/of1-comparison-table-fr-under25.html
templates/of1-comparison-table-fr-under25.metadata.json
templates/of1-comparison-table-fr-under25.sample.json
styles/of1-comparison-table-fr-under25.css
drafts/of1-comparison-table-fr-under25-sample.html
templates/of1-comparison-versus-global.html
templates/of1-comparison-versus-global.metadata.json
templates/of1-comparison-versus-global.sample.json
styles/of1-comparison-versus-global.css
drafts/of1-comparison-versus-global-sample.html
templates/of1-comparison-versus-fr-under25.html
templates/of1-comparison-versus-fr-under25.metadata.json
templates/of1-comparison-versus-fr-under25.sample.json
styles/of1-comparison-versus-fr-under25.css
drafts/of1-comparison-versus-fr-under25-sample.html
styles/of1-base.css                                          # utilities only, no tokens
gallery/index.html
tools/fill-template.py
```

Naming convention: `of1-comparison-<variation>-<segment-slug>`. Variation
captures the layout choice (`table` vs `versus`); segment slug captures the
token set. Two layouts × two segments = four templates.

`styles/of1-base.css` keeps the utility classes (`.of1-section`,
`.of1-inner`, `.of1-hero`, `.of1-cta`, etc.) and references token values
via CSS custom properties (`var(--of1-accent)`, `var(--of1-font-display)`,
etc.) without declaring them. Each per-template CSS imports the base and
then **declares its `:root` block** populated from its segment's tokens.
This keeps the utility layer brand-agnostic and concentrates all segment-
varying values in a single block per template, making it visually obvious
in code review which tokens came from which segment.

For the catalog, all 4 templates land under `byIntent.comparison`. The
worker picks among them by LLM-driven description matching, so the
descriptions must disambiguate both layout (`table` vs `versus`) and segment
intent (e.g., "Side-by-side comparison table — global palette" vs
"Side-by-side comparison table — French youth palette").

## Process

The orchestrator runs sequentially (no scoops — only 4 templates, parallel
generation is not worth the coordination overhead):

1. Read `/shared/of1-demo/repo-config.json` → `DOMAIN`, `REPO_DIR`, `BRANCH`.
2. Validate `BGA_API_URL`, `BGA_IMS_ORG_ID`, `IMS_TOKEN` are set; fail fast
   with a clear message naming the missing variable.
3. Resolve brand: `GET /api/v1/brands/from-url?url=https://${DOMAIN}` →
   capture `data.id` as `BRAND_ID`. Fail fast on 404.
4. Fetch tokens for both segments (markdown + JSON) and persist them under
   `/shared/of1-demo/`:
   - `design-tokens-global.md`
   - `design-tokens-global.json`
   - `design-tokens-fr-under25.md`
   - `design-tokens-fr-under25.json`
5. Generate `styles/of1-base.css` (utilities only, no tokens).
6. For each `(variation, segment)` pair:
   - Build the LLM prompt: layout instructions + the segment's markdown
     tokens + the slot contract.
   - Generate `templates/{name}.html`, `templates/{name}.metadata.json`,
     `styles/{name}.css`, `templates/{name}.sample.json`.
   - The CSS prompt is given the JSON tokens and told to emit an
     `@import url("/styles/of1-base.css");` followed by a `:root` block
     with explicit hex/font values for every `--of1-*` variable the base
     utilities reference, plus any layout-specific rules.
7. Run `python3 tools/fill-template.py` once per template to materialize
   `drafts/{name}-sample.html`.
8. Generate `templates/templates-catalog.json` with `count: 4` and
   `byIntent.comparison` listing all four names.
9. Generate `of1/config/templates.json` (routing config, unchanged shape).
10. Copy gallery HTML into `gallery/index.html`.
11. Single `git add` + `git commit` + `git push origin ${BRANCH}`.
12. Verify the gallery URL returns HTTP 200; emit `/shared/of1-demo/step-7-status.json`.

The discovery narrative (`step-3-output.md`) is no longer read. The stardust
output (`stardust/current/design-tokens.json`) is no longer read. Both files
keep existing on disk for other consumers — the skill simply stops opening
them.

## Open questions / risks

- **Token diversity in the FR+under-25 segment is modest.** The cascade
  overrides `color.brand.primary` and adds `color.accent`, but the
  typography is unchanged. The demo will visibly differ via accent color
  and primary CTA, not heading font. If the difference reads as too subtle,
  the alternative is `{country:DE}` (which also overrides
  `maroon_wordmark`), or composing `{country:FR, audience:under-25,
  medium:magazine}` (which would also pick up typography overrides — but
  frescopa's magazine row currently writes no design-token fields, only
  `claim_guardrail` ones).

- **Brand resolution may return the wrong brand for non-frescopa domains.**
  The skill assumes the operator is running against frescopa. For other
  domains, `/brands/from-url` may resolve to a brand that has no cascade
  data, in which case the design_token endpoint returns an empty doc and
  the LLM is left to invent tokens. For the demo this is fine — fail-fast
  on empty token doc is preferable to silent fallback. The skill should
  check that the resolved doc has at least one `color.*` entry under
  `$value.hex` and abort if not.

- **The cascade endpoint is only deployed on the stage cluster.** The
  `feat/cascade-db` branch hasn't shipped to prod yet. The skill should
  refuse to run if `BGA_API_URL` points at the prod URL (a simple substring
  check on `prod.cloud.adobe.io` is enough) until the API is GA there.
