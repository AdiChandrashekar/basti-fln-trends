/**
 * The shared chart grammar.
 *
 * Every encoding in this dashboard is defined once, here, so a user learns it
 * on one chart and it holds on every other. Nothing below decides what a number
 * means — it reads the pipeline's own columns and draws what they say:
 *
 *   source_tool          -> marker shape
 *   stability_flag       -> filled or hollow marker
 *   perfect_score_required -> gold tick above the marker
 *   change_defensibility -> segment dash, or no segment at all
 *   ci95_low / ci95_high -> uncertainty band, drawn only where both ends have one
 *
 * The consequence that matters: when the pipeline changes a metric_basis, the
 * lines redraw themselves correctly with no code change here.
 */

import { d3 } from './vendor.js';
import { strings, flagText } from './strings.js';
import { competencyName } from './competencies.js';
import { pct, pct1, cpm, nLabel, int, changePoints, changeGlyph, changeDirection, isMissing } from './format.js';

// ---------------------------------------------------------------------------
// Design tokens, read from CSS so colour lives in exactly one file
// ---------------------------------------------------------------------------

let tokenCache = new Map();

export function token(name) {
  if (!tokenCache.has(name)) {
    tokenCache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }
  return tokenCache.get(name);
}

/** Presentation mode changes line weights, so the cache must not outlive it. */
export function clearTokenCache() {
  tokenCache = new Map();
}

/** Series colour by domain. Source is carried by shape, never by colour. */
export function domainColour(domain) {
  if (domain === 'literacy') return token('--csf-blue');
  if (domain === 'numeracy') return token('--amber');
  return token('--ink');
}

export function changeColour(value) {
  const direction = changeDirection(value);
  if (direction === 'down') return token('--change-down');
  if (direction === 'up') return token('--change-up');
  return token('--change-flat');
}

/** Sequential scale for % achieving, interpolated through Lab. */
export function heatScale() {
  const stops = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'].map(token);
  return d3.scaleLinear()
    .domain(stops.map((_, i) => (i / (stops.length - 1)) * 100))
    .range(stops)
    .interpolate(d3.interpolateLab)
    .clamp(true);
}

