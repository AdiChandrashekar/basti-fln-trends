"""
Basti Grade 2 FLN competency trend pipeline (Aug 2025 - Aug 2026).

PRIMARY METRIC: % of students who cleared a competency = scored >=75% of its items
(ORF: >=45 cpm). Mean % score is carried only as a secondary field.

Inputs : Basti_All_Spots.xlsx, competency_crosswalk.csv,
         baseline_nov2025_extraction.csv, march2026_extraction.csv
Outputs: student_scores_long.csv, monthly_trends.csv, quarterly_trends.csv,
         domain_level_trend.csv, nonstacking_competency_views.csv,
         did_baseline_midline_comparison.csv
Re-run after editing competency_crosswalk.csv (std_competency / stacking_status)
and every downstream table updates. Parameters are in the CONFIG block.
"""
import sys, numpy as np, pandas as pd
from pathlib import Path

# ---------------- CONFIG ----------------
XLSX = sys.argv[1] if len(sys.argv) > 1 else "Basti_All_Spots.xlsx"
IN = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("out")
CLEAR_CUT_PCT = 75               # competency cleared = score >= 75% of items (all tools, uniform)
# Per-item override: Q3 2025 three-item competencies cleared at 2/3, as that tool decided (confirmed by Adi).
# 2026 three-item Pattern keeps the 2026 tool's own 0.75 rule (i.e. 3/3); add its keys here to switch.
CLEAR_OVERRIDE_PCT = {"Q3_ADD": 200 / 3, "Q3_SUB": 200 / 3, "Q3_CIB": 200 / 3, "Q3_PAT": 200 / 3}
ACHIEVE_CUT_2026 = 0.75          # same rule in fraction form; reproduces the 2026 sheets' Literacy %/Numeracy %
ORF_BENCHMARK_CPM = 45           # reconciles with Q2/Q3 2025 ORF flags
N_THIN, N_ROBUST = 30, 100       # stability thresholds
CEILING_PCT = 95
BASELINE_N = None                # DiD baseline total n unknown; if supplied, pooling becomes n-weighted
MIDLINE_N = 177
# Where a district tool and a DiD round measured the same competency in the same period
# (Nov 2025 / Q3 2025), do NOT average them into one number (confirmed by Adi).
# The district value carries the trend line; the DiD value is emitted as a separate
# row_type="reference_point" so it can be shown as its own point beside the line.
# Set True to restore the old equal-weight pooling.
POOL_DID_WITH_DISTRICT = False
# bands aligned to the clearance rule: b5 (>=75) == cleared
BAND_LABELS = ["b1_0", "b2_lt25", "b3_25_50", "b4_50_75", "b5_75plus"]
TIERS = {"b1_0": "critical", "b2_lt25": "critical", "b3_25_50": "developing", "b4_50_75": "developing", "b5_75plus": "cleared"}

TOOL_LABEL = {
    "july_tool": "July tool (used 4-8 Aug 2025)", "aug_tool": "Aug tool / Q2 2025 tool",
    "q3_2025_tool": "Q3 2025 tool", "q1_2026_tool": "Q1 2026 tool (G2 battery)",
    "q2_2026_tool": "Q2 2026 tool", "did_baseline": "DiD baseline (Nov 2025)",
    "did_midline": "25-26 End of Year (Mar 2026)"}
TOOL_FAMILY = {"july_tool": "july_tool", "aug_tool": "aug_tool", "q3_2025_tool": "q3_2025_tool",
               "q1_2026_tool": "2026_tool", "q2_2026_tool": "2026_tool",
               "did_baseline": "did", "did_midline": "did"}
QUARTERS = [  # code, label, start, end, is_partial (first/last per spec)
    ("Q2_2025", "Q2 2025 (Jul-Sep 2025)", "2025-07", "2025-09", True),
    ("Q3_2025", "Q3 2025 (Oct-Dec 2025)", "2025-10", "2025-12", False),
    ("Q4_2025", "Q4 2025 (Jan-Mar 2026)", "2026-01", "2026-03", False),
    ("Q1_2026", "Q1 2026 (Apr-Jun 2026)", "2026-04", "2026-06", False),
    ("Q2_2026", "Q2 2026 (Jul-Sep 2026)", "2026-07", "2026-09", True)]
QORDER = {q[0]: i for i, q in enumerate(QUARTERS)}

def month_to_quarter(m):
    for code, _, s, e, _ in QUARTERS:
        if s <= m <= e: return code
    raise ValueError(m)

# ---------------- LOAD ----------------
cw = pd.read_csv(IN / "competency_crosswalk.csv")
xl = pd.ExcelFile(XLSX)
yn = lambda v: {"Yes": 1, "No": 0}.get(v, np.nan)
recs = []

