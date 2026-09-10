/**
 * Phase 1 acceptance page, at #/debug. Not linked from the rail.
 *
 * It exists to prove the data layer before any chart is drawn:
 *   - every competency is listed, with its ladder position and domain
 *   - every period appears in the correct order, including empty slots
 *   - row counts match manifest.json exactly
 *
 * It is also where the two resilience tests from the QA checklist are read:
 * add a fake Q3_2026 row or an unknown competency ID to a local copy of the
 * CSV and this page should absorb both without a code change.
 */

import { load, loadTrends, periodSlots, competenciesInData, trendPoints, plottable } from '../data.js';
import { competency } from '../competencies.js';
import { quarterAxisLabel, monthLabel, int, pct1, buildDate } from '../format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title, subtitle) {
  const wrap = el('section', 'section');
  wrap.append(el('h2', 'section__title', title));
  if (subtitle) wrap.append(el('p', 'section__subtitle', subtitle));
  return wrap;
}

function table(headers, rows) {
  const wrap = el('div', 'table-wrap');
  const node = el('table', 'data');
  const thead = el('thead');
  const headRow = el('tr');
  for (const header of headers) {
    const th = el('th', header.num ? 'num' : null, header.label ?? header);
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    row.forEach((cell, index) => {
      const td = el('td', headers[index]?.num ? 'num' : null);
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell ?? '—';
      tr.append(td);
    });
    tbody.append(tr);
  }
  node.append(thead, tbody);
  wrap.append(node);
  return wrap;
}

function check(ok, text) {
  const node = el('span', 'debug-check', `${ok ? '✓' : '✗'} ${text}`);
  node.dataset.ok = String(ok);
  return node;
}

