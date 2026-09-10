/**
 * Router, navigation rail, and page lifecycle.
 *
 * Every page module exports `mount(root, ctx)` and optionally `unmount()`.
 * No page reads the URL directly and no page touches another page's DOM: the
 * router parses state, hands it over in `ctx`, and tears the previous page down.
 *
 * Page modules are imported lazily, so a visitor who only opens the Overview
 * never downloads the heatmap or distributions code.
 */

import * as state from './state.js';
import { load } from './data.js';
import { strings } from './strings.js';
import { buildDate } from './format.js';

/**
 * Rail glyphs. Each one depicts the kind of chart its page holds — a line for
 * the trend, a grid for the heatmap, a slope for changes, a stacked bar for
 * distributions, a dumbbell for the DiD comparison. They carry meaning rather
 * than decoration, which is why they earn their place on the collapsed rail.
 * They are aria-hidden: the accessible name comes from the link's text.
 */
const GLYPHS = {
  overview: '<path d="M2 14 L6 9 L10 11 L14 4" /><path d="M2 16.5 h14" opacity=".45" />',
  competency: '<path d="M2 14 L6 9 L10 11 L14 4" /><circle cx="6" cy="9" r="1.6" fill="currentColor" stroke="none" /><circle cx="14" cy="4" r="1.6" fill="currentColor" stroke="none" />',
  map: '<rect x="2" y="3" width="4" height="4" /><rect x="7.5" y="3" width="4" height="4" /><rect x="13" y="3" width="4" height="4" /><rect x="2" y="8.5" width="4" height="4" /><rect x="7.5" y="8.5" width="4" height="4" fill="currentColor" /><rect x="13" y="8.5" width="4" height="4" /><rect x="2" y="14" width="4" height="4" fill="currentColor" /><rect x="7.5" y="14" width="4" height="4" /><rect x="13" y="14" width="4" height="4" />',
  changes: '<path d="M3 5 L15 15" /><path d="M3 15 L15 8" /><circle cx="3" cy="5" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.6" fill="currentColor" stroke="none" /><circle cx="3" cy="15" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="8" r="1.6" fill="currentColor" stroke="none" />',
  distributions: '<rect x="2" y="4" width="6" height="3.5" fill="currentColor" /><rect x="8" y="4" width="9" height="3.5" /><rect x="2" y="9" width="10" height="3.5" fill="currentColor" /><rect x="12" y="9" width="5" height="3.5" /><rect x="2" y="14" width="4" height="3.5" fill="currentColor" /><rect x="6" y="14" width="11" height="3.5" />',
  did: '<path d="M5 6 H14" /><circle cx="5" cy="6" r="2.2" /><circle cx="14" cy="6" r="2.2" fill="currentColor" /><path d="M5 14 H11" /><circle cx="5" cy="14" r="2.2" /><circle cx="11" cy="14" r="2.2" fill="currentColor" />',
  methods: '<rect x="3" y="2" width="13" height="16" /><path d="M6 6.5 h7 M6 10 h7 M6 13.5 h4" opacity=".7" />',
};

const PAGES = [
  { id: 'overview', label: strings.nav.overview, short: strings.nav.short.overview, load: () => import('./pages/overview.js') },
  { id: 'competency', label: strings.nav.explorer, short: strings.nav.short.explorer, load: () => import('./pages/explorer.js') },
  { id: 'map', label: strings.nav.map, short: strings.nav.short.map, load: () => import('./pages/heatmap.js') },
  { id: 'changes', label: strings.nav.changes, short: strings.nav.short.changes, load: () => import('./pages/changes.js') },
  { id: 'distributions', label: strings.nav.distributions, short: strings.nav.short.distributions, load: () => import('./pages/distributions.js') },
  { id: 'did', label: strings.nav.did, short: strings.nav.short.did, load: () => import('./pages/did.js') },
  { id: 'methods', label: strings.nav.methods, short: strings.nav.short.methods, load: () => import('./pages/methods.js') },
];

/** Not in the rail: the build-phase acceptance pages. */
const HIDDEN_PAGES = [
  { id: 'debug', label: 'Debug', load: () => import('./pages/debug.js') },
  { id: 'grammar', label: 'Chart grammar', load: () => import('./pages/grammar-demo.js') },
];

const ALL_PAGES = [...PAGES, ...HIDDEN_PAGES];

const railEl = document.getElementById('rail');
const rootEl = document.getElementById('page-root');

let activeModule = null;
let activePageId = null;
let renderToken = 0;

// ---------------------------------------------------------------------------
// Navigation rail
// ---------------------------------------------------------------------------