def add(rec_base, key, raw, mx, tool_flag, unit="pct", n_items=None):
    raw = pd.to_numeric(raw, errors="coerce")
    r = dict(rec_base, raw_key=key, raw_score=raw, raw_max=mx, unit=unit, achieved_tool_flag=tool_flag)
    if unit == "cpm":
        if pd.notna(raw) and raw < 0: raw = np.nan; r["raw_score"] = np.nan; r["qa_note"] = "negative CPM set to null"
        r["score_pct"] = np.nan; r["cpm"] = raw; r["achieved_tool_flag"] = np.nan
        r["cleared"] = np.nan if pd.isna(raw) else float(raw >= ORF_BENCHMARK_CPM)
        r["clearance_rule"] = f">={ORF_BENCHMARK_CPM} cpm"
    else:
        r["score_pct"] = np.nan if (pd.isna(raw) or mx is None) else 100 * raw / mx
        r["cpm"] = np.nan
        cut = CLEAR_OVERRIDE_PCT.get(key, CLEAR_CUT_PCT)
        r["cleared"] = np.nan if pd.isna(r["score_pct"]) else float(r["score_pct"] >= cut - 1e-6)
        r["clearance_rule"] = ">=2 of 3 items (tool rule at the time)" if key in CLEAR_OVERRIDE_PCT else f">={CLEAR_CUT_PCT}% of items"
        items = n_items if n_items is not None else mx
        r["n_items"] = items
        r["perfect_score_required"] = bool(items is not None and items <= 3 and key not in CLEAR_OVERRIDE_PCT)   # 75% of 1-3 items = full marks
    recs.append(r)

# --- Diag Aug: two blocks
raw = pd.read_excel(xl, "G2 Diag Aug", header=None)
q2 = pd.read_excel(xl, "G2 Q2 2025")
q2["Date"] = q2["Date"].apply(lambda d: d.replace(year=2025))          # logged year correction
q2_aug = q2[q2["Month"] == "August"]
alt = {r["Student Name"]: (r["School Name"], r["Block"], i + 2) for i, r in q2_aug.iterrows()}

for i in range(26, 55):   # JULY TOOL rows (excel 27-55)
    r = raw.iloc[i]
    b = dict(record_id=f"DiagAug_J_r{i+1}", source_sheet="G2 Diag Aug", source_block="JULY TOOL", excel_row=i + 1,
             source_tool="july_tool", date=pd.Timestamp(r[0]), school_name=r[1], school_name_alt=None, block=None,
             student_name=r[3], grade_battery=2)
    add(b, "J_OLD", r[19], 2, yn(r[6])); add(b, "J_ORF", r[21], None, None, "cpm")
    add(b, "J_WW", r[22], 2, yn(r[9])); add(b, "J_ADDSUB", r[23], 2, np.nan)
    add(b, "J_ADD", np.nan, None, yn(r[11])); add(b, "J_SUB", np.nan, None, yn(r[12]))
    add(b, "J_CIB", r[25], 1, yn(r[13])); add(b, "J_NC", r[26], 1, yn(r[14]))
    add(b, "J_PAT", r[27], 2, np.nan); add(b, "J_SHP", r[28], 2, np.nan)

for i in range(2, 24):    # AUG TOOL rows (excel 3-24); canonical record for the 22 kids also in Q2 2025 sheet
    r = raw.iloc[i]; a = alt.get(r[3], (None, None, None))
    b = dict(record_id=f"DiagAug_A_r{i+1}", source_sheet="G2 Diag Aug", source_block="AUG TOOL", excel_row=i + 1,
             source_tool="aug_tool", date=pd.Timestamp(r[0]), school_name=r[1], school_name_alt=a[0], block=a[1],
             student_name=r[3], grade_battery=2, qa_note_dup=f"identical scores also at 'G2 Q2 2025' row {a[2]}; counted once")
    for key, rc, ac, mx in [("A_OLD", 19, 6, 4), ("A_LID", 20, 7, 8), ("A_WR", 22, 9, 2), ("A_ADD1", 23, 11, 4),
                            ("A_SUB1", 24, 12, 4), ("A_CIB", 25, 13, 2), ("A_NC", 26, 14, 4)]:
        add(b, key, r[rc], mx, yn(r[ac]))
    add(b, "A_ORF", r[21], None, None, "cpm")

# --- Q2 2025 sheet: September rows only (August rows = Diag AUG TOOL block above)
for i, r in q2[q2["Month"] == "September"].iterrows():
    b = dict(record_id=f"Q22025_r{i+2}", source_sheet="G2 Q2 2025", source_block="single", excel_row=i + 2,
             source_tool="aug_tool", date=r["Date"], school_name=r["School Name"], school_name_alt=None,
             block=r["Block"], student_name=r["Student Name"], grade_battery=2)
    for key, rc, ac, mx in [("A_OLD", "OLD ( /4)", "OLD Achieved", 4), ("A_LID", "Letter identification ( /8)", "Letter identification Achieved", 8),
                            ("A_WR", "Writing ( /2)", "Writing Achieved", 2), ("A_ADD1", "One Digit Addition ( /4)", "One Digit Addition Achieved", 4),
                            ("A_SUB1", "One Digit Subtraction ( /4)", "One Digit Subtraction Achieved", 4),
                            ("A_CIB", "Counting in Bundles ( /2)", "Counting in Bundles Achieved", 2),
                            ("A_NC", "Number Comparison ( /4)", "Number Comparison Achieved", 4)]:
        add(b, key, r[rc], mx, yn(r[ac]))
    add(b, "A_ORF", r["ORF"], None, None, "cpm")

