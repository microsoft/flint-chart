# Changelog

Starting with version 0.2.1, all notable changes to `flint-chart` and
`flint-chart-mcp` are documented in this file. The two npm packages are
versioned and released together, so each release entry covers both packages.
Versions 0.2.1 and 0.2.2 were development milestones and were not published to
npm; 0.3.0 is the next public release after 0.2.0.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/microsoft/flint-chart/compare/0.3.0...HEAD
[0.3.0]: https://github.com/microsoft/flint-chart/compare/88fbeb5ebf07f18a1cf661ebef71cc570b7425d6...0.3.0
[0.2.2]: https://github.com/microsoft/flint-chart/compare/0.2.1...6a9d4e4155e3d9e2bed3fa9adf5316914f791478
[0.2.1]: https://github.com/microsoft/flint-chart/compare/c8e20b052ad9ddad29ba3ecfc825948c424e5ba5...0.2.1