/**
 * Methods and caveats.
 *
 * Prose, not a wall of bullets. Everything here is a plain-language restatement
 * of a definition the pipeline already implements — nothing on this page is a
 * new rule, and where a number appears it is read from the data.
 *
 * The six caveats that must travel with this dashboard (data dictionary, s15)
 * each get a section, because a reader who takes a chart into a review meeting
 * needs to be able to answer "how do you know?" without leaving the site.
 */

import { d3 } from '../vendor.js';
import { load, periodSlots, sourceDetails } from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { drawRibbon, ribbonModel } from '../ribbon.js';
import { token, clearTokenCache, createTooltip, bindTooltip, markerPath } from '../grammar.js';
import { pageHeader, section } from '../controls.js';
import { competency, familyName } from '../competencies.js';
import { strings, t, instrumentLabel, sortInstruments } from '../strings.js';
import { int, pct, buildDate, periodLabel, quarterAxisLabel, isMissing, fitLabel } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prose(root, paragraphs) {
  const wrap = el('div', 'prose');
  for (const text of paragraphs) wrap.append(el('p', null, text));
  root.append(wrap);
  return wrap;
}

// ---------------------------------------------------------------------------
// The instrument timeline
// ---------------------------------------------------------------------------

function timeline(root, { rows, quarterlyRows }) {
  const wrap = section(root, {
    title: strings.methods.timelineTitle,
    subtitle: strings.methods.timelineSubtitle,
  });

  const slots = periodSlots(quarterlyRows, 'quarterly', quarterlyRows);
  const holder = el('div', 'timeline');
  wrap.append(holder);

  function draw() {
    const width = holder.clientWidth;
    if (!width) return;
    clearTokenCache();
    holder.innerHTML = '';
    const height = 86;
    const margin = { left: 8, right: 8 };
    const innerWidth = Math.max(40, width - margin.left - margin.right);

    const svg = d3.select(holder).append('svg')
      .attr('width', width).attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('aria-hidden', 'true');

    const x = d3.scalePoint().domain(slots.map((s) => s.key)).range([0, innerWidth]).padding(0.5);
    const bandWidth = slots.length > 1 ? x.step() : innerWidth;
    const group = svg.append('g').attr('transform', `translate(${margin.left},34)`);

    // The same ribbon component, at its display size, with dates underneath.
    drawRibbon(group, {
      slots, x, bandWidth, height: 28, showCohort: true,
      detail: (segment) => {
        const tools = sortInstruments(segment.tools);
        return tools.map((tool) => strings.instrumentDates[tool] || '').filter(Boolean).join(' · ');
      },
    });

    // Period labels above the ribbon.
    for (const slot of slots) {
      const label = quarterAxisLabel(slot.key, slot.label);
      svg.append('text')
        .attr('x', margin.left + x(slot.key)).attr('y', 16).attr('text-anchor', 'middle')
        .attr('font-size', 12.8).attr('fill', token('--ink')).text(label.primary);
      svg.append('text')
        .attr('x', margin.left + x(slot.key)).attr('y', 29).attr('text-anchor', 'middle')
        .attr('font-size', 11).attr('fill', token('--slate')).text(label.secondary);
    }
  }

  new ResizeObserver(draw).observe(holder);
  draw();

  // --- The same thing as a table: dates, sample sizes, and what it measured --
  const details = sourceDetails(quarterlyRows, {});
  const byTool = d3.group(details, (d) => d.source_tool);
  const toolRows = sortInstruments([...byTool.keys()]).map((tool) => {
    const toolRowsData = byTool.get(tool);
    const ns = toolRowsData.map((r) => r.n).filter((n) => n !== null);
    const schools = toolRowsData.map((r) => r.n_schools).filter((n) => n !== null);
    const competencies = new Set(toolRowsData.map((r) => r.std_competency));
    const periods = new Set(toolRowsData.map((r) => r.period));
    return {
      instrument: instrumentLabel({ source_tools: [tool] }),
      dates: strings.instrumentDates[tool] || '—',
      children: ns.length ? int(Math.max(...ns)) : strings.units.nNotReported,
      schools: schools.length ? int(Math.max(...schools)) : '—',
      competencies: String(competencies.size),
      rounds: [...periods].map((p) => periodLabel(p, { granularity: 'quarterly' })).join(', '),
    };
  });

  const tableWrap = el('div', 'table-wrap');
  const table = el('table', 'data');
  const thead = el('thead');
  const headRow = el('tr');
  for (const [label, num] of [
    ['Instrument', false], ['In the field', false], ['Children', true],
    ['Schools', true], ['Competencies', true], ['Rounds it covers', false],
  ]) {
    const th = el('th', num ? 'num' : null, label);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody');
  for (const row of toolRows) {
    const tr = el('tr');
    tr.append(el('td', null, row.instrument));
    tr.append(el('td', null, row.dates));
    tr.append(el('td', 'num', row.children));
    tr.append(el('td', 'num', row.schools));
    tr.append(el('td', 'num', row.competencies));
    const rounds = el('td', null, row.rounds);
    rounds.style.whiteSpace = 'normal';
    tr.append(rounds);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  wrap.append(tableWrap);
  wrap.append(el('p', 'section__subtitle',
    'Children is the largest number assessed by that instrument in any single round. ' +
    'The 2026 sheets carry no school field, so those rounds show no school count.'));
}

/**
 * The November 2025 calibration.
 *
 * One month, two instruments, the same children. It is the only direct measure
 * of how much of a cross-instrument step is the test rather than the children,
 * which is why it belongs with the methods rather than with the findings.
 */
function calibrationChart(root, { calibration }) {
  if (!calibration) {
    root.append(el('p', 'empty-state',
      strings.empty.missingFile.replace('{file}', 'data/tool_calibration_nov2025.csv')));
    return;
  }

  const items = calibration
    .filter((r) => !isMissing(r.did_baseline_nov_mean) && !isMissing(r.q3_2025_tool_nov_mean))
    .map((r) => ({ ...r, meta: competency(r.std_competency), gap: r.district_minus_did_mean }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  if (!items.length) return;

  const maxGap = Math.round(Math.max(...items.map((i) => Math.abs(i.gap))));

  chart({
    root,
    title: strings.calibration.title,
    subtitle: t(strings.calibration.subtitle, { maxGap }),
    ariaLabel:
      `Dot plot comparing the district tool and the DiD baseline on ${items.length} tasks ` +
      `measured in the same month: ` +
      items.map((i) => `${i.meta.name}, district ${i.q3_2025_tool_nov_mean.toFixed(1)}, ` +
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
    render({ svg, width, container }) {
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
          .text(fitLabel(item.meta.name, margin.left - 14))
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
          .text(`${item.gap > 0 ? '+' : '\u2212'}${Math.abs(item.gap).toFixed(1)}`);

        const unit = item.measure_unit === 'cpm' ? 'cpm' : '% correct';
        bindTooltip(group, tooltip, () =>
          `<div class="tt__head">${item.meta.name}<span class="tt__period">Nov 2025, both instruments</span></div>` +
          `<div class="tt__value"><strong>${Math.abs(item.gap).toFixed(1)}</strong>` +
          `<span class="tt__unit">${unit} apart</span></div><hr class="tt__rule">` +
          `<div class="tt__row">Q3 2025 tool: ${item.q3_2025_tool_nov_mean.toFixed(1)} ${unit}</div>` +
          `<div class="tt__row">DiD baseline: ${item.did_baseline_nov_mean.toFixed(1)} ${unit}</div>`
        );
      });

      const axis = plot.append('g').attr('transform', `translate(0,${items.length * 38 + 4})`);
      axis.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke', token('--rule'));
      for (const tick of [0, 25, 50, 75, 100]) {
        axis.append('text')
          .attr('x', x(tick)).attr('y', 16).attr('text-anchor', 'middle')
          .attr('font-size', 12).attr('fill', token('--slate')).text(tick);
      }

      // The legend is HTML, below, so it wraps on a narrow screen rather than
      // running off the edge of the chart.
    },
  });

  const legend = el('div', 'legend');
  for (const [shape, colour, label] of [
    ['circle', token('--csf-blue'), strings.calibration.districtTool],
    ['diamond', token('--did-neutral'), strings.calibration.didBaseline],
  ]) {
    const entry = el('span', 'legend__item');
    entry.innerHTML =
      `<svg class="legend__swatch" width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">` +
      `<path d="${markerPath(shape, 5)}" transform="translate(10,8)" fill="${colour}"/></svg>` +
      `<span>${label}</span>`;
    legend.append(entry);
  }
  root.append(legend);
}

// ---------------------------------------------------------------------------
// Crosswalk explorer
// ---------------------------------------------------------------------------

function crosswalkExplorer(root, { crosswalk }) {
  const wrap = section(root, { title: strings.methods.crosswalkTitle });

  if (!crosswalk) {
    wrap.append(el('p', 'empty-state',
      strings.empty.missingFile.replace('{file}', 'data/competency_crosswalk.csv')));
    return;
  }

  wrap.append(el('p', 'section__subtitle',
    'Every raw item in every tool, and the competency it was mapped to. This mapping drives ' +
    'the whole pipeline: change it and every table on this site changes with it. ' +
    'Confidence and the reasoning are the analyst’s own, recorded so a reader can disagree.'));

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'crosswalk__search';
  search.placeholder = strings.methods.crosswalkSearch;
  search.setAttribute('aria-label', strings.methods.crosswalkSearch);
  wrap.append(search);

  const count = el('p', 'section__subtitle');
  wrap.append(count);

  const tableWrap = el('div', 'table-wrap');
  const table = el('table', 'data');
  const thead = el('thead');
  const headRow = el('tr');
  const C = strings.methods.crosswalkColumns;
  for (const label of [C.competency, C.instrument, C.rawName, C.stacking, C.confidence, C.reasoning]) {
    const th = el('th', null, label);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody');
  table.append(thead, tbody);
  tableWrap.append(table);
  wrap.append(tableWrap);

  const items = crosswalk.map((row) => ({
    ...row,
    name: competency(row.std_competency, { domain: row.domain }).name,
    instrument: instrumentLabel({ source_tools: [row.source_tool] }),
    comparability: strings.comparability[row.stacking_status] || row.stacking_status,
  }));

  function paint(query) {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) =>
        [i.name, i.instrument, i.raw_name, i.std_competency, i.reasoning].some(
          (v) => String(v || '').toLowerCase().includes(q)))
      : items;

    tbody.innerHTML = '';
    for (const item of filtered) {
      const tr = el('tr');
      tr.append(el('td', null, item.name));
      tr.append(el('td', null, item.instrument));
      const raw = el('td', null, item.raw_name);
      raw.style.whiteSpace = 'normal';
      tr.append(raw);
      tr.append(el('td', null, item.comparability));
      const confidence = el('td', null, item.confidence || '—');
      confidence.dataset.confidence = item.confidence || '';
      tr.append(confidence);
      const reason = el('td', null, item.reasoning || '—');
      reason.style.whiteSpace = 'normal';
      reason.style.minWidth = '260px';
      tr.append(reason);
      tbody.append(tr);
    }
    count.textContent = q
      ? `${filtered.length} of ${items.length} items match “${query.trim()}”.`
      : `${items.length} raw items across ${new Set(items.map((i) => i.source_tool)).size} instruments.`;
    if (!filtered.length) {
      const tr = el('tr');
      const td = el('td', null, strings.empty.noResults);
      td.setAttribute('colspan', '6');
      tr.append(td);
      tbody.append(tr);
    }
  }

  search.addEventListener('input', () => paint(search.value));
  paint('');
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function downloads(root, { manifest }) {
  const wrap = section(root, {
    title: strings.methods.downloadsTitle,
    subtitle: strings.methods.downloadsSubtitle,
  });

  const list = el('ul', 'downloads');
  const files = Object.entries(manifest?.files || {});
  for (const [name, meta] of files) {
    const item = el('li', 'downloads__item');
    const link = el('a', null, name);
    link.href = `data/${name}`;
    link.setAttribute('download', name);
    item.append(link);
    item.append(el('span', 'downloads__meta',
      `${int(meta.rows)} rows · ${meta.columns} columns · ${Math.round(meta.bytes / 1024)} KB`));
    list.append(item);
  }

  const dictionary = el('li', 'downloads__item');
  const dictLink = el('a', null, 'data_dictionary.md');
  dictLink.href = 'data/data_dictionary.md';
  dictLink.setAttribute('download', 'data_dictionary.md');
  dictionary.append(dictLink);
  dictionary.append(el('span', 'downloads__meta', 'Every definition behind every number here'));
  list.append(dictionary);

  wrap.append(list);
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const [quarterlyRows, crosswalk, calibration, manifest] = await Promise.all([
    load.quarterly(), load.crosswalk(), load.calibration(), load.manifest(),
  ]);
  if (ctx.signal?.aborted) return;

  pageHeader(root, { title: strings.methods.title, intro: strings.methods.intro });

  // --- What the metric means ------------------------------------------------
  const metric = section(root, { title: strings.methods.metricTitle });
  prose(metric, [
    'A child achieves a competency by scoring at least 75% of its items. That one rule is ' +
    'applied to every tool on this site, so a number from August 2025 and a number from ' +
    'August 2026 mean the same thing even when the test does not.',
    'There are two deliberate exceptions. Oral reading fluency is achieved at 45 correct words ' +
    'per minute or more, the Grade 2 benchmark. And on the four three-item tasks in the ' +
    'Q3 2025 tool — addition, subtraction, counting in bundles and pattern — 2 of 3 counts as ' +
    'achieved, because that is the rule the tool itself used at the time.',
    'One consequence is worth carrying into any discussion of the weakest tasks. On a task with ' +
    'only one, two or three items, 75% can only be reached with full marks. Sentence reading ' +
    'has two items and pattern has three, so a child who gets one of two right is counted the ' +
    'same as a child who gets none. Those tasks are held down relative to longer ones, and the ' +
    'dashboard marks them with a gold tick wherever they appear.',
    'The average score is not the tracked number. It is carried in tooltips for reference, but ' +
    'every headline figure on this site is a share of children, not a mean.',
  ]);

  // --- The instrument timeline ---------------------------------------------
  timeline(root, { quarterlyRows });

  // --- How the DiD study enters --------------------------------------------
  const did = section(root, { title: strings.methods.didTitle });
  prose(did, [
    'The DiD study measured Grade 2 twice: a baseline in Nov 2025 and the 25-26 End of Year ' +
    'assessment in Mar 2026, across 40 schools and 177 children. Its treatment and control ' +
    'arms are averaged equally throughout this dashboard; the arm split is not used anywhere.',
    'The two rounds report different kinds of number. The baseline gives an average % correct. ' +
    'The End of Year round gives a distribution, and what this site plots from it is the share ' +
    'of children in the report’s top band — strictly above 75%, so a child at exactly 75% is ' +
    'counted as achieving in the district data but not here.',
    'Neither of those is the same measure as a share of children achieving, which is why no line ' +
    'on this site is ever drawn between a DiD baseline point and anything else. Where a step ' +
    'crosses that change of measure, the dashboard leaves a gap and marks it with ≠, and the ' +
    'Changes page lists those steps rather than plotting them.',
    'Where the district tool and the DiD baseline both measured a competency in the same period, ' +
    'the district value carries the trend line and the baseline sits beside it as a separate ' +
    'point, joined to its neighbours by a fine dotted link. That link shows where the other ' +
    'study sat. It is not a change, and no change is calculated from it.',
    'The one genuinely like-for-like comparison is the baseline against the End of Year round, ' +
    'on the competencies where the report states a mean for both. That is what the DiD snapshot ' +
    'page shows, in its own colour so the figures are not carried back onto the % achieving scale.',
  ]);

  // --- Cross-instrument changes --------------------------------------------
  const cross = section(root, { title: strings.methods.crossToolTitle });
  const maxGap = calibration
    ? Math.round(Math.max(...calibration.map((r) => Math.abs(r.district_minus_did_mean || 0))))
    : null;
  prose(cross, [
    'Every tool change on the timeline above coincides with a step in the trend lines. Some of ' +
    'that step is the children and some of it is the test, and there is no way to separate them ' +
    'from the trend alone.',
    maxGap
      ? `November 2025 is the one month where two instruments measured the same children at the ` +
        `same time, which makes it the only direct evidence available. On tasks with the same ` +
        `name, the two instruments differed by up to ${maxGap} points. A cross-instrument move ` +
        `smaller than that should not be read as a change in what children can do.`
      : 'November 2025 is the one month where two instruments measured the same children at the ' +
        'same time. The calibration table for that month has not been synced into this site yet.',
    'The dashboard says which kind of step it is drawing, every time: a solid line means the same ' +
    'test in both rounds, a long dash means a different test measuring the same skill, and a ' +
    'short dash means a different test whose task is not quite the same.',
  ]);
  calibrationChart(cross, { calibration });

  // --- Cohort and composition ----------------------------------------------
  const cohort = section(root, { title: strings.methods.cohortTitle });
  prose(cohort, [
    'This is a repeated snapshot of Grade 2, not a group of children followed over time. Each ' +
    'point describes whoever was in Grade 2 and assessed at that moment.',
    'From April 2026 the children are a new cohort: the ones in the earlier rounds have moved up ' +
    'to Grade 3. A fall between Q1 and Q2 2026 is therefore not the same children doing worse. ' +
    'It is a different group of children, taking the same test, at a different point in the ' +
    'school year, with the summer break in between. The dashboard marks that boundary on every ' +
    'time axis.',
  ]);

  const composition = section(root, { title: strings.methods.compositionTitle });
  prose(composition, [
    'Consecutive months in 2025 share almost no schools, and the 2026 sheets carry no school ' +
    'field at all. A month-to-month move within one tool therefore reflects which schools were ' +
    'visited at least as much as anything that changed in classrooms. Quarterly is the steadier ' +
    'view, and the dashboard says so whenever monthly is selected.',
    'The domain rollups have the same problem in a different form: each instrument tested a ' +
    'different set of competencies, so Overall, Literacy and Numeracy are averages over a set ' +
    'that changes when the instrument changes. Every tooltip on the Overview names the ' +
    'competencies behind the figure for that round.',
  ]);

  // --- Crosswalk and downloads ---------------------------------------------
  crosswalkExplorer(root, { crosswalk });
  downloads(root, { manifest });

  const build = section(root, { title: strings.methods.buildTitle });
  const counts = manifest?.files || {};
  prose(build, [
    `Data built ${manifest?.built_at ? buildDate(manifest.built_at) : 'unknown'}, from ` +
    `${Object.keys(counts).length} published tables. ` +
    `The quarterly file holds ${int(counts['quarterly_trends.csv']?.rows ?? 0)} rows across ` +
    `${manifest?.competencies ?? 0} competencies and ` +
    `${manifest?.periods?.quarters?.length ?? 0} rounds.`,
    'No file published here contains a child’s name or a school’s name. The sync script that ' +
    'produces this folder refuses to run if it finds either, and school counts are the only ' +
    'school-level information anywhere on the site.',
  ]);
}

export function unmount() {}
