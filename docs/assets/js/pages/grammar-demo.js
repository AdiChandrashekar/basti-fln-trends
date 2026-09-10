/**
 * Phase 2 sign-off page, at #/grammar. Not linked from the rail.
 *
 * Word writing is the right subject: its quarterly series is the only one that
 * contains every state the grammar has to express — a pooled point combining
 * two instruments, two consecutive steps that are not comparable, a
 * cross-instrument step, and a clean same-test step — plus a hollow marker, a
 * gold full-marks tick and a Wilson interval. If it draws correctly here, it
 * draws correctly everywhere.
 */

import { d3 } from '../vendor.js';
import {
  load, loadTrends, periodSlots, seriesFor, segmentsFor, sourceDetails, trendPoints,
} from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { timePlot } from '../timeplot.js';
import {
  drawSeries, drawSourceSatellites, drawLatestLabel, domainColour, token,
  createTooltip, bindTooltip, tooltipContent, markerPath,
} from '../grammar.js';
import { competencyName } from '../competencies.js';
import { periodLabel, pct1, nLabel, int } from '../format.js';
import { strings } from '../strings.js';

const DEMO_COMPETENCY = 'word_writing';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A legend that names every encoding on screen. Colour never carries meaning
 * on its own here — each entry pairs a shape or a dash with its words.
 */