# --- Q3 2025
q3 = pd.read_excel(xl, "G2 Q3 2025")
for i, r in q3.iterrows():
    b = dict(record_id=f"Q32025_r{i+2}", source_sheet="G2 Q3 2025", source_block="single", excel_row=i + 2,
             source_tool="q3_2025_tool", date=r["Date"].replace(year=2025), school_name=r["School Name"],
             school_name_alt=None, block=str(r["Block"]).replace("\u00c2\xa0", " ").replace("\xa0", " "),
             student_name=r["Student Name"], grade_battery=2)
    for key, rc, ac, mx in [("Q3_LMR", "Letter/Matra Recognition (/8)", "Letter/Matra Recognition", 8),
                            ("Q3_WR", "Word Reading (/4)", "Word Reading", 4), ("Q3_RC", "RC (/4)", "Reading Comprehension", 4),
                            ("Q3_WW", "Word Writing  (/4)", "Word Writing", 4), ("Q3_NR", "Number Recogniton (/4)", "Number Recogniton", 4),
                            ("Q3_CIB", "Counting in Bundles (/3)", "Counting in Bundles", 3), ("Q3_PAT", "Pattern (/3)", "Pattern Recognition", 3),
                            ("Q3_ADD", "Addition (/3)", "Addition", 3), ("Q3_SUB", "Subtraction (/3)", "Subtraction", 3)]:
        add(b, key, r[rc], mx, yn(r[ac]))
    add(b, "Q3_ORF", r["ORF.1"], None, None, "cpm")

# --- 2026 sheets (Grade 2 battery only; G1/G3 excluded per Adi)
# item counts inferred from observed score steps (e.g. Pattern moves in thirds, Sentence Reading in halves)
ITEMS_2026 = {"Letter Identification": 20, "Word Reading": 16, "Sentence Reading": 2, "Word Writing": 4,
              "Number ID": 12, "Place Value": 4, "Pattern": 3, "Addition": 4, "Subtraction": 4}
G2_BATTERY = ["Letter Identification", "Word Reading", "Sentence Reading", "Word Writing",
              "Number ID", "Place Value", "Pattern", "Addition", "Subtraction"]
for sheet, tool, pre in [("G2 Q1 2026", "q1_2026_tool", "N1"), ("G2 Q2 2026", "q2_2026_tool", "N2")]:
    df = pd.read_excel(xl, sheet)
    for i, r in df[df["Grade"] == 2].iterrows():
        b = dict(record_id=f"{pre}_r{i+2}", source_sheet=sheet, source_block="single", excel_row=i + 2,
                 source_tool=tool, date=r["Date"], school_name=None, school_name_alt=None, block=None,
                 student_name=r["Student Name"], grade_battery=2)
        for c in G2_BATTERY:
            v = pd.to_numeric(r[c], errors="coerce")
            add(b, f"{pre}_{c}", v, 1, np.nan if pd.isna(v) else float(v >= ACHIEVE_CUT_2026 - 1e-9), n_items=ITEMS_2026[c])

stu = pd.DataFrame(recs)
stu["month"] = stu["date"].dt.strftime("%Y-%m")
stu["quarter_code"] = stu["month"].map(month_to_quarter)
stu = stu.merge(cw[["raw_key", "std_competency", "competency_family", "domain", "stacking_status"]], on="raw_key", how="left")
assert stu["std_competency"].notna().all(), stu.loc[stu.std_competency.isna(), "raw_key"].unique()
def band(p):
    if pd.isna(p): return None
    if p <= 0: return "b1_0"
    if p < 25: return "b2_lt25"
    if p < 50: return "b3_25_50"
    if p < CLEAR_CUT_PCT - 1e-9: return "b4_50_75"
    return "b5_75plus"
stu["band"] = stu["score_pct"].map(band)
stu["tier"] = stu["band"].map(TIERS)
# tier follows the clearance decision (so Q3 2025 2/3 scores count as 'cleared' even though their band is b4_50_75)
stu.loc[stu.cleared == 1, "tier"] = "cleared"
stu.loc[(stu.cleared == 0) & (stu.tier == "cleared"), "tier"] = "developing"

# ---------------- DiD aggregates ----------------
bl = pd.read_csv(IN / "baseline_nov2025_extraction.csv")
bl["value"] = bl[["intervention", "control"]].mean(axis=1)   # equal-weight: arm n unknown, arms collapsed per Adi
bl["raw_key"] = "B_" + bl["raw_competency"]
ml = pd.read_csv(IN / "march2026_extraction.csv")
ml["raw_key"] = "M_" + ml["raw_competency"]
did_rows = []
for _, r in bl.iterrows():   # baseline: % correct used directly as the value (per Adi); CPM items have no % value
    did_rows.append(dict(raw_key=r.raw_key, source_tool="did_baseline", month="2025-11", n=BASELINE_N,
                         value=r.value if r.unit == "pct" else np.nan,
                         mean_pct_score=r.value if r.unit == "pct" else np.nan, mean_cpm=r.value if r.unit == "cpm" else np.nan,
                         unit=r.unit, clearance_rule="DiD % correct used directly" if r.unit == "pct" else "CPM mean only; no % value"))
for _, r in ml.iterrows():   # midline: clearance = slide top band(s)
    if r.unit == "pct":
        v, rule = r.band_5_pct_students, "slide top band (>75%)"
    elif r.raw_competency == "Oral Reading Fluency":
        v, rule = r.band_5_pct_students + r.band_6_pct_students, "slide bands 45-59 + 60+ (>=45 cpm)"
    else:
        v, rule = np.nan, "no benchmark for this timed measure"
    did_rows.append(dict(raw_key=r.raw_key, source_tool="did_midline", month="2026-03", n=MIDLINE_N, value=v,
                         mean_pct_score=r.stated_mean if r.unit == "pct" else np.nan, mean_cpm=r.stated_mean if r.unit == "cpm" else np.nan,
                         unit=r.unit, clearance_rule=rule))
