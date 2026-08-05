---
name: of1-cookie-consent
description: Install a region-aware EU/US cookie consent banner (opt-in EU, opt-out US) into the generated EDS demo site, brand-styled to match the site.
user-invocable: false
---

# OF1 Cookie Consent

Install the `cookie-consent` block into the demo repo so every generated site ships with a real, region-aware consent banner: opt-in for EU/EEA/UK/CH, opt-out (+ Global Privacy Control) for the US, defaulting to the stricter opt-in behavior when the region is unknown. This step is **mandatory** — it runs for every generation, with no user-facing setup question, because region handling is fully automatic at runtime.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-2-consent-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `SKILL_DIR` | absolute path to this skill's directory (used to find the canonical `assets/cookie-consent.js` and `assets/cookie-consent.css`) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

```bash
DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

## CRITICAL RULES

1. **NEVER modify `blocks/cookie-consent/cookie-consent.js`** — the consent logic (region detection, opt-in/opt-out behavior, GPC handling, storage) is compliance-critical shared infrastructure. Only the CSS (`blocks/cookie-consent/cookie-consent.css`) is customized per brand.
2. **This skill OWNS the block install.** Always copy `cookie-consent.js` and `cookie-consent.css` fresh from `$SKILL_DIR/assets/` — never reuse whatever exists in the demo repo (may be stale from a previous run).
3. **Style using the site's real brand tokens** — read `styles/styles.css` (and `stardust/current/DESIGN.json` if present) the same way `of1-generative-block-styler` does. The banner must feel native to the brand, not a generic overlay.
4. **Non-negotiable styling constraints, regardless of brand** (see comments at the top of `cookie-consent.css`):
   - `.of1-consent-btn--primary` (Accept) and `.of1-consent-btn--secondary` (Reject) keep identical padding/font-size/border-width — no dark patterns.
   - Text must stay WCAG AA contrast against the banner background.
   - Banner/backdrop `opacity` stays `1` and `z-index` stays above all other site content — no fade-so-it's-ignorable tricks.
5. **This step is mandatory, not optional** — run it for every domain, unconditionally. There is no setup question and no way to skip it.
6. **Commit BOTH `cookie-consent.js` and `cookie-consent.css`** — always `git add blocks/cookie-consent/` to include both. Missing JS = no banner at all, which is a compliance gap, not a cosmetic bug.

## Legal behavior (implemented in `cookie-consent.js` — do not re-derive, just know what it does)

- **Region detection**: `?of1-region=eu|us` query override (for QA) → Global Privacy Control signal (`navigator.globalPrivacyControl === true` forces `us`/opt-out mode) → browser locale region subtag → unknown defaults to `eu`. True IP geolocation (e.g. a `cf-ipcountry` header) isn't reachable from client-side JS on a static EDS page without a backend endpoint, so this is a locale/GPC heuristic — good enough for demo purposes, and documented as such in the file's header comment.
- **EU/EEA/UK/CH**: opt-in. `functional`/`analytics`/`marketing` default `false`. A blocking backdrop (`.of1-consent-backdrop`) appears until the visitor picks Accept All / Reject All / Manage Preferences (no pre-ticked boxes).
- **US** (or GPC signal set): opt-out. Those categories default `true`. No backdrop; a lightweight banner with a "Do Not Sell/Share My Info" action.
- **Storage**: `localStorage['of1-consent']` = `{version, region, timestamp, categories}`. Re-prompts if the stored `version` doesn't match `POLICY_VERSION` in the JS.
- **Withdrawal**: once a choice is stored, the banner is replaced with a persistent "Cookie settings" button (bottom-left) that reopens the same panel.
- **Extension hook for future scripts**: `window.of1Consent.on(category, callback)` — fires immediately if already granted, or later when granted. Nothing consumes this yet; it's the gate any future analytics/ads block should wrap itself in.

## Process

### Step 0 — Install block files

```bash
cd "$OF1_DEMO_REPO"
mkdir -p blocks/cookie-consent
cp "$SKILL_DIR/assets/cookie-consent.js"  blocks/cookie-consent/cookie-consent.js
cp "$SKILL_DIR/assets/cookie-consent.css" blocks/cookie-consent/cookie-consent.css
mkdir -p of1/config
cp "$SKILL_DIR/assets/consent-config.default.json" of1/config/consent-config.json
```

`cookie-consent.js` is deployed as-is. `cookie-consent.css` is the unbranded template — Step 1 customizes it in place.

### Step 1 — Restyle `cookie-consent.css` for the brand

Read brand tokens the same way `of1-generative-block-styler` does:
- `styles/styles.css` — the actual deployed CSS custom properties (colors, fonts, radius)
- `stardust/current/DESIGN.json` (if present) — design tokens

Edit `blocks/cookie-consent/cookie-consent.css` in place: replace the generic `--consent-*` token values in the `.cookie-consent { ... }` block at the top with the brand's real values (primary color, surface color, font family, border radius). **Do not touch anything else in the file** — the structural rules, the `.of1-consent-btn--primary`/`--secondary` symmetry, and the backdrop/z-index rules are the non-negotiable constraints from the CRITICAL RULES section above.

### Step 2 — Patch `scripts/scripts.js` to load the banner eagerly

The banner must appear on every page, before other lazy content — unlike a normal EDS block, it is not authored into any page's content, so it needs to be injected programmatically. Guard the patch with idempotent markers so it never collides with `of1-generative-block-styler`'s own `scripts.js` patch, regardless of run order:

Open `scripts/scripts.js`, find the `loadEager` function (runs on every page load), and add — **before** its closing brace, after existing eager work:

```javascript
/* OF1:CONSENT START */
async function of1LoadConsentBanner() {
  const { decorateBlock, loadBlock } = await import('./aem.js');
  const block = document.createElement('div');
  block.className = 'cookie-consent block';
  document.body.prepend(block);
  decorateBlock(block);
  await loadBlock(block);
}
of1LoadConsentBanner();
/* OF1:CONSENT END */
```

If the markers `OF1:CONSENT START`/`END` are already present in the file (from a prior run), replace the block between them instead of appending a second copy.

### Step 3 — Upload the `/cookie-policy` content page

Mirrors the `/of1`, `/nav`, `/footer` DA-content upload pattern in `of1-generative-block-styler` Step 7 — page content lives in DA, not in git.

```bash
COOKIE_POLICY_HTML=$(cat "$SKILL_DIR/assets/cookie-policy.html")

curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  -d "$COOKIE_POLICY_HTML" \
  "https://admin.da.live/source/${OWNER}/${REPO}/cookie-policy.html"

PREVIEW_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/cookie-policy")
PREVIEW_STATUS=$(echo "$PREVIEW_RESP" | tail -1)
if [ "$PREVIEW_STATUS" -lt 200 ] || [ "$PREVIEW_STATUS" -ge 300 ]; then
  echo "FAIL: preview trigger for /cookie-policy returned HTTP ${PREVIEW_STATUS}" >&2
  exit 1
fi
```

**Do NOT include a `<title>` tag in the DA HTML** — EDS renders it as visible content.

### Step 4 — Verify DA content is live

```bash
COOKIE_POLICY_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/cookie-policy"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$COOKIE_POLICY_URL")
if [ "$STATUS" != "200" ]; then
  echo "FAIL: /cookie-policy returned HTTP ${STATUS} — content not live" >&2
  exit 1
fi
```

### Step 5 — Commit and push

```bash
cd "$OF1_DEMO_REPO"
git add blocks/cookie-consent/ of1/config/consent-config.json scripts/scripts.js
git commit -m "feat: region-aware cookie consent banner for ${DOMAIN}"
git push origin "$BRANCH"
```

### Step 6 — Verify the live banner renders and behaves correctly

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"

# EU: banner + blocking backdrop, no pre-ticked non-essential boxes
playwright-cli open "${PREVIEW_BASE}/?of1-region=eu"
sleep 3
playwright-cli eval "document.querySelector('.of1-consent-banner') ? 'banner OK' : 'BANNER MISSING'"
playwright-cli eval "document.querySelector('.of1-consent-backdrop') ? 'backdrop OK' : 'BACKDROP MISSING (should be present for EU)'"
playwright-cli eval "[...document.querySelectorAll('.of1-consent-categories input[data-category]')].every(i => !i.checked) ? 'no pre-ticked boxes OK' : 'PRE-TICKED BOX FOUND'"
playwright-cli click ".of1-consent-btn--secondary[data-action='reject']"
playwright-cli eval "JSON.parse(localStorage.getItem('of1-consent')).categories.analytics === false ? 'reject-all stored OK' : 'REJECT NOT STORED'"
playwright-cli eval "document.querySelector('.of1-consent-settings-toggle') ? 'settings toggle OK' : 'TOGGLE MISSING'"

# US: no blocking backdrop, Do-Not-Sell action present
playwright-cli open "${PREVIEW_BASE}/?of1-region=us"
sleep 3
playwright-cli eval "document.querySelector('.of1-consent-backdrop') ? 'BACKDROP PRESENT (should be absent for US)' : 'no backdrop OK'"
playwright-cli eval "document.querySelector('[data-action=\"dns\"]') ? 'DNS link OK' : 'DNS LINK MISSING'"

# Cookie policy page
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PREVIEW_BASE}/cookie-policy")
echo "cookie-policy: HTTP ${STATUS}"

playwright-cli screenshot --fullPage=true --filename "$OF1_STATE_DIR/consent-check.png"
```

