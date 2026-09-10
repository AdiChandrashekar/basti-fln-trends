# Basti Grade 2 FLN competency trends: data dictionary

Scope: Grade 2 competency performance in Basti district, Aug 2025 to Aug 2026, from five district assessment tools plus the DiD baseline (Nov 2025) and the 25-26 End of Year assessment (Mar 2026). The round recorded as `did_midline` is called **25-26 End of Year** everywhere it is shown to a reader. Built by `build_trends.py`. Every definition below is implemented there. Do not re-derive any of it in the dashboard layer.

## 1. Primary metric: % of students who cleared a competency

- **A student clears a competency when they score at least 75% of its items.** For ORF the bar is at least 45 cpm.
- **The tracked figure is `pct_students_cleared`:** the share of assessed students who cleared, from 0 to 100. The dashboard should plot this value everywhere.
- **The 75% rule is applied to raw item scores in every tool, with one exception.** On the Q3 2025 three-item competencies (Addition, Subtraction, Counting in Bundles, Pattern), 2 of 3 counts as cleared, because that was the rule the tool used at the time (confirmed by Adi). This is set in `CLEAR_OVERRIDE_PCT` in the script config, and those rows carry `clearance_rule = ">=2 of 3 items (tool rule at the time)"`.
- **For the 2026 tools, the rule reproduces the sheets' own Literacy % and Numeracy % exactly.** This was checked for all four months.
- **Mean % score is secondary.** It is carried as `mean_pct_score` for reference only. It is not the tracked metric.

**Consequence for short items.** Outside the Q3 2025 override, a competency with only 1, 2 or 3 items can only be cleared with full marks. These rows carry `perfect_score_required = True`:
- July tool: all items.
- Aug tool: Writing /2 and Counting in Bundles /2.
- 2026 tools: Pattern (3 items) and Sentence Reading (2 items).

In each of these cases, full marks is also the rule the tool itself used. The 2026 Pattern item keeps 3 of 3 because the 2026 tool's own reported Literacy % and Numeracy % use 0.75. Switching it to 2 of 3 would raise Pattern from 54% to 75% in Q1 2026 and from 37% to 66% in Q2 2026; add its keys to `CLEAR_OVERRIDE_PCT` to do so.

**Difference from the 2025 tool flags.** The original Yes/No flags are kept as `pct_cleared_tool_flag`. With the Q3 override, the pipeline matches them everywhere except one item: the Aug tool's Letter ID. The tool gave "Yes" from 4-5 of 8, while the 75% rule needs 6 of 8, which lowers the figure by 12 points (94% → 81%).

## 2. Design

- **Repeated cross-section of Grade 2.** Each point describes whoever was in Grade 2 and assessed at that time. From April 2026 onward this is a new cohort. That is intentional.
- **Fluency.** Only ORF has a clearance bar (45 cpm). Letter naming and word reading timed have no benchmark, so they carry no `pct_students_cleared`. Their `mean_cpm` and bands are kept.

## 3. Files

| File | Grain | Purpose |
|---|---|---|
| `inputs/competency_crosswalk.csv` | raw item per tool | Maps every raw item to `std_competency`. This file drives the pipeline: edit it and re-run. |
| `inputs/baseline_nov2025_extraction.csv`, `inputs/march2026_extraction.csv` | competency | Values transcribed from the deck (tables, prose and chart labels). |
| `data/student_scores_long.csv` | student x item | Cleaned scores with `cleared`, `achieved_tool_flag`, `band` and `tier`. |
| `data/monthly_trends.csv` | competency x month x source | Monthly series with change vs the previous month. |
| `data/quarterly_trends.csv` | competency x quarter x source | Quarterly series with QoQ change. |
| `data/domain_level_trend.csv` | period x source | Literacy, numeracy and overall clearance rates. |
| `data/nonstacking_competency_views.csv` | long | Small-multiples index, z-scores, percentiles, bands and tiers. |
| `data/did_baseline_midline_comparison.csv` | competency | Standalone baseline vs End of Year comparison. |
| `data/tool_calibration_nov2025.csv` | competency | Same-month comparison of the district tool and the DiD baseline, on mean scores. |
| `audit/*.csv` | row | Date corrections, duplicate log and raw column inventory. |

## 4. Source tools (`source_tool`)

