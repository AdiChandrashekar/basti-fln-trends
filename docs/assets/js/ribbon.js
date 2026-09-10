/**
 * The instrument ribbon.
 *
 * A thin band under every time axis showing which assessment instrument
 * produced each period. It is the one visual device that makes every
 * cross-instrument jump in this dashboard self-explaining: when a line steps,
 * the ribbon underneath says whether the test changed at the same moment.
 *
 * Nothing here is declared. Segments are derived from the source_tool values
 * present in each period, so a new instrument in a future round draws itself.
 *
 *      ┌────────────┬───────────────┬─────────┬──────────────────────┐
 *      │ July + Aug │ Q3 2025 tool ◆│ ■       │ 2026 SSP             │
 *      └────────────┴───────────────┴─────────┴──────────────────────┘
 *                                              ▲ New Grade 2 cohort
 */

import { d3 } from './vendor.js';
import { token } from './grammar.js';
import { strings } from './strings.js';

/**
 * Human labels for tool families, in the order the instruments were used.
 *
 * The order matters: where two instruments share a period, the ribbon reads
 * "July tool + Aug tool", which is the order they were actually administered.
 * Sorting alphabetically would print "Aug tool + July tool" and quietly imply
 * the wrong sequence. Unknown families are humanised and sort to the end.
 */
const FAMILY_LABELS = {
  july_tool: 'July tool',
  aug_tool: 'Aug tool',
  q3_2025_tool: 'Q3 2025 tool',
  '2026_tool': '2026 SSP',
  did: 'DiD study',
};

const FAMILY_ORDER = Object.keys(FAMILY_LABELS);

function familyRank(family) {
  const index = FAMILY_ORDER.indexOf(family);
  return index === -1 ? FAMILY_ORDER.length : index;
}

/** Round to a tenth of a pixel: kills floating-point noise like 2.8e-14. */
const px = (value) => Math.round(value * 10) / 10;

/** Marker glyph for a DiD round, matching the chart marker shapes. */
const DID_GLYPH = { did_baseline: '◆', did_midline: '■' };
const DID_LABEL = { did_baseline: 'DiD baseline', did_midline: '25-26 End of Year' };

