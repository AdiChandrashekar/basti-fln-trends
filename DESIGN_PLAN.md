# Design plan — Basti Grade 2 competency trends dashboard

Prepared for Adi's sign-off before any code is written, per section 1.2 of the build brief.
Everything below has been checked against `data_dictionary.md` and the CSVs actually supplied.

**Status: awaiting confirmation.** Section 0 lists blockers. Section 8 lists data questions.

---

## 0. What I found when I read the data (read this first)

### 0.1 QA fidelity check — all pass

I re-derived every number in section 12 of the brief straight from the supplied CSVs. All ten match:

| Check | Brief | CSV | |
|---|---|---|---|
| Quarterly Overall % achieving | 71.2 / 59.3 / 46.1 / 65.6 / 57.1 | 71.24 / **57.07** / 46.14 / 65.56 / 57.05 | ✓ [1] |
| Q2 2026 Literacy / Numeracy | 57.3 / 56.8 | 57.31 / 56.80 | ✓ |
| `sentence_reading` Q2 2026 | 31.4, n=1,361, within-tool | 31.45, n=1,361, `within_tool` | ✓ |
| `pattern` Q2 2026 | 37.3 | 37.33 | ✓ |
| `word_writing` Q1 2026 | 60.0, n=175 | 60.00, n=175 | ✓ |
| `oral_reading_fluency` Q4 2025 | 38.0, n=177 | 38.00, n=177, midline | ✓ |
| `number_pattern` Q4 2025 | 10.0, no connector | 10.00, `metric_basis_changed` | ✓ |
| `metric_basis_changed` steps, quarterly | 23 | **16** | ✓ [1] |
| Quarter order | Q2 25 → Q3 25 → Q4 25 → Q1 26 → Q2 26 | matches `quarter_start_month` | ✓ |

**[1] Two of these numbers changed after the DiD de-pooling (10 Sep 2026).** On Adi's
instruction the DiD baseline is no longer averaged into the Nov 2025 / Q3 2025 trend point:
the district tool carries the line and the baseline sits beside it as a `reference_point`.
Q3 2025 Overall is therefore 57.07 (district only) rather than 59.33, and the quarterly file
has 16 `metric_basis_changed` steps rather than 23. Every other number in this table is
unchanged. See section 0.5.

I also checked all five seed notes in section 9 against the data. All five are accurate:
pattern 53.7→37.3, sentence reading 42.9→31.4, word reading 76.6→65.2 (all nine 2026-battery
competencies fell); word writing 37.7→58.0 baseline→midline; ORF 28.6→35.0 cpm; midline weak set
number patterns 10, shapes 4, 2-digit subtraction 25, independent writing 28. I will still re-check
them at build time and round from the CSV rather than hardcoding.

### 0.2 Three files the brief relies on were not supplied — this blocks two features

| File | Needed for | Status |
|---|---|---|
| `data/tool_calibration_nov2025.csv` | **Changes, section C** (the instrument-effect dot plot) and the Methods link to it | **missing** |
| `inputs/competency_crosswalk.csv` | **Methods crosswalk explorer** (display name / instrument / raw item / stacking / confidence / reasoning) | **missing** |
| `inputs/baseline_nov2025_extraction.csv`, `inputs/march2026_extraction.csv` | pipeline re-runs only; not read by the dashboard | missing, low impact |

