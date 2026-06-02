---
name: of1-quick-suggestions
description: Generate domain-specific quick suggestion chips and search UI copy for the demo
user-invocable: true
---

# Quick Suggestions Generator

Generate domain-specific quick suggestion chips, placeholder text, and search UI copy based on the site's products and content.

## ⚡ Speed Priority — Target: 2 minutes

- Use discovery output + site knowledge — do NOT wait for products.json or brand-voice.json (they run in parallel)
- If config files happen to exist already, read them for better suggestions
- ONE file to write — this is the fastest step

---

## Platform context

This skill runs in both SLICC and Claude Code. Resolve these symbols up-front — the rest of the skill uses them by name and assumes you've read this section.

| Symbol | SLICC default | Claude Code override |
|---|---|---|
| `$STATE_DIR` | `/shared/of1-demo` | `$OF1_STATE_DIR` (e.g. `<project>/.of1/state`) |
| Schema reference path | `/workspace/skills/of1-demo/knowledge/worker-config-schemas.md` | `<plugin-dir>/of1-demo/knowledge/worker-config-schemas.md` (sibling to this skill) |

`$REPO_DIR`, `$DOMAIN` come from `"$STATE_DIR/repo-config.json"` (written by `of1-branch-setup`).

---

## Inputs

- `DOMAIN`: Target domain (e.g., `nvidia.com`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## Schema Reference

Read worker-config-schemas.md § `suggestions.json` for the exact output format expected by the worker. Use the schema reference path from Platform context.

## Process

### Step 1: Read context

```bash
REPO_CONFIG=$(cat "$STATE_DIR/repo-config.json")
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

cd "$REPO_DIR"
mkdir -p of1/config
```

Read discovery output for product/category knowledge:
```bash
cat "$STATE_DIR/step-3-output.md" 2>/dev/null
```

If config files already exist (from a previous run or if step 9 finished first), read them for richer suggestions:
```bash
cat of1/config/products.json 2>/dev/null | jq '.[].name' | head -20
cat of1/config/personas.json 2>/dev/null | jq '.[].name'
cat of1/config/brand-voice.json 2>/dev/null | jq '.tone'
```

### Step 2: Generate suggestions

Based on discovery context (and products/personas if available), generate 8-12 quick suggestion chips that:
- Cover different personas
- Cover different intents (compare, recommend, explore, deep-dive, budget)
- Use natural language a real user would type
- Are concise (under 40 characters each)

Also generate:
- Search bar placeholder text
- Page title
- Page subtitle

### Step 3: Write output

Write to `of1/config/suggestions.json`:

```json
{
  "title": "...",
  "subtitle": "...",
  "placeholder": "...",
  "suggestions": [
    { "type": "explore", "label": "Short Chip Label", "query": "full natural language query the user would type" },
    { "type": "explore", "label": "Another Chip", "query": "another full query" }
  ]
}
```

**How the worker uses this file:**

The worker's `suggest.js` serves `tenant.suggestions.suggestions` via `POST /api/suggest` when no query is provided. The OF1 block fetches this on page load to populate the search UI.

**Field requirements:**
- `title` → the `<h1>` heading on the /of1 page (e.g. "Find Your Next Adventure")
- `subtitle` → supporting text below the heading
- `placeholder` → input field placeholder text
- `suggestions[].type` → always `"explore"` (used by the OF1 block for chip styling)
- `suggestions[].label` → short text shown on the chip (under 40 chars)
- `suggestions[].query` → the full query string sent to `/api/generate` when clicked

**Intent coverage:** Ensure suggestions cover the worker's intent types so demos can showcase different generation behaviors:
- `deep-dive`: "Tell me about [specific product]" — triggers detailed single-product pages
- `comparison`: "Compare [A] vs [B]" — triggers side-by-side layouts
- `recommendation`: "Best [category] for [persona need]" — triggers featured product + alternatives
- `discovery`: "Show me [broad category]" — triggers diverse card grids
- `budget`: "[Category] under $[price]" — triggers price-focused results

The OF1 block randomly picks 5 suggestions to display on each page load, so generate 8-12 for variety.

## Completion (pipeline mode)

When running as part of the OF1 pipeline (step 10), write a status file after generating `suggestions.json`:

```bash
mkdir -p "$STATE_DIR"
echo '{"step":10,"status":"done","summary":"Generated [N] suggestion chips covering [intents covered]."}' > "$STATE_DIR/step-10-status.json"
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
