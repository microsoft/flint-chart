---
name: flint-chart-author
description: "Use when: the user asks to make or render charts with flint-chart, visualize tabular data, generate a ChartAssemblyInput, validate/render through MCP, or add Flint to a JS/TS project. Author the semantic spec, transform data before Flint when needed, install/import Flint only when executable code is needed, and reserve backend-specific style tweaks for after compiling from Flint."
---

# flint-chart: authoring and using a chart spec

## What you produce (and what you do NOT)

Your output is the **spec**: the `chart_spec` and `semantic_types` of a
`ChartAssemblyInput`. You reference data columns **by name**. The host
passes the resulting input to `assembleVegaLite`, `assembleECharts`,
or `assembleChartjs` to get a backend spec.

**You write the input spec, not the output spec.** And critically:

- **DO** emit `chart_spec` (chart type, channel→field mapping, properties)
  and `semantic_types` (field → semantic type).
- **DO** add `interaction_spec` when the user asks for behaviour (highlight,
  legend toggle, pan and zoom, brush), asks for an interactive chart, or the
  session's goal is to explore the data. List presets by name; see
  "Interactions", and load the `flint-interaction-author` skill for an intent,
  an interactive chart with nothing named, or a combination.
- **Reference columns by name.** How `data` itself gets bound depends on
  the situation — a URL, a host-side variable, or embedded rows (see "How
  data gets bound"). Embedding is fine for small tables; just don't
  re-serialize a *large* dataset by hand, since that risks truncation and
  silent value corruption and wastes tokens.
- **Transform data before Flint.** If the requested chart needs aggregation,
  filtering, joins, pivots, derived columns, or long/wide reshaping beyond
  Flint's built-in static-series fold, use a coding, notebook, SQL, or data tool
  first. Then author the Flint spec against the transformed table.
- **Style after Flint, only when needed.** Author structure in Flint. For a
  presentation tweak Flint does not express (a reference line, annotation, or
  shaded band), use the Vega-Lite escape hatch — see "Post-Flint style
  customization". Never feed edited Vega-Lite JSON back to `render_chart`.

## When the user wants more than a spec

First decide which workflow the user is asking for:

- **Spec authoring only:** return a `ChartAssemblyInput` or its
  `semantic_types` + `chart_spec` pieces. Do not install packages or write
  renderer code unless asked.
- **MCP chart output:** if Flint MCP tools are available, **default to
  `validate_chart` then `show`** whenever the user asks to see a chart.
  `validate_chart` checks the spec and returns a report without drawing: only
  errors, warnings and update ops that will not apply, or "Nothing to fix". Fix
  what it lists in the spec, then call `show({ "chart": … })` once with the
  whole spec, which opens an interactive, live-rendered card with a
  customization panel. The server keeps nothing between calls: the spec in
  the conversation is the chart. Only fall back to `render_chart` (PNG/SVG)
  when the host has no App UI support or the user explicitly wants a static
  image. Use `compile_chart` when the user wants backend-native JSON, and
  `list_chart_types` when you need the supported chart catalog.
- **DO** pass `updates` beside the input to `validate_chart` and `show` when the user
  asks the chart to open in a state: rows to stand out, a note on a mark, a
  framed range. It is a list of ChartUpdate layers, state not behaviour; the
  shapes are in `flint://interaction-skill` under "Update the chart". To change a
  chart in a later turn, change its spec or `updates` and call `show` again: a
  new card shows it, earlier cards stay as they were. The reader's edits in the
  card's panel live on that card; its context gives the `chart_spec` that keeps
  them, so pass it unless the user asked for something else.
- **DO** pass `view: "table"` to `show` when the user wants to see
  a chart's numbers: the card opens on the table of the rows the chart draws,
  and the reader can switch to the chart. When the user wants records listed and
  no chart at all, use `chartType: "Table"` instead.
- **Project integration, only when the user asks for code:** add Flint to an
  app, notebook, script, or agentic product, install/import the library, and
  call an assembler in code. Keep the same `ChartAssemblyInput` contract, then
  let the host render the backend result.

For MCP clients, the server can run with `npx`:

```bash
npx -y flint-chart-mcp
```

For JavaScript or TypeScript projects, install Flint, plus the library of
any backend besides Vega-Lite that the app draws with:

| Draw with | Install | React | Without React |
| --- | --- | --- | --- |
| Vega-Lite (default) | `flint-chart` | `flint-chart/react/vegalite` | `flint-chart/interactive/vegalite` |
| ECharts | `flint-chart echarts` | `flint-chart/react/echarts` | `flint-chart/interactive/echarts` |
| Chart.js | `flint-chart chart.js` | `flint-chart/react/chartjs` | `flint-chart/interactive/chartjs` |
| Plotly | `flint-chart plotly.js-dist-min` | `flint-chart/react/plotly` | `flint-chart/interactive/plotly` |
| Any, chosen at runtime | `flint-chart echarts chart.js plotly.js-dist-min` | `flint-chart/react` | `flint-chart/interactive` |

- `npm install flint-chart` brings Vega-Lite (`vega`, `vega-lite`,
  `vega-tooltip`). ECharts, Chart.js and Plotly are optional peers: install the
  library only for a backend the app draws with. React is an optional peer for
  the React entries.
- Import every interactive name (presets, `mountChart`, update helpers, types)
  from the entry of the backend you draw with; each entry exports the same
  names. Import the plain `flint-chart/react` or `flint-chart/interactive` only
  when all three optional libraries are installed: a bundler resolves every
  backend an entry can reach, so a missing one fails the build.
- Compiling alone (`assembleVegaLite`, `assembleECharts`, `assembleChartjs`,
  `assemblePlotly` from `flint-chart`) needs no chart library.
- `flint-chart/render` (static SVG) also needs `echarts` installed.
- To draw a second backend from a one-backend entry, install its library and
  pass its factory: `renderers: { echarts: createEChartsInteractiveRenderer }`,
  imported from `flint-chart/echarts/interactive`.

Then compile with the requested backend:

```ts
import { assembleChartjs, assembleECharts, assembleVegaLite } from 'flint-chart';

const vegaLiteSpec = assembleVegaLite(input);
const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

Python support is planned for a later release. Until the PyPI package is
published, use the npm package or MCP server for released workflows.

```ts
interface ChartAssemblyInput {
  // Bound by the HOST or by you, depending on the situation (see below).
  data: { values: any[] } | { url: string };
  semantic_types?: Record<string, string | SemanticAnnotation>;  // field → type ( ← you write this)
  chart_spec: {                               //                        ← you write this
    chartType: string;                        // e.g. "Scatter Plot"
    title?: string;                           // the headline — write one
    subtitle?: string;                        // what is measured, of whom, when, in what units
    encodings: Record<string, EncodingValue>; // channel → { field, ... } (or array)
    baseSize?: { width: number; height: number };    // target layout size, default 400×320
    canvasSize?: { width: number; height: number };  // optional hard ceiling on stretch
    chartProperties?: Record<string, any>;    // per-chart tuning (optional)
  };
  options?: Record<string, any>;              // global layout options (rarely needed)
  field_display_names?: Record<string, string>; // field → readable axis/legend title
  theme_spec?: string | { extends: string; [key: string]: any }; // preset or preset override (Vega-Lite only)
}
```

## How data gets bound

Use the binding mode that matches the runtime. Do not mix them.

1. **Direct MCP rendering: embed rows.** When calling `render_chart`,
  `compile_chart`, or `validate_chart`, the tool arguments are JSON. If the
  data is small or already transformed by another tool, pass it as
  `data: { values: [...] }`. Do not pass runtime variable names in
  MCP tool calls — the MCP server cannot see your local variables.
2. **Direct MCP rendering: reference a local file.**
  The `flint-chart-mcp` server can load `data: { url: "..." }` from local
  `.json`, `.csv`, or `.tsv` files. By default any local file the agent can
  name is readable (relative paths resolve against the working directory); a
  hardened deployment may reject local file references entirely via
  `--disable-file-reference` (or `FLINT_MCP_DISABLE_FILE_REFERENCE`), in which
  case pass rows inline with `data.values`. Remote URL
  fetching is disabled. If the data must be transformed first, use a
  coding/data tool to write a small prepared file, then reference that file.
3. **Generated application or notebook code: bind runtime variables.** If the
  user asks you to add Flint to code, write normal data-loading code first and
  pass a real runtime value, e.g. `data: { values: rows }`, to
  `assembleVegaLite`, `assembleECharts`, or `assembleChartjs`. This variable
  pattern is for generated code, not for MCP tool calls.
  - Parse CSV with a real parser (`d3.csvParse`, Papa Parse, `pandas`), never
    `line.split(',')`: quoted values such as `"Korea, Rep."` shift every later
    column, and a shifted measure silently changes the chart (a wrong domain,
    an unwanted log scale).
  - Keep values as the data has them and let `semantic_types` read them: a
    number column `year` typed `Year`, and a `YearMonth` column as `202501`,
    `"202501"` or `"2025-01"`, are labelled as years and months; don't convert
    them to date strings first.

For spec-only answers, return the `semantic_types` and `chart_spec` pieces and
state how the host should bind data. In the worked examples below, `data` is
shown as `{ values: [] }` to signal "host binds this" — focus on `chart_spec`
and `semantic_types`.

## Data transformation before charting

Flint is a chart compiler, not a data-wrangling layer. If the chart needs grouped
totals, time buckets, filters, joins, pivots, derived ratios, or a long-form
table, transform the data first with a host tool, then bind the prepared table
(see "How data gets bound"). Pick semantic types and channels for the transformed
columns, not for columns that no longer exist.

**Sanity-read the values first — don't chart blind.** Inspect the actual data
with your data tool (distinct values per category column, min/max per measure),
not just the column names, and watch for:

- **Embedded totals.** A category column may mix an aggregate level with its
  parts (e.g. `all` alongside `cage-free`/`caged`, or a `Total` region). Charting
  the total with its parts double-counts and flattens the parts — keep one or the
  other on a stacked/grouped/colored channel, not both.
- **Units.** `Percentage` accepts either a fraction (0–1) or a percent (0–100):
  Flint reads which from the values and formats both as `%`. Don't rescale a
  column for Flint, and don't scale it twice.
- **One real entity.** If your breakdown column has a single distinct value, the
  per-group chart collapses to one mark — the intended breakdown is likely a
  different column.

## Post-Flint style customization

Stay at the Flint level for structure (data, chart type, channels, transforms,
sizing, properties) — Flint specs stay portable and regenerate safely. Drop to
backend JSON only after a valid Flint chart exists, and only for a narrow
presentation change Flint does not expose (exact axis/legend/mark styling,
titles, annotations, reference lines, layout polish). Never use it to change the
data, chart type, field mappings, or transforms — fix those upstream.

For a Vega-Lite-specific style tweak:

1. Author and validate the Flint `ChartAssemblyInput`.
2. Render or inspect the Flint chart first, when possible.
3. Call `compile_chart` with `backend: "vegalite"`.
4. Make the smallest necessary style/presentation edit to the returned
  Vega-Lite spec.
5. Render the edited spec in the host environment with a Vega-Lite renderer.

This edited Vega-Lite spec is no longer a portable Flint spec. Do not send it to
`render_chart`; use `render_chart` only for Flint `ChartAssemblyInput`.

## Write a headline

Set `chart_spec.title` to the finding, in a sentence, and `chart_spec.subtitle`
to the reading of it — what is measured, of whom, when, in what units:

```
title:    "A pyramid that is no longer a pyramid"
subtitle: "United States population by age and sex, 2020, millions"
```

Add `chart_spec.label` only when the chart sits in a numbered sequence or
under a section name: `label: "Figure 2"`. It is drawn above the headline in
the theme's kicker style.

`chart_spec.source` is optional. Add it only when the user names the source or
asks for a source line, or the data itself states where it comes from:
`source: "UN World Population Prospects 2024"` (or `{ text, href }` to link
it). Never invent or guess one. The theme decides how it reads ("Source:",
side, rule, credit); a chart without one draws no footer.

`chart_spec.chrome` is the house decoration the theme draws around the chart:
header rules, tabs, wordmarks, logos, the footer rule and the house credit. It is
not the chart's own title, label or source. The theme draws it by default; leave
`chrome` out unless the user asks to drop it: `chrome: false`
drops all of it; `chrome: { logos: false }` (or `header`, `footer: false`) drops
one part. Without logos a credit keeps its words.

`Jan`, `Cairo`, `Chrome` name their own kind; `26`, `5,300`, `0.42` do not, and
the headline is where they get named. Leave it out only where the chart is not
read on its own — a sparkline in a cell, a tile under its own caption. Nothing
breaks: with no headline to lean on, the compiler keeps the axis titles instead.

## Visual themes (`theme_spec`)

Use one of two forms. Prefer a preset unless the user asks for a specific
brand adjustment.

### 1. Use a preset

Call `list_themes` to choose an id, then place it beside `chart_spec`:

```json
{ "chart_spec": { ... }, "theme_spec": "economist" }
```

| id | what it is for |
| --- | --- |
| `nyt` | Newsroom graphics: headline states the finding, values on the marks, series named at their ends. |
| `economist` | Print weekly: compact, flat headline over a deck, units repeated down the ruler. |
| `swiss` | International Typographic Style: strong grid structure, black typography, and a focused red accent. |
| `nature` | Journal figure: small panel, axis titles with units, statistics beside the fit. |
| `mckinsey` | Consulting deck: wide bands, every value printed, headline states the takeaway. |
| `datawrapper` | Embedded web chart: narrow column, plain headline and deck, rule under the footer. |
| `powerbi` | Dashboard tile: compact, legend to the right, latest point emphasised. |
| `powerbi-light` | Light dashboard tile: white canvas, fine gridlines, and bright categorical color. |
| `cartoon` | Playful illustration: warm paper, rounded type, bold outlines, and bright color. |
| `apple` | App-interface chart: light labels, trailing value axis, symbols beside color. |
| `de-stijl` | De Stijl composition: primary planes in heavy black lines, steps not slopes, title under the picture. |
| `bbc` | BBC News graphic: big bold headline, gridlines only, heavy zero rule, footer rule with the source. |
| `material` | Material Design 3 product chart: purple-led tonal palette, Roboto type, light gridlines, rounded bars. |

### 2. Override a preset

Keep overrides narrow and state only what the user wants to change:

```json
{
  "theme_spec": {
    "extends": "economist",
    "id": "our-brand",
    "ink": {
      "series": {
        "single": "#6b3fa0"
      }
    }
  }
}
```

Common simple overrides are `ink.surface.canvas`, `ink.series.single`,
`ink.series.categorical`, `type.headline.family`, and `layout.density`
(`"compact"`, `"normal"`, or `"airy"`). If replacing
`ink.series.categorical`, also replace `categoricalExtended` so charts with
many series keep the requested brand palette.

Do not copy an entire preset or invent theme keys. A theme controls
presentation; fields, aggregation, filtering, and sorting still belong in the
chart input. ThemeSpec applies to Vega-Lite and Plotly; ECharts, Chart.js, and Excel ignore it.

Full reference:
https://microsoft.github.io/flint-chart/#/documentation/theme-spec

## Interactions (`interaction_spec`)

Add `interaction_spec` beside `chart_spec` when the user asks for behaviour,
or when the goal of the session is to explore or analyse the data. A static
image never needs it.

```json
{
  "chart_spec": { "chartType": "Line Chart", "encodings": { "x": "date", "y": "value", "color": "series" } },
  "interaction_spec": { "interactions": [ { "type": "brush-x" } ] }
}
```

Every entry is `{ "type": <preset>, "options": { ... } }`, one per behaviour.
Take the presets and their options for the chart type from
`list_interaction_presets` with `chartType`; never invent one. Options nest under
`options`; `id` sits on the entry.

Which presets answer a request, how they combine, and what the warnings mean
is the `flint-interaction-author` skill (`flint://interaction-skill` on the
MCP server). Load it for anything beyond a single named gesture: an intent
(explore, compare, analyse, find outliers), "make it interactive" with
nothing named, several presets together, behaviour on a chart that already
exists, or an update to a chart on screen.

