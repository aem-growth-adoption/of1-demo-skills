# OF1 Demo Skills

Claude Code skills for preparing OF1 generative web search demos. These skills automate the end-to-end process of turning any website into a branded, AI-powered search experience.

## Pipeline Flow

```
Steps 1→2→3→4→5 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
         ↓               ↓
    Step 6          Steps 9,10,11
    (Snowflake)     (all parallel)
         ↓               ↓
    Steps 7+8       Step 12
    (parallel)      (Config review)
         ↓               ↓
         └───────┬───────┘
                 ↓
            Step 13 (Deploy)
```

| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Install dependencies | `of1-setup` | — |
| 2 | Branch setup | `of1-branch-setup` | Step 1 |
| 3 | Discovery | `of1-discovery` | Step 2 |
| 4 | Extraction | `of1-extraction` | Step 3 |
| 5 | Prototype | `of1-prototype` | Step 4 |
| 6 | Snowflake | `of1-snowflake` | Step 5 |
| 7 | Templates | `of1-template-generation` | Step 6 |
| 8 | OF1 styling | `of1-generative-block-styler` | Step 6 |
| 9 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | Step 5 |
| 11 | CTA template | `of1-cta-template-builder` | Step 5 |
| 12 | Config review | `of1-config-review` | Steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Steps 7+8+12 |

## Skills

| Skill | Description |
|-------|-------------|
| `of1-demo` | Orchestrate full demo preparation — user-driven step pipeline via sprinkle UI |
| `of1-setup` | Verify prerequisites — skills, tools, and repo state |
| `of1-branch-setup` | Create a git branch and output directory for the demo domain |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
| `of1-extraction` | Extract design tokens, brand identity, and page structure from a live site |
| `of1-prototype` | Generate pixel-perfect HTML prototypes of key pages |
| `of1-snowflake` | Convert stardust prototypes to EDS pages and install the OF1 block |
| `of1-template-generation` | Generate 25 branded templates (5 intents × 5 variations) |
| `of1-generative-block-styler` | Generate CSS for dynamically-rendered generative sections |
| `of1-brand-voice-extractor` | Extract brand voice from a website and generate `brand-voice.json` |
| `of1-content-metadata` | Scrape product data, personas, use cases, features, and FAQs |
| `of1-quick-suggestions` | Generate suggestion chips and search UI copy |
| `of1-cta-template-builder` | Extract site design system and generate a branded CTA template |
| `of1-config-review` | Generate the config-review.html deliverable from tenant config |
| `of1-deploy` | Commit config, sync to OF1 worker, generate demo hub, and verify |

## Usage

Install the skills as a Claude Code plugin:

```bash
claude plugins install /path/to/of1-demo-skills
```

Then run the orchestrator:

```
/of1-demo
```

## Prerequisites

The setup step (`of1-setup`) verifies all of the following:

- **Skills installed** — OF1 demo skills + Adobe EDS/snowflake skills (`adobe/skills`) + stardust (`adobe/skills`) + impeccable (`pbakaus/impeccable`)
- **Playwright** — `playwright-cli` available on PATH
- **Node.js** — `node` available on PATH
- **Git credentials** — `~/.git-credentials` present for push access
- **of1-demo repo** — cloned at `/workspace/of1-demo` (the shared AEM EDS repository where demo sites are built)

The following plugins are also required by the pipeline:

```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force
upskill adobe/skills --path plugins/aem/edge-delivery-services --all
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```