export async function mount(root, ctx) {
  const [quarterly, monthly, domain, manifest] = await Promise.all([
    load.quarterly(),
    load.monthly(),
    load.domain(),
    load.manifest(),
  ]);

  root.append(el('h1', 'page-title', 'Data layer check'));
  root.append(
    el(
      'p',
      'page-intro',
      'Phase 1 acceptance. Every competency, every period in order, and row counts ' +
        'against the manifest. This page is not linked from the navigation.'
    )
  );

  // --- Row counts vs manifest ---------------------------------------------
  const counts = section(
    'Row counts',
    'Parsed rows must equal the row counts the sync script wrote into manifest.json.'
  );
  const parsed = {
    'quarterly_trends.csv': quarterly.length,
    'monthly_trends.csv': monthly.length,
    'domain_level_trend.csv': domain.length,
  };
  counts.append(
    table(
      ['File', { label: 'Parsed', num: true }, { label: 'Manifest', num: true }, 'Match'],
      Object.entries(parsed).map(([file, rows]) => {
        const expected = manifest?.files?.[file]?.rows ?? null;
        return [file, int(rows), expected === null ? '—' : int(expected), check(expected === rows, expected === rows ? 'equal' : 'MISMATCH')];
      })
    )
  );
  counts.append(
    el('p', 'section__subtitle', `Manifest built at ${manifest?.built_at ? buildDate(manifest.built_at) : 'unknown'}.`)
  );
  root.append(counts);

  // --- Period order --------------------------------------------------------
  const quarterSlots = periodSlots(quarterly, 'quarterly', quarterly);
  const monthSlots = periodSlots(monthly, 'monthly', quarterly);

  const periods = section(
    'Period order',
    'Quarters are ordered by their start month, never alphabetically. Months run the ' +
      'full study window so empty months keep their slot on the axis.'
  );
  periods.append(el('h3', 'control__label', 'Quarters'));
  periods.append(
    table(
      ['#', 'Code', 'Axis label', 'Starts', 'Instruments', 'Has data'],
      quarterSlots.map((slot, index) => [
        String(index + 1),
        slot.key,
        `${quarterAxisLabel(slot.key, slot.label).primary} · ${quarterAxisLabel(slot.key, slot.label).secondary}`,
        slot.sort,
        slot.sourceTools.join(', ') || '—',
        check(slot.hasData, slot.hasData ? 'yes' : 'empty slot'),
      ])
    )
  );
  periods.append(el('h3', 'control__label', 'Months'));
  periods.append(
    table(
      ['#', 'Month', 'Label', 'Instruments', 'Has data'],
      monthSlots.map((slot, index) => [
        String(index + 1),
        slot.key,
        monthLabel(slot.key),
        slot.sourceTools.join(', ') || '—',
        check(slot.hasData, slot.hasData ? 'yes' : 'empty slot — must stay visible'),
      ])
    )
  );
  root.append(periods);

  // --- Competencies --------------------------------------------------------
  const list = competenciesInData(quarterly);
  const unknown = list.filter((c) => !c.known);
  const comps = section(
    'Competencies',
    `${list.length} competencies in the quarterly file, in domain then ladder order. ` +
      (unknown.length
        ? `${unknown.length} are not in the ladder table and were humanised — check the console for warnings.`
        : 'All are in the ladder table in competencies.js.')
  );
  comps.append(
    table(
      [
        { label: 'Ladder', num: true },
        'ID',
        'Display name',
        'Domain',
        'Family',
        { label: 'Rounds', num: true },
        { label: 'Latest %', num: true },
        'Known',
      ],
      list.map((c) => {
        const points = trendPoints(quarterly, { competency: c.id });
        const latest = points.sort((a, b) => (a.period_sort < b.period_sort ? -1 : 1)).at(-1);
        return [
          String(c.order),
          c.id,
          c.name,
          c.domain,
          c.family ?? '—',
          String(points.length),
          latest ? pct1(latest.pct_students_cleared) : '—',
          check(c.known, c.known ? 'in table' : 'humanised'),
        ];
      })
    )
  );
  root.append(comps);

  // --- Parsing spot checks -------------------------------------------------
  const skipped = quarterly.filter((r) => !r.has_clearance_value);
  const basisChanges = quarterly.filter(
    (r) => r.row_type === 'trend_point' && r.change_defensibility === 'metric_basis_changed'
  );
  const pooled = quarterly.filter((r) => r.is_pooled);
  const missingN = plottable(quarterly).filter((r) => r.n === null);

  const parsing = section(
    'Parsing spot checks',
    'The gotchas from section 3.4 of the brief: booleans as strings, empty cells as ' +
      'missing rather than zero, and pooled source names.'
  );
  parsing.append(
    table(
      ['Check', { label: 'Rows', num: true }, 'Note'],
      [
        [
          'has_clearance_value = False (skipped everywhere)',
          String(skipped.length),
          skipped.map((r) => `${r.std_competency} ${r.period}`).join('; ') || '—',
        ],
        [
          'metric_basis_changed steps (never drawn as a line)',
          String(basisChanges.length),
          'QA checklist expects 23 in the quarterly file',
        ],
        [
          'Pooled rows (source_tool starts "pooled:")',
          String(pooled.length),
          [...new Set(pooled.map((r) => r.source_tools.join(' + ')))].join('; '),
        ],
        [
          'Plottable rows with no n (must read "n not reported")',
          String(missingN.length),
          'null, never 0 or NaN',
        ],
        [
          'Booleans parsed from "True"/"False"',
          String(quarterly.filter((r) => r.is_did_point === true).length),
          'is_did_point true rows',
        ],
      ]
    )
  );
  root.append(parsing);

  // --- Domain series -------------------------------------------------------
  const domainQuarterly = domain.filter((r) => r.period_type === 'quarter' && r.row_type === 'trend_point');
  const domainSection = section(
    'Domain series',
    'The Overview hero reads these rows. Values are plotted exactly as written.'
  );
  domainSection.append(
    table(
      [
        'Quarter',
        { label: 'Overall', num: true },
        { label: 'Literacy', num: true },
        { label: 'Numeracy', num: true },
        { label: 'n', num: true },
        'Instrument',
      ],
      domainQuarterly
        .sort((a, b) => (quarterSlots.findIndex((s) => s.key === a.period) - quarterSlots.findIndex((s) => s.key === b.period)))
        .map((r) => [
          r.period,
          pct1(r.overall_pct_cleared),
          pct1(r.literacy_pct_cleared),
          pct1(r.numeracy_pct_cleared),
          r.n_students === null ? 'not reported' : int(r.n_students),
          r.source_tool_label ?? '—',
        ])
    )
  );
  root.append(domainSection);
}

export function unmount() {
  // Nothing to tear down: this page holds no listeners or observers.
}
