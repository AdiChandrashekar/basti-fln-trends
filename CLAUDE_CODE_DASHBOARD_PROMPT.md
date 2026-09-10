# Build brief: Basti Grade 2 competency trends dashboard

You are building a static, single-page dashboard that shows how Grade 2 children in Basti district (Uttar Pradesh) perform on specific foundational literacy and numeracy (FLN) competencies over time, from August 2025 to August 2026. It will be published on GitHub Pages. The analysis and data preparation are finished. Your job is visualisation, interaction, visual identity, and deployment.

Read this whole brief before writing code. Then follow the working process in section 1.

---

## 0. What the dashboard is for, and what it is not

**Purpose.** Show the share of Grade 2 children achieving each competency at each point in time, how that share moves, and how much of each movement can be trusted. The unit of analysis is the competency. Everything on screen should answer one of these questions:

1. Where does Grade 2 stand on each competency right now?
2. Which competencies are moving, in which direction, and is the movement real or an artefact of a changed assessment instrument?
3. Which competencies are persistently weak or strong, relative to the others assessed at the same time?
4. How are children distributed on a competency: mostly near zero, bunched in the middle, or mostly achieving?
5. What did the DiD baseline (Nov 2025) and midline (Mar 2026) show, and how does that sit against the district series?

**Audience.**
- Adi, the data and monitoring lead in the District Project Management Unit.
- CSF colleagues.
- District education officials in review meetings, who will see the dashboard on a laptop, on a projector, and sometimes on a phone.

Assume the users understand FLN and NIPUN Bharat vocabulary, but not statistics jargon.

**Out of scope. Do not build any of these, even if the data makes them possible:**
- Views by school, block, assessor, or student.
- Individual assessment records or student lists.
- Rankings of schools or blocks.
- Any view of treatment vs control arms from the DiD study. The arms are deliberately collapsed.
- Recomputing any metric from student-level data.

---

## 1. Working process

1. **Read first.** Read `data_dictionary.md` in full, then inspect the header and a few rows of every CSV listed in section 3. The dictionary is the authority on every definition. If this brief and the dictionary ever disagree about a data definition, the dictionary wins. Flag the conflict to Adi.
2. **Write a short design plan before any code.** Cover:
   - the palette tokens
   - the type scale
   - an ASCII wireframe of each page
   - the chart grammar you will use
   - how you will structure the JS modules

   Then review the plan against sections 6 to 8 of this brief, revise anything that reads like a generic dashboard template, and show the plan to Adi for confirmation.
3. **Build in the phases in section 11.** Take screenshots at 1440px, 1024px, and 390px widths after each phase, and critique them before moving on.
4. **Run the QA checklist in section 12 before declaring done.**
5. **Ask when a data question is ambiguous.** Never guess or silently derive a new definition.

---

## 2. Hard rules

These apply to every page and every chart.

### Data integrity
- **Never recompute, re-aggregate, smooth, or interpolate any metric.** Plot values exactly as they appear in the CSVs. The only computations allowed in the browser are:
  - filtering, sorting and formatting;
  - the two display summaries defined in section 6 (the "persistently weak" count on the Relative standing page, and the latest-within-instrument change on the Overview).
- **Lines connect `trend_point` rows only.** `source_detail` rows appear as individual markers and in tooltips, never as lines.
- **Never draw a connector across a `metric_basis_changed` step.** On one side of those steps the number is DiD % correct; on the other it is a share of students achieving. They are different measures.
- **Never plot mean % score as a primary series.** The tracked metric is the share of children who achieved the competency. Mean scores appear only in tooltips and on the DiD page, where the like-for-like baseline vs midline comparison uses % correct.
- **Y-axes for percentages always run 0 to 100.** Never truncate them.
- **Build every chart dynamically from the CSVs.** No value is typed into the code. The pipeline will be re-run, and the dashboard must pick up new numbers, new competencies, and new periods (for example a Q3 2026 round) without code changes.

### Privacy
The raw data contains children's names and school names. The GitHub Pages site will almost certainly be served from a public repository.

- **Never copy these into the published site folder or commit them:**
  - `data/student_scores_long.csv`
  - `audit/duplicate_log_diag_aug_vs_q2_2025.csv`
  - the raw Excel file `Basti_All_Spots.xlsx`
- **Add them to `.gitignore`.**
- **Make the data-sync script (section 9) fail loudly** if any file containing a `student_name` column, or any file from the list above, ends up in the published folder.
- **`n_schools` is fine to show.** It is an aggregate count. School names never appear anywhere on the site.

### Scope
- Competency first. Views never slice by school, block, assessor, or student.

---

## 3. The data you are given

All files come from Adi's pipeline, `build_trends.py`. The folder the pipeline writes to looks like this:

```
basti_fln_trends/
  build_trends.py
  data_dictionary.md                 <- authority on all definitions
  inputs/
    competency_crosswalk.csv         <- raw item -> std_competency mapping (publishable)
    baseline_nov2025_extraction.csv  <- DiD baseline values from the deck
    march2026_extraction.csv         <- DiD midline means + band distributions from the deck
  data/
    quarterly_trends.csv             <- competency x quarter x source      (~71 KB)
    monthly_trends.csv               <- competency x month x source        (~96 KB)
    domain_level_trend.csv           <- literacy / numeracy / overall      (~15 KB)
    nonstacking_competency_views.csv <- ranks, z-scores, bands, tiers      (~612 KB, long format)
    did_baseline_midline_comparison.csv <- standalone DiD comparison       (~7 KB)
    tool_calibration_nov2025.csv     <- same-month instrument gap          (~1 KB)
    student_scores_long.csv          <- PRIVATE: contains child names. Never publish.
  audit/                              <- PRIVATE audit logs. Never publish.
```

### 3.1 The primary metric

