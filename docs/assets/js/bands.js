/**
 * Band and tier definitions, shared by the explorer and the distributions page.
 *
 * These describe how children were spread on a task, not just how many reached
 * the bar. The three tiers are the default reading; the five bands are the
 * detail behind them. The colour ramp runs dark red at zero through to CSF blue
 * at achieving, and every band is always labelled — colour never carries the
 * meaning on its own.
 */

import { strings } from './strings.js';

export const TIERS = [
  { metric: 'pct_students_tier_critical', label: () => strings.distributions.tierCritical, colour: '--tier-critical', ink: '--paper' },
  { metric: 'pct_students_tier_developing', label: () => strings.distributions.tierDeveloping, colour: '--tier-developing', ink: '--ink' },
  { metric: 'pct_students_tier_cleared', label: () => strings.distributions.tierAchieving, colour: '--tier-achieving', ink: '--paper' },
];

export const BANDS = [
  { metric: 'pct_students_b1_0', label: () => strings.distributions.bandZero, colour: '--band-1-zero', ink: '--paper' },
  { metric: 'pct_students_b2_lt25', label: () => strings.distributions.bandLt25, colour: '--band-2-lt25', ink: '--paper' },
  { metric: 'pct_students_b3_25_50', label: () => strings.distributions.band25, colour: '--band-3-25-50', ink: '--ink' },
  { metric: 'pct_students_b4_50_75', label: () => strings.distributions.band50, colour: '--band-4-50-75', ink: '--ink' },
  { metric: 'pct_students_b5_75plus', label: () => strings.distributions.band75, colour: '--band-5-75plus', ink: '--paper' },
];

/** Reading speed bands. Only ORF has a benchmark; the rest show spread. */
export const CPM_BANDS = [
  { metric: 'pct_students_cpm_0', label: () => 'Zero', colour: '--band-1-zero', ink: '--paper' },
  { metric: 'pct_students_cpm_1-15', label: () => '1–15 cpm', colour: '--band-2-lt25', ink: '--paper' },
  { metric: 'pct_students_cpm_16-29', label: () => '16–29 cpm', colour: '--band-3-25-50', ink: '--ink' },
  { metric: 'pct_students_cpm_30-44', label: () => '30–44 cpm', colour: '--band-4-50-75', ink: '--ink' },
  { metric: 'pct_students_cpm_45-59', label: () => '45–59 cpm', colour: '--band-5-75plus', ink: '--paper' },
  { metric: 'pct_students_cpm_60+', label: () => '60+ cpm', colour: '--csf-navy', ink: '--paper' },
];

/** The band set a view should use. */
export function bandSpec({ isCpm = false, detail = 'tiers' } = {}) {
  if (isCpm) return CPM_BANDS;
  return detail === 'five' ? BANDS : TIERS;
}

/**
 * True when a panel's bands were read off the End of Year report's charts
 * rather than computed from children's own scores. Those are rounded and sum to
 * 99–101, which is worth saying wherever they are shown.
 */
export function isSlideSourced(bandSource) {
  return String(bandSource || '').startsWith('slide_chart');
}

export function sourceLabel(bandSource) {
  return isSlideSourced(bandSource) ? strings.distributions.midlineRounded : "Children's own scores";
}
