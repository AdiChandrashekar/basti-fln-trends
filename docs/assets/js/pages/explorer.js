/**
 * Competency explorer: a deep look at one competency.
 *
 *   1. the trend, with the full grammar and the instrument ribbon
 *   2. a plain-text facts panel beside it
 *   3. how children were distributed in each round
 *   4. where this competency sat among everything tested in the same round
 *   5. for oral reading fluency, reading speed against the 45 cpm benchmark
 */

import { d3 } from '../vendor.js';
import {
  load, loadTrends, periodSlots, seriesFor, segmentsFor, sourceDetails,
  referencePoints, referenceLinks, competenciesInData, bandsFor, standingFor,
} from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { timePlot } from '../timeplot.js';
import {
  drawSeries, drawSourceSatellites, drawEndLabels, drawReferencePoints, drawMarker,
  token, domainColour, createTooltip, bindTooltip, tooltipContent, drawGrid,
  drawGrammarLegend,
} from '../grammar.js';
import { controlBar, monthlyNotice, section, pickerItems } from '../controls.js';
import { competency, competencyName, allCompetencies, familyName } from '../competencies.js';
import { strings, flagText, instrumentLabel, sortInstruments } from '../strings.js';
import { pct, pct1, cpm, int, nLabel, changePoints, changeGlyph, changeDirection, periodLabel, isMissing, list } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const TIERS = [
  { metric: 'pct_students_tier_critical', label: 'distributions.tierCritical', colour: '--tier-critical' },
  { metric: 'pct_students_tier_developing', label: 'distributions.tierDeveloping', colour: '--tier-developing' },
  { metric: 'pct_students_tier_cleared', label: 'distributions.tierAchieving', colour: '--tier-achieving' },
];

const BANDS = [
  { metric: 'pct_students_b1_0', label: 'distributions.bandZero', colour: '--band-1-zero' },
  { metric: 'pct_students_b2_lt25', label: 'distributions.bandLt25', colour: '--band-2-lt25' },
  { metric: 'pct_students_b3_25_50', label: 'distributions.band25', colour: '--band-3-25-50' },
  { metric: 'pct_students_b4_50_75', label: 'distributions.band50', colour: '--band-4-50-75' },
  { metric: 'pct_students_b5_75plus', label: 'distributions.band75', colour: '--band-5-75plus' },
];

const CPM_BANDS = ['0', '1-15', '16-29', '30-44', '45-59', '60+'].map((label, i) => ({
  metric: `pct_students_cpm_${label}`,
  label: label === '0' ? 'Zero' : `${label} cpm`,
  colour: ['--band-1-zero', '--band-2-lt25', '--band-3-25-50', '--band-4-50-75', '--band-5-75plus', '--csf-navy'][i],
}));

const dotted = (path, obj) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

// ---------------------------------------------------------------------------
// Facts panel
// ---------------------------------------------------------------------------

