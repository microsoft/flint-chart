# Changelog

Starting with version 0.2.1, all notable changes to `flint-chart` and
`flint-chart-mcp` are documented in this file. The two npm packages are
versioned and released together, so each release entry covers both packages.
Versions 0.2.1 and 0.2.2 were development milestones and were not published to
npm; 0.3.0 resumed public releases after 0.2.0.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ECharts, Chart.js and Plotly lay out their frame with the layout's own rules, in each library's
  look: a headline and deck broken to full lines with no widow (set a size down where that fits one
  line), band labels wrapped, turned, thinned or cut by the shared band-label plan, axis gutters and
  names measured (a title longer than its axis on two lines), keys with long names on lines beside
  the plot or moved to the foot, many lines thinned, and a canvas fit that holds key names short,
  moves keys to the foot or lays the plot out smaller where the host would otherwise shrink the
  drawing past legibility. ECharts and Chart.js now draw `chart_spec.title` and `subtitle`. The
  verdict rides on the spec as `_canvasFit`. The dev site's *Backend layout* pages draw the
  Vega-Lite layout labs' cases in each backend.
- Themed Plotly charts draw the house's header (`planHeader`: tabs, rules) and source line
  (`planSource`), start the headline, key and source at the chart's left edge, stand the value
  axis on the right where the house does, title the key where the house titles keys, and give
  back foot room kept for names the house laid flat or an axis title it moved into the deck.
- Each backend states how its library draws the layout's furniture in a profile (`BackendProfile`:
  key entry geometry, row wrapping, axis label and title spacing), read off the library's defaults
  and source, and the shared estimators (`keyBlock`) measure with it. Plotly's keys, margins and
  facet grids are now measured as Plotly draws them: no fixed 64 px gutter, keys estimated as
  Plotly wraps them (a grid at the widest entry), axis titles taken away removed rather than left
  empty, a tall key of long names stood beside the plot where that fits the box, and facets with
  one shared title per axis, x labels only under each column's last panel and flat thinned times.
- Plotly bars over a run of dates (a temporal field on the band axis) stand on Plotly's date
  axis with its calendar ticks, flat and thinned, rather than one turned label a month. The
  backends' canvas fit scores a treatment by how far its host would shrink the drawing as well as
  by its flags, and may set the key's text a size smaller (`canvasTreatment.keyScale`, 10 px floor).
  Key names held short by the canvas fit are held to the same width in every backend, past each
  library's own symbol room (Plotly's key had left its names 70 px, so the treatment did nothing).
- A narrow chart's title (two bars under a long headline) is broken to the width its box allows,
  not the chart's own, and the drawing widens to hold it: the backends no longer stack a headline
  into many lines over a thin plot. Plotly measures a house's headline in the case it draws it
  (an upper-cased headline had run past the figure's edge).
- A Plotly key that a house sets in a row above or below the plot sets its names for the row (whole,
  or broken where that lets more share a row) rather than keeping names broken for a column beside
  the plot.
- Plotly scatter and line axes start and end on labelled ticks, as Vega-Lite's nice domains do (a
  range rounded out to its tick step, a step further where an edge bubble would be clipped), and a
  log axis over a few decades is labelled at 1·2·5 of each decade where those labels fit.
- A Plotly pie whose slice names run long beside its radius names its slices in a key beside it
  (long names on lines) and prints the shares inside, rather than standing the names outside and
  shrinking the pie to a small disc among them; a house's key on top stands beside a pie.
  A themed pie whose callouts would stand outside it is keyed too (in the house's row where it
  fits), so Plotly's automargin no longer moves the plot, and the header hung from it, after the
  frame placed them.
  Plotly pies and donuts take a `sliceNames` chart property (`auto`, `onSlices`, `key`), which a
  house may also set in `chartDefaults`, to keep the names on the slices or always set them in a key.
- A Plotly key in rows above or below the plot flows, each entry its own width, rather than standing
  as Plotly's grid at its widest entry, where one long name left one entry a row.
- Plotly facet panels are ticked from their own height (y) and width (x), the range rounded to the
  step; a house's tick count is no longer shared out over the grid, which had left a panel's y axis
  two labels (0, 20).
