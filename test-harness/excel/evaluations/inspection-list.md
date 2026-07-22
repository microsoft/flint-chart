# Excel backend inspection list

This is the case-by-case visual audit for the native Excel backend. Each row compares the Office.js PNG with Flint's canonical rendering: Vega-Lite where available, otherwise the chart's ECharts implementation.

Status:

- `PENDING`: not yet visually inspected.
- `PASS`: rendered and visually acceptable in Excel's native design language.
- `FIXED`: a mismatch was repaired and the output passed a second visual inspection.
- `FAIL`: defect reproduced; repair is in progress.
- `SKIP`: unsupported by native Office.js charts, or still unresolved after 10 focused repair attempts; the blocker is recorded.

A transport success alone is not a pass. Inspection covers field roles, orientation, grouping/stacking, aggregation, category order, labels, axes, legend, cardinality, and whether the Excel-native construction preserves the same reading as the Vega-Lite reference.

## Progress

| Chart type | Cases | Inspected | Passed/fixed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bar Chart | 19 | 19 | 16 | 0 | 3 |
| Grouped Bar Chart | 15 | 15 | 12 | 0 | 3 |
| Stacked Bar Chart | 11 | 11 | 9 | 0 | 2 |
| Line Chart | 18 | 18 | 13 | 0 | 5 |
| Area Chart | 12 | 12 | 12 | 0 | 0 |
| Scatter Plot | 26 | 26 | 12 | 0 | 14 |
| Pie Chart | 4 | 4 | 4 | 0 | 0 |
| Donut Chart | 4 | 4 | 4 | 0 | 0 |
| Histogram | 3 | 3 | 3 | 0 | 0 |
| Boxplot | 10 | 10 | 3 | 0 | 7 |
| Heatmap | 9 | 9 | 0 | 0 | 9 |
| Radar Chart | 6 | 6 | 6 | 0 | 0 |
| Waterfall Chart | 5 | 5 | 2 | 0 | 3 |
| Funnel Chart | 3 | 3 | 3 | 0 | 0 |
| Treemap | 3 | 3 | 3 | 0 | 0 |
| Sunburst Chart | 3 | 3 | 3 | 0 | 0 |
| Connected Scatter Plot | 8 | 8 | 7 | 0 | 1 |
| **Total** | **159** | **159** | **112** | **0** | **47** |

## Candlestick Chart (dedicated audit)

These cases were rendered after the main catalog audit and do not change the
progress totals above. Both use native `StockOHLC` through `sheet.charts.add`.
Configured VLM review was skipped because no workspace `.env` provided a VLM
endpoint and credential; the generated side-by-side images were inspected
directly.

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| basic-30-day | FIXED | 2 | Native `A1:E31` Date/Open/High/Low/Close range preserves all bodies, wicks, chronology, and the price trajectory. Excel serial dates render as a true date axis. A focused Low-to-High value scale removed native zero anchoring. |
| advanced-90-day-dense | FIXED | 3 | Native `A1:E91` preserves all 90 OHLC rows and the canonical trend. UTC fixture generation removed a DST duplicate; native tick spacing keeps the dense date axis readable, and the focused price scale prevents vertical compression. |

Artifacts and the reproducible runner are under
`test-harness/excel/evaluations/out/candlestick-audit` and
`test-harness/excel/evaluations/candlestick-audit.mjs`.

