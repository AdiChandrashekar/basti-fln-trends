/**
 * Overview: a twenty-second answer to "how is Grade 2 doing, and is it improving?"
 *
 * Four things, in the order a district official reads them:
 *   1. the domain trend, with the instrument ribbon underneath
 *   2. the latest round's three headline figures
 *   3. where every competency stands right now, ranked
 *   4. the editorial notes
 */

import { d3 } from '../vendor.js';
import {
  load, loadTrends, periodSlots, trendPoints, domainSeries, referenceLinks,
} from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { timePlot } from '../timeplot.js';
import {
  drawSeries, drawEndLabels, drawReferencePoints, token, domainColour,
  createTooltip, bindTooltip, tooltipContent, drawMarker,
} from '../grammar.js';
import { controlBar, monthlyNotice, pageHeader, section } from '../controls.js';
import { competency, competencyName } from '../competencies.js';
import { strings, instrumentLabel } from '../strings.js';
import { pct, pct1, int, nLabel, changePoints, changeGlyph, changeDirection, periodLabel, quarterAxisLabel, isMissing } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The three domain series, in draw order. Overall is heaviest and drawn last. */
const SERIES = [
  { key: 'literacy_pct_cleared', changeKey: 'change_literacy_pp_vs_prev', name: 'Literacy', colour: '--csf-blue', weight: '--line-domain' },
  { key: 'numeracy_pct_cleared', changeKey: 'change_numeracy_pp_vs_prev', name: 'Numeracy', colour: '--amber', weight: '--line-domain' },
  { key: 'overall_pct_cleared', changeKey: 'change_overall_pp_vs_prev', name: 'Overall', colour: '--ink', weight: '--line-overall' },
];

/**
 * Shape a domain row so the shared grammar can draw it: the grammar reads
 * `pct_students_cleared`, `source_tools` and `change_defensibility`, which the
 * domain file carries under different names.
 */
function asPoint(row, series) {
  return {
    ...row,
    pct_students_cleared: row[series.key],
    change_pp: row[series.changeKey],
    n: row.n_students,
    reliability_flags: [],
    stability_flag: row.n_students === null ? 'n_unknown' : 'robust',
    perfect_score_required: false,
    ci95_low: null,
    ci95_high: null,
    measure_unit: 'pct',
    metric_basis: row.includes_did ? 'slide_top_band_gt75' : 'pct_students_cleared',
    clearance_rule: null,
    std_competency: series.name,
  };
}