function familyLabel(family) {
  if (FAMILY_LABELS[family]) return FAMILY_LABELS[family];
  return String(family).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Group adjacent period slots that share a district instrument into segments.
 *
 * DiD rounds are pulled out as notches rather than segments, because a DiD
 * round sitting inside Oct–Dec 2025 does not replace the district tool that
 * quarter — both measured, and the ribbon should say so.
 *
 * @returns {{segments, notches, boundaries}}
 */
export function ribbonModel(slots) {
  const segments = [];
  const notches = [];

  slots.forEach((slot, index) => {
    // District families in this period, in the order they were used.
    // DiD is held aside: it is a notch, not a segment, wherever a district
    // instrument also measured that period.
    const districtFamilies = slot.toolFamilies
      .filter((f) => f && f !== 'did')
      .sort((a, b) => familyRank(a) - familyRank(b));
    const didTools = slot.sourceTools.filter((t) => t.startsWith('did'));

    if (!districtFamilies.length) {
      if (!slot.hasData || !didTools.length) return;
      // A period only the DiD study measured becomes its own navy segment.
      // It gets no notch: a navy glyph on a navy band would be invisible, and
      // the segment label already says what the instrument was.
      const key = 'did';
      const last = segments.at(-1);
      if (last && last.key === key && last.endIndex === index - 1) {
        last.endIndex = index;
        last.slots.push(slot);
        for (const tool of didTools) last.tools.add(tool);
      } else {
        segments.push({
          key,
          label: didTools.map((t) => DID_LABEL[t] || familyLabel('did')).join(' + '),
          startIndex: index,
          endIndex: index,
          slots: [slot],
          tools: new Set(didTools),
        });
      }
      return;
    }

    // A DiD round sitting inside a district period is an addition, not a
    // replacement, so it is drawn as a notch on that period's segment.
    for (const tool of didTools) {
      notches.push({ slotKey: slot.key, tool, glyph: DID_GLYPH[tool] || '◆', label: DID_LABEL[tool] || tool });
    }

    // A period assessed by more than one district tool is labelled with both.
    const key = districtFamilies.join('+');
    const last = segments.at(-1);
    if (last && last.key === key && last.endIndex === index - 1) {
      last.endIndex = index;
      last.slots.push(slot);
      for (const tool of slot.sourceTools) last.tools.add(tool);
    } else {
      segments.push({
        key,
        label: districtFamilies.map(familyLabel).join(' + '),
        startIndex: index,
        endIndex: index,
        slots: [slot],
        tools: new Set(slot.sourceTools),
      });
    }
  });

  // A boundary is the first slot of every segment after the first: the point
  // where the instrument changed. These get a rule that continues up the plot.
  const boundaries = segments.slice(1).map((segment) => ({
    key: slots[segment.startIndex].key,
    from: segments[segments.indexOf(segment) - 1]?.label,
    to: segment.label,
  }));

  return { segments, notches, boundaries };
}

/**
 * The period where the 2026 SSP first appears — a new cohort of Grade 2
 * children. Derived from the data so it moves if the instrument timeline does.
 */
export function cohortBoundary(slots) {
  const index = slots.findIndex((slot) => slot.toolFamilies.includes('2026_tool'));
  return index > 0 ? slots[index] : null;
}

/**
 * Draw the ribbon.
 *
 * @param {object} options
 *   slots       period slots, in order, from data.periodSlots()
 *   x           the point scale used by the chart above
 *   bandWidth   one period's width, so segments meet at slot edges
 *   height      14 inline, 10 compact, 28 for the Methods timeline
 *   showCohort  draw the "New Grade 2 cohort" marker beneath
 *   detail      extra text per segment, e.g. dates and n on the Methods page
 */
export function drawRibbon(group, { slots, x, bandWidth, height = 14, showCohort = true, detail = null, narrow = false } = {}) {
  const { segments, notches } = ribbonModel(slots);
  const ribbon = group.append('g').attr('class', 'ribbon');
  const compact = height <= 10;
  const display = height >= 24;

  const left = (index) => px(x(slots[index].key) - bandWidth / 2);
  const right = (index) => px(x(slots[index].key) + bandWidth / 2);

  segments.forEach((segment, order) => {
    const x0 = left(segment.startIndex);
    const x1 = right(segment.endIndex);
    const width = px(x1 - x0);
    const isDid = segment.key === 'did';

    const block = ribbon.append('g').attr('class', 'ribbon__segment');

    block.append('rect')
      .attr('x', x0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', isDid ? token('--ribbon-did') : token(order % 2 === 0 ? '--ribbon-tool-b' : '--ribbon-tool-a'));

    // The instrument-change rule, at full strength inside the ribbon.
    if (order > 0) {
      block.append('line')
        .attr('x1', x0).attr('x2', x0)
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', token('--ribbon-boundary'))
        .attr('stroke-width', 1);
    }

    const label = segment.label;
    const fontSize = compact ? 9.5 : display ? 13 : 11;
    // Roughly 0.55em per character: enough to know whether the label will fit.
    const fits = width > label.length * fontSize * 0.55 + 8;

    if (fits) {
      const text = block.append('text')
        .attr('x', x0 + width / 2)
        .attr('y', height / 2)
        .attr('dy', display ? '-0.1em' : '0.35em')
        .attr('text-anchor', 'middle')
        .attr('font-size', fontSize)
        .attr('font-weight', 500)
        .attr('fill', isDid ? token('--ribbon-did-ink') : token('--csf-navy'))
        .text(label);
      if (display && detail) {
        text.attr('font-weight', 600);
        block.append('text')
          .attr('x', x0 + width / 2)
          .attr('y', height / 2)
          .attr('dy', '1.15em')
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('fill', isDid ? token('--ribbon-did-ink') : token('--slate'))
          .text(detail(segment));
      }
    }

    // The full label is always reachable, even when it does not fit.
    block.append('title').text(
      `${label}${segment.slots.length > 1 ? ` · ${segment.slots.length} rounds` : ''}`
    );
  });

  // DiD rounds as inset notches, so a DiD round inside a district period reads
  // as "and also this", not "instead of this".
  for (const notch of notches) {
    const cx = x(notch.slotKey);
    const notchWidth = Math.min(bandWidth * 0.42, 34);
    const inset = compact ? 1 : 2;
    const block = ribbon.append('g').attr('class', 'ribbon__notch');
    block.append('rect')
      .attr('x', cx + bandWidth / 2 - notchWidth - inset)
      .attr('y', inset)
      .attr('width', notchWidth)
      .attr('height', height - inset * 2)
      .attr('fill', token('--ribbon-did'));
    block.append('text')
      .attr('x', cx + bandWidth / 2 - notchWidth / 2 - inset)
      .attr('y', height / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', compact ? 8 : 10)
      .attr('fill', token('--ribbon-did-ink'))
      .text(notch.glyph);
    block.append('title').text(notch.label);
  }

  // "New Grade 2 cohort", positioned from the data.
  if (showCohort && !compact) {
    const boundary = cohortBoundary(slots);
    if (boundary) {
      const bx = x(boundary.key) - bandWidth / 2;
      const marker = ribbon.append('g').attr('class', 'ribbon__cohort');
      marker.append('path')
        .attr('d', `M${bx},${height + 4} l4,5 l-8,0 Z`)
        .attr('fill', token('--slate'));
      const label = narrow ? 'New cohort' : strings.chart.newCohort;
      // Anchor the label away from the right edge when the boundary sits close
      // to it, so it is never clipped by the chart frame.
      const right = x.range()[1];
      const flip = bx > right - label.length * 5.6;
      marker.append('text')
        .attr('x', flip ? bx - 7 : bx + 7)
        .attr('y', height + 14)
        .attr('text-anchor', flip ? 'end' : 'start')
        .attr('font-size', 11)
        .attr('fill', token('--slate'))
        .text(label);
    }
  }

  return ribbon;
}

/**
 * A text summary of the ribbon, for the chart's aria-label and the
 * "View as table" output. A screen-reader user gets the same instrument story
 * a sighted user reads off the band.
 */
export function ribbonSummary(slots) {
  const { segments } = ribbonModel(slots);
  return segments
    .map((segment) => {
      const first = segment.slots[0];
      const last = segment.slots.at(-1);
      const span = first === last ? first.label || first.key : `${first.label || first.key} to ${last.label || last.key}`;
      return `${segment.label}: ${span}`;
    })
    .join('. ');
}