The tracked value is `pct_students_cleared`: the share of assessed children who achieved the competency. Achieving means one of the following:

- scoring 75% or more of the competency's items;
- for oral reading fluency (ORF), reading at 45 correct words per minute (cpm) or more;
- for the four Q3 2025 three-item tasks, scoring 2 of 3, which was the rule that tool used at the time.

**In the UI, call this "% achieving".** Its full definition goes in chart subtitles and the Methods page. The column name `cleared` is internal and should not appear on screen.

**Exceptions carried in the same column.** The `metric_basis` column tells you what kind of number sits in `pct_students_cleared`:

| `metric_basis` | Meaning | How to show it |
|---|---|---|
| `pct_students_cleared` | District assessment tools: the share of students achieving | Standard marker |
| `did_pct_correct` | DiD baseline, Nov 2025: **mean % correct**, taken directly from the deck, arms averaged | Distinct marker. Label it "% correct (DiD baseline)" in tooltips. |
| `slide_top_band_gt75` | DiD midline, Mar 2026: share of children in the slide's top band (>75%; for ORF, ≥45 cpm) | Distinct marker. Note that a child at exactly 75% is not counted. |
| combinations joined with `+` | Pooled trend point mixing bases (Nov 2025 and Q3 2025 only) | Pooled marker, and list the bases in the tooltip |

### 3.2 Which rows to use

Every trend file has a `row_type` column:
- **`trend_point`** rows: exactly one per competency per period. Use these for lines, heatmap cells, and period summaries.
- **`source_detail`** rows: one per competency × period × source. Use these for secondary markers and tooltip breakdowns, especially in periods with two sources (Aug 2025: July tool and Aug tool; Nov 2025 / Q3 2025: Q3 2025 tool and DiD baseline).

Skip rows where `has_clearance_value` is `False`. These are CPM-only DiD baseline items, which have no percentage to plot.

### 3.3 Key columns and how to use them

**`quarterly_trends.csv` / `monthly_trends.csv`.** The two files share their columns. The monthly file uses `month`, `prev_month`, `months_gap` and `mom_change_pp` in place of the quarterly names.

- **`std_competency`**: stable competency ID. Map it to a display name with the table in 3.5.
- **`competency_family`**: groups related series that must not be joined but can share a panel. For example `addition` (district tools), `addition_1digit`, and `addition_2digit` (DiD) all belong to the family `addition`.
- **`domain`**: `literacy` or `numeracy`.
- **Period columns (quarterly file):** `quarter_code`, `quarter_label`, `quarter_start_month`, `quarter_end_month`, `is_partial_quarter`, `months_with_data`.
- **Source columns:** `source_tool`, `source_tool_label`, `tool_family`, `is_did_point`.
- **`stacking_status`**:
  - `stack`: connect freely.
  - `stack_with_caveat`: connect, following the dash rules in section 5.
  - `single_source`: points only, never a line.
- **`measure_unit`**: `pct` or `cpm`. For `cpm` rows (ORF), `pct_students_cleared` is the share at 45+ cpm, and `mean_cpm` holds the average fluency.
- **`clearance_rule`**: a human-readable rule. Show it in tooltips.
- **Value columns:** `n`, `n_schools`, `pct_students_cleared`, `ci95_low`, `ci95_high` (Wilson 95% interval; present only on single-source district-tool rows), `se`.
- **Secondary columns** (tooltips only): `pct_cleared_tool_flag`, `mean_pct_score`, `median_pct_score`, `mean_cpm`.
- **Flag columns:**
  - `perfect_score_required`: on this item, achieving means full marks.
  - `stability_flag`: `thin` (n<30), `moderate`, `robust` (n≥100), `n_unknown`, or `pooled`.
  - `reliability_flags`: a semicolon-separated list. Possible values: `thin_n`, `n_unknown_n`, `ceiling`, `perfect_score_required`, `slide_band_gt75_not_ge75`, `baseline_pct_correct_not_clearance`, `cleared_at_2_of_3`, `crosswalk_caveat`, `single_source`, `pooled_sources`, `no_clearance_value`.
  - `pooling_method`: `single_source`, `n_weighted`, or `equal_weight_sources`.
- **Change columns:** `qoq_change_pp` / `mom_change_pp`, `prev_quarter` / `prev_month`, `quarters_gap` / `months_gap`.
- **`change_defensibility`**, on the arriving point of each change:
  - `within_tool`: same instrument, the cleanest change.
  - `cross_tool_matched_construct`: different instrument, same construct.
  - `cross_tool_caveat`: different instrument with a construct caveat.
  - `metric_basis_changed`: not comparable. Do not connect.

**`domain_level_trend.csv`:**
- **Keys:** `period_type` (`month` or `quarter`), `period`, `row_type`, `source_tool`, `includes_did`, `has_clearance_value`, `n_students`.
- **Values:** `literacy_pct_cleared`, `numeracy_pct_cleared`, `overall_pct_cleared`, plus the `change_*_pp_vs_prev` columns.
- **Composition:** `literacy_competencies` / `numeracy_competencies` (pipe-separated) and `*_n_competencies`. The domain rollup changes composition between instruments, so show it in tooltips.
- **`coverage_note`**: text to show when non-empty.
- **Secondary:** `*_mean_pct_score`.

**`nonstacking_competency_views.csv`** is in long format. Filter by `view`, `period_type` and `metric`:
- `view = small_multiples_index`:
  - metrics: `pct_students_cleared`, `z_within_panel`, `percentile_within_panel`, `rank_within_panel`
  - one panel per `panel_id` (period | source | scope), where `index_scope` is `literacy`, `numeracy` or `all`
