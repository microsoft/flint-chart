# Changelog

Starting with version 0.2.1, all notable changes to `flint-chart` and
`flint-chart-mcp` are documented in this file. The two npm packages are
versioned and released together, so each release entry covers both packages.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/microsoft/flint-chart/compare/0.2.2...HEAD
[0.2.2]: https://github.com/microsoft/flint-chart/compare/0.2.1...0.2.2
[0.2.1]: https://github.com/microsoft/flint-chart/compare/c8e20b052ad9ddad29ba3ecfc825948c424e5ba5...0.2.1