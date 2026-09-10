/**
 * DiD snapshot: the baseline-to-End-of-Year story, told like for like.
 *
 * The trend pages deliberately never join the DiD baseline to anything, because
 * it reports an average % correct while the rest of the dashboard reports the
 * share of children achieving. This page is where the two DiD rounds are
 * compared with each other, which is the one comparison that IS like for like —
 * and it is drawn in a different colour so nobody carries the numbers back onto
 * the % achieving scale by mistake.
 */

import { d3 } from '../vendor.js';
import { load, didCompetencies, didDomainSummaries, bandsFor } from '../data.js';
import { chart, sourceNoteFor } from '../chart.js';
import { token, createTooltip, bindTooltip, markerPath } from '../grammar.js';
import { bandSpec, sourceLabel } from '../bands.js';
import { pageHeader, section } from '../controls.js';
import { competency } from '../competencies.js';
import { strings } from '../strings.js';
import { pct, pct1, cpm, int, nLabel, isMissing, list, fitLabel } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BASELINE_COLOUR = '--change-flat';
const EOY_COLOUR = '--did-neutral';

/** Change colour, but only ever within this page's own neutral palette. */
function changeInk(value) {
  if (isMissing(value) || Math.abs(value) < 2) return token('--change-flat');
  return value < 0 ? token('--change-down') : token('--did-neutral');
}

// ---------------------------------------------------------------------------
// Dumbbells
// ---------------------------------------------------------------------------

