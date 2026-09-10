/**
 * Changes: separating the movement you can trust from the movement you cannot.
 *
 *   A. Same test in both rounds — a slope chart. The cleanest evidence there is.
 *   B. Different tests — a diverging bar chart, read as indicative only.
 *   C. How big is the instrument effect? — the Nov 2025 calibration, which is
 *      the only place two instruments measured the same children in the same
 *      month, and therefore the only direct measure of how much the test itself
 *      moves the number.
 *
 * The steps that cross a change of measure are listed, never plotted.
 */

import { d3 } from '../vendor.js';
import { load, loadTrends, trendPoints } from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { token, createTooltip, bindTooltip, tooltipContent, drawMarker, markerPath, drawGrid } from '../grammar.js';
import { controlBar, monthlyNotice, pageHeader, section } from '../controls.js';
import { competency, competencyName } from '../competencies.js';
import { strings, t, instrumentLabel } from '../strings.js';
import { pct, pct1, cpm, int, nLabel, changePoints, changeGlyph, changeDirection, periodLabel, isMissing } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const changeColourFor = (value) => token(`--change-${changeDirection(value)}`);

// ---------------------------------------------------------------------------
// A. Same test in both rounds
// ---------------------------------------------------------------------------

function sameTestSection(root, ctx, { rows, granularity }) {
  const points = trendPoints(rows, { domain: ctx.state.domain })
    .filter((p) => p.change_defensibility === 'within_tool')
    .sort((a, b) => b.pct_students_cleared - a.pct_students_cleared);

  const wrap = section(root, { title: strings.changes.sectionA });
  if (!points.length) {
    wrap.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  // The sample sizes come from the data, never from the sentence.
  const from = points[0].prev_period;
  const to = points[0].period;
  const nTo = points[0].n;
  const nFrom = rows.find(
    (r) => r.row_type === 'trend_point' && r.period === from && r.std_competency === points[0].std_competency
  )?.n;
  wrap.append(el('p', 'section__subtitle', t(strings.changes.sectionASubtitle, {
    nFrom: nFrom === null || nFrom === undefined ? strings.units.nNotReported : int(nFrom),
    nTo: nTo === null ? strings.units.nNotReported : int(nTo),
  })));

  const items = points.map((p) => ({
    point: p,
    meta: competency(p.std_competency, { domain: p.domain }),
    before: p.pct_students_cleared - p.change_pp,
    after: p.pct_students_cleared,
  }));

  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Slope chart of ${items.length} competencies measured by the same test in ` +
      `${periodLabel(from, { granularity })} and ${periodLabel(to, { granularity })}: ` +
      items.map((i) => `${i.meta.name} ${pct(i.before)} to ${pct(i.after)}`).join(', ') + '.',
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns: [
      { key: 'competency', label: 'Competency' },
      { key: 'before', label: `${periodLabel(from, { granularity })} %`, num: true },
      { key: 'after', label: `${periodLabel(to, { granularity })} %`, num: true },
      { key: 'change', label: 'Change (points)', num: true },
      { key: 'n', label: 'Children', num: true },
    ],
    rows: items.map((i) => ({
      competency: i.meta.name,
      before: pct1(i.before),
      after: pct1(i.after),
      change: i.point.change_pp.toFixed(1),
      n: i.point.n === null ? strings.units.nNotReported : int(i.point.n),
    })),
    height: () => Math.max(300, items.length * 30 + 90),
    render({ svg, width, height, container }) {
      const margin = { top: 34, right: Math.min(280, Math.max(180, width * 0.3)), bottom: 26, left: 54 };
      const innerWidth = Math.max(40, width - margin.left - margin.right);
      const innerHeight = height - margin.top - margin.bottom;
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);

      const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
      const x0 = 0;
      const x1 = innerWidth;

      plot.append('rect').attr('width', innerWidth).attr('height', innerHeight).attr('fill', token('--mist'));
      drawGrid(plot, y, innerWidth);
      for (const value of y.ticks(5)) {
        plot.append('text')
          .attr('x', -10).attr('y', y(value)).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12.8).attr('fill', token('--slate')).text(`${value}%`);
      }

      for (const [cx, period] of [[x0, from], [x1, to]]) {
        plot.append('text')
          .attr('x', cx).attr('y', -12).attr('text-anchor', cx === x0 ? 'start' : 'middle')
          .attr('font-size', 12.8).attr('font-weight', 600).attr('fill', token('--ink'))
          .text(periodLabel(period, { granularity }));
      }

      // Labels are solved together so competencies that land on similar values
      // do not stack on one baseline.
      const placed = items
        .map((i) => ({ ...i, ideal: y(i.after) }))
        .sort((a, b) => a.ideal - b.ideal);
      for (let i = 1; i < placed.length; i += 1) {
        placed[i].at = Math.max(placed[i].ideal, (placed[i - 1].at ?? placed[i - 1].ideal) + 17);
      }
      if (placed.length) placed[0].at = placed[0].at ?? placed[0].ideal;
      for (let i = placed.length - 2; i >= 0; i -= 1) {
        placed[i].at = Math.min(placed[i].at, placed[i + 1].at - 17);
      }

      for (const item of placed) {
        const colour = changeColourFor(item.point.change_pp);
        const group = plot.append('g').attr('class', 'slope');

        group.append('line')
          .attr('x1', x0).attr('y1', y(item.before))
          .attr('x2', x1).attr('y2', y(item.after))
          .attr('stroke', colour).attr('stroke-width', 2).attr('opacity', 0.85);

        drawMarker(group, { ...item.point, source_tools: [] }, { x: x0, y: y(item.before), colour, r: 3.5 });
        drawMarker(group, item.point, { x: x1, y: y(item.after), colour });

        // Leader from the last point to its label where the label had to move.
        if (Math.abs(item.at - item.ideal) > 1.5) {
          group.append('path')
            .attr('d', `M${x1 + 6},${item.ideal} L${x1 + 12},${item.at}`)
            .attr('fill', 'none').attr('stroke', colour).attr('stroke-width', 1).attr('opacity', 0.5);
        }

        const label = group.append('text')
          .attr('x', x1 + 16).attr('y', item.at).attr('dy', '0.32em')
          .attr('font-size', 12.8).attr('fill', token('--ink'));
        label.append('tspan').attr('font-weight', 600).attr('fill', colour)
          .text(`${changeGlyph(item.point.change_pp)} ${Math.abs(item.point.change_pp).toFixed(1)}`);
        // Trim to the room the right margin actually leaves, so a long name is
        // shortened deliberately rather than clipped by the edge of the chart.
        const room = Math.max(8, Math.floor((margin.right - 62) / 6.4));
        const name = item.meta.name.length > room ? `${item.meta.name.slice(0, room - 1)}…` : item.meta.name;
        label.append('tspan').text(`  ${name}`);
        label.append('title').text(item.meta.name);

        bindTooltip(group, tooltip, () =>
          tooltipContent(item.point, {
            periodLabel: periodLabel(to, { granularity, quarterLabel: item.point.period_label }),
            competency: item.meta.name,
          })
        );
      }
    },
  });
}

// ---------------------------------------------------------------------------
// B. Different tests, plus the list of steps that cannot be compared at all
// ---------------------------------------------------------------------------

function crossToolSection(root, ctx, { rows, granularity }) {
  const all = trendPoints(rows, { domain: ctx.state.domain });
  const crossTool = all
    .filter((p) => p.change_defensibility === 'cross_tool_caveat' || p.change_defensibility === 'cross_tool_matched_construct')
    .filter((p) => !isMissing(p.change_pp))
    .sort((a, b) => b.change_pp - a.change_pp);
  const notComparable = all.filter((p) => p.change_defensibility === 'metric_basis_changed');

  const wrap = section(root, { title: strings.changes.sectionB, subtitle: strings.changes.sectionBSubtitle });

  const link = el('a', 'section__link', strings.changes.sectionBLink);
  link.href = '#section-instrument-effect';
  wrap.append(link);

  if (crossTool.length) {
    const items = crossTool.map((p) => ({
      point: p,
      meta: competency(p.std_competency, { domain: p.domain }),
    }));
    const extent = Math.max(10, ...items.map((i) => Math.abs(i.point.change_pp))) * 1.1;

    chart({
      root: wrap,
      title: '',
      subtitle: '',
      ariaLabel:
        `Diverging bar chart of ${items.length} changes that cross an instrument change: ` +
        items.map((i) => `${i.meta.name} ${i.point.change_pp > 0 ? 'up' : 'down'} ${Math.abs(i.point.change_pp).toFixed(1)} points`).join(', ') + '.',
      sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
      columns: [
        { key: 'competency', label: 'Competency' },
        { key: 'from', label: 'From' },
        { key: 'to', label: 'To' },
        { key: 'change', label: 'Change (points)', num: true },
        { key: 'kind', label: 'How comparable' },
      ],
      rows: items.map((i) => ({
        competency: i.meta.name,
        from: periodLabel(i.point.prev_period, { granularity }),
        to: periodLabel(i.point.period, { granularity, quarterLabel: i.point.period_label }),
        change: i.point.change_pp.toFixed(1),
        kind: strings.defensibility[i.point.change_defensibility],
      })),
      height: () => items.length * 24 + 56,
      render({ svg, width, height, container }) {
        const margin = { top: 8, right: 60, bottom: 30, left: Math.min(230, Math.max(150, width * 0.28)) };
        const innerWidth = Math.max(40, width - margin.left - margin.right);
        const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const tooltip = createTooltip(container);
        const x = d3.scaleLinear().domain([-extent, extent]).range([0, innerWidth]);

        // Dash patterns matching the line grammar, so a bar says which kind of
        // instrument change produced it without needing a second colour.
        const defs = svg.append('defs');
        for (const [id, gap] of [['caveat', 3], ['matched', 8]]) {
          const pattern = defs.append('pattern')
            .attr('id', `hatch-${id}`).attr('width', gap + 3).attr('height', 6)
            .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
          pattern.append('rect').attr('width', gap + 3).attr('height', 6).attr('fill', token('--paper'));
          pattern.append('rect').attr('width', gap).attr('height', 6).attr('fill', 'currentColor');
        }

        items.forEach((item, index) => {
          const cy = index * 24;
          const value = item.point.change_pp;
          const colour = changeColourFor(value);
          const group = plot.append('g').attr('color', colour);

          group.append('text')
            .attr('x', -10).attr('y', cy + 12).attr('dy', '0.32em').attr('text-anchor', 'end')
            .attr('font-size', 12.8).attr('fill', token('--ink'))
            .text(item.meta.name.length > 30 ? `${item.meta.name.slice(0, 29)}…` : item.meta.name)
            .append('title').text(item.meta.name);

          group.append('rect')
            .attr('x', Math.min(x(0), x(value))).attr('y', cy + 4)
            .attr('width', Math.abs(x(value) - x(0))).attr('height', 16)
            .attr('fill', `url(#hatch-${item.point.change_defensibility === 'cross_tool_caveat' ? 'caveat' : 'matched'})`)
            .attr('stroke', colour).attr('stroke-width', 1);

          group.append('text')
            .attr('x', value >= 0 ? x(value) + 6 : x(value) - 6).attr('y', cy + 12).attr('dy', '0.32em')
            .attr('text-anchor', value >= 0 ? 'start' : 'end')
            .attr('font-size', 12).attr('font-weight', 600).attr('fill', colour)
            .text(`${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`);

          bindTooltip(group, tooltip, () =>
            tooltipContent(item.point, {
              periodLabel: periodLabel(item.point.period, { granularity, quarterLabel: item.point.period_label }),
              competency: item.meta.name,
            })
          );
        });

        const zero = plot.append('g');
        zero.append('line')
          .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', items.length * 24)
          .attr('stroke', token('--slate')).attr('stroke-width', 1);
        const axis = plot.append('g').attr('transform', `translate(0,${items.length * 24 + 8})`);
        for (const tick of x.ticks(5)) {
          axis.append('text')
            .attr('x', x(tick)).attr('y', 12).attr('text-anchor', 'middle')
            .attr('font-size', 12).attr('fill', token('--slate'))
            .text(`${tick > 0 ? '+' : ''}${tick}`);
        }
        axis.append('text')
          .attr('x', innerWidth / 2).attr('y', 26).attr('text-anchor', 'middle')
          .attr('font-size', 11).attr('fill', token('--slate'))
          .text('Change in percentage points');
      },
    });
  }

  // --- Not comparable: listed, never plotted -------------------------------
  if (notComparable.length) {
    const block = el('div', 'not-comparable-block');
    block.append(el('h3', 'section__title', `${strings.changes.notComparableTitle} (${notComparable.length})`));
    block.append(el('p', 'section__subtitle', strings.changes.notComparableSubtitle));

    const wrapTable = el('div', 'table-wrap');
    const table = el('table', 'data');
    const thead = el('thead');
    const headRow = el('tr');
    for (const label of ['Competency', 'From', 'To', 'What changed']) {
      const th = el('th', null, label);
      th.scope = 'col';
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = el('tbody');
    for (const point of notComparable.sort((a, b) => a.std_competency.localeCompare(b.std_competency))) {
      const meta = competency(point.std_competency, { domain: point.domain });
      const tr = el('tr');
      tr.append(el('td', null, meta.name));
      tr.append(el('td', null, periodLabel(point.prev_period, { granularity })));
      tr.append(el('td', null, periodLabel(point.period, { granularity, quarterLabel: point.period_label })));
      tr.append(el('td', null, strings.defensibility.metric_basis_changed));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrapTable.append(table);
    block.append(wrapTable);
    wrap.append(block);
  }
}

// ---------------------------------------------------------------------------
// C. How big is the instrument effect?
// ---------------------------------------------------------------------------

function calibrationSection(root, { calibration }) {
  const wrap = section(root, { title: strings.changes.sectionC });
  wrap.id = 'section-instrument-effect';

  if (!calibration) {
    wrap.append(el('p', 'empty-state',
      t(strings.empty.missingFile, { file: 'data/tool_calibration_nov2025.csv' })));
    return;
  }

  const items = calibration
    .filter((r) => !isMissing(r.did_baseline_nov_mean) && !isMissing(r.q3_2025_tool_nov_mean))
    .map((r) => ({
      ...r,
      meta: competency(r.std_competency),
      gap: r.district_minus_did_mean,
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  if (!items.length) {
    wrap.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  // The "~20 points" in the caption is read off the data at render time, so it
  // stays true if the calibration file changes.
  const maxGap = Math.round(Math.max(...items.map((i) => Math.abs(i.gap))));
  wrap.append(el('p', 'section__subtitle', t(strings.changes.sectionCSubtitle, { maxGap })));

  chart({
    root: wrap,
    title: '',
    subtitle: '',
    ariaLabel:
      `Dot plot comparing the district tool and the DiD baseline on ${items.length} tasks measured ` +
      `in the same month: ` + items.map((i) => `${i.meta.name}, district ${i.q3_2025_tool_nov_mean.toFixed(1)}, ` +
      `DiD ${i.did_baseline_nov_mean.toFixed(1)}`).join('; ') + '.',
    sourceNote: sourceNoteFor('tool_calibration_nov2025.csv'),
    columns: [
      { key: 'competency', label: 'Competency' },
      { key: 'district', label: 'District tool (mean)', num: true },
      { key: 'did', label: 'DiD baseline (mean)', num: true },
      { key: 'gap', label: 'Gap', num: true },
      { key: 'unit', label: 'Unit' },
    ],
    rows: items.map((i) => ({
      competency: i.meta.name,
      district: i.q3_2025_tool_nov_mean.toFixed(1),
      did: i.did_baseline_nov_mean.toFixed(1),
      gap: i.gap.toFixed(1),
      unit: i.measure_unit === 'cpm' ? 'correct words per minute' : '% correct',
    })),
    height: () => items.length * 38 + 60,
    render({ svg, width, height, container }) {
      const margin = { top: 20, right: 92, bottom: 30, left: Math.min(220, Math.max(140, width * 0.26)) };
      const innerWidth = Math.max(40, width - margin.left - margin.right);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

      const districtColour = token('--csf-blue');
      const didColour = token('--did-neutral');

      items.forEach((item, index) => {
        const cy = index * 38 + 12;
        const group = plot.append('g').attr('tabindex', 0).attr('role', 'button');

        group.append('text')
          .attr('x', -10).attr('y', cy).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12.8).attr('fill', token('--ink'))
          .text(item.meta.name.length > 28 ? `${item.meta.name.slice(0, 27)}…` : item.meta.name)
          .append('title').text(item.meta.name);

        const xa = x(item.did_baseline_nov_mean);
        const xb = x(item.q3_2025_tool_nov_mean);

        group.append('line')
          .attr('x1', xa).attr('x2', xb).attr('y1', cy).attr('y2', cy)
          .attr('stroke', token('--change-flat')).attr('stroke-width', 2);

        group.append('path')
          .attr('d', markerPath('diamond', 5)).attr('transform', `translate(${xa},${cy})`)
          .attr('fill', didColour);
        group.append('path')
          .attr('d', markerPath('circle', 5)).attr('transform', `translate(${xb},${cy})`)
          .attr('fill', districtColour);

        group.append('text')
          .attr('x', Math.max(xa, xb) + 12).attr('y', cy).attr('dy', '0.32em')
          .attr('font-size', 12).attr('font-weight', 600)
          .attr('fill', Math.abs(item.gap) >= 15 ? token('--change-down') : token('--slate'))
          .text(`${item.gap > 0 ? '+' : '−'}${Math.abs(item.gap).toFixed(1)}`);

        const unit = item.measure_unit === 'cpm' ? 'cpm' : '% correct';
        bindTooltip(group, tooltip, () =>
          `<div class="tt__head">${item.meta.name}<span class="tt__period">Nov 2025, both instruments</span></div>` +
          `<div class="tt__value"><strong>${Math.abs(item.gap).toFixed(1)}</strong>` +
          `<span class="tt__unit">${unit} apart</span></div>` +
          `<hr class="tt__rule">` +
          `<div class="tt__row">Q3 2025 tool: ${item.q3_2025_tool_nov_mean.toFixed(1)} ${unit}</div>` +
          `<div class="tt__row">DiD baseline: ${item.did_baseline_nov_mean.toFixed(1)} ${unit}</div>` +
          `<hr class="tt__rule"><div class="tt__row tt__muted">${item.note || ''}</div>`
        );
      });

      const axis = plot.append('g').attr('transform', `translate(0,${items.length * 38 + 4})`);
      axis.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke', token('--rule'));
      for (const tick of [0, 25, 50, 75, 100]) {
        axis.append('text')
          .attr('x', x(tick)).attr('y', 16).attr('text-anchor', 'middle')
          .attr('font-size', 12).attr('fill', token('--slate')).text(tick);
      }

      const legend = plot.append('g').attr('transform', 'translate(0,-14)');
      legend.append('path').attr('d', markerPath('circle', 5)).attr('transform', 'translate(6,0)').attr('fill', districtColour);
      legend.append('text').attr('x', 16).attr('dy', '0.32em').attr('font-size', 11).attr('fill', token('--slate'))
        .text(strings.changes.districtTool);
      legend.append('path').attr('d', markerPath('diamond', 5)).attr('transform', 'translate(140,0)').attr('fill', didColour);
      legend.append('text').attr('x', 150).attr('dy', '0.32em').attr('font-size', 11).attr('fill', token('--slate'))
        .text(strings.changes.didBaseline);
    },
  });
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows] = await Promise.all([loadTrends(granularity)]);

  pageHeader(root, { title: strings.changes.title });
  controlBar(root, ctx, { show: ['granularity', 'domain'] });
  monthlyNotice(root, ctx);

  sameTestSection(root, ctx, { rows, granularity });
  crossToolSection(root, ctx, { rows, granularity });

  const calibration = await load.calibration();
  if (ctx.signal?.aborted) return;
  calibrationSection(root, { calibration });
}

export function unmount() {}
