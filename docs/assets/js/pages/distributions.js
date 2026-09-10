/**
 * Distributions: the shape behind the percentage.
 *
 *   1. Small multiples — one panel per round, a stacked bar per competency
 *   2. Reading fluency — the same idea in correct words per minute
 *   3. Children scoring zero — a distinct policy concern, ranked on its own
 *
 * A competency at 40% achieving with most children just below the bar needs a
 * different response from one at 40% where the rest scored nothing. This page
 * is the difference between those two.
 */

import { d3 } from '../vendor.js';
import { load, loadTrends, periodSlots, bandsFor, competenciesInData } from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { token, createTooltip, bindTooltip } from '../grammar.js';
import { bandSpec, isSlideSourced, sourceLabel, BANDS, CPM_BANDS } from '../bands.js';
import { controlBar, monthlyNotice, pageHeader, section } from '../controls.js';
import { competency, familyName } from '../competencies.js';
import { strings, instrumentLabel } from '../strings.js';
import { pct, pct1, int, nLabel, periodLabel } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const ROW = 26;

/**
 * One panel: a round measured by one instrument, with a stacked bar per
 * competency. Panels are separate on purpose — the competencies differ between
 * instruments, so a single chart across rounds would invite a comparison the
 * data does not support.
 */
function panelChart(root, ctx, { panel, spec, granularity }) {
  const items = panel.items;
  if (!items.length) return;

  const columns = [
    { key: 'competency', label: 'Competency' },
    { key: 'n', label: 'Children', num: true },
    ...spec.map((s) => ({ key: s.metric, label: s.label(), num: true })),
  ];
  const rows = items.map((item) => ({
    competency: item.meta.name,
    n: item.n === null ? strings.units.nNotReported : int(item.n),
    ...Object.fromEntries(spec.map((s) => [s.metric, pct1(item.values[s.metric] ?? null)])),
  }));

  chart({
    root,
    title: `${periodLabel(panel.period, { granularity, quarterLabel: panel.periodLabel })} · ${panel.instrument}`,
    subtitle: isSlideSourced(panel.bandSource) ? strings.distributions.midlineRounded : '',
    ariaLabel:
      `Stacked bars for ${items.length} competencies in ` +
      `${periodLabel(panel.period, { granularity, quarterLabel: panel.periodLabel })}.`,
    sourceNote: sourceNoteFor('nonstacking_competency_views.csv'),
    columns,
    rows,
    height: () => items.length * ROW + 20,
    render({ svg, width, container }) {
      const margin = { top: 6, right: 12, bottom: 8, left: Math.min(200, Math.max(112, width * 0.36)) };
      const innerWidth = Math.max(30, width - margin.left - margin.right);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

      items.forEach((item, index) => {
        const cy = index * ROW;
        const link = plot.append('a')
          .attr('href', ctx.hrefFor({ page: 'competency', competency: item.id }))
          .attr('aria-label',
            `${item.meta.name}: ` +
            spec.map((s) => `${s.label()} ${pct(item.values[s.metric] ?? 0)}`).join(', ') +
            '. Open in the competency explorer.');

        link.append('text')
          .attr('x', -8).attr('y', cy + ROW / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12).attr('fill', token('--ink'))
          .text(item.meta.name.length > 26 ? `${item.meta.name.slice(0, 25)}…` : item.meta.name)
          .append('title').text(item.meta.name);

        let offset = 0;
        for (const band of spec) {
          const value = item.values[band.metric];
          if (value === null || value === undefined) continue;
          const w = x(value);
          const rect = link.append('rect')
            .attr('x', offset).attr('y', cy + 3)
            .attr('width', Math.max(0, w)).attr('height', ROW - 9)
            .attr('fill', token(band.colour));
          rect.append('title').text(`${band.label()}: ${pct1(value)}`);
          if (w > 30) {
            link.append('text')
              .attr('x', offset + w / 2).attr('y', cy + ROW / 2).attr('dy', '0.32em')
              .attr('text-anchor', 'middle').attr('font-size', 10.5).attr('font-weight', 600)
              .attr('fill', token(band.ink)).attr('pointer-events', 'none')
              .text(pct(value, { suffix: '' }));
          }
          offset += w;
        }

        bindTooltip(link, tooltip, () =>
          `<div class="tt__head">${item.meta.name}` +
          `<span class="tt__period">${periodLabel(panel.period, { granularity, quarterLabel: panel.periodLabel })} · ${panel.instrument}</span></div>` +
          `<div class="tt__value"><span class="tt__n">${nLabel(item.n)}</span></div>` +
          `<hr class="tt__rule">` +
          spec.map((s) => `<div class="tt__row">${s.label()}: <strong>${pct1(item.values[s.metric] ?? null)}</strong></div>`).join('') +
          `<hr class="tt__rule"><div class="tt__row tt__muted">${sourceLabel(panel.bandSource)}</div>`
        );
      });
    },
  });
}

