/**
 * Every user-facing string in the dashboard.
 *
 * Kept in one object so a Hindi version can be added later as a sibling file
 * with the same shape. Nothing here is machine-translated now.
 *
 * House style (build brief, section 8):
 *   - Speak like a thoughtful colleague explaining data to a district official.
 *   - Plain verbs, short sentences, sentence case.
 *   - "% achieving" for the metric. "Instrument" or "assessment tool" for tools.
 *     "Round" for a period's assessment. "Same test" / "different test".
 *   - Never on screen: clearance, trend point, source detail, stacking, pooled,
 *     metric basis, or any column name.
 */

export const strings = {
  site: {
    title: 'Grade 2 competency trends',
    subtitle: 'Basti, NIPUN Bharat',
    metric: '% achieving',
    metricLong: 'children achieving the competency',
    metricDefinition:
      'A child achieves a competency by scoring 75% or more of its items. For oral ' +
      'reading fluency the bar is 45 correct words per minute. On the four three-item ' +
      'tasks in the Q3 2025 tool it is 2 of 3, the rule that tool used at the time.',
    buildDate: 'Data built',
    skipToContent: 'Skip to content',
  },

  nav: {
    overview: 'Overview',
    explorer: 'Competency explorer',
    map: 'Competency map',
    changes: 'Changes',
    distributions: 'Distributions',
    did: 'DiD snapshot',
    methods: 'Methods and caveats',
    menu: 'Menu',
    close: 'Close menu',
    /* Shown under the glyph on the collapsed rail (1024px and below), where the
       full name does not fit. The full name stays in aria-label and title, so
       screen readers and hover both still get it. */
    short: {
      overview: 'Overview',
      explorer: 'Explorer',
      map: 'Map',
      changes: 'Changes',
      distributions: 'Spread',
      did: 'DiD',
      methods: 'Methods',
    },
  },

  controls: {
    granularity: 'Granularity',
    quarterly: 'Quarterly',
    monthly: 'Monthly',
    domain: 'Domain',
    domainAll: 'All',
    literacy: 'Literacy',
    numeracy: 'Numeracy',
    showDid: 'Show DiD points',
    competency: 'Competency',
    competencyPlaceholder: 'Search competencies',
    filters: 'Filters',
    sort: 'Sort',
    presentationMode: 'Presentation mode',
    reset: 'Reset',
  },

  banners: {
    monthly:
      'Each month in 2025 covers a different set of schools, so month-to-month moves ' +
      'mostly reflect which schools were visited. Quarterly is the steadier view.',
    dismiss: 'Dismiss',
  },

  overview: {
    title: 'Overview',
    heroTitle: 'How Grade 2 is doing',
    heroSubtitle:
      '% achieving, averaged across the competencies each instrument tested. The set of ' +
      'competencies changes when the instrument changes (see ribbon).',
    seriesOverall: 'Overall',
    latestStrip: 'Latest round',
    latestNotComparable: 'Instrument changed, not comparable',
    standingTitle: 'Where competencies stand now',
    standingSubtitle:
      'The latest round for each competency. Each dot is marked with the instrument that ' +
      'measured it, and with its most recent same-test change where there is one.',
    findingsTitle: 'Key findings',
    openInExplorer: 'Open in the competency explorer',
  },

  explorer: {
    title: 'Competency explorer',
    chartTitle: '% achieving over time',
    factsTitle: 'About this competency',
    measuredBy: 'Measured by',
    clearanceRule: 'Achieving means',
    sampleRange: 'Children assessed',
    comparability: 'Comparability',
    latestValue: 'Latest',
    latestChange: 'Latest same-test change',
    activeFlags: 'Worth knowing',
    showFamily: 'Show related tasks',
    familyNote:
      'Related tasks share a panel but are never joined to this line. They come from ' +
      'different instruments measuring different things.',
    distributionTitle: 'How children were distributed',
    distributionSubtitle:
      'Every child assessed that round, split by how much of the task they got right.',
    standingTitle: 'How it compares with what else was tested that round',
    standingSubtitle:
      'Where this competency sat among everything the same instrument tested in the same ' +
      'round, from 0 (lowest) to 100 (highest). Rounds are separate: these dots are never joined.',
    orfTitle: 'Reading speed',
    orfSubtitle: 'Average correct words per minute. The benchmark for Grade 2 is 45.',
    orfBenchmark: 'Benchmark',
    prev: 'Previous competency',
    next: 'Next competency',
    tiers: 'Three tiers',
    fiveBands: 'Five bands',
  },

  map: {
    title: 'Competency map',
    subtitle:
      '% achieving for every competency in every round. A blank cell means the ' +
      'competency was not assessed in that round.',
    sortLadder: 'Teaching order',
    sortLatest: 'Latest value',
    sortChange: 'Latest same-test change',
    filterThreePeriods: 'Only competencies measured in 3 or more rounds',
    filterHideDidOnly: 'Hide competencies only the DiD study measured',
    notAssessed: 'Not assessed',
    legendThin: 'Fewer than 30 children, or sample size not reported',
    legendBasis: 'Not comparable with the previous round',
    legendPerfect: 'Needs full marks',
  },

  changes: {
    title: 'Changes',
    sectionA: 'Same test in both rounds — the changes you can trust',
    sectionASubtitle:
      'Same test in both rounds. The children differ (Grade 2 is a new group each year), ' +
      'the sample grew from {nFrom} to {nTo}, and the gap spans the summer break.',
    sectionB: 'Different tests — indicative only',
    sectionBSubtitle:
      'These changes cross an instrument change. Some of the movement is the children and ' +
      'some is the test. Read them as indicative.',
    sectionBLink: 'See how big the instrument effect is',
    notComparableTitle: 'Not comparable',
    notComparableSubtitle:
      'On one side of these steps the number is an average % correct from the DiD study, ' +
      'and on the other it is the share of children achieving. They are different measures, ' +
      'so they are listed rather than plotted.',
    sectionC: 'How big is the instrument effect?',
    sectionCSubtitle:
      'Same month, same-named task, two different instruments. Gaps of up to ' +
      '~{maxGap} points come from the instrument, not the children.',
    districtTool: 'District tool',
    didBaseline: 'DiD baseline',
    gap: 'Gap',
    up: 'up',
    down: 'down',
    flat: 'little change',
  },

  distributions: {
    title: 'Distributions',
    subtitle:
      'The shape behind the percentage: how children were spread on each task, not just ' +
      'how many reached the bar.',
    midlineRounded: 'End of Year report (rounded)',
    fluencyTitle: 'Reading fluency',
    fluencySubtitle:
      'Correct words per minute. Only oral reading fluency has a benchmark (45 cpm); the ' +
      'timed letter and word tasks are shown for their spread.',
    zeroTitle: 'Children scoring zero',
    zeroSubtitle:
      'The share of children who got nothing right on each task in its latest round. ' +
      'Children at zero need a different response from children who are close to the bar.',
    tierCritical: 'Critical',
    tierDeveloping: 'Developing',
    tierAchieving: 'Achieving',
    bandZero: 'Scored zero',
    bandLt25: 'Below 25%',
    band25: '25–50%',
    band50: '50–75%',
    band75: '75% and above',
  },

  did: {
    title: 'DiD snapshot',
    contextHeader:
      'Nov 2025 DiD baseline and the 25-26 End of Year assessment in Mar 2026: 40 schools ' +
      'and 177 children. Treatment and control arms are averaged equally throughout. Whether ' +
      'the same children were assessed in both rounds has not been confirmed.',
    metricNote:
      'These are average % correct, not % achieving. They are shown in a different colour ' +
      'so they are not read as the same measure as the rest of the dashboard.',
    dumbbellTitle: 'Baseline to End of Year, like for like',
    dumbbellSubtitle:
      'Average % correct in both rounds, for the competencies where the report states a ' +
      'mean for each round.',
    domainTitle: 'By domain',
    orfTitle: 'Oral reading fluency',
    orfSubtitle: 'Average correct words per minute in each round. The benchmark is 45.',
    midlineOnlyTitle: 'End of Year only, or bands only',
    midlineOnlySubtitle:
      'The End of Year report gives a distribution for these tasks but no stated average, ' +
      'so there is nothing to compare the baseline against.',
    baseline: 'DiD baseline, Nov 2025',
    midline: '25-26 End of Year, Mar 2026',
    change: 'Change',
  },

  methods: {
    title: 'Methods and caveats',
    intro:
      'What the numbers on this dashboard mean, where they come from, and what they cannot ' +
      'tell you. Nothing here is new analysis: every definition is the one the pipeline uses.',
    metricTitle: 'What "% achieving" means',
    timelineTitle: 'Which instrument measured what, and when',
    timelineSubtitle:
      'Seven assessment rounds over thirteen months. Every step in a trend line either sits ' +
      'inside one of these blocks or crosses between two, and that is the single most useful ' +
      'thing to know before reading any change on this site.',
    didTitle: 'How the DiD study enters',
    crossToolTitle: 'Why changes across instruments are only indicative',
    cohortTitle: 'The children change',
    compositionTitle: 'Months cover different schools',
    buildTitle: 'This build',
    crosswalkTitle: 'How raw items map to competencies',
    crosswalkSearch: 'Search items or competencies',
    crosswalkColumns: {
      competency: 'Competency',
      instrument: 'Instrument',
      rawName: 'Item as it appears in the tool',
      stacking: 'Comparable across rounds',
      confidence: 'Confidence',
      reasoning: 'Reasoning',
    },
    downloadsTitle: 'Downloads',
    downloadsSubtitle:
      'The aggregate tables behind every chart on this site, and the data dictionary that ' +
      'defines every column. No file here contains a child or a school name.',
  },

  chart: {
    viewAsTable: 'View as table',
    viewAsChart: 'View as chart',
    export: 'Export',
    downloadPng: 'Download PNG',
    downloadSvg: 'Download SVG',
    downloadCsv: 'Download data (CSV)',
    latest: 'Latest',
    newCohort: 'New Grade 2 cohort',
    notComparableGlyph: 'Not comparable: % correct vs % achieving',
    perfectScoreTick: 'On this task, achieving needs full marks',
    sourceNote: 'Basti Grade 2 competency trends · {file}',
    noData: 'No data to show for this selection.',
  },

  /**
   * Instrument display names, keyed by source_tool.
   *
   * These live here rather than being read from the CSV's source_tool_label so
   * that renaming a round is a one-line change and a Hindi build can translate
   * them. An instrument not listed here falls back to the label the pipeline
   * wrote, so a new tool still renders.
   */
  tools: {
    july_tool: 'July tool',
    aug_tool: 'Aug tool',
    q3_2025_tool: 'Q3 2025 tool',
    q1_2026_tool: 'Q1 2026 tool',
    q2_2026_tool: 'Q2 2026 tool',
    did_baseline: 'DiD baseline',
    did_midline: '25-26 End of Year',
  },

  /**
   * When each instrument was actually in the field.
   *
   * These dates are editorial: the published aggregates carry periods, not
   * fieldwork dates, so they live here rather than being invented from the data.
   * Sample sizes on the Methods timeline ARE read from the data.
   */
  instrumentDates: {
    july_tool: '4–8 Aug 2025',
    aug_tool: '11–13 Aug and 10–26 Sep 2025',
    q3_2025_tool: '10 Oct – 18 Dec 2025',
    did_baseline: 'Nov 2025',
    did_midline: 'Mar 2026',
    q1_2026_tool: 'Apr–May 2026',
    q2_2026_tool: 'Jul–Aug 2026',
  },

  /** Reference points: a DiD round measured alongside a district tool. */
  reference: {
    label: 'DiD baseline (% correct)',
    legend: 'DiD baseline — a second reading, shown for reference',
    note:
      'The DiD study measured this competency in the same period as the district tool. ' +
      'Its number is an average % correct, not the share of children achieving, so it sits ' +
      'beside the line rather than on it. The dotted link shows where it sat; it is not a change.',
  },

  /** Comparability, in plain words. Keyed by stacking_status. */
  comparability: {
    stack: 'Same task across rounds',
    stack_with_caveat: 'Similar task, instrument differs',
    single_source: 'Measured once',
  },

  /** Change defensibility, in plain words. Keyed by change_defensibility. */
  defensibility: {
    within_tool: 'Same test in both rounds',
    cross_tool_matched_construct: 'Different test, same skill',
    cross_tool_caveat: 'Different test, and the task is not quite the same',
    metric_basis_changed: 'Not comparable: % correct vs % achieving',
  },

  /** Reliability flags, in plain words. Build brief, section 5. */
  flags: {
    thin_n: 'Fewer than 30 children',
    n_unknown_n: 'Sample size not reported',
    ceiling: 'Almost everyone achieved, so there is little room to show change',
    perfect_score_required: 'On this task, achieving needs full marks',
    slide_band_gt75_not_ge75: "From the End of Year report's above-75% band",
    baseline_pct_correct_not_clearance: 'Average % correct, not % achieving',
    cleared_at_2_of_3: 'Achieved at 2 of 3, the rule this tool used',
    crosswalk_caveat: 'Similar task across instruments, not identical',
    single_source: 'Measured in only one round',
    pooled_sources: 'Combines two assessments in the same period',
    no_clearance_value: 'No percentage to plot for this measure',
  },

  /** What kind of number sits in the value, in plain words. Keyed by metric_basis. */
  basis: {
    pct_students_cleared: 'Share of children achieving the competency',
    did_pct_correct: 'Average % correct from the DiD baseline, not % achieving',
    slide_top_band_gt75:
      "Share of children in the End of Year report's above-75% band. A child at exactly " +
      '75% is not counted.',
    pooled: 'Combines two assessments taken in the same period',
  },

  empty: {
    notAssessed: '{competency} was not assessed in {period}.',
    nearestRounds: 'The nearest rounds are {rounds}.',
    nearestRound: 'The nearest round is {round}.',
    noRounds: '{competency} has no rounds with a percentage to plot.',
    missingFile:
      'This view needs {file}, which has not been synced into the site yet. Run ' +
      'the pipeline, then scripts/sync_site_data.py, and it will appear here.',
    noResults: 'Nothing matches that search.',
  },

  a11y: {
    tableCaption: 'The exact data plotted in the chart above',
    closeTooltip: 'Close',
    tooltipHint: 'Press Escape to close',
    sortedBy: 'Sorted by {field}',
    currentPage: 'Current page',
  },

  units: {
    nNotReported: 'n not reported',
    n: 'n = {n}',
    children: '{n} children',
    schools: '{n} schools',
    points: 'points',
    pointsShort: 'pts',
    cpm: 'cpm',
    percent: '%',
  },
};

