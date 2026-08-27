# OF1 Demo Skills

Claude Code skills for preparing OF1 generative web search demos. These skills automate the end-to-end process of turning any website into a branded, AI-powered search experience.

## Pipeline Flow

```
Stage 1 · Collect        of1-discovery → narrative.json (keyPages, focus)
                                   │
        ┌──────────────────────────┴──────────────────────────┐
Stage 2 · Replica                              Stage 3 · OF1 integration
stardust:replica --pages                       of1-integration (pipeline mode)
→ EDS site + DESIGN.json                        content track ∥ replica; site track after
        └──────────────────────────┬──────────────────────────┘
                              (adopt-site owns deploy)
```

| Stage | Skill | Notes |
|-------|-------|-------|
| 1 Collect | `of1-discovery` | Emits `narrative.json` (keyPages drive Stage 2) |
| 2 Replica | `stardust:replica --pages` | Bounded same-design migration; no site-wide rollout |
| 3 OF1 integration | `of1-integration` | Pipeline mode: live content source + replica-done gate |

Within Stage 3, `of1-integration` runs its own internal step graph — templates, OF1 styling, brand voice/content extraction, quick suggestions, CTA template, config review, and deploy — fanning out in parallel where dependencies allow (see that skill's own `SKILL.md` for the full step graph and dependency table).

## Skills

| Skill | Description |
|-------|-------------|
| `of1-demo-orchestrator` | Orchestrate full demo preparation — 3-stage pipeline; runs on both Claude Code and SLICC (detects the runtime, sprinkle UI on SLICC) |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
| `of1-prototype` | Recreate key pages as pixel-faithful prototypes ahead of the EDS conversion |
| `of1-deploy` | Convert prototypes into a block-based, authorable EDS site via `stardust:deploy` |
| `of1-signals` | Standalone (not a pipeline step) — author `signals.json`, the OF1 **preview extension's** own config for simulating how a demo visitor arrived (fake email/ads/LLM referrals) |

Stage 3 (OF1 integration — templates, styling, brand voice/content
extraction, quick suggestions, CTA template, config review, publish) is
provided by the separate [of1-skills](https://github.com/aem-growth-adoption/of1-skills)
plugin, which this plugin depends on. See that repo's README and its
`of1-integration/SKILL.md` for the full step graph.

## Usage

Install the skills as a Claude Code plugin:

```bash
claude plugins install /path/to/of1-demo-skills
```

Then run the orchestrator:

```
/of1-demo-orchestrator
```

## Prerequisites

The setup step (`of1-check-dependencies`) verifies all of the following:

- **Skills installed** — OF1 demo skills + the of1-skills plugin (for Stage 3) + Adobe stardust skills (`adobe/skills`, includes `replica` for Stage 2 and `deploy`) + impeccable (`pbakaus/impeccable`)
- **Playwright** — `playwright-cli` available on PATH
- **Node.js** — `node` available on PATH
- **Git credentials** — `~/.git-credentials` present for push access
- **EDS repo** — a valid Edge Delivery Services checkout at `OF1_DEMO_REPO` (any org/repo; verified structurally, not by identity)

The following plugins are also required by the pipeline:

```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force
upskill aem-growth-adoption/of1-skills --all
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```