did = pd.DataFrame(did_rows).merge(cw[["raw_key", "std_competency", "competency_family", "domain", "stacking_status"]], on="raw_key", how="left")
assert did.std_competency.notna().all(), did.loc[did.std_competency.isna(), "raw_key"].tolist()

# ---------------- AGGREGATION ----------------
KEYS_EXTRA = ["std_competency", "competency_family", "domain", "stacking_status"]

def agg(g):
    a = g["cleared"].dropna(); sc = g["score_pct"].dropna(); c = g["cpm"].dropna(); f = g["achieved_tool_flag"].dropna()
    n = int(len(a)); p = a.mean() if n else np.nan
    se = 100 * np.sqrt(p * (1 - p) / n) if n else np.nan
    # Wilson 95% interval for a proportion
    if n:
        z = 1.96; den = 1 + z**2 / n; ctr = (p + z**2 / (2 * n)) / den
        half = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / den
        lo, hi = 100 * (ctr - half), 100 * (ctr + half)
    else: lo = hi = np.nan
    return pd.Series(dict(
        n=n, value=100 * p if n else np.nan, se=se, ci95_low=lo, ci95_high=hi,
        clearance_rule=g["clearance_rule"].iloc[0],
        perfect_score_required=bool(g.get("perfect_score_required", pd.Series([False])).fillna(False).any()),
        pct_cleared_tool_flag=100 * f.mean() if len(f) else np.nan, n_tool_flags=int(len(f)),
        mean_pct_score=sc.mean() if len(sc) else np.nan, median_pct_score=sc.median() if len(sc) else np.nan,
        sd_pct_score=sc.std(ddof=1) if len(sc) > 1 else np.nan,
        mean_cpm=c.mean() if len(c) else np.nan, median_cpm=c.median() if len(c) else np.nan,
        n_distinct_scores=int(sc.nunique()) if len(sc) else np.nan,
        n_schools=g["school_name"].nunique() if g["school_name"].notna().any() else np.nan,
        raw_keys="|".join(sorted(g["raw_key"].unique()))))

def stability(n):
    if pd.isna(n): return "n_unknown"
    return "thin" if n < N_THIN else "moderate" if n < N_ROBUST else "robust"

def build(period_col):
    keys = KEYS_EXTRA + [period_col, "source_tool"]
    t = stu[stu.cleared.notna() | stu.achieved_tool_flag.notna() | stu.score_pct.notna()]
    t = t.groupby(keys, dropna=False).apply(agg, include_groups=False).reset_index()
    t["measure_unit"] = np.where(t["mean_cpm"].notna() & t["mean_pct_score"].isna(), "cpm", "pct")
    t.loc[t.n == 0, ["n", "value"]] = np.nan          # flag-only items (July tool add/sub): no clearance value
    d = did.copy()
    if period_col == "quarter_code": d["quarter_code"] = d["month"].map(month_to_quarter)
    d["measure_unit"] = d["unit"]; d["raw_keys"] = d["raw_key"]; d["perfect_score_required"] = False
    t = pd.concat([t, d[keys + ["n", "value", "mean_pct_score", "mean_cpm", "measure_unit", "clearance_rule", "raw_keys", "perfect_score_required"]]],
                  ignore_index=True)
    t["tool_family"] = t["source_tool"].map(TOOL_FAMILY)
    t["source_tool_label"] = t["source_tool"].map(TOOL_LABEL)
    t["is_did_point"] = t["source_tool"].str.startswith("did")
    t["has_clearance_value"] = t["value"].notna()
    t["metric_basis"] = np.select([t.source_tool == "did_baseline", t.source_tool == "did_midline"],
                                  ["did_pct_correct", "slide_top_band_gt75"], "pct_students_cleared")
    t["stability_flag"] = t["n"].map(stability)
    def flags(r):
        f = []
        if not r.has_clearance_value: f.append("no_clearance_value")
        if r.stability_flag in ("thin", "n_unknown") and r.has_clearance_value: f.append(r.stability_flag + "_n")
        if r.has_clearance_value and r.value >= CEILING_PCT: f.append("ceiling")
        if r.perfect_score_required: f.append("perfect_score_required")
        if r.source_tool == "did_midline" and r.has_clearance_value: f.append("slide_band_gt75_not_ge75")
        if r.source_tool == "did_baseline" and r.has_clearance_value: f.append("baseline_pct_correct_not_clearance")
        if isinstance(r.clearance_rule, str) and r.clearance_rule.startswith(">=2 of 3"): f.append("cleared_at_2_of_3")
        if r.stacking_status == "stack_with_caveat": f.append("crosswalk_caveat")
        if r.stacking_status == "single_source": f.append("single_source")
        return ";".join(f)
    t["reliability_flags"] = t.apply(flags, axis=1)
    t["row_type"] = "source_detail"
    # one trend point per competency x period, pooling only sources that HAVE a clearance value
    tp = []
    for (scn, per), g in t.groupby(["std_competency", period_col]):
        gv = g[g.has_clearance_value]
        if gv.empty: continue
        # Hold DiD rounds out of the trend point where a district tool also measured
        # this competency in this period. The district value carries the line; the DiD
        # value is emitted below as a reference_point. Where DiD is the ONLY source,
        # it still becomes the trend point, so no series loses its only value.
        ref = gv.iloc[0:0]
        if not POOL_DID_WITH_DISTRICT and gv.is_did_point.any() and (~gv.is_did_point).any():
            ref, gv = gv[gv.is_did_point], gv[~gv.is_did_point]
        if len(gv) == 1:
            r = gv.iloc[0].to_dict(); r["pooling_method"] = "single_source"
        else:
            nknown = gv.n.notna().all()
            w = gv.n.astype(float) if nknown else pd.Series(1.0, index=gv.index)
            r = gv.iloc[0].to_dict()
            r["value"] = np.average(gv.value, weights=w)
            r["n"] = gv.n.sum() if nknown else np.nan
            for col in ["mean_pct_score", "mean_cpm", "pct_cleared_tool_flag"]:
                m = gv[col].notna(); r[col] = np.average(gv.loc[m, col], weights=w[m]) if m.any() else np.nan
            r["n_schools"] = gv.n_schools.sum(min_count=1)
            r["source_tool"] = "pooled:" + "+".join(gv.source_tool)
            r["source_tool_label"] = " + ".join(gv.source_tool_label)
            r["tool_family"] = "+".join(sorted(set(gv.tool_family)))
            r["is_did_point"] = gv.is_did_point.any()
            r["clearance_rule"] = " | ".join(sorted(set(gv.clearance_rule)))
            r["metric_basis"] = "+".join(sorted(set(gv.metric_basis)))
            r["pooling_method"] = "n_weighted" if nknown else "equal_weight_sources"
            for col in ["se", "ci95_low", "ci95_high", "median_pct_score", "sd_pct_score", "median_cpm", "n_distinct_scores"]: r[col] = np.nan
            r["stability_flag"] = stability(r["n"])
            fl = set(";".join(gv.reliability_flags).split(";")) - {"", "thin_n", "n_unknown_n"}
            if r["stability_flag"] in ("thin", "n_unknown"): fl.add(r["stability_flag"] + "_n")
            r["reliability_flags"] = ";".join(sorted(fl | {"pooled_sources"}))
            r["raw_keys"] = "|".join(gv.raw_keys)
        r["row_type"] = "trend_point"; tp.append(r)
        for _, rr in ref.iterrows():
            rr = rr.to_dict(); rr["row_type"] = "reference_point"; rr["pooling_method"] = "single_source"
            tp.append(rr)
    return pd.concat([pd.DataFrame(tp), t], ignore_index=True)

