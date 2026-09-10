/**
 * The global control bar and the monthly notice.
 *
 * Every page declares only the controls it uses. Each control writes to the URL
 * hash and the page re-renders from there, so a control never holds state of its
 * own and any view can be shared as a link.
 */

import { strings } from './strings.js';
import { competency, familyName } from './competencies.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A labelled segmented control. */
function segmented({ label, value, options, onChange }) {
  const wrap = el('div', 'control');
  wrap.append(el('span', 'control__label', label));
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = el('button', null, option.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(option.value === value));
    button.addEventListener('click', () => {
      if (option.value !== value) onChange(option.value);
    });
    group.append(button);
  }
  wrap.append(group);
  return wrap;
}

function checkbox({ label, checked, onChange }) {
  const wrap = el('div', 'control');
  wrap.append(el('span', 'control__label', ' ')); // keeps the row baseline aligned
  const item = el('label', 'control__checkbox');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  item.append(input, el('span', null, label));
  wrap.append(item);
  return wrap;
}

/**
 * Searchable competency picker, grouped by domain then family, in ladder order.
 *
 * A native select cannot group twice or filter, so this is a combobox: a button
 * that opens a panel with a search field and a listbox. Fully keyboard driven —
 * type to filter, arrows to move, Enter to choose, Escape to close.
 */
function competencyPicker({ items, value, onChange }) {
  const wrap = el('div', 'control control--picker');
  wrap.append(el('span', 'control__label', strings.controls.competency));

  const current = items.find((i) => i.id === value);
  const button = el('button', 'picker__button', current ? current.name : strings.controls.competencyPlaceholder);
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');

  const panel = el('div', 'picker__panel');
  panel.hidden = true;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'picker__search';
  search.placeholder = strings.controls.competencyPlaceholder;
  search.setAttribute('aria-label', strings.controls.competencyPlaceholder);

  const list = el('ul', 'picker__list');
  list.setAttribute('role', 'listbox');

  let filtered = items;
  let active = Math.max(0, items.findIndex((i) => i.id === value));

  function paint() {
    list.innerHTML = '';
    if (!filtered.length) {
      list.append(el('li', 'picker__empty', strings.empty.noResults));
      return;
    }
    let lastGroup = null;
    filtered.forEach((item, index) => {
      const group = `${item.domain}|${item.family}`;
      if (group !== lastGroup) {
        lastGroup = group;
        const header = el('li', 'picker__group', item.groupLabel);
        header.setAttribute('role', 'presentation');
        list.append(header);
      }
      const option = el('li', 'picker__option', item.name);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(item.id === value));
      option.dataset.index = String(index);
      if (index === active) option.dataset.active = 'true';
      option.addEventListener('click', () => choose(item));
      list.append(option);
    });
    const activeNode = list.querySelector('[data-active="true"]');
    if (activeNode) activeNode.scrollIntoView({ block: 'nearest' });
  }

  function choose(item) {
    close();
    onChange(item.id);
  }

  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    search.value = '';
    filtered = items;
    active = Math.max(0, items.findIndex((i) => i.id === value));
    paint();
    search.focus();
  }

  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    filtered = query
      ? items.filter((i) => i.name.toLowerCase().includes(query) || i.id.includes(query))
      : items;
    active = 0;
    paint();
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      button.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      paint();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    }
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) close();
  });

  panel.append(search, list);
  wrap.append(button, panel);
  return wrap;
}

/**
 * The region every control lives in.
 *
 * On a phone the control bars are taller than the charts they filter — on
 * Distributions they pushed the first panel 1,372px down an 844px screen. So
 * below 768px the whole region collapses behind a "Filters" button that
 * summarises what is currently applied. Above that width the button is hidden
 * and the region is always open, which is why this is one component rather than
 * two layouts.
 */
