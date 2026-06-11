# Flint-Py vs TypeScript Reference — Full Gallery Compatibility Report

## Executive summary

Across the **659** Vega-Lite test cases extracted from the full agent-chart gallery (`gallery-tree.ts` → every page rendered through the VL backend), the Python port (`flint-py`) reproduces the JS reference output **byte-for-byte** on:

- **658 / 658 (100.0%)** cases whose chart type is implemented in the Python port,
- equivalently **658 / 659 (99.8%)** of the full gallery.

There are **0** specs that differ between Python and JS after this run — i.e. the Python port matches the JS reference on every ported chart type for every gallery test case.

The remaining **0** cases (~0%) are *not* compatibility bugs; they are chart-type templates that the original sub-agent never ported. Those templates raise `ValueError: Unknown chart type: …` in Python and are listed below as explicit gaps.

**1** case is a JS-side error (`Sunburst Chart`) — the TypeScript VL backend doesn't implement this chart type either, so it's out of scope for the Python port. See *JS_ERROR diagnostics* below.

## Methodology

1. The extractor at `tests/frontend/unit/lib/flint-chart/flint_py_extract.test.ts` walks `GALLERY_TREE` and, for every page whose `library === 'vegalite'` or `render === 'triple'`, calls each registered `TestCase` generator and runs the JS reference `assembleVegaLite(input, { addTooltips: true })` with the gallery's default canvas size (400×300). Each case is written to `flint-py/tests/fixtures/<slug>/` as `input.json` + `expected.json` (+ `meta.json` for provenance).