function renderRail(current, manifest) {
  const navOpen = railEl.querySelector('.rail__nav')?.dataset.open === 'true';

  railEl.innerHTML = '';

  const wordmark = document.createElement('div');
  wordmark.className = 'rail__wordmark';
  // On the collapsed rail the full wordmark cannot fit without breaking mid-word,
  // so a compact mark stands in and the full title stays available to assistive tech.
  wordmark.innerHTML = `
    <div class="rail__title">${strings.site.title}</div>
    <div class="rail__subtitle">${strings.site.subtitle}</div>
    <div class="rail__mark" aria-hidden="true">G2</div>
    <span class="visually-hidden">${strings.site.title}. ${strings.site.subtitle}.</span>
  `;

  const menu = document.createElement('button');
  menu.className = 'rail__menu';
  menu.type = 'button';
  menu.textContent = strings.nav.menu;
  menu.setAttribute('aria-expanded', String(navOpen));
  wordmark.append(menu);
  railEl.append(wordmark);

  const nav = document.createElement('nav');
  nav.className = 'rail__nav';
  nav.dataset.open = String(navOpen);
  nav.setAttribute('aria-label', strings.site.title);

  const list = document.createElement('ul');
  for (const page of PAGES) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'rail__link';
    // Navigating keeps the shared controls, so switching pages does not reset
    // the granularity or domain the user has already chosen.
    link.href = state.hrefFor({ page: page.id, competency: null });
    link.title = page.label;
    // The full name is the accessible name at every width. The short label is
    // only ever a visual stand-in on the collapsed rail.
    link.setAttribute('aria-label', page.label);
    link.innerHTML = `
      <svg class="rail__glyph" viewBox="0 0 19 20" aria-hidden="true" focusable="false"
           fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round">${GLYPHS[page.id] || ''}</svg>
      <span class="rail__label">${page.label}</span>
      <span class="rail__label-short" aria-hidden="true">${page.short}</span>
    `;
    if (page.id === current.page) link.setAttribute('aria-current', 'page');
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  railEl.append(nav);

  railEl.dataset.navOpen = String(navOpen);
  menu.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    railEl.dataset.navOpen = String(open);
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? strings.nav.close : strings.nav.menu;
  });

  const footer = document.createElement('dl');
  footer.className = 'rail__footer';
  const built = manifest?.built_at ? buildDate(manifest.built_at) : '—';
  footer.innerHTML = `
    <dt>${strings.site.buildDate}</dt>
    <dd title="${strings.site.buildDate}: ${built}">${built}</dd>
  `;
  railEl.append(footer);
}

// ---------------------------------------------------------------------------
// Page lifecycle
// ---------------------------------------------------------------------------

function showError(error) {
  console.error(error);
  rootEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error';
  box.setAttribute('role', 'alert');
  const heading = document.createElement('h2');
  heading.textContent = 'Something did not load';
  const message = document.createElement('p');
  message.textContent = error?.message || String(error);
  const hint = document.createElement('p');
  hint.style.marginTop = 'var(--s-3)';
  hint.textContent =
    'If this site was just deployed, the data folder may not have been synced. ' +
    'Run scripts/sync_site_data.py and redeploy.';
  box.append(heading, message, hint);
  rootEl.append(box);
}

async function render(current) {
  const token = ++renderToken;
  const page = ALL_PAGES.find((p) => p.id === current.page) || ALL_PAGES[0];

  document.documentElement.dataset.presentation = current.presentation ? 'on' : 'off';

  const manifest = await load.manifest();
  if (token !== renderToken) return;
  renderRail(current, manifest);

  // Only tear down and re-import when the page itself changes. A control change
  // re-renders the same module in place, which keeps scroll position stable.
  if (activePageId !== page.id) {
    if (activeModule?.unmount) {
      try {
        activeModule.unmount();
      } catch (error) {
        console.warn('[main] unmount failed', error);
      }
    }
    rootEl.innerHTML = '<p class="loading">Loading…</p>';
    try {
      activeModule = await page.load();
    } catch (error) {
      showError(new Error(`Could not load the ${page.label} page: ${error.message}`));
      return;
    }
    if (token !== renderToken) return;
    activePageId = page.id;
  }

  try {
    rootEl.innerHTML = '';
    await activeModule.mount(rootEl, {
      state: current,
      manifest,
      /** Pages call this to change a control without knowing about the URL. */
      update: (patch, options) => state.update(patch, options),
      go: (pageId, options) => state.go(pageId, options),
      hrefFor: (patch) => state.hrefFor(patch),
    });
  } catch (error) {
    if (token === renderToken) showError(error);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

state.subscribe((current) => {
  render(current);
});

// Intercept in-app links so a click updates state without a full reload.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href^="#/"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  const next = state.parse(link.getAttribute('href'));
  state.update(next);
  // Moving focus to the page body keeps keyboard navigation coherent.
  document.getElementById('main')?.focus({ preventScroll: true });
});

render(state.get());
