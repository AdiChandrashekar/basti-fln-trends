# Basti Grade 2 competency trends

A static dashboard showing how Grade 2 children in Basti district (Uttar Pradesh) perform on
foundational literacy and numeracy competencies, August 2025 to August 2026.

The unit of analysis is the **competency**. The tracked metric is the **share of children achieving**
each competency — not the average score. Everything on screen answers one of five questions: where
Grade 2 stands now, what is moving and whether the movement can be trusted, what is persistently weak,
how children are distributed on a task, and what the DiD baseline and midline showed.

There are no views by school, block, assessor or student, by design.

---

## Privacy — read this before you commit anything

The raw data contains **children's names and school names**. This site is published from a public
repository. Three things keep them out of it:

1. **`.gitignore`** excludes `*.xlsx`, `student_scores_long.csv`, `pipeline/audit/` and the `files/`
   drop folder.
2. **`scripts/sync_site_data.py` refuses to run** if anything under `docs/` carries a `student_name`
   or `school_name` column, or matches the private deny-list. It checks before it copies and again
   after, and exits non-zero either way.
3. **Only allow-listed files are ever copied** into `docs/data/`. The script will not copy a file it
   does not know about.

`n_schools` is fine to publish. It is an aggregate count, and school names never appear anywhere.

If you add a page that needs a new column, add it to `REQUIRED_COLUMNS` in the sync script so a
missing column fails the sync loudly instead of failing the chart silently.

**One known exception to the QA grep.** `grep -ri "student_name\|school_name" docs/` returns a single
hit: line 169 of `docs/data/data_dictionary.md`, in the corrections table, which mentions the
`school_name_alt` *column* while documenting how duplicate August records were merged. That is a
column name in prose, not a school. No child or school is named anywhere in the published site. The
sync script's audit reads CSV headers rather than grepping prose, which is why it passes this file —
that is deliberate, not an oversight. If you would rather the grep came back completely empty, edit
that line in `pipeline/data_dictionary.md` and re-sync.

---

## Repository layout

```
docs/                        GitHub Pages source (Settings → Pages → /docs)
  index.html
  assets/css/tokens.css      every colour and type token. The only file with a hex value.
  assets/css/app.css         layout shell
  assets/js/                 router, state, data layer, shared chart grammar
  assets/js/pages/           one module per page
  data/                      synced aggregate CSVs + manifest.json ONLY
  content/notes.json         editable key-findings notes
pipeline/                    the analysis pipeline
  build_trends.py
  data_dictionary.md         the authority on every definition
  inputs/competency_crosswalk.csv
  data/                      pipeline output
scripts/sync_site_data.py    copy + validate + privacy guard + manifest
DESIGN_PLAN.md               the design plan this build follows
```

---

## Running the pipeline

Needs Python with pandas, and the source workbook (which is **not** in this repo).

```bash
python pipeline/build_trends.py Basti_All_Spots.xlsx pipeline/inputs pipeline/data
```

Edit `pipeline/inputs/competency_crosswalk.csv` — the `std_competency` and `stacking_status`
columns drive everything — or the `CONFIG` block at the top of `build_trends.py`, then re-run.
Every downstream table updates.

## Syncing the site data

After any pipeline run:

```bash
python scripts/sync_site_data.py
```

This copies the six publishable aggregate tables plus the crosswalk and the data dictionary into
`docs/data/`, validates the columns, runs the privacy audit, and writes `manifest.json` with the
build timestamp, per-file row counts and the periods found.

The dashboard reads that timestamp and appends it to every data URL as `?v=…`, so a redeploy is
picked up immediately instead of sitting behind GitHub Pages' ten-minute cache. Nothing else needs
to change when the data changes — new competencies, new rounds and new periods all flow through.

## Previewing locally

```bash
python scripts/dev_server.py
```

Then open <http://localhost:8110>. This is `http.server` with `Cache-Control: no-store`
added — without it the browser holds on to ES modules between edits and you spend your time
debugging a stale copy of the site. `#/debug` is an unlinked page that lists every competency, every
period in order, and the parsed row counts against the manifest — the quickest way to confirm a new
pipeline run landed correctly.

## Publishing to GitHub Pages

```bash
git init && git add -A && git commit -m "Basti Grade 2 competency trends dashboard"
gh repo create basti-fln-trends --public --source=. --push
gh api -X POST repos/:owner/basti-fln-trends/pages -f "source[branch]=main" -f "source[path]=/docs"
```

Or in the browser: Settings → Pages → Source: Deploy from a branch → `main` / `/docs`.

The site is served from `https://<user>.github.io/<repo>/`, not the domain root, so **every fetch
path in the code is relative**. Keep it that way.

## Editing the key findings

`docs/content/notes.json` holds the notes on the Overview. Each is
`{ id, title, body, link_hash, as_of }`. `link_hash` is an in-app link such as `#/changes` or
`#/competency/sentence_reading`.

**Re-check every number in a note against the CSVs whenever the pipeline is re-run.** The notes are
editorial text, so nothing validates them automatically — they are the one place in this site where a
number can go stale.

---

## Build status

| Phase | Scope | State |
|---|---|---|
| 1 | Scaffold, sync script, data layer, tokens, strings | done |
| 2 | Shared chart grammar and the instrument ribbon | done |
| 3 | Overview and Competency explorer | done |
| 4 | Competency map and Changes | done |
| 5 | Distributions and DiD snapshot | done |
| 6 | Methods, exports, presentation mode, mobile | next |
| 7 | QA and deployment | |