export function controlsBody(root, ctx) {
  const existing = root.querySelector('.controls-region__body');
  if (existing) return existing;

  const region = el('div', 'controls-region');
  region.dataset.open = 'false';

  const toggle = el('button', 'controls-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(el('span', 'controls-toggle__label', strings.controls.filters));
  const summary = el('span', 'controls-toggle__summary');
  toggle.append(summary);

  const body = el('div', 'controls-region__body');
  body.id = 'controls-body';
  toggle.setAttribute('aria-controls', body.id);

  toggle.addEventListener('click', () => {
    const open = region.dataset.open !== 'true';
    region.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  // A one-line description of what is applied, so the collapsed state still
  // tells the reader what they are looking at.
  const parts = [];
  const state = ctx.state;
  parts.push(state.granularity === 'monthly' ? strings.controls.monthly : strings.controls.quarterly);
  if (state.domain !== 'all') {
    parts.push(state.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy);
  }
  if (!state.showDid) parts.push('DiD points hidden');
  if (state.minThreePeriods) parts.push('3+ rounds');
  if (state.hideDidOnly) parts.push('DiD-only hidden');
  if (state.competencyFilter?.length) parts.push(`${state.competencyFilter.length} selected`);
  summary.textContent = parts.join(' · ');

  region.append(toggle, body);
  root.append(region);
  return body;
}

/**
 * Build the control bar.
 *
 * @param {object} options
 *   show        which controls this page uses, e.g. ['granularity','domain','did']
 *   competencies  [{id,name,domain,family}] for the picker
 */
export function controlBar(root, ctx, { show = [], competencies = [] } = {}) {
  const bar = el('div', 'controls');
  const { state, update } = ctx;

  if (show.includes('granularity')) {
    bar.append(segmented({
      label: strings.controls.granularity,
      value: state.granularity,
      options: [
        { value: 'quarterly', label: strings.controls.quarterly },
        { value: 'monthly', label: strings.controls.monthly },
      ],
      onChange: (value) => update({ granularity: value }),
    }));
  }

  if (show.includes('domain')) {
    bar.append(segmented({
      label: strings.controls.domain,
      value: state.domain,
      options: [
        { value: 'all', label: strings.controls.domainAll },
        { value: 'literacy', label: strings.controls.literacy },
        { value: 'numeracy', label: strings.controls.numeracy },
      ],
      onChange: (value) => update({ domain: value }),
    }));
  }

  if (show.includes('competency') && competencies.length) {
    const items = competencies.map((c) => ({
      ...c,
      groupLabel: `${c.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy} — ${familyName(c.family)}`,
    }));
    bar.append(competencyPicker({
      items,
      value: state.competency,
      onChange: (id) => update({ page: 'competency', competency: id }),
    }));
  }

  if (show.includes('did')) {
    bar.append(checkbox({
      label: strings.controls.showDid,
      checked: state.showDid,
      onChange: (checked) => update({ showDid: checked }),
    }));
  }

  controlsBody(root, ctx).append(bar);
  return bar;
}

/**
 * The monthly notice. Persistent while monthly is selected, dismissible per
 * session — a district official reading month-to-month needs to know the moves
 * are mostly which schools were visited.
 */
const DISMISS_KEY = 'basti-monthly-notice-dismissed';

export function monthlyNotice(root, ctx) {
  if (ctx.state.granularity !== 'monthly') return;
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    dismissed = false; // private window, or storage blocked
  }
  if (dismissed) return;

  const notice = el('div', 'notice');
  notice.setAttribute('role', 'note');
  notice.append(el('p', null, strings.banners.monthly));
  const dismiss = el('button', 'notice__dismiss', strings.banners.dismiss);
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* nothing to remember it with; the notice simply returns next time */
    }
    notice.remove();
  });
  notice.append(dismiss);
  root.append(notice);
}

/** Page title plus optional lead paragraph. */
export function pageHeader(root, { title, intro } = {}) {
  root.append(el('h1', 'page-title', title));
  if (intro) root.append(el('p', 'page-intro', intro));
}

/** A section with a hairline, a title and a subtitle. */
export function section(root, { title, subtitle } = {}) {
  const node = el('section', 'section');
  if (title) node.append(el('h2', 'section__title', title));
  if (subtitle) node.append(el('p', 'section__subtitle', subtitle));
  root.append(node);
  return node;
}

/** Competency list shaped for the picker, in domain then ladder order. */
export function pickerItems(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!row.std_competency || seen.has(row.std_competency)) continue;
    const meta = competency(row.std_competency, { domain: row.domain });
    seen.set(row.std_competency, {
      id: row.std_competency,
      name: meta.name,
      domain: meta.domain,
      order: meta.order,
      family: row.competency_family,
    });
  }
  return [...seen.values()].sort(
    (a, b) => (a.domain === 'literacy' ? 0 : 1) - (b.domain === 'literacy' ? 0 : 1) || a.order - b.order
  );
}