| Code | Real dates | Students | Clearance source |
|---|---|---|---|
| `july_tool` | 4-8 Aug 2025 | 29 | Raw scores. The tool was built in July and used in early August. |
| `aug_tool` | 11-13 Aug and 10-26 Sep 2025 | 22 + 59 | Raw scores. The switch from the July tool happened mid-August. August rows come from the Diag AUG block. |
| `q3_2025_tool` | 10 Oct - 18 Dec 2025 | 123 | Raw scores. |
| `q1_2026_tool` | Apr-May 2026 | 175 | Grade 2 battery only. Grade 1 and Grade 3 students are excluded. |
| `q2_2026_tool` | Jul-Aug 2026 | 1,361 | Same 9-item battery as Q1 2026. |
| `did_baseline` | Nov 2025 | unknown | **DiD % correct used directly** (per Adi), with arms averaged equally. This is a mean score, not a 75% clearance rate, and rows carry `metric_basis = did_pct_correct`. The three CPM items (Letter Naming, Word Reading Timed, ORF) have no % value. |
| `did_midline` | Mar 2026 | 177 (40 schools) | **25-26 End of Year assessment.** Slide chart top band: the "76-100%" or "More than 75%" band. For ORF it is the 45-59 plus 60+ bands. |

**End of Year caveat.** The slide's top band is strictly above 75%. A student at exactly 75% (for example 3 of 4 items) is counted as cleared in the Excel data but not in the End of Year round. That round therefore understates clearance somewhat relative to the Excel tools. It is flagged `slide_band_gt75_not_ge75`.

`tool_family` groups the two 2026 tools together as `2026_tool` and both DiD rounds together as `did`.

## 5. Periods

`month` is YYYY-MM. `quarter_code` follows the district cycle:

| Code | Months | Partial | Months with data |
|---|---|---|---|
| Q2_2025 | Jul-Sep 2025 | yes (first) | Aug, Sep |
| Q3_2025 | Oct-Dec 2025 | no | Oct, Nov, Dec (Nov DiD baseline has no clearance value) |
| Q4_2025 | Jan-Mar 2026 | no | Mar (End of Year) |
| Q1_2026 | Apr-Jun 2026 | no | Apr, May |
| Q2_2026 | Jul-Sep 2026 | yes (last) | Jul, Aug |

There is no data for Jul 2025, Jan-Feb 2026 or Jun 2026.

## 6. Scoring rules

- **`score_pct`** = raw score / max × 100 for the 2025 tools, and fraction × 100 for the 2026 tools.
- **`cleared`** = 1 if `score_pct` ≥ 75, otherwise 0. For ORF it is 1 if CPM ≥ 45.
- **`n_items`** is the item count used for the perfect-score flag. For the 2025 tools it comes from the header max. For 2026 it was inferred from score steps: Letter ID 20, Word Reading 16, Sentence Reading 2, Word Writing 4, Number ID 12, Place Value 4, Pattern 3, Addition 4, Subtraction 4.
- **July tool Addition and Subtraction.** There is one combined raw score out of 2, which becomes `add_sub_1digit_combined` (clearance = 2/2). The separate Addition and Subtraction Achieved flags are kept only in `pct_cleared_tool_flag`.
- **Bands** are aligned to the rule:
  - `b1_0`: score 0
  - `b2_lt25`: above 0 and below 25
  - `b3_25_50`: 25 to below 50
  - `b4_50_75`: 50 to below 75
  - `b5_75plus`: 75 and above
- **Tiers:**
  - critical = b1 + b2
  - developing = b3 + b4
  - cleared = b5, which equals `pct_students_cleared`
- **End of Year bands** come from the slides, whose top band is above 75%.

## 7. Aggregation and pooling

- **`metric_basis`** records which kind of number sits in `pct_students_cleared`:
  - `pct_students_cleared`: Excel tools (share of students at 75% or more, or at 2 of 3 for the Q3 override items).
  - `did_pct_correct`: DiD baseline mean % correct.
  - `slide_top_band_gt75`: DiD End of Year top band.
  - Pooled rows list every basis involved.
- **`source_detail` rows:** one row per competency × period × source.
  - They include: `n`, `pct_students_cleared`, `se` (binomial), the Wilson 95% interval (`ci95_low`, `ci95_high`), `pct_cleared_tool_flag`, `mean_pct_score`, `median_pct_score`, `sd_pct_score`, `mean_cpm`, `median_cpm`, `n_distinct_scores`, and `n_schools` (2025 only).