## Bar Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card5 | PASS | 1 | Five-category vertical bar preserves category order and values. |
| 01-card20 | PASS | 1 | Twenty nominal categories remain readable in the expanded native layout. |
| 02-card20 | PASS | 1 | Alternate 20-category value sequence preserves all bars and labels. |
| 03-card100 | PASS | 1 | Dense 100-category column chart preserves cardinality and value pattern with native sparse labeling. |
| 04-card5 | PASS | 1 | Three-series stacked columns preserve category totals and segment composition. |
| 05-card5 | PASS | 1 | Twenty-series stack preserves every segment and exposes a complete wrapped legend. |
| 06-card10 | PASS | 1 | Horizontal bars retain source category order, values, and zero baseline. |
| 07-card96 | FIXED | 4 | Reused Flint overflow ranking, retained its kept-value order, and emitted a density-aware 5 pt category-axis font; all 81 retained labels are visible. |
| 08-card29 | PASS | 1 | Horizontal three-segment stacks preserve category totals and composition. |
| 09-card24 | PASS | 1 | Temporal bars retain chronological order and all 24 values. |
| 10-card100 | PASS | 1 | Dense temporal bars preserve chronological progression and value pattern. |
| 11-card24 | PASS | 1 | Temporal three-series stacks preserve dates, totals, and segment identities. |
| 12-card18 | PASS | 1 | Horizontal temporal bars preserve the continuous-time ordering in native category form. |
| 13-card53 | PASS | 1 | Horizontal temporal stacks preserve date order, totals, and three segment identities. |
| 14-card20 | PASS | 1 | Quantitative X treated as ordered categories preserves all 20 positions and values. |
| 15-card30 | PASS | 1 | Transposed quantitative categories preserve the 30-position sequence and values. |
| 16-card5 | SKIP | 1 | No quantitative measure axis; the former occupancy matrix required a worksheet heatmap rather than a native chart. |
| 17-card25 | SKIP | 1 | No quantitative measure axis; the former date/group occupancy matrix required worksheet rendering. |
| 18-card5 | SKIP | 1 | No quantitative measure axis; native Excel bars cannot encode category-by-end-date occupancy. |

## Grouped Bar Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card4 | PASS | 1 | Three native semantic series preserve all category/group/value tuples. |
| 01-card8 | PASS | 1 | Group-equals-category degenerates cleanly to one value per category. |
| 02-card90 | PASS | 1 | Dense three-series grouping preserves the retained categories, values, and complete legend. |
| 03-card6 | PASS | 1 | Ordered groups retain five light-to-dark native series and all values. |
| 04-card12 | FIXED | 3 | Temporal categories remain chronological; a balanced native gap clearly separates adjacent three-bar groups without isolating them. |
| 05-card5 | FIXED | 3 | Quantitative categories remain ordered; four bars stay adjacent within each group while a moderate gap separates groups. |
| 06-card24 | PASS | 1 | Horizontal grouped bars preserve category order, four series, and values. |
| 07-card30 | PASS | 1 | Horizontal temporal grouping preserves chronology, series identities, and values. |
| 08-card8 | SKIP | 0 | Continuous grouping is not a native clustered-bar series role. |
| 09-card5 | SKIP | 0 | Continuous grouping is not a native clustered-bar series role. |
| 10-card5 | SKIP | 0 | No quantitative measure axis for a native clustered bar chart. |
| 11-card5 | PASS | 1 | Group-equals-category degenerates to one semantic-colored bar per category; order and values match the reference. |
| 12-card6 | FIXED | 5 | Native clustered chart preserves all 14 region/channel values as four semantic series with null gaps and a complete Excel legend. |
| 13-card6 | FIXED | 3 | Native semantic series with null gaps preserve sparse channel identities, order, and values. |
| 14-card6 | FIXED | 3 | Alternate sparse ordering preserves all semantic series and values with the complete native legend. |

## Stacked Bar Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card4 | PASS | 1 | Three native series preserve segment values and category totals. |
| 01-card15 | PASS | 1 | Five-series stacks preserve all segment identities, values, and totals. |
| 02-card80 | PASS | 1 | Dense three-series stacks retain the kept categories and complete legend. |
| 03-card6 | PASS | 1 | Ordered stack groups preserve sequential colors, values, and totals. |
| 04-card5 | SKIP | 0 | Continuous color cannot be represented as native stacked-bar series. |
| 05-card10 | PASS | 1 | Temporal stacks remain chronological with three semantic series. |
| 06-card20 | PASS | 1 | Dense temporal four-series stacks preserve chronology and totals. |
| 07-card10 | PASS | 1 | Quantitative category stacks preserve ordered positions and three series. |
| 08-card23 | PASS | 1 | Horizontal three-series stacks preserve category order and totals. |
| 09-card43 | PASS | 1 | Horizontal temporal stacks preserve chronological order and segment composition. |
| 10-card5 | SKIP | 0 | No quantitative measure axis for a native stacked bar chart. |