/** One legend for the whole page, since every panel shares the encoding. */
function legend(root, spec) {
  const wrap = el('div', 'legend');
  for (const band of spec) {
    const item = el('span', 'legend__item');
    item.innerHTML =
      `<span class="legend__swatch" aria-hidden="true" style="display:inline-block;width:14px;height:10px;` +
      `background:${token(band.colour)}"></span><span>${band.label()}</span>`;
    wrap.append(item);
  }
  root.append(wrap);
}

// ---------------------------------------------------------------------------

function buildPanels(views, { granularity, slots, filterIds }) {
  const rows = bandsFor(views, { granularity });
  // A panel is one round measured by one instrument. Two instruments in the
  // same round get a panel each, because they tested different children.
  const byPanel = d3.group(rows, (d) => d.panel_id);
  const order = new Map(slots.map((s, i) => [s.key, i]));

  return [...byPanel]
    .map(([panelId, panelRows]) => {
      const first = panelRows[0];
      const byCompetency = d3.group(panelRows, (d) => d.std_competency);
      const items = [...byCompetency]
        .filter(([id]) => !filterIds.size || filterIds.has(id))
        // Reading-speed bands belong in the fluency section, not here.
        .filter(([, r]) => r.some((v) => v.metric.startsWith('pct_students_b') || v.metric.startsWith('pct_students_tier')))
        .map(([id, competencyRows]) => ({
          id,
          meta: competency(id, { domain: competencyRows[0].domain }),
          n: competencyRows[0].n,
          values: Object.fromEntries(competencyRows.map((r) => [r.metric, r.value])),
        }))
        .sort((a, b) =>
          (a.meta.domain === 'literacy' ? 0 : 1) - (b.meta.domain === 'literacy' ? 0 : 1) || a.meta.order - b.meta.order);
      return {
        panelId,
        period: first.period,
        periodLabel: slots.find((s) => s.key === first.period)?.label,
        instrument: instrumentLabel({ source_tools: [first.source_tool] }),
        bandSource: first.band_source,
        sortKey: order.get(first.period) ?? 99,
        items,
      };
    })
    .filter((panel) => panel.items.length)
    .sort((a, b) => a.sortKey - b.sortKey || a.instrument.localeCompare(b.instrument));
}