def add_changes(df, period_col, order):
    df = df.copy(); df["_o"] = df[period_col].map(order)
    for c in ["prev_period", "change_pp", "periods_gap", "same_tool_family_as_prev", "change_defensibility"]: df[c] = None
    tp = df[df.row_type == "trend_point"].sort_values("_o")
    for scn, g in tp.groupby("std_competency"):
        prev = None
        for idx, r in g.iterrows():
            if prev is not None and r.stacking_status != "single_source":
                same = r.tool_family == prev.tool_family and "+" not in r.tool_family
                df.at[idx, "prev_period"] = prev[period_col]; df.at[idx, "change_pp"] = r.value - prev.value
                df.at[idx, "periods_gap"] = r._o - prev._o; df.at[idx, "same_tool_family_as_prev"] = same
                basis_changed = ("did_pct_correct" in str(r.metric_basis)) != ("did_pct_correct" in str(prev.metric_basis))
                df.at[idx, "change_defensibility"] = "metric_basis_changed" if basis_changed else ("within_tool" if same else (
                    "cross_tool_caveat" if "stack_with_caveat" in (r.stacking_status, prev.stacking_status) else "cross_tool_matched_construct"))
            prev = r
    return df.drop(columns="_o")

MORDER = {m: i for i, m in enumerate(pd.period_range("2025-07", "2026-09", freq="M").strftime("%Y-%m"))}
mon = add_changes(build("month"), "month", MORDER).rename(columns={"change_pp": "mom_change_pp", "prev_period": "prev_month", "periods_gap": "months_gap"})
mon["quarter_code"] = mon["month"].map(month_to_quarter)
qtr = add_changes(build("quarter_code"), "quarter_code", QORDER).rename(columns={"change_pp": "qoq_change_pp", "prev_period": "prev_quarter", "periods_gap": "quarters_gap"})
qmeta = pd.DataFrame(QUARTERS, columns=["quarter_code", "quarter_label", "quarter_start_month", "quarter_end_month", "is_partial_quarter"])
mwd = pd.concat([stu[["quarter_code", "month"]], did.assign(quarter_code=did.month.map(month_to_quarter))[["quarter_code", "month"]]]).drop_duplicates()
qmeta["months_with_data"] = qmeta.quarter_code.map(mwd.groupby("quarter_code").month.apply(lambda s: ",".join(sorted(s))))
qtr = qtr.merge(qmeta, on="quarter_code", how="left")

COMMON = ["row_type", "source_tool", "source_tool_label", "tool_family", "is_did_point", "stacking_status", "measure_unit", "metric_basis", "clearance_rule",
          "n", "n_schools", "value", "se", "ci95_low", "ci95_high", "has_clearance_value", "pct_cleared_tool_flag",
          "mean_pct_score", "median_pct_score", "sd_pct_score", "mean_cpm", "median_cpm", "n_distinct_scores", "perfect_score_required",
          "stability_flag", "reliability_flags", "pooling_method"]
mon = mon[["std_competency", "competency_family", "domain", "month", "quarter_code"] + COMMON +
          ["prev_month", "months_gap", "mom_change_pp", "same_tool_family_as_prev", "change_defensibility", "raw_keys"]]