Full reference:
https://microsoft.github.io/flint-chart/#/documentation/interaction-spec

## Step 1 — pick `chartType`

Use one of the registered names **exactly**. Vega-Lite is the default and
broadest backend; the table below lists each Vega-Lite chart type, the
channels it accepts, and its tuning properties (see "Chart-level
properties"). Required channels are noted.

| chartType | Channels | Notes / required |
|---|---|---|
| `"Scatter Plot"` | x, y, color, size, shape, detail, opacity, column, row | x + y required; `detail` carries a field (e.g. `country`) on each point without a visual channel, for tooltips and linking |
| `"Regression"` | x, y, size, color, column, row | scatter + fit line; props `regressionMethod`, `polyOrder` |
| `"Connected Scatter Plot"` | x, y, order, color, detail, column, row | x + y required; `order` = connection sequence (time/index), so the line traces a trajectory and may self-cross |
| `"Ranged Dot Plot"` | x, y, color | dumbbell of two x per category |
| `"Strip Plot"` | x, y, color, size, column, row | jittered points; props `stepWidth`, `pointSize`, `opacity` |
| `"Bar Chart"` | x, y, color, opacity, column, row | one discrete + one measure; prop `cornerRadius` |
| `"Grouped Bar Chart"` | x, y, group, column, row | `group` = the clustering category; prop `dodge` |
| `"Stacked Bar Chart"` | x, y, color, column, row | prop `stackMode` |
| `"Pyramid Chart"` | x, y, color | diverging horizontal bars |
| `"Lollipop Chart"` | x, y, color, column, row | prop `dotSize` |
| `"Waterfall Chart"` | x, y, color, column, row | `color` = Type column, values `start`/`delta`/`end` only; omit it for auto sign coloring; props `cornerRadius`, `totals` |
| `"Gantt Chart"` | y, x, x2, color, detail, column, row | x = start, x2 = end |
| `"Bullet Chart"` | y, x, goal, color, column, row | `goal` required (target) |
| `"Histogram"` | x, color, column, row | x = measure to bin; prop `binCount` |
| `"Boxplot"` | x, y, color, opacity, column, row | category + measure; props `whiskerMethod`, `showOutliers`, `dodge` |
| `"ECDF Plot"` | x, color, detail, column, row | x = measure; cumulative distribution (step line); prop `showPoints` |
| `"Heatmap"` | x, y, color, column, row | color = the measure |
| `"Calendar Heatmap"` | x, color | x = date; color = daily value (summed per day); GitHub-style week × weekday grid |
| `"Line Chart"` | x, y, color, strokeDash, detail, opacity, column, row | props `interpolate`, `showPoints` |
| `"Sparkline"` | x, y, color, detail, row, column | x + y required; small-multiple mini trend lines, one per series (series from `color` or `detail`); props `interpolate`, `baseline`, `trendWidth` |
| `"Bump Chart"` | x, y, color, detail, column, row | rank-over-time lines |
| `"Slope Chart"` | x, y, color, detail, column, row | two-period value change; straight segments + end points, one line per category |
| `"Area Chart"` | x, y, color, opacity, column, row | props `interpolate`, `opacity`, `stackMode` |
| `"Range Area Chart"` | x, y, y2, color, column, row | x + y + y2 required; translucent band from `y` (low) to `y2` (high), value axis fits the band (not zero) |
| `"Violin Plot"` | x, y, color, row | x (category) + y (measure) required; mirrored KDE density per category, prop `bandwidth`; **Vega-Lite only**; a genuine `color` subgroup splits two groups or grids 3+ groups |
| `"Streamgraph"` | x, y, color, column, row | centre-stacked areas |
| `"Density Plot"` | x, color, column, row | props `bandwidth`, `stackMode` (series stack; `layered` overlaps them), `opacity` |
| `"Ridgeline Plot"` | x, y, color | x = measure; `color` (or a discrete `y`) names the ridges, each the KDE of x on its own baseline; a measure `y` draws each series' curve instead; props `overlap`, `order`, `tailCut`, `colorBy`, `perspective` (plans unset `skew`, `tilt`, `overlap` from the ridge count so the depth takes about 40% of the plot), `skew`, `tilt`, `valueMax`, `markAt` (`true` marks the x ticks, or a list of x values; each ridge's value is dotted and labelled, joined across ridges), `opacity`, `interpolate`, `bandwidth`; named ridges share one ink unless `colorBy` asks otherwise; a numeric `color` keeps a gradient key; **Vega-Lite only** |
| `"Marginal Plot"` | x, y, color, size, shape, opacity | the plot follows the axis types (measure × measure = scatter, category × measure = strip, category × category = heatmap of counts) with each axis's distribution along it (density, histogram or boxplot on a measure axis, a bar of counts on a category axis, split by `color`; density margins layer by default); props `marginal`, `stackMode`, `bandwidth`, `binCount`, `whiskerMethod`, `showOutliers`; **Vega-Lite only** |
| `"Pie Chart"` | size, color, column, row | `size` = slice value (→ angle), `color` = category; props `innerRadius`, `sortSlices` |
| `"Rose Chart"` | x, y, color, column, row | polar bars; props `alignment`, `padAngle`, `sortSlices` |
| `"Radar Chart"` | x, y, color, column, row | props `filled`, `fillOpacity`, `strokeWidth` |
| `"Candlestick Chart"` | x, open, high, low, close, column, row | OHLC all required |
| `"Bar Table"` | y, x, color, column, row | compact bars + value labels |
| `"KPI Card"` | metric, value, goal | big-number tile; prop `behindThreshold` |
| `"Table"` | none (`encodings: {}`) | the rows as given, one column per field in row order; shape `data.values` to the rows and fields to list, name columns with `field_display_names`; numbers and dates print by `semantic_types`; receives links and `updates`, sends no selection |
| `"Map"` | longitude, latitude, color, size, opacity | bubble map; props `region`, `projection` |
| `"Choropleth"` | id, color, detail | `id` = region key (see **Maps** below); props `region` (`"world"`/`"us"`), `level` (US: `"state"`/`"county"`/`"auto"`), `projection` (world) |