function dumbbells(root, { items, title, subtitle, unit, domainMax }) {
  if (!items.length) return;
  const isCpmChart = unit === 'cpm';
  const max = domainMax ?? Math.ceil(Math.max(...items.flatMap((i) => [i.baseline_mean, i.midline_mean])) / 10) * 10;

  chart({
    root,
    title,
    subtitle,
    ariaLabel:
      `Dumbbell chart of ${items.length} competencies from the Nov 2025 DiD baseline to the ` +
      `25-26 End of Year round: ` +
      items.map((i) => `${i.meta.name} ${i.baseline_mean.toFixed(1)} to ${i.midline_mean.toFixed(1)}`).join(', ') + '.',
    sourceNote: sourceNoteFor('did_baseline_midline_comparison.csv'),
    columns: [
      { key: 'competency', label: 'Competency' },
      { key: 'baseline', label: strings.did.baseline, num: true },
      { key: 'midline', label: strings.did.midline, num: true },
      { key: 'change', label: strings.did.change, num: true },
      { key: 'unit', label: 'Unit' },
    ],
    rows: items.map((i) => ({
      competency: i.meta.name,
      baseline: i.baseline_mean.toFixed(1),
      midline: i.midline_mean.toFixed(1),
      change: `${i.mean_change > 0 ? '+' : '−'}${Math.abs(i.mean_change).toFixed(1)}`,
      unit: isCpmChart ? 'correct words per minute' : '% correct',
    })),
    height: () => items.length * 34 + 56,
    render({ svg, width, container }) {
      const margin = { top: 20, right: 76, bottom: 30, left: Math.min(220, Math.max(140, width * 0.26)) };
      const innerWidth = Math.max(30, width - margin.left - margin.right);
      const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const tooltip = createTooltip(container);
      const x = d3.scaleLinear().domain([0, max]).range([0, innerWidth]);

      items.forEach((item, index) => {
        const cy = index * 34 + 10;
        const group = plot.append('g').attr('tabindex', 0).attr('role', 'button');

        group.append('text')
          .attr('x', -10).attr('y', cy).attr('dy', '0.32em').attr('text-anchor', 'end')
          .attr('font-size', 12.8).attr('fill', token('--ink'))
          .text(fitLabel(item.meta.name, margin.left - 14))
          .append('title').text(item.meta.name);

        const xa = x(item.baseline_mean);
        const xb = x(item.midline_mean);

        // The connector carries the direction; the arrowhead is the change.
        group.append('line')
          .attr('x1', xa).attr('x2', xb).attr('y1', cy).attr('y2', cy)
          .attr('stroke', changeInk(item.mean_change)).attr('stroke-width', 2.5)
          .attr('opacity', 0.55);

        group.append('path')
          .attr('d', markerPath('circle', 5)).attr('transform', `translate(${xa},${cy})`)
          .attr('fill', token('--paper')).attr('stroke', token(BASELINE_COLOUR)).attr('stroke-width', 2);
        group.append('path')
          .attr('d', markerPath('square', 5)).attr('transform', `translate(${xb},${cy})`)
          .attr('fill', token(EOY_COLOUR));

        group.append('text')
          .attr('x', innerWidth + 10).attr('y', cy).attr('dy', '0.32em')
          .attr('font-size', 12).attr('font-weight', 600).attr('fill', changeInk(item.mean_change))
          .text(`${item.mean_change > 0 ? '+' : '−'}${Math.abs(item.mean_change).toFixed(1)}`);

        const unitLabel = isCpmChart ? 'cpm' : '% correct';
        bindTooltip(group, tooltip, () =>
          `<div class="tt__head">${item.meta.name}<span class="tt__period">DiD baseline to 25-26 End of Year</span></div>` +
          `<div class="tt__value"><strong>${item.mean_change > 0 ? '+' : '−'}${Math.abs(item.mean_change).toFixed(1)}</strong>` +
          `<span class="tt__unit">${unitLabel}</span></div>` +
          `<hr class="tt__rule">` +
          `<div class="tt__row">${strings.did.baseline}: ${item.baseline_mean.toFixed(1)} ${unitLabel}</div>` +
          `<div class="tt__row">${strings.did.midline}: ${item.midline_mean.toFixed(1)} ${unitLabel}</div>` +
          (isMissing(item.midline_pct_zero_band) ? '' :
            `<hr class="tt__rule"><div class="tt__row tt__muted">` +
            `${pct(item.midline_pct_zero_band)} scored zero at the End of Year round</div>`)
        );
      });

      const axis = plot.append('g').attr('transform', `translate(0,${items.length * 34 + 2})`);
      axis.append('line').attr('x1', 0).attr('x2', innerWidth).attr('stroke', token('--rule'));
      for (const tick of x.ticks(5)) {
        axis.append('text')
          .attr('x', x(tick)).attr('y', 15).attr('text-anchor', 'middle')
          .attr('font-size', 12).attr('fill', token('--slate')).text(tick);
      }

      // The legend is HTML, below, so it wraps on a narrow screen rather than
      // running off the edge of the chart.
    },
  });

  const legend = el('div', 'legend');
  for (const [shape, colour, label] of [
    ['circle', BASELINE_COLOUR, strings.did.baseline],
    ['square', EOY_COLOUR, strings.did.midline],
  ]) {
    const entry = el('span', 'legend__item');
    const hollow = shape === 'circle';
    entry.innerHTML =
      `<svg class="legend__swatch" width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">` +
      `<path d="${markerPath(shape, 5)}" transform="translate(10,8)" ` +
      `fill="${hollow ? token('--paper') : token(colour)}" stroke="${token(colour)}" ` +
      `stroke-width="${hollow ? 2 : 1}"/></svg><span>${label}</span>`;
    legend.append(entry);
  }
  root.append(legend);
}

// ---------------------------------------------------------------------------
// Domain summary
// ---------------------------------------------------------------------------

