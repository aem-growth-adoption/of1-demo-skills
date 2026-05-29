/**
 * Loads the template-specific header fragment from the code bus.
 * Each overlay-controlled page sets main.dataset.overlay = <template>
 * during loadEager; we read it here to pick the right fragment.
 * Fragments live at /fragments/<template>/header.html.
 * Falls back to prototype-home for non-overlay pages (e.g. OF1 page).
 */
export default async function decorate(block) {
  const template = document.querySelector('main')?.dataset?.overlay || 'prototype-home';
  const path = `/fragments/${template}/header.html`;
  const resp = await fetch(`${window.hlx.codeBasePath}${path}`);
  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[header] fragment not found at ${path}`);
    return;
  }
  block.innerHTML = await resp.text();

  // Load template CSS for non-overlay pages so header styling works
  if (!document.querySelector('main')?.dataset?.overlay) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${window.hlx.codeBasePath}/styles/prototype-home.css`;
    document.head.appendChild(link);
  }
}