function factsPanel(root, { id, meta, points, details, references, granularity }) {
  const panel = el('aside', 'facts');
  panel.append(el('h3', 'facts__title', strings.explorer.factsTitle));

  const rows = [];
  // List individual instruments, not composite labels: a period measured by two
  // tools would otherwise appear three times, once combined and once each.
  const tools = sortInstruments(new Set([...points, ...details, ...references].flatMap((r) => r.source_tools)));
  rows.push([
    strings.explorer.measuredBy,
    list(tools.map((tool) => instrumentLabel({ source_tools: [tool] }))),
  ]);

  const rules = [...new Set(points.map((p) => p.clearance_rule).filter(Boolean))]
    .map((r) => r.replace(/>=/g, '≥').replace(/<=/g, '≤'));
  if (rules.length) rows.push([strings.explorer.clearanceRule, rules.join('; ')]);

  const ns = points.map((p) => p.n).filter((n) => n !== null);
  rows.push([
    strings.explorer.sampleRange,
    ns.length
      ? (Math.min(...ns) === Math.max(...ns) ? int(ns[0]) : `${int(Math.min(...ns))} to ${int(Math.max(...ns))}`)
      : strings.units.nNotReported,
  ]);

  const stacking = points[0]?.stacking_status;
  if (stacking) rows.push([strings.explorer.comparability, strings.comparability[stacking] || stacking]);

  const latest = points.at(-1);
  if (latest) {
    rows.push([
      strings.explorer.latestValue,
      `${pct1(latest.pct_students_cleared)} in ${periodLabel(latest.period, { granularity, quarterLabel: latest.period_label })}`,
    ]);
  }

  // The most recent same-test change: the only change worth quoting on its own.
  const withinTool = [...points].reverse().find((p) => p.change_defensibility === 'within_tool');
  if (withinTool) {
    rows.push([
      strings.explorer.latestChange,
      `${changeGlyph(withinTool.change_pp)} ${changePoints(withinTool.change_pp)}, ` +
      `${periodLabel(withinTool.prev_period, { granularity })} to ${periodLabel(withinTool.period, { granularity, quarterLabel: withinTool.period_label })}`,
    ]);
  }

  const dl = el('dl', 'facts__list');
  for (const [term, value] of rows) {
    dl.append(el('dt', null, term));
    dl.append(el('dd', null, value));
  }
  panel.append(dl);

  const flags = [...new Set(points.flatMap((p) => p.reliability_flags))].filter((f) => f !== 'no_clearance_value');
  if (flags.length) {
    panel.append(el('h4', 'facts__subtitle', strings.explorer.activeFlags));
    const ul = el('ul', 'facts__flags');
    for (const flag of flags) ul.append(el('li', null, flagText(flag)));
    panel.append(ul);
  }

  root.append(panel);
}

// ---------------------------------------------------------------------------
// Main trend chart
// ---------------------------------------------------------------------------