## Line Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card30 | PASS | 1 | Native temporal line preserves the trajectory and chronological order. |
| 01-card50 | PASS | 1 | Four temporal series preserve their trajectories, identities, and legend. |
| 02-card100 | PASS | 1 | Eight temporal series preserve all trajectories and legend identities. |
| 03-card200 | PASS | 1 | Dense twenty-series temporal chart remains semantically complete in native Excel. |
| 04-card60 | PASS | 1 | Three temporal series preserve values, chronology, and identities. |
| 05-card30 | SKIP | 3 | Continuous color required a worksheet overlay; native Excel line series cannot encode it. |
| 06-card5 | PASS | 1 | Five ordinal stages preserve order and values in a native line. |
| 07-card12 | PASS | 1 | Four ordinal-stage series preserve trajectories and legend identities. |
| 08-card30 | PASS | 1 | Dense ordinal stages preserve order and the full trajectory. |
| 09-card5 | SKIP | 2 | Continuous color required worksheet markers; native Excel line series cannot encode it. |
| 10-card5 | SKIP | 2 | Categorical Y requires worksheet band geometry; native Excel line charts require quantitative Y. |
| 11-card12 | SKIP | 2 | Categorical Y cannot be represented by a native Excel line value axis. |
| 12-card30 | SKIP | 2 | Quantitative X with ordinal Y cannot be represented by a native Excel XY line chart. |
| 13-card30 | PASS | 1 | Native XY line preserves quantitative-X spacing, values, and trajectory. |
| 14-card50 | PASS | 1 | Three native XY series preserve quantitative-X trajectories and identities. |
| 15-card200 | PASS | 1 | Dense native XY series preserves all points and trajectory. |
| 16-card16 | PASS | 1 | Actual-to-forecast handoff remains continuous with solid and dashed native series. |
| 17-card13 | PASS | 1 | Three product trajectories preserve distinct actual/forecast dash handoffs. |

## Area Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card30 | PASS | 1 | Native temporal area preserves the trajectory, chronology, and zero baseline. |
| 01-card24 | PASS | 1 | Four stacked temporal areas preserve series composition and totals. |
| 02-card60 | PASS | 1 | Eight stacked temporal areas preserve composition, chronology, and legend identities. |
| 03-card120 | PASS | 1 | Dense fifteen-series area preserves all stacked contributions and total progression. |
| 04-card40 | PASS | 1 | Three stacked temporal series preserve shape, composition, and totals. |
| 05-card60 | PASS | 1 | Alternate three-series temporal stack preserves all trajectories and totals. |
| 06-card5 | PASS | 1 | Five ordinal stages preserve order and area values. |
| 07-card12 | PASS | 1 | Four ordinal-stage areas preserve stack composition and totals. |
| 08-card30 | PASS | 1 | Dense ordinal stages preserve order and full area trajectory. |
| 09-card30 | FIXED | 2 | Resampled quantitative X onto a uniform native-Area grid and reduced the category axis to exact domain quartiles. |
| 10-card50 | FIXED | 3 | Uniform numeric resampling preserves three stacked series while replacing dense inferred labels with `0, 25, 50, 75, 100`. |
| 11-card200 | FIXED | 2 | Dense 200-point Area now preserves continuous-X spacing and readable quartile labels through bounded interpolation. |