function domainSummary(root, { summaries }) {
  const entries = Object.entries(summaries);
  if (!entries.length) return;

  const wrap = section(root, { title: strings.did.domainTitle });
  const grid = el('div', 'did-summary');

  for (const [domain, row] of entries) {
    const card = el('div', 'did-summary__item');
    card.append(el('div', 'did-summary__label',
      domain === 'literacy' ? strings.controls.literacy : strings.controls.numeracy));

    const track = el('div', 'did-summary__track');
    track.append(el('span', 'did-summary__from', pct1(row.baseline_mean)));
    const arrow = el('span', 'did-summary__arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    track.append(arrow);
    track.append(el('span', 'did-summary__to', pct1(row.midline_mean)));
    card.append(track);

    const change = el('div', 'did-summary__change',
      `${row.mean_change > 0 ? '+' : '−'}${Math.abs(row.mean_change).toFixed(1)} points`);
    change.style.color = changeInk(row.mean_change);
    card.append(change);

    // The note names exactly which competencies the average covers, which is
    // the difference between a domain summary and a domain claim.
    const covered = String(row.note || '').split(':').pop().split('|').map((s) => s.trim()).filter(Boolean);
    if (covered.length) {
      card.append(el('p', 'did-summary__note',
        `Averaged over ${covered.length} ${covered.length === 1 ? 'competency' : 'competencies'} with a ` +
        `stated mean in both rounds: ${list(covered.map((id) => competency(id).name))}.`));
    }
    grid.append(card);
  }
  wrap.append(grid);
}

// ---------------------------------------------------------------------------
// Competencies with no like-for-like comparison
// ---------------------------------------------------------------------------

function bandsOnlySection(root, ctx, { didRows, views }) {
  const bandsOnly = didCompetencies(didRows).filter(
    (r) => r.comparison_status === 'baseline_mean + midline_bands_only' || r.comparison_status === 'midline_only'
  );
  const baselineOnly = didCompetencies(didRows, { status: 'baseline_only' });
  if (!bandsOnly.length && !baselineOnly.length) return;

  const wrap = section(root, { title: strings.did.midlineOnlyTitle, subtitle: strings.did.midlineOnlySubtitle });

  if (bandsOnly.length) {
    const spec = bandSpec({ detail: 'tiers' });
    const eoyBands = bandsFor(views, { granularity: 'quarterly', period: 'Q4_2025', sourceTool: 'did_midline' });
    const byCompetency = d3.group(eoyBands, (d) => d.std_competency);

    const items = bandsOnly
      .map((row) => {
        const rows = byCompetency.get(row.std_competency) || [];
        return {
          id: row.std_competency,
          meta: competency(row.std_competency, { domain: row.domain }),
          status: row.comparison_status,
          baseline: row.baseline_mean,
          values: Object.fromEntries(rows.map((r) => [r.metric, r.value])),
          n: rows[0]?.n ?? null,
          bandSource: rows[0]?.band_source,
        };
      })
      .filter((i) => spec.some((s) => i.values[s.metric] !== undefined))
      .sort((a, b) =>
        (a.meta.domain === 'literacy' ? 0 : 1) - (b.meta.domain === 'literacy' ? 0 : 1) || a.meta.order - b.meta.order);

    if (items.length) {
      const ROW = 26;
      chart({
        root: wrap,
        title: '',
        subtitle: '',
        ariaLabel: `Stacked bars showing how children were distributed at the End of Year round on ${items.length} competencies.`,
        sourceNote: sourceNoteFor('nonstacking_competency_views.csv'),
        columns: [
          { key: 'competency', label: 'Competency' },
          { key: 'baseline', label: `${strings.did.baseline} (% correct)`, num: true },
          ...spec.map((s) => ({ key: s.metric, label: s.label(), num: true })),
        ],
        rows: items.map((i) => ({
          competency: i.meta.name,
          baseline: isMissing(i.baseline) ? '—' : i.baseline.toFixed(1),
          ...Object.fromEntries(spec.map((s) => [s.metric, pct1(i.values[s.metric] ?? null)])),
        })),
        height: () => items.length * ROW + 24,
        render({ svg, width, container }) {
          const margin = { top: 6, right: 12, bottom: 10, left: Math.min(230, Math.max(150, width * 0.28)) };
          const innerWidth = Math.max(30, width - margin.left - margin.right);
          const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
          const tooltip = createTooltip(container);
          const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

          items.forEach((item, index) => {
            const cy = index * ROW;
            const link = plot.append('a')
              .attr('href', ctx.hrefFor({ page: 'competency', competency: item.id }))
              .attr('aria-label',
                `${item.meta.name}: ` + spec.map((s) => `${s.label()} ${pct(item.values[s.metric] ?? 0)}`).join(', '));

            link.append('text')
              .attr('x', -10).attr('y', cy + ROW / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
              .attr('font-size', 12).attr('fill', token('--ink'))
              .text(fitLabel(item.meta.name, margin.left - 14))
              .append('title').text(item.meta.name);

            let offset = 0;
            for (const band of spec) {
              const value = item.values[band.metric];
              if (value === null || value === undefined) continue;
              const w = x(value);
              link.append('rect')
                .attr('x', offset).attr('y', cy + 3).attr('width', Math.max(0, w)).attr('height', ROW - 9)
                .attr('fill', token(band.colour))
                .append('title').text(`${band.label()}: ${pct1(value)}`);
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
              `<div class="tt__head">${item.meta.name}<span class="tt__period">${strings.did.midline}</span></div>` +
              `<div class="tt__value"><span class="tt__n">${nLabel(item.n)}</span></div><hr class="tt__rule">` +
              spec.map((s) => `<div class="tt__row">${s.label()}: <strong>${pct1(item.values[s.metric] ?? null)}</strong></div>`).join('') +
              (isMissing(item.baseline) ? '' :
                `<hr class="tt__rule"><div class="tt__row tt__muted">${strings.did.baseline}: ${item.baseline.toFixed(1)}% correct. ` +
                `The End of Year report gives no stated mean for this task, so there is nothing to compare it against.</div>`) +
              `<hr class="tt__rule"><div class="tt__row tt__muted">${sourceLabel(item.bandSource)}</div>`
            );
          });
        },
      });

      const legendWrap = el('div', 'legend');
      for (const band of spec) {
        const item = el('span', 'legend__item');
        item.innerHTML =
          `<span aria-hidden="true" style="display:inline-block;width:14px;height:10px;background:${token(band.colour)}"></span>` +
          `<span>${band.label()}</span>`;
        legendWrap.append(item);
      }
      wrap.append(legendWrap);
    }
  }

  if (baselineOnly.length) {
    const note = el('div', 'notice');
    note.append(el('p', null,
      `The DiD baseline also measured ` +
      `${list(baselineOnly.map((r) => competency(r.std_competency, { domain: r.domain }).name))}, ` +
      `which the End of Year round did not repeat. Those have a baseline figure and nothing to compare it with.`));
    wrap.append(note);
  }
}

// ---------------------------------------------------------------------------

export async function mount(root, ctx) {
  const [didRows, views] = await Promise.all([load.did(), load.views()]);
  if (ctx.signal?.aborted) return;

  pageHeader(root, { title: strings.did.title, intro: strings.did.contextHeader });

  const metricNote = el('div', 'notice');
  metricNote.append(el('p', null, strings.did.metricNote));
  root.append(metricNote);

  if (!didRows) {
    root.append(el('p', 'empty-state', strings.chart.noData));
    return;
  }

  // --- Like for like: both rounds state a mean --------------------------------
  const bothMeans = didCompetencies(didRows, { status: 'both_means' })
    .map((row) => ({ ...row, meta: competency(row.std_competency, { domain: row.domain }) }));

  const pctItems = bothMeans
    .filter((i) => i.unit === 'pct' && !isMissing(i.baseline_mean) && !isMissing(i.midline_mean))
    .sort((a, b) => b.mean_change - a.mean_change);
  const cpmItems = bothMeans
    .filter((i) => i.unit === 'cpm' && !isMissing(i.baseline_mean) && !isMissing(i.midline_mean));

  const compare = section(root, {});
  dumbbells(compare, {
    items: pctItems,
    title: strings.did.dumbbellTitle,
    subtitle: strings.did.dumbbellSubtitle,
    unit: 'pct',
    domainMax: 100,
  });

  domainSummary(root, { summaries: didDomainSummaries(didRows) });

  if (cpmItems.length) {
    const fluency = section(root, { title: strings.did.orfTitle, subtitle: strings.did.orfSubtitle });
    dumbbells(fluency, { items: cpmItems, title: '', subtitle: '', unit: 'cpm', domainMax: 60 });
    const benchmark = el('p', 'section__subtitle');
    benchmark.textContent =
      `Both rounds sit below the 45 cpm benchmark for Grade 2. ` +
      `Children can decode when given time; they are not yet reading at the pace meaning-making needs.`;
    fluency.append(benchmark);
  }

  if (views) bandsOnlySection(root, ctx, { didRows, views });
}

export function unmount() {}