/** Reading-speed panels: ORF everywhere, plus the End of Year timed measures. */
function fluencySection(root, ctx, { views, granularity, slots }) {
  // Every timed measure is a literacy task, so numeracy has nothing to show here.
  if (ctx.state.domain === 'numeracy') return;
  const rows = bandsFor(views, { granularity }).filter((r) => r.metric.startsWith('pct_students_cpm_'));
  if (!rows.length) return;

  const wrap = section(root, { title: strings.distributions.fluencyTitle, subtitle: strings.distributions.fluencySubtitle });
  const byPanel = d3.group(rows, (d) => d.panel_id);
  const order = new Map(slots.map((s, i) => [s.key, i]));

  const panels = [...byPanel]
    .map(([panelId, panelRows]) => {
      const first = panelRows[0];
      const byCompetency = d3.group(panelRows, (d) => d.std_competency);
      return {
        panelId,
        period: first.period,
        periodLabel: slots.find((s) => s.key === first.period)?.label,
        instrument: instrumentLabel({ source_tools: [first.source_tool] }),
        bandSource: first.band_source,
        sortKey: order.get(first.period) ?? 99,
        items: [...byCompetency].map(([id, competencyRows]) => ({
          id,
          meta: competency(id, { domain: 'literacy' }),
          n: competencyRows[0].n,
          values: Object.fromEntries(competencyRows.map((r) => [r.metric, r.value])),
        })).sort((a, b) => a.meta.order - b.meta.order),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);

  const grid = el('div', 'panel-grid');
  for (const panel of panels) {
    const cell = el('div', 'panel-grid__item');
    panelChart(cell, ctx, { panel, spec: CPM_BANDS, granularity });
    grid.append(cell);
  }
  wrap.append(grid);
  legend(wrap, CPM_BANDS);

  const note = el('p', 'section__subtitle');
  note.textContent = 'The 45–59 and 60+ bands together are the share reading at or above the Grade 2 benchmark.';
  wrap.append(note);
}

/**
 * Children scoring zero, in each competency's latest round.
 *
 * Kept separate from the panels because it answers a different question. A
 * child at zero has not started the task; a child just below the bar nearly
 * finished it. Ranking them together would blur that.
 */
function zeroSection(root, ctx, { views, granularity, slots }) {
  const rows = bandsFor(views, { granularity }).filter((r) => r.metric === 'pct_students_b1_0');
  if (!rows.length) return;

  const order = new Map(slots.map((s, i) => [s.key, i]));
  const latest = new Map();
  for (const row of rows) {
    const rank = order.get(row.period) ?? -1;
    const held = latest.get(row.std_competency);
    if (!held || rank > held.rank) latest.set(row.std_competency, { row, rank });
  }

  const items = [...latest.values()]
    .map(({ row }) => ({
      id: row.std_competency,
      meta: competency(row.std_competency, { domain: row.domain }),
      value: row.value,
      n: row.n,
      period: row.period,
      periodLabel: slots.find((s) => s.key === row.period)?.label,
      instrument: instrumentLabel({ source_tools: [row.source_tool] }),
      bandSource: row.band_source,
    }))
    .filter((item) => item.value !== null)
    .filter((item) => ctx.state.domain === 'all' || item.meta.domain === ctx.state.domain)
    .sort((a, b) => b.value - a.value);

  if (!items.length) return;

  const wrap = section(root, { title: strings.distributions.zeroTitle, subtitle: strings.distributions.zeroSubtitle });

  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Ranked bars of the share of children scoring zero, highest first: ` +
      items.slice(0, 6).map((i) => `${i.meta.name} ${pct(i.value)}`).join(', ') + '.',
    sourceNote: sourceNoteFor('nonstacking_competency_views.csv'),
    columns: [
      { key: 'competency', label: 'Competency' },
      { key: 'zero', label: 'Scored zero (%)', num: true },
      { key: 'round', label: 'Latest round' },
      { key: 'instrument', label: 'Instrument' },
      { key: 'n', label: 'Children', num: true },
    ],
    rows: items.map((i) => ({
      competency: i.meta.name,
      zero: pct1(i.value),
      round: periodLabel(i.period, { granularity, quarterLabel: i.periodLabel }),
      instrument: i.instrument,
      n: i.n === null ? strings.units.nNotReported : int(i.n),
    })),
    height: () => items.length * 22 + 40,
    render({ svg, width, container }) {
      const margin = { top: 4, right: 60, bottom: 26, left: Math.min(230, Math.max(150, width * 0.28)) };
      const innerWidth = Math.max(30, width - margin.left - margin.right);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

      items.forEach((item, index) => {
        const cy = index * 22;
        const link = plot.append('a')
          .attr('href', ctx.hrefFor({ page: 'competency', competency: item.id }))
          .attr('aria-label', `${item.meta.name}: ${pct(item.value)} of children scored zero. Open in the competency explorer.`);

        link.append('text')
          .attr('x', -10).attr('y', cy + 11).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12.8).attr('fill', token('--ink'))
          .text(item.meta.name.length > 30 ? `${item.meta.name.slice(0, 29)}…` : item.meta.name)
          .append('title').text(item.meta.name);

        link.append('rect')
          .attr('x', 0).attr('y', cy + 4).attr('width', Math.max(1, x(item.value))).attr('height', 14)
          .attr('fill', token('--band-1-zero'));

        link.append('text')
          .attr('x', x(item.value) + 8).attr('y', cy + 11).attr('dy', '0.32em')
          .attr('font-size', 12).attr('font-weight', 600).attr('fill', token('--ink'))
          .text(pct(item.value));

        bindTooltip(link, tooltip, () =>
          `<div class="tt__head">${item.meta.name}` +
          `<span class="tt__period">${periodLabel(item.period, { granularity, quarterLabel: item.periodLabel })} · ${item.instrument}</span></div>` +
          `<div class="tt__value"><strong>${pct1(item.value)}</strong><span class="tt__unit">scored zero</span>` +
          `<span class="tt__n">${nLabel(item.n)}</span></div>` +
          `<hr class="tt__rule"><div class="tt__row tt__muted">${sourceLabel(item.bandSource)}</div>`
        );
      });

      const axis = plot.append('g').attr('transform', `translate(0,${items.length * 22 + 4})`);
      axis.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke', token('--rule'));
      for (const tick of [0, 25, 50, 75, 100]) {
        axis.append('text')
          .attr('x', x(tick)).attr('y', 15).attr('text-anchor', 'middle')
          .attr('font-size', 12).attr('fill', token('--slate')).text(`${tick}%`);
      }
    },
  });
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows, quarterlyRows] = await Promise.all([loadTrends(granularity), load.quarterly()]);

  pageHeader(root, { title: strings.distributions.title, intro: strings.distributions.subtitle });
  controlBar(root, ctx, { show: ['granularity', 'domain'] });

  // Band detail toggle plus a competency filter, both specific to this page.
  const extra = el('div', 'controls controls--secondary');
  const detailWrap = el('div', 'control');
  detailWrap.append(el('span', 'control__label', 'Detail'));
  const toggle = el('div', 'segmented');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Band detail');
  for (const [value, label] of [['tiers', strings.explorer.tiers], ['five', strings.explorer.fiveBands]]) {
    const button = el('button', null, label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(ctx.state.bands === value));
    button.addEventListener('click', () => ctx.update({ bands: value }));
    toggle.append(button);
  }
  detailWrap.append(toggle);
  extra.append(detailWrap);
  root.append(extra);
  monthlyNotice(root, ctx);

  const views = await load.views();
  if (ctx.signal?.aborted) return;
  if (!views) {
    root.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  const slots = periodSlots(rows, granularity, quarterlyRows).filter((s) => s.hasData);
  const available = competenciesInData(quarterlyRows);

  // Competency filter: comma-separated in the URL, so a comparison is shareable.
  const filterIds = new Set(ctx.state.competencyFilter.filter((id) => available.some((c) => c.id === id)));

  const filterWrap = el('div', 'filter-chips');
  filterWrap.append(el('span', 'control__label', 'Compare competencies'));
  const chips = el('div', 'filter-chips__list');
  for (const item of available) {
    if (ctx.state.domain !== 'all' && item.domain !== ctx.state.domain) continue;
    const chip = el('button', 'chip', item.name);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(filterIds.has(item.id)));
    chip.addEventListener('click', () => {
      const next = new Set(filterIds);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      ctx.update({ competencyFilter: [...next] });
    });
    chips.append(chip);
  }
  filterWrap.append(chips);
  if (filterIds.size) {
    const clear = el('button', 'chip chip--clear', `${strings.controls.reset} (${filterIds.size} selected)`);
    clear.type = 'button';
    clear.addEventListener('click', () => ctx.update({ competencyFilter: [] }));
    filterWrap.append(clear);
  }
  root.append(filterWrap);

  const spec = bandSpec({ detail: ctx.state.bands });
  const panels = buildPanels(views, { granularity, slots, filterIds })
    .filter((panel) => ctx.state.domain === 'all' || panel.items.some((i) => i.meta.domain === ctx.state.domain))
    .map((panel) => ({
      ...panel,
      items: panel.items.filter((i) => ctx.state.domain === 'all' || i.meta.domain === ctx.state.domain),
    }));

  const panelSection = section(root, {});
  if (!panels.length) {
    panelSection.append(el('p', 'empty-state', strings.empty.noResults));
  } else {
    const grid = el('div', 'panel-grid');
    for (const panel of panels) {
      const cell = el('div', 'panel-grid__item');
      panelChart(cell, ctx, { panel, spec, granularity });
      grid.append(cell);
    }
    panelSection.append(grid);
    legend(panelSection, spec);
  }

  fluencySection(root, ctx, { views, granularity, slots });
  zeroSection(root, ctx, { views, granularity, slots });
}

export function unmount() {}
