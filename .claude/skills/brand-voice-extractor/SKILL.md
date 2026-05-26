---
name: brand-voice-extractor
description: Extract brand voice from a website and generate brand-voice.json for the tenant config
user-invocable: true
---

# Brand Voice Extractor

Analyze a website to extract its brand voice, tone, and personality, then generate a `brand-voice.json` file for the of1-gen-web-service tenant config.

## Inputs

- `DOMAIN`: Target domain (e.g., `nvidia.com`). If provided in your prompt context (pipeline mode), use it directly. Only ask the user if not provided.

## Process

### Step 1: Get the site URL

If `DOMAIN` was provided in your prompt, use `https://{DOMAIN}` and skip asking.

Otherwise, ask the user:
> What's the URL of the site I should analyze? (e.g., https://www.nvidia.com/en-us/geforce/)

### Step 2: Crawl key pages

Fetch **5-8 pages** to get a representative sample. Start with the URL provided, then explore:

1. **Homepage / landing page** — the URL provided
2. **About / company page** — look for `/about`, `/company`
3. **Product pages** (2-3) — product detail pages
4. **Blog or editorial** (1-2) — `/blog`, `/stories`, `/resources`
5. **Support** (1) — `/support`, `/help`, `/faq`

For each page, use **WebFetch**:

```
Analyze this page's writing style and extract:
1. TONE: Formal/informal, technical/accessible, playful/serious?
2. VOCABULARY: 10-15 domain-specific terms used naturally.
3. SENTENCE STYLE: Short and punchy? Long and detailed?
4. AUDIENCE: Who is this for? Knowledge level assumed?
5. BRAND PERSONALITY: If this brand were a person, how would they talk?
6. DO patterns: What does the writing do well?
7. DON'T patterns: What does the writing avoid?
8. EXAMPLE PHRASES: 3-5 distinctly "on-brand" phrases.
9. NAVIGATION: 5-10 internal links to other important pages.
```

Use NAVIGATION links from each page to discover others.

### Step 3: Synthesize

Across all pages, identify:
- Consistent voice attributes
- Audience profile
- Tone variations by context
- Domain vocabulary (used without explanation)
- Anti-patterns
- Writing mechanics

### Step 4: Present findings

```
## Brand Voice Analysis: [Brand Name]

**Audience:** [who]
**Core voice:** [3-5 adjectives]
**Key vocabulary:** [10-15 terms]

**DO:**
- [pattern]
- [pattern]

**DON'T:**
- [pattern]
- [pattern]

**Tone by context:**
- Recommendations: [tone]
- Comparisons: [tone]
- Educational: [tone]
- Discovery: [tone]

Does this capture the brand correctly? Anything to adjust?
```

Wait for confirmation.

### Step 5: Generate brand-voice.json

Determine the domain from the URL (e.g., `nvidia.com`). Write to `of1/config/brand-voice.json`:

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

Create the output directory if needed: `mkdir -p of1/config`

### Step 6: Confirm

> Brand voice written to `of1/config/brand-voice.json`. Ready for the next step.

## Completion (pipeline mode)

When running as part of the OF1 pipeline (step 8), this skill runs alongside `content-metadata`. Both must complete before step 8 is marked done. After writing `brand-voice.json`, write your half of the status:

```bash
mkdir -p /shared/of1-demo
echo '{"step":8,"status":"done","summary":"Brand voice extracted: [personality adjectives]. [N] vocabulary terms, [M] avoid words."}' > /shared/of1-demo/step-8-brand-status.json
```

The orchestrator waits for both `step-8-brand-status.json` and `step-8-content-status.json` before marking step 8 complete.

Do NOT call `sprinkle send` — only the of1-demo orchestrator scoop may do that.
