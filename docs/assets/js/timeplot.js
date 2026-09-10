/**
 * The standard time plot: axes, gridlines, the latest-period highlight, the
 * instrument-change rules and the ribbon, assembled the same way every time.
 *
 * A page calls `timePlot()` and gets back the scales and a group to draw into.
 * Because every time chart is built here, the y-axis cannot be truncated by
 * accident and the ribbon cannot be forgotten — both are structural.
 */

import { d3 } from './vendor.js';
import { token, drawGrid, drawLatestHighlight, drawBoundaryRules } from './grammar.js';
import { drawRibbon, ribbonModel, ribbonSummary } from './ribbon.js';
import { quarterAxisLabel, monthLabel } from './format.js';
import { latestPeriodWithData } from './data.js';

/**
 * @param {object} options
 *   svg          the chart frame's svg selection
 *   width,height its pixel size
 *   slots        period slots in order, from data.periodSlots()
 *   granularity  'quarterly' | 'monthly'
 *   ribbonHeight 14 inline, 10 compact, 28 display
 *   showCohort   draw the "New Grade 2 cohort" marker
 *   yLabel       axis title, e.g. "% achieving"
 *   yMax         100 for percentages. Only ever changed for cpm charts.
 *
 * @returns {{plot, x, y, bandWidth, innerWidth, innerHeight, latest, summary}}
 */
export function timePlot({
  svg, width, height, slots, granularity = 'quarterly',
  ribbonHeight = 14, showCohort = true, yLabel = '% achieving', yMax = 100,
} = {}) {
  const axisLines = granularity === 'quarterly' ? 2 : 1;
  const cohortRoom = showCohort ? 16 : 0;
  const margin = {
    // Room for the axis title and the "Latest" label, stacked rather than
    // overlapping: a rotated title beside the ticks collides with "100%".
    top: 40,
    right: 74,                                 // room for the end-of-line value
    bottom: 12 + axisLines * 15 + ribbonHeight + cohortRoom,
    left: 46,
  };

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const x = d3.scalePoint()
    .domain(slots.map((slot) => slot.key))
    .range([0, innerWidth])
    .padding(0.5);

  // A percentage axis always runs the full 0 to 100. Never truncated, so the
  // size of a move is never exaggerated by the frame it is drawn in.
  const y = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]).nice(yMax === 100 ? 5 : 4);
  if (yMax === 100) y.domain([0, 100]);

  const bandWidth = slots.length > 1 ? x.step() : innerWidth;

  const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Plot tint, so the data area is distinguishable from the page.
  plot.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', token('--mist'));

  const latest = latestPeriodWithData(slots);
  drawLatestHighlight(plot, latest, { x, height: innerHeight, bandWidth });
  drawGrid(plot, y, innerWidth);

  const { boundaries } = ribbonModel(slots);
  drawBoundaryRules(plot, boundaries, { x, height: innerHeight, bandWidth });

  // --- Y axis -------------------------------------------------------------
  const yAxis = plot.append('g').attr('class', 'axis axis--y');
  for (const value of y.ticks(5)) {
    yAxis.append('text')
      .attr('x', -10)
      .attr('y', y(value))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('font-size', 12.8)
      .attr('fill', token('--slate'))
      .text(yMax === 100 ? `${value}%` : value);
  }
  // Horizontal, above the plot. A rotated title is harder to read and has
  // nowhere to sit beside a "100%" tick without touching it.
  yAxis.append('text')
    .attr('x', -margin.left + 2)
    .attr('y', -22)
    .attr('font-size', 12.8)
    .attr('font-weight', 500)
    .attr('fill', token('--slate'))
    .text(yLabel);

  // --- X axis -------------------------------------------------------------
  const xAxis = plot.append('g')
    .attr('class', 'axis axis--x')
    .attr('transform', `translate(0,${innerHeight})`);

  xAxis.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('stroke', token('--rule'));

  for (const slot of slots) {
    const cx = x(slot.key);
    // An empty period keeps its slot and is drawn muted, so the gap in the
    // series reads as "not assessed" rather than as a shorter timeline.
    const muted = !slot.hasData;
    if (granularity === 'quarterly') {
      const label = quarterAxisLabel(slot.key, slot.label);
      xAxis.append('text')
        .attr('x', cx).attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12.8)
        .attr('fill', muted ? token('--change-flat') : token('--ink'))
        .text(label.primary);
      xAxis.append('text')
        .attr('x', cx).attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', token('--slate'))
        .text(label.secondary);
    } else {
      xAxis.append('text')
        .attr('x', cx).attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', muted ? token('--change-flat') : token('--ink'))
        .attr('transform', slots.length > 10 ? `rotate(-40,${cx},16)` : null)
        .attr('text-anchor', slots.length > 10 ? 'end' : 'middle')
        .text(monthLabel(slot.key));
    }
  }

  // --- Ribbon -------------------------------------------------------------
  const ribbonTop = innerHeight + 12 + axisLines * 15;
  drawRibbon(plot.append('g').attr('transform', `translate(0,${ribbonTop})`), {
    slots, x, bandWidth, height: ribbonHeight, showCohort,
  });

  return {
    plot, x, y, bandWidth, innerWidth, innerHeight, margin, latest,
    summary: ribbonSummary(slots),
  };
}
