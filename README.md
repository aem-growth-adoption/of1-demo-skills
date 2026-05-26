# OF1 Demo Skills

Claude Code skills for preparing OF1 generative web search demos. These skills automate the end-to-end process of turning any website into a branded, AI-powered search experience.

## Skills

| Skill | Description | User-invocable |
|-------|-------------|:--------------:|
| `of1-demo` | Orchestrate full demo preparation — user-driven step pipeline | Yes |
| `brand-voice-extractor` | Extract brand voice from a website and generate `brand-voice.json` | Yes |
| `block-guide-builder` | Analyze EDS blocks and generate `block-guide.json` | Yes |
| `content-metadata` | Scrape product data, personas, use cases, features, and FAQs | Yes |
| `generative-block-styler` | Generate CSS for dynamically-rendered generative sections | Yes |
| `quick-suggestions` | Generate suggestion chips and search UI copy | Yes |
| `cta-template-builder` | Extract site design system and generate a branded CTA template | Yes |
| `of1-discovery` | Crawl a target website and propose a demo focus/narrative | No |
| `of1-branch-setup` | Create a git branch and output directory for the demo domain | No |
| `of1-setup` | Verify prerequisites — skills, mounts, tokens, repo state | No |
| `of1-snowflake` | Convert stardust prototypes to EDS blocks and trigger preview | No |
| `of1-deploy` | Deploy tenant config to the OF1 worker and verify generation | No |

## Usage

Install the skills as a Claude Code plugin:

```bash
claude plugins install /path/to/of1-demo-skills
```

Then run the orchestrator:

```
/of1-demo
```

This walks through a multi-step pipeline: site discovery, brand extraction, prototype generation, EDS block conversion, content scraping, and worker deployment.

## Individual skills

Each skill can also be invoked independently for iterating on a specific step:

```
/brand-voice-extractor
/block-guide-builder
/content-metadata
/generative-block-styler
/quick-suggestions
/cta-template-builder
```

## Prerequisites

The demo repo (where the actual site code lives) is created or selected during Step 2 (of1-repo-setup). It can be any AEM EDS repository — the pipeline does not depend on a specific repo.

The following plugins are also required by the pipeline:

```bash
claude plugins install adobe/skills
claude plugins install pbakaus/impeccable
```
