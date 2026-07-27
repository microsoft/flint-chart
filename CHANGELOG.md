# Changelog

Starting with version 0.2.1, all notable changes to `flint-chart` and
`flint-chart-mcp` are documented in this file. The two npm packages are
versioned and released together, so each release entry covers both packages.
Versions 0.2.1 and 0.2.2 were development milestones and were not published to
npm; 0.3.0 resumed public releases after 0.2.0.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-07-27

### Changed

- Introduced Flint's faceted flint-shard visual identity across the project
  README and website, including a public SVG favicon and a compact hero-title
  lockup.

## [0.4.0] - 2026-07-24

### Added

- Excel backend: 18 chart templates compile the same semantic Flint input into
  native, editable Office.js charts — Bar, Grouped/Stacked Bar, Pyramid, Line,
  Area, Scatter, Connected Scatter, Pie, Donut, Histogram, Boxplot,
  Candlestick, Waterfall, Radar, Funnel, Treemap, and Sunburst. The backend
  emits a rectangular data range plus native chart/axis/legend/series metadata,
  includes Office.js code generation and runtime helpers, and was visually
  audited across 117 cases with `test-harness/excel/`.
- Plotly backend: expanded from the four original acceptance templates (Bar,
  Line, Area, Scatter) to 33 chart types — grouped/stacked bar, pyramid,
  histogram, boxplot, violin, density, ECDF, strip plot, connected scatter,
  range area, streamgraph, slope, bump, waterfall, candlestick, heatmap,
  lollipop, bullet, Gantt, ranged dot plot, regression, pie, donut, radar,
  rose, KPI card, and the Plotly-native opportunity charts Funnel and Gauge —
  leaning on Plotly's own native trace types (`box`, `violin`, `candlestick`,
  `waterfall`, `heatmap`, `scatterpolar`, `barpolar`, `indicator`, `funnel`)
  wherever one exists.
- Plotly backend: closed the four remaining registry gaps and added the
  Plotly-native Density Contour statistical chart, now 38 chart types.
  - Map, Choropleth — native `scattergeo`/`choropleth` traces with Plotly's
    own built-in geo atlas (no TopoJSON fetch/join). Share the Vega-Lite
    Map/Choropleth's region-name/code gazetteer (`chart-types/geo.ts`, moved
    out of `vegalite/templates/` to be backend-shared), extended with USPS/
    ISO-alpha-3 code resolvers for Plotly's native `locations` binding.
  - Sparkline, Bar Table — composite, self-contained Plotly figures (their
    own multi-axis-pair grid + paper-anchored annotations) rather than the
    generic column/row facet combiner, which only supports one cartesian
    axis pair per panel. A new `ChartTemplateDef.selfManagesFacets` flag lets
    a template opt out of the assembler's generic facet-splitting pass even
    though it declares `x`/`y` channels.
- Plotly scatter/strip plots now use a native continuous colorscale +
  colorbar for quantitative/temporal `color` fields instead of grouping them
  like a categorical legend.
- `docs/reference-plotly.md` — generated chart reference for the Plotly
  backend (`npm run gen:reference`).
- `test-harness/plotly/` — a headless-Chromium render/audit harness for the
  Plotly backend (spec → PNG, contact sheets, VLM review script, and a
  per-chart-type inspection list), mirroring the Excel backend's visual audit
  harness.

### Fixed

- Plotly: a shared column/row facet-splitting pass ran for every template,
  including axis-less ones (Pie, Donut, Radar, Rose, Gauge, KPI Card, Funnel)
  that use the `column` channel for their own internal per-item grouping —
  this collapsed multi-item Gauge/KPI grids onto identical, fully-overlapping
  domains. Faceting is now gated on the template declaring `x`/`y` channels,
  mirroring the ECharts backend's own guard.
- Plotly Choropleth: Plotly's own built-in `'Blues'` colorscale runs
  dark→light as the value increases — the opposite of the light→dark
  sequential convention used everywhere else, which made the *highest*-value
  region read as the palest. Replaced with an explicit light→dark stop array.
