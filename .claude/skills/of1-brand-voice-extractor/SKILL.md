---
name: of1-brand-voice-extractor
description: Extract brand voice from a website and generate brand-voice.json for the tenant config
user-invocable: true
---

# Brand Voice Extractor

Analyze a website to extract its brand voice, tone, and personality, then generate a `brand-voice.json` file for the of1-gen-web-service tenant config.

## ⚡ Speed Priority — Target: 3 minutes

- In pipeline mode, skip user confirmation — just write the file
- Use 3-5 pages max (homepage + 2-3 others)
- Leverage discovery output if available (don't re-discover page URLs)

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

- `DOMAIN`: Target domain (e.g., `frescopa.coffee`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## Schema Reference

Read worker-config-schemas.md § `brand-voice.json` for the exact output format expected by the worker. Use the schema reference path from Platform context.

## Process

### Step 1: Read context (pipeline mode)

```bash
REPO_CONFIG=$(cat "$STATE_DIR/repo-config.json")
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

cd "$REPO_DIR"
mkdir -p of1/config
```

If discovery output exists, read it for page URLs:
```bash
cat "$STATE_DIR/step-3-output.md" 2>/dev/null
```

### Step 2: Crawl key pages

Fetch **3-5 pages** to get a representative sample of the brand's writing. Prioritize:

1. **Homepage** — `https://{DOMAIN}`
2. **Product/service page** — a detail page (from discovery output if available)
3. **About or editorial** — `/about`, `/blog`, `/stories`

For each page, use **WebFetch**:

```
Analyze this page's writing style and extract:
1. TONE: Formal/informal, technical/accessible, playful/serious?
2. VOCABULARY: 10-15 domain-specific terms used naturally.
3. SENTENCE STYLE: Short and punchy? Long and detailed?
4. BRAND PERSONALITY: If this brand were a person, how would they talk?
5. DO patterns: What does the writing do well?
6. DON'T patterns: What does the writing avoid?
7. EXAMPLE PHRASES: 3-5 distinctly "on-brand" phrases.
```

### Step 3: Synthesize

Across all pages, identify:
- Consistent voice attributes
- Audience profile
- Tone variations by context (recommendations, comparisons, educational, discovery)
- Domain vocabulary (used without explanation)
- Anti-patterns (words/phrases the brand avoids)

### Step 4: Present findings (standalone mode only)

**Skip this step in pipeline mode** — go directly to Step 5.

In standalone mode, present and wait for confirmation:

```
## Brand Voice Analysis: [Brand Name]

**Audience:** [who]
**Core voice:** [3-5 adjectives]
**Key vocabulary:** [10-15 terms]

**DO:**
- [pattern]

**DON'T:**
- [pattern]

**Tone by context:**
- Recommendations: [tone]
- Comparisons: [tone]
- Educational: [tone]
- Discovery: [tone]

Does this capture the brand correctly? Anything to adjust?
```

### Step 5: Generate brand-voice.json

Write to `of1/config/brand-voice.json`:

```json
{
  "personality": "[3-5 adjectives, comma-separated]",
  "tone": "[1-2 sentence description of overall tone]",
  "vocabulary": ["term1", "term2", "term3", "...10-15 domain terms"],
  "avoidWords": ["word1", "word2", "...words the brand never uses"],
  "sentenceStyle": "[description of sentence patterns]",
  "toneByContext": {
    "recommendations": "[tone when recommending]",
    "comparisons": "[tone when comparing]",
    "educational": "[tone when explaining]",
    "discovery": "[tone when showing options]"
  }
}
```

**How the worker uses this file:**

The worker's `build-prompt.js` reads `ctx.tenant.brandVoice` and injects it into the LLM system prompt:
- `personality` → "Personality: {value}"
- `tone` → "Tone: {value}"
- `vocabulary` → "Use terms like: {joined values}"
- `avoidWords` → "Avoid: {joined values}"

These directly shape how the LLM writes generated sections. The more specific and accurate these are, the more on-brand the output will be. Generic values like "professional and friendly" produce generic output.

## Completion (pipeline mode)

When running as part of the OF1 pipeline (step 9), this skill runs alongside `content-metadata`. Both must complete before step 9 is marked done. After writing `brand-voice.json`, write your half of the status:

```bash
mkdir -p "$STATE_DIR"
echo '{"step":9,"status":"done","summary":"Brand voice extracted: [personality adjectives]. [N] vocabulary terms, [M] avoid words."}' > "$STATE_DIR/step-9-brand-status.json"
```

The orchestrator waits for both `step-9-brand-status.json` and `step-9-content-status.json` before marking step 9 complete.

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
