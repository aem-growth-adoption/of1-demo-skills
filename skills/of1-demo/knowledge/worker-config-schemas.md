# OF1 Worker — Config File Schemas

The OF1 worker reads tenant config from R2 (synced from EDS at `https://<id>.aem.page/of1/config/<file>.json`). Every config-producing skill MUST output JSON matching these exact schemas.

---

## brand-voice.json

Either a single string (used verbatim in the system prompt) or an object:

```json
{
  "personality": "Warm, knowledgeable home-barista guide.",
  "tone": "Friendly, slightly enthusiastic, never jargon-heavy.",
  "vocabulary": ["crema", "extraction", "single-origin"],
  "avoidWords": ["cheap", "synthetic"]
}
```

**Required for tenant readiness.** Used by prompt building in both default and template-routing flows.

---

## products.json

Array of products. **Required for tenant readiness. Vectorized for RAG.**

```json
[
  {
    "id": "fresco-deluxe",
    "name": "Fresco Deluxe",
    "title": "Fresco Deluxe Espresso Machine",
    "category": "Espresso machines",
    "description": "Triple-nozzle espresso machine with adjustable grind...",
    "price": "499.00",
    "keywords": ["espresso", "home barista"],
    "highlights": ["Triple nozzles", "Adjustable grind", "5-cup capacity"],
    "images": [
      "https://main--repo--owner.aem.page/media/product-fresco-deluxe.png"
    ],
    "url": "/products/fresco-deluxe"
  }
]
```

| Field | Required | Used for |
|-------|----------|----------|
| `id` | yes (falls back to `name` then `title`) | Vector id |
| `name` / `title` | yes | Vector text + display |
| `category` | no | Vector text + filtering |
| `description` | no | Vector text + prompt context (truncated to 500 chars) |
| `keywords[]` | no | Vector text |
| `highlights[]` | no | Vector text |
| `price` | no | Vector metadata + prompt |
| `images[]` | **critical** | Allowlist for `validate-image-urls` — the LLM may ONLY emit URLs from this list |
| `url` | no | Product page link |

---

## personas.json

Array of personas. Used by `persona-match` step.

```json
[
  {
    "id": "home-barista",
    "name": "Home Barista",
    "keywords": ["espresso", "crema", "barista", "grind"],
    "description": "Enthusiast brewing cafe-quality at home.",
    "priorities": ["machine quality", "brewing control"],
    "recommendedProducts": ["fresco-deluxe"],
    "intentProfile": {
      "explore": 0.3,
      "research": 0.8,
      "compare": 0.6,
      "purchase": 0.3,
      "deals": 0.2,
      "support": 0.2
    }
  }
]
```

| Field | Read by the worker? | Used for |
|-------|----------------------|----------|
| `id` | yes | `persona-match` output identity; boosts `products.json` entries where `product.persona === persona.id` |
| `name` | yes | Prompt/logging label (`ctx.rag.persona.name`) |
| `keywords[]` | yes | `persona-match` matches these (case-insensitive substring) against the user query — first hit wins, `personas[0]` is the default if nothing matches |
| `description` | no | Not read by the worker pipeline. Human/LLM-readable context only. |
| `priorities[]` | no | Not read by the worker pipeline. Consumed by of1-demo-skills' own content generation (e.g. deriving `intentProfile`). |
| `recommendedProducts[]` | no | Not read by the worker pipeline. Consumed by the of1-labs demo UI (persona panel's "Top Interests"). |
| `intentProfile` | no | Not read by the worker pipeline. Consumed by the of1-labs demo UI's Intent Map radar chart only — see `of1-content-metadata`'s SKILL.md for the full field description. |

Only `id`, `name`, and `keywords` are part of the worker's actual runtime contract for personas. Everything else is optional and only matters to whichever downstream consumer reads it (demo UI, content-generation skills) — it's safe to omit if that consumer isn't in play, and safe to extend further without touching the worker.

---

## use-cases.json

Same shape as personas. Matched against the query the same way.

```json
[
  {
    "id": "morning-routine",
    "name": "Morning Routine",
    "keywords": ["morning", "wake up", "before work"],
    "description": "Quick, dependable brew before commute."
  }
]
```

---

## features.json

Array. **Vectorized for RAG.**

```json
[
  {
    "id": "auto-brew",
    "name": "Auto-Brew Schedule",
    "description": "Wake up to fresh coffee — set the time the night before."
  }
]
```

---

## faqs.json

Array. **Vectorized for RAG.**

```json
[
  {
    "id": "warranty",
    "question": "Is there a warranty?",
    "answer": "Two years on all electric components."
  }
]
```

---

## suggestions.json

Pre-authored exploration prompts. Object with optional UI strings + an array.

```json
{
  "title": "What can I help you find?",
  "subtitle": "Pick a starting point or ask anything.",
  "placeholder": "Search coffee, machines, gifts...",
  "suggestions": [
    { "type": "explore", "label": "Dark roast options", "query": "Show me all dark roast coffee options" },
    { "type": "explore", "label": "Gift ideas", "query": "Best gift ideas for someone who loves coffee" }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | `<h1>` heading on the /of1 page |
| `subtitle` | yes | Supporting text below the heading |
| `placeholder` | yes | Input field placeholder text |
| `suggestions[].type` | yes | Always `"explore"` |
| `suggestions[].label` | yes | Short chip text, under 40 chars |
| `suggestions[].query` | yes | Full query string sent to `/api/generate` when clicked |

The OF1 block randomly picks 5 suggestions to display on each page load, so generate 8-12 for variety.

---

## of1-endpoint.json

Used by `/api/personalize` to build CTA hrefs.

```json
{ "url": "https://example.com/of1" }
```

---

## cta-template.json

Mustache-style template with placeholders `{{title}}`, `{{description}}`, `{{buttonText}}`, `{{href}}`.

```json
{
  "html": "<aside class=\"of1-cta\"><h3>{{title}}</h3><p>{{description}}</p><a href=\"{{href}}\">{{buttonText}}</a></aside>",
  "slots": ["title", "description", "buttonText"],
  "fallback": {
    "title": "Discover more",
    "description": "Explore curated picks for you.",
    "buttonText": "Browse"
  }
}
```

- `{{href}}` is resolved at runtime — do NOT include in `slots`
- `slots` array must be exactly `["title", "description", "buttonText"]`
- `fallback` is used when the LLM doesn't emit a CTA block
- HTML must be self-contained with inline styles, on a single line

---

## templates.json

### EDS-published shape (what you commit to the repo)

```json
{
  "useRouting": true,
  "baseUrl": "https://<branch>--<repo>--<owner>.aem.page",
  "catalogPath": "/templates/templates-catalog.json",
  "fallbackImage": {
    "src": "https://cdn.example.com/placeholder.svg",
    "alt": "Image unavailable"
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `useRouting` | yes | Master switch. `false` keeps the default block-assembly flow |
| `baseUrl` | yes | EDS host where templates catalog and HTML live |
| `catalogPath` | no | Default: `/templates/templates-catalog.json` |
| `fallbackImage` | no | `{src, alt}` — used when no product image matches |

### Templates catalog (at `<baseUrl><catalogPath>`)

```json
{
  "byIntent": {
    "discovery": ["of1-discovery-browse"],
    "comparison": ["of1-comparison-table"],
    "recommendation": ["of1-recommendation-hero"],
    "deep-dive": ["of1-deep-dive-article"],
    "budget": ["of1-budget-roi"]
  },
  "templates": [
    {
      "name": "of1-recommendation-hero",
      "intent": "recommendation",
      "description": "Single hero product recommendation with reasons and features.",
      "minItems": 1,
      "maxItems": 1,
      "stylesheet": "/styles/of1-recommendation-hero.css",
      "slots": [
        { "key": "hero.title", "type": "text", "required": true, "maxChars": 80 },
        { "key": "hero.image", "type": "image", "required": false, "instruction": "Product image URL" },
        { "key": "hero.cta", "type": "link", "required": true, "labelMaxChars": 24 }
      ],
      "htmlContent": "<main>...</main>"
    }
  ]
}
```

**Inline `slots` + `htmlContent` + `stylesheet` to keep sync under the 50-subrequest cap.**

### Recognised intents

```
comparison, recommendation, deep-dive, budget, discovery
```

`discovery` is the fallback when no candidates exist for the resolved intent.

### Slot types

| Type | Behaviour |
|------|-----------|
| `text` | Replaces inner content of `data-slot="<key>"` element |
| `image` | Sets `src` + `alt` on `<img data-slot="<key>">`. URL must be in products allowlist |
| `link` | LLM emits `{label, href}`. Rewrites `<a data-slot="<key>">` |
| `list` | LLM emits string array. Renders as `<li>` inside `data-slot-list="<key>"` |

### Slot definition fields

| Field | Notes |
|-------|-------|
| `key` | e.g. `"hero.title"`, `"item-3.image"`. Item slots use `item-N` prefix (1-9) |
| `type` | `"text" \| "image" \| "link" \| "list"` |
| `required` | Required slots must appear in LLM output |
| `maxChars` | Hard cap for text slots |
| `itemMaxChars` | Per-item cap for list slots |
| `minItems` / `maxItems` | List bounds |
| `labelMaxChars` | For link slots |
| `instruction` | Free-text guidance shown to the LLM |
| `default` | Used in the example block of the prompt |

---

## block-guide.json

Free-form object embedded into the default-flow prompt. **Required for tenant readiness.** No strict schema enforced — convention:

```json
{
  "blocks": [
    { "name": "hero", "description": "Single big image + headline + CTA", "rows": ["..."] },
    { "name": "columns", "description": "Two-column block", "rows": ["..."] },
    { "name": "cards", "description": "Repeated product cards (3-6 typical)", "rows": ["..."] }
  ]
}
```

---

## Summary: Required vs Optional

| File | Required for `ready` | Vectorized |
|------|---------------------|------------|
| `brand-voice.json` | YES | no |
| `block-guide.json` | YES | no |
| `products.json` | YES | YES |
| `personas.json` | no | no |
| `use-cases.json` | no | no |
| `features.json` | no | YES |
| `faqs.json` | no | YES |
| `suggestions.json` | no | no |
| `of1-endpoint.json` | no | no |
| `cta-template.json` | no | no |
| `templates.json` | no | no |