I can reconstruct the calibration table exactly — the six shared Nov 2025 competencies are sitting in
`monthly_trends.csv` as `source_detail` rows (`number_recognition`, `place_value_bundles`,
`reading_comprehension`, `word_reading`, `word_writing`, `oral_reading_fluency`; largest gap 21.7
points on place value, which is the "~20" the brief's caption refers to). **But recomputing it in the
browser breaks hard rule 2.1.** So my plan is:

- Build both features against the real file paths.
- If a file is absent, render a specific empty state that says which file is missing and how to
  produce it — not a blank panel, and never a silently derived substitute.
- **Ask you to drop the two files in.** They come out of the same pipeline run.

Nothing else in the brief is blocked.

### 0.5 Change requested after the plan: DiD baseline de-pooled

Adi asked that the Nov 2025 / Q3 2025 point stop averaging the district tool with the DiD
baseline. Implemented in the pipeline as `POOL_DID_WITH_DISTRICT = False`, which emits a new
`row_type = "reference_point"`. What moved:

| | Was (pooled) | Now (district only) | DiD baseline, now a separate point |
|---|---|---|---|
| Reading comprehension | 47.07 | 46.34 | 47.80 |
| Word reading | 65.67 | **71.54** | 59.80 |
| Word writing | 39.99 | 42.28 | 37.70 |
| Number recognition | 62.54 | **55.28** | 69.80 |
| Place value | 50.38 | **40.65** | 60.10 |
| Domain Overall, Q3 2025 | 59.33 | **57.07** | 61.60 |
| Domain Literacy, Q3 2025 | 58.36 | **51.22** | 65.50 |
| Domain Numeracy, Q3 2025 | 60.31 | **62.93** | 57.69 |

Two things improved as a side effect: those Q3 2025 points now carry `n = 123` and a Wilson
interval, where the pooled point had neither (`n` was missing because the baseline's sample
size is unknown). And 7 steps that were flagged not-comparable are now ordinary
cross-instrument changes, so five competency lines run continuously instead of breaking twice.

### 0.3 A conflict between the brief and the dictionary — dictionary wins, flagging as instructed

Section 3.5 of the brief orders `addition_1digit` (20) before `addition` (21) and `addition_2digit`
(22), and puts `add_sub_1digit_combined` at 26, separated from the addition/subtraction group. In the
data all four sit in `competency_family = addition`. This is a presentation choice rather than a
definition, so **the brief's ladder order wins and I will use it verbatim**; the family grouping only
drives the "companion lines" affordance in the explorer and the sub-headers in the heatmap. Raising it
because the heatmap will show `add_sub_1digit_combined` under the addition family sub-header but at
ladder position 26, i.e. below subtraction. Say the word if you'd rather families stay contiguous.

### 0.4 Data shape, confirmed

- 39 competencies, all present in the brief's ladder table. No unknown IDs today — the humanise-and-warn
  fallback still gets built and tested.
- Quarterly: 82 `trend_point` + 99 `source_detail` rows. Monthly: 273 rows over 10 months.
- Periods with data: Aug, Sep, Oct, Nov, Dec 2025; Mar, Apr, May, Jul, Aug 2026. Empty slots that must
  still occupy axis space: **Jul 2025, Jan 2026, Feb 2026, Jun 2026**.
- Wilson intervals exist on 73 of 181 quarterly rows (single-source district-tool rows only), exactly as
  documented. Pooled and DiD rows have none.
- `n_schools` on 49 rows (2025 tools only). 2026 sheets have no school field.
- 7 rows have `has_clearance_value = False` and are skipped: the three DiD CPM-only measures, and the
  July tool's flag-only addition/subtraction.
- Change mix, quarterly trend points: 9 `within_tool`, 11 `cross_tool_caveat`,
  2 `cross_tool_matched_construct`, 23 `metric_basis_changed`, 37 first points.
- Mastery bands cover 8–10 competencies per district panel and 26 at the midline. CPM bands exist for
  ORF in every district panel, plus letter naming and word reading timed at the midline only.

---

## 1. Palette tokens

`assets/css/tokens.css` is the only place a colour is written. Everything downstream reads a custom
property; no chart file contains a hex value.

### 1.1 Brand and surface (from the brief, unchanged)

```css
--csf-blue:  #003DA5;   /* literacy series, links, "achieving" tier */
--csf-navy:  #00316B;   /* nav rail, page titles, heatmap high end */
--csf-gold:  #FFC000;   /* latest column, focus ring, selected, perfect-score tick */
--csf-sky:   #CFE2F3;   /* info panels, active nav on white, ribbon tints */
--amber:     #B26B00;   /* numeracy series */
--ink:       #1B2433;   /* body text, Overall series */
--slate:     #4A5568;   /* secondary text, axes */
--rule:      #DDE3EC;   /* gridlines, hairlines */
--paper:     #FFFFFF;
--mist:      #F4F7FB;   /* plot tint, table zebra */
```

### 1.2 Bands, tiers, change (from the brief, unchanged)

```css
--band-1-zero: #7F1D1D;  --band-2-lt25: #D9573B;  --band-3-25-50: #FFD666;
--band-4-50-75: #8FB3E0; --band-5-75plus: #003DA5;

--tier-critical: #B3261E; --tier-developing: #FFC000; --tier-achieving: #003DA5;

--change-down: #B3261E;  --change-up: #003DA5;  --change-flat: #8A94A6;

--heat-0: #F4F7FB; --heat-1: #CFE2F3; --heat-2: #7FA8DC;
--heat-3: #2E63B8; --heat-4: #003DA5; --heat-5: #00224D;
```

Heatmap fill interpolates those six stops through **Lab** via `d3.interpolateLab`, sampled once into a
`d3.scaleSequential` on domain [0, 100]. Cell text flips to `--paper` above 55.

### 1.3 Tokens I am adding, and why

The brief's palette doesn't cover six things the grammar needs. Each of these is derived from an
existing brand colour rather than introducing a new hue:

```css
/* Instrument ribbon. Two alternating tints so adjacent district segments separate
   without adding colour meaning; DiD notches step to navy so they read as a different kind
   of thing entirely, matching the diamond/square marker logic. */
--ribbon-tool-a:   #E4EEF8;   /* --csf-sky lightened 45% */
--ribbon-tool-b:   #CFE2F3;   /* --csf-sky */
--ribbon-did:      #00316B;   /* --csf-navy, white glyph and label on it */
--ribbon-boundary: #A9B7CB;   /* instrument-change rule at full strength in the ribbon */
--ribbon-boundary-faint: rgba(169,183,203,0.35);  /* the same rule continued up the plot */

/* Latest-period highlight: gold at the one opacity that keeps AA text over it. */
--latest-wash: rgba(255,192,0,0.14);

/* "Not assessed" hatch in the heatmap. */
--hatch: #E7ECF3;

/* Focus ring, as one token so the 2px/2px offset is never re-typed. */
--focus: #FFC000;

/* DiD % correct on the DiD page: deliberately outside the achieving scale (brief 6.6). */
--did-neutral: #35507A;
```

### 1.4 Contrast audit (WCAG AA)

Checked as pairs, not as swatches. `--ink` on `--paper` 14.1:1; `--slate` on `--paper` 7.5:1;
`--slate` on `--mist` 7.1:1; `--csf-blue` on `--paper` 11.6:1; `--paper` on `--csf-navy` 12.8:1;
`--amber` on `--paper` 5.1:1 (text-safe, and it is the numeracy line's label colour);
`--tier-critical` on `--paper` 6.2:1. Gold is fill-only and never carries text — the "Latest" label
sits in `--slate` **beside** the wash, not on it. Heatmap: white text is used from 55 up, where the
darkest interpolated fill is already past 4.5:1; below 55, `--ink` sits on a fill no darker than
`--heat-2` and clears 4.5:1. I will re-verify each pair numerically in the phase-6 QA pass rather than
trusting these estimates.

---

## 2. Type scale

Public Sans 400/500/600/700 from Google Fonts, `font-display: swap`, stack:
`"Public Sans", "Noto Sans Devanagari", system-ui, -apple-system, "Segoe UI", sans-serif`.
`font-variant-numeric: tabular-nums` set on `:root` and inherited, so every figure, axis tick, table
cell and tooltip number aligns by default.

| Step | px | rem | Used for |
|---|---|---|---|
| `--t-xs` | 12.8 | 0.8 | axis labels, ribbon labels, flag chips, table meta |
| `--t-sm` | 14 | 0.875 | chart subtitles, secondary text, facts panel |
| `--t-base` | 16 | 1 | body prose, chart titles (at 600), table body |
| `--t-md` | 20 | 1.25 | section titles (600) |
| `--t-lg` | 25 | 1.5625 | the one hero number's unit line; card titles on Key findings |
| `--t-xl` | 31 | 1.9375 | page titles (700, `--csf-navy`) |
| `--t-2xl` | 39 | 2.4375 | **the single typographic statement**: the three latest-round figures on the Overview strip (700, tabular). Used nowhere else on the site. |

Presentation mode bumps the root from 16px to 18px, so the whole scale moves with it and nothing is
re-specified. Prose blocks are capped at `65ch` (comfortably under the 75-character rule).
Sentence case everywhere; no all-caps, no letter-spaced eyebrows.

---

## 3. Chart grammar

One implementation, in `grammar.js` + `ribbon.js`, reused by every page. A user learns it once.

### 3.1 The instrument ribbon — the signature device

```
   100 ┤                                                         ← y always 0–100
       │        ┊              ┊         ┊                       ← boundary rule, continued faintly
    50 ┤   ●────┊──●   ◆       ┊  ■      ┊  ●───────●            ← plot area
       │        ┊              ┊         ┊
     0 ┼────────┴──────────────┴─────────┴──────────────────     ← axis line
        Jul–Sep 2025  Oct–Dec 2025  Jan–Mar 2026  Apr–Jun 2026  Jul–Sep 2026
        Q2 2025       Q3 2025       Q4 2025       Q1 2026       Q2 2026
       ┌────────────┬──────────────┬─────────┬───────────────────────────┐
       │July+Aug    │Q3 2025 tool ◆│■ midline│ 2026 battery              │  14px
       └────────────┴──────────────┴─────────┴───────────────────────────┘
                                              ▲ New Grade 2 cohort
```

- Segments are **derived**, never declared: for each period I collect the distinct `source_tool` values
  present, map them to `tool_family`, and merge runs of adjacent periods that share a family.
- A DiD round inside a district period is drawn as an inset **notch** — a shorter, navy block carrying ◆
  (baseline) or ■ (midline) — so Q3 2025 reads as "district tool, plus a DiD round in it".
- Every family boundary gets a 1px `--ribbon-boundary` rule in the ribbon, continuing up through the
  plot at `--ribbon-boundary-faint` behind the data.
- A caret + "New Grade 2 cohort" sits under the boundary at Apr 2026, positioned from
  `tool_family === '2026_tool'` first appearing, not from a hardcoded date.
- Narrow segments drop their label and gain a `<title>` plus keyboard-reachable tooltip.
- Same component at three sizes: 14px inline (all time charts), 10px compact (heatmap column header
  strip), 28px display (Methods timeline, with dates and n per round).

### 3.2 Segments

Drawn one `<path>` per adjacent trend-point pair, styled by the **arriving** point's
`change_defensibility`:

| Value | Style |
|---|---|
| `within_tool` | solid, 2.5px |
| `cross_tool_matched_construct` | dash 8 4, 2px |
| `cross_tool_caveat` | dash 3 3, 2px |
| `metric_basis_changed` | **no path.** A "≠" glyph at the segment midpoint, at the mean of the two y-values, with tooltip "Not comparable: % correct vs % achieving" |
| first point / `single_source` | no path |

Segments spanning an empty period keep their style; the x-scale shows the gap. `source_detail` rows are
structurally unable to produce a path — the segment builder only ever receives `trend_point` rows.

### 3.3 Markers

| Source | Shape |
|---|---|
| any district tool | filled circle, r 4.5 |
| `did_baseline` | diamond |
| `did_midline` | square |
| `pooled:…` | circle with a 2px outer ring at 1.8× radius |

Modifiers: **hollow** (paper fill, 2px stroke) when `stability_flag` is `thin`/`n_unknown` or
`reliability_flags` contains `ceiling`. **Gold tick** — a 6px vertical stroke 8px above the marker —
when `perfect_score_required`. **Source-detail satellites** at 50% opacity, jittered ±6px around a
pooled trend point.

### 3.4 Uncertainty, labels, highlight

- `ci95_low`/`ci95_high` → a `--csf-blue` band at 12% opacity on the explorer's main chart, and 1px
  whiskers on small multiples. Absent where the columns are empty; never faked.
- Direct end-labels at ≤6 series, otherwise a legend. The latest value is always printed next to the
  last point regardless.
- Latest period with data gets a `--latest-wash` column behind the plot, with "Latest" in `--slate`
  `--t-xs` at the top of the column.

### 3.5 Tooltip

One function, one structure, pinned on click/tap, dismissed on Escape, reachable by keyboard:

```
┌─────────────────────────────────────────────┐
│ Word writing · Jul–Sep 2026                 │  competency · period
│ 57% achieving          n = 1,361            │  value + n ("n not reported" when blank)
│ ─────────────────────────────────────────── │
│ Q2 2026 tool                                │  instrument
│ Achieving = 75% or more of items            │  clearance rule, plain
│ Share of children achieving the competency  │  metric basis, plain
│ ─────────────────────────────────────────── │
│ ▾ 3.4 points lower than Apr–Jun 2026        │  change + defensibility
│   Same test in both rounds                  │
│ ─────────────────────────────────────────── │
│ Mean score 66.1%   ·  tool's own flag 57%   │  secondary values (omitted when blank)
└─────────────────────────────────────────────┘
```

Flags render as plain-language chips under the rule, using the brief's glossary verbatim
(`thin_n` → "Fewer than 30 children", etc.), driven by a lookup so an unknown flag falls back to a
humanised token rather than disappearing.

### 3.6 Empty and missing states

- Competency not assessed in a period: hatched cell / axis gap, hover "Not assessed".
- Explorer empty period: "Word writing wasn't assessed in Jan–Mar 2026. The nearest rounds are
  Oct–Dec 2025 and Apr–Jun 2026." — nearest rounds computed from the data, not written.
- Missing source file (see 0.2): named, with the pipeline command to produce it.

---

## 4. Page wireframes

Rail is 232px navy on desktop; content is a 12-column grid capped at 1280px, 32px gutters.
Sections are separated by whitespace and one hairline. Only Key findings uses cards.

### 4.1 Overview `#/overview`

```
┌──────────┬────────────────────────────────────────────────────────────────┐
│ Grade 2  │ Overview                                                       │
│ competency│ ┌──────────────────────────────────────────────────────────┐  │
│ trends   │ │ Quarterly ▾   Domain: All ▾   ☑ Show DiD points          │  │  control bar
│ Basti,   │ └──────────────────────────────────────────────────────────┘  │
│ NIPUN    │                                                                │
│ Bharat   │ How Grade 2 is doing                                    ⋮ ⇱   │  section title + export
│          │ % achieving, averaged across the competencies each instrument  │  subtitle
│ ▸Overview│ tested. The set changes when the instrument changes (ribbon).  │
│  Explorer│  100┤                                                          │
│  Map     │     │        Overall ▬▬▬                                       │
│  Changes │   50┤  ●──●   ◆     ■    ●──●   ← 3 lines, Overall heaviest    │
│  Distrib.│     │                            end-labelled, latest printed  │
│  DiD     │    0┼──────────────────────────                                │
│  Methods │      [══ instrument ribbon ══]                                 │
│          │      ────────────────────────────────────────────── hairline  │
│          │ Latest round · Jul–Sep 2026 · Q2 2026 tool · n = 1,361         │
│          │   57%            57%              57%                          │  ← 39px, the one
│          │   Overall        Literacy         Numeracy                     │    typographic
│          │   ▾ 8.5 pts vs Apr–Jun 2026 (same test in both rounds)         │    statement
│          │      ────────────────────────────────────────────── hairline  │
│          │ Where competencies stand now                             ⋮ ⇱  │
│          │ Latest round for each competency. Dot marked with its          │
│          │ instrument; bar shows its latest same-test change.             │
│          │  LITERACY                                                      │
│          │   Oral vocabulary      ────────────────────●  100  ◆ hollow    │
│          │   Letter recognition   ──────────────●       76  ▾8.1          │
│          │   Sentence reading     ─────●                31  ▾11.4  ✦      │
│          │  NUMERACY                                                      │
│          │   Addition             ───────────────●      79  ▾5.9          │
│          │   Shapes (midline)     ●                      4  ■             │
│          │      ────────────────────────────────────────────── hairline  │
│          │ Key findings                                                   │
│          │ ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│ ──────── │ │ Same test, lower │ │ Sentence reading │ │ Writing moved   │ │  cards (the only
│ Data     │ │ scores           │ │ is the weakest…  │ │ most between…   │ │  genuinely discrete
│ built    │ │ …  See changes   │ │ …  See explorer  │ │ …  See DiD      │ │  objects on the site)
│ 10 Sep   │ └──────────────────┘ └──────────────────┘ └─────────────────┘ │
└──────────┴────────────────────────────────────────────────────────────────┘
```

The latest-round strip is one band, not three cards — a single tinted `--mist` rule-bounded row.
The change line appears only when both periods share a `tool_family`; otherwise it reads
"Instrument changed, not comparable". That plus the "persistently weak" count are the only two
display computations in the whole app.

### 4.2 Competency explorer `#/competency/:id`

```
│ Sentence reading                              ‹ prev   next ›            │
│ [Quarterly ▾] [Competency: Sentence reading ▾] [☑ DiD] [☐ Show family]  │
│                                                                          │
│ % achieving over time                                             ⋮ ⇱   │  ┌──────────────┐
│ Share of children scoring 75% or more of the items on this task.  │      │  │ About this   │
│  100┤                                                             │      │  │ competency   │
│     │              ◆         ■                                    │      │  │              │
│   50┤              47        57    ●╌╌╌╌╌╌●                       │      │  │ Measured by  │
│     │                    ≠            43    31                    │      │  │ 3 instruments│
│    0┼──────────────────────────────────────                       │      │  │ …           │
│      [═══════ instrument ribbon ═══════]                          │      │  │ Achieving =  │
│                                                                   │      │  │ full marks   │
│ How children were distributed                                     │      │  │ (2 items)    │
│  Q2 25 ▐▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌  [tiers ▾ | five bands]            │      │  │ n 175–1,361  │
│  Q3 25 ▐▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌                                     │      │  │ Same task    │
│  Q1 26 ▐▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▌   critical │ developing │ achieving  │      │  │ across rounds│
│                                                                   │      │  │ ⚑ Full marks │
│ How it compares with what else was tested that round              │      │  └──────────────┘
│  ·  Q2 25    Q3 25    Q4 25    Q1 26    Q2 26      (0–100 pctile) │
│      ○         ○        ●        ○        ○     ← never connected │
```

ORF adds a second chart below: `mean_cpm` over time, 45 cpm reference line labelled "Benchmark",
plus DiD baseline 28.6 and midline 35.0 as diamond/square, read from
`did_baseline_midline_comparison.csv` — not typed in.

### 4.3 Competency map `#/map`

```
│ Competency map                                                          │
│ [Quarterly ▾][Domain ▾][Sort: ladder ▾][☐ 3+ periods][☐ Hide DiD-only] │
│ % achieving by competency and round. Blank = not assessed that round.   │
│                Jul–Sep 25  Oct–Dec 25  Jan–Mar 26  Apr–Jun 26  Jul–Sep 26│
│                July+Aug    Q3 tool ◆   midline ■   2026 battery         │  ← compact ribbon
│ LITERACY  ─────────────────────────────────────────────────────────────  │
│  oral language   │  99◌ │▨▨▨▨│▨▨▨▨│▨▨▨▨│▨▨▨▨│                          │
│  ▸ letter recog. │  81  │  72 │▨▨▨▨│  84 │  76 │                        │
│  sentence read.  │▨▨▨▨│  47◌ │ 57≠ │ 43✦ │ 31✦ │                        │
│ NUMERACY  ─────────────────────────────────────────────────────────────  │
│  addition (dist) │▨▨▨▨│  67 │▨▨▨▨│  85 │  79 │                          │
│                    ▨ = not assessed   ◌ thin/unknown n   ≠ basis change  │
│                    ✦ needs full marks                                    │
```

Mobile: horizontal scroll with the competency column sticky.

### 4.4 Changes `#/changes`

```
│ Changes                                                                 │
│ A. Same test in both rounds — the changes you can trust           ⋮ ⇱  │
│    Same test in both rounds. The children differ (Grade 2 is a new      │
│    group each year), the sample grew from 175 to 1,361, and the gap     │
│    spans the summer break.            ← n values read from the data     │
│      Apr–Jun 2026            Jul–Sep 2026                               │
│   85 ●─────────────────────────╲                                        │
│                                 ●  79  Addition            ▾5.9         │
│   54 ●──────────╲                                                       │
│                  ●  37  Patterns                           ▾16.4        │
│                                                                         │
│ B. Different tests — indicative only                              ⋮ ⇱  │
│    ┌──────────────────────────────┐  Different instruments measuring    │
│    │ Word reading   ▬▬▬▬▬▬▬│      │  the same construct. Dash pattern   │
│    │ Word writing        ▬▬│      │  matches the line grammar.          │
│    │ ORF             ╌╌╌╌╌╌│      │  → See how big the instrument       │
│    └──────────────────────────────┘    effect is (section C)            │
│    Not comparable (muted table): 23 steps between % correct and         │
│    % achieving, listed but never plotted.                               │
│                                                                         │
│ C. How big is the instrument effect?                              ⋮ ⇱  │
│    Same month, same-named task, two different instruments.              │
│      Word reading    ◆59.8 ●───────────────● 77.7  gap +17.9            │
│      Place value     ●38.4 ●───────────────◆ 60.1  gap −21.7            │
│    [ if tool_calibration_nov2025.csv is absent: a bordered note naming  │
│      the file and the pipeline command that writes it ]                 │
```

### 4.5 Distributions `#/distributions`

```
│ Distributions                                                           │
│ [Quarterly ▾][Domain ▾][Competencies: all ▾][tiers | five bands]        │
│ ┌── Jul–Sep 2025 · July + Aug ──┐ ┌── Oct–Dec 2025 · Q3 tool ─────┐    │
│ │ Oral language ▐████████████▌  │ │ Letter recog. ▐██████████▌     │    │
│ │ Word writing  ▐████░░░▒▒▒▒▌   │ │ Word reading  ▐████░░▒▒▒▒▒▌    │    │
│ └───────────────────────────────┘ └───────────────────────────────┘    │
│ ┌── Jan–Mar 2026 · Midline report (rounded) ───────────────────────┐   │
│ │ …                                                                │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│ ───────────────────────────────────────────────────────────── hairline │
│ Reading fluency                                                         │
│  ORF Q2 25 ▐0│1–15│16–29│30–44│45–59│60+▌   45 cpm benchmark ┊         │
│  Letter naming (midline) ▐…▌     Word reading timed (midline) ▐…▌       │
│ ───────────────────────────────────────────────────────────── hairline │
│ Children scoring zero — latest round                                    │
│  Shapes (midline)          ███████████████████ 63%                      │
│  Independent writing       ██████████████████  60%                      │
│  Sentence writing          █████████████       42%                      │
```

### 4.6 DiD snapshot `#/did`

```
│ DiD snapshot                                                            │
│ Nov 2025 baseline and Mar 2026 midline. 40 schools, 177 children at     │
│ midline. Treatment and control averaged equally. Sample match between   │
│ rounds not confirmed.                                                   │
│ These are % correct, not % achieving — shown in navy for that reason.   │
│                                                                         │
│ Baseline → midline, like for like                                 ⋮ ⇱  │
│   Word writing       38 ●───────────────────● 58    +20.3               │
│   Measurement        84 ●──────● 93                  +9.2               │
│   Addition 2-digit   53 ●◀─────● 60                  −7.2               │
│ ─────────────────────────────────────────────────────────── hairline   │
│ Literacy  58 ●────● 71  +13.0        Numeracy  60.3 ●● 61.6  +1.2      │
│ ─────────────────────────────────────────────────────────── hairline   │
│ Oral reading fluency (cpm)   28.6 ●────● 35.0  ┊45 benchmark            │
│ ─────────────────────────────────────────────────────────── hairline   │
│ Midline only, or bands only — no stated mean to compare                 │
│   Independent writing ▐██████ critical │ dev │ ach ▌  28% achieving     │
```

### 4.7 Methods and caveats `#/methods`

Prose, ~65ch measure, with: what "% achieving" means and its three rules; the 28px instrument timeline
with dates and n; how DiD data enters and why it is never connected across a basis change; why
cross-instrument change is indicative (linked to Changes C); the cohort note; the composition note; the
searchable crosswalk table; downloads for every published CSV plus `data_dictionary.md`; and the build
date from `manifest.json`.

### 4.8 Responsive behaviour

- **1024px** — rail collapses to a 64px icon rail with tooltips; grid drops to 8 columns.
- **768px** — charts go full width and stack; small multiples become one column.
- **390px** — rail becomes a top bar with a menu button; control bar collapses to a "Filters" row that
  expands to a sheet; heatmap scrolls horizontally with a sticky first column; tooltips become bottom
  sheets with a drag handle; the 39px hero figures stay 39px (they are the point) but stack vertically.

---

## 5. JS module structure

No framework, no build step, ES modules, D3 v7 + Observable Plot pinned from jsDelivr.

```
docs/assets/js/
  main.js          router (hashchange), page mount/unmount, data orchestration, ResizeObserver
  state.js         URL-hash state: parse/serialise {page, competency, granularity, domain,
                   showDiD, sort, filters, present}. Single source of truth; every control
                   writes here and re-renders from the hash. Shareable links fall out of this.
  data.js          d3.csv loaders + explicit coercion (bool strings, empty→null never 0,
                   0–100 floats), period ordering (quarter_start_month, fallback to the
                   Qn_yyyy rule), pooled source_tool splitting, and named selectors:
                   trendPoints(), sourceDetails(), latestPeriod(), periodsWithSlots(),
                   domainSeries(), bands(), percentiles(), didComparison(). Lazy: the views
                   CSV is fetched only by explorer / map / distributions.
  competencies.js  ladder order, display names, domain, family; humanise-and-warn fallback
  strings.js       every UI string, one object, ready for a hi/ sibling
  format.js        number, percentage, points, n ("n not reported"), period label formatting
  grammar.js       markers, segment styles, CI band, latest highlight, tooltip, flag glossary
  ribbon.js        the instrument ribbon at three sizes (split out of grammar.js: it is the
                   largest single piece of custom D3 in the app and deserves its own file)
  table.js         "View as table" — renders exactly the plotted rows as an accessible table
  export.js        Download PNG / SVG / CSV; PNG bakes in title, subtitle, ribbon, source note
  pages/overview.js  explorer.js  heatmap.js  changes.js  distributions.js  did.js  methods.js
  pages/debug.js     phase-1 acceptance page (#/debug): competencies, periods, row counts
```

**Departures from the brief's file list:** `format.js`, `ribbon.js`, `table.js`, `export.js`,
`pages/debug.js`. Each exists because the brief asks for the capability (10: exports and "View as
table"; 11.1: a debug acceptance page) and folding it into `grammar.js` would make one 1,500-line
file. Say if you'd rather stay literal to the list.

**Page contract.** Every page module exports `mount(root, ctx)` and `unmount()`. `ctx` carries the
parsed state, the loaded data and a `render()` callback. No page reads the hash directly and no page
touches another page's DOM.

**Chart contract.** Every chart is created through one `chart({title, subtitle, ariaLabel, rows,
render})` wrapper that supplies the title block, the export menu, the "View as table" toggle, the
`ResizeObserver` and the `aria-label`. That is how the brief's accessibility and export requirements
get satisfied everywhere rather than per chart.

---

## 6. Repository layout and the sync script

Per section 9, with `pipeline/` seeded from the files you supplied.

```
docs/index.html  docs/assets/{css,js}  docs/data/  docs/content/notes.json
pipeline/build_trends.py  pipeline/data_dictionary.md  pipeline/{inputs,data}/
scripts/sync_site_data.py   .gitignore   README.md   DESIGN_PLAN.md
```

`scripts/sync_site_data.py` copies the publishable aggregates, validates the columns each page relies
on, writes `manifest.json` (timestamp, per-file row counts, periods found), and **refuses to run** if
anything in `docs/` carries a `student_name` or `school_name` column, or matches the deny-list
(`student_scores_long.csv`, `*.xlsx`, `audit/*`). `n_schools` is explicitly allowed.

`.gitignore`: `*.xlsx`, `student_scores_long.csv`, `pipeline/audit/`, `pipeline/data/student_scores_long.csv`.

The private `student_scores_long.csv` you supplied stays in `files/` and never enters `docs/` or a
commit. I will not copy it into `pipeline/data/` either.

---

## 7. Build phases and what "done" looks like at each

| Phase | Contents | Acceptance |
|---|---|---|
| 1 | scaffold, sync script, `data.js`, `competencies.js`, `strings.js`, `tokens.css` | `#/debug` lists 39 competencies, 5 quarters and 10 months in correct order, row counts equal to `manifest.json` |
| 2 | `grammar.js` + `ribbon.js`, demoed on `word_writing` | that one chart shows all four segment states (`within_tool`, `cross_tool_matched_construct`, two `metric_basis_changed` gaps with ≠), pooled ring, hollow marker, gold tick, CI band, latest wash — **your sign-off before I go further** |
| 3 | Overview, Competency explorer | |
| 4 | Competency map, Changes | |
| 5 | Distributions, DiD snapshot | |
| 6 | Methods, exports, presentation mode, mobile | |
| 7 | QA section 12, deploy | Lighthouse a11y ≥95 per page; resilience tests (fake `Q3_2026` row, unknown competency ID); privacy grep clean |

Screenshots at 1440 / 1024 / 390 after every phase, critiqued against section 7 before moving on.

`word_writing` is the right phase-2 subject exactly as the brief says: it is the only competency whose
quarterly series contains a pooled point, two consecutive `metric_basis_changed` gaps, a
`cross_tool_matched_construct` segment and a `within_tool` segment. It exercises the entire grammar.

---

## 8. Questions for you

1. **The two missing files** (0.2) — can you drop `tool_calibration_nov2025.csv` and
   `inputs/competency_crosswalk.csv` in? Without them, Changes section C and the Methods crosswalk
   ship as named empty states.
2. **Ladder vs family order** (0.3) — brief's ladder order splits the addition family. Keep as
   specified, or make families contiguous?
3. **Deployment.** `gh` is authenticated here as `AdiChandrashekar`. Should I create the repo and push,
   or build locally and hand you the commands? If I push: public or private repo, and what name?
   (GitHub Pages on a private repo needs a paid plan.) Git identity isn't configured on this machine,
   so I'd set `user.name`/`user.email` at repo level — tell me what to use.
4. **Presentation-mode default.** The brief says the toggle is remembered in the URL. Should a shared
   link ever default to presentation mode on, or always start off?
5. **Note 2 wording.** The seed note says sentence reading is 31% "in Jul–Sep 2026". That's the
   Q2 2026 quarter, whose label is "Q2 2026 (Jul–Sep 2026)" — correct, but two different-looking
   names for one period. I'll render the period label from the data everywhere. Flagging in case the
   Q-number/date mismatch is itself worth a note on the Methods page.
