"""
Sync the publishable aggregate data from the pipeline into the GitHub Pages folder.

    python scripts/sync_site_data.py

What it does
  1. Refuses to copy anything that is not on the publish allow-list.
  2. Validates that every copied file carries the columns the dashboard reads.
  3. Refuses to finish if ANY file under docs/ carries a student_name or school_name
     column, or matches the private deny-list. n_schools is an aggregate count and is fine.
  4. Writes docs/data/manifest.json with the build timestamp, per-file row counts and
     the periods found, which the dashboard reads for its build date and debug page.

Exit code is non-zero on any failure, so this is safe to wire into a pre-commit hook.
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
DOCS_DATA = ROOT / "docs" / "data"

# ---------------------------------------------------------------- allow-list
# Every file the published site is allowed to contain, with the columns the
# dashboard actually reads. Adding a page that needs a new column means adding
# it here, so the sync fails loudly rather than the chart failing silently.
REQUIRED_COLUMNS: dict[str, set[str]] = {
    "quarterly_trends.csv": {
        "std_competency", "competency_family", "domain", "quarter_code", "quarter_label",
        "row_type", "source_tool", "source_tool_label", "tool_family", "is_did_point",
        "stacking_status", "measure_unit", "metric_basis", "clearance_rule",
        "n", "n_schools", "pct_students_cleared", "se", "ci95_low", "ci95_high",
        "has_clearance_value", "pct_cleared_tool_flag", "mean_pct_score", "median_pct_score",
        "mean_cpm", "perfect_score_required", "stability_flag", "reliability_flags",
        "pooling_method", "prev_quarter", "quarters_gap", "qoq_change_pp",
        "same_tool_family_as_prev", "change_defensibility",
        "quarter_start_month", "quarter_end_month", "is_partial_quarter", "months_with_data",
    },
    "monthly_trends.csv": {
        "std_competency", "competency_family", "domain", "month", "quarter_code",
        "row_type", "source_tool", "source_tool_label", "tool_family", "is_did_point",
        "stacking_status", "measure_unit", "metric_basis", "clearance_rule",
        "n", "n_schools", "pct_students_cleared", "se", "ci95_low", "ci95_high",
        "has_clearance_value", "pct_cleared_tool_flag", "mean_pct_score", "median_pct_score",
        "mean_cpm", "perfect_score_required", "stability_flag", "reliability_flags",
        "pooling_method", "prev_month", "months_gap", "mom_change_pp",
        "same_tool_family_as_prev", "change_defensibility",
    },
    "domain_level_trend.csv": {
        "period_type", "period", "row_type", "source_tool", "source_tool_label",
        "includes_did", "has_clearance_value", "n_students",
        "literacy_pct_cleared", "numeracy_pct_cleared", "overall_pct_cleared",
        "change_literacy_pp_vs_prev", "change_numeracy_pp_vs_prev", "change_overall_pp_vs_prev",
        "literacy_n_competencies", "numeracy_n_competencies",
        "literacy_competencies", "numeracy_competencies", "pooling_method", "coverage_note",
    },
    "nonstacking_competency_views.csv": {
        "view", "period_type", "period", "source_tool", "panel_id", "index_scope",
        "std_competency", "domain", "n", "stacking_status", "reliability_flags",
        "panel_n_competencies", "metric", "value", "band_source",
    },
    "did_baseline_midline_comparison.csv": {
        "std_competency", "domain", "unit", "baseline_value_in_series", "midline_value_in_series",
        "baseline_mean", "midline_mean", "mean_change", "midline_pct_zero_band",
        "comparison_status", "note",
    },
    "tool_calibration_nov2025.csv": {
        "std_competency", "measure_unit", "did_baseline_nov_mean", "q3_2025_tool_nov_mean",
        "district_minus_did_mean", "note",
    },
    "competency_crosswalk.csv": {
        "raw_key", "source_tool", "raw_name", "raw_scale", "std_competency",
        "competency_family", "domain", "unit", "stacking_status", "confidence",
        "confirmation_status", "reasoning",
    },
}

# source path -> destination filename
SOURCES: dict[str, Path] = {
    "quarterly_trends.csv": PIPELINE / "data" / "quarterly_trends.csv",
    "monthly_trends.csv": PIPELINE / "data" / "monthly_trends.csv",
    "domain_level_trend.csv": PIPELINE / "data" / "domain_level_trend.csv",
    "nonstacking_competency_views.csv": PIPELINE / "data" / "nonstacking_competency_views.csv",
    "did_baseline_midline_comparison.csv": PIPELINE / "data" / "did_baseline_midline_comparison.csv",
    "tool_calibration_nov2025.csv": PIPELINE / "data" / "tool_calibration_nov2025.csv",
    "competency_crosswalk.csv": PIPELINE / "inputs" / "competency_crosswalk.csv",
}

# Copied verbatim, not a CSV, so not column-validated.
DOC_SOURCES: dict[str, Path] = {
    "data_dictionary.md": PIPELINE / "data_dictionary.md",
}

# ---------------------------------------------------------------- privacy guard
# Columns that identify a child or a school. n_schools is a count, not a name.
FORBIDDEN_COLUMNS = {"student_name", "school_name", "school_name_alt", "child_name"}
# Filenames that must never reach docs/, whatever their columns say.
FORBIDDEN_FILENAMES = {"student_scores_long.csv"}
FORBIDDEN_SUFFIXES = {".xlsx", ".xls", ".xlsm"}

FAILURES: list[str] = []


def fail(message: str) -> None:
    FAILURES.append(message)
    print(f"  FAIL  {message}", file=sys.stderr)


def read_header(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        try:
            return next(csv.reader(fh))
        except StopIteration:
            return []


def count_rows(path: Path) -> int:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return max(0, sum(1 for _ in fh) - 1)


def periods_in(path: Path, columns: tuple[str, ...]) -> list[str]:
    """Distinct values of the first period column present in the file."""
    header = read_header(path)
    column = next((c for c in columns if c in header), None)
    if column is None:
        return []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return sorted({row[column] for row in csv.DictReader(fh) if row.get(column)})


def validate_source(name: str, path: Path) -> bool:
    if not path.exists():
        fail(f"{name}: source not found at {path.relative_to(ROOT)}. "
             f"Run the pipeline first: python pipeline/build_trends.py <xlsx> pipeline/inputs pipeline/data")
        return False
    header = set(read_header(path))
    missing = REQUIRED_COLUMNS[name] - header
    if missing:
        fail(f"{name}: missing {len(missing)} required column(s): {', '.join(sorted(missing))}. "
             f"The dashboard reads these; re-run the pipeline or update REQUIRED_COLUMNS here.")
        return False
    leaked = FORBIDDEN_COLUMNS & header
    if leaked:
        fail(f"{name}: carries identifying column(s) {', '.join(sorted(leaked))}. Refusing to publish.")
        return False
    return True


def audit_docs_folder() -> None:
    """Nothing under docs/ may name a child or a school. This is the last line of defence."""
    docs = ROOT / "docs"
    if not docs.exists():
        return
    for path in sorted(docs.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            fail(f"{rel}: spreadsheet files must never be published.")
            continue
        if path.name in FORBIDDEN_FILENAMES:
            fail(f"{rel}: this file contains children's names and must never be published.")
            continue
        if path.suffix.lower() != ".csv":
            continue
        leaked = FORBIDDEN_COLUMNS & set(read_header(path))
        if leaked:
            fail(f"{rel}: carries identifying column(s) {', '.join(sorted(leaked))}.")


def main() -> int:
    print(f"Syncing site data into {DOCS_DATA.relative_to(ROOT)}\n")
    DOCS_DATA.mkdir(parents=True, exist_ok=True)

    # Refuse to run at all if docs/ is already carrying something it should not.
    # Copying on top of a leak would leave the leak in place and look like success.
    print("Checking docs/ before touching anything")
    audit_docs_folder()
    if FAILURES:
        print(f"\nRefusing to run: docs/ already contains {len(FAILURES)} file(s) that must "
              f"never be published. Remove them, then run this again. Nothing was copied.",
              file=sys.stderr)
        return 1
    print("  clean")

    print("\nValidating sources")
    ok = {name: validate_source(name, path) for name, path in SOURCES.items()}
    for name in SOURCES:
        if ok[name]:
            print(f"  ok    {name}")

    if FAILURES:
        print(f"\nRefusing to sync: {len(FAILURES)} problem(s) above. Nothing was copied.", file=sys.stderr)
        return 1

    print("\nCopying")
    manifest_files: dict[str, dict] = {}
    for name, path in SOURCES.items():
        dest = DOCS_DATA / name
        shutil.copy2(path, dest)
        manifest_files[name] = {
            "rows": count_rows(dest),
            "columns": len(read_header(dest)),
            "bytes": dest.stat().st_size,
        }
        print(f"  {name}  ({manifest_files[name]['rows']:,} rows)")

    for name, path in DOC_SOURCES.items():
        if not path.exists():
            fail(f"{name}: source not found at {path.relative_to(ROOT)}")
            continue
        shutil.copy2(path, DOCS_DATA / name)
        print(f"  {name}")

    print("\nAuditing docs/ for identifying data")
    audit_docs_folder()
    if FAILURES:
        print(f"\nSync FAILED the privacy audit: {len(FAILURES)} problem(s) above.\n"
              f"Remove the offending file(s) from docs/ before committing.", file=sys.stderr)
        return 1
    print("  clean: no student_name / school_name column anywhere under docs/")

    quarters = periods_in(DOCS_DATA / "quarterly_trends.csv", ("quarter_code",))
    months = periods_in(DOCS_DATA / "monthly_trends.csv", ("month",))
    manifest = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/sync_site_data.py",
        "files": manifest_files,
        "periods": {"quarters": quarters, "months": months},
        "competencies": len(periods_in(DOCS_DATA / "quarterly_trends.csv", ("std_competency",))),
    }
    (DOCS_DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("\nWrote manifest.json")
    print(f"  built_at      {manifest['built_at']}")
    print(f"  quarters      {', '.join(quarters)}")
    if months:
        print(f"  months        {len(months)} ({months[0]} to {months[-1]})")
    print(f"  competencies  {manifest['competencies']}")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