- **`trend_point` rows:** one per competency × period. Use these for lines.
  - Where several **district** sources have a value in the same period, they are pooled n-weighted (Aug 2025: July tool + Aug tool).
  - `pooling_method` records the rule used.
- **`reference_point` rows:** a DiD round that measured the same competency in the same period as a district tool. **Not pooled into the trend point and never part of the line** (`POOL_DID_WITH_DISTRICT = False`, confirmed by Adi).
  - Today this is only Nov 2025 / Q3_2025, where the Q3 2025 tool and the DiD baseline both measured 5 competencies: reading comprehension, word reading, word writing, number recognition and place value.
  - The district value carries the line; the baseline value sits beside it as a second reading. It carries **no change columns**, because the step between it and the line is not a change: the two sit on different bases.
  - Where a DiD round is the **only** source in a period, it is still the `trend_point` (Q4_2025 End of Year, and the 19 competencies only the baseline measured).
  - The domain rollup follows the same rule: `domain_level_trend.csv` carries a `reference_point` row for the Nov 2025 / Q3_2025 baseline.
  - Set `POOL_DID_WITH_DISTRICT = True` in the config to restore the old equal-weight pooling.
- **DiD points** sit at 2025-11 / Q3_2025 (baseline) and 2026-03 / Q4_2025 (End of Year), marked with `is_did_point`.

## 8. Flags

- **`stability_flag`:** `thin` (n < 30), `moderate` (30-99), `robust` (≥100), or `n_unknown`.
- **`reliability_flags`** is semicolon-separated. Possible values:
  - `thin_n`, `n_unknown_n`
  - `ceiling` (95% or more cleared)
  - `perfect_score_required`
  - `slide_band_gt75_not_ge75`
  - `baseline_pct_correct_not_clearance`
  - `cleared_at_2_of_3`
  - `crosswalk_caveat`, `single_source`, `pooled_sources`
  - `no_clearance_value`
- **Suggested display:** draw `thin_n` and `ceiling` points hollow, annotate `perfect_score_required` points, and use a dashed line for any change where `change_defensibility` starts with `cross_tool`.

## 9. Change metrics

- **`mom_change_pp` / `qoq_change_pp`:** the change in `pct_students_cleared` against the previous available trend point for the same competency. Gaps are recorded in `months_gap` / `quarters_gap`.
- **`change_defensibility`** takes one of four values:
  - `within_tool`: same tool family; the cleanest change.
  - `cross_tool_matched_construct`
  - `cross_tool_caveat`
  - `metric_basis_changed`: one end of the change is the DiD baseline's % correct and the other is a clearance rate. This covers every baseline → End of Year step. **Do not present these as real change.** Break the line or show the two points without a connector.
    - Since the baseline stopped being pooled into Nov 2025 / Q3_2025, the quarterly file has **16** of these steps (previously 23). The 7 that went away were the steps into and out of the old pooled points, which are now ordinary cross-instrument changes between district tools.
- **`tool_calibration_nov2025.csv`** compares the Q3 2025 tool with the DiD baseline in the same month. It has to use mean scores, because the baseline has no clearance data.
  - ORF agrees within 0.5 cpm.
  - Word reading, word writing and place value differ by 18-22 points.
  - Treat cross-tool jumps of that size as possible instrument effects.

## 10. Domain level (`domain_level_trend.csv`)

- **`literacy_pct_cleared` / `numeracy_pct_cleared`:** each student's share of the tool's domain competencies cleared, averaged across students.
  - With a complete battery this equals the mean of the competency clearance rates.
  - It reproduces the 2026 sheets' Literacy % and Numeracy % exactly.
  - ORF (≥45 cpm) counts as a literacy competency wherever a tool tested it, matching how the 2025 tools built their own literacy counts.
- **`overall_pct_cleared`** is the mean of the literacy and numeracy values.
- **DiD End of Year domain** is the mean of competency clearance rates across the 11 literacy and 13 numeracy items with band data.
- **DiD baseline domain** is the mean of the baseline's 24 % correct items. It is **not** pooled with the Q3 2025 tool: in Nov 2025 and Q3_2025 it is a `reference_point`, and the district tool alone carries the domain trend point. Q3_2025 overall is therefore **57.07** (district only), not the 59.33 the old equal-weight pooling produced.
- **The competency set changes by tool.** It is recorded in `*_competencies` and `*_n_competencies`.

## 11. Non-stacking views

