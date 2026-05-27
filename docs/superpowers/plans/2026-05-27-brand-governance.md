# Brand Governance Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the OF1 worker's LLM prompt with live brand governance rules fetched from the Adobe Experience Governance API, cached per tenant in the existing Cloudflare KV namespace.

**Architecture:** A new `brand-governance.js` module handles all API calls and KV caching (reusing the existing `env.CACHE` KV with `gov:` key prefix and 1h TTL). `tenant.js` calls it inside `loadTenant()` so governance data is transparently available on `tenant.governance`. Two new Nunjucks macros in `macros.njk` inject the governance sections into the generated prompt. On any API error or missing brand the module returns `null` and no governance sections appear in the prompt.

**Tech Stack:** Cloudflare Workers (ES modules), Cloudflare KV, Nunjucks (precompiled via `scripts/build-prompts.mjs`), Node.js `node:test`

**Spec:** `docs/superpowers/specs/2026-05-27-brand-governance-design.md` (in `of1-demo-skills` repo)

**Target repo:** `../of1-preview-service` (the actual worker repo — all changes are made there)

---

## File Map

| Action | Path (relative to `of1-preview-service/`) |
|--------|-------------------------------------------|
| Create | `worker/src/brand-governance.js` |
| Create | `worker/src/brand-governance.test.mjs` |
| Modify | `worker/src/tenant.js` |
| Modify | `prompts/shared/macros.njk` |
| Modify | `prompts/generate/template.njk` |
| Modify | `worker/wrangler.jsonc` |

---

## Task 1: Create `brand-governance.js` — write failing tests first

**Files:**
- Create: `worker/src/brand-governance.js`
- Create: `worker/src/brand-governance.test.mjs`

- [ ] **Step 1: Create the test file**