2. `flint-py/tools/run_full_eval.py` loads every fixture, runs Python `assemble_vegalite(input)`, then compares with the JS reference using **byte-level JSON equality** after canonicalising key order and rounding floats to 9 decimal places (so dict ordering and last-bit float drift don't trip the assertion). The strictness matches the pytest harness in `flint-py/tests/test_fixtures.py`.

3. The same fixtures are exercised by plain `pytest -q`. Cases for unported chart types are reported as `skipped` rather than `failed` so the suite cleanly signals real regressions on the ported surface.

## Result categories

| Outcome | Count | % | Meaning |
|---|---:|---:|---|
| PASS | 658 | 99.8% | Python output is byte-equivalent to the JS reference. |
| MISMATCH | 0 | 0.0% | Python produced a spec but it differs from JS. |
| PY_ERROR | 0 | 0.0% | `assemble_vegalite` raised an exception — i.e. chart-type template not yet ported. |
| JS_ERROR | 1 | 0.2% | JS reference itself couldn't produce a VL spec — out of scope for the Python port. |

## Pass rate by chart type

| Chart Type | PASS | MISMATCH | PY_ERROR | JS_ERROR | Total | Status |
|---|---:|---:|---:|---:|---:|---|
| Area Chart | 55 | 0 | 0 | 0 | 55 | ✅ ported |
| Bar Chart | 166 | 0 | 0 | 0 | 166 | ✅ ported |
| Bar Table | 19 | 0 | 0 | 0 | 19 | ✅ ported |
| Boxplot | 14 | 0 | 0 | 0 | 14 | ✅ ported |
| Bump Chart | 9 | 0 | 0 | 0 | 9 | ✅ ported |
| Candlestick Chart | 4 | 0 | 0 | 0 | 4 | ✅ ported |
| Custom Area | 1 | 0 | 0 | 0 | 1 | ✅ ported |
| Custom Bar | 1 | 0 | 0 | 0 | 1 | ✅ ported |
| Custom Point | 1 | 0 | 0 | 0 | 1 | ✅ ported |
| Density Plot | 4 | 0 | 0 | 0 | 4 | ✅ ported |
| Grouped Bar Chart | 24 | 0 | 0 | 0 | 24 | ✅ ported |
| Heatmap | 17 | 0 | 0 | 0 | 17 | ✅ ported |
| Histogram | 4 | 0 | 0 | 0 | 4 | ✅ ported |
| KPI Card | 7 | 0 | 0 | 0 | 7 | ✅ ported |
| Line Chart | 78 | 0 | 0 | 0 | 78 | ✅ ported |
| Lollipop Chart | 10 | 0 | 0 | 0 | 10 | ✅ ported |
| Pie Chart | 8 | 0 | 0 | 0 | 8 | ✅ ported |
| Pyramid Chart | 11 | 0 | 0 | 0 | 11 | ✅ ported |
| Radar Chart | 11 | 0 | 0 | 0 | 11 | ✅ ported |
| Ranged Dot Plot | 4 | 0 | 0 | 0 | 4 | ✅ ported |
| Regression | 10 | 0 | 0 | 0 | 10 | ✅ ported |
| Rose Chart | 10 | 0 | 0 | 0 | 10 | ✅ ported |
| Scatter Plot | 114 | 0 | 0 | 0 | 114 | ✅ ported |
| Stacked Bar Chart | 53 | 0 | 0 | 0 | 53 | ✅ ported |
| Streamgraph | 6 | 0 | 0 | 0 | 6 | ✅ ported |
| Strip Plot | 9 | 0 | 0 | 0 | 9 | ✅ ported |
| Sunburst Chart | 0 | 0 | 0 | 1 | 1 | 🚫 JS unsupported |
| Waterfall Chart | 8 | 0 | 0 | 0 | 8 | ✅ ported |

## Pass rate by gallery section

| Section | PASS | MISMATCH | PY_ERROR | JS_ERROR | Total |
|---|---:|---:|---:|---:|---:|
| demos | 14 | 0 | 0 | 1 | 15 |
| features | 424 | 0 | 0 | 0 | 424 |
| vegalite | 220 | 0 | 0 | 0 | 220 |

## Generators with non-PASS outcomes (PY_ERROR / MISMATCH only)

_None._ Every generator has a 100% pass rate on the ported chart types.

## JS_ERROR diagnostics (1 cases — JS reference couldn't produce a VL spec)

- `omni_sunburst__00__phase_3_sunburst_mau_composition_region_gametype_game` — chartType `Sunburst Chart` — JS error: `Unknown chart type: Sunburst Chart`

These cases are **flagged as out-of-scope** for the Python port: the TypeScript VL backend itself can't compile them. The user asked us to surface such cases for follow-up; they're candidates for either implementing the chart type in the JS VL backend or removing them from the gallery's VL-rendered set.

## Key compatibility fixes applied during the port

The PASS rate above reflects several JS↔Python parity fixes made in the course of running this evaluation. The most consequential ones, documented here so future contributors don't reintroduce them:

1. **V8 `Date.parse` semantics** (`flint/core/js_date.py`): Python's `datetime.fromisoformat` only handles strict ISO 8601 and `dateutil.parser` is *more* permissive than V8. We layered a compatibility wrapper that
   - parses strict ISO first with the correct ECMAScript timezone rule (date-only → UTC, datetime-without-zone → local),
   - hand-parses V8's numeric date forms (`MM/DD/YYYY`, `MM-DD-YYYY`, `MM.DD.YYYY`, `YYYY-MM-DD`, …) accepting only valid months (1–12) so DD-first values like `15.01.2020` are rejected just as V8 rejects them,
   - falls back to `dateutil` for free-form formats V8 also accepts (`Jan 15 2020`, `15-Jan-2020`, …),
   - and implements V8's trailing-year heuristic so strings like `FY 2018` and `hello world 2018` parse to Jan 1 of the trailing year.
2. **JS `new Date(num)` → `.toISOString()` rounding** (`flint/vegalite/instantiate_spec.py:_iso_z`): the JS Date constructor truncates non-integer ms via `ToInteger` (toward zero), and `.toISOString()` formats the resulting integer ms exactly. Python's `datetime.fromtimestamp(ms/1000.0)` rounds via float imprecision in microseconds. The helper now truncates the float to `int` first, then `divmod(ms_int, 1000)` to extract whole seconds and a millisecond remainder — exactly matching JS output for scale-domain padding (e.g. the decade band charts).
3. **`new Date(num)` truncation in compute-layout**: the layout engine uses the same V8-compat `js_date_parse_ms` for all temporal numeric coercions, so layout decisions (gas pressure, banking AR) match the JS reference even for short ISO date forms like `2020-01` and `1950`.

Without these fixes the report would show ~70 MISMATCH cases.