## Scatter Plot

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card20 | PASS | 1 | Native Scatter preserves all quantitative X/Y positions. |
| 01-card20 | PASS | 1 | Three discrete segment series preserve positions and identities. |
| 02-card20 | SKIP | 1 | Quantitative color was dropped by the native chart; Office.js Scatter has no continuous color scale. |
| 03-card30 | SKIP | 1 | Temporal color became one series per timestamp; Office.js Scatter has no continuous color scale. |
| 04-card47 | PASS | 4 | Native Bubble preserves all positions and quantitative size ordering. |
| 05-card20 | PASS | 4 | Native Bubble preserves positions and four ordinal size levels. |
| 06-card15 | FIXED | 4 | Native Bubble preserves all 15 X/Y positions, three segment series, and quantitative size ordering without worksheet shapes. |
| 07-card30 | SKIP | 1 | Native Bubble preserves size but cannot also encode the continuous color scale. |
| 08-card20 | PASS | 5 | Twenty discrete Bubble series preserve positions, relative sizes, identities, and native legend entries. |
| 09-card91 | PASS | 1 | Native Scatter preserves the full 91-point distribution. |
| 10-card395 | PASS | 1 | Dense native Scatter preserves the full distribution without visible loss. |
| 11-card182 | PASS | 1 | Twenty discrete series preserve positions, colors, and legend identities. |
| 12-card96 | PASS | 1 | High-cardinality discrete series preserve positions and identity assignment in the expanded native legend. |
| 13-card10 | FIXED | 5 | Current native rerender applies focused X `20–100` and Y `0–100` bounds, removing the stale automatic `-20–120` margins while preserving positions and size ordering. |
| 14-card187 | FIXED | 5 | Current native rerender applies focused `0–100` bounds on both axes and preserves all positions and relative bubble sizes without worksheet shapes. |
| 15-card5 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 16-card5 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 17-card2 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 18-card60 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 19-card24 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 20-card23 | SKIP | 3 | Categorical Y required worksheet geometry; native Excel Bubble requires quantitative X and Y. |
| 21-card59 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 22-card5 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 23-card4 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 24-card15 | SKIP | 0 | Native Excel Scatter requires quantitative X and Y axes. |
| 25-card40 | SKIP | 0 | Office.js native charts do not expose Flint's shape encoding. |

## Pie Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card0 | PASS | 1 | Native Pie preserves all four category proportions and identities. |
| 01-card0 | PASS | 1 | Ten-category Pie preserves proportions and legend identities. |
| 02-card0 | PASS | 1 | Twenty-category Pie remains complete with readable native legend entries. |
| 03-card0 | PASS | 1 | Dominant and tiny slices preserve their strong proportional contrast. |

## Donut Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card0 | PASS | 1 | Native Doughnut preserves all four category proportions, identities, and the annular reading. |
| 01-card0 | PASS | 1 | Ten-category Doughnut preserves proportions and complete native legend identities. |
| 02-card0 | PASS | 1 | Twenty-category Doughnut remains complete with readable native legend entries. |
| 03-card0 | PASS | 1 | Dominant and tiny slices preserve their strong proportional contrast in the native ring. |

## Histogram

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card49 | PASS | 1 | Native columns preserve all bin boundaries and record counts. |
| 01-card42 | PASS | 1 | Stacked native columns preserve gender contributions and total counts per bin. |
| 02-card997 | PASS | 1 | Dense histogram preserves all ten bins and their count distribution. |

## Boxplot

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card5 | PASS | 1 | Five native boxes preserve all 150 raw observations, category order, medians, inclusive quartiles, and whiskers. |
| 01-card5 | PASS | 1 | Quantitative rank values are retained as five category labels with their complete score distributions. |
| 02-card12 | PASS | 1 | Twelve native boxes preserve all 600 salary observations and remain readable at the expanded width. |
| 03-card4 | SKIP | 1 | Flattened pair labels emit all eight boxes and separator gaps, but lose subgroup legend/color identity and native hierarchy; indexed point fills leave boxes uniform. |
| 04-card6 | SKIP | 1 | Four-subgroup distributions have the same native pooling/inversion blocker; multi-level headers become concatenated series names, not grouped category labels. |
| 05-card8 | SKIP | 1 | Five-subgroup distributions have the same native blocker; no one-chart range preserves both category boundaries and subgroup identity. |
| 06-card6 | SKIP | 1 | Redundant color still cannot be mapped to reliable native per-category coloring without changing the BoxWhisker range reading. |
| 07-card6 | SKIP | 1 | Nested color groups remain rejected: pair-per-column ranges create series of single-value ticks instead of one distribution per occupied pair. |
| 08-card6 | SKIP | 1 | Sparse 6x5: flattened labels emit exactly fourteen occupied boxes with gaps but no subgroup identity/hierarchy; point fills have no visible effect and full null padding exposes thirty identities. |
| 09-card6 | SKIP | 1 | Alternate nested groups share the proven native limitation and remain rejected rather than flattened or pooled. |

The seven production gallery cases remain skipped, so the 159-case audit totals
are unchanged.