- Plotly Bar Table (faceted): each facet cell's per-cell `xaxis{n}`/
  `yaxis{n}` pair needs an explicit `anchor` to each other — without it every
  cell's category tick labels rendered at the same horizontal position
  (overlapping across cells). Also fixed: long category names now truncate
  with an ellipsis instead of overflowing past the figure's own edge; a
  column-only facet with more panels than fit is now actually wrapped (using
  this template's own minimum panel-width estimate, not the shared layout
  engine's narrower default); sub-1 magnitude values no longer round away to
  "0"; a single-row table no longer collapses to an unreadably short figure.

## [0.3.0] - 2026-07-19

### Added

- Backend-neutral chart-type recommendations and chart transformations, including
  compatible chart-type transitions and data-preserving arrangement controls.
- Public transform and recommendation APIs for Vega-Lite, ECharts, and Chart.js.
- Dynamic MCP App controls that switch chart types, rearrange encodings, and edit
  chart properties in place without rewriting the authored Flint spec, plus PNG
  copy/download and reset actions.
- Gantt task-height, corner-radius, and interval-label controls.
- A Chinese-language website and translated documentation.

### Changed

- Improved recommendation quality and backend parity for area, bar, boxplot,
  Gantt, scatter, waterfall, and related chart families.
- Sparkline rows now always use independent Y scales, matching the chart's
  per-series comparison semantics. The obsolete `independentYAxis` option is no
  longer exposed for Sparklines.
- Vega-Lite axes and derived text marks now share semantic formatting logic, so
  currency and other formatted aggregate values retain their intended units.
- Sparse stacked areas and streamgraphs now interpolate interior gaps and extend
  the nearest measured edge value instead of dropping abruptly to zero;
  unstacked areas connect measured points without fabricating rows.

### Migration

- Sparkline no longer accepts a shared Y scale. Remove
  `chartProperties.independentYAxis` from Sparkline specs; every row now
  self-scales. Other faceted chart types continue to support the property.
- The grouped-chart `dodge` property no longer accepts `none`. Use `auto` to let
  redundant groups collapse to one glyph per band, or choose `local`/`global`.
- Vega-Lite Rose Chart no longer accepts `innerRadius`; use Pie Chart with an
  inner radius for a donut-style display.

### Fixed

- Corrected Sparkline row alignment and average-value formatting.
- Improved local dodge behavior for sparse grouped bars and boxplots across
  supported backends.

## [0.2.2] - 2026-07-15

### Added

- Grouped violin plots in Vega-Lite: a genuine colour sub-group now renders as a
  split violin for two groups and as a category × sub-group grid of independent
  violins for three or more, instead of an overlapping mirror.
- Local (compact) and global (aligned) dodge modes for grouped bar charts
  (Vega-Lite, ECharts, Chart.js) and boxplots (Vega-Lite, ECharts), selectable
  through the `dodge` chart property so sparse category × group data reads
  cleanly.

### Changed

- The `dodge` chart property now offers `auto`, `local`, and `global` only.
  One-per-band collapsing happens automatically when a colour/group is redundant
  with the axis, so the manual `none` option was removed.
- The Vega-Lite Rose Chart no longer exposes an inner-radius control; a rose has
  no donut hole (Chart.js and ECharts already omitted it).

### Fixed

- Vega-Lite Rose Chart "Sort slices" now reliably reorders the wedges and their
  legend by value.
- Chart.js Rose Chart alignment (Left / Center) now rotates the wedges; the
  rotation was previously set on an option Chart.js ignores for polar charts.

## [0.2.1] - 2026-07-13

### Added

- Exported backend-neutral banded-axis detection from `flint-chart/core`, so
  custom backends and host extensions can reuse Flint's axis semantics without
  depending on Vega-Lite implementation files.

### Changed

- Expanded the standalone and MCP-bundled authoring skill with Waterfall Type
  column and `totals` guidance.
- Updated generated backend references to list the accepted values for discrete
  chart properties.

### Fixed

- Normalized discrete chart property values across all backends: display labels
  are coerced to canonical values, invalid values fall back safely with a
  warning, and nullable option metadata no longer causes failures.
- Made ECharts and Chart.js Rose Chart radii proportional to the square root of
  values, so rendered wedge areas represent the data accurately.
- Treated only lowercase `start` and `end` Waterfall Type values as total
  anchors in Vega-Lite; other values now remain floating deltas colored by sign.

[Unreleased]: https://github.com/microsoft/flint-chart/compare/0.4.1...HEAD
[0.4.1]: https://github.com/microsoft/flint-chart/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/microsoft/flint-chart/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/microsoft/flint-chart/compare/88fbeb5ebf07f18a1cf661ebef71cc570b7425d6...0.3.0
[0.2.2]: https://github.com/microsoft/flint-chart/compare/0.2.1...6a9d4e4155e3d9e2bed3fa9adf5316914f791478
[0.2.1]: https://github.com/microsoft/flint-chart/compare/c8e20b052ad9ddad29ba3ecfc825948c424e5ba5...0.2.1