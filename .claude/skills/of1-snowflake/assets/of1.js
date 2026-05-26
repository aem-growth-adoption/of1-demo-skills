import { decorateMain } from '../../scripts/scripts.js';
import { loadSections, readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_WORKER_URL = 'https://of1-gen-web-service.franklin-prod.workers.dev';

const ARROW_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RESTART_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 8A6 6 0 1 1 8 2c1.5 0 2.9.6 4 1.5M12 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let isGenerating = false;
const conversationHistory = [];

function escHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showSkeleton(block) {
  const section = block.closest('.section');
  if (section) section.style.minHeight = '100vh';

  const skeleton = document.createElement('div');
  skeleton.className = 'of1-skeleton-wrap';
  skeleton.innerHTML = `
    <div class="of1-skeleton of1-skeleton-hero"></div>
    <div class="of1-skeleton of1-skeleton-heading"></div>
    <div class="of1-skeleton of1-skeleton-text"></div>
    <div class="of1-skeleton of1-skeleton-text"></div>
    <div class="of1-skeleton of1-skeleton-text short"></div>
    <div class="of1-skeleton-card-grid">
      <div class="of1-skeleton of1-skeleton-card"></div>
      <div class="of1-skeleton of1-skeleton-card"></div>
      <div class="of1-skeleton of1-skeleton-card"></div>
    </div>
  `;
  block.appendChild(skeleton);
}

function hideSkeleton(block) {
  const skeleton = block.querySelector('.of1-skeleton-wrap');
  if (skeleton) skeleton.remove();
  const section = block.closest('.section');
  if (section) section.style.minHeight = '';
}

function renderBreadcrumb(main, topics) {
  const existing = main.querySelector('.generative-breadcrumb');
  if (existing) existing.remove();

  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'section generative-breadcrumb';
  breadcrumb.innerHTML = `<div>${topics.map((t) => `<span class="breadcrumb-item">${escHtml(t)}</span>`).join('<span class="breadcrumb-divider">/</span>')}</div>`;

  main.appendChild(breadcrumb);
}

function rewriteLinks(container, domain) {
  if (!domain) return;
  const origin = `https://${domain}`;
  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('/')) {
      a.setAttribute('href', `${origin}${href}`);
    } else if (!href.startsWith('#') && !href.startsWith('http')) {
      a.setAttribute('href', `${origin}/${href}`);
    }
  });
}

async function injectSection(sectionHtml, block, domain) {
  const tempMain = document.createElement('main');
  tempMain.innerHTML = `<div>${sectionHtml}</div>`;
  decorateMain(tempMain);
  await loadSections(tempMain);

  const sections = Array.from(tempMain.querySelectorAll(':scope > div'));
  const main = document.querySelector('main');

  // Hide the of1 section (skeleton) once first content arrives
  const of1Section = block.closest('.section');
  if (of1Section) {
    of1Section.style.display = 'none';
  }

  sections.forEach((section) => {
    section.classList.add('generated-section');
    rewriteLinks(section, domain);
    main.appendChild(section);
  });
}

function renderSuggestions(suggestions, config, block) {
  const main = document.querySelector('main');
  const existing = main.querySelectorAll('.generative-suggestions');
  existing.forEach((s) => s.classList.add('dimmed'));

  const container = document.createElement('div');
  container.className = 'section generative-suggestions';

  const inner = document.createElement('div');
  inner.className = 'suggestion-input-row';

  // "Keep exploring" header
  const header = document.createElement('div');
  header.className = 'suggestions-header';
  header.innerHTML = '<span>Keep exploring</span>';
  inner.appendChild(header);

  // Search bar
  const customInput = document.createElement('div');
  customInput.className = 'suggestion-custom';
  customInput.innerHTML = `
    <input type="text" class="suggestion-input" placeholder="Or ask your own question..." />
    <button class="suggestion-submit" aria-label="Submit">${ARROW_SVG}</button>
  `;
  inner.appendChild(customInput);

  // Suggestion chips + Start over
  const buttons = document.createElement('div');
  buttons.className = 'suggestions-buttons';
  suggestions.forEach((sug) => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.innerHTML = `<span>${escHtml(sug.label || sug.query || sug)}</span>`;
    btn.addEventListener('click', () => {
      const query = sug.query || sug.label || sug;
      // eslint-disable-next-line no-use-before-define
      generate(query, config, block, true);
    });
    buttons.appendChild(btn);
  });

  const restartBtn = document.createElement('button');
  restartBtn.className = 'suggestion-restart';
  restartBtn.innerHTML = `${RESTART_SVG}<span>Start over</span>`;
  restartBtn.addEventListener('click', () => {
    window.location.href = window.location.pathname;
  });
  buttons.appendChild(restartBtn);

  inner.appendChild(buttons);
  container.appendChild(inner);

  main.appendChild(container);

  const input = customInput.querySelector('.suggestion-input');
  const submit = customInput.querySelector('.suggestion-submit');
  const handleCustomSubmit = () => {
    const query = input.value.trim();
    if (!query || isGenerating) return;
    // eslint-disable-next-line no-use-before-define
    generate(query, config, block, true);
  };
  submit.addEventListener('click', handleCustomSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCustomSubmit();
  });
}