**Maps: what `id` accepts.** Flint joins the key to its own base map; you never
supply geometry or a lookup. A **world** map takes country names ("India",
"DR Congo", "United Kingdom"), ISO 3166 alpha-2 / alpha-3 codes ("IN", "IND"),
or ISO numeric codes (356), all in one column. A **US** map takes state names,
USPS codes ("CA") or FIPS codes (6), and county FIPS (6037) with
`level: "county"`. Declare the key `Country` or `State` in `semantic_types`
(or set `chartProperties.region`) whenever codes could collide: "CA", "IN",
"Georgia", or small numbers. A key that matches no region is not drawn. Map
marks carry only `id`, `color` and `detail`: to link a map with charts keyed by
a name column, encode that column as `id` (names resolve too) or put it on
`detail` (e.g. `id: "map_id", detail: "country"`), which also labels the tooltip.

**Donut chart:** use `"Pie Chart"` with `chartProperties.innerRadius > 0`.

**Choosing a bar chart (most common mix-up).** All three take one discrete
category on `x` (or `y`) plus one measure. They differ in how a **second**
category is shown — and each reads that second category from a **different
channel**:

- `"Bar Chart"` — use for a single series. When multiple rows share an `x`, a
  second category on `color` produces stacked segments. For side-by-side bars,
  use `"Grouped Bar Chart"` with the second category on `group`.