- Plotly facet panels tick their years by the width each panel is drawn at, with Vega-Lite's
  temporal rule: the finest calendar step (1, 2, 5, 10 … years) whose labels stand apart by half
  of each one's width and 0.6 em. Plotly's own `nticks` had left a wide panel two labels.
- Plotly keys in rows are measured as Plotly wraps its grouped rows (an entry steps on by its gap,
  its text box a little wider than its advance), so a key on top no longer runs its last row into
  the plot; a key at the foot stands under the x labels in room of its own rather than letting
  automargin take its height from the plot; a few px separate a title from a key hung under it; and
  a time axis's labels are measured as Plotly prints them (a second line for the year under days).
- Plotly draws a key to a size channel, which Plotly has none of: a few round values
  (`roundSample`, as many as the edge holds) as circles at the size the chart draws them, with the
  field's name, in a row under a key in rows or beside the plot under the colour key.
- Cartoon's dots are solid (`marks.point.opacity: 1`): stickers stack, the dark edge of one keeping
  the one beneath readable, in Vega-Lite as in Plotly, whose dots now take a house's outline.
- The backends' canvas fit may set the library's type a size down (`canvasTreatment.labelScale`,
  `titleScale`: Plotly 12 → 10 px ticks, 14 → 12 px axis titles, 17 → 14.5 px headline, never below
  10 / 13 px), alongside key names and key text; type is taken smaller only where the host then
  shrinks the drawing less by enough that the text reads at least as large on screen. A Plotly key
  is set at its ticks' size (12 px), not the axis titles' (14 px).
- Plotly sizes a bubble chart's points on one scale over every series, from zero, as Vega-Lite does
  (a house's size range had been applied to each series apart, so each series' largest bubble drew
  at the largest size), and draws them largest first, so small bubbles stay in sight.
- Plotly leaves off the line along the index axis where the value scale's floor is not zero and the
  house grids its values (`floating: 'omit'`), as Vega-Lite does: zero carries the base (no second
  baseline under a scatter that crosses zero). A banded axis of dates names its bands as a calendar
  does (`Jan` over `2025`, `Mar`, …), flat, every few bands where one will not hold a name, as
  ECharts and Chart.js already did, rather than one turned `2025-01` a band.
- ECharts binned colour scales break at round values (`roundBinEdges`), labelled as ranges; a
  continuous size or colour ramp beside the plot stands from the plot's top with its title
  centred over the bar.

### Changed

- A heatmap side over a whole run of months or quarters (every period from the first to the last,
  up to 50) is drawn as equal cells named by the calendar (`Jan` over `2025`, `Feb`, …) in
  Vega-Lite too, as ECharts and Plotly draw it. On a time scale its cells, one width each, stood
  at their months' starts, 28 to 31 days apart, with uneven gaps. The time scale stays one
  `xAxisType` / `yAxisType` choice away; a run with a gap, or of days, weeks or years, keeps it.
- **Breaking (MCP):** the server keeps nothing between calls, so it runs
  stateless. `show` takes the spec itself, as `chart` or `board`, and draws it;
  `validate_chart` and the new `validate_board` check a spec and return the
  same report without drawing. `create_chart`, `create_board`, `add_chart`,
  `update_chart`, `remove_chart`, `update_board` and the card-only
  `restore_board`, `set_board_theme` and `set_board_layout` are removed. To
  change what is on screen, the agent changes the spec and calls `show` again.
  The reader's theme, arrangement and panel edits stay on the card, and its
  context gives the fields (`theme_spec`, `grid`, `chart_spec`) that keep them in
  the next `show`. A card the host draws again without its result calls `show`
  with the spec it was given.

### Fixed