function trendChart(root, ctx, { id, meta, rows, slots, granularity }) {
  const points = seriesFor(rows, id, { showDid: ctx.state.showDid });
  const segments = segmentsFor(points);
  const details = sourceDetails(rows, { competency: id, showDid: ctx.state.showDid });
  const references = referencePoints(rows, { competency: id, showDid: ctx.state.showDid });
  const colour = domainColour(meta.domain);

  // Companion lines: other members of the same family, off by default. They
  // share the panel but are never joined to this competency's line.
  const family = points[0]?.competency_family || rows.find((r) => r.std_competency === id)?.competency_family;
  const familyIds = ctx.state.showFamily && family
    ? [...new Set(rows.filter((r) => r.competency_family === family && r.std_competency !== id).map((r) => r.std_competency))]
    : [];

  const columns = [
    { key: 'period', label: 'Round' },
    { key: 'value', label: '% achieving', num: true },
    { key: 'n', label: 'Children', num: true },
    { key: 'instrument', label: 'Instrument' },
    { key: 'basis', label: 'What the number is' },
    { key: 'change', label: 'Change from previous', num: true },
    { key: 'comparable', label: 'Comparable with previous' },
  ];
  const tableRows = [...points, ...references].map((p) => ({
    period: periodLabel(p.period, { granularity, quarterLabel: p.period_label }),
    value: pct1(p.pct_students_cleared),
    n: p.n === null ? strings.units.nNotReported : int(p.n),
    instrument: instrumentLabel(p),
    basis: p.row_type === 'reference_point'
      ? `${strings.reference.label} — beside the line, not on it`
      : (p.is_pooled ? strings.basis.pooled : strings.basis[p.metric_basis] || p.metric_basis),
    change: p.change_pp === null || p.change_pp === undefined ? '—' : p.change_pp.toFixed(1),
    comparable: p.change_defensibility ? strings.defensibility[p.change_defensibility] : '—',
  }));

  if (!points.length) {
    root.append(el('p', 'empty-state', `${meta.name}: ${strings.empty.noRounds.replace('{competency}', meta.name)}`));
    return;
  }

  chart({
    root,
    title: `${meta.name} — ${strings.explorer.chartTitle}`,
    subtitle: strings.site.metricDefinition,
    ariaLabel:
      `Line chart of ${meta.name}, % achieving, ${points.length} rounds: ` +
      points.map((p) => `${periodLabel(p.period, { granularity, quarterLabel: p.period_label })} ${pct(p.pct_students_cleared)}`).join(', ') + '.',
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns,
    rows: tableRows,
    height: (width) => (width < 560 ? 320 : 380),
    render({ svg, width, height, container }) {
      const { plot, x, y, narrow } = timePlot({ svg, width, height, slots, granularity, yLabel: strings.site.metric });
      const tooltip = createTooltip(container);

      // Companions first, behind, so the subject reads as the subject.
      for (const otherId of familyIds) {
        const otherPoints = seriesFor(rows, otherId, { showDid: ctx.state.showDid });
        if (!otherPoints.length) continue;
        const otherMeta = competency(otherId, { domain: meta.domain });
        const group = drawSeries(plot, {
          points: otherPoints,
          segments: segmentsFor(otherPoints),
          x, y,
          colour: token('--change-flat'),
          showCI: false,
          emphasis: 'companion',
        });
        bindTooltip(group.selectAll('.markers > g').data(otherPoints), tooltip, (row) =>
          tooltipContent(row, {
            periodLabel: periodLabel(row.period, { granularity, quarterLabel: row.period_label }),
            competency: otherMeta.name,
          })
        );
        drawEndLabels(plot, [{ point: otherPoints.at(-1), colour: token('--slate'), name: otherMeta.name }], { x, y, narrow });
      }

      if (references.length) {
        const refs = drawReferencePoints(plot, referenceLinks(points, references), { x, y });
        bindTooltip(refs.markers.selectAll('g').data(references), tooltip, (row) =>
          tooltipContent(row, {
            periodLabel: periodLabel(row.period, { granularity, quarterLabel: row.period_label }),
            competency: meta.name,
          })
        );
      }

      const satelliteRows = details.filter((d) => points.find((p) => p.period === d.period)?.is_pooled);
      const satellites = drawSourceSatellites(plot, satelliteRows, { x, y, colour });

      const series = drawSeries(plot, { points, segments, x, y, colour });
      drawEndLabels(plot, [{ point: points.at(-1), colour }], { x, y });

      const label = (row) => tooltipContent(row, {
        periodLabel: periodLabel(row.period, { granularity, quarterLabel: row.period_label }),
        competency: meta.name,
      });
      bindTooltip(series.selectAll('.markers > g').data(points), tooltip, label);
      bindTooltip(satellites.selectAll('g').data(satelliteRows), tooltip, label);
    },
  });

  drawGrammarLegend(root, { points, segments, references, colour });

  if (family) {
    const toggle = el('label', 'control__checkbox');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = ctx.state.showFamily;
    input.addEventListener('change', () => ctx.update({ showFamily: input.checked }));
    toggle.append(input, el('span', null, strings.explorer.showFamily));
    root.append(toggle);
    if (ctx.state.showFamily && familyIds.length) {
      root.append(el('p', 'section__subtitle', strings.explorer.familyNote));
    }
  }
}

// ---------------------------------------------------------------------------
// Distribution strip
// ---------------------------------------------------------------------------