- `view = mastery_bands`:
  - metrics `pct_students_b1_0`, `b2_lt25`, `b3_25_50`, `b4_50_75`, `b5_75plus`
  - tiers `pct_students_tier_critical`, `tier_developing`, `tier_cleared`
  - fluency bands `pct_students_cpm_0`, `cpm_1-15`, `cpm_16-29`, `cpm_30-44`, `cpm_45-59`, `cpm_60+`
  - `band_source` says whether the bands come from student-level scores or from the midline slide charts. Slide values are rounded and sum to 99–101.

**`did_baseline_midline_comparison.csv`:**
- **Like-for-like comparison:** `baseline_mean` and `midline_mean` (% correct in both rounds, or cpm for ORF), and `mean_change`. Use these for every baseline vs midline comparison.
- **Series values:** `baseline_value_in_series` and `midline_value_in_series`, which are what each round contributes to the trend series. They sit on different bases, so don't compare them.
- **Other columns:** `midline_pct_zero_band` and `note`.
- **`comparison_status`**: `both_means`, `baseline_mean + midline_bands_only`, `baseline_only`, `midline_only`, or `summary`. The two rows `_domain_matched_set_literacy` and `_domain_matched_set_numeracy` are domain summaries and are not competencies.

**`tool_calibration_nov2025.csv`:** holds the November 2025 district-tool and DiD-baseline mean scores side by side for six shared competencies, with the gap between them. It is evidence of instrument effect.

### 3.4 Parsing gotchas

- **Do not sort quarters as strings.** `Q1_2026` sorts before `Q2_2025` alphabetically, which is wrong. The quarters follow the district cycle:
  - `Q1_yyyy` = Apr–Jun yyyy
  - `Q2_yyyy` = Jul–Sep yyyy
  - `Q3_yyyy` = Oct–Dec yyyy
  - `Q4_yyyy` = Jan–Mar of yyyy+1

  Order by `quarter_start_month` where available, otherwise parse with this rule. Months (`YYYY-MM`) sort correctly as strings.
- **Booleans arrive as the strings `"True"` and `"False"`.** Parse them explicitly.
- **Empty cells are empty strings.** Treat them as missing, never as zero.
- **`n` is missing** for the DiD baseline and for pooled Nov 2025 / Q3 2025 points. Show "n not reported". Never show 0 or NaN.
- **`source_tool` values can be `pooled:a+b`.** Split on `+` after stripping `pooled:`.
- **The views file mixes period types.** The `period` column holds quarter codes for `period_type = quarter` and months for `period_type = month`. Always filter on `period_type`.
- **Percentages are 0–100 floats.** Display them rounded to whole numbers, and to one decimal only inside tooltips and tables.

### 3.5 Competency display names and order

Keep this table in a single config module, `competencies.js`, so labels live in one place. The order is the pedagogical ladder. Use it as the default sort everywhere, within each domain.

| Order | `std_competency` | Display name | Domain |
|---|---|---|---|
| 1 | `oral_language_dev` | Oral language | Literacy |
| 2 | `listening_comprehension` | Listening comprehension | Literacy |
| 3 | `oral_vocabulary` | Oral vocabulary | Literacy |
| 4 | `picture_comprehension` | Picture comprehension | Literacy |
| 5 | `letter_recognition` | Letter recognition | Literacy |
| 6 | `letter_naming_fluency` | Letter naming (timed) | Literacy |
| 7 | `word_reading` | Word reading | Literacy |
| 8 | `word_reading_fluency` | Word reading (timed) | Literacy |
| 9 | `sentence_reading` | Sentence reading | Literacy |
| 10 | `oral_reading_fluency` | Oral reading fluency | Literacy |
| 11 | `reading_comprehension` | Reading comprehension | Literacy |
| 12 | `letter_writing` | Letter writing | Literacy |
| 13 | `word_writing` | Word writing | Literacy |
| 14 | `sentence_writing` | Sentence writing | Literacy |
| 15 | `independent_writing` | Independent writing | Literacy |
| 16 | `number_recognition` | Number recognition | Numeracy |
| 17 | `number_comparison` | Number comparison | Numeracy |
| 18 | `number_writing` | Number writing | Numeracy |
| 19 | `place_value_bundles` | Place value (counting in bundles) | Numeracy |
| 20 | `addition_1digit` | Addition, 1-digit | Numeracy |
| 21 | `addition` | Addition (district tools) | Numeracy |
| 22 | `addition_2digit` | Addition, 2-digit (DiD) | Numeracy |
| 23 | `subtraction_1digit` | Subtraction, 1-digit | Numeracy |
| 24 | `subtraction` | Subtraction (district tools) | Numeracy |
| 25 | `subtraction_2digit` | Subtraction, 2-digit (DiD) | Numeracy |
| 26 | `add_sub_1digit_combined` | Addition and subtraction, 1-digit (combined score) | Numeracy |
| 27 | `word_problem_addition` | Word problems, addition | Numeracy |
| 28 | `word_problem_subtraction` | Word problems, subtraction | Numeracy |
| 29 | `multiplication` | Multiplication | Numeracy |
| 30 | `pattern` | Patterns (district tools) | Numeracy |
| 31 | `number_pattern` | Number patterns (DiD) | Numeracy |
| 32 | `shape_pattern` | Shape patterns (DiD) | Numeracy |
| 33 | `shapes_2d` | 2D shapes | Numeracy |
| 34 | `shapes_1` | Shapes, item 1 (DiD) | Numeracy |
| 35 | `shapes_2` | Shapes, item 2 (DiD) | Numeracy |
| 36 | `shapes_midline_unspecified` | Shapes (midline) | Numeracy |
| 37 | `measurement` | Measurement | Numeracy |
| 38 | `data_handling` | Data handling | Numeracy |
| 39 | `money` | Money | Numeracy |

If the data contains a `std_competency` not in this table, the dashboard must still render it. Humanise the ID, place it at the end of its domain, and log a console warning.

