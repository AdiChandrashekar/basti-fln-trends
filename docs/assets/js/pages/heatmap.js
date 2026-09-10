/**
 * Competency map: everything at once.
 *
 * Every competency against every round, so a reader can see which are strong,
 * which are weak, and when each was measured at all.
 *
 * Built as a real HTML table rather than an SVG grid. It has genuine row and
 * column headers, so screen readers announce "Sentence reading, Jul–Sep 2026,
 * 31%" without any ARIA scaffolding, the first column sticks on a narrow screen
 * with one line of CSS, and every cell is a real link. An SVG copy is generated
 * only when someone exports an image.
 */

import { d3 } from '../vendor.js';
import { load, loadTrends, periodSlots, trendPoints, competenciesInData } from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { ribbonModel } from '../ribbon.js';
import { heatScale, heatTextColour, token, createTooltip, bindTooltip, tooltipContent } from '../grammar.js';
import { controlBar, controlsBody, monthlyNotice, pageHeader } from '../controls.js';
import { competency, familyName } from '../competencies.js';
import { strings, instrumentLabel } from '../strings.js';
import { pct, pct1, int, periodLabel, changeGlyph, changeDirection, isMissing } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Corner glyphs, each paired with a title so the meaning is never colour-only. */
const GLYPHS = {
  thin: { mark: '◌', title: strings.map.legendThin },
  basis: { mark: '≠', title: strings.map.legendBasis },
  perfect: { mark: '✦', title: strings.map.legendPerfect },
};