- `"Stacked Bar Chart"` — second category on `color`, drawn as **stacked**
  segments within each bar (totals matter). Tune with `stackMode`
  (`stacked` / `normalize` / `layered`).
- `"Grouped Bar Chart"` — second category on the **`group`** channel, drawn as
  **side-by-side (dodged)** bars within each `x` cluster (compare values
  directly). Put the clustering category on `group`, *not* `color`.

Rule of thumb: comparing parts-to-whole → Stacked; comparing values
side-by-side → Grouped (use `group`); single series → Bar.

**Waterfall color is a special "Type" column, not a free category.** On a
`"Waterfall Chart"` the `color` channel is reserved for a *type* field whose
values are literally `start`, `delta`, and `end` — it drives which bars anchor
to zero, not an arbitrary grouping. Do **not** bind `color` to an
`Increase`/`Decrease` (or up/down, gain/loss) category: the up/down direction is
already derived from the **sign** of the `y` value and colored automatically
(green up / red down). For the common case, **omit `color` entirely** and let
Flint infer the start/delta/end and per-bar sign coloring. To force which bars
are anchored totals, use the `totals` property (`first`/`last`/`both`), not a
color field. Only bind `color` when you genuinely have a `start`/`delta`/`end`
type column.

**Backend coverage.** Vega-Lite supports all of the above. Other backends
support a subset (verify if targeting a non-VL backend):

