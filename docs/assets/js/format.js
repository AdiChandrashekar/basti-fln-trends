/**
 * Number, percentage and period formatting.
 *
 * One rule, applied everywhere (build brief, section 3.4):
 *   percentages display as whole numbers, and to one decimal only inside
 *   tooltips and tables.
 *
 * Every function here returns a string that is safe to put on screen, including
 * for missing values. Nothing here ever renders "NaN", "null" or "0" for a value
 * that is actually absent.
 */

import { strings, t } from './strings.js';

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** True when a parsed value is genuinely absent rather than zero. */
export function isMissing(value) {
  return value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value));
}

/** `57.3` -> `57%`. Whole numbers, for chart labels and axes. */
export function pct(value, { suffix = '%' } = {}) {
  if (isMissing(value)) return '—';
  return nf0.format(Math.round(value)) + suffix;
}

/** `57.34` -> `57.3%`. One decimal, for tooltips and tables only. */
export function pct1(value, { suffix = '%' } = {}) {
  if (isMissing(value)) return '—';
  return nf1.format(value) + suffix;
}

/** `28.606` -> `28.6 cpm`. Correct words per minute. */
export function cpm(value) {
  if (isMissing(value)) return '—';
  return `${nf1.format(value)} ${strings.units.cpm}`;
}

/**
 * A change in percentage points, with its direction sign.
 * `-3.35` -> `3.4 points lower`, `17.0` -> `17.0 points higher`
 */
export function changePoints(value, { long = true } = {}) {
  if (isMissing(value)) return '—';
  const magnitude = nf1.format(Math.abs(value));
  if (!long) return `${value < 0 ? '−' : '+'}${magnitude}`;
  if (Math.abs(value) < 0.05) return 'no change';
  return `${magnitude} ${strings.units.points} ${value < 0 ? 'lower' : 'higher'}`;
}

/** The arrow glyph for a change. Paired with text, never used alone. */
export function changeGlyph(value, { flatBand = 2 } = {}) {
  if (isMissing(value)) return '';
  if (Math.abs(value) < flatBand) return '→';
  return value < 0 ? '▾' : '▴';
}

/** `down` | `up` | `flat`, for colour tokens. Flat band is ±2 points per the brief. */
export function changeDirection(value, { flatBand = 2 } = {}) {
  if (isMissing(value)) return 'flat';
  if (Math.abs(value) < flatBand) return 'flat';
  return value < 0 ? 'down' : 'up';
}

/**
 * Sample size. Missing n is never 0 and never NaN — it says so.
 * `1361` -> `n = 1,361`, `null` -> `n not reported`
 */
export function nLabel(value) {
  if (isMissing(value)) return strings.units.nNotReported;
  return t(strings.units.n, { n: nf0.format(value) });
}

/** `1361` -> `1,361`. Plain integer, for prose. */
export function int(value) {
  if (isMissing(value)) return '—';
  return nf0.format(Math.round(value));
}

/**
 * Quarter label, two lines.
 * `Q2_2025` with label `Q2 2025 (Jul-Sep 2025)` -> { primary: 'Jul–Sep 2025', secondary: 'Q2 2025' }
 *
 * The primary line is the human date range, because that is what a district
 * official recognises. The Q-number sits smaller beneath.
 */
export function quarterAxisLabel(quarterCode, quarterLabel) {
  const match = /^(.*?)\s*\((.+)\)\s*$/.exec(quarterLabel || '');
  if (match) {
    return { primary: match[2].replace(/-/g, '–'), secondary: match[1].trim() };
  }
  // Fall back to parsing the code when the label is missing or shaped differently.
  const parts = /^Q(\d)_(\d{4})$/.exec(quarterCode || '');
  if (parts) {
    const ranges = { 1: 'Apr–Jun', 2: 'Jul–Sep', 3: 'Oct–Dec', 4: 'Jan–Mar' };
    const year = parts[1] === '4' ? Number(parts[2]) + 1 : Number(parts[2]);
    return { primary: `${ranges[parts[1]]} ${year}`, secondary: `Q${parts[1]} ${parts[2]}` };
  }
  return { primary: quarterCode || '—', secondary: '' };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-03` -> `Mar 2026`. */
export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) return month || '—';
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * The one label function pages call. Works for either granularity, and always
 * prefers the label the data carries over anything reconstructed here.
 */
export function periodLabel(period, { granularity, quarterLabel } = {}) {
  if (granularity === 'monthly') return monthLabel(period);
  return quarterAxisLabel(period, quarterLabel).primary;
}

/** Join a list into prose: `['a','b','c']` -> `a, b and c`. */
export function list(items) {
  const parts = items.filter(Boolean).map(String);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** ISO timestamp -> `10 Sep 2026`, for the build date in the rail. */
export function buildDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Trim a label to the room it actually has, rather than to a fixed number of
 * characters. A gutter is a different width on a phone than on a laptop, so a
 * constant that looks fine at 1440px clips at 390px.
 *
 * @param {string} text
 * @param {number} availablePx  width the label may occupy
 * @param {number} [fontPx]     rendered size, used to estimate character width
 */
export function fitLabel(text, availablePx, fontPx = 12.8) {
  const value = String(text ?? '');
  const room = Math.max(6, Math.floor(availablePx / (fontPx * 0.53)));
  return value.length > room ? `${value.slice(0, room - 1)}\u2026` : value;
}

/** A filename-safe slug for exports: `Word writing` -> `word-writing`. */
export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