### 3.6 Sources and instruments

| `source_tool` | Display label | Real dates | Marker |
|---|---|---|---|
| `july_tool` | July tool | 4–8 Aug 2025 | filled circle |
| `aug_tool` | Aug tool | mid-Aug to Sep 2025 | filled circle |
| `q3_2025_tool` | Q3 2025 tool | Oct–Dec 2025 | filled circle |
| `did_baseline` | DiD baseline (% correct) | Nov 2025 | diamond |
| `did_midline` | DiD midline / EOY | Mar 2026 | square |
| `q1_2026_tool` | Q1 2026 tool | Apr–May 2026 | filled circle |
| `q2_2026_tool` | Q2 2026 tool | Jul–Aug 2026 | filled circle |
| `pooled:…` | Combined sources | — | circle with an outer ring |

The two 2026 tools share one battery (`tool_family = 2026_tool`). April 2026 onward is a new cohort of Grade 2 children. That is by design: the series is a repeated snapshot of whoever is in Grade 2.

---

## 4. Information architecture

A single-page app with hash routing (`#/overview`, `#/competency/word_writing`, and so on) and seven pages in a persistent navigation rail:

1. **Overview**
2. **Competency explorer**
3. **Competency map**, the heatmap
4. **Changes**
5. **Distributions**
6. **DiD snapshot**
7. **Methods and caveats**

Oral reading fluency lives inside the Competency explorer and the Distributions page. It does not need its own page.

**Global controls** sit in a slim control bar under the page title. Each page shows only the controls it uses:
- **Granularity:** Quarterly (default) or Monthly.
- **Domain:** All, Literacy, or Numeracy.
- **Show DiD points:** on by default.
- **Competency picker:** a searchable combobox grouped by domain, then family, in ladder order.

**URL state.** All control state lives in the URL hash, so any view can be shared as a link. A link opens on exactly the same state.

**Monthly banner.** When Monthly is selected, show a persistent, dismissible notice: "Each month in 2025 covers a different set of schools, so month-to-month moves mostly reflect which schools were visited. Quarterly is the steadier view."

---

## 5. Chart grammar

Apply these encodings identically everywhere, so a user learns them once.

### Time axis
- Quarterly x-axis labels read "Jul–Sep 2025" on the first line and "Q2 2025" smaller beneath.
- Monthly labels read "Aug 2025".
- Periods with no data still occupy their slot on the axis: Jan–Mar 2026 in quarterly holds only the midline; Jul 2025, Jan–Feb 2026 and Jun 2026 are empty months. Gaps must be visible, not collapsed.

### The instrument ribbon (signature element)
Under every time axis, draw a thin horizontal ribbon about 14px tall that shows which assessment instrument produced each period:
- Segments are derived from the `source_tool` values present in each period.
- Each segment is labelled with the instrument name in small type.
- DiD rounds appear as distinct notches.
- A thin vertical rule marks each instrument change and continues faintly up through the plot area.
- A labelled marker at Apr 2026 reads "New Grade 2 cohort".

This ribbon makes every cross-instrument jump self-explaining. It should be the most recognisable visual device in the dashboard.

### Lines and segments
Draw each segment between consecutive trend points of the same `std_competency` according to the `change_defensibility` of the arriving point:

| `change_defensibility` | Segment style |
|---|---|
| `within_tool` | solid, 2.5px |
| `cross_tool_matched_construct` | long dash (8 4), 2px |
| `cross_tool_caveat` | short dash (3 3), 2px |
| `metric_basis_changed` | **no segment**. Leave a gap and place a small "≠" glyph midway at the line's height, with a tooltip: "Not comparable: % correct vs % achieving" |
| none (first point) | — |

- A `single_source` competency is shown as points only.
- Segments spanning a missing period (`quarters_gap` > 1) keep their style. The x-spacing shows the gap on its own.

### Markers
- Shape comes from the source (section 3.6).
- **Hollow markers** mean `stability_flag` is `thin` or `n_unknown`, or `reliability_flags` contains `ceiling`.
- **A small gold tick** above a marker means `perfect_score_required` is true. Its tooltip reads: "On this task, achieving needs full marks".
- **Source-detail markers** appear at 50% opacity next to a pooled trend point, so the user sees both sources behind a combined number.

### Uncertainty
- Where `ci95_low` and `ci95_high` exist, draw a soft band or a vertical whisker. Use whiskers on small multiples and bands on the explorer's main chart.
- Pooled and DiD points have no interval. Don't fake one.

### Direct labelling
- Label lines at their right end instead of using a legend wherever there are six series or fewer.
- Always print the latest value next to the last point.

### Tooltips
Tooltips follow one consistent structure, pinned on click or tap:
1. Competency and period.
2. The value, plus n ("n not reported" when missing).
3. The instrument and the clearance rule.
4. The metric basis, in plain words.
5. Flags, in plain words.
6. The change from the previous point, with its defensibility label.
7. Secondary values: the tool's own flag rate, mean score, and mean cpm.

Plain-language flag glossary for tooltips:
- `thin_n`: "Fewer than 30 children"
- `ceiling`: "Almost everyone achieved, so there is little room to show change"
- `crosswalk_caveat`: "Similar task across instruments, not identical"
- `cleared_at_2_of_3`: "Achieved at 2 of 3, the rule this tool used"
- `slide_band_gt75_not_ge75`: "From the midline report's above-75% band"
- `baseline_pct_correct_not_clearance`: "Average % correct, not % achieving"
- `pooled_sources`: "Combines two assessments in the same period"
- `n_unknown_n`: "Sample size not reported"

