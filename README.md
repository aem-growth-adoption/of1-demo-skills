# OF1 Demo Skills

Claude Code skills for preparing OF1 generative web search demos. These skills automate the end-to-end process of turning any website into a branded, AI-powered search experience.

## Skills

| Skill | Description | User-invocable |
|-------|-------------|:--------------:|
| `of1-demo` | Orchestrate full demo preparation — user-driven step pipeline via sprinkle UI | Yes |
| `of1-brand-voice-extractor` | Extract brand voice from a website and generate `brand-voice.json` | Yes |
| `of1-content-metadata` | Scrape product data, personas, use cases, features, and FAQs | Yes |
| `of1-generative-block-styler` | Generate CSS for dynamically-rendered generative sections | Yes |
| `of1-quick-suggestions` | Generate suggestion chips and search UI copy | Yes |
| `of1-cta-template-builder` | Extract site design system and generate a branded CTA template | Yes |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative | No |
| `of1-branch-setup` | Create a git branch and output directory for the demo domain | No |
| `of1-setup` | Verify prerequisites — skills, mounts, tokens, repo state | No |
| `of1-extraction` | Extract design tokens, brand identity, and page structure from a live site | No |
| `of1-prototype` | Generate pixel-perfect HTML prototypes of key pages | No |
| `of1-snowflake` | Convert stardust prototypes to EDS pages and install the OF1 block | No |
| `of1-template-generation` | Generate 25 branded templates (5 intents × 5 variations) | No |
| `of1-config-review` | Generate the config-review.html deliverable from tenant config | No |
| `of1-deploy` | Commit config, sync to OF1 worker, generate demo hub, and verify | No |

## Usage

Install the skills as a Claude Code plugin:

```bash
claude plugins install /path/to/of1-demo-skills
```

Then run the orchestrator:

```
/of1-demo
```

This walks through a multi-step pipeline: site discovery, brand extraction, prototype generation, EDS block conversion, template generation, content scraping, and worker deployment.

## Individual skills

Each user-invocable skill can also be run independently for iterating on a specific step:

```
/brand-voice-extractor
/content-metadata
/generative-block-styler
/quick-suggestions
/cta-template-builder
```

## Prerequisites

The demo repo (where the actual site code lives) is created or selected during the branch-setup step. It can be any AEM EDS repository — the pipeline does not depend on a specific repo.

The following plugins are also required by the pipeline:

```bash
claude plugins install adobe/skills
claude plugins install pbakaus/impeccable
```