function glyphsFor(point) {
  const marks = [];
  if (point.stability_flag === 'thin' || point.stability_flag === 'n_unknown') marks.push(GLYPHS.thin);
  if (point.change_defensibility === 'metric_basis_changed') marks.push(GLYPHS.basis);
  if (point.perfect_score_required) marks.push(GLYPHS.perfect);
  return marks;
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

function buildRows(points, slots, state) {
  const byCompetency = d3.group(points, (d) => d.std_competency);

  let rows = [...byCompetency].map(([id, cellRows]) => {
    const meta = competency(id, { domain: cellRows[0].domain });
    const byPeriod = new Map(cellRows.map((r) => [r.period, r]));
    const measured = cellRows.length;
    const latest = cellRows.slice().sort((a, b) => d3.ascending(a.period_sort, b.period_sort)).at(-1);
    const withinTool = cellRows
      .slice()
      .sort((a, b) => d3.ascending(a.period_sort, b.period_sort))
      .reverse()
      .find((r) => r.change_defensibility === 'within_tool');
    return {
      id,
      meta,
      family: cellRows[0].competency_family,
      byPeriod,
      measured,
      latest,
      latestChange: withinTool ? withinTool.change_pp : null,
      // A competency only the DiD study measured: every source it has is DiD.
      didOnly: cellRows.every((r) => r.is_did_point),
    };
  });

  if (state.minThreePeriods) rows = rows.filter((r) => r.measured >= 3);
  if (state.hideDidOnly) rows = rows.filter((r) => !r.didOnly);
  if (state.domain !== 'all') rows = rows.filter((r) => r.meta.domain === state.domain);

  const byDomain = (a, b) => (a.meta.domain === 'literacy' ? 0 : 1) - (b.meta.domain === 'literacy' ? 0 : 1);
  if (state.sort === 'latest') {
    rows.sort((a, b) => byDomain(a, b) || (b.latest?.pct_students_cleared ?? -1) - (a.latest?.pct_students_cleared ?? -1));
  } else if (state.sort === 'change') {
    // Competencies with no same-test change go to the bottom of their domain:
    // there is nothing to rank them by, and inventing a position would mislead.
    rows.sort((a, b) => {
      const rank = (r) => (r.latestChange === null ? 1 : 0);
      return byDomain(a, b) || rank(a) - rank(b) ||
        (a.latestChange ?? 0) - (b.latestChange ?? 0);
    });
  } else {
    rows.sort((a, b) => byDomain(a, b) || a.meta.order - b.meta.order);
  }
  return rows;
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows, quarterlyRows] = await Promise.all([loadTrends(granularity), load.quarterly()]);

  pageHeader(root, { title: strings.map.title });
  controlBar(root, ctx, { show: ['granularity', 'domain', 'did'] });

  // Sort and filter controls specific to this page.
  const extra = el('div', 'controls controls--secondary');
  const sortWrap = el('div', 'control');
  sortWrap.append(el('span', 'control__label', strings.controls.sort));
  const sortGroup = el('div', 'segmented');
  sortGroup.setAttribute('role', 'group');
  sortGroup.setAttribute('aria-label', strings.controls.sort);
  for (const [value, label] of [
    ['ladder', strings.map.sortLadder], ['latest', strings.map.sortLatest], ['change', strings.map.sortChange],
  ]) {
    const button = el('button', null, label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(ctx.state.sort === value));
    button.addEventListener('click', () => ctx.update({ sort: value }));
    sortGroup.append(button);
  }
  sortWrap.append(sortGroup);
  extra.append(sortWrap);

  for (const [key, label] of [
    ['minThreePeriods', strings.map.filterThreePeriods],
    ['hideDidOnly', strings.map.filterHideDidOnly],
  ]) {
    const wrap = el('div', 'control');
    wrap.append(el('span', 'control__label', ' '));
    const item = el('label', 'control__checkbox');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = ctx.state[key];
    input.addEventListener('change', () => ctx.update({ [key]: input.checked }));
    item.append(input, el('span', null, label));
    wrap.append(item);
    extra.append(wrap);
  }
  controlsBody(root, ctx).append(extra);
  monthlyNotice(root, ctx);

  const points = trendPoints(rows, { showDid: ctx.state.showDid });
  const slots = periodSlots(rows, granularity, quarterlyRows).filter((s) => s.hasData);
  const model = buildRows(points, slots, ctx.state);
  const scale = heatScale();

  if (!model.length) {
    root.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  // Column headers carry the instrument, which is what the ribbon does on the
  // time charts: the same information, in the form this layout allows.
  const { segments } = ribbonModel(slots);
  const instrumentOf = new Map();
  for (const segment of segments) {
    for (const slot of segment.slots) instrumentOf.set(slot.key, segment.label);
  }

  const columns = [
    { key: 'competency', label: 'Competency' },
    { key: 'domain', label: 'Domain' },
    ...slots.map((s) => ({ key: s.key, label: periodLabel(s.key, { granularity, quarterLabel: s.label }), num: true })),
    { key: 'change', label: 'Latest same-test change', num: true },
  ];
  const tableRows = model.map((row) => ({
    competency: row.meta.name,
    domain: row.meta.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy,
    ...Object.fromEntries(slots.map((s) => {
      const cell = row.byPeriod.get(s.key);
      return [s.key, cell ? pct1(cell.pct_students_cleared) : strings.map.notAssessed];
    })),
    change: row.latestChange === null ? '—' : row.latestChange.toFixed(1),
  }));

  let tooltip = null;

  chart({
    root,
    title: strings.map.title,
    subtitle: strings.map.subtitle,
    ariaLabel:
      `Grid of ${model.length} competencies against ${slots.length} rounds, showing % achieving.`,
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns,
    rows: tableRows,

    renderHtml({ container }) {
      tooltip?.destroy();
      const scroller = el('div', 'heatmap');
      const table = el('table', 'heatmap__table');
      table.setAttribute('aria-label', strings.map.title);

      // --- Header: period on the first line, instrument beneath -------------
      const thead = el('thead');
      const headRow = el('tr');
      const corner = el('th', 'heatmap__corner');
      corner.scope = 'col';
      corner.textContent = 'Competency';
      headRow.append(corner);
      for (const slot of slots) {
        const th = el('th', 'heatmap__head');
        th.scope = 'col';
        th.append(el('span', 'heatmap__period', periodLabel(slot.key, { granularity, quarterLabel: slot.label })));
        th.append(el('span', 'heatmap__instrument', instrumentOf.get(slot.key) || ''));
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      // --- Body, with a sub-header row whenever the family changes ----------
      const tbody = el('tbody');
      // Family sub-headers only make sense in teaching order, where families sit
      // together. Sorting by value or by change interleaves them, so those views
      // group by domain alone rather than printing a header above almost every row.
      const groupByFamily = ctx.state.sort === 'ladder';
      let lastGroup = null;
      for (const row of model) {
        const group = groupByFamily ? `${row.meta.domain}|${row.family}` : row.meta.domain;
        if (group !== lastGroup) {
          lastGroup = group;
          const groupRow = el('tr', 'heatmap__grouprow');
          const cell = el('th', 'heatmap__group');
          cell.setAttribute('colspan', String(slots.length + 1));
          cell.scope = 'colgroup';
          const domainLabel = row.meta.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy;
          cell.textContent = groupByFamily ? `${domainLabel} — ${familyName(row.family)}` : domainLabel;
          groupRow.append(cell);
          tbody.append(groupRow);
        }

        const tr = el('tr');
        const label = el('th', 'heatmap__label');
        label.scope = 'row';
        const link = el('a', null, row.meta.name);
        link.href = ctx.hrefFor({ page: 'competency', competency: row.id });
        label.append(link);
        tr.append(label);

        for (const slot of slots) {
          const cell = row.byPeriod.get(slot.key);
          const td = el('td', 'heatmap__cell');
          if (!cell) {
            td.classList.add('is-empty');
            td.title = strings.map.notAssessed;
            td.setAttribute('aria-label', `${row.meta.name}, ${periodLabel(slot.key, { granularity, quarterLabel: slot.label })}: ${strings.map.notAssessed}`);
            tr.append(td);
            continue;
          }

          const value = cell.pct_students_cleared;
          const cellLink = el('a', 'heatmap__value');
          cellLink.href = ctx.hrefFor({ page: 'competency', competency: row.id });
          cellLink.style.background = scale(value);
          cellLink.style.color = heatTextColour(value);
          cellLink.textContent = pct(value, { suffix: '' });
          cellLink.setAttribute(
            'aria-label',
            `${row.meta.name}, ${periodLabel(slot.key, { granularity, quarterLabel: slot.label })}: ` +
            `${pct(value)} achieving, ${instrumentLabel(cell)}. Open in the competency explorer.`
          );

          const marks = glyphsFor(cell);
          if (marks.length) {
            const flagWrap = el('span', 'heatmap__flags');
            flagWrap.setAttribute('aria-hidden', 'true');
            for (const mark of marks) {
              const glyph = el('span', 'heatmap__flag', mark.mark);
              glyph.title = mark.title;
              flagWrap.append(glyph);
            }
            cellLink.append(flagWrap);
            cellLink.setAttribute(
              'aria-label',
              `${cellLink.getAttribute('aria-label')} ${marks.map((m) => m.title).join('. ')}.`
            );
          }

          td.append(cellLink);
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      scroller.append(table);
      container.append(scroller);

      // Tooltips on the cells, using the same structure as every other chart.
      // The flat list is built in the same order the cells were appended, so the
      // data join lines up without needing to read anything back out of the DOM.
      tooltip = createTooltip(container);
      const flat = [];
      for (const row of model) {
        for (const slot of slots) {
          const cell = row.byPeriod.get(slot.key);
          if (cell) flat.push({ row, slot, cell });
        }
      }
      bindTooltip(
        d3.select(container).selectAll('.heatmap__value').data(flat),
        tooltip,
        ({ row, slot, cell }) =>
          tooltipContent(cell, {
            periodLabel: periodLabel(slot.key, { granularity, quarterLabel: slot.label }),
            competency: row.meta.name,
          })
      );

      // --- Legend and scale -------------------------------------------------
      const legend = el('div', 'legend');
      const ramp = el('span', 'legend__item');
      ramp.innerHTML =
        `<span class="legend__ramp" aria-hidden="true" style="background:linear-gradient(to right,` +
        [0, 20, 40, 60, 80, 100].map((v) => scale(v)).join(',') + `)"></span>` +
        `<span>0% to 100% achieving</span>`;
      legend.append(ramp);
      for (const mark of Object.values(GLYPHS)) {
        const item = el('span', 'legend__item');
        item.innerHTML = `<span class="legend__glyph" aria-hidden="true">${mark.mark}</span><span>${mark.title}</span>`;
        legend.append(item);
      }
      const empty = el('span', 'legend__item');
      empty.innerHTML = `<span class="legend__swatch legend__hatch" aria-hidden="true"></span><span>${strings.map.notAssessed}</span>`;
      legend.append(empty);
      container.append(legend);
    },

    /** Image export: the same grid, drawn once, only when asked for. */
    svgFor() {
      const CELL_W = 96;
      const CELL_H = 22;
      const LABEL_W = 220;
      const HEAD_H = 40;
      const width = LABEL_W + slots.length * CELL_W;
      const height = HEAD_H + model.length * CELL_H + 8;
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      const add = (tag, attrs, text) => {
        const node = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        if (text !== undefined) node.textContent = text;
        svg.append(node);
        return node;
      };

      slots.forEach((slot, i) => {
        add('text', {
          x: LABEL_W + i * CELL_W + CELL_W / 2, y: 16, 'text-anchor': 'middle',
          'font-size': 11, 'font-weight': 600, fill: token('--ink'),
        }, periodLabel(slot.key, { granularity, quarterLabel: slot.label }));
        add('text', {
          x: LABEL_W + i * CELL_W + CELL_W / 2, y: 30, 'text-anchor': 'middle',
          'font-size': 9.5, fill: token('--slate'),
        }, instrumentOf.get(slot.key) || '');
      });

      model.forEach((row, r) => {
        const y = HEAD_H + r * CELL_H;
        add('text', { x: 0, y: y + CELL_H / 2 + 4, 'font-size': 11, fill: token('--ink') },
          row.meta.name.length > 32 ? `${row.meta.name.slice(0, 31)}…` : row.meta.name);
        slots.forEach((slot, i) => {
          const cell = row.byPeriod.get(slot.key);
          const x = LABEL_W + i * CELL_W;
          if (!cell) {
            add('rect', { x: x + 1, y: y + 1, width: CELL_W - 2, height: CELL_H - 2, fill: token('--hatch') });
            return;
          }
          const value = cell.pct_students_cleared;
          add('rect', { x: x + 1, y: y + 1, width: CELL_W - 2, height: CELL_H - 2, fill: scale(value) });
          add('text', {
            x: x + CELL_W / 2, y: y + CELL_H / 2 + 4, 'text-anchor': 'middle',
            'font-size': 11, 'font-weight': 600, fill: heatTextColour(value),
          }, pct(value, { suffix: '' }) + glyphsFor(cell).map((g) => g.mark).join(''));
        });
      });

      return svg;
    },
  });
}

export function unmount() {}