```javascript
// worker/src/brand-governance.test.mjs
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { fetchGovernanceRules } from './brand-governance.js';

function makeKV(initial = {}) {
  const store = Object.fromEntries(
    Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)])
  );
  return {
    get(key, type) {
      const val = store[key];
      if (val === undefined) return Promise.resolve(null);
      return Promise.resolve(type === 'json' ? JSON.parse(val) : val);
    },
    put(key, value, _opts) {
      store[key] = value;
      return Promise.resolve();
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    BRAND_GOVERNANCE_TOKEN: 'test-token',
    BRAND_GOVERNANCE_BASE_URL: 'https://gov.example.com',
    CACHE: makeKV(),
    ...overrides,
  };
}

const BRAND = { id: 'brand-123', name: 'Acme Corp', status: 'ACTIVE' };
const CHECKS = {
  items: [
    { name: 'Tone', type: 'BRAND', rule: 'Always be friendly and direct', criticality: 'HIGH' },
    { name: 'Legal', type: 'COMPLIANCE', rule: 'Never make medical claims', criticality: 'HIGH' },
    { name: 'DLP', type: 'DLP', rule: 'Do not expose PII', criticality: 'MEDIUM' },
    { name: 'Meta', type: 'META_INFORMATION', rule: 'Include product SKU', criticality: 'LOW' },
  ],
};

// Mock global fetch — replaced per test
let fetchCalls = [];
function mockFetch(...responses) {
  fetchCalls = [];
  let i = 0;
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return responses[i++];
  };
}

test('returns null when token is missing', async () => {
  const result = await fetchGovernanceRules('example.com', makeEnv({ BRAND_GOVERNANCE_TOKEN: '' }));
  assert.equal(result, null);
});

test('returns null when token is undefined', async () => {
  const result = await fetchGovernanceRules('example.com', makeEnv({ BRAND_GOVERNANCE_TOKEN: undefined }));
  assert.equal(result, null);
});

test('returns cached data without fetching on KV hit', async () => {
  const cached = { brandName: 'Cached', checks: { brand: [], compliance: [], other: [] } };
  const env = makeEnv({ CACHE: makeKV({ 'gov:cached.com': cached }) });
  mockFetch(); // should not be called

  const result = await fetchGovernanceRules('cached.com', env);
  assert.deepEqual(result, cached);
  assert.equal(fetchCalls.length, 0);
});

test('returns null and caches miss on 404', async () => {
  const env = makeEnv();
  let putCalled = false;
  env.CACHE.put = (key, val) => { putCalled = { key, val }; return Promise.resolve(); };
  mockFetch({ ok: false, status: 404 });

  const result = await fetchGovernanceRules('notfound.com', env);
  assert.equal(result, null);
  assert.equal(putCalled.key, 'gov:notfound.com');
  assert.equal(putCalled.val, JSON.stringify(null));
});

test('returns null without caching on 5xx', async () => {
  const env = makeEnv();
  let putCalled = false;
  env.CACHE.put = () => { putCalled = true; return Promise.resolve(); };
  mockFetch({ ok: false, status: 503 });

  const result = await fetchGovernanceRules('error.com', env);
  assert.equal(result, null);
  assert.equal(putCalled, false);
});

test('returns null without caching on non-404 4xx', async () => {
  const env = makeEnv();
  let putCalled = false;
  env.CACHE.put = () => { putCalled = true; return Promise.resolve(); };
  mockFetch({ ok: false, status: 401 });

  const result = await fetchGovernanceRules('unauth.com', env);
  assert.equal(result, null);
  assert.equal(putCalled, false);
});

test('returns null on network error', async () => {
  const env = makeEnv();
  global.fetch = async () => { throw new Error('Network failure'); };

  const result = await fetchGovernanceRules('netfail.com', env);
  assert.equal(result, null);
});

test('returns null and caches miss when brand not ACTIVE', async () => {
  const env = makeEnv();
  let putCalled = false;
  env.CACHE.put = (key, val) => { putCalled = { key, val }; return Promise.resolve(); };
  mockFetch({ ok: true, json: async () => ({ id: 'b1', name: 'Draft', status: 'DRAFT' }) });

  const result = await fetchGovernanceRules('draft.com', env);
  assert.equal(result, null);
  assert.equal(putCalled.key, 'gov:draft.com');
});

test('returns null on malformed JSON', async () => {
  const env = makeEnv();
  mockFetch({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });

  const result = await fetchGovernanceRules('badjson.com', env);
  assert.equal(result, null);
});

test('groups checks by type', async () => {
  const env = makeEnv();
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => CHECKS },
  );

  const result = await fetchGovernanceRules('acme.com', env);
  assert.equal(result.brandName, 'Acme Corp');
  assert.equal(result.checks.brand.length, 1);
  assert.equal(result.checks.brand[0].rule, 'Always be friendly and direct');
  assert.equal(result.checks.compliance.length, 2); // COMPLIANCE + DLP both here
  assert.equal(result.checks.other.length, 1);      // META_INFORMATION
});

test('caches successful result with 1h TTL', async () => {
  const env = makeEnv();
  let putOpts;
  env.CACHE.put = (_k, _v, opts) => { putOpts = opts; return Promise.resolve(); };
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => CHECKS },
  );

  await fetchGovernanceRules('acme.com', env);
  assert.deepEqual(putOpts, { expirationTtl: 3600 });
});

test('paginates until items.length < pageSize', async () => {
  const env = makeEnv();
  const page1 = { items: Array.from({ length: 100 }, (_, i) => ({ name: `c${i}`, type: 'BRAND', rule: `r${i}`, criticality: 'HIGH' })) };
  const page2 = { items: [{ name: 'last', type: 'BRAND', rule: 'final', criticality: 'LOW' }] };
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => page1 },
    { ok: true, json: async () => page2 },
  );

  const result = await fetchGovernanceRules('big.com', env);
  assert.equal(result.checks.brand.length, 101);
  assert.equal(fetchCalls.length, 3);
});

test('handles flat array checks response (no items wrapper)', async () => {
  const env = makeEnv();
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => CHECKS.items }, // flat array, no { items: [...] }
  );

  const result = await fetchGovernanceRules('acme.com', env);
  assert.equal(result.checks.brand.length, 1);
});

test('returns empty checks object (not null) when no checks exist', async () => {
  const env = makeEnv();
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => ({ items: [] }) },
  );

  const result = await fetchGovernanceRules('nochecks.com', env);
  assert.notEqual(result, null);
  assert.deepEqual(result.checks, { brand: [], compliance: [], other: [] });
});

test('does not throw when KV put fails', async () => {
  const env = makeEnv();
  env.CACHE.put = async () => { throw new Error('KV write error'); };
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => CHECKS },
  );

  const result = await fetchGovernanceRules('acme.com', env);
  assert.notEqual(result, null);
});

test('uses BRAND_GOVERNANCE_BASE_URL env var', async () => {
  const env = makeEnv({ BRAND_GOVERNANCE_BASE_URL: 'https://custom.gov.example.com' });
  mockFetch(
    { ok: true, json: async () => BRAND },
    { ok: true, json: async () => CHECKS },
  );

  await fetchGovernanceRules('acme.com', env);
  assert.ok(fetchCalls[0].url.startsWith('https://custom.gov.example.com'));
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd /Users/ffroese/git/of1-preview-service
node --test worker/src/brand-governance.test.mjs
```

