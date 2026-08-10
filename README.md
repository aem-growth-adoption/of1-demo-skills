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
| `of1-check-dependencies` | Verify prerequisites — skills, tools, and repo state; verify EDS repo + prepare repo-config.json |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
| `of1-build-templates` | Generate 15 branded templates (5 intents × 3 variations) |
| `of1-style-generative-block` | Generate CSS for dynamically-rendered generative sections |
| `of1-extract-brand-voice` | Extract brand voice from a website and generate `brand-voice.json` |
| `of1-extract-content` | Scrape product data, personas, use cases, features, and FAQs |
| `of1-build-quick-suggestions` | Generate suggestion chips and search UI copy |
| `of1-build-cta-template` | Extract site design system and generate a branded CTA template |
| `of1-generate-config-review` | Generate the config-review.html deliverable from tenant config |
| `of1-publish` | Commit config, sync to OF1 worker, generate demo hub, and verify |
| `of1-signals` | Standalone (not a pipeline step) — author `signals.json`, the OF1 **preview extension's** own config for simulating how a demo visitor arrived (fake email/ads/LLM referrals) |
| `of1-integration` | Stage 3 of the `of1-demo-orchestrator` pipeline (pipeline mode) — also runs standalone against an existing EDS/Stardust site, reusing whatever design tokens/blocks/pages already exist instead of crawling an external domain. Works on both Claude Code and SLICC with no sprinkle/scoop UI. |

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

- **Skills installed** — OF1 demo skills + Adobe stardust skills (`adobe/skills`, includes `replica` for Stage 2 and `deploy`) + impeccable (`pbakaus/impeccable`)
- **Playwright** — `playwright-cli` available on PATH
- **Node.js** — `node` available on PATH
- **Git credentials** — `~/.git-credentials` present for push access
- **EDS repo** — a valid Edge Delivery Services checkout at `OF1_DEMO_REPO` (any org/repo; verified structurally, not by identity)

The following plugins are also required by the pipeline:

```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```