Common failures:

| Symptom | Likely cause |
|---|---|
| `BANNER MISSING` | `scripts/scripts.js` patch missing or `blocks/cookie-consent/cookie-consent.js` wasn't pushed |
| `BACKDROP MISSING` on EU | Region detection defaulted to `us` — check `?of1-region=eu` override is actually being read (not cached from a prior visit's `localStorage`) |
| Banner looks unstyled / generic | `cookie-consent.css` wasn't restyled in Step 1, or Step 0 didn't copy it fresh |
| Accept/Reject buttons visually unequal | Someone edited `.of1-consent-btn--primary`/`--secondary` padding differently — revert to the shared `.of1-consent-btn` base sizing |
| `/cookie-policy` 404 | DA content PUT or preview trigger failed — re-run Step 3 |

Fix any failures and re-push before Completion.

## Completion

```bash
cat > "$OF1_STATE_DIR/step-2-consent-status.json" <<EOF
{
  "step": "2-consent",
  "status": "done",
  "deliverables": [
    { "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/cookie-policy", "label": "Cookie policy" }
  ],
  "summary": "Region-aware cookie consent banner installed (EU opt-in, US opt-out + GPC)."
}
EOF
```

No review gate — this step runs unattended alongside everything else after Step 2 (Repo setup) and just needs to complete before Step 13 (Deploy).

## Common mistakes that waste time

| Mistake | Time cost | Fix |
|---|---|---|
| Adding a setup question asking the user to pick a region | Contradicts the requirement — region must be 100% automatic | Never add a region question; detection is entirely runtime/client-side |
| Modifying `cookie-consent.js` to "simplify" region logic | Breaks compliance behavior | JS is shared infrastructure — only customize the CSS |
| Trying to read a `cf-ipcountry` header from client JS | Doesn't exist client-side on static EDS pages | Use the locale/GPC heuristic already implemented; don't add a backend call for this |
| Committing `cookie-policy.html` into the git repo | EDS pages are DA content, not git files — it will never render | Upload it via `admin.da.live` PUT + preview trigger like `/of1`, `/nav`, `/footer` |
| Giving Accept and Reject different visual weight | Dark pattern — legally risky even in a demo | Keep `.of1-consent-btn--primary`/`--secondary` sizing identical |