/** Cell text flips to paper above this value, per tokens.css. */
export function heatTextColour(value) {
  const flip = Number(token('--heat-text-flip')) || 55;
  return isMissing(value) || value < flip ? token('--ink') : token('--paper');
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

/**
 * How a segment is drawn, keyed by the ARRIVING point's change_defensibility.
 * `metric_basis_changed` has no style because it is never drawn: the two ends
 * are different measures, so a line between them would assert a change that
 * does not exist.
 */
export const SEGMENT_STYLE = {
  within_tool: () => ({ dash: null, width: token('--line-within-tool') }),
  cross_tool_matched_construct: () => ({ dash: token('--dash-matched-construct'), width: token('--line-cross-tool') }),
  cross_tool_caveat: () => ({ dash: token('--dash-caveat'), width: token('--line-cross-tool') }),
};

export function segmentStyle(defensibility) {
  const style = SEGMENT_STYLE[defensibility];
  return style ? style() : null;
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

const R = 4.5;

/** SVG path for a marker shape, centred on the origin. */
export function markerPath(shape, r = R) {
  switch (shape) {
    case 'diamond':
      return `M0,${-r * 1.25} L${r * 1.15},0 L0,${r * 1.25} L${-r * 1.15},0 Z`;
    case 'square':
      return `M${-r},${-r} H${r} V${r} H${-r} Z`;
    default: {
      // Circle as a path, so every marker is one element type.
      const c = r * 0.5523;
      return `M0,${-r} C${c},${-r} ${r},${-c} ${r},0 C${r},${c} ${c},${r} 0,${r} ` +
             `C${-c},${r} ${-r},${c} ${-r},0 C${-r},${-c} ${-c},${-r} 0,${-r} Z`;
    }
  }
}

/**
 * The full marker specification for one row, read entirely from its columns.
 *
 * hollow: the value is not to be leaned on — a thin sample, an unreported
 *   sample size, or a ceiling where there is no room left to show change.
 * ring: the value combines two instruments assessed in the same period.
 * tick: achieving this task requires full marks.
 */
export function markerFor(row) {
  const tools = row.source_tools || [];
  let shape = 'circle';
  if (!row.is_pooled) {
    if (tools.includes('did_baseline')) shape = 'diamond';
    else if (tools.includes('did_midline')) shape = 'square';
  }
  const flags = row.reliability_flags || [];
  return {
    shape,
    hollow:
      row.stability_flag === 'thin' ||
      row.stability_flag === 'n_unknown' ||
      flags.includes('ceiling'),
    ring: Boolean(row.is_pooled),
    tick: Boolean(row.perfect_score_required),
  };
}

/**
 * Draw one marker into `group`, with its ring and gold tick where the data
 * calls for them. Returns the marker element so the caller can bind events.
 */
export function drawMarker(group, row, { x, y, colour, r = R, opacity = 1 } = {}) {
  const spec = markerFor(row);
  const node = group.append('g')
    .attr('transform', `translate(${x},${y})`)
    .attr('opacity', opacity);

  if (spec.ring) {
    node.append('path')
      .attr('d', markerPath(spec.shape, r * 1.8))
      .attr('fill', 'none')
      .attr('stroke', colour)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.55);
  }

  node.append('path')
    .attr('class', 'marker__shape')
    .attr('d', markerPath(spec.shape, r))
    .attr('fill', spec.hollow ? token('--paper') : colour)
    .attr('stroke', colour)
    .attr('stroke-width', spec.hollow ? 2 : 1);

  if (spec.tick) {
    node.append('line')
      .attr('x1', 0).attr('x2', 0)
      .attr('y1', -r - 4).attr('y2', -r - 10)
      .attr('stroke', token('--csf-gold'))
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .append('title')
      .text(strings.chart.perfectScoreTick);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Uncertainty
// ---------------------------------------------------------------------------

/**
 * Band spans, drawn only between consecutive points that BOTH carry a Wilson
 * interval AND are actually connected. Extending a band across a break would
 * imply the uncertainty carries over an instrument change, which it does not.
 * Pooled and DiD points have no interval and get none invented for them.
 */
export function ciSpans(segments) {
  return segments.filter(
    (s) =>
      s.connected &&
      !isMissing(s.from.ci95_low) && !isMissing(s.from.ci95_high) &&
      !isMissing(s.to.ci95_low) && !isMissing(s.to.ci95_high)
  );
}

export function drawCIBand(group, segments, { x, y }) {
  const spans = ciSpans(segments);
  const area = d3.area()
    .x((d) => x(d.period))
    .y0((d) => y(d.ci95_low))
    .y1((d) => y(d.ci95_high));

  for (const span of spans) {
    group.append('path')
      .attr('class', 'ci-band')
      .attr('d', area([span.from, span.to]))
      .attr('fill', token('--ci-band'))
      .attr('pointer-events', 'none');
  }
}

/** Whiskers, for small multiples where a band would be too heavy. */
export function drawCIWhisker(group, row, { x, y, colour }) {
  if (isMissing(row.ci95_low) || isMissing(row.ci95_high)) return;
  group.append('line')
    .attr('x1', x).attr('x2', x)
    .attr('y1', y(row.ci95_low)).attr('y2', y(row.ci95_high))
    .attr('stroke', colour)
    .attr('stroke-width', 1)
    .attr('opacity', 0.5)
    .attr('pointer-events', 'none');
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * Draw one competency's series: uncertainty, segments, the "≠" glyphs where a
 * step is not comparable, then markers on top.
 *
 * @param {object} options
 *   points     ordered trend points for one competency
 *   segments   from data.segmentsFor(points)
 *   x, y       scales
 *   colour     series colour (domain-derived)
 *   showCI     draw the Wilson band
 *   emphasis   'primary' | 'companion' — companions sit behind at lower weight
 */
export function drawSeries(group, { points, segments, x, y, colour, showCI = true, emphasis = 'primary' } = {}) {
  const series = group.append('g').attr('class', `series series--${emphasis}`);
  const weightScale = emphasis === 'companion' ? 0.65 : 1;

  if (showCI && emphasis === 'primary') drawCIBand(series, segments, { x, y });

  // Segments. A pair the pipeline marks as not comparable gets no path at all.
  for (const segment of segments) {
    if (!segment.connected) continue;
    const style = segmentStyle(segment.defensibility);
    if (!style) continue;
    series.append('path')
      .attr('class', `segment segment--${segment.defensibility}`)
      .attr('d', d3.line()
        .x((d) => x(d.period))
        .y((d) => y(d.pct_students_cleared))([segment.from, segment.to]))
      .attr('fill', 'none')
      .attr('stroke', colour)
      .attr('stroke-width', parseFloat(style.width) * weightScale)
      .attr('stroke-dasharray', style.dash)
      .attr('stroke-linecap', 'round');
  }

  // "≠" where two points sit on different measures. The gap is the message;
  // the glyph names it so the gap is not mistaken for missing data.
  for (const segment of segments) {
    if (segment.connected) continue;
    const mx = (x(segment.from.period) + x(segment.to.period)) / 2;
    const my = (y(segment.from.pct_students_cleared) + y(segment.to.pct_students_cleared)) / 2;
    const glyph = series.append('g')
      .attr('class', 'not-comparable')
      .attr('transform', `translate(${mx},${my})`)
      .attr('tabindex', 0)
      .attr('role', 'img')
      .attr('aria-label', strings.chart.notComparableGlyph);
    // The glyph has to read at a glance and often sits on a boundary rule, so
    // it carries a solid ground and a full-strength outline rather than a hairline.
    glyph.append('circle')
      .attr('r', 10)
      .attr('fill', token('--paper'))
      .attr('stroke', token('--change-flat'))
      .attr('stroke-width', 1.5);
    glyph.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.36em')
      .attr('font-size', 14)
      .attr('font-weight', 700)
      .attr('fill', token('--ink'))
      .text('≠');
    glyph.append('title').text(strings.chart.notComparableGlyph);
  }

  // Markers last, so they sit above the lines.
  const markers = series.append('g').attr('class', 'markers');
  for (const point of points) {
    drawMarker(markers, point, {
      x: x(point.period),
      y: y(point.pct_students_cleared),
      colour,
      r: emphasis === 'companion' ? R * 0.8 : R,
      opacity: emphasis === 'companion' ? 0.75 : 1,
    });
  }

  return series;
}

/**
 * Source-detail markers, at 50% opacity beside a pooled trend point, so the
 * user can see both instruments behind a combined number.
 */
export function drawSourceSatellites(group, details, { x, y, colour, offset = 13 } = {}) {
  const satellites = group.append('g').attr('class', 'satellites');
  const byPeriod = d3.group(details, (d) => d.period);
  for (const [period, rows] of byPeriod) {
    rows.forEach((row, index) => {
      const spread = (index - (rows.length - 1) / 2) * offset * 2;
      drawMarker(satellites, row, {
        x: x(period) + spread,
        y: y(row.pct_students_cleared),
        colour,
        r: R * 0.75,
        opacity: 0.5,
      });
    });
  }
  return satellites;
}

// ---------------------------------------------------------------------------
// Direct labelling
// ---------------------------------------------------------------------------

/** The latest value, always printed next to the last point. */
export function drawLatestLabel(group, points, { x, y, colour, name = null } = {}) {
  const last = points.at(-1);
  if (!last) return;
  const label = group.append('g').attr('class', 'latest-label');
  const text = label.append('text')
    .attr('x', x(last.period) + 12)
    .attr('y', y(last.pct_students_cleared))
    .attr('dy', '0.35em')
    // Numeric, not var(): SVG presentation attributes do not resolve CSS custom
    // properties, and a var() here silently falls back to the 16px default.
    .attr('font-size', 14)
    .attr('font-weight', 600)
    .attr('fill', colour)
    .text(pct(last.pct_students_cleared));
  if (name) {
    text.append('tspan')
      .attr('font-weight', 400)
      .attr('fill', token('--slate'))
      .text(`  ${name}`);
  }
  return label;
}

// ---------------------------------------------------------------------------
// Plot furniture
// ---------------------------------------------------------------------------

/** The gold column behind the latest period with data. */
export function drawLatestHighlight(group, slot, { x, height, bandWidth }) {
  if (!slot) return;
  const wash = group.append('g').attr('class', 'latest-highlight');
  wash.append('rect')
    .attr('x', x(slot.key) - bandWidth / 2)
    .attr('y', 0)
    .attr('width', bandWidth)
    .attr('height', height)
    .attr('fill', token('--latest-wash'))
    .attr('pointer-events', 'none');
  wash.append('text')
    .attr('x', x(slot.key))
    .attr('y', -6)
    .attr('text-anchor', 'middle')
    // SVG presentation attributes do not resolve CSS var(); these must be numeric.
    .attr('font-size', 12.8)
    .attr('font-weight', 600)
    .attr('fill', token('--slate'))
    .text(strings.chart.latest);
  return wash;
}

/** Faint vertical rules continuing each instrument change up through the plot. */
export function drawBoundaryRules(group, boundaries, { x, height, bandWidth }) {
  const rules = group.append('g').attr('class', 'boundary-rules');
  for (const boundary of boundaries) {
    rules.append('line')
      .attr('x1', x(boundary.key) - bandWidth / 2)
      .attr('x2', x(boundary.key) - bandWidth / 2)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', token('--ribbon-boundary-faint'))
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');
  }
  return rules;
}

/** Horizontal gridlines. The y-axis always runs 0 to 100 and is never truncated. */
export function drawGrid(group, y, width) {
  const grid = group.append('g').attr('class', 'grid');
  for (const value of y.ticks(5)) {
    grid.append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', y(value)).attr('y2', y(value))
      .attr('stroke', token('--rule'))
      .attr('stroke-width', 1);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/**
 * One tooltip structure, everywhere (build brief, section 5):
 *   1 competency and period    2 value and n      3 instrument and rule
 *   4 what kind of number it is  5 flags in plain words
 *   6 change from the previous point, with how far it can be trusted
 *   7 secondary values
 */
export function tooltipContent(row, { periodLabel, competency: name } = {}) {
  const parts = [];
  const displayName = name || competencyName(row.std_competency, { domain: row.domain });

  parts.push(`<div class="tt__head">${displayName}<span class="tt__period">${periodLabel || row.period_label || row.period}</span></div>`);

  // The headline number, with its unit made explicit.
  const isCpm = row.measure_unit === 'cpm';
  const valueLabel = row.metric_basis === 'did_pct_correct' ? '% correct (DiD baseline)' : strings.site.metric;
  parts.push(
    `<div class="tt__value"><strong>${pct1(row.pct_students_cleared)}</strong> ` +
    `<span class="tt__unit">${valueLabel}</span>` +
    `<span class="tt__n">${nLabel(row.n)}</span></div>`
  );

  parts.push('<hr class="tt__rule">');
  parts.push(`<div class="tt__row">${row.source_tool_label || '—'}</div>`);
  if (row.clearance_rule) {
    // The pipeline writes ">=" and "<="; on screen they should be real symbols.
    // Typography only — the rule itself is shown exactly as the pipeline states it.
    const rule = row.clearance_rule.replace(/>=/g, '≥').replace(/<=/g, '≤');
    parts.push(`<div class="tt__row tt__muted">Achieving: ${rule}</div>`);
  }

  // What kind of number this actually is, in plain words.
  const basisText = row.is_pooled
    ? strings.basis.pooled
    : strings.basis[row.metric_basis] || null;
  if (basisText) parts.push(`<div class="tt__row tt__muted">${basisText}</div>`);

  // Flags, translated. An unrecognised flag is humanised rather than dropped.
  const flags = (row.reliability_flags || []).filter((f) => f !== 'no_clearance_value');
  if (flags.length) {
    parts.push('<hr class="tt__rule">');
    parts.push(
      `<ul class="tt__flags">${flags.map((f) => `<li>${flagText(f)}</li>`).join('')}</ul>`
    );
  }

  // The change, and how far it can be trusted.
  if (!isMissing(row.change_pp) && row.change_defensibility) {
    parts.push('<hr class="tt__rule">');
    const notComparable = row.change_defensibility === 'metric_basis_changed';
    if (notComparable) {
      parts.push(`<div class="tt__row"><strong>${strings.defensibility.metric_basis_changed}</strong></div>`);
      parts.push('<div class="tt__row tt__muted">The difference is not shown as a change.</div>');
    } else {
      const glyph = changeGlyph(row.change_pp);
      parts.push(
        `<div class="tt__row tt__change" data-direction="${changeDirection(row.change_pp)}">` +
        `${glyph} ${changePoints(row.change_pp)} than ${row.prev_period_label || row.prev_period}</div>`
      );
      parts.push(`<div class="tt__row tt__muted">${strings.defensibility[row.change_defensibility] || ''}</div>`);
    }
  }

  // Secondary values, omitted rather than shown as dashes.
  const secondary = [];
  if (!isMissing(row.mean_pct_score)) secondary.push(`Mean score ${pct1(row.mean_pct_score)}`);
  if (!isMissing(row.mean_cpm)) secondary.push(`Mean ${cpm(row.mean_cpm)}`);
  if (!isMissing(row.pct_cleared_tool_flag)) secondary.push(`Tool's own flag ${pct1(row.pct_cleared_tool_flag)}`);
  if (!isMissing(row.n_schools)) secondary.push(`${int(row.n_schools)} schools`);
  if (secondary.length) {
    parts.push('<hr class="tt__rule">');
    parts.push(`<div class="tt__row tt__muted tt__secondary">${secondary.join('<br>')}</div>`);
  }

  if (isCpm && !isMissing(row.mean_cpm)) {
    parts.push(`<div class="tt__row tt__muted">Benchmark is 45 cpm.</div>`);
  }

  return parts.join('');
}

/**
 * A tooltip attached to one chart container. Hover shows it, click or Enter
 * pins it, Escape closes it. Pinning matters on a projector, where the
 * presenter needs the box to stay put while they talk.
 */
export function createTooltip(container) {
  const node = document.createElement('div');
  node.className = 'tooltip';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-live', 'polite');
  node.hidden = true;
  container.append(node);

  let pinned = false;

  function place(event) {
    const bounds = container.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    let left = event.clientX - bounds.left + 14;
    let top = event.clientY - bounds.top + 14;
    // Keep the box inside the chart rather than letting it hang off the edge.
    if (left + box.width > bounds.width) left = event.clientX - bounds.left - box.width - 14;
    if (top + box.height > bounds.height) top = Math.max(0, event.clientY - bounds.top - box.height - 14);
    node.style.left = `${Math.max(0, left)}px`;
    node.style.top = `${Math.max(0, top)}px`;
  }

  const api = {
    show(html, event) {
      if (pinned) return;
      node.innerHTML = html;
      node.hidden = false;
      if (event) place(event);
    },
    move(event) {
      if (!pinned && !node.hidden && event) place(event);
    },
    pin(html, event) {
      pinned = false;
      api.show(html, event);
      pinned = true;
      node.classList.add('tooltip--pinned');
      if (!node.querySelector('.tooltip__close')) {
        const close = document.createElement('button');
        close.className = 'tooltip__close';
        close.type = 'button';
        close.setAttribute('aria-label', strings.a11y.closeTooltip);
        close.textContent = '×';
        close.addEventListener('click', () => api.hide());
        node.prepend(close);
      }
    },
    hide() {
      pinned = false;
      node.hidden = true;
      node.classList.remove('tooltip--pinned');
    },
    get isPinned() {
      return pinned;
    },
    destroy() {
      node.remove();
    },
  };

  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') api.hide();
  });

  return api;
}

/**
 * Wire a marker (or any element) to the tooltip, by pointer and by keyboard.
 * Every interactive mark gets this, so the chart is fully usable without a mouse.
 */
export function bindTooltip(selection, tooltip, htmlFor) {
  selection
    .attr('tabindex', 0)
    .attr('role', 'button')
    .on('mouseenter', function (event, d) { tooltip.show(htmlFor(d ?? this.__data__), event); })
    .on('mousemove', (event) => tooltip.move(event))
    .on('mouseleave', () => { if (!tooltip.isPinned) tooltip.hide(); })
    .on('focus', function (event, d) {
      const box = this.getBoundingClientRect();
      tooltip.show(htmlFor(d ?? this.__data__), { clientX: box.left + box.width / 2, clientY: box.top });
    })
    .on('blur', () => { if (!tooltip.isPinned) tooltip.hide(); })
    .on('click', function (event, d) { tooltip.pin(htmlFor(d ?? this.__data__), event); })
    .on('keydown', function (event, d) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const box = this.getBoundingClientRect();
        tooltip.pin(htmlFor(d ?? this.__data__), { clientX: box.left, clientY: box.top });
      }
    });
}