Expected: All 16 tests fail with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../brand-governance.js'`.

- [ ] **Step 3: Create `worker/src/brand-governance.js`**

```javascript
// worker/src/brand-governance.js
const DEFAULT_BASE_URL = 'https://adobe-aem-foundation-brand-governance-agent-deploy-9950ff.cloud.adobe.io';
const CACHE_TTL = 3600;
const PAGE_SIZE = 100;

// Sentinel: brand not found or not active — caller should cache the miss
const MISS = Symbol('MISS');

export async function fetchGovernanceRules(domain, env) {
  if (!env.BRAND_GOVERNANCE_TOKEN) return null;

  const cacheKey = `gov:${domain}`;

  try {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached !== null) return cached;
  } catch (e) {
    console.warn('[governance] KV read:', e.message);
  }

  const baseUrl = env.BRAND_GOVERNANCE_BASE_URL || DEFAULT_BASE_URL;
  const headers = { Authorization: `Bearer ${env.BRAND_GOVERNANCE_TOKEN}` };

  try {
    const brandResult = await resolveBrand(domain, baseUrl, headers);

    if (brandResult === MISS) {
      await writeCacheSafe(env.CACHE, cacheKey, null, CACHE_TTL);
      return null;
    }
    if (brandResult === null) return null; // API error — don't cache, let next request retry

    const allChecks = await fetchAllChecks(brandResult.id, baseUrl, headers);
    const result = { brandName: brandResult.name, checks: groupChecks(allChecks) };
    await writeCacheSafe(env.CACHE, cacheKey, result, CACHE_TTL);
    return result;
  } catch (e) {
    console.warn('[governance] Unexpected error:', e.message);
    return null;
  }
}

// Returns brand object, MISS (404/inactive), or null (API error)
async function resolveBrand(domain, baseUrl, headers) {
  const url = `${baseUrl}/api/v1/brands/from-url?url=${encodeURIComponent(`https://${domain}`)}`;
  const res = await fetch(url, { headers });

  if (res.status === 404) {
    console.info(`[governance] No brand for ${domain}`);
    return MISS;
  }
  if (!res.ok) {
    console.warn(`[governance] Brand lookup HTTP ${res.status}`);
    return null;
  }

  const brand = await res.json();
  if (brand.status !== 'ACTIVE') {
    console.info(`[governance] Brand not ACTIVE: ${brand.status}`);
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
      console.warn(`[governance] Checks HTTP ${res.status} page ${page}`);
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
    (acc, c) => {
      const entry = { name: c.name, rule: c.rule, criticality: c.criticality };
      if (c.type === 'BRAND') acc.brand.push(entry);
      else if (c.type === 'COMPLIANCE' || c.type === 'DLP') acc.compliance.push(entry);
      else acc.other.push(entry);
      return acc;
    },
    { brand: [], compliance: [], other: [] },
  );
}

async function writeCacheSafe(kv, key, value, ttl) {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch (e) {
    console.warn('[governance] KV write:', e.message);
  }
}
```

- [ ] **Step 4: Run tests — all 16 should pass**

```bash
node --test worker/src/brand-governance.test.mjs
```

Expected output:
```
✔ returns null when token is missing
✔ returns null when token is undefined
✔ returns cached data without fetching on KV hit
... (16 tests total, all passing)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/ffroese/git/of1-preview-service
git add worker/src/brand-governance.js worker/src/brand-governance.test.mjs
git commit -m "feat: add brand-governance module with KV caching"
```

---

## Task 2: Integrate governance into `tenant.js`

**Files:**
- Modify: `worker/src/tenant.js`

Current `loadTenant` loads config files from R2 into a tenant object and caches it for 300s. We add a governance fetch after R2 loading — using the same `env.CACHE` KV but with a separate `gov:` key and 1h TTL.

- [ ] **Step 1: Add the import to `tenant.js`**

At the top of `worker/src/tenant.js`, add the import alongside the existing code:

```javascript
import { fetchGovernanceRules } from './brand-governance.js';
```

- [ ] **Step 2: Add governance fetch inside `loadTenant`**