- An app no longer fails to build for want of a backend it does not draw with (#155):
  `flint-chart` now depends on every backend it draws with (`vega`, `vega-lite`, `vega-tooltip`,
  `echarts`, `chart.js`, `plotly.js-dist-min`), so `npm install flint-chart` is the whole install
  and `flint-chart/react` and `flint-chart/interactive` draw on any backend as installed. React
  stays an optional peer; the unused `plotly.js` peer is dropped. Plotly is held to `^2.35.0`, the
  line Flint's Plotly layout is tested against.
  - For an app bundled into one file (no code splitting), new entries `flint-chart/react/<backend>`
    and `flint-chart/interactive/<backend>` (`vegalite`, `echarts`, `chartjs`, `plotly`) export
    the same names but reach only that backend, so the file carries one library. `<FlintChart>`
    and `mountChart` take a `renderers` map of factories from `flint-chart/<backend>/interactive`
    to draw another backend from such an entry. The MCP view imports the Vega-Lite entries in
    place of stubbing the other backends at build time.
- A percentage field's storage is no longer guessed from the values where the annotation states
  it: the new `percentScale` (`"fraction"` | `"percent"`) annotation is used as stated, and an
  `intrinsicDomain` within ±1 (fractions) or reaching 100 (percent points) settles it too. A growth
  rate stored as fractions mostly past 1 (2.4 for 240%) was printed as "2.4%", and the same column
  was formatted two ways depending on which rows a query returned. Axes, tooltips, value domains
  and KPI cards all read the stated scale (#154).

## [1.0.1] - 2026-10-21

Released together for `flint-chart`, `flint-chart-mcp`, and the Copilot Canvas plugin.

### Fixed

- Plotly: a Line or Area Chart's `chartProperties.interpolate` now outranks the theme's line
  curve, an explicit `linear` included. A theme such as Cartoon (`monotone`) or De Stijl (`step`)
  only supplies a curve when the chart asks for none (#149).
- MCP: a small chart whose rows were passed inline also rides in `show`'s `structuredContent`, so
  a card that VS Code's Agent Host draws again (it drops `_meta`) can still render it. Rows read
  from a local `data.url` file never do (microsoft/vscode#343243).
- The npm publish workflow waits up to 20 minutes for a new version and asks the registry
  directly, instead of a cached answer.

## [1.0.0] - 2026-10-19

Released together for `flint-chart`, `flint-chart-mcp`, and the Copilot Canvas plugin.

### Added

- `validateChart(input, backend, { updates })` checks ChartUpdates against the
  chart in the same pass: `result.updates` gives each op as applied or why not,
  each op that will not apply is an `update_not_applied` warning, and a
  malformed list is an `invalid_updates` error. It replaces the shape-only
  `validateChartUpdates`. The MCP `validate_chart` and `create_chart_view`
  return the same report the chart view later sends as its context: the chart,
  its interactions, and one ✓/✗ line per update op. `create_chart_view` hands
  the view its payload in `_meta.flint` instead of `structuredContent`, so the
  model reads the report rather than the data rows.

- `filter-controls` (`filterControls`), a filter-only interaction preset. It
  draws one row of muted controls per field under the chart (a segmented bar
  to pick one of a few values, pills to pick several, a searchable dropdown for
  many, a slider to pick one year or other ordered value, a range slider, or a
  switch), and filters the rows (or mutes them with
  `mode: "highlight"`); each filter re-lays the chart out for the rows left.
  Values read as the chart writes them, from the field's semantic type
  (`Aug 2015`, `$1.20`, `2007`).
  `placement` is `auto` or `bottom` (under the chart) or `top`; under 280px
  wide each label sits above its control. With `render: false` the host draws its own
  controls and drives the preset through `dispatch`. The active filters appear
  as `ChartState.filters`. Without `fields`, the preset skips fields that
  `legend-toggle`, `navigate`, or `brush-zoom` already filter. A filtered chart
  keeps its colors per category.
- A reproducible Copilot Canvas plugin build (`npm run build:copilot-plugin`)
  bundles the current chart UI and authoring skill, aligns the plugin version
  with the npm packages, and pins the MCP server to that release.
- `flint-interaction-author`, a third agent skill beside the chart and theme
  skills. It maps a named gesture or an intent (explore, compare, analyse) to
  interaction presets and returns one valid `interaction_spec`, at authoring
  time or after the chart exists. The MCP server serves it as
  `flint://interaction-skill` and the prompt `author_flint_interaction`. The
  chart-author skill keeps a short `interaction_spec` section and points to it.
  `npm run sync:skills` copies the three skills into the MCP assets.
- Viewport changes a gesture commits animate by default. A `navigate` or
  `brush-zoom` reset flies home, and a brush zoom tweens into the brushed
  region, over 400 ms on every Vega-Lite chart, not only on projected maps.
  `resetTransition: { duration: 0 }` (and `transition` on `brush-zoom`) jumps
  instead. Panning and wheel zooming still follow the pointer.
- `interaction_spec`, a third document beside `chart_spec` and `theme_spec`: a
  list of interaction presets by `type`, each with its `options`.
  `buildInteractiveChart()`, the MCP chart view, and the site editor mount from
  it. Guide: `docs/interaction-spec.md`.
- Admission per chart type. Each Vega-Lite template declares its capabilities
  in `ChartTemplateDef.interactionSupport`; each preset declares its needs in
  `INTERACTION_PRESET_REQUIREMENTS`. A spec entry the chart cannot honour is
  dropped with an `unsupported_interaction` warning; a code definition throws.
  `validateChart()` and the MCP `validate_chart` report the same warnings;
  `list_chart_types` and the Vega-Lite reference list the supported presets.
  One trigger, one owner: `triggersOf(definition)` lists the triggers a
  definition takes (the navigation, region drag, and element drag slots, the
  plot drag, the double-click, and the legend, axis, and retained-focus mark
  clicks); when two admitted definitions share one, the one that can give it
  up and keep the rest does so with an `info` warning (`click-highlight`
  through `withoutAffordances`), otherwise the later entry drops with a
  `conflicting_interactions` warning, a spec entry always yields to code, and
  two code definitions throw. Before, only three pairs were checked, and two
  code definitions on one slot were kept with the runtime using the first.
- Chart validation is now part of the core package. `validateChart(input,
  backend)` returns `{ valid, warnings, errors, computedSize }` without
  throwing, alongside `validateChartInput`, `validateSemanticTypes`,
  `assembleForBackend`, and `stripPrivateKeys`, from `flint-chart` and the new
  `flint-chart/validate` subpath. Hosts that let an agent author chart inputs
  outside MCP get the same per-problem feedback the `validate_chart` tool
  provides; `flint-chart-mcp` now consumes this implementation. Unregistered
  `semantic_types` labels surface as `unknown_semantic_type` warnings, and
  `isRegistered` / `getRegisteredTypes` are exported from `flint-chart/core`
  ([#104](https://github.com/microsoft/flint-chart/issues/104)).
- `<FlintChart>` from the new `flint-chart/react` subpath (React is an
  optional peer dependency). `spec` takes the `ChartAssemblyInput` with its
  `interaction_spec`; `interactions` takes preset factories, as an array added
  to the spec's interactions or a function `(fromSpec) => definitions` that
  returns the full list. A chart with no interactions renders static and
  mounts no interaction runtime; pass `updates` (even `[]`) to drive it from
  the host. The `updates` prop is diffed by id, and a dropped id is cleared only if the host
  wrote it last. `width`, `height`, and `fit` (`shrink`, `contain`, `none`)
  set the box, which scales the chart; the layout size stays in the spec. A
  ref exposes `applyUpdate`, `clearUpdate`, `dispatch`, `getState`, and
  `refresh`; `fallback` shows until the chart mounts.
- `mountChart()`, the new name of `buildInteractiveChart()`, which remains as
  an alias. Its `semanticUpdates` option (default `true`) keeps host updates
  on a chart without interactions; `false` skips the interaction runtime. `surface.onInteraction()` hears the raw gesture records.
- `renderSvg(input, { backend })` from the new `flint-chart/render` subpath
  returns a static SVG string for Vega-Lite or ECharts without a DOM.
- `selectionUpdate()` and `viewportUpdate()` build the updates a selection or
  navigation preset writes, for hosts that set the same state.
- `ChartState.annotations` lists reader-made annotations, so a host can
  persist them.
- `strokeDash` on the ECharts Line Chart, as on the Vega-Lite, Plotly, and
  Excel line charts. A colour value draws one line per dash value, all in its
  palette colour, and its one legend entry toggles them all; the dash styles
  (solid, dashed, dotted, dash-dot) follow the dash values' first appearance
  in the data, so facet panels agree. The legend lists the colour values, then
  a gray line sample per dash value, and the axis tooltip names each line by
  both (`C1 · Limit: 8`). Without colour the lines share one colour under a
  legend titled by the dash field; with a continuous colour the gray line
  splits by dash value.

### Changed

- **Breaking (MCP):** charts and boards are built off screen and drawn by one
  tool. `create_chart` and `create_board` return a report and an id;
  `update_chart`, `add_chart`, `remove_chart` and `update_board` change it by
  `id` (was `board_id`); `show` opens the one card a turn with the current
  version, and earlier cards keep the version they showed. `create_chart_view`,
  `restore_chart_view`, `show_board` and `read_board` are removed, and the UI
  resource is `ui://flint-chart/view.html`. Charts now live in server memory
  between calls, as boards did, so a scaled HTTP deployment needs one instance
  or sticky sessions.

- `onChange` fires only when the chart's state changes, not after every
  render. A `ChartChange` now carries `source` (`reader` for a gesture, `host`
  for `applyUpdate`, `clearUpdate`, or `setUpdates`), `changed` (the facets
  that moved), and `previous`. A gesture that changes nothing, such as an
  inspected index, reaches the host only through `flint-interaction`.
- Interactive Vega-Lite mounts no longer turn tooltips on. Tooltips follow the
  spec's `options.addTooltips` (default `false`), as in static rendering.
- A code definition with the id of an `interaction_spec` entry now replaces
  that entry with an `interaction_overridden` info warning. Before, the mount
  threw.
- A non-Vega-Lite backend asked for interactions now renders the chart static
  with an `interactions_ignored` warning. Before, the mount threw when code
  passed interactions.
- `CanvasInteractionDef.affordances` is now a required map from the kind of
  hit (`mark`, `legend-item`, `axis-label`, `plot`) to its cursor and hover,
  and it is the only dispatch gate: the runtime sends a hit to an interaction
  only when the interaction affords its kind, on every path including
  keyboard, context, long press, and double-click. The flags
  `claimsLegendActivation` and `claimsAxisActivation` are gone; a key says the
  same thing. `clickHighlight()` gains `withoutAffordances(drop)`, a copy that
  affords fewer targets. A definition built by hand must declare
  `affordances`; `affordsTarget(interaction, target)` reads the gate. A long
  press, a right-click, or a double-click on a legend item no longer reaches a
  preset that affords marks only.

### Fixed

- A legend click with both `click-highlight` and `legend-toggle` mounted hid the
  series and dimmed every other bar, because both presets answered the click.
  `click-highlight` now yields the legend click at admission.
- A click on a discrete axis label through `click-highlight` or
  `axis-highlight` changed nothing on the chart. The renderer routed an axis
  target to the label painter only and skipped the render keys of its marks.
  The category's marks now emphasise and the rest mute, like a mark click.
- Keyboard targeting now navigates and emits `focus-element` through the
  `keyboard-targeting` interaction ID without requiring a click preset. Enter
  and Space still invoke configured click presets when present.
- Independently retained `set-annotation` updates now render together by update
  and semantic target identity; clearing one update leaves the others visible.
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

[Unreleased]: https://github.com/microsoft/flint-chart/compare/1.0.1...HEAD
[1.0.1]: https://github.com/microsoft/flint-chart/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/microsoft/flint-chart/compare/0.5.1...1.0.0
[0.5.1]: https://github.com/microsoft/flint-chart/compare/0.5...0.5.1
[0.5.0]: https://github.com/microsoft/flint-chart/compare/0.4.0...0.5.0
[0.4.1]: https://github.com/microsoft/flint-chart/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/microsoft/flint-chart/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/microsoft/flint-chart/compare/88fbeb5ebf07f18a1cf661ebef71cc570b7425d6...0.3.0
[0.2.2]: https://github.com/microsoft/flint-chart/compare/0.2.1...6a9d4e4155e3d9e2bed3fa9adf5316914f791478
[0.2.1]: https://github.com/microsoft/flint-chart/compare/c8e20b052ad9ddad29ba3ecfc825948c424e5ba5...0.2.1