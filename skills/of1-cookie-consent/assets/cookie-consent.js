/**
 * OF1 Cookie Consent — region-aware consent banner.
 *
 * Legal behavior:
 * - EU/EEA/UK/CH: opt-in. Non-essential categories default OFF, and a blocking
 *   backdrop is shown, until the visitor chooses Accept All / Reject All / Manage
 *   Preferences. No pre-ticked non-essential boxes; Accept/Reject have equal weight.
 * - US (or whenever the Global Privacy Control signal is set, regardless of region):
 *   opt-out. Non-essential categories default ON; a lightweight banner offers
 *   "Do Not Sell/Share My Info".
 * - Unknown region: defaults to the stricter EU opt-in behavior.
 *
 * Region is a client-side heuristic (browser locale, GPC signal) — true IP
 * geolocation (e.g. Cloudflare's cf-ipcountry header) requires a backend endpoint,
 * which static EDS pages don't have. Override for QA with ?of1-region=eu|us.
 *
 * Exposes window.of1Consent = { region, has(category), on(category, cb) } —
 * the has() check is synchronous and reflects the *effective* current state
 * (region default, or the visitor's explicit choice once made). Other scripts
 * on the page — notably the of1-client SDK's personalization request — must
 * check has('marketing') before sharing any browsing/behavioral data. This is
 * a cross-repo contract: of1-gen-web-service depends on window.of1Consent
 * existing before the of1 block's init() runs (see the scripts.js patch below,
 * which awaits the banner mount for exactly this reason).
 *
 * Copied as-is by the of1-cookie-consent skill — this file is compliance-critical
 * behavior and must never be modified per-brand. Only cookie-consent.css is restyled.
 */

const STORAGE_KEY = 'of1-consent';
const POLICY_VERSION = 1;

const EU_REGIONS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', // EEA
  'GB', 'CH', // UK, Switzerland — GDPR-equivalent local consent laws
]);

const CATEGORIES = ['functional', 'analytics', 'marketing'];

function detectRegion() {
  const override = new URLSearchParams(window.location.search).get('of1-region');
  if (override === 'eu' || override === 'us') return override;

  if (navigator.globalPrivacyControl === true) return 'us';

  const locale = navigator.language || (navigator.languages && navigator.languages[0]) || '';
  const regionSubtag = locale.split('-')[1]?.toUpperCase();
  if (regionSubtag) {
    if (EU_REGIONS.has(regionSubtag)) return 'eu';
    if (regionSubtag === 'US') return 'us';
  }

  return 'eu';
}

function loadStoredConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(region, categories) {
  const record = {
    version: POLICY_VERSION,
    region,
    timestamp: new Date().toISOString(),
    categories,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

function defaultCategories(region) {
  const allowedByDefault = region === 'us';
  return CATEGORIES.reduce((acc, c) => {
    acc[c] = allowedByDefault;
    return acc;
  }, {});
}

class ConsentBus {
  constructor() {
    this.listeners = { functional: [], analytics: [], marketing: [] };
    this.categories = null;
  }

  setCategories(categories) {
    this.categories = categories;
    CATEGORIES.forEach((c) => {
      if (categories[c]) this.listeners[c].forEach((cb) => cb(true));
    });
  }

  on(category, cb) {
    if (this.categories && this.categories[category]) {
      cb(true);
      return;
    }
    (this.listeners[category] ||= []).push(cb);
  }

  hasCategory(category) {
    return !!(this.categories && this.categories[category]);
  }
}

function buildBanner({ region, categories, onSave }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'of1-consent-banner';
  wrapper.setAttribute('role', 'dialog');
  wrapper.setAttribute('aria-label', 'Cookie preferences');

  const isEu = region === 'eu';

  wrapper.innerHTML = `
    <div class="of1-consent-panel">
      <p class="of1-consent-text">
        We use cookies for essential site function${isEu ? ', and only use analytics or marketing cookies with your permission' : ', analytics, and marketing'}.
        <a href="/cookie-policy" class="of1-consent-link">Cookie Policy</a>
      </p>
      <div class="of1-consent-categories" hidden>
        ${CATEGORIES.map((c) => `
          <label class="of1-consent-category">
            <input type="checkbox" data-category="${c}" ${categories[c] ? 'checked' : ''}>
            <span>${c.charAt(0).toUpperCase() + c.slice(1)}</span>
          </label>
        `).join('')}
        <label class="of1-consent-category of1-consent-category--locked">
          <input type="checkbox" checked disabled>
          <span>Necessary</span>
        </label>
      </div>
      <div class="of1-consent-actions">
        ${!isEu ? '<button type="button" class="of1-consent-btn of1-consent-btn--ghost" data-action="dns">Do Not Sell/Share My Info</button>' : ''}
        <button type="button" class="of1-consent-btn of1-consent-btn--secondary" data-action="manage">Manage Preferences</button>
        <button type="button" class="of1-consent-btn of1-consent-btn--secondary" data-action="reject">Reject All</button>
        <button type="button" class="of1-consent-btn of1-consent-btn--primary" data-action="accept">Accept All</button>
        <button type="button" class="of1-consent-btn of1-consent-btn--primary" data-action="save" hidden>Save Preferences</button>
      </div>
    </div>
  `;

  const categoriesEl = wrapper.querySelector('.of1-consent-categories');
  const saveBtn = wrapper.querySelector('[data-action="save"]');
  const manageBtn = wrapper.querySelector('[data-action="manage"]');

  wrapper.addEventListener('click', (e) => {
    const { action } = e.target.dataset;
    if (!action) return;

    if (action === 'manage') {
      categoriesEl.hidden = !categoriesEl.hidden;
      saveBtn.hidden = categoriesEl.hidden;
      manageBtn.hidden = !categoriesEl.hidden;
      return;
    }

    if (action === 'accept') {
      onSave(CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: true }), {}));
    } else if (action === 'reject' || action === 'dns') {
      onSave(CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: false }), {}));
    } else if (action === 'save') {
      const picked = {};
      wrapper.querySelectorAll('[data-category]').forEach((input) => {
        picked[input.dataset.category] = input.checked;
      });
      onSave(picked);
    }
  });

  return wrapper;
}

function buildSettingsToggle(onOpen) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'of1-consent-settings-toggle';
  btn.textContent = 'Cookie settings';
  btn.addEventListener('click', onOpen);
  return btn;
}

export default async function decorate(block) {
  const region = detectRegion();
  const stored = loadStoredConsent();
  const bus = new ConsentBus();

  // Reflect the *effective* current state immediately — for the US opt-out
  // model that's "granted" from the very first load, not "pending" until the
  // visitor touches the banner. For EU opt-in it's correctly "not granted"
  // until they act. A later explicit choice (onSave) overwrites this.
  bus.setCategories(stored ? stored.categories : defaultCategories(region));

  // Extension point for other scripts (e.g. the of1-client SDK's own
  // personalization request) to check or wait on consent before sharing
  // anything. `has()` is a synchronous point-in-time check; `on()` also
  // fires later if the category isn't granted yet.
  window.of1Consent = {
    region,
    on: (category, cb) => bus.on(category, cb),
    has: (category) => bus.hasCategory(category),
  };

  block.textContent = '';
  let backdrop = null;
  let toggle = null;

  function mountToggle(categories) {
    toggle = buildSettingsToggle(() => {
      toggle.remove();
      mountBanner(categories);
    });
    block.appendChild(toggle);
  }

  function mountBanner(categories) {
    const banner = buildBanner({
      region,
      categories,
      onSave: (chosen) => {
        const record = saveConsent(region, chosen);
        bus.setCategories(record.categories);
        banner.remove();
        if (backdrop) {
          backdrop.remove();
          backdrop = null;
        }
        mountToggle(record.categories);
      },
    });
    block.appendChild(banner);
    if (region === 'eu' && !loadStoredConsent()) {
      backdrop = document.createElement('div');
      backdrop.className = 'of1-consent-backdrop';
      document.body.appendChild(backdrop);
    }
  }

  if (stored) {
    mountToggle(stored.categories);
  } else {
    mountBanner(defaultCategories(region));
  }
}