- **ECharts** adds: `"Gauge"`,
  `"Funnel"`, `"Treemap"`, `"Sunburst"`, `"Sankey"`,
  `"Parallel Coordinates"`, `"Graph"`, `"Tree"`.
- **Chart.js** supports: Scatter, Bubble, Bar, Grouped Bar, Stacked Bar,
  Lollipop, Bump, Combo, Line, Area, Range Area, Pie, Doughnut, Histogram,
  Radar, Rose, Slope, Connected Scatter.

You do not need to call the library or inspect its source to author the
input — pick from this table.

## Step 2 — map fields to channels

Each channel maps to an **encoding object** `{ field, ... }` (or a bare
string shorthand, expanded to `{ field: "<string>" }`):

```json
"encodings": {
  "x": { "field": "weight" },
  "y": "mpg",
  "color": { "field": "origin" }
}
```

**Encoding object fields** (all optional except `field`):

| Field | Values | Purpose |
|---|---|---|
| `field` | column name | Bind the channel to a data column |
| `type` | `quantitative`, `nominal`, `ordinal`, `temporal` | Override the inferred encoding type (rarely needed) |
| `aggregate` | `count`, `sum`, `average`, `mean` | Force an aggregation on a measure channel. A heatmap that gets several rows per cell aggregates its colour on its own (sum for additive types such as `Quantity` or `Profit`, average otherwise) and warns; set `aggregate` to choose |
| `sortOrder` | `ascending`, `descending` | Sort direction; in Vega-Lite, direction alone preserves/reverses the semantic sequence |
| `sortBy` | mapped `"x"`, `"y"`, `"color"`; Vega-Lite also accepts a data field or JSON-array string | Explicit category ordering; see the Vega-Lite contract below |
| `scheme` | Vega scheme name (e.g. `viridis`, `redblue`), or a list of stops low end first (`["#c0392b", "#f2f2f2", "#2e75b6"]`) | Color scheme for the `color` channel; wins over the theme's ramp |
| `reverse` | `true` / `false` | `color` only: run the color scale the other way round |
| `mid` | number | `color` only: where a diverging scale pivots, for this chart (the field's `divergingMidpoint`) |
| `domain` | `[low, high]` | `color` only: the measure extent the ramp spans, in place of the data's |
| `bins` | integer ≥ 2, or `0` | `color` only: quantize a continuous measure into that many steps; `0` keeps the ramp continuous |
| `colors` | `{ value: color }` | `color` only: colors bound to category values, for this chart (the field's `colors`) |
| `title` | a string, or `null` | The name the channel's axis or key prints in place of the field's; `null` prints none |

You usually don't need `type`, `aggregate`, or `sortOrder` — they're
inferred from the semantic type. Set them only with specific intent.

**Vega-Lite sorting.** Omit sorting for canonical Month/Day/Quarter order.
`sortOrder` alone follows that semantic sequence (descending reverses it),
not alphabetical month names. Without a semantic sequence, direction alone
uses the field's native value order.

- `sortBy: "month_number"` sorts by that existing data field, ascending by
  default. Multiple rows per category use the minimum sort-field value.
- `sortBy: "y"` sorts by the mapped channel; cross-channel sorts default to
  descending, while self-channel sorts default to ascending. `x`, `y`, and
  `color` are reserved channel names and must be mapped.
- `sortBy: "[\"Mar\",\"Jan\",\"Feb\"]"` supplies an explicit category order;
  `sortOrder: "descending"` reverses it. Use a JSON-array **string**, not an array
  or a Vega-Lite sort object. Members must be strings, numbers, or booleans.
- For explicit lexical ordering of month labels, sort by the category field
  itself: `{ "field": "month", "sortBy": "month", "sortOrder": "ascending" }`.

Unknown fields, unmapped channels, invalid directions, and malformed sort
arrays are errors, not fallback orders. Raw field-name sorting is currently
supported by the Vega-Lite backend; for other backends use their supported
channel-sort controls. Validate inputs against the selected backend.

**Multi-series (wide → long).** To plot several measure columns as series,
pass an **array** on `x` or `y` (only those two channels). The library
folds them into long form and synthesizes a series/legend field:

```json
"encodings": { "x": { "field": "month" }, "y": ["sales", "profit"] }
```

All array fields must be quantitative, and you cannot also bind `color`
when using the array form (the fold owns the color/legend). This is the
**only** built-in reshape — there is no `transforms`/`fold` property. For any
other shape (long↔wide, an aggregate the encodings can't express, a derived
column, a pivot, a join), reshape the data first with a host tool — pandas/polars,
Arquero/`Array.map`/SQL, or a data/MCP tool — and pass the result as
`data.values`. If you have no way to transform, surface the gap to the developer
rather than inventing a transform property that does not exist.

## Step 3 — annotate with semantic types

**This is the most important step.** Semantic types drive all downstream
decisions — formatting, zero baseline, color scheme, scale direction, and
more. Pick the most specific type for each field. Full registered set:

| Family | Semantic types |
|---|---|
| Temporal (point) | `DateTime`, `Date`, `Time`, `Timestamp` |
| Temporal (granule) | `Year`, `Quarter`, `Month`, `Week`, `Day`, `Hour`, `YearMonth`, `YearQuarter`, `YearWeek`, `Decade` |
| Temporal (span) | `Duration` |
| Measure (amount) | `Amount`, `Price`, `Quantity`, `Count`, `Number` |
| Measure (proportion) | `Percentage` |
| Measure (signed/diverging) | `Profit`, `PercentageChange`, `Sentiment`, `Correlation` |
| Measure (physical) | `Temperature` |
| Discrete / rank | `Rank`, `Score`, `ID` |
| Geographic (coord) | `Latitude`, `Longitude` |
| Geographic (place) | `Country`, `State`, `City`, `Region`, `Address`, `ZipCode` |
| Categorical | `Category`, `Name`, `Status`, `Boolean`, `Direction`, `Range` |
| Fallback | `Unknown` |

A temporal type also tells Flint how to read the values: a `YearMonth` accepts `202501`, `2025-01`, `2025/1`, `01/2025`, `2025M01`, `Jan 2025`, `2025-Jul`, `July-2025` or `Jul '25`; a `Date` accepts `20250115`, `2025/01/15`, `Jan 15, 2025` or `15-Jan-2025`. Pass the values as they are; an untyped field is never reinterpreted.

What choosing well gets you (automatically):

- `Price` / `Amount` → currency formatting, zero baseline, sequential color
- `Temperature` → diverging color scheme, no forced zero baseline
- `Correlation` → fixed `[-1, 1]` diverging domain
- `Rank` → reversed axis (1 on top), discrete color
- `Date` / `DateTime` → temporal axis with auto-granularity formatting
- `Percentage` → percent formatting, 0–100 domain awareness

If you don't know, use `Quantity` for numbers, `Category` for strings,
`Date`/`DateTime` for date-shaped values. Do **not** invent type names.

### Saying more than the type name

A field's entry can be an object instead of a string when the type alone
understates what you know:

```json
"semantic_types": {
  "anomaly": { "semanticType": "Quantity", "unit": "°C", "divergingMidpoint": 0 },
  "rating":  { "semanticType": "Score", "intrinsicDomain": [1, 5] }
}
```

- `unit` — an optional assertion that authorizes Flint to display a unit. Add
  it only when the data or surrounding context establishes the measurement
  and seeing it materially changes how a reader interprets the number. A type
  such as `Duration`, a field name such as `life_expectancy`, or values that
  merely look plausible are not enough evidence by themselves.
  - Prefer canonical codes: `"USD"`, `"°C"`, `"kg"`, `"km/h"`, `"min"`.
  - Conventional compact units are normalized and may appear beside values
    (`USD` → `$`, `hours` → `hr`).
  - Lexical units such as `"years"` are stated once beside the field name as
    `field (years)`, not repeated after every value.
  - Do not put explanatory phrases in `unit`. Put qualifications such as
    `"per working-age resident"` or `"constant 2024 prices"` in the subtitle.
  - Omit `unit` when its meaning, scale, or denominator is uncertain. Flint
    does not infer a visible unit from the semantic type or field name.
- `intrinsicDomain` — the field's own bounds, for bounded scales only: `[1, 5]`
  for a five-star rating, `[0, 100]` for a percentage score. Not for
  open-ended measures.
- `percentScale` — `"fraction"` or `"percent"`: how a `Percentage` or
  `PercentageChange` field is stored (0.45 or 45 for 45%). Set it when you know;
  otherwise Flint guesses from the values, which misreads fractions mostly past
  1 (growth of 2.4 meaning 240%).
- `divergingMidpoint` — where the middle colour of a diverging scale sits.
  Set it if you can tell what the reader is comparing against; leave it out if
  you can't.
- `sortOrder` — the order the categories should appear in, when the order in
  the data is not the one you want and it isn't alphabetical either:
  `["Low", "Medium", "High"]`. For a handful of categories, not a long list.
- `colors` — colours that belong to particular values, when the data has a
  convention the reader expects: `{ "DFL": "#0793AB", "Republican": "#A1000F" }`.
  Matched on the value (case-insensitive); values left out take the palette,
  which then skips these colours. Only for real conventions (parties, brands,
  asset classes), not to restyle a chart — the theme owns the palette.
- `polarity` — `"higher-is-better"` or `"lower-is-better"`: which end of a
  diverging colour is the alarming one. Signed measures (`Profit`,
  `PercentageChange`) read as higher-is-better on their own; set
  `"lower-is-better"` for costs, errors, churn or delays, so their highs, not
  their lows, take the warm end, under any theme.

## Step 4 — write the spec

Put the three steps into one `ChartAssemblyInput`, with the data bound as in
"How data gets bound" and a headline as in "Write a headline":

```json
{
  "data": { "url": "sales.csv" },
  "semantic_types": { "month": "YearMonth", "revenue": "Amount", "region": "Region" },
  "chart_spec": {
    "chartType": "Line Chart",
    "title": "Europe climbed every month after the April dip",
    "subtitle": "Revenue by region, $m",
    "encodings": { "x": { "field": "month" }, "y": { "field": "revenue" }, "color": { "field": "region" } }
  },
  "theme_spec": "economist"
}
```

Add `theme_spec`, `chartProperties`, `interaction_spec` or `updates` only when
the request asks for them. With the MCP tools, check it with `validate_chart`,
fix what the report asks in the spec, then pass the whole spec to `show` as
`chart`. Without them, run the "Validation checklist".

## Chart-level properties (`chartProperties`)

`chartProperties` is an optional per-chart tuning map. Set a property only
when the user asks for that behavior — defaults are sensible. These are
**design choices**, not styling overrides (colors/fonts/ticks are still
derived). Values are clamped to the ranges shown.

| Chart type | Property | Type / range (default) | Effect |
|---|---|---|---|
| Bar Chart | `cornerRadius` | 0–15 (0) | Round bar corners (px) |
| Area / Stacked Bar | `stackMode` | `stacked` \| `normalize` \| `center` \| `layered` (unset) | Stacking behavior; `normalize` = 100%, `center` = streamgraph |
| Density Plot | `stackMode` | `normalize` \| `layered` (unset = stacked) | `layered` overlaps the series, translucent |
| Density Plot | `opacity` | 0.1–1 (0.7) | Layered series opacity |
| Marginal Plot | `stackMode` | `stacked` (unset = layered) | Stack the density margins instead of layering them |
| Grouped Bar / Boxplot | `dodge` | `auto` \| `local` \| `global` (`auto`) | `local` compacts sparse groups per category; `global` preserves aligned group lanes; leave `auto` unless the user requests one |
| Line / Area / Sparkline | `interpolate` | `linear` \| `monotone` \| `step` \| `step-before` \| `step-after` \| `basis` \| `cardinal` \| `catmull-rom` (`linear`) | Curve shape |
| Line / ECDF Plot | `showPoints` | boolean (false) | Draw point markers on the line |
| Sparkline | `baseline` | `mean` \| `zero` \| `median` \| `none` (`mean`) | Reference line per spark row |
| Sparkline | `trendWidth` | 80–600 (240) | Mini line-plot width (px) |
| Boxplot | `whiskerMethod` | `iqr` \| `minmax` (`iqr`) | Whisker rule (Tukey 1.5×IQR vs min–max) |
| Boxplot | `showOutliers` | boolean (true) | Show outlier points (Tukey only) |
| Area | `opacity` | 0.1–1 (0.7) | Fill opacity |
| Scatter | `opacity` | 0.1–1 (1) | Point opacity |
| Strip Plot | `stepWidth` | 10–100 (20) | Jitter spread |
| Strip Plot | `pointSize` | 0–150 (0=auto) | Point size |
| Strip Plot | `opacity` | 0–1 (0=auto) | Point opacity |
| Histogram | `binCount` | 5–50 (10) | Number of bins |
| Density Plot / Ridgeline / Marginal Plot | `bandwidth` | 0.05–2 (0=auto) | Kernel bandwidth |
| Ridgeline | `overlap` | 0.5–4 (1.8) | How many baselines up the tallest ridge reaches |
| Ridgeline | `order` | `mean`, `reverse` (unset = as given; a quantitative series lowest at the front) | Highest mean on top, or reversed |
| Ridgeline | `tailCut` | 0–0.2 (0) | Trim each ridge to where its density is at least this share of its peak |
| Ridgeline | `colorBy` | `series`, `x` (unset = one colour) | Named ridges share one ink by default; `series` colours each ridge, `x` fills each with a ramp along x |
| Ridgeline | `perspective` | boolean (false) | Stand the ridges on a floor seen in perspective: `skew`, `tilt`, `overlap` left unset are planned so the depth takes about 40% of the plot's width and more of its height as ridges are added; the depth names, edge and value ticks give way (along the axis, then level, then every n-th) before they touch |
| Ridgeline | `skew` | 0–0.4 (0) | Perspective: shift the back ridges left by this share of the x range |
| Ridgeline | `tilt` | 0–6 (0) | Perspective: the x axis rises this many baselines across its range, labels following its edge |
| Ridgeline | `opacity` | 0.1–1 (0.5) | Ridge opacity, as the Range Area Chart; solid in perspective unless set |
| Ridgeline | `valueMax` | number (0 = tallest peak) | Perspective: the value the full ridge height stands for, read on the back-left value axis |
| Ridgeline | `markAt` | boolean \| number[] | Mark and label every ridge's value at the x ticks inside the range (`true`) or at these x; a dashed line joins the marks at one x across the ridges |
| Marginal Plot | `marginal` | `density` \| `histogram` \| `boxplot` (`density`) | What each margin draws along a measure axis; a category axis gets a bar of counts |
| Pie Chart | `innerRadius` | 0–100 (0) | Donut hole size (>0 → donut) |
| Pie / Rose | `sortSlices` | `none` \| `descending` \| `ascending` (`none`) | Order wedges and their legend by slice value |
| Rose Chart | `alignment` | `left` \| `center` (`left`) | Wedge alignment |
| Rose Chart | `padAngle` | 0–0.1 (0) | Gap between slices |
| Lollipop | `dotSize` | 20–300 (80) | Circle size (px) |
| Waterfall | `cornerRadius` | 0–8 (0) | Round bar corners |
| Waterfall | `totals` | `auto` \| `none` \| `first` \| `last` \| `both` (`auto`) | Which bars anchor to zero as totals (only when no Type column) |
| Waterfall | `showTextLabels` | boolean (false) | Legacy spelling of `showValueLabels`; still accepted |
| Bar / Grouped Bar / Stacked Bar / Lollipop / Pyramid / Pie / Donut / Heatmap / Waterfall | `showValueLabels` | boolean | Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks. |
| Regression | `regressionMethod` | `linear` \| `log` \| `exp` \| `pow` \| `quad` \| `poly` (`linear`) | Fit method |
| Regression | `polyOrder` | 1–5 (3) | Polynomial order (when `poly`) |
| Radar | `filled` | boolean (true) | Fill the polygon |
| Radar | `fillOpacity` | 0–0.5 (0.15) | Polygon fill opacity |
| Radar | `strokeWidth` | 0.5–4 (1.5) | Line width |
| KPI Card | `behindThreshold` | 0–1 (0.5) | Value/goal ratio cutoff for color |
| Map | `region` | `us` \| `world` \| `auto` (`auto`) | Geographic scope |
| Map | `projection` | `mercator` \| `equalEarth` \| `orthographic` \| `stereographic` \| `conic` \| `mollweide` | Map projection |

**Cross-cutting properties** (apply to position/faceted charts when
relevant; set only to force non-default behavior):

- `independentYAxis` (boolean) — faceted charts: give each panel its own
  y-scale.
- `logScale_x` / `logScale_y` (boolean) — force a logarithmic axis.
- `includeZero_x` / `includeZero_y` (boolean) — force the axis to include 0.
- `xAxisType` / `yAxisType` (`temporal` | `nominal`) — force a temporal
  field to render as discrete bands (or vice-versa).
- `labelOverflow` (list of steps) — the path x category names that do not
  fit their band take. Leave it out: names wrap, then stand upright (trimmed
  if need be), every name printed; a run of times, dates, years or ranks
  wraps, then prints only round values (16:45, 17:00) flat. Set it only when
  the user asks, e.g. `["wrap", "rotate90"]` to label every year, or
  `["wrap", "rotate45", "rotate90"]` for 45° labels. Steps: `wrap`, `skip`
  (sequences only), `rotate45`, `rotate90`.

## Parameter overrides — when to reach for them

Overrides exist, but prefer letting semantic types drive decisions. Reach
for an override only when the user's intent genuinely conflicts with the
default:

- **Force an aggregation:** `encodings.y = { field: "sales", aggregate: "sum" }`.
- **Sort a category axis by its measure:** `encodings.x = { field: "name", sortBy: "y", sortOrder: "descending" }`.
- **Pick a color scheme:** `encodings.color = { field: "region", scheme: "tableau10" }`.
- **Control a color ramp when the user asks for it:** `encodings.color = { field: "net", scheme: ["#c0392b", "#f2f2f2", "#2e75b6"], mid: 0, bins: 5 }`; add `reverse: true` to flip it or `domain: [-50000, 50000]` to fix its extent. These win over the theme.
- **Override an inferred type:** `encodings.x = { field: "year", type: "ordinal" }` (e.g. treat a year as discrete bands).
- **Use readable field titles:** `field_display_names = { percentageOfCountries: "Percentage of countries" }`.
  Keep encodings bound to the real column name; Flint uses the display name for axis titles and legend headers.
- **Resize the chart:** Flint sizes from two numbers — `baseSize` (the *target*
  it aims for, default 400×320) and `canvasSize` (a *hard ceiling* it may never
  exceed). With dense data the chart stretches from base toward the ceiling.
  - Want a comfortable size that may grow for dense data → set `chart_spec.baseSize = { width, height }`.
  - Want a fixed slot it must fit inside → set `chart_spec.canvasSize = { width, height }` alone; the chart fills it and shrinks to fit, never overflowing. *What you ask for is what you get.*
  - Both → aims for `baseSize`, grows toward `canvasSize`, never beyond.
- **Force log / zero baseline:** the `logScale_*` / `includeZero_*` chart
  properties above.

Global layout tuning lives in the top-level `options` object (e.g.
`addTooltips`, band padding, facet sizing). It is rarely needed for
authoring — omit it unless asked.

## Worked examples

In each example `data` is a placeholder — the host binds real rows or a
URL. You author only `chart_spec` and `semantic_types`.

### Scatter plot

User: "Plot car weight vs fuel economy, colored by origin."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "weight": "Quantity",
    "mpg": "Quantity",
    "origin": "Country"
  },
  "chart_spec": {
    "chartType": "Scatter Plot",
    "encodings": {
      "x": { "field": "weight" },
      "y": { "field": "mpg" },
      "color": { "field": "origin" }
    },
    "baseSize": { "width": 400, "height": 300 }
  }
}
```

### Revenue bar chart with facets, sorted by value

User: "Show revenue by product line, biggest first, one panel per region."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "product_line": "Category",
    "revenue": "Amount",
    "region": "Region"
  },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "product_line", "sortBy": "y", "sortOrder": "descending" },
      "y": { "field": "revenue" },
      "column": { "field": "region" }
    }
  }
}
```

