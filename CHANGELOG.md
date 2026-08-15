# Changelog

Starting with version 0.2.1, all notable changes to `flint-chart` and
`flint-chart-mcp` are documented in this file. The two npm packages are
versioned and released together, so each release entry covers both packages.
Versions 0.2.1 and 0.2.2 were development milestones and were not published to
npm; 0.3.0 resumed public releases after 0.2.0.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- ECharts categorical legends (and their title graphics) are pinned with
  `legend.right` instead of a design-canvas `left` pixel. Hosts that size the
  container independently of `_width` and call `chart.resize()` keep the
  reserved gutter instead of overlapping the plot or clipping the legend
  ([#98](https://github.com/microsoft/flint-chart/issues/98)).
- Visible units now require an explicit `unit` in the field's semantic
  annotation. Conventional compact units may accompany values, while lexical
  units such as `years` are stated once as part of the field title. Bar Tables
  also no longer repeat their value column as annotations on the bars.
- A raw sum-stacked chart whose total lands exactly on a clean axis tick now
  keeps that edge flush instead of adding an empty interval above it, including
  machine-scale residue from calculated shares. Totals meaningfully beyond the
  clean endpoint still advance to the next tick; the rule is derived from the
  plotted stack and does not special-case percentages or 100.
- Series-end labels now use a bounded screen-space packing pass when endpoints
  form one readable column. Small adjustments keep labels attached by proximity;
  crowded or horizontally staggered sets fall back together to the next legend
  placement instead of leaving a partial or overlapping direct-label system.

## [0.5.1] - 2026-08-13

### Added

- Theme support for the Plotly backend. `theme_spec` now realizes onto Plotly
  figures — surface, typography, axes, marks, series ink, legend, facet chrome,
  and data labels — reusing the same neutral grounding stage as Vega-Lite. Where
  Plotly cannot honor a decision it approximates and records what it did in
  `figure._theme.report`. `assemblePlotly` also renders `chart_spec.title` for
  the first time.
- A Vega-Lite **Calendar Heatmap** chart type: daily values on a Monday-first
  week grid, with a `cornerRadius` chart property and a canonical GitHub look
  through a quantile color scale.
- Per-house sparse band fitting through the new `layout.bandStepFit` field, so
  each preset states how far it will grow a bar toward its slot when a chart has
  few categories. All ten presets are calibrated from first-party sources.

### Changed

- An axis title that is still needed now lies flat at the head of its own ruler,
  beside the values it names and on whichever side those values sit, rather than
  being turned on its side. Where two rulers each carry a measure, both are
  named: one name cannot say which quantity is horizontal and which is vertical.
- A measure axis that draws a grid rounds its domain to the tick count the axis
  actually draws, so the plot's edge falls on a grid line instead of stopping
  short of one and leaving the outermost reading with nothing above it. Axes
  that draw no grid, and non-linear rulers whose ticks are decades rather than a
  count, are left alone. On a dot scale the rounding is applied to the data
  rather than to the domain the renderer has already opened by a dot's radius:
  rounding the padded domain turned a few pixels of clearance into a whole extra
  interval, and a score bounded 0 to 100 came out running -10 to 110.
- A measure axis that draws a grid but no ticks carries that grid a few pixels
  past the plot, in grid ink, so each line ends under its own number. Flush with
  the last mark — a histogram's final bar — the line led nowhere.
- A unit is stated once. Where the axis title already carries it, the ruler no
  longer repeats it down every tick.
- Economist axis labels and titles are calibrated against the 300x300 and
  400x300 canvases the library actually draws, and the house now lays its axis
  titles flat rather than turning them on their side.
- McKinsey declares the `deck` and `axisTitle` type roles it had left implicit
  and quiets `axisLabel`. Raising one role while leaving others to the global
  defaults had inverted the ranking: the tick labels were the second-largest
  text on the chart, above the subtitle and the axis title.
- Vega-Lite reserves the margins a chart will actually draw — value labels, tick
  gutters, the title block, and the legend — before fitting bands, so a wide
  house no longer sizes bands against room its own furniture will take.
- Long headlines are fitted rather than left to widen the graphic. A headline
  that only overhangs its block is left alone, one that overhangs further is set
  down a size, and only a headline that still does not fit is broken — over even
  lines, with the height taken out of the plot rather than added to the canvas.
- A long deck is fitted the same way, and was not before: Vega-Lite measures it
  as one unbroken run and grows the canvas to fit, so a deck alone took a 420px
  chart out past 1,200px even where the headline above it had been brought to
  heel. It is only ever broken, never set smaller — the deck is already the
  quietest line in the block.
- Both are measured against the whole graphic rather than the plot rectangle.
  The axis gutter beneath a title is the title's to use, and measuring without
  it broke a headline that had room to spare beside its row labels.
- Both now run when no house is named. Staying inside the size the caller asked
  for is a Flint concern rather than a house preference, and an un-themed chart
  was getting no fitting at all.
- Plotly line, bar, scatter, pie, rose, radar, slope, heatmap, ranged-dot, and
  KPI-card templates were reworked against a paired audit with themed Vega-Lite:
  point density, label wrapping, wedge totals, polar guides, facet chrome, and
  cropping all move toward parity.

### Fixed

- A house that omits its grid, its rule and its ticks does so because the value
  is printed on the mark — a consulting-deck bar. A scatter prints nothing, and
  the same house left its readings floating with no way to judge one against
  another. Where no mark prints its value and the ruler draws nothing, the quiet
  grid returns. A house may choose how a value is read; it may not leave no way
  to read one.
- A measure axis no longer surrenders the right margin to series-end labels that
  are never drawn. The placement was chosen off the house's ranked list whether
  or not there was a key to place, so a single-series line chart evicted its own
  ruler to the left and lost the house's opposite-seated axis on the plainest
  chart it draws.
- Series-end and band-end labels no longer reserve canvas margin the renderer
  has already reserved. They are ordinary text marks, and the default `pad`
  autosize already grows the canvas to the scene's bounds, so the estimate was
  counted twice — around 90px of dead margin per chart.
- A flat axis title no longer lands on the side its values are not. On a
  right-seated ruler it was laid at the plot's left edge, captioning the wrong
  column, and only the first of two rulers was ever laid flat.
- A flat axis title clears the topmost value rather than sitting on it.
- A closing rule drawn under a banded plot now runs the width of the bands
  rather than the width a continuous plot would have taken, so a house that
  draws one no longer stretches the canvas past the chart.
- Waterfall now declares its step axis as the band it is drawn on, so a temporal
  waterfall is sized per category instead of as a continuous run. Fixed in both
  the JavaScript and Python implementations.
- A house no longer prints a value label off a template's internal working
  column, which leaked computed values onto Vega-Lite waterfalls.
- Calendar heatmaps drop the plot frame, which had drawn a box around the days
  a part week does not have.
- Straight axis labels that cannot fit their band are no longer held flat by a
  house that prefers them straight.

## [0.5.0] - 2026-08-05

### Added

- Formal visual themes for Vega-Lite through the new top-level `theme_spec`
  field. Callers can select one of ten built-in presets, provide a custom
  `ThemeSpec`, or inherit a preset with `extends` and override selected fields.
  Nested objects merge while arrays and scalar values replace inherited values.
- The `pop` preset, a high-energy extension of Swiss with process colors,
  strong structure, and chart-aware grid and heatmap treatment.
- A semantic theme-grounding system that applies layout behavior, presentation
  rules, mark geometry, typography, color, labels, legends, axes, annotations,
  and chart furniture as one visual system across chart types and data shapes.
- Public theme APIs: `ThemeSpec`, `ThemePreset`, `THEME_PRESETS`,
  `listThemePresets()`, and `resolveThemeSpec()`.
- Theme discovery in the MCP server through `list_themes`, plus preset selection
  in the interactive MCP App.
- Bundled ThemeSpec authoring guidance through the `flint://theme-skill`
  resource and `author_flint_theme` prompt. Custom ThemeSpecs remain available
  in the MCP App while callers compare presets, without becoming global themes.
- A public visual-theme explorer with regular grid and screenshot-friendly
  scattered-poster layouts, a compact two-row banner composition, large
  chart/spec previews, a complete **Using themes** guide, and
  preset/custom/inherited live examples on the Flint project site.
- Theme Lab, an interactive editor for authoring a ThemeSpec and testing it
  against a diverse wall of charts, with built-in Signal Studio, Microsoft
  Fluent, and People's Daily examples.
- Complete English and Chinese localization for the public theme explorer,
  Theme Lab, navigation, and MCP theme-authoring guidance.

### Changed

- Vega-Lite assembly now grounds the selected theme before layout and realizes
  its decisions throughout compilation instead of applying a post-render style
  layer. Existing inputs without `theme_spec` retain Flint's default behavior.
- Vega-Lite logarithmic axes choose readable powers-of-ten or 1/2/5 tick and
  grid spacing from the transformed scale span and available pixels on either
  axis. Two-position line axes suppress asymmetric endpoint guides, while
  heatmaps use cell boundaries instead of redundant axis grids.

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

[Unreleased]: https://github.com/microsoft/flint-chart/compare/0.5.1...HEAD
[0.5.1]: https://github.com/microsoft/flint-chart/compare/0.5...0.5.1
[0.5.0]: https://github.com/microsoft/flint-chart/compare/0.4.0...0.5.0
[0.4.1]: https://github.com/microsoft/flint-chart/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/microsoft/flint-chart/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/microsoft/flint-chart/compare/88fbeb5ebf07f18a1cf661ebef71cc570b7425d6...0.3.0
[0.2.2]: https://github.com/microsoft/flint-chart/compare/0.2.1...6a9d4e4155e3d9e2bed3fa9adf5316914f791478
[0.2.1]: https://github.com/microsoft/flint-chart/compare/c8e20b052ad9ddad29ba3ecfc825948c424e5ba5...0.2.1