# Brand Governance Integration — Design Spec

**Date:** 2026-05-27  
**Branch:** integrate-brand-governance  
**Status:** Approved

---

## Problem

The OF1 worker's LLM prompt is currently enriched with manually-extracted `brand-voice.json` data (personality, tone, vocabulary, avoid words). There is no mechanism to incorporate authoritative, org-managed brand governance rules from Adobe's Experience Governance API. As a result, generated content may not comply with formal brand policies or compliance requirements.

---

## Goal

Enrich the LLM prompt in the OF1 worker with live brand governance rules (brand voice checks, compliance rules) fetched from the Experience Governance API. The feature is a transparent enhancement: if a brand is not registered in the governance system, or if the API is unavailable, the worker behaves exactly as it does today.

---

## Non-Goals

- Replacing the manual `brand-voice.json` extraction step (governance data augments it, not replaces it)
- Pre-deployment caching via skill changes (deferred to follow-on)
- Per-tenant API tokens (a single shared worker secret is used for now)
- Admin UI for cache invalidation

---

## Architecture

```
POST /api/generate  {domain: "example.com", ...}
  │
  ▼
build-prompt.js
  ├── load ctx.tenant.brandVoice  (existing manual config)
  ├── call fetchGovernanceRules(domain, env)   [NEW]
  │     ├── KV cache hit "gov:{domain}" → return cached data
  │     └── KV cache miss →
  │           GET /api/v1/brands/from-url?url=https://{domain}
  │           GET /api/v1/brands/{id}/checks?status=ACTIVE&pageSize=100
  │           (paginate until exhausted)
  │           filter + transform
  │           write to KV with expirationTtl=3600
  │           return structured data
  │           on any error → return null
  └── build system prompt:
        [existing brandVoice fields — unchanged]
        [if governanceRules != null]:
          ## Brand Guidelines (from governance)
          - rule
          - rule
          ## Compliance Rules (from governance)
          - rule
          - rule
```

---

## API Details

**Base URL:** `https://adobe-aem-foundation-brand-governance-agent-deploy-9950ff.cloud.adobe.io`

**Auth:** `Authorization: Bearer {BRAND_GOVERNANCE_TOKEN}`

### Step 1 — Resolve brand from domain

```
GET /api/v1/brands/from-url?url=https://{domain}
```

Response: `{ id, name, status, ... }`. If 404 or brand status is not ACTIVE → skip governance, return null.

### Step 2 — Fetch active checks

```
GET /api/v1/brands/{id}/checks?status=ACTIVE&pageSize=100
```

Paginate: repeat with `page=2, 3...` until `items.length < pageSize`.

**Filtering after fetch:**
- Include ALL active checks regardless of type (no type filter)
- Group by type for prompt organization: BRAND, COMPLIANCE/DLP, and everything else ("other")

**Transform each check to:** `{ name, type, rule, criticality }`

---

## New Module: `src/brand-governance.js`

```js
export async function fetchGovernanceRules(domain, env) {
  // returns { brandName, checks: { brand: [...], compliance: [...], other: [...] } } or null
  // brand   = checks with type BRAND
  // compliance = checks with type COMPLIANCE or DLP
  // other   = all remaining check types
}
```

**Contract:**
- Returns `null` on: missing token, any network error, 4xx/5xx from API, malformed response, brand not found, brand not ACTIVE
- Never throws — all errors are caught and logged as warnings
- KV write failures are logged but do not prevent returning data
- If `env.BRAND_GOVERNANCE_TOKEN` is falsy → return null immediately (no fetch attempt)

**Cache key:** `gov:{domain}`  
**Cache TTL:** 3600 seconds (1 hour)  
**Cache namespace binding:** `BRAND_GOVERNANCE_CACHE`

---

## Modified File: `src/build-prompt.js`

After the existing `brandVoice` fields are appended to the system prompt, call `fetchGovernanceRules` and conditionally append:

```
## Brand Guidelines (from governance)
- {rule for each BRAND check}

## Compliance Rules (from governance)
- {rule for each COMPLIANCE/DLP check, sorted HIGH before MEDIUM}
```

If `fetchGovernanceRules` returns `null`, this block is omitted. No change to prompt structure for tenants without governance data.

---

## Worker Configuration Changes (`wrangler.jsonc`)

1. **KV namespace** — add binding `BRAND_GOVERNANCE_CACHE` pointing to a new KV namespace.
   - Create with: `wrangler kv namespace create BRAND_GOVERNANCE_CACHE`
2. **Secret** — `BRAND_GOVERNANCE_TOKEN` (set via `wrangler secret put BRAND_GOVERNANCE_TOKEN`)
3. **Plain var** — `BRAND_GOVERNANCE_BASE_URL` (can be overridden per environment)

---

## Error Handling Contract

| Condition | Behavior |
|-----------|----------|
| Token not set | Skip governance entirely, return null |
| Network error | Warn log, return null |
| 404 (brand not found) | Info log, return null, cache the miss (empty object) for 1h |
| 4xx other than 404 | Warn log, return null |
| 5xx | Warn log, return null (do NOT cache) |
| Malformed JSON | Warn log, return null |
| KV write error | Warn log, continue with data |
| No active checks returned | Return empty checks object (not null) |

Caching a 404 miss for 1 hour prevents hammering the API for domains not in the governance system.

---

## Scope

Changes are limited to the `of1-demo` worker repo:
- `src/brand-governance.js` — new file (verify `src/` is the correct source directory)
- `src/build-prompt.js` — add governance enrichment block (verify exact filename in worker repo)
- `wrangler.jsonc` — add KV binding and env var

> **Note for implementors:** Confirm the worker's source layout before implementation — file paths above assume a standard `src/` structure but the actual layout should be verified by reading the worker repo.

No changes to the `of1-demo-skills` repo for the initial implementation.

---

## Testing

1. **Unit** — `brand-governance.js` with mocked fetch: test cache hit, cache miss, 404 brand-not-found, 5xx, missing token, pagination, filter logic
2. **Integration** — `POST /api/generate` with a domain that exists in governance: verify prompt contains governance sections
3. **Graceful degradation** — `POST /api/generate` with domain not in governance: verify prompt is unchanged from current behavior

---

## Follow-on (out of scope here)

- Skill-level cache warm-up: `of1-deploy` skill calls a worker admin endpoint after deploying tenant config
- Per-tenant token support
- Cache invalidation admin endpoint (`DELETE /api/admin/tenants/{domain}/governance/cache`)