/**
 * Fill {placeholders} in a string.
 * `t(strings.units.n, { n: '1,361' })` -> `n = 1,361`
 */
export function t(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

/** Plain-language text for a semicolon-separated reliability_flags value. */
export function flagText(flag) {
  return strings.flags[flag] || flag.replace(/_/g, ' ');
}

/** Order a set of source_tool codes the way the instruments were actually used. */
export function sortInstruments(tools) {
  const order = Object.keys(strings.tools);
  const rank = (tool) => (order.indexOf(tool) === -1 ? order.length : order.indexOf(tool));
  return [...tools].sort((a, b) => rank(a) - rank(b));
}

/**
 * Display name for the instrument(s) behind a row.
 *
 * Prefers the names in `strings.tools` so a rename or a translation is a
 * one-line change here, and falls back to the label the pipeline wrote for any
 * instrument this file does not yet know about.
 */
export function instrumentLabel(row) {
  const tools = row?.source_tools?.length ? row.source_tools : [];
  if (!tools.length) return row?.source_tool_label || '—';
  // `strings.tools` is written in the order the instruments were used, so two
  // instruments sharing a period read chronologically ("July tool + Aug tool")
  // rather than in whatever order the CSV happened to list them.
  const order = Object.keys(strings.tools);
  const rank = (tool) => (order.indexOf(tool) === -1 ? order.length : order.indexOf(tool));
  const sorted = [...tools].sort((a, b) => rank(a) - rank(b));
  const named = sorted.map((tool) => strings.tools[tool] || null);
  if (named.some((name) => name === null)) return row.source_tool_label || sorted.join(' + ');
  return named.join(' + ');
}
