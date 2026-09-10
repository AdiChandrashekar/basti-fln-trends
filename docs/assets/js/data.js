/**
 * Data loading, type coercion and selectors.
 *
 * The one rule that governs this file (build brief, section 2):
 *   NOTHING here recomputes, re-aggregates, smooths or interpolates a metric.
 *   Every value comes out exactly as the pipeline wrote it. What this file does
 *   is parse, order, filter and shape — never derive.
 *
 * Parsing gotchas handled here, from section 3.4 of the brief:
 *   - Booleans arrive as the strings "True" / "False".
 *   - Empty cells are empty strings and mean missing, never zero.
 *   - Quarters must not sort as strings (Q1_2026 < Q2_2025 alphabetically).
 *     They are ordered by quarter_start_month, with the district-cycle rule as
 *     a fallback if that column is ever absent.
 *   - source_tool can be "pooled:a+b".
 *   - The views file mixes period types; always filter on period_type.
 */

import { d3 } from './vendor.js';
import { competency, byLadder } from './competencies.js';

const DATA_DIR = 'data/'; // relative: the site is served from /<repo>/, not the domain root

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

/** Empty string, whitespace or absent -> null. Never 0, never NaN. */
export function str(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** Numeric, or null. An empty cell is missing, not zero. */
export function num(value) {
  const text = str(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The strings "True" / "False" as written by pandas. Anything else -> null. */
export function bool(value) {
  const text = str(value);
  if (text === null) return null;
  const lower = text.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return null;
}

/** Semicolon-separated reliability_flags -> array. Empty -> []. */
export function flagList(value) {
  const text = str(value);
  return text === null ? [] : text.split(';').map((f) => f.trim()).filter(Boolean);
}

/** Pipe-separated competency lists in domain_level_trend -> array. */
export function pipeList(value) {
  const text = str(value);
  if (text === null) return [];
  return text
    .split(/\s*\|\|\s*|\|/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * "pooled:q3_2025_tool+did_baseline" -> ["q3_2025_tool", "did_baseline"]
 * "q1_2026_tool" -> ["q1_2026_tool"]
 */
export function sourceTools(sourceTool) {
  const text = str(sourceTool);
  if (text === null) return [];
  return text.replace(/^pooled:/, '').split('+').map((s) => s.trim()).filter(Boolean);
}

/** True when this row's value came from more than one instrument. */
export function isPooled(sourceTool) {
  return String(sourceTool || '').startsWith('pooled:') || sourceTools(sourceTool).length > 1;
}

// ---------------------------------------------------------------------------
// Period ordering
// ---------------------------------------------------------------------------

/**
 * The district quarter cycle, used only when quarter_start_month is absent:
 *   Q1_yyyy = Apr–Jun yyyy      Q3_yyyy = Oct–Dec yyyy
 *   Q2_yyyy = Jul–Sep yyyy      Q4_yyyy = Jan–Mar of yyyy+1
 */
export function quarterStartMonth(quarterCode) {
  const match = /^Q(\d)_(\d{4})$/.exec(String(quarterCode || ''));
  if (!match) return null;
  const quarter = Number(match[1]);
  const year = Number(match[2]);
  const starts = { 1: [year, 4], 2: [year, 7], 3: [year, 10], 4: [year + 1, 1] };
  const start = starts[quarter];
  if (!start) return null;
  return `${start[0]}-${String(start[1]).padStart(2, '0')}`;
}

/** Sortable key for a quarter. Months (YYYY-MM) already sort correctly as strings. */
export function quarterSortKey(row) {
  return str(row.quarter_start_month) || quarterStartMonth(row.quarter_code) || '9999-99';
}

/** Step a YYYY-MM string forward by one month. */
function nextMonth(month) {
  const [year, monthNum] = month.split('-').map(Number);
  return monthNum === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNum + 1).padStart(2, '0')}`;
}

/** Every month from `from` to `to` inclusive, including months with no data. */
export function monthRange(from, to) {
  const months = [];
  let cursor = from;
  // Guard against a malformed range rather than looping forever.
  for (let i = 0; cursor <= to && i < 600; i += 1) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

/** Columns shared by quarterly_trends.csv and monthly_trends.csv. */
function parseTrendRow(row) {
  return {
    std_competency: str(row.std_competency),
    competency_family: str(row.competency_family),
    domain: str(row.domain),

    row_type: str(row.row_type),
    source_tool: str(row.source_tool),
    source_tool_label: str(row.source_tool_label),
    source_tools: sourceTools(row.source_tool),
    is_pooled: isPooled(row.source_tool),
    tool_family: str(row.tool_family),
    is_did_point: bool(row.is_did_point) ?? false,

    stacking_status: str(row.stacking_status),
    measure_unit: str(row.measure_unit),
    metric_basis: str(row.metric_basis),
    metric_bases: str(row.metric_basis) ? str(row.metric_basis).split('+') : [],
    clearance_rule: str(row.clearance_rule),

    n: num(row.n),
    n_schools: num(row.n_schools),
    pct_students_cleared: num(row.pct_students_cleared),
    se: num(row.se),
    ci95_low: num(row.ci95_low),
    ci95_high: num(row.ci95_high),
    has_clearance_value: bool(row.has_clearance_value) ?? false,

    pct_cleared_tool_flag: num(row.pct_cleared_tool_flag),
    mean_pct_score: num(row.mean_pct_score),
    median_pct_score: num(row.median_pct_score),
    mean_cpm: num(row.mean_cpm),

    perfect_score_required: bool(row.perfect_score_required) ?? false,
    stability_flag: str(row.stability_flag),
    reliability_flags: flagList(row.reliability_flags),
    pooling_method: str(row.pooling_method),

    same_tool_family_as_prev: bool(row.same_tool_family_as_prev),
    change_defensibility: str(row.change_defensibility),
    raw_keys: str(row.raw_keys),
  };
}

function parseQuarterlyRow(row) {
  return {
    ...parseTrendRow(row),
    granularity: 'quarterly',
    period: str(row.quarter_code),
    period_label: str(row.quarter_label),
    period_sort: quarterSortKey(row),
    prev_period: str(row.prev_quarter),
    periods_gap: num(row.quarters_gap),
    change_pp: num(row.qoq_change_pp),
    quarter_start_month: str(row.quarter_start_month),
    quarter_end_month: str(row.quarter_end_month),
    is_partial_quarter: bool(row.is_partial_quarter) ?? false,
    months_with_data: str(row.months_with_data) ? str(row.months_with_data).split(',') : [],
  };
}

function parseMonthlyRow(row) {
  return {
    ...parseTrendRow(row),
    granularity: 'monthly',
    period: str(row.month),
    period_label: str(row.month),
    period_sort: str(row.month) || '9999-99',
    quarter_code: str(row.quarter_code),
    prev_period: str(row.prev_month),
    periods_gap: num(row.months_gap),
    change_pp: num(row.mom_change_pp),
  };
}

function parseDomainRow(row) {
  return {
    period_type: str(row.period_type),
    period: str(row.period),
    row_type: str(row.row_type),
    source_tool: str(row.source_tool),
    source_tool_label: str(row.source_tool_label),
    source_tools: sourceTools(row.source_tool),
    is_pooled: isPooled(row.source_tool),
    includes_did: bool(row.includes_did) ?? false,
    has_clearance_value: bool(row.has_clearance_value) ?? false,
    n_students: num(row.n_students),

    literacy_pct_cleared: num(row.literacy_pct_cleared),
    numeracy_pct_cleared: num(row.numeracy_pct_cleared),
    overall_pct_cleared: num(row.overall_pct_cleared),

    change_literacy_pp_vs_prev: num(row.change_literacy_pp_vs_prev),
    change_numeracy_pp_vs_prev: num(row.change_numeracy_pp_vs_prev),
    change_overall_pp_vs_prev: num(row.change_overall_pp_vs_prev),

    literacy_mean_pct_score: num(row.literacy_mean_pct_score),
    numeracy_mean_pct_score: num(row.numeracy_mean_pct_score),
    overall_mean_pct_score: num(row.overall_mean_pct_score),

    literacy_n_competencies: num(row.literacy_n_competencies),
    numeracy_n_competencies: num(row.numeracy_n_competencies),
    literacy_competencies: pipeList(row.literacy_competencies),
    numeracy_competencies: pipeList(row.numeracy_competencies),

    pooling_method: str(row.pooling_method),
    coverage_note: str(row.coverage_note),
  };
}

function parseViewRow(row) {
  return {
    view: str(row.view),
    period_type: str(row.period_type),
    period: str(row.period),
    source_tool: str(row.source_tool),
    panel_id: str(row.panel_id),
    index_scope: str(row.index_scope),
    std_competency: str(row.std_competency),
    domain: str(row.domain),
    n: num(row.n),
    stacking_status: str(row.stacking_status),
    reliability_flags: flagList(row.reliability_flags),
    panel_n_competencies: num(row.panel_n_competencies),
    metric: str(row.metric),
    value: num(row.value),
    n_distinct_scores: num(row.n_distinct_scores),
    band_source: str(row.band_source),
  };
}

function parseDidRow(row) {
  return {
    std_competency: str(row.std_competency),
    domain: str(row.domain),
    unit: str(row.unit),
    baseline_raw_name: str(row.baseline_raw_name),
    midline_raw_name: str(row.midline_raw_name),
    baseline_value_in_series: num(row.baseline_value_in_series),
    midline_value_in_series: num(row.midline_value_in_series),
    baseline_mean: num(row.baseline_mean),
    midline_mean: num(row.midline_mean),
    mean_change: num(row.mean_change),
    midline_pct_zero_band: num(row.midline_pct_zero_band),
    comparison_status: str(row.comparison_status),
    note: str(row.note),
    /** The two _domain_matched_set_* rows are summaries, not competencies. */
    is_summary: str(row.comparison_status) === 'summary',
  };
}

function parseCalibrationRow(row) {
  return {
    std_competency: str(row.std_competency),
    measure_unit: str(row.measure_unit),
    did_baseline_nov_mean: num(row.did_baseline_nov_mean),
    q3_2025_tool_nov_mean: num(row.q3_2025_tool_nov_mean),
    district_minus_did_mean: num(row.district_minus_did_mean),
    note: str(row.note),
  };
}

function parseCrosswalkRow(row) {
  return {
    raw_key: str(row.raw_key),
    source_tool: str(row.source_tool),
    raw_name: str(row.raw_name),
    raw_scale: str(row.raw_scale),
    std_competency: str(row.std_competency),
    competency_family: str(row.competency_family),
    domain: str(row.domain),
    unit: str(row.unit),
    stacking_status: str(row.stacking_status),
    confidence: str(row.confidence),
    confirmation_status: str(row.confirmation_status),
    reasoning: str(row.reasoning),
  };
}

// ---------------------------------------------------------------------------
// Loading. Each file is fetched at most once per session.
// ---------------------------------------------------------------------------

const cache = new Map();

/**
 * Every data URL carries the manifest's build timestamp as ?v=...
 *
 * Without this, a re-run of the pipeline is invisible to anyone whose browser
 * still holds the old CSVs: GitHub Pages serves data files with a ten-minute
 * max-age, so a viewer could see a stale chart, or — worse — a mix of stale and
 * fresh files that disagree with each other. Versioning the URL makes each
 * build a new resource, so a redeploy is picked up immediately while everything
 * within one build still caches normally.
 *
 * The manifest itself is fetched with `no-store`. It is ~1 KB, and it is the one
 * file that must never come from cache, because it is what tells us the version.
 */
let manifestPromise = null;

function manifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(DATA_DIR + 'manifest.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

function versionedUrl(file, built) {
  return built ? `${DATA_DIR}${file}?v=${encodeURIComponent(built)}` : DATA_DIR + file;
}

/** A file that is absent resolves to null rather than throwing, so a page can
 *  render a named empty state instead of a broken view. */
function loadCsv(file, parser, { optional = false } = {}) {
  if (!cache.has(file)) {
    cache.set(
      file,
      manifest()
        .then((meta) => d3.csv(versionedUrl(file, meta?.built_at), parser))
        .catch((error) => {
          if (optional) {
            console.warn(`[data] ${file} is not present in docs/data/. ` +
              `Views that need it will show a "not synced yet" note.`);
            return null;
          }
          throw new Error(`Could not load ${DATA_DIR}${file}: ${error.message}`);
        })
    );
  }
  return cache.get(file);
}

export const load = {
  /** First paint of the Overview needs only these two. */
  quarterly: () => loadCsv('quarterly_trends.csv', parseQuarterlyRow),
  domain: () => loadCsv('domain_level_trend.csv', parseDomainRow),

  monthly: () => loadCsv('monthly_trends.csv', parseMonthlyRow),
  /** ~612 KB. Loaded only by the explorer, map and distributions pages. */
  views: () => loadCsv('nonstacking_competency_views.csv', parseViewRow),
  did: () => loadCsv('did_baseline_midline_comparison.csv', parseDidRow),
  calibration: () => loadCsv('tool_calibration_nov2025.csv', parseCalibrationRow, { optional: true }),
  crosswalk: () => loadCsv('competency_crosswalk.csv', parseCrosswalkRow, { optional: true }),

  manifest,
};

/** Trends at the selected granularity. */
export function loadTrends(granularity) {
  return granularity === 'monthly' ? load.monthly() : load.quarterly();
}

// ---------------------------------------------------------------------------
// Selectors. These filter and shape. They never compute a metric.
// ---------------------------------------------------------------------------

/**
 * Every period slot on the axis, in order, including periods with no data.
 *
 * Quarterly slots come from the quarters present in the file. Monthly slots run
 * from the earliest quarter_start_month to the latest quarter_end_month, so the
 * empty months inside the study window (Jul 2025, Jan–Feb 2026, Jun 2026) keep
 * their place on the axis instead of being collapsed. A new quarter appended by
 * the pipeline extends both axes with no code change.
 *
 * @returns {{key, label, sort, hasData, sourceTools: string[], toolFamilies: string[], isDid: boolean}[]}
 */
export function periodSlots(rows, granularity, quarterlyRows = rows) {
  const withData = new Map();
  for (const row of rows) {
    if (!row.period) continue;
    if (!withData.has(row.period)) {
      withData.set(row.period, {
        key: row.period,
        label: row.period_label,
        sort: row.period_sort,
        hasData: true,
        sourceTools: new Set(),
        toolFamilies: new Set(),
        isDid: false,
      });
    }
    const slot = withData.get(row.period);
    for (const tool of row.source_tools) slot.sourceTools.add(tool);
    if (row.tool_family) for (const f of row.tool_family.split('+')) slot.toolFamilies.add(f);
    if (row.is_did_point) slot.isDid = true;
  }

  let slots;
  if (granularity === 'monthly') {
    // Bound the month axis by the quarter window, so empty months stay visible.
    const bounds = quarterlyRows
      .map((r) => [r.quarter_start_month, r.quarter_end_month])
      .filter(([a, b]) => a && b);
    const keys = [...withData.keys()].sort();
    const from = bounds.length ? d3.min(bounds, (b) => b[0]) : keys[0];
    const to = bounds.length ? d3.max(bounds, (b) => b[1]) : keys[keys.length - 1];
    slots = monthRange(from, to).map(
      (month) =>
        withData.get(month) || {
          key: month,
          label: month,
          sort: month,
          hasData: false,
          sourceTools: new Set(),
          toolFamilies: new Set(),
          isDid: false,
        }
    );
  } else {
    slots = [...withData.values()].sort((a, b) => d3.ascending(a.sort, b.sort));
  }

  return slots.map((slot) => ({
    ...slot,
    sourceTools: [...slot.sourceTools],
    toolFamilies: [...slot.toolFamilies],
  }));
}

/** Rows that carry a plottable percentage. Skips has_clearance_value = False. */
export function plottable(rows) {
  return rows.filter((row) => row.has_clearance_value && row.pct_students_cleared !== null);
}

/** One row per competency per period. These are the only rows a line may join. */
export function trendPoints(rows, { competency: id, domain, showDid = true } = {}) {
  return plottable(rows).filter(
    (row) =>
      row.row_type === 'trend_point' &&
      (!id || row.std_competency === id) &&
      (!domain || domain === 'all' || row.domain === domain) &&
      (showDid || !row.is_did_point)
  );
}

/** One row per competency per period per source. Markers and tooltips only. */
export function sourceDetails(rows, { competency: id, period, showDid = true } = {}) {
  return plottable(rows).filter(
    (row) =>
      row.row_type === 'source_detail' &&
      (!id || row.std_competency === id) &&
      (!period || row.period === period) &&
      (showDid || !row.is_did_point)
  );
}

/**
 * Reference points: a DiD round that measured the same competency in the same
 * period as a district tool. These are NOT part of the trend line — the district
 * value carries the line — and they hold a different kind of number (the
 * baseline's mean % correct rather than a share of children achieving).
 *
 * They carry no change columns, which is deliberate: the pipeline does not treat
 * the step between a reference point and the line as a change, so nothing here
 * can present it as one.
 */
export function referencePoints(rows, { competency: id, period, showDid = true } = {}) {
  if (!showDid) return [];
  return plottable(rows).filter(
    (row) =>
      row.row_type === 'reference_point' &&
      (!id || row.std_competency === id) &&
      (!period || row.period === period)
  );
}

/**
 * Pair each reference point with the trend points either side of it, so it can
 * be joined to the line by a reference connector rather than left floating.
 * Either neighbour may be absent at the ends of a series.
 */
export function referenceLinks(points, references) {
  return references.map((reference) => {
    const before = points.filter((p) => p.period_sort < reference.period_sort).at(-1) || null;
    const after = points.find((p) => p.period_sort > reference.period_sort) || null;
    return { reference, before, after };
  });
}

/** A competency's trend points, in period order. */
export function seriesFor(rows, id, { showDid = true } = {}) {
  return trendPoints(rows, { competency: id, showDid }).sort((a, b) =>
    d3.ascending(a.period_sort, b.period_sort)
  );
}

/**
 * Adjacent pairs of a competency's trend points, tagged with the arriving
 * point's change_defensibility.
 *
 * `connected: false` means the pipeline says the two ends are different
 * measures. Those pairs must never be drawn as a line — the caller places the
 * "≠" glyph instead. The decision comes from the column, never from an
 * assumption about which sources are involved, so a pipeline change to
 * metric_basis flows straight through.
 */
export function segmentsFor(points) {
  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const defensibility = to.change_defensibility;
    // A competency measured once is points-only; its rows carry no defensibility.
    if (!defensibility) continue;
    segments.push({
      from,
      to,
      defensibility,
      connected: defensibility !== 'metric_basis_changed',
      change_pp: to.change_pp,
      periods_gap: to.periods_gap,
    });
  }
  return segments;
}

/** The latest period slot that has data. Drives the gold "Latest" highlight. */
export function latestPeriodWithData(slots) {
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    if (slots[i].hasData) return slots[i];
  }
  return null;
}

/** Domain-level trend points at one granularity, in period order. */
export function domainSeries(domainRows, granularity, quarterlyRows) {
  const periodType = granularity === 'monthly' ? 'month' : 'quarter';
  const rows = domainRows.filter(
    (row) => row.period_type === periodType && row.row_type === 'trend_point' && row.has_clearance_value
  );
  const order = new Map(
    periodSlots(
      rows.map((r) => ({
        period: r.period,
        period_label: r.period,
        period_sort:
          periodType === 'quarter' ? quarterStartMonth(r.period) || r.period : r.period,
        source_tools: r.source_tools,
        tool_family: null,
        is_did_point: r.includes_did,
      })),
      granularity,
      quarterlyRows
    ).map((slot, index) => [slot.key, index])
  );
  return rows.sort((a, b) => (order.get(a.period) ?? 0) - (order.get(b.period) ?? 0));
}

/** Domain-level source_detail rows for one period, for the composition tooltip. */
export function domainSources(domainRows, granularity, period) {
  const periodType = granularity === 'monthly' ? 'month' : 'quarter';
  return domainRows.filter(
    (row) => row.period_type === periodType && row.row_type === 'source_detail' && row.period === period
  );
}

/** Every competency present in the data, in domain-then-ladder order. */
export function competenciesInData(rows) {
  const hints = {};
  const ids = new Set();
  for (const row of rows) {
    if (!row.std_competency) continue;
    ids.add(row.std_competency);
    hints[row.std_competency] = { domain: row.domain };
  }
  return [...ids].sort(byLadder(hints)).map((id) => ({
    ...competency(id, hints[id]),
    family: rows.find((r) => r.std_competency === id)?.competency_family || null,
  }));
}

/** Mastery band and tier percentages for one panel. Filter by period_type first. */
export function bandsFor(viewRows, { granularity, period, competency: id, sourceTool } = {}) {
  const periodType = granularity === 'monthly' ? 'month' : 'quarter';
  return viewRows.filter(
    (row) =>
      row.view === 'mastery_bands' &&
      row.period_type === periodType &&
      (!period || row.period === period) &&
      (!id || row.std_competency === id) &&
      (!sourceTool || row.source_tool === sourceTool)
  );
}

/** Within-panel standing (rank, z, percentile) for one competency or panel. */
export function standingFor(viewRows, { granularity, competency: id, scope = 'all', metric } = {}) {
  const periodType = granularity === 'monthly' ? 'month' : 'quarter';
  return viewRows.filter(
    (row) =>
      row.view === 'small_multiples_index' &&
      row.period_type === periodType &&
      row.index_scope === scope &&
      (!id || row.std_competency === id) &&
      (!metric || row.metric === metric)
  );
}

/** DiD comparison rows, summaries excluded. */
export function didCompetencies(didRows, { status } = {}) {
  return didRows.filter((row) => !row.is_summary && (!status || row.comparison_status === status));
}

/** The two _domain_matched_set_* summary rows, keyed by domain. */
export function didDomainSummaries(didRows) {
  return Object.fromEntries(didRows.filter((row) => row.is_summary).map((row) => [row.domain, row]));
}