function legend(root) {
  const items = [
    { svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2.5"/>', label: 'Same test in both rounds' },
    { svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="8 4"/>', label: 'Different test, same skill' },
    { svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/>', label: 'Different test, task not quite the same' },
    { svg: '<circle cx="16" cy="8" r="8" fill="#fff" stroke="#DDE3EC"/><text x="16" y="12" text-anchor="middle" font-size="11" font-weight="600" fill="#4A5568">≠</text>', label: 'Not comparable, so no line is drawn' },
    { svg: `<path d="${markerPath('circle', 5)}" transform="translate(16,8)" fill="currentColor"/>`, label: 'District assessment tool' },
    { svg: `<path d="${markerPath('diamond', 5)}" transform="translate(16,8)" fill="currentColor"/>`, label: 'DiD baseline (% correct)' },
    { svg: `<path d="${markerPath('square', 5)}" transform="translate(16,8)" fill="currentColor"/>`, label: 'DiD midline' },
    { svg: `<path d="${markerPath('circle', 9)}" transform="translate(16,8)" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/><path d="${markerPath('circle', 5)}" transform="translate(16,8)" fill="currentColor"/>`, label: 'Two instruments combined' },
    { svg: `<path d="${markerPath('circle', 5)}" transform="translate(16,8)" fill="#fff" stroke="currentColor" stroke-width="2"/>`, label: 'Thin or unreported sample, or a ceiling' },
    { svg: `<path d="${markerPath('circle', 5)}" transform="translate(16,10)" fill="currentColor"/><line x1="16" y1="1" x2="16" y2="4" stroke="#FFC000" stroke-width="2.5" stroke-linecap="round"/>`, label: 'Achieving needs full marks' },
    { svg: '<rect x="2" y="0" width="28" height="16" fill="rgba(255,192,0,0.14)"/>', label: 'The latest round' },
  ];

  const wrap = el('div', 'legend');
  for (const item of items) {
    const entry = el('span', 'legend__item');
    entry.innerHTML =
      `<svg class="legend__swatch" width="32" height="16" viewBox="0 0 32 16" aria-hidden="true" ` +
      `style="color:${token('--csf-blue')}">${item.svg}</svg><span>${item.label}</span>`;
    wrap.append(entry);
  }
  root.append(wrap);
}

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows, quarterly] = await Promise.all([loadTrends(granularity), load.quarterly()]);

  const id = DEMO_COMPETENCY;
  const name = competencyName(id);
  const points = seriesFor(rows, id);
  const segments = segmentsFor(points);
  const details = sourceDetails(rows, { competency: id });
  const slots = periodSlots(rows, granularity, quarterly);
  const domain = points[0]?.domain || 'literacy';

  root.append(el('h1', 'page-title', 'Chart grammar'));
  root.append(
    el('p', 'page-intro',
      `Phase 2 sign-off. ${name} is drawn here because its series exercises every part of the ` +
      'grammar at once: a combined point, two steps that are not comparable, a cross-instrument ' +
      'step and a same-test step, plus a hollow marker, a full-marks tick and an uncertainty band.')
  );

  // --- Which state each point and step is in, stated in words ---------------
  const audit = el('section', 'section');
  audit.append(el('h2', 'section__title', 'What this chart has to show'));
  audit.append(el('p', 'section__subtitle',
    'Every row below is read straight from the pipeline columns. If one of these is wrong on ' +
    'screen, the grammar is wrong.'));
  const list = el('ul', 'prose');
  list.style.marginTop = 'var(--s-3)';
  const states = [
    ...points.map((p) => {
      const bits = [];
      if (p.is_pooled) bits.push('combined from two instruments');
      if (p.stability_flag === 'n_unknown') bits.push('sample size not reported, so hollow');
      if (p.stability_flag === 'thin') bits.push('thin sample, so hollow');
      if (p.perfect_score_required) bits.push('needs full marks, so a gold tick');
      if (p.ci95_low !== null) bits.push('has an uncertainty interval');
      return `${periodLabel(p.period, { granularity, quarterLabel: p.period_label })}: ${pct1(p.pct_students_cleared)}, ${nLabel(p.n)}${bits.length ? ` — ${bits.join('; ')}` : ''}`;
    }),
    ...segments.map((s) =>
      `${periodLabel(s.from.period, { granularity, quarterLabel: s.from.period_label })} → ` +
      `${periodLabel(s.to.period, { granularity, quarterLabel: s.to.period_label })}: ` +
      (s.connected
        ? `${strings.defensibility[s.defensibility]?.toLowerCase()}, so a ${s.defensibility === 'within_tool' ? 'solid' : 'dashed'} line`
        : 'not comparable, so no line and a ≠ glyph')),
  ];
  for (const state of states) {
    const item = el('li', null, state);
    item.style.paddingLeft = 'var(--s-4)';
    item.style.position = 'relative';
    item.style.marginTop = 'var(--s-2)';
    list.append(item);
  }
  audit.append(list);
  root.append(audit);

  // --- The chart ------------------------------------------------------------
  const chartSection = el('section', 'section');
  root.append(chartSection);

  const tableColumns = [
    { key: 'period', label: 'Round' },
    { key: 'value', label: '% achieving', num: true },
    { key: 'n', label: 'Children', num: true },
    { key: 'instrument', label: 'Instrument' },
    { key: 'basis', label: 'What the number is' },
    { key: 'change', label: 'Change from previous', num: true },
    { key: 'comparable', label: 'Comparable with previous' },
  ];
  const tableRows = points.map((p) => ({
    period: periodLabel(p.period, { granularity, quarterLabel: p.period_label }),
    value: pct1(p.pct_students_cleared),
    n: p.n === null ? strings.units.nNotReported : int(p.n),
    instrument: p.source_tool_label,
    basis: p.is_pooled ? strings.basis.pooled : strings.basis[p.metric_basis] || p.metric_basis,
    change: p.change_pp === null ? '—' : p.change_pp.toFixed(1),
    comparable: p.change_defensibility ? strings.defensibility[p.change_defensibility] : '—',
  }));

  chart({
    root: chartSection,
    title: `${name} — % achieving over time`,
    subtitle:
      'Share of children scoring 75% or more of the items on this task. The band under the axis ' +
      'shows which assessment instrument produced each round.',
    ariaLabel:
      `Line chart of ${name}, % achieving, ${points.length} rounds. ` +
      points.map((p) => `${periodLabel(p.period, { granularity, quarterLabel: p.period_label })} ${pct1(p.pct_students_cleared)}`).join(', ') +
      '. Instruments: ' + (slots.length ? '' : ''),
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns: tableColumns,
    rows: tableRows,
    height: 400,
    render({ svg, width, height, container }) {
      const { plot, x, y, bandWidth } = timePlot({
        svg, width, height, slots, granularity, yLabel: strings.site.metric,
      });

      const colour = domainColour(domain);
      const tooltip = createTooltip(container);

      // Source-detail markers sit behind, at half opacity, so a combined point
      // shows the two instruments it was built from.
      const satellites = drawSourceSatellites(plot, details.filter((d) => {
        const point = points.find((p) => p.period === d.period);
        return point && point.is_pooled;
      }), { x, y, colour });

      const series = drawSeries(plot, { points, segments, x, y, colour });
      drawLatestLabel(plot, points, { x, y, colour });

      const label = (row) => tooltipContent(row, {
        periodLabel: periodLabel(row.period, { granularity, quarterLabel: row.period_label }),
        competency: name,
      });

      bindTooltip(
        series.selectAll('.markers > g').data(points),
        tooltip, label
      );
      bindTooltip(
        satellites.selectAll('g').data(details.filter((d) => points.find((p) => p.period === d.period)?.is_pooled)),
        tooltip, label
      );
    },
  });

  legend(chartSection);

  // --- The same grammar at the other granularity ----------------------------
  const note = el('div', 'notice');
  note.append(el('p', null,
    granularity === 'monthly'
      ? 'This is the monthly view. Switch to quarterly to see the same series over five rounds.'
      : 'Add ?g=monthly to the address to see the same series drawn month by month, where the ' +
        'empty months keep their slots on the axis.'));
  chartSection.append(note);
}

export function unmount() {}
