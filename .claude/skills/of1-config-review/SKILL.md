# of1-config-review

Generate the config-review.html deliverable for an OF1 demo using the proper template and fill script.

## When to Use

- After ANY change to `of1/config/*.json` files (products, suggestions, brand-voice, personas, use-cases, features, cta-template)
- As the final step of config assembly (Step 12 in the pipeline)
- Whenever the user asks to regenerate or update the config review page

## Prerequisites

- The `of1-demo` repo must be cloned at `/workspace/of1-demo` and on the correct demo branch
- Config JSON files must already exist under `of1/config/` in the repo
- The skills repo must be available at `/workspace/of1-demo-skills`

## Execution — EXACT Recipe

### Step 1: Run the fill script

```bash
cd /workspace/of1-demo && python3 /workspace/of1-demo-skills/.claude/skills/of1-demo/fill-config-review.py . <DOMAIN>
```

Replace `<DOMAIN>` with the demo domain (e.g., `frescopa.coffee`, `rankingshub.app`, `bmwusa.com`).

The script:
- Reads: `of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json`
- Uses template: `/workspace/of1-demo-skills/.claude/skills/of1-demo/templates/config-review.html`
- Writes: `deliverables/config-review.html`

### Step 2: Commit and push

```bash
cd /workspace/of1-demo && git add deliverables/config-review.html && git commit -m "regen: config-review.html" && git push origin <BRANCH>
```

### Step 3: Verify (optional)

The review page is available at:
```
https://<BRANCH>--of1-demo--aem-growth-adoption.aem.page/deliverables/config-review.html
```

## What the Script Produces

The config-review.html is a self-contained dark-themed dashboard showing:
- **Stats bar**: Product count, image count, personas, suggestions, features, use cases
- **Products section**: Expandable cards with thumbnail, name, category, price, image count — click to reveal full gallery, description, features, highlights, keywords, persona, use case, and link to source
- **Brand Voice section**: Personality, tone, vocabulary, avoid words
- **Personas section**: Grid of persona cards with name, description, keywords
- **Use Cases section**: Cards with name and description
- **Features section**: Chip list
- **Suggestions section**: Title/subtitle/placeholder + suggestion chips with label and query
- **CTA Template section**: JSON preview of the CTA configuration

## Common Mistakes That Waste Time

| Mistake | Time Cost | Fix |
|---------|-----------|-----|
| Writing inline Python to generate config-review HTML | 5-10 min | Always use `fill-config-review.py` — it uses the proper template with all CSS, sections, and interactivity |
| Forgetting to `cd` into the repo before running the script | 2 min | The script expects `repo-dir` as first arg — use `.` after `cd /workspace/of1-demo` |
| Not passing the domain argument | 1 min | Second arg is required: `python3 fill-config-review.py . frescopa.coffee` |
| Trying to use Node.js to run a template tool | 3 min | Node is a shim in SLICC — always use `python3` |
| Manually editing deliverables/config-review.html | 5+ min | Never hand-edit — always regenerate with the script |

## DO NOT

- **DO NOT** write your own HTML generation logic — the template + fill script handles everything
- **DO NOT** use Node.js, npm, or any .mjs files — Python only
- **DO NOT** hand-edit `deliverables/config-review.html` — it's a generated artifact
- **DO NOT** skip this step after config changes — the review page is the user's primary way to verify all config data
