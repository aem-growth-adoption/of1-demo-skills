# OF1 Demo Skills

Claude Code skills for preparing OF1 generative web search demos. These skills automate the end-to-end process of turning any website into a branded, AI-powered search experience.

## Pipeline Flow

```
Steps 1→2→3→4 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
    ┌────┴────┐          ↓
    ↓         ↓     Steps 8,9,10
  Step 5   Step 6   (all parallel)
(Stardust  (Templates)   ↓
 Deploy)       ↓     Step 11
    ↓      (independent   (Config review)
  Step 7    of Step 5)    ↓
    └────┬────┘           ↓
         └───────┬────────┘
                 ↓
            Step 12 (Deploy)
```

| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Setup | `of1-setup` | — |
| 2 | Discovery | `of1-discovery` | Step 1 |
| 3 | Extraction | `of1-extraction` | Step 2 |
| 4 | Prototype | `of1-prototype` | Step 3 |
| 5 | Stardust Deploy | `of1-stardust-deploy` | Step 4 |
| 6 | Templates | `of1-template-generation` | Step 4 |
| 7 | OF1 styling | `of1-generative-block-styler` | Step 5 |
| 8 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 4 |
| 9 | Suggestions | `of1-quick-suggestions` | Step 4 |
| 10 | CTA template | `of1-cta-template-builder` | Step 4 |
| 11 | Config review | `of1-config-review` | Steps 8+9+10 |
| 12 | Deploy | `of1-deploy` | Steps 6+7+11 |

## Skills

| Skill | Description |
|-------|-------------|
| `of1-demo` | Orchestrate full demo preparation — user-driven step pipeline via sprinkle UI |
| `of1-setup` | Verify prerequisites — skills, tools, and repo state; verify EDS repo + prepare repo-config.json |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative |
| `of1-extraction` | Extract design tokens, brand identity, and page structure from a live site |
| `of1-prototype` | Generate pixel-perfect HTML prototypes of key pages |
| `of1-stardust-deploy` | Convert stardust prototypes to EDS blocks + content pages via `stardust:deploy` |
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

- **Skills installed** — OF1 demo skills + Adobe stardust skills (`adobe/skills`, includes `deploy`) + impeccable (`pbakaus/impeccable`)
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