## Heatmap

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card5 | SKIP | 2 | Office.js has no native Heatmap chart type; worksheet conditional formatting is outside the backend contract. |
| 01-card10 | SKIP | 1 | Office.js has no native Heatmap chart type. |
| 02-card50 | SKIP | 1 | Office.js has no native Heatmap chart type. |
| 03-card12 | SKIP | 1 | Office.js has no native Heatmap chart type. |
| 04-card80 | SKIP | 2 | Office.js has no native Heatmap chart type. |
| 05-card5 | SKIP | 1 | Office.js has no native Heatmap chart type. |
| 06-card60 | SKIP | 2 | Office.js has no native Heatmap chart type. |
| 07-card80 | SKIP | 1 | Office.js has no native Heatmap chart type. |
| 08-card5 | SKIP | 1 | Office.js has no native Heatmap chart type. |

## Radar Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card5 | FIXED | 2 | Replaced opaque `RadarFilled` with native `RadarMarkers`; the single-series profile and vertices remain clear. |
| 01-card6 | FIXED | 2 | Native outline series preserve both team profiles without the later series hiding the earlier polygon. |
| 02-card5 | PASS | 1 | Three native marker series preserve all product profiles, intersections, and legend identities. |
| 04-card5 | FIXED | 2 | Native outline series preserve both product profiles and keep all long metric labels visible. |
| 05-card8 | FIXED | 2 | Eight-axis outlines preserve both contrasting KPI profiles without solid-fill occlusion. |
| 06-card12 | FIXED | 2 | Twelve-axis outlines keep all three dense series distinguishable and retain complete labels and legend identities. |

## Waterfall Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card6 | SKIP | 1 | The income-statement sequence requires a final total; Office.js does not expose Waterfall total-point semantics. |
| 01-card7 | SKIP | 1 | Explicit start/delta/end roles require a non-initial total point, which Office.js cannot mark. |
| 02-card7 | PASS | 1 | Native Waterfall preserves department order, positive and negative variances, cumulative levels, value labels, and connector lines. |
| 03-card14 | SKIP | 1 | The opening-to-closing monthly flow requires a closing total point, which Office.js cannot mark. |
| 04-card4 | PASS | 1 | Native Waterfall preserves quarterly order, signed changes, cumulative levels, value labels, and connector lines. |

## Funnel Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card5 | PASS | 1 | Native Funnel preserves the descending sales-pipeline stage order, values, labels, and relative widths. |
| 01-card5 | PASS | 1 | Pre-sorted ascending values produce the intended inverted recruitment funnel with all stages and values preserved. |
| 02-card8 | PASS | 1 | Eight native stages remain legible and preserve the full marketing sequence and relative widths. |

Funnel now explicitly emits centered white 11-point value labels over a single
Office blue series fill. The existing real-Excel cases already demonstrate that
this placement remains readable on both wide and narrow stages; a refreshed
render is pending taskpane availability to verify the explicit font properties.

## Pyramid Chart (audit pending)

The compiler emits Flint's two-group population pyramid as a native 2D
`BarStacked` chart with one mirrored series, one positive series, symmetric
numeric bounds, absolute-value tick labels, and stable blue/red group colors.
Seven valid gallery fixtures and one intentional negative-value rejection case
are generated under `evaluations/inputs/pyramid-chart`. Compiler, type, build, and
Office.js generator tests pass. Real-Excel visual qualification remains pending
because the macOS add-in taskpane did not resume polling during this audit run.

## Treemap

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card0 | PASS | 1 | Flat native Treemap preserves all sector labels and market-cap area relationships with Excel-native packing. |
| 01-card0 | FIXED | 2 | Hierarchy columns now count as category levels rather than series; Region parents, Country leaves, and revenue areas all render natively. |
| 02-card0 | PASS | 1 | Fifteen native leaves preserve labels and relative areas without crowding failures. |

## Sunburst Chart

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card0 | PASS | 1 | Flat native Sunburst preserves every budget category and proportional allocation. |
| 01-card0 | PASS | 1 | Department parents and Team leaves occupy the correct two native rings with preserved values and labels. |
| 02-card0 | PASS | 1 | Four continent parents and sixteen country leaves retain hierarchy, values, and readable ring geometry. |