mon = mon.rename(columns={"value": "pct_students_cleared"})
mon = mon.sort_values(["domain", "std_competency", "month", "row_type"], ascending=[True, True, True, False])
qtr["_o"] = qtr.quarter_code.map(QORDER)
qtr = qtr.sort_values(["domain", "std_competency", "_o", "row_type"], ascending=[True, True, True, False])
qtr = qtr[["std_competency", "competency_family", "domain", "quarter_code", "quarter_label"] + COMMON +
          ["prev_quarter", "quarters_gap", "qoq_change_pp", "same_tool_family_as_prev", "change_defensibility", "raw_keys",
           "quarter_start_month", "quarter_end_month", "is_partial_quarter", "months_with_data"]].rename(columns={"value": "pct_students_cleared"})

# ---------------- DOMAIN LEVEL ----------------
# Excel: per student, share of the tool's domain competencies cleared (incl. ORF >=45 cpm where tested), averaged.
# With a complete battery this equals the mean of the competency clearance rates, and for 2026 it reproduces the sheets' own Literacy %/Numeracy %.
def domain_rows(period_col):
    rows = []
    s = stu[stu.cleared.notna()]
    for (per, tool), g in s.groupby([period_col, "source_tool"]):
        rec = {period_col: per, "source_tool": tool, "n_students": g.record_id.nunique()}
        for dom_ in ["literacy", "numeracy"]:
            gd = g[g.domain == dom_]
            rec[f"{dom_}_pct"] = 100 * gd.groupby("record_id").cleared.mean().mean()
            rec[f"{dom_}_competencies"] = "|".join(sorted(gd.std_competency.unique())); rec[f"{dom_}_n_competencies"] = gd.std_competency.nunique()
            sc = stu[(stu[period_col] == per) & (stu.source_tool == tool) & (stu.domain == dom_) & stu.score_pct.notna()]
            rec[f"{dom_}_mean_pct_score"] = sc.groupby("record_id").score_pct.mean().mean()
        rows.append(rec)
    d = did.copy()
    if period_col == "quarter_code": d["quarter_code"] = d.month.map(month_to_quarter)
    for (per, tool), g in d.groupby([period_col, "source_tool"]):
        rec = {period_col: per, "source_tool": tool, "n_students": g.n.iloc[0]}
        for dom_ in ["literacy", "numeracy"]:
            gd = g[(g.domain == dom_) & g.value.notna()]
            rec[f"{dom_}_pct"] = gd.value.mean() if len(gd) else np.nan
            rec[f"{dom_}_competencies"] = "|".join(sorted(gd.std_competency.unique())); rec[f"{dom_}_n_competencies"] = gd.std_competency.nunique()
            rec[f"{dom_}_mean_pct_score"] = g[(g.domain == dom_)].mean_pct_score.mean()
        rows.append(rec)
    df = pd.DataFrame(rows)
    df["overall_pct"] = df[["literacy_pct", "numeracy_pct"]].mean(axis=1, skipna=False)
    df["overall_mean_pct_score"] = df[["literacy_mean_pct_score", "numeracy_mean_pct_score"]].mean(axis=1, skipna=False)
    df["has_clearance_value"] = df.overall_pct.notna(); df["row_type"] = "source_detail"
    tps = []
    for per, g in df[df.has_clearance_value].groupby(period_col):
        # Same rule as the competency lines: a DiD round alongside a district tool is a
        # reference point, not part of the district rollup.
        ref = g.iloc[0:0]
        if not POOL_DID_WITH_DISTRICT:
            is_did = g.source_tool.str.contains("did")
            if is_did.any() and (~is_did).any(): ref, g = g[is_did], g[~is_did]
        if len(g) == 1: r = g.iloc[0].to_dict(); r["pooling_method"] = "single_source"
        else:
            nknown = g.n_students.notna().all()
            w = g.n_students.astype(float) if nknown else pd.Series(1.0, index=g.index)
            r = {period_col: per, "source_tool": "pooled:" + "+".join(g.source_tool), "n_students": g.n_students.sum() if nknown else np.nan,
                 "has_clearance_value": True}
            for c in ["literacy_pct", "numeracy_pct", "overall_pct", "literacy_mean_pct_score", "numeracy_mean_pct_score", "overall_mean_pct_score"]:
                r[c] = np.average(g[c], weights=w)
            for dom_ in ["literacy", "numeracy"]: r[f"{dom_}_competencies"] = " || ".join(g[f"{dom_}_competencies"])
            r["pooling_method"] = "n_weighted" if nknown else "equal_weight_sources"
        r["row_type"] = "trend_point"; tps.append(r)
        for _, rr in ref.iterrows():
            rr = rr.to_dict(); rr["row_type"] = "reference_point"; rr["pooling_method"] = "single_source"
            tps.append(rr)
    out = pd.concat([pd.DataFrame(tps), df], ignore_index=True)
    out["source_tool_label"] = out.source_tool.map(lambda x: " + ".join(TOOL_LABEL.get(t, t) for t in x.replace("pooled:", "").split("+")))
    out["includes_did"] = out.source_tool.str.contains("did")
    out["coverage_note"] = np.select([out.source_tool.str.contains("did_baseline"), out.source_tool.str.contains("did_midline")],
        ["Baseline value = DiD mean % correct taken directly (not a 75% clearance rate); 24 % items, CPM items excluded",
         "Midline clearance = slide top band (>75%, strictly above); students at exactly 75% are not counted"], "")
    return out