### Time series, multiple series (wide → long via array)

User: "Line chart of monthly sales and profit."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "month": "YearMonth",
    "sales": "Amount",
    "profit": "Profit"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": ["sales", "profit"]
    },
    "chartProperties": { "interpolate": "monotone", "showPoints": true }
  }
}
```

### Donut chart (Pie + innerRadius), value on `size`

User: "Show market share by vendor as a donut."

Pie/donut maps the slice value to `size` (rendered as angle) and the
category to `color`. Data is already long (one row per vendor).

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "vendor": "Category",
    "share": "Percentage"
  },
  "chart_spec": {
    "chartType": "Pie Chart",
    "encodings": {
      "size": { "field": "share" },
      "color": { "field": "vendor" }
    },
    "chartProperties": { "innerRadius": 60 }
  }
}
```

### Bullet chart (KPI vs target)

User: "Show each rep's sales against their quota."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "rep": "Name",
    "sales": "Amount",
    "quota": "Amount"
  },
  "chart_spec": {
    "chartType": "Bullet Chart",
    "encodings": {
      "y": { "field": "rep" },
      "x": { "field": "sales" },
      "goal": { "field": "quota" }
    }
  }
}
```

## What you should NOT do

- **Don't re-emit the data.** Reference columns by name; let the host bind
  `data` (url, variable, or small literal). Never paste large datasets.
- **Don't write backend specs directly** — write the `ChartAssemblyInput`,
  then call the assembler. That's the whole point.
- **Don't invent transforms.** The only built-in reshape is the array form
  on `x`/`y`. If the data shape is wrong for the chart, say so and ask the
  host to reshape it.
- **Don't invent field names.** Reference only columns that exist, spelled
  exactly. If the data is the wrong shape for the chart, reshape it upstream
  rather than guessing column names that aren't there.
- **Don't set `type`/`aggregate`/`sortOrder`** unless intent conflicts
  with the default.
- **Don't pass colors, font sizes, axis tick counts** — the compiler
  derives these. Users fine-tune the *output* spec. The exception is a colour
  mapping the user asked for (a brand ramp, fixed bins, a pivot): use the
  `color` encoding's `scheme`, `reverse`, `mid`, `domain`, `bins` and `colors`.
- **Don't invent semantic type names.** If none fit, use the family
  default (`Quantity`, `Category`, `Date`).
- **Don't call the library to discover channels/types** — this document is
  the authoring reference.

## Validation checklist

Before returning, verify:

1. `chartType` is an exact registered name supported by the target backend.
2. Every `field` referenced in `encodings` is a real column name.
3. Every encoded field has an entry in `semantic_types` (specific type).
4. Required channels for the chart type are present (e.g. Bullet→`goal`,
   Candlestick→`open/high/low/close`, Pie→`size`+`color`).
5. Any `chartProperties` keys are valid for that chart type and in range.
6. You did **not** inline large data or hand-tune derived styling.
7. The data carries no embedded total/subtotal level (e.g. an `all` / `total`
   row) mixed with its components on a stacked, grouped, or colored channel.