The current `loadTenant` function ends with caching the tenant and returning it. Add the governance fetch **before** the cache write so governance is included in the cached tenant:

Find this block (near end of `loadTenant`):

```javascript
  await Promise.all(loads);

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(tenant), { expirationTtl: CACHE_TTL });
  }

  return tenant;
```

Replace it with:

```javascript
  await Promise.all(loads);

  tenant.governance = await fetchGovernanceRules(id, env);

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(tenant), { expirationTtl: CACHE_TTL });
  }

  return tenant;
```

The full updated `loadTenant` function should now look like:

```javascript
export async function loadTenant(id, env) {
  if (!id) return null;

  const cacheKey = `tenant:${id}`;

  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached) return cached;
  }

  if (!env.TENANTS) return null;

  const tenant = { id };

  const loads = CONFIG_FILES.map(async (file) => {
    const obj = await env.TENANTS.get(`tenants/${id}/${file}.json`);
    if (obj) {
      tenant[toCamelCase(file)] = await obj.json();
    } else {
      tenant[toCamelCase(file)] = null;
    }
  });

  await Promise.all(loads);

  tenant.governance = await fetchGovernanceRules(id, env);

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(tenant), { expirationTtl: CACHE_TTL });
  }

  return tenant;
}
```

- [ ] **Step 3: Write a test for the governance integration in `tenant.js`**

The existing test pattern for this repo is `.test.mjs` with `node:test`. Create `worker/src/tenant.governance.test.mjs`:

```javascript
// worker/src/tenant.governance.test.mjs
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { loadTenant } from './tenant.js';

function makeR2Object(json) {
  return { json: async () => json };
}

function makeTenants(files = {}) {
  return {
    get: async (key) => files[key] ?? null,
  };
}

function makeCache() {
  const store = {};
  return {
    get: async (key, type) => {
      const val = store[key];
      if (val === undefined) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    put: async (key, val) => { store[key] = val; },
  };
}

test('tenant.governance is null when token is missing', async () => {
  const env = {
    CACHE: makeCache(),
    TENANTS: makeTenants({ 'tenants/example.com/brand-voice.json': makeR2Object({ personality: 'Bold' }) }),
    // no BRAND_GOVERNANCE_TOKEN
  };
  global.fetch = async () => { throw new Error('should not be called'); };

  const tenant = await loadTenant('example.com', env);
  assert.equal(tenant.governance, null);
  assert.equal(tenant.brandVoice.personality, 'Bold');
});

test('tenant.governance is populated when API works', async () => {
  const env = {
    CACHE: makeCache(),
    TENANTS: makeTenants(),
    BRAND_GOVERNANCE_TOKEN: 'test-token',
    BRAND_GOVERNANCE_BASE_URL: 'https://gov.example.com',
  };
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, json: async () => ({ id: 'b1', name: 'Acme', status: 'ACTIVE' }) };
    return { ok: true, json: async () => ({ items: [{ name: 'Tone', type: 'BRAND', rule: 'Be direct', criticality: 'HIGH' }] }) };
  };

  const tenant = await loadTenant('acme.com', env);
  assert.notEqual(tenant.governance, null);
  assert.equal(tenant.governance.checks.brand.length, 1);
});

test('tenant.governance is included in the tenant cache', async () => {
  const cache = makeCache();
  const env = {
    CACHE: cache,
    TENANTS: makeTenants(),
    BRAND_GOVERNANCE_TOKEN: 'test-token',
    BRAND_GOVERNANCE_BASE_URL: 'https://gov.example.com',
  };
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: true, json: async () => ({ id: 'b1', name: 'Acme', status: 'ACTIVE' }) };
    return { ok: true, json: async () => ({ items: [] }) };
  };

  await loadTenant('cached.com', env);

  // Second call: should use cache, no fetch
  global.fetch = async () => { throw new Error('should not call API again'); };
  const tenant2 = await loadTenant('cached.com', env);
  assert.notEqual(tenant2.governance, undefined); // was included in cache
});
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/ffroese/git/of1-preview-service
node --test worker/src/brand-governance.test.mjs worker/src/tenant.governance.test.mjs
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/src/tenant.js worker/src/tenant.governance.test.mjs
git commit -m "feat: load brand governance rules into tenant object"
```

---

## Task 3: Add governance macro and wire up the Nunjucks template

**Files:**
- Modify: `prompts/shared/macros.njk`
- Modify: `prompts/generate/template.njk`