async function generateWithContext(config, block, context) {
  if (isGenerating) return;
  isGenerating = true;

  const of1Section = block.closest('.section');
  if (of1Section) of1Section.style.display = '';
  hideSkeleton(block);
  showSkeleton(block);
  const workerUrl = config['api-endpoint'] || DEFAULT_WORKER_URL;
  const domain = config.domain || window.location.hostname;

  try {
    const response = await fetch(`${workerUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        context: {
          browsing: context.browsing || [],
          interests: context.interests || [],
          intent: context.intent || null,
          conversationHistory: [],
        },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      // eslint-disable-next-line no-restricted-syntax
      for (const line of lines) {
        if (!line.trim()) continue; // eslint-disable-line no-continue
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'section' && parsed.html) {
            // eslint-disable-next-line no-await-in-loop
            await injectSection(parsed.html, block, domain);
          } else if (parsed.type === 'suggestions') {
            renderSuggestions(parsed.suggestions, config, block);
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message || 'Generation failed');
          }
        } catch (err) {
          if (err.message && !err.message.includes('JSON')) throw err;
        }
      }
    }

    isGenerating = false;
  } catch (err) {
    isGenerating = false;
    hideSkeleton(block);
    const errorEl = document.createElement('div');
    errorEl.className = 'of1-error';
    errorEl.innerHTML = `
      <h3>Something went wrong</h3>
      <p>${escHtml(err.message || 'Failed to generate response')}</p>
      <button class="of1-error-retry">Try again</button>
    `;
    block.appendChild(errorEl);
    errorEl.querySelector('.of1-error-retry').addEventListener('click', () => {
      errorEl.remove();
      generateWithContext(config, block, context);
    });
  }
}

async function generate(query, config, block, followUp = false) {
  if (isGenerating) return;
  isGenerating = true;

  const main = document.querySelector('main');

  const searchUI = block.querySelector('.of1-search-ui');
  if (searchUI) {
    searchUI.remove();
  }

  if (followUp) {
    // Dim previous suggestions
    main.querySelectorAll('.generative-suggestions').forEach((s) => s.classList.add('dimmed'));
    // Show breadcrumb
    renderBreadcrumb(main, conversationHistory.concat(query));
  }

  // Always show skeleton while loading
  const of1Section = block.closest('.section');
  if (of1Section) of1Section.style.display = '';
  showSkeleton(block);

  conversationHistory.push(query);
  const workerUrl = config['api-endpoint'] || DEFAULT_WORKER_URL;
  const domain = config.domain || document.querySelector('meta[name="of1-domain"]')?.content || window.location.hostname;

  try {
    const response = await fetch(`${workerUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        query,
        followUp,
        context: {
          browsing: [],
          conversationHistory: conversationHistory.slice(-5),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      // eslint-disable-next-line no-restricted-syntax
      for (const line of lines) {
        if (!line.trim()) continue; // eslint-disable-line no-continue
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'section' && parsed.html) {
            // eslint-disable-next-line no-await-in-loop
            await injectSection(parsed.html, block, domain);
          } else if (parsed.type === 'suggestions') {
            renderSuggestions(parsed.suggestions, config, block);
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message || 'Generation failed');
          }
        } catch (err) {
          if (err.message && !err.message.includes('JSON')) throw err;
        }
      }
    }

    if (!main.querySelector('.generated-section') && !main.querySelector('.generative-suggestions')) {
      const empty = document.createElement('div');
      empty.className = 'of1-empty';
      empty.innerHTML = '<p>No results generated. Try a different question.</p>';
      block.appendChild(empty);
    }

    isGenerating = false;
  } catch (err) {
    isGenerating = false;
    const errorEl = document.createElement('div');
    errorEl.className = 'of1-error';
    errorEl.innerHTML = `
      <h3>Something went wrong</h3>
      <p>${escHtml(err.message || 'Failed to generate response')}</p>
      <button class="of1-error-retry">Try again</button>
    `;
    block.appendChild(errorEl);
    errorEl.querySelector('.of1-error-retry').addEventListener('click', () => {
      errorEl.remove();
      generate(query, config, block);
    });
  }
}

