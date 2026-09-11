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
import { strings, flagText, instrumentLabel } from './strings.js';
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

/**
 * Sequential scale for % achieving.
 *
 * Quantised to the six palette stops rather than interpolated continuously. A
 * continuous ramp necessarily passes through a band of mid luminances where
 * NEITHER the ink nor the paper text colour reaches 4.5:1 against the fill, so
 * some cells were unreadable whichever colour the text took. Each of the six
 * stops clears the floor on its own, and banding the fills also makes the map
 * easier to read as classes rather than as a wash.
 */
export function heatScale() {
  const stops = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'].map(token);
  return d3.scaleQuantize().domain([0, 100]).range(stops);
}

/**
 * Relative luminance of a CSS colour, for contrast maths.
 *
 * Handles both notations on purpose: the design tokens are hex, while colours
 * that come back out of a d3 scale are rgb(). Parsing only one of them makes
 * every comparison against a token silently wrong.
 */
function toRgb(colour) {
  const value = String(colour).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const parts = value.match(/[\d.]+/g);
  return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
}

function luminance(colour) {
  const rgb = toRgb(colour);
  if (!rgb) return 1;
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text colour for a heatmap cell, chosen by measuring contrast against the
 * actual fill rather than flipping at a fixed value. A hardcoded threshold left
 * cells in the middle of the ramp at 3.8:1, under the 4.5:1 AA floor; measuring
 * also means the ramp can be re-tuned without silently breaking contrast.
 */
export function heatTextColour(value, fill = null) {
  if (isMissing(value)) return token('--ink');
  const background = fill || heatScale()(value);
  const ink = token('--ink');
  const paper = token('--paper');
  return contrastRatio(ink, background) >= contrastRatio(paper, background) ? ink : paper;
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
export function drawMarker(group, row, { x, y, colour, r = R, opacity = 1, strokeWidth = null } = {}) {
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
    .attr('stroke-width', strokeWidth ?? (spec.hollow ? 2 : 1));

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
 * Reference points: a DiD round that measured the same competency in the same
 * period as a district tool.
 *
 * These are deliberately NOT part of the series. The district value carries the
 * line; this sits beside it as a second reading of the same competency taken by
 * a different study, on a different measure (the baseline reports mean % correct,
 * the line reports the share of children achieving).
 *
 * The connector to the points either side is a fine dotted line in a neutral
 * grey — not the series colour, not either of the two dash patterns the series
 * uses. It says "here is where the other study sat", not "this is the path the
 * children took". The pipeline attaches no change value to these rows, so
 * nothing downstream can present the step as movement.
 */
export function drawReferencePoints(group, links, { x, y } = {}) {
  const layer = group.append('g').attr('class', 'references');
  const colour = token('--did-neutral');

  for (const { reference, before, after } of links) {
    const rx = x(reference.period);
    const ry = y(reference.pct_students_cleared);

    for (const neighbour of [before, after]) {
      if (!neighbour) continue;
      layer.append('path')
        .attr('class', 'reference-link')
        .attr('d', `M${x(neighbour.period)},${y(neighbour.pct_students_cleared)} L${rx},${ry}`)
        .attr('fill', 'none')
        .attr('stroke', colour)
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '1.5 4')
        .attr('stroke-linecap', 'round')
        .attr('opacity', 0.75)
        .attr('pointer-events', 'none');
    }
  }

  // Markers drawn after every connector, so no line crosses a point.
  const markers = layer.append('g').attr('class', 'reference-markers');
  for (const { reference } of links) {
    drawMarker(markers, reference, {
      x: x(reference.period),
      y: y(reference.pct_students_cleared),
      colour,
      // Larger and heavier than a marker on the line: this is the only mark
      // the DiD baseline gets, and it is hollow (its n is unknown), so at the
      // default weight it reads as a white diamond on a white plot.
      r: R * 1.4,
      strokeWidth: 2.6,
    });
  }

  return { layer, markers };
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

/**
 * Draw several series' end labels together, nudged apart where they collide.
 *
 * On the Overview all three domain lines can land within a point of each other,
 * and three labels stacked on one baseline is unreadable. Positions are solved
 * once for the group rather than per series.
 */
export function drawEndLabels(group, entries, { x, y, minGap = 18, narrow = false } = {}) {
  const placed = entries
    .filter((e) => e.point)
    .map((e) => ({ ...e, ideal: y(e.point.pct_students_cleared) }))
    .sort((a, b) => a.ideal - b.ideal);

  // One upward pass, then one downward pass: enough to separate a small group
  // without dragging any label far from the point it belongs to.
  for (let i = 1; i < placed.length; i += 1) {
    placed[i].at = Math.max(placed[i].ideal, (placed[i - 1].at ?? placed[i - 1].ideal) + minGap);
  }
  if (placed.length) placed[0].at = placed[0].at ?? placed[0].ideal;
  for (let i = placed.length - 2; i >= 0; i -= 1) {
    placed[i].at = Math.min(placed[i].at, placed[i + 1].at - minGap);
  }

  const layer = group.append('g').attr('class', 'latest-label');
  for (const entry of placed) {
    const px = x(entry.point.period) + 12;
    // A leader line where the label had to move, so it still reads as belonging
    // to its own line rather than floating.
    if (Math.abs(entry.at - entry.ideal) > 1.5) {
      layer.append('path')
        .attr('d', `M${px - 6},${entry.ideal} L${px - 2},${entry.at}`)
        .attr('fill', 'none')
        .attr('stroke', entry.colour)
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);
    }
    const text = layer.append('text')
      .attr('x', px)
      .attr('y', entry.at)
      .attr('dy', '0.35em')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .attr('fill', entry.colour)
      .text(pct(entry.point.pct_students_cleared));
    // On a narrow chart the series name would run off the edge, so the value
    // stands alone and the name is carried by the legend instead.
    if (entry.name && !narrow) {
      text.append('tspan')
        .attr('font-weight', 400)
        .attr('fill', token('--slate'))
        .text(`  ${entry.name}`);
    }
  }
  return layer;
}

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
// Legend
// ---------------------------------------------------------------------------

/**
 * A legend built from what is actually on the chart.
 *
 * Every encoding in this grammar means something — a dash pattern says how far
 * a change can be trusted, a hollow marker says the sample is thin — and none
 * of that is guessable. But a fixed legend listing all eleven keys on a chart
 * that uses three is its own kind of noise, so this inspects the rows being
 * drawn and emits only the keys the reader can actually see.
 *
 * @param {object} spec
 *   points      the trend points drawn
 *   segments    from data.segmentsFor()
 *   references  reference points drawn beside the line
 *   showLatest  whether the gold latest-round column is drawn
 *   colour      the series colour to draw line swatches in
 *   extra       [{svg, label}] entries a page wants to add
 */
export function drawGrammarLegend(root, {
  points = [], segments = [], references = [], showLatest = true,
  colour = null, extra = [],
} = {}) {
  const ink = colour || token('--csf-blue');
  const items = [];
  const has = (fn) => points.some(fn);

  const line = (dash, wConst) =>
    `<line x1="2" y1="8" x2="30" y2="8" stroke="${ink}" stroke-width="${wConst}"` +
    (dash ? ` stroke-dasharray="${dash}"` : '') + ' />';
  const mark = (shape, opts = {}) => {
    const r = opts.r || 5;
    const fill = opts.hollow ? token('--paper') : (opts.fill || ink);
    const ring = opts.ring
      ? `<path d="${markerPath(shape, r * 1.8)}" transform="translate(16,8)" fill="none" ` +
        `stroke="${ink}" stroke-width="1.5" opacity="0.55"/>` : '';
    const tick = opts.tick
      ? `<line x1="16" y1="0" x2="16" y2="3.5" stroke="${token('--csf-gold')}" ` +
        'stroke-width="2.5" stroke-linecap="round"/>' : '';
    return ring +
      `<path d="${markerPath(shape, r)}" transform="translate(16,${opts.tick ? 10 : 8})" ` +
      `fill="${fill}" stroke="${opts.fill || ink}" stroke-width="${opts.hollow ? 2 : 1}"/>` + tick;
  };

  // --- how a step is drawn --------------------------------------------------
  if (segments.some((sg) => sg.connected && sg.defensibility === 'within_tool')) {
    items.push({ svg: line(null, 2.5), label: strings.defensibility.within_tool });
  }
  if (segments.some((sg) => sg.connected && sg.defensibility === 'cross_tool_matched_construct')) {
    items.push({ svg: line('8 4', 2), label: strings.defensibility.cross_tool_matched_construct });
  }
  if (segments.some((sg) => sg.connected && sg.defensibility === 'cross_tool_caveat')) {
    items.push({ svg: line('3 3', 2), label: strings.defensibility.cross_tool_caveat });
  }
  if (segments.some((sg) => !sg.connected)) {
    items.push({
      svg: `<circle cx="16" cy="8" r="8" fill="${token('--paper')}" stroke="${token('--change-flat')}" stroke-width="1.5"/>` +
        `<text x="16" y="12" text-anchor="middle" font-size="11" font-weight="700" fill="${token('--ink')}">\u2260</text>`,
      label: 'Not comparable, so no line is drawn',
    });
  }

  // --- what a marker means --------------------------------------------------
  if (has((pt) => !pt.is_pooled && !pt.is_did_point)) {
    items.push({ svg: mark('circle'), label: 'District assessment tool' });
  }
  if (has((pt) => !pt.is_pooled && (pt.source_tools || []).includes('did_baseline'))) {
    items.push({ svg: mark('diamond'), label: `${strings.tools.did_baseline} (% correct)` });
  }
  if (has((pt) => !pt.is_pooled && (pt.source_tools || []).includes('did_midline'))) {
    items.push({ svg: mark('square'), label: strings.tools.did_midline });
  }
  if (has((pt) => pt.is_pooled)) {
    items.push({ svg: mark('circle', { ring: true }), label: 'Two instruments combined' });
  }
  if (has((pt) => markerFor(pt).hollow)) {
    items.push({ svg: mark('circle', { hollow: true }), label: 'Thin or unreported sample, or a ceiling' });
  }
  if (has((pt) => pt.perfect_score_required)) {
    items.push({ svg: mark('circle', { tick: true }), label: strings.chart.perfectScoreTick });
  }

  // --- context --------------------------------------------------------------
  if (references.length) {
    items.push({
      // Match the marker the chart actually draws, hollow and all. A solid
      // swatch sends the reader looking for a filled diamond that is not there.
      svg: `<line x1="2" y1="8" x2="30" y2="8" stroke="${token('--did-neutral')}" stroke-width="1.25" stroke-dasharray="1.5 4"/>` +
        `<path d="${markerPath('diamond', 6)}" transform="translate(16,8)" ` +
        `fill="${markerFor(references[0]).hollow ? token('--paper') : token('--did-neutral')}" ` +
        `stroke="${token('--did-neutral')}" stroke-width="${markerFor(references[0]).hollow ? 2.4 : 1}"/>`,
      label: strings.reference.legend,
    });
  }
  if (showLatest) {
    items.push({
      svg: `<rect x="2" y="0" width="28" height="16" fill="${token('--latest-wash')}"/>`,
      label: strings.chart.latest === 'Latest' ? 'The latest round' : strings.chart.latest,
    });
  }
  items.push(...extra);
  if (!items.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const item of items) {
    const entry = document.createElement('span');
    entry.className = 'legend__item';
    entry.innerHTML =
      `<svg class="legend__swatch" width="32" height="16" viewBox="0 0 32 16" aria-hidden="true">${item.svg}</svg>` +
      `<span>${item.label}</span>`;
    wrap.append(entry);
  }
  root.append(wrap);
  return wrap;
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
  parts.push(`<div class="tt__row">${instrumentLabel(row)}</div>`);
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