The build step (`npm run build:prompts`) precompiles the Nunjucks templates into `worker/src/prompts/_generated/templates.js`. You must run the build before deploying.

- [ ] **Step 1: Add the `governanceRules` macro to `prompts/shared/macros.njk`**

Append this macro at the end of the file, after the closing `{%- endmacro %}` of the last existing macro:

```nunjucks
{% macro governanceRules(gov) -%}
{%- if gov -%}
{%- if gov.checks.brand and gov.checks.brand.length %}
## Brand Guidelines
{% for c in gov.checks.brand -%}
- {{ c.rule }}
{% endfor -%}
{%- endif -%}
{%- if gov.checks.compliance and gov.checks.compliance.length %}
## Compliance Rules
{% for c in gov.checks.compliance -%}
- {{ c.rule }}
{% endfor -%}
{%- endif -%}
{%- if gov.checks.other and gov.checks.other.length %}
## Additional Governance Rules
{% for c in gov.checks.other -%}
- {{ c.rule }}
{% endfor -%}
{%- endif -%}
{%- endif -%}
{%- endmacro %}
```

- [ ] **Step 2: Call the macro in `prompts/generate/template.njk`**

Find the `{{ m.brandVoice(tenant.brandVoice) }}` line in the SYSTEM section. Add the governance call immediately after it:

```nunjucks
{{ m.brandVoice(tenant.brandVoice) }}
{{ m.governanceRules(tenant.governance) }}
```

The top of `template.njk` should now look like:

```nunjucks
{% import "shared/macros.njk" as m %}---SYSTEM---
You are a helpful product advisor that generates page sections.

{{ m.brandVoice(tenant.brandVoice) }}
{{ m.governanceRules(tenant.governance) }}
{% if tenant.blockGuide and tenant.blockGuide.guide -%}
```

- [ ] **Step 3: Build the prompts to regenerate the compiled templates**

```bash
cd /Users/ffroese/git/of1-preview-service
npm run build:prompts
```

Expected output: `Built N prompts → worker/src/prompts/_generated`

Verify the generated file includes the governance macro:

```bash
grep -c "governanceRules\|Brand Guidelines\|Compliance Rules" worker/src/prompts/_generated/templates.js
```

Expected: Output is a number > 0 (lines referencing governance found).

- [ ] **Step 4: Test the template rendering with a fixture**

Verify the template renders correctly when `tenant.governance` is populated. Run this quick test:

```bash
node -e "
import('./worker/src/prompts/index.js').then(({ getPrompt }) => {
  const prompt = getPrompt('generate');
  const { system } = prompt.render({
    tenant: {
      brandVoice: { personality: 'Bold' },
      governance: {
        brandName: 'Acme',
        checks: {
          brand: [{ name: 'Tone', rule: 'Always be concise', criticality: 'HIGH' }],
          compliance: [{ name: 'Legal', rule: 'Never promise results', criticality: 'HIGH' }],
          other: []
        }
      },
      blockGuide: null
    },
    query: 'test',
    intent: null,
    rag: { products: [], content: [], persona: null, useCase: null, behaviorAnalysis: null },
    request: { mode: 'query', followUp: false, conversationHistory: [] }
  });
  const hasGovernance = system.includes('Brand Guidelines') && system.includes('Always be concise');
  const hasBrandVoice = system.includes('Bold');
  console.log('hasGovernance:', hasGovernance);
  console.log('hasBrandVoice:', hasBrandVoice);
  if (!hasGovernance || !hasBrandVoice) process.exit(1);
  console.log('OK');
});
"
```

Expected output:
```
hasGovernance: true
hasBrandVoice: true
OK
```

- [ ] **Step 5: Verify null governance produces unchanged prompt**

```bash
node -e "
import('./worker/src/prompts/index.js').then(({ getPrompt }) => {
  const prompt = getPrompt('generate');
  const { system } = prompt.render({
    tenant: { brandVoice: { personality: 'Bold' }, governance: null, blockGuide: null },
    query: 'test',
    intent: null,
    rag: { products: [], content: [], persona: null, useCase: null, behaviorAnalysis: null },
    request: { mode: 'query', followUp: false, conversationHistory: [] }
  });
  const noGovernance = !system.includes('Brand Guidelines') && !system.includes('Compliance Rules');
  const hasBrandVoice = system.includes('Bold');
  console.log('noGovernance:', noGovernance);
  console.log('hasBrandVoice:', hasBrandVoice);
  if (!noGovernance || !hasBrandVoice) process.exit(1);
  console.log('OK');
});
"
```