function segmentsOf(points) {
  const out = [];
  for (let i = 1; i < points.length; i += 1) {
    const to = points[i];
    if (!to.change_defensibility) continue;
    out.push({
      from: points[i - 1],
      to,
      defensibility: to.change_defensibility,
      connected: to.change_defensibility !== 'metric_basis_changed',
      change_pp: to.change_pp,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hero: the domain trend
// ---------------------------------------------------------------------------

function heroChart(root, ctx, { domainRows, slots, granularity, quarterlyRows }) {
  const series = domainSeries(domainRows, granularity, quarterlyRows);
  const refs = ctx.state.showDid
    ? domainRows.filter(
        (r) => r.row_type === 'reference_point' &&
               r.period_type === (granularity === 'monthly' ? 'month' : 'quarter')
      )
    : [];

  const visible = SERIES.filter(
    (s) => ctx.state.domain === 'all' || s.key.startsWith(ctx.state.domain) || s.key.startsWith('overall')
  );

  const columns = [
    { key: 'period', label: 'Round' },
    { key: 'instrument', label: 'Instrument' },
    { key: 'overall', label: 'Overall %', num: true },
    { key: 'literacy', label: 'Literacy %', num: true },
    { key: 'numeracy', label: 'Numeracy %', num: true },
    { key: 'n', label: 'Children', num: true },
    { key: 'comparable', label: 'Comparable with previous' },
  ];
  const rows = series.map((r) => ({
    period: periodLabel(r.period, { granularity }),
    instrument: instrumentLabel(r),
    overall: pct1(r.overall_pct_cleared),
    literacy: pct1(r.literacy_pct_cleared),
    numeracy: pct1(r.numeracy_pct_cleared),
    n: r.n_students === null ? strings.units.nNotReported : int(r.n_students),
    comparable: r.change_defensibility ? strings.defensibility[r.change_defensibility] : '—',
  }));

  chart({
    root,
    title: strings.overview.heroTitle,
    subtitle: strings.overview.heroSubtitle,
    ariaLabel:
      `Line chart of % achieving over ${series.length} rounds. ` +
      series.map((r) => `${periodLabel(r.period, { granularity })}: overall ${pct(r.overall_pct_cleared)}`).join(', ') + '.',
    sourceNote: sourceNoteFor('domain_level_trend.csv'),
    columns,
    rows,
    height: (width) => (width < 560 ? 340 : 400),
    render({ svg, width, height, container }) {
      const { plot, x, y, bandWidth } = timePlot({
        svg, width, height, slots, granularity, yLabel: strings.site.metric,
      });
      const tooltip = createTooltip(container);

      // Reference points first, so the series sits above them.
      if (refs.length) {
        for (const series_ of visible) {
          const points = series.map((r) => asPoint(r, series_));
          const refPoints = refs.map((r) => asPoint(r, series_));
          drawReferencePoints(plot, referenceLinks(points, refPoints), { x, y });
        }
      }

      const ends = [];
      for (const spec of visible) {
        const points = series.map((r) => asPoint(r, spec));
        const colour = token(spec.colour);
        const group = drawSeries(plot, {
          points,
          segments: segmentsOf(points),
          x, y, colour,
          showCI: false,
          emphasis: spec.key.startsWith('overall') ? 'primary' : 'companion',
        });
        group.selectAll('.segment').attr('stroke-width', function () {
          const base = parseFloat(token(spec.weight));
          const dashed = this.getAttribute('stroke-dasharray');
          return dashed ? base * 0.85 : base;
        });
        ends.push({ point: points.at(-1), colour, name: spec.name });

        const label = (row) => domainTooltip(row, spec, granularity, domainRows);
        bindTooltip(group.selectAll('.markers > g').data(points), tooltip, label);
      }

      // Direct labels instead of a legend: three series, solved together so the
      // rounds where all three land on the same value stay readable.
      drawEndLabels(plot, ends, { x, y });
    },
  });
}

/**
 * The domain tooltip adds what the standard one cannot know: which competencies
 * this rollup covered in this round, and why that matters.
 */
function domainTooltip(row, spec, granularity, domainRows) {
  const parts = [tooltipContent(row, {
    periodLabel: periodLabel(row.period, { granularity }),
    competency: spec.name,
  })];

  const list = spec.key.startsWith('numeracy')
    ? row.numeracy_competencies
    : spec.key.startsWith('literacy')
      ? row.literacy_competencies
      : [...row.literacy_competencies, ...row.numeracy_competencies];

  if (list.length) {
    parts.push('<hr class="tt__rule">');
    parts.push(
      `<div class="tt__row tt__muted">Averaged across ${list.length} ` +
      `${list.length === 1 ? 'competency' : 'competencies'}: ` +
      `${list.map((id) => competencyName(id)).join(', ')}</div>`
    );
  }
  if (row.coverage_note) {
    parts.push(`<div class="tt__row tt__muted">${row.coverage_note}</div>`);
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Latest-round strip
// ---------------------------------------------------------------------------

/**
 * One band, not three cards.
 *
 * The change line is the only display computation allowed on this page: it
 * appears only when this round and the previous one came from the same
 * instrument family. Otherwise it says so, rather than printing a difference
 * that mixes two tests.
 */
function latestStrip(root, { domainRows, granularity, quarterlyRows }) {
  const series = domainSeries(domainRows, granularity, quarterlyRows);
  const latest = series.at(-1);
  const previous = series.at(-2);
  if (!latest) return;

  const comparable = latest.same_tool_family_as_prev === true;

  const strip = el('div', 'latest-strip');
  const head = el('div', 'latest-strip__head');
  head.append(el('span', 'latest-strip__label', strings.overview.latestStrip));
  head.append(el('span', 'latest-strip__period', periodLabel(latest.period, { granularity })));
  head.append(el('span', 'latest-strip__meta', instrumentLabel(latest)));
  head.append(el('span', 'latest-strip__meta', nLabel(latest.n_students)));
  strip.append(head);

  const figures = el('div', 'latest-strip__figures');
  // Overall first, then Literacy, then Numeracy: the order the brief names them
  // and the order a reader wants them, which is not the draw order.
  const stripOrder = ['overall_pct_cleared', 'literacy_pct_cleared', 'numeracy_pct_cleared']
    .map((key) => SERIES.find((s) => s.key === key));
  for (const spec of stripOrder) {
    const item = el('div', 'figure');
    item.append(el('div', 'figure__value', pct(latest[spec.key])));
    item.append(el('div', 'figure__label', spec.name));

    const change = latest[spec.changeKey];
    const note = el('div', 'figure__change');
    if (!comparable || isMissing(change) || !previous) {
      note.classList.add('figure__change--muted');
      note.textContent = strings.overview.latestNotComparable;
    } else {
      note.dataset.direction = changeDirection(change);
      note.textContent =
        `${changeGlyph(change)} ${changePoints(change)} than ${periodLabel(previous.period, { granularity })}`;
    }
    item.append(note);
    figures.append(item);
  }
  strip.append(figures);
  root.append(strip);
}

// ---------------------------------------------------------------------------
// Where competencies stand now
// ---------------------------------------------------------------------------

/**
 * What to call the round a competency was last assessed in.
 *
 * District rounds get their quarter code, which is what everyone says out loud.
 * The two DiD rounds get their own names instead: calling the End of Year round
 * "Q4 2025" would be technically right and completely unhelpful, since it ran in
 * March 2026.
 */
function roundLabelFor(point, granularity) {
  const tools = point.source_tools || [];
  if (tools.includes('did_midline')) return 'EoY';
  if (tools.includes('did_baseline')) return 'DiD baseline';
  if (granularity === 'monthly') return periodLabel(point.period, { granularity });
  return quarterAxisLabel(point.period, point.period_label).secondary;
}

function standingPlot(root, ctx, { rows, granularity }) {
  const points = trendPoints(rows, { domain: ctx.state.domain, showDid: ctx.state.showDid });

  // The latest round each competency was measured in — not necessarily the
  // latest round overall, because instruments test different sets.
  const latestByCompetency = new Map();
  for (const point of points) {
    const held = latestByCompetency.get(point.std_competency);
    if (!held || point.period_sort > held.period_sort) latestByCompetency.set(point.std_competency, point);
  }

  const items = [...latestByCompetency.values()].map((point) => ({
    point,
    meta: competency(point.std_competency, { domain: point.domain }),
    roundLabel: roundLabelFor(point, granularity),
    roundSort: point.period_sort,
    // The most recent same-test change, where the pipeline recorded one.
    withinToolChange: point.change_defensibility === 'within_tool' ? point.change_pp : null,
  }));

  if (!items.length) {
    root.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  // Grouped by the round each competency was last assessed in, most recent
  // first, so a reader sees what is current before what is months old. Domain
  // becomes a sub-heading inside a round that holds both.
  const rounds = [...d3.group(items, (d) => d.roundLabel)]
    .map(([label, groupItems]) => ({
      label,
      sort: d3.max(groupItems, (d) => d.roundSort),
      domains: [...d3.group(groupItems, (d) => d.meta.domain)]
        .sort((a, b) => (a[0] === 'literacy' ? 0 : 1) - (b[0] === 'literacy' ? 0 : 1))
        .map(([domainKey, domainItems]) => ({
          domain: domainKey,
          items: domainItems.sort((a, b) => b.point.pct_students_cleared - a.point.pct_students_cleared),
        })),
      count: groupItems.length,
    }))
    .sort((a, b) => d3.descending(a.sort, b.sort));

  const columns = [
    { key: 'round', label: 'Last assessed' },
    { key: 'competency', label: 'Competency' },
    { key: 'domain', label: 'Domain' },
    { key: 'value', label: '% achieving', num: true },
    { key: 'instrument', label: 'Instrument' },
    { key: 'n', label: 'Children', num: true },
    { key: 'change', label: 'Latest same-test change', num: true },
  ];
  const tableRows = rounds.flatMap((round) =>
    round.domains.flatMap((group) =>
      group.items.map(({ point, meta, withinToolChange }) => ({
        round: round.label,
        competency: meta.name,
        domain: meta.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy,
        value: pct1(point.pct_students_cleared),
        instrument: instrumentLabel(point),
        n: point.n === null ? strings.units.nNotReported : int(point.n),
        change: withinToolChange === null ? '—' : withinToolChange.toFixed(1),
      }))));

  const ROW = 22;
  const ROUND_GAP = 34;
  const DOMAIN_GAP = 22;
  const totalHeight = rounds.reduce(
    (sum, round) => sum + ROUND_GAP + round.domains.reduce(
      (inner, group) => inner + (round.domains.length > 1 ? DOMAIN_GAP : 0) + group.items.length * ROW, 0), 0);

  chart({
    root,
    title: strings.overview.standingTitle,
    subtitle: strings.overview.standingSubtitle,
    ariaLabel:
      `Dot plot of ${items.length} competencies grouped by the round each was last assessed in, ` +
      `most recent first. ` +
      rounds.map((r) => `${r.label}: ${r.count} competencies`).join('; ') + '.',
    sourceNote: sourceNoteFor(granularity === 'monthly' ? 'monthly_trends.csv' : 'quarterly_trends.csv'),
    columns,
    rows: tableRows,
    height: () => totalHeight + 40,
    render({ svg, width, container }) {
      const margin = { top: 8, right: 130, bottom: 26, left: Math.min(240, Math.max(150, width * 0.28)) };
      const innerWidth = Math.max(10, width - margin.left - margin.right);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);

      let y = 0;
      for (const round of rounds) {
        // The round heading is the label the brief asked for: it names the
        // period, and it is also what orders the list.
        const heading = plot.append('g');
        heading.append('text')
          .attr('x', -margin.left + 2).attr('y', y + 14)
          .attr('font-size', 12.8).attr('font-weight', 700)
          .attr('fill', token('--csf-navy'))
          .text(round.label);
        heading.append('text')
          .attr('x', -margin.left + 2).attr('y', y + 27)
          .attr('font-size', 11).attr('fill', token('--slate'))
          .text(`${round.count} ${round.count === 1 ? 'competency' : 'competencies'}`);
        heading.append('line')
          .attr('x1', 0).attr('x2', innerWidth).attr('y1', y + 20).attr('y2', y + 20)
          .attr('stroke', token('--rule'));
        y += ROUND_GAP;

        for (const group of round.domains) {
          if (round.domains.length > 1) {
            plot.append('text')
              .attr('x', -margin.left + 2).attr('y', y + 12)
              .attr('font-size', 11).attr('font-weight', 600).attr('fill', token('--slate'))
              .text(group.domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy);
            y += DOMAIN_GAP;
          }

          for (const item of group.items) {
            const cy = y + ROW / 2;
            const colour = domainColour(item.meta.domain);

            plot.append('line')
              .attr('x1', 0).attr('x2', innerWidth).attr('y1', cy).attr('y2', cy)
              .attr('stroke', token('--rule')).attr('stroke-width', 1);
            plot.append('line')
              .attr('x1', 0).attr('x2', x(item.point.pct_students_cleared)).attr('y1', cy).attr('y2', cy)
              .attr('stroke', colour).attr('stroke-width', 1.5).attr('opacity', 0.35);

            const link = plot.append('a')
              .attr('href', ctx.hrefFor({ page: 'competency', competency: item.point.std_competency }))
              .attr('aria-label',
                `${item.meta.name}, ${item.meta.domain}, last assessed ${item.roundLabel}, ` +
                `${pct(item.point.pct_students_cleared)} achieving. Open in the competency explorer.`);

            link.append('text')
              .attr('x', -10).attr('y', cy).attr('dy', '0.32em')
              .attr('text-anchor', 'end').attr('font-size', 12.8)
              .attr('fill', token('--ink'))
              .text(item.meta.name.length > 34 ? `${item.meta.name.slice(0, 33)}\u2026` : item.meta.name)
              .append('title').text(item.meta.name);

            drawMarker(link, item.point, { x: x(item.point.pct_students_cleared), y: cy, colour });

            link.append('text')
              .attr('x', innerWidth + 12).attr('y', cy).attr('dy', '0.32em')
              .attr('font-size', 12.8).attr('font-weight', 600)
              .attr('fill', token('--ink'))
              .text(pct(item.point.pct_students_cleared));

            if (item.withinToolChange !== null) {
              link.append('text')
                .attr('x', innerWidth + 52).attr('y', cy).attr('dy', '0.32em')
                .attr('font-size', 12).attr('fill', token(`--change-${changeDirection(item.withinToolChange)}`))
                .text(`${changeGlyph(item.withinToolChange)} ${Math.abs(item.withinToolChange).toFixed(1)}`)
                .append('title').text(`${changePoints(item.withinToolChange)} than the previous round, same test`);
            }

            bindTooltip(link, tooltip, () =>
              tooltipContent(item.point, {
                periodLabel: periodLabel(item.point.period, { granularity, quarterLabel: item.point.period_label }),
                competency: item.meta.name,
              })
            );
            y += ROW;
          }
        }
      }

      // Axis under the dots, so the reader can place a value without a gridline
      // running through every row.
      const axis = plot.append('g').attr('transform', `translate(0,${y + 6})`);
      axis.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke', token('--rule'));
      for (const tick of [0, 25, 50, 75, 100]) {
        axis.append('text')
          .attr('x', x(tick)).attr('y', 16).attr('text-anchor', 'middle')
          .attr('font-size', 12.8).attr('fill', token('--slate'))
          .text(`${tick}%`);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Key findings
// ---------------------------------------------------------------------------

async function keyFindings(root, ctx) {
  let notes = [];
  try {
    const response = await fetch('content/notes.json', { cache: 'no-cache' });
    if (response.ok) notes = await response.json();
  } catch {
    notes = [];
  }
  if (!notes.length || ctx.signal?.aborted) return;

  const wrap = section(root, { title: strings.overview.findingsTitle });
  const grid = el('div', 'notes');
  for (const note of notes.slice(0, 6)) {
    const card = el('article', 'note');
    card.append(el('h3', 'note__title', note.title));
    card.append(el('p', 'note__body', note.body));
    if (note.link_hash) {
      const link = el('a', 'note__link', 'See the detail');
      link.href = note.link_hash;
      card.append(link);
    }
    grid.append(card);
  }
  wrap.append(grid);
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const granularity = ctx.state.granularity;
  const [rows, quarterlyRows, domainRows] = await Promise.all([
    loadTrends(granularity), load.quarterly(), load.domain(),
  ]);

  pageHeader(root, { title: strings.overview.title });
  controlBar(root, ctx, { show: ['granularity', 'domain', 'did'] });
  monthlyNotice(root, ctx);

  const slots = periodSlots(rows, granularity, quarterlyRows);

  const hero = section(root, {});
  heroChart(hero, ctx, { domainRows, slots, granularity, quarterlyRows });
  latestStrip(hero, { domainRows, granularity, quarterlyRows });

  const standing = section(root, {});
  standingPlot(standing, ctx, { rows, granularity });

  await keyFindings(root, ctx);
}

export function unmount() {}