## Connected Scatter Plot

| Case | Status | Attempts | Finding / fix |
| --- | --- | ---: | --- |
| 00-card9 | PASS | 1 | Native XY lines preserve the ten-year non-monotonic unemployment/inflation trajectory in explicit Year order. |
| 01-card21 | PASS | 1 | Three native color series preserve country identities, all points, and independent ordered trajectories. |
| 02-card12 | PASS | 1 | ISO-date ordering preserves the complete monthly price/volume trajectory instead of sorting by X. |
| 03-card12 | PASS | 1 | The defining self-crossing figure-eight follows Step order and retains its central crossing. |
| 04-card15 | PASS | 1 | Two experiment series preserve numeric Step order, values, markers, and legend identities. |
| 05-card4 | PASS | 1 | The minimal four-point trajectory preserves its explicit non-monotonic sequence. |
| 06-card35 | PASS | 1 | The dense 35-point spiral preserves every marker and the complete inward path. |
| 07-card24 | SKIP | 0 | Native Excel can render multiple color series, but Flint's unlegended detail trajectory role is intentionally rejected rather than promoted to a visible legend. |

## Audit notes

- Excel-native styling is allowed to differ from Vega-Lite palettes, but semantic roles and the visual reading must agree.
- Every successful output must be created by `sheet.charts.add(...)` and captured by `chart.getImage()`; ranges, shapes, and composite images are not backend output.
- Native Bubble charts replace the former worksheet point composites. The current Scatter rerender confirms explicit focused axis bounds are applied in real Excel.
- Native BoxWhisker consumes Flint's raw category/value observations and computes inclusive quartiles in Excel. Color-grouped subgroup boxes remain explicitly unsupported pending a faithful native range mapping.
- Native Waterfall is supported for delta sequences and an initial total. Office.js does not expose Excel's “Set as Total” point command, so later/final totals are rejected.
- Native Doughnut preserves part-to-whole semantics and applies Flint's inner radius through `ChartSeries.doughnutHoleSize`.
- Native Radar normalizes each metric by its Flint-compatible nice maximum because Excel exposes one shared radial scale. The category labels retain those maxima so the resulting polygon preserves Flint's per-metric geometry without hiding the original scale. Excel's UI and OOXML can store transparent series fills, but the direct Office.js `ChartFill` API exposes only solid-color operations. Flint therefore renders filled Radar requests as `RadarMarkers` to prevent series occlusion. A proof workbook with DrawingML `<a:alpha>` confirmed the native capability; importing generated OOXML worksheets is deferred because it would be a separate rendering path from the current `charts.add()` architecture.
- Native Funnel, Treemap, and Sunburst use Flint's ECharts implementations as audit references because those chart identities have no Vega-Lite template. Native geometry, packing, and palette may differ while order, hierarchy, labels, and value/area readings must agree.
- Native Connected Scatter sorts each trajectory by its explicit order field before binding `XYScatterLines`; sorting by X would corrupt loops and backtracking paths. Discrete color is supported as native series, while unlegended detail remains an explicit gap.
- Native Pareto is not supported. The first bounded `Pareto` probe caused Excel for Mac to exit before Office.js returned a PNG or catchable error. Its executable probe and renderer aliases were removed; the server and taskpane retain only a pre-render quarantine for stale or external jobs.
- Bullet remains deferred after a bounded Office.js probe: a faithful target tick needs a mixed bar/scatter chart with secondary-axis alignment and custom marker geometry, which is not a modest extension of the current one-family native renderer.
- Dynamic-layout audit: six real Excel charts confirm that the host applies Flint's optimized dimensions within a 320×220 to 1600×900 render envelope. All tested rows survive; Bar sizing changes regime between 24 and 80 categories rather than growing monotonically, while the tested Line date/series matrix grows steadily.
- Facet audit: production `assembleExcel` rejects `column` and `row` centrally. An experimental 20-chart Office.js composition successfully reproduced column, row, 2×2, and wrapped 5×2 grids after imposing shared global numeric scales. Faceting therefore remains a future worksheet-level multi-chart artifact, not one native chart.
- Any row still failing after 10 focused repair attempts becomes `SKIP` with its blocker recorded here.
