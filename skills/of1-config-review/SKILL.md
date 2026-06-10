---
name: of1-config-review
description: Generate the config-review.html deliverable showing all OF1 config data for user approval
user-invocable: true
---

# OF1 Config Review

Generate the config-review.html deliverable for an OF1 demo using the proper template and fill script.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-12-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill (used to find `assets/fill-config-review.*`) |

Read repo config:

```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

## When to use

- After ANY change to `of1/config/*.json` files (products, suggestions, brand-voice, personas, use-cases, features, cta-template)
- As step 12 in the pipeline (after steps 9–11 complete)
- Whenever the user asks to regenerate or update the config review page

## Prerequisites

- Config JSON files must already exist under `of1/config/` in the repo
- The fill script at `$SKILL_DIR/assets/fill-config-review.py` (or `.jsh` in SLICC)

## Process

### 1. Verify all config files are present (hard gate)

The fill script silently reads whatever is on disk — it won't fail if a file is stale or empty. Guard against running too early (before step 9 finishes):

```bash
cd "$OF1_DEMO_REPO"
for f in products brand-voice personas use-cases features faqs suggestions cta-template; do
  [ -s "of1/config/${f}.json" ] || {
    echo "FAIL: of1/config/${f}.json missing or empty." >&2
    echo "Step 9 may not have finished. Wait for all parallel steps to complete before running step 12." >&2
    exit 1
  }
done
```

### 2. Run the fill script

```bash
# Claude Code (python3 available):
python3 "$SKILL_DIR/assets/fill-config-review.py" . "$DOMAIN"

# SLICC (use .jsh — no python3 in SLICC runtime):
# run_jsh "$SKILL_DIR/assets/fill-config-review.jsh" . "$DOMAIN"
```

The script reads `of1/config/{products,brand-voice,personas,suggestions,use-cases,features,cta-template}.json`, uses the template at `$SKILL_DIR/assets/config-review.html`, and writes `deliverables/config-review.html`.

**Always use the script — never write your own HTML generation logic or hand-edit the output.**

### 2. Commit and push

```bash
cd "$OF1_DEMO_REPO"
git add deliverables/config-review.html
git commit -m "docs: config review page for ${DOMAIN}"
git push origin "$BRANCH"
```

### 3. Verify

The review page is available at:
```
https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/config-review.html
```

## What the script produces

A self-contained dark-themed dashboard showing:
- **Stats bar**: product count, image count, personas, suggestions, features, use cases
- **Products**: expandable cards with thumbnail, name, category, price, image count — click to reveal full gallery, description, features, highlights, keywords, persona, use case, and link to source
- **Brand Voice**: personality, tone, vocabulary, avoid words
- **Personas**: grid of persona cards with name, description, keywords
- **Use Cases**: cards with name and description
- **Features**: chip list
- **Suggestions**: title/subtitle/placeholder + suggestion chips with label and query
- **CTA Template**: JSON preview of the CTA configuration

## Completion (pipeline mode)

```bash
REVIEW_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/config-review.html"
cat > "$OF1_STATE_DIR/step-12-status.json" <<EOF
{
  "step": 12,
  "status": "review",
  "deliverables": [
    { "url": "${REVIEW_URL}", "label": "Config review" }
  ],
  "summary": "Review all config before deploy: products, brand voice, personas, CTA, suggestions."
}
EOF
```
