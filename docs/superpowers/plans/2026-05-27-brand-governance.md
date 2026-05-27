# Brand Governance Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the OF1 worker's LLM prompt with live brand governance rules (brand voice, compliance) fetched from the Adobe Experience Governance API, cached per tenant in Cloudflare KV.

**Architecture:** A new `brand-governance.js` module handles all API communication and KV caching. `build-prompt.js` calls it and conditionally appends governance sections to the system prompt. On any API error or missing brand, the module returns `null` and the prompt is unchanged from today's behavior.

**Tech Stack:** Cloudflare Workers (ES modules), Cloudflare KV, Adobe Experience Governance REST API, vitest (or the project's existing test framework)

**Spec:** `docs/superpowers/specs/2026-05-27-brand-governance-design.md`

**Target repo:** `https://github.com/aem-growth-adoption/of1-demo` (the worker repo — clone to `~/of1-demo` if not present)

---

## File Map

| Action | Path (in `of1-demo` worker repo) |
|--------|----------------------------------|
| Create | `src/brand-governance.js` *(verify `src/` exists; if not, use project root)* |
| Create | `test/brand-governance.test.js` *(or wherever existing tests live)* |
| Modify | `src/build-prompt.js` *(the file that reads `ctx.tenant.brandVoice`)* |
| Modify | `wrangler.jsonc` |

> **Before starting:** Run the discovery step in Task 0 to confirm exact paths.

---

## Task 0: Setup & Discovery

**Files:** none changed

- [ ] **Step 1: Clone the worker repo (if not already present)**

```bash
cd ~
git clone https://github.com/aem-growth-adoption/of1-demo.git of1-demo
cd of1-demo
```

- [ ] **Step 2: Find the build-prompt file and source layout**

```bash
find . -name "build-prompt*" -not -path "*/node_modules/*"
find . -name "wrangler*" -not -path "*/node_modules/*"
find . -maxdepth 3 -name "*.js" -not -path "*/node_modules/*" | sort
```

Note the location of `build-prompt.js`. If it is at `src/build-prompt.js`, use `src/brand-governance.js` for the new module. If it is at the project root, use `brand-governance.js` at the root.

- [ ] **Step 3: Find the test setup**

```bash
cat package.json | grep -E '"test"|"vitest"|"jest"'
ls test/ src/__tests__/ __tests__/ 2>/dev/null | head -20
```

Note which test directory and runner the project uses.

- [ ] **Step 4: Install dependencies (if needed)**

```bash
npm install
```

---

## Task 1: Create `brand-governance.js` — write failing tests first

**Files:**
- Create: `src/brand-governance.js` *(adjust path per Task 0 findings)*
- Create: `test/brand-governance.test.js` *(adjust path per Task 0 findings)*

- [ ] **Step 1: Create the test file**

```bash
mkdir -p test
```

```javascript
// test/brand-governance.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGovernanceRules } from '../src/brand-governance.js';

// Minimal KV mock
function makeKV(initial = {}) {
  const store = { ...initial };
  return {
    get: vi.fn(async (key, type) => {
      const val = store[key];
      if (val === undefined) return null;
      return type === 'json' ? JSON.parse(val) : val;
    }),
    put: vi.fn(async (key, value) => { store[key] = value; }),
  };
}

function makeEnv(overrides = {}) {
  return {
    BRAND_GOVERNANCE_TOKEN: 'test-token',
    BRAND_GOVERNANCE_BASE_URL: 'https://governance.example.com',
    BRAND_GOVERNANCE_CACHE: makeKV(),
    ...overrides,
  };
}

const BRAND_RESPONSE = { id: 'brand-123', name: 'Acme Corp', status: 'ACTIVE' };
const CHECKS_RESPONSE = {
  items: [
    { name: 'Tone check', type: 'BRAND', rule: 'Always be friendly', criticality: 'HIGH' },
    { name: 'Legal check', type: 'COMPLIANCE', rule: 'Never make medical claims', criticality: 'HIGH' },
    { name: 'Data check', type: 'DLP', rule: 'Do not expose PII', criticality: 'MEDIUM' },
    { name: 'Meta check', type: 'META_INFORMATION', rule: 'Always include product SKU', criticality: 'LOW' },
  ],
};

describe('fetchGovernanceRules', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns null when token is missing', async () => {
    const result = await fetchGovernanceRules('example.com', makeEnv({ BRAND_GOVERNANCE_TOKEN: '' }));
    expect(result).toBeNull();
  });

  it('returns null when token is undefined', async () => {
    const result = await fetchGovernanceRules('example.com', makeEnv({ BRAND_GOVERNANCE_TOKEN: undefined }));
    expect(result).toBeNull();
  });

  it('returns cached data without fetching when KV hit', async () => {
    const cached = { brandName: 'Cached Corp', checks: { brand: [], compliance: [], other: [] } };
    const kv = makeKV({ 'gov:example.com': JSON.stringify(cached) });
    const env = makeEnv({ BRAND_GOVERNANCE_CACHE: kv });
    global.fetch = vi.fn();

    const result = await fetchGovernanceRules('example.com', env);
    expect(result).toEqual(cached);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null and caches miss when brand returns 404', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchGovernanceRules('notfound.com', env);
    expect(result).toBeNull();
    expect(env.BRAND_GOVERNANCE_CACHE.put).toHaveBeenCalledWith(
      'gov:notfound.com',
      JSON.stringify(null),
      { expirationTtl: 3600 }
    );
  });

  it('returns null without caching on 5xx', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await fetchGovernanceRules('error.com', env);
    expect(result).toBeNull();
    expect(env.BRAND_GOVERNANCE_CACHE.put).not.toHaveBeenCalled();
  });

  it('returns null on network error', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure'));

    const result = await fetchGovernanceRules('network-error.com', env);
    expect(result).toBeNull();
  });

  it('returns null and caches miss when brand status is not ACTIVE', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'b1', name: 'Draft Brand', status: 'DRAFT' }),
    });

    const result = await fetchGovernanceRules('draft.com', env);
    expect(result).toBeNull();
    expect(env.BRAND_GOVERNANCE_CACHE.put).toHaveBeenCalledWith(
      'gov:draft.com',
      JSON.stringify(null),
      { expirationTtl: 3600 }
    );
  });

  it('returns null without caching on 4xx (non-404)', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await fetchGovernanceRules('unauthorized.com', env);
    expect(result).toBeNull();
    expect(env.BRAND_GOVERNANCE_CACHE.put).not.toHaveBeenCalled();
  });

  it('returns null on malformed JSON response', async () => {
    const env = makeEnv();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    const result = await fetchGovernanceRules('badjson.com', env);
    expect(result).toBeNull();
  });

  it('returns empty checks object (not null) when no checks exist', async () => {
    const env = makeEnv();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });

    const result = await fetchGovernanceRules('nochecks.com', env);
    expect(result).not.toBeNull();
    expect(result.checks.brand).toEqual([]);
    expect(result.checks.compliance).toEqual([]);
    expect(result.checks.other).toEqual([]);
  });

  it('groups checks by type', async () => {
    const env = makeEnv();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CHECKS_RESPONSE });

    const result = await fetchGovernanceRules('acme.com', env);

    expect(result.brandName).toBe('Acme Corp');
    expect(result.checks.brand).toHaveLength(1);
    expect(result.checks.brand[0]).toEqual({ name: 'Tone check', rule: 'Always be friendly', criticality: 'HIGH' });
    expect(result.checks.compliance).toHaveLength(2); // COMPLIANCE + DLP both go here
    expect(result.checks.other).toHaveLength(1);      // META_INFORMATION
  });

  it('caches successful result with 1h TTL', async () => {
    const env = makeEnv();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CHECKS_RESPONSE });

    const result = await fetchGovernanceRules('acme.com', env);
    expect(env.BRAND_GOVERNANCE_CACHE.put).toHaveBeenCalledWith(
      'gov:acme.com',
      JSON.stringify(result),
      { expirationTtl: 3600 }
    );
  });

  it('paginates until items < pageSize', async () => {
    const page1 = { items: Array.from({ length: 100 }, (_, i) => ({ name: `c${i}`, type: 'BRAND', rule: `rule${i}`, criticality: 'HIGH' })) };
    const page2 = { items: [{ name: 'last', type: 'BRAND', rule: 'final rule', criticality: 'LOW' }] };
    const env = makeEnv();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });

    const result = await fetchGovernanceRules('big.com', env);
    expect(result.checks.brand).toHaveLength(101);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not throw when KV put fails', async () => {
    const kv = makeKV();
    kv.put = vi.fn().mockRejectedValue(new Error('KV write error'));
    const env = makeEnv({ BRAND_GOVERNANCE_CACHE: kv });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CHECKS_RESPONSE });

    await expect(fetchGovernanceRules('acme.com', env)).resolves.not.toBeNull();
  });

  it('uses BRAND_GOVERNANCE_BASE_URL env var', async () => {
    const env = makeEnv({ BRAND_GOVERNANCE_BASE_URL: 'https://custom-gov.example.com' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CHECKS_RESPONSE });

    await fetchGovernanceRules('acme.com', env);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://custom-gov.example.com'),
      expect.any(Object)
    );
  });

  it('handles checks response as flat array (no items wrapper)', async () => {
    const env = makeEnv();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => BRAND_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CHECKS_RESPONSE.items }); // flat array

    const result = await fetchGovernanceRules('acme.com', env);
    expect(result.checks.brand).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
npx vitest run test/brand-governance.test.js
```

Expected: All 16 tests fail with `Cannot find module '../src/brand-governance.js'` or similar. If the project uses Jest replace `vitest` with `jest`.

- [ ] **Step 3: Create `src/brand-governance.js` with the implementation**

```javascript
// src/brand-governance.js
const DEFAULT_BASE_URL = 'https://adobe-aem-foundation-brand-governance-agent-deploy-9950ff.cloud.adobe.io';
const CACHE_KEY_PREFIX = 'gov:';
const CACHE_TTL_SECONDS = 3600;
const PAGE_SIZE = 100;

// Sentinel: brand not found or not active — cache the miss
const MISS = Symbol('MISS');

export async function fetchGovernanceRules(domain, env) {
  if (!env.BRAND_GOVERNANCE_TOKEN) return null;

  const cacheKey = `${CACHE_KEY_PREFIX}${domain}`;

  // Check KV cache
  try {
    const cached = await env.BRAND_GOVERNANCE_CACHE.get(cacheKey, 'json');
    if (cached !== null) return cached;
  } catch (e) {
    console.warn('[brand-governance] KV read error:', e.message);
  }

  const baseUrl = env.BRAND_GOVERNANCE_BASE_URL || DEFAULT_BASE_URL;
  const headers = { Authorization: `Bearer ${env.BRAND_GOVERNANCE_TOKEN}` };

  try {
    const brandResult = await resolveBrand(domain, baseUrl, headers);

    if (brandResult === MISS) {
      // 404 or non-ACTIVE: cache the miss so we don't hammer the API
      await writeCacheSafe(env.BRAND_GOVERNANCE_CACHE, cacheKey, null, CACHE_TTL_SECONDS);
      return null;
    }
    if (brandResult === null) {
      // API error (4xx other, 5xx): don't cache, let the next request retry
      return null;
    }

    const allChecks = await fetchAllChecks(brandResult.id, baseUrl, headers);
    const result = { brandName: brandResult.name, checks: groupChecks(allChecks) };

    await writeCacheSafe(env.BRAND_GOVERNANCE_CACHE, cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  } catch (e) {
    console.warn('[brand-governance] Unexpected error:', e.message);
    return null;
  }
}

// Returns the brand object, MISS sentinel (404 / not active), or null (API error)
async function resolveBrand(domain, baseUrl, headers) {
  const url = `${baseUrl}/api/v1/brands/from-url?url=${encodeURIComponent(`https://${domain}`)}`;
  const res = await fetch(url, { headers });

  if (res.status === 404) {
    console.info(`[brand-governance] No brand found for ${domain}`);
    return MISS;
  }
  if (!res.ok) {
    console.warn(`[brand-governance] Brand lookup HTTP ${res.status}`);
    return null; // API error — don't cache
  }

  const brand = await res.json();
  if (brand.status !== 'ACTIVE') {
    console.info(`[brand-governance] Brand not ACTIVE: ${brand.status}`);
    return MISS;
  }
  return brand;
}

async function fetchAllChecks(brandId, baseUrl, headers) {
  const checks = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/api/v1/brands/${brandId}/checks?status=ACTIVE&pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.warn(`[brand-governance] Checks HTTP ${res.status} on page ${page}`);
      break;
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items ?? []);
    checks.push(...items);

    if (items.length < PAGE_SIZE) break;
    page++;
  }

  return checks;
}

function groupChecks(checks) {
  return checks.reduce(
    (acc, check) => {
      const entry = { name: check.name, rule: check.rule, criticality: check.criticality };
      if (check.type === 'BRAND') {
        acc.brand.push(entry);
      } else if (check.type === 'COMPLIANCE' || check.type === 'DLP') {
        acc.compliance.push(entry);
      } else {
        acc.other.push(entry);
      }
      return acc;
    },
    { brand: [], compliance: [], other: [] }
  );
}

async function writeCacheSafe(kv, key, value, ttl) {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch (e) {
    console.warn('[brand-governance] KV write error:', e.message);
  }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npx vitest run test/brand-governance.test.js
```

Expected: All 16 tests pass. If `groupChecks` test for compliance count fails, verify that COMPLIANCE + DLP items both land in `acc.compliance` — see the `groupChecks` function.

- [ ] **Step 5: Commit**

```bash
git add src/brand-governance.js test/brand-governance.test.js
git commit -m "feat: add brand-governance module with KV caching"
```

---

## Task 2: Modify `build-prompt.js` to inject governance rules

**Files:**
- Modify: `src/build-prompt.js` *(exact path from Task 0)*

- [ ] **Step 1: Read the current build-prompt.js to understand the prompt assembly pattern**

```bash
cat src/build-prompt.js   # adjust path from Task 0
```

Look for:
- How `ctx.tenant.brandVoice` is read
- Where `personality`, `tone`, `vocabulary`, `avoidWords` are appended to the system prompt
- What the function signature is (likely `buildPrompt(ctx, env)` or similar)
- Whether it is `async` already

- [ ] **Step 2: Add the import at the top of build-prompt.js**

Add this import alongside the existing imports at the top of the file:

```javascript
import { fetchGovernanceRules } from './brand-governance.js';
```

*(Adjust the relative path if `build-prompt.js` is not in `src/`.)*

- [ ] **Step 3: Make the prompt-building function async if it isn't already**

If the function is currently `function buildPrompt(ctx, env)` (synchronous), change its signature to `async function buildPrompt(ctx, env)`. If it already is async, skip this step.

- [ ] **Step 4: Add the governance injection block after the existing brandVoice section**

Find the block in `build-prompt.js` that reads `ctx.tenant.brandVoice`. It looks approximately like:

```javascript
const brandVoice = ctx.tenant.brandVoice;
if (brandVoice) {
  if (brandVoice.personality) lines.push(`Personality: ${brandVoice.personality}`);
  if (brandVoice.tone) lines.push(`Tone: ${brandVoice.tone}`);
  if (brandVoice.vocabulary?.length) lines.push(`Use terms like: ${brandVoice.vocabulary.join(', ')}`);
  if (brandVoice.avoidWords?.length) lines.push(`Avoid: ${brandVoice.avoidWords.join(', ')}`);
}
```

Immediately after that block (still inside the same function), add:

```javascript
// Augment with live brand governance rules
const governance = await fetchGovernanceRules(ctx.domain, env);
if (governance) {
  if (governance.checks.brand.length > 0) {
    lines.push('\n## Brand Guidelines (from governance)');
    for (const check of governance.checks.brand) {
      lines.push(`- ${check.rule}`);
    }
  }
  if (governance.checks.compliance.length > 0) {
    lines.push('\n## Compliance Rules (from governance)');
    for (const check of governance.checks.compliance) {
      lines.push(`- ${check.rule}`);
    }
  }
  if (governance.checks.other.length > 0) {
    lines.push('\n## Additional Governance Rules');
    for (const check of governance.checks.other) {
      lines.push(`- ${check.rule}`);
    }
  }
}
```

> **Note on `ctx.domain`:** If the domain is on a different property (e.g. `ctx.tenant.domain`, `ctx.hostname`, `ctx.site`), adjust accordingly — grep for where `ctx.domain` (or the domain) is set in the codebase.

- [ ] **Step 5: Write an integration test for build-prompt.js**

Add a test to the existing `build-prompt` test file (or create `test/build-prompt-governance.test.js`):

```javascript
// Append to existing build-prompt test file, or add to test/build-prompt-governance.test.js
import { vi } from 'vitest';
import * as governance from '../src/brand-governance.js';

describe('buildPrompt — governance enrichment', () => {
  it('appends brand guidelines when governance returns data', async () => {
    vi.spyOn(governance, 'fetchGovernanceRules').mockResolvedValue({
      brandName: 'Acme',
      checks: {
        brand: [{ name: 'Tone', rule: 'Always be concise and direct', criticality: 'HIGH' }],
        compliance: [{ name: 'Legal', rule: 'Never promise guaranteed results', criticality: 'HIGH' }],
        other: [],
      },
    });

    const ctx = {
      domain: 'acme.com',
      tenant: {
        brandVoice: { personality: 'Bold, direct', tone: 'Professional' },
      },
    };
    const env = {};

    // Replace buildPrompt with the actual function name from the file
    const { buildPrompt } = await import('../src/build-prompt.js');
    const prompt = await buildPrompt(ctx, env);

    expect(prompt).toContain('Bold, direct');          // existing brandVoice still present
    expect(prompt).toContain('Brand Guidelines');
    expect(prompt).toContain('Always be concise and direct');
    expect(prompt).toContain('Compliance Rules');
    expect(prompt).toContain('Never promise guaranteed results');
    vi.restoreAllMocks();
  });

  it('does not modify prompt when governance returns null', async () => {
    vi.spyOn(governance, 'fetchGovernanceRules').mockResolvedValue(null);

    const ctx = {
      domain: 'example.com',
      tenant: { brandVoice: { personality: 'Friendly' } },
    };

    const { buildPrompt } = await import('../src/build-prompt.js');
    const prompt = await buildPrompt(ctx, {});

    expect(prompt).toContain('Friendly');
    expect(prompt).not.toContain('governance');
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass including the new governance enrichment tests.

- [ ] **Step 7: Commit**

```bash
git add src/build-prompt.js test/
git commit -m "feat: inject brand governance rules into generation prompt"
```

---

## Task 3: Configure `wrangler.jsonc`

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Create the KV namespace in Cloudflare**

```bash
npx wrangler kv namespace create BRAND_GOVERNANCE_CACHE
```

Copy the `id` from the output — you need it in the next step. It will look like:
```
{ binding = "BRAND_GOVERNANCE_CACHE", id = "abc123def456..." }
```

For a preview/dev namespace (used in local dev):
```bash
npx wrangler kv namespace create BRAND_GOVERNANCE_CACHE --preview
```

Copy the preview `id` too.

- [ ] **Step 2: Add the KV binding and env var to wrangler.jsonc**

Open `wrangler.jsonc` and add to the top-level config (adjust to match the file's existing structure):

```jsonc
{
  // ... existing config ...
  "kv_namespaces": [
    // ... existing KV namespaces if any ...
    {
      "binding": "BRAND_GOVERNANCE_CACHE",
      "id": "<paste production id from step 1>",
      "preview_id": "<paste preview id from step 1>"
    }
  ],
  "vars": {
    // ... existing vars ...
    "BRAND_GOVERNANCE_BASE_URL": "https://adobe-aem-foundation-brand-governance-agent-deploy-9950ff.cloud.adobe.io"
  }
}
```

> `BRAND_GOVERNANCE_TOKEN` is a secret — do NOT put it in wrangler.jsonc. Use `wrangler secret put` in Step 3.

- [ ] **Step 3: Set the token as a worker secret**

```bash
npx wrangler secret put BRAND_GOVERNANCE_TOKEN
```

Paste the bearer token when prompted. This stores it encrypted in Cloudflare; it will not appear in any config file.

- [ ] **Step 4: Verify the config looks right**

```bash
npx wrangler deploy --dry-run 2>&1 | head -40
```

Expected: No errors about missing bindings or unknown vars. You should see `BRAND_GOVERNANCE_CACHE` in the KV bindings list.

- [ ] **Step 5: Commit wrangler.jsonc**

```bash
git add wrangler.jsonc
git commit -m "feat: add brand governance KV namespace and env config"
```

---

## Task 4: Deploy and verify end-to-end

- [ ] **Step 1: Deploy to the worker**

```bash
npx wrangler deploy
```

Expected: Deployment succeeds. Note the worker URL in the output (should be `https://of1-gen-web-service.franklin-prod.workers.dev`).

- [ ] **Step 2: Test with a domain that has a brand in governance**

Replace `<domain>` with a domain that is registered in the Experience Governance system:

```bash
curl -s -X POST https://of1-gen-web-service.franklin-prod.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"domain":"<domain>","query":"show me your best products","followUp":false,"context":{"browsing":[],"conversationHistory":[]}}' \
  | jq '.'
```

Expected: Generation succeeds. The generated sections should reflect brand voice from governance. Check worker logs for confirmation:

```bash
npx wrangler tail --format pretty 2>&1 | grep brand-governance
```

You should see either `[brand-governance] No brand found for...` (domain not registered) or no governance log entries (cache hit after first request).

- [ ] **Step 3: Test graceful degradation with an unregistered domain**

```bash
curl -s -X POST https://of1-gen-web-service.franklin-prod.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"domain":"definitely-not-in-governance.example.com","query":"test","followUp":false,"context":{"browsing":[],"conversationHistory":[]}}' \
  | jq '.sections | length'
```

Expected: Response is identical to today's behavior — sections generated normally, no error, no governance enrichment. Worker logs should show `[brand-governance] No brand found for...` on first call, then nothing (cached miss) on repeat calls.

- [ ] **Step 4: Verify KV cache is being written**

```bash
npx wrangler kv key list --namespace-id <your-kv-id> | grep gov:
```

Expected: You should see `gov:<domain>` keys for any domains that have been queried.

- [ ] **Step 5: Final commit and push**

```bash
git add -p   # review any remaining changes
git commit -m "feat: brand governance integration complete"
git push origin main
```

---

## Quick Reference: Environment Variables

| Variable | Type | How to set |
|----------|------|-----------|
| `BRAND_GOVERNANCE_TOKEN` | Secret | `wrangler secret put BRAND_GOVERNANCE_TOKEN` |
| `BRAND_GOVERNANCE_BASE_URL` | Var | `wrangler.jsonc` `vars` section |
| `BRAND_GOVERNANCE_CACHE` | KV binding | `wrangler.jsonc` `kv_namespaces` section |

To update the token later: re-run `wrangler secret put BRAND_GOVERNANCE_TOKEN`.