async function loadSuggestionsFromAPI(workerUrl, domain) {
  try {
    const res = await fetch(`${workerUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, query: '', context: {} }),
    });
    const data = await res.json();
    return {
      title: data.title || 'What can we help you find?',
      subtitle: data.subtitle || 'Tell us what you\'re looking for.',
      placeholder: data.placeholder || 'Type your question...',
      suggestions: (data.suggestions || []).map((s) => ({
        label: s.label || s.query,
        query: s.query || s.label,
      })),
    };
  } catch (e) { /* fallback */ }
  return {
    title: 'What can we help you find?',
    subtitle: 'Tell us what you\'re looking for.',
    placeholder: 'Type your question...',
    suggestions: [],
  };
}

function renderSearchUI(block, suggestData) {
  const {
    title, subtitle, placeholder, suggestions,
  } = suggestData;
  const shuffled = [...suggestions].sort(() => Math.random() - 0.5).slice(0, 5);
  const ui = document.createElement('div');
  ui.className = 'of1-search-ui';
  ui.innerHTML = `
    <div class="of1-search-content">
      <h1 class="of1-title">${escHtml(title)}</h1>
      <p class="of1-subtitle">${escHtml(subtitle)}</p>
      <div class="of1-input-wrapper">
        <input type="text" class="of1-input" placeholder="${escHtml(placeholder)}" />
        <button class="of1-submit" aria-label="Submit">${ARROW_SVG}</button>
      </div>
      <div class="of1-chips">
        ${shuffled.map((s) => `<button class="of1-chip" data-query="${escHtml(s.query)}">${escHtml(s.label)}</button>`).join('')}
      </div>
    </div>
  `;
  block.appendChild(ui);
}

function bindSearchUI(block, config) {
  const input = block.querySelector('.of1-input');
  const submit = block.querySelector('.of1-submit');
  const chips = block.querySelectorAll('.of1-chip');

  const handleSubmit = () => {
    const query = input.value.trim();
    if (!query || isGenerating) return;
    generate(query, config, block);
  };

  submit.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const { query } = chip.dataset;
      input.value = query;
      generate(query, config, block);
    });
  });
}

export default async function decorate(block) {
  const config = readBlockConfig(block);

  if (!config['api-endpoint']) {
    config['api-endpoint'] = DEFAULT_WORKER_URL;
  }
  if (!config.domain) {
    const host = window.location.hostname;
    config.domain = document.querySelector('meta[name="domain"]')?.content
      || (host.endsWith('.aem.page') || host.endsWith('.aem.live') ? host.replace(/\.aem\.(page|live)$/, '') : host);
  }
  // If domain doesn't look like a tenant ID (branch--repo--owner), derive from hostname
  if (config.domain && !config.domain.includes('--')) {
    const host = window.location.hostname;
    if (host.endsWith('.aem.page') || host.endsWith('.aem.live')) {
      config.domain = host.replace(/\.aem\.(page|live)$/, '');
    }
  }

  if (!document.querySelector('meta[name="domain"]')) {
    const meta = document.createElement('meta');
    meta.name = 'domain';
    meta.content = config.domain;
    document.head.appendChild(meta);
  }

  block.textContent = '';

  const urlParams = new URLSearchParams(window.location.search);
  const isPersonalize = urlParams.get('personalize') === '1';

  if (isPersonalize) {
    showSkeleton(block);
    const handlePersonalize = (event) => {
      if (event.data?.type !== 'OF1_PERSONALIZE') return;
      window.removeEventListener('message', handlePersonalize);
      const { payload } = event.data;
      const context = {
        browsing: payload.pageVisits || [],
        interests: payload.interests || [],
        intent: payload.intentProfile || null,
      };
      generateWithContext(config, block, context);
    };
    window.addEventListener('message', handlePersonalize);
    window.postMessage({ type: 'OF1_REQUEST_PROFILE', domain: config.domain }, '*');
    setTimeout(() => {
      window.removeEventListener('message', handlePersonalize);
      if (!isGenerating && !document.querySelector('.generated-section')) {
        hideSkeleton(block);
        generate('Show me personalized recommendations', config, block);
      }
    }, 5000);
    return;
  }

  const suggestions = await loadSuggestionsFromAPI(config['api-endpoint'], config.domain);
  renderSearchUI(block, suggestions);
  bindSearchUI(block, config);

  const autoQuery = urlParams.get('q');
  if (autoQuery) {
    const input = block.querySelector('.of1-input');
    if (input) input.value = autoQuery;
    generate(autoQuery, config, block);
  }
}