Expected: `noGovernance: true`, `hasBrandVoice: true`, `OK`

- [ ] **Step 6: Commit**

```bash
git add prompts/shared/macros.njk prompts/generate/template.njk worker/src/prompts/_generated/
git commit -m "feat: inject brand governance rules into generated prompt"
```

---

## Task 4: Update `wrangler.jsonc` and set the token

**Files:**
- Modify: `worker/wrangler.jsonc`

The existing `wrangler.jsonc` already has the `CACHE` KV namespace — we reuse it. We only need to add `BRAND_GOVERNANCE_BASE_URL` as a plain var. The token is set as a secret, never committed.

Current `vars` section:
```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "USE_LLM_INTENT": "true"
}
```

- [ ] **Step 1: Add `BRAND_GOVERNANCE_BASE_URL` to vars**

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "USE_LLM_INTENT": "true",
  "BRAND_GOVERNANCE_BASE_URL": "https://adobe-aem-foundation-brand-governance-agent-deploy-9950ff.cloud.adobe.io"
}
```

- [ ] **Step 2: Set the token as a Cloudflare secret**

```bash
cd /Users/ffroese/git/of1-preview-service/worker
npx wrangler secret put BRAND_GOVERNANCE_TOKEN
```

Paste the bearer token when prompted. This stores it encrypted in Cloudflare — it will NOT appear in `wrangler.jsonc` or any committed file.

- [ ] **Step 3: Verify the config parses cleanly**

```bash
npx wrangler deploy --dry-run 2>&1 | head -30
```

Expected: No errors. `BRAND_GOVERNANCE_BASE_URL` should appear in the vars list.

- [ ] **Step 4: Commit wrangler.jsonc**

```bash
cd /Users/ffroese/git/of1-preview-service
git add worker/wrangler.jsonc
git commit -m "feat: add brand governance base URL to worker config"
```

---

## Task 5: Deploy and verify

- [ ] **Step 1: Build prompts and deploy**

```bash
cd /Users/ffroese/git/of1-preview-service
npm run build:prompts
cd worker
npx wrangler deploy
```

Expected: Deployment succeeds. URL: `https://of1-gen-web-service.franklin-prod.workers.dev`

- [ ] **Step 2: Test with a domain registered in the governance system**

Replace `<domain>` with a domain that exists in the Experience Governance system:

```bash
curl -s -X POST https://of1-gen-web-service.franklin-prod.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"domain":"<domain>","query":"show me your best products","followUp":false,"context":{"browsing":[],"conversationHistory":[]}}' | jq '.sections | length'
```

Expected: Response has sections, no errors.

Check worker logs for governance activity:

```bash
cd /Users/ffroese/git/of1-preview-service/worker
npx wrangler tail --format pretty 2>&1 | grep governance &
# Then make the curl request above
```

On first request: should see `[governance] ...` log line (brand lookup). On repeat: no governance logs (served from cache).

- [ ] **Step 3: Test graceful degradation with an unregistered domain**

```bash
curl -s -X POST https://of1-gen-web-service.franklin-prod.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"domain":"definitely-not-registered.example.com","query":"test","followUp":false,"context":{"browsing":[],"conversationHistory":[]}}' | jq '.'
```

Expected: Normal generation response (or 404 if no tenant config), no 500 errors. Worker logs should show `[governance] No brand for...`.

- [ ] **Step 4: Verify KV cache entries are created**

```bash
# Get the CACHE KV namespace ID from wrangler.jsonc (c685de5e1c9144f89a4ac17f5cf9d800)
cd /Users/ffroese/git/of1-preview-service/worker
npx wrangler kv key list --namespace-id c685de5e1c9144f89a4ac17f5cf9d800 2>/dev/null | grep '"gov:'
```

Expected: You should see `"gov:<domain>"` key entries for queried domains.

---

## Quick Reference: Environment Variables

| Variable | Type | How to set |
|----------|------|-----------|
| `BRAND_GOVERNANCE_TOKEN` | Secret | `wrangler secret put BRAND_GOVERNANCE_TOKEN` (in `worker/`) |
| `BRAND_GOVERNANCE_BASE_URL` | Var | `worker/wrangler.jsonc` `vars` section |
| `CACHE` | KV binding | Already present in `wrangler.jsonc` — no changes needed |

To rotate the token: `wrangler secret put BRAND_GOVERNANCE_TOKEN` again.