- **`view = small_multiples_index`:** one panel per period × source × scope, where scope is literacy, numeracy or all.
  - Metrics: `pct_students_cleared`, `z_within_panel`, `percentile_within_panel`, `rank_within_panel`.
  - Compare standing within a panel. Never draw lines between panels.
- **`view = mastery_bands`:** band and tier percentages.
  - Sources: student scores (Excel) or slide charts (End of Year).
  - CPM bands are included for ORF and the End of Year timed measures.

## 12. DiD handling

- Arms are collapsed with equal weights and the arm split is not used, per Adi. Raw arm values are kept only in `inputs/baseline_nov2025_extraction.csv`.
- **`did_baseline_midline_comparison.csv`** holds, per competency:
  - `baseline_mean`, `midline_mean`, `mean_change`: the like-for-like comparison, % correct against % correct, available for 11 competencies.
  - `baseline_value_in_series`, `midline_value_in_series`: what each round contributes to the trend series (% correct and top band, respectively).
  - `midline_pct_zero_band`, `comparison_status`
- **Use `mean_change` for any baseline-vs-End of Year claim.** The series values sit on different bases.

## 13. Corrections applied

| Issue | Fix | Log |
|---|---|---|
| `G2 Q2 2025` Date, Start Time and End Time stamped 2026 (81 rows) | Year set to 2025 | `audit/date_corrections_log.csv` |
| `G2 Q3 2025` Date stamped 2026 (123 rows) | Year set to 2025 | same |
| `G2 Q3 2025` Month column blank for 45 rows | Derived from the date | pipeline |
| 22 Diag AUG students are identical to the `G2 Q2 2025` August rows | Integrated once using the Diag AUG row; the Q2 2025 school name and block go into `school_name_alt` and `block` | `audit/duplicate_log_diag_aug_vs_q2_2025.csv` |
| ORF = −5 | Set to null | `qa_note` |
| Two July-tool ORF flags contradict their CPM values | Clearance recomputed from CPM (≥45) | pipeline |
| July-tool numeracy count does not reconcile with its flags | Not used | pipeline |
| Block name encoding artefact | Cleaned | pipeline |

**Accepted as genuine:** the Q1 2026 Letter ID floor at 55% and Word Reading floor at 37.5% (confirmed by Adi).

## 14. Judgment calls

**Confirmed by Adi**
- The primary metric is the share of students scoring 75% or more.
- The DiD baseline is **not** averaged into the district trend line. Where both measured the same competency in the same period, the district value carries the line and the baseline is a `reference_point` beside it.
- Q3 2025 three-item competencies are cleared at 2 of 3, the tool's rule at the time.
- DiD baseline % correct is used directly as its value.
- Grade 1 and Grade 3 students are excluded from Q1 2026.
- DiD data is used in the analysis without the treatment/control split.
- The Diag AUG block is integrated.
- The July tool is dated to August.
- The Letter ID floor is genuine.
- The series is a repeated cross-section of Grade 2.

**Provisional (`inputs/competency_crosswalk.csv`)**
- 2026 Pattern keeps the 2026 tool's own rule (3 of 3).
- Aug tool Letter ID uses the 75% rule (6 of 8), not the tool's 4-5 of 8.
- Aug tool "Writing (/2)" = word writing.
- Place Value = Counting in Bundles.
- Letter/Matra = Letter ID.
- District Addition and Subtraction kept separate from DiD 2-digit (same-month gap +28 / +22).
- District Pattern kept separate from DiD Number Pattern.
- March Shapes not paired with baseline Shapes 1 or 2.

## 15. Caveats that must travel with the dashboard

1. Consecutive months in 2025 share zero schools, and the 2026 sheets have no school field. Month-to-month moves within a tool largely reflect which schools were visited.
2. Every tool change coincides with a step change. The Nov 2025 calibration shows instrument gaps of up to 22 points on items with the same name.
3. On the 2026 Pattern and Sentence Reading items, clearance requires full marks. This depresses them relative to longer items.
4. The DiD baseline enters as % correct, the End of Year as its above-75% top band, and the Excel tools as clearance rates. Steps between the baseline and anything else are tagged `metric_basis_changed` and must not be drawn as real change.
5. The domain rollup changes composition across tools.
6. April 2026 onward is a new Grade 2 cohort, by design.

## 16. Re-running

```
python build_trends.py Basti_All_Spots.xlsx inputs data
```

Edit `inputs/competency_crosswalk.csv` or the CONFIG block (`CLEAR_CUT_PCT`, `ORF_BENCHMARK_CPM`, thresholds), then re-run.