### Current-period highlight
The latest period with data gets a gold (#FFC000) translucent column behind it on time charts, labelled "Latest".

### Colour carries domain and tier, not source
Source is always encoded by shape. Never use colour alone to carry meaning. Pair it with shape, dash pattern, or a label.

---

## 6. Page specifications

### 6.1 Overview

**Job.** A 20-second answer to "how is Grade 2 doing, and is it improving?"

**Hero.** The domain trend: three lines (Overall, Literacy, Numeracy) of `*_pct_cleared` from `domain_level_trend.csv`.
- Use `trend_point` rows at the selected granularity, drawn with the instrument ribbon underneath.
- Overall is the heaviest line. Literacy and Numeracy are thinner.
- Periods where `includes_did` is true get the DiD marker shapes.
- The tooltip shows `literacy_competencies` / `numeracy_competencies` and `coverage_note`, because the rollup changes composition between instruments.
- Subtitle: "% achieving, averaged across the competencies each instrument tested. The set of competencies changes when the instrument changes (see ribbon)."

**Latest-round strip.** A single horizontal band, not a row of separate cards:
- The latest period's Overall, Literacy and Numeracy % achieving, with n.
- The change since the previous period **only if both periods come from the same `tool_family`**. Otherwise show "Instrument changed, not comparable". This is the one allowed display computation on this page.

**Where competencies stand now.** A ranked horizontal dot plot of every competency's latest `trend_point`, grouped by domain and sorted by value.
- Each dot is marked with its instrument and its latest within-tool change, where one exists.
- Clicking a competency opens it in the explorer.

**Key findings.** Load 4–6 editorial notes from `content/notes.json` (section 9). Each note has a title, 1–2 sentences, and a link to the view that shows it.

### 6.2 Competency explorer

**Job.** A deep look at one competency, or at one family.

**Main chart:**
- The selected competency's trend points at the chosen granularity, with the full grammar from section 5: instrument ribbon, CI band, segment styles, markers.
- Other members of the same `competency_family` can be added as thinner companion lines, off by default. For example, when Addition (district tools) is selected, Addition 1-digit and 2-digit (DiD) sit in the same panel but are never joined to it.

**Facts panel.** Plain text beside the chart:
- the instruments that measured this competency;
- the clearance rule(s);
- n range;
- stacking status in plain words: "Same task across rounds", "Similar task, instrument differs", or "Measured once";
- the latest value and the latest within-instrument change;
- any active flags.

**Distribution strip.** Below the main chart, a 100% stacked bar per period of the three tiers from `mastery_bands`:
- critical (0–25%), developing (25–75%), achieving (≥75%);
- a toggle switches to the five-band detail;
- for ORF, use the CPM bands.

**Relative standing strip.** A compact row showing the competency's `percentile_within_panel` in each period panel (scope = its domain). This shows whether the competency is consistently near the bottom of what was tested.
- **Do not connect these across panels.** Show them as separate dots on a 0–100 scale, one column per panel.

**ORF specifics.** When ORF is selected:
- Add a secondary chart of `mean_cpm` over time with a reference line at 45 cpm labelled "Benchmark".
- Add the DiD baseline mean (28.6 cpm, read from the comparison file's `baseline_mean`) and the midline mean (35 cpm) as distinct markers.

**Navigation.** Previous and next buttons step through the competency ladder order.

### 6.3 Competency map (heatmap)

**Job.** Everything at once: which competencies are strong or weak, and when.

**Grid:**
- Rows are competencies, grouped by domain with family sub-headers, in ladder order by default.
- Columns are periods at the selected granularity, and each column header carries its instrument name.
- Each cell is the `trend_point` % achieving.
  - Fill uses the sequential scale from section 7.
  - The value is printed inside the cell, with text colour flipping for contrast.
  - Flagged cells carry a small corner glyph: ◌ for thin or unknown n, ≠ for a metric-basis change from the previous column, ✦ for perfect score required.
  - Cells for competencies not assessed in a period are empty, with a faint diagonal hatch and "Not assessed" on hover.

**Sort options:**
- ladder order (default);
- latest value;
- latest within-instrument change (competencies without one go to the bottom).

**Filters:**
- "Show only competencies measured in 3 or more periods".
- "Hide DiD-only competencies".

**Interaction.** Hovering a row highlights it. Clicking a cell opens the explorer at that competency and period.

### 6.4 Changes

**Job.** Separate the changes that can be trusted from the ones that can't.

**Section A: same-instrument changes, the trustworthy ones.**
- A slope chart of every `trend_point` whose `change_defensibility` is `within_tool`. Today that covers the nine competencies of the 2026 battery from Q1 2026 to Q2 2026.
- Lines are coloured by direction:
  - down: muted red `#B3261E`
  - up: CSF blue
  - within ±2 points: grey
- Each line is labelled with the competency name and the change in points.
- Subtitle: "Same test in both rounds. The children differ (Grade 2 is a new group each year), the sample grew from 175 to 1,361, and the gap spans the summer break." Build the n values from the data, not from this text.

**Section B: changes across instruments, indicative only.**
- A diverging bar chart of `qoq_change_pp` (or `mom_change_pp`) for the `cross_tool_matched_construct` and `cross_tool_caveat` changes.
- Bars use dash-patterned fills matching the line grammar.
- Add a short explanation beside the chart, with a link to the calibration panel.
- List the `metric_basis_changed` changes separately in a muted table titled "Not comparable". Never plot them as bars.

**Section C: how big is the instrument effect?**
- A dot plot from `tool_calibration_nov2025.csv`: for each shared competency, the district tool's mean and the DiD baseline's mean in the same month, joined by a line with the gap labelled.
- Caption: "Same month, same-named task, two different instruments. Gaps of up to ~20 points come from the instrument, not the children." Compute the "~20" from the data at render time.

### 6.5 Distributions

**Job.** Show the shape behind the percentage.

- **Small multiples.** One panel per period at the selected granularity. Each panel holds 100% stacked horizontal bars, one per competency, split into the three tiers. A toggle switches to the five bands.
- **Sources.** Excel-based bands come from student scores. Midline bands come from the slides; label those panels "Midline report (rounded)".
- **Competency filter.** Pick one or more competencies to compare across periods.
- **Fluency panel.** Stacked CPM bands for ORF (Excel and midline), plus the midline's timed letter naming and word reading bands.
- **Callout.** Show the share of children scoring zero on the latest round of each competency (`pct_students_b1_0`), sorted descending. Zero scorers are a distinct policy concern and deserve their own small ranked list.

### 6.6 DiD snapshot

**Job.** The baseline-to-midline story, told like for like.

- **Dumbbell chart.** For every row where `comparison_status = both_means`, plot `baseline_mean` against `midline_mean`, labelled with `mean_change`. ORF gets its own small dumbbell in cpm.
- **Domain summary.** Show the two `_domain_matched_set_*` rows as a compact literacy and numeracy summary.
- **Midline-only and bands-only competencies.** Show these as a separate strip of midline tier bars, with a note saying which had no stated mean.
- **Context header.** Nov 2025 baseline and Mar 2026 midline (40 schools, 177 children); arms averaged equally for this dashboard; sample match between rounds not confirmed.
- **Keep these % correct values out of the "% achieving" colour scale.** Use a neutral navy so they aren't read as the same metric.

### 6.7 Methods and caveats

Write this page as plain prose with a few tables, not a wall of bullets. It covers:

- **What "% achieving" means,** including the three rules (75% of items, 45+ cpm for ORF, and 2 of 3 on the Q3 2025 three-item tasks) and the perfect-score consequence on 1–3 item tasks.
- **The instrument timeline,** as a larger version of the ribbon with dates and n per round.
- **How DiD data enters.** The baseline uses mean % correct and the midline uses the top band. Explain why the dashboard never connects them to the district series across a basis change.
- **Why cross-instrument changes are indicative,** linking to the calibration chart.
- **The cohort note.** The series is a repeated snapshot of Grade 2, and April 2026 onward is a new group of children.
- **The composition note.** Months within a tool cover different schools.
- **A crosswalk explorer:** a searchable table rendered from `inputs/competency_crosswalk.csv` with columns display name, instrument, raw item name, stacking status, confidence, and reasoning.
- **Downloads:** the published aggregate CSVs and `data_dictionary.md`.
- **The data build date,** read from `data/manifest.json`.

Pull the definitions from `data_dictionary.md` and rewrite them in plain language. Do not invent new ones.

---

## 7. Visual identity

The identity comes from Central Square Foundation's own materials. Colours and type below are taken from the RMEAL deck built on CSF's template: royal blue on the slide edge, gold title highlights, a light-blue callout fill, and Public Sans as the text face.

### 7.1 Palette tokens

Define all colours as CSS custom properties in one `tokens.css`.

| Token | Hex | Role |
|---|---|---|
| `--csf-blue` | `#003DA5` | Primary brand colour. Literacy series, links, the "achieving" tier. |
| `--csf-navy` | `#00316B` | Navigation rail background, page titles, heatmap high end. |
| `--csf-gold` | `#FFC000` | Highlighter: the latest-period column, focus rings, selected states, perfect-score ticks. Never used for text on white. |
| `--csf-sky` | `#CFE2F3` | Light fills: info panels, the active nav item on white, ribbon tints. |
| `--amber` | `#B26B00` | Numeracy series. A darkened gold that keeps the brand warm while passing 3:1 contrast for graphics on white. |
| `--ink` | `#1B2433` | Body text and the Overall series. Navy-tinted rather than neutral black. |
| `--slate` | `#4A5568` | Secondary text, axes, gridline labels. |
| `--rule` | `#DDE3EC` | Gridlines and hairlines. |
| `--paper` | `#FFFFFF` | Page background. |
| `--mist` | `#F4F7FB` | Plot background tint, table zebra striping. |

**Tier and band colours** (colour-blind distinguishable, and always labelled):

| Band | Hex |
|---|---|
| b1 zero | `#7F1D1D` |
| b2 below 25 | `#D9573B` |
| b3 25–50 | `#FFD666` |
| b4 50–75 | `#8FB3E0` |
| b5 75+ (achieving) | `#003DA5` |

The three tiers use: critical = `#B3261E`, developing = `#FFC000`, achieving = `#003DA5`.

**Heatmap sequential scale** for % achieving, 0 → 100, interpolated in a perceptual space:
`#F4F7FB` → `#CFE2F3` → `#7FA8DC` → `#2E63B8` → `#003DA5` → `#00224D`.
Text flips to white above about 55%.

**Change colours:** down `#B3261E`, up `#003DA5`, flat `#8A94A6`.

Check every text and background pair against WCAG AA. Gold is a fill and highlight colour only.

### 7.2 Typography

- **Public Sans** (Google Fonts) for everything, because it is CSF's deck face. Weights 400, 500, 600 and 700.
- **Numerals:** use `font-variant-numeric: tabular-nums` on all figures, axes, tables and tooltips.
- **Type scale** on a 1.25 ratio from a 16px base: 12.8 / 14 / 16 / 20 / 25 / 31 / 39px.
  - Page titles: 31px, weight 700, navy.
  - Section titles: 20px, weight 600.
  - Chart titles: 16px, weight 600.
  - Chart subtitles: 14px, weight 400, slate.
  - Axis labels: 12.8px.
- **The one typographic statement:** the latest-round figures in the Overview strip, set large (39px, weight 700, tabular) with a small label beneath. Use large type nowhere else.
- **Line length** for prose: under 75 characters.
- **Casing:** sentence case everywhere. No all-caps labels, and no letter-spaced eyebrow text above headings.
- **Devanagari fallback:** add `Noto Sans Devanagari` to the font stack so Hindi labels can be added later.

### 7.3 Layout

- **Left navigation rail** in `--csf-navy`, 232px wide on desktop and collapsing to an icon rail at 1024px and below. It echoes the blue edge bar on CSF slides. It holds:
  - the wordmark: "Grade 2 competency trends" with "Basti, NIPUN Bharat" beneath;
  - the seven page links;
  - the data build date at the bottom.

  The active item gets a gold left marker and a slightly lighter background.
- **Content area:** max width 1280px, a 12-column grid, 32px gutters on desktop and 16px on mobile. Left-align everything.
- **Separate sections with whitespace and a single hairline rule,** not with boxed cards. Cards are allowed only for things that are genuinely discrete objects, such as the key-findings notes. Don't box every chart.
- **Mobile (390px):**
  - the rail becomes a top bar with a menu button;
  - charts stack full width, and the heatmap scrolls horizontally with a sticky first column;
  - the control bar becomes a collapsible "Filters" row;
  - tooltips become bottom sheets.
- **Presentation mode**, for projectors in review meetings: a toggle, remembered in the URL, that hides the rail and control bar, bumps the base type to 18px, and thickens lines by 1px.

### 7.4 Motion

- **One orchestrated moment:** on first load, the Overview hero lines draw in left to right over about 900ms.
- **Everything else** is a direct response to input: tooltip appear, filter transitions under 200ms, and panel expand.
- **Respect `prefers-reduced-motion`** by disabling the draw-in and all transitions.

### 7.5 Things to avoid

- Gradient washes.
- The same rounded-card-with-shadow applied to everything.
- Neon accents.
- Monospace for data labels.
- Arrows appended to link text.
- Meta strings joined with middle dots.
- Decorative icons that carry no meaning.
- Pie or donut charts.
- 3D effects.
- Dual-axis charts.

---

## 8. Copy and terminology

**Speak like a thoughtful colleague explaining data to a district official.** Use plain verbs and short sentences.

**Vocabulary:**
- "% achieving" for the metric, with "children achieving the competency" in full sentences.
- "Instrument" or "assessment tool" for the tools.
- "Round" for a period's assessment.
- "Same test" and "different test" for comparability.

**Never use these words on screen:** "clearance", "trend point", "source detail", "stacking", "pooled", "metric basis", or column names. Translate each into plain words.

**Every chart subtitle states** what the number is and where it comes from, in one sentence.

**Empty states give direction.** For example: "Word writing wasn't assessed in Jan–Mar 2026. The nearest rounds are Oct–Dec 2025 and Apr–Jun 2026."

**Keep all UI strings in one `strings.js` object,** so a Hindi version can be added later. Do not machine-translate now.

---

## 9. Technical stack and repository layout

- **No framework and no build step.** Plain HTML, CSS, and ES modules, so the site deploys to GitHub Pages as-is.
- **Charting:** D3 v7 and Observable Plot, pinned versions, loaded as ES modules from jsDelivr. Use Plot where it fits cleanly and drop to D3 for the instrument ribbon, per-segment dash styling, the heatmap, and custom tooltips.
- **CSV loading:** `d3.csv` with explicit type parsing, per the gotchas in 3.4.
- **Lazy loading:** load `nonstacking_competency_views.csv` only for pages that need it.

```
repo/
  docs/                          <- GitHub Pages source (Settings > Pages > /docs)
    index.html
    assets/
      css/tokens.css
      css/app.css
      js/main.js                 <- router, state, data loading
      js/state.js                <- URL-hash state
      js/data.js                 <- CSV loading, parsing, type coercion, selectors
      js/competencies.js         <- display names, order, families
      js/strings.js              <- all UI copy
      js/grammar.js              <- shared encodings: markers, segments, ribbon, tooltip
      js/pages/overview.js
      js/pages/explorer.js
      js/pages/heatmap.js
      js/pages/changes.js
      js/pages/distributions.js
      js/pages/did.js
      js/pages/methods.js
    data/                        <- synced aggregate CSVs + manifest.json ONLY
    content/notes.json           <- editable key-findings notes
  pipeline/                      <- Adi's pipeline (build_trends.py, inputs/, data_dictionary.md)
  scripts/sync_site_data.py
  .gitignore
  README.md
```

**`scripts/sync_site_data.py`:**
- Copies the six publishable aggregate CSVs, `inputs/competency_crosswalk.csv` and `data_dictionary.md` into `docs/data/`.
- Validates that each file has the columns this brief relies on, and fails with a clear message if one is missing.
- **Refuses to run** if any file in `docs/` contains a `student_name` or `school_name` column. The trend files carry only `n_schools`, which is fine.
- Writes `manifest.json` with the build timestamp, row counts per file, and the list of periods found.

**`.gitignore`** must exclude `*.xlsx`, `student_scores_long.csv`, `pipeline/audit/`, and `pipeline/data/student_scores_long.csv`.

**Paths.** Every fetch path must be relative, because the site is served from `https://<user>.github.io/<repo>/`, not the domain root.

**`content/notes.json`** has the schema `[{ "id", "title", "body", "link_hash", "as_of" }]`. Seed it with these notes, and **re-check every number against the CSVs at build time** before committing:

1. **Same test, lower scores.** From Apr–Jun to Jul–Aug 2026, the same battery showed lower % achieving on every competency. Patterns fell from 54% to 37%, sentence reading from 43% to 31%, and word reading from 77% to 65%. The gap spans the summer break, and the sample grew from 175 to 1,361. → `#/changes`
2. **Sentence reading is the weakest literacy task on the district tools,** at 31% achieving in Jul–Sep 2026. → `#/competency/sentence_reading`
3. **Writing moved most between the DiD rounds.** Word writing rose from 38% to 58% correct, baseline to midline. Oral reading fluency rose from 28.6 to 35 cpm, still below the 45 cpm benchmark. → `#/did`
4. **The weakest areas at midline:** number patterns 10% achieving, shapes 4%, 2-digit subtraction 25%, independent writing 28%. → `#/distributions`
5. **The biggest steps coincide with instrument changes** (Sep→Oct 2025 and Mar→Apr 2026). Read cross-instrument moves as indicative. → `#/changes`

**README.md** explains:
- how to run the pipeline;
- how to sync the site data;
- how to preview locally (`python -m http.server` from `docs/`);
- how to enable GitHub Pages;
- how to edit `notes.json`;
- the privacy rule.

---

## 10. Accessibility, responsiveness, performance

**Accessibility:**
- WCAG 2.1 AA.
- Every interactive element reachable by keyboard, with a visible gold focus ring (2px, offset 2px).
- Every chart has an `aria-label` summarising it and a "View as table" toggle that renders the exact plotted data as an accessible HTML table.
- Tooltips can be opened with the keyboard, and Escape closes them.
- Colour is never the only carrier of meaning.

**Responsiveness:**
- Test at 1440, 1024, 768 and 390px.
- Charts resize with a `ResizeObserver`.
- Nothing overflows horizontally except the heatmap, which scrolls deliberately.

**Performance:**
- The first paint of the Overview needs only `domain_level_trend.csv` and `quarterly_trends.csv`.
- Total transferred weight on first load stays under 1 MB, excluding fonts.
- No console errors or warnings in normal use.

**Export:** each chart gets a small menu with "Download PNG", "Download SVG", and "Download data (CSV)". The CSV contains exactly the rows plotted, with display names. Adi will paste these charts into QLR reports and review decks. The PNG export includes the chart title, subtitle, instrument ribbon, and a one-line source note.

---

## 11. Build phases

1. **Scaffold and data layer.**
   - Repo layout, the sync script, `data.js` with parsing and selectors, `competencies.js`, `strings.js`, and `tokens.css`.
   - Acceptance: a debug page lists every competency, every period in correct order, and row counts that match the manifest.
2. **Shared grammar.**
   - `grammar.js`: markers, segment styling, the instrument ribbon, tooltips, the CI band, and the latest-period highlight.
   - Build it once as a demo chart for `word_writing`, which exercises every segment type and marker, and get Adi's sign-off on the look.
3. **Overview and Competency explorer.**
4. **Competency map and Changes.**
5. **Distributions and DiD snapshot.**
6. **Methods, exports, presentation mode, and mobile polish.**
7. **QA** (section 12) and deployment.

After each phase, take screenshots at three widths, critique them against section 7, and fix issues before moving on.

---

## 12. QA checklist

**Data fidelity.** These are the values from the current build. If the pipeline has been re-run, confirm that the dashboard equals the CSV, not these numbers.

- Quarterly domain Overall % achieving: Q2 2025 **71.2**, Q3 2025 **59.3**, Q4 2025 **46.1**, Q1 2026 **65.6**, Q2 2026 **57.1**.
- Q2 2026 Literacy **57.3** and Numeracy **56.8**.
- `sentence_reading` Q2 2026 = **31.4** (n = 1,361, same-instrument change from Q1 2026).
- `pattern` Q2 2026 = **37.3**.
- `word_writing` Q1 2026 = **60.0** (n = 175).
- `oral_reading_fluency` Q4 2025 = **38.0** (n = 177, midline).
- `number_pattern` Q4 2025 = **10.0**, with **no connector** from Q3 2025 (a `metric_basis_changed` step).
- The quarterly file has 23 `metric_basis_changed` steps, and none of them is drawn as a line.
- Quarters render in the order Jul–Sep 2025 → Oct–Dec 2025 → Jan–Mar 2026 → Apr–Jun 2026 → Jul–Sep 2026.

**Rules:**
- No percentage axis is truncated.
- No line joins `source_detail` rows.
- No mean-score series appears outside tooltips and the DiD page.
- Every DiD baseline point is a diamond and says "% correct" in its tooltip.
- Every thin-n and ceiling point is hollow.
- Missing n displays as "n not reported".

**Privacy:**
- `grep -ri "student_name\|school_name" docs/` returns nothing, except the column-validation logic in the sync script if it lives there.
- No `.xlsx` files anywhere in the repo.
- The published site contains no child or school names.

**Resilience:**
- Temporarily add a fake `Q3_2026` trend row to a local copy of the quarterly CSV. The axis, ribbon, heatmap, and latest-round strip should all extend without code changes.
- Temporarily add an unknown competency ID. It should render with a humanised name and log a warning.

**Accessibility:**
- A Lighthouse accessibility score of 95 or more on every page.
- Full keyboard walkthrough of every page.
- "View as table" works on every chart.

**Deployment:**
- Test on the actual GitHub Pages URL: relative paths resolve, deep links like `#/competency/word_reading` load correctly on refresh, and fonts load.

---

## 13. Open items that may change the data

Build so that none of these requires code changes:

- **Midline source for 11 competencies.** Adi may switch the midline points for the 11 competencies with stated means from "top band" to "stated % correct". That changes `metric_basis` values and which steps are `metric_basis_changed`. The grammar must follow the column, not assumptions.
- **Baseline sample size.** If the DiD baseline n becomes known, Nov 2025 pooling becomes n-weighted and `n` will stop being missing on those rows.
- **Crosswalk revisions.** Provisional crosswalk decisions may change, which can merge or split `std_competency` series and change `stacking_status`.
- **New rounds.** New assessment rounds will append periods.

When you finish, give Adi:
- a short summary of what was built;
- the GitHub Pages URL;
- the screenshots;
- any data questions that came up during the build.