frames = []
for pc, pt in [("month", "month"), ("quarter_code", "quarter")]:
    x = domain_rows(pc).rename(columns={pc: "period"}); x["period_type"] = pt; frames.append(x)
dom = pd.concat(frames, ignore_index=True)
for c in ["overall", "literacy", "numeracy"]: dom[f"change_{c}_pp_vs_prev"] = np.nan
for pt, g in dom[dom.row_type == "trend_point"].groupby("period_type"):
    g = g.assign(_o=g.period.map(QORDER if pt == "quarter" else MORDER)).sort_values("_o"); prev = None
    for idx, r in g.iterrows():
        if prev is not None:
            for c in ["overall", "literacy", "numeracy"]: dom.at[idx, f"change_{c}_pp_vs_prev"] = r[f"{c}_pct"] - prev[f"{c}_pct"]
        prev = r
dom["_o"] = np.where(dom.period_type == "quarter", dom.period.map(QORDER), dom.period.map(MORDER))
dom = dom.sort_values(["period_type", "_o", "row_type"], ascending=[True, True, False]).drop(columns="_o")
dom = dom.rename(columns={"literacy_pct": "literacy_pct_cleared", "numeracy_pct": "numeracy_pct_cleared", "overall_pct": "overall_pct_cleared"})
dom = dom[["period_type", "period", "row_type", "source_tool", "source_tool_label", "includes_did", "has_clearance_value", "n_students",
           "literacy_pct_cleared", "numeracy_pct_cleared", "overall_pct_cleared",
           "change_literacy_pp_vs_prev", "change_numeracy_pp_vs_prev", "change_overall_pp_vs_prev",
           "literacy_mean_pct_score", "numeracy_mean_pct_score", "overall_mean_pct_score",
           "literacy_n_competencies", "numeracy_n_competencies", "literacy_competencies", "numeracy_competencies", "pooling_method", "coverage_note"]]

# ---------------- NON-STACKING VIEWS ----------------
nv = []
for per_col, ptype, tbl in [("quarter_code", "quarter", qtr), ("month", "month", mon)]:
    sd = tbl[(tbl.row_type == "source_detail") & tbl.has_clearance_value]
    for (per, tool), g in sd.groupby([per_col, "source_tool"]):
        for scope in ["literacy", "numeracy", "all"]:
            gg = g if scope == "all" else g[g.domain == scope]
            if len(gg) < 2: continue
            v = gg.pct_students_cleared; mu, sdv = v.mean(), v.std(ddof=0)
            rk = v.rank(ascending=False, method="min"); pr = v.rank(pct=True)
            for idx, r in gg.iterrows():
                base = dict(view="small_multiples_index", period_type=ptype, period=per, source_tool=tool, panel_id=f"{per}|{tool}|{scope}",
                            index_scope=scope, std_competency=r.std_competency, domain=r.domain, n=r.n, stacking_status=r.stacking_status,
                            reliability_flags=r.reliability_flags, panel_n_competencies=len(gg))
                nv.append(dict(base, metric="pct_students_cleared", value=r.pct_students_cleared))
                nv.append(dict(base, metric="z_within_panel", value=(r.pct_students_cleared - mu) / sdv if sdv > 0 else 0))
                nv.append(dict(base, metric="percentile_within_panel", value=100 * pr[idx]))
                nv.append(dict(base, metric="rank_within_panel", value=rk[idx]))
for per_col, ptype in [("quarter_code", "quarter"), ("month", "month")]:
    s_ = stu[stu.band.notna()]
    for (per, tool, scn), g in s_.groupby([per_col, "source_tool", "std_competency"]):
        n = len(g); vc = g.band.value_counts(); tc = g.tier.value_counts()
        base = dict(view="mastery_bands", period_type=ptype, period=per, source_tool=tool, panel_id=f"{per}|{tool}", std_competency=scn,
                    domain=g.domain.iloc[0], n=n, stacking_status=g.stacking_status.iloc[0], n_distinct_scores=g.score_pct.nunique(),
                    band_source="student_level_scores (top band = >=75%)")
        for lab in BAND_LABELS: nv.append(dict(base, metric=f"pct_students_{lab}", value=100 * vc.get(lab, 0) / n))
        for t_ in ["critical", "developing", "cleared"]: nv.append(dict(base, metric=f"pct_students_tier_{t_}", value=100 * tc.get(t_, 0) / n))
    s_ = stu[stu.cpm.notna()]
    cpm_edges = [(-1, 0, "0"), (0, 15, "1-15"), (15, 29, "16-29"), (29, 44, "30-44"), (44, 59, "45-59"), (59, 1e9, "60+")]
    for (per, tool, scn), g in s_.groupby([per_col, "source_tool", "std_competency"]):
        n = len(g)
        for lo, hi, lab in cpm_edges:
            v = (g.cpm <= 0).sum() if lab == "0" else ((g.cpm > lo) & (g.cpm <= hi)).sum()
            nv.append(dict(view="mastery_bands", period_type=ptype, period=per, source_tool=tool, panel_id=f"{per}|{tool}", std_competency=scn,
                           domain="literacy", n=n, band_source="student_level_cpm", metric=f"pct_students_cpm_{lab}", value=100 * v / n))
