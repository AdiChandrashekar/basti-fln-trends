/**
 * All control state lives in the URL hash, so any view can be shared as a link
 * and a link opens on exactly the same state (build brief, section 4).
 *
 * Shape:  #/page/arg?key=value&key=value
 * Examples:
 *   #/overview
 *   #/overview?g=monthly&d=literacy
 *   #/competency/word_writing?g=quarterly&family=1
 *   #/map?sort=latest&min3=1
 *
 * Keys are short because these links get pasted into review-meeting chats.
 * Defaults are never written to the hash, so a plain #/overview stays plain.
 */

const PAGES = new Set([
  'overview',
  'competency',
  'map',
  'changes',
  'distributions',
  'did',
  'methods',
  'debug',
]);

export const DEFAULTS = {
  page: 'overview',
  competency: null,
  granularity: 'quarterly', // 'quarterly' | 'monthly'
  domain: 'all',            // 'all' | 'literacy' | 'numeracy'
  showDid: true,
  showFamily: false,
  bands: 'tiers',           // 'tiers' | 'five'
  sort: 'ladder',           // 'ladder' | 'latest' | 'change'
  minThreePeriods: false,
  hideDidOnly: false,
  presentation: false,
  competencyFilter: [],     // distributions: subset of competencies to compare
};

/** Serialise a value only when it differs from its default. */
const PARAMS = {
  g: {
    key: 'granularity',
    read: (v) => (v === 'monthly' ? 'monthly' : 'quarterly'),
    write: (v) => (v === 'monthly' ? 'monthly' : null),
  },
  d: {
    key: 'domain',
    read: (v) => (v === 'literacy' || v === 'numeracy' ? v : 'all'),
    write: (v) => (v === 'all' ? null : v),
  },
  did: {
    key: 'showDid',
    read: (v) => v !== '0',
    write: (v) => (v ? null : '0'),
  },
  family: {
    key: 'showFamily',
    read: (v) => v === '1',
    write: (v) => (v ? '1' : null),
  },
  bands: {
    key: 'bands',
    read: (v) => (v === 'five' ? 'five' : 'tiers'),
    write: (v) => (v === 'five' ? 'five' : null),
  },
  sort: {
    key: 'sort',
    read: (v) => (v === 'latest' || v === 'change' ? v : 'ladder'),
    write: (v) => (v === 'ladder' ? null : v),
  },
  min3: {
    key: 'minThreePeriods',
    read: (v) => v === '1',
    write: (v) => (v ? '1' : null),
  },
  nodid: {
    key: 'hideDidOnly',
    read: (v) => v === '1',
    write: (v) => (v ? '1' : null),
  },
  present: {
    key: 'presentation',
    read: (v) => v === '1',
    write: (v) => (v ? '1' : null),
  },
  c: {
    key: 'competencyFilter',
    read: (v) => (v ? v.split(',').filter(Boolean) : []),
    write: (v) => (Array.isArray(v) && v.length ? v.join(',') : null),
  },
};

/** Parse `location.hash` into a state object. Unknown pages fall back to overview. */
export function parse(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean);

  let page = segments[0] || DEFAULTS.page;
  if (!PAGES.has(page)) {
    if (page) console.warn(`[state] Unknown page "${page}" in the URL. Showing the overview.`);
    page = DEFAULTS.page;
  }

  const state = { ...DEFAULTS, page };
  if (page === 'competency') state.competency = segments[1] ? decodeURIComponent(segments[1]) : null;

  const params = new URLSearchParams(query);
  for (const [param, spec] of Object.entries(PARAMS)) {
    if (params.has(param)) state[spec.key] = spec.read(params.get(param));
  }
  return state;
}

/** Turn a state object back into a hash string. Defaults are omitted. */
export function serialise(state) {
  const path =
    state.page === 'competency' && state.competency
      ? `competency/${encodeURIComponent(state.competency)}`
      : state.page;

  const params = new URLSearchParams();
  for (const [param, spec] of Object.entries(PARAMS)) {
    const value = spec.write(state[spec.key]);
    if (value !== null && value !== undefined) params.set(param, value);
  }
  const query = params.toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

let current = parse();
const listeners = new Set();
let suppressNextHashEvent = false;

/** The current state. Treat as read-only; use `update` to change it. */
export function get() {
  return current;
}

/**
 * Merge a patch into the state and push it to the URL.
 * @param {object} patch
 * @param {{replace?: boolean}} [options] replace: don't add a history entry
 */
export function update(patch, { replace = false } = {}) {
  const next = { ...current, ...patch };
  const hash = serialise(next);
  if (hash === window.location.hash) {
    current = next;
    notify();
    return;
  }
  suppressNextHashEvent = true;
  if (replace) {
    window.history.replaceState(null, '', hash);
  } else {
    window.history.pushState(null, '', hash);
  }
  current = next;
  notify();
}

/** Navigate to a page, keeping the shared controls (granularity, domain, DiD). */
export function go(page, { competency = null, ...patch } = {}) {
  update({ page, competency, ...patch });
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener(current);
}

window.addEventListener('hashchange', () => {
  if (suppressNextHashEvent) {
    suppressNextHashEvent = false;
    return;
  }
  current = parse();
  notify();
});

window.addEventListener('popstate', () => {
  current = parse();
  notify();
});

/** Build a shareable href without navigating, for links and buttons. */
export function hrefFor(patch) {
  return serialise({ ...current, ...patch });
}
