# OF1 Demo Skills

Claude Code skills that turn any website into a branded OF1 generative-search demo on Adobe Edge
Delivery Services (EDS). Entry point: `of1-demo-orchestrator`.

## Pipeline

```
Stage 1 · Collect     of1-discovery → narrative.json (keyPages, focus, persona)
        ↓
Stage 2 · Migrate     2a of1-extract-design → 2b of1-prototype → 2c of1-deploy
                      → branded block-based EDS site + DESIGN.json + stage2-done.json
        ↓
Stage 3 · Integrate   one inline call: of1-skills:of1-integration
                      content-source=<DOMAIN> non-interactive cta-template
                      → of1-integration-result.json (done | review | failed)
```

Before Stage 1 the orchestrator (Phase 0) optionally wipes a repo it previously built
(`skills/of1-demo-orchestrator/scripts/wipe.sh`, fail-closed) and runs
`of1-skills:of1-check-dependencies`. Stages run sequentially. Stage 3 is an opaque dependency: the
`of1-skills` plugin owns its step graph (templates, styling, brand voice/content, suggestions, CTA
template, publish); this repo only makes the one call and reads the result file.

## Skills

| Skill | Description |
|-------|-------------|
| `of1-demo-orchestrator` | Runs the full 3-stage pipeline for a domain |
| `of1-discovery` | Crawl the target site and propose a demo focus/narrative |
| `of1-extract-design` | Capture the live site's design (`stardust:extract`); shipped by the `of1-skills` plugin, run as Stage 2a |
| `of1-prototype` | Recreate key pages as faithful prototypes (`stardust:prototype`) |
| `of1-deploy` | Convert prototypes into a block-based EDS site (`stardust:deploy`) |
| `of1-signals` | Standalone: author `signals.json` for the OF1 preview extension |

## Caller contract

A harness running the orchestrator sets `OF1_STATE_DIR`, `OF1_DEMO_REPO` and a DA token
(`ADOBE_IMS_TOKEN` or `OF1_TOKEN_FILE`), pre-writes `repo-config.json`, and may set
`OF1_NON_INTERACTIVE=1`. Progress is `<state dir>/<skill>-status.json` plus `stage2-done.json`; the run
ends with `of1-integration-result.json`. The orchestrator writes no result file of its own. See
`skills/of1-demo-orchestrator/knowledge/pipeline-contract.md`.

## Usage

```bash
claude plugins install /path/to/of1-demo-skills
```

```
/of1-demo-orchestrator frescopa.coffee
```

## Prerequisites

Requires `of1-skills` >= 0.4.0 (checked by the orchestrator at step 0b when the installed version is discoverable).

Verified by `of1-skills:of1-check-dependencies`: installed skill plugins, `playwright-cli`, `node`,
git credentials, a valid EDS checkout at `OF1_DEMO_REPO`, and a DA token. Required plugins:

```bash
upskill aem-growth-adoption/of1-demo-skills --all
upskill aem-growth-adoption/of1-skills --all
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```

## Development

- Tests: `node --test skills/of1-demo-orchestrator/scripts/*.test.mjs skills/*/assets/*.test.mjs`
- Docs index: `docs/README.md`