function distributionStrip(root, ctx, { id, meta, views, slots, granularity, isCpm }) {
  const rows = bandsFor(views, { granularity, competency: id });
  if (!rows.length) return;

  const spec = isCpm ? CPM_BANDS : (ctx.state.bands === 'five' ? BANDS : TIERS);
  const wanted = new Set(spec.map((s) => s.metric));
  const byPanel = d3.group(rows.filter((r) => wanted.has(r.metric)), (d) => d.period);

  const panels = slots
    .filter((slot) => byPanel.has(slot.key))
    .map((slot) => {
      const panelRows = byPanel.get(slot.key);
      const values = spec.map((s) => ({
        ...s,
        label: dotted(s.label, strings) || s.label,
        value: panelRows.find((r) => r.metric === s.metric)?.value ?? null,
      }));
      const source = panelRows[0];
      return { slot, values, n: source?.n ?? null, bandSource: source?.band_source || '' };
    })
    .filter((p) => p.values.some((v) => v.value !== null));

  if (!panels.length) return;

  const wrap = section(root, {
    title: strings.explorer.distributionTitle,
    subtitle: strings.explorer.distributionSubtitle,
  });

  if (!isCpm) {
    const toggle = el('div', 'segmented');
    toggle.setAttribute('role', 'group');
    for (const [value, labelKey] of [['tiers', 'tiers'], ['five', 'fiveBands']]) {
      const button = el('button', null, strings.explorer[labelKey]);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(ctx.state.bands === value));
      button.addEventListener('click', () => ctx.update({ bands: value }));
      toggle.append(button);
    }
    wrap.append(toggle);
  }

  const columns = [
    { key: 'period', label: 'Round' },
    { key: 'n', label: 'Children', num: true },
    ...spec.map((s) => ({ key: s.metric, label: dotted(s.label, strings) || s.label, num: true })),
    { key: 'source', label: 'Where the bands come from' },
  ];
  const tableRows = panels.map((p) => ({
    period: periodLabel(p.slot.key, { granularity, quarterLabel: p.slot.label }),
    n: p.n === null ? strings.units.nNotReported : int(p.n),
    ...Object.fromEntries(p.values.map((v) => [v.metric, pct1(v.value)])),
    source: p.bandSource.startsWith('slide_chart') ? strings.distributions.midlineRounded : 'Children’s own scores',
  }));

  const ROW = 30;
  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Stacked bars showing how children were distributed on ${meta.name} in ${panels.length} rounds.`,
    sourceNote: sourceNoteFor('nonstacking_competency_views.csv'),
    columns,
    rows: tableRows,
    height: () => panels.length * ROW + 16,
    render({ svg, width, container }) {
      const margin = { top: 6, right: 16, bottom: 30, left: Math.min(190, Math.max(120, width * 0.22)) };
      const innerWidth = Math.max(10, width - margin.left - margin.right);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

      panels.forEach((panel, index) => {
        const cy = index * ROW;
        plot.append('text')
          .attr('x', -10).attr('y', cy + ROW / 2).attr('dy', '0.32em')
          .attr('text-anchor', 'end').attr('font-size', 12.8).attr('fill', token('--ink'))
          .text(periodLabel(panel.slot.key, { granularity, quarterLabel: panel.slot.label }));

        let offset = 0;
        for (const value of panel.values) {
          if (value.value === null) continue;
          const segWidth = x(value.value);
          const bar = plot.append('g').attr('tabindex', 0).attr('role', 'button');
          bar.append('rect')
            .attr('x', offset).attr('y', cy + 4)
            .attr('width', Math.max(0, segWidth)).attr('height', ROW - 12)
            .attr('fill', token(value.colour));
          // Print the number in the band when it is wide enough to hold it.
          if (segWidth > 34) {
            bar.append('text')
              .attr('x', offset + segWidth / 2).attr('y', cy + ROW / 2).attr('dy', '0.32em')
              .attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 600)
              .attr('fill', ['--band-3-25-50', '--tier-developing'].includes(value.colour) ? token('--ink') : token('--paper'))
              .text(pct(value.value));
          }
          bar.append('title').text(`${value.label}: ${pct1(value.value)}`);
          bindTooltip(bar, tooltip, () =>
            `<div class="tt__head">${meta.name}<span class="tt__period">${periodLabel(panel.slot.key, { granularity, quarterLabel: panel.slot.label })}</span></div>` +
            `<div class="tt__value"><strong>${pct1(value.value)}</strong><span class="tt__unit">${value.label}</span>` +
            `<span class="tt__n">${nLabel(panel.n)}</span></div>` +
            (panel.bandSource.startsWith('slide_chart')
              ? `<hr class="tt__rule"><div class="tt__row tt__muted">${strings.distributions.midlineRounded}</div>` : '')
          );
          offset += segWidth;
        }
      });

      // The legend is HTML rather than SVG, below, so it wraps on a narrow
      // screen instead of running off the edge of the chart.
    },
  });

  const legendWrap = el('div', 'legend');
  for (const value of panels[0].values) {
    const entry = el('span', 'legend__item');
    entry.innerHTML =
      `<span aria-hidden="true" style="display:inline-block;width:14px;height:10px;` +
      `background:${token(value.colour)}"></span><span>${value.label}</span>`;
    legendWrap.append(entry);
  }
  wrap.append(legendWrap);
}