cmap = dict(zip(cw.raw_key, cw.std_competency))
for _, r in ml.iterrows():
    scn = cmap[r.raw_key]
    for ptype, per in [("quarter", "Q4_2025"), ("month", "2026-03")]:
        base = dict(view="mastery_bands", period_type=ptype, period=per, source_tool="did_midline", panel_id=f"{per}|did_midline", std_competency=scn,
                    domain=r.domain, n=MIDLINE_N, band_source="slide_chart (top band = >75%; rounded, sums 99-101)")
        if r.unit == "cpm":
            for k in range(1, 7): nv.append(dict(base, metric=f"pct_students_cpm_{r[f'band_{k}_label']}", value=r[f"band_{k}_pct_students"]))
        else:
            vals = [r[f"band_{k}_pct_students"] for k in range(1, 6)]
            for lab, v in zip(BAND_LABELS, vals): nv.append(dict(base, metric=f"pct_students_{lab}", value=v))
            nv.append(dict(base, metric="pct_students_tier_critical", value=vals[0] + vals[1]))
            nv.append(dict(base, metric="pct_students_tier_developing", value=vals[2] + vals[3]))
            nv.append(dict(base, metric="pct_students_tier_cleared", value=vals[4]))
nvdf = pd.DataFrame(nv)

# ---------------- DiD COMPARISON ----------------
bsc = bl.merge(cw[["raw_key", "std_competency"]], on="raw_key")
mlm = ml.copy(); mlm["std_competency"] = mlm.raw_key.map(cmap)
cmp = []
for scn in list(dict.fromkeys(list(bsc.std_competency) + list(mlm.std_competency))):
    b = bsc[bsc.std_competency == scn]; m = mlm[mlm.std_competency == scn]
    br = b.iloc[0] if len(b) else None; mr = m.iloc[0] if len(m) else None
    unit = br.unit if br is not None else mr.unit
    m_clear = np.nan
    if mr is not None:
        m_clear = mr.band_5_pct_students if unit == "pct" else (mr.band_5_pct_students + mr.band_6_pct_students if mr.raw_competency == "Oral Reading Fluency" else np.nan)
    bm = br.value if br is not None else np.nan; mm = mr.stated_mean if mr is not None else np.nan
    status = ("both_means" if br is not None and mr is not None and pd.notna(mm) else
              "baseline_mean + midline_bands_only" if br is not None and mr is not None else
              "baseline_only" if br is not None else "midline_only")
    cmp.append(dict(std_competency=scn, domain=(br["domain"] if br is not None else mr["domain"]), unit=unit,
                    baseline_raw_name=br.raw_competency if br is not None else None, midline_raw_name=mr.raw_competency if mr is not None else None,
                    baseline_value_in_series=bm if unit == "pct" else np.nan, midline_value_in_series=m_clear,
                    baseline_mean=bm, midline_mean=mm, mean_change=mm - bm,
                    midline_pct_zero_band=mr.band_1_pct_students if mr is not None else np.nan, comparison_status=status,
                    note=("In the trend series the baseline enters as % correct and the midline as its >75% top band; "
                          "compare like with like via baseline_mean vs midline_mean") if br is not None and mr is not None else ""))
cmpdf = pd.DataFrame(cmp)
for dom_ in ["literacy", "numeracy"]:
    mm_ = cmpdf[(cmpdf.domain == dom_) & (cmpdf.comparison_status == "both_means") & (cmpdf.unit == "pct")]
    cmpdf = pd.concat([cmpdf, pd.DataFrame([dict(std_competency=f"_domain_matched_set_{dom_}", domain=dom_, unit="pct",
        baseline_mean=mm_.baseline_mean.mean(), midline_mean=mm_.midline_mean.mean(), mean_change=mm_.midline_mean.mean() - mm_.baseline_mean.mean(),
        midline_value_in_series=mm_.midline_value_in_series.mean(), comparison_status="summary",
        note="Means over competencies with a stated mean in both rounds: " + "|".join(mm_.std_competency))])], ignore_index=True)

# ---------------- SAME-MONTH CALIBRATION (mean score; the only metric both Nov sources share) ----------------
nov = mon[(mon.month == "2025-11") & (mon.row_type == "source_detail")].copy()
nov["m"] = np.where(nov.measure_unit == "cpm", nov.mean_cpm, nov.mean_pct_score)
cal = nov.pivot_table(index=["std_competency", "measure_unit"], columns="source_tool", values="m").dropna().reset_index()
cal = cal.rename(columns={"q3_2025_tool": "q3_2025_tool_nov_mean", "did_baseline": "did_baseline_nov_mean"})
cal["district_minus_did_mean"] = cal.q3_2025_tool_nov_mean - cal.did_baseline_nov_mean
cal["note"] = "Mean score comparison (baseline has no clearance data). Size of the gap indicates instrument difference for same-named items."

# ---------------- WRITE ----------------
OUT.mkdir(parents=True, exist_ok=True)
stu.drop(columns=["qa_note_dup"]).assign(dup_note=stu["qa_note_dup"]).to_csv(OUT / "student_scores_long.csv", index=False)
mon.to_csv(OUT / "monthly_trends.csv", index=False)
qtr.to_csv(OUT / "quarterly_trends.csv", index=False)
dom.to_csv(OUT / "domain_level_trend.csv", index=False)
nvdf.to_csv(OUT / "nonstacking_competency_views.csv", index=False)
cmpdf.to_csv(OUT / "did_baseline_midline_comparison.csv", index=False)
cal.to_csv(OUT / "tool_calibration_nov2025.csv", index=False)
print("student records:", stu.record_id.nunique(), "| monthly:", len(mon), "| quarterly:", len(qtr), "| domain:", len(dom),
      "| views:", len(nvdf), "| did cmp:", len(cmpdf))