// ---------------------------------------------------------------------------
// Relative standing
// ---------------------------------------------------------------------------

function standingStrip(root, { id, meta, views, granularity }) {
  const rows = standingFor(views, {
    granularity, competency: id, scope: meta.domain, metric: 'percentile_within_panel',
  });
  if (!rows.length) return;

  const ranks = standingFor(views, { granularity, competency: id, scope: meta.domain, metric: 'rank_within_panel' });
  const rankOf = new Map(ranks.map((r) => [r.panel_id, r.value]));

  const panels = rows
    .slice()
    .sort((a, b) => d3.ascending(a.period, b.period))
    .map((r) => ({
      panelId: r.panel_id,
      period: r.period,
      sourceTool: r.source_tool,
      percentile: r.value,
      rank: rankOf.get(r.panel_id) ?? null,
      total: r.panel_n_competencies,
    }));

  const wrap = section(root, {
    title: strings.explorer.standingTitle,
    subtitle: strings.explorer.standingSubtitle,
  });

  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Where ${meta.name} sat among the other ${meta.domain} competencies tested in each round, ` +
      panels.map((p) => `${p.period}: ${Math.round(p.percentile)} out of 100`).join(', ') + '.',
    sourceNote: sourceNoteFor('nonstacking_competency_views.csv'),
    columns: [
      { key: 'period', label: 'Round' },
      { key: 'instrument', label: 'Instrument' },
      { key: 'percentile', label: 'Standing (0–100)', num: true },
      { key: 'rank', label: 'Rank in that round' },
    ],
    rows: panels.map((p) => ({
      period: periodLabel(p.period, { granularity }),
      instrument: instrumentLabel({ source_tools: [p.sourceTool] }),
      percentile: pct1(p.percentile).replace('%', ''),
      rank: p.rank === null ? '—' : `${p.rank} of ${p.total}`,
    })),
    height: () => 150,
    render({ svg, width, container }) {
      const margin = { top: 12, right: 24, bottom: 40, left: 62 };
      const innerWidth = Math.max(10, width - margin.left - margin.right);
      const innerHeight = 150 - margin.top - margin.bottom;
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);

      const x = d3.scalePoint().domain(panels.map((p) => p.panelId)).range([0, innerWidth]).padding(0.5);
      const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

      plot.append('rect').attr('width', innerWidth).attr('height', innerHeight).attr('fill', token('--mist'));
      drawGrid(plot, y, innerWidth);
      for (const value of [0, 50, 100]) {
        plot.append('text')
          .attr('x', -10).attr('y', y(value)).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12).attr('fill', token('--slate'))
          .text(value === 0 ? 'Lowest' : value === 100 ? 'Highest' : '50');
      }

      for (const panel of panels) {
        const cx = x(panel.panelId);
        // Separate dots, never joined: each round is its own comparison group.
        plot.append('circle')
          .attr('cx', cx).attr('cy', y(panel.percentile)).attr('r', 5)
          .attr('fill', domainColour(meta.domain))
          .attr('tabindex', 0).attr('role', 'button');
        plot.append('text')
          .attr('x', cx).attr('y', innerHeight + 16).attr('text-anchor', 'middle')
          .attr('font-size', 11).attr('fill', token('--slate'))
          .text(periodLabel(panel.period, { granularity }));
        plot.append('text')
          .attr('x', cx).attr('y', innerHeight + 30).attr('text-anchor', 'middle')
          .attr('font-size', 10).attr('fill', token('--change-flat'))
          .text(panel.rank === null ? '' : `${panel.rank} of ${panel.total}`);
      }

      bindTooltip(plot.selectAll('circle').data(panels), tooltip, (panel) =>
        `<div class="tt__head">${meta.name}<span class="tt__period">${periodLabel(panel.period, { granularity })}</span></div>` +
        `<div class="tt__value"><strong>${Math.round(panel.percentile)}</strong>` +
        `<span class="tt__unit">out of 100, among ${meta.domain} tasks in this round</span></div>` +
        (panel.rank !== null ? `<hr class="tt__rule"><div class="tt__row">Ranked ${panel.rank} of ${panel.total}</div>` : '')
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Oral reading fluency: speed against the benchmark
// ---------------------------------------------------------------------------

function fluencyChart(root, { id, meta, rows, slots, granularity, didRows }) {
  const speeds = rows
    .filter((r) => r.std_competency === id && r.row_type !== 'source_detail' && !isMissing(r.mean_cpm))
    .sort((a, b) => d3.ascending(a.period_sort, b.period_sort));
  const details = rows.filter((r) => r.std_competency === id && r.row_type === 'source_detail' && !isMissing(r.mean_cpm));
  const all = [...speeds, ...details.filter((d) => !speeds.some((s) => s.period === d.period && s.source_tool === d.source_tool))]
    .sort((a, b) => d3.ascending(a.period_sort, b.period_sort));
  if (!all.length) return;

  const BENCHMARK = 45;
  const maxSpeed = Math.max(BENCHMARK, ...all.map((r) => r.mean_cpm)) * 1.15;

  const wrap = section(root, { title: strings.explorer.orfTitle, subtitle: strings.explorer.orfSubtitle });

  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Average correct words per minute across ${all.length} rounds, against the 45 cpm benchmark: ` +
      all.map((r) => `${periodLabel(r.period, { granularity, quarterLabel: r.period_label })} ${cpm(r.mean_cpm)}`).join(', ') + '.',
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns: [
      { key: 'period', label: 'Round' },
      { key: 'instrument', label: 'Instrument' },
      { key: 'speed', label: 'Correct words per minute', num: true },
    ],
    rows: all.map((r) => ({
      period: periodLabel(r.period, { granularity, quarterLabel: r.period_label }),
      instrument: instrumentLabel(r),
      speed: r.mean_cpm.toFixed(1),
    })),
    height: () => 300,
    render({ svg, width, height, container }) {
      const { plot, x, y } = timePlot({
        svg, width, height, slots, granularity,
        yLabel: 'Correct words per minute', yMax: Math.ceil(maxSpeed / 10) * 10,
      });
      const tooltip = createTooltip(container);
      const colour = domainColour(meta.domain);

      // The benchmark is the point of this chart, so it is drawn as a labelled
      // reference line rather than left to the reader to find on the axis.
      plot.append('line')
        .attr('x1', 0).attr('x2', x.range()[1])
        .attr('y1', y(BENCHMARK)).attr('y2', y(BENCHMARK))
        .attr('stroke', token('--tier-critical')).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6 3');
      // The label sits just above the line inside the plot rather than out in
      // the right margin, where it was wider than the margin and got clipped.
      plot.append('text')
        .attr('x', 6).attr('y', y(BENCHMARK) - 6)
        .attr('font-size', 12).attr('font-weight', 600).attr('fill', token('--tier-critical'))
        .text(`${BENCHMARK} cpm ${strings.explorer.orfBenchmark.toLowerCase()}`);

      const points = all.map((r) => ({ ...r, pct_students_cleared: r.mean_cpm }));
      const segments = [];
      for (let i = 1; i < points.length; i += 1) {
        const to = points[i];
        if (!to.change_defensibility) continue;
        segments.push({
          from: points[i - 1], to,
          defensibility: to.change_defensibility,
          connected: to.change_defensibility !== 'metric_basis_changed',
        });
      }
      const group = drawSeries(plot, { points, segments, x, y, colour, showCI: false });
      drawEndLabels(plot, [{ point: points.at(-1), colour, name: 'cpm' }], { x, y });

      bindTooltip(group.selectAll('.markers > g').data(points), tooltip, (row) =>
        `<div class="tt__head">${meta.name}<span class="tt__period">${periodLabel(row.period, { granularity, quarterLabel: row.period_label })}</span></div>` +
        `<div class="tt__value"><strong>${cpm(row.mean_cpm)}</strong><span class="tt__unit">average speed</span>` +
        `<span class="tt__n">${nLabel(row.n)}</span></div>` +
        `<hr class="tt__rule"><div class="tt__row">${instrumentLabel(row)}</div>` +
        `<div class="tt__row tt__muted">Benchmark is ${BENCHMARK} cpm.</div>`
      );
    },
  });

  // The DiD study's own reading speeds, quoted from the comparison table.
  const orf = didRows?.find((r) => r.std_competency === id && r.unit === 'cpm');
  if (orf && (!isMissing(orf.baseline_mean) || !isMissing(orf.midline_mean))) {
    const note = el('div', 'notice');
    note.append(el('p', null,
      `The DiD study measured the same children at ${cpm(orf.baseline_mean)} in Nov 2025 and ` +
      `${cpm(orf.midline_mean)} at the 25-26 End of Year round` +
      (isMissing(orf.mean_change) ? '.' : `, a change of ${orf.mean_change.toFixed(1)} cpm.`) +
      ` Both sit below the ${BENCHMARK} cpm benchmark.`));
    wrap.append(note);
  }
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows, quarterlyRows] = await Promise.all([loadTrends(granularity), load.quarterly()]);

  const available = competenciesInData(quarterlyRows);
  // An unknown or absent competency in the URL falls back to the first on the
  // ladder rather than erroring, so a stale link still opens something useful.
  const requested = ctx.state.competency;
  const id = requested && available.some((c) => c.id === requested) ? requested : (available[0]?.id ?? null);

  if (!id) {
    root.append(el('h1', 'page-title', strings.explorer.title));
    root.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  const meta = competency(id, { domain: rows.find((r) => r.std_competency === id)?.domain });
  const ladder = available;
  const index = ladder.findIndex((c) => c.id === id);

  // --- Header with ladder navigation ---------------------------------------
  const header = el('div', 'explorer-head');
  const heading = el('div');
  heading.append(el('h1', 'page-title', meta.name));
  heading.append(el('p', 'explorer-head__meta',
    `${meta.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy} · ${familyName(meta.family || rows.find((r) => r.std_competency === id)?.competency_family)}`));
  header.append(heading);

  const nav = el('div', 'explorer-nav');
  for (const [offset, label] of [[-1, strings.explorer.prev], [1, strings.explorer.next]]) {
    const target = ladder[index + offset];
    const button = el('a', 'explorer-nav__link', offset < 0 ? '‹ Previous' : 'Next ›');
    if (target) {
      button.href = ctx.hrefFor({ page: 'competency', competency: target.id });
      button.title = `${label}: ${target.name}`;
      button.setAttribute('aria-label', `${label}: ${target.name}`);
    } else {
      button.setAttribute('aria-disabled', 'true');
      button.classList.add('is-disabled');
    }
    nav.append(button);
  }
  header.append(nav);
  root.append(header);

  controlBar(root, ctx, {
    show: ['granularity', 'competency', 'did'],
    competencies: pickerItems(quarterlyRows),
  });
  monthlyNotice(root, ctx);

  const slots = periodSlots(rows, granularity, quarterlyRows);
  const isCpm = rows.some((r) => r.std_competency === id && r.measure_unit === 'cpm');

  // --- Chart and facts, side by side ---------------------------------------
  const main = el('div', 'explorer-main');
  const chartCol = el('div', 'explorer-main__chart');
  main.append(chartCol);
  root.append(main);

  trendChart(chartCol, ctx, { id, meta, rows, slots, granularity });

  factsPanel(main, {
    id, meta, granularity,
    points: seriesFor(rows, id, { showDid: ctx.state.showDid }),
    details: sourceDetails(rows, { competency: id, showDid: ctx.state.showDid }),
    references: referencePoints(rows, { competency: id, showDid: ctx.state.showDid }),
  });

  // --- The rest needs the views file, which is large: load it now -----------
  const views = await load.views();
  if (ctx.signal?.aborted) return;   // a newer render replaced this page mid-load
  if (views) {
    distributionStrip(root, ctx, { id, meta, views, slots, granularity, isCpm });
    standingStrip(root, { id, meta, views, granularity });
  }

  if (isCpm) {
    const didRows = await load.did();
    if (ctx.signal?.aborted) return;
    fluencyChart(root, { id, meta, rows, slots, granularity, didRows });
  }
}

export function unmount() {}
